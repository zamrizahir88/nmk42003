/* NMK42003 lecturer dashboard (admin.html): approvals, and a bird's-eye view of the class.
   Reads Firestore through account.js (the security rules let only the lecturers read other students' records),
   and works out each student's XP, level, badges and journey with game.js from their saved progress. */
(function () {
  "use strict";
  const host = document.getElementById("admin");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!window.NMKAccount || !window.NMKGame) { host.innerHTML = `<div class="callout warn"><strong>The dashboard could not load</strong>Check your internet connection and reload the page.</div>`; return; }
  const A = window.NMKAccount, G = window.NMKGame, db = A.db;
  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const toDate = (v) => (v && v.toDate ? v.toDate() : v ? new Date(v) : null);
  const fmt = (v) => { const d = toDate(v); return d && !isNaN(d) ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–"; };
  const days = (v) => { const d = toDate(v); return d && !isNaN(d) ? Math.floor((G.today() - d.getTime()) / 86400000) : null; };
  const BADGE = Object.fromEntries(G.BADGES.map((b) => [b.id, b]));
  const STOPS = G.STOPS.filter((s) => s.kind === "ch" || s.built);
  const stopOf = (id) => STOPS.find((s) => s.ids.includes(id));

  let users = [], progress = {}, game = {}, tab = "overview", filter = "", sem = G.SEM, sortBy = "name", stopFilter = "";

  async function load() {
    host.innerHTML = `<p class="adm-empty">Loading the class…</p>`;
    try {
      const [u, p] = await Promise.all([db.collection("users").get(), db.collection("progress").get()]);
      users = u.docs.map((d) => Object.assign({ uid: d.id }, d.data()));
      progress = {}; game = {};
      p.docs.forEach((d) => { progress[d.id] = d.data(); });
      users.forEach((x) => { game[x.uid] = G.compute((progress[x.uid] && progress[x.uid].keys) || {}); });
      draw();
    } catch (e) {
      host.innerHTML = `<div class="callout warn"><strong>Could not load the records</strong>${esc(e.code || e)}. If this says "permission-denied", the latest Firestore rules have not been published yet.</div>`;
    }
  }
  async function setStatus(uid, status) {
    try {
      await db.collection("users").doc(uid).update({ status, reviewedAt: firebase.firestore.FieldValue.serverTimestamp() });
      const u = users.find((x) => x.uid === uid); if (u) u.status = status;
      draw();
    } catch (e) { alert(`Could not change the status: ${e.code || e}`); }
  }

  const inSem = (u) => (u.semester || G.SEM) === sem;
  const students = () => users.filter((u) => u.role !== "lecturer" && inSem(u));
  const approved = () => students().filter((u) => u.status === "approved");
  const matches = (u) => !filter || [u.nickname, u.name, u.email].join(" ").toLowerCase().includes(filter.toLowerCase());
  const lastOf = (u) => { const g = game[u.uid], a = toDate(u.lastActive), b = g && g.lastActive ? new Date(g.lastActive) : null; return a && b ? (a > b ? a : b) : a || b; };
  const who = (u) => `<button type="button" class="bd-name" data-detail="${u.uid}">${esc(u.nickname || "–")}</button><small>${esc(u.name)}</small>`;
  const table = (head, rows, cls = "") => `<table class="adm ${cls}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const sorted = (list) => list.slice().sort((a, b) => sortBy === "xp" ? game[b.uid].xp - game[a.uid].xp
    : sortBy === "last" ? (lastOf(a) || 0) - (lastOf(b) || 0) : String(a.nickname || a.name).localeCompare(b.nickname || b.name));

  /* ---------- the views ---------- */
  function overview() {
    const ap = approved(), now = G.weekOf(G.today());
    const active = ap.filter((u) => { const d = days(lastOf(u)); return d !== null && d < 7; });
    const stalled = ap.filter((u) => { const d = days(lastOf(u)); return d === null || d >= 14; });
    const avg = ap.length ? Math.round(ap.reduce((s, u) => s + game[u.uid].xp, 0) / ap.length) : 0;
    const perWeek = []; for (let w = 1; w <= Math.max(1, Math.min(now, 20)); w++) perWeek.push(ap.filter((u) => game[u.uid].weeks.includes(w)).length);
    const max = Math.max(1, ap.length), W = 640, H = 170, bw = Math.min(40, (W - 40) / perWeek.length - 6);
    const bars = perWeek.map((n, i) => { const x = 34 + i * ((W - 40) / perWeek.length), h = (n / max) * (H - 40); return `<rect class="adm-bar" x="${x.toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>Week ${i + 1}: ${n} active</title></rect><text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="adm-ax">${i + 1}</text>${n ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - 26 - h).toFixed(1)}" text-anchor="middle" class="adm-ax n">${n}</text>` : ""}`; }).join("");
    const nextStop = (u) => { const s = game[u.uid].stops.find((x) => (x.kind === "ch" || x.built) && x.done < x.total); return s ? s.label : "all done"; };
    return `<div class="adm-sum"><div><strong>${ap.length}</strong><span>approved students</span></div><div><strong>${students().filter((u) => u.status === "pending").length}</strong><span>waiting for approval</span></div>
        <div><strong>${active.length}</strong><span>active in the last 7 days</span></div><div class="${stalled.length ? "warn" : ""}"><strong>${stalled.length}</strong><span>no progress for 2+ weeks</span></div><div><strong>${avg}</strong><span>average XP</span></div><div><strong>Week ${now}</strong><span>of the semester</span></div></div>
      <h3 class="bd-h">Students Active Each Week</h3>
      <div class="adm-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Number of students active in each week of the semester: ${perWeek.join(", ")}"><line x1="30" x2="${W - 4}" y1="${H - 22}" y2="${H - 22}" class="adm-axl"/>${bars}<text x="4" y="14" class="adm-ax">students</text></svg></div>
      <h3 class="bd-h">No Progress for 2 Weeks or More (${stalled.length})</h3>
      ${stalled.length ? `<div class="adm-scroll">${table(["Student", "Last active", "XP", "Next stop", "Email"], stalled.map((u) => [who(u), fmt(lastOf(u)), game[u.uid].xp, nextStop(u), `<small>${esc(u.email)}</small>`]))}</div>` : `<p class="adm-empty">Everyone has made progress in the last two weeks.</p>`}`;
  }
  function heatmap() {
    const list = sorted(approved().filter(matches));
    const cell = (s) => { const p = s.pct, cls = !s.total ? "na" : p >= 100 ? "c4" : p >= 60 ? "c3" : p >= 30 ? "c2" : p > 0 ? "c1" : "c0"; return `<td class="hm ${cls}" title="${esc(s.label)}: ${s.done} of ${s.total}">${s.total ? `${s.done}/${s.total}` : ""}</td>`; };
    return `${tools(true, "heatmap")}<p class="small-note">Each cell: items done out of the total for that chapter or lab (lab = Pre-Lab Check + review exercises). Grey none, then lighter to darker teal as it fills up.</p>
      <div class="adm-scroll"><table class="adm hmap"><thead><tr><th scope="col">Student</th><th scope="col">Level</th><th scope="col">XP</th>${STOPS.map((s) => `<th scope="col" title="${esc(s.title)}">${s.kind === "lab" ? `L${s.no}` : `C${s.no}`}</th>`).join("")}<th scope="col">Last active</th></tr></thead>
      <tbody>${list.map((u) => { const g = game[u.uid]; return `<tr><td>${who(u)}</td><td>L${g.levelNo}</td><td>${g.xp}</td>${STOPS.map((s) => cell(g.stops.find((x) => x.key === s.key))).join("")}<td>${fmt(lastOf(u))}</td></tr>`; }).join("")}</tbody></table></div>
      ${list.length ? "" : `<p class="adm-empty">No approved students yet.</p>`}`;
  }
  function difficulty() {
    const ap = approved(), logs = ap.map((u) => parse(((progress[u.uid] || {}).keys || {})["nmk-ex-log"], {}));
    const solvedSets = ap.map((u) => new Set(parse(((progress[u.uid] || {}).keys || {})["nmk-solved"], [])));
    let rows = Object.keys(G.CATALOG).map((id) => {
      const tried = logs.filter((l) => l[id]).length, solved = solvedSets.filter((s) => s.has(id)).length;
      const sl = logs.map((l) => l[id]).filter((r) => r && r.solved);
      const avgWrong = sl.length ? sl.reduce((s, r) => s + (r.wrong || 0), 0) / sl.length : null;
      const first = sl.length ? Math.round((sl.filter((r) => r.wrong === 0).length / sl.length) * 100) : null;
      return { id, stop: (stopOf(id) || {}).label || "", title: G.CATALOG[id], tried, solved, rate: ap.length ? Math.round((solved / ap.length) * 100) : 0, avgWrong, first };
    });
    if (stopFilter) rows = rows.filter((r) => r.stop === stopFilter);
    rows.sort((a, b) => (b.avgWrong || 0) - (a.avgWrong || 0) || a.rate - b.rate);
    return `<div class="adm-tools"><label>Show <select data-stop><option value="">all chapters and labs</option>${STOPS.map((s) => `<option${s.label === stopFilter ? " selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label><button type="button" class="btn ghost sm" data-csv="exercises">Download CSV</button><button type="button" class="btn ghost sm" data-reload>Refresh</button></div>
      <p class="small-note">Hardest first: the most wrong tries before solving, then the fewest solved. Go over the top few in class.</p>
      <div class="adm-scroll">${table(["Where", "Exercise", "Tried", "Solved", "% of class solved", "Average wrong tries", "Solved on first try"], rows.map((r) => [esc(r.stop), esc(r.title), r.tried, r.solved, `<span class="adm-pct"><i style="width:${r.rate}%"></i></span>${r.rate}%`, r.avgWrong === null ? "–" : r.avgWrong.toFixed(1), r.first === null ? "–" : `${r.first}%`]))}</div>`;
  }
  function board() {
    const list = approved().filter(matches).sort((a, b) => game[b.uid].xp - game[a.uid].xp);
    return `${tools(false, "board")}<div class="adm-scroll">${table(["#", "Student", "Level", "XP", "Badges", "Streak", "Solved", "Last active"], list.map((u, i) => { const g = game[u.uid]; return [i + 1, who(u), `L${g.levelNo} ${g.level}`, g.xp, `<span class="bd-bs">${g.badges.map((b) => `<span title="${esc(b.name)}">${b.icon}</span>`).join("")}</span>`, g.streak ? `${g.streak} wk` : "–", `${g.solved}/${g.total}`, fmt(lastOf(u))]; }))}</div>
      ${list.length ? "" : `<p class="adm-empty">No approved students yet.</p>`}`;
  }
  function people(pendingOnly) {
    const list = students().filter((u) => (pendingOnly ? u.status === "pending" : true)).filter(matches);
    if (!list.length) return `${pendingOnly ? "" : tools(false)}<p class="adm-empty">${pendingOnly ? "No one is waiting for approval." : "No students found."}</p>`;
    return `${pendingOnly ? "" : tools(false)}<div class="adm-scroll">${table(["Student", "Email", "Status", "Signed up", "Last active", ""], list.map((u) => [who(u), `<small>${esc(u.email)}</small>`, `<span class="adm-st ${u.status}">${esc(u.status)}</span>`, fmt(u.createdAt), fmt(lastOf(u)),
      `<div class="adm-acts">${u.status !== "approved" ? `<button class="btn sm" data-ok="${u.uid}">Approve</button>` : ""}${u.status !== "rejected" ? `<button class="btn ghost sm" data-no="${u.uid}">${u.status === "approved" ? "Remove access" : "Reject"}</button>` : ""}</div>`]))}</div>`;
  }
  const tools = (sortable, csv) => `<div class="adm-tools"><input type="search" placeholder="Search name, nickname or email" value="${esc(filter)}" aria-label="Search students" data-q>
      ${sortable ? `<label>Sort by <select data-sort><option value="name"${sortBy === "name" ? " selected" : ""}>nickname</option><option value="xp"${sortBy === "xp" ? " selected" : ""}>XP</option><option value="last"${sortBy === "last" ? " selected" : ""}>last active (oldest first)</option></select></label>` : ""}
      ${csv ? `<button type="button" class="btn ghost sm" data-csv="${csv}">Download CSV</button>` : ""}<button type="button" class="btn ghost sm" data-reload>Refresh</button></div>`;

  /* ---------- one student in detail ---------- */
  function detail(uid) {
    const u = users.find((x) => x.uid === uid), g = game[uid], k = (progress[uid] && progress[uid].keys) || {};
    if (!u) return;
    const log = parse(k["nmk-ex-log"], {}), solved = new Set(parse(k["nmk-solved"], [])), mc = parse(k["nmk-lab2-mc"], null), cal = parse(k["nmk-lab2-cal"], {}), seen3 = parse(k["nmk-lab3-seen"], {});
    const exRows = STOPS.map((s) => {
      if (!s.ids.length) return "";
      return `<tr class="dt-stop"><th colspan="7">${esc(s.label)}: ${esc(s.title)} <span>${(() => { const st = g.stops.find((x) => x.key === s.key) || {}; return `${st.done || 0} of ${st.total || s.ids.length}`; })()}</span></th></tr>` + s.ids.map((id) => {
        const r = log[id], ok = solved.has(id);
        return `<tr><td>${esc(G.CATALOG[id])}</td><td>${ok ? "✓ solved" : r ? "tried" : "–"}</td><td>${r ? r.checks : ""}</td><td>${r ? r.wrong : ""}</td><td>${r && r.solved ? (r.wrong === 0 ? "yes" : "no") : ""}</td><td><small>${r && r.last ? esc(r.last.join(" | ")) : ""}</small></td><td>${r ? fmt(r.solvedAt || r.at) : ""}</td></tr>`;
      }).join("");
    }).join("");
    const pre = G.STOPS.filter((s) => s.kind === "lab" && s.built).map((s) => { const p = parse(k[`nmk-lab${s.no}-prelab`], null); return `<li>Lab ${s.no} Pre-Lab Check: ${p ? `${p.score}/10 on ${esc(p.date)}${p.first ? " (first attempt)" : ""}` : "not passed yet"}</li>`; }).join("");
    const back = document.createElement("div");
    back.className = "acc-back";
    back.innerHTML = `<div class="acc-modal wide" role="dialog" aria-modal="true" aria-label="${esc(u.name)}">
        <h2>${esc(u.nickname)} <small>${esc(u.name)} · ${esc(u.email)}</small></h2>
        <p><span class="adm-st ${u.status}">${esc(u.status)}</span> · signed up ${fmt(u.createdAt)} · last active ${fmt(lastOf(u))}</p>
        ${G.xpBar(g)}
        <div class="gm-badges">${g.badges.length ? g.badges.map((b) => `<span class="gm-b" title="${esc(b.desc)}"><span aria-hidden="true">${b.icon}</span>${esc(b.name)}</span>`).join("") : `<span class="gm-none">No badges yet.</span>`}</div>
        <p class="gm-meta">${g.solved} of ${g.total} exercises solved · streak ${g.streak} week${g.streak === 1 ? "" : "s"} · active in weeks ${g.weeks.join(", ") || "none"}</p>
        <h3 class="bd-h">Labs</h3><ul class="dt-list">${pre}
          <li>Lab 2 Table 1: ${Object.keys(cal).length} of 19 rows${mc ? ` · equation Angle = ${(+mc.m).toPrecision(5)} × ADC ${mc.c < 0 ? "−" : "+"} ${Math.abs(mc.c).toPrecision(4)}` : " · no equation yet"}</li>
          <li>Lab 3 cards read with the RC522: ${["cardr", "fobr", "tagr"].filter((x) => seen3[x]).length} of 3 · programs merged: ${parse(k["nmk-lab3-merge"], false) ? "yes" : "no"}</li></ul>
        <h3 class="bd-h">Exercises</h3>
        <div class="adm-scroll"><table class="adm dt">${`<thead><tr><th>Exercise</th><th>Status</th><th>Checks</th><th>Wrong</th><th>First try</th><th>Last answers</th><th>When</th></tr></thead>`}<tbody>${exRows}</tbody></table></div>
        <h3 class="bd-h">Where the XP Came From</h3><ul class="dt-list">${g.items.map((i) => `<li>+${i.xp} ${esc(i.what)}</li>`).join("") || "<li>Nothing yet.</li>"}</ul>
        <div class="acc-row"><button type="button" class="btn" data-close>Close</button></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector("[data-close]").onclick = close; back.querySelector("[data-close]").focus();
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", function esc_(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc_); } });
  }

  /* ---------- Missions: release the game to students, and upload each world's mission file ----------
     The file (kept in _source/Missions/, never published) returns { world, chapter, title, missions }. It is stored in
     Firestore missions/world{N}; the rules let only lecturers, or students after release, read it. */
  let ms = null, msMsg = "";
  async function loadMissions() {
    try {
      const [m, q] = await Promise.all([db.collection("meta").doc("missions").get(), db.collection("missions").get()]);
      ms = { released: !!(m.exists && m.data().released), at: m.exists ? m.data().updatedAt : null,
        worlds: q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.world - b.world) };
    } catch (e) { ms = { err: e.code || String(e) }; }
    if (tab === "missions") draw();
  }
  function missionsTab() {
    if (!ms) { loadMissions(); return `<p class="small-note">Loading…</p>`; }
    if (ms.err) return `<div class="callout warn"><strong>Could not load the missions</strong>${esc(ms.err)}. If this says permission-denied, publish the latest firebase/firestore.rules in the Firebase console.</div>`;
    const played = approved().filter((u) => Object.keys(parse(((progress[u.uid] || {}).keys || {})["nmk-missions"], {})).length).length;
    return `<div class="adm-sum"><div><strong>${ms.released ? "On" : "Off"}</strong><span>released to students</span></div><div><strong>${ms.worlds.length}</strong><span>stations uploaded</span></div><div><strong>${played}</strong><span>students have played</span></div></div>
      <div class="ms-adm"><label class="ms-rel"><input type="checkbox" data-mrel${ms.released ? " checked" : ""}> <span><strong>Release INSTRUMENTA: Legends (Missions) to students</strong><br><small>Off: only lecturers can open the Missions page (to test). On: signed-in, approved students can play, and Missions appears in their account menu. Each chapter still opens in the week it is lectured. Upload one file per chapter (three stations each; the third is the boss).</small></span></label>
        <p class="ms-amsg small-note" aria-live="polite">${esc(msMsg)}</p>
        <h3 class="h3">Stations</h3>
        ${ms.worlds.length ? `<div class="adm-scroll"><table class="adm"><thead><tr><th>Station</th><th>Chapter</th><th>Missions</th><th>Uploaded</th></tr></thead><tbody>${ms.worlds.map((w) => `<tr><td>${esc(w.title || w.id)}</td><td>${w.chapter || ""}</td><td>${w.count || ""}</td><td>${fmt(w.updatedAt && w.updatedAt.toDate ? w.updatedAt.toDate().toISOString() : null)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="adm-empty">No stations uploaded yet.</p>`}
        <p><label class="btn ghost">Upload a mission file (.js)<input type="file" accept=".js,text/javascript" data-mup hidden></label> <a class="btn ghost" href="missions.html">Open INSTRUMENTA ›</a></p>
        <p class="small-note">Uploading a station again replaces it. Students keep their coins and stars.</p></div>`;
  }
  async function uploadMissions(file) {
    const say = (t) => { msMsg = t; const m = host.querySelector(".ms-amsg"); if (m) m.textContent = t; };
    try {
      const code = await file.text();
      const w = new Function(code)();   // check the file before saving it: it must give a world with missions
      if (!w || !Number.isInteger(w.world) || !Array.isArray(w.missions) || !w.missions.length) throw new Error("This file doesn't describe a station (world, missions).");
      w.missions.forEach((m) => { const v = m.make(Math.random); m.steps.forEach((s) => { if (!s.choice && !isFinite(s.ans(v))) throw new Error(`${m.title}: "${typeof s.q === "function" ? s.q(v) : s.q}" gives no number.`); }); });
      await db.collection("missions").doc(`world${w.world}`).set({ world: w.world, chapter: w.chapter || w.world, title: w.title || `Station ${w.world}`, count: w.missions.length, code,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), by: A.state.user.email.toLowerCase() });
      ms = null; loadMissions();
      say(`Uploaded ${w.title || `Station ${w.world}`}: ${w.missions.length} missions.`);
    } catch (e) { say(`Could not upload: ${e.code || e.message || e}`); }
  }

  /* ---------- page frame ---------- */
  const TABS = [["overview", "Overview"], ["heatmap", "Class Heatmap"], ["exercises", "Exercise Difficulty"], ["board", "Board"], ["pending", "Waiting for Approval"], ["students", "All Students"], ["missions", "Missions"]];
  function draw() {
    const sems = [...new Set(users.map((u) => u.semester || G.SEM).concat(G.SEM))].sort();
    const pending = students().filter((u) => u.status === "pending").length;
    const view = tab === "overview" ? overview() : tab === "heatmap" ? heatmap() : tab === "exercises" ? difficulty() : tab === "board" ? board() : tab === "missions" ? missionsTab() : people(tab === "pending");
    host.innerHTML = `<div class="adm-top"><div class="adm-tabs" role="group" aria-label="Dashboard view">${TABS.map(([v, l]) => `<button type="button" class="chip-btn" data-tab="${v}" aria-pressed="${tab === v}">${l}${v === "pending" && pending ? ` (${pending})` : ""}</button>`).join("")}</div>
        ${sems.length > 1 ? `<label class="adm-sem">Semester <select data-sem>${sems.map((s) => `<option${s === sem ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>` : `<span class="adm-sem">${esc(sem)}</span>`}<a class="btn ghost small" href="evidence.html">Teaching Evidence ›</a><a class="btn ghost small" href="attendance.html">Attendance ›</a></div>${view}`;
    const s = host.querySelector("[data-q]");
    if (s && typing) { s.focus(); s.setSelectionRange(filter.length, filter.length); }
    typing = false;
  }

  function csv(kind) {
    let head, lines;
    if (kind === "exercises") {
      const ap = approved(), logs = ap.map((u) => parse(((progress[u.uid] || {}).keys || {})["nmk-ex-log"], {})), sets = ap.map((u) => new Set(parse(((progress[u.uid] || {}).keys || {})["nmk-solved"], [])));
      head = ["Where", "Exercise", "Tried", "Solved", "Average wrong tries"];
      lines = Object.keys(G.CATALOG).map((id) => { const sl = logs.map((l) => l[id]).filter((r) => r && r.solved); return [(stopOf(id) || {}).label || "", G.CATALOG[id], logs.filter((l) => l[id]).length, sets.filter((x) => x.has(id)).length, sl.length ? (sl.reduce((a, r) => a + (r.wrong || 0), 0) / sl.length).toFixed(1) : ""]; });
    } else {
      head = ["Name", "Email", "Nickname", "Level", "XP", "Badges", "Streak (weeks)", "Exercises solved", ...STOPS.map((s) => s.label), "Last active"];
      lines = approved().sort((a, b) => game[b.uid].xp - game[a.uid].xp).map((u) => { const g = game[u.uid]; return [u.name, u.email, u.nickname, g.level, g.xp, g.badges.map((b) => b.name).join("; "), g.streak, g.solved, ...STOPS.map((s) => { const x = g.stops.find((y) => y.key === s.key); return `${x.done}/${x.total}`; }), fmt(lastOf(u))]; });
    }
    const text = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = `nmk42003-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // Back returns to the dashboard view before (and a view survives a visit to a profile)
  if (window.NMKBack) {
    if (history.state && history.state.view && history.state.tab) tab = history.state.tab;
    NMKBack.view({ tab }, true);
    NMKBack.onView((st) => { tab = st.tab || "overview"; draw(); });
  }

  host.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; if (window.NMKBack) NMKBack.view({ tab }); draw(); }
    else if (b.dataset.detail) location.href = `profile.html?u=${encodeURIComponent(b.dataset.detail)}`;
    else if (b.dataset.ok) setStatus(b.dataset.ok, "approved");
    else if (b.dataset.no && confirm("Remove this student's access?")) setStatus(b.dataset.no, "rejected");
    else if (b.dataset.csv) csv(b.dataset.csv);
    else if (b.hasAttribute("data-reload")) load();
  });
  let typing = false;
  host.addEventListener("input", (e) => { if (e.target.matches("[data-q]")) { filter = e.target.value; typing = true; draw(); } });
  host.addEventListener("change", (e) => {
    if (e.target.matches("[data-sort]")) { sortBy = e.target.value; draw(); }
    if (e.target.matches("[data-sem]")) { sem = e.target.value; draw(); }
    if (e.target.matches("[data-stop]")) { stopFilter = e.target.value; draw(); }
    if (e.target.matches("[data-mup]") && e.target.files[0]) uploadMissions(e.target.files[0]);
    if (e.target.matches("[data-mrel]")) {
      const on = e.target.checked;
      db.collection("meta").doc("missions").set({ released: on, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), by: A.state.user.email.toLowerCase() }, { merge: true })
        .then(() => { ms.released = on; msMsg = on ? "Released: students can now play Missions." : "Missions are hidden from students again."; draw(); })
        .catch((ex) => { e.target.checked = !on; const m = host.querySelector(".ms-amsg"); if (m) m.textContent = `Could not save (${ex.code || ex}). If this says permission-denied, publish the latest firebase/firestore.rules.`; });
    }
  });

  A.on((st) => {
    if (!st.user) { host.innerHTML = `<div class="adm-gate"><p>This page is for the course lecturers. Sign in with your UniMAP lecturer account to approve students and see their progress.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`; const b = host.querySelector("[data-signin]"); if (b) b.onclick = A.signIn; return; }
    if (!A.isAdmin(st.user.email)) { host.innerHTML = `<div class="callout warn"><strong>Lecturers only</strong>You are signed in as ${esc(st.user.email)}, which is not a lecturer account.</div>`; return; }
    load();
  });
})();
