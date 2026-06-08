(() => {
  const BOARD_SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const SEARCH_TIME_MS = 1800;
  const MAX_CANDIDATES = 18;
  const AI_SCORE_RULE = "AI 胜利 +20，单局最高 30";
  const PVP_SCORE_RULE = "真人胜方按时长加分，单局最高 50；败方最高 9；赛季总分不封顶";

  const SUPABASE_URL = "https://uodxphojjxkytbxsnebg.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_P47o5r2GMZ98XzJCaWZk2w_10YSVaW-";

  const isCloudConfigured =
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

  const $ = (id) => document.getElementById(id);

  const els = {
    refreshBtn: $("refreshBtn"),
    cloudNotice: $("cloudNotice"),
    authPanel: $("authPanel"),
    authForm: $("authForm"),
    usernameInput: $("usernameInput"),
    passcodeInput: $("passcodeInput"),
    loginBtn: $("loginBtn"),
    registerBtn: $("registerBtn"),
    wechatBtn: $("wechatBtn"),
    authHint: $("authHint"),
    profileStrip: $("profileStrip"),
    avatarText: $("avatarText"),
    profileName: $("profileName"),
    profileMeta: $("profileMeta"),
    logoutBtn: $("logoutBtn"),
    homeActions: Array.from(document.querySelectorAll(".home-card")),
    tabs: Array.from(document.querySelectorAll(".tab")),
    tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
    boardCanvas: $("boardCanvas"),
    gameStatus: $("gameStatus"),
    aiCloudState: $("aiCloudState"),
    playerFirstBtn: $("playerFirstBtn"),
    aiFirstBtn: $("aiFirstBtn"),
    undoBtn: $("undoBtn"),
    resetBtn: $("resetBtn"),
    queueBtn: $("queueBtn"),
    pvpStatus: $("pvpStatus"),
    pvpCanvas: $("pvpCanvas"),
    pvpBoardPanel: $("pvpBoardPanel"),
    pvpLobbyBlank: $("pvpLobbyBlank"),
    activeMatchCard: $("activeMatchCard"),
    matchTitle: $("matchTitle"),
    matchMeta: $("matchMeta"),
    resignBtn: $("resignBtn"),
    reloadMatchesBtn: $("reloadMatchesBtn"),
    matchList: $("matchList"),
    friendSearchForm: $("friendSearchForm"),
    friendSearchInput: $("friendSearchInput"),
    friendSearchResult: $("friendSearchResult"),
    reloadFriendsBtn: $("reloadFriendsBtn"),
    friendList: $("friendList"),
    rankSwitches: Array.from(document.querySelectorAll(".seg")),
    rankTitle: $("rankTitle"),
    reloadRankBtn: $("reloadRankBtn"),
    rankList: $("rankList"),
    myPvpPoints: $("myPvpPoints"),
    myAiPoints: $("myAiPoints"),
    myPvpGames: $("myPvpGames"),
    myAiGames: $("myAiGames"),
    gameModal: $("gameModal"),
    modalKicker: $("modalKicker"),
    modalTitle: $("modalTitle"),
    modalMessage: $("modalMessage"),
    modalScore: $("modalScore"),
    modalNote: $("modalNote"),
    modalPrimaryBtn: $("modalPrimaryBtn"),
    modalSecondaryBtn: $("modalSecondaryBtn"),
    toast: $("toast")
  };

  const cloud = {
    client: null,
    profile: null,
    session: null,
    score: null,
    rankMode: "pvp",
    matchChannel: null,
    matchChannelId: null,
    inboxChannel: null,
    queueTimer: 0
  };

  const aiGame = {
    board: new Uint8Array(BOARD_SIZE * BOARD_SIZE),
    moves: [],
    currentPlayer: BLACK,
    humanPlayer: BLACK,
    aiPlayer: WHITE,
    winner: null,
    finished: false,
    thinking: false,
    aiStarts: false,
    startedAt: 0,
    submitted: false,
    sessionId: 0
  };

  const pvpGame = {
    board: new Uint8Array(BOARD_SIZE * BOARD_SIZE),
    moves: [],
    match: null,
    myColor: null,
    resultShownFor: null,
    invitePromptFor: null,
    dismissedMatches: new Set()
  };

  let aiWorker = null;
  let toastTimer = 0;
  let modalPrimaryAction = null;
  let modalSecondaryAction = null;

  function idx(x, y) {
    return y * BOARD_SIZE + x;
  }

  function other(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  function inBounds(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
  }

  function normalizeUsername(value) {
    return value.trim().toLowerCase();
  }

  function usernameToEmail(username) {
    return `${normalizeUsername(username)}@wuziqi.invalid`;
  }

  function validateUsername(username) {
    return /^[A-Za-z0-9_]{3,16}$/.test(username);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  const encouragements = [
    "好棋不怕再来一盘。",
    "棋盘还热着，下一局可能更精彩。",
    "高手之间，输赢只是下一手的伏笔。",
    "这局有火花，再来一盘很合适。",
    "棋逢对手，下一局见真章。"
  ];

  function randomEncouragement() {
    return encouragements[Math.floor(Math.random() * encouragements.length)];
  }

  function openModal(options) {
    modalPrimaryAction = options.onPrimary || null;
    modalSecondaryAction = options.onSecondary || null;
    els.modalKicker.textContent = options.kicker || "Match Result";
    els.modalTitle.textContent = options.title || "对局结束";
    els.modalMessage.textContent = options.message || "";
    els.modalScore.textContent = options.score || "";
    els.modalScore.hidden = !options.score;
    els.modalNote.textContent = options.note || randomEncouragement();
    els.modalPrimaryBtn.textContent = options.primaryText || "确定";
    els.modalSecondaryBtn.textContent = options.secondaryText || "再战";
    els.modalSecondaryBtn.className = options.secondaryDanger ? "danger" : "primary";
    els.modalSecondaryBtn.hidden = !options.secondaryText;
    els.gameModal.hidden = false;
  }

  function closeModal() {
    els.gameModal.hidden = true;
    modalPrimaryAction = null;
    modalSecondaryAction = null;
  }

  function clearPvpMatch() {
    pvpGame.match = null;
    pvpGame.moves = [];
    pvpGame.board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    pvpGame.myColor = null;
    els.pvpBoardPanel.hidden = true;
    els.pvpLobbyBlank.hidden = false;
    renderPvpBoard();
    updatePvpHeader();
  }

  function pvpResultText(match) {
    if (!match) return "对局结束";
    if (match.finished_reason === "declined") return "再战已取消";
    if (!match.winner) return "平局";
    return match.winner === cloud.profile?.id ? "你赢了" : "你输了";
  }

  function calcPvpPoints(match) {
    if (!match || match.move_count < 10 || match.finished_reason === "declined") return 0;
    const startedAt = new Date(match.started_at || match.created_at || Date.now()).getTime();
    const endedAt = new Date(match.ended_at || Date.now()).getTime();
    const duration = Math.max(1, Math.floor((endedAt - startedAt) / 1000));
    if (!match.winner) return Math.min(20, 10 + Math.floor(duration / 120));
    if (match.winner === cloud.profile?.id) return Math.min(50, 20 + Math.floor(duration / 30));
    return Math.min(9, Math.max(1, Math.floor(duration / 120)));
  }

  function showPvpResultModal(match) {
    if (!match || match.finished_reason === "declined" || pvpGame.dismissedMatches.has(match.id)) return;
    if (pvpGame.resultShownFor === match.id) return;
    pvpGame.resultShownFor = match.id;
    const points = calcPvpPoints(match);
    const result = pvpResultText(match);
    openModal({
      kicker: "Match Finished",
      title: result,
      message: points > 0 ? "本局积分已经结算，排行榜会立即刷新。" : "本局手数不足或无有效积分。",
      score: `真人积分 +${points}`,
      note: randomEncouragement(),
      primaryText: "确定",
      secondaryText: match.match_type === "random" || match.match_type === "friend" || match.match_type === "rematch" ? "邀请再战" : "",
      onPrimary: async () => {
        pvpGame.dismissedMatches.add(match.id);
        closeModal();
        clearPvpMatch();
        await Promise.allSettled([loadMatches(), loadMyScore(), loadRank()]);
      },
      onSecondary: async () => {
        await requestRematch(match.id);
      }
    });
  }

  function showAiResultModal(pointsAdded) {
    const result = aiGame.winner === aiGame.humanPlayer
      ? "你赢了"
      : aiGame.winner === aiGame.aiPlayer
        ? "AI 赢了"
        : "平局";
    openModal({
      kicker: "AI Result",
      title: result,
      message: cloud.profile ? "AI 对局已经结算。" : "登录后完成有效 AI 胜局才会计分。",
      score: `AI积分 +${pointsAdded || 0}`,
      note: randomEncouragement(),
      primaryText: "确定",
      secondaryText: "再来一局",
      onPrimary: () => closeModal(),
      onSecondary: () => {
        closeModal();
        resetAiGame(aiGame.aiStarts);
      }
    });
  }

  function showRematchInviteModal(row) {
    if (!row || pvpGame.invitePromptFor === row.match_id) return;
    pvpGame.invitePromptFor = row.match_id;
    openModal({
      kicker: "Rematch Invite",
      title: "对方邀请你再战",
      message: `${row.opponent_username || "对手"} 想和你再来一局。`,
      score: "",
      note: randomEncouragement(),
      primaryText: "接受再战",
      secondaryText: "拒绝",
      secondaryDanger: true,
      onPrimary: async () => {
        closeModal();
        await acceptMatch(row.match_id);
      },
      onSecondary: async () => {
        closeModal();
        await declineMatch(row.match_id);
      }
    });
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) {
      button.dataset.oldText = button.textContent;
      button.textContent = text || "处理中";
      button.disabled = true;
      return;
    }
    if (button.dataset.oldText) {
      button.textContent = button.dataset.oldText;
      delete button.dataset.oldText;
    }
    button.disabled = false;
  }

  function setTab(name) {
    els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    els.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${name}`));
    if (name === "rank") loadRank();
    if (name === "friends") loadFriends();
    if (name === "pvp") loadMatches();
    if (name === "me") loadMyScore();
  }

  function requireCloud() {
    if (!cloud.client) {
      showToast("还没有配置 Supabase，在线功能暂时不能用");
      return false;
    }
    return true;
  }

  function requireLogin() {
    if (!requireCloud()) return false;
    if (!cloud.profile) {
      showToast("请先登录");
      return false;
    }
    return true;
  }

  function updateCloudUi() {
    const online = Boolean(cloud.client);
    els.cloudNotice.hidden = online;
    els.loginBtn.disabled = !online;
    els.registerBtn.disabled = !online;
    els.queueBtn.disabled = !online;
    els.authHint.textContent = online
      ? "用户名不区分大小写，注册后会自动登录。"
      : "先按 SUPABASE-SETUP.md 填入 Supabase 配置，在线功能才会开启。";
  }

  function updateProfileUi() {
    const loggedIn = Boolean(cloud.profile);
    els.authPanel.hidden = loggedIn;
    els.profileStrip.hidden = !loggedIn;
    if (!loggedIn) {
      els.profileName.textContent = "未登录";
      els.profileMeta.textContent = "真人 0 / AI 0";
      return;
    }
    const username = cloud.profile.username;
    els.avatarText.textContent = username.slice(0, 1).toUpperCase();
    els.profileName.textContent = username;
  }

  async function bootstrapProfile(username) {
    const { data, error } = await cloud.client.rpc("app_bootstrap_profile", {
      p_username: username
    });
    if (error) throw error;
    cloud.profile = Array.isArray(data) ? data[0] : data;
    updateProfileUi();
    subscribeInbox();
    await loadAllCloudData();
  }

  async function loadSession() {
    if (!cloud.client) return;
    const { data } = await cloud.client.auth.getSession();
    cloud.session = data.session;
    if (!cloud.session) {
      cloud.profile = null;
      updateProfileUi();
      return;
    }
    const { data: profile } = await cloud.client
      .from("profiles")
      .select("*")
      .eq("id", cloud.session.user.id)
      .maybeSingle();

    if (profile) {
      cloud.profile = profile;
      updateProfileUi();
      subscribeInbox();
      await loadAllCloudData();
      return;
    }

    const username = cloud.session.user.user_metadata?.username || cloud.session.user.email.split("@")[0];
    await bootstrapProfile(username);
  }

  async function loginOrRegister(isRegister) {
    if (!requireCloud()) return;
    const username = els.usernameInput.value.trim();
    const passcode = els.passcodeInput.value;
    if (!validateUsername(username)) {
      showToast("用户名只能是 3-16 位字母、数字、下划线");
      return;
    }
    if (passcode.length < 6) {
      showToast("口令至少 6 位");
      return;
    }

    const button = isRegister ? els.registerBtn : els.loginBtn;
    setBusy(button, true, isRegister ? "注册中" : "登录中");
    try {
      const email = usernameToEmail(username);
      const result = isRegister
        ? await cloud.client.auth.signUp({
            email,
            password: passcode,
            options: { data: { username } }
          })
        : await cloud.client.auth.signInWithPassword({ email, password: passcode });

      if (result.error) throw result.error;
      if (!result.data.session) {
        showToast("请在 Supabase 关闭邮箱验证后再注册登录");
        return;
      }
      cloud.session = result.data.session;
      await bootstrapProfile(username);
      showToast(isRegister ? "注册成功" : "登录成功");
    } catch (error) {
      showToast(error.message || "登录失败");
    } finally {
      setBusy(button, false);
    }
  }

  async function logout() {
    if (!cloud.client) return;
    await cloud.client.auth.signOut();
    cloud.profile = null;
    cloud.session = null;
    cloud.score = null;
    stopQueuePolling();
    unsubscribeInbox();
    pvpGame.match = null;
    pvpGame.moves = [];
    pvpGame.board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    updateProfileUi();
    clearPvpMatch();
    showToast("已退出");
  }

  async function loadAllCloudData() {
    await Promise.allSettled([loadMyScore(), loadRank(), loadFriends(), loadMatches()]);
  }

  async function loadMyScore() {
    if (!cloud.profile) return null;
    const { data, error } = await cloud.client.rpc("get_my_score");
    if (error) {
      console.warn(error);
      return null;
    }
    const score = data || {};
    const pvpPoints = score.pvp_points || 0;
    const aiPoints = score.ai_points || 0;
    const pvpGames = score.pvp_games || 0;
    const aiGames = score.ai_games || 0;
    els.myPvpPoints.textContent = `${pvpPoints}`;
    els.myAiPoints.textContent = `${aiPoints}`;
    els.myPvpGames.textContent = `${pvpGames}`;
    els.myAiGames.textContent = `${aiGames}`;
    els.profileMeta.textContent = `真人 ${pvpPoints} / AI ${aiPoints}`;
    cloud.score = score;
    return score;
  }

  async function loadRank() {
    if (!cloud.profile || !cloud.client) return;
    const kind = cloud.rankMode;
    els.rankTitle.textContent = kind === "pvp" ? "真人对战榜" : "AI 对战榜";
    const { data, error } = await cloud.client.rpc("get_rankings", { p_kind: kind });
    if (error) {
      els.rankList.innerHTML = "";
      console.warn(error);
      return;
    }
    els.rankList.innerHTML = "";
    (data || []).forEach((row) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <span class="rank-no">${row.rank_no}</span>
        <div>
          <strong>${escapeHtml(row.username)}</strong>
          <p>${row.games} 局 · ${row.wins} 胜</p>
        </div>
        <strong>${row.points}</strong>
      `;
      els.rankList.appendChild(item);
    });
  }

  async function searchFriend(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    const username = els.friendSearchInput.value.trim();
    if (!validateUsername(username)) {
      showToast("请输入完整用户名");
      return;
    }
    const { data, error } = await cloud.client.rpc("find_profile_by_username", {
      p_username: username
    });
    if (error) {
      showToast(error.message || "搜索失败");
      return;
    }
    els.friendSearchResult.innerHTML = "";
    if (!data || data.length === 0) return;
    const row = data[0];
    const item = document.createElement("div");
    item.className = "list-item";
    const action = row.is_self
      ? ""
      : `<button class="primary small" data-add-friend="${escapeAttr(row.username)}" type="button">加好友</button>`;
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(row.username)}</strong>
        <p>${row.is_self ? "这是你自己" : row.friendship_status || "可以发送申请"}</p>
      </div>
      <div class="list-actions">${action}</div>
    `;
    els.friendSearchResult.appendChild(item);
  }

  async function requestFriend(username) {
    if (!requireLogin()) return;
    const { error } = await cloud.client.rpc("request_friend", { p_username: username });
    if (error) {
      showToast(error.message || "申请失败");
      return;
    }
    showToast("好友申请已发送");
    await loadFriends();
  }

  async function respondFriend(friendshipId, accept) {
    if (!requireLogin()) return;
    const { error } = await cloud.client.rpc("respond_friend", {
      p_friendship_id: friendshipId,
      p_accept: accept
    });
    if (error) {
      showToast(error.message || "操作失败");
      return;
    }
    await loadFriends();
  }

  async function inviteFriend(profileId) {
    if (!requireLogin()) return;
    const { data, error } = await cloud.client.rpc("invite_friend_match", {
      p_friend_id: profileId
    });
    if (error) {
      showToast(error.message || "邀请失败");
      return;
    }
    showToast("已发起好友对战");
    setTab("pvp");
    await loadMatches();
    if (data) await loadMatch(data);
  }

  async function loadFriends() {
    if (!cloud.profile || !cloud.client) return;
    const { data, error } = await cloud.client.rpc("list_friends");
    if (error) {
      console.warn(error);
      return;
    }
    els.friendList.innerHTML = "";
    (data || []).forEach((row) => {
      const item = document.createElement("div");
      item.className = "list-item";
      let actions = "";
      if (row.status === "pending" && row.direction === "incoming") {
        actions = `
          <button class="primary small" data-accept-friend="${row.friendship_id}" type="button">同意</button>
          <button class="secondary small" data-reject-friend="${row.friendship_id}" type="button">拒绝</button>
        `;
      } else if (row.status === "accepted") {
        actions = `<button class="primary small" data-invite-friend="${row.profile_id}" type="button">约战</button>`;
      }
      const statusText = row.status === "accepted"
        ? "已是好友"
        : row.direction === "incoming"
          ? "对方申请添加你"
          : "等待对方同意";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(row.username)}</strong>
          <p>${statusText}</p>
        </div>
        <div class="list-actions">${actions}</div>
      `;
      els.friendList.appendChild(item);
    });
  }

  async function joinQueue() {
    if (!requireLogin()) return;
    setBusy(els.queueBtn, true, "匹配中");
    try {
      const { data, error } = await cloud.client.rpc("join_random_match");
      if (error) throw error;
      if (data?.status === "waiting") {
        els.pvpStatus.textContent = "已进入随机匹配队列，页面会自动查看匹配结果。";
        showToast("已进入匹配队列");
        startQueuePolling();
        return;
      }
      stopQueuePolling();
      showToast("匹配成功");
      await loadMatches();
      await loadMatch(data.match_id);
    } catch (error) {
      showToast(error.message || "匹配失败");
    } finally {
      setBusy(els.queueBtn, false);
    }
  }

  async function loadMatches() {
    if (!cloud.profile || !cloud.client) return;
    const { data, error } = await cloud.client.rpc("list_my_matches");
    if (error) {
      console.warn(error);
      return;
    }
    els.matchList.innerHTML = "";
    const rows = data || [];
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "list-item";
      let action = "";
      if (row.status === "invited" && row.invited_user === cloud.profile.id) {
        action = `
          <button class="primary small" data-accept-match="${row.match_id}" type="button">接受</button>
          <button class="secondary small" data-decline-match="${row.match_id}" type="button">拒绝</button>
        `;
      } else if (row.status === "active") {
        action = `<button class="primary small" data-open-match="${row.match_id}" type="button">进入</button>`;
      } else if (row.status === "invited") {
        action = `<button class="secondary small" data-open-match="${row.match_id}" type="button">等待中</button>`;
      } else {
        action = `<button class="secondary small" data-open-match="${row.match_id}" type="button">查看</button>`;
      }
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(row.opponent_username || "等待对手")}</strong>
          <p>${matchStatusText(row)}</p>
        </div>
        <div class="list-actions">${action}</div>
      `;
      els.matchList.appendChild(item);
    });

    const incomingRematch = rows.find((row) =>
      row.status === "invited" &&
      row.match_type === "rematch" &&
      row.invited_user === cloud.profile.id
    );
    if (incomingRematch) showRematchInviteModal(incomingRematch);

    const active = rows.find((row) => row.status === "active");
    if (active && (!pvpGame.match || pvpGame.match.id !== active.match_id)) {
      stopQueuePolling();
      await loadMatch(active.match_id);
    } else if (!active && pvpGame.match?.status === "active") {
      clearPvpMatch();
    }
  }

  function startQueuePolling() {
    stopQueuePolling();
    cloud.queueTimer = window.setInterval(() => {
      if (cloud.profile) loadMatches();
    }, 3000);
  }

  function stopQueuePolling() {
    if (cloud.queueTimer) {
      window.clearInterval(cloud.queueTimer);
      cloud.queueTimer = 0;
    }
  }

  async function acceptMatch(matchId) {
    if (!requireLogin()) return;
    const { error } = await cloud.client.rpc("accept_match", { p_match_id: matchId });
    if (error) {
      showToast(error.message || "接受失败");
      return;
    }
    pvpGame.invitePromptFor = null;
    setTab("pvp");
    await loadMatches();
    await loadMatch(matchId);
  }

  async function requestRematch(matchId) {
    if (!requireLogin() || !matchId) return;
    const { data, error } = await cloud.client.rpc("request_rematch", { p_match_id: matchId });
    if (error) {
      showToast(error.message?.includes("function")
        ? "请先在 Supabase 运行再战更新 SQL"
        : error.message || "再战邀请失败");
      return;
    }
    const newMatchId = Array.isArray(data) ? data[0] : data;
    closeModal();
    openModal({
      kicker: "Rematch Sent",
      title: "再战邀请已发出",
      message: "已通知对方，等待对方接受或拒绝。",
      score: "",
      note: randomEncouragement(),
      primaryText: "确定",
      secondaryText: "",
      onPrimary: async () => {
        closeModal();
        clearPvpMatch();
        await loadMatches();
      }
    });
    await loadMatches();
    if (newMatchId) {
      await loadMatch(newMatchId);
      els.pvpBoardPanel.hidden = true;
      els.pvpLobbyBlank.hidden = false;
    }
  }

  async function declineMatch(matchId) {
    if (!requireLogin() || !matchId) return;
    const { error } = await cloud.client.rpc("decline_match", { p_match_id: matchId });
    if (error) {
      showToast(error.message?.includes("function")
        ? "请先在 Supabase 运行再战更新 SQL"
        : error.message || "拒绝失败");
      return;
    }
    pvpGame.invitePromptFor = null;
    pvpGame.dismissedMatches.add(matchId);
    closeModal();
    clearPvpMatch();
    await Promise.allSettled([loadMatches(), loadMyScore(), loadRank()]);
  }

  async function loadMatch(matchId) {
    if (!cloud.profile || !cloud.client || !matchId) return;
    const [{ data: match, error: matchError }, { data: moves, error: movesError }] = await Promise.all([
      cloud.client.from("matches").select("*").eq("id", matchId).maybeSingle(),
      cloud.client.from("match_moves").select("*").eq("match_id", matchId).order("move_no")
    ]);
    if (matchError || movesError || !match) {
      showToast("读取对局失败");
      return;
    }
    pvpGame.match = match;
    pvpGame.moves = moves || [];
    pvpGame.board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    pvpGame.moves.forEach((move) => {
      const player = move.player_id === match.player_black ? BLACK : WHITE;
      pvpGame.board[idx(move.x, move.y)] = player;
    });
    pvpGame.myColor = match.player_black === cloud.profile.id
      ? BLACK
      : match.player_white === cloud.profile.id
        ? WHITE
        : null;
    const playable = match.status === "active" || (match.status === "finished" && match.finished_reason !== "declined");
    els.pvpBoardPanel.hidden = !playable;
    els.pvpLobbyBlank.hidden = playable;
    renderPvpBoard();
    updatePvpHeader();
    subscribeMatch(match.id);
    if (match.status === "finished" && match.finished_reason === "declined") {
      pvpGame.dismissedMatches.add(match.id);
      closeModal();
      clearPvpMatch();
      showToast("对方已拒绝再战");
      await Promise.allSettled([loadMatches(), loadMyScore(), loadRank()]);
      return;
    }
    if (match.status === "finished") {
      await Promise.allSettled([loadMyScore(), loadRank()]);
      showPvpResultModal(match);
    }
  }

  function subscribeMatch(matchId) {
    if (!cloud.client) return;
    if (cloud.matchChannel && cloud.matchChannelId === matchId) return;
    if (cloud.matchChannel) {
      cloud.client.removeChannel(cloud.matchChannel);
      cloud.matchChannel = null;
      cloud.matchChannelId = null;
    }
    cloud.matchChannel = cloud.client
      .channel(`match-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () => loadMatch(matchId))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_moves", filter: `match_id=eq.${matchId}` }, () => loadMatch(matchId))
      .subscribe();
    cloud.matchChannelId = matchId;
  }

  function subscribeInbox() {
    if (!cloud.client || cloud.inboxChannel) return;
    cloud.inboxChannel = cloud.client
      .channel(`match-inbox-${cloud.profile?.id || "guest"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        if (cloud.profile) loadMatches();
      })
      .subscribe();
  }

  function unsubscribeInbox() {
    if (!cloud.client || !cloud.inboxChannel) return;
    cloud.client.removeChannel(cloud.inboxChannel);
    cloud.inboxChannel = null;
  }

  async function makePvpMove(x, y) {
    if (!requireLogin() || !pvpGame.match) return;
    const { error } = await cloud.client.rpc("make_match_move", {
      p_match_id: pvpGame.match.id,
      p_x: x,
      p_y: y
    });
    if (error) {
      showToast(error.message || "落子失败");
      return;
    }
    await loadMatch(pvpGame.match.id);
  }

  async function resignMatch() {
    if (!requireLogin() || !pvpGame.match) return;
    const { error } = await cloud.client.rpc("resign_match", {
      p_match_id: pvpGame.match.id
    });
    if (error) {
      showToast(error.message || "认输失败");
      return;
    }
    await loadMatch(pvpGame.match.id);
    await loadMyScore();
    await loadRank();
  }

  function matchStatusText(row) {
    if (row.status === "invited") return row.match_type === "rematch" ? "再战邀请待确认" : "好友邀请待接受";
    if (row.status === "active") return row.is_my_turn ? "轮到你" : "等待对方";
    if (row.status === "finished") return row.result_text || "已结束";
    return row.status;
  }

  function updatePvpHeader() {
    const match = pvpGame.match;
    if (!match) {
      els.activeMatchCard.hidden = true;
      els.resignBtn.hidden = true;
      els.pvpStatus.textContent = "登录后可以随机匹配或接受好友邀请。";
      return;
    }
    els.activeMatchCard.hidden = false;
    els.resignBtn.hidden = match.status !== "active";
    const myTurn = match.current_turn === cloud.profile?.id;
    const colorText = pvpGame.myColor === BLACK ? "黑棋" : "白棋";
    els.matchTitle.textContent = match.status === "finished"
      ? "对局已结束"
      : match.status === "invited"
        ? "等待再战确认"
        : `当前对局 · ${colorText}`;
    els.matchMeta.textContent = match.status === "finished"
      ? match.winner === cloud.profile?.id
        ? "你赢了"
        : match.winner
          ? "你输了"
          : "平局"
      : match.status === "invited"
        ? match.invited_user === cloud.profile?.id
          ? "对方邀请你再战"
          : "已邀请对方再战，等待回应"
      : myTurn
        ? "轮到你落子"
        : "等待对方落子";
    els.pvpStatus.textContent = els.matchMeta.textContent;
  }

  function resetAiGame(aiFirst) {
    aiGame.board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    aiGame.moves = [];
    aiGame.currentPlayer = BLACK;
    aiGame.humanPlayer = aiFirst ? WHITE : BLACK;
    aiGame.aiPlayer = aiFirst ? BLACK : WHITE;
    aiGame.aiStarts = aiFirst;
    aiGame.winner = null;
    aiGame.finished = false;
    aiGame.thinking = false;
    aiGame.startedAt = Date.now();
    aiGame.submitted = false;
    aiGame.sessionId += 1;
    updateAiStatus(aiFirst ? "AI 正在开局。" : "轮到你落子。");
    renderAiBoard();
    if (aiFirst) requestAiMove();
  }

  function placeAiStone(x, y, player) {
    const index = idx(x, y);
    if (aiGame.board[index] !== EMPTY || aiGame.finished) return false;
    aiGame.board[index] = player;
    aiGame.moves.push({ x, y, player });
    if (checkWin(aiGame.board, x, y, player)) {
      aiGame.winner = player;
      aiGame.finished = true;
      updateAiStatus(player === aiGame.humanPlayer ? "你赢了。" : "AI 赢了。");
      submitAiResult();
    } else if (aiGame.moves.length >= BOARD_SIZE * BOARD_SIZE) {
      aiGame.finished = true;
      updateAiStatus("平局。");
      submitAiResult();
    } else {
      aiGame.currentPlayer = other(player);
      updateAiStatus(aiGame.currentPlayer === aiGame.humanPlayer ? "轮到你落子。" : "轮到 AI。");
    }
    renderAiBoard();
    return true;
  }

  function handleAiHumanMove(x, y) {
    if (aiGame.finished || aiGame.thinking || aiGame.currentPlayer !== aiGame.humanPlayer) return;
    if (!placeAiStone(x, y, aiGame.humanPlayer)) return;
    if (!aiGame.finished) requestAiMove();
  }

  function requestAiMove() {
    if (aiGame.finished || aiGame.thinking) return;
    if (!aiWorker) aiWorker = createAiWorker();
    aiGame.thinking = true;
    updateAiStatus("AI 思考中。");
    const sessionId = aiGame.sessionId;
    aiWorker.onmessage = (event) => {
      if (sessionId !== aiGame.sessionId) return;
      aiGame.thinking = false;
      const move = event.data.move || findFallbackMove(aiGame.board);
      if (move) placeAiStone(move.x, move.y, aiGame.aiPlayer);
    };
    aiWorker.postMessage({
      board: Array.from(aiGame.board),
      aiPlayer: aiGame.aiPlayer,
      humanPlayer: aiGame.humanPlayer,
      timeMs: SEARCH_TIME_MS,
      maxCandidates: MAX_CANDIDATES
    });
  }

  function undoAiRound() {
    if (aiGame.thinking || aiGame.moves.length === 0) return;
    const removeCount = aiGame.moves.length === 1 && aiGame.moves[0].player === aiGame.aiPlayer ? 1 : 2;
    for (let i = 0; i < removeCount && aiGame.moves.length > 0; i += 1) {
      const move = aiGame.moves.pop();
      aiGame.board[idx(move.x, move.y)] = EMPTY;
    }
    aiGame.finished = false;
    aiGame.winner = null;
    aiGame.currentPlayer = aiGame.moves.length === 0 ? BLACK : other(aiGame.moves[aiGame.moves.length - 1].player);
    updateAiStatus(aiGame.currentPlayer === aiGame.humanPlayer ? "已悔棋，轮到你。" : "已悔棋。");
    renderAiBoard();
  }

  async function submitAiResult() {
    if (aiGame.submitted || !cloud.profile || !cloud.client) {
      els.aiCloudState.textContent = cloud.profile ? "AI积分未提交" : "登录后可计分";
      showAiResultModal(0);
      return;
    }
    const humanMoves = aiGame.moves.filter((move) => move.player === aiGame.humanPlayer).length;
    const result = aiGame.winner === aiGame.humanPlayer ? "win" : aiGame.winner === aiGame.aiPlayer ? "loss" : "draw";
    if (humanMoves < 8 || result !== "win") {
      els.aiCloudState.textContent = humanMoves < 8 ? "AI有效局需8手" : "AI胜利才加分";
      aiGame.submitted = true;
      showAiResultModal(0);
      return;
    }
    aiGame.submitted = true;
    const durationSeconds = Math.max(1, Math.round((Date.now() - aiGame.startedAt) / 1000));
    const { data, error } = await cloud.client.rpc("submit_ai_result", {
      p_result: result,
      p_player_moves: humanMoves,
      p_duration_seconds: durationSeconds
    });
    if (error) {
      els.aiCloudState.textContent = "AI积分提交失败";
      console.warn(error);
      showAiResultModal(0);
      return;
    }
    els.aiCloudState.textContent = `AI +${data?.points_added || 0}`;
    await loadMyScore();
    await loadRank();
    showAiResultModal(data?.points_added || 0);
  }

  function updateAiStatus(text) {
    els.gameStatus.textContent = text;
    if (!cloud.profile) {
      els.aiCloudState.textContent = "登录后可计分";
    } else if (!aiGame.finished) {
      els.aiCloudState.textContent = AI_SCORE_RULE;
    }
  }

  function checkWin(board, x, y, player) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      let count = 1;
      let step = 1;
      while (inBounds(x + dx * step, y + dy * step) && board[idx(x + dx * step, y + dy * step)] === player) {
        count += 1;
        step += 1;
      }
      step = 1;
      while (inBounds(x - dx * step, y - dy * step) && board[idx(x - dx * step, y - dy * step)] === player) {
        count += 1;
        step += 1;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  function createAiWorker() {
    function workerMain() {
      const BOARD_SIZE = 15;
      const EMPTY = 0;
      const BLACK = 1;
      const WHITE = 2;
      const SCORES = {
        FIVE: 10000000,
        FOUR: 180000,
        BLOCKED_FOUR: 48000,
        THREE: 16000,
        BLOCKED_THREE: 2600,
        TWO: 520,
        BLOCKED_TWO: 90,
        ONE: 12
      };
      const WIN_SCORE = 500000000;
      const MAX_DEPTH = 8;
      const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
      const history = new Int32Array(BOARD_SIZE * BOARD_SIZE);
      const transposition = new Map();
      const zobrist = [];
      const sideHash = [
        randomHash(),
        randomHash()
      ];
      let deadline = 0;
      let timeUp = false;
      let nodeCount = 0;
      let rootBestMove = null;
      let aiSide = WHITE;
      let humanSide = BLACK;
      let candidateCap = 18;

      for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i += 1) {
        zobrist.push([randomHash(), randomHash()]);
      }

      function randomHash() {
        const a = BigInt(Math.floor(Math.random() * 0xffffffff));
        const b = BigInt(Math.floor(Math.random() * 0xffffffff));
        return (a << 32n) ^ b;
      }

      function idx(x, y) {
        return y * BOARD_SIZE + x;
      }

      function inBounds(x, y) {
        return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
      }

      function other(player) {
        return player === BLACK ? WHITE : BLACK;
      }

      function timedOut() {
        if (timeUp) return true;
        if (performance.now() >= deadline) {
          timeUp = true;
          return true;
        }
        return false;
      }

      function boardFull(board) {
        for (let i = 0; i < board.length; i += 1) {
          if (board[i] === EMPTY) return false;
        }
        return true;
      }

      function computeHash(board) {
        let hash = 0n;
        for (let i = 0; i < board.length; i += 1) {
          const value = board[i];
          if (value === BLACK || value === WHITE) {
            hash ^= zobrist[i][value - 1];
          }
        }
        return hash;
      }

      function makeKey(hash, player) {
        return (hash ^ sideHash[player - 1]).toString();
      }

      function checkWin(board, x, y, player) {
        for (const [dx, dy] of DIRS) {
          let count = 1;
          let step = 1;
          while (inBounds(x + dx * step, y + dy * step) && board[idx(x + dx * step, y + dy * step)] === player) {
            count += 1;
            step += 1;
          }
          step = 1;
          while (inBounds(x - dx * step, y - dy * step) && board[idx(x - dx * step, y - dy * step)] === player) {
            count += 1;
            step += 1;
          }
          if (count >= 5) return true;
        }
        return false;
      }

      function countToScore(count, open, gap) {
        if (count >= 5) return SCORES.FIVE;
        if (count === 4 && open === 2) return SCORES.FOUR;
        if (count === 4 && open === 1) return SCORES.BLOCKED_FOUR;
        if (count === 3 && open === 2) return gap ? SCORES.THREE + 6000 : SCORES.THREE;
        if (count === 3 && open === 1) return SCORES.BLOCKED_THREE;
        if (count === 2 && open === 2) return gap ? SCORES.TWO + 220 : SCORES.TWO;
        if (count === 2 && open === 1) return SCORES.BLOCKED_TWO;
        if (count === 1 && open > 0) return SCORES.ONE;
        return 0;
      }

      function lineScore(board, x, y, player, dx, dy) {
        let count = 1;
        let open = 0;
        let gap = 0;
        for (const dir of [1, -1]) {
          let step = 1;
          while (inBounds(x + dx * step * dir, y + dy * step * dir) && board[idx(x + dx * step * dir, y + dy * step * dir)] === player) {
            count += 1;
            step += 1;
          }
          const nx = x + dx * step * dir;
          const ny = y + dy * step * dir;
          if (inBounds(nx, ny) && board[idx(nx, ny)] === EMPTY) {
            open += 1;
            const nx2 = x + dx * (step + 1) * dir;
            const ny2 = y + dy * (step + 1) * dir;
            if (inBounds(nx2, ny2) && board[idx(nx2, ny2)] === player) {
              gap += 1;
            }
          }
        }
        return countToScore(count + gap, open, gap);
      }

      function scorePoint(board, x, y, player) {
        let total = 0;
        let liveThree = 0;
        let fours = 0;
        let blockedFours = 0;
        let twos = 0;
        for (const [dx, dy] of DIRS) {
          const score = lineScore(board, x, y, player, dx, dy);
          if (score >= SCORES.FIVE) return SCORES.FIVE;
          if (score >= SCORES.FOUR) fours += 1;
          else if (score >= SCORES.BLOCKED_FOUR) blockedFours += 1;
          else if (score >= SCORES.THREE) liveThree += 1;
          else if (score >= SCORES.TWO) twos += 1;
          total += score;
        }
        if (fours >= 1) total += SCORES.FOUR * 2;
        if (blockedFours >= 2) total += SCORES.FOUR;
        if (blockedFours >= 1 && liveThree >= 1) total += SCORES.FOUR - 1200;
        if (liveThree >= 2) total += SCORES.FOUR - 3200;
        if (twos >= 2) total += SCORES.TWO * 3;
        return total;
      }

      function collectCandidates(board) {
        const marks = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
        const result = [];
        let stones = 0;
        for (let y = 0; y < BOARD_SIZE; y += 1) {
          for (let x = 0; x < BOARD_SIZE; x += 1) {
            if (board[idx(x, y)] !== EMPTY) {
              stones += 1;
              for (let dy = -2; dy <= 2; dy += 1) {
                for (let dx = -2; dx <= 2; dx += 1) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (!inBounds(nx, ny)) continue;
                  const id = idx(nx, ny);
                  if (board[id] === EMPTY && !marks[id]) {
                    marks[id] = 1;
                    result.push({ x: nx, y: ny, index: id });
                  }
                }
              }
            }
          }
        }
        if (stones === 0) return [{ x: 7, y: 7, index: idx(7, 7) }];
        return result;
      }

      function immediateWin(board, player) {
        const wins = [];
        for (const move of collectCandidates(board)) {
          board[move.index] = player;
          const winning = checkWin(board, move.x, move.y, player) || scorePoint(board, move.x, move.y, player) >= SCORES.FIVE;
          board[move.index] = EMPTY;
          if (winning) wins.push(move);
        }
        return wins;
      }

      function generateMoves(board, player, depth) {
        const opponent = other(player);
        const center = Math.floor(BOARD_SIZE / 2);
        const wins = [];
        const forcedBlocks = [];
        const strongAttacks = [];
        const strongBlocks = [];
        const normal = [];

        for (const move of collectCandidates(board)) {
          const { x, y, index } = move;
          board[index] = player;
          const attack = scorePoint(board, x, y, player);
          const winning = checkWin(board, x, y, player) || attack >= SCORES.FIVE;
          board[index] = EMPTY;

          board[index] = opponent;
          const defense = scorePoint(board, x, y, opponent);
          const blocksWin = checkWin(board, x, y, opponent) || defense >= SCORES.FIVE;
          board[move.index] = EMPTY;

          const centerBias = (BOARD_SIZE - (Math.abs(x - center) + Math.abs(y - center))) * 18;
          const score = Math.max(attack * 1.04, defense * 1.16) + attack * 0.36 + defense * 0.58 + centerBias + history[index];
          const item = { x, y, index, attack, defense, score };

          if (winning) {
            wins.push(item);
          } else if (blocksWin) {
            forcedBlocks.push(item);
          } else if (attack >= SCORES.FOUR || (attack >= SCORES.BLOCKED_FOUR && attack + defense >= SCORES.FOUR)) {
            strongAttacks.push(item);
          } else if (defense >= SCORES.FOUR || defense >= SCORES.BLOCKED_FOUR) {
            strongBlocks.push(item);
          } else {
            normal.push(item);
          }
        }

        const sorter = (a, b) => b.score - a.score;
        if (wins.length) return wins.sort(sorter);
        if (forcedBlocks.length) return forcedBlocks.sort(sorter);
        const ordered = strongAttacks.sort(sorter).concat(strongBlocks.sort(sorter), normal.sort(sorter));
        const limit = depth >= 4 ? candidateCap : candidateCap + 4;
        return ordered.slice(0, limit);
      }

      function evaluateBoard(board) {
        const candidates = collectCandidates(board);
        if (candidates.length === 0) return 0;
        let aiBest = 0;
        let aiSecond = 0;
        let humanBest = 0;
        let humanSecond = 0;
        let aiTotal = 0;
        let humanTotal = 0;

        candidates.slice(0, 28).forEach((move) => {
          board[move.index] = aiSide;
          const aiScore = scorePoint(board, move.x, move.y, aiSide);
          board[move.index] = humanSide;
          const humanScore = scorePoint(board, move.x, move.y, humanSide);
          board[move.index] = EMPTY;

          aiTotal += aiScore;
          humanTotal += humanScore;
          if (aiScore > aiBest) {
            aiSecond = aiBest;
            aiBest = aiScore;
          } else if (aiScore > aiSecond) {
            aiSecond = aiScore;
          }
          if (humanScore > humanBest) {
            humanSecond = humanBest;
            humanBest = humanScore;
          } else if (humanScore > humanSecond) {
            humanSecond = humanScore;
          }
        });

        return Math.round(aiBest * 1.12 + aiSecond * 0.46 + aiTotal * 0.026 - humanBest * 1.24 - humanSecond * 0.52 - humanTotal * 0.032);
      }

      function negamax(board, depth, alpha, beta, player, hash, ply, lastMove) {
        nodeCount += 1;
        if ((nodeCount & 255) === 0 && timedOut()) return { score: 0, timedOut: true };
        if (lastMove && checkWin(board, lastMove.x, lastMove.y, other(player))) {
          return { score: -WIN_SCORE + ply };
        }
        if (boardFull(board)) return { score: 0 };

        const key = makeKey(hash, player);
        const cached = transposition.get(key);
        if (cached && cached.depth >= depth) {
          if (cached.flag === 0) return { score: cached.score, move: cached.move };
          if (cached.flag === 1) alpha = Math.max(alpha, cached.score);
          if (cached.flag === 2) beta = Math.min(beta, cached.score);
          if (alpha >= beta) return { score: cached.score, move: cached.move };
        }

        if (depth <= 0 || ply >= 12) {
          const staticScore = evaluateBoard(board);
          return { score: player === aiSide ? staticScore : -staticScore };
        }

        const moves = generateMoves(board, player, depth);
        if (moves.length === 0) {
          const staticScore = evaluateBoard(board);
          return { score: player === aiSide ? staticScore : -staticScore };
        }
        if (cached?.move) {
          const hit = moves.findIndex((move) => move.index === cached.move.index);
          if (hit > 0) moves.unshift(...moves.splice(hit, 1));
        }

        const originalAlpha = alpha;
        let bestScore = -Infinity;
        let bestMove = moves[0];
        const opponent = other(player);

        for (const move of moves) {
          board[move.index] = player;
          const nextHash = hash ^ zobrist[move.index][player - 1];
          const extension = (move.attack >= SCORES.FOUR || move.defense >= SCORES.FOUR) && depth >= 3 ? 1 : 0;
          const child = negamax(board, depth - 1 + extension, -beta, -alpha, opponent, nextHash, ply + 1, move);
          board[move.index] = EMPTY;
          if (child.timedOut) return child;

          const score = -child.score;
          if (score > bestScore) {
            bestScore = score;
            bestMove = move;
            if (ply === 0) rootBestMove = move;
          }
          alpha = Math.max(alpha, score);
          if (alpha >= beta) {
            history[move.index] += depth * depth + 2;
            break;
          }
        }

        const flag = bestScore <= originalAlpha ? 2 : bestScore >= beta ? 1 : 0;
        transposition.set(key, {
          depth,
          score: bestScore,
          flag,
          move: bestMove ? { x: bestMove.x, y: bestMove.y, index: bestMove.index } : null
        });
        if (transposition.size > 60000) transposition.clear();
        return { score: bestScore, move: bestMove };
      }

      function quickTactic(board, player) {
        const opponent = other(player);
        const ownWins = immediateWin(board, player);
        if (ownWins.length) return ownWins[0];
        const opponentWins = immediateWin(board, opponent);
        if (opponentWins.length) return opponentWins[0];
        return null;
      }

      self.onmessage = (event) => {
        const payload = event.data;
        const started = performance.now();
        const board = Uint8Array.from(payload.board);
        aiSide = payload.aiPlayer;
        humanSide = payload.humanPlayer;
        candidateCap = payload.maxCandidates || 18;
        deadline = performance.now() + Math.max(450, payload.timeMs || 1600) - 16;
        timeUp = false;
        nodeCount = 0;
        rootBestMove = null;

        const center = Math.floor(BOARD_SIZE / 2);
        if (board[idx(center, center)] === EMPTY && board.every((value) => value === EMPTY)) {
          self.postMessage({ move: { x: center, y: center }, depth: 0, nodes: 1, elapsed: 0 });
          return;
        }

        const tactic = quickTactic(board, aiSide);
        let bestMove = tactic || null;
        let finishedDepth = 0;
        let bestScore = -Infinity;
        const hash = computeHash(board);

        for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
          const result = negamax(board, depth, -WIN_SCORE, WIN_SCORE, aiSide, hash, 0, null);
          if (result.timedOut) break;
          if (result.move) {
            bestMove = result.move;
            bestScore = result.score;
          } else if (rootBestMove) {
            bestMove = rootBestMove;
          }
          finishedDepth = depth;
          if (timedOut() || Math.abs(bestScore) >= WIN_SCORE - 100) break;
        }

        if (!bestMove) {
          bestMove = collectCandidates(board)
            .sort((a, b) => Math.abs(a.x - center) + Math.abs(a.y - center) - Math.abs(b.x - center) - Math.abs(b.y - center))[0];
        }

        self.postMessage({
          move: bestMove ? { x: bestMove.x, y: bestMove.y } : null,
          depth: finishedDepth,
          nodes: nodeCount,
          elapsed: Math.round(performance.now() - started)
        });
      };
    }

    const blob = new Blob([`(${workerMain.toString()})();`], { type: "application/javascript" });
    return new Worker(URL.createObjectURL(blob));
  }

  function findFallbackMove(board) {
    const center = Math.floor(BOARD_SIZE / 2);
    const cells = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (board[idx(x, y)] === EMPTY) {
          cells.push({ x, y, d: Math.abs(x - center) + Math.abs(y - center) });
        }
      }
    }
    cells.sort((a, b) => a.d - b.d);
    return cells[0] || null;
  }

  function drawBoard(canvas, board, moves, options = {}) {
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const pad = 48;
    const cell = (size - pad * 2) / (BOARD_SIZE - 1);
    ctx.clearRect(0, 0, size, size);
    const boardFill = ctx.createLinearGradient(0, 0, 0, size);
    boardFill.addColorStop(0, "#f0cd8c");
    boardFill.addColorStop(1, "#c89145");
    ctx.fillStyle = boardFill;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(71, 45, 20, 0.66)";
    ctx.lineWidth = 2;
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const pos = pad + i * cell;
      ctx.beginPath();
      ctx.moveTo(pad, pos);
      ctx.lineTo(size - pad, pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos, pad);
      ctx.lineTo(pos, size - pad);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(71, 45, 20, 0.78)";
    [3, 7, 11].forEach((x) => {
      [3, 7, 11].forEach((y) => {
        ctx.beginPath();
        ctx.arc(pad + x * cell, pad + y * cell, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    moves.forEach((move, index) => {
      const isLast = index === moves.length - 1;
      drawStone(ctx, pad + move.x * cell, pad + move.y * cell, cell * 0.42, move.player, isLast);
    });

    if (options.ghost && inBounds(options.ghost.x, options.ghost.y) && board[idx(options.ghost.x, options.ghost.y)] === EMPTY) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      drawStone(ctx, pad + options.ghost.x * cell, pad + options.ghost.y * cell, cell * 0.38, options.ghost.player, false);
      ctx.restore();
    }
  }

  function drawStone(ctx, cx, cy, radius, player, highlight) {
    const gradient = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.36, radius * 0.1, cx, cy, radius);
    if (player === BLACK) {
      gradient.addColorStop(0, "#6f6862");
      gradient.addColorStop(1, "#151312");
    } else {
      gradient.addColorStop(0, "#fffef7");
      gradient.addColorStop(1, "#d6c8b5");
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    if (highlight) {
      ctx.strokeStyle = player === BLACK ? "#f4d27c" : "#28635d";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function getCellFromEvent(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    const pad = 48;
    const cell = (canvas.width - pad * 2) / (BOARD_SIZE - 1);
    const x = Math.round((px - pad) / cell);
    const y = Math.round((py - pad) / cell);
    if (!inBounds(x, y)) return null;
    const cx = pad + x * cell;
    const cy = pad + y * cell;
    if (Math.hypot(px - cx, py - cy) > cell * 0.48) return null;
    return { x, y };
  }

  function renderAiBoard() {
    drawBoard(els.boardCanvas, aiGame.board, aiGame.moves);
  }

  function renderPvpBoard() {
    drawBoard(els.pvpCanvas, pvpGame.board, pvpGame.moves.map((move) => ({
      x: move.x,
      y: move.y,
      player: pvpGame.match && move.player_id === pvpGame.match.player_black ? BLACK : WHITE
    })));
  }

  function handlePvpCanvasClick(event) {
    if (!pvpGame.match || pvpGame.match.status !== "active") return;
    if (pvpGame.match.current_turn !== cloud.profile?.id) return;
    const cell = getCellFromEvent(els.pvpCanvas, event);
    if (!cell || pvpGame.board[idx(cell.x, cell.y)] !== EMPTY) return;
    makePvpMove(cell.x, cell.y);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function bindEvents() {
    els.authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      loginOrRegister(false);
    });
    els.registerBtn.addEventListener("click", () => loginOrRegister(true));
    els.logoutBtn.addEventListener("click", logout);
    els.wechatBtn.addEventListener("click", () => showToast("微信登录入口已预留，拿到微信资质后可接入"));
    els.refreshBtn.addEventListener("click", () => loadAllCloudData());
    els.tabs.forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));
    els.homeActions.forEach((button) => button.addEventListener("click", () => {
      setTab(button.dataset.homeTarget);
      if (button.dataset.homeQueue) joinQueue();
    }));
    els.rankSwitches.forEach((button) => button.addEventListener("click", () => {
      cloud.rankMode = button.dataset.rank;
      els.rankSwitches.forEach((item) => item.classList.toggle("active", item === button));
      loadRank();
    }));
    els.modalPrimaryBtn.addEventListener("click", async () => {
      if (modalPrimaryAction) await modalPrimaryAction();
      else closeModal();
    });
    els.modalSecondaryBtn.addEventListener("click", async () => {
      if (modalSecondaryAction) await modalSecondaryAction();
      else closeModal();
    });

    els.playerFirstBtn.addEventListener("click", () => resetAiGame(false));
    els.aiFirstBtn.addEventListener("click", () => resetAiGame(true));
    els.resetBtn.addEventListener("click", () => resetAiGame(aiGame.aiStarts));
    els.undoBtn.addEventListener("click", undoAiRound);
    els.boardCanvas.addEventListener("click", (event) => {
      const cell = getCellFromEvent(els.boardCanvas, event);
      if (cell) handleAiHumanMove(cell.x, cell.y);
    });

    els.queueBtn.addEventListener("click", joinQueue);
    els.reloadMatchesBtn.addEventListener("click", loadMatches);
    els.resignBtn.addEventListener("click", resignMatch);
    els.pvpCanvas.addEventListener("click", handlePvpCanvasClick);
    els.matchList.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.acceptMatch) acceptMatch(target.dataset.acceptMatch);
      if (target.dataset.declineMatch) declineMatch(target.dataset.declineMatch);
      if (target.dataset.openMatch) loadMatch(target.dataset.openMatch);
    });

    els.friendSearchForm.addEventListener("submit", searchFriend);
    els.friendSearchResult.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-add-friend]");
      if (target) requestFriend(target.dataset.addFriend);
    });
    els.reloadFriendsBtn.addEventListener("click", loadFriends);
    els.friendList.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.acceptFriend) respondFriend(target.dataset.acceptFriend, true);
      if (target.dataset.rejectFriend) respondFriend(target.dataset.rejectFriend, false);
      if (target.dataset.inviteFriend) inviteFriend(target.dataset.inviteFriend);
    });
    els.reloadRankBtn.addEventListener("click", loadRank);
  }

  async function init() {
    bindEvents();
    if (isCloudConfigured && window.supabase) {
      cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      cloud.client.auth.onAuthStateChange((_event, session) => {
        cloud.session = session;
      });
    }
    updateCloudUi();
    resetAiGame(false);
    clearPvpMatch();
    await loadSession();
    els.aiCloudState.textContent = cloud.profile ? AI_SCORE_RULE : "登录后可计分";
    els.pvpStatus.textContent = PVP_SCORE_RULE;
  }

  init();
})();
