/* NMK42003 My Class Hub (myclass.html): every signed-in page as a flash card, one hub for lecturers and one for
   students. It reads nothing from Firestore: the switches (INSTRUMENTA released, survey open) and the bell items that
   give the badges come from account.js (NMKAccount.hub()), which already read them for this visit. */
(function () {
  "use strict";
  const host = document.getElementById("hub");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // [href, icon, title, what it does, which bell items count on its badge]
  const LEC = [
    ["In Class", [
      ["attendance.html", "✅", "Attendance", "Open a session, show the key or QR code on the projector, and mark students by hand.", /^attendance\.html(#|$)/],
      ["picker.html", "🎯", "Name Picker", "Pick a student to answer a question, starring their INSTRUMENTA character."],
      ["kalam.html", "💬", "Kalam Feed", "Post announcements and read the students' replies and reactions.", /^kalam\.html/],
      ["gallery.html", "📷", "Class Moments", "Class photos from your Drive folder, grouped by session."]]],
    ["Marks and Records", [
      ["attendance.html?tab=marks", "📝", "Lab Marks", "Key in each student's demo and report marks for every lab, with the rubric beside them."],
      ["attendance.html?tab=marks&lm=analysis", "📈", "Lab Mark Analysis", "Graphs for each lab: demo, report or both, the sections compared, the weakest report part and who needs help."],
      ["attendance.html?tab=warnings", "⚠️", "Attendance Warnings", "Warning letters waiting to be sent, and the ones already emailed to students and their RPS."],
      ["project.html#group", "🧩", "Mini Project", "Groups and title approvals, possible clashes, the logbook, peer evaluation and marks.", /^project\.html/]]],
    ["Students", [
      ["attendance.html?tab=roster", "👥", "Class List", "Every student with their section and group; import the list, edit details or lab groups."],
      ["board.html", "🏆", "Class Board", "The class rankings, XP, levels and badges."],
      ["missions.html", "⚔️", "INSTRUMENTA: Legends", "The game: play any station, lock chapters and see the leaderboard."],
      ["survey.html", "📋", "Course Survey", "Open a survey round and read the results.", /^survey\.html/]]],
    ["Running the Course", [
      ["admin.html", "🛠", "Lecturer Dashboard", "Account approvals, the class heatmap, exercise difficulty and the game's chapters.", /^admin\.html/],
      ["evidence.html", "📊", "Teaching Evidence", "Reach, CO attainment, lab marks and survey results for the teaching award."],
      ["attendance.html?tab=schedule", "📅", "Schedule", "Change the public timetable: dates, rooms and lab sessions."],
      ["notifications.html", "🔔", "Notifications", "Everything the bell has told you, with the to-do items first.", "all"]]]
  ];
  const STU = (o) => [
    ["In Class", [
      ["attendance.html", "✅", "My Attendance", "Check in with the key or QR code, and see your own record.", /^attendance\.html(?!#requests|#labs)/],
      ["attendance.html#labs", "🔁", "My Lab Sessions", "Your lab dates, section and group, and Swap Lab Session with a classmate.", /^attendance\.html#(requests|labs)/],
      ["kalam.html", "💬", "Kalam Feed", "News from Dr. Zamri: read, reply and react.", /^kalam\.html/],
      ["gallery.html", "📷", "Class Moments", "Photos from our classes and labs."]]],
    ["Learn and Play", [
      o.missions ? ["missions.html", "⚔️", "INSTRUMENTA: Legends", "Play, learn and master each chapter: face the enemies and climb the ranks."] : null,
      ["board.html", "🏆", "Class Board and My Progress", "Your XP, level, badges and journey, and where you are on the class board."],
      o.survey ? ["survey.html", "📋", "Course Survey", "A few minutes, no marks, and it helps improve the course.", /^survey\.html/] : null]],
    ["My Work", [
      ["project.html#group", "🧩", "My Mini Project Group", "Your group, title proposal, logbook and peer evaluation.", /^project\.html/],
      ["profile.html", "👤", "My Profile", "What your classmates see, plus your own attendance, swaps and notices."],
      ["notifications.html", "🔔", "Notifications", "Everything the bell has told you, with the to-do items first.", "all"]]]
  ];

  function badge(card, o) {
    const [href, , , , match] = card;
    if (href === "missions.html" && o.lec && !o.missions) return `<span class="hub-b off">Not released</span>`;
    if (href === "survey.html" && o.survey) return `<span class="hub-b">Open now${o.lec ? ` (${esc(o.survey)})` : ""}</span>`;
    if (!match) return "";
    const items = match === "all" ? o.bell : o.bell.filter((x) => match.test(x.href || ""));
    const todo = items.filter((x) => x.todo).length, fresh = items.filter((x) => x.fresh && !x.todo).length;
    return `${todo ? `<span class="hub-b">${todo} to do</span>` : ""}${fresh ? `<span class="hub-b new">${fresh} new</span>` : ""}`;
  }
  function card(c, o) {
    const [href, icon, title, desc] = c, b = badge(c, o);
    return `<li class="fc hub-c">
      <div class="fc-in">
        <div class="fc-f">
          <span class="hub-ic" aria-hidden="true">${icon}</span>
          <h3><a class="fc-a" href="${esc(href)}">${esc(title)}</a></h3>
          <p class="fc-sum">${esc(desc)}</p>
          <div class="fc-meta">${b}</div>
        </div>
        <div class="fc-b" aria-hidden="true">
          <span class="fc-k">${esc(title)}</span><p>${esc(desc)}</p>
          <div class="fc-bfoot"><a class="fc-open" href="${esc(href)}" tabindex="-1">Open →</a>${b}</div>
        </div>
      </div>
      <button type="button" class="fc-rot" aria-label="Flip the card: ${esc(title)}" title="Flip">⟲</button>
    </li>`;
  }

  let A = null;
  function draw() {
    const s = A.state, u = s.user;
    if (!u) {
      host.innerHTML = `<div class="hub-out"><p>Sign in with your UniMAP student account to open your hub: attendance, lab sessions, Kalam Feed, the class board and more.</p>
        <button type="button" class="btn" data-signin>Sign in with Google</button></div>`;
      return;
    }
    const lec = A.isAdmin(u.email), p = s.profile;
    if (!lec && (!p || p.status !== "approved")) {
      host.innerHTML = `<div class="hub-out"><p>${p ? "Your account is waiting for your lecturer's approval. Your hub opens here as soon as you are approved." : "Setting up your account…"}</p></div>`;
      return;
    }
    const h = A.hub(), o = Object.assign({ lec }, h, { bell: h.bell || [] });
    const groups = lec ? LEC : STU(o);
    host.innerHTML = groups.map(([g, cards]) => {
      const list = cards.filter(Boolean);
      return list.length ? `<section class="hub-g"><h2 class="hub-h">${esc(g)}</h2><ul class="fc-grid hub-grid">${list.map((c) => card(c, o)).join("")}</ul></section>` : "";
    }).join("");
  }
  host.addEventListener("click", (e) => {
    const r = e.target.closest(".fc-rot");
    if (r) r.closest(".fc").classList.toggle("flip");
    if (e.target.closest("[data-signin]") && A) A.signIn();
  });
  function start() {
    A = window.NMKAccount;
    if (!A) { host.innerHTML = `<p class="small-note">Could not load the accounts. Check your connection and reload the page.</p>`; return; }
    A.on(draw);
    document.addEventListener("nmk:hub", () => { if (A.state.user) draw(); });
  }
  if (window.NMKAccount) start(); else addEventListener("load", start);
})();
