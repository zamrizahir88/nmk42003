/* NMK42003 lecturer dashboard (admin.html): approve students and see their progress.
   Reads Firestore through account.js; the security rules let only the lecturers read other students' data. */
(function () {
  "use strict";
  const host = document.getElementById("admin");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!window.NMKAccount) { host.innerHTML = `<div class="callout warn"><strong>The sign-in service could not load</strong>Check your internet connection and reload the page.</div>`; return; }
  const A = window.NMKAccount, db = A.db;
  const when = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };

  let users = [], progress = {}, tab = "pending", filter = "";
  const COURSE_EX = () => {
    // how many exercises each chapter and lab has, from the course data (labs have 4 review exercises each)
    const out = {};
    (window.COURSE && COURSE.topics || []).forEach((t) => { if (t.exercises) out[t.exercises.prefix] = { label: `Ch ${t.no}`, n: t.exercises.count }; });
    (window.COURSE && COURSE.labs || []).filter((l) => l.page).forEach((l) => { out[`l${l.no}-`] = { label: `Lab ${l.no}`, n: 4 }; });
    return out;
  };

  async function load() {
    host.innerHTML = `<p class="adm-empty">Loading…</p>`;
    try {
      const [u, p] = await Promise.all([db.collection("users").get(), db.collection("progress").get()]);
      users = u.docs.map((d) => Object.assign({ uid: d.id }, d.data()));
      progress = {}; p.docs.forEach((d) => { progress[d.id] = d.data(); });
      draw();
    } catch (e) {
      host.innerHTML = `<div class="callout warn"><strong>Could not load the records</strong>${esc(e.code || e)}. If this says "permission-denied", the Firestore rules have not been published yet, or this account is not a lecturer.</div>`;
    }
  }
  async function setStatus(uid, status) {
    try {
      await db.collection("users").doc(uid).update({ status, reviewedAt: firebase.firestore.FieldValue.serverTimestamp() });
      const u = users.find((x) => x.uid === uid); if (u) u.status = status;
      draw();
    } catch (e) { alert(`Could not change the status: ${e.code || e}`); }
  }

  // one row of progress for a student, from the records their browser saved
  function summary(u) {
    const k = (progress[u.uid] && progress[u.uid].keys) || {}, solved = parse(k["nmk-solved"], []), log = parse(k["nmk-ex-log"], {});
    const per = {};
    Object.entries(COURSE_EX()).forEach(([pre, c]) => { per[c.label] = `${solved.filter((id) => id.startsWith(pre)).length}/${c.n}`; });
    const firstTry = Object.values(log).filter((r) => r.solved && r.firstTry).length;
    const pre = [1, 2, 3].map((n) => { const v = parse(k[`nmk-lab${n}-prelab`], null); return v ? `${v.score}/10` : "–"; });
    const cal = Object.keys(parse(k["nmk-lab2-cal"], {})).length;
    return { solved: solved.length, firstTry, per, pre, cal, merge: parse(k["nmk-lab3-merge"], false), updated: progress[u.uid] && progress[u.uid].updatedAt };
  }

  function draw() {
    const pending = users.filter((u) => u.status === "pending"), students = users.filter((u) => u.role !== "lecturer");
    const approved = students.filter((u) => u.status === "approved");
    const q = filter.toLowerCase(), match = (u) => !q || [u.nickname, u.name, u.email].join(" ").toLowerCase().includes(q);
    let body = "";
    if (tab === "pending") {
      body = pending.length ? table(["Student", "Nickname", "Signed up", ""], pending.map((u) => [
        `${esc(u.name)}<small>${esc(u.email)}</small>`, esc(u.nickname), when(u.createdAt),
        `<div class="adm-acts"><button class="btn sm" data-ok="${u.uid}">Approve</button><button class="btn ghost sm" data-no="${u.uid}">Reject</button></div>`]))
        : `<p class="adm-empty">No one is waiting for approval.</p>`;
    } else if (tab === "students") {
      const list = students.filter(match);
      body = list.length ? table(["Student", "Nickname", "Status", "Last active", ""], list.map((u) => [
        `${esc(u.name)}<small>${esc(u.email)}</small>`, esc(u.nickname), `<span class="adm-st ${u.status}">${esc(u.status)}</span>`, when(u.lastActive),
        `<div class="adm-acts">${u.status !== "approved" ? `<button class="btn sm" data-ok="${u.uid}">Approve</button>` : ""}${u.status !== "rejected" ? `<button class="btn ghost sm" data-no="${u.uid}">${u.status === "approved" ? "Remove access" : "Reject"}</button>` : ""}</div>`]))
        : `<p class="adm-empty">No students found.</p>`;
    } else {
      const list = approved.filter(match), cols = Object.values(COURSE_EX()).map((c) => c.label);
      body = list.length ? table(["Student", "Last active", "Solved", "First try", ...cols, "Pre-Lab 1", "Pre-Lab 2", "Pre-Lab 3", "Lab 2 Table 1", "Lab 3 merge"], list.map((u) => {
        const s = summary(u);
        return [`${esc(u.nickname)}<small>${esc(u.name)}</small>`, when(u.lastActive), s.solved, s.firstTry, ...cols.map((c) => s.per[c]), ...s.pre, `${s.cal}/19`, s.merge ? "✓" : "–"];
      })) : `<p class="adm-empty">No approved students yet.</p>`;
    }
    host.innerHTML = `<div class="adm-sum"><div><strong>${pending.length}</strong><span>waiting for approval</span></div><div><strong>${approved.length}</strong><span>approved students</span></div><div><strong>${Object.keys(progress).length}</strong><span>with saved progress</span></div></div>
      <div class="adm-tabs" role="group" aria-label="Dashboard view">${[["pending", `Waiting for Approval (${pending.length})`], ["students", "All Students"], ["progress", "Progress"]].map(([v, l]) =>
        `<button type="button" class="chip-btn" data-tab="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</div>
      ${tab === "pending" ? "" : `<div class="adm-tools"><input type="search" placeholder="Search name, nickname or email" value="${esc(filter)}" aria-label="Search students" data-q>${tab === "progress" ? `<button type="button" class="btn ghost sm" data-csv>Download CSV</button>` : ""}<button type="button" class="btn ghost sm" data-reload>Refresh</button></div>`}
      <div class="adm-scroll">${body}</div>`;
    const s = host.querySelector("[data-q]");
    if (s && document.activeElement !== s && filter) { s.focus(); s.setSelectionRange(filter.length, filter.length); }
  }
  const table = (head, rows) => `<table class="adm"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  function csv() {
    const cols = Object.values(COURSE_EX()).map((c) => c.label);
    const head = ["Name", "Email", "Nickname", "Last active", "Exercises solved", "Solved first try", ...cols, "Pre-Lab 1", "Pre-Lab 2", "Pre-Lab 3", "Lab 2 Table 1 rows", "Lab 3 merge"];
    const lines = users.filter((u) => u.status === "approved" && u.role !== "lecturer").map((u) => {
      const s = summary(u);
      return [u.name, u.email, u.nickname, when(u.lastActive), s.solved, s.firstTry, ...cols.map((c) => s.per[c]), ...s.pre, s.cal, s.merge ? "yes" : "no"];
    });
    const text = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = `nmk42003-progress-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  host.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; draw(); }
    else if (b.dataset.ok) setStatus(b.dataset.ok, "approved");
    else if (b.dataset.no && confirm("Remove this student's access?")) setStatus(b.dataset.no, "rejected");
    else if (b.hasAttribute("data-csv")) csv();
    else if (b.hasAttribute("data-reload")) load();
  });
  host.addEventListener("input", (e) => { if (e.target.matches("[data-q]")) { filter = e.target.value; draw(); } });

  A.on((st) => {
    if (!st.user) { host.innerHTML = `<div class="adm-gate"><p>This page is for the course lecturers. Sign in with your UniMAP lecturer account to approve students and see their progress.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`; const b = host.querySelector("[data-signin]"); if (b) b.onclick = A.signIn; return; }
    if (!A.isAdmin(st.user.email)) { host.innerHTML = `<div class="callout warn"><strong>Lecturers only</strong>You are signed in as ${esc(st.user.email)}, which is not a lecturer account.</div>`; return; }
    load();
  });
})();
