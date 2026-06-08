alter table public.matches
  drop constraint if exists matches_match_type_check;

alter table public.matches
  add constraint matches_match_type_check
  check (match_type in ('friend', 'random', 'rematch'));

create or replace function public.request_rematch(p_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_match public.matches;
  v_opponent uuid;
  v_black uuid;
  v_white uuid;
  v_new_match uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_match
    from public.matches
   where id = p_match_id;

  if not found or v_match.status <> 'finished' then
    raise exception 'match_not_finished';
  end if;

  if v_me not in (v_match.player_black, v_match.player_white) then
    raise exception 'not_match_player';
  end if;

  v_opponent := case when v_me = v_match.player_black then v_match.player_white else v_match.player_black end;

  select id into v_new_match
    from public.matches
   where status in ('invited', 'active')
     and ((player_black = v_me and player_white = v_opponent) or (player_black = v_opponent and player_white = v_me))
   order by updated_at desc
   limit 1;

  if v_new_match is not null then
    return v_new_match;
  end if;

  if random() < 0.5 then
    v_black := v_me;
    v_white := v_opponent;
  else
    v_black := v_opponent;
    v_white := v_me;
  end if;

  insert into public.matches (
    match_type, status, created_by, invited_user, player_black, player_white
  )
  values ('rematch', 'invited', v_me, v_opponent, v_black, v_white)
  returning id into v_new_match;

  return v_new_match;
end;
$$;

create or replace function public.decline_match(p_match_id uuid)
returns void
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

  update public.matches
     set status = 'finished',
         winner = null,
         result = 'draw',
         finished_reason = 'declined',
         current_turn = null,
         pvp_points_awarded = true,
         ended_at = now()
   where id = p_match_id
     and status = 'invited'
     and (invited_user = v_me or created_by = v_me);

  if not found then
    raise exception 'match_invite_not_found';
  end if;
end;
$$;

grant execute on function public.request_rematch(uuid) to authenticated;
grant execute on function public.decline_match(uuid) to authenticated;
