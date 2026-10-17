/* NMK42003 course journey: XP, levels, badges, the weekly streak, the journey map and the earned-badge toasts.
   Everything is worked out from the progress records the site already keeps (the nmk-… keys), so it works for
   every student on their own device, and the lecturer dashboard can work it out for any student's saved records.
   Points are for practice and motivation only: they are calculated in the browser and do not count for grades. */
(function () {
  "use strict";
  if (typeof COURSE === "undefined") return;

  // every exercise on the site, generated from the chapter and lab pages (id → title)
  const CATALOG = {"c1-ex1": "Exercise 1: Error and Accuracy", "c1-ex2": "Exercise 2: Precision of One Reading", "c1-ex3": "Exercise 3: Statistics of Five Readings", "c1-ex5": "Exercise 4: Limiting Error of a Voltmeter", "c1-ex6": "Exercise 5: Limiting Error of Power", "c1-ex7": "Exercise 6: Precision and Significant Figures", "c2-q1": "Exercise 1: Inside the ESP32", "c2-q2": "Exercise 2: Low Power", "c2-q3": "Exercise 3: Radio and the Module", "c2-q4": "Exercise 4: Power Supply Setup", "c2-q5": "Exercise 5: Programming Modes", "c2-q6": "Exercise 6: Manual Mode and the PC Connection", "c2-q7": "Exercise 7: Input and Output", "c2-q8": "Exercise 8: Types of Connectivity", "c2-q9": "Exercise 9: UART, SPI or I²C?", "c2-q10": "Exercise 10: Bluetooth and Wi-Fi", "c3-q1": "Exercise 1: Which Parameter?", "c3-q2": "Exercise 2: Sensitivity of a Linear Sensor", "c3-q3": "Exercise 3: Dynamic Response", "c3-q4": "Exercise 4: Hysteresis", "c3-q5": "Exercise 5: Potentiometer", "c3-q6": "Exercise 6: Resistance of a Wire", "c3-q7": "Exercise 7: Parallel-Plate Capacitive Sensor", "c3-q8": "Exercise 8: Liquid-Level Sensor", "c3-q9": "Exercise 9: Coil Inductance", "c3-q10": "Exercise 10: Passive, Active or Actuator?", "c3-q11": "Exercise 11: Parking Sensor", "c3-q12": "Exercise 12: Actuators", "c4-q1": "Exercise 1: Voltage Divider", "c4-q2": "Exercise 2: Capacitor Divider", "c4-q3": "Exercise 3: LDR Night Light", "c4-q4": "Exercise 4: Unbalanced Bridge", "c4-q5": "Exercise 5: Galvanometer Direction", "c4-q6": "Exercise 6: Finding an Unknown Resistor", "c4-q7": "Exercise 7: Strain Gauge Bridge", "c4-q8": "Exercise 8: 555 Timer", "c4-q9": "Exercise 9: Level Sensor Frequency", "c4-q10": "Exercise 10: LC Resonance", "c4-q11": "Exercise 11: Piezo Circuit", "c4-q12": "Exercise 12: Which Technique?", "ex-a1": "Amplifier Exercise 1: Voltage Follower", "ex-a2": "Amplifier Exercise 2: Inverting Amplifier", "ex-a3": "Amplifier Exercise 3: Non-Inverting Amplifier", "ex-a4": "Amplifier Exercise 4: Differential Amplifier", "ex-f1": "Filter Exercise 1: Passive Low-Pass Filter", "ex-f2": "Filter Exercise 2: Passive High-Pass Filter", "ex-f3": "Filter Exercise 3: Active Low-Pass Filter", "c6-q1": "Exercise 1: Binary, Hex and BCD", "c6-q2": "Exercise 2: Word Length", "c6-q3": "Exercise 3: Binary-Weighted Resistors", "c6-q4": "Exercise 4: Binary-Weighted DAC Output", "c6-q5": "Exercise 5: Choosing R<sub>f</sub>", "c6-q6": "Exercise 6: R-2R Ladder", "c6-q7": "Exercise 7: ADC Resolution", "c6-q8": "Exercise 8: ESP32 Thermometer", "c6-q9": "Exercise 9: Counter vs SAR", "c6-q10": "Exercise 10: How Many Bits?", "c6-q11": "Exercise 11: ESP32 DAC", "c6-q12": "Exercise 12: DAC or ADC?", "c7-q1": "Exercise 1: A Line from Two Points", "c7-q2": "Exercise 2: Using a Calibration Equation", "c7-q3": "Exercise 3: Checking the Accuracy", "c7-q4": "Exercise 4: Least-Squares Line", "c7-q5": "Exercise 5: Keep Enough Significant Figures", "c7-q6": "Exercise 6: Calibration Ideas", "l1-q1": "Exercise 1: Blink Timing", "l1-q2": "Exercise 2: The LED Resistor", "l1-q3": "Exercise 3: Reading the Web Request", "l1-q4": "Exercise 4: The Line Ending", "l2-q1": "Exercise 1: Voltage to Count", "l2-q2": "Exercise 2: The Line Through Two Points", "l2-q3": "Exercise 3: Use the Equation", "l2-q4": "Exercise 4: The Error of a Reading", "l3-q1": "Exercise 1: Reading a UID", "l3-q2": "Exercise 2: How Many Cards?", "l3-q3": "Exercise 3: Plan the Display", "l3-q4": "Exercise 4: Two Buses"};
  const SEM = COURSE.semesterId || COURSE.session;
  const LEVELS = [[0, "Apprentice"], [400, "Technician"], [1200, "Calibration Engineer"], [2200, "Instrumentation Specialist"]];
  const KIT_TOTAL = { 1: 15, 2: 15, 3: 13 };
  const DAY = 86400000;

  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const startMs = (() => { const [y, m, d] = COURSE.semesterStart.split("-").map(Number); return Date.UTC(y, m - 1, d) - 8 * 3600000; })(); // Monday 00:00 in Malaysia
  const weekOf = (t) => Math.floor((new Date(t).getTime() - startMs) / (7 * DAY)) + 1;
  const firstWeek = (w) => { const m = String(w || "").match(/\d+/); return m ? +m[0] : 99; };
  // lecturers (remembered by account.js after sign-in) see a class summary instead of their own journey, and no
  // badge or level pop-ups; "Preview as a student" (nmk-preview) shows the journey as students see it
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const isLecturer = () => lsGet("nmk-role") === "lecturer";
  const previewing = () => lsGet("nmk-preview") === "1";
  const today = () => { const q = new URLSearchParams(location.search).get("today"); return q ? new Date(q + "T12:00:00+08:00").getTime() : Date.now(); };

  /* ---------- the stops of the journey: chapters and labs in teaching order ---------- */
  const prefixOf = (t) => (t.exercises && t.exercises.prefix) || `c${t.no}-`;
  const idsWith = (pre) => Object.keys(CATALOG).filter((id) => id.startsWith(pre));
  const STOPS = (() => {
    const ch = COURSE.topics.map((t) => ({ kind: "ch", no: t.no, key: `ch${t.no}`, label: `Chapter ${t.no}`, title: t.title, week: firstWeek(t.weeks), href: t.page || `topic.html?ch=${t.no}`, ids: idsWith(prefixOf(t)) }));
    const lab = COURSE.labs.map((l) => ({ kind: "lab", no: l.no, key: `lab${l.no}`, label: `Lab ${l.no}`, title: l.title.replace(/^Lab \d+:\s*/, ""), week: firstWeek(l.weeks), href: l.page || "labs.html", ids: l.page ? idsWith(`l${l.no}-`) : [], built: !!l.page }));
    return ch.concat(lab).sort((a, b) => a.week - b.week || (a.kind === b.kind ? a.no - b.no : a.kind === "ch" ? -1 : 1));
  })();

  const BADGES = [
    { id: "first-steps", name: "First Steps", icon: "👣", desc: "Solved your first exercise" },
    { id: "zero-hints", name: "Zero Hints", icon: "🎯", desc: "Solved every exercise of a chapter, each on the first try" },
    { id: "first-try", name: "First Try", icon: "⚡", desc: "Passed a Pre-Lab Check on the first attempt" },
    { id: "calibrated", name: "Calibrated", icon: "📐", desc: "Lab 2: your equation is within ±5° at every angle" },
    { id: "card-reader", name: "Card Reader", icon: "💳", desc: "Lab 3: read all three cards with the RC522" },
    { id: "on-a-roll", name: "On a Roll", icon: "🔥", desc: "Made progress three weeks in a row" },
    { id: "halfway", name: "Halfway", icon: "⛰️", desc: "Solved half of all the exercises" },
    { id: "checked-in", name: "Checked In", icon: "🙋", desc: "Marked your first class attendance" },
    { id: "lab-regular", name: "Lab Regular", icon: "🧪", desc: "Attended every lab session so far (at least two)" },
    { id: "lecture-regular", name: "Lecture Regular", icon: "📚", desc: "Attended five lectures in a row" },
    { id: "full-house", name: "Full House", icon: "🏠", desc: "No absences at all, from week 8 on" },
    { id: "early-riser", name: "Early Riser", icon: "🌅", desc: "Attended a Thursday 9 AM lab" },
    { id: "mission-1", name: "On a Mission", icon: "🗡️", desc: "Completed your first Mission" },
    { id: "boss-breaker", name: "Boss Breaker", icon: "🛡️", desc: "Defeated a Mission boss" }
  ].concat(COURSE.labs.filter((l) => l.page).map((l) => ({ id: `lab${l.no}-ready`, name: `Lab ${l.no} Ready`, icon: "🔓", desc: `Passed the Lab ${l.no} Pre-Lab Check` })));

  // Lab 2's virtual sensor, to check the student's own equation (the same model as lab2.js)
  function lab2Calibrated(k) {
    const s = parse(k["nmk-lab2-sensor"], null), mc = parse(k["nmk-lab2-mc"], null);
    if (!s || !mc || !isFinite(mc.m) || !isFinite(mc.c)) return false;
    const adc = (v) => Math.max(0, Math.min(4095, v < 0.14 ? 0 : v <= 2.5 ? 1271.2 * (v - 0.14) : 3000 + (1095 * (v - 2.5)) / 0.65));
    return [0, 30, 60, 90, 120, 150, 180].every((a) => Math.abs(mc.m * Math.round(adc((3.3 * (a + s.t0)) / s.span)) + mc.c - a) <= 5);
  }

  /* ---------- the whole calculation, from a set of progress records ---------- */
  function compute(k) {
    k = k || {};
    const solved = parse(k["nmk-solved"], []).filter((id) => CATALOG[id]), log = parse(k["nmk-ex-log"], {}), quiz = parse(k["nmk-quiz-log"], {});
    const items = [], dates = [];
    const add = (xp, what, when) => { items.push({ xp, what, when: when || null }); if (when) dates.push(when); };
    solved.forEach((id) => {
      const r = log[id];
      add(!r ? 20 : r.wrong === 0 ? 30 : r.wrong <= 2 ? 20 : 10, `Solved ${CATALOG[id]}`, r && (r.solvedAt || r.at));
    });
    Object.values(log).forEach((r) => { if (r && r.at) dates.push(r.at); });
    const stops = STOPS.map((s) => {
      const done = s.ids.filter((id) => solved.includes(id)).length;
      let total = s.ids.length, doneAll = done;
      if (s.kind === "lab" && s.built) {
        const pass = parse(k[`nmk-lab${s.no}-prelab`], null);
        total += 1;
        if (pass && pass.score >= 7) { doneAll += 1; add(50 + (pass.first ? 20 : 0), `Passed the Lab ${s.no} Pre-Lab Check`, pass.date); }
        const kit = parse(k[`nmk-lab${s.no}-kit`], []);
        if (Array.isArray(kit) && kit.length >= (KIT_TOTAL[s.no] || 99)) add(25, `Lab ${s.no}: equipment checklist complete`);
      }
      if (s.ids.length && done === s.ids.length) add(50, `${s.label}: all exercises solved`);
      return Object.assign({}, s, { done: doneAll, total, exDone: done, pct: total ? Math.round((doneAll / total) * 100) : 0 });
    });
    if (Object.keys(parse(k["nmk-lab2-cal"], {})).length >= 19) add(25, "Lab 2: Table 1 complete");
    const seen3 = parse(k["nmk-lab3-seen"], {});
    if (seen3.cardr && seen3.fobr && seen3.tagr) add(25, "Lab 3: all three cards read");
    if (parse(k["nmk-lab3-merge"], false)) add(25, "Lab 3: programs merged");
    Object.values(quiz).forEach((d) => { add(5, "Quiz question correct", d); });
    // class attendance (the student's own records, loaded by account.js): 10 XP for each session attended
    const att = parse(k["nmk-att"], null), recs = att && Array.isArray(att.recs) ? att.recs : [];
    const here = (r) => r.s === "P" || r.s === "L";
    recs.forEach((r) => { if (here(r)) add(10, `Attended ${r.t || (r.k === "lab" ? "a lab" : "a lecture")}`, r.d ? `${r.d}T12:00:00+08:00` : null); });

    // Missions: the best result of each mission; 2 coins make 1 XP
    const mis = parse(k["nmk-missions"], {}) || {};
    Object.values(mis).forEach((r) => { if (r && r.c) add(Math.floor(r.c / 2), `Mission: ${r.t || "a mission"}${r.boss ? " (boss)" : ""}`, r.at); });
    const xp = items.reduce((s, i) => s + i.xp, 0);
    let li = 0; LEVELS.forEach(([t], i) => { if (xp >= t) li = i; });
    // activity by semester week
    const weeks = new Set(dates.map(weekOf).filter((w) => w >= 1 && w <= 30));
    const now = weekOf(today());
    let streak = 0, w = weeks.has(now) ? now : now - 1;
    while (weeks.has(w)) { streak++; w--; }
    const last = dates.length ? dates.reduce((a, b) => (new Date(b) > new Date(a) ? b : a)) : null;
    // badges
    const earned = new Set();
    if (solved.length) earned.add("first-steps");
    if (stops.some((s) => s.kind === "ch" && s.ids.length && s.ids.every((id) => solved.includes(id) && log[id] && log[id].wrong === 0))) earned.add("zero-hints");
    COURSE.labs.forEach((l) => { const p = parse(k[`nmk-lab${l.no}-prelab`], null); if (p && p.score >= 7) { earned.add(`lab${l.no}-ready`); if (p.first) earned.add("first-try"); } });
    if (lab2Calibrated(k)) earned.add("calibrated");
    if (seen3.cardr && seen3.fobr && seen3.tagr) earned.add("card-reader");
    if (recs.some(here)) earned.add("checked-in");
    const labs = recs.filter((r) => r.k === "lab"), lects = recs.filter((r) => r.k === "lecture");
    if (labs.filter(here).length >= 2 && !labs.some((r) => r.s === "A")) earned.add("lab-regular");
    let run = 0, best = 0; lects.forEach((r) => { if (here(r)) best = Math.max(best, ++run); else if (r.s === "A") run = 0; });
    if (best >= 5) earned.add("lecture-regular");
    if (weekOf(today()) >= 8 && recs.length >= 5 && !recs.some((r) => r.s === "A")) earned.add("full-house");
    if (att && att.section === "thu" && labs.some(here)) earned.add("early-riser");
    if (streak >= 3) earned.add("on-a-roll");
    if (Object.keys(mis).length) earned.add("mission-1");
    if (Object.values(mis).some((r) => r && r.boss)) earned.add("boss-breaker");
    if (solved.length * 2 >= Object.keys(CATALOG).length) earned.add("halfway");
    return {
      xp, items, level: LEVELS[li][1], levelNo: li + 1, levelAt: LEVELS[li][0], nextAt: LEVELS[li + 1] ? LEVELS[li + 1][0] : null, nextLevel: LEVELS[li + 1] ? LEVELS[li + 1][1] : null,
      badges: BADGES.filter((b) => earned.has(b.id)), solved: solved.length, total: Object.keys(CATALOG).length,
      stops, weeks: [...weeks].sort((a, b) => a - b), streak, lastActive: last, nowWeek: now
    };
  }
  function localKeys() { const o = {}; try { Object.keys(localStorage).forEach((k) => { if (k.startsWith("nmk-")) o[k] = localStorage.getItem(k); }); } catch (e) { /* private mode */ } return o; }
  const local = () => compute(localKeys());
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } document.dispatchEvent(new CustomEvent("nmk:store", { detail: k })); }

  /* ---------- chapter quizzes: a correct answer to a question counts once ---------- */
  document.addEventListener("nmk:quiz", (e) => {
    const q = parse(localStorage.getItem("nmk-quiz-log"), {});
    if (!e.detail || !e.detail.key || q[e.detail.key]) return;
    q[e.detail.key] = new Date().toISOString();
    save("nmk-quiz-log", q);
    check();
  });

  /* ---------- toasts for a new badge or level ---------- */
  let toastBox = null;
  function toast(icon, title, text) {
    if (!toastBox) { toastBox = document.createElement("div"); toastBox.className = "gm-toasts"; toastBox.setAttribute("aria-live", "polite"); document.body.appendChild(toastBox); }
    const t = document.createElement("div");
    t.className = "gm-toast";
    t.innerHTML = `<span class="gm-ti" aria-hidden="true">${icon}</span><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;
    toastBox.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 5200);
  }
  let checkTimer = 0;
  function check() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      const g = local(), seen = parse(localStorage.getItem("nmk-game-seen"), null);
      const ids = g.badges.map((b) => b.id);
      if (seen && !isLecturer()) {
        g.badges.filter((b) => !seen.badges.includes(b.id)).forEach((b) => toast(b.icon, `Badge earned: ${b.name}`, b.desc));
        if (g.levelNo > (seen.level || 1)) toast("⭐", `Level up: ${g.level}`, `You now have ${g.xp} XP.`);
      }
      if (!seen || seen.level !== g.levelNo || ids.some((id) => !seen.badges.includes(id))) save("nmk-game-seen", { level: g.levelNo, badges: ids });
      paintJourney();
    }, 400);
  }
  document.addEventListener("nmk:exercise", check);
  document.addEventListener("nmk:store", (e) => { if (e.detail !== "nmk-game-seen") check(); });

  /* ---------- the journey map (home page) and the profile card (progress board page) ---------- */
  function xpBar(g) {
    const span = g.nextAt ? g.nextAt - g.levelAt : 1, into = g.nextAt ? g.xp - g.levelAt : 1;
    return `<div class="gm-level"><span class="gm-lv">Level ${g.levelNo}</span><strong>${g.level}</strong><span class="gm-xp">${g.xp} XP</span></div>
      <div class="gm-bar" role="img" aria-label="${g.nextAt ? `${g.nextAt - g.xp} XP to ${g.nextLevel}` : "Top level reached"}"><span style="width:${Math.min(100, Math.round((into / span) * 100))}%"></span></div>
      <p class="gm-next">${g.nextAt ? `${g.nextAt - g.xp} XP to <strong>${g.nextLevel}</strong>` : "You have reached the top level."}</p>`;
  }
  // o.other: someone else's journey (a classmate's profile): no "pick up where you left off" note
  function journeyHtml(g, o = {}) {
    const now = g.nowWeek, nextStop = o.other ? null : g.stops.find((s) => (s.kind === "ch" || s.built) && s.done < s.total);
    const days = g.lastActive ? Math.floor((today() - new Date(g.lastActive).getTime()) / DAY) : null;
    const nudge = !nextStop ? "" : days !== null && days >= 14
      ? `<div class="gm-nudge"><strong>No progress for ${Math.floor(days / 7)} weeks.</strong> Pick up where you left off: <a href="${esc(nextStop.href)}">${esc(nextStop.label)}: ${esc(nextStop.title)}</a>.</div>`
      : days === null && now >= 3 ? `<div class="gm-nudge"><strong>Your journey hasn't started yet.</strong> Begin with <a href="${esc(nextStop.href)}">${esc(nextStop.label)}: ${esc(nextStop.title)}</a>.</div>` : "";
    const stops = g.stops.map((s) => {
      const st = !s.total && s.kind === "lab" && !s.built ? "soon" : s.total && s.done === s.total ? "done" : s.done ? "going" : s.week > now ? "ahead" : "todo";
      const behind = st !== "done" && st !== "soon" && s.week < now;
      return `<li class="gm-stop ${st}${behind ? " behind" : ""}${s.week === now ? " now" : ""}"><a href="${esc(s.href)}">
          <span class="gm-dot" aria-hidden="true">${st === "done" ? "✓" : s.kind === "lab" ? "⚗" : s.no}</span>
          <span class="gm-wk">Week ${s.week}${s.week === now ? " · now" : ""}</span><strong>${esc(s.label)}</strong><span class="gm-tt">${esc(s.title)}</span>
          <span class="gm-pr">${st === "soon" ? "Virtual lab coming" : `${s.done} of ${s.total} done`}</span>
          ${s.total ? `<span class="gm-mini" aria-hidden="true"><i style="width:${s.pct}%"></i></span>` : ""}</a></li>`;
    }).join("");
    if (o.noHead) return `${nudge}<ol class="gm-path">${stops}</ol>`;
    return `${nudge}<div class="gm-head">${xpBar(g)}<div class="gm-badges">${g.badges.length ? g.badges.map((b) => `<span class="gm-b" title="${esc(b.desc)}"><span aria-hidden="true">${b.icon}</span>${esc(b.name)}</span>`).join("") : `<span class="gm-none">No badges yet: solve your first exercise to earn one.</span>`}</div>
        <p class="gm-meta">${g.solved} of ${g.total} exercises solved · ${g.streak ? `${g.streak}-week streak` : "no streak yet"}${o.other ? "" : ` · <a href="profile.html">My profile</a> · <a href="board.html">Progress board</a>`}</p></div>
      <ol class="gm-path">${stops}</ol>`;
  }
  function paintJourney() {
    const host = document.getElementById("journeyMap");
    if (!host) return;
    const sec = document.getElementById("journey"), h = sec && sec.querySelector("h2"), p = sec && sec.querySelector(".block-head p");
    if (h && !h.dataset.text) { h.dataset.text = h.textContent; if (p) p.dataset.text = p.textContent; }
    if (isLecturer() && !previewing()) {
      if (h) h.textContent = "Class at a Glance";
      if (p) p.textContent = "How your students are getting on this semester. Students see their own course journey here.";
      lecturerSummary(host);
      return;
    }
    if (h && h.dataset.text) { h.textContent = h.dataset.text; if (p) p.textContent = p.dataset.text; }
    host.innerHTML = (isLecturer() ? `<div class="gm-preview"><span>👁 Previewing the page as a student sees it (with the progress saved in this browser).</span><button type="button" class="btn ghost small" data-gm-preview="0">Back to the class summary</button></div>` : "") + journeyHtml(local());
  }
  // the lecturer's summary: students signed in, active, stalled, and what is waiting on the attendance page
  let lecBusy = false;
  async function lecturerSummary(host) {
    const A = window.NMKAccount;
    if (!A || !A.db || !A.state || !A.state.user) { host.innerHTML = `<p class="small-note">Loading the class summary…</p>`; return; }
    if (lecBusy) return;
    lecBusy = true;
    const db = A.db, get = (q) => q.get().catch(() => ({ docs: [] }));
    try {
      const [users, board, swaps, notices] = await Promise.all([get(db.collection("users")), get(db.collection("board").where("semester", "==", SEM)),
        get(db.collection("swaps").where("semester", "==", SEM).where("status", "==", "accepted")), get(db.collection("notices").where("semester", "==", SEM).where("status", "==", "pending"))]);
      const studs = users.docs.map((d) => d.data()).filter((u) => u.role !== "lecturer");
      const approved = studs.filter((u) => u.status === "approved").length, pending = studs.filter((u) => u.status === "pending").length;
      const b = board.docs.map((d) => d.data()).filter((x) => x.role !== "lecturer"), now = today();
      const days = (x) => (x.lastActive ? (now - new Date(x.lastActive).getTime()) / DAY : Infinity);
      const active = b.filter((x) => days(x) <= 7).length, stalled = Math.max(0, approved - b.filter((x) => days(x) < 14).length);
      const avg = b.length ? Math.round(b.reduce((a, x) => a + (x.xp || 0), 0) / b.length) : 0;
      const tile = (n, t, href, warn) => `<a class="gm-tile${warn ? " warn" : ""}" href="${href}"><strong>${n}</strong><span>${t}</span></a>`;
      host.innerHTML = `<div class="gm-tiles">${tile(approved, "students signed in", "admin.html")}${tile(pending, "waiting for approval", "admin.html", pending)}${tile(active, "active in the last 7 days", "admin.html")}
          ${tile(stalled, "no progress for 2+ weeks", "admin.html", stalled)}${tile(avg, "average XP", "board.html")}${tile(swaps.docs.length, "lab swaps to approve", "attendance.html", swaps.docs.length)}${tile(notices.docs.length, "absence notices to check", "attendance.html", notices.docs.length)}</div>
        <div class="gm-lecbar"><a class="btn" href="admin.html">Lecturer dashboard</a><a class="btn ghost" href="attendance.html">Attendance</a><a class="btn ghost" href="board.html">Progress board</a>
          <button type="button" class="btn ghost" data-gm-preview="1">Preview as a student</button></div>`;
    } finally { lecBusy = false; }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gm-preview]");
    if (!b) return;
    try { if (b.dataset.gmPreview === "1") localStorage.setItem("nmk-preview", "1"); else localStorage.removeItem("nmk-preview"); } catch (err) { /* private mode */ }
    paintJourney();
  });

  /* ---------- profiles: the activity feed, and a public summary that rebuilds the journey for classmates ---------- */
  // the most recent things done (dated XP items, plus each level reached), newest first
  function feed(g, n = 20) {
    const dated = g.items.filter((i) => i.when).sort((a, b) => new Date(a.when) - new Date(b.when));
    const out = [];
    let sum = 0, lv = 0;
    dated.forEach((i) => {
      sum += i.xp; out.push({ w: i.what, t: i.when, x: i.xp });
      LEVELS.forEach(([at, name], k) => { if (k > lv && sum >= at) { lv = k; out.push({ w: `Reached Level ${k + 1}: ${name}`, t: i.when, x: 0, lv: 1 }); } });
    });
    return out.reverse().slice(0, n);
  }
  const summaryProg = (g) => Object.fromEntries(g.stops.map((s) => [s.key, [s.done, s.total]]));
  // a classmate's progress from their public summary (board/{uid}): enough for the badges and the journey map
  function fromSummary(b) {
    b = b || {};
    const xp = b.xp || 0;
    let li = 0; LEVELS.forEach(([t], i) => { if (xp >= t) li = i; });
    const prog = b.prog || {};
    const stops = STOPS.map((s) => { const [done, total] = prog[s.key] || [0, s.ids.length + (s.kind === "lab" && s.built ? 1 : 0)]; return Object.assign({}, s, { done, total, pct: total ? Math.round((done / total) * 100) : 0 }); });
    return { xp, items: [], level: LEVELS[li][1], levelNo: li + 1, levelAt: LEVELS[li][0], nextAt: LEVELS[li + 1] ? LEVELS[li + 1][0] : null, nextLevel: LEVELS[li + 1] ? LEVELS[li + 1][1] : null,
      badges: BADGES.filter((x) => (b.badges || []).includes(x.id)), solved: b.solved || 0, total: Object.keys(CATALOG).length, stops, weeks: [], streak: b.streak || 0, lastActive: b.lastActive || null, nowWeek: weekOf(today()) };
  }

  window.NMKGame = { SEM, CATALOG, STOPS, BADGES, LEVELS, compute, local, localKeys, xpBar, journeyHtml, weekOf, today, feed, summaryProg, fromSummary, isLecturer, paint: paintJourney };
  paintJourney();
  check();
})();
