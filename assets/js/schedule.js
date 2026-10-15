/* NMK42003: the lecturer's changes to the public timetable (the weekly plan, and the week of each chapter and lab).
   data.js holds the original plan. The lecturer edits it on attendance.html (Schedule tab); the changes are kept in
   Firestore schedule/<semester> and copied to this browser (nmk-sched) by account.js. This file runs straight after
   data.js on every page, so every page draws the edited timetable. */
(function () {
  "use strict";
  if (typeof COURSE === "undefined") return;
  let o = null;
  try { o = JSON.parse(localStorage.getItem("nmk-sched") || "null"); } catch (e) { o = null; }
  COURSE.original = { weeks: COURSE.weeks.map((w) => Object.assign({}, w)), labs: COURSE.labs.map((l) => l.weeks), topics: COURSE.topics.map((t) => t.weeks) };
  if (!o || o.semester !== (COURSE.semesterId || COURSE.session)) return;
  const FIELDS = ["topic", "sub", "activities", "assessments", "notes", "tags"];
  Object.entries(o.weeks || {}).forEach(([n, ch]) => {
    const w = COURSE.weeks.find((x) => String(x.w) === String(n));
    if (!w || !ch) return;
    FIELDS.forEach((f) => { if (ch[f] !== undefined) w[f] = ch[f]; });
    w.edited = true;
  });
  Object.entries(o.labs || {}).forEach(([n, v]) => { const l = COURSE.labs.find((x) => String(x.no) === String(n)); if (l && v) l.weeks = v; });
  Object.entries(o.topics || {}).forEach(([n, v]) => { const t = COURSE.topics.find((x) => String(x.no) === String(n)); if (t && v) t.weeks = v; });
})();
