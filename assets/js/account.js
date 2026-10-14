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
  const ADMINS = ["zamrizahir@unimap.edu.my"];          // keep in step with firebase/firestore.rules
  const STUDENT_DOMAIN = "@studentmail.unimap.edu.my";
  const EX_KEY = "nmk-ex-log", UID_KEY = "nmk-sync-uid";
  // progress kept in this browser that is not worth syncing
  const LOCAL_ONLY = /^nmk-(theme|last|chat|sync-)/;

  firebase.initializeApp(CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isAdmin = (email) => ADMINS.includes(String(email || "").toLowerCase());
  const allowed = (email) => isAdmin(email) || String(email || "").toLowerCase().endsWith(STUDENT_DOMAIN);
  const ls = {
    keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith("nmk-") && !LOCAL_ONLY.test(k)); } catch (e) { return []; } },
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  const state = { user: null, profile: null, ready: false };
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
      await db.collection("progress").doc(state.user.uid).set({ keys: snapshot(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
  async function signIn() {
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await auth.signInWithPopup(p); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await auth.signInWithRedirect(p);
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") notice("Sign-in didn't work", `Please try again. (${esc(e.code || "unknown error")})`);
    }
  }
  const signOut = () => auth.signOut();

  auth.onAuthStateChanged(async (u) => {
    state.user = u; state.profile = null; state.ready = true;
    if (!u) { paint(); changed(); return; }
    if (!allowed(u.email)) {
      await auth.signOut();
      notice("Use your UniMAP student account", `<p>This course site accepts only <strong>@studentmail.unimap.edu.my</strong> Google accounts. You signed in as <strong>${esc(u.email)}</strong>.</p><p>Sign in again and choose your studentmail account.</p>`);
      return;
    }
    try {
      const ref = db.collection("users").doc(u.uid), doc = await ref.get();
      if (doc.exists) state.profile = doc.data();
      else if (isAdmin(u.email)) {
        state.profile = { email: u.email.toLowerCase(), name: u.displayName || "", nickname: "Dr. Zamri", status: "approved", role: "lecturer" };
        await ref.set(Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, state.profile));
      } else { setup(u); }
    } catch (e) { console.warn("NMK account: could not load the profile", e.code || e); }
    paint(); changed();
    if (canSync()) { pull(); db.collection("users").doc(u.uid).update({ lastActive: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {}); }
  });

  /* ---------- First sign-in: privacy notice and a nickname ---------- */
  function setup(u) {
    const box = modal(`<h2>Welcome to NMK42003</h2>
      <p>Signed in as <strong>${esc(u.email)}</strong>.</p>
      <div class="acc-privacy"><strong>What is saved, and who sees it</strong>
        <p>When your account is approved, this site saves your name, your studentmail address, the nickname you choose, and your progress: the exercises you answer, your Pre-Lab Check results and your virtual lab work. It is kept in a Google Firebase database run by your lecturer, and is used only for this course.</p>
        <p>Your lecturers can see all of it. Classmates will see only your nickname, level and badges on the course progress board. Nothing here counts towards your grade, and the site works fully without signing in.</p></div>
      <form class="acc-form" novalidate>
        <label for="accNick">Choose a nickname <span>3 to 16 letters or numbers. Classmates will see it.</span></label>
        <input id="accNick" type="text" maxlength="16" autocomplete="off" spellcheck="false" required>
        <label class="acc-ok"><input type="checkbox" id="accAgree"> I have read what is saved and agree.</label>
        <p class="acc-err" aria-live="polite"></p>
        <div class="acc-row"><button type="submit" class="btn">Request access</button><button type="button" class="btn ghost" data-cancel>Cancel and sign out</button></div>
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
        state.profile = { email: u.email.toLowerCase(), name: u.displayName || "", nickname: nick, status: "pending", role: "student" };
        await db.collection("users").doc(u.uid).set(Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, state.profile));
        closeModal(); paint(); changed();
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
  function paint() {
    const u = state.user, p = state.profile;
    if (!u) { btn.innerHTML = `${ICON}<span class="acc-t">Sign in</span>`; btn.setAttribute("aria-label", "Sign in with Google"); btn.className = "icon-btn acc-btn out"; }
    else {
      const initial = ((p && p.nickname) || u.displayName || u.email || "?").trim()[0].toUpperCase();
      btn.innerHTML = `<span class="acc-av">${esc(initial)}</span>${p && p.status !== "approved" ? '<span class="acc-dot" aria-hidden="true"></span>' : ""}`;
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
  btn.addEventListener("click", () => { if (!state.user) signIn(); else if (menu.hidden) openMenu(); else closeMenu(); });
  menu.addEventListener("click", (e) => { if (e.target.closest("[data-out]")) { closeMenu(); signOut(); } });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { closeMenu(); btn.focus(); } });

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
  window.NMKAccount = { db, auth, isAdmin, state, on: (f) => { listeners.push(f); if (state.ready) f(state); }, signIn };
})();
