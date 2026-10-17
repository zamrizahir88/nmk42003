/* NMK42003 Class Moments (gallery.html, and the "Latest Photos" strip on the home page).
   The photos live in the lecturer's Google Drive folder. A Google Apps Script in the lecturer's account
   (apps-script/gallery.gs) saves the list of photos into Firestore meta/photos every 10 minutes; the Firestore rules
   let only signed-in students on the class list and lecturers read it (or everyone, when the lecturer turns on the
   "show to the public" switch in meta/gallery). Each photo goes to the
   lecture or lab session at the date and time it was taken (the time stored in the photo, else in its file name,
   else when it was uploaded). Drive makes the small copies the page shows; the full photo opens from Drive.
   Who sees the photos: signed-in students on the class list and lecturers, or everyone when the switch is on. */
(function () {
  "use strict";
  const page = document.getElementById("gal"), strip = document.getElementById("momentsStrip");
  if (!page && !strip) return;
  const A = window.NMKAccount;
  if (!A || !A.db) { if (page) page.innerHTML = `<p class="small-note">Class Moments needs the sign-in service, which could not load. Check your connection and reload the page.</p>`; if (strip) strip.closest("section").hidden = true; return; }
  const db = A.db, SEM = A.SEM;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const fmtTime = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const thumb = (id, w) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
  const thumb2 = (id, w) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}`;

  // when a photo was taken, in Malaysia time: { date: "YYYY-MM-DD", time: "HH:MM" }
  function whenTaken(p) {
    let m = String(p.taken || "").match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/); // the camera's own time (local)
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, sure: true };
    m = String(p.name || "").match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[-_T .]?(\d{2})[-_.:h]?(\d{2})/); // e.g. 20261014_142038, IMG_2026-10-14-14-20
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[4] < 24) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, sure: true };
    m = String(p.name || "").match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/); // a date only, e.g. IMG-20261014-WA0003
    const up = new Date(new Date(p.uploaded || Date.now()).getTime() + 8 * 3600000).toISOString();
    if (m && +m[2] >= 1 && +m[2] <= 12) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: "", sure: false };
    return { date: up.slice(0, 10), time: up.slice(11, 16), sure: false };
  }
  const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };

  let settings = {}, photos = null, updated = null, sessions = [], who = "";
  queueMicrotask(() => A.on((st) => {
    if (!st.ready) return;
    const key = st.user ? `${st.user.uid}:${st.profile ? st.profile.status : ""}:${st.roster ? st.roster.status : ""}` : "out";
    if (key === who) return;
    who = key;
    start(st);
  }));

  async function start(st) {
    const lec = !!(st.user && A.isAdmin(st.user.email));
    const member = lec || !!(st.user && ((st.roster && st.roster.status === "active") || (st.profile && st.profile.status === "approved")));
    try { const d = await db.collection("meta").doc("gallery").get(); settings = d.exists ? d.data() : {}; } catch (e) { settings = {}; }
    const allowed = member || !!settings.public;
    if (strip) return paintStrip(allowed, st);
    if (!allowed) {
      page.innerHTML = `<div class="gl-card"><h2 class="gl-h">Photos for the Class</h2><p>Class Moments shows photos from our lectures and labs to students on the NMK42003 class list. Sign in with your studentmail account to see them.</p>
        ${st.user ? "" : `<button type="button" class="btn" data-signin>Sign in with Google</button>`}</div>`;
      const b = $("[data-signin]", page); if (b) b.addEventListener("click", () => A.signIn());
      return;
    }
    page.innerHTML = `<div class="gl-albums"><p class="small-note">Loading the photos…</p></div>`;
    if (st.user) { try { const q = await db.collection("sessions").where("semester", "==", SEM).get(); sessions = q.docs.map((d) => d.data()); } catch (e) { sessions = []; } }
    await loadPhotos();
    if (lec) { page.insertAdjacentHTML("afterbegin", lecturerPanel()); wirePanel(); }
    paintAlbums();
  }

  // the photo list saved by the Apps Script (Firestore meta/photos)
  async function loadPhotos() {
    photos = null; updated = null;
    try {
      const d = await db.collection("meta").doc("photos").get();
      if (d.exists) { const v = d.data(); photos = JSON.parse(v.json || "[]"); updated = v.updated || null; } else photos = [];
    } catch (e) { photos = null; console.warn("NMK gallery: could not load the photo list", e.code || e); }
  }

  // albums: each photo goes to the session at that date and time (30 minutes either side), else to its day
  function albums() {
    const out = {};
    (photos || []).forEach((p) => {
      const w = whenTaken(p), t = toMin(w.time);
      const s = w.time && sessions.find((x) => x.date === w.date && t >= toMin(x.start) - 30 && t <= toMin(x.end) + 30);
      const key = s ? `${w.date}|${s.title}` : `${w.date}|`;
      if (!out[key]) out[key] = { date: w.date, title: s ? s.title : "", start: s ? s.start : w.time || "", kind: s ? s.kind : "", list: [] };
      out[key].list.push(Object.assign({ at: w }, p));
    });
    return Object.values(out).map((a) => Object.assign(a, { list: a.list.sort((x, y) => (x.at.time < y.at.time ? -1 : 1)) }))
      .sort((a, b) => (a.date + a.start < b.date + b.start ? 1 : -1));
  }
  const albumName = (a) => a.title || (a.list[0].at.time ? `Class photos, ${partOfDay(a.list[0].at.time)}` : "Class photos");
  const partOfDay = (t) => { const h = +t.slice(0, 2); return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"; };
  const albumId = (a) => `a-${a.date}-${(a.title || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

  function paintAlbums() {
    const box = $(".gl-albums", page);
    if (!photos) { box.innerHTML = `<div class="gl-card"><p>The photo list could not be loaded right now. Please try again later.</p></div>`; return; }
    if (!photos.length) { box.innerHTML = `<div class="gl-card"><p><strong>Photos are coming soon.</strong></p></div>`; return; }
    const list = albums();
    box.innerHTML = `<p class="gl-count">${photos.length} photo${photos.length === 1 ? "" : "s"} in ${list.length} album${list.length === 1 ? "" : "s"}</p>` + list.map((a, ai) => `
      <section class="gl-album" id="${albumId(a)}"><h2 class="gl-h">${esc(albumName(a))}</h2><p class="gl-sub">${fmtDate(a.date)}${a.start ? ` · ${fmtTime(a.start)}` : ""} · ${a.list.length} photo${a.list.length === 1 ? "" : "s"}</p>
        <div class="gl-grid">${a.list.map((p, i) => `<button type="button" class="gl-th" data-a="${ai}" data-i="${i}" aria-label="Open photo ${i + 1} of ${esc(albumName(a))}"><img src="${thumb(p.id, 480)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-id="${esc(p.id)}"></button>`).join("")}</div></section>`).join("");
    box.querySelectorAll("img[data-id]").forEach((im) => im.addEventListener("error", () => { if (!im.dataset.alt) { im.dataset.alt = 1; im.src = thumb2(im.dataset.id, 480); } }, { once: false }));
    box.onclick = (e) => { const b = e.target.closest(".gl-th"); if (b) viewer(list, +b.dataset.a, +b.dataset.i); };
    if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
  }

  /* ---------- the photo viewer: big photo, previous and next (buttons, arrow keys, swipe), download ---------- */
  function viewer(list, ai, i) {
    const all = [];
    list.forEach((a, x) => a.list.forEach((p, y) => all.push({ a, p, x, y })));
    let k = all.findIndex((v) => v.x === ai && v.y === i);
    const back = document.createElement("div");
    back.className = "gl-view";
    back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true"); back.setAttribute("aria-label", "Photo viewer");
    back.innerHTML = `<button type="button" class="gl-x" aria-label="Close">×</button><button type="button" class="gl-nav prev" aria-label="Previous photo">‹</button>
      <figure class="gl-fig"><img alt="" referrerpolicy="no-referrer"><figcaption></figcaption></figure><button type="button" class="gl-nav next" aria-label="Next photo">›</button>`;
    document.body.appendChild(back);
    document.body.classList.add("gl-open");
    const img = $("img", back), cap = $("figcaption", back), last = document.activeElement;
    const show = () => {
      const v = all[k];
      img.src = thumb(v.p.id, 1600); img.dataset.id = v.p.id; img.dataset.alt = "";
      cap.innerHTML = `<span>${esc(albumName(v.a))} · ${fmtDate(v.a.date)}${v.p.at.time ? `, ${fmtTime(v.p.at.time)}` : ""} · ${k + 1} of ${all.length}</span>
        <a href="https://drive.google.com/uc?export=download&id=${encodeURIComponent(v.p.id)}" target="_blank" rel="noopener">Download full size</a>`;
      $(".prev", back).disabled = k === 0; $(".next", back).disabled = k === all.length - 1;
    };
    img.addEventListener("error", () => { if (!img.dataset.alt) { img.dataset.alt = 1; img.src = thumb2(img.dataset.id, 1600); } });
    const go = (d) => { const n = k + d; if (n >= 0 && n < all.length) { k = n; show(); } };
    // Back closes the photo (a step in the history while it is open)
    const step = window.NMKBack ? NMKBack.layer(() => close(true)) : null;
    const close = (fromBack) => { back.remove(); document.body.classList.remove("gl-open"); document.removeEventListener("keydown", key); if (last) last.focus(); if (step && fromBack !== true) step.closed(); };
    const key = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
    document.addEventListener("keydown", key);
    back.addEventListener("click", (e) => { if (e.target === back || e.target.closest(".gl-x")) close(); if (e.target.closest(".prev")) go(-1); if (e.target.closest(".next")) go(1); });
    let x0 = null;
    back.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    back.addEventListener("touchend", (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; });
    show();
    $(".gl-x", back).focus();
  }

  /* ---------- lecturers: the public switch, and how up to date the photo list is ---------- */
  const stamp = (t) => { const ms = t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0; if (!ms) return "never"; const d = new Date(ms + 8 * 3600000).toISOString(); return `${fmtDate(d.slice(0, 10))}, ${fmtTime(d.slice(11, 16))}`; };
  function lecturerPanel() {
    const ready = photos && photos.length;
    return `<details class="gl-card gl-set"${ready ? "" : " open"}><summary><strong>Settings (lecturers)</strong> · <span class="gl-who">${settings.public ? "shown to everyone" : "shown to signed-in students on the class list"}</span></summary>
      <form class="gl-form" novalidate>
        <label class="gl-pub"><input type="checkbox" name="public"${settings.public ? " checked" : ""}> <span><strong>Show to the public</strong><br><small>Off: only students on the class list and lecturers, signed in. On: anyone with the website link.</small></span></label>
        <p class="gl-msg" aria-live="polite"></p>
        <p class="small-note gl-upd"></p>
        <div class="gl-help"><strong>Setting up the photo list (once, about 10 minutes)</strong><ol>
          <li>Open <a href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a> signed in as the owner of the Firebase project, press <strong>New project</strong> and name it <em>NMK42003 Class Moments</em>.</li>
          <li>Replace everything in <em>Code.gs</em> with <a href="apps-script/gallery.gs" target="_blank" rel="noopener">apps-script/gallery.gs</a>.</li>
          <li>Next to <strong>Services</strong> press <strong>+</strong>, choose <strong>Drive API</strong> (v3), press <strong>Add</strong>.</li>
          <li><strong>Project Settings</strong> (gear) → tick <strong>Show "appsscript.json" manifest file in editor</strong>; open <em>appsscript.json</em> and replace it with <a href="apps-script/appsscript.json" target="_blank" rel="noopener">apps-script/appsscript.json</a>.</li>
          <li>In <em>Code.gs</em>, choose <strong>setup</strong> at the top and press <strong>Run</strong>; allow access. The photos appear here, and the list updates every 10 minutes by itself.</li></ol>
          <p>No need to deploy anything. Keep the photo folder shared so the pictures can show (<em>Anyone with the link</em>).</p></div>
      </form></details>`;
  }
  function wirePanel() {
    const f = $(".gl-form", page), msg = $(".gl-msg", page), upd = $(".gl-upd", page);
    const status = () => { upd.innerHTML = photos === null ? "The photo list could not be read." : photos.length ? `Photo list updated ${stamp(updated)}: ${photos.length} photos. New uploads appear within about 10 minutes.` : "No photo list yet: follow the steps below."; };
    f.public.addEventListener("change", async () => {
      try {
        await db.collection("meta").doc("gallery").set({ public: f.public.checked, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        settings.public = f.public.checked; msg.textContent = f.public.checked ? "Saved: the photos are now shown to everyone." : "Saved: the photos are shown only to signed-in students on the class list.";
        $(".gl-who", page).textContent = settings.public ? "shown to everyone" : "shown to signed-in students on the class list";
      } catch (ex) { f.public.checked = !f.public.checked; msg.textContent = `Could not save (${ex.code || ex}). If this says permission-denied, publish the latest firebase/firestore.rules.`; }
    });
    document.addEventListener("nmk:gallery-loaded", status);
    status();
  }

  /* ---------- the home page: the newest photos ---------- */
  async function paintStrip(allowed) {
    const sec = strip.closest("section");
    if (!allowed) { sec.hidden = true; return; }
    await loadPhotos();
    if (!photos || !photos.length) { sec.hidden = true; return; }
    const newest = photos.map((p) => Object.assign({ at: whenTaken(p) }, p)).sort((a, b) => (a.at.date + a.at.time < b.at.date + b.at.time ? 1 : -1)).slice(0, 8);
    sec.hidden = false;
    strip.innerHTML = newest.map((p) => `<a class="gl-sth" href="gallery.html"><img src="${thumb(p.id, 360)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-id="${esc(p.id)}"></a>`).join("");
    strip.querySelectorAll("img[data-id]").forEach((im) => im.addEventListener("error", () => { if (!im.dataset.alt) { im.dataset.alt = 1; im.src = thumb2(im.dataset.id, 360); } }));
  }
})();
