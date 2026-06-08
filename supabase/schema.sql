create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_key text not null unique,
  wechat_openid text unique,
  wechat_unionid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_friend check (requester <> addressee)
);

create unique index if not exists friendships_pair_unique
  on public.friendships ((least(requester::text, addressee::text)), (greatest(requester::text, addressee::text)));

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint season_range check (ends_at > starts_at)
);

create unique index if not exists seasons_one_current
  on public.seasons (is_current)
  where is_current;

create table if not exists public.season_scores (
  season_id uuid not null references public.seasons(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pvp_points integer not null default 0 check (pvp_points >= 0),
  ai_points integer not null default 0 check (ai_points >= 0),
  pvp_games integer not null default 0 check (pvp_games >= 0),
  ai_games integer not null default 0 check (ai_games >= 0),
  pvp_wins integer not null default 0 check (pvp_wins >= 0),
  ai_wins integer not null default 0 check (ai_wins >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, profile_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_type text not null check (match_type in ('friend', 'random')),
  status text not null check (status in ('invited', 'active', 'finished')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  invited_user uuid references public.profiles(id) on delete set null,
  player_black uuid references public.profiles(id) on delete set null,
  player_white uuid references public.profiles(id) on delete set null,
  current_turn uuid references public.profiles(id) on delete set null,
  winner uuid references public.profiles(id) on delete set null,
  result text check (result in ('black_win', 'white_win', 'draw', 'resign')),
  finished_reason text,
  move_count integer not null default 0 check (move_count >= 0),
  pvp_points_awarded boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_moves (
  id bigserial primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  move_no integer not null check (move_no > 0),
  player_id uuid not null references public.profiles(id) on delete cascade,
  x integer not null check (x between 0 and 14),
  y integer not null check (y between 0 and 14),
  created_at timestamptz not null default now(),
  unique (match_id, move_no),
  unique (match_id, x, y)
);

create table if not exists public.match_queue (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  result text not null check (result in ('win', 'loss', 'draw')),
  player_moves integer not null check (player_moves >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  points_added integer not null default 0 check (points_added >= 0),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists friendships_touch_updated_at on public.friendships;
create trigger friendships_touch_updated_at
before update on public.friendships
for each row execute function public.touch_updated_at();

drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
before update on public.matches
for each row execute function public.touch_updated_at();

create or replace function public.current_season_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
    from public.seasons
   where starts_at <= now()
     and ends_at > now()
   order by starts_at desc
   limit 1;

  if v_id is null then
    update public.seasons set is_current = false where is_current;
    insert into public.seasons (starts_at, ends_at, is_current)
    values (now(), now() + interval '60 days', true)
    returning id into v_id;
  else
    update public.seasons set is_current = false where is_current and id <> v_id;
    update public.seasons set is_current = true where id = v_id and not is_current;
  end if;

  return v_id;
end;
$$;

create or replace function public.ensure_score_row(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
begin
  v_season_id := public.current_season_id();
  insert into public.season_scores (season_id, profile_id)
  values (v_season_id, p_profile_id)
  on conflict do nothing;
  return v_season_id;
end;
$$;

create or replace function public.app_bootstrap_profile(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_username text := trim(p_username);
  v_key text := lower(trim(p_username));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if v_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'invalid_username';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if found then
    perform public.ensure_score_row(v_profile.id);
    return v_profile;
  end if;

  insert into public.profiles (id, username, username_key)
  values (auth.uid(), v_username, v_key)
  returning * into v_profile;

  perform public.ensure_score_row(v_profile.id);
  return v_profile;
exception
  when unique_violation then
    raise exception 'username_taken';
end;
$$;

create or replace function public.find_profile_by_username(p_username text)
returns table (
  profile_id uuid,
  username text,
  is_self boolean,
  friendship_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select p.id,
         p.username,
         p.id = v_me,
         (
           select f.status
             from public.friendships f
            where (f.requester = v_me and f.addressee = p.id)
               or (f.requester = p.id and f.addressee = v_me)
            limit 1
         )
    from public.profiles p
   where p.username_key = lower(trim(p_username))
   limit 1;
end;
$$;

create or replace function public.request_friend(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing public.friendships;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_target
    from public.profiles
   where username_key = lower(trim(p_username));

  if v_target is null then
    raise exception 'user_not_found';
  end if;

  if v_target = v_me then
    raise exception 'cannot_add_self';
  end if;

  select * into v_existing
    from public.friendships
   where (requester = v_me and addressee = v_target)
      or (requester = v_target and addressee = v_me)
   limit 1;

  if not found then
    insert into public.friendships (requester, addressee, status)
    values (v_me, v_target, 'pending')
    returning id into v_id;
    return v_id;
  end if;

  if v_existing.status = 'accepted' then
    raise exception 'already_friends';
  end if;

  update public.friendships
     set requester = v_me,
         addressee = v_target,
         status = 'pending',
         updated_at = now()
   where id = v_existing.id
   returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.respond_friend(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.friendships
     set status = case when p_accept then 'accepted' else 'rejected' end,
         updated_at = now()
   where id = p_friendship_id
     and addressee = auth.uid()
     and status = 'pending';

  if not found then
    raise exception 'friend_request_not_found';
  end if;
end;
$$;

create or replace function public.list_friends()
returns table (
  friendship_id uuid,
  profile_id uuid,
  username text,
  status text,
  direction text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select f.id,
         p.id,
         p.username,
         f.status,
         case when f.addressee = v_me then 'incoming' else 'outgoing' end
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester = v_me then f.addressee else f.requester end
   where (f.requester = v_me or f.addressee = v_me)
     and f.status in ('pending', 'accepted')
   order by case f.status when 'pending' then 0 else 1 end, f.updated_at desc;
end;
$$;

create or replace function public.invite_friend_match(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_match_id uuid;
  v_black uuid;
  v_white uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  if p_friend_id = v_me then
    raise exception 'cannot_invite_self';
  end if;

  if not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = v_me and addressee = p_friend_id) or (requester = p_friend_id and addressee = v_me))
  ) then
    raise exception 'not_friends';
  end if;

  select id into v_match_id
    from public.matches
   where status in ('invited', 'active')
     and ((player_black = v_me and player_white = p_friend_id) or (player_black = p_friend_id and player_white = v_me))
   order by updated_at desc
   limit 1;

  if v_match_id is not null then
    return v_match_id;
  end if;

  if random() < 0.5 then
    v_black := v_me;
    v_white := p_friend_id;
  else
    v_black := p_friend_id;
    v_white := v_me;
  end if;

  insert into public.matches (
    match_type, status, created_by, invited_user, player_black, player_white
  )
  values ('friend', 'invited', v_me, p_friend_id, v_black, v_white)
  returning id into v_match_id;

  return v_match_id;
end;
$$;

create or replace function public.accept_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.matches
     set status = 'active',
         current_turn = player_black,
         started_at = coalesce(started_at, now())
   where id = p_match_id
     and status = 'invited'
     and invited_user = auth.uid();

  if not found then
    raise exception 'match_invite_not_found';
  end if;
end;
$$;

create or replace function public.join_random_match()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_black uuid;
  v_white uuid;
  v_match_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_match_id
    from public.matches
   where status = 'active'
     and (player_black = v_me or player_white = v_me)
   order by updated_at desc
   limit 1;

  if v_match_id is not null then
    return jsonb_build_object('status', 'matched', 'match_id', v_match_id);
  end if;

  delete from public.match_queue where profile_id = v_me;

  select profile_id into v_other
    from public.match_queue
   where profile_id <> v_me
   order by created_at
   limit 1
   for update skip locked;

  if v_other is null then
    insert into public.match_queue (profile_id)
    values (v_me)
    on conflict (profile_id) do update set created_at = now();
    return jsonb_build_object('status', 'waiting');
  end if;

  delete from public.match_queue where profile_id in (v_me, v_other);

  if random() < 0.5 then
    v_black := v_me;
    v_white := v_other;
  else
    v_black := v_other;
    v_white := v_me;
  end if;

  insert into public.matches (
    match_type, status, created_by, player_black, player_white, current_turn, started_at
  )
  values ('random', 'active', v_me, v_black, v_white, v_black, now())
  returning id into v_match_id;

  return jsonb_build_object('status', 'matched', 'match_id', v_match_id);
end;
$$;

create or replace function public.list_my_matches()
returns table (
  match_id uuid,
  status text,
  match_type text,
  opponent_id uuid,
  opponent_username text,
  is_my_turn boolean,
  invited_user uuid,
  result_text text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select m.id,
         m.status,
         m.match_type,
         p.id,
         p.username,
         m.current_turn = v_me,
         m.invited_user,
         case
           when m.status <> 'finished' then null
           when m.winner is null then 'draw'
           when m.winner = v_me then 'win'
           else 'loss'
         end,
         m.created_at
    from public.matches m
    left join public.profiles p
      on p.id = case
                  when m.player_black = v_me then m.player_white
                  when m.player_white = v_me then m.player_black
                  when m.created_by = v_me then m.invited_user
                  else m.created_by
                end
   where m.player_black = v_me
      or m.player_white = v_me
      or m.created_by = v_me
      or m.invited_user = v_me
   order by m.updated_at desc
   limit 30;
end;
$$;

create or replace function public.has_move(p_match_id uuid, p_player_id uuid, p_x integer, p_y integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.match_moves
     where match_id = p_match_id
       and player_id = p_player_id
       and x = p_x
       and y = p_y
  );
$$;

create or replace function public.is_winning_move(p_match_id uuid, p_player_id uuid, p_x integer, p_y integer)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dirs integer[][] := array[array[1,0], array[0,1], array[1,1], array[1,-1]];
  d integer[];
  step integer;
  total integer;
begin
  foreach d slice 1 in array dirs loop
    total := 1;
    for step in 1..4 loop
      exit when not public.has_move(p_match_id, p_player_id, p_x + d[1] * step, p_y + d[2] * step);
      total := total + 1;
    end loop;
    for step in 1..4 loop
      exit when not public.has_move(p_match_id, p_player_id, p_x - d[1] * step, p_y - d[2] * step);
      total := total + 1;
    end loop;
    if total >= 5 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.award_match_score(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_season uuid;
  v_duration integer;
  v_winner_points integer;
  v_loser_points integer;
  v_draw_points integer;
  v_loser uuid;
begin
  select * into v_match
    from public.matches
   where id = p_match_id
   for update;

  if not found or v_match.status <> 'finished' or v_match.pvp_points_awarded then
    return;
  end if;

  if v_match.move_count < 10 then
    update public.matches set pvp_points_awarded = true where id = p_match_id;
    return;
  end if;

  v_season := public.current_season_id();
  v_duration := greatest(1, extract(epoch from (coalesce(v_match.ended_at, now()) - coalesce(v_match.started_at, v_match.created_at)))::integer);

  insert into public.season_scores (season_id, profile_id)
  values (v_season, v_match.player_black), (v_season, v_match.player_white)
  on conflict do nothing;

  if v_match.winner is null then
    v_draw_points := least(20, 10 + floor(v_duration / 120.0)::integer);
    update public.season_scores
       set pvp_points = pvp_points + v_draw_points,
           pvp_games = pvp_games + 1,
           updated_at = now()
     where season_id = v_season
       and profile_id in (v_match.player_black, v_match.player_white);
  else
    v_loser := case when v_match.winner = v_match.player_black then v_match.player_white else v_match.player_black end;
    v_winner_points := least(50, 20 + floor(v_duration / 30.0)::integer);
    v_loser_points := least(9, greatest(1, floor(v_duration / 120.0)::integer));

    update public.season_scores
       set pvp_points = pvp_points + v_winner_points,
           pvp_games = pvp_games + 1,
           pvp_wins = pvp_wins + 1,
           updated_at = now()
     where season_id = v_season
       and profile_id = v_match.winner;

    update public.season_scores
       set pvp_points = pvp_points + v_loser_points,
           pvp_games = pvp_games + 1,
           updated_at = now()
     where season_id = v_season
       and profile_id = v_loser;
  end if;

  update public.matches set pvp_points_awarded = true where id = p_match_id;
end;
$$;

create or replace function public.make_match_move(p_match_id uuid, p_x integer, p_y integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_match public.matches;
  v_move_no integer;
  v_next uuid;
  v_win boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  if p_x not between 0 and 14 or p_y not between 0 and 14 then
    raise exception 'invalid_position';
  end if;

  select * into v_match
    from public.matches
   where id = p_match_id
   for update;

  if not found or v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_me not in (v_match.player_black, v_match.player_white) then
    raise exception 'not_match_player';
  end if;

  if v_match.current_turn <> v_me then
    raise exception 'not_your_turn';
  end if;

  if exists (select 1 from public.match_moves where match_id = p_match_id and x = p_x and y = p_y) then
    raise exception 'position_taken';
  end if;

  v_move_no := v_match.move_count + 1;
  insert into public.match_moves (match_id, move_no, player_id, x, y)
  values (p_match_id, v_move_no, v_me, p_x, p_y);

  v_win := public.is_winning_move(p_match_id, v_me, p_x, p_y);

  if v_win then
    update public.matches
       set status = 'finished',
           winner = v_me,
           result = case when v_me = v_match.player_black then 'black_win' else 'white_win' end,
           finished_reason = 'five_in_row',
           current_turn = null,
           move_count = v_move_no,
           ended_at = now()
     where id = p_match_id;
    perform public.award_match_score(p_match_id);
    return jsonb_build_object('status', 'finished', 'winner', v_me);
  end if;

  if v_move_no >= 225 then
    update public.matches
       set status = 'finished',
           winner = null,
           result = 'draw',
           finished_reason = 'board_full',
           current_turn = null,
           move_count = v_move_no,
           ended_at = now()
     where id = p_match_id;
    perform public.award_match_score(p_match_id);
    return jsonb_build_object('status', 'finished', 'winner', null);
  end if;

  v_next := case when v_me = v_match.player_black then v_match.player_white else v_match.player_black end;
  update public.matches
     set current_turn = v_next,
         move_count = v_move_no
   where id = p_match_id;

  return jsonb_build_object('status', 'active', 'next', v_next);
end;
$$;

create or replace function public.resign_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_match public.matches;
  v_winner uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_match
    from public.matches
   where id = p_match_id
   for update;

  if not found or v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_me not in (v_match.player_black, v_match.player_white) then
    raise exception 'not_match_player';
  end if;

  v_winner := case when v_me = v_match.player_black then v_match.player_white else v_match.player_black end;

  update public.matches
     set status = 'finished',
         winner = v_winner,
         result = 'resign',
         finished_reason = 'resign',
         current_turn = null,
         ended_at = now()
   where id = p_match_id;

  perform public.award_match_score(p_match_id);
  return jsonb_build_object('status', 'finished', 'winner', v_winner);
end;
$$;

create or replace function public.submit_ai_result(p_result text, p_player_moves integer, p_duration_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_season uuid;
  v_points integer := 0;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'invalid_result';
  end if;

  v_season := public.ensure_score_row(v_me);

  if p_player_moves >= 8 and p_result = 'win' then
    v_points := least(30, 20 + floor(greatest(0, p_duration_seconds) / 60.0)::integer);
  end if;

  insert into public.ai_results (
    profile_id, season_id, result, player_moves, duration_seconds, points_added
  )
  values (
    v_me, v_season, p_result, greatest(0, p_player_moves), greatest(0, p_duration_seconds), v_points
  );

  if p_player_moves >= 8 then
    update public.season_scores
       set ai_points = ai_points + v_points,
           ai_games = ai_games + 1,
           ai_wins = ai_wins + case when p_result = 'win' then 1 else 0 end,
           updated_at = now()
     where season_id = v_season
       and profile_id = v_me;
  end if;

  return jsonb_build_object('points_added', v_points);
end;
$$;

create or replace function public.get_my_score()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_season uuid;
  v_row public.season_scores;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  v_season := public.ensure_score_row(v_me);
  select * into v_row
    from public.season_scores
   where season_id = v_season
     and profile_id = v_me;

  return jsonb_build_object(
    'season_id', v_season,
    'pvp_points', coalesce(v_row.pvp_points, 0),
    'ai_points', coalesce(v_row.ai_points, 0),
    'pvp_games', coalesce(v_row.pvp_games, 0),
    'ai_games', coalesce(v_row.ai_games, 0),
    'pvp_wins', coalesce(v_row.pvp_wins, 0),
    'ai_wins', coalesce(v_row.ai_wins, 0)
  );
end;
$$;

create or replace function public.get_rankings(p_kind text)
returns table (
  rank_no bigint,
  profile_id uuid,
  username text,
  points integer,
  games integer,
  wins integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_kind not in ('pvp', 'ai') then
    raise exception 'invalid_rank_kind';
  end if;

  v_season := public.current_season_id();

  if p_kind = 'pvp' then
    return query
    select row_number() over (order by s.pvp_points desc, s.pvp_wins desc, s.pvp_games asc, p.username asc),
           p.id,
           p.username,
           s.pvp_points,
           s.pvp_games,
           s.pvp_wins
      from public.season_scores s
      join public.profiles p on p.id = s.profile_id
     where s.season_id = v_season
       and s.pvp_points > 0
     order by s.pvp_points desc, s.pvp_wins desc, s.pvp_games asc, p.username asc
     limit 50;
  else
    return query
    select row_number() over (order by s.ai_points desc, s.ai_wins desc, s.ai_games asc, p.username asc),
           p.id,
           p.username,
           s.ai_points,
           s.ai_games,
           s.ai_wins
      from public.season_scores s
      join public.profiles p on p.id = s.profile_id
     where s.season_id = v_season
       and s.ai_points > 0
     order by s.ai_points desc, s.ai_wins desc, s.ai_games asc, p.username asc
     limit 50;
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.seasons enable row level security;
alter table public.season_scores enable row level security;
alter table public.matches enable row level security;
alter table public.match_moves enable row level security;
alter table public.match_queue enable row level security;
alter table public.ai_results enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
for select to authenticated using (requester = auth.uid() or addressee = auth.uid());

drop policy if exists seasons_select_authenticated on public.seasons;
create policy seasons_select_authenticated on public.seasons
for select to authenticated using (true);

drop policy if exists scores_select_authenticated on public.season_scores;
create policy scores_select_authenticated on public.season_scores
for select to authenticated using (true);

drop policy if exists matches_select_own on public.matches;
create policy matches_select_own on public.matches
for select to authenticated using (
  player_black = auth.uid()
  or player_white = auth.uid()
  or created_by = auth.uid()
  or invited_user = auth.uid()
);

drop policy if exists moves_select_match_players on public.match_moves;
create policy moves_select_match_players on public.match_moves
for select to authenticated using (
  exists (
    select 1 from public.matches m
     where m.id = match_moves.match_id
       and (
         m.player_black = auth.uid()
         or m.player_white = auth.uid()
         or m.created_by = auth.uid()
         or m.invited_user = auth.uid()
       )
  )
);

drop policy if exists queue_select_own on public.match_queue;
create policy queue_select_own on public.match_queue
for select to authenticated using (profile_id = auth.uid());

drop policy if exists ai_results_select_own on public.ai_results;
create policy ai_results_select_own on public.ai_results
for select to authenticated using (profile_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.friendships, public.seasons, public.season_scores, public.matches, public.match_moves, public.match_queue, public.ai_results to authenticated;
grant execute on function public.app_bootstrap_profile(text) to authenticated;
grant execute on function public.find_profile_by_username(text) to authenticated;
grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.respond_friend(uuid, boolean) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.invite_friend_match(uuid) to authenticated;
grant execute on function public.accept_match(uuid) to authenticated;
grant execute on function public.join_random_match() to authenticated;
grant execute on function public.list_my_matches() to authenticated;
grant execute on function public.make_match_move(uuid, integer, integer) to authenticated;
grant execute on function public.resign_match(uuid) to authenticated;
grant execute on function public.submit_ai_result(text, integer, integer) to authenticated;
grant execute on function public.get_my_score() to authenticated;
grant execute on function public.get_rankings(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'match_moves'
  ) then
    alter publication supabase_realtime add table public.match_moves;
  end if;
end;
$$;

do $$
begin
  perform public.current_season_id();
end;
$$;
