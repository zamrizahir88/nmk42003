/* NMK42003 course survey (survey.html): a short questionnaire in up to three rounds (start, middle and end of the
   semester), opened and closed by a lecturer. Since 22 Nov 2026 several rounds can be open at once (lecturer's choice):
   Firestore meta/survey.rounds = ["pre", "mid", …] (meta/survey.open = the first one, for older readers). Students see one
   card per open round (Start first) with what to think about in each (Start: how they felt in week 1).
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
  // the rounds open now, in order (meta/survey.rounds; an older single meta/survey.open still works)
  const openRounds = (m) => { m = m || {}; const list = Array.isArray(m.rounds) ? m.rounds : m.open ? [m.open] : []; return Object.keys(ROUNDS).filter((k) => list.indexOf(k) >= 0); };
  // what to think about in each round, shown at the top of its form
  const THINK = {
    pre: "Think back to the <strong>beginning of the semester (week 1)</strong>, before the lessons started. Answer the way you felt <strong>then</strong>: how confident you were and how you studied.",
    mid: "Answer the way you feel <strong>now</strong>, in the middle of the semester (around week 7).",
    post: "Answer the way you feel <strong>now</strong>, at the end of the semester."
  };
  // answers saved with the current wording carry a.v = 2; Start answers saved before 22 Nov 2026 (no "think back" note) don't
  const FORM_V = 2;
  window.NMKSurvey = { ROUNDS, CO_TEXT, ENG, FEAT, SUS, OPEN, COS, later, susScore, semKey, openRounds, THINK };

  const host = document.getElementById("survey");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!window.NMKAccount) { host.innerHTML = `<div class="callout warn"><strong>The survey could not load</strong>Check your internet connection and reload the page.</div>`; return; }
  const A = window.NMKAccount, db = A.db, FV = firebase.firestore.FieldValue;
  let meta = null, mine = {}, counts = null, msg = "", view = null, justDone = null, back = null;

  /* ---------- the form ---------- */
  const scale = (name, val, lo, hi, opt) => `<div class="sv-scale" role="radiogroup" aria-label="${esc(lo)} to ${esc(hi)}">
      ${opt ? `<label class="sv-na"><input type="radio" name="${name}" value="0"${val === 0 ? " checked" : ""}><span>Didn't use</span></label>` : ""}
      ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${name}" value="${n}"${val === n ? " checked" : ""}><span>${n}</span></label>`).join("")}
    </div><div class="sv-ends" aria-hidden="true"><span>1 ${esc(lo)}</span><span>5 ${esc(hi)}</span></div>`;
  const item = (name, text, val, lo = "Strongly disagree", hi = "Strongly agree", opt) => `<fieldset class="sv-item" data-name="${name}"><legend>${text}</legend>${scale(name, val, lo, hi, opt)}</fieldset>`;
  // "before this course" is asked in the Middle and End rounds, except while the Start round is open too (the Start round is the before)
  const askBefore = (round) => later(round) && openRounds(meta).indexOf("pre") < 0;
  function form(round, a, readOnly, cur) {
    a = a || {};
    const v = (k) => (a[k] == null ? null : +a[k]), before = readOnly ? later(round) : askBefore(round);
    const coBlock = COS.map((co) => `<fieldset class="sv-item sv-co" data-name="n_${co}"><legend><span class="ex-co">${co}</span> ${esc(CO_TEXT[co])}</legend>
        ${before ? `<p class="sv-sub">Before this course</p>${scale(`b_${co}`, v(`b_${co}`), "Not at all confident", "Very confident")}<p class="sv-sub">Now</p>` : ""}
        ${scale(`n_${co}`, v(`n_${co}`), "Not at all confident", "Very confident")}</fieldset>`).join("");
    return `<form class="sv-form" novalidate${readOnly ? " inert" : ""}>
      <h2 class="h3">Part A: How Confident Are You?</h2><p class="small-note">For each course outcome, choose 1 (not at all confident) to 5 (very confident).${before ? " Rate how you felt before this course, and how you feel now." : round === "pre" ? " Choose how confident you were at the start of the semester." : ""}</p>
      ${coBlock}
      <h2 class="h3">Part B: How You Learn in This Course</h2>
      ${ENG.map(([k, t]) => item(k, esc(t), v(k))).join("")}
      ${later(round) ? `<h2 class="h3">Part C: How Useful Was Each Part of the Website?</h2><p class="small-note">1 not useful, 5 very useful. Choose "Didn't use" if you haven't used it.</p>
        ${FEAT.map(([k, t]) => item(`f_${k}`, esc(t), v(`f_${k}`), "Not useful", "Very useful", true)).join("")}
        <h2 class="h3">Part D: Using the Website</h2><p class="small-note">The System Usability Scale: ten standard statements, each from 1 (strongly disagree) to 5 (strongly agree).</p>
        ${SUS.map((t, i) => item(`s${i + 1}`, esc(t), v(`s${i + 1}`))).join("")}` : ""}
      <h2 class="h3">${later(round) ? "Part E" : "Part C"}: In Your Own Words (Optional)</h2>
      ${(later(round) ? OPEN.later : OPEN.pre).map(([k, t]) => `<label class="sv-open"><span>${esc(t)}</span><textarea name="${k}" rows="3" maxlength="1000">${esc(a[k] || "")}</textarea></label>`).join("")}
      <label class="sv-consent"><input type="checkbox" name="consent"${cur && cur.consent ? " checked" : ""}> <span>I agree that my answers, <strong>without my name</strong>, may be used to report on and improve the teaching of this course (for example in a teaching award or a paper). If you leave this unticked, only your lecturer reads your answers.</span></label>
      <p class="sv-err" aria-live="polite"></p>
      ${readOnly ? "" : `<div class="sv-row"><button type="submit" class="btn">${cur ? "Save my changes" : "Send my answers"}</button><button type="button" class="btn ghost" data-svback>‹ Back to all surveys</button></div>`}
    </form>`;
  }
  const names = (round) => COS.flatMap((c) => (askBefore(round) ? [`b_${c}`, `n_${c}`] : [`n_${c}`])).concat(ENG.map(([k]) => k), later(round) ? FEAT.map(([k]) => `f_${k}`).concat(SUS.map((_, i) => `s${i + 1}`)) : []);

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
      } else {
        mine = {};
        await Promise.all(openRounds(meta).map(async (r) => { const d = await db.collection("survey").doc(docId(r, u.uid)).get(); mine[r] = d.exists ? d.data() : null; }));
      }
    } catch (e) { host.innerHTML = `<div class="callout warn"><strong>Could not load the survey</strong>${esc(e.code || e)}. If this says permission-denied, the latest Firestore rules have not been published yet.</div>`; return; }
    draw(st);
  }
  const ABOUT = `<div class="sv-about"><strong>About these surveys</strong><p>These short surveys help your lecturers improve NMK42003 Instrumentation and the course website. There are no right or wrong answers and <strong>nothing counts towards your grade</strong>. Please answer honestly. Your answers are used only if you tick the consent box at the end, and reports never show names.</p></div>`;
  const MIN = (r) => (later(r) ? 8 : 3);
  const recheck = (r) => r === "pre" && mine[r] && !(mine[r].a && +mine[r].a.v === FORM_V);   // a Start answer from before the "think back" note
  function draw(st) {
    const u = st.user;
    if (A.isAdmin(u.email)) return lecturer();
    const p = st.profile, listed = st.roster && st.roster.status === "active";
    if (!listed && !(p && p.status === "approved")) { host.innerHTML = `<div class="callout info"><strong>For students of NMK42003</strong>The survey opens for students on the class list. If you are in the class, wait until your account is approved.</div>`; return; }
    const open = openRounds(meta);
    if (!open.length) { host.innerHTML = `${ABOUT}<div class="callout info"><strong>No survey is open right now</strong>Your lecturer opens a short survey at the start, in the middle and at the end of the semester. You will see it in your notifications.</div>`; return; }
    if (view && open.indexOf(view) < 0) view = null;
    return view ? drawForm(view, u) : drawList(open);
  }
  function drawList(open) {
    const done = open.filter((r) => mine[r]).length, next = open.find((r) => !mine[r]);
    host.innerHTML = `${ABOUT}
      <div class="sv-count"><span class="sv-cn">📋 ${open.length === 1 ? "1 survey is" : `${open.length} surveys are`} open for you</span><span class="sv-cd">${done} of ${open.length} done</span></div>
      ${justDone ? `<p class="sv-done">✓ Thank you, your ${esc(ROUNDS[justDone])} answers are saved.${next ? ` Next: <strong>${esc(ROUNDS[next])}</strong>.` : ""}</p>` : ""}
      ${done === open.length ? `<p class="sv-alldone">🎉 Thank you! You have answered every open survey. You can still change your answers until the surveys close.</p>` : ""}
      <div class="sv-cards">${open.map((r, k) => {
        const m = mine[r], warn = recheck(r);
        return `<article class="sv-card${m ? " done" : ""}${!m && r === next ? " next" : ""}">
          <div class="sv-ch"><span class="sv-no">${k + 1}</span><div><h2 class="h3">${esc(ROUNDS[r])}</h2><small>About ${MIN(r)} minutes</small></div>
            <span class="sv-st ${m ? "ok" : "todo"}">${m ? "✓ Done" : "To do"}</span></div>
          <p class="sv-think">${THINK[r]}</p>
          ${warn ? `<p class="sv-recheck">⚠ You answered this before these instructions were added. Please check that your answers show how you felt at the <strong>start</strong> of the semester (week 1), and change them if needed.</p>` : ""}
          <button type="button" class="btn${m ? " ghost" : ""}" data-svopen="${r}">${m ? (warn ? "Check my answers" : "Review or change my answers") : "Start this survey"}</button></article>`;
      }).join("")}</div>`;
  }
  function drawForm(r, u) {
    const m = mine[r];
    host.innerHTML = `<p><button type="button" class="btn ghost small" data-svback>‹ All surveys</button></p>
      <div class="sv-intro"><span class="sv-round">${esc(ROUNDS[r])}</span><p class="sv-think big">${THINK[r]}</p><p>About ${MIN(r)} minutes. There are no right or wrong answers, and nothing here counts towards your grade.</p>
        ${recheck(r) ? `<p class="sv-recheck">⚠ You answered this before these instructions were added. Please check that each answer shows how you felt at the <strong>start</strong> of the semester (week 1), then press Save my changes.</p>`
          : m ? `<p class="sv-done">✓ Your answers are saved. You can change them until the survey closes.</p>` : ""}</div>${form(r, m && m.a, false, m)}`;
    wire(r, u);
  }
  // the form opens as a step: the phone's Back button returns to the list
  function openForm(r) {
    view = r; justDone = null; draw(A.state); window.scrollTo({ top: 0 });
    if (window.NMKBack && !back) back = NMKBack.layer(() => { back = null; view = null; draw(A.state); window.scrollTo({ top: 0 }); });
  }
  function toList(done) {
    view = null; justDone = done || null;
    if (back) { const b = back; back = null; b.closed(); }
    draw(A.state); window.scrollTo({ top: 0 });
  }
  host.addEventListener("click", (e) => {
    const o = e.target.closest("[data-svopen]"); if (o) { openForm(o.dataset.svopen); return; }
    if (e.target.closest("[data-svback]")) toList();
  });
  function wire(round, u) {
    const f = host.querySelector(".sv-form"), err = f.querySelector(".sv-err");
    f.addEventListener("change", (e) => { const fs = e.target.closest(".sv-item"); if (fs) fs.classList.remove("miss"); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = { v: FORM_V }, miss = [];
      names(round).forEach((n) => { const r = f.querySelector(`input[name="${n}"]:checked`); if (r) a[n] = +r.value; else miss.push(n); });
      f.querySelectorAll(".sv-item").forEach((fs) => fs.classList.toggle("miss", [...fs.querySelectorAll("input[type=radio]")].some((i) => miss.includes(i.name))));
      if (miss.length) { err.textContent = `Please answer every question with a number (${miss.length} still empty, marked in amber).`; const first = f.querySelector(".sv-item.miss"); if (first) first.scrollIntoView({ block: "center" }); return; }
      f.querySelectorAll("textarea").forEach((t) => { if (t.value.trim()) a[t.name] = t.value.trim().slice(0, 1000); });
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; err.textContent = "Saving…";
      try {
        const rec = { semKey: semKey(), semester: A.SEM, round, uid: u.uid, consent: f.querySelector("[name=consent]").checked, a, at: FV.serverTimestamp() };
        await db.collection("survey").doc(docId(round, u.uid)).set(rec);
        mine[round] = rec; toList(round);
        if (A.refreshBell) A.refreshBell();
      } catch (ex) { btn.disabled = false; err.textContent = `Could not save (${ex.code || ex}). ${ex.code === "permission-denied" ? "The survey may have just closed." : "Please try again."}`; }
    });
  }

  /* ---------- lecturers: open and close a round, and see how many answered ---------- */
  function lecturer() {
    const c = counts || {};
    host.innerHTML = `<div class="sv-lec">
        <h2 class="h3">Open Rounds</h2>
        <p class="small-note">Tick every round students should answer now (untick all to close the survey). Students on the class list see one card per open round, Start first, in their notifications and the My Class menu. Each student answers once per round and can change the answers until you close it. While the Start round is open, the Middle and End rounds leave out "before this course" (the Start round is the before).</p>
        <div class="sv-rounds" role="group" aria-label="Open survey rounds">
          ${Object.entries(ROUNDS).map(([k, t]) => { const on = openRounds(meta).indexOf(k) >= 0;
            return `<label class="sv-rd${on ? " on" : ""}"><input type="checkbox" name="svopen" value="${k}"${on ? " checked" : ""}> <span><strong>${esc(t)}</strong><small>${c[k] ? `${c[k].n} answered · ${c[k].c} agreed to reports` : "no answers yet"}${on ? " · open now" : ""}</small></span></label>`; }).join("")}
        </div>
        <p class="sv-msg small-note" aria-live="polite">${esc(msg)}</p>
        <p><a class="btn" href="evidence.html#survey">See the results on Teaching Evidence ›</a></p>
        <details class="sv-preview"><summary>Preview the questions</summary>
          ${Object.keys(ROUNDS).map((r) => `<h3 class="bd-h">${esc(ROUNDS[r])}</h3>${form(r, {}, true)}`).join("")}</details></div>`;
    host.querySelectorAll("[name=svopen]").forEach((r) => r.addEventListener("change", async () => {
      const list = [...host.querySelectorAll("[name=svopen]:checked")].map((x) => x.value);
      try {
        await db.collection("meta").doc("survey").set({ rounds: list, open: list[0] || "", updatedAt: FV.serverTimestamp(), by: A.state.user.email.toLowerCase() }, { merge: true });
        meta.rounds = list; meta.open = list[0] || ""; msg = list.length ? `Open to students now: ${list.map((k) => ROUNDS[k]).join(" and ")}.` : "The survey is closed."; lecturer();
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
