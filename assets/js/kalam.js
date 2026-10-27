/* Kalam Feed: the class feed. Dr. Zamri posts; signed-in students on the class list read, reply and react (👍 ❤️ 😂 😮 👏).
   Lecturers can delete any reply, and a student can delete their own. Links are allowed (no pictures). A word filter
   (English and Malay) blocks rude replies. New posts show in the bell (account.js).
   Firestore: kalam/{post} { semester, body (older posts may have a title), pinned, at, by, byName, editedAt, reacts {uid: emoji} }
   and kalam/{post}/replies/{reply} { uid, name, role, text, at, reacts {uid: emoji}, parent (the comment it answers, one level) }.
   On the home page (#kalamHome) it shows the pinned post and the newest posts; kalam.html (#kalamFeed) shows the newest 5
   and "Show older posts" adds 5 more. To save Firestore reads, only those posts are read (not the whole semester), and a
   post's comments are read only when someone taps to see them; the post keeps its comment count in rc. */
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

  let A = null, db = null, FV = null, me = null, lec = false, poster = false, posts = [], replies = {}, rsubs = {}, unsub = null, unsubP = null, editing = null, open = {};
  let limitN = 0, newest = [], pinned = [], more = false;
  const loaded = {};   // posts whose comments are being read (tapped)
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
    if (unsub) { unsub(); unsub = null; } if (unsubP) { unsubP(); unsubP = null; } Object.values(rsubs).forEach((f) => f()); rsubs = {};
    if (!st.user) return gate(`<b>Kalam Feed</b>: news and discussion for NMK42003 students. <button type="button" class="kf-in" data-signin>Sign in with your studentmail account</button> to join.`);
    lec = A.isAdmin(st.user.email); poster = st.user.email.toLowerCase() === POSTER;
    if (!lec && !(st.roster && st.roster.status === "active")) return gate(`<b>Kalam Feed</b> is for students on the NMK42003 class list. If you take this course, please tell your lecturer.`);
    me = { uid: st.user.uid, name: lec ? ((st.profile && st.profile.nickname) || st.user.displayName || "Lecturer") : st.roster.name, role: lec ? "lecturer" : "student", photo: st.user.photoURL || "" };
    box.innerHTML = `${poster ? composer() : ""}<div class="kf-list" aria-live="polite"><p class="small-note">Loading the feed…</p></div>`;
    if (poster) wireComposer();
    limitN = FULL ? 5 : 3;
    listen();
    unsubP = db.collection("kalam").where("pinned", "==", true).onSnapshot((q) => { pinned = q.docs.map((d) => Object.assign({ id: d.id }, d.data())); merge(); }, () => {});
    if (FULL) markSeen();
  }
  // the newest posts (3 on the home page, 5 more each time on kalam.html), plus the pinned ones
  function listen() {
    if (unsub) unsub();
    unsub = db.collection("kalam").orderBy("at", "desc").limit(limitN).onSnapshot((q) => {
      newest = q.docs.map((d) => Object.assign({ id: d.id }, d.data())); more = q.size >= limitN; merge();
    }, (e) => { $(".kf-list").innerHTML = `<p class="small-note">Could not load the feed (${esc(e.code || e)}).${lec ? " If this says permission-denied, publish the latest firebase/firestore.rules." : ""}</p>`; });
  }
  function merge() {
    const m = {}; newest.concat(pinned).forEach((p) => { m[p.id] = p; });
    posts = Object.values(m).filter((p) => !p.semester || p.semester === SEM).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ms(b.at) - ms(a.at));
    paint(); fixCounts();
  }
  // older posts have no comment count yet: a lecturer's page counts them once
  const fixing = {};
  function fixCounts() {
    if (!lec) return;
    shown().filter((p) => p.rc === undefined && !fixing[p.id]).forEach((p) => {
      fixing[p.id] = true;
      db.collection("kalam").doc(p.id).collection("replies").get().then((q) => db.collection("kalam").doc(p.id).update({ rc: q.size })).catch(() => {});
    });
  }
  function gate(html) {
    box.innerHTML = `<div class="kf-teaser"><span aria-hidden="true">💬</span><div>${html}</div></div>`;
    const b = $("[data-signin]"); if (b) b.addEventListener("click", () => A.signIn());
    const n = document.getElementById("kalamNew"); if (n) n.hidden = true;
  }
  const shown = () => (FULL ? posts : posts.slice(0, 3));
  // a post's comments are read only once someone taps to see them (or to write one)
  function loadReplies(id) {
    if (rsubs[id]) return;
    loaded[id] = true;
    rsubs[id] = db.collection("kalam").doc(id).collection("replies").onSnapshot((q) => {
      replies[id] = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => ms(a.at) - ms(b.at));
      const p = posts.find((x) => x.id === id);
      if (lec && p && p.rc !== q.size) db.collection("kalam").doc(id).update({ rc: q.size }).catch(() => {});   // keep the count right
      paintReplies(id);
    }, () => {});
  }
  const nRep = (p) => (replies[p.id] ? replies[p.id].length : p.rc || 0);

  /* ---------- drawing: social-media style posts ---------- */
  const NAMES = { "👍": "Like", "❤️": "Love", "😂": "Haha", "😮": "Wow", "👏": "Clap" };
  const tally = (r) => { const c = {}; Object.values(r || {}).forEach((e) => { c[e] = (c[e] || 0) + 1; }); return c; };
  // "👍❤️😂 24 · 8 comments"
  function summary(p, nRep) {
    const c = tally(p.reacts), n = Object.values(c).reduce((a, b) => a + b, 0), top = Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 3);
    if (p.rc === undefined && !replies[p.id]) nRep = 0;
    if (!n && !nRep) return p.rc === undefined && !replies[p.id] ? `<div class="kf-sum"><span></span><button type="button" class="kf-lnk kf-sumc" data-comments="${p.id}">View comments</button></div>` : "";
    return `<div class="kf-sum">${n ? `<span class="kf-sumr" title="${Object.entries(c).map(([e, k]) => `${NAMES[e]} ${k}`).join(", ")}"><span class="kf-emos">${top.join("")}</span> ${n}</span>` : "<span></span>"}
      ${nRep ? `<button type="button" class="kf-lnk kf-sumc" data-comments="${p.id}">${nRep} comment${nRep === 1 ? "" : "s"}</button>` : ""}</div>`;
  }
  // the Like button: a tap likes (or removes your reaction); hold it, or hover on a computer, for the other reactions
  const likeBtn = (r, path, small) => {
    const mine = (r || {})[me.uid];
    return `<span class="kf-like${small ? " sm" : ""}" data-path="${path}"><button type="button" class="kf-lb${mine ? " on" : ""}" data-like aria-pressed="${!!mine}">${mine ? `${mine} ${NAMES[mine]}` : `${small ? "" : "👍 "}Like`}</button>
      <span class="kf-pick" role="group" aria-label="Reactions">${EMO.map((e) => `<button type="button" class="kf-pe${mine === e ? " me" : ""}" data-e="${e}" title="${NAMES[e]}" aria-label="${NAMES[e]}">${e}</button>`).join("")}</span></span>`;
  };
  const ago2 = (t) => esc(ago(ms(t) || Date.now()));
  function paint() {
    const list = $(".kf-list");
    if (!list) return;
    const n = document.getElementById("kalamNew"), seen = seenAt(), fresh = posts.filter((p) => ms(p.at) > seen).length;
    if (n) { n.hidden = !fresh; n.textContent = `${fresh} new`; }
    if (!posts.length) { list.innerHTML = `<p class="kf-empty">No posts yet.${poster ? " Share the first one above." : " News from Dr. Zamri will appear here."}</p>`; return; }
    if (editing && $(`#kf-${editing} .kf-edit`)) return;   // don't wipe a post being edited
    const keep = {}; $$(".kf-reply textarea", list).forEach((t) => { if (t.value) keep[t.closest(".kf-reply").dataset.key] = t.value; });
    const act = document.activeElement && document.activeElement.closest ? (document.activeElement.closest(".kf-reply") || {}).dataset : null;
    list.innerHTML = shown().map((p) => `<article class="kf-post${p.pinned ? " pin" : ""}" id="kf-${p.id}">
        <header class="kf-ph"><img class="kf-av" src="assets/img/team/zamri.jpg" alt="" width="44" height="44"><div><b>${esc(p.byName || "Ts. Dr. Mohd Zamri Bin Zahir Ahmad")}</b><small>Lecturer · ${ago2(p.at)}${p.editedAt ? " · edited" : ""}</small></div>
          <span class="kf-tags">${p.pinned ? '<span class="kf-tag">📌 Pinned</span>' : ""}${ms(p.at) > seen ? '<span class="kf-tag nw">New</span>' : ""}</span>
          ${poster ? `<details class="kf-menu"><summary aria-label="Post options">⋯</summary><div><button type="button" data-edit="${p.id}">Edit</button><button type="button" data-pin="${p.id}">${p.pinned ? "Unpin" : "Pin to the top"}</button><button type="button" class="kf-del" data-delpost="${p.id}">Delete</button></div></details>` : ""}</header>
        <div class="kf-body">${p.title ? `<strong class="kf-t">${esc(p.title)}</strong><br>` : ""}${rich(p.body)}</div>
        <div data-sum="${p.id}">${summary(p, nRep(p))}</div>
        <div class="kf-acts">${likeBtn(p.reacts, p.id)}<button type="button" class="kf-ab" data-comment="${p.id}">💬 Comment</button><button type="button" class="kf-ab" data-share="${p.id}">↗ Share</button></div>
        <div class="kf-replies" data-replies="${p.id}"></div>
        ${replyBox(p.id, "")}
      </article>`).join("") + (!FULL && (more || posts.length > shown().length) ? `<p class="kf-more"><a href="kalam.html">See all posts →</a></p>` : "")
      + (FULL && more ? `<p class="kf-more"><button type="button" class="btn ghost small" data-older>Show older posts</button></p>` : "");
    $$(".kf-reply", list).forEach((f) => { const t = $("textarea", f); if (keep[f.dataset.key]) { t.value = keep[f.dataset.key]; grow(t); } if (act && act.key === f.dataset.key) t.focus(); });
    shown().forEach((p) => paintReplies(p.id));
    if (FULL && location.hash && !paint.jumped) { const el = document.getElementById(location.hash.slice(1)); if (el) { el.scrollIntoView(); paint.jumped = true; } }
  }
  const replyBox = (pid, parent, to) => `<form class="kf-reply${parent ? " sub" : ""}" data-pid="${pid}" data-parent="${parent}" data-key="${pid}|${parent}" novalidate>
      ${me.photo ? `<img class="kf-av sm" src="${esc(me.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="kf-av sm" aria-hidden="true">${esc((me.name || "?").trim()[0])}</span>`}
      <textarea rows="1" maxlength="1000" placeholder="${parent ? `Reply to ${esc(to || "this comment")}…` : "Write a comment…"}" aria-label="${parent ? "Write a reply" : "Write a comment"}"></textarea><button class="kf-send" aria-label="Send">➤</button><p class="kf-err" role="alert"></p></form>`;
  // lecturers' comments show their photo; students show their initial
  const avatarOf = (x) => { const f = x.role === "lecturer" ? (/zamri/i.test(x.name) ? "zamri" : /hariyanti/i.test(x.name) ? "hariyanti" : "") : "";
    return f ? `<img class="kf-av sm" src="assets/img/team/${f}.jpg" alt="" width="32" height="32">` : `<span class="kf-av sm" aria-hidden="true">${esc((x.name || "?").trim()[0])}</span>`; };
  const openThread = {};   // which comments have their reply box open
  function comment(pid, r, kids) {
    const one = (x, sub) => { const cx = tally(x.reacts), nx = Object.values(cx).reduce((a, b) => a + b, 0), tx = Object.keys(cx).sort((a, b) => cx[b] - cx[a]).slice(0, 2).join("");
      return `<div class="kf-rp${x.role === "lecturer" ? " lec" : ""}${sub ? " sub" : ""}" id="kr-${x.id}">
        ${avatarOf(x)}
        <div class="kf-rw"><div class="kf-rb"><b>${esc(x.name)}${x.role === "lecturer" ? ' <span class="kf-tag">Lecturer</span>' : ""}</b><div>${rich(x.text)}</div>${nx ? `<span class="kf-rr" title="${Object.entries(cx).map(([e, k]) => `${NAMES[e]} ${k}`).join(", ")}">${tx} ${nx}</span>` : ""}</div>
          <div class="kf-ra">${likeBtn(x.reacts, `${pid}/${x.id}`, true)}<button type="button" class="kf-lnk" data-reply="${pid}/${r.id}" data-to="${esc(x.name)}">Reply</button><small>${ago2(x.at)}</small>
            ${lec || x.uid === me.uid ? `<button type="button" class="kf-lnk kf-del" data-delr="${pid}/${x.id}">Delete</button>` : ""}</div></div></div>`; };
    return `<div class="kf-thread">${one(r, false)}${kids.length || openThread[r.id] ? `<div class="kf-kids">${kids.map((k) => one(k, true)).join("")}${openThread[r.id] ? replyBox(pid, r.id, openThread[r.id]) : ""}</div>` : ""}</div>`;
  }
  function paintReplies(pid) {
    const el = $(`[data-replies="${pid}"]`), sum = $(`[data-sum="${pid}"]`);
    if (!el) return;
    if (el.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA" && document.activeElement.value) return;   // a reply being typed
    const p = posts.find((x) => x.id === pid);
    if (!loaded[pid]) { el.innerHTML = ""; if (sum && p) sum.innerHTML = summary(p, nRep(p)); return; }
    const rs = replies[pid] || [], top = rs.filter((r) => !r.parent || !rs.some((x) => x.id === r.parent)), lim = FULL || open[pid] ? top : top.slice(-2);
    if (sum && p) sum.innerHTML = summary(p, rs.length);
    el.innerHTML = (top.length > lim.length ? `<button type="button" class="kf-lnk kf-all" data-open="${pid}">View all ${rs.length} comments</button>` : "") + lim.map((r) => comment(pid, r, rs.filter((x) => x.parent === r.id))).join("");
    const t = $(".kf-kids .kf-reply textarea", el); if (t && openThread.focus) { t.focus(); openThread.focus = false; }
  }
  const grow = (t) => { t.style.height = "auto"; t.style.height = `${Math.min(220, t.scrollHeight)}px`; };

  /* ---------- reacting, commenting, sharing, moderating ---------- */
  const refOf = (path) => { const p = path.split("/"); return p.length === 1 ? db.collection("kalam").doc(p[0]) : db.collection("kalam").doc(p[0]).collection("replies").doc(p[1]); };
  const react = (path, e) => refOf(path).update({ [`reacts.${me.uid}`]: e ? e : FV.delete() }).catch((err) => console.warn("Kalam: react", err.code || err));
  let holdT = 0, held = false;
  // hold the Like button (phones) to open the reactions
  box.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-like]"); if (!b) return; held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; b.closest(".kf-like").classList.add("open"); }, 450); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((t) => box.addEventListener(t, () => clearTimeout(holdT)));
  box.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-like]")) e.preventDefault(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".kf-like")) $$(".kf-like.open").forEach((x) => x.classList.remove("open")); });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !me) return;
    if (b.hasAttribute("data-like")) {
      if (held) { held = false; return; }
      const w = b.closest(".kf-like"), mine = b.getAttribute("aria-pressed") === "true";
      react(w.dataset.path, mine ? null : "👍");
      return;
    }
    if (b.dataset.e) {
      const w = b.closest(".kf-like"); w.classList.remove("open");
      react(w.dataset.path, b.classList.contains("me") ? null : b.dataset.e);
      return;
    }
    if (b.dataset.comment) { loadReplies(b.dataset.comment); const f = $(`#kf-${b.dataset.comment} > .kf-reply textarea`); if (f) f.focus(); return; }
    if (b.dataset.comments) { open[b.dataset.comments] = true; loadReplies(b.dataset.comments); paintReplies(b.dataset.comments); return; }
    if (b.hasAttribute("data-older")) { b.disabled = true; b.textContent = "Loading…"; limitN += 5; listen(); return; }
    if (b.dataset.share) {
      const url = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}kalam.html#kf-${b.dataset.share}`, p = posts.find((x) => x.id === b.dataset.share);
      const done = () => { b.textContent = "✓ Link copied"; setTimeout(() => { b.textContent = "↗ Share"; }, 1800); };
      if (navigator.share) navigator.share({ title: "Kalam Feed · NMK42003", text: String((p && (p.title || p.body)) || "").slice(0, 120), url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(() => prompt("Copy this link:", url));
      else prompt("Copy this link:", url);
      return;
    }
    if (b.dataset.reply) { const [pid, rid] = b.dataset.reply.split("/"); openThread[rid] = b.dataset.to; openThread.focus = true; paintReplies(pid); return; }
    if (b.dataset.open) { open[b.dataset.open] = true; paintReplies(b.dataset.open); return; }
    if (b.dataset.delr) {
      if (!confirm("Delete this comment?")) return;
      const [pid, rid] = b.dataset.delr.split("/"), kids = (replies[pid] || []).filter((x) => x.parent === rid), bt = db.batch(), gone = [rid, ...(lec ? kids.map((k) => k.id) : [])];
      gone.forEach((id) => bt.delete(db.collection("kalam").doc(pid).collection("replies").doc(id)));
      const pp = posts.find((x) => x.id === pid);
      if (pp && pp.rc !== undefined) bt.update(db.collection("kalam").doc(pid), { rc: FV.increment(-gone.length) });
      bt.commit().catch((err) => alert(`Could not delete (${err.code || err}).`));
      return;
    }
    if (b.dataset.delpost) {
      if (!confirm("Delete this post and all its comments?")) return;
      const pid = b.dataset.delpost;
      (async () => { const rs = await db.collection("kalam").doc(pid).collection("replies").get(); const bt = db.batch(); rs.docs.forEach((d) => bt.delete(d.ref)); bt.delete(db.collection("kalam").doc(pid)); await bt.commit(); })().catch((err) => alert(`Could not delete (${err.code || err}).`));
      return;
    }
    if (b.dataset.pin) { const p = posts.find((x) => x.id === b.dataset.pin); db.collection("kalam").doc(p.id).update({ pinned: !p.pinned }).catch((err) => alert(err.code || err)); return; }
    if (b.dataset.edit) editPost(b.dataset.edit);
  });
  box.addEventListener("input", (e) => { if (e.target.matches(".kf-reply textarea, .kf-comp textarea")) grow(e.target); });
  box.addEventListener("keydown", (e) => { if (e.target.matches(".kf-reply textarea") && e.key === "Enter" && !e.shiftKey && matchMedia("(hover: hover)").matches) { e.preventDefault(); e.target.form.requestSubmit(); } });
  box.addEventListener("submit", (e) => {
    const f = e.target.closest(".kf-reply");
    if (!f) return;
    e.preventDefault();
    const t = $("textarea", f), text = t.value.trim(), err = $(".kf-err", f);
    err.textContent = "";
    if (!text) return;
    if (rude(text)) { err.textContent = "Please keep it polite: your comment has a word that isn't allowed."; return; }
    $("button", f).disabled = true;
    const d = { uid: me.uid, name: me.name, role: me.role, text: text.slice(0, 1000), at: FV.serverTimestamp(), reacts: {} };
    if (f.dataset.parent) d.parent = f.dataset.parent;
    const pid = f.dataset.pid, pp = posts.find((x) => x.id === pid), bt = db.batch();
    loadReplies(pid);
    bt.set(db.collection("kalam").doc(pid).collection("replies").doc(), d);
    if (pp && pp.rc !== undefined) bt.update(db.collection("kalam").doc(pid), { rc: FV.increment(1) });
    bt.commit()
      .then(() => { t.value = ""; grow(t); $("button", f).disabled = false; if (f.dataset.parent) delete openThread[f.dataset.parent]; })
      .catch((e2) => { $("button", f).disabled = false; err.textContent = `Not sent (${e2.code || e2}).`; });
  });

  /* ---------- Dr. Zamri's composer: "What's on your mind?" ---------- */
  function composer() {
    return `<form class="kf-comp" id="kfComp" novalidate><div class="kf-ch"><img class="kf-av" src="assets/img/team/zamri.jpg" alt="" width="44" height="44">
        <button type="button" class="kf-open" data-compose>What's on your mind, Dr. Zamri?</button></div>
      <div class="kf-cbody" hidden><textarea id="kfB" rows="4" maxlength="4000" placeholder="What's on your mind, Dr. Zamri?" aria-label="Your post"></textarea>
        <div class="kf-row"><label class="kf-chk"><input type="checkbox" id="kfP"> 📌 Pin to the top</label><span class="small-note">Links are allowed. Students on the class list see it at once, and in their 🔔 bell.</span>
          <span class="kf-sp"></span><button type="button" class="btn ghost small" data-cclose>Cancel</button><button class="btn small">Post</button></div><p class="small-note" id="kfMsg" aria-live="polite"></p></div></form>`;
  }
  function wireComposer() {
    const f = $("#kfComp"), body = $(".kf-cbody", f), opener = $("[data-compose]", f);
    const openC = () => { opener.hidden = true; body.hidden = false; $("#kfB").focus(); };
    const closeC = () => { f.reset(); body.hidden = true; opener.hidden = false; $("#kfMsg").textContent = ""; };
    opener.addEventListener("click", openC);
    $("[data-cclose]", f).addEventListener("click", closeC);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $("#kfB").value.trim(), msg = $("#kfMsg");
      if (!text) { msg.textContent = "Write something first."; return; }
      $("button.btn:not(.ghost)", f).disabled = true;
      db.collection("kalam").add({ semester: SEM, title: "", body: text, pinned: $("#kfP").checked, at: FV.serverTimestamp(), by: A.state.user.email, byName: "Ts. Dr. Mohd Zamri Bin Zahir Ahmad", reacts: {}, rc: 0 })
        .then(() => { $("button.btn:not(.ghost)", f).disabled = false; closeC(); })
        .catch((err) => { msg.textContent = `Not posted (${err.code || err}). Publish the latest firebase/firestore.rules first.`; $("button.btn:not(.ghost)", f).disabled = false; });
    });
  }
  function editPost(id) {
    const p = posts.find((x) => x.id === id), art = $(`#kf-${id}`);
    if (!p || !art) return;
    editing = id;
    const m = $(".kf-menu", art); if (m) m.open = false;
    $(".kf-body", art).innerHTML = `<form class="kf-edit" novalidate><textarea class="kf-in2" rows="5" aria-label="Your post">${esc(p.title ? `${p.title}\n${p.body}` : p.body)}</textarea>
      <div class="kf-row"><span class="kf-sp"></span><button type="button" class="btn ghost small" data-cancel>Cancel</button><button class="btn small">Save</button></div></form>`;
    const f = $(".kf-edit", art);
    $("[data-cancel]", f).addEventListener("click", () => { editing = null; paint(); });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      db.collection("kalam").doc(id).update({ title: "", body: $("textarea", f).value.trim(), editedAt: FV.serverTimestamp() })
        .then(() => { editing = null; paint(); }).catch((err) => alert(`Not saved (${err.code || err}).`));
    });
  }

  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
