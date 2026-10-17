/* NMK42003 student profile (profile.html): one page per student, the same layout for everyone.
   profile.html          your own profile
   profile.html?u=<uid>  a classmate's (approved students and lecturers)
   profile.html?e=<studentmail>  any student on the class list, even one who never signed in (lecturers)
   Classmates see the public part: name, matric, lab section and group, level, XP, badges, journey and activity feed.
   The student and the lecturers also see attendance, lab swaps and absence notices; lecturers see the full
   exercise record and the XP history, and can edit the class-list details. */
(function () {
  "use strict";
  const host = document.getElementById("prof");
  if (!host) return;
  if (!window.NMKAccount || !window.NMKGame) { host.innerHTML = `<p class="small-note">Profiles need the sign-in service, which could not load. Check your connection and reload the page.</p>`; return; }
  const A = window.NMKAccount, G = window.NMKGame, db = A.db, SEM = A.SEM;
  const $ = (s, r = host) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const SECTION = { mon: "Monday lab", wed: "Wednesday lab", thu: "Thursday lab" };
  const SECTION_TIME = { mon: "Monday, 1 PM to 4 PM", wed: "Wednesday, 12 PM to 3 PM", thu: "Thursday, 9 AM to 12 PM" };
  const ST = { P: "Present", L: "Late", E: "Excused", A: "Absent" }, POINTS = { P: 2, L: 1, E: 1, A: 0 };
  const REASONS = { mc: "Medical (MC)", family: "Family emergency", official: "Official university activity", other: "Other" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ms = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
  const dstr = (t) => { const m = ms(t); if (!m) return ""; const d = new Date(m + 8 * 3600000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const ago = (t) => { const m = ms(t); if (!m) return "never"; const d = Math.floor((G.today() - m) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : d < 60 ? `${Math.floor(d / 7)} weeks ago` : dstr(t); };
  const iso = (s) => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const COLORS = ["#0f766e", "#1d4ed8", "#9333ea", "#c2410c", "#be123c", "#047857", "#4338ca", "#a16207"];
  const avatar = (name, photo, big) => photo ? `<img class="pf-av${big ? " big" : ""}" src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="pf-av${big ? " big" : ""}" style="background:${COLORS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]}" aria-hidden="true">${esc(String(name || "?").trim()[0] || "?").toUpperCase()}</span>`;
  const chip = (st) => `<span class="at-st ${st ? st.toLowerCase() : "none"}">${st ? ST[st] : "Not marked"}</span>`;
  const card = (title, html, cls = "") => `<section class="pf-card ${cls}"><h2 class="pf-h">${title}</h2>${html}</section>`;

  let started = false;
  queueMicrotask(() => A.on((st) => { if (!st.ready || started && st.user) return; started = !!st.user; run(st); }));

  async function run(st) {
    if (!st.user) {
      host.innerHTML = `<div class="pf-card"><h2 class="pf-h">Sign In to See Profiles</h2><p>Profiles are for NMK42003 students and lecturers. Sign in with your studentmail account.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`;
      $("[data-signin]").addEventListener("click", () => A.signIn());
      return;
    }
    const meEmail = st.user.email.toLowerCase(), lec = A.isAdmin(meEmail);
    let uid = params.get("u"), email = (params.get("e") || "").toLowerCase();
    if (email && !lec && email !== meEmail) { uid = null; email = ""; }
    if (!uid && !email && lec) {
      host.innerHTML = `<div class="pf-card"><h2 class="pf-h">Lecturers Don't Have a Profile</h2><p>Open a student's profile from the dashboard, the progress board or the class list.</p><p><a class="btn" href="admin.html">Lecturer dashboard</a> <a class="btn ghost" href="attendance.html">Attendance</a></p></div>`;
      return;
    }
    if (!uid && !email) uid = st.user.uid;
    const own = uid === st.user.uid || email === meEmail;
    host.innerHTML = `<p class="small-note">Loading the profile…</p>`;
    try {
      // who is it: a uid (has an account) and/or a class-list email
      let user = null, board = null, roster = null, keys = null;
      if (!uid && email && lec) { const q = await db.collection("users").where("email", "==", email).get(); if (q.docs.length) uid = q.docs[0].id; }
      if (uid) {
        const b = await db.collection("board").doc(uid).get().catch((e) => { if (e.code === "permission-denied" && !own) throw e; return null; });
        board = b && b.exists ? b.data() : null;
        if (lec || own) { const u = await db.collection("users").doc(uid).get(); user = u.exists ? u.data() : null; if (user && !email) email = String(user.email || "").toLowerCase(); }
      }
      if (own) email = meEmail;
      if ((lec || own) && email) { const r = await db.collection("roster").doc(email).get().catch(() => null); roster = r && r.exists ? r.data() : null; }
      if (lec && uid && !own) { const p = await db.collection("progress").doc(uid).get().catch(() => null); keys = p && p.exists ? p.data().keys || {} : null; }
      if (!board && !roster && !user) { host.innerHTML = `<div class="pf-card"><p>This profile doesn't exist, or it hasn't been set up yet.</p><p><a href="board.html">Back to the progress board</a></p></div>`; return; }
      // progress: your own from this browser (always up to date); a lecturer's view from the saved records; a classmate's from their public summary
      const g = own ? G.local() : keys ? G.compute(keys) : G.fromSummary(board || {});
      const feed = own ? G.feed(g, 20) : keys ? G.feed(g, 20) : (board && board.feed) || [];
      const info = {
        nickname: (board && board.nickname) || (user && user.nickname) || "", name: (roster && roster.name) || (board && board.name) || (user && user.name) || "",
        matric: (roster && roster.matric) || (board && board.matric) || "", section: (roster && roster.section) || (board && board.section) || "", group: (roster && roster.group) || (board && board.group) || 0,
        photo: (board && board.photo) || (user && user.photo) || (own && d.st.user.photoURL) || "", since: (user && user.createdAt) || (board && board.since) || null, last: (board && board.lastActive) || (user && user.lastActive) || null
      };
      let mates = [];
      try { const m = await db.collection("meta").doc("classmates").get(); mates = m.exists ? m.data().list || [] : []; } catch (e) { /* not on the class list */ }
      const partner = info.section && info.group ? mates.find((x) => x.s === info.section && x.g === info.group && String(x.m) !== String(info.matric)) : null;
      render({ st, lec, own, uid, email, user, board, roster, keys, g, feed, info, partner });
    } catch (e) {
      host.innerHTML = `<div class="pf-card"><h2 class="pf-h">Profiles Are for Approved Students</h2><p>${e.code === "permission-denied" ? "Your account needs to be approved (or you need to be on the class list) to see classmates' profiles." : `Could not load this profile (${esc(e.code || e)}).`}</p><p><a href="profile.html">See my own profile</a></p></div>`;
    }
  }

  function render(d) {
    const { lec, own, g, feed, info } = d;
    document.title = `${info.nickname || info.name || "Profile"} | NMK42003 Instrumentation`;
    const earned = new Set(g.badges.map((b) => b.id));
    const header = `<section class="pf-card pf-top">${avatar(info.nickname || info.name, info.photo, true)}
      <div class="pf-who"><h1 class="pf-nick">${esc(info.nickname || info.name || "Student")}</h1>
        <p class="pf-name">${esc(info.name)}${info.matric ? ` · ${esc(info.matric)}` : ""}</p>
        <p class="pf-meta">${info.section ? `<span>🧪 ${SECTION[info.section]}, group ${info.group || "–"}</span>` : ""}${d.partner ? `<span>👥 Lab partner: ${esc(d.partner.n)}</span>` : ""}
          ${g.streak ? `<span>🔥 ${g.streak}-week streak</span>` : ""}<span>${info.last ? `Active ${ago(info.last)}` : d.uid ? "No activity yet" : "Not signed in yet"}</span>${info.since ? `<span>Joined ${dstr(info.since)}</span>` : ""}</p></div>
      <div class="pf-lv">${G.xpBar(g)}</div>
      ${lec ? `<div class="pf-tools"><button type="button" class="btn ghost small" data-print>Print</button>${d.roster ? `<button type="button" class="btn ghost small" data-edit>Edit details</button>` : ""}<a class="btn ghost small" href="attendance.html">Attendance</a></div>` : ""}</section>`;
    const badges = card(`Badges <small class="pf-sub">${g.badges.length} of ${G.BADGES.length}</small>`, `<ul class="pf-badges">${G.BADGES.map((b) => `<li class="${earned.has(b.id) ? "on" : ""}" title="${esc(b.desc)}"><span class="pf-bi" aria-hidden="true">${b.icon}</span><strong>${esc(b.name)}</strong><small>${esc(b.desc)}</small></li>`).join("")}</ul>`);
    const journey = card("Course Journey", `<div class="gm-journey">${G.journeyHtml(g, { other: !own, noHead: true })}</div>`);
    const activity = card("Recent Activity", feed.length ? `<ol class="pf-feed">${feed.map((f) => `<li class="${f.lv ? "lv" : ""}"><span class="pf-fx">${f.lv ? "⭐" : f.x ? `+${f.x}` : ""}</span><span>${esc(f.w)}</span><time>${ago(f.t)}</time></li>`).join("")}</ol>` : `<p class="small-note">Nothing yet.</p>`);
    host.innerHTML = `<div class="pf-grid">${header}<div class="pf-main">${journey}${(own || lec) ? `<div class="pf-private"></div>` : ""}</div><div class="pf-side">${activity}${badges}</div></div>`;
    if (own || lec) privateParts(d);
    host.addEventListener("click", (e) => {
      if (e.target.closest("[data-print]")) window.print();
      if (e.target.closest("[data-edit]")) editDetails(d);
    });
  }

  // attendance, swaps and notices (the student and lecturers); exercises and XP history (lecturers)
  async function privateParts(d) {
    const box = $(".pf-private"), email = d.email;
    if (!email) { box.innerHTML = ""; return; }
    let att = [], notices = [], swaps = [];
    try {
      const qs = [db.collection("attendance").where("email", "==", email).get(), db.collection("notices").where("email", "==", email).get(), db.collection("swaps").where("fromEmail", "==", email).get()];
      const matric = d.roster && d.roster.matric;
      if (matric) qs.push(db.collection("swaps").where("toMatric", "==", String(matric)).get());
      const [a, n, s1, s2] = await Promise.all(qs.map((p) => p.catch(() => ({ docs: [] }))));
      att = a.docs.map((x) => x.data()).filter((x) => !x.semester || x.semester === SEM).sort((x, y) => (x.date < y.date ? -1 : 1));
      notices = n.docs.map((x) => x.data()).filter((x) => x.semester === SEM);
      swaps = s1.docs.concat(s2 ? s2.docs : []).map((x) => x.data()).filter((x) => x.semester === SEM);
    } catch (e) { /* shown as empty */ }
    const block = (kind, label) => {
      const l = att.filter((r) => r.kind === kind);
      if (!l.length) return `<p class="small-note">${label}: nothing recorded yet.</p>`;
      const n = { P: 0, L: 0, E: 0, A: 0 }; l.forEach((r) => n[r.status]++);
      const pct = Math.round((l.reduce((s, r) => s + POINTS[r.status], 0) / (2 * l.length)) * 100);
      return `<h3 class="pf-h3">${label} <small class="pf-sub">${pct}% · ${n.P} present · ${n.L} late · ${n.E} excused · <span class="${n.A ? "pf-warn" : ""}">${n.A} absent</span></small></h3>
        <div class="adm-scroll"><table class="adm"><thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col">Status</th><th scope="col">Remark</th></tr></thead>
        <tbody>${l.map((r) => `<tr><td>${iso(r.date)}</td><td>${esc(r.title)}</td><td>${chip(r.status)}</td><td>${esc(r.remark || "")}</td></tr>`).join("")}</tbody></table></div>`;
    };
    const r = d.roster;
    let html = card(`Attendance <small class="pf-sub">only you${d.own ? "" : " (the student)"} and your lecturers see this</small>`,
      `${r ? `<p class="pf-meta">${r.section ? `<span>${SECTION[r.section]}: ${SECTION_TIME[r.section]}, group ${r.group || "–"}</span>` : `<span>No lab section yet</span>`}${d.lec && r.rps ? `<span>RPS: ${esc(r.rps)} (${esc(r.rpsEmail || "")})</span>` : ""}</p>` : ""}
      ${block("lecture", "Lectures")}${block("lab", "Labs")}${d.own ? `<p><a class="btn ghost small" href="attendance.html">Attendance page</a></p>` : ""}`, "pf-priv");
    if (swaps.length || notices.length) html += card("Lab Swaps and Absence Notices", `<ul class="pf-list">
      ${swaps.map((x) => `<li>⇄ <strong>${esc(x.labTitle)}</strong>: ${esc(x.fromName)} ⇄ ${esc(x.toName)} · <span class="at-tag ${x.status}">${x.status}</span></li>`).join("")}
      ${notices.map((x) => `<li>✉ <strong>${iso(x.date)} · ${esc(x.title)}</strong>: ${REASONS[x.reason] || x.reason}, “${esc(x.detail)}” · <span class="at-tag ${x.status}">${x.status}</span></li>`).join("")}</ul>`, "pf-priv");
    if (d.lec) html += lecturerParts(d);
    box.innerHTML = html;
  }

  // the full record a lecturer sees: every exercise and where the XP came from
  function lecturerParts(d) {
    if (!d.keys) return card("Exercises", `<p class="small-note">${d.uid ? "No progress saved yet." : "This student hasn't signed in to the course site yet, so no progress is saved."}</p>`, "pf-priv");
    const parse = (s, x) => { try { return s == null ? x : JSON.parse(s); } catch (e) { return x; } };
    const log = parse(d.keys["nmk-ex-log"], {}), solved = new Set(parse(d.keys["nmk-solved"], []));
    const rows = G.STOPS.filter((s) => s.ids.length).map((s) => `<tr class="pf-stop"><th colspan="5">${esc(s.label)}: ${esc(s.title)}</th></tr>` + s.ids.map((id) => {
      const r = log[id];
      return `<tr><td>${esc(G.CATALOG[id]).replace(/&lt;(\/?)sub&gt;/g, "<$1sub>")}</td><td>${solved.has(id) ? "✓ solved" : r ? "tried" : "–"}</td><td>${r ? r.checks : ""}</td><td>${r ? r.wrong : ""}</td><td><small>${r && r.last ? esc([].concat(r.last).join(" | ")) : ""}</small></td></tr>`;
    }).join("")).join("");
    const labs = COURSE.labs.filter((l) => l.page).map((l) => { const p = parse(d.keys[`nmk-lab${l.no}-prelab`], null), t = parse(d.keys[`nmk-lab${l.no}-prelab-tries`], 0); return `<li><strong>Lab ${l.no}</strong> Pre-Lab Check: ${p ? `${p.score}/10${p.first ? ", first try" : ""} (${p.date || ""})` : "not passed"}${t ? ` · ${t} attempt${t === 1 ? "" : "s"}` : ""}</li>`; }).join("");
    return card("Exercises", `<div class="adm-scroll"><table class="adm pf-ex"><thead><tr><th scope="col">Exercise</th><th scope="col">Result</th><th scope="col">Checks</th><th scope="col">Wrong</th><th scope="col">Last answers</th></tr></thead><tbody>${rows}</tbody></table></div>`, "pf-priv")
      + card("Labs", `<ul class="pf-list">${labs}</ul>`, "pf-priv")
      + card(`Where the XP Came From <small class="pf-sub">${d.g.xp} XP</small>`, `<ul class="pf-list">${d.g.items.map((i) => `<li>+${i.xp} ${esc(i.what)}</li>`).join("")}</ul>`, "pf-priv");
  }

  // lecturers: edit the class-list details here, in the page
  function editDetails(d) {
    const r = d.roster, old = $(".pf-editbox");
    if (old) { old.remove(); return; }
    const box = document.createElement("section");
    box.className = "pf-card pf-editbox";
    box.innerHTML = `<h2 class="pf-h">Edit Details</h2><form class="at-dform" novalidate>
      <label>Name<input name="name" value="${esc(r.name)}"></label>
      <div class="at-two"><label>Matric number<input name="matric" value="${esc(r.matric)}"></label><label>Lab section<select name="section"><option value="">None</option>${Object.entries(SECTION).map(([v, l]) => `<option value="${v}"${r.section === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="at-two"><label>Lab group<input name="group" type="number" min="0" max="30" value="${r.group || ""}"></label><label>Status<select name="status"><option value="active"${r.status === "active" ? " selected" : ""}>Active</option><option value="dropped"${r.status !== "active" ? " selected" : ""}>Dropped</option></select></label></div>
      <div class="at-two"><label>RPS name<input name="rps" value="${esc(r.rps || "")}"></label><label>RPS email<input name="rpsEmail" type="email" value="${esc(r.rpsEmail || "")}"></label></div>
      <p class="small-note">To change the studentmail address, use <a href="attendance.html">Attendance</a> → Class List → Edit.</p>
      <p class="at-err" aria-live="polite"></p><div class="acc-row"><button type="submit" class="btn">Save</button><button type="button" class="btn ghost" data-cancel>Cancel</button></div></form>`;
    $(".pf-main").prepend(box);
    box.querySelector("input").focus();
    box.querySelector("[data-cancel]").addEventListener("click", () => box.remove());
    box.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      try {
        await db.collection("roster").doc(d.email).update({ name: v.name.trim().toUpperCase(), matric: v.matric.trim(), section: v.section, group: +v.group || 0, status: v.status, rps: v.rps.trim(), rpsEmail: v.rpsEmail.trim().toLowerCase() });
        location.reload();
      } catch (ex) { box.querySelector(".at-err").textContent = `Could not save (${ex.code || ex}).`; }
    });
  }
})();
