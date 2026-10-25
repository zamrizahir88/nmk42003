/* NMK42003 showcase (showcase.html): a public page that explains the innovation to visitors and award judges, who
   cannot sign in. The method, the course-outcome alignment (from data.js) and the parts anyone can try come from this
   file; the live figures are the class-level numbers a lecturer publishes from Teaching Evidence (meta/showcase,
   readable by everyone; evidence.js writes totals, averages and percentages only, never a name). */
(function () {
  "use strict";
  const host = document.getElementById("showcase");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => (x == null ? "–" : `${(+x).toFixed(x % 1 ? 1 : 0)}%`);
  const CO = window.NMKCO;
  const NAME = "Try-First Digital Learning for Instrumentation";

  const PILLARS = [
    { icon: "⚡", t: "Learn by Doing", d: "Every chapter is a set of live circuits and calculators: change a resistor, a capacitor or a reading and the diagram, the working and the graphs change with it. Students see why the formula works, not just the answer.", href: "chapter-5.html", link: "Try Chapter 5: change Rf and watch the gain" },
    { icon: "🎯", t: "Try First, Then See the Working", d: "Exercises ask for an answer before anything is shown. A wrong try unlocks a hint that guides without giving the number; the full working opens only after a correct answer. Each exercise shows the course outcome it practises.", href: "chapter-1.html#exercises", link: "Try an exercise in Chapter 1 (answer wrongly once)" },
    { icon: "🧪", t: "Rehearse the Bench Before the Bench", d: "Virtual labs walk through the real lab step by step: the ESP32 wiring, block code, the Serial Monitor and the phone app. A Pre-Lab Check (7 of 10) unlocks the lab task, so students arrive ready to build.", href: "labs.html", link: "Open the virtual labs" },
    { icon: "⚔️", t: "Play to Practise", d: "INSTRUMENTA: Legends turns each chapter into three battle stations and a boss. Every strike is a worked calculation with fresh numbers each time; Volt the drone gives hints only after a wrong try. Coins and ranks never count towards grades.", note: "For signed-in students" },
    { icon: "💬", t: "Ask for a Hint, Any Time", d: "Ask Dr. Zamri, an AI study helper on every page, explains ideas and gives hints for exercises and lab tasks, but never the final answer. It says it is an AI when asked.", link: "Try it: the chat button at the bottom of this page" },
    { icon: "🤝", t: "Learn Together", d: "XP, levels, badges and a class board reward steady practice; the Kalam Feed keeps the class talking; the mini project page runs group forming, title approval, a weekly logbook and a confidential peer evaluation.", href: "project.html", link: "See the mini project page" },
    { icon: "✅", t: "One Place for the Class", d: "Attendance by QR code or key, absence notices with documents, lab swaps between classmates, automatic attendance warnings and rubric-based lab marks. Less paperwork for the lecturer, clear records for the student.", note: "For signed-in students and lecturers" }
  ];
  const TRY = [
    ["chapters.html", "All seven chapters", "Live diagrams, calculators and step-by-step working"],
    ["chapter-4.html", "Chapter 4: Transduction Techniques", "Balance a Wheatstone bridge; tune a 555 timer"],
    ["chapter-5.html", "Chapter 5: Signal Conditioning", "Op-amp gains with saturation, filters with Bode plots"],
    ["lab-2.html", "Virtual Lab 2", "Calibrate a potentiometer angle sensor on a virtual ESP32"],
    ["lab-3.html", "Virtual Lab 3", "Read RFID cards and drive an I2C LCD"],
    ["project.html", "Mini Project", "Brief, rubric, timeline and the design requirements"],
    ["schedule.html", "Schedule", "The 19-week plan with what is due each week"]
  ];
  const PRINCIPLES = [
    ["📱", "Phone first", "Most students study on phones: every page works at 360 px, and lab drawings restack for a tall screen."],
    ["🔓", "Open by default", "The chapters, labs and exercises work without signing in. Signing in (UniMAP student accounts only) saves progress across devices."],
    ["🎓", "Practice, not grades", "XP, badges and game coins never count towards grades, so students can try, fail and try again."],
    ["🔒", "Privacy", "Records stay in the course's own database, read only by the lecturers. Survey answers are used in reports only with consent and without names."],
    ["♿", "Accessible", "Light and dark mode, keyboard focus, reduced motion respected, readable type."],
    ["🔁", "Reusable", "Plain HTML, CSS and JavaScript on GitHub Pages: no build step and no licence fees, so another course can copy the structure."]
  ];

  function alignment() {
    const assess = (co) => COURSE.assessment.filter((a) => (a.detail || "").includes(co)).map((a) => `${esc(a.name)} (${a.pct}%)`).join("; ");
    const site = (co) => {
      const ch = COURSE.topics.filter((t) => t.co === co), labs = COURSE.labs.filter((l) => l.co === co && l.page);
      const n = CO ? Object.keys(window.NMKGame ? NMKGame.CATALOG : {}).filter((id) => CO.of(id) === co).length : 0;
      const parts = [];
      if (ch.length) parts.push(`Chapters ${ch.map((t) => t.no).join(", ")}: interactive notes${n ? `, ${n} try-first exercises` : ""}, and INSTRUMENTA game stations as each chapter's world opens`);
      if (labs.length) parts.push(`Virtual Labs ${labs.map((l) => l.no).join(", ")} with Pre-Lab Checks${n ? ` (${n} exercises)` : ""}; the mini project page`);
      return parts.join("; ") || "Taught from week 8 (data transmission, sensor networks and data storage)";
    };
    return `<div class="adm-scroll"><table class="adm sc-align"><thead><tr><th scope="col">Course outcome</th><th scope="col">On this website</th><th scope="col">Assessed in</th></tr></thead><tbody>
      ${COURSE.outcomes.map((o) => `<tr><td><strong>${o.id}</strong> <small>${esc(o.level)} · ${esc(o.po)}</small><span class="sc-cot">${esc(o.text)}</span></td><td>${site(o.id)}</td><td>${assess(o.id) || "–"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function figures(f, at) {
    if (!f) return `<p class="small-note">Live figures appear here once the lecturer publishes them.</p>`;
    const tile = (n, t) => n == null ? "" : `<div class="ev-tile"><strong>${n}</strong><span>${t}</span></div>`;
    const cos = Object.entries(f.co || {}).filter(([, v]) => v.mean != null);
    const sv = f.survey, conf = sv ? Object.entries(sv.conf || {}).filter(([, v]) => v.now != null) : [];
    const barRow = (label, v, max, sub) => `<div class="sc-bar"><span class="sc-bl">${label}</span><span class="sc-bt"><i style="width:${Math.min(100, (v / max) * 100).toFixed(0)}%"></i></span><span class="sc-bv">${sub}</span></div>`;
    return `<p class="small-note">${esc(f.semester)}, up to week ${f.week}. Class-level figures only. Last updated ${esc(new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}.</p>
      <div class="ev-tiles">${tile(`${f.accounts}<small>/${f.students}</small>`, "students signed in to save their progress")}${tile(f.solved, "exercises solved")}${tile(f.checks, "answers checked")}
        ${tile(f.afterHint == null ? null : pct(f.afterHint), "of solved exercises were solved after a hint: students kept trying")}${tile(f.game && f.game.players ? f.game.clears : null, `INSTRUMENTA stations cleared by ${f.game ? f.game.players : 0} students`)}
        ${tile(f.attendance && f.attendance.lecture != null ? pct(f.attendance.lecture) : null, "lecture attendance")}</div>
      ${cos.length ? `<h3 class="bd-h">Practice by Course Outcome</h3>${cos.map(([c, v]) => barRow(`${c}`, v.mean, 100, `${pct(v.mean)} of ${v.items} exercises solved on average; ${pct(v.reach)} of students solved half or more`)).join("")}` : ""}
      ${f.lab && f.lab.mean != null ? `<h3 class="bd-h">CO3 Lab Marks</h3>${barRow("CO3", f.lab.mean, 100, `class average ${pct(f.lab.mean)}, ${pct(f.lab.pass)} scoring 50% or more${f.lab.prev && f.lab.prev.mean != null ? `; previous cohort${f.lab.prev.label ? ` (${esc(f.lab.prev.label)})` : ""} ${pct(f.lab.prev.mean)}` : ""}`)}` : ""}
      ${(f.results || []).map((r) => `<h3 class="bd-h">${esc(r.name)}${r.co ? ` <span class="ex-co">${esc(r.co)}</span>` : ""}</h3>
        <p class="small-note">Class average ${pct(r.mean)}, ${pct(r.pass)} scoring 50% or more${r.prev ? `; previous cohort${r.prev.label ? ` (${esc(r.prev.label)})` : ""} ${pct(r.prev.mean)} average, ${pct(r.prev.pass)} scoring 50% or more` : ""}.${r.r != null ? ` Correlation between exercises solved on the site and the mark: r = ${r.r.toFixed(2)}.` : ""}</p>
        ${r.groups.filter((g) => g.mean != null).map((g) => barRow(esc(g.t), g.mean, 100, `${pct(g.mean)} average (${g.n} students)`)).join("")}`).join("")}
      ${sv ? `<h3 class="bd-h">What Students Say (${esc(sv.round)}, ${sv.n} students)</h3>
        <div class="ev-tiles">${tile(sv.sus == null ? null : sv.sus.toFixed(1), "System Usability Scale score out of 100 (68 is the usual average)")}</div>
        ${conf.length ? `<p class="small-note">Confidence in each course outcome, 1 to 5: before the course → now.</p>${conf.map(([c, v]) => barRow(c, v.now, 5, `${v.before == null ? "" : `${v.before.toFixed(1)} → `}<strong>${v.now.toFixed(1)}</strong>`)).join("")}` : ""}
        ${(sv.feat || []).length ? `<p class="small-note">The most useful parts of the website (1 to 5):</p>${sv.feat.slice(0, 5).map((x) => barRow(esc(x.t.replace(/\s*\(.*\)$/, "")), x.mean, 5, x.mean.toFixed(2))).join("")}` : ""}` : ""}`;
  }

  function draw(fig) {
    const d = COURSE.developer || {};
    host.innerHTML = `<div class="sc-head"><span class="sc-tag">Teaching and learning innovation</span><h2 class="sc-name">${esc(NAME)}</h2>
        <p>${esc(COURSE.code)} ${esc(COURSE.name)} · ${esc(COURSE.faculty || "")} · ${esc(COURSE.university)} · ${esc(COURSE.session)}</p></div>
      <nav class="sc-toc" aria-label="On this page">${[["why", "Why"], ["method", "The Method"], ["alignment", "Alignment"], ["evidence", "Evidence"], ["try", "Try It"], ["design", "Design"], ["team", "Team"]].map(([h, t]) => `<a class="chip-btn" href="#sc-${h}">${t}</a>`).join("")}</nav>

      <section id="sc-why" class="sc-sec"><h2 class="h3">Why</h2>
        <div class="sc-why"><p>Instrumentation is full of circuits, formulas and lab procedures that are hard to picture from lecture slides alone. Students meet them once in a lecture, often study on a phone, and get only a few hours at the real bench.</p>
        <p>A worked answer on a slide is easy to read and easy to forget. Students learn more when they try a problem themselves, get stuck, get a nudge and try again. The aim was a course website that makes that the normal way to study: active, step by step, any time, on any phone, without giving the answer away.</p></div></section>

      <section id="sc-method" class="sc-sec"><h2 class="h3">The Method</h2>
        <div class="sc-cards">${PILLARS.map((p) => `<article class="sc-card"><span class="sc-ic" aria-hidden="true">${p.icon}</span><h3>${esc(p.t)}</h3><p>${esc(p.d)}</p>
          ${p.href ? `<a href="${p.href}">${esc(p.link)} ›</a>` : p.link ? `<span class="sc-note">${esc(p.link)}</span>` : `<span class="sc-note">${esc(p.note)}</span>`}</article>`).join("")}</div>
        <div class="sc-loop" aria-label="The try-first loop"><span>Read and play with the circuit</span><span>Try the exercise</span><span>Wrong? Get a hint</span><span>Right? See the full working</span><span>Practise again in the game</span></div></section>

      <section id="sc-alignment" class="sc-sec"><h2 class="h3">Alignment With the Course Outcomes</h2>
        <p class="small-note">Every exercise and game station is tagged with the course outcome it practises, so the practice students do lines up with how they are assessed.</p>${alignment()}</section>

      <section id="sc-evidence" class="sc-sec"><h2 class="h3">Evidence From This Semester</h2>${fig ? figures(fig.figures, fig.publishedAt) : `<p class="small-note">Loading…</p>`}</section>

      <section id="sc-try" class="sc-sec"><h2 class="h3">Try It Yourself</h2><p class="small-note">These pages are open to everyone; no sign-in needed.</p>
        <ul class="sc-try">${TRY.map(([h, t, d]) => `<li><a href="${h}">${esc(t)}</a><span>${esc(d)}</span></li>`).join("")}</ul></section>

      <section id="sc-design" class="sc-sec"><h2 class="h3">Design Principles</h2>
        <div class="sc-princ">${PRINCIPLES.map(([i, t, d]) => `<div><span aria-hidden="true">${i}</span><strong>${esc(t)}</strong><p>${esc(d)}</p></div>`).join("")}</div></section>

      <section id="sc-team" class="sc-sec"><h2 class="h3">Team</h2>
        <p><strong>${esc(d.name || "")}</strong>, course coordinator, designer and developer. ${esc(d.affiliation || "")}.${d.link ? ` <a href="${esc(d.link)}" target="_blank" rel="noopener">Profile ›</a>` : ""}</p>
        <p class="small-note">Built with plain HTML, CSS and JavaScript on GitHub Pages, with Google Firebase for sign-in and records. The lecturer built the website with the help of an AI coding assistant; the course content follows the lecturer's own lecture notes and was checked by the lecturer. The study helper uses a large language model and is limited to hints.</p></section>`;
  }

  draw(null);
  const A = window.NMKAccount;
  if (!A || !A.db) { draw({}); return; }
  A.db.collection("meta").doc("showcase").get().then((d) => draw(d.exists ? d.data() : {})).catch(() => draw({}));
})();
