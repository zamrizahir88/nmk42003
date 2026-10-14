/* NMK42003 class attendance (attendance.html), in the style of the URLearn (Moodle) Attendance activity.
   Students: mark their own attendance for an open session with the security key shown in class (typed, or by
   scanning the QR code), and see their own record. Lecturers: the class list, sessions (lectures and labs),
   opening a session with a key that changes every 3 minutes (or a fixed key), taking attendance by hand
   (Present, Late, Excused, Absent, with a remark), closing a session, and the report with a CSV export.
   The Firestore rules (firebase/firestore.rules) enforce who may read and write each record.
   Firestore: roster/{studentmail}, sessions/{id}, sessionKeys/{id}, attendance/{sessionId_studentmail}. */
(function () {
  "use strict";
  const host = document.getElementById("att");
  if (!host) return;
  if (!window.NMKAccount || !window.firebase) { host.innerHTML = `<p class="small-note">Attendance needs the sign-in service, which could not load. Check your connection and reload the page.</p>`; return; }
  const A = window.NMKAccount, db = A.db, FV = firebase.firestore.FieldValue, SEM = A.SEM;
  const $ = (s, r = host) => r.querySelector(s), $$ = (s, r = host) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);

  /* ---------- course facts ---------- */
  const SECTION = { all: "All students", mon: "Monday lab", wed: "Wednesday lab", thu: "Thursday lab" };
  const SECTION_TIME = { mon: "Monday, 1 PM to 4 PM", wed: "Wednesday, 12 PM to 3 PM", thu: "Thursday, 9 AM to 12 PM" };
  const ST = { P: "Present", L: "Late", E: "Excused", A: "Absent" };
  const POINTS = { P: 2, L: 1, E: 1, A: 0 };
  const LAB_VENUE = "TVET MI01 (Makmal Industri UniMAP - Tessolve)";
  const ROTATE_MS = 3 * 60 * 1000;
  const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I: easy to read from a screen
  const newKey = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return [...a].map((n) => KEY_CHARS[n % KEY_CHARS.length]).join(""); };
  const semSlug = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  /* ---------- dates in Malaysia time ---------- */
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const todayIso = () => { const q = params.get("today"); return q || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00Z"); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
  const weekOfDate = (iso) => Math.floor((new Date(iso + "T00:00:00Z") - new Date(COURSE.semesterStart + "T00:00:00Z")) / (7 * 86400000)) + 1;
  const tsMs = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
  const fmtStamp = (t) => { const ms = tsMs(t); if (!ms) return ""; const d = new Date(ms + 8 * 3600000); return `${fmtDate(d.toISOString().slice(0, 10))}, ${fmtTime(d.toISOString().slice(11, 16))}`; };

  /* ---------- a small dialog (the account styles) ---------- */
  let back = null;
  function dialog(html, wide) {
    closeDialog();
    back = document.createElement("div");
    back.className = "acc-back";
    back.innerHTML = `<div class="acc-modal${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-x]")) closeDialog(); });
    const f = back.querySelector("input, select, button");
    if (f) f.focus();
    return back.firstElementChild;
  }
  function closeDialog() { if (back) { back.remove(); back = null; } }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && back) closeDialog(); });
  const say = (title, text) => dialog(`<h2>${title}</h2><p>${text}</p><div class="acc-row"><button type="button" class="btn" data-x>OK</button></div>`);
  const sessionLine = (s) => `${fmtDate(s.date)}, ${fmtTime(s.start)} to ${fmtTime(s.end)}${s.venue ? ` · ${esc(s.venue)}` : ""}`;
  const chip = (st) => `<span class="at-st ${st ? st.toLowerCase() : "none"}">${st ? ST[st] : "Not marked"}</span>`;

  // the lecturer's view: what is loaded and what is shown
  const L = { sessions: [], roster: [], att: [], tab: "sessions", sid: null, keys: {}, filter: "all", rsec: "all", rkind: "all", q: "", watched: new Set() };

  /* ---------- who is here ---------- */
  let who = "";
  // start once this whole script has run (the account service may call back straight away)
  queueMicrotask(() => A.on((st) => {
    if (!st.ready) return;
    const key = !st.user ? "out" : `${st.user.uid}:${A.isAdmin(st.user.email) ? "lec" : "stu"}:${st.profile ? st.profile.status : ""}`;
    if (key === who) return;
    who = key;
    stopAll();
    if (!st.user) return signedOut();
    if (A.isAdmin(st.user.email)) return params.get("show") ? projector(params.get("show")) : lecturer();
    student(st.user.email.toLowerCase());
  }));
  const unsubs = [];
  let timers = [];
  function stopAll() { unsubs.splice(0).forEach((u) => u()); timers.forEach(clearInterval); timers = []; L.watched = new Set(); }

  function signedOut() {
    host.innerHTML = `<div class="at-card"><h2>Sign In to Mark Your Attendance</h2>
      <p>Sign in with your <strong>@studentmail.unimap.edu.my</strong> Google account. If you scanned the QR code in class, you come straight back here and your attendance is marked.</p>
      <button type="button" class="btn" data-signin>Sign in with Google</button></div>`;
    $("[data-signin]").addEventListener("click", () => A.signIn());
  }

  /* =====================================================================
     STUDENTS
     ===================================================================== */
  function student(email) {
    host.innerHTML = `<h2 class="h3">Mark Your Attendance</h2><div class="at-open" aria-live="polite"><p class="small-note">Looking for open sessions…</p></div>
      <h2 class="h3 at-gap">My Attendance</h2><div class="at-mine"><p class="small-note">Loading…</p></div>`;
    const openEl = $(".at-open"), mineEl = $(".at-mine");
    let me = null, open = [], recs = {}, tried = false;

    db.collection("roster").doc(email).get().then((r) => {
      me = r.exists ? r.data() : null;
      if (!me || me.status !== "active") {
        openEl.innerHTML = `<div class="at-card warn"><strong>You are not on the NMK42003 class list.</strong><p>You signed in as ${esc(email)}. If you take this course, please tell your lecturer so they can add you.</p></div>`;
      }
      paintOpen();
    }).catch(() => { openEl.innerHTML = `<p class="small-note">Could not load the class list. Reload the page to try again.</p>`; });

    unsubs.push(db.collection("sessions").where("state", "==", "open").onSnapshot((q) => {
      open = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((s) => s.semester === SEM);
      paintOpen();
    }, () => { openEl.innerHTML = `<p class="small-note">Could not check for open sessions. Reload the page to try again.</p>`; }));
    unsubs.push(db.collection("attendance").where("email", "==", email).onSnapshot((q) => {
      recs = {};
      q.docs.forEach((d) => { const x = d.data(); if (!x.semester || x.semester === SEM) recs[x.session] = x; });
      paintOpen(); paintMine();
    }, () => { mineEl.innerHTML = `<p class="small-note">Could not load your records. Reload the page to try again.</p>`; }));

    function paintOpen() {
      if (!me || me.status !== "active") return;
      const mine = open.filter((s) => s.section === "all" || s.section === me.section);
      if (!mine.length) {
        openEl.innerHTML = `<div class="at-card"><p><strong>No attendance is open for you right now.</strong> When your lecturer opens it in class, a key appears on the screen. Come back here, or scan the QR code.</p><p class="small-note">Your lab section: ${me.section ? `${SECTION[me.section]} (${SECTION_TIME[me.section]}), group ${me.group || "–"}` : "not set yet"}.</p></div>`;
        return;
      }
      openEl.innerHTML = mine.map((s) => {
        const r = recs[s.id];
        return `<div class="at-card open" data-s="${s.id}"><div class="at-head"><strong>${esc(s.title)}</strong>${r ? chip(r.status) : `<span class="at-live">Open now</span>`}</div>
          <p class="small-note">${sessionLine(s)}</p>
          ${r ? `<p class="at-done">✓ Your attendance is recorded: <strong>${ST[r.status]}</strong>${r.at ? `, ${fmtStamp(r.at)}` : ""}.</p>`
            : `<form class="at-form" novalidate><label for="k-${s.id}">Security key <span>6 letters and numbers, shown on the screen in class</span></label>
              <div class="at-row"><input id="k-${s.id}" class="at-key" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="e.g. K7P2QX">
              <button type="submit" class="btn">Mark my attendance</button></div><p class="at-err" aria-live="polite"></p></form>`}</div>`;
      }).join("");
      // from the QR code: the key is in the link, so mark it straight away (once)
      const qs = params.get("s"), qk = params.get("k");
      if (!tried && qs && qk && mine.some((s) => s.id === qs) && !recs[qs]) {
        tried = true;
        const f = $(`[data-s="${qs}"] .at-form`);
        if (f) { $(".at-key", f).value = qk.toUpperCase(); mark(qs, f); }
      }
    }
    openEl.addEventListener("submit", (e) => { const f = e.target.closest(".at-form"); if (!f) return; e.preventDefault(); mark(f.closest("[data-s]").dataset.s, f); });
    openEl.addEventListener("input", (e) => { if (e.target.matches(".at-key")) e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });

    async function mark(sid, f) {
      const s = open.find((x) => x.id === sid), key = $(".at-key", f).value.trim().toUpperCase(), err = $(".at-err", f), b = $("button", f);
      if (!/^[A-Z0-9]{6}$/.test(key)) { err.textContent = "Type the 6-character key shown on the screen."; return; }
      b.disabled = true; err.textContent = "Saving…";
      const late = s.lateAfter > 0 && Date.now() > tsMs(s.openedAt) + s.lateAfter * 60000;
      const rec = (status) => ({ session: sid, email, status, by: "self", at: FV.serverTimestamp(), key, semester: s.semester, kind: s.kind, date: s.date, title: s.title });
      try { await db.collection("attendance").doc(`${sid}_${email}`).set(rec(late ? "L" : "P")); }
      catch (e1) {
        // the Late time may differ by a few seconds between this phone and Google's clock: try the other status once
        try { await db.collection("attendance").doc(`${sid}_${email}`).set(rec(late ? "P" : "L")); }
        catch (e2) {
          b.disabled = false;
          err.innerHTML = e2.code === "permission-denied" ? `That key didn't work. Check the key on the screen (it changes every few minutes) and try again.` : `Could not save (${esc(e2.code || e2)}). Check your connection and try again.`;
          return;
        }
      }
      if (A.loadAttendance) A.loadAttendance();
    }

    function paintMine() {
      const list = Object.values(recs).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      if (!list.length) { mineEl.innerHTML = `<p class="small-note">No attendance recorded yet this semester.</p>`; return; }
      const block = (kind, label) => {
        const l = list.filter((r) => r.kind === kind);
        if (!l.length) return "";
        const n = { P: 0, L: 0, E: 0, A: 0 }; l.forEach((r) => n[r.status]++);
        const pct = Math.round((l.reduce((s, r) => s + POINTS[r.status], 0) / (2 * l.length)) * 100);
        return `<div class="at-sum"><h3>${label}</h3><div class="at-nums"><span><strong>${pct}%</strong> attendance</span><span>${n.P} present</span><span>${n.L} late</span><span>${n.E} excused</span><span class="${n.A ? "warn" : ""}">${n.A} absent</span></div>
          <div class="adm-scroll"><table class="adm"><thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col">Status</th><th scope="col">Remark</th></tr></thead>
          <tbody>${l.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.title)}</td><td>${chip(r.status)}</td><td>${esc(r.remark || "")}</td></tr>`).join("")}</tbody></table></div></div>`;
      };
      mineEl.innerHTML = block("lecture", "Lectures") + block("lab", "Labs") + `<p class="small-note">Present counts 2 points, Late and Excused 1, Absent 0. Each session you attend also earns 10 XP and helps you collect attendance badges.</p>`;
    }
  }

  /* =====================================================================
     LECTURERS
     ===================================================================== */
  function lecturer() {
    host.innerHTML = `<div class="at-tabs adm-tabs" role="group" aria-label="Attendance view"></div><div class="at-body"></div>`;
    const load = (name, q, map) => unsubs.push(q.onSnapshot((s) => { L[name] = s.docs.map(map); draw(); }, (e) => { console.warn("NMK attendance:", name, e.code || e); $(".at-body").innerHTML = `<p class="small-note">Could not load ${name} (${esc(e.code || e)}). If this says permission-denied, publish the latest firebase/firestore.rules in the Firebase console.</p>`; }));
    load("sessions", db.collection("sessions").where("semester", "==", SEM), (d) => Object.assign({ id: d.id }, d.data()));
    load("roster", db.collection("roster"), (d) => Object.assign({ id: d.id }, d.data()));
    load("att", db.collection("attendance").where("semester", "==", SEM), (d) => Object.assign({ id: d.id }, d.data()));
    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    host.addEventListener("focusout", () => setTimeout(() => { if (L.pending) draw(); }, 50));
    host.addEventListener("input", (e) => { if (e.target.matches("[data-q]")) { L.q = e.target.value; L.typing = true; draw(); } });
    draw();
  }
  const sortedSessions = () => L.sessions.slice().sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  const studentsFor = (s) => L.roster.filter((r) => r.status === "active" && (s.section === "all" || r.section === s.section)).sort((a, b) => (a.section + String(a.group).padStart(2, "0") + a.name < b.section + String(b.group).padStart(2, "0") + b.name ? -1 : 1));
  const recOf = (sid, email) => L.att.find((x) => x.session === sid && x.email === email);
  const counts = (s) => { const n = { P: 0, L: 0, E: 0, A: 0 }; L.att.forEach((x) => { if (x.session === s.id && n[x.status] !== undefined) n[x.status]++; }); return n; };

  function draw() {
    const tabs = $(".at-tabs"), body = $(".at-body");
    if (!tabs || !body) return;
    // don't redraw under the lecturer's fingers while they type a remark or a group: redraw when they leave the box
    const ae = document.activeElement;
    if (ae && host.contains(ae) && ae.matches(".at-rm, .at-grp")) { L.pending = true; return; }
    L.pending = false;
    const T = [["sessions", "Sessions"], ["roster", `Class List (${L.roster.filter((r) => r.status === "active").length})`], ["report", "Report"]];
    tabs.innerHTML = T.map(([v, l]) => `<button type="button" class="chip-btn" data-tab="${v}" aria-pressed="${L.tab === v && !L.sid}">${l}</button>`).join("");
    if (L.sid) { const s = L.sessions.find((x) => x.id === L.sid); if (s) { drawSession(body, s); return; } L.sid = null; }
    if (L.tab === "sessions") drawSessions(body);
    else if (L.tab === "roster") drawRoster(body);
    else drawReport(body);
    if (L.typing) { const q = $("[data-q]"); if (q) { q.focus(); q.setSelectionRange(L.q.length, L.q.length); } L.typing = false; }
  }

  /* ---------- the sessions list ---------- */
  function drawSessions(body) {
    const list = sortedSessions().filter((s) => L.filter === "all" || s.kind === L.filter);
    const t = todayIso();
    body.innerHTML = `<div class="adm-tools"><button type="button" class="btn" data-new>+ New session</button><button type="button" class="btn ghost" data-bulk>Create the semester's sessions</button>
        ${["all", "lecture", "lab"].map((f) => `<button type="button" class="chip-btn" data-filter="${f}" aria-pressed="${L.filter === f}">${{ all: "All", lecture: "Lectures", lab: "Labs" }[f]}</button>`).join("")}</div>
      ${!list.length ? `<p class="adm-empty">No sessions yet. Press <strong>Create the semester's sessions</strong> to add every lecture and lab from the course timetable, or add one with <strong>+ New session</strong>.</p>` :
      `<div class="adm-scroll"><table class="adm at-ses"><thead><tr><th scope="col">Week</th><th scope="col">Date</th><th scope="col">Session</th><th scope="col">For</th><th scope="col">State</th><th scope="col">P / L / E / A</th><th scope="col"><span class="vh">Manage</span></th></tr></thead><tbody>
      ${list.map((s) => { const n = counts(s); return `<tr class="${s.date === t ? "today" : ""}"><td>${s.week || weekOfDate(s.date)}</td><td>${fmtDate(s.date)}<br><small>${fmtTime(s.start)} to ${fmtTime(s.end)}</small></td>
        <td><strong>${esc(s.title)}</strong>${s.venue ? `<br><small>${esc(s.venue)}</small>` : ""}</td><td>${SECTION[s.section] || s.section}</td>
        <td><span class="at-state ${s.state}">${{ planned: "Not opened", open: "Open", closed: "Closed" }[s.state] || s.state}</span></td>
        <td class="at-n">${s.state === "planned" ? "–" : `${n.P} / ${n.L} / ${n.E} / ${n.A}`}</td><td><button type="button" class="btn small${s.state === "open" ? "" : " ghost"}" data-sid="${s.id}">${s.state === "open" ? "Open ›" : "Manage"}</button></td></tr>`; }).join("")}
      </tbody></table></div>`}`;
  }

  // every lecture and lab of the semester, from the weekly plan in data.js (ids are fixed, so nothing is made twice)
  function semesterPlan() {
    const out = [], dayOff = { mon: 0, wed: 2, thu: 3 }, labTime = { mon: ["13:00", "16:00"], wed: ["12:00", "15:00"], thu: ["09:00", "12:00"] };
    COURSE.weeks.forEach((w) => {
      const monday = addDays(COURSE.semesterStart, 7 * (w.w - 1)), wk = String(w.w).padStart(2, "0");
      if ((w.activities || []).includes("Lecture")) {
        out.push({ id: `${semSlug}-w${wk}-lecture`, kind: "lecture", section: "all", title: `Lecture, week ${w.w}: ${w.topic}`, date: addDays(monday, 3), start: "14:00", end: "16:00",
          venue: (w.notes || []).includes("Online lecture") ? "Online" : "", week: w.w });
      }
      (w.activities || []).filter((a) => /^Lab \d/.test(a)).forEach((a) => {
        ["mon", "wed", "thu"].forEach((sec) => out.push({ id: `${semSlug}-w${wk}-lab-${sec}`, kind: "lab", section: sec, title: `${a}, ${SECTION[sec].replace(" lab", "")} section`, date: addDays(monday, dayOff[sec]),
          start: labTime[sec][0], end: labTime[sec][1], venue: LAB_VENUE, week: w.w }));
      });
    });
    return out;
  }

  function sessionForm(s) {
    const isNew = !s;
    s = s || { kind: "lecture", section: "all", title: "", date: todayIso(), start: "14:00", end: "16:00", venue: "", lateAfter: 0 };
    const d = dialog(`<h2>${isNew ? "New Session" : "Edit Session"}</h2><form class="at-dform" novalidate>
      <label>Title<input name="title" value="${esc(s.title)}" required placeholder="e.g. Lecture, week 3: Embedded Controller"></label>
      <div class="at-two"><label>Type<select name="kind"><option value="lecture"${s.kind === "lecture" ? " selected" : ""}>Lecture</option><option value="lab"${s.kind === "lab" ? " selected" : ""}>Lab</option></select></label>
      <label>For<select name="section">${Object.entries(SECTION).map(([v, l]) => `<option value="${v}"${s.section === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="at-three"><label>Date<input type="date" name="date" value="${esc(s.date)}" required></label><label>Start<input type="time" name="start" value="${esc(s.start)}" required></label><label>End<input type="time" name="end" value="${esc(s.end)}" required></label></div>
      <label>Venue<input name="venue" value="${esc(s.venue || "")}" placeholder="e.g. ${esc(LAB_VENUE)}"></label>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">${isNew ? "Add session" : "Save"}</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, v = Object.fromEntries(new FormData(f).entries());
      if (!v.title.trim() || !v.date || !v.start || !v.end) { $(".at-err", d).textContent = "Fill in the title, date and times."; return; }
      if (v.end <= v.start) { $(".at-err", d).textContent = "The end time must be after the start time."; return; }
      const data = { title: v.title.trim(), kind: v.kind, section: v.section, date: v.date, start: v.start, end: v.end, venue: v.venue.trim(), week: weekOfDate(v.date), semester: SEM };
      try {
        if (isNew) await db.collection("sessions").add(Object.assign(data, { state: "planned", lateAfter: 0, createdAt: FV.serverTimestamp() }));
        else await db.collection("sessions").doc(s.id).update(data);
        closeDialog();
      } catch (ex) { $(".at-err", d).textContent = `Could not save (${ex.code || ex}).`; }
    });
  }

  async function bulkCreate() {
    const plan = semesterPlan(), have = new Set(L.sessions.map((s) => s.id)), add = plan.filter((p) => !have.has(p.id));
    const nl = add.filter((p) => p.kind === "lecture").length, nb = add.length - nl;
    if (!add.length) { say("Nothing to Add", "Every lecture and lab in the course timetable already has a session."); return; }
    const d = dialog(`<h2>Create the Semester's Sessions</h2><p>From the weekly plan: <strong>${nl} lecture${nl === 1 ? "" : "s"}</strong> (Thursday, 2 PM to 4 PM) and <strong>${nb} lab session${nb === 1 ? "" : "s"}</strong> (one for each section: Monday 1 to 4 PM, Wednesday 12 to 3 PM, Thursday 9 AM to 12 PM).</p>
      <p class="small-note">Sessions that already exist are left alone. You can edit or delete any session afterwards.</p><p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Create ${add.length} sessions</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", d).addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const b = db.batch();
        add.forEach((p) => { const { id, ...data } = p; b.set(db.collection("sessions").doc(id), Object.assign(data, { semester: SEM, state: "planned", lateAfter: 0, createdAt: FV.serverTimestamp() })); });
        await b.commit(); closeDialog();
      } catch (ex) { e.target.disabled = false; $(".at-err", d).textContent = `Could not create them (${ex.code || ex}).`; }
    });
  }

  /* ---------- one session: open it, show the key, take attendance by hand, close it ---------- */
  const qrBox = {};
  function keyWatch(sid, onKey) {
    // the key document, live; and while it is open, change the key every 3 minutes (in a transaction, so two lecturer tabs don't both change it)
    unsubs.push(db.collection("sessionKeys").doc(sid).onSnapshot((d) => { L.keys[sid] = d.exists ? d.data() : null; onKey(); }));
    const tick = async () => {
      const s = L.sessions.find((x) => x.id === sid), k = L.keys[sid];
      if (!s || s.state !== "open" || !k || k.mode !== "rotate" || Date.now() - tsMs(k.changedAt) < ROTATE_MS) { onKey(); return; }
      const ref = db.collection("sessionKeys").doc(sid);
      try {
        await db.runTransaction(async (tx) => {
          const cur = await tx.get(ref), v = cur.data();
          if (!v || Date.now() - tsMs(v.changedAt) < ROTATE_MS) return;
          tx.update(ref, { prev: v.cur, cur: newKey(), changedAt: firebase.firestore.Timestamp.now() });
        });
      } catch (e) { console.warn("NMK attendance: could not change the key", e.code || e); }
    };
    timers.push(setInterval(tick, 1000));
  }
  const keyUrl = (sid, key) => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}attendance.html?s=${encodeURIComponent(sid)}&k=${encodeURIComponent(key)}`;
  function paintKey(el, sid, big) {
    const k = L.keys[sid], s = L.sessions.find((x) => x.id === sid);
    if (!el) return;
    if (!s || s.state !== "open" || !k || !k.cur) { el.innerHTML = `<p class="small-note">The key appears here when attendance is open.</p>`; return; }
    const left = k.mode === "rotate" ? Math.max(0, ROTATE_MS - (Date.now() - tsMs(k.changedAt))) : 0;
    const keyEl = $(".at-keyval", el);
    if (!keyEl || keyEl.dataset.k !== k.cur) {
      el.innerHTML = `<div class="at-keybox${big ? " big" : ""}"><div class="at-qr" aria-hidden="true"></div><div><p class="at-kl">Security key</p><p class="at-keyval" data-k="${k.cur}">${k.cur.split("").map((c) => `<span>${c}</span>`).join("")}</p>
        <p class="at-kt"></p><p class="small-note">Scan the QR code with your phone camera, or open the course site, choose <strong>Attendance</strong> and type the key.</p></div></div>`;
      const q = $(".at-qr", el);
      if (window.QRCode) { try { new QRCode(q, { text: keyUrl(sid, k.cur), width: big ? 320 : 180, height: big ? 320 : 180, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { q.hidden = true; } }
      else q.hidden = true;
    }
    const kt = $(".at-kt", el);
    if (kt) kt.textContent = k.mode === "rotate" ? `New key in ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` : "This key stays the same until you close attendance.";
  }

  function drawSession(body, s) {
    const studs = studentsFor(s), n = counts(s), marked = studs.filter((r) => recOf(s.id, r.id)).length;
    const opts = s.state !== "open" ? `<div class="at-card"><h3>${s.state === "closed" ? "Open Attendance Again" : "Open Attendance"}</h3>
        <fieldset class="at-fs"><legend>Security key</legend>
          <label><input type="radio" name="mode" value="rotate" checked> Changes every 3 minutes (recommended)</label>
          <label><input type="radio" name="mode" value="fixed"> Fixed for the whole session</label></fieldset>
        <label class="at-late"><input type="checkbox" name="late"${s.lateAfter > 0 ? " checked" : ""}> Mark students <strong>Late</strong> automatically after <input type="number" name="lateMin" min="1" max="180" value="${s.lateAfter || 15}"> minutes</label>
        <p class="small-note">Leave this unticked to mark Late yourself in the list below.</p>
        <button type="button" class="btn" data-open>Open attendance</button></div>`
      : `<div class="at-card open"><div class="at-head"><h3>Attendance Is Open</h3><span class="at-count">${marked} of ${studs.length} marked</span></div><div class="at-keyarea"></div>
        <div class="acc-row"><a class="btn ghost" href="attendance.html?show=${encodeURIComponent(s.id)}" target="_blank" rel="noopener">Show on the projector ↗</a>
        <button type="button" class="btn" data-close>Close attendance…</button></div></div>`;
    body.innerHTML = `<p><button type="button" class="btn ghost small" data-back>‹ All sessions</button></p>
      <div class="at-shead"><div><h2 class="h3">${esc(s.title)}</h2><p class="small-note">${sessionLine(s)} · ${SECTION[s.section] || s.section} · week ${s.week || weekOfDate(s.date)}</p></div>
        <div class="acc-row"><button type="button" class="btn ghost small" data-edit>Edit</button><button type="button" class="btn ghost small" data-del>Delete</button></div></div>
      ${opts}
      <h3 class="at-gap">Take Attendance <small class="at-sub">${n.P} present · ${n.L} late · ${n.E} excused · ${n.A} absent · ${studs.length - marked} not marked</small></h3>
      <div class="adm-tools"><span>Set every unmarked student to</span>${["P", "L", "E", "A"].map((k) => `<button type="button" class="btn ghost small" data-all="${k}">${ST[k]}</button>`).join("")}</div>
      ${!studs.length ? `<p class="adm-empty">No students in this section. Load the class list first (Class List tab).</p>` :
      `<div class="adm-scroll"><table class="adm at-take"><thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">Group</th><th scope="col">Status</th><th scope="col">Remark</th><th scope="col">Marked</th></tr></thead><tbody>
      ${studs.map((r, i) => { const x = recOf(s.id, r.id); return `<tr data-em="${esc(r.id)}"><td>${i + 1}</td><td><strong>${esc(r.name)}</strong><br><small>${esc(r.matric)}</small></td><td>${s.section === "all" ? `${(r.section || "–").toUpperCase()} ` : ""}${r.group || "–"}</td>
        <td><div class="at-pick" role="group" aria-label="Status of ${esc(r.name)}">${["P", "L", "E", "A"].map((k) => `<button type="button" class="at-b ${k.toLowerCase()}" data-st="${k}" aria-pressed="${x && x.status === k}" title="${ST[k]}">${k}</button>`).join("")}</div></td>
        <td><input class="at-rm" value="${esc((x && x.remark) || "")}" placeholder="${x && x.status === "E" ? "Reason, e.g. MC" : ""}" aria-label="Remark for ${esc(r.name)}"></td>
        <td><small>${x ? `${x.by === "self" ? "Self" : x.by === "auto" ? "Auto (closed)" : "Lecturer"}${x.at ? `, ${fmtStamp(x.at)}` : ""}` : ""}</small></td></tr>`; }).join("")}</tbody></table></div>`}`;
    if (s.state === "open") {
      paintKey($(".at-keyarea"), s.id, false);
      // keep changing this session's key while this page is open, and draw it only while its own page is shown
      if (!L.watched.has(s.id)) { L.watched.add(s.id); keyWatch(s.id, () => { if (L.sid === s.id) paintKey($(".at-keyarea"), s.id, false); }); }
    }
  }

  async function openSession(s) {
    const mode = ($("input[name=mode]:checked") || {}).value || "rotate", late = $("input[name=late]").checked, lateMin = Math.max(1, Math.min(180, +$("input[name=lateMin]").value || 15));
    try {
      await db.collection("sessionKeys").doc(s.id).set({ cur: newKey(), prev: "", mode, changedAt: firebase.firestore.Timestamp.now() });
      await db.collection("sessions").doc(s.id).update({ state: "open", openedAt: FV.serverTimestamp(), lateAfter: late ? lateMin : 0, openedBy: A.state.user.email.toLowerCase() });
    } catch (ex) { say("Could Not Open Attendance", `${esc(ex.code || ex)}. If this says permission-denied, publish the latest firebase/firestore.rules in the Firebase console.`); }
  }
  function closeSession(s) {
    const studs = studentsFor(s), un = studs.filter((r) => !recOf(s.id, r.id));
    const d = dialog(`<h2>Close Attendance</h2><p>Students can no longer mark themselves. You can still change any mark by hand.</p>
      ${un.length ? `<label class="at-late"><input type="checkbox" checked data-abs> Mark the <strong>${un.length}</strong> student${un.length === 1 ? "" : "s"} not marked yet as <strong>Absent</strong></label>` : `<p><strong>Every student is marked.</strong></p>`}<p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Close attendance</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", d).addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const b = db.batch();
        if (un.length && $("[data-abs]", d).checked) un.forEach((r) => b.set(db.collection("attendance").doc(`${s.id}_${r.id}`), recBase(s, r.id, "A", "auto")));
        b.update(db.collection("sessions").doc(s.id), { state: "closed", closedAt: FV.serverTimestamp() });
        b.set(db.collection("sessionKeys").doc(s.id), { cur: "", prev: "", mode: "closed", changedAt: firebase.firestore.Timestamp.now() });
        await b.commit(); closeDialog();
      } catch (ex) { e.target.disabled = false; $(".at-err", d).textContent = `Could not close it (${ex.code || ex}).`; }
    });
  }
  const recBase = (s, email, status, by) => ({ session: s.id, email, status, by: by || A.state.user.email.toLowerCase(), at: FV.serverTimestamp(), semester: SEM, kind: s.kind, date: s.date, title: s.title });
  async function setMark(s, email, status) {
    const x = recOf(s.id, email);
    try { await db.collection("attendance").doc(`${s.id}_${email}`).set(Object.assign(recBase(s, email, status), { remark: (x && x.remark) || "" })); }
    catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
  }

  /* ---------- the class list ---------- */
  function drawRoster(body) {
    const q = L.q.trim().toLowerCase();
    const list = L.roster.filter((r) => (L.rsec === "all" || (L.rsec === "none" ? !r.section : r.section === L.rsec)) && (!q || `${r.name} ${r.matric} ${r.id} ${r.rps}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.status !== b.status ? (a.status === "active" ? -1 : 1) : (a.section || "z") + String(a.group).padStart(2, "0") + a.name < (b.section || "z") + String(b.group).padStart(2, "0") + b.name ? -1 : 1));
    const by = (sec) => L.roster.filter((r) => r.status === "active" && (sec === "none" ? !r.section : r.section === sec)).length;
    body.innerHTML = `<div class="adm-tools"><label class="btn ghost small at-file">Load a class list file…<input type="file" accept=".json,.xls,.html,.htm" data-file hidden></label><button type="button" class="btn ghost small" data-addstu>+ Add a student</button>
        <input type="search" data-q placeholder="Search name, matric, email or RPS" value="${esc(L.q)}" aria-label="Search the class list"></div>
      <div class="adm-tools">${[["all", `All (${L.roster.length})`], ["mon", `Monday (${by("mon")})`], ["wed", `Wednesday (${by("wed")})`], ["thu", `Thursday (${by("thu")})`], ["none", `No lab section (${by("none")})`]].map(([v, l]) => `<button type="button" class="chip-btn" data-rsec="${v}" aria-pressed="${L.rsec === v}">${l}</button>`).join("")}</div>
      ${!L.roster.length ? `<p class="adm-empty">The class list is empty. Press <strong>Load a class list file</strong> and choose <code>nmk42003-classlist.json</code> (in your <code>_source</code> folder), or the student list downloaded from URLearn (.xls). Phone numbers are never saved.</p>` :
      `<div class="adm-scroll"><table class="adm at-ros"><thead><tr><th scope="col">Student</th><th scope="col">Lab section</th><th scope="col">Group</th><th scope="col">RPS (student advisor)</th><th scope="col">Status</th><th scope="col"><span class="vh">Edit</span></th></tr></thead><tbody>
      ${list.map((r) => `<tr data-em="${esc(r.id)}" class="${r.status === "active" ? "" : "dropped"}"><td><strong>${esc(r.name)}</strong><br><small>${esc(r.matric)} · ${esc(r.id)}</small></td>
        <td><select data-f="section" aria-label="Lab section of ${esc(r.name)}"><option value=""${!r.section ? " selected" : ""}>None</option>${["mon", "wed", "thu"].map((v) => `<option value="${v}"${r.section === v ? " selected" : ""}>${SECTION[v].replace(" lab", "")}</option>`).join("")}</select></td>
        <td><input type="number" min="0" max="30" data-f="group" value="${r.group || ""}" aria-label="Lab group of ${esc(r.name)}" class="at-grp"></td>
        <td>${esc(r.rps || "–")}<br><small>${esc(r.rpsEmail || "")}</small></td>
        <td><select data-f="status" aria-label="Status of ${esc(r.name)}"><option value="active"${r.status === "active" ? " selected" : ""}>Active</option><option value="dropped"${r.status !== "active" ? " selected" : ""}>Dropped</option></select></td>
        <td><button type="button" class="btn ghost small" data-editstu="${esc(r.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div>`}`;
  }
  function studentForm(r) {
    const isNew = !r;
    r = r || { name: "", matric: "", id: "", section: "", group: "", rps: "", rpsEmail: "", status: "active" };
    const d = dialog(`<h2>${isNew ? "Add a Student" : "Edit Student"}</h2><form class="at-dform" novalidate>
      <label>Name<input name="name" value="${esc(r.name)}" required></label>
      <div class="at-two"><label>Matric number<input name="matric" value="${esc(r.matric)}" required></label><label>Studentmail address<input name="email" type="email" value="${esc(r.id)}"${isNew ? "" : " readonly"} required></label></div>
      <div class="at-two"><label>Lab section<select name="section"><option value="">None</option>${["mon", "wed", "thu"].map((v) => `<option value="${v}"${r.section === v ? " selected" : ""}>${SECTION[v]}</option>`).join("")}</select></label><label>Lab group<input name="group" type="number" min="0" max="30" value="${r.group || ""}"></label></div>
      <div class="at-two"><label>RPS name<input name="rps" value="${esc(r.rps || "")}"></label><label>RPS email<input name="rpsEmail" type="email" value="${esc(r.rpsEmail || "")}"></label></div>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">${isNew ? "Add" : "Save"}</button>${isNew ? "" : `<button type="button" class="btn ghost" data-remove>Remove from the list</button>`}<button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries()), em = v.email.trim().toLowerCase();
      if (!v.name.trim() || !v.matric.trim() || !/@studentmail\.unimap\.edu\.my$/.test(em)) { $(".at-err", d).textContent = "Fill in the name, matric number and a @studentmail.unimap.edu.my address."; return; }
      try {
        await db.collection("roster").doc(em).set({ name: v.name.trim().toUpperCase(), matric: v.matric.trim(), email: em, section: v.section, group: +v.group || 0, rps: v.rps.trim(), rpsEmail: v.rpsEmail.trim().toLowerCase(), status: r.status || "active", semester: SEM }, { merge: true });
        closeDialog();
      } catch (ex) { $(".at-err", d).textContent = `Could not save (${ex.code || ex}).`; }
    });
    const rm = $("[data-remove]", d);
    if (rm) rm.addEventListener("click", async () => {
      if (!confirm(`Remove ${r.name} from the class list? Their attendance records are kept. To keep them on the list but out of sessions, set them to Dropped instead.`)) return;
      try { await db.collection("roster").doc(r.id).delete(); closeDialog(); } catch (ex) { $(".at-err", d).textContent = `Could not remove (${ex.code || ex}).`; }
    });
  }
  // a class list file: our own .json (with lab sections), or URLearn's "List of Student by Course and RPS" (.xls, an HTML table)
  function readList(text) {
    try { const j = JSON.parse(text); if (j && Array.isArray(j.students)) return j.students; } catch (e) { /* not JSON */ }
    const doc = new DOMParser().parseFromString(text, "text/html"), out = [];
    const cells = [...doc.querySelectorAll("td")].map((c) => c.textContent.replace(/\s+/g, " ").trim());
    const heads = [...doc.querySelectorAll("th")].map((c) => c.textContent.trim().toLowerCase()), W = heads.length || 8;
    const col = (name) => heads.findIndex((h) => h.includes(name));
    const iN = col("name"), iM = col("matric"), iE = col("student email"), iR = col("rps name"), iRE = col("rps email"), iP = col("programme");
    for (let i = 0; i + W <= cells.length; i += W) {
      const row = cells.slice(i, i + W);
      out.push({ name: row[iN], matric: row[iM], email: (row[iE] || "").toLowerCase(), programme: row[iP] || "", rps: row[iR] || "", rpsEmail: (row[iRE] || "").toLowerCase(), status: "active" });
    }
    return out.filter((s) => s.name && /@studentmail\.unimap\.edu\.my$/.test(s.email || ""));
  }
  async function importList(file) {
    const list = readList(await file.text());
    if (!list.length) { say("Nothing Found", "That file has no students in it. Choose nmk42003-classlist.json or the student list from URLearn (.xls)."); return; }
    const have = Object.fromEntries(L.roster.map((r) => [r.id, r])), fresh = list.filter((s) => !have[s.email]).length;
    const d = dialog(`<h2>Load the Class List</h2><p><strong>${list.length} students</strong> in this file: ${fresh} new, ${list.length - fresh} already on the list (their names and RPS are updated${list.some((s) => s.section) ? ", and their lab section and group" : "; their lab section and group stay as they are"}).</p>
      <p class="small-note">Only the name, matric number, studentmail address, programme, lab section and group, and RPS are saved. Phone numbers are not.</p><p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Load ${list.length} students</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", d).addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        for (let i = 0; i < list.length; i += 400) {
          const b = db.batch();
          list.slice(i, i + 400).forEach((s) => {
            const keep = have[s.email], data = { name: s.name, matric: String(s.matric), email: s.email, programme: s.programme || "", rps: s.rps || "", rpsEmail: s.rpsEmail || "", semester: SEM };
            if (s.section !== undefined && (s.section || !keep)) { data.section = s.section || ""; data.group = +s.group || 0; }
            if (!keep) { data.status = s.status || "active"; if (data.section === undefined) { data.section = ""; data.group = 0; } }
            b.set(db.collection("roster").doc(s.email), data, { merge: true });
          });
          await b.commit();
        }
        closeDialog();
      } catch (ex) { e.target.disabled = false; $(".at-err", d).textContent = `Could not load it (${ex.code || ex}).`; }
    });
  }

  /* ---------- the report ---------- */
  function reportData() {
    const ses = sortedSessions().filter((s) => s.state !== "planned" && (L.rkind === "all" || s.kind === L.rkind) && (L.rsec === "all" || L.rsec === "none" || s.section === "all" || s.section === L.rsec));
    const studs = L.roster.filter((r) => r.status === "active" && (L.rsec === "all" || (L.rsec === "none" ? !r.section : r.section === L.rsec)))
      .sort((a, b) => ((a.section || "z") + a.name < (b.section || "z") + b.name ? -1 : 1));
    const rows = studs.map((r) => {
      const cells = ses.map((s) => (s.section === "all" || s.section === r.section ? (recOf(s.id, r.id) || {}).status || "" : null));
      const n = { P: 0, L: 0, E: 0, A: 0 }; cells.forEach((c) => { if (c) n[c]++; });
      const tot = n.P + n.L + n.E + n.A, pts = n.P * 2 + n.L + n.E;
      const abs = (kind) => ses.filter((s, i) => s.kind === kind && cells[i] === "A").length;
      return { r, cells, n, pct: tot ? Math.round((pts / (2 * tot)) * 100) : null, absL: abs("lecture"), absB: abs("lab") };
    });
    return { ses, rows };
  }
  function drawReport(body) {
    const { ses, rows } = reportData();
    const pcts = rows.map((x) => x.pct).filter((p) => p !== null), avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    const lvl = (n) => (n >= 3 ? "hi" : n ? "mid" : "");
    body.innerHTML = `<div class="adm-tools">${[["all", "All sections"], ["mon", "Monday"], ["wed", "Wednesday"], ["thu", "Thursday"]].map(([v, l]) => `<button type="button" class="chip-btn" data-rsec="${v}" aria-pressed="${L.rsec === v}">${l}</button>`).join("")}
        ${[["all", "Lectures and labs"], ["lecture", "Lectures"], ["lab", "Labs"]].map(([v, l]) => `<button type="button" class="chip-btn" data-rkind="${v}" aria-pressed="${L.rkind === v}">${l}</button>`).join("")}
        <button type="button" class="btn ghost small" data-csv>Download CSV</button></div>
      <div class="adm-sum"><div><strong>${ses.length}</strong><span>sessions held</span></div><div><strong>${avg === null ? "–" : avg + "%"}</strong><span>average attendance</span></div>
        <div class="warn"><strong>${rows.filter((x) => x.absL >= 3 || x.absB >= 3).length}</strong><span>with 3 or more absences (lectures or labs)</span></div></div>
      ${!rows.length ? `<p class="adm-empty">No students to show.</p>` : !ses.length ? `<p class="adm-empty">No sessions have been opened yet.</p>` :
      `<div class="adm-scroll"><table class="adm at-rep"><thead><tr><th scope="col">Student</th>${ses.map((s) => `<th scope="col" title="${esc(s.title)}, ${fmtDate(s.date)}">W${s.week || weekOfDate(s.date)}<br><small>${s.kind === "lab" ? `Lab ${s.section === "all" ? "" : s.section}` : "Lec"}</small></th>`).join("")}<th scope="col">%</th><th scope="col">Lecture absences</th><th scope="col">Lab absences</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td><strong>${esc(x.r.name)}</strong><br><small>${esc(x.r.matric)} · ${x.r.section ? SECTION[x.r.section].replace(" lab", "") : "no lab section"}</small></td>
        ${x.cells.map((c) => (c === null ? `<td class="at-c na"></td>` : `<td class="at-c ${c ? c.toLowerCase() : "none"}" title="${c ? ST[c] : "Not marked"}">${c || "·"}</td>`)).join("")}
        <td class="at-pct">${x.pct === null ? "–" : x.pct + "%"}</td><td class="at-abs ${lvl(x.absL)}">${x.absL}</td><td class="at-abs ${lvl(x.absB)}">${x.absB}</td></tr>`).join("")}</tbody></table></div>
      <p class="small-note">P present (2 points), L late (1), E excused (1), A absent (0). Absences count only Absent, never Excused. Amber: 1 or 2 absences; red: 3 or more.</p>`}`;
  }
  function csv() {
    const { ses, rows } = reportData(), q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const head = ["Name", "Matric", "Email", "Lab section", "Group", "RPS", "RPS email", ...ses.map((s) => `W${s.week || weekOfDate(s.date)} ${s.title} (${s.date})`), "Present", "Late", "Excused", "Absent", "Attendance %", "Lecture absences", "Lab absences"];
    const lines = [head.map(q).join(",")].concat(rows.map((x) => [x.r.name, x.r.matric, x.r.id, x.r.section ? SECTION[x.r.section] : "", x.r.group || "", x.r.rps || "", x.r.rpsEmail || "",
      ...x.cells.map((c) => (c === null ? "" : c || "")), x.n.P, x.n.L, x.n.E, x.n.A, x.pct === null ? "" : x.pct, x.absL, x.absB].map(q).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = `NMK42003-attendance-${todayIso()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- clicks and changes (lecturer) ---------- */
  function onClick(e) {
    const t = e.target, b = (s) => t.closest(s);
    if (b("[data-tab]")) { L.tab = b("[data-tab]").dataset.tab; L.sid = null; draw(); return; }
    if (b("[data-filter]")) { L.filter = b("[data-filter]").dataset.filter; draw(); return; }
    if (b("[data-rsec]")) { L.rsec = b("[data-rsec]").dataset.rsec; draw(); return; }
    if (b("[data-rkind]")) { L.rkind = b("[data-rkind]").dataset.rkind; draw(); return; }
    if (b("[data-new]")) return sessionForm(null);
    if (b("[data-bulk]")) return bulkCreate();
    if (b("[data-csv]")) return csv();
    if (b("[data-addstu]")) return studentForm(null);
    if (b("[data-editstu]")) return studentForm(L.roster.find((r) => r.id === b("[data-editstu]").dataset.editstu));
    if (b("[data-sid]")) { L.sid = b("[data-sid]").dataset.sid; draw(); window.scrollTo(0, 0); return; }
    if (b("[data-back]")) { L.sid = null; draw(); return; }
    const s = L.sessions.find((x) => x.id === L.sid);
    if (!s) return;
    if (b("[data-edit]")) return sessionForm(s);
    if (b("[data-del]")) {
      if (confirm(`Delete "${s.title}"? Its attendance records stay in the database but no longer appear in the report.`)) db.collection("sessions").doc(s.id).delete().then(() => { L.sid = null; draw(); }).catch((ex) => say("Could Not Delete", esc(ex.code || ex)));
      return;
    }
    if (b("[data-open]")) return openSession(s);
    if (b("[data-close]")) return closeSession(s);
    if (b("[data-all]")) {
      const st = b("[data-all]").dataset.all, un = studentsFor(s).filter((r) => !recOf(s.id, r.id));
      if (!un.length) return;
      const batch = db.batch();
      un.forEach((r) => batch.set(db.collection("attendance").doc(`${s.id}_${r.id}`), Object.assign(recBase(s, r.id, st), { remark: "" })));
      batch.commit().catch((ex) => say("Could Not Save", esc(ex.code || ex)));
      return;
    }
    if (b("[data-st]")) { const tr = t.closest("tr[data-em]"); setMark(s, tr.dataset.em, b("[data-st]").dataset.st); }
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches("[data-file]") && t.files[0]) { importList(t.files[0]); t.value = ""; return; }
    const tr = t.closest("tr[data-em]");
    if (!tr) return;
    const em = tr.dataset.em;
    if (t.matches("[data-f]")) {
      const v = t.dataset.f === "group" ? +t.value || 0 : t.value;
      db.collection("roster").doc(em).update({ [t.dataset.f]: v }).catch((ex) => say("Could Not Save", esc(ex.code || ex)));
      return;
    }
    if (t.matches(".at-rm")) {
      const s = L.sessions.find((x) => x.id === L.sid), x = s && recOf(s.id, em);
      if (!s) return;
      if (x) db.collection("attendance").doc(x.id).update({ remark: t.value.trim() }).catch((ex) => say("Could Not Save", esc(ex.code || ex)));
      else say("Mark the Status First", "Choose P, L, E or A for this student, then add the remark.");
    }
  }

  /* =====================================================================
     THE PROJECTOR SCREEN (attendance.html?show=<session id>, lecturers only)
     ===================================================================== */
  function projector(sid) {
    document.body.classList.add("at-show");
    host.innerHTML = `<div class="at-proj"><p class="at-pt"></p><div class="at-keyarea"></div><p class="at-pc"></p><p class="small-note"><a href="attendance.html">‹ Back to attendance</a></p></div>`;
    const count = () => { const s = L.sessions[0]; if (!s) return; const studs = studentsFor(s); $(".at-pc").textContent = `${studs.filter((r) => recOf(s.id, r.id)).length} of ${studs.length} students marked`; };
    const ref = db.collection("sessions").doc(sid);
    unsubs.push(ref.onSnapshot((d) => {
      const s = d.exists ? Object.assign({ id: d.id }, d.data()) : null;
      L.sessions = s ? [s] : [];
      $(".at-pt").innerHTML = s ? `<strong>${esc(s.title)}</strong><br>${sessionLine(s)}` : "This session no longer exists.";
      paintKey($(".at-keyarea"), sid, true);
      if (s && !L.rosterLoaded) {
        L.rosterLoaded = true;
        unsubs.push(db.collection("roster").onSnapshot((q) => { L.roster = q.docs.map((x) => Object.assign({ id: x.id }, x.data())); count(); }));
        unsubs.push(db.collection("attendance").where("session", "==", sid).onSnapshot((q) => { L.att = q.docs.map((x) => Object.assign({ id: x.id }, x.data())); count(); }));
      }
      count();
    }));
    keyWatch(sid, () => paintKey($(".at-keyarea"), sid, true));
  }
})();
