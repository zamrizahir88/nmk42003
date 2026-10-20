/* NMK42003 class attendance (attendance.html), in the style of the URLearn (Moodle) Attendance activity.
   Students: mark their own attendance with the security key shown in class (typed, or by scanning the QR code),
   send an absence notice (approved or not by the lecturer), ask a classmate in another section to swap labs for one
   week (the classmate accepts, then the lecturer approves), and see their own record.
   Lecturers: sessions (lectures and labs), opening a session with a key that changes every 3 minutes (or a fixed key),
   taking attendance by hand with a Save button, closing a session, the class list and lab groups, swaps, absence
   notices, the report with a CSV export, and the public timetable (Schedule tab).
   Every form opens inside the page, never as a pop-up. The Firestore rules (firebase/firestore.rules) enforce who may
   read and write each record. Firestore: roster/{studentmail}, sessions/{id}, sessionKeys/{id},
   attendance/{sessionId_studentmail}, notices/{sessionId_studentmail}, swaps/{id}, labMoves/{slot_studentmail},
   meta/classmates, schedule/{semester}. */
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
  const SEC_SHORT = { mon: "Mon", wed: "Wed", thu: "Thu" };
  const SECTION_TIME = { mon: "Monday, 1 PM to 4 PM", wed: "Wednesday, 12 PM to 3 PM", thu: "Thursday, 9 AM to 12 PM" };
  const ST = { P: "Present", L: "Late", E: "Excused", A: "Absent" };
  const POINTS = { P: 2, L: 1, E: 1, A: 0 };
  const REASONS = { mc: "Medical (MC)", family: "Family emergency", official: "Official university activity", other: "Other" };
  const COORDINATOR = "zamrizahir@unimap.edu.my";
  // Supporting documents of absence notices: the student's file is saved in Firestore (uploads/{id}, in parts of up to
  // 900 KB), the lecturer can open it at once, and the lecturer's Apps Script (apps-script/notices.gs, on a 5-minute
  // timer in their own Google account) moves it into their Drive folder and puts the Drive link on the notice.
  // meta/uploads.on switches it on (Notices tab); meta/uploads.lastRun is written by the script.
  let uploadOn = null;
  const getUploadOn = async () => { if (uploadOn === null) { try { const d = await db.collection("meta").doc("uploads").get(); uploadOn = !!(d.exists && d.data().on); } catch (e) { uploadOn = false; } } return uploadOn; };
  const DOC_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }, DOC_MAX = 5 * 1024 * 1024, PART = 900000;
  const docLink = (d, label) => (d && d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">📎 ${esc(label || d.name || "Supporting document")}</a>` : "");
  // photos are made smaller first (a phone photo of an MC is several MB; 1600 px is plenty to read it)
  const shrink = (file) => new Promise((ok) => {
    if (!/^image\/(jpeg|png)$/.test(file.type)) return ok(null);
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((b) => ok(b && b.size < file.size ? b : null), "image/jpeg", 0.8); };
    img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
    img.src = url;
  });
  async function sendDoc(file, meta) {
    const small = await shrink(file), blob = small || file, type = small ? "image/jpeg" : file.type;
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => no(new Error("Could not read the file.")); r.readAsDataURL(blob); });
    const ref = db.collection("uploads").doc(), parts = Math.ceil(data.length / PART);
    for (let k = 0; k < parts; k++) await ref.collection("parts").doc(`p${String(k).padStart(3, "0")}`).set({ email: meta.email, data: data.slice(k * PART, (k + 1) * PART) });
    // the upload record last: the script only moves records whose parts are all there
    await ref.set(Object.assign({ type, ext: DOC_TYPES[type], parts, size: blob.size, name: file.name.slice(0, 120), semester: SEM, at: FV.serverTimestamp() }, meta));
    return { upload: ref.id, name: file.name.slice(0, 120), type, size: blob.size };
  }
  // open a document that is still in Firestore (not yet moved to Drive)
  async function openUpload(id, win) {
    const q = await db.collection("uploads").doc(id).collection("parts").get(), u = await db.collection("uploads").doc(id).get();
    const data = q.docs.sort((a, b) => (a.id < b.id ? -1 : 1)).map((d) => d.data().data).join(""), bin = atob(data), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    win.location.href = URL.createObjectURL(new Blob([arr], { type: (u.exists && u.data().type) || "application/octet-stream" }));
  }
  const LAB_VENUE = "TVET MI01 (Makmal Industri UniMAP - Tessolve)";
  const ROTATE_MS = 3 * 60 * 1000;
  const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I: easy to read from a screen
  const newKey = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return [...a].map((n) => KEY_CHARS[n % KEY_CHARS.length]).join(""); };
  const semSlug = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // a lab "slot" links the three section sessions of one lab (e.g. Lab 2), so swaps survive date changes
  const slotOf = (s) => s.slot || ((s.id || "").match(/-(w\d\d-lab)-(mon|wed|thu)$/) || [])[1] || "";
  const labName = (s) => String(s.title || "").replace(/,\s*(Monday|Wednesday|Thursday) section$/, "");
  // a lab by its number (Lab 1 to Lab 5) and its part (Lab 1 runs over two weeks: Part 1 and Part 2)
  const labNoOf = (s) => +((String(s.title || "").match(/^Lab (\d+)/) || [])[1] || 0);
  const partOf = (s) => +((String(s.title || "").match(/\(Part (\d+)\)/) || [])[1] || 1);
  const nowMs = () => { const q = params.get("today"); return q ? Date.parse(`${q}T12:00:00+08:00`) : Date.now(); };
  const endMs = (x) => Date.parse(`${x.date}T${x.end || "23:59"}:00+08:00`);
  const secName = (k) => (SECTION[k] || "another section").replace(" lab", "");
  const whenS = (x) => (x ? `${fmtDate(x.date)}, ${fmtTime(x.start)}` : "date not set yet");
  // every lab with its parts; each part has one session per section. Swaps always cover a whole lab (every part
  // not yet ended), whatever internal links (slots) its sessions carry.
  function labsByNo(list) {
    const labs = {};
    list.filter((x) => x.kind === "lab" && labNoOf(x)).forEach((x) => { const L1 = labs[labNoOf(x)] = labs[labNoOf(x)] || { no: labNoOf(x), parts: {} }; (L1.parts[partOf(x)] = L1.parts[partOf(x)] || []).push(x); });
    return Object.values(labs).sort((a, b) => a.no - b.no).map((l) => {
      const parts = Object.keys(l.parts).map(Number).sort((a, b) => a - b).map((k) => ({ k, list: l.parts[k].sort((a, b) => (a.date < b.date ? -1 : 1)) }));
      const ss = parts.flatMap((pt) => pt.list), weeks = [...new Set(ss.map((x) => x.week || weekOfDate(x.date)))].sort((a, b) => a - b);
      return { no: l.no, parts, multi: parts.length > 1, slots: [...new Set(ss.map(slotOf).filter(Boolean))], weeks, label: `Lab ${l.no} · week${weeks.length > 1 ? `s ${weeks[0]}–${weeks[weeks.length - 1]}` : ` ${weeks[0]}`}` };
    });
  }
  const inSec = (pt, sec) => pt.list.find((x) => x.section === sec) || null;
  const partSlots = (pt) => [...new Set(pt.list.map(slotOf).filter(Boolean))];
  // a part can still be swapped between two sections until the later of their two sessions ends
  const partOpen = (pt, secs) => { const ss = secs.map((sec) => inSec(pt, sec)).filter(Boolean); return ss.length > 0 && nowMs() <= Math.max(...ss.map(endMs)); };
  const SWAP_HELP = `<div class="at-help"><strong>How to swap a lab session</strong><ol>
      <li>Agree with your classmate first (in person or by chat).</li>
      <li>In <strong>My Lab Sessions</strong>, tap <strong>Swap this lab session</strong> on the lab you need.</li>
      <li>Choose your classmate: tap their section, then their name.</li>
      <li>Check the <strong>Before / After</strong> table: who goes where, and when.</li>
      <li>Choose this lab session only, or every lab session until the end of the semester.</li>
      <li>Add a note for your lecturer if you want, then tap <strong>Send the request</strong>.</li>
      <li>Your classmate opens Attendance and taps <strong>Accept</strong>. Done: you swap sections and groups, and your lecturer is told.</li></ol>
      <p><strong>Each swap is between you and one classmate.</strong> Anyone else who wants to move sends their own request.</p>
      <p><strong>Can I cancel?</strong> Yes, while it waits: tap <strong>Cancel request</strong>. After your classmate accepts, ask your lecturer.</p>
      <p><strong>Is it too late?</strong> You can still swap until the lab session ends, as long as you haven't attended it yet.</p></div>`;

  /* ---------- dates in Malaysia time ---------- */
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const todayIso = () => { const q = params.get("today"); return q || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00Z"); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
  const weekOfDate = (iso) => Math.floor((new Date(iso + "T00:00:00Z") - new Date(COURSE.semesterStart + "T00:00:00Z")) / (7 * 86400000)) + 1;
  const weekRange = (w) => { const m = addDays(COURSE.semesterStart, 7 * (w - 1)); return `${fmtDate(m)} to ${fmtDate(addDays(m, 6))}`; };
  const tsMs = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
  const fmtStamp = (t) => { const ms = tsMs(t); if (!ms) return ""; const d = new Date(ms + 8 * 3600000); return `${fmtDate(d.toISOString().slice(0, 10))}, ${fmtTime(d.toISOString().slice(11, 16))}`; };

  /* ---------- forms open inside the page, at the top of the current view ---------- */
  let panelEl = null, panelBack = null;
  function panel(html) {
    // one form at a time: a new one takes the place (and the Back step) of the one open
    if (panelEl) { panelEl.remove(); panelEl = null; }
    else if (window.NMKBack) panelBack = NMKBack.layer(() => { panelBack = null; closePanel(); });
    const at = $(".at-body") || host;
    panelEl = document.createElement("div");
    panelEl.className = "at-panel";
    panelEl.setAttribute("role", "region");
    panelEl.innerHTML = `${html}`;
    at.prepend(panelEl);
    panelEl.addEventListener("click", (e) => { if (e.target.closest("[data-x]")) closePanel(); });
    panelEl.scrollIntoView({ block: "start", behavior: "smooth" });
    const f = panelEl.querySelector("input, select, textarea, button");
    if (f) f.focus({ preventScroll: true });
    return panelEl;
  }
  // keep: the form's Back step becomes the next view's step (no going back in the history)
  function closePanel(keep) {
    if (panelEl) { panelEl.remove(); panelEl = null; }
    if (panelBack) { const b = panelBack; panelBack = null; if (keep) b.drop(); else b.closed(); }
  }
  // go to another tab or session: a new step in the history, so Back comes back here
  function goView(tab, sid) {
    const had = !!panelBack;
    closePanel(true);
    L.tab = tab; L.sid = sid;
    if (window.NMKBack) NMKBack.view({ tab, sid }, had);
    draw();
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panelEl) closePanel(); });
  const say = (title, text) => panel(`<h3>${title}</h3><p>${text}</p><div class="acc-row"><button type="button" class="btn" data-x>OK</button></div>`);
  const sessionLine = (s) => `${fmtDate(s.date)}, ${fmtTime(s.start)} to ${fmtTime(s.end)}${s.venue ? ` · ${esc(s.venue)}` : ""}`;
  const chip = (st) => `<span class="at-st ${st ? st.toLowerCase() : "none"}">${st ? ST[st] : "Not marked"}</span>`;
  const profileLink = (email, name) => `<a class="at-pl" href="profile.html?e=${encodeURIComponent(email)}">${esc(name)}</a>`;

  // the lecturer's view: what is loaded and what is shown
  const L = { sessions: [], roster: [], att: [], moves: [], swaps: [], notices: [], users: [], sched: null, tab: "sessions", sid: null, keys: {}, filter: "all", rsec: "all", rkind: "all",
    rview: "list", q: "", watched: new Set(), edits: {}, openWeek: null, dirSent: "", picked: new Set() };

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

  // a type-to-filter list of classmates: tap one to choose. list: [{ m, n, s, g }], onPick(item)
  function picker(el, list, onPick, label) {
    const pid = `pk-${String(label).replace(/\W+/g, "-")}`;
    el.innerHTML = `<label class="at-lbl" for="${pid}">${esc(label)} <span>Type a name or matric number, then tap the student</span></label>
      <input id="${pid}" class="at-in" type="search" autocomplete="off" spellcheck="false" placeholder="e.g. Ahmad or 2313">
      <ul class="at-pick-list" role="listbox"></ul><p class="at-chosen" aria-live="polite"></p>`;
    const inp = $("input", el), ul = $("ul", el), chosen = $(".at-chosen", el);
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      const hits = !q ? [] : list.filter((x) => `${x.n} ${x.m}`.toLowerCase().includes(q)).slice(0, 8);
      ul.innerHTML = hits.map((x, i) => `<li><button type="button" data-i="${list.indexOf(x)}"><strong>${esc(x.n)}</strong><span>${esc(x.m)} · ${x.s ? `${SEC_SHORT[x.s]} lab, group ${x.g || "–"}` : "no lab section"}</span></button></li>`).join("") || (q ? `<li class="at-none">No match.</li>` : "");
    };
    inp.addEventListener("input", draw);
    ul.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      const x = list[+b.dataset.i];
      chosen.innerHTML = `Chosen: <strong>${esc(x.n)}</strong> (${esc(x.m)}, ${x.s ? SECTION[x.s] : "no lab section"})`;
      inp.value = ""; ul.innerHTML = ""; onPick(x);
    });
  }

  /* =====================================================================
     STUDENTS
     ===================================================================== */
  function student(email) {
    host.innerHTML = `<div class="at-body"><h2 class="h3">Mark Your Attendance</h2><div class="at-open" aria-live="polite"><p class="small-note">Looking for open sessions…</p></div>
      <div class="at-actions"><button type="button" class="btn ghost" data-notice>Tell the lecturer I can't attend</button>
        <a class="btn ghost" href="profile.html">My profile</a></div>
      <div class="at-reqs"></div>
      <div class="at-labsbox"></div>
      <h2 class="h3 at-gap">My Attendance</h2><div class="at-mine"><p class="small-note">Loading…</p></div></div>`;
    const openEl = $(".at-open"), mineEl = $(".at-mine"), reqEl = $(".at-reqs");
    let me = null, open = [], all = [], recs = {}, moves = {}, sent = [], got = [], notices = [], mates = [], tried = false;

    db.collection("roster").doc(email).get().then((r) => {
      me = r.exists ? r.data() : null;
      if (!me || me.status !== "active") {
        openEl.innerHTML = `<div class="at-card warn"><strong>You are not on the NMK42003 class list.</strong><p>You signed in as ${esc(email)}. If you take this course, please tell your lecturer so they can add you.</p></div>`;
        $(".at-actions").hidden = true;
        return;
      }
      // swap requests sent to me (by my matric number), and the classmate list for the swap form
      unsubs.push(db.collection("swaps").where("toMatric", "==", String(me.matric)).onSnapshot((q) => { got = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => x.semester === SEM); paintReqs(); if (A.refreshBell) A.refreshBell(); }, () => {}));
      db.collection("meta").doc("classmates").get().then((d) => { mates = d.exists ? (d.data().list || []) : []; }).catch(() => {});
      paintOpen();
    }).catch(() => { openEl.innerHTML = `<p class="small-note">Could not load the class list. Reload the page to try again.</p>`; });

    unsubs.push(db.collection("sessions").where("semester", "==", SEM).onSnapshot((q) => {
      all = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
      open = all.filter((s) => s.state === "open");
      paintOpen(); paintReqs();
    }, () => { openEl.innerHTML = `<p class="small-note">Could not check for open sessions. Reload the page to try again.</p>`; }));
    unsubs.push(db.collection("attendance").where("email", "==", email).onSnapshot((q) => {
      recs = {};
      q.docs.forEach((d) => { const x = d.data(); if (!x.semester || x.semester === SEM) recs[x.session] = x; });
      paintOpen(); paintMine(); paintReqs(); if (A.refreshBell) A.refreshBell();
    }, () => { mineEl.innerHTML = `<p class="small-note">Could not load your records. Reload the page to try again.</p>`; }));
    unsubs.push(db.collection("labMoves").where("email", "==", email).onSnapshot((q) => { moves = {}; q.docs.forEach((d) => { const x = d.data(); moves[x.slot] = x; }); paintOpen(); paintReqs(); }, () => {}));
    unsubs.push(db.collection("swaps").where("fromEmail", "==", email).onSnapshot((q) => { sent = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => x.semester === SEM); paintReqs(); }, () => {}));
    unsubs.push(db.collection("notices").where("email", "==", email).onSnapshot((q) => { notices = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => x.semester === SEM); paintReqs(); paintMine(); }, () => {}));

    // my section for a session: a lecture is for everyone; a lab follows an approved swap for that lab
    const mySection = (s) => (s.kind === "lab" && moves[slotOf(s)] ? moves[slotOf(s)].section : me && me.section);
    const forMe = (s) => me && (s.section === "all" || s.section === mySection(s));

    function paintOpen() {
      if (!me || me.status !== "active") return;
      const mine = open.filter(forMe);
      if (!mine.length) {
        openEl.innerHTML = `<div class="at-card"><p><strong>No attendance is open for you right now.</strong> When your lecturer opens it in class, a key appears on the screen. Come back here, or scan the QR code.</p><p class="small-note">Your lab section: ${me.section ? `${SECTION[me.section]} (${SECTION_TIME[me.section]}), group ${me.group || "–"}` : "not set yet"}.</p></div>`;
        return;
      }
      openEl.innerHTML = mine.map((s) => {
        const r = recs[s.id], mv = s.kind === "lab" && moves[slotOf(s)];
        return `<div class="at-card open" data-s="${s.id}"><div class="at-head"><strong>${esc(s.title)}</strong>${r ? chip(r.status) : `<span class="at-live">Open now</span>`}</div>
          <p class="small-note">${sessionLine(s)}${mv ? ` · ⇄ swapped in for this lab` : ""}</p>
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

    /* ---- absence notice ---- */
    async function noticeForm(n, preSid) {
      const choices = all.filter(forMe);
      await getUploadOn();
      if (!choices.length) { say("No Sessions Yet", "Your lecturer hasn't set up the sessions yet. Try again later."); return; }
      const t = todayIso(), next = choices.find((s) => s.date >= t) || choices[choices.length - 1];
      const pick = n ? n.session : preSid || next.id;
      const opt = (s) => `<option value="${s.id}"${s.id === pick ? " selected" : ""}>${fmtDate(s.date)} · ${esc(s.title)}${recs[s.id] ? ` (${ST[recs[s.id].status] || recs[s.id].status})` : ""}</option>`;
      const past = choices.filter((s) => s.date < t || s.state === "closed").reverse(), ahead = choices.filter((s) => !past.includes(s));
      const p = panel(`<h3>${n ? "Edit Your Absence Notice" : "Tell the Lecturer You Can't Attend"}</h3>
        <form class="at-dform" novalidate>
          <label>Session<select name="session"${n ? " disabled" : ""}>${past.length ? `<optgroup label="Already held (absent already)">${past.map(opt).join("")}</optgroup>` : ""}${ahead.length ? `<optgroup label="Coming up">${ahead.map(opt).join("")}</optgroup>` : ""}</select></label>
          <label>Reason<select name="reason">${Object.entries(REASONS).map(([v, l]) => `<option value="${v}"${n && n.reason === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Explain briefly<textarea name="detail" rows="3" maxlength="500" required placeholder="e.g. Fever, clinic visit at Pusat Kesihatan UniMAP">${esc(n ? n.detail : "")}</textarea></label>
          ${uploadOn ? `<label>Supporting document (MC, official letter…)<input type="file" name="doc" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"${n ? "" : " required"}>
            <small class="at-sub">PDF, JPG or PNG, up to 5 MB. ${n && n.doc ? `Sent: ${docLink(n.doc)}. Choose a file only to replace it.` : "A clear photo of the document is fine."}</small></label>
            <p class="at-note">Your document goes straight to your lecturer. When they approve the notice, your attendance for that session becomes <strong>Excused</strong>.</p>`
          : `<p class="at-note">📎 Email your supporting document (e.g. MC or official letter) to the course coordinator at <a href="mailto:${COORDINATOR}">${COORDINATOR}</a>. This notice only tells your lecturer; it is approved or not after they check it.</p>`}
          <p class="at-err" aria-live="polite"></p>
          <div class="acc-row"><button type="submit" class="btn">${n ? "Save" : "Send the notice"}</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
      $(".at-dform", p).addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.target).entries()), sid = n ? n.session : v.session, s = all.find((x) => x.id === sid);
        if (!v.detail || v.detail.trim().length < 5) { $(".at-err", p).textContent = "Please explain in a few words."; return; }
        if (!n && notices.some((x) => x.session === sid)) { $(".at-err", p).textContent = "You already sent a notice for this session. Edit it in the list below."; return; }
        const file = uploadOn && e.target.doc && e.target.doc.files[0];
        if (uploadOn && !file && !(n && n.doc)) { $(".at-err", p).textContent = "Attach your supporting document (PDF, JPG or PNG)."; return; }
        if (file && !DOC_TYPES[file.type]) { $(".at-err", p).textContent = "Use a PDF, JPG or PNG file."; return; }
        if (file && file.size > DOC_MAX) { $(".at-err", p).textContent = "The file is larger than 5 MB. Take a smaller photo, or save it as a PDF."; return; }
        const btn = e.target.querySelector("[type=submit]");
        btn.disabled = true;
        try {
          let doc = n && n.doc ? n.doc : null;
          if (file) { $(".at-err", p).textContent = "Uploading your document…"; doc = await sendDoc(file, { email, notice: `${sid}_${email}`, session: sid, title: s.title, date: s.date, reason: REASONS[v.reason] || v.reason, studentName: me.name, matric: String(me.matric) }); }
          await db.collection("notices").doc(`${sid}_${email}`).set(Object.assign({ semester: SEM, session: sid, email, name: me.name, matric: String(me.matric), kind: s.kind, date: s.date, title: s.title,
            reason: v.reason, detail: v.detail.trim().slice(0, 500), status: "pending", at: FV.serverTimestamp() }, doc ? { doc } : {}));
          closePanel();
        } catch (ex) { btn.disabled = false; $(".at-err", p).textContent = `Could not send (${ex.code || ex.message || ex}). Please try again.`; }
      });
    }

    /* ---- lab sessions and swaps ---- */
    const labsNow = () => labsByNo(all);
    // my section for one session's week (a swap or a move, else my own), and my session in a part
    const secFor = (x) => (moves[slotOf(x)] ? moves[slotOf(x)].section : me.section);
    const mineIn = (pt) => pt.list.find((x) => x.section === secFor(x)) || null;
    const attended = (x) => x && recs[x.id] && (recs[x.id].status === "P" || recs[x.id].status === "L");
    const swapSlots = (x) => (x.slots && x.slots.length ? x.slots : [x.slot]);
    const hits = (x, lab) => swapSlots(x).some((k) => lab.slots.includes(k));
    // the parts of a lab I could swap with a classmate in section sec: not ended for either of us, not attended by me
    const openParts = (lab, sec) => lab.parts.filter((pt) => { const m = mineIn(pt); return m && partOpen(pt, [m.section, sec]) && !attended(m); });
    // Before / After, part by part: who goes where, and when
    const cell = (pt, sec, grp) => `${whenS(inSec(pt, sec))}<small>${secName(sec)} · Group ${grp || "–"}</small>`;
    function beforeAfter(lab, parts, other, oSec, oGroup) {
      const g = (lab.slots.map((k) => moves[k]).filter(Boolean).pop() || {}).group || me.group;
      return `<div class="at-bawrap"><table class="adm at-ba"><thead><tr><th scope="col"></th><th scope="col">Now</th><th scope="col">After the swap</th></tr></thead><tbody>
        ${parts.map((pt) => { const m = mineIn(pt), mine = m ? m.section : me.section;
          return `${lab.multi ? `<tr class="at-bapart"><th colspan="3">Lab ${lab.no}, Part ${pt.k}</th></tr>` : ""}
            <tr><th scope="row">You</th><td>${cell(pt, mine, g)}</td><td class="at-after">${cell(pt, oSec, oGroup)}</td></tr>
            <tr><th scope="row">${esc(other)}</th><td>${cell(pt, oSec, oGroup)}</td><td class="at-after">${cell(pt, mine, g)}</td></tr>`; }).join("")}</tbody></table></div>`;
    }
    const deadline = (parts, secs) => { const ss = parts.flatMap((pt) => secs.map((sec) => inSec(pt, sec))).filter(Boolean); if (!ss.length) return ""; const last = ss.reduce((a, b) => (endMs(b) > endMs(a) ? b : a)); return `${fmtDate(last.date)}, ${fmtTime(last.end)}`; };

    // My Lab Sessions: Lab 1 to Lab 5 with my own session, and a swap button on each lab still to come
    function paintLabs() {
      const box = $(".at-labsbox");
      if (!box || !me || me.status !== "active") return;
      const labs = labsNow();
      if (!labs.length || !me.section) { box.innerHTML = ""; return; }
      const name = (x, out) => (out ? x.toName : x.fromName);
      box.innerHTML = `<div class="at-card"><div class="at-lhead"><h2 class="h3">My Lab Sessions</h2><button type="button" class="at-info" data-help aria-expanded="false" aria-label="How to swap a lab session">i</button></div>
        <div class="at-helpbox" hidden>${SWAP_HELP}</div>
        <div class="adm-scroll"><table class="adm at-mylabs"><thead><tr><th scope="col">Lab</th><th scope="col">Your session</th><th scope="col">Section · Group</th><th scope="col"></th></tr></thead><tbody>
        ${labs.map((lab) => {
          const mine = lab.parts.map((pt) => ({ pt, m: mineIn(pt) })), moved = lab.slots.some((k) => moves[k]);
          const g = (lab.slots.map((k) => moves[k]).filter(Boolean).pop() || {}).group || me.group, last = mine.map((x) => x.m).filter(Boolean).pop();
          const inc = got.find((x) => x.status === "requested" && hits(x, lab)), wait = sent.find((x) => ["requested", "accepted"].includes(x.status) && hits(x, lab));
          const done = sent.concat(got).find((x) => x.status === "approved" && hits(x, lab));
          const ended = mine.every((x) => !x.m || nowMs() > endMs(x.m));
          let act;
          if (wait) act = `<span class="at-tag requested">Waiting for ${esc(wait.toName)} to accept</span> <button type="button" class="btn ghost small" data-cancelsw="${wait.id}">Cancel request</button>`;
          else if (inc) act = `<span class="at-tag accepted">${esc(inc.fromName)} asks to swap: see the request above</span>`;
          else if (moved) act = `<span class="at-tag approved">⇄ Swapped${done ? ` with ${esc(done.fromEmail === email ? done.toName : done.fromName)}` : " by your lecturer"}</span>`;
          else if (ended) act = `<span class="small-note">Done</span>`;
          else act = `<button type="button" class="btn small" data-swaplab="${lab.no}">Swap this lab session</button>`;
          return `<tr><td><strong>Lab ${lab.no}</strong><br><small>${lab.label.replace(/^Lab \d+ · /, "")}</small></td>
            <td>${mine.map(({ pt, m }) => `${lab.multi ? `Part ${pt.k}: ` : ""}${m ? `${fmtDate(m.date)}, ${fmtTime(m.start)} to ${fmtTime(m.end)}` : "not set yet"}`).join("<br>")}</td>
            <td>${last ? secName(last.section) : secName(me.section)} · Group ${g || "–"}${moved ? " ⇄" : ""}</td><td>${act}</td></tr>`; }).join("")}</tbody></table></div></div>`;
    }

    // Swap Lab Session: choose a classmate (one section at a time), check Before / After, send
    function swapForm(no) {
      const lab = labsNow().find((l) => l.no === +no);
      if (!lab || !me.section) return;
      const myNow = (mineIn(lab.parts[lab.parts.length - 1]) || {}).section || me.section;
      const others = mates.filter((x) => x.m !== String(me.matric) && x.s && x.s !== myNow);
      if (!others.length) { say("Swap Lab Session", "The classmate list isn't ready yet. Try again in a moment."); return; }
      const secs = ["mon", "wed", "thu"].filter((k) => k !== myNow && others.some((x) => x.s === k));
      let sec = secs[0], partner = null, q = "";
      const p = panel(`<div class="at-lhead"><h3>Swap Lab Session: Lab ${lab.no}</h3><button type="button" class="at-info" data-help aria-expanded="false" aria-label="How to swap a lab session">i</button></div>
        <div class="at-helpbox" hidden>${SWAP_HELP}</div>
        <p class="at-q">1. Choose your classmate</p>
        <div class="at-secbar" role="group" aria-label="Section">${secs.map((k) => `<button type="button" class="btn ghost small" data-sec="${k}">${secName(k)}</button>`).join("")}</div>
        <input class="at-in at-sq" type="search" autocomplete="off" placeholder="Or find a name or matric number" aria-label="Find a classmate">
        <div class="at-cands"></div>
        <div class="at-step2" hidden>
          <p class="at-q">2. Check the change</p><div class="at-babox"></div>
          <p class="at-q">3. Do you want to switch for all labs for the entire semester?</p>
          <div class="at-fs at-radios" role="radiogroup" aria-label="How long">
            <label><input type="radio" name="term" value="one" checked><span>No. Swap this lab session only.</span></label>
            <label><input type="radio" name="term" value="all"><span>Yes. Swap this lab session and every lab session after it, until the end of the semester.</span></label></div>
          <label class="at-notel">Note to your lecturer (optional)<input class="at-in" name="note" maxlength="200" placeholder="e.g. Clinic appointment on Monday"></label>
          <p class="small-note at-dl"></p></div>
        <p class="at-err" aria-live="polite"></p>
        <div class="acc-row"><button type="button" class="btn" data-send>Send the request</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
      const term = () => ($("input[name=term]:checked", p) || {}).value === "all";
      const paint = () => {
        $$("[data-sec]", p).forEach((b) => b.setAttribute("aria-pressed", String(!q && b.dataset.sec === sec)));
        const ql = q.trim().toLowerCase(), groups = {}, lastPt = lab.parts[lab.parts.length - 1];
        others.filter((x) => (ql ? `${x.n} ${x.m}`.toLowerCase().includes(ql) : x.s === sec)).sort((a, b) => (a.s + String(a.g || 0).padStart(2, "0") + a.n < b.s + String(b.g || 0).padStart(2, "0") + b.n ? -1 : 1))
          .forEach((x) => { const k = `${x.s}|${x.g || 0}`; (groups[k] = groups[k] || []).push(x); });
        $(".at-cands", p).innerHTML = Object.entries(groups).map(([k, xs]) => { const [s2, g] = k.split("|");
          return `<div class="at-cg"><h4>${secName(s2)} · Group ${+g || "–"} <small>${whenS(inSec(lastPt, s2))}</small></h4>${xs.map((x) => `<button type="button" class="at-cand" data-m="${esc(x.m)}" aria-pressed="${!!partner && partner.m === x.m}">${esc(x.n)} <small>${esc(x.m)}</small></button>`).join("")}</div>`; }).join("") || `<p class="small-note">No match.</p>`;
        $(".at-step2", p).hidden = !partner;
        if (partner) {
          const parts = openParts(lab, partner.s);
          $(".at-babox", p).innerHTML = parts.length ? beforeAfter(lab, parts, partner.n, partner.s, partner.g) + (term() ? `<p class="small-note">The same for every lab session after Lab ${lab.no}, until the end of the semester.</p>` : "")
            : `<p class="at-warn">Lab ${lab.no} has already ended for one of you (or you've attended it), so it can't be swapped.</p>`;
          $(".at-dl", p).textContent = parts.length ? `${partner.n} can accept until the lab session ends: ${deadline(parts, [myNow, partner.s])}.` : "";
        }
      };
      p.addEventListener("click", (e) => {
        const b = e.target.closest("[data-sec]"), c = e.target.closest("[data-m]");
        if (b) { sec = b.dataset.sec; q = ""; $(".at-sq", p).value = ""; paint(); }
        if (c) { partner = others.find((x) => x.m === c.dataset.m); $(".at-err", p).textContent = ""; paint(); }
      });
      $(".at-sq", p).addEventListener("input", (e) => { q = e.target.value; paint(); });
      $$("input[name=term]", p).forEach((r) => r.addEventListener("change", paint));
      $("[data-send]", p).addEventListener("click", async (e) => {
        const err = $(".at-err", p), all3 = term();
        if (!partner) { err.textContent = "Choose the classmate you are swapping with."; return; }
        const parts = openParts(lab, partner.s);
        if (!parts.length) { err.textContent = `Lab ${lab.no} can't be swapped any more. Ask your lecturer.`; return; }
        const later = all3 ? labsNow().filter((l) => l.no > lab.no) : [];
        const slots = [...new Set(parts.flatMap(partSlots).concat(later.flatMap((l) => l.slots)))];
        const busy = sent.filter((x) => ["requested", "accepted", "approved"].includes(x.status) && swapSlots(x).some((k) => slots.includes(k)));
        if (busy.length || slots.some((k) => moves[k])) { err.textContent = "You already have a swap for one of these lab sessions. Cancel it first in My Lab Sessions, or ask your lecturer."; return; }
        e.target.disabled = true;
        const first = parts[0].list[0];
        try {
          await db.collection("swaps").add({ semester: SEM, slot: slots[0], slots, term: all3, startDate: first.date, labNo: lab.no, labTitle: all3 ? `Every lab session from Lab ${lab.no}` : `Lab ${lab.no}`, fromEmail: email, fromMatric: String(me.matric), fromName: me.name, fromSection: myNow, fromGroup: me.group || 0,
            toMatric: partner.m, toName: partner.n, toSection: partner.s, toGroup: partner.g || 0, note: ($("input[name=note]", p).value || "").trim().slice(0, 200), status: "requested", createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
          closePanel();
        } catch (ex) { e.target.disabled = false; err.textContent = `Could not send (${ex.code || ex}). Please try again.`; }
      });
      paint();
    }
    const SWAP_ST = { requested: "Waiting for your classmate", accepted: "Waiting for the lecturer", approved: "Lab session swapped", declined: "Declined by your classmate", rejected: "Not approved", cancelled: "Cancelled", ended: "Ended by the lecturer" };
    const NOTE_ST = { pending: "Waiting for approval", approved: "Approved: marked Excused", rejected: "Not approved" };
    function paintReqs() {
      paintLabs();
      const inbox = got.filter((x) => x.status === "requested");
      const live = (x) => !["cancelled", "declined"].includes(x.status);
      const swaps = sent.filter(live).map((x) => ({ x, out: true })).concat(got.filter((x) => live(x) && x.status !== "requested").map((x) => ({ x, out: false })));
      reqEl.innerHTML = (inbox.length ? `<div class="at-card warn"><h3>Lab Swap Requests for You</h3>${inbox.map((x) => { const pl = swapPlan(x);
          return `<div class="at-req" data-sw="${x.id}"><p><strong>${esc(x.fromName)}</strong> asks to swap <strong>${esc(x.labTitle)}</strong> with you.${x.note ? ` <em>“${esc(x.note)}”</em>` : ""}</p>
          ${pl.err ? `<p class="at-warn">${esc(pl.err)}</p>` : `${pl.labs.map(({ lab, parts }) => beforeAfter(lab, parts, x.fromName, x.fromSection, x.fromGroup)).slice(0, 1).join("")}${pl.labs.length > 1 ? `<p class="small-note">The same for every lab session after it (${pl.labs.length} labs).</p>` : ""}<p class="small-note">You can accept until the lab session ends: ${pl.until}.</p>`}
          <div class="acc-row">${pl.err ? "" : `<button type="button" class="btn small" data-acc>Accept</button>`}<button type="button" class="btn ghost small" data-dec>Decline</button></div></div>`; }).join("")}</div>` : "")
        + (swaps.length ? `<div class="at-card"><h3>My Lab Swaps</h3><ul class="at-list">${swaps.map(({ x, out }) => `<li data-sw="${x.id}"><strong>${esc(x.labTitle)}</strong>: ${out ? `with ${esc(x.toName)} (${secName(x.toSection)})` : `with ${esc(x.fromName)} (${secName(x.fromSection)})`} · <span class="at-tag ${x.status}">${SWAP_ST[x.status] || x.status}</span>${out && ["requested", "accepted"].includes(x.status) ? ` <button type="button" class="btn ghost small" data-cancel>Cancel request</button>` : ""}</li>`).join("")}</ul></div>` : "")
        + (notices.length ? `<div class="at-card"><h3>My Absence Notices</h3><ul class="at-list">${notices.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((n) => `<li data-n="${n.id}"><strong>${fmtDate(n.date)} · ${esc(n.title)}</strong>: ${REASONS[n.reason] || n.reason} · <span class="at-tag ${n.status}">${NOTE_ST[n.status] || n.status}</span>${n.doc ? ` · ${n.doc.url ? docLink(n.doc, "Document") : "📎 Document sent"}` : ""}${n.note ? `<br><small>Lecturer: ${esc(n.note)}</small>` : ""}${n.status === "pending" ? ` <button type="button" class="btn ghost small" data-nedit>Edit</button> <button type="button" class="btn ghost small" data-ndel>Withdraw</button>` : ""}</li>`).join("")}</ul></div>` : "");
    }
    host.addEventListener("click", async (e) => {
      const t = e.target;
      if (t.closest("[data-notice]")) return noticeForm(null);
      if (t.closest("[data-explain]")) return noticeForm(null, t.closest("[data-explain]").dataset.explain);
      if (t.closest("[data-swaplab]")) return swapForm(t.closest("[data-swaplab]").dataset.swaplab);
      if (t.closest("[data-help]")) { const b = t.closest("[data-help]"), box = b.closest(".at-card, .at-panel").querySelector(".at-helpbox"); box.hidden = !box.hidden; b.setAttribute("aria-expanded", String(!box.hidden)); return; }
      if (t.closest("[data-cancelsw]")) { try { await db.collection("swaps").doc(t.closest("[data-cancelsw]").dataset.cancelsw).update({ status: "cancelled", updatedAt: FV.serverTimestamp() }); } catch (ex) { say("Could Not Save", esc(ex.code || ex)); } return; }
      const sw = t.closest("[data-sw]"), nt = t.closest("[data-n]");
      try {
        if (sw && t.closest("[data-acc]")) await acceptSwap(got.find((x) => x.id === sw.dataset.sw), t.closest("[data-acc]"));
        if (sw && t.closest("[data-dec]")) await db.collection("swaps").doc(sw.dataset.sw).update({ status: "declined", updatedAt: FV.serverTimestamp() });
        if (sw && t.closest("[data-cancel]")) await db.collection("swaps").doc(sw.dataset.sw).update({ status: "cancelled", updatedAt: FV.serverTimestamp() });
        if (nt && t.closest("[data-nedit]")) noticeForm(notices.find((n) => n.id === nt.dataset.n));
        if (nt && t.closest("[data-ndel]") && confirm("Withdraw this absence notice?")) await db.collection("notices").doc(nt.dataset.n).delete();
      } catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
    });

    // what accepting a request would do: each lab it covers, with the parts still open for both of us
    function swapPlan(x) {
      const labs = labsNow().filter((l) => hits(x, l)).map((lab) => ({ lab, parts: lab.parts.filter((pt) => partSlots(pt).some((k) => swapSlots(x).includes(k))
        && partOpen(pt, [x.fromSection, (mineIn(pt) || {}).section || me.section]) && !attended(mineIn(pt))) })).filter((y) => y.parts.length);
      if (!labs.length) return { labs, err: "This lab session has ended (or you've attended it), so the swap can't be done here. Ask your lecturer." };
      const ok = [...new Set(labs.flatMap((y) => y.parts.flatMap(partSlots)))];
      if (ok.some((k) => moves[k])) return { labs, ok, err: "You are already swapped or moved for one of these lab sessions. Ask your lecturer." };
      return { labs, ok, until: deadline(labs[0].parts, [x.fromSection, me.section]) };
    }
    // accepting a classmate's request completes the swap at once (the lecturer sees it in the Swaps tab and the bell)
    async function acceptSwap(x, btn) {
      if (!x) return;
      const pl = swapPlan(x);
      if (pl.err) { say("Can't Swap Here", esc(pl.err)); return; }
      if (btn) btn.disabled = true;
      const b = db.batch();
      b.update(db.collection("swaps").doc(x.id), { status: "approved", auto: true, updatedAt: FV.serverTimestamp(), slot: pl.ok[0], slots: pl.ok });
      pl.ok.forEach((k) => {
        const base = { semester: SEM, slot: k, swap: x.id, by: email, at: FV.serverTimestamp() };
        b.set(db.collection("labMoves").doc(`${k}_${x.fromEmail}`), Object.assign({ email: x.fromEmail, section: me.section, group: +me.group || 0 }, base));
        b.set(db.collection("labMoves").doc(`${k}_${email}`), Object.assign({ email, section: x.fromSection, group: +x.fromGroup || 0 }, base));
      });
      try { await b.commit(); }
      catch (ex) { if (btn) btn.disabled = false; say("Could Not Swap", `${esc(ex.code || ex)}. One of you may already be swapped for one of these labs: ask your lecturer.`); }
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
          <tbody>${l.map((r) => { const nt = notices.find((x) => x.session === r.session);
            return `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.title)}</td><td>${chip(r.status)}</td><td>${esc(r.remark || "")}${r.status === "A" && !nt ? `${r.remark ? "<br>" : ""}<button type="button" class="btn ghost small" data-explain="${esc(r.session)}">Explain absence</button>` : nt && r.status === "A" ? `<br><small>Notice: ${NOTE_ST[nt.status] || nt.status}</small>` : ""}</td></tr>`; }).join("")}</tbody></table></div></div>`;
      };
      mineEl.innerHTML = block("lecture", "Lectures") + block("lab", "Labs") + `<p class="small-note">Present counts 2 points, Late and Excused 1, Absent 0. Each session you attend also earns 10 XP and helps you collect attendance badges.</p>`;
    }
  }

  /* =====================================================================
     LECTURERS
     ===================================================================== */
  function lecturer() {
    host.innerHTML = `<div class="at-tabs adm-tabs" role="group" aria-label="Attendance view"></div><div class="at-body"></div><div class="at-savebar" hidden></div>`;
    // the tab and session shown before (after Back from a profile), and Back between them
    const hs = history.state || {};
    if (hs.view) { L.tab = hs.tab || "sessions"; L.sid = hs.sid || null; }
    if (window.NMKBack) {
      NMKBack.view({ tab: L.tab, sid: L.sid }, true);
      NMKBack.onView((st) => {
        if (!leaveOk()) { NMKBack.view({ tab: L.tab, sid: L.sid }); return; }
        closePanel(true); L.tab = st.tab || "sessions"; L.sid = st.sid || null; draw();
      });
    }
    const load = (name, q, map) => unsubs.push(q.onSnapshot((s) => { L[name] = s.docs.map(map); if (name === "roster") syncDirectory(); if (name === "roster" || name === "users") autoApprove(); if (name === "sessions") { addSlots(); L.sessLoaded = true; } draw(); },
      (e) => { console.warn("NMK attendance:", name, e.code || e); $(".at-body").innerHTML = `<p class="small-note">Could not load ${name} (${esc(e.code || e)}). If this says permission-denied, publish the latest firebase/firestore.rules in the Firebase console.</p>`; }));
    const withId = (d) => Object.assign({ id: d.id }, d.data());
    load("sessions", db.collection("sessions").where("semester", "==", SEM), withId);
    load("roster", db.collection("roster"), withId);
    load("att", db.collection("attendance").where("semester", "==", SEM), withId);
    load("moves", db.collection("labMoves").where("semester", "==", SEM), withId);
    load("swaps", db.collection("swaps").where("semester", "==", SEM), withId);
    load("notices", db.collection("notices").where("semester", "==", SEM), withId);
    unsubs.push(db.collection("meta").doc("uploads").onSnapshot((d) => { L.up = d.exists ? d.data() : {}; uploadOn = !!L.up.on; if (L.tab === "notices") draw(); }, () => {}));
    // the document-upload switch (Notices tab), and opening a document that is still in Firestore
    host.addEventListener("change", async (e) => {
      if (!e.target.matches("[data-upon]")) return;
      const on = e.target.checked, msg = $(".at-upmsg");
      try { await db.collection("meta").doc("uploads").set({ on, updatedAt: FV.serverTimestamp(), by: A.state.user.email.toLowerCase() }, { merge: true }); }
      catch (ex) { e.target.checked = !on; if (msg) msg.textContent = `Could not save (${ex.code || ex}). If this says permission-denied, publish the latest firebase/firestore.rules.`; }
    });
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-upview]");
      if (!b) return;
      const win = window.open("", "_blank");
      openUpload(b.dataset.upview, win).catch((ex) => { if (win) win.close(); say("Could Not Open", esc(ex.code || ex.message || ex)); });
    });
    load("users", db.collection("users"), withId);
    unsubs.push(db.collection("schedule").doc(semSlug).onSnapshot((d) => { L.sched = d.exists ? d.data() : {}; draw(); }, () => {}));
    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    host.addEventListener("input", (e) => {
      if (e.target.matches("[data-q]")) { L.q = e.target.value; L.typing = true; draw(); }
      if (e.target.matches(".at-rm")) { const tr = e.target.closest("tr[data-em]"); edit(L.sid, tr.dataset.em, { remark: e.target.value }); tr.classList.add("changed"); paintSaveBar(); }
    });
    host.addEventListener("focusout", () => setTimeout(() => { if (L.pending) draw(); }, 50));
    window.addEventListener("beforeunload", (e) => { if (Object.keys(L.edits).length) { e.preventDefault(); e.returnValue = ""; } });
    draw();
  }
  // the classmate list for the students' swap form: name, matric, lab section and group only
  let dirTimer = 0;
  function syncDirectory() {
    const list = L.roster.filter((r) => r.status === "active").map((r) => ({ m: String(r.matric), n: r.name, s: r.section || "", g: r.group || 0 })).sort((a, b) => (a.n < b.n ? -1 : 1));
    const v = JSON.stringify(list);
    if (v === L.dirSent) return;
    clearTimeout(dirTimer);
    dirTimer = setTimeout(() => db.collection("meta").doc("classmates").set({ semester: SEM, list, updatedAt: FV.serverTimestamp() }).then(() => { L.dirSent = v; }).catch((e) => console.warn("NMK attendance: classmate list", e.code || e)), 1500);
  }
  // a student account still waiting whose address is (now) on the class list is approved straight away: e.g. after the
  // lecturer corrects a studentmail address, adds a student, or loads the list after the student first signed in
  const approving = new Set();
  function autoApprove() {
    if (!L.users.length || !L.roster.length) return;
    const listed = new Set(L.roster.filter((r) => r.status === "active").map((r) => r.id));
    L.users.filter((u) => u.status === "pending" && u.role !== "lecturer" && listed.has(String(u.email || "").toLowerCase()) && !approving.has(u.id)).forEach((u) => {
      approving.add(u.id);
      db.collection("users").doc(u.id).update({ status: "approved", approvedBy: "class list", approvedAt: FV.serverTimestamp() })
        .catch((e) => { approving.delete(u.id); console.warn("NMK attendance: could not approve", u.email, e.code || e); });
    });
  }
  // lab sessions made before slots existed get theirs from their id, once
  function addSlots() {
    L.sessions.filter((s) => s.kind === "lab" && !s.slot && slotOf(s)).forEach((s) => db.collection("sessions").doc(s.id).update({ slot: slotOf(s) }).catch(() => {}));
  }
  const sortedSessions = () => L.sessions.slice().sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  const moveOf = (slot, email) => (slot ? L.moves.find((m) => m.slot === slot && m.email === email) : null);
  // the students of a session: a lab follows each student's approved swap (or the lecturer's move) for that lab
  function studentsFor(s) {
    const slot = s.kind === "lab" ? slotOf(s) : "";
    return L.roster.filter((r) => r.status === "active").map((r) => {
      const m = moveOf(slot, r.id);
      return Object.assign({}, r, { esec: m ? m.section : r.section, egroup: m ? m.group || r.group : r.group, moved: m ? { from: r.section, swap: m.swap } : null });
    }).filter((r) => s.section === "all" || r.esec === s.section)
      .sort((a, b) => (a.esec + String(a.egroup).padStart(2, "0") + a.name < b.esec + String(b.egroup).padStart(2, "0") + b.name ? -1 : 1));
  }
  const movedOut = (s) => { const slot = s.kind === "lab" ? slotOf(s) : ""; return !slot ? [] : L.roster.filter((r) => r.status === "active" && r.section === s.section && moveOf(slot, r.id) && moveOf(slot, r.id).section !== s.section); };
  const recOf = (sid, email) => L.att.find((x) => x.session === sid && x.email === email);
  const noticeOf = (sid, email) => L.notices.find((x) => x.session === sid && x.email === email);
  const counts = (s) => { const n = { P: 0, L: 0, E: 0, A: 0 }; L.att.forEach((x) => { if (x.session === s.id && n[x.status] !== undefined) n[x.status]++; }); return n; };
  const edit = (sid, email, patch) => { const k = `${sid}|${email}`; L.edits[k] = Object.assign(L.edits[k] || {}, patch); };
  const editsFor = (sid) => Object.entries(L.edits).filter(([k]) => k.startsWith(sid + "|"));

  function draw() {
    const tabs = $(".at-tabs"), body = $(".at-body");
    if (!tabs || !body) return;
    // don't redraw under the lecturer's fingers while they type: redraw when they leave the box
    const ae = document.activeElement;
    if (ae && host.contains(ae) && ae.matches(".at-rm, .at-grp, .at-panel input, .at-panel textarea, .at-panel select, .lm-in, .lm-q, .lm-wf input")) { L.pending = true; return; }
    L.pending = false;
    const pend = (k) => k.filter((x) => x.status === "accepted").length, np = L.notices.filter((x) => x.status === "pending").length;
    const T = [["sessions", "Sessions"], ["roster", `Class List (${L.roster.filter((r) => r.status === "active").length})`], ["swaps", `Swaps${pend(L.swaps) ? ` (${pend(L.swaps)})` : ""}`],
      ["notices", `Notices${np ? ` (${np})` : ""}`], ["report", "Report"], ["marks", "Lab Marks"], ["schedule", "Schedule"]];
    tabs.innerHTML = T.map(([v, l]) => `<button type="button" class="chip-btn${/\(\d+\)$/.test(l) && v !== "roster" ? " has" : ""}" data-tab="${v}" aria-pressed="${L.tab === v && !L.sid}">${l}</button>`).join("");
    const keepPanel = panelEl && body.contains(panelEl) ? panelEl : null;
    if (L.sid) { const s = L.sessions.find((x) => x.id === L.sid); if (s) drawSession(body, s); else if (L.sessLoaded) L.sid = null; else body.innerHTML = `<p class="small-note">Loading…</p>`; }
    if (!L.sid) ({ sessions: drawSessions, roster: drawRoster, swaps: drawSwaps, notices: drawNotices, report: drawReport, schedule: drawSchedule, marks: drawMarks })[L.tab](body);
    if (keepPanel) body.prepend(keepPanel);
    paintSaveBar();
    if (L.typing) { const q = $("[data-q]"); if (q) { q.focus(); q.setSelectionRange(L.q.length, L.q.length); } L.typing = false; }
  }

  /* ---------- the sessions list ---------- */
  function drawSessions(body) {
    const list = sortedSessions().filter((s) => L.filter === "all" || s.kind === L.filter);
    const t = todayIso();
    body.innerHTML = `<div class="adm-tools"><button type="button" class="btn" data-new>+ New session</button><button type="button" class="btn ghost" data-bulk>${L.sessions.some(fromPlan) ? "Update sessions from the timetable" : "Create the semester's sessions"}</button>
        ${["all", "lecture", "lab"].map((f) => `<button type="button" class="chip-btn" data-filter="${f}" aria-pressed="${L.filter === f}">${{ all: "All", lecture: "Lectures", lab: "Labs" }[f]}</button>`).join("")}
        ${L.picked.size ? `<button type="button" class="btn small at-danger" data-delpicked>Delete selected (${L.picked.size})</button><button type="button" class="btn ghost small" data-unpick>Clear selection</button>` : ""}</div>
      ${(() => { if (!L.sessions.some(fromPlan)) return ""; const d = planDiff(), dn = duplicates(new Set(d.del.map((x) => x.id))).length, n = d.add.length + d.upd.length + d.del.length + d.link.length + dn;
        return n ? `<div class="at-card warn at-sync"><strong>The course timetable has changed.</strong> ${[d.add.length && `${d.add.length} to add`, d.upd.length && `${d.upd.length} to update`, d.del.length && `${d.del.length} to remove`, d.link.length && `${d.link.length} already there to link`, dn && `${dn} duplicate${dn === 1 ? "" : "s"} to check`].filter(Boolean).join(", ")}. Sessions already held are never changed. <button type="button" class="btn small" data-bulk>Review and update</button></div>` : ""; })()}
      ${!list.length ? `<p class="adm-empty">No sessions yet. Press <strong>Create the semester's sessions</strong> to add every lecture and lab from the course timetable, or add one with <strong>+ New session</strong>.</p>` :
      `<div class="adm-scroll"><table class="adm at-ses"><thead><tr><th scope="col"><input type="checkbox" class="at-cb" data-pickall aria-label="Select every session in this list"${list.length && list.every((s) => L.picked.has(s.id)) ? " checked" : ""}></th><th scope="col">Week</th><th scope="col">Date</th><th scope="col">Session</th><th scope="col">For</th><th scope="col">State</th><th scope="col">P / L / E / A</th><th scope="col"><span class="vh">Manage</span></th></tr></thead><tbody>
      ${list.map((s) => { const n = counts(s), sw = s.kind === "lab" ? L.moves.filter((m) => m.slot === slotOf(s) && m.section === s.section).length : 0; return `<tr class="${s.date === t ? "today" : ""}${L.picked.has(s.id) ? " picked" : ""}"><td><input type="checkbox" class="at-cb" data-pick="${s.id}" aria-label="Select ${esc(s.title)}"${L.picked.has(s.id) ? " checked" : ""}></td><td>${s.week || weekOfDate(s.date)}</td><td>${fmtDate(s.date)}<br><small>${fmtTime(s.start)} to ${fmtTime(s.end)}</small></td>
        <td><strong>${esc(s.title)}</strong>${s.venue ? `<br><small>${esc(s.venue)}</small>` : ""}${sw ? `<br><small class="at-swn">⇄ ${sw} swapped in</small>` : ""}</td><td>${SECTION[s.section] || s.section}</td>
        ${(() => {
          // marks count whether the session was opened or marked by hand afterwards
          const done = n.P + n.L + n.E + n.A, byHand = s.state === "planned" && done, total = done ? studentsFor(s).length : 0;
          return `<td><span class="at-state ${byHand ? "hand" : s.state}">${byHand ? "Marked by hand" : { planned: "Not opened", open: "Open", closed: "Closed" }[s.state] || s.state}</span></td>
        <td class="at-n">${done ? `${n.P} / ${n.L} / ${n.E} / ${n.A}${done < total ? `<br><small class="at-part">${done} of ${total} marked</small>` : ""}` : "–"}</td>`;
        })()}<td><button type="button" class="btn small${s.state === "open" ? "" : " ghost"}" data-sid="${s.id}">${s.state === "open" ? "Open ›" : "Manage"}</button></td></tr>`; }).join("")}
      </tbody></table></div>`}`;
  }

  // delete several sessions at once (e.g. made by mistake), optionally with their attendance records
  function deletePicked() {
    const ses = L.sessions.filter((s) => L.picked.has(s.id));
    if (!ses.length) return;
    const recs = L.att.filter((x) => L.picked.has(x.session)), open = ses.filter((s) => s.state === "open").length;
    const p = panel(`<h3>Delete ${ses.length} Session${ses.length === 1 ? "" : "s"}</h3>
      <ul class="at-list">${ses.slice(0, 12).map((s) => `<li>${fmtDate(s.date)} · ${esc(s.title)}${s.state !== "planned" ? ` <small>(${s.state})</small>` : ""}</li>`).join("")}${ses.length > 12 ? `<li>…and ${ses.length - 12} more</li>` : ""}</ul>
      ${open ? `<p class="at-note">${open} of them ${open === 1 ? "is" : "are"} open right now.</p>` : ""}
      ${recs.length ? `<label class="at-late"><input type="checkbox" data-delrecs checked> Also delete their <strong>${recs.length}</strong> attendance record${recs.length === 1 ? "" : "s"} (untick to keep them in the database)</label>` : `<p class="small-note">No attendance has been taken in them.</p>`}
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn at-danger" data-go>Delete ${ses.length} session${ses.length === 1 ? "" : "s"}</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", p).addEventListener("click", async (e) => {
      e.target.disabled = true;
      const withRecs = recs.length && $("[data-delrecs]", p).checked, ops = [];
      ses.forEach((s) => { ops.push((b) => b.delete(db.collection("sessions").doc(s.id))); ops.push((b) => b.delete(db.collection("sessionKeys").doc(s.id))); });
      if (withRecs) recs.forEach((x) => ops.push((b) => b.delete(db.collection("attendance").doc(x.id))));
      try {
        for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
        L.picked.clear(); closePanel(); draw();
      } catch (ex) { e.target.disabled = false; $(".at-err", p).textContent = `Could not delete them (${ex.code || ex}).`; }
    });
  }

  // every lecture and lab of the semester, from the weekly plan (ids are fixed, so nothing is made twice)
  function semesterPlan() {
    const out = [], dayOff = { mon: 0, wed: 2, thu: 3 }, labTime = { mon: ["13:00", "16:00"], wed: ["12:00", "15:00"], thu: ["09:00", "12:00"] };
    const ow = (L.sched && L.sched.weeks) || {}, base = (COURSE.original && COURSE.original.weeks) || COURSE.weeks;
    base.map((w0) => Object.assign({}, w0, ow[w0.w] || ow[String(w0.w)] || {})).forEach((w) => {
      const monday = addDays(COURSE.semesterStart, 7 * (w.w - 1)), wk = String(w.w).padStart(2, "0");
      if ((w.activities || []).includes("Lecture")) {
        out.push({ id: `${semSlug}-w${wk}-lecture`, kind: "lecture", section: "all", title: `Lecture, week ${w.w}: ${w.topic}`, date: addDays(monday, 3), start: "14:00", end: "16:00",
          venue: (w.notes || []).includes("Online lecture") ? "Online" : "", week: w.w });
      }
      (w.activities || []).filter((a) => /^Lab \d/.test(a)).forEach((a) => {
        ["mon", "wed", "thu"].forEach((sec) => out.push({ id: `${semSlug}-w${wk}-lab-${sec}`, kind: "lab", section: sec, slot: `w${wk}-lab`, title: `${a}, ${SECTION[sec].replace(" lab", "")} section`, date: addDays(monday, dayOff[sec]),
          start: labTime[sec][0], end: labTime[sec][1], venue: LAB_VENUE, week: w.w }));
      });
    });
    return out;
  }

  function sessionForm(s) {
    const isNew = !s;
    s = s || { kind: "lecture", section: "all", title: "", date: todayIso(), start: "14:00", end: "16:00", venue: "", lateAfter: 0 };
    const slots = {}; L.sessions.filter((x) => x.kind === "lab" && slotOf(x)).forEach((x) => { slots[slotOf(x)] = labName(x); });
    const p = panel(`<h3>${isNew ? "New Session" : "Edit Session"}</h3><form class="at-dform" novalidate>
      <label>Title<input name="title" value="${esc(s.title)}" required placeholder="e.g. Lecture, week 3: Embedded Controller"></label>
      <div class="at-two"><label>Type<select name="kind"><option value="lecture"${s.kind === "lecture" ? " selected" : ""}>Lecture</option><option value="lab"${s.kind === "lab" ? " selected" : ""}>Lab</option></select></label>
      <label>For<select name="section">${Object.entries(SECTION).map(([v, l]) => `<option value="${v}"${s.section === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <label>Which lab (links the sections of one lab, for swaps)<select name="slot"><option value="">Not a lab, or a new lab</option>${Object.entries(slots).map(([k, n]) => `<option value="${k}"${slotOf(s) === k ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <div class="at-three"><label>Date<input type="date" name="date" value="${esc(s.date)}" required></label><label>Start<input type="time" name="start" value="${esc(s.start)}" required></label><label>End<input type="time" name="end" value="${esc(s.end)}" required></label></div>
      <label>Venue<input name="venue" value="${esc(s.venue || "")}" placeholder="e.g. ${esc(LAB_VENUE)}"></label>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">${isNew ? "Add session" : "Save"}</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", p).addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      if (!v.title.trim() || !v.date || !v.start || !v.end) { $(".at-err", p).textContent = "Fill in the title, date and times."; return; }
      if (v.end <= v.start) { $(".at-err", p).textContent = "The end time must be after the start time."; return; }
      const slot = v.kind === "lab" ? v.slot || (isNew ? `lab-${v.date}` : slotOf(s) || `lab-${v.date}`) : "";
      const data = { title: v.title.trim(), kind: v.kind, section: v.section, date: v.date, start: v.start, end: v.end, venue: v.venue.trim(), week: weekOfDate(v.date), semester: SEM, slot };
      try {
        if (isNew) await db.collection("sessions").add(Object.assign(data, { state: "planned", lateAfter: 0, createdAt: FV.serverTimestamp() }));
        else await db.collection("sessions").doc(s.id).update(Object.assign(data, fromPlan(s) ? { manual: true, pkey: pkeyOf(s) } : {}));
        closePanel();
      } catch (ex) { $(".at-err", p).textContent = `Could not save (${ex.code || ex}).`; }
    });
  }

  /* Keep the sessions in step with the course timetable. Sessions made from the timetable are matched to it by week,
     type and section: missing ones are added; ones not opened yet are updated (title, date, time, venue) or removed when
     the timetable no longer has them. A session that has been opened, or has any attendance, is never changed, and
     sessions the lecturer made by hand are left alone. */
  const fromPlan = (s) => String(s.id || "").startsWith(`${semSlug}-w`);
  const held = (s) => s.state !== "planned" || L.att.some((x) => x.session === s.id);
  const planKey = (x) => `${x.week || weekOfDate(x.date)}|${x.kind}|${x.section}`;
  // the timetable place a session was made for (kept when its date is changed by hand); older sessions: from their id
  const pkeyOf = (x) => { if (x.pkey) return x.pkey; const m = String(x.id || "").match(/-w(\d\d)-(lecture|lab)(?:-(mon|wed|thu))?$/); return m ? `${+m[1]}|${m[2]}|${m[3] || "all"}` : planKey(x); };
  function planDiff() {
    // sessions from the timetable, and the lecturer's own sessions already linked to a timetable place
    const plan = semesterPlan(), mine = L.sessions.filter((x) => fromPlan(x) || x.pkey), used = new Set(), add = [], upd = [], del = [], keep = [], link = [];
    const overlap = (a, b) => a.start < b.end && b.start < a.end;
    // first every timetable place takes the session made for it; then a place left without one takes any other session
    // on the same day, at an overlapping time, for the same students (one the lecturer made, or one made for another
    // week and moved here by a timetable change but kept because it was already held)
    const found = new Map();
    plan.forEach((p) => { const ex = mine.find((x) => !used.has(x.id) && pkeyOf(x) === planKey(p)); if (ex) { used.add(ex.id); found.set(p, ex); } });
    plan.forEach((p) => {
      const ex = found.get(p);
      if (!ex) {
        const same = L.sessions.find((x) => !used.has(x.id) && x.kind === p.kind && x.section === p.section && x.date === p.date && overlap(x, p));
        if (same) { used.add(same.id); link.push({ s: same, p }); return; }
        add.push(p); return;
      }
      const ch = ["title", "date", "start", "end", "venue"].filter((f) => (ex[f] || "") !== (p[f] || ""));
      if (!ch.length) return;
      if (ex.manual) { keep.push({ s: ex, p, why: "changed by you" }); return; } // the lecturer changed this one by hand: leave it
      if (held(ex)) keep.push({ s: ex, p, why: "already held" }); else upd.push({ s: ex, p, ch });
    });
    mine.filter((x) => !used.has(x.id)).forEach((x) => { if (held(x)) keep.push({ s: x, why: "held, no longer in the timetable" }); else if (x.manual) keep.push({ s: x, why: "changed by you" }); else del.push(x); });
    return { add, upd, del, keep, link };
  }
  // groups of two or more sessions on the same date, at overlapping times, for the same students; each session has a
  // suggested "remove" tick: keep the one with attendance, else the lecturer's own, else the first made
  function duplicates(skip) {
    const recs = (x) => L.att.filter((a) => a.session === x.id).length, groups = [], seen = new Set();
    const list = L.sessions.filter((x) => !skip.has(x.id)).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
    list.forEach((x) => {
      if (seen.has(x.id)) return;
      const g = list.filter((y) => !seen.has(y.id) && y.kind === x.kind && y.section === x.section && y.date === x.date && y.start < x.end && x.start < y.end);
      if (g.length < 2) return;
      g.forEach((y) => seen.add(y.id));
      const rank = (y) => (recs(y) ? 0 : y.state !== "planned" ? 1 : !fromPlan(y) ? 2 : 3), keepId = g.slice().sort((a, b) => rank(a) - rank(b))[0].id;
      groups.push(g.map((y) => ({ s: y, recs: recs(y), remove: y.id !== keepId && !recs(y) })));
    });
    return groups;
  }
  function bulkCreate() {
    const d = planDiff(), dups = duplicates(new Set(d.del.map((x) => x.id)));
    const n = d.add.length + d.upd.length + d.del.length + d.link.length + dups.length;
    if (!n) { say("Up to Date", `Every lecture and lab in the course timetable has its session, and they all match.${d.keep.length ? ` ${d.keep.length} session${d.keep.length === 1 ? " that was" : "s that were"} already held ${d.keep.length === 1 ? "differs" : "differ"} from the timetable and ${d.keep.length === 1 ? "is" : "are"} kept as ${d.keep.length === 1 ? "it was" : "they were"}.` : ""}`); return; }
    const li = (t) => `<li>${t}</li>`, label = (x) => `${fmtDate(x.date)} · ${esc(x.title)}`;
    const p = panel(`<h3>Update Sessions from the Timetable</h3>
      <p>These changes make the sessions match the course timetable${L.sessions.length ? "" : " (every lecture on Thursday, 2 PM to 4 PM; each lab in three sections: Monday 1 to 4 PM, Wednesday 12 to 3 PM, Thursday 9 AM to 12 PM)"}. Sessions already held, and sessions you made yourself, are never changed.</p>
      ${d.add.length ? `<h4>Add ${d.add.length}</h4><ul class="at-list">${d.add.slice(0, 40).map((x) => li(label(x))).join("")}${d.add.length > 40 ? li(`…and ${d.add.length - 40} more`) : ""}</ul>` : ""}
      ${d.upd.length ? `<h4>Update ${d.upd.length}</h4><ul class="at-list">${d.upd.map((u) => li(`${label(u.s)} → <strong>${u.ch.includes("title") ? esc(u.p.title) : ""}${u.ch.includes("date") ? ` ${fmtDate(u.p.date)}` : ""}${u.ch.some((f) => f === "start" || f === "end") ? ` ${fmtTime(u.p.start)} to ${fmtTime(u.p.end)}` : ""}${u.ch.includes("venue") ? ` · ${esc(u.p.venue || "no venue")}` : ""}</strong>`)).join("")}</ul>` : ""}
      ${d.link.length ? `<h4>Already there ${d.link.length} <small class="at-sub">a session already at the same date and time: it is linked to this place in the timetable, not renamed or moved</small></h4><ul class="at-list">${d.link.map((k) => li(`${label(k.s)} <small>= ${esc(k.p.title)}</small>`)).join("")}</ul>` : ""}
      ${d.del.length ? `<h4>Remove ${d.del.length} <small class="at-sub">not opened, and no longer in the timetable</small></h4><ul class="at-list">${d.del.map((x) => li(label(x))).join("")}</ul>` : ""}
      ${dups.length ? `<h4>Duplicates ${dups.length} <small class="at-sub">same date, overlapping times, same students. Tick the ones to remove; at least one of each stays.</small></h4>
        <div class="at-dups">${dups.map((g, gi) => `<fieldset class="at-dup" data-g="${gi}"><legend>${fmtDate(g[0].s.date)}</legend>${g.map((x, i) => `<label class="at-dupr${x.recs ? " has" : ""}"><input type="checkbox" class="at-cb" data-dup="${gi}:${i}"${x.remove ? " checked" : ""}> Remove
          <span><strong>${esc(x.s.title)}</strong> <small>${fmtTime(x.s.start)} to ${fmtTime(x.s.end)} · ${fromPlan(x.s) ? "from the timetable" : "made by you"} · ${x.recs ? `<span class="at-warn">${x.recs} attendance record${x.recs === 1 ? "" : "s"}: removed too if ticked</span>` : x.s.state !== "planned" ? x.s.state : "no attendance"}</small></span></label>`).join("")}</fieldset>`).join("")}</div>` : ""}
      ${d.keep.length ? `<h4>Kept as they are ${d.keep.length}</h4><ul class="at-list">${d.keep.map((k) => li(`${label(k.s)} <small>(${k.why})</small>`)).join("")}</ul>` : ""}
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Apply ${n} change${n === 1 ? "" : "s"}</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", p).addEventListener("click", async (e) => {
      // the duplicates the lecturer ticked; never all of one group
      const gone = [], err = $(".at-err", p);
      for (let gi = 0; gi < dups.length; gi++) {
        const ticked = dups[gi].filter((x, i) => $(`[data-dup="${gi}:${i}"]`, p).checked);
        if (ticked.length === dups[gi].length) { err.textContent = `Keep at least one session on ${fmtDate(dups[gi][0].s.date)}: untick one of them.`; return; }
        if (ticked.some((x) => x.recs) && !confirm(`Remove ${ticked.filter((x) => x.recs).map((x) => x.s.title).join(", ")} with ${ticked.reduce((a, x) => a + x.recs, 0)} attendance record(s)? This can't be undone.`)) return;
        const kept = dups[gi].filter((x) => !ticked.includes(x));
        gone.push({ ticked, kept });
      }
      e.target.disabled = true;
      const have = new Set(L.sessions.map((x) => x.id)), ops = [];
      gone.forEach(({ ticked, kept }) => {
        ticked.forEach((x) => {
          ops.push((b) => b.delete(db.collection("sessions").doc(x.s.id))); ops.push((b) => b.delete(db.collection("sessionKeys").doc(x.s.id)));
          L.att.filter((a) => a.session === x.s.id).forEach((a) => ops.push((b) => b.delete(db.collection("attendance").doc(a.id))));
        });
        // a removed timetable session hands its place to the kept one, so the next check doesn't add it again
        const from = ticked.find((x) => fromPlan(x.s) || x.s.pkey), to = kept.find((x) => !fromPlan(x.s) && !x.s.pkey);
        if (from && to) ops.push((b) => b.update(db.collection("sessions").doc(to.s.id), { pkey: pkeyOf(from.s), manual: true }));
      });
      const movesOf = (w) => { if (w.moves) return w.moves; const c = L.roster.find((r) => String(r.matric) === String(w.toMatric)); return c ? [{ e: w.fromEmail, s: w.toSection, g: w.toGroup }, { e: c.id, s: w.fromSection, g: w.fromGroup }] : []; };
      const terms = L.swaps.filter((w) => w.term && w.status === "approved").map((w) => Object.assign({}, w, { moves: movesOf(w) })), done = new Set();
      d.add.filter((x) => x.kind === "lab" && x.slot).forEach((x) => terms.filter((w) => w.startDate <= x.date && !(w.slots || []).includes(x.slot) && !done.has(`${w.id}|${x.slot}`)).forEach((w) => {
        done.add(`${w.id}|${x.slot}`);
        ops.push((b) => b.update(db.collection("swaps").doc(w.id), { slots: FV.arrayUnion(x.slot) }));
        w.moves.forEach((m) => ops.push((b) => b.set(db.collection("labMoves").doc(`${x.slot}_${m.e}`), { semester: SEM, slot: x.slot, email: m.e, section: m.s, group: m.g || 0, swap: w.id, by: A.state.user.email.toLowerCase(), at: FV.serverTimestamp() })));
      }));
      d.add.forEach((x) => {
        const { id, ...data } = x, nid = have.has(id) ? `${id}-${Date.now().toString(36)}` : id; // a moved session may still use this id
        ops.push((b) => b.set(db.collection("sessions").doc(nid), Object.assign(data, { pkey: planKey(x), semester: SEM, state: "planned", lateAfter: 0, createdAt: FV.serverTimestamp() })));
      });
      // an updated lab keeps its slot, so swaps made for it stay with it
      const removed = new Set(gone.flatMap((g) => g.ticked.map((x) => x.s.id)));
      d.upd.filter((u) => !removed.has(u.s.id)).forEach((u) => ops.push((b) => b.update(db.collection("sessions").doc(u.s.id), { title: u.p.title, date: u.p.date, start: u.p.start, end: u.p.end, venue: u.p.venue, week: u.p.week, pkey: planKey(u.p) })));
      d.del.forEach((x) => ops.push((b) => b.delete(db.collection("sessions").doc(x.id))));
      d.link.filter((k) => !removed.has(k.s.id)).forEach((k) => ops.push((b) => b.update(db.collection("sessions").doc(k.s.id), Object.assign({ pkey: planKey(k.p), week: k.p.week }, fromPlan(k.s) ? {} : { manual: true }))));
      try {
        for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
        closePanel();
      } catch (ex) { e.target.disabled = false; $(".at-err", p).textContent = `Could not apply them (${ex.code || ex}).`; }
    });
  }
  // move a whole lab (its sessions in every section) to another week
  function moveLab(s) {
    const slot = slotOf(s), group = L.sessions.filter((x) => x.kind === "lab" && slotOf(x) === slot), wk = s.week || weekOfDate(s.date);
    const p = panel(`<h3>Move ${esc(labName(s))}</h3><p>Moves the sessions of every section together (${group.length} session${group.length === 1 ? "" : "s"}), keeping each one's weekday and time. Swaps stay with the lab.</p>
      <form class="at-dform" novalidate><label>Move to week<input type="number" name="week" min="1" max="${COURSE.weeks.length}" value="${wk}"></label>
      <p class="small-note">To change the public timetable as well, use the <strong>Schedule</strong> tab.</p><p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">Move</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", p).addEventListener("submit", async (e) => {
      e.preventDefault();
      const to = +new FormData(e.target).get("week");
      if (!(to >= 1 && to <= COURSE.weeks.length)) { $(".at-err", p).textContent = "Choose a week of the semester."; return; }
      try {
        const b = db.batch();
        group.forEach((x) => { const d = addDays(x.date, 7 * (to - (x.week || weekOfDate(x.date)))); b.update(db.collection("sessions").doc(x.id), { date: d, week: weekOfDate(d), slot, manual: true, pkey: pkeyOf(x) }); });
        await b.commit(); closePanel();
      } catch (ex) { $(".at-err", p).textContent = `Could not move it (${ex.code || ex}).`; }
    });
  }

  /* ---------- one session: open it, show the key, take attendance by hand (with Save), close it ---------- */
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
    const studs = studentsFor(s), n = counts(s), marked = studs.filter((r) => recOf(s.id, r.id)).length, out = movedOut(s);
    const slot = s.kind === "lab" ? slotOf(s) : "";
    const waiting = slot ? L.swaps.filter((x) => x.slot === slot && x.status === "accepted" && (x.fromSection === s.section || x.toSection === s.section)) : [];
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
    const rows = studs.map((r, i) => {
      const x = recOf(s.id, r.id), e = L.edits[`${s.id}|${r.id}`] || {}, st = e.status || (x && x.status), rm = e.remark !== undefined ? e.remark : (x && x.remark) || "", nt = noticeOf(s.id, r.id);
      return `<tr data-em="${esc(r.id)}" class="${L.edits[`${s.id}|${r.id}`] ? "changed" : ""}"><td>${i + 1}</td><td>${profileLink(r.id, r.name)}<br><small>${esc(r.matric)}</small>${r.moved ? `<br><small class="at-swn">⇄ from ${SECTION[r.moved.from] ? SEC_SHORT[r.moved.from] : "–"}${r.moved.swap ? " (swap)" : ""}</small>` : ""}${nt ? `<br><small class="at-ntc ${nt.status}" title="${esc(nt.detail)}">✉ ${REASONS[nt.reason] || nt.reason}: ${nt.status}</small>` : ""}</td>
        <td>${s.section === "all" ? `${(r.esec || "–").toUpperCase()} ` : ""}${r.egroup || "–"}</td>
        <td><div class="at-pick" role="group" aria-label="Status of ${esc(r.name)}">${["P", "L", "E", "A"].map((k) => `<button type="button" class="at-b ${k.toLowerCase()}" data-st="${k}" aria-pressed="${st === k}" title="${ST[k]}">${k}</button>`).join("")}</div></td>
        <td><input class="at-rm" value="${esc(rm)}" placeholder="${st === "E" ? "Reason, e.g. MC" : ""}" aria-label="Remark for ${esc(r.name)}"></td>
        <td><small>${x ? `${x.by === "self" ? "Self" : x.by === "auto" ? "Auto (closed)" : "Lecturer"}${x.at ? `, ${fmtStamp(x.at)}` : ""}` : ""}</small></td></tr>`;
    }).join("");
    body.innerHTML = `<p><button type="button" class="btn ghost small" data-back>‹ All sessions</button></p>
      <div class="at-shead"><div><h2 class="h3">${esc(s.title)}</h2><p class="small-note">${sessionLine(s)} · ${SECTION[s.section] || s.section} · week ${s.week || weekOfDate(s.date)}</p></div>
        <div class="acc-row"><button type="button" class="btn ghost small" data-edit>Edit</button>${slot ? `<button type="button" class="btn ghost small" data-movelab>Move this lab…</button>` : ""}<button type="button" class="btn ghost small" data-del>Delete</button></div></div>
      ${waiting.length ? `<div class="at-card warn"><h3>Swaps Waiting for Your Approval</h3>${waiting.map(swapRow).join("")}</div>` : ""}
      ${opts}
      <h3 class="at-gap">Take Attendance <small class="at-sub">${n.P} present · ${n.L} late · ${n.E} excused · ${n.A} absent · ${studs.length - marked} not marked</small></h3>
      <div class="adm-tools"><span>Set every unmarked student to</span>${["P", "L", "E", "A"].map((k) => `<button type="button" class="btn ghost small" data-all="${k}">${ST[k]}</button>`).join("")}${slot ? `<button type="button" class="btn ghost small" data-addin>+ Add a student from another section</button><button type="button" class="btn ghost small" data-lswap="${slot}">⇄ Swap lab session</button>` : ""}</div>
      ${!studs.length ? `<p class="adm-empty">No students in this section. Load the class list first (Class List tab).</p>` :
      `<div class="adm-scroll"><table class="adm at-take"><thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">Group</th><th scope="col">Status</th><th scope="col">Remark</th><th scope="col">Marked</th></tr></thead><tbody>${rows}</tbody></table></div>`}
      ${out.length ? `<p class="small-note">Swapped out of this lab: ${out.map((r) => `${esc(r.name)} (to ${SEC_SHORT[moveOf(slot, r.id).section] || "–"})`).join(", ")}.</p>` : ""}
      <p class="small-note">Your marks are saved only when you press <strong>Save</strong> in the bar at the bottom.</p>`;
    if (s.state === "open") {
      paintKey($(".at-keyarea"), s.id, false);
      // keep changing this session's key while this page is open, and draw it only while its own page is shown
      if (!L.watched.has(s.id)) { L.watched.add(s.id); keyWatch(s.id, () => { if (L.sid === s.id) paintKey($(".at-keyarea"), s.id, false); }); }
    }
  }
  function paintSaveBar() {
    const bar = $(".at-savebar");
    if (!bar) return;
    const n = L.sid ? editsFor(L.sid).length : 0;
    bar.hidden = !n;
    if (n) bar.innerHTML = `<div class="wrap"><span><strong>${n}</strong> unsaved change${n === 1 ? "" : "s"}</span><button type="button" class="btn" data-save>Save</button><button type="button" class="btn ghost" data-undo>Undo changes</button></div>`;
  }
  async function saveEdits() {
    const s = L.sessions.find((x) => x.id === L.sid);
    if (!s) return;
    const list = editsFor(s.id), missing = list.filter(([k, e]) => !e.status && !recOf(s.id, k.split("|")[1]));
    if (missing.length) { say("Choose a Status First", `${missing.length} student${missing.length === 1 ? " has" : "s have"} a remark but no status. Choose P, L, E or A for them, then save.`); return; }
    const b = db.batch();
    list.forEach(([k, e]) => {
      const email = k.split("|")[1], x = recOf(s.id, email);
      b.set(db.collection("attendance").doc(`${s.id}_${email}`), Object.assign(recBase(s, email, e.status || x.status), { remark: e.remark !== undefined ? e.remark.trim() : (x && x.remark) || "" }));
    });
    try { await b.commit(); list.forEach(([k]) => delete L.edits[k]); draw(); }
    catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
  }
  const leaveOk = () => !L.sid || !editsFor(L.sid).length || confirm("You have unsaved attendance changes. Leave without saving?") ? (L.sid && editsFor(L.sid).forEach(([k]) => delete L.edits[k]), true) : false;

  async function openSession(s) {
    const mode = ($("input[name=mode]:checked") || {}).value || "rotate", late = $("input[name=late]").checked, lateMin = Math.max(1, Math.min(180, +$("input[name=lateMin]").value || 15));
    try {
      await db.collection("sessionKeys").doc(s.id).set({ cur: newKey(), prev: "", mode, changedAt: firebase.firestore.Timestamp.now() });
      await db.collection("sessions").doc(s.id).update({ state: "open", openedAt: FV.serverTimestamp(), lateAfter: late ? lateMin : 0, openedBy: A.state.user.email.toLowerCase(), slot: slotOf(s) });
    } catch (ex) { say("Could Not Open Attendance", `${esc(ex.code || ex)}. If this says permission-denied, publish the latest firebase/firestore.rules in the Firebase console.`); }
  }
  function closeSession(s) {
    const un = studentsFor(s).filter((r) => !recOf(s.id, r.id));
    const ok = un.filter((r) => (noticeOf(s.id, r.id) || {}).status === "approved"), wait = un.filter((r) => (noticeOf(s.id, r.id) || {}).status === "pending");
    const p = panel(`<h3>Close Attendance</h3><p>Students can no longer mark themselves. You can still change any mark by hand.</p>
      ${un.length ? `<label class="at-late"><input type="checkbox" checked data-abs> Mark the <strong>${un.length}</strong> student${un.length === 1 ? "" : "s"} not marked yet as <strong>Absent</strong>${ok.length ? `, except <strong>${ok.length}</strong> with an approved absence notice (marked Excused)` : ""}</label>
        ${wait.length ? `<p class="small-note">${wait.length} of them sent an absence notice that is still waiting: they are marked Absent until you approve it.</p>` : ""}` : `<p><strong>Every student is marked.</strong></p>`}<p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Close attendance</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", p).addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const b = db.batch();
        if (un.length && $("[data-abs]", p).checked) un.forEach((r) => {
          const nt = noticeOf(s.id, r.id), exc = nt && nt.status === "approved";
          b.set(db.collection("attendance").doc(`${s.id}_${r.id}`), Object.assign(recBase(s, r.id, exc ? "E" : "A", "auto"), { remark: exc ? `${REASONS[nt.reason] || nt.reason}: ${nt.detail}`.slice(0, 200) : nt && nt.status === "pending" ? "Absence notice waiting for approval" : "" }));
        });
        b.update(db.collection("sessions").doc(s.id), { state: "closed", closedAt: FV.serverTimestamp() });
        b.set(db.collection("sessionKeys").doc(s.id), { cur: "", prev: "", mode: "closed", changedAt: firebase.firestore.Timestamp.now() });
        await b.commit(); closePanel();
      } catch (ex) { e.target.disabled = false; $(".at-err", p).textContent = `Could not close it (${ex.code || ex}).`; }
    });
  }
  const recBase = (s, email, status, by) => ({ session: s.id, email, status, by: by || A.state.user.email.toLowerCase(), at: FV.serverTimestamp(), semester: SEM, kind: s.kind, date: s.date, title: s.title });
  // the lecturer moves a student into this lab session for this lab only (no swap partner)
  function addIn(s) {
    const slot = slotOf(s), list = L.roster.filter((r) => r.status === "active" && r.section !== s.section && !moveOf(slot, r.id)).map((r) => ({ m: String(r.matric), n: r.name, s: r.section, g: r.group, email: r.id }));
    let who = null;
    const p = panel(`<h3>Add a Student to ${esc(labName(s))} (${SECTION[s.section]})</h3><p>For this lab only. The student checks in here instead of their own section.</p><div class="at-pickbox"></div>
      <p class="at-err" aria-live="polite"></p><div class="acc-row"><button type="button" class="btn" data-go>Add</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    picker($(".at-pickbox", p), list, (x) => { who = x; }, "Student");
    $("[data-go]", p).addEventListener("click", async () => {
      if (!who) { $(".at-err", p).textContent = "Choose a student."; return; }
      try { await db.collection("labMoves").doc(`${slot}_${who.email}`).set({ semester: SEM, slot, email: who.email, section: s.section, group: 0, swap: "", by: A.state.user.email.toLowerCase(), at: FV.serverTimestamp() }); closePanel(); }
      catch (ex) { $(".at-err", p).textContent = `Could not add (${ex.code || ex}).`; }
    });
  }

  /* ---------- swaps ---------- */
  const SW = { requested: "Waiting for the classmate", accepted: "Waiting for your approval", approved: "Approved", declined: "Declined by the classmate", rejected: "Not approved", cancelled: "Cancelled", ended: "Ended" };
  const swapRow = (x) => `<div class="at-req" data-swid="${x.id}"><p><strong>${esc(x.labTitle)}</strong>${x.term ? ` <span class="at-tag approved">whole semester</span>` : ""}: ${x.kind === "group" ? `${esc(x.fromName)} ⇄ ${esc(x.toName)}` : `${esc(x.fromName)} (${SEC_SHORT[x.fromSection] || "–"} G${x.fromGroup || "–"}) ⇄ ${esc(x.toName)} (${SEC_SHORT[x.toSection] || "–"} G${x.toGroup || "–"})`}
      · <span class="at-tag ${x.status}">${SW[x.status] || x.status}</span>${x.note ? `<br><small>“${esc(x.note)}”</small>` : ""}<br><small>${x.byLecturer ? "Made by the lecturer" : "Asked"} ${fmtStamp(x.createdAt)}${x.auto ? ` · accepted by the classmate ${fmtStamp(x.updatedAt)}` : ""}</small></p>
      <div class="acc-row">${x.status === "accepted" ? `<button type="button" class="btn small" data-swok>Approve</button><button type="button" class="btn ghost small" data-swno>Reject</button>` : x.status === "approved" ? `<button type="button" class="btn ghost small" data-swundo>${x.term ? "End this swap" : "Cancel this swap"}</button>` : x.status === "requested" ? `<button type="button" class="btn ghost small" data-swno>Reject</button>` : ""}</div></div>`;
  function drawSwaps(body) {
    const order = { accepted: 0, requested: 1, approved: 2, ended: 3, rejected: 4, declined: 5, cancelled: 6 };
    const list = L.swaps.slice().sort((a, b) => order[a.status] - order[b.status] || tsMs(b.createdAt) - tsMs(a.createdAt));
    body.innerHTML = `<p class="widget-lead">A swap is always one student with one student. The student who asks chooses <strong>one lab only</strong> or <strong>every lab to the end of the semester</strong> (from a lab neither section has started). When the classmate accepts, the swap is done straight away: the two change places (section and group) for those labs, and it shows here and in your notification bell. A pair sends two requests, one each. You can cancel or end any swap, and swap two students or two whole lab groups yourself.</p>
      <div class="adm-tools"><button type="button" class="btn" data-lswap>+ Swap lab session</button></div>
      ${list.length ? list.map(swapRow).join("") : `<p class="adm-empty">No swap requests yet.</p>`}`;
  }
  // the labs of the semester in date order: { slot, name, date, list of its sessions }
  function labSlots() {
    const labs = {};
    L.sessions.filter((s) => s.kind === "lab" && slotOf(s)).forEach((s) => { const k = slotOf(s); if (!labs[k]) labs[k] = { slot: k, name: labName(s), date: s.date, list: [] }; labs[k].list.push(s); if (s.date < labs[k].date) labs[k].date = s.date; });
    return Object.values(labs).sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  // why a whole-semester swap can't start at this lab for these sections ("" when it can): every session of the two
  // sections must still be ahead (today or later), not opened, with no attendance
  const notYet = (lab, secs) => {
    const ss = lab.list.filter((s) => secs.includes(s.section));
    if (!ss.length) return "no session for these sections";
    if (ss.some((s) => held(s))) return "already held";
    if (ss.some((s) => s.date < todayIso())) return "date passed";
    return "";
  };
  // the lecturer swaps two students, or two whole lab groups, in different sections: for one lab, or for every lab
  // from a chosen one to the end of the semester. It takes effect straight away (no request, no acceptance).
  function lecturerSwap(pre) {
    const labs = labsByNo(L.sessions);
    if (!labs.length) { say("No Labs Yet", "Create the lab sessions first (Sessions tab)."); return; }
    const active = L.roster.filter((r) => r.status === "active" && r.section);
    const studs = active.map((r) => ({ m: String(r.matric), n: r.name, s: r.section, g: r.group, email: r.id }));
    const lastPt = (l) => l.parts[l.parts.length - 1];
    let lab = labs.find((l) => l.slots.includes(pre)) || labs.find((l) => l.parts.some((pt) => pt.list.some((x) => nowMs() <= endMs(x)))) || labs[labs.length - 1], a = null, c = null, q = "";
    const p = panel(`<h3>Swap Lab Session</h3><p class="small-note">Each side takes the other's section and group. It takes effect straight away.</p>
      <label>Lab<select class="at-in" data-lab>${labs.map((l) => `<option value="${l.no}"${l === lab ? " selected" : ""}>${esc(l.label)}</option>`).join("")}</select></label>
      <div class="at-pk-a"></div>
      <div class="at-step2" hidden><p class="at-q">Swap with</p><input class="at-in at-sq" type="search" autocomplete="off" placeholder="Find a name or matric number" aria-label="Find the second student"><div class="at-cands"></div></div>
      <div class="at-grpbox"></div>
      <p class="at-q">Do you want to switch for all labs for the entire semester?</p>
      <div class="at-fs at-radios" role="radiogroup" aria-label="How long"><label><input type="radio" name="term" value="one" checked><span>No. Swap this lab session only.</span></label><label><input type="radio" name="term" value="all"><span>Yes. Swap this lab session and every lab session after it, until the end of the semester.</span></label></div>
      <div class="at-swdates"></div>
      <label class="at-notel">Note (optional)<input class="at-in" name="note" maxlength="200" placeholder="e.g. Asked in person on the lab day"></label>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Confirm the swap</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    const term = () => ($("input[name=term]:checked", p) || {}).value === "all";
    const groupOf = (x) => active.filter((r) => r.section === x.s && (r.group || 0) === (x.g || 0) && x.g);
    // the two sides: the two students, or their whole groups when that box is ticked
    const sides = () => {
      const whole = !!($("[data-whole]", p) || {}).checked && a && c;
      if (whole) return { who: "group", A1: groupOf(a), B1: groupOf(c), sideA: { sec: a.s, g: a.g || 0, label: `${secName(a.s)} Group ${a.g}` }, sideB: { sec: c.s, g: c.g || 0, label: `${secName(c.s)} Group ${c.g}` } };
      return { who: "pair", A1: [active.find((r) => r.id === a.email)], B1: [active.find((r) => r.id === c.email)], sideA: { sec: a.s, g: a.g || 0, label: a.n }, sideB: { sec: c.s, g: c.g || 0, label: c.n } };
    };
    // the lab parts to swap: this lab (the parts not ended for either section), and every later lab for the whole semester
    const plan = (o) => (term() ? labs.filter((l) => l.no >= lab.no) : [lab]).map((l) => ({ l, parts: l.parts.filter((pt) => partOpen(pt, [o.sideA.sec, o.sideB.sec])) })).filter((x) => x.parts.length);
    const paint = () => {
      $(".at-step2", p).hidden = !a;
      if (a) {
        const ql = q.trim().toLowerCase(), groups = {};
        studs.filter((x) => x.s !== a.s && (!ql || `${x.n} ${x.m}`.toLowerCase().includes(ql)))
          .sort((x, y) => (x.s + String(x.g || 0).padStart(2, "0") + x.n < y.s + String(y.g || 0).padStart(2, "0") + y.n ? -1 : 1))
          .forEach((x) => { const k = `${x.s}|${x.g || 0}`; (groups[k] = groups[k] || []).push(x); });
        $(".at-cands", p).innerHTML = Object.entries(groups).map(([k, xs]) => { const [sec, g] = k.split("|");
          return `<div class="at-cg"><h4>${secName(sec)} · Group ${+g || "–"} <small>${whenS(inSec(lastPt(lab), sec))}</small></h4>${xs.map((x) => `<button type="button" class="at-cand" data-m="${esc(x.m)}" aria-pressed="${!!c && c.m === x.m}">${esc(x.n)} <small>${esc(x.m)}</small></button>`).join("")}</div>`; }).join("") || `<p class="small-note">No match.</p>`;
      }
      const ga = a ? groupOf(a) : [], gc = c ? groupOf(c) : [], was = !!($("[data-whole]", p) || {}).checked;
      $(".at-grpbox", p).innerHTML = a && c && (ga.length > 1 || gc.length > 1) ? `<label class="at-late"><input type="checkbox" data-whole${was ? " checked" : ""}> Swap their whole groups: ${secName(a.s)} Group ${a.g} (${ga.map((r) => esc(r.name)).join(", ")}) ⇄ ${secName(c.s)} Group ${c.g} (${gc.map((r) => esc(r.name)).join(", ")})</label>` : "";
      if (!a || !c) { $(".at-swdates", p).innerHTML = ""; return; }
      const o = sides(), pl = plan(o), skipped = lab.parts.filter((pt) => !partOpen(pt, [o.sideA.sec, o.sideB.sec]));
      $(".at-swdates", p).innerHTML = !pl.length ? `<p class="at-warn">Lab ${lab.no} has already ended for these sections. Choose a later lab above.</p>` : `
        <div class="adm-scroll"><table class="adm at-ba"><thead><tr><th scope="col">Lab session</th><th scope="col">${esc(o.sideA.label)} goes to</th><th scope="col">${esc(o.sideB.label)} goes to</th></tr></thead><tbody>
        ${pl.flatMap(({ l, parts }) => parts.map((pt) => `<tr><td>Lab ${l.no}${l.multi ? `, Part ${pt.k}` : ""}</td><td>${secName(o.sideB.sec)}: ${whenS(inSec(pt, o.sideB.sec))}</td><td>${secName(o.sideA.sec)}: ${whenS(inSec(pt, o.sideA.sec))}</td></tr>`)).join("")}</tbody></table></div>
        ${skipped.length && lab.multi ? `<p class="small-note">Already ended, not changed: ${skipped.map((pt) => `Lab ${lab.no}, Part ${pt.k}`).join(", ")}.</p>` : ""}
        ${term() ? `<p class="small-note">Labs added to the timetable later in the semester follow this swap too.</p>` : ""}`;
    };
    picker($(".at-pk-a", p), studs, (x) => { a = x; c = null; q = ""; $(".at-sq", p).value = ""; $(".at-err", p).textContent = ""; paint(); }, "Student");
    p.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b && a) { c = studs.find((x) => x.m === b.dataset.m); $(".at-err", p).textContent = ""; paint(); } });
    p.addEventListener("change", (e) => { if (e.target.matches("[data-lab]")) lab = labs.find((l) => l.no === +e.target.value); if (e.target.matches("[data-lab], input[name=term], [data-whole]")) paint(); });
    $(".at-sq", p).addEventListener("input", (e) => { q = e.target.value; paint(); });
    $("[data-go]", p).addEventListener("click", async (e) => {
      const err = $(".at-err", p);
      if (!a || !c) { err.textContent = "Choose both students."; return; }
      const o = sides(), pl = plan(o);
      if (!pl.length) { err.textContent = `Lab ${lab.no} has already ended for these sections. Choose a later lab.`; return; }
      const slots = [...new Set(pl.flatMap((x) => x.parts.flatMap(partSlots)))];
      const busy = [];
      slots.forEach((k) => o.A1.concat(o.B1).forEach((r) => { if (moveOf(k, r.id)) busy.push(r.name); }));
      if (busy.length) { err.textContent = `Already swapped or moved: ${[...new Set(busy)].slice(0, 6).join(", ")}. Cancel that first.`; return; }
      e.target.disabled = true;
      const by = A.state.user.email.toLowerCase(), ref = db.collection("swaps").doc(), all = term(), note = ($("input[name=note]", p).value || "").trim().slice(0, 200);
      const moves = o.A1.map((r) => ({ e: r.id, s: o.sideB.sec, g: o.sideB.g })).concat(o.B1.map((r) => ({ e: r.id, s: o.sideA.sec, g: o.sideA.g })));
      const pair = o.who === "pair", fa = o.A1[0], fc = o.B1[0], first = pl[0].parts[0].list[0];
      try {
        const b = db.batch();
        b.set(ref, { semester: SEM, slot: slots[0], slots, term: all, kind: o.who, moves, startDate: first.date, labNo: lab.no,
          labTitle: all ? `Every lab session from Lab ${lab.no}` : `Lab ${lab.no}`,
          fromEmail: pair ? fa.id : "", fromMatric: pair ? String(fa.matric) : "", fromName: pair ? fa.name : `${o.sideA.label} (${o.A1.length} student${o.A1.length === 1 ? "" : "s"})`, fromSection: o.sideA.sec, fromGroup: o.sideA.g,
          toMatric: pair ? String(fc.matric) : "", toName: pair ? fc.name : `${o.sideB.label} (${o.B1.length} student${o.B1.length === 1 ? "" : "s"})`, toSection: o.sideB.sec, toGroup: o.sideB.g,
          note, status: "approved", byLecturer: true, decidedBy: by, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
        slots.forEach((k) => moves.forEach((m) => b.set(db.collection("labMoves").doc(`${k}_${m.e}`), { semester: SEM, slot: k, email: m.e, section: m.s, group: m.g || 0, swap: ref.id, by, at: FV.serverTimestamp() })));
        await b.commit(); closePanel();
      } catch (ex) { e.target.disabled = false; err.textContent = `Could not swap them (${ex.code || ex}).`; }
    });
  }
  async function decideSwap(id, ok) {
    const x = L.swaps.find((y) => y.id === id);
    if (!x) return;
    const by = A.state.user.email.toLowerCase();
    try {
      const b = db.batch();
      b.update(db.collection("swaps").doc(id), { status: ok ? "approved" : "rejected", decidedBy: by, updatedAt: FV.serverTimestamp() });
      if (ok) {
        const a = L.roster.find((r) => r.id === x.fromEmail), c = L.roster.find((r) => String(r.matric) === String(x.toMatric));
        if (!a || !c) { say("Student Not Found", "One of the two students is no longer on the class list."); return; }
        b.set(db.collection("labMoves").doc(`${x.slot}_${a.id}`), { semester: SEM, slot: x.slot, email: a.id, section: c.section, group: c.group || 0, swap: id, by, at: FV.serverTimestamp() });
        b.set(db.collection("labMoves").doc(`${x.slot}_${c.id}`), { semester: SEM, slot: x.slot, email: c.id, section: a.section, group: a.group || 0, swap: id, by, at: FV.serverTimestamp() });
      }
      await b.commit();
    } catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
  }
  async function undoSwap(id) {
    const x = L.swaps.find((y) => y.id === id);
    if (!x) return;
    const mine = L.moves.filter((m) => m.swap === id), labs = labSlots(), secs = [x.fromSection, x.toSection];
    // labs already held keep the swap (their attendance was taken in the swapped sections)
    const keepSlots = new Set(x.term ? labs.filter((l) => notYet(l, secs)).map((l) => l.slot) : []), drop = mine.filter((m) => !keepSlots.has(m.slot));
    const kept = new Set(mine.filter((m) => keepSlots.has(m.slot)).map((m) => m.slot));
    if (!confirm(kept.size ? `End this swap? Labs not held yet go back to the students' own sections. The ${kept.size} lab${kept.size === 1 ? "" : "s"} already held stay${kept.size === 1 ? "s" : ""} as ${kept.size === 1 ? "it was" : "they were"}.`
      : x.term ? "Cancel this swap? Every lab goes back to the students' own sections." : "Cancel this approved swap? Both go back to their own section for this lab.")) return;
    try {
      const b = db.batch();
      b.update(db.collection("swaps").doc(id), Object.assign({ status: kept.size ? "ended" : "cancelled", updatedAt: FV.serverTimestamp() }, x.term ? { slots: [...kept] } : {}));
      drop.forEach((m) => b.delete(db.collection("labMoves").doc(m.id)));
      await b.commit();
    } catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
  }

  /* ---------- absence notices ---------- */
  function drawNotices(body) {
    const order = { pending: 0, approved: 1, rejected: 2 };
    const list = L.notices.slice().sort((a, b) => order[a.status] - order[b.status] || (a.date < b.date ? 1 : -1));
    const up = L.up || {}, last = up.lastRun && up.lastRun.toMillis ? up.lastRun.toMillis() : 0;
    body.innerHTML = `<p class="widget-lead">Students tell you before or after a session (backdated) why they can't attend, with their supporting document${up.on ? "" : ` (by email to ${COORDINATOR} while the upload below is off)`}. <strong>Approve</strong> marks them Excused; <strong>Reject</strong> leaves them Absent.</p>
      <details class="at-card at-upset"${up.on ? "" : " open"}><summary><strong>Document upload</strong> · ${up.on ? "on" : "off: students email their documents"}${up.on ? ` · ${last ? `your Drive script last ran ${fmtStamp(up.lastRun)}` : "the Drive script hasn't run yet"}` : ""}</summary>
        <label class="at-late"><input type="checkbox" data-upon${up.on ? " checked" : ""}> Students attach their supporting document to the notice (PDF, JPG or PNG, up to 5 MB)</label>
        <p class="small-note at-upmsg" aria-live="polite"></p>
        <p class="small-note">You can open each document here at once. Your Google Apps Script then moves it into your Drive folder every 5 minutes and puts the Drive link on the notice. Set it up once with the steps at the top of <a href="apps-script/notices.gs" target="_blank" rel="noopener">apps-script/notices.gs</a> (no deployment needed).</p></details>
      ${!list.length ? `<p class="adm-empty">No absence notices yet.</p>` : list.map((n) => { const s = L.sessions.find((x) => x.id === n.session); return `<div class="at-req" data-nid="${n.id}">
        <p>${profileLink(n.email, n.name)} (${esc(n.matric)}) · <strong>${fmtDate(n.date)} · ${esc(n.title)}</strong>${s ? ` <small>(${s.state === "closed" ? "held" : s.state === "open" ? "open now" : "not yet held"})</small>` : ""}<br>
        <strong>${REASONS[n.reason] || n.reason}</strong>: ${esc(n.detail)}${n.doc ? `<br>${n.doc.url ? docLink(n.doc, `View document in Drive (${n.doc.name || "file"})`) : n.doc.upload ? `<button type="button" class="btn ghost small" data-upview="${esc(n.doc.upload)}">📎 View document (${esc(n.doc.name || "file")})</button> <small>moving to your Drive</small>` : ""}` : ""}<br><small>Sent ${fmtStamp(n.at)} · <span class="at-tag ${n.status}">${{ pending: "Waiting", approved: "Approved", rejected: "Not approved" }[n.status]}</span>${n.note ? ` · your note: ${esc(n.note)}` : ""}</small></p>
        ${n.status === "pending" ? `<div class="at-row"><input class="at-in at-nnote" maxlength="200" placeholder="Note to the student (optional)" aria-label="Note to ${esc(n.name)}"><button type="button" class="btn small" data-nok>Approve</button><button type="button" class="btn ghost small" data-nno>Reject</button></div>`
          : `<button type="button" class="btn ghost small" data-nre>Change decision</button>`}</div>`; }).join("")}`;
  }
  async function decideNotice(id, ok, note) {
    const n = L.notices.find((x) => x.id === id);
    if (!n) return;
    const s = L.sessions.find((x) => x.id === n.session), by = A.state.user.email.toLowerCase();
    try {
      const b = db.batch();
      b.update(db.collection("notices").doc(id), { status: ok ? "approved" : "rejected", note: note || "", decidedBy: by, decidedAt: FV.serverTimestamp() });
      // a session already held: an approved notice turns the mark into Excused; a rejected one leaves an Absent
      if (s && s.state !== "planned") {
        const x = recOf(s.id, n.email);
        if (ok) b.set(db.collection("attendance").doc(`${s.id}_${n.email}`), Object.assign(recBase(s, n.email, "E"), { remark: `${REASONS[n.reason] || n.reason}: ${n.detail}`.slice(0, 200) }));
        else if (x && x.remark === "Absence notice waiting for approval") b.update(db.collection("attendance").doc(x.id), { remark: "Absence notice not approved" });
      }
      await b.commit();
    } catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
  }

  /* ---------- the class list and lab groups ---------- */
  function drawRoster(body) {
    const q = L.q.trim().toLowerCase();
    const list = L.roster.filter((r) => (L.rsec === "all" || (L.rsec === "none" ? !r.section : r.section === L.rsec)) && (!q || `${r.name} ${r.matric} ${r.id} ${r.rps}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.status !== b.status ? (a.status === "active" ? -1 : 1) : (a.section || "z") + String(a.group).padStart(2, "0") + a.name < (b.section || "z") + String(b.group).padStart(2, "0") + b.name ? -1 : 1));
    const by = (sec) => L.roster.filter((r) => r.status === "active" && (sec === "none" ? !r.section : r.section === sec)).length;
    const acct = Object.fromEntries(L.users.map((u) => [String(u.email || "").toLowerCase(), u]));
    const partner = (r) => L.roster.find((x) => x.id !== r.id && x.status === "active" && r.section && x.section === r.section && r.group && x.group === r.group);
    const pct = (r) => { const l = L.att.filter((x) => x.email === r.id); if (!l.length) return "–"; return Math.round((l.reduce((a, x) => a + POINTS[x.status], 0) / (2 * l.length)) * 100) + "%"; };
    const tools = `<div class="adm-tools"><label class="btn ghost small at-file">Load a class list file…<input type="file" accept=".json,.xls,.html,.htm" data-file hidden></label><button type="button" class="btn ghost small" data-addstu>+ Add a student</button>
        <button type="button" class="btn ghost small" data-rcsv>Download CSV</button><input type="search" data-q placeholder="Search name, matric, email or RPS" value="${esc(L.q)}" aria-label="Search the class list"></div>
      <div class="adm-tools">${[["list", "Student list"], ["groups", "Lab groups"]].map(([v, l]) => `<button type="button" class="chip-btn" data-rview="${v}" aria-pressed="${L.rview === v}">${l}</button>`).join("")} ·
        ${[["all", `All (${L.roster.length})`], ["mon", `Monday (${by("mon")})`], ["wed", `Wednesday (${by("wed")})`], ["thu", `Thursday (${by("thu")})`], ["none", `No lab section (${by("none")})`]].map(([v, l]) => `<button type="button" class="chip-btn" data-rsec="${v}" aria-pressed="${L.rsec === v}">${l}</button>`).join("")}</div>`;
    if (!L.roster.length) { body.innerHTML = tools + `<p class="adm-empty">The class list is empty. Press <strong>Load a class list file</strong> and choose <code>nmk42003-classlist.json</code> (in your <code>_source</code> folder), or the student list downloaded from URLearn (.xls). Phone numbers are never saved.</p>`; return; }
    if (L.rview === "groups") {
      const secs = (L.rsec === "all" || L.rsec === "none" ? ["mon", "wed", "thu"] : [L.rsec]);
      body.innerHTML = tools + `<div class="at-groups">${secs.map((sec) => {
        const studs = L.roster.filter((r) => r.status === "active" && r.section === sec), gs = [...new Set(studs.map((r) => r.group || 0))].sort((a, b) => a - b);
        return `<div class="at-card"><h3>${SECTION[sec]} <small class="at-sub">${SECTION_TIME[sec]} · ${studs.length} students</small></h3><ol class="at-glist">${gs.map((g) => `<li><span class="at-gn">${g ? `Group ${g}` : "No group"}</span>${studs.filter((r) => (r.group || 0) === g).map((r) => profileLink(r.id, r.name)).join("<br>")}</li>`).join("")}</ol></div>`;
      }).join("")}</div>`;
      return;
    }
    body.innerHTML = tools + `<div class="adm-scroll"><table class="adm at-ros"><thead><tr><th scope="col">Student</th><th scope="col">Lab section</th><th scope="col">Group</th><th scope="col">Lab partner</th><th scope="col">RPS (student advisor)</th><th scope="col">Account</th><th scope="col">Attendance</th><th scope="col">Status</th><th scope="col"><span class="vh">Edit</span></th></tr></thead><tbody>
      ${list.map((r) => { const u = acct[r.id], pt = partner(r); return `<tr data-em="${esc(r.id)}" class="${r.status === "active" ? "" : "dropped"}"><td>${profileLink(r.id, r.name)}<br><small>${esc(r.matric)} · ${esc(r.id)}</small></td>
        <td><select data-f="section" aria-label="Lab section of ${esc(r.name)}"><option value=""${!r.section ? " selected" : ""}>None</option>${["mon", "wed", "thu"].map((v) => `<option value="${v}"${r.section === v ? " selected" : ""}>${SECTION[v].replace(" lab", "")}</option>`).join("")}</select></td>
        <td><input type="number" min="0" max="30" data-f="group" value="${r.group || ""}" aria-label="Lab group of ${esc(r.name)}" class="at-grp"></td>
        <td>${pt ? esc(pt.name) : "–"}</td>
        <td>${esc(r.rps || "–")}<br><small>${esc(r.rpsEmail || "")}</small></td>
        <td>${u ? `<span class="adm-st ${u.status}">${u.status === "approved" ? "Signed in" : u.status}</span>` : `<small>Never signed in</small>`}</td>
        <td>${pct(r)}</td>
        <td><select data-f="status" aria-label="Status of ${esc(r.name)}"><option value="active"${r.status === "active" ? " selected" : ""}>Active</option><option value="dropped"${r.status !== "active" ? " selected" : ""}>Dropped</option></select></td>
        <td><button type="button" class="btn ghost small" data-editstu="${esc(r.id)}">Edit</button></td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function rosterCsv() {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`, acct = Object.fromEntries(L.users.map((u) => [String(u.email || "").toLowerCase(), u]));
    const lines = [["Name", "Matric", "Email", "Programme", "Lab section", "Group", "RPS", "RPS email", "Account", "Status"].map(q).join(",")]
      .concat(L.roster.map((r) => [r.name, r.matric, r.id, r.programme || "", r.section ? SECTION[r.section] : "", r.group || "", r.rps || "", r.rpsEmail || "", acct[r.id] ? acct[r.id].status : "never signed in", r.status].map(q).join(",")));
    download(lines, `NMK42003-class-list-${todayIso()}.csv`);
  }
  function download(lines, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function studentForm(r) {
    const isNew = !r;
    r = r || { name: "", matric: "", id: "", section: "", group: "", rps: "", rpsEmail: "", status: "active" };
    const p = panel(`<h3>${isNew ? "Add a Student" : "Edit Student"}</h3><form class="at-dform" novalidate>
      <label>Name<input name="name" value="${esc(r.name)}" required></label>
      <div class="at-two"><label>Matric number<input name="matric" value="${esc(r.matric)}" required></label><label>Studentmail address<input name="email" type="email" value="${esc(r.id)}" required></label></div>
      ${isNew ? "" : `<p class="small-note">Changing the studentmail address moves this student's attendance, absence notices and lab swaps to the new address. They then sign in with the new address.</p>`}
      <div class="at-two"><label>Lab section<select name="section"><option value="">None</option>${["mon", "wed", "thu"].map((v) => `<option value="${v}"${r.section === v ? " selected" : ""}>${SECTION[v]}</option>`).join("")}</select></label><label>Lab group<input name="group" type="number" min="0" max="30" value="${r.group || ""}"></label></div>
      <div class="at-two"><label>RPS name<input name="rps" value="${esc(r.rps || "")}"></label><label>RPS email<input name="rpsEmail" type="email" value="${esc(r.rpsEmail || "")}"></label></div>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">${isNew ? "Add" : "Save"}</button>${isNew ? "" : `<button type="button" class="btn ghost" data-remove>Remove from the list</button>`}<button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", p).addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries()), em = v.email.trim().toLowerCase();
      if (!v.name.trim() || !v.matric.trim() || !/@studentmail\.unimap\.edu\.my$/.test(em)) { $(".at-err", p).textContent = "Fill in the name, matric number and a @studentmail.unimap.edu.my address."; return; }
      const data = { name: v.name.trim().toUpperCase(), matric: v.matric.trim(), email: em, section: v.section, group: +v.group || 0, rps: v.rps.trim(), rpsEmail: v.rpsEmail.trim().toLowerCase(), status: r.status || "active", semester: SEM };
      if (isNew && L.roster.some((x) => x.id === em)) { $(".at-err", p).textContent = "This studentmail address is already on the class list."; return; }
      try {
        if (!isNew && em !== r.id) {
          if (L.roster.some((x) => x.id === em)) { $(".at-err", p).textContent = "Another student on the class list already has this studentmail address."; return; }
          if (!confirm(`Change ${r.name}'s studentmail address from ${r.id} to ${em}? Their attendance, absence notices and lab swaps move with them.`)) return;
          $(".at-err", p).textContent = "Moving the records…";
          await changeEmail(r, em, Object.assign({}, r, data));
        } else await db.collection("roster").doc(em).set(data, { merge: true });
        closePanel();
      } catch (ex) { $(".at-err", p).textContent = `Could not save (${ex.code || ex}).`; }
    });
    const rm = $("[data-remove]", p);
    if (rm) rm.addEventListener("click", async () => {
      if (!confirm(`Remove ${r.name} from the class list? Their attendance records are kept. To keep them on the list but out of sessions, set them to Dropped instead.`)) return;
      try { await db.collection("roster").doc(r.id).delete(); closePanel(); } catch (ex) { $(".at-err", p).textContent = `Could not remove (${ex.code || ex}).`; }
    });
  }
  // A student's studentmail address is the id of their class-list entry and part of the id of their records, so a new
  // address means new records: copy each one to the new id, then delete the old (in batches of up to 400 writes).
  async function changeEmail(r, em, data) {
    const old = r.id, ops = [];
    const strip = (x) => { const o = Object.assign({}, x); delete o.id; return o; };
    ops.push((b) => b.set(db.collection("roster").doc(em), strip(data)));
    L.att.filter((x) => x.email === old).forEach((x) => { ops.push((b) => b.set(db.collection("attendance").doc(`${x.session}_${em}`), Object.assign(strip(x), { email: em }))); ops.push((b) => b.delete(db.collection("attendance").doc(x.id))); });
    L.notices.filter((x) => x.email === old).forEach((x) => { ops.push((b) => b.set(db.collection("notices").doc(`${x.session}_${em}`), Object.assign(strip(x), { email: em }))); ops.push((b) => b.delete(db.collection("notices").doc(x.id))); });
    L.moves.filter((x) => x.email === old).forEach((x) => { ops.push((b) => b.set(db.collection("labMoves").doc(`${x.slot}_${em}`), Object.assign(strip(x), { email: em }))); ops.push((b) => b.delete(db.collection("labMoves").doc(x.id))); });
    L.swaps.filter((x) => x.fromEmail === old).forEach((x) => ops.push((b) => b.update(db.collection("swaps").doc(x.id), { fromEmail: em })));
    // the old entry goes last, so nothing is lost if a batch fails half way
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
    await db.collection("roster").doc(old).delete();
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
    const p = panel(`<h3>Load the Class List</h3><p><strong>${list.length} students</strong> in this file: ${fresh} new, ${list.length - fresh} already on the list (their names and RPS are updated${list.some((s) => s.section) ? ", and their lab section and group" : "; their lab section and group stay as they are"}).</p>
      <p class="small-note">Only the name, matric number, studentmail address, programme, lab section and group, and RPS are saved. Phone numbers are not.</p><p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Load ${list.length} students</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", p).addEventListener("click", async (e) => {
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
        closePanel();
      } catch (ex) { e.target.disabled = false; $(".at-err", p).textContent = `Could not load it (${ex.code || ex}).`; }
    });
  }

  /* ---------- the report ---------- */
  function reportData() {
    const ses = sortedSessions().filter((s) => (s.state !== "planned" || L.att.some((x) => x.session === s.id)) && (L.rkind === "all" || s.kind === L.rkind) && (L.rsec === "all" || L.rsec === "none" || s.section === "all" || s.section === L.rsec));
    const studs = L.roster.filter((r) => r.status === "active" && (L.rsec === "all" || (L.rsec === "none" ? !r.section : r.section === L.rsec)))
      .sort((a, b) => ((a.section || "z") + a.name < (b.section || "z") + b.name ? -1 : 1));
    const rows = studs.map((r) => {
      // a student's own session for each lab: their section, or the one they swapped into
      const cells = ses.map((s) => { const m = s.kind === "lab" ? moveOf(slotOf(s), r.id) : null, sec = m ? m.section : r.section; return s.section === "all" || s.section === sec ? (recOf(s.id, r.id) || {}).status || "" : null; });
      const n = { P: 0, L: 0, E: 0, A: 0 }; cells.forEach((c) => { if (c) n[c]++; });
      const tot = n.P + n.L + n.E + n.A, pts = n.P * 2 + n.L + n.E;
      const abs = (kind) => ses.filter((s, i) => s.kind === kind && cells[i] === "A").length;
      return { r, cells, n, pct: tot ? Math.round((pts / (2 * tot)) * 100) : null, absL: abs("lecture"), absB: abs("lab") };
    });
    return { ses, rows };
  }
  // Lab Marks (lecturers only): the marking itself is in labmarks.js
  function drawMarks(body) {
    if (!window.NMKLabMarks) { body.innerHTML = `<p class="small-note">Lab Marks didn't load. Reload the page.</p>`; return; }
    NMKLabMarks.draw(body, { L, db, FV, A, SEM, semSlug, esc, SECTION, fmtDate, slotOf, moveOf, recOf, profileLink });
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
      ${rows.map((x) => `<tr><td>${profileLink(x.r.id, x.r.name)}<br><small>${esc(x.r.matric)} · ${x.r.section ? SECTION[x.r.section].replace(" lab", "") : "no lab section"}</small></td>
        ${x.cells.map((c) => (c === null ? `<td class="at-c na"></td>` : `<td class="at-c ${c ? c.toLowerCase() : "none"}" title="${c ? ST[c] : "Not marked"}">${c || "·"}</td>`)).join("")}
        <td class="at-pct">${x.pct === null ? "–" : x.pct + "%"}</td><td class="at-abs ${lvl(x.absL)}">${x.absL}</td><td class="at-abs ${lvl(x.absB)}">${x.absB}</td></tr>`).join("")}</tbody></table></div>
      <p class="small-note">P present (2 points), L late (1), E excused (1), A absent (0). Absences count only Absent, never Excused. Amber: 1 or 2 absences; red: 3 or more.</p>`}`;
  }
  function csv() {
    const { ses, rows } = reportData(), q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const head = ["Name", "Matric", "Email", "Lab section", "Group", "RPS", "RPS email", ...ses.map((s) => `W${s.week || weekOfDate(s.date)} ${s.title} (${s.date})`), "Present", "Late", "Excused", "Absent", "Attendance %", "Lecture absences", "Lab absences"];
    download([head.map(q).join(",")].concat(rows.map((x) => [x.r.name, x.r.matric, x.r.id, x.r.section ? SECTION[x.r.section] : "", x.r.group || "", x.r.rps || "", x.r.rpsEmail || "",
      ...x.cells.map((c) => (c === null ? "" : c || "")), x.n.P, x.n.L, x.n.E, x.n.A, x.pct === null ? "" : x.pct, x.absL, x.absB].map(q).join(","))), `NMK42003-attendance-${todayIso()}.csv`);
  }

  /* ---------- the public timetable (what every page shows) ---------- */
  const SCH_TAGS = ["lab", "quiz", "test", "report", "project", "online", "break", "holiday", "exam", "study"];
  const listOf = (s) => String(s || "").split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  function drawSchedule(body) {
    const o = L.sched || {}, ow = o.weeks || {};
    const orig = (COURSE.original && COURSE.original.weeks) || COURSE.weeks;
    const weekOf = (n) => Object.assign({}, orig.find((w) => w.w === n), ow[n] || ow[String(n)] || {});
    body.innerHTML = `<p class="widget-lead">The course timetable that students see on the home page, the Schedule page and the course journey. Change a week, and every visitor sees it the next time a page loads. Changed weeks are marked <span class="chip upd">Updated</span>.</p>
      <p class="small-note">This does not move attendance sessions. To move a lab's sessions, open the session and use <strong>Move this lab</strong>.</p>
      <div class="adm-scroll"><table class="adm at-sch"><thead><tr><th scope="col">Week</th><th scope="col">Topic</th><th scope="col">Activities</th><th scope="col">Assessments and notes</th><th scope="col"><span class="vh">Edit</span></th></tr></thead><tbody>
      ${orig.map((w0) => { const w = weekOf(w0.w), ch = !!(ow[w0.w] || ow[String(w0.w)]); return `<tr class="${ch ? "changed" : ""}"><td><strong>${w0.w}</strong><br><small>${weekRange(w0.w)}</small></td><td>${esc(w.topic)}${ch ? ` <span class="chip upd">Updated</span>` : ""}</td>
        <td>${esc((w.activities || []).join(", "))}</td><td>${esc((w.assessments || []).concat(w.notes || []).join(" · "))}</td><td><button type="button" class="btn ghost small" data-wk="${w0.w}">Edit</button></td></tr>`; }).join("")}</tbody></table></div>
      <h3 class="at-gap">Which Week Each Chapter and Lab Is In</h3>
      <form class="at-dform at-wkform" novalidate><div class="at-wkgrid">
        ${COURSE.topics.map((t, i) => `<label>Chapter ${t.no}<input name="t${t.no}" value="${esc((o.topics || {})[t.no] || COURSE.original.topics[i])}"></label>`).join("")}
        ${COURSE.labs.map((l, i) => `<label>Lab ${l.no}<input name="l${l.no}" value="${esc((o.labs || {})[l.no] || COURSE.original.labs[i])}"></label>`).join("")}</div>
        <p class="small-note">Write it as in the timetable, e.g. <code>Week 2</code> or <code>Weeks 2 to 3</code>.</p>
        <div class="acc-row"><button type="submit" class="btn">Save chapter and lab weeks</button></div><p class="at-err" aria-live="polite"></p></form>`;
  }
  function weekForm(n) {
    const o = L.sched || {}, orig = COURSE.original.weeks.find((w) => w.w === n), w = Object.assign({}, orig, (o.weeks || {})[n] || {});
    const p = panel(`<h3>Week ${n} <small class="at-sub">${weekRange(n)}</small></h3><form class="at-dform" novalidate>
      <label>Topic<input name="topic" value="${esc(w.topic)}"></label>
      <label>Sub-topics<textarea name="sub" rows="2">${esc(w.sub || "")}</textarea></label>
      <label>Activities <span class="at-hint">one per line, e.g. Lecture, Lab 1 (Part 1), Tutorial 1</span><textarea name="activities" rows="3">${esc((w.activities || []).join("\n"))}</textarea></label>
      <label>Assessments <span class="at-hint">one per line, e.g. Quiz 1, Lab Report 2</span><textarea name="assessments" rows="2">${esc((w.assessments || []).join("\n"))}</textarea></label>
      <label>Notes <span class="at-hint">one per line, e.g. Online lecture, Public holiday</span><textarea name="notes" rows="2">${esc((w.notes || []).join("\n"))}</textarea></label>
      <fieldset class="at-fs at-tags"><legend>Tags (used for the filters and the colours)</legend>${SCH_TAGS.map((t) => `<label><input type="checkbox" name="tag" value="${t}"${(w.tags || []).includes(t) ? " checked" : ""}> ${t}</label>`).join("")}</fieldset>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">Save week ${n}</button>${(o.weeks || {})[n] ? `<button type="button" class="btn ghost" data-wreset>Back to the original</button>` : ""}<button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", p).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = { topic: String(f.get("topic")).trim(), sub: String(f.get("sub")).trim(), activities: listOf(f.get("activities")), assessments: listOf(f.get("assessments")), notes: listOf(f.get("notes")), tags: f.getAll("tag") };
      if (!data.topic) { $(".at-err", p).textContent = "The topic can't be empty."; return; }
      try { await db.collection("schedule").doc(semSlug).set({ semester: SEM, weeks: { [n]: data }, updatedAt: FV.serverTimestamp() }, { merge: true }); closePanel(); refreshSched(); }
      catch (ex) { $(".at-err", p).textContent = `Could not save (${ex.code || ex}).`; }
    });
    const rs = $("[data-wreset]", p);
    if (rs) rs.addEventListener("click", async () => {
      try { await db.collection("schedule").doc(semSlug).update({ [`weeks.${n}`]: FV.delete(), updatedAt: FV.serverTimestamp() }); closePanel(); refreshSched(); }
      catch (ex) { $(".at-err", p).textContent = `Could not reset (${ex.code || ex}).`; }
    });
  }
  // this browser's copy of the timetable changes, so the lecturer's other pages show them straight away
  function refreshSched() {
    db.collection("schedule").doc(semSlug).get().then((d) => {
      const v = d.exists ? { semester: SEM, weeks: d.data().weeks || {}, labs: d.data().labs || {}, topics: d.data().topics || {} } : null;
      const stable = (x) => (Array.isArray(x) ? `[${x.map(stable).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}` : JSON.stringify(x));
      try { if (v) localStorage.setItem("nmk-sched", stable(v)); else localStorage.removeItem("nmk-sched"); } catch (e) { /* private mode */ }
    }).catch(() => {});
  }

  /* ---------- clicks and changes (lecturer) ---------- */
  function onClick(e) {
    const t = e.target, b = (s) => t.closest(s);
    if (b("[data-tab]")) { if (!leaveOk()) return; goView(b("[data-tab]").dataset.tab, null); return; }
    if (b("[data-filter]")) { L.filter = b("[data-filter]").dataset.filter; draw(); return; }
    if (b("[data-delpicked]")) return deletePicked();
    if (b("[data-unpick]")) { L.picked.clear(); draw(); return; }
    if (b("[data-rsec]")) { L.rsec = b("[data-rsec]").dataset.rsec; draw(); return; }
    if (b("[data-rkind]")) { L.rkind = b("[data-rkind]").dataset.rkind; draw(); return; }
    if (b("[data-rview]")) { L.rview = b("[data-rview]").dataset.rview; draw(); return; }
    if (b("[data-new]")) return sessionForm(null);
    if (b("[data-bulk]")) return bulkCreate();
    if (b("[data-csv]")) return csv();
    if (b("[data-rcsv]")) return rosterCsv();
    if (b("[data-addstu]")) return studentForm(null);
    if (b("[data-editstu]")) return studentForm(L.roster.find((r) => r.id === b("[data-editstu]").dataset.editstu));
    if (b("[data-wk]")) return weekForm(+b("[data-wk]").dataset.wk);
    if (b("[data-lswap]")) return lecturerSwap(b("[data-lswap]").dataset.lswap || "");
    if (b("[data-swok]")) return decideSwap(b("[data-swid]").dataset.swid, true);
    if (b("[data-swno]")) return decideSwap(b("[data-swid]").dataset.swid, false);
    if (b("[data-swundo]")) return undoSwap(b("[data-swid]").dataset.swid);
    if (b("[data-nok]") || b("[data-nno]")) { const box = b("[data-nid]"); return decideNotice(box.dataset.nid, !!b("[data-nok]"), ($(".at-nnote", box) || {}).value || ""); }
    if (b("[data-nre]")) { const id = b("[data-nid]").dataset.nid; db.collection("notices").doc(id).update({ status: "pending" }).catch((ex) => say("Could Not Save", esc(ex.code || ex))); return; }
    if (b("[data-save]")) return saveEdits();
    if (b("[data-undo]")) { editsFor(L.sid).forEach(([k]) => delete L.edits[k]); draw(); return; }
    if (b("[data-sid]")) { if (!leaveOk()) return; goView(L.tab, b("[data-sid]").dataset.sid); window.scrollTo(0, 0); return; }
    if (b("[data-back]")) { if (!leaveOk()) return; goView(L.tab, null); return; }
    const s = L.sessions.find((x) => x.id === L.sid);
    if (!s) return;
    if (b("[data-edit]")) return sessionForm(s);
    if (b("[data-movelab]")) return moveLab(s);
    if (b("[data-addin]")) return addIn(s);
    if (b("[data-del]")) {
      if (confirm(`Delete "${s.title}"? Its attendance records stay in the database but no longer appear in the report.`)) db.collection("sessions").doc(s.id).delete().then(() => { L.sid = null; draw(); }).catch((ex) => say("Could Not Delete", esc(ex.code || ex)));
      return;
    }
    if (b("[data-open]")) return openSession(s);
    if (b("[data-close]")) { if (editsFor(s.id).length) { say("Save First", "Save or undo your changes before closing attendance."); return; } return closeSession(s); }
    if (b("[data-all]")) {
      const st = b("[data-all]").dataset.all;
      studentsFor(s).filter((r) => !recOf(s.id, r.id) && !(L.edits[`${s.id}|${r.id}`] || {}).status).forEach((r) => edit(s.id, r.id, { status: st }));
      draw(); return;
    }
    if (b("[data-st]")) { const tr = t.closest("tr[data-em]"); edit(s.id, tr.dataset.em, { status: b("[data-st]").dataset.st }); draw(); }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches("[data-file]") && t.files[0]) { importList(t.files[0]); t.value = ""; return; }
    if (t.matches("[data-pick]")) { if (t.checked) L.picked.add(t.dataset.pick); else L.picked.delete(t.dataset.pick); draw(); return; }
    if (t.matches("[data-pickall]")) { sortedSessions().filter((s) => L.filter === "all" || s.kind === L.filter).forEach((s) => (t.checked ? L.picked.add(s.id) : L.picked.delete(s.id))); draw(); return; }
    if (t.closest(".at-wkform")) return;
    const tr = t.closest("tr[data-em]");
    if (!tr || !t.matches("[data-f]")) return;
    const v = t.dataset.f === "group" ? +t.value || 0 : t.value;
    db.collection("roster").doc(tr.dataset.em).update({ [t.dataset.f]: v }).catch((ex) => say("Could Not Save", esc(ex.code || ex)));
  }
  host.addEventListener("submit", async (e) => {
    const f = e.target.closest(".at-wkform");
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f), topics = {}, labs = {};
    COURSE.topics.forEach((t, i) => { const v = String(fd.get(`t${t.no}`) || "").trim(); if (v && v !== COURSE.original.topics[i]) topics[t.no] = v; });
    COURSE.labs.forEach((l, i) => { const v = String(fd.get(`l${l.no}`) || "").trim(); if (v && v !== COURSE.original.labs[i]) labs[l.no] = v; });
    try { await db.collection("schedule").doc(semSlug).set({ semester: SEM, topics, labs, updatedAt: FV.serverTimestamp() }, { merge: true }); $(".at-err", f).textContent = "Saved."; refreshSched(); }
    catch (ex) { $(".at-err", f).textContent = `Could not save (${ex.code || ex}).`; }
  });

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
        unsubs.push(db.collection("labMoves").where("semester", "==", SEM).onSnapshot((q) => { L.moves = q.docs.map((x) => Object.assign({ id: x.id }, x.data())); count(); }));
        unsubs.push(db.collection("attendance").where("session", "==", sid).onSnapshot((q) => { L.att = q.docs.map((x) => Object.assign({ id: x.id }, x.data())); count(); }));
      }
      count();
    }));
    keyWatch(sid, () => paintKey($(".at-keyarea"), sid, true));
  }
})();
