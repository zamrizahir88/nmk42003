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
  const LOCAL_ONLY = /^nmk-(theme|last|chat|sync-|sched|role|preview|gal|bell|msnd|mus|pj-draft|pick)/;
  const SEM = (typeof COURSE !== "undefined" && (COURSE.semesterId || COURSE.session)) || "";

  firebase.initializeApp(CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  // Keep Firestore's data in this browser: a live list opened again within 30 minutes is then billed only for the
  // documents that changed, not read again in full (the free plan allows 50,000 reads a day). Pages that act on what
  // they read (attendance) wait for the server's copy (snapshot.metadata.fromCache is false).
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => { /* private mode, or an old browser: no cache */ }); } catch (e) { /* no cache */ }
  // Every live list on the site gets the server's copy only, never the browser's cached one: pages act on what they
  // read (closing a session marks the rest Absent), so they must never act on an old copy. The cache still makes a
  // list opened again cheap. (A snapshot that only says "now confirmed by the server" is passed on once.)
  [firebase.firestore.Query, firebase.firestore.DocumentReference].filter((c) => c && c.prototype && c.prototype.onSnapshot).map((c) => c.prototype).forEach((proto) => {
    const orig = proto.onSnapshot;
    proto.onSnapshot = function (...a) {
      const opts = a[0] && typeof a[0] === "object" && typeof a[0].next !== "function" ? a.shift() : {};
      const next = a[0], fail = a[1];
      if (typeof next !== "function") return orig.apply(this, arguments);
      let got = false;
      return orig.call(this, Object.assign({}, opts, { includeMetadataChanges: true }), (snap) => {
        if (snap.metadata.fromCache) return;
        if (got && !opts.includeMetadataChanges && snap.docChanges && !snap.docChanges().length) return;
        got = true; next(snap);
      }, fail);
    };
  });

  /* ---------- The lecturer's changes to the public timetable (applied by schedule.js on the next page load) ---------- */
  const SCHED_ID = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // the same content always gives the same text (Firestore returns the fields in any order)
  const stable = (x) => (Array.isArray(x) ? `[${x.map(stable).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}` : JSON.stringify(x));
  let schedAt = 0; try { schedAt = +localStorage.getItem("nmk-sched-at") || 0; } catch (e) { /* private mode */ }
  if (Date.now() - schedAt > 30 * 60000) db.collection("schedule").doc(SCHED_ID).get().then((d) => {
    try { localStorage.setItem("nmk-sched-at", String(Date.now())); } catch (e) { /* private mode */ }
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
  // To save Firestore writes, push() sends only what changed since the last send from this browser (pressing Save many
  // times, or switching apps again and again, costs nothing more), and the "last active" time at most every 30 minutes.
  const SENT_KEY = "nmk-sync-sent", ACTIVE_KEY = "nmk-sync-active";
  const hashOf = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return `${str.length}.${h >>> 0}`; };
  let sending = null;
  async function push() {
    if (!canSync()) return;
    if (sending) { await sending.catch(() => {}); }   // one send at a time, so a second one can see the first was enough
    sending = pushNow(); try { await sending; } finally { sending = null; }
  }
  async function pushNow() {
    try {
      const keys = snapshot(), uid = state.user.uid, kh = hashOf(uid + JSON.stringify(keys)), sent = (ls.get(SENT_KEY) || "").split("|");
      if (kh !== sent[0]) await db.collection("progress").doc(uid).set({ keys, semester: SEM, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      let bh = sent[1] || "";
      if (window.NMKGame) {   // the small public summary for the progress board
        const G = window.NMKGame, g = G.compute(keys), p = state.profile, r = state.roster || {};
        // INSTRUMENTA: the game-only numbers for its leaderboard, and the saved character for the avatar
        const pj = (x, d) => { try { return JSON.parse(x) || d; } catch (e) { return d; } };
        const mis = pj(keys["nmk-missions"], {}), msv = pj(keys["nmk-msave"], {}), ids = Object.keys(mis).filter((id) => /^w\d+-s\d+$/.test(id));
        const game = { coins: ids.reduce((a, id) => a + (mis[id].c || 0), 0), cleared: ids.length, bosses: ids.filter((id) => mis[id].boss).length, stars: ids.reduce((a, id) => a + (mis[id].s || 0), 0),
          ch: ids.reduce((o, id) => { const w = id.match(/^w(\d+)/)[1]; o[w] = (o[w] || 0) + 1; return o; }, {}), started: ids.length > 0 || Object.values(msv).some((x) => x && !x.cleared),
          last: ids.map((id) => mis[id].at).concat(Object.values(msv).map((x) => x && x.at)).filter(Boolean).sort().pop() || null, hero: keys["nmk-hero"] || "" };
        // the public profile: classmates see the real name, matric and lab section from the class list, and the Google account photo
        const bd = { nickname: p.nickname || "", role: p.role || "student", semester: SEM, xp: g.xp, level: g.level, levelNo: g.levelNo,
          badges: g.badges.map((b) => b.id), streak: g.streak, solved: g.solved, lastActive: g.lastActive || null,
          stops: Object.fromEntries(g.stops.filter((s) => s.total).map((s) => [s.label, s.pct])), prog: G.summaryProg ? G.summaryProg(g) : {}, feed: G.feed ? G.feed(g, 20) : [],
          name: r.name || p.name || "", matric: r.matric || "", section: r.section || "", group: r.group || 0, photo: state.user.photoURL || "",
          since: p.createdAt || null, game };
        const nb = hashOf(uid + JSON.stringify(bd));
        if (nb !== bh) { await db.collection("board").doc(uid).set(Object.assign({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, bd)); bh = nb; }
      }
      ls.set(SENT_KEY, `${kh}|${bh}`);
      if (Date.now() - (+ls.get(ACTIVE_KEY) || 0) > 30 * 60000) {
        await db.collection("users").doc(uid).update({ lastActive: firebase.firestore.FieldValue.serverTimestamp() });
        ls.set(ACTIVE_KEY, String(Date.now()));
      }
    } catch (e) { console.warn("NMK sync: could not save progress", e.code || e); }
  }
  /* ---------- The class rankings (board.html and the INSTRUMENTA leaderboard) ----------
     One document, boardsum/{semester}, holds every player's line (p.{uid}), built from everyone's board/{uid} at 12:00 AM
     each day by the lecturer's Apps Script (apps-script/rankings.gs), and whenever a lecturer presses "Update rankings
     now". Opening a board reads that 1 document; students write nothing for it. Each student's own points, level and
     badges are live on their own page (worked out on their device). */
  const sumOf = (b) => ({ nickname: b.nickname || "", role: b.role || "student", xp: b.xp || 0, level: b.level || "", levelNo: b.levelNo || 1, badges: b.badges || [],
    streak: b.streak || 0, lastActive: b.lastActive || null, stops: b.stops || {}, name: b.name || "", matric: b.matric || "", section: b.section || "", photo: b.photo || "", game: b.game || null });
  // { rows, at }: the published rankings (at = when they were made); null before the first update
  async function boardRows() {
    const d = await db.collection("boardsum").doc(SCHED_ID).get(), x = d.exists ? d.data() : null;
    if (x && x.p) return { rows: Object.entries(x.p).map(([uid, v]) => Object.assign({ uid }, v)), at: x.at && x.at.toMillis ? x.at.toMillis() : 0 };
    if (state.user && isAdmin(state.user.email)) return buildRankings();   // the first time: make them now
    return null;
  }
  // lecturers: read everyone's board entry (one read each) and publish the rankings (one write)
  async function buildRankings() {
    const q = await db.collection("board").where("semester", "==", SEM).get();
    const p = Object.fromEntries(q.docs.map((d) => [d.id, sumOf(d.data())]));
    await db.collection("boardsum").doc(SCHED_ID).set({ semester: SEM, p, at: firebase.firestore.FieldValue.serverTimestamp(), by: state.user ? state.user.email : "" });
    return { rows: Object.entries(p).map(([uid, v]) => Object.assign({ uid }, v)), at: Date.now() };
  }
  // "Rankings updated daily at 12:00 AM. Last update: today, 2:03 PM"
  function rankNote(at) {
    if (!at) return "Rankings are updated daily at 12:00 AM.";
    const d = new Date(at + 8 * 3600000), t = new Date(Date.now() + 8 * 3600000), day = d.toISOString().slice(0, 10), today = t.toISOString().slice(0, 10);
    const y = new Date(Date.now() - 86400000 + 8 * 3600000).toISOString().slice(0, 10), h = d.getUTCHours();
    return `Rankings are updated daily at 12:00 AM. Last update: ${day === today ? "today" : day === y ? "yesterday" : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`}, ${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}.`;
  }

  // On the first sign-in on this device, merge what was saved online with what this browser has.
  // A different account on this browser replaces the old one's records, so two students never mix.
  async function pull(reload = true) {
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
      // the game: the best result of each station (the higher score wins), and a station in progress (the newer one wins)
      else if (k === "nmk-missions") { try { const a = JSON.parse(local), b = JSON.parse(remote[k]); Object.keys(b).forEach((id) => { const x = a[id], y = b[id]; a[id] = !x ? y : Object.assign({}, x, y, { c: Math.max(x.c || 0, y.c || 0), s: Math.max(x.s || 0, y.s || 0), mk: Math.max(x.mk || 0, y.mk || 0), n: Math.max(x.n || 0, y.n || 0), at: (x.c || 0) >= (y.c || 0) ? x.at : y.at }); if (a[id].mk === 0 && !a[id].boss) delete a[id].mk; }); ls.set(k, JSON.stringify(a)); } catch (e) { /* keep local */ } }
      else if (k === "nmk-hero") { try { if (String(JSON.parse(remote[k]).at || "") > String(JSON.parse(local).at || "")) ls.set(k, remote[k]); } catch (e) { /* keep local */ } }
      else if (k === "nmk-msave") { try { const a = JSON.parse(local), b = JSON.parse(remote[k]); Object.keys(b).forEach((id) => { if (!a[id] || String(b[id].at || "") > String(a[id].at || "")) a[id] = b[id]; }); ls.set(k, JSON.stringify(a)); } catch (e) { /* keep local */ } }
      else if (k === EX_KEY) {
        try { const a = JSON.parse(local), b = JSON.parse(remote[k]); Object.keys(b).forEach((id) => { if (!a[id] || (b[id].checks || 0) > (a[id].checks || 0)) a[id] = b[id]; }); ls.set(k, JSON.stringify(a)); } catch (e) { /* keep local */ }
      }
    });
    ls.set(UID_KEY, state.user.uid);
    const now = snapshot();
    if (JSON.stringify(now) !== before) document.dispatchEvent(new CustomEvent("nmk:synced"));
    // save back only when this browser has something the account doesn't (a few writes saved on every visit)
    if (Object.keys(now).some((k) => now[k] !== remote[k]) || Object.keys(remote).some((k) => !(k in now) && !LOCAL_ONLY.test(k))) await push();
    else { const sent = (ls.get(SENT_KEY) || "").split("|"); ls.set(SENT_KEY, `${hashOf(state.user.uid + JSON.stringify(now))}|${sent[1] || ""}`); }
    // the page was drawn from the old records: draw it again once, so lessons show the merged progress
    if (reload && JSON.stringify(now) !== before && !sessionStorage.getItem("nmk-sync-reloaded")) {
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

  /* ---------- Visits: read once when a student arrives, not on every page ----------
     A visit starts when the site is opened after 30 minutes or more away (or with another account). Its first page
     reads the account, the progress, the attendance records and the bell; the next pages reuse what it read (kept
     in this browser). The bell is read again when it is tapped, after the person's own action (refreshBell), and,
     once the visit has lasted 20 minutes, every 15 minutes while the page is on screen. */
  const VISIT_KEY = "nmk-sync-visit", AWAY_MS = 30 * 60000, BELL_AFTER_MS = 20 * 60000, BELL_EVERY_MS = 15 * 60000;
  const vget = () => { try { return JSON.parse(localStorage.getItem(VISIT_KEY) || "null"); } catch (e) { return null; } };
  const vset = (v) => { try { localStorage.setItem(VISIT_KEY, JSON.stringify(v)); } catch (e) { /* private mode: every page is a new visit */ } };
  const vpatch = (o) => { const v = vget(); if (v && state.user && v.uid === state.user.uid) vset(Object.assign(v, o)); };
  const visitOf = (uid) => { const v = vget(); return v && v.uid === uid && v.profile && Date.now() - (v.seen || 0) < AWAY_MS ? v : null; };
  // Firestore timestamps come back from the browser's copy as plain {seconds, nanoseconds}
  const revive = (o) => { if (o && typeof o === "object") Object.keys(o).forEach((k) => { const x = o[k]; if (x && typeof x === "object" && typeof x.seconds === "number" && typeof x.nanoseconds === "number") o[k] = new firebase.firestore.Timestamp(x.seconds, x.nanoseconds); }); return o; };
  // the start of a visit: the account, the menu switches, the bell, the progress and the attendance records
  async function startVisit(u, again) {
    const was = state.profile && state.profile.status;
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
    // a new visit on a page left open: tell the page only if the account changed (it set itself up already)
    if (!again || was !== (state.profile && state.profile.status)) { paint(); changed(); }
    if (!state.profile || state.profile.status !== "approved") { loadBell(false); return; }   // waiting for approval: checked again on every page
    // is the game released, is a survey round open? (for the menu links)
    const [mi, sv] = await Promise.all([db.collection("meta").doc("missions").get(), db.collection("meta").doc("survey").get()].map((p) => p.catch(() => null)));
    missionsOpen = !!(mi && mi.exists && mi.data().released); surveyOpen = (sv && sv.exists && sv.data().open) || ""; navMine();
    const now = Date.now();
    vset({ uid: u.uid, start: now, seen: now, profile: state.profile, roster: state.roster, missions: missionsOpen, survey: surveyOpen, bell: null });
    loadBell(true);
    if (canSync()) { pull(); db.collection("users").doc(u.uid).update({ lastActive: firebase.firestore.FieldValue.serverTimestamp(), photo: u.photoURL || "" }).then(() => ls.set(ACTIVE_KEY, String(Date.now()))).catch(() => {}); }
  }
  // every minute while the page is on screen: keep the visit alive, refresh the bell after 20 minutes, and start a new
  // visit when the person comes back after 30 minutes or more away
  function tick() {
    const u = state.user;
    if (!u || document.visibilityState !== "visible" || !state.profile || state.profile.status !== "approved") return;
    const v = vget(), now = Date.now();
    if (!v || v.uid !== u.uid || now - (v.seen || 0) >= AWAY_MS) { startVisit(u, true); return; }
    vpatch({ seen: now });
    if (now - (v.start || now) >= BELL_AFTER_MS && now - ((v.bell && v.bell.at) || 0) >= BELL_EVERY_MS) { loadBell(true); if (canSync()) pull(false); }
  }
  setInterval(tick, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });

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
    // the same visit: what its first page read is still good (no reads)
    const v = visitOf(u.uid);
    if (v) {
      state.profile = revive(v.profile); state.roster = revive(v.roster) || null; missionsOpen = !!v.missions; surveyOpen = v.survey || "";
      paint(); changed();
      if (v.bell) { bellUser = u.email.toLowerCase(); bellAt = v.bell.at; showBell(v.bell.items); } else loadBell(true);
      tick();
      return;
    }
    await startVisit(u);
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
    try { keepAtt(await db.collection("attendance").where("email", "==", state.user.email.toLowerCase()).get()); }
    catch (e) { console.warn("NMK attendance: could not load your records", e.code || e); }
  }
  // the records read for the bell serve the course journey too (one read of them per visit, not two)
  function keepAtt(snap) {
    const recs = snap.docs.map((d) => d.data()).filter((x) => !x.semester || x.semester === SEM)
      .map((x) => ({ t: x.title || "", k: x.kind || "", d: x.date || "", s: x.status })).sort((a, b) => (a.d < b.d ? -1 : 1));
    const v = JSON.stringify({ section: (state.roster && state.roster.section) || "", recs });
    if (ls.get("nmk-att") !== v) { ls.set("nmk-att", v); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-att" })); }
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
        if (canSync()) startVisit(u);
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
  let missionsOpen = false, surveyOpen = "";
  function paint() {
    const u = state.user, p = state.profile;
    if (!u) { btn.innerHTML = `${ICON}<span class="acc-t">Sign in</span>`; btn.setAttribute("aria-label", "Sign in with Google"); btn.className = "icon-btn acc-btn out"; }
    else {
      const initial = ((p && p.nickname) || u.displayName || u.email || "?").trim()[0].toUpperCase();
      btn.innerHTML = `${u.photoURL ? `<img class="acc-av" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="acc-av">${esc(initial)}</span>`}<span class="acc-t">My Class <span aria-hidden="true">▾</span></span>${p && p.status !== "approved" ? '<span class="acc-dot" aria-hidden="true"></span>' : ""}`;
      btn.setAttribute("aria-label", `My Class menu. Your account: ${p ? STATUS[p.status] || p.status : "signed in"}`);
      btn.className = "icon-btn acc-btn in";
    }
    navMine();
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
  // the pages that need a login: in the My Class menu, and on phones in the main menu
  function myLinks() {
    const u = state.user, lec = u && isAdmin(u.email);
    return [["attendance.html", "✅", lec ? "Attendance (lecturer)" : "Attendance"], ["kalam.html", "💬", "Kalam Feed"],
      lec || missionsOpen ? ["missions.html", "⚔️", `INSTRUMENTA: Legends${lec && !missionsOpen ? " (not released)" : ""}`] : null,
      ["board.html", "🏆", "Class Board and My Progress"], ["gallery.html", "📷", "Class Moments"], ["notifications.html", "🔔", "Notifications"],
      lec || surveyOpen ? ["survey.html", "📝", lec ? "Course Survey" : "Course Survey (open now)"] : null,
      lec ? ["picker.html", "🎯", "Name Picker"] : null,
      lec ? ["evidence.html", "📊", "Teaching Evidence"] : null,
      lec ? ["admin.html", "🛠", "Lecturer dashboard"] : ["profile.html", "👤", "My Profile"]].filter(Boolean);
  }
  function navMine() {
    const box = $("#navMine");
    if (!box) return;
    box.hidden = !state.user;
    box.innerHTML = state.user ? `<span class="nav-h">My Class</span>${myLinks().map(([h, , t]) => `<a href="${h}">${esc(t)}</a>`).join("")}` : "";
  }
  function openMenu() {
    const u = state.user, p = state.profile;
    menu.innerHTML = `<div class="acc-who"><strong>${esc((p && p.nickname) || u.displayName || "")}</strong><span>${esc(u.email)}</span>
        <span class="acc-st ${p ? p.status : ""}">${p ? STATUS[p.status] || p.status : "Setting up…"}</span></div>
      ${p && p.status === "approved" ? `<p class="acc-note">Your progress is saved to your account and follows you to any device.</p>` : ""}
      <p class="acc-h">My Class</p>
      ${myLinks().map(([h, i, t]) => `<a class="acc-item" href="${h}"><span class="acc-ic" aria-hidden="true">${i}</span>${esc(t)}</a>`).join("")}
      <button type="button" class="acc-item acc-outb" data-out><span class="acc-ic" aria-hidden="true">↩</span>Sign out</button>`;
    const r = btn.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
    // never taller than the screen below the button: the list scrolls inside on a small screen
    menu.style.maxHeight = `${Math.max(160, Math.round(innerHeight - r.bottom - 16))}px`;
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
  let bellItems = [], bellAt = 0, bellUser = "", bellBusy = false;
  const tms = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() || 0 : 0);
  const klToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const seenAt = () => { try { return +localStorage.getItem("nmk-bell") || 0; } catch (e) { return 0; } };
  const SEC = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
  const slotOf = (s) => s.slot || ((s.id || "").match(/-(w\d\d-lab)-(mon|wed|thu)$/) || [])[1] || "";
  async function loadBell(force) {
    const u = state.user, em = u ? u.email.toLowerCase() : "";
    if (!u || !state.profile || state.profile.status !== "approved") { bellItems = []; bellUser = ""; paintBell(); return; }
    if (!force && bellUser === em && Date.now() - bellAt < 60000) return;
    if (bellBusy) return;
    bellBusy = true;
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
        // mini project proposals waiting for review
        const pg = await db.collection("pgroups").where("status", "==", "submitted").get().catch(() => ({ docs: [] }));
        pg.docs.map((d) => d.data()).filter((g) => g.semester === SEM).forEach((g) => add({ todo: true, t: tms(g.submittedAt), href: "project.html", text: `Mini project proposal to review: <strong>${esc((g.proposal && g.proposal.title) || "untitled")}</strong>${g.version > 1 ? " (resubmitted)" : ""}` }));
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
        if (att.docs.length || att.size === 0) keepAtt(att);
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
        // Kalam Feed: new posts from Dr. Zamri (the last 30 days)
        const kf = await db.collection("kalam").orderBy("at", "desc").limit(5).get().catch(() => ({ docs: [] }));
        kf.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((p) => (!p.semester || p.semester === SEM) && Date.now() - tms(p.at) < 30 * 86400000)
          .forEach((p) => add({ t: tms(p.at), href: `kalam.html#kf-${p.id}`, text: `New in <strong>Kalam Feed</strong>: ${esc(p.title || String(p.body || "").slice(0, 80))}` }));
        // the mini project: invitations, the lecturer's decision, and the proposal deadline
        const pm = await db.collection("meta").doc("project").get().catch(() => null);
        if (pm && pm.exists && pm.data().released) {
          const due = tms(pm.data().dueAt), [pi, pg] = await Promise.all([db.collection("pgroups").where("inviteM", "array-contains", mat).get(), db.collection("pgroups").where("memberM", "array-contains", mat).get()].map((p) => p.catch(() => ({ docs: [] }))));
          const g = mine(pg)[0];
          if (!g) mine(pi).filter((x) => x.status !== "approved").forEach((x) => add({ todo: true, t: tms(x.updatedAt), href: "project.html", text: `You are invited to join a mini project group${x.proposal && x.proposal.title ? `: <strong>${esc(x.proposal.title)}</strong>` : ""}` }));
          if (g && g.status === "amend") add({ todo: true, t: (g.review && g.review.at) || tms(g.updatedAt), href: "project.html", text: `Your lecturer asks for an <strong>amendment</strong> to your mini project proposal${g.review && g.review.note ? `: “${esc(g.review.note)}”` : ""}` });
          if (g && g.status === "approved") add({ t: tms(g.approvedAt), href: "project.html", text: `Your mini project title is <strong>approved</strong>: Group ${String(g.no).padStart(2, "0")}, ${esc(g.proposal.title)}` });
          if (g && pm.data().peer && g.memberM.length > 1) {   // the peer evaluation is open: rate your group members
            const slug = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const pe = await db.collection("ppeer").doc(`${slug}_${mat}`).get().catch(() => null);
            if (!(pe && pe.exists)) add({ todo: true, t: tms(pm.data().updatedAt) || Date.now(), href: "project.html", text: "The mini project <strong>peer evaluation</strong> is open: rate the other members of your group (confidential)" });
          }
          if (g) {   // the weekly logbook (weeks 10 to 14): this week's entry, and the lecturer's comments
            const day0 = Date.parse(`${COURSE.semesterStart}T00:00:00+08:00`), cw = Math.floor((Date.now() - day0) / 604800000) + 1;
            const lg = await Promise.all([10, 11, 12, 13, 14].map((w) => db.collection("plog").doc(`${g.id}_w${w}`).get().then((d) => (d.exists ? d.data() : null)).catch(() => null)));
            if (cw >= 10 && cw <= 14 && !lg[cw - 10]) add({ todo: true, t: day0 + 7 * (cw - 1) * 86400000, href: "project.html", text: `Write your group's mini project logbook entry for <strong>week ${cw}</strong> by Sunday, 11:59 PM` });
            lg.filter((x) => x && x.comment && x.comment.text).forEach((x) => add({ t: x.comment.at, href: "project.html", text: `Your lecturer commented on your logbook, week ${x.week}: “${esc(x.comment.text)}”` }));
          }
          if ((!g || g.status === "forming") && due && Date.now() < due) add({ todo: true, t: tms(pm.data().updatedAt) || Date.now(), href: "project.html", text: `${g ? "Submit your mini project title proposal" : "Join or create a mini project group"} by <strong>${noteDate(due)}</strong>` });
        }
        // the course survey: a round is open and I haven't answered it yet
        const sv = await db.collection("meta").doc("survey").get().catch(() => null), svr = sv && sv.exists && sv.data().open;
        if (svr) {
          const skey = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const mineSv = await db.collection("survey").doc(`${skey}_${svr}_${u.uid}`).get().catch(() => null);
          if (mineSv && !mineSv.exists) add({ todo: true, t: tms(sv.data().updatedAt) || Date.now(), href: "survey.html", text: "The <strong>course survey</strong> is open: a few minutes, no marks, and it helps improve the course" });
        }
        // attendance warnings emailed to me and my RPS
        const wslug = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), WLV = { 1: "Attendance Warning 1", 2: "Attendance Warning 2", 3: "Barring Notification" };
        const wdoc = await db.collection("warnings").doc(`${wslug}_${em}`).get().catch(() => null);
        ((wdoc && wdoc.exists && wdoc.data().history) || []).filter((x) => x.mailed).forEach((x) => add({ t: tms(x.at), href: "attendance.html#records", text: x.type === "withdraw"
          ? `Your ${WLV[x.level]} (${x.kind === "lab" ? "Labs" : "Lectures"}) is <strong>withdrawn</strong>: your absence notice was approved`
          : `<strong>${WLV[x.level]} (${x.kind === "lab" ? "Labs" : "Lectures"})</strong> was emailed to you and your RPS. Check your attendance.` }));
        mine(nts).filter((n) => n.docLater && !n.doc && n.status !== "rejected").forEach((n) => add({ todo: true, t: tms(n.at), href: "attendance.html#records", text: `Add your supporting document for <strong>${esc(n.title)}</strong> by ${esc(n.docDue)}` }));
        mine(nts).filter((n) => n.status !== "pending").forEach((n) => add({ t: tms(n.decidedAt), href: "attendance.html#records", text: `Your absence notice for ${esc(n.title)} was <strong>${n.status === "approved" ? "approved (Excused)" : "not approved"}</strong>${n.note ? `: “${esc(n.note)}”` : ""}` }));
      }
    } catch (e) { console.warn("NMK bell: could not check for notifications", e.code || e); }
    bellBusy = false;
    const items = out.sort((a, b) => (b.todo - a.todo) || b.t - a.t).slice(0, 200);
    vpatch({ bell: { at: bellAt, items } });
    showBell(items);
  }
  // draw the bell from a list (just read, or kept from earlier in the visit)
  function showBell(items) {
    const seen = seenAt();
    bellItems = items.map((o) => Object.assign({}, o, { fresh: o.t > seen }));
    paintBell(); paintLog();
    if (!bellBox.hidden) fillBell();
    const em = bellUser;
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
  function fillBell() {
    const show = bellItems.filter((o) => o.todo || o.fresh).concat(bellItems.filter((o) => !o.todo && !o.fresh)).slice(0, 12);
    bellBox.innerHTML = `<div class="acc-who"><strong>Notifications</strong>${bellBusy ? `<span class="acc-note">Checking…</span>` : ""}</div>${show.length ? `<ul class="acc-notes">${show.map(noteLi).join("")}</ul>` : `<p class="acc-note">${bellBusy ? "Checking…" : "Nothing yet."}</p>`}
      <a class="acc-item acc-all" href="notifications.html">See all notifications →</a>`;
    markSeen();
    bellItems.forEach((o) => { o.fresh = false; });
    paintBell();
  }
  function openBell() {
    fillBell();
    // tapping the bell checks for anything new (at most once a minute)
    if (Date.now() - bellAt > 60000) loadBell(true).then(() => { if (!bellBox.hidden) fillBell(); });
    const r = bell.getBoundingClientRect();
    bellBox.style.top = `${Math.round(r.bottom + 8)}px`;
    bellBox.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
    bellBox.style.maxHeight = `${Math.max(160, Math.min(480, Math.round(innerHeight - r.bottom - 16)))}px`;
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

  window.NMKAccount = { db, auth, isAdmin, state, on: (f) => { listeners.push(f); if (state.ready) f(state); }, signIn, loadAttendance, push, SEM, refreshBell, changeEmail, boardRows, buildRankings, rankNote };
})();
