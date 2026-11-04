/* NMK42003 lecturer tools menu: one left menu shared by the lecturer's Attendance page and the Lecturer dashboard
   (lecturer's choice, replacing the rows of tab buttons). Items on the page that draws the menu switch the view in
   place (data-tab, the page handles the click); the others are plain links to the other page's tab (?tab=…). */
(function () {
  "use strict";
  // [group, [[tab, icon, title, page]]]
  const MENU = [
    ["", [["overview", "🏠", "Overview", "admin.html"]]],
    ["Attendance", [["sessions", "🗓", "Sessions", "attendance.html"], ["notices", "✉️", "Absence Notices", "attendance.html"], ["swaps", "🔁", "Lab Swaps", "attendance.html"],
      ["warnings", "⚠️", "Warnings", "attendance.html"], ["report", "📄", "Attendance Report", "attendance.html"]]],
    ["Students", [["roster", "👥", "Class List and Lab Groups", "attendance.html"], ["pending", "✔️", "Account Approvals", "admin.html"], ["students", "🧑‍🎓", "All Students", "admin.html"]]],
    ["Lab Assessment", [["marks", "📝", "Mark Entry", "attendance.html"], ["marksov", "📋", "Marks Overview", "attendance.html"], ["analysis", "📈", "Mark Analysis", "attendance.html"],
      ["weights", "⚖️", "Weights and Rubric", "attendance.html"]]],
    ["Course", [["schedule", "📅", "Timetable", "attendance.html"], ["missions", "⚔️", "INSTRUMENTA Chapters", "admin.html"], ["board", "🏆", "Class Board", "admin.html"]]],
    ["Insights", [["heatmap", "🟩", "Class Heatmap", "admin.html"], ["exercises", "🧩", "Exercise Difficulty", "admin.html"], ["evidence", "📊", "Teaching Evidence", "evidence.html"]]]
  ];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const all = () => MENU.flatMap((g) => g[1]);
  const href = ([tab, , , page]) => (page === "evidence.html" ? page : `${page}?tab=${tab}`);

  // page: the page drawing the menu; on: the current tab; badges: {tab: number or text}
  function html(page, on, badges) {
    const b = badges || {}, cur = all().find((x) => x[0] === on && x[3] === page);
    return `<button type="button" class="lt-secbtn" aria-expanded="false" aria-controls="ltSide">☰ Sections · <b>${esc(cur ? cur[2] : "Menu")}</b><span aria-hidden="true">▾</span></button>
      <nav class="lt-side" id="ltSide" aria-label="Lecturer tools">${MENU.map(([g, items]) => `${g ? `<h2 class="lt-g">${esc(g)}</h2>` : ""}${items.map((x) => {
        const [tab, icon, title, p] = x, here = p === page, n = b[tab];
        return `<a href="${href(x)}"${here ? ` data-tab="${tab}"` : ""} class="${here && tab === on ? "on" : ""}"${here && tab === on ? ' aria-current="page"' : ""}><i aria-hidden="true">${icon}</i><span>${esc(title)}</span>${n ? `<b>${esc(n)}</b>` : ""}</a>`;
      }).join("")}`).join("")}</nav>`;
  }
  // the ☰ Sections button on phones opens and closes the menu (a menu of links: no Back step)
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".lt-secbtn");
    if (t) { const open = t.getAttribute("aria-expanded") !== "true"; t.setAttribute("aria-expanded", open); t.parentNode.classList.toggle("lt-open", open); return; }
    const a = e.target.closest(".lt-side a");
    if (a) { const w = a.closest(".lt-open"); if (w) { w.classList.remove("lt-open"); const sb = w.querySelector(".lt-secbtn"); if (sb) sb.setAttribute("aria-expanded", "false"); } }
  }, true); // capture: before the page redraws the menu for the new view
  window.NMKLecMenu = { html, items: all };
})();
