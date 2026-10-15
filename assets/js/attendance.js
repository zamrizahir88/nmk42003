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
  const LAB_VENUE = "TVET MI01 (Makmal Industri UniMAP - Tessolve)";
  const ROTATE_MS = 3 * 60 * 1000;
  const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I: easy to read from a screen
  const newKey = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return [...a].map((n) => KEY_CHARS[n % KEY_CHARS.length]).join(""); };
  const semSlug = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // a lab "slot" links the three section sessions of one lab (e.g. Lab 2), so swaps survive date changes
  const slotOf = (s) => s.slot || ((s.id || "").match(/-(w\d\d-lab)-(mon|wed|thu)$/) || [])[1] || "";
  const labName = (s) => String(s.title || "").replace(/,\s*(Monday|Wednesday|Thursday) section$/, "");

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
  let panelEl = null;
  function panel(html) {
    closePanel();
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
  function closePanel() { if (panelEl) { panelEl.remove(); panelEl = null; } }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panelEl) closePanel(); });
  const say = (title, text) => panel(`<h3>${title}</h3><p>${text}</p><div class="acc-row"><button type="button" class="btn" data-x>OK</button></div>`);
  const sessionLine = (s) => `${fmtDate(s.date)}, ${fmtTime(s.start)} to ${fmtTime(s.end)}${s.venue ? ` · ${esc(s.venue)}` : ""}`;
  const chip = (st) => `<span class="at-st ${st ? st.toLowerCase() : "none"}">${st ? ST[st] : "Not marked"}</span>`;
  const profileLink = (email, name) => `<a class="at-pl" href="profile.html?e=${encodeURIComponent(email)}">${esc(name)}</a>`;

  // the lecturer's view: what is loaded and what is shown
  const L = { sessions: [], roster: [], att: [], moves: [], swaps: [], notices: [], users: [], sched: null, tab: "sessions", sid: null, keys: {}, filter: "all", rsec: "all", rkind: "all",
    rview: "list", q: "", watched: new Set(), edits: {}, openWeek: null, dirSent: "" };

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
    el.innerHTML = `<label class="at-lbl" for="pk-${label}">${esc(label)} <span>Type a name or matric number, then tap the student</span></label>
      <input id="pk-${label}" class="at-in" type="search" autocomplete="off" spellcheck="false" placeholder="e.g. Ahmad or 2313">
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
      <div class="at-actions"><button type="button" class="btn ghost" data-notice>Tell the lecturer I can't attend</button><button type="button" class="btn ghost" data-swap>Request a lab swap</button>
        <a class="btn ghost" href="profile.html">My profile</a></div>
      <div class="at-reqs"></div>
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
      unsubs.push(db.collection("swaps").where("toMatric", "==", String(me.matric)).onSnapshot((q) => { got = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => x.semester === SEM); paintReqs(); }, () => {}));
      db.collection("meta").doc("classmates").get().then((d) => { mates = d.exists ? (d.data().list || []) : []; }).catch(() => {});
      paintOpen();
    }).catch(() => { openEl.innerHTML = `<p class="small-note">Could not load the class list. Reload the page to try again.</p>`; });

    unsubs.push(db.collection("sessions").where("semester", "==", SEM).onSnapshot((q) => {
      all = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
      open = all.filter((s) => s.state === "open");
      paintOpen();
    }, () => { openEl.innerHTML = `<p class="small-note">Could not check for open sessions. Reload the page to try again.</p>`; }));
    unsubs.push(db.collection("attendance").where("email", "==", email).onSnapshot((q) => {
      recs = {};
      q.docs.forEach((d) => { const x = d.data(); if (!x.semester || x.semester === SEM) recs[x.session] = x; });
      paintOpen(); paintMine();
    }, () => { mineEl.innerHTML = `<p class="small-note">Could not load your records. Reload the page to try again.</p>`; }));
    unsubs.push(db.collection("labMoves").where("email", "==", email).onSnapshot((q) => { moves = {}; q.docs.forEach((d) => { const x = d.data(); moves[x.slot] = x; }); paintOpen(); }, () => {}));
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
    function noticeForm(n) {
      const choices = all.filter(forMe);
      if (!choices.length) { say("No Sessions Yet", "Your lecturer hasn't set up the sessions yet. Try again later."); return; }
      const t = todayIso(), next = choices.find((s) => s.date >= t) || choices[choices.length - 1];
      const pick = n ? n.session : next.id;
      const p = panel(`<h3>${n ? "Edit Your Absence Notice" : "Tell the Lecturer You Can't Attend"}</h3>
        <form class="at-dform" novalidate>
          <label>Session<select name="session"${n ? " disabled" : ""}>${choices.map((s) => `<option value="${s.id}"${s.id === pick ? " selected" : ""}>${fmtDate(s.date)} · ${esc(s.title)}${s.state === "closed" ? " (held)" : ""}</option>`).join("")}</select></label>
          <label>Reason<select name="reason">${Object.entries(REASONS).map(([v, l]) => `<option value="${v}"${n && n.reason === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Explain briefly<textarea name="detail" rows="3" maxlength="500" required placeholder="e.g. Fever, clinic visit at Pusat Kesihatan UniMAP">${esc(n ? n.detail : "")}</textarea></label>
          <p class="at-note">📎 Email your supporting document (e.g. MC or official letter) to the course coordinator at <a href="mailto:${COORDINATOR}">${COORDINATOR}</a>. This notice only tells your lecturer; it is approved or not after they check it.</p>
          <p class="at-err" aria-live="polite"></p>
          <div class="acc-row"><button type="submit" class="btn">${n ? "Save" : "Send the notice"}</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
      $(".at-dform", p).addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.target).entries()), sid = n ? n.session : v.session, s = all.find((x) => x.id === sid);
        if (!v.detail || v.detail.trim().length < 5) { $(".at-err", p).textContent = "Please explain in a few words."; return; }
        if (!n && notices.some((x) => x.session === sid)) { $(".at-err", p).textContent = "You already sent a notice for this session. Edit it in the list below."; return; }
        try {
          await db.collection("notices").doc(`${sid}_${email}`).set({ semester: SEM, session: sid, email, name: me.name, matric: String(me.matric), kind: s.kind, date: s.date, title: s.title,
            reason: v.reason, detail: v.detail.trim().slice(0, 500), status: "pending", at: FV.serverTimestamp() });
          closePanel();
        } catch (ex) { $(".at-err", p).textContent = `Could not send (${ex.code || ex}). Please try again.`; }
      });
    }

    /* ---- lab swap ---- */
    function swapForm() {
      const labs = {};
      all.filter((s) => s.kind === "lab" && slotOf(s)).forEach((s) => { const k = slotOf(s); if (!labs[k]) labs[k] = { slot: k, name: labName(s), dates: [], held: true }; labs[k].dates.push(s); if (s.state !== "closed") labs[k].held = false; });
      const list = Object.values(labs).filter((l) => !l.held);
      if (!me.section) { say("No Lab Section Yet", "You don't have a lab section yet, so there is nothing to swap. Ask your lecturer."); return; }
      if (!list.length) { say("No Labs to Swap", "There are no lab sessions still to come."); return; }
      let partner = null;
      const others = mates.filter((x) => x.m !== String(me.matric) && x.s && x.s !== me.section);
      const p = panel(`<h3>Request a Lab Swap</h3>
        <p>Swap places with a classmate in another section <strong>for one lab only</strong>. Agree with them first. They accept your request, then your lecturer approves it. You each take the other's place and group for that lab.</p>
        <form class="at-dform" novalidate>
          <label>Which lab<select name="slot">${list.map((l) => { const mine = l.dates.find((s) => s.section === me.section); return `<option value="${l.slot}">${esc(l.name)}${mine ? ` (yours: ${fmtDate(mine.date)})` : ""}</option>`; }).join("")}</select></label>
          <div class="at-pickbox"></div>
          <label>Note to the lecturer (optional)<input name="note" maxlength="200" placeholder="e.g. Clinic appointment on Monday"></label>
          <p class="at-err" aria-live="polite"></p>
          <div class="acc-row"><button type="submit" class="btn">Send the request</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
      if (!others.length) $(".at-pickbox", p).innerHTML = `<p class="small-note">The classmate list isn't ready yet. Try again later.</p>`;
      else picker($(".at-pickbox", p), others, (x) => { partner = x; }, "Swap with");
      $(".at-dform", p).addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.target).entries()), lab = labs[v.slot];
        if (!partner) { $(".at-err", p).textContent = "Choose the classmate you are swapping with."; return; }
        if (sent.some((x) => x.slot === v.slot && ["requested", "accepted", "approved"].includes(x.status))) { $(".at-err", p).textContent = "You already have a swap for this lab. Cancel it first in the list below."; return; }
        try {
          await db.collection("swaps").add({ semester: SEM, slot: v.slot, labTitle: lab.name, fromEmail: email, fromMatric: String(me.matric), fromName: me.name, fromSection: me.section, fromGroup: me.group || 0,
            toMatric: partner.m, toName: partner.n, toSection: partner.s, toGroup: partner.g || 0, note: (v.note || "").trim().slice(0, 200), status: "requested", createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
          closePanel();
        } catch (ex) { $(".at-err", p).textContent = `Could not send (${ex.code || ex}). Please try again.`; }
      });
    }
    const SWAP_ST = { requested: "Waiting for your classmate", accepted: "Waiting for the lecturer", approved: "Approved", declined: "Declined by your classmate", rejected: "Not approved", cancelled: "Cancelled" };
    const NOTE_ST = { pending: "Waiting for approval", approved: "Approved: marked Excused", rejected: "Not approved" };
    function paintReqs() {
      const inbox = got.filter((x) => x.status === "requested");
      const live = (x) => !["cancelled", "declined"].includes(x.status);
      const swaps = sent.filter(live).map((x) => ({ x, out: true })).concat(got.filter((x) => live(x) && x.status !== "requested").map((x) => ({ x, out: false })));
      reqEl.innerHTML = (inbox.length ? `<div class="at-card warn"><h3>Lab Swap Requests for You</h3>${inbox.map((x) => `<div class="at-req" data-sw="${x.id}"><p><strong>${esc(x.fromName)}</strong> (${SECTION[x.fromSection] || ""}, group ${x.fromGroup || "–"}) asks to swap <strong>${esc(x.labTitle)}</strong> with you.${x.note ? ` <em>“${esc(x.note)}”</em>` : ""}</p>
          <div class="acc-row"><button type="button" class="btn small" data-acc>Accept</button><button type="button" class="btn ghost small" data-dec>Decline</button></div></div>`).join("")}</div>` : "")
        + (swaps.length ? `<div class="at-card"><h3>My Lab Swaps</h3><ul class="at-list">${swaps.map(({ x, out }) => `<li data-sw="${x.id}"><strong>${esc(x.labTitle)}</strong>: ${out ? `with ${esc(x.toName)} (${SECTION[x.toSection] || ""})` : `with ${esc(x.fromName)} (${SECTION[x.fromSection] || ""})`} · <span class="at-tag ${x.status}">${SWAP_ST[x.status] || x.status}</span>${out && ["requested", "accepted"].includes(x.status) ? ` <button type="button" class="btn ghost small" data-cancel>Cancel</button>` : ""}</li>`).join("")}</ul></div>` : "")
        + (notices.length ? `<div class="at-card"><h3>My Absence Notices</h3><ul class="at-list">${notices.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((n) => `<li data-n="${n.id}"><strong>${fmtDate(n.date)} · ${esc(n.title)}</strong>: ${REASONS[n.reason] || n.reason} · <span class="at-tag ${n.status}">${NOTE_ST[n.status] || n.status}</span>${n.note ? `<br><small>Lecturer: ${esc(n.note)}</small>` : ""}${n.status === "pending" ? ` <button type="button" class="btn ghost small" data-nedit>Edit</button> <button type="button" class="btn ghost small" data-ndel>Withdraw</button>` : ""}</li>`).join("")}</ul></div>` : "");
    }
    host.addEventListener("click", async (e) => {
      const t = e.target;
      if (t.closest("[data-notice]")) return noticeForm(null);
      if (t.closest("[data-swap]")) return swapForm();
      const sw = t.closest("[data-sw]"), nt = t.closest("[data-n]");
      try {
        if (sw && t.closest("[data-acc]")) await db.collection("swaps").doc(sw.dataset.sw).update({ status: "accepted", updatedAt: FV.serverTimestamp() });
        if (sw && t.closest("[data-dec]")) await db.collection("swaps").doc(sw.dataset.sw).update({ status: "declined", updatedAt: FV.serverTimestamp() });
        if (sw && t.closest("[data-cancel]")) await db.collection("swaps").doc(sw.dataset.sw).update({ status: "cancelled", updatedAt: FV.serverTimestamp() });
        if (nt && t.closest("[data-nedit]")) noticeForm(notices.find((n) => n.id === nt.dataset.n));
        if (nt && t.closest("[data-ndel]") && confirm("Withdraw this absence notice?")) await db.collection("notices").doc(nt.dataset.n).delete();
      } catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
    });

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
    host.innerHTML = `<div class="at-tabs adm-tabs" role="group" aria-label="Attendance view"></div><div class="at-body"></div><div class="at-savebar" hidden></div>`;
    const load = (name, q, map) => unsubs.push(q.onSnapshot((s) => { L[name] = s.docs.map(map); if (name === "roster") syncDirectory(); if (name === "sessions") addSlots(); draw(); },
      (e) => { console.warn("NMK attendance:", name, e.code || e); $(".at-body").innerHTML = `<p class="small-note">Could not load ${name} (${esc(e.code || e)}). If this says permission-denied, publish the latest firebase/firestore.rules in the Firebase console.</p>`; }));
    const withId = (d) => Object.assign({ id: d.id }, d.data());
    load("sessions", db.collection("sessions").where("semester", "==", SEM), withId);
    load("roster", db.collection("roster"), withId);
    load("att", db.collection("attendance").where("semester", "==", SEM), withId);
    load("moves", db.collection("labMoves").where("semester", "==", SEM), withId);
    load("swaps", db.collection("swaps").where("semester", "==", SEM), withId);
    load("notices", db.collection("notices").where("semester", "==", SEM), withId);
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
    if (ae && host.contains(ae) && ae.matches(".at-rm, .at-grp, .at-panel input, .at-panel textarea, .at-panel select")) { L.pending = true; return; }
    L.pending = false;
    const pend = (k) => k.filter((x) => x.status === "accepted").length, np = L.notices.filter((x) => x.status === "pending").length;
    const T = [["sessions", "Sessions"], ["roster", `Class List (${L.roster.filter((r) => r.status === "active").length})`], ["swaps", `Swaps${pend(L.swaps) ? ` (${pend(L.swaps)})` : ""}`],
      ["notices", `Notices${np ? ` (${np})` : ""}`], ["report", "Report"], ["schedule", "Schedule"]];
    tabs.innerHTML = T.map(([v, l]) => `<button type="button" class="chip-btn${/\(\d+\)$/.test(l) && v !== "roster" ? " has" : ""}" data-tab="${v}" aria-pressed="${L.tab === v && !L.sid}">${l}</button>`).join("");
    const keepPanel = panelEl && body.contains(panelEl) ? panelEl : null;
    if (L.sid) { const s = L.sessions.find((x) => x.id === L.sid); if (s) drawSession(body, s); else L.sid = null; }
    if (!L.sid) ({ sessions: drawSessions, roster: drawRoster, swaps: drawSwaps, notices: drawNotices, report: drawReport, schedule: drawSchedule })[L.tab](body);
    if (keepPanel) body.prepend(keepPanel);
    paintSaveBar();
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
      ${list.map((s) => { const n = counts(s), sw = s.kind === "lab" ? L.moves.filter((m) => m.slot === slotOf(s) && m.section === s.section).length : 0; return `<tr class="${s.date === t ? "today" : ""}"><td>${s.week || weekOfDate(s.date)}</td><td>${fmtDate(s.date)}<br><small>${fmtTime(s.start)} to ${fmtTime(s.end)}</small></td>
        <td><strong>${esc(s.title)}</strong>${s.venue ? `<br><small>${esc(s.venue)}</small>` : ""}${sw ? `<br><small class="at-swn">⇄ ${sw} swapped in</small>` : ""}</td><td>${SECTION[s.section] || s.section}</td>
        <td><span class="at-state ${s.state}">${{ planned: "Not opened", open: "Open", closed: "Closed" }[s.state] || s.state}</span></td>
        <td class="at-n">${s.state === "planned" ? "–" : `${n.P} / ${n.L} / ${n.E} / ${n.A}`}</td><td><button type="button" class="btn small${s.state === "open" ? "" : " ghost"}" data-sid="${s.id}">${s.state === "open" ? "Open ›" : "Manage"}</button></td></tr>`; }).join("")}
      </tbody></table></div>`}`;
  }

  // every lecture and lab of the semester, from the weekly plan (ids are fixed, so nothing is made twice)
  function semesterPlan() {
    const out = [], dayOff = { mon: 0, wed: 2, thu: 3 }, labTime = { mon: ["13:00", "16:00"], wed: ["12:00", "15:00"], thu: ["09:00", "12:00"] };
    COURSE.weeks.forEach((w) => {
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
        else await db.collection("sessions").doc(s.id).update(data);
        closePanel();
      } catch (ex) { $(".at-err", p).textContent = `Could not save (${ex.code || ex}).`; }
    });
  }

  function bulkCreate() {
    const plan = semesterPlan(), have = new Set(L.sessions.map((s) => s.id)), add = plan.filter((p) => !have.has(p.id));
    const nl = add.filter((p) => p.kind === "lecture").length, nb = add.length - nl;
    if (!add.length) { say("Nothing to Add", "Every lecture and lab in the course timetable already has a session."); return; }
    const p = panel(`<h3>Create the Semester's Sessions</h3><p>From the weekly plan: <strong>${nl} lecture${nl === 1 ? "" : "s"}</strong> (Thursday, 2 PM to 4 PM) and <strong>${nb} lab session${nb === 1 ? "" : "s"}</strong> (one for each section: Monday 1 to 4 PM, Wednesday 12 to 3 PM, Thursday 9 AM to 12 PM).</p>
      <p class="small-note">Sessions that already exist are left alone. You can edit, move or delete any session afterwards.</p><p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="button" class="btn" data-go>Create ${add.length} sessions</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    $("[data-go]", p).addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const b = db.batch();
        add.forEach((x) => { const { id, ...data } = x; b.set(db.collection("sessions").doc(id), Object.assign(data, { semester: SEM, state: "planned", lateAfter: 0, createdAt: FV.serverTimestamp() })); });
        await b.commit(); closePanel();
      } catch (ex) { e.target.disabled = false; $(".at-err", p).textContent = `Could not create them (${ex.code || ex}).`; }
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
        group.forEach((x) => { const d = addDays(x.date, 7 * (to - (x.week || weekOfDate(x.date)))); b.update(db.collection("sessions").doc(x.id), { date: d, week: weekOfDate(d), slot }); });
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
      <div class="adm-tools"><span>Set every unmarked student to</span>${["P", "L", "E", "A"].map((k) => `<button type="button" class="btn ghost small" data-all="${k}">${ST[k]}</button>`).join("")}${slot ? `<button type="button" class="btn ghost small" data-addin>+ Add a student from another section</button>` : ""}</div>
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
  const SW = { requested: "Waiting for the classmate", accepted: "Waiting for your approval", approved: "Approved", declined: "Declined by the classmate", rejected: "Not approved", cancelled: "Cancelled" };
  const swapRow = (x) => `<div class="at-req" data-swid="${x.id}"><p><strong>${esc(x.labTitle)}</strong>: ${esc(x.fromName)} (${SEC_SHORT[x.fromSection] || "–"} G${x.fromGroup || "–"}) ⇄ ${esc(x.toName)} (${SEC_SHORT[x.toSection] || "–"} G${x.toGroup || "–"})
      · <span class="at-tag ${x.status}">${SW[x.status] || x.status}</span>${x.note ? `<br><small>“${esc(x.note)}”</small>` : ""}<br><small>Asked ${fmtStamp(x.createdAt)}</small></p>
      <div class="acc-row">${x.status === "accepted" ? `<button type="button" class="btn small" data-swok>Approve</button><button type="button" class="btn ghost small" data-swno>Reject</button>` : x.status === "approved" ? `<button type="button" class="btn ghost small" data-swundo>Cancel this swap</button>` : x.status === "requested" ? `<button type="button" class="btn ghost small" data-swno>Reject</button>` : ""}</div></div>`;
  function drawSwaps(body) {
    const order = { accepted: 0, requested: 1, approved: 2, rejected: 3, declined: 4, cancelled: 5 };
    const list = L.swaps.slice().sort((a, b) => order[a.status] - order[b.status] || tsMs(b.createdAt) - tsMs(a.createdAt));
    body.innerHTML = `<p class="widget-lead">Students ask a classmate in another section to swap one lab. When the classmate accepts, the swap waits here for you. After you approve it, the two students change places (section and group) for that lab only.</p>
      ${list.length ? list.map(swapRow).join("") : `<p class="adm-empty">No swap requests yet.</p>`}`;
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
    if (!x || !confirm("Cancel this approved swap? Both students go back to their own section for this lab.")) return;
    try {
      const b = db.batch();
      b.update(db.collection("swaps").doc(id), { status: "cancelled", updatedAt: FV.serverTimestamp() });
      L.moves.filter((m) => m.swap === id).forEach((m) => b.delete(db.collection("labMoves").doc(m.id)));
      await b.commit();
    } catch (ex) { say("Could Not Save", esc(ex.code || ex)); }
  }

  /* ---------- absence notices ---------- */
  function drawNotices(body) {
    const order = { pending: 0, approved: 1, rejected: 2 };
    const list = L.notices.slice().sort((a, b) => order[a.status] - order[b.status] || (a.date < b.date ? 1 : -1));
    body.innerHTML = `<p class="widget-lead">Students tell you before or after a session why they can't attend. Their supporting documents come to ${COORDINATOR} by email. <strong>Approve</strong> marks them Excused; <strong>Reject</strong> leaves them Absent.</p>
      ${!list.length ? `<p class="adm-empty">No absence notices yet.</p>` : list.map((n) => { const s = L.sessions.find((x) => x.id === n.session); return `<div class="at-req" data-nid="${n.id}">
        <p>${profileLink(n.email, n.name)} (${esc(n.matric)}) · <strong>${fmtDate(n.date)} · ${esc(n.title)}</strong>${s ? ` <small>(${s.state === "closed" ? "held" : s.state === "open" ? "open now" : "not yet held"})</small>` : ""}<br>
        <strong>${REASONS[n.reason] || n.reason}</strong>: ${esc(n.detail)}<br><small>Sent ${fmtStamp(n.at)} · <span class="at-tag ${n.status}">${{ pending: "Waiting", approved: "Approved", rejected: "Not approved" }[n.status]}</span>${n.note ? ` · your note: ${esc(n.note)}` : ""}</small></p>
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
      <div class="at-two"><label>Matric number<input name="matric" value="${esc(r.matric)}" required></label><label>Studentmail address<input name="email" type="email" value="${esc(r.id)}"${isNew ? "" : " readonly"} required></label></div>
      <div class="at-two"><label>Lab section<select name="section"><option value="">None</option>${["mon", "wed", "thu"].map((v) => `<option value="${v}"${r.section === v ? " selected" : ""}>${SECTION[v]}</option>`).join("")}</select></label><label>Lab group<input name="group" type="number" min="0" max="30" value="${r.group || ""}"></label></div>
      <div class="at-two"><label>RPS name<input name="rps" value="${esc(r.rps || "")}"></label><label>RPS email<input name="rpsEmail" type="email" value="${esc(r.rpsEmail || "")}"></label></div>
      <p class="at-err" aria-live="polite"></p>
      <div class="acc-row"><button type="submit" class="btn">${isNew ? "Add" : "Save"}</button>${isNew ? "" : `<button type="button" class="btn ghost" data-remove>Remove from the list</button>`}<button type="button" class="btn ghost" data-x>Cancel</button></div></form>`);
    $(".at-dform", p).addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries()), em = v.email.trim().toLowerCase();
      if (!v.name.trim() || !v.matric.trim() || !/@studentmail\.unimap\.edu\.my$/.test(em)) { $(".at-err", p).textContent = "Fill in the name, matric number and a @studentmail.unimap.edu.my address."; return; }
      try {
        await db.collection("roster").doc(em).set({ name: v.name.trim().toUpperCase(), matric: v.matric.trim(), email: em, section: v.section, group: +v.group || 0, rps: v.rps.trim(), rpsEmail: v.rpsEmail.trim().toLowerCase(), status: r.status || "active", semester: SEM }, { merge: true });
        closePanel();
      } catch (ex) { $(".at-err", p).textContent = `Could not save (${ex.code || ex}).`; }
    });
    const rm = $("[data-remove]", p);
    if (rm) rm.addEventListener("click", async () => {
      if (!confirm(`Remove ${r.name} from the class list? Their attendance records are kept. To keep them on the list but out of sessions, set them to Dropped instead.`)) return;
      try { await db.collection("roster").doc(r.id).delete(); closePanel(); } catch (ex) { $(".at-err", p).textContent = `Could not remove (${ex.code || ex}).`; }
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
    const ses = sortedSessions().filter((s) => s.state !== "planned" && (L.rkind === "all" || s.kind === L.rkind) && (L.rsec === "all" || L.rsec === "none" || s.section === "all" || s.section === L.rsec));
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
      try { if (v) localStorage.setItem("nmk-sched", JSON.stringify(v)); else localStorage.removeItem("nmk-sched"); } catch (e) { /* private mode */ }
    }).catch(() => {});
  }

  /* ---------- clicks and changes (lecturer) ---------- */
  function onClick(e) {
    const t = e.target, b = (s) => t.closest(s);
    if (b("[data-tab]")) { if (!leaveOk()) return; closePanel(); L.tab = b("[data-tab]").dataset.tab; L.sid = null; draw(); return; }
    if (b("[data-filter]")) { L.filter = b("[data-filter]").dataset.filter; draw(); return; }
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
    if (b("[data-swok]")) return decideSwap(b("[data-swid]").dataset.swid, true);
    if (b("[data-swno]")) return decideSwap(b("[data-swid]").dataset.swid, false);
    if (b("[data-swundo]")) return undoSwap(b("[data-swid]").dataset.swid);
    if (b("[data-nok]") || b("[data-nno]")) { const box = b("[data-nid]"); return decideNotice(box.dataset.nid, !!b("[data-nok]"), ($(".at-nnote", box) || {}).value || ""); }
    if (b("[data-nre]")) { const id = b("[data-nid]").dataset.nid; db.collection("notices").doc(id).update({ status: "pending" }).catch((ex) => say("Could Not Save", esc(ex.code || ex))); return; }
    if (b("[data-save]")) return saveEdits();
    if (b("[data-undo]")) { editsFor(L.sid).forEach(([k]) => delete L.edits[k]); draw(); return; }
    if (b("[data-sid]")) { if (!leaveOk()) return; closePanel(); L.sid = b("[data-sid]").dataset.sid; draw(); window.scrollTo(0, 0); return; }
    if (b("[data-back]")) { if (!leaveOk()) return; closePanel(); L.sid = null; draw(); return; }
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
