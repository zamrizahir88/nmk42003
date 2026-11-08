/* NMK42003 progress board (board.html): your own level, badges and journey, and the class board.
   The class board has four tabs (lecturer's idea, 9 Nov 2026): 🏆 Top 10 (a podium for the top 3), 📉 Bottom 10,
   📊 All Progress (everyone by XP, with a search box) and 🎖 Levels & XP (every level, yours highlighted, and how to earn
   XP). The first three need an approved account (Firestore: one document, boardsum, published at 12:00 AM daily);
   Levels & XP is for everyone. Detailed answers are never shown here. #top / #bottom / #all / #levels open a tab. */
(function () {
  "use strict";
  const mine = document.getElementById("myProgress"), host = document.getElementById("classBoard");
  if (!mine || !window.NMKGame) return;
  const G = window.NMKGame;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BADGE = Object.fromEntries(G.BADGES.map((b) => [b.id, b]));
  const ago = (iso) => { if (!iso) return "never"; const d = Math.floor((G.today() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : `${Math.floor(d / 7)} weeks ago`; };
  // the level from the XP (so the names stay right after the levels change), L1 to L8
  const lvOf = (xp) => { let k = 0; G.LEVELS.forEach(([t], i) => { if ((xp || 0) >= t) k = i; }); return k; };

  // lecturers have no journey of their own: hide "My Progress" for them
  const paintMine = () => {
    const lec = G.isLecturer && G.isLecturer(), head = mine.previousElementSibling;
    mine.hidden = lec; if (head && head.tagName === "H2") head.hidden = lec;
    if (!lec) mine.innerHTML = G.journeyHtml(G.local());
  };
  paintMine();
  document.addEventListener("nmk:store", () => setTimeout(paintMine, 500));

  if (!host) return;
  const A = window.NMKAccount;
  let rows = [], me = null, gate = "", note = "", q = "";
  const TABS = [["top", "🏆", "Top 10"], ["bottom", "📉", "Bottom 10"], ["all", "📊", "All Progress"], ["levels", "🎖", "Levels & XP"]];
  let tab = TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "top";

  const av = (r, big) => r.photo ? `<img class="bd-av${big ? " big" : ""}" src="${esc(r.photo)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="bd-av${big ? " big" : ""} bd-avn" aria-hidden="true">${esc(String(r.nickname || "?").trim()[0] || "?").toUpperCase()}</span>`;
  const lvChip = (xp) => { const k = lvOf(xp); return `<span class="bd-lvc l${k + 1}" title="${esc(G.LEVELS[k][1])}">L${k + 1}</span>`; };
  const badges = (r) => (r.badges || []).map((id) => BADGE[id] ? `<span title="${esc(BADGE[id].name)}">${BADGE[id].icon}</span>` : "").join("");
  const you = (r) => (me && r.uid === me ? ' <span class="bd-you">you</span>' : "");
  const name = (r) => `<span class="bd-nmw"><a class="bd-name" href="profile.html?u=${encodeURIComponent(r.uid)}">${esc(r.nickname)}</a>${you(r)}</span>`;
  const sorted = () => rows.slice().sort((a, b) => (b.xp || 0) - (a.xp || 0) || String(a.nickname).localeCompare(b.nickname));
  // one player as a row: place, avatar and name, level, an XP bar against the leader, badges, last active
  const line = (r, i, max) => { const k = lvOf(r.xp);
    return `<li class="bd-row${me && r.uid === me ? " me" : ""}"><span class="bd-pos">${i}</span>${av(r)}<span class="bd-who">${name(r)}<small>${lvChip(r.xp)} ${esc(G.LEVELS[k][1])}</small></span>
      <span class="bd-xpw"><span class="bd-xpn">${(r.xp || 0).toLocaleString("en")} XP</span><i class="bd-xpb"><b class="l${k + 1}" style="width:${max ? Math.max(3, Math.round(((r.xp || 0) / max) * 100)) : 0}%"></b></i></span>
      <span class="bd-bs">${badges(r)}</span><span class="bd-last">${ago(r.lastActive)}</span></li>`; };
  const list = (arr, start, max) => `<ol class="bd-list">${arr.map((r, i) => line(r, start + i, max)).join("")}</ol>`;

  function topView(s) {
    if (!s.length) return `<p class="bd-empty">No one is on the board yet this semester.</p>`;
    const max = s[0].xp || 1, pod = [s[1], s[0], s[2]].map((r, k) => r ? `<div class="bd-pod p${[2, 1, 3][k]}${me && r.uid === me ? " me" : ""}">
        <span class="bd-medal" aria-hidden="true">${["🥈", "🥇", "🥉"][k]}</span>${av(r, true)}<strong>${name(r)}</strong><small>${lvChip(r.xp)} ${(r.xp || 0).toLocaleString("en")} XP</small><span class="bd-step">${[2, 1, 3][k]}</span></div>` : "<div></div>").join("");
    return `<div class="bd-podium">${pod}</div>${s.length > 3 ? list(s.slice(3, 10), 4, max) : ""}`;
  }
  function bottomView(s) {
    const n = s.length; if (n <= 10) return `<p class="bd-empty">The bottom 10 shows once more than 10 students are on the board.</p>`;
    const start = Math.max(10, n - 10);
    return `<p class="bd-note">💪 Not a ranking of ability: it shows who has done the least so far. Any exercise you solve moves you up.</p>${list(s.slice(start), start + 1, s[0].xp || 1)}`;
  }
  function allView(s) {
    const t = q.trim().toLowerCase(), max = (s[0] && s[0].xp) || 1;
    const shown = s.map((r, i) => [r, i + 1]).filter(([r]) => !t || String(r.nickname).toLowerCase().includes(t));
    const counts = G.LEVELS.map((_, k) => s.filter((r) => lvOf(r.xp) === k).length);
    return `<div class="bd-dist" aria-label="How many students are at each level">${G.LEVELS.map(([, nm], k) => `<span class="l${k + 1}${counts[k] ? "" : " none"}" title="${esc(nm)}"><b>L${k + 1}</b>${counts[k]}</span>`).join("")}</div>
      <label class="bd-search"><span class="vh">Find a classmate</span><input type="search" placeholder="Find a classmate by nickname" value="${esc(q)}" data-bq></label>
      ${shown.length ? `<ol class="bd-list">${shown.map(([r, i]) => line(r, i, max)).join("")}</ol>` : `<p class="bd-empty">No one matches “${esc(q)}”.</p>`}`;
  }
  function levelsView() {
    const g = G.local(), k = lvOf(g.xp), lec = G.isLecturer && G.isLecturer();
    return `<div class="bd-lvls">${G.LEVELS.map(([at, nm], i) => `<div class="bd-lv l${i + 1}${!lec && i === k ? " me" : !lec && i < k ? " got" : ""}"><span class="bd-lvn">L${i + 1}</span><strong>${esc(nm)}</strong><small>${at.toLocaleString("en")} XP</small>${!lec && i === k ? `<em>You · ${g.xp.toLocaleString("en")} XP</em>` : !lec && i === k + 1 ? `<em class="nx">${(at - g.xp).toLocaleString("en")} XP to go</em>` : ""}</div>`).join("")}</div>
      <h3 class="bd-h2">How to Earn XP</h3>
      <ul class="bd-earn">
        <li><span>✍️</span><div><strong>Solve an exercise</strong><small>30 on the first try · 20 after 1–2 wrong tries · 10 after more</small></div><b>10–30</b></li>
        <li><span>🏁</span><div><strong>Finish a chapter or lab</strong><small>Every exercise of it solved</small></div><b>+50</b></li>
        <li><span>🧪</span><div><strong>Pass a Pre-Lab Check</strong><small>+20 more on the first attempt</small></div><b>50–70</b></li>
        <li><span>🧰</span><div><strong>Lab milestones</strong><small>Equipment checklist, Lab 2 Table 1, Lab 3 cards, Lab 3 merge</small></div><b>25 each</b></li>
        <li><span>❓</span><div><strong>A quiz question right</strong><small>Each question counts once</small></div><b>5</b></li>
        <li><span>✅</span><div><strong>Attend a lecture or lab</strong><small>Marked Present or Late</small></div><b>10</b></li>
        <li><span>⚔️</span><div><strong>INSTRUMENTA: Legends</strong><small>1 XP for every 2 coins</small></div><b>½ per coin</b></li></ul>
      <a class="bd-game" href="missions.html"><span aria-hidden="true">🏅</span><div><strong>INSTRUMENTA ranks and the battery</strong><small>The game has its own 9 ranks, from Apprentice to Legend of Measurement: open the game, then 📖 Guide.</small></div><b aria-hidden="true">›</b></a>
      <p class="bd-note">XP is for practice and fun. It never counts towards your grade.</p>`;
  }

  function draw() {
    const s = sorted(), myRank = me ? s.findIndex((r) => r.uid === me) + 1 : 0;
    const body = tab === "levels" ? levelsView() : gate ? gate : tab === "bottom" ? bottomView(s) : tab === "all" ? allView(s) : topView(s);
    host.innerHTML = `<div class="bd-wrap"><nav class="bd-tabs" aria-label="Class board">${TABS.map(([k, i, l]) => `<button type="button" class="bd-tab" data-btab="${k}" aria-pressed="${tab === k}"><span aria-hidden="true">${i}</span>${l}</button>`).join("")}</nav>
      ${tab !== "levels" && !gate && s.length ? `<p class="bd-sum">${s.length} student${s.length === 1 ? "" : "s"} on the board this semester.${myRank ? ` You are <strong>number ${myRank}</strong>.` : ""} <span class="small-note">${note}</span></p>` : ""}
      <div class="bd-body">${body}</div></div>`;
    if (focusQ) { const i = host.querySelector("[data-bq]"); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } focusQ = false; }
  }
  let focusQ = false;
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-btab]"); if (b) { tab = b.dataset.btab; history.replaceState(history.state, "", `#${tab}`); draw(); return; }
    if (e.target.closest("[data-signin]") && A) { A.signIn(); return; }
    const u = e.target.closest("[data-bupd]"); if (u) { u.disabled = true; u.textContent = "Updating…"; load(true); }
  });
  host.addEventListener("input", (e) => { if (e.target.matches("[data-bq]")) { q = e.target.value; focusQ = true; draw(); } });
  addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some(([k]) => k === h)) { tab = h; draw(); } });

  // the class rankings: one document, published at 12:00 AM each day (and by a lecturer's "Update rankings now")
  async function load(fresh) {
    try {
      const lec = A.isAdmin(A.state.user.email), r = fresh ? await A.buildRankings() : await A.boardRows();
      rows = ((r && r.rows) || []).filter((x) => x.role !== "lecturer"); gate = "";
      note = `${esc(A.rankNote(r && r.at))}${lec ? ` <button type="button" class="btn ghost small" data-bupd>⟳ Update rankings now</button>` : ""}`;
    } catch (e) { gate = `<p class="bd-empty">Could not load the board (${esc(e.code || e)}).${A.isAdmin(A.state.user.email) ? " If this says permission-denied, publish the latest firebase/firestore.rules." : ""}</p>`; }
    draw();
  }
  if (!A) { gate = `<p class="bd-empty">The class board needs the sign-in service, which could not load.</p>`; draw(); return; }
  gate = `<p class="bd-empty">Loading the board…</p>`; draw();
  A.on((st) => {
    if (!st.user) { gate = `<div class="bd-empty"><p>Sign in with your studentmail account to see the class board.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`; draw(); return; }
    if (!st.profile || (st.profile.status !== "approved" && !A.isAdmin(st.user.email))) { gate = `<p class="bd-empty">The class board opens when your lecturer has approved your account.</p>`; draw(); return; }
    me = st.user.uid;
    load(false);
  });
})();
