/* Kalam Feed: the class feed. Dr. Zamri posts; signed-in students on the class list read, reply and react (👍 ❤️ 😂 😮 👏).
   Lecturers can delete any reply, and a student can delete their own. Links are allowed (no pictures). A word filter
   (English and Malay) blocks rude replies. New posts show in the bell (account.js).
   Firestore: kalam/{post} { semester, title, body, pinned, at, by, byName, editedAt, reacts {uid: emoji} } and
   kalam/{post}/replies/{reply} { uid, name, role, text, at, reacts {uid: emoji} }.
   On the home page (#kalamHome) it shows the pinned post and the newest posts; kalam.html (#kalamFeed) shows them all. */
(function () {
  "use strict";
  const home = document.getElementById("kalamHome"), feed = document.getElementById("kalamFeed");
  if ((!home && !feed) || typeof COURSE === "undefined") return;
  const box = home || feed, FULL = !!feed;
  const $ = (s, r = box) => r.querySelector(s), $$ = (s, r = box) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SEM = COURSE.semesterId, POSTER = "zamrizahir@unimap.edu.my", EMO = ["👍", "❤️", "😂", "😮", "👏"];
  const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === "number" ? t : 0);
  const SEEN = "nmk-kalam-seen";
  const seenAt = () => { try { return +localStorage.getItem(SEEN) || 0; } catch (e) { return 0; } };
  const markSeen = () => { try { localStorage.setItem(SEEN, String(Date.now())); } catch (e) { /* private mode */ } };
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 172800) return "yesterday"; const d = new Date(t + 8 * 3600000); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
  // text with its links made clickable; line breaks kept
  const rich = (t) => esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, "<br>");
  // rude words (English and Malay), matched as whole words so "sosial" is fine
  const BAD = ["fuck", "fck", "fuk", "shit", "bitch", "cunt", "pussy", "asshole", "bastard", "slut", "whore", "nigger", "nigga", "fag", "faggot", "porn", "dick", "penis", "vagina", "boobs", "tits",
    "babi", "bodoh", "sial", "puki", "pukimak", "kimak", "pantat", "lancau", "butoh", "sundal", "jubur", "haramjadah", "celaka", "bangsat", "keparat", "anjing", "lahanat", "bapuk", "pondan",
    "jalang", "pelacur", "tetek", "burit", "kontol", "pepek", "bangang", "bengap", "bahlul", "sohai", "pundek", "mampus"];
  const flat = (w) => w.toLowerCase().replace(/[0@4]/g, (c) => (c === "0" ? "o" : "a")).replace(/1/g, "i").replace(/3/g, "e").replace(/5/g, "s").replace(/7/g, "t").replace(/(.)\1{2,}/g, "$1$1");
  const rude = (t) => String(t).split(/[^A-Za-z0-9@]+/).filter(Boolean).map(flat).some((w) => BAD.includes(w) || BAD.includes(w.replace(/(.)\1+/g, "$1")) || BAD.some((b) => b.length >= 5 && w.startsWith(b)));

  let A = null, db = null, FV = null, me = null, lec = false, poster = false, posts = [], replies = {}, rsubs = {}, unsub = null, editing = null, open = {};
  function boot() {
    A = window.NMKAccount;
    if (!A) return;
    db = A.db; FV = firebase.firestore.FieldValue;
    A.on((st) => { if (st.ready) start(st); });
  }
  let started = "";
  function start(st) {
    const key = st.user ? `${st.user.uid}|${st.profile && st.profile.status}|${!!st.roster}` : "out";
    if (key === started) return;
    started = key;
    if (unsub) { unsub(); unsub = null; } Object.values(rsubs).forEach((f) => f()); rsubs = {};
    if (!st.user) return gate(`<b>Kalam Feed</b>: news and discussion for NMK42003 students. <button type="button" class="kf-in" data-signin>Sign in with your studentmail account</button> to join.`);
    lec = A.isAdmin(st.user.email); poster = st.user.email.toLowerCase() === POSTER;
    if (!lec && !(st.roster && st.roster.status === "active")) return gate(`<b>Kalam Feed</b> is for students on the NMK42003 class list. If you take this course, please tell your lecturer.`);
    me = { uid: st.user.uid, name: lec ? ((st.profile && st.profile.nickname) || st.user.displayName || "Lecturer") : st.roster.name, role: lec ? "lecturer" : "student", photo: st.user.photoURL || "" };
    box.innerHTML = `${FULL && poster ? composer() : ""}<div class="kf-list" aria-live="polite"><p class="small-note">Loading the feed…</p></div>`;
    if (FULL && poster) wireComposer();
    unsub = db.collection("kalam").where("semester", "==", SEM).onSnapshot((q) => {
      posts = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ms(b.at) - ms(a.at));
      watchReplies(); paint();
    }, (e) => { $(".kf-list").innerHTML = `<p class="small-note">Could not load the feed (${esc(e.code || e)}).${lec ? " If this says permission-denied, publish the latest firebase/firestore.rules." : ""}</p>`; });
    if (FULL) markSeen();
  }
  function gate(html) {
    box.innerHTML = `<div class="kf-teaser"><span aria-hidden="true">💬</span><div>${html}</div></div>`;
    const b = $("[data-signin]"); if (b) b.addEventListener("click", () => A.signIn());
    const n = document.getElementById("kalamNew"); if (n) n.hidden = true;
  }
  const shown = () => (FULL ? posts : posts.slice(0, 3));
  function watchReplies() {
    const ids = new Set(shown().map((p) => p.id));
    Object.keys(rsubs).forEach((id) => { if (!ids.has(id)) { rsubs[id](); delete rsubs[id]; } });
    ids.forEach((id) => { if (rsubs[id]) return; rsubs[id] = db.collection("kalam").doc(id).collection("replies").onSnapshot((q) => { replies[id] = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => ms(a.at) - ms(b.at)); paintReplies(id); }, () => {}); });
  }

  /* ---------- drawing ---------- */
  const reactBar = (r, path) => {
    const counts = {}, mine = (r || {})[me.uid];
    Object.values(r || {}).forEach((e) => { counts[e] = (counts[e] || 0) + 1; });
    return `<div class="kf-reacts" data-path="${path}">${EMO.map((e) => `<button type="button" class="kf-r${mine === e ? " me" : ""}" data-e="${e}" aria-pressed="${mine === e}" aria-label="React ${e}${counts[e] ? `, ${counts[e]}` : ""}">${e}${counts[e] ? ` <b>${counts[e]}</b>` : ""}</button>`).join("")}</div>`;
  };
  function paint() {
    const list = $(".kf-list");
    if (!list) return;
    const n = document.getElementById("kalamNew"), seen = seenAt(), fresh = posts.filter((p) => ms(p.at) > seen).length;
    if (n) { n.hidden = !fresh; n.textContent = `${fresh} new`; }
    if (!posts.length) { list.innerHTML = `<p class="kf-empty">No posts yet.${poster ? " Write the first one above." : " News from Dr. Zamri will appear here."}</p>`; return; }
    if (editing && $(`#kf-${editing} .kf-edit`)) return;   // don't wipe a post being edited
    // keep a half-typed reply
    const keep = {}; $$(".kf-reply textarea", list).forEach((t) => { if (t.value) keep[t.dataset.pid] = t.value; });
    const act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pid : null;
    list.innerHTML = shown().map((p) => `<article class="kf-post${p.pinned ? " pin" : ""}" id="kf-${p.id}">
        <header class="kf-ph"><img class="kf-av" src="assets/img/team/zamri.jpg" alt="" width="44" height="44"><div><b>${esc(p.byName || "Ts. Dr. Mohd Zamri Bin Zahir Ahmad")}</b><small>Lecturer · ${esc(ago(ms(p.at) || Date.now()))}${p.editedAt ? " · edited" : ""}</small></div>
          <span class="kf-tags">${p.pinned ? '<span class="kf-tag">📌 Pinned</span>' : ""}${ms(p.at) > seen ? '<span class="kf-tag nw">New</span>' : ""}</span></header>
        ${p.title ? `<h3 class="kf-t">${esc(p.title)}</h3>` : ""}<div class="kf-body">${rich(p.body)}</div>
        ${poster && FULL ? `<p class="kf-own"><button type="button" class="kf-lnk" data-edit="${p.id}">Edit</button><button type="button" class="kf-lnk" data-pin="${p.id}">${p.pinned ? "Unpin" : "Pin"}</button><button type="button" class="kf-lnk kf-del" data-delpost="${p.id}">Delete</button></p>` : ""}
        <div class="kf-bar">${reactBar(p.reacts, p.id)}<span class="kf-rc" data-rc="${p.id}"></span></div>
        <div class="kf-replies" data-replies="${p.id}"></div>
        <form class="kf-reply" data-pid="${p.id}" novalidate><textarea data-pid="${p.id}" rows="1" maxlength="1000" placeholder="Write a reply…" aria-label="Reply to: ${esc(p.title || "this post")}"></textarea><button class="btn small">Send</button><p class="kf-err" role="alert"></p></form>
      </article>`).join("") + (!FULL && posts.length > shown().length ? `<p class="kf-more"><a href="kalam.html">See all ${posts.length} posts →</a></p>` : "");
    $$(".kf-reply textarea", list).forEach((t) => { if (keep[t.dataset.pid]) { t.value = keep[t.dataset.pid]; grow(t); } if (act && t.dataset.pid === act) t.focus(); });
    shown().forEach((p) => paintReplies(p.id));
    if (FULL && location.hash && !paint.jumped) { const el = document.getElementById(location.hash.slice(1)); if (el) { el.scrollIntoView(); paint.jumped = true; } }
  }
  function paintReplies(pid) {
    const el = $(`[data-replies="${pid}"]`), rc = $(`[data-rc="${pid}"]`);
    if (!el) return;
    const rs = replies[pid] || [], lim = FULL || open[pid] ? rs : rs.slice(-2);
    if (rc) rc.textContent = rs.length ? `${rs.length} repl${rs.length === 1 ? "y" : "ies"}` : "";
    el.innerHTML = (rs.length > lim.length ? `<button type="button" class="kf-lnk kf-all" data-open="${pid}">View all ${rs.length} replies</button>` : "") + lim.map((r) => `<div class="kf-rp${r.role === "lecturer" ? " lec" : ""}" id="kr-${r.id}">
        <span class="kf-av sm" aria-hidden="true">${esc((r.name || "?").trim()[0])}</span>
        <div class="kf-rb"><b>${esc(r.name)}${r.role === "lecturer" ? ' <span class="kf-tag">Lecturer</span>' : ""}</b><div>${rich(r.text)}</div>
          <small>${esc(ago(ms(r.at) || Date.now()))}</small>${reactBar(r.reacts, `${pid}/${r.id}`)}
          ${lec || r.uid === me.uid ? `<button type="button" class="kf-lnk kf-del" data-delr="${pid}/${r.id}">Delete</button>` : ""}</div></div>`).join("");
  }
  const grow = (t) => { t.style.height = "auto"; t.style.height = `${Math.min(220, t.scrollHeight)}px`; };

  /* ---------- reacting, replying, moderating ---------- */
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !me) return;
    if (b.classList.contains("kf-r")) {
      const path = b.closest("[data-path]").dataset.path.split("/"), ref = path.length === 1 ? db.collection("kalam").doc(path[0]) : db.collection("kalam").doc(path[0]).collection("replies").doc(path[1]);
      const on = b.getAttribute("aria-pressed") === "true";
      ref.update({ [`reacts.${me.uid}`]: on ? FV.delete() : b.dataset.e }).catch((err) => console.warn("Kalam: react", err.code || err));
      return;
    }
    if (b.dataset.open) { open[b.dataset.open] = true; paintReplies(b.dataset.open); return; }
    if (b.dataset.delr) {
      if (!confirm("Delete this reply?")) return;
      const [pid, rid] = b.dataset.delr.split("/");
      db.collection("kalam").doc(pid).collection("replies").doc(rid).delete().catch((err) => alert(`Could not delete (${err.code || err}).`));
      return;
    }
    if (b.dataset.delpost) {
      if (!confirm("Delete this post and all its replies?")) return;
      const pid = b.dataset.delpost;
      (async () => { const rs = await db.collection("kalam").doc(pid).collection("replies").get(); const bt = db.batch(); rs.docs.forEach((d) => bt.delete(d.ref)); bt.delete(db.collection("kalam").doc(pid)); await bt.commit(); })().catch((err) => alert(`Could not delete (${err.code || err}).`));
      return;
    }
    if (b.dataset.pin) { const p = posts.find((x) => x.id === b.dataset.pin); db.collection("kalam").doc(p.id).update({ pinned: !p.pinned }).catch((err) => alert(err.code || err)); return; }
    if (b.dataset.edit) { editPost(b.dataset.edit); }
  });
  box.addEventListener("input", (e) => { if (e.target.matches(".kf-reply textarea")) grow(e.target); });
  box.addEventListener("keydown", (e) => { if (e.target.matches(".kf-reply textarea") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.target.form.requestSubmit(); });
  box.addEventListener("submit", (e) => {
    const f = e.target.closest(".kf-reply");
    if (!f) return;
    e.preventDefault();
    const t = $("textarea", f), text = t.value.trim(), err = $(".kf-err", f);
    err.textContent = "";
    if (!text) return;
    if (rude(text)) { err.textContent = "Please keep it polite: your reply has a word that isn't allowed."; return; }
    $("button", f).disabled = true;
    db.collection("kalam").doc(f.dataset.pid).collection("replies").add({ uid: me.uid, name: me.name, role: me.role, text: text.slice(0, 1000), at: FV.serverTimestamp(), reacts: {} })
      .then(() => { t.value = ""; grow(t); $("button", f).disabled = false; })
      .catch((e2) => { $("button", f).disabled = false; err.textContent = `Not sent (${e2.code || e2}).`; });
  });

  /* ---------- Dr. Zamri's composer and editing (kalam.html) ---------- */
  function composer() {
    return `<form class="kf-comp" id="kfComp" novalidate><h2 class="h3">New Post</h2>
      <label class="kf-l" for="kfT">Title</label><input id="kfT" class="kf-in2" maxlength="120" placeholder="e.g. Mini project released">
      <label class="kf-l" for="kfB">Message <span>(links are allowed; no pictures)</span></label><textarea id="kfB" class="kf-in2" rows="5" maxlength="4000"></textarea>
      <label class="kf-chk"><input type="checkbox" id="kfP"> 📌 Pin it to the top</label>
      <div class="kf-row"><button class="btn">Post to Kalam Feed</button><span class="small-note" id="kfMsg" aria-live="polite">Students on the class list see it at once, and in their 🔔 bell.</span></div></form>`;
  }
  function wireComposer() {
    const f = $("#kfComp");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = $("#kfT").value.trim(), body = $("#kfB").value.trim(), msg = $("#kfMsg");
      if (!body) { msg.textContent = "Write the message first."; return; }
      $("button", f).disabled = true;
      db.collection("kalam").add({ semester: SEM, title, body, pinned: $("#kfP").checked, at: FV.serverTimestamp(), by: A.state.user.email, byName: "Ts. Dr. Mohd Zamri Bin Zahir Ahmad", reacts: {} })
        .then(() => { f.reset(); msg.textContent = "Posted."; $("button", f).disabled = false; })
        .catch((err) => { msg.textContent = `Not posted (${err.code || err}). Publish the latest firebase/firestore.rules first.`; $("button", f).disabled = false; });
    });
  }
  function editPost(id) {
    const p = posts.find((x) => x.id === id), art = $(`#kf-${id}`);
    if (!p || !art) return;
    editing = id;
    $(".kf-body", art).innerHTML = `<form class="kf-edit" novalidate><input class="kf-in2" value="${esc(p.title)}" aria-label="Title"><textarea class="kf-in2" rows="5" aria-label="Message">${esc(p.body)}</textarea>
      <div class="kf-row"><button class="btn small">Save</button><button type="button" class="btn ghost small" data-cancel>Cancel</button></div></form>`;
    const f = $(".kf-edit", art);
    $("[data-cancel]", f).addEventListener("click", () => { editing = null; paint(); });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      db.collection("kalam").doc(id).update({ title: $("input", f).value.trim(), body: $("textarea", f).value.trim(), editedAt: FV.serverTimestamp() })
        .then(() => { editing = null; paint(); }).catch((err) => alert(`Not saved (${err.code || err}).`));
    });
  }

  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
