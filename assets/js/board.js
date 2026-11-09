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

  // the photo in a ring of the level's colour (a star from L3, a double ring from L5, crowns at L7 and L8)
  const av = (r, size) => G.ringAv(r.photo, r.nickname, r.xp, size || 40);
  const lvChip = (xp) => { const k = lvOf(xp); return `<span class="bd-lvc l${k + 1}" title="${esc(G.LEVELS[k][1])}">L${k + 1}</span>`; };
  // badges as a short stack (3 icons + "+N"; "🏅 N" on phones); a tap lists them all
  const badges = (r) => { const b = (r.badges || []).filter((id) => BADGE[id]);
    if (!b.length) return `<span class="bd-bs none" title="No badges yet">–</span>`;
    return `<button type="button" class="bd-bs" data-bpop="${esc(r.uid)}" aria-label="${b.length} badge${b.length === 1 ? "" : "s"}: ${esc(b.map((id) => BADGE[id].name).join(", "))}">${b.slice(0, 3).map((id) => `<i aria-hidden="true">${BADGE[id].icon}</i>`).join("")}<b aria-hidden="true">🏅 ${b.length}</b>${b.length > 3 ? `<em aria-hidden="true">+${b.length - 3}</em>` : ""}</button>`; };
  const you = (r) => (me && r.uid === me ? ' <span class="bd-you">you</span>' : "");
  const name = (r) => `<span class="bd-nmw"><a class="bd-name" href="profile.html?u=${encodeURIComponent(r.uid)}">${esc(r.nickname)}</a>${you(r)}</span>`;
  const sorted = () => rows.slice().sort((a, b) => (b.xp || 0) - (a.xp || 0) || String(a.nickname).localeCompare(b.nickname));
  // one player as a row: place, avatar and name, level, an XP bar against the leader, badges, last active
  const line = (r, i, max) => { const k = lvOf(r.xp);
    // nothing is shortened (lecturer's choice, 9 Nov 2026): the name and level wrap; on phones the row stacks
    return `<li class="bd-row${me && r.uid === me ? " me" : ""}"><span class="bd-pos">${i}</span>${av(r, 42)}${name(r)}
      <span class="bd-lvl">${lvChip(r.xp)} ${esc(G.LEVELS[k][1])}</span>
      <span class="bd-xpn">${(r.xp || 0).toLocaleString("en")} XP</span><i class="bd-xpb" aria-hidden="true"><b class="l${k + 1}" style="width:${max ? Math.max(3, Math.round(((r.xp || 0) / max) * 100)) : 0}%"></b></i>
      ${badges(r)}<span class="bd-last">${ago(r.lastActive)}</span></li>`; };
  const list = (arr, start, max) => `<ol class="bd-list">${arr.map((r, i) => line(r, start + i, max)).join("")}</ol>`;

  function topView(s) {
    if (!s.length) return `<p class="bd-empty">No one is on the board yet this semester.</p>`;
    const max = s[0].xp || 1, pod = [s[1], s[0], s[2]].map((r, k) => r ? `<div class="bd-pod p${[2, 1, 3][k]}${me && r.uid === me ? " me" : ""}">
        ${k === 1 ? `<i class="bd-spk s1" aria-hidden="true">✦</i><i class="bd-spk s2" aria-hidden="true">✦</i><i class="bd-spk s3" aria-hidden="true">✧</i><i class="bd-spk s4" aria-hidden="true">✦</i>` : ""}<span class="bd-medal" aria-hidden="true">${["🥈", "🥇", "🥉"][k]}</span>${av(r, k === 1 ? 72 : 60)}<strong>${name(r)}</strong><small>${lvChip(r.xp)} ${(r.xp || 0).toLocaleString("en")} XP</small><small class="bd-plast">🕒 ${ago(r.lastActive)}</small><span class="bd-step">${[2, 1, 3][k]}</span></div>` : "<div></div>").join("");
    return `<div class="bd-podh"><span>Top ${Math.min(3, s.length)}</span>${window.NMKShare ? `<button type="button" class="bd-shr" data-bshtop aria-label="Share the top 3 as a picture" title="Share the top 3">📤</button>` : ""}</div><div class="bd-podium">${pod}</div>${s.length > 3 ? list(s.slice(3, 10), 4, max) : ""}`;
  }
  function bottomView(s) {
    const n = s.length; if (n <= 10) return `<p class="bd-empty">The bottom 10 shows once more than 10 students are on the board.</p>`;
    const start = Math.max(10, n - 10), last3 = s.slice(n - 3), at = me ? s.findIndex((r) => r.uid === me) : -1;
    // the Climb-Out Zone (lecturer's choice): the last 3 as launch pads with arrows pointing up, amber, encouraging
    const pads = last3.map((r, k) => `<div class="bd-pad${me && r.uid === me ? " me" : ""}"><span class="bd-ppos">#${n - 2 + k}</span><i class="bd-up" aria-hidden="true">⬆</i>${av(r, 54)}<strong>${name(r)}</strong><small>${lvChip(r.xp)} ${(r.xp || 0).toLocaleString("en")} XP</small><small class="bd-plast">🕒 ${ago(r.lastActive)}</small></div>`).join("");
    const out = s[n - 4], need = at >= n - 3 && out ? Math.max(1, (out.xp || 0) - (s[at].xp || 0) + 1) : 0;
    const cheer = at >= n - 3 ? `<p class="bd-cheer mine">🚀 You need <strong>${need.toLocaleString("en")} XP</strong> to climb out: one or two exercises will do it!</p>` : `<p class="bd-cheer">🚀 One exercise could lift you out!</p>`;
    return `<p class="bd-note">💪 Not a ranking of ability: it shows who has done the least so far. Any exercise you solve moves you up.</p>
      <section class="bd-climb" aria-label="Climb-Out Zone"><div class="bd-climbh"><h3>🚀 Climb-Out Zone</h3>${window.NMKShare ? `<button type="button" class="bd-shr" data-bshlow aria-label="Share the Climb-Out Zone as a picture" title="Share the Climb-Out Zone">📤</button>` : ""}</div><p>The last three places. Solve an exercise, pass a Pre-Lab Check or come to class, and you're out.</p><div class="bd-pads">${pads}</div>${cheer}</section>
      ${n - 3 > start ? `<h3 class="bd-h3">Almost There (#${start + 1} to #${n - 3})</h3>${list(s.slice(start, n - 3), start + 1, s[0].xp || 1)}` : ""}`;
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
      ${tab !== "levels" && !gate && s.length ? `<div class="bd-sumrow"><p class="bd-sum">${s.length} student${s.length === 1 ? "" : "s"} on the board this semester.${myRank ? ` You are <strong>number ${myRank}</strong>.` : ""} <span class="small-note">${note}</span></p>${myRank && window.NMKShare ? `<button type="button" class="bd-shr wide" data-bshare aria-label="Share my rank as a picture">📤 Share my rank</button>` : ""}</div>` : ""}
      <div class="bd-body">${body}</div></div>`;
    if (focusQ) { const i = host.querySelector("[data-bq]"); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } focusQ = false; }
  }
  let focusQ = false, pop = null;
  // the list of a student's badges, in a small panel beside the stack
  function closePop() { if (!pop) return; const b = pop.back; pop.el.remove(); document.removeEventListener("keydown", popKey); pop = null; if (b && b.isConnected) b.focus({ preventScroll: true }); }
  const popKey = (e) => { if (e.key === "Escape") closePop(); };
  function popBadges(btn) {
    const was = pop && pop.back === btn; closePop(); if (was) return;
    const r = rows.find((x) => x.uid === btn.dataset.bpop); if (!r) return;
    const b = (r.badges || []).filter((id) => BADGE[id]), wrap = host.querySelector(".bd-wrap");
    const el = document.createElement("div"); el.className = "bd-pop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", `Badges of ${r.nickname}`);
    el.innerHTML = `<button type="button" class="bd-popx" data-popx aria-label="Close">✕</button><h3>${esc(r.nickname)}'s badges (${b.length})</h3><ul>${b.map((id) => `<li><span aria-hidden="true">${BADGE[id].icon}</span><div><strong>${esc(BADGE[id].name)}</strong>${BADGE[id].desc ? `<small>${esc(BADGE[id].desc)}</small>` : ""}</div></li>`).join("")}</ul>`;
    wrap.appendChild(el);
    const W = wrap.getBoundingClientRect(), B = btn.getBoundingClientRect(), w = el.offsetWidth;
    el.style.left = `${Math.max(8, Math.min(B.left - W.left - w / 2 + B.width / 2, W.width - w - 8))}px`;
    el.style.top = `${B.bottom - W.top + 6}px`;
    pop = { el, back: btn }; document.addEventListener("keydown", popKey);
    el.querySelector("[data-popx]").focus({ preventScroll: true });
  }
  // 📤 the top 3 (podium) or the Climb-Out Zone (the last 3) as one picture: nicknames only, never real names
  function shareGroup(btn, which) {
    const s = sorted(), pick = which === "top" ? s.slice(0, 3) : s.slice(-3);
    if (!pick.length) return;
    const sem = String((typeof COURSE !== "undefined" && COURSE.semesterId) || ""), m = sem.match(/^(\d{4}\/\d{4}) Semester (\d)$/);
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const people = pick.map((r) => { const k = lvOf(r.xp); return { name: r.nickname || "Student", k, level: G.LEVELS[k][1], xp: r.xp || 0, photo: r.photo }; });
    const names = people.map((x) => x.name).join(", ");
    NMKShare.open({ title: which === "top" ? "Share the top 3" : "Share the Climb-Out Zone", back: btn, file: `NMK42003-class-board-${which === "top" ? "top-3" : "climb-out"}.png`,
      text: which === "top" ? `The NMK42003 Instrumentation class board top 3: ${names}! #NMK42003 #UniMAP https://${NMKShare.SITE}/board.html` : `Climb-Out Challenge on the NMK42003 class board: ${names}, who climbs out first? 🚀 #NMK42003 #UniMAP https://${NMKShare.SITE}/board.html`,
      svg: () => Promise.all(people.map((x) => NMKShare.photoData(x.photo))).then((ph) => { const d = { sem: `UniMAP · ${m ? `Semester ${m[2]} ${m[1]}` : sem}`, date };
        const list = people.map((x, j) => Object.assign({}, x, { photo: ph[j] }));
        return which === "top" ? NMKShare.podiumCard(Object.assign(d, { top: list })) : NMKShare.climbCard(Object.assign(d, { low: list })); }) });
  }
  // 📤 Share my rank: a 9:16 picture of my level, XP and badges; the place is named in the top 10 (or the top half)
  function shareMine(btn) {
    const s = sorted(), at = s.findIndex((r) => r.uid === me); if (at < 0) return;
    const r = s[at], k = lvOf(r.xp), nx = G.LEVELS[k + 1], b = (r.badges || []).filter((id) => BADGE[id]);
    const sem = String((typeof COURSE !== "undefined" && COURSE.semesterId) || ""), m = sem.match(/^(\d{4}\/\d{4}) Semester (\d)$/), pos = at + 1;
    const d = { name: r.nickname || "Student", k, level: G.LEVELS[k][1], xp: r.xp || 0, from: G.LEVELS[k][0], next: nx ? { at: nx[0], name: nx[1] } : null,
      pos, of: s.length, top10: pos <= 10, badges: b.map((id) => BADGE[id].icon), nBadges: b.length, sem: `UniMAP · ${m ? `Semester ${m[2]} ${m[1]}` : sem}`, photo: "" };
    const text = `${pos <= 10 ? `I'm #${pos} on the NMK42003 Instrumentation class board` : "I'm levelling up in NMK42003 Instrumentation"}: L${k + 1} ${G.LEVELS[k][1]}, ${(r.xp || 0).toLocaleString("en")} XP! #NMK42003 #UniMAP https://${NMKShare.SITE}/board.html`;
    NMKShare.open({ title: "Share my rank", back: btn, file: `NMK42003-class-board-${String(d.name).replace(/[^A-Za-z0-9]+/g, "-")}.png`, text,
      svg: () => NMKShare.photoData(r.photo).then((ph) => NMKShare.classCard(Object.assign(d, { photo: ph }))) });
  }
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-btab]"); if (b) { tab = b.dataset.btab; history.replaceState(history.state, "", `#${tab}`); draw(); return; }
    if (e.target.closest("[data-signin]") && A) { A.signIn(); return; }
    const bp = e.target.closest("[data-bpop]"); if (bp) { popBadges(bp); return; }
    if (e.target.closest("[data-popx]") || (pop && !e.target.closest(".bd-pop"))) closePop();
    const sb = e.target.closest("[data-bshare]"); if (sb) { shareMine(sb); return; }
    const st = e.target.closest("[data-bshtop]"); if (st) { shareGroup(st, "top"); return; }
    const sl = e.target.closest("[data-bshlow]"); if (sl) { shareGroup(sl, "low"); return; }
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
