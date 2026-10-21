/* NMK42003 accounts: Google sign-in, the lecturer's approval, and saved progress (Firebase).
   Signing in is optional: every page works without it, exactly as before.
   - Only @studentmail.unimap.edu.my accounts and the lecturers (ADMINS) are accepted.
   - A new student chooses a nickname and starts as "pending"; a lecturer approves them on admin.html.
   - Once approved, the site's own progress records (the nmk-… keys in this browser) are copied to Firestore,
     so they follow the student to any device, and the lecturer can see them.
   The Firestore security rules (firebase/firestore.rules) enforce all of this on Google's side. */
(function () {
  "use strict";
  if (!window.firebase || !window.firebase.initializeApp) return;

  const CONFIG = {
    apiKey: "AIzaSyBR3JguiBmsePqoOsnF-lefm5gyjJx89Z0",
    authDomain: "nmk42003-interactive-website.firebaseapp.com",
    projectId: "nmk42003-interactive-website",
    storageBucket: "nmk42003-interactive-website.firebasestorage.app",
    messagingSenderId: "190874137761",
    appId: "1:190874137761:web:aea3c43df6ee60dfedece0"
  };
  const ADMINS = ["zamrizahir@unimap.edu.my", "hariyanti@unimap.edu.my"];          // keep in step with firebase/firestore.rules
  const NICK = { "zamrizahir@unimap.edu.my": "Dr. Zamri", "hariyanti@unimap.edu.my": "Dr. Hariyanti" };
  const STUDENT_DOMAIN = "@studentmail.unimap.edu.my";
  const EX_KEY = "nmk-ex-log", UID_KEY = "nmk-sync-uid";
  // progress kept in this browser that is not worth syncing
  const LOCAL_ONLY = /^nmk-(theme|last|chat|sync-|sched|role|preview|gal|bell|msnd)/;
  const SEM = (typeof COURSE !== "undefined" && (COURSE.semesterId || COURSE.session)) || "";

  firebase.initializeApp(CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();

  /* ---------- The lecturer's changes to the public timetable (applied by schedule.js on the next page load) ---------- */
  const SCHED_ID = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // the same content always gives the same text (Firestore returns the fields in any order)
  const stable = (x) => (Array.isArray(x) ? `[${x.map(stable).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}` : JSON.stringify(x));
  db.collection("schedule").doc(SCHED_ID).get().then((d) => {
    const v = d.exists ? stable({ semester: SEM, weeks: d.data().weeks || {}, labs: d.data().labs || {}, topics: d.data().topics || {} }) : "";
    let old = ""; try { old = localStorage.getItem("nmk-sched") || ""; } catch (e) { /* private mode */ }
    try { if (old) old = stable(JSON.parse(old)); } catch (e) { old = ""; }
    if (v === old) return;
    try { if (v) localStorage.setItem("nmk-sched", v); else localStorage.removeItem("nmk-sched"); } catch (e) { return; }
    // draw the page again with the new timetable, but only on pages that just show it (nothing for a student to type
    // and lose); everywhere else the new timetable appears on the next page opened. Never twice within 30 seconds.
    const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (!["", "index.html", "schedule.html", "chapters.html", "labs.html"].includes(page)) return;
    let last = 0; try { last = +sessionStorage.getItem("nmk-sched-reload-at") || 0; } catch (e) { return; }
    if (Date.now() - last < 30000) return;
    try { sessionStorage.setItem("nmk-sched-reload-at", String(Date.now())); } catch (e) { return; }
    location.reload();
  }).catch(() => { /* offline: keep the copy this browser has */ });
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isAdmin = (email) => ADMINS.includes(String(email || "").toLowerCase());
  const allowed = (email) => isAdmin(email) || String(email || "").toLowerCase().endsWith(STUDENT_DOMAIN);
  const ls = {
    keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith("nmk-") && !LOCAL_ONLY.test(k)); } catch (e) { return []; } },
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  const state = { user: null, profile: null, roster: null, ready: false };
  const listeners = [];
  const changed = () => listeners.forEach((f) => { try { f(state); } catch (e) { /* a page's own problem */ } });

  /* ---------- Exercise log: every check of an exercise, kept in this browser (and synced when approved) ---------- */
  document.addEventListener("nmk:exercise", (e) => {
    const d = e.detail || {};
    if (!d.id) return;
    let log = {};
    try { log = JSON.parse(ls.get(EX_KEY) || "{}") || {}; } catch (err) { log = {}; }
    const r = log[d.id] || { checks: 0, wrong: 0, solved: false };
    r.checks++;
    if (!d.solved) r.wrong++;
    if (d.solved && !r.solved) { r.solved = true; r.firstTry = r.wrong === 0; r.hints = d.hints || 0; r.solvedAt = new Date().toISOString(); }
    r.last = d.answers; r.at = new Date().toISOString();
    log[d.id] = r;
    ls.set(EX_KEY, JSON.stringify(log));
    queuePush();
  });
  document.addEventListener("nmk:store", queuePush);

  /* ---------- Sync with Firestore (approved students and lecturers only) ---------- */
  let timer = 0;
  function queuePush() { if (canSync()) { clearTimeout(timer); timer = setTimeout(push, 2500); } }
  const canSync = () => state.user && state.profile && state.profile.status === "approved";
  function snapshot() { const o = {}; ls.keys().forEach((k) => { o[k] = ls.get(k); }); return o; }
  async function push() {
    if (!canSync()) return;
    try {
      const keys = snapshot();
      await db.collection("progress").doc(state.user.uid).set({ keys, semester: SEM, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      if (window.NMKGame) {   // the small public summary for the progress board
        const G = window.NMKGame, g = G.compute(keys), p = state.profile, r = state.roster || {};
        // the public profile: classmates see the real name, matric and lab section from the class list, and the Google account photo
        await db.collection("board").doc(state.user.uid).set({ nickname: p.nickname || "", role: p.role || "student", semester: SEM, xp: g.xp, level: g.level, levelNo: g.levelNo,
          badges: g.badges.map((b) => b.id), streak: g.streak, solved: g.solved, lastActive: g.lastActive || null,
          stops: Object.fromEntries(g.stops.filter((s) => s.total).map((s) => [s.label, s.pct])), prog: G.summaryProg ? G.summaryProg(g) : {}, feed: G.feed ? G.feed(g, 20) : [],
          name: r.name || p.name || "", matric: r.matric || "", section: r.section || "", group: r.group || 0, photo: state.user.photoURL || "",
          since: p.createdAt || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      await db.collection("users").doc(state.user.uid).update({ lastActive: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) { console.warn("NMK sync: could not save progress", e.code || e); }
  }
  // On the first sign-in on this device, merge what was saved online with what this browser has.
  // A different account on this browser replaces the old one's records, so two students never mix.
  async function pull() {
    let remote = {};
    try { const doc = await db.collection("progress").doc(state.user.uid).get(); remote = (doc.exists && doc.data().keys) || {}; }
    catch (e) { console.warn("NMK sync: could not load progress", e.code || e); return; }
    const before = JSON.stringify(snapshot());
    if (ls.get(UID_KEY) && ls.get(UID_KEY) !== state.user.uid) ls.keys().forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    Object.keys(remote).forEach((k) => {
      if (!k.startsWith("nmk-") || LOCAL_ONLY.test(k)) return;
      const local = ls.get(k);
      if (local === null) ls.set(k, remote[k]);
      else if (k === "nmk-solved") { try { ls.set(k, JSON.stringify([...new Set(JSON.parse(local).concat(JSON.parse(remote[k])))])); } catch (e) { /* keep local */ } }
      else if (k === EX_KEY) {
        try { const a = JSON.parse(local), b = JSON.parse(remote[k]); Object.keys(b).forEach((id) => { if (!a[id] || (b[id].checks || 0) > (a[id].checks || 0)) a[id] = b[id]; }); ls.set(k, JSON.stringify(a)); } catch (e) { /* keep local */ }
      }
    });
    ls.set(UID_KEY, state.user.uid);
    await push();
    // the page was drawn from the old records: draw it again once, so lessons show the merged progress
    if (JSON.stringify(snapshot()) !== before && !sessionStorage.getItem("nmk-sync-reloaded")) {
      try { sessionStorage.setItem("nmk-sync-reloaded", "1"); } catch (e) { /* ignore */ }
      location.reload();
    }
  }

  /* ---------- Sign in and out ---------- */
  // Google doesn't allow signing in inside the browsers of apps such as WhatsApp, Telegram, Instagram or Facebook
  const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Telegram|TikTok|musical_ly|Snapchat|MicroMessenger|; wv\)/i.test(navigator.userAgent || "");
  async function signIn(again) {
    if (IN_APP) {
      const box = modal(`<h2>Open in Chrome or Safari</h2><p>Google sign-in doesn't work inside this app's browser. Open this page in Chrome or Safari: tap the menu (⋮ or ···) and choose <strong>Open in browser</strong>, or copy the link and paste it there.</p>
        <div class="acc-row"><button type="button" class="btn" data-copy>Copy the link</button><button type="button" class="btn ghost" data-close>Close</button></div>`, false);
      $("[data-close]", box).addEventListener("click", closeModal);
      $("[data-copy]", box).addEventListener("click", (e) => { const ok = () => { e.target.textContent = "Copied ✓"; }; if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(ok, () => prompt("Copy this link:", location.href)); else prompt("Copy this link:", location.href); });
      return;
    }
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await auth.signInWithPopup(p); }
    catch (e) {
      if (e.code === "auth/popup-blocked" && !again) {
        // the browser blocked the sign-in window: one more tap opens it (a fresh tap is allowed to open a window)
        const box = modal(`<h2>Sign in with Google</h2><p>Your browser stopped the sign-in window. Tap the button to open it.</p>
          <div class="acc-row"><button type="button" class="btn" data-go>Continue with Google</button><button type="button" class="btn ghost" data-close>Cancel</button></div>`, false);
        $("[data-close]", box).addEventListener("click", closeModal);
        $("[data-go]", box).addEventListener("click", () => { closeModal(); signIn(true); });
      }
      // last resort: sign in on Google's own page and come back (this leaves Google's pages in the Back history)
      else if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await auth.signInWithRedirect(p);
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") notice("Sign-in didn't work", `Please try again. (${esc(e.code || "unknown error")})`);
    }
  }
  const signOut = () => auth.signOut();

  auth.onAuthStateChanged(async (u) => {
    state.user = u; state.profile = null; state.ready = true;
    // remember in this browser whether a lecturer is signed in: the course journey shows them a class summary instead
    const role = u && isAdmin(u.email) ? "lecturer" : "";
    if ((ls.get("nmk-role") || "") !== role) { try { if (role) localStorage.setItem("nmk-role", role); else { localStorage.removeItem("nmk-role"); localStorage.removeItem("nmk-preview"); } } catch (e) { /* private mode */ } }
    if (window.NMKGame && window.NMKGame.paint) setTimeout(window.NMKGame.paint, 0);
    if (!u) { paint(); changed(); loadBell(false); paintLog(); return; }
    if (!allowed(u.email)) {
      await auth.signOut();
      notice("Use your UniMAP student account", `<p>This course site accepts only <strong>@studentmail.unimap.edu.my</strong> Google accounts. You signed in as <strong>${esc(u.email)}</strong>.</p><p>Sign in again and choose your studentmail account.</p>`);
      return;
    }
    try {
      const ref = db.collection("users").doc(u.uid), doc = await ref.get();
      state.roster = isAdmin(u.email) ? null : await rosterOf(u.email);
      const listed = !!(state.roster && state.roster.status === "active");
      if (doc.exists) {
        state.profile = doc.data();
        // a student who asked before the class list was loaded is approved as soon as they are on it
        if (state.profile.status === "pending" && listed) { await ref.update({ status: "approved", approvedBy: "class list" }); state.profile.status = "approved"; }
      } else if (isAdmin(u.email)) {
        state.profile = { email: u.email.toLowerCase(), name: u.displayName || "", nickname: NICK[u.email.toLowerCase()] || "Lecturer", status: "approved", role: "lecturer", semester: SEM };
        await ref.set(Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, state.profile));
      } else { setup(u, listed); }
    } catch (e) { console.warn("NMK account: could not load the profile", e.code || e); }
    paint(); changed(); loadBell(false);
    // is the Missions game released to students? (for the menu link)
    if (state.profile && state.profile.status === "approved") db.collection("meta").doc("missions").get().then((d) => { missionsOpen = !!(d.exists && d.data().released); }).catch(() => {});
    if (canSync()) { pull(); queuePush(); loadAttendance(); db.collection("users").doc(u.uid).update({ lastActive: firebase.firestore.FieldValue.serverTimestamp(), photo: u.photoURL || "" }).catch(() => {}); }
  });

  /* ---------- Attendance ---------- */
  // Is this studentmail address on the NMK42003 class list (and not dropped)? Students on it are approved straight away.
  async function rosterOf(email) {
    try { const r = await db.collection("roster").doc(String(email).toLowerCase()).get(); return r.exists ? r.data() : null; }
    catch (e) { return null; }
  }
  // A student's own attendance records, kept in this browser as nmk-att for the course journey (XP and badges)
  async function loadAttendance() {
    if (!state.user || isAdmin(state.user.email)) return;
    const em = state.user.email.toLowerCase();
    try {
      const [r, snap] = await Promise.all([db.collection("roster").doc(em).get(), db.collection("attendance").where("email", "==", em).get()]);
      if (r.exists) state.roster = r.data();
      const recs = snap.docs.map((d) => d.data()).filter((x) => !x.semester || x.semester === SEM)
        .map((x) => ({ t: x.title || "", k: x.kind || "", d: x.date || "", s: x.status })).sort((a, b) => (a.d < b.d ? -1 : 1));
      const v = JSON.stringify({ section: r.exists ? r.data().section || "" : "", recs });
      if (ls.get("nmk-att") !== v) { ls.set("nmk-att", v); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-att" })); }
    } catch (e) { console.warn("NMK attendance: could not load your records", e.code || e); }
  }

  /* ---------- First sign-in: privacy notice and a nickname ---------- */
  function setup(u, listed) {
    const box = modal(`<h2>Welcome to NMK42003</h2>
      <p>Signed in as <strong>${esc(u.email)}</strong>.</p>
      <div class="acc-privacy"><strong>What is saved, and who sees it</strong>
        <p>When your account is approved, this site saves your name, your studentmail address, the nickname you choose, your progress (the exercises you answer, your Pre-Lab Check results and your virtual lab work) and your class attendance. It is kept in a Google Firebase database run by your lecturer, and is used only for this course.</p>
        <p>Your lecturers can see all of it. Classmates will see your name, matric number, lab section, Google account photo, nickname, level and badges on the course progress board and your profile, never your attendance. Nothing here counts towards your grade, and the site works fully without signing in.</p></div>
      <form class="acc-form" novalidate>
        <label for="accNick">Choose a nickname <span>3 to 16 letters or numbers. Classmates will see it.</span></label>
        <input id="accNick" type="text" maxlength="16" autocomplete="off" spellcheck="false" required>
        <label class="acc-ok"><input type="checkbox" id="accAgree"> I have read what is saved and agree.</label>
        <p class="acc-err" aria-live="polite"></p>
        ${listed ? `<p class="acc-note">You are on the NMK42003 class list, so your account is approved straight away.</p>` : ""}
        <div class="acc-row"><button type="submit" class="btn">${listed ? "Start" : "Request access"}</button><button type="button" class="btn ghost" data-cancel>Cancel and sign out</button></div>
      </form>`, false);
    const form = $(".acc-form", box), err = $(".acc-err", box);
    $("#accNick", box).focus();
    $("[data-cancel]", box).addEventListener("click", () => { closeModal(); signOut(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nick = $("#accNick", box).value.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) { err.textContent = "Use 3 to 16 letters, numbers or underscores, with no spaces."; return; }
      if (!$("#accAgree", box).checked) { err.textContent = "Please tick the box to agree."; return; }
      try {
        state.profile = { email: u.email.toLowerCase(), name: u.displayName || "", nickname: nick, status: listed ? "approved" : "pending", role: "student", semester: SEM };
        await db.collection("users").doc(u.uid).set(Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, state.profile, listed ? { approvedBy: "class list" } : {}));
        closeModal(); paint(); changed();
        if (canSync()) { pull(); loadAttendance(); }
      } catch (ex) { err.textContent = `Could not save: ${ex.code || ex}. Please try again.`; }
    });
  }

  /* ---------- The header button, its menu, the status banner ---------- */
  const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "icon-btn acc-btn"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
  const theme = $("#themeBtn");
  if (theme) theme.parentNode.insertBefore(btn, theme);
  const menu = document.createElement("div");
  menu.className = "acc-menu"; menu.hidden = true;
  document.body.appendChild(menu);

  const STATUS = { approved: "Approved", pending: "Waiting for approval", rejected: "Not approved" };
  let missionsOpen = false;
  function paint() {
    const u = state.user, p = state.profile;
    if (!u) { btn.innerHTML = `${ICON}<span class="acc-t">Sign in</span>`; btn.setAttribute("aria-label", "Sign in with Google"); btn.className = "icon-btn acc-btn out"; }
    else {
      const initial = ((p && p.nickname) || u.displayName || u.email || "?").trim()[0].toUpperCase();
      btn.innerHTML = `${u.photoURL ? `<img class="acc-av" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="acc-av">${esc(initial)}</span>`}${p && p.status !== "approved" ? '<span class="acc-dot" aria-hidden="true"></span>' : ""}`;
      btn.setAttribute("aria-label", `Your account: ${p ? STATUS[p.status] || p.status : "signed in"}`);
      btn.className = "icon-btn acc-btn in";
    }
    banner();
  }
  function banner() {
    const old = $(".acc-banner");
    if (old) old.remove();
    const p = state.profile;
    if (!state.user || !p || p.status === "approved") return;
    const b = document.createElement("div");
    b.className = `acc-banner ${p.status}`;
    b.innerHTML = `<div class="wrap">${p.status === "pending"
      ? `<strong>Your account is waiting for approval.</strong> Your lecturer will approve it soon. Until then, your progress is saved on this device only.`
      : `<strong>Your account was not approved.</strong> If you think this is a mistake, please contact your lecturer.`}</div>`;
    const h = $(".site-header");
    if (h) h.insertAdjacentElement("afterend", b);
  }
  function openMenu() {
    const u = state.user, p = state.profile;
    menu.innerHTML = `<div class="acc-who"><strong>${esc((p && p.nickname) || u.displayName || "")}</strong><span>${esc(u.email)}</span>
        <span class="acc-st ${p ? p.status : ""}">${p ? STATUS[p.status] || p.status : "Setting up…"}</span></div>
      ${p && p.status === "approved" ? `<p class="acc-note">Your progress is saved to your account and follows you to any device.</p>` : ""}
      ${isAdmin(u.email) ? "" : `<a class="acc-item" href="profile.html">My profile</a>`}
      <a class="acc-item" href="notifications.html">Notifications</a>
      <a class="acc-item" href="board.html">Progress board</a>
      <a class="acc-item" href="gallery.html">Class Moments</a>
      ${isAdmin(u.email) || missionsOpen ? `<a class="acc-item" href="missions.html">Missions${isAdmin(u.email) && !missionsOpen ? " (not released)" : ""}</a>` : ""}
      <a class="acc-item" href="attendance.html">${isAdmin(u.email) ? "Attendance (lecturer)" : "Attendance"}</a>
      ${isAdmin(u.email) ? `<a class="acc-item" href="admin.html">Lecturer dashboard</a>` : ""}
      <button type="button" class="acc-item" data-out>Sign out</button>`;
    const r = btn.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
    menu.hidden = false; btn.setAttribute("aria-expanded", "true");
    const first = menu.querySelector("a, button");
    if (first) first.focus();
  }
  const closeMenu = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", () => { if (!state.user) signIn(false); else if (menu.hidden) openMenu(); else closeMenu(); });
  menu.addEventListener("click", (e) => { if (e.target.closest("[data-out]")) { closeMenu(); signOut(); } });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { closeMenu(); btn.focus(); } });

  /* ---------- The notification bell: what is waiting for this person, and what changed lately ----------
     Students: swap requests to answer, attendance open now that they haven't marked, and their swaps and absence
     notices that were decided. Lecturers: swaps the students completed, swaps and absence notices waiting, and
     accounts waiting for approval. "To do" items stay until they are done; other news counts as new until the bell
     is opened (nmk-bell, this browser only). The list is read again at most once a minute. */
  const BELL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const bell = document.createElement("button");
  bell.type = "button"; bell.className = "icon-btn acc-bell"; bell.hidden = true; bell.setAttribute("aria-haspopup", "true"); bell.setAttribute("aria-expanded", "false");
  if (btn.parentNode) btn.parentNode.insertBefore(bell, btn);
  const bellBox = document.createElement("div");
  bellBox.className = "acc-menu acc-bellbox"; bellBox.hidden = true; bellBox.setAttribute("role", "region"); bellBox.setAttribute("aria-label", "Notifications");
  document.body.appendChild(bellBox);
  let bellItems = [], bellAt = 0, bellUser = "";
  const tms = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() || 0 : 0);
  const klToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const seenAt = () => { try { return +localStorage.getItem("nmk-bell") || 0; } catch (e) { return 0; } };
  const SEC = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
  const slotOf = (s) => s.slot || ((s.id || "").match(/-(w\d\d-lab)-(mon|wed|thu)$/) || [])[1] || "";
  async function loadBell(force) {
    const u = state.user, em = u ? u.email.toLowerCase() : "";
    if (!u || !state.profile || state.profile.status !== "approved") { bellItems = []; bellUser = ""; paintBell(); return; }
    if (!force && bellUser === em && Date.now() - bellAt < 60000) return;
    bellAt = Date.now(); bellUser = em;
    const out = [], add = (o) => out.push(o);
    try {
      if (isAdmin(em)) {
        const [sw, nt, us] = await Promise.all([db.collection("swaps").where("semester", "==", SEM).get(),
          db.collection("notices").where("status", "==", "pending").get(), db.collection("users").where("status", "==", "pending").get()]);
        nt.docs.map((d) => d.data()).filter((n) => !n.semester || n.semester === SEM).forEach((n) => add({ todo: true, t: tms(n.at), href: "attendance.html", text: `<strong>${esc(n.name)}</strong> sent an absence notice for ${esc(n.title)}${n.docLater && !n.doc ? " (document to follow)" : ""}` }));
        // notices sent before their document was ready: the document arrived, or is overdue
        const later = await db.collection("notices").where("docLater", "==", true).get().catch(() => ({ docs: [] }));
        later.docs.map((d) => d.data()).filter((n) => (!n.semester || n.semester === SEM) && n.status !== "rejected").forEach((n) => {
          if (n.doc && n.docAddedAt) add({ t: tms(n.docAddedAt), href: "attendance.html", text: `<strong>${esc(n.name)}</strong> added the supporting document for ${esc(n.title)}` });
          else if (!n.doc && n.status === "approved" && klToday() > n.docDue) add({ todo: true, t: Date.parse(`${n.docDue}T23:59:00+08:00`), href: "attendance.html", text: `Document overdue: <strong>${esc(n.name)}</strong>, ${esc(n.title)} (due ${esc(n.docDue)})` });
        });
        us.docs.map((d) => d.data()).forEach((x) => add({ todo: true, t: tms(x.createdAt), href: "admin.html", text: `<strong>${esc(x.nickname || x.email)}</strong> is waiting for account approval` }));
        // attendance warnings waiting for you to send (Manual mode)
        const [wm, wd] = await Promise.all([db.collection("meta").doc("warnings").get(), db.collection("warnings").where("hasDue", "==", true).get()].map((p) => p.catch(() => null)));
        const due = wd ? wd.docs.map((d) => d.data()).filter((w) => w.semester === SEM) : [];
        if (wm && wm.exists && wm.data().mode !== "auto" && due.length) add({ todo: true, t: Math.max(...due.map((w) => tms(w.updatedAt))), href: "attendance.html", text: `<strong>${due.length}</strong> student${due.length === 1 ? " has" : "s have"} attendance warnings waiting to be sent (Attendance > Warnings)` });
        sw.docs.map((d) => d.data()).forEach((x) => {
          if (x.status === "accepted") add({ todo: true, t: tms(x.updatedAt), href: "attendance.html", text: `Lab swap waiting for your approval: ${esc(x.fromName)} ⇄ ${esc(x.toName)}, ${esc(x.labTitle)}` });
          else if (x.status === "requested") add({ t: tms(x.createdAt), href: "attendance.html", text: `Lab swap asked: <strong>${esc(x.fromName)}</strong> (${SEC[x.fromSection] || "–"}) asks <strong>${esc(x.toName)}</strong> (${SEC[x.toSection] || "–"}), ${esc(x.labTitle)}` });
          else if (x.status === "declined") add({ t: tms(x.updatedAt), href: "attendance.html", text: `Lab swap declined: ${esc(x.toName)} declined ${esc(x.fromName)}, ${esc(x.labTitle)}` });
          else if (x.status === "approved" && x.auto) add({ t: tms(x.updatedAt), href: "attendance.html", text: `Lab swap done: <strong>${esc(x.fromName)}</strong> (${SEC[x.fromSection] || "–"}) ⇄ <strong>${esc(x.toName)}</strong> (${SEC[x.toSection] || "–"}), ${esc(x.labTitle)}` });
        });
      } else if (state.roster && state.roster.status === "active") {
        const r = state.roster, mat = String(r.matric), mine = (q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => !x.semester || x.semester === SEM);
        const [got, sent, nts, open, mv, att] = await Promise.all([db.collection("swaps").where("toMatric", "==", mat).get(), db.collection("swaps").where("fromEmail", "==", em).get(),
          db.collection("notices").where("email", "==", em).get(), db.collection("sessions").where("state", "==", "open").get(),
          db.collection("labMoves").where("email", "==", em).get(), db.collection("attendance").where("email", "==", em).get()].map((p) => p.catch(() => ({ docs: [] }))));
        const moves = {}, done = new Set(mine(att).map((x) => x.session));
        mine(mv).forEach((m) => { moves[m.slot] = m.section; });
        mine(open).filter((s) => s.date === klToday() && !done.has(s.id) && (s.section === "all" || s.section === (s.kind === "lab" && moves[slotOf(s)] ? moves[slotOf(s)] : r.section)))
          .forEach((s) => add({ todo: true, t: tms(s.openedAt) || Date.now(), href: "attendance.html", text: `Attendance is open: <strong>${esc(s.title)}</strong>. Mark it now.` }));
        mine(got).forEach((x) => {
          if (x.status === "requested") add({ todo: true, t: tms(x.createdAt), href: "attendance.html#requests", text: `<strong>${esc(x.fromName)}</strong> asks to swap ${esc(x.labTitle)} with you` });
          else if (x.status === "approved" && x.byLecturer) add({ t: tms(x.createdAt), href: "attendance.html", text: `Your lecturer swapped your lab: ${esc(x.labTitle)}` });
        });
        mine(sent).forEach((x) => {
          if (x.status === "approved") add({ t: tms(x.updatedAt), href: "attendance.html", text: x.byLecturer ? `Your lecturer swapped your lab: ${esc(x.labTitle)}` : `<strong>${esc(x.toName)}</strong> accepted: you swapped ${esc(x.labTitle)}` });
          else if (x.status === "declined") add({ t: tms(x.updatedAt), href: "attendance.html", text: `<strong>${esc(x.toName)}</strong> declined your swap for ${esc(x.labTitle)}` });
          else if (["rejected", "cancelled", "ended"].includes(x.status) && x.decidedBy) add({ t: tms(x.updatedAt), href: "attendance.html", text: `Your lecturer ${x.status === "rejected" ? "did not approve" : "cancelled"} your swap for ${esc(x.labTitle)}` });
        });
        // attendance warnings emailed to me and my RPS
        const wslug = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), WLV = { 1: "Attendance Warning 1", 2: "Attendance Warning 2", 3: "Barring Notification" };
        const wdoc = await db.collection("warnings").doc(`${wslug}_${em}`).get().catch(() => null);
        ((wdoc && wdoc.exists && wdoc.data().history) || []).filter((x) => x.mailed).forEach((x) => add({ t: tms(x.at), href: "attendance.html", text: x.type === "withdraw"
          ? `Your ${WLV[x.level]} (${x.kind === "lab" ? "Labs" : "Lectures"}) is <strong>withdrawn</strong>: your absence notice was approved`
          : `<strong>${WLV[x.level]} (${x.kind === "lab" ? "Labs" : "Lectures"})</strong> was emailed to you and your RPS. Check your attendance.` }));
        mine(nts).filter((n) => n.docLater && !n.doc && n.status !== "rejected").forEach((n) => add({ todo: true, t: tms(n.at), href: "attendance.html", text: `Add your supporting document for <strong>${esc(n.title)}</strong> by ${esc(n.docDue)}` }));
        mine(nts).filter((n) => n.status !== "pending").forEach((n) => add({ t: tms(n.decidedAt), href: "attendance.html", text: `Your absence notice for ${esc(n.title)} was <strong>${n.status === "approved" ? "approved (Excused)" : "not approved"}</strong>${n.note ? `: “${esc(n.note)}”` : ""}` }));
      }
    } catch (e) { console.warn("NMK bell: could not check for notifications", e.code || e); }
    const seen = seenAt();
    bellItems = out.map((o) => Object.assign(o, { fresh: o.t > seen })).sort((a, b) => (b.todo - a.todo) || b.t - a.t).slice(0, 200);
    paintBell(); paintLog();
    // once per visit: a small reminder after signing in when something is waiting
    const n = bellCount();
    let shown = true; try { shown = sessionStorage.getItem("nmk-bell-told") === em; } catch (e) { /* private mode */ }
    if (n && !shown) { try { sessionStorage.setItem("nmk-bell-told", em); } catch (e) { /* private mode */ } toast(n); }
  }
  // the number on the bell: what arrived since the bell (or the notifications page) was last opened
  const bellCount = () => bellItems.filter((o) => o.fresh).length;
  const noteDate = (t) => { const d = new Date(t + 8 * 3600000).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}, ${d.slice(11, 16)}`; };
  const noteLi = (o) => `<li class="${o.fresh ? "fresh" : o.todo ? "todo" : ""}"><a href="${o.href}">${o.todo ? '<span class="acc-tag">To do</span> ' : ""}${o.fresh ? '<span class="acc-tag new">New</span> ' : ""}${o.text}${o.t ? `<small>${noteDate(o.t)}</small>` : ""}</a></li>`;
  const markSeen = () => { try { localStorage.setItem("nmk-bell", String(Date.now())); } catch (e) { /* private mode */ } };
  // notifications.html: the whole list (the page counts as opening the bell)
  function paintLog() {
    const box = document.getElementById("notes");
    if (!box) return;
    if (!state.user) { box.innerHTML = `<p>Sign in to see your notifications.</p>`; return; }
    if (!bellUser) { box.innerHTML = `<p class="small-note">Notifications appear here once your account is approved.</p>`; return; }
    const todo = bellItems.filter((o) => o.todo), rest = bellItems.filter((o) => !o.todo);
    box.innerHTML = `${todo.length ? `<h2 class="h3">To Do</h2><ul class="acc-notes acc-log">${todo.map(noteLi).join("")}</ul>` : ""}
      <h2 class="h3">${todo.length ? "Everything Else" : "All Notifications"}</h2>${rest.length ? `<ul class="acc-notes acc-log">${rest.map(noteLi).join("")}</ul>` : `<p class="small-note">Nothing yet.</p>`}`;
    markSeen(); bellItems.forEach((o) => { o.fresh = false; }); paintBell();
  }
  function paintBell() {
    bell.hidden = !bellUser;
    const n = bellCount();
    bell.innerHTML = `${BELL_ICON}${n ? `<span class="acc-badge">${n > 9 ? "9+" : n}</span>` : ""}`;
    bell.setAttribute("aria-label", n ? `Notifications: ${n} new` : "Notifications");
  }
  function openBell() {
    const show = bellItems.filter((o) => o.todo || o.fresh).concat(bellItems.filter((o) => !o.todo && !o.fresh)).slice(0, 12);
    bellBox.innerHTML = `<div class="acc-who"><strong>Notifications</strong></div>${show.length ? `<ul class="acc-notes">${show.map(noteLi).join("")}</ul>` : `<p class="acc-note">Nothing yet.</p>`}
      <a class="acc-item acc-all" href="notifications.html">See all notifications →</a>`;
    const r = bell.getBoundingClientRect();
    bellBox.style.top = `${Math.round(r.bottom + 8)}px`;
    bellBox.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
    bellBox.hidden = false; bell.setAttribute("aria-expanded", "true");
    // opened: everything so far counts as seen (the list keeps it, and to-do items stay marked until they are done)
    markSeen();
    bellItems.forEach((o) => { o.fresh = false; });
    paintBell();
    const first = bellBox.querySelector("a");
    if (first) first.focus();
  }
  const closeBell = () => { bellBox.hidden = true; bell.setAttribute("aria-expanded", "false"); };
  bell.addEventListener("click", () => { closeMenu(); if (bellBox.hidden) openBell(); else closeBell(); });
  document.addEventListener("click", (e) => { if (!bellBox.hidden && !e.composedPath().some((n) => n === bell || n === bellBox)) closeBell(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !bellBox.hidden) { closeBell(); bell.focus(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadBell(false); });
  setInterval(() => { if (document.visibilityState === "visible") loadBell(false); }, 180000);
  // pages call this after something changed (an answered swap, a marked attendance): read the list again shortly
  let bellT = 0;
  const refreshBell = () => { clearTimeout(bellT); bellT = setTimeout(() => loadBell(true), 1500); };
  function toast(n) {
    const t = document.createElement("div");
    t.className = "acc-toast"; t.setAttribute("role", "status");
    t.innerHTML = `<span>You have <strong>${n}</strong> notification${n === 1 ? "" : "s"}.</span><button type="button" class="btn small">Show</button><button type="button" class="acc-x" aria-label="Close">×</button>`;
    document.body.appendChild(t);
    const bye = () => t.remove();
    t.querySelector(".btn").addEventListener("click", (e) => { e.stopPropagation(); bye(); openBell(); });
    t.querySelector(".acc-x").addEventListener("click", bye);
    setTimeout(bye, 9000);
  }

  /* ---------- A small dialog ---------- */
  let back = null;
  function modal(html, closable = true) {
    closeModal();
    back = document.createElement("div");
    back.className = "acc-back";
    back.innerHTML = `<div class="acc-modal" role="dialog" aria-modal="true">${html}${closable ? '<div class="acc-row"><button type="button" class="btn" data-close>OK</button></div>' : ""}</div>`;
    document.body.appendChild(back);
    const b = back.querySelector("[data-close]");
    if (b) { b.addEventListener("click", closeModal); b.focus(); }
    return back;
  }
  function closeModal() { if (back) { back.remove(); back = null; } }
  const notice = (title, html) => modal(`<h2>${title}</h2>${html.startsWith("<p>") ? html : `<p>${html}</p>`}`);

  paint();
  // For admin.html and later pages: read-only access to the signed-in state and the database
  // Lecturers: a student's studentmail address is the id of their class-list entry and part of the id of their records,
  // so a new address means new records: copy each one to the new id, then delete the old (batches of up to 400 writes).
  // Used by Class List → Edit (attendance.js) and Edit Details on the profile (profile.js).
  async function changeEmail(old, em, data) {
    const ops = [], docs = async (c, f) => (await db.collection(c).where(f, "==", old).get()).docs;
    ops.push((b) => b.set(db.collection("roster").doc(em), Object.assign({}, data, { email: em })));
    const move = (c, d, id) => { const x = d.data(); ops.push((b) => b.set(db.collection(c).doc(id(x)), Object.assign({}, x, { email: em }))); ops.push((b) => b.delete(d.ref)); };
    (await docs("attendance", "email")).forEach((d) => move("attendance", d, (x) => `${x.session}_${em}`));
    (await docs("notices", "email")).forEach((d) => move("notices", d, (x) => `${x.session}_${em}`));
    (await docs("labMoves", "email")).forEach((d) => move("labMoves", d, (x) => `${x.slot}_${em}`));
    (await docs("labmarks", "email")).forEach((d) => move("labmarks", d, () => d.id.slice(0, d.id.length - old.length) + em));
    (await docs("swaps", "fromEmail")).forEach((d) => ops.push((b) => b.update(d.ref, { fromEmail: em })));
    // the old entry goes last, so nothing is lost if a batch fails half way
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
    await db.collection("roster").doc(old).delete();
  }

  window.NMKAccount = { db, auth, isAdmin, state, on: (f) => { listeners.push(f); if (state.ready) f(state); }, signIn, loadAttendance, push, SEM, refreshBell, changeEmail };
})();
