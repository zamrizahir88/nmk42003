/* NMK42003 course survey (survey.html): a short questionnaire in up to three rounds (start, middle and end of the
   semester), opened and closed by a lecturer (Firestore meta/survey.open = "pre" | "mid" | "post" | "").
   Students on the class list answer once per round and may change their answers while the round is open
   (survey/{semKey}_{round}_{uid}). Taking part is voluntary and has no marks; only answers with the consent box ticked
   are used in reports (the lecturer's Teaching Evidence page, evidence.js, reads the same item list from NMKSurvey).
   Items: confidence in each course outcome (now, and from the middle round on also "before this course"), engagement,
   how useful each part of the site was, the System Usability Scale (Brooke, 1996) and two open questions. */
(function () {
  "use strict";
  const ROUNDS = { pre: "Start of semester", mid: "Middle of semester", post: "End of semester" };
  const CO_TEXT = {
    CO1: "I can analyse electronic instrumentation: sensors, actuators, embedded controllers and data acquisition.",
    CO2: "I can design wired and wireless sensor networks and internet or cloud data storage.",
    CO3: "I can use the lab tools (the ESP32, sensors and software) to build and test an instrumentation design accurately."
  };
  const ENG = [
    ["e1", "I keep up with this course every week."],
    ["e2", "I try to work a problem out myself before I look at the answer or ask for help."],
    ["e3", "I practise this course outside class time."],
    ["e4", "I enjoy learning this course."],
    ["e5", "I feel part of the class."],
    ["e6", "I know what I need to do each week."]
  ];
  const FEAT = [
    ["ch", "Interactive chapters (live circuit diagrams, calculators and step-by-step working)"],
    ["ex", "Try-first exercises (hints after a wrong try, working after a correct answer)"],
    ["lab", "Virtual labs and the Pre-Lab Check"],
    ["game", "INSTRUMENTA: Legends (the game)"],
    ["ai", "Ask Dr. Zamri (the AI study helper)"],
    ["xp", "XP, levels, badges and the Class Board"],
    ["att", "Attendance, absence notices and lab swaps on the site"],
    ["kalam", "Kalam Feed"],
    ["proj", "The Mini Project page (group, proposal, logbook, peer evaluation)"]
  ];
  const SUS = [
    "I think that I would like to use this website frequently.",
    "I found the website unnecessarily complex.",
    "I thought the website was easy to use.",
    "I think that I would need the support of a technical person to be able to use this website.",
    "I found the various functions in this website were well integrated.",
    "I thought there was too much inconsistency in this website.",
    "I would imagine that most people would learn to use this website very quickly.",
    "I found the website very cumbersome to use.",
    "I felt very confident using the website.",
    "I needed to learn a lot of things before I could get going with this website."
  ];
  const OPEN = { pre: [["o0", "What do you expect to find hardest in this course?"]],
    later: [["o1", "What helped your learning most on this website?"], ["o2", "What should be improved?"]] };
  const later = (r) => r === "mid" || r === "post";
  const COS = (typeof COURSE !== "undefined" && COURSE.outcomes ? COURSE.outcomes.map((o) => o.id) : Object.keys(CO_TEXT)).filter((c) => CO_TEXT[c]);
  // the SUS score of one set of answers (0 to 100), or null when an item is missing
  function susScore(a) {
    let s = 0;
    for (let i = 1; i <= 10; i++) { const x = +((a || {})[`s${i}`]); if (!(x >= 1 && x <= 5)) return null; s += i % 2 ? x - 1 : 5 - x; }
    return s * 2.5;
  }
  const semKey = () => String((typeof COURSE !== "undefined" && (COURSE.semesterId || COURSE.session)) || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  window.NMKSurvey = { ROUNDS, CO_TEXT, ENG, FEAT, SUS, OPEN, COS, later, susScore, semKey };

  const host = document.getElementById("survey");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!window.NMKAccount) { host.innerHTML = `<div class="callout warn"><strong>The survey could not load</strong>Check your internet connection and reload the page.</div>`; return; }
  const A = window.NMKAccount, db = A.db, FV = firebase.firestore.FieldValue;
  let meta = null, mine = null, counts = null, msg = "";

  /* ---------- the form ---------- */
  const scale = (name, val, lo, hi, opt) => `<div class="sv-scale" role="radiogroup" aria-label="${esc(lo)} to ${esc(hi)}">
      ${opt ? `<label class="sv-na"><input type="radio" name="${name}" value="0"${val === 0 ? " checked" : ""}><span>Didn't use</span></label>` : ""}
      ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${name}" value="${n}"${val === n ? " checked" : ""}><span>${n}</span></label>`).join("")}
    </div><div class="sv-ends" aria-hidden="true"><span>1 ${esc(lo)}</span><span>5 ${esc(hi)}</span></div>`;
  const item = (name, text, val, lo = "Strongly disagree", hi = "Strongly agree", opt) => `<fieldset class="sv-item" data-name="${name}"><legend>${text}</legend>${scale(name, val, lo, hi, opt)}</fieldset>`;
  function form(round, a, readOnly) {
    a = a || {};
    const v = (k) => (a[k] == null ? null : +a[k]);
    const coBlock = COS.map((co) => `<fieldset class="sv-item sv-co" data-name="n_${co}"><legend><span class="ex-co">${co}</span> ${esc(CO_TEXT[co])}</legend>
        ${later(round) ? `<p class="sv-sub">Before this course</p>${scale(`b_${co}`, v(`b_${co}`), "Not at all confident", "Very confident")}<p class="sv-sub">Now</p>` : ""}
        ${scale(`n_${co}`, v(`n_${co}`), "Not at all confident", "Very confident")}</fieldset>`).join("");
    return `<form class="sv-form" novalidate${readOnly ? " inert" : ""}>
      <h2 class="h3">Part A: How Confident Are You?</h2><p class="small-note">For each course outcome, choose 1 (not at all confident) to 5 (very confident).${later(round) ? " Rate how you felt before this course, and how you feel now." : ""}</p>
      ${coBlock}
      <h2 class="h3">Part B: How You Learn in This Course</h2>
      ${ENG.map(([k, t]) => item(k, esc(t), v(k))).join("")}
      ${later(round) ? `<h2 class="h3">Part C: How Useful Was Each Part of the Website?</h2><p class="small-note">1 not useful, 5 very useful. Choose "Didn't use" if you haven't used it.</p>
        ${FEAT.map(([k, t]) => item(`f_${k}`, esc(t), v(`f_${k}`), "Not useful", "Very useful", true)).join("")}
        <h2 class="h3">Part D: Using the Website</h2><p class="small-note">The System Usability Scale: ten standard statements, each from 1 (strongly disagree) to 5 (strongly agree).</p>
        ${SUS.map((t, i) => item(`s${i + 1}`, esc(t), v(`s${i + 1}`))).join("")}` : ""}
      <h2 class="h3">${later(round) ? "Part E" : "Part C"}: In Your Own Words (Optional)</h2>
      ${(later(round) ? OPEN.later : OPEN.pre).map(([k, t]) => `<label class="sv-open"><span>${esc(t)}</span><textarea name="${k}" rows="3" maxlength="1000">${esc(a[k] || "")}</textarea></label>`).join("")}
      <label class="sv-consent"><input type="checkbox" name="consent"${mine && mine.consent ? " checked" : ""}> <span>I agree that my answers, <strong>without my name</strong>, may be used to report on and improve the teaching of this course (for example in a teaching award or a paper). If you leave this unticked, only your lecturer reads your answers.</span></label>
      <p class="sv-err" aria-live="polite"></p>
      ${readOnly ? "" : `<div class="sv-row"><button type="submit" class="btn">${mine ? "Save my changes" : "Send my answers"}</button></div>`}
    </form>`;
  }
  const names = (round) => COS.flatMap((c) => (later(round) ? [`b_${c}`, `n_${c}`] : [`n_${c}`])).concat(ENG.map(([k]) => k), later(round) ? FEAT.map(([k]) => `f_${k}`).concat(SUS.map((_, i) => `s${i + 1}`)) : []);

  /* ---------- the page ---------- */
  const docId = (round, uid) => `${semKey()}_${round}_${uid}`;
  async function load(st) {
    const u = st.user;
    try {
      const m = await db.collection("meta").doc("survey").get();
      meta = m.exists ? m.data() : { open: "" };
      if (A.isAdmin(u.email)) {
        const q = await db.collection("survey").where("semKey", "==", semKey()).get();
        counts = {}; q.docs.forEach((d) => { const x = d.data(); counts[x.round] = counts[x.round] || { n: 0, c: 0 }; counts[x.round].n++; if (x.consent) counts[x.round].c++; });
      } else if (meta.open) {
        const d = await db.collection("survey").doc(docId(meta.open, u.uid)).get();
        mine = d.exists ? d.data() : null;
      }
    } catch (e) { host.innerHTML = `<div class="callout warn"><strong>Could not load the survey</strong>${esc(e.code || e)}. If this says permission-denied, the latest Firestore rules have not been published yet.</div>`; return; }
    draw(st);
  }
  function draw(st) {
    const u = st.user;
    if (A.isAdmin(u.email)) return lecturer();
    const p = st.profile, listed = st.roster && st.roster.status === "active";
    if (!listed && !(p && p.status === "approved")) { host.innerHTML = `<div class="callout info"><strong>For students of NMK42003</strong>The survey opens for students on the class list. If you are in the class, wait until your account is approved.</div>`; return; }
    if (!meta.open) { host.innerHTML = `<div class="callout info"><strong>No survey is open right now</strong>Your lecturer opens a short survey at the start, in the middle and at the end of the semester. You will see it in your notifications.</div>`; return; }
    host.innerHTML = `<div class="sv-intro"><span class="sv-round">${esc(ROUNDS[meta.open])}</span><p>About ${later(meta.open) ? "8" : "3"} minutes. There are no right or wrong answers, and nothing here counts towards your grade. Please answer honestly: it helps make the course better.</p>
        ${mine ? `<p class="sv-done">✓ Thank you, your answers are saved. You can change them until the survey closes.</p>` : ""}</div>${form(meta.open, mine && mine.a)}`;
    wire(meta.open, u);
  }
  function wire(round, u) {
    const f = host.querySelector(".sv-form"), err = f.querySelector(".sv-err");
    f.addEventListener("change", (e) => { const fs = e.target.closest(".sv-item"); if (fs) fs.classList.remove("miss"); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = {}, miss = [];
      names(round).forEach((n) => { const r = f.querySelector(`input[name="${n}"]:checked`); if (r) a[n] = +r.value; else miss.push(n); });
      f.querySelectorAll(".sv-item").forEach((fs) => fs.classList.toggle("miss", [...fs.querySelectorAll("input[type=radio]")].some((i) => miss.includes(i.name))));
      if (miss.length) { err.textContent = `Please answer every question with a number (${miss.length} still empty, marked in amber).`; const first = f.querySelector(".sv-item.miss"); if (first) first.scrollIntoView({ block: "center" }); return; }
      f.querySelectorAll("textarea").forEach((t) => { if (t.value.trim()) a[t.name] = t.value.trim().slice(0, 1000); });
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; err.textContent = "Saving…";
      try {
        const rec = { semKey: semKey(), semester: A.SEM, round, uid: u.uid, consent: f.querySelector("[name=consent]").checked, a, at: FV.serverTimestamp() };
        await db.collection("survey").doc(docId(round, u.uid)).set(rec);
        mine = rec; draw(A.state); window.scrollTo({ top: 0 });
        if (A.refreshBell) A.refreshBell();
      } catch (ex) { btn.disabled = false; err.textContent = `Could not save (${ex.code || ex}). ${ex.code === "permission-denied" ? "The survey may have just closed." : "Please try again."}`; }
    });
  }

  /* ---------- lecturers: open and close a round, and see how many answered ---------- */
  function lecturer() {
    const c = counts || {};
    host.innerHTML = `<div class="sv-lec">
        <h2 class="h3">Open a Round</h2>
        <p class="small-note">Students on the class list see the open round in their notifications and in the My Class menu. Each student answers once per round and can change the answers until you close it.</p>
        <div class="sv-rounds" role="radiogroup" aria-label="Survey round">
          ${[["", "Closed"]].concat(Object.entries(ROUNDS)).map(([k, t]) => `<label class="sv-rd${meta.open === k ? " on" : ""}"><input type="radio" name="svopen" value="${k}"${meta.open === k ? " checked" : ""}> <span><strong>${esc(t)}</strong>${k ? `<small>${c[k] ? `${c[k].n} answered · ${c[k].c} agreed to reports` : "no answers yet"}</small>` : ""}</span></label>`).join("")}
        </div>
        <p class="sv-msg small-note" aria-live="polite">${esc(msg)}</p>
        <p><a class="btn" href="evidence.html#survey">See the results on Teaching Evidence ›</a></p>
        <details class="sv-preview"><summary>Preview the questions</summary>
          ${Object.keys(ROUNDS).map((r) => `<h3 class="bd-h">${esc(ROUNDS[r])}</h3>${form(r, {}, true)}`).join("")}</details></div>`;
    host.querySelectorAll("[name=svopen]").forEach((r) => r.addEventListener("change", async () => {
      const v = r.value;
      try {
        await db.collection("meta").doc("survey").set({ open: v, updatedAt: FV.serverTimestamp(), by: A.state.user.email.toLowerCase() }, { merge: true });
        meta.open = v; msg = v ? `${ROUNDS[v]} is open to students.` : "The survey is closed."; lecturer();
      } catch (e) { msg = `Could not save (${e.code || e}). If this says permission-denied, publish the latest firebase/firestore.rules.`; lecturer(); }
    }));
  }

  A.on((st) => {
    if (!st.user) {
      host.innerHTML = `<div class="adm-gate"><p>Sign in with your UniMAP student account to answer the course survey.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`;
      host.querySelector("[data-signin]").onclick = () => A.signIn();
      return;
    }
    if (!st.profile && !A.isAdmin(st.user.email)) { host.innerHTML = `<p class="small-note">Loading…</p>`; return; }
    load(st);
  });
})();
