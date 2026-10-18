/* NMK42003 lab marks: the Lab Marks tab of the lecturer attendance page (attendance.js calls NMKLabMarks.draw).
   Lecturers only: students never see these marks (Firestore labmarks/{semester}_{email}; the rules allow lecturers only).
   Each lab has a demonstration (psychomotor) scored 0-50 on the rubric and an individual report (Introduction /10,
   Results and Discussion /30, Conclusion /10 = /50); each part converts to marks: score / 50 x weight. Lab 5 is
   assessed by another lecturer, so only its total is keyed in. The weights live in Firestore meta/labmarks and can be
   changed on the tab (this semester: Lab 4 is 1 + 1). Marks save as you type; Download CSV follows the column order
   of the lecturer's "Lab Assessment" Google Sheet. */
(function () {
  "use strict";
  const DEFAULT_W = { 1: { d: 2, r: 3 }, 2: { d: 2, r: 3 }, 3: { d: 2, r: 2 }, 4: { d: 1, r: 1 }, 5: { t: 4 } };
  const LAB_NAME = { 1: "Introduction (Software & Hardware)", 2: "Transduction and Conversion Calibration", 3: "Smart Sensors", 4: "Local Data Acquisition (DAQ)", 5: "Cloud Storage and IoT Instrumentation" };
  const BANDS = [[0, 0], [1, 10], [11, 20], [21, 30], [31, 40], [41, 50]], BANDS4 = [[0, 0], [1, 20], [21, 30], [31, 40], [41, 50]];
  // the demonstration rubric (Part 1), one line per band
  const DEMO = {
    1: ["P3, guided response: follow and rebuild the block-programming steps shown in the lab.",
      "No attempt, or completely off-task.", "Fails to follow and replicate most programming steps within the time.", "Struggles to follow and replicate the steps accurately within the time.",
      "Follows some steps, with noticeable errors; may slightly exceed the time.", "Follows most steps with minimal errors within the time.", "Follows and replicates all the steps perfectly within the time."],
    2: ["P4, mechanism: build the circuit, calibrate the analog sensor with the calibration equation, and show the correct angle in the Serial Monitor.",
      "No attempt, or completely off-task.", "Fails to build the circuit; can't calibrate the sensor or show the correct angle.", "Struggles to build the circuit (significant deviations); calibration difficult; angle shown with some errors.",
      "Circuit built with noticeable errors needing corrections; calibrates with noticeable errors but shows the angle with reasonable accuracy.", "Circuit built with minor errors; calibrates with minor errors and shows the angle with precision.", "Circuit built precisely to the schematic; calibrates accurately and shows the correct angle with precision."],
    3: ["P4, mechanism: read an RFID card/tag UID with an NFC phone, interface the ESP32 to the RC522 and show the UID on the LCD.",
      "No attempt, or completely off-task.", "Fails with the NFC phone and the UID; struggles to interface the RC522; no UID on the LCD.", "Significant issues getting the UID; RC522 interfaced with substantial deviations; UID on the LCD with some errors.",
      "Noticeable difficulty getting the UID (needs corrections); RC522 with some errors, but the UID shows on the LCD.", "Gets the UID with minor issues; RC522 with minor errors; UID on the LCD with reasonable accuracy.", "Gets the UID accurately; RC522 interfaced flawlessly; UID on the LCD with precision."],
    4: ["P4, mechanism: set up the angle sensor with the ESP32, read the data and store it in Excel with Data Streamer.",
      "No attempt to acquire or store the sensor data in Excel.", "Minimal progress: fails to connect the sensor, set up Excel or record the data.", "Partly done: sensor connected, but significant errors in acquisition or the Excel setup.",
      "Sensor connected and data recorded in Excel, with minor issues in configuration or accuracy.", "Flawless: sensor connected, Excel set up, data acquired and stored without errors."],
    5: ["Assessed by the Lab 5 lecturer: key in the total only."]
  };
  const REPORT = [
    { k: "i", label: "Introduction", max: 10, bands: [["10", "Exceptional: topic, purpose, objectives and hypothesis clear; thorough background."], ["8–9", "Well written: clear topic, purpose and objectives; concise background; hypothesis stated."], ["6–7", "Adequate: introduces topic, purpose and objectives; some background; hypothesis stated."], ["4–5", "Limited: unclear purpose and objectives; minimal background; vague or missing hypothesis."], ["0–3", "Poor: little or no clarity; no background; hypothesis missing."]] },
    { k: "r", label: "Results & Discussion", max: 30, bands: [["30", "Exceptional results and thorough analysis; deep understanding; insightful links to theory."], ["25–29", "Clear results, thoughtful analysis; good understanding; links findings to theory."], ["20–24", "Adequate results with some analysis; basic understanding; little depth in links to theory."], ["15–19", "Limited results and minimal analysis; vague interpretation; no links to theory."], ["0–14", "Poor or no analysis; no understanding shown; discussion unclear or absent."]] },
    { k: "c", label: "Conclusion", max: 10, bands: [["10", "Exceptional synthesis of the key findings; insightful conclusions and implications."], ["8–9", "Well organised; synthesises the findings; appropriate conclusions."], ["6–7", "Adequate summary; basic conclusions; some implications."], ["4–5", "Limited synthesis; vague conclusions; no implications."], ["0–3", "Poor or missing conclusion."]] }
  ];
  const r2 = (x) => Math.round(x * 100) / 100, f2 = (x) => (x == null || isNaN(x) ? "–" : r2(x).toFixed(2));
  let C = null, W = DEFAULT_W, M = {}, ready = false, unsub = null, unsubW = null, st = { lab: 1, sec: "mon", mode: "demo", q: "", show: null };
  const timers = {};

  const reportOf = (x) => (x && x.i != null && x.r != null && x.c != null ? x.i + x.r + x.c : null);
  function labMarks(rec, n) {
    const x = (rec || {})[`l${n}`] || {}, w = W[n] || {};
    if (n === 5) return { total: x.t == null ? null : x.t, max: w.t };
    const rep = reportOf(x), dm = x.d == null ? null : (x.d / 50) * w.d, rm = rep == null ? null : (rep / 50) * w.r;
    return { demo: x.d, rep, dm, rm, total: dm == null && rm == null ? null : (dm || 0) + (rm || 0), done: dm != null && rm != null, max: w.d + w.r, note: x.note || "" };
  }
  const totalOf = (rec) => [1, 2, 3, 4, 5].reduce((s, n) => s + (labMarks(rec, n).total || 0), 0);
  const maxTotal = () => [1, 2, 3, 4].reduce((s, n) => s + (W[n].d + W[n].r), 0) + (W[5].t || 0);

  // which students do lab n in a section: their own section, or where a swap or move put them for that lab
  const labNo = (s) => +((String(s.title || "").match(/^Lab (\d+)/) || [])[1] || 0);
  function people(n) {
    const L = C.L, ses = L.sessions.filter((s) => s.kind === "lab" && labNo(s) === n), slots = [...new Set(ses.map(C.slotOf).filter(Boolean))];
    return L.roster.filter((r) => r.status === "active").map((r) => {
      const mv = slots.map((k) => C.moveOf(k, r.id)).filter(Boolean).pop();
      const sec = mv ? mv.section : r.section, grp = mv ? mv.group || r.group : r.group;
      const att = ses.filter((s) => s.section === sec).sort((a, b) => (a.date < b.date ? -1 : 1)).map((s) => ({ s, rec: C.recOf(s.id, r.id) }));
      return { r, sec, grp, att, moved: !!mv };
    }).sort((a, b) => ((a.sec || "z") + String(a.grp || 0).padStart(2, "0") + a.r.name < (b.sec || "z") + String(b.grp || 0).padStart(2, "0") + b.r.name ? -1 : 1));
  }
  const docId = (email) => `${C.semSlug}_${email}`;

  /* ---------- saving: as you type (half a second after the last key) ---------- */
  function save(email, n, field, raw, max, row) {
    const key = `${email}|${n}|${field}`, mark = row && row.querySelector(".lm-ok");
    clearTimeout(timers[key]);
    const txt = String(raw).trim(), v = txt === "" ? null : Number(txt);
    if (field !== "note" && v !== null && (!isFinite(v) || v < 0 || v > max)) { if (mark) { mark.textContent = `0 to ${max}`; mark.className = "lm-ok bad"; } return false; }
    if (mark) { mark.textContent = "…"; mark.className = "lm-ok"; }
    timers[key] = setTimeout(async () => {
      const r = C.L.roster.find((x) => x.id === email) || {}, ref = C.db.collection("labmarks").doc(docId(email)), by = C.A.state.user.email.toLowerCase();
      try {
        if (field !== "note" && v === null) await ref.update({ [`l${n}.${field}`]: C.FV.delete(), updatedAt: C.FV.serverTimestamp() }).catch(() => {});
        else await ref.set({ semester: C.SEM, email, name: r.name || "", matric: String(r.matric || ""), [`l${n}`]: { [field]: field === "note" ? txt.slice(0, 300) : v, by, at: C.FV.serverTimestamp() }, updatedAt: C.FV.serverTimestamp() }, { merge: true });
        delete timers[key];
        if (mark) { mark.textContent = "Saved ✓"; mark.className = "lm-ok yes"; }
      } catch (e) { if (mark) { mark.textContent = `Not saved (${e.code || e})`; mark.className = "lm-ok bad"; } }
    }, 500);
    return true;
  }

  /* ---------- the tab ---------- */
  const chips = (key, list) => list.map(([v, l]) => `<button type="button" class="chip-btn" data-lm${key}="${v}" aria-pressed="${String(st[key]) === String(v)}">${l}</button>`).join("");
  function head() {
    const n = st.lab, w = W[n];
    return `<div class="lm-head"><div class="adm-tools">${chips("lab", [1, 2, 3, 4, 5].map((k) => [k, `Lab ${k}`]))}</div>
      <div class="adm-tools">${chips("sec", [["mon", "Monday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["all", "All sections"]])}<span class="lm-sp"></span>
        ${n === 5 ? chips("mode", [["demo", "Lab 5 total"], ["overview", "Overview"]]) : chips("mode", [["demo", "Demo"], ["report", "Report"], ["overview", "Overview"]])}</div>
      <p class="small-note">Lab ${n}: ${esc(LAB_NAME[n])} · ${n === 5 ? `total out of ${w.t} (from the Lab 5 lecturer)` : `demo ${w.d} + report ${w.r} = ${w.d + w.r} marks`} · lecturers only, students don't see these marks. Marks save as you type.</p>
      <input class="at-in lm-q" type="search" placeholder="Find a student" value="${esc(st.q)}" aria-label="Find a student"></div>`;
  }
  const esc = (s) => C.esc(s);
  function attLine(p) {
    return p.att.map((a, i) => `<span class="at-st ${a.rec ? a.rec.status.toLowerCase() : "none"}" title="${esc(C.fmtDate(a.s.date))}">${p.att.length > 1 ? `P${i + 1} ` : ""}${a.rec ? a.rec.status : "·"}</span>`).join(" ") || `<small>no session</small>`;
  }
  function rowsHtml() {
    const n = st.lab, q = st.q.trim().toLowerCase();
    const list = people(n).filter((p) => (st.sec === "all" || p.sec === st.sec) && (!q || `${p.r.name} ${p.r.matric}`.toLowerCase().includes(q)));
    if (!list.length) return `<p class="adm-empty">No students here.</p>`;
    let g = null, out = "";
    list.forEach((p) => {
      const key = `${p.sec}|${p.grp}`;
      if (key !== g) { g = key; out += `<h4 class="lm-grp">${p.sec ? C.SECTION[p.sec].replace(" lab", "") : "No section"} · Group ${p.grp || "–"}</h4>`; }
      const x = (M[p.r.id] || {})[`l${n}`] || {}, lm = labMarks(M[p.r.id], n), id = esc(p.r.id);
      const who = `<div class="lm-who">${C.profileLink(p.r.id, p.r.name)}<small>${esc(p.r.matric)}${p.moved ? " · swapped in" : ""} · ${attLine(p)}</small></div>`;
      if (n === 5) {
        out += `<div class="lm-row" data-em="${id}">${who}<label class="lm-f">Total <input class="at-in lm-in" data-f="t" data-max="${W[5].t}" inputmode="decimal" value="${x.t ?? ""}"> / ${W[5].t}</label><span class="lm-ok"></span></div>`;
      } else if (st.mode === "demo") {
        const bands = n === 4 ? BANDS4 : BANDS, on = x.d == null ? -1 : bands.findIndex(([lo, hi]) => x.d >= lo && x.d <= hi);
        out += `<div class="lm-row" data-em="${id}">${who}
          <div class="lm-bands" role="group" aria-label="Rubric band">${bands.map(([lo, hi], k) => `<button type="button" class="lm-band" data-band="${k}" aria-pressed="${k === on}">${lo === hi ? lo : `${lo}–${hi}`}</button>`).join("")}</div>
          <label class="lm-f">Score <input class="at-in lm-in" data-f="d" data-max="50" inputmode="numeric" value="${x.d ?? ""}"> / 50</label>
          <span class="lm-w">${lm.dm == null ? "–" : f2(lm.dm)} / ${W[n].d}</span><span class="lm-ok"></span>
          <p class="lm-desc">${on >= 0 ? esc(DEMO[n][on + 1]) : ""}</p></div>`;
      } else {
        out += `<div class="lm-row lm-rep" data-em="${id}">${who}
          ${REPORT.map((c) => `<label class="lm-f">${c.label} <input class="at-in lm-in" data-f="${c.k}" data-max="${c.max}" inputmode="numeric" value="${x[c.k] ?? ""}"> / ${c.max}</label>`).join("")}
          <span class="lm-w">${lm.rep == null ? "–" : lm.rep} / 50 → ${lm.rm == null ? "–" : f2(lm.rm)} / ${W[n].r}</span><span class="lm-ok"></span>
          <label class="lm-f lm-note">Comment <input class="at-in lm-in" data-f="note" data-max="0" maxlength="300" value="${esc(x.note || "")}" placeholder="Justification or comment (optional)"></label></div>`;
      }
    });
    return out;
  }
  function rubricHtml() {
    const n = st.lab;
    if (n === 5 || st.mode === "overview") return "";
    if (st.mode === "demo") { const b = n === 4 ? BANDS4 : BANDS; return `<details class="at-card lm-rub"><summary><strong>Demo rubric</strong> · ${esc(DEMO[n][0])}</summary><table class="adm"><tbody>${b.map(([lo, hi], k) => `<tr><th>${lo === hi ? lo : `${lo}–${hi}`}</th><td>${esc(DEMO[n][k + 1])}</td></tr>`).join("")}</tbody></table></details>`; }
    return `<details class="at-card lm-rub"><summary><strong>Report rubric</strong> · Introduction /10, Results &amp; Discussion /30, Conclusion /10</summary>${REPORT.map((c) => `<h4>${c.label} (${c.max})</h4><table class="adm"><tbody>${c.bands.map(([m, d]) => `<tr><th>${m}</th><td>${esc(d)}</td></tr>`).join("")}</tbody></table>`).join("")}</details>`;
  }
  function overviewHtml() {
    const q = st.q.trim().toLowerCase(), all = C.L.roster.filter((r) => r.status === "active" && (st.sec === "all" || r.section === st.sec) && (!q || `${r.name} ${r.matric}`.toLowerCase().includes(q)))
      .sort((a, b) => ((a.section || "z") + String(a.group || 0).padStart(2, "0") + a.name < (b.section || "z") + String(b.group || 0).padStart(2, "0") + b.name ? -1 : 1));
    const missing = (n) => all.filter((r) => { const m = labMarks(M[r.id], n); return n === 5 ? m.total == null : !m.done; }).length;
    return `<div class="adm-sum">${[1, 2, 3, 4, 5].map((n) => `<div><strong>${all.length - missing(n)}/${all.length}</strong><span>Lab ${n} complete</span></div>`).join("")}</div>
      <p><button type="button" class="btn ghost small" data-lmcsv>Download CSV (Lab Assessment layout)</button></p>
      <div class="adm-scroll"><table class="adm lm-ov"><thead><tr><th scope="col">Student</th>${[1, 2, 3, 4].map((n) => `<th scope="col">Lab ${n}<br><small>D ${W[n].d} · R ${W[n].r}</small></th>`).join("")}<th scope="col">Lab 5<br><small>/ ${W[5].t}</small></th><th scope="col">Total<br><small>/ ${maxTotal()}</small></th></tr></thead><tbody>
      ${all.map((r) => { const rec = M[r.id];
        return `<tr><td>${C.profileLink(r.id, r.name)}<small>${esc(r.matric)} · ${r.section ? C.SECTION[r.section].replace(" lab", "") : "–"} G${r.group || "–"}</small></td>${[1, 2, 3, 4].map((n) => { const m = labMarks(rec, n);
          return `<td class="${m.done ? "" : m.total == null ? "lm-none" : "lm-part"}" title="Demo ${m.demo ?? "–"}/50 → ${f2(m.dm)}; report ${m.rep ?? "–"}/50 → ${f2(m.rm)}">${m.total == null ? "–" : f2(m.total)}<small>${m.demo ?? "–"} · ${m.rep ?? "–"}</small></td>`; }).join("")}
          <td class="${labMarks(rec, 5).total == null ? "lm-none" : ""}">${f2(labMarks(rec, 5).total)}</td><td><strong>${f2(totalOf(rec))}</strong></td></tr>`; }).join("")}</tbody></table></div>
      <p class="small-note">Each lab cell: marks, then the demo score (/50) · report score (/50). Amber: only one part done; grey: nothing yet.</p>`;
  }
  function weightsHtml() {
    return `<details class="at-card lm-set"><summary><strong>Weights</strong> · total ${maxTotal()} marks</summary>
      <form class="lm-wf" novalidate><div class="lm-wgrid">${[1, 2, 3, 4].map((n) => `<span>Lab ${n}</span><label>Demo <input class="at-in" name="d${n}" inputmode="decimal" value="${W[n].d}"></label><label>Report <input class="at-in" name="r${n}" inputmode="decimal" value="${W[n].r}"></label>`).join("")}
        <span>Lab 5</span><label>Total <input class="at-in" name="t5" inputmode="decimal" value="${W[5].t}"></label><span></span></div>
        <p class="small-note lm-wmsg" aria-live="polite"></p><button class="btn small">Save weights</button></form></details>`;
  }
  function render(body) {
    body.innerHTML = `<div class="lm-root">${head()}${st.mode === "overview" ? overviewHtml() : `${rubricHtml()}<div class="lm-rows">${ready ? rowsHtml() : `<p class="small-note">Loading…</p>`}</div>`}${weightsHtml()}</div>`;
    const qi = body.querySelector(".lm-q");
    if (st.focusQ && qi) { qi.focus(); qi.setSelectionRange(st.q.length, st.q.length); st.focusQ = false; }
  }
  // live numbers in place, without rebuilding the boxes the lecturer may be typing in
  function refresh(body) {
    if (st.mode === "overview") return render(body);
    body.querySelectorAll(".lm-row").forEach((row) => {
      const n = st.lab, em = row.dataset.em, lm = labMarks(M[em], n), w = row.querySelector(".lm-w"), x = (M[em] || {})[`l${n}`] || {};
      // boxes the lecturer isn't typing in show the saved value (e.g. marks keyed in by the other lecturer)
      row.querySelectorAll(".lm-in").forEach((inp) => { const f = inp.dataset.f; if (inp !== document.activeElement && !timers[`${em}|${n}|${f}`] && x[f] !== undefined && String(x[f]) !== inp.value) inp.value = x[f]; });
      if (w && n !== 5) w.textContent = st.mode === "demo" ? `${lm.dm == null ? "–" : f2(lm.dm)} / ${W[n].d}` : `${lm.rep == null ? "–" : lm.rep} / 50 → ${lm.rm == null ? "–" : f2(lm.rm)} / ${W[n].r}`;
    });
  }

  function csv() {
    const head = ["No.", "Student Name", "Matric No"];
    [1, 2, 3, 4].forEach((n) => head.push(`Lab ${n} Demo (0-50)`, `Lab ${n} Demo (${W[n].d})`, `Lab ${n} Introduction`, `Lab ${n} Result & Discussions`, `Lab ${n} Conclusion`, `Lab ${n} Total Report (50)`, `Lab ${n} Report (${W[n].r})`, `Lab ${n} Comments`, `Lab ${n} Total (${W[n].d + W[n].r})`));
    head.push(`Lab 5 (${W[5].t})`, `Total Lab Marks (${maxTotal()})`, "Section", "Group");
    const rows = C.L.roster.filter((r) => r.status === "active").sort((a, b) => (String(a.matric) < String(b.matric) ? -1 : 1)).map((r, i) => {
      const rec = M[r.id], line = [i + 1, r.name, r.matric];
      [1, 2, 3, 4].forEach((n) => { const x = (rec || {})[`l${n}`] || {}, m = labMarks(rec, n); line.push(x.d ?? "", m.dm == null ? "" : f2(m.dm), x.i ?? "", x.r ?? "", x.c ?? "", m.rep ?? "", m.rm == null ? "" : f2(m.rm), x.note || "", m.total == null ? "" : f2(m.total)); });
      const t5 = labMarks(rec, 5).total;
      line.push(t5 == null ? "" : f2(t5), f2(totalOf(rec)), r.section ? C.SECTION[r.section].replace(" lab", "") : "", r.group || "");
      return line;
    });
    const text = [head, ...rows].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = `nmk42003-lab-marks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  let bound = null;
  function bind(body) {
    if (bound === body) return;
    bound = body;
    body.addEventListener("click", (e) => {
      if (!body.querySelector(".lm-root")) return;
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.lmlab) { st.lab = +b.dataset.lmlab; if (st.lab === 5 && st.mode === "report") st.mode = "demo"; return render(body); }
      if (b.dataset.lmsec) { st.sec = b.dataset.lmsec; return render(body); }
      if (b.dataset.lmmode) { st.mode = b.dataset.lmmode; return render(body); }
      if (b.hasAttribute("data-lmcsv")) return csv();
      if (b.dataset.band !== undefined) {
        // a band sets its top score (the lecturer can then type the exact score) and shows the rubric line
        const row = b.closest(".lm-row"), n = st.lab, band = (n === 4 ? BANDS4 : BANDS)[+b.dataset.band], inp = row.querySelector('[data-f="d"]');
        inp.value = band[1]; row.querySelectorAll(".lm-band").forEach((x) => x.setAttribute("aria-pressed", x === b));
        row.querySelector(".lm-desc").textContent = DEMO[n][+b.dataset.band + 1];
        save(row.dataset.em, n, "d", inp.value, 50, row); inp.focus(); inp.select();
      }
    });
    body.addEventListener("input", (e) => {
      if (!body.querySelector(".lm-root")) return;
      if (e.target.matches(".lm-q")) { st.q = e.target.value; st.focusQ = true; return render(body); }
      if (!e.target.matches(".lm-in")) return;
      const row = e.target.closest(".lm-row"), f = e.target.dataset.f, n = st.lab;
      save(row.dataset.em, n, f, e.target.value, f === "note" ? 0 : Number(e.target.dataset.max), row);
      if (f === "d") { const v = Number(e.target.value), bands = n === 4 ? BANDS4 : BANDS, k = e.target.value === "" ? -1 : bands.findIndex(([lo, hi]) => v >= lo && v <= hi);
        row.querySelectorAll(".lm-band").forEach((x, i) => x.setAttribute("aria-pressed", i === k)); row.querySelector(".lm-desc").textContent = k >= 0 ? DEMO[n][k + 1] : ""; }
    });
    body.addEventListener("submit", async (e) => {
      if (!e.target.matches(".lm-wf")) return;
      e.preventDefault();
      const f = e.target, num = (k) => Number(f[k].value), w = {}, msg = f.querySelector(".lm-wmsg");
      for (const n of [1, 2, 3, 4]) { w[n] = { d: num(`d${n}`), r: num(`r${n}`) }; if (![w[n].d, w[n].r].every((x) => isFinite(x) && x >= 0 && x <= 20)) { msg.textContent = `Check the Lab ${n} weights.`; return; } }
      w[5] = { t: num("t5") }; if (!(isFinite(w[5].t) && w[5].t >= 0 && w[5].t <= 20)) { msg.textContent = "Check the Lab 5 total."; return; }
      try { await C.db.collection("meta").doc("labmarks").set({ w, updatedAt: C.FV.serverTimestamp() }, { merge: true }); msg.textContent = `Saved. Total: ${maxTotal()} marks.`; }
      catch (ex) { msg.textContent = `Could not save (${ex.code || ex}). If this says permission-denied, publish the latest firebase/firestore.rules.`; }
    });
  }

  window.NMKLabMarks = {
    // attendance.js calls this whenever the Lab Marks tab is drawn (also after its own data changes)
    draw(body, ctx) {
      C = ctx;
      if (!unsub) {
        unsub = C.db.collection("labmarks").where("semester", "==", C.SEM).onSnapshot((q) => {
          M = {}; q.docs.forEach((d) => { const x = d.data(); M[x.email] = x; }); ready = true;
          const b = document.querySelector(".lm-root"); if (b) { if (b.querySelector(".lm-rows .small-note")) render(b.parentNode); else refresh(b.parentNode); }
        }, (e) => { const b = document.querySelector(".lm-rows"); if (b) b.innerHTML = `<p class="small-note">Could not load the marks (${esc(e.code || e)}). If this says permission-denied, publish the latest firebase/firestore.rules.</p>`; });
        unsubW = C.db.collection("meta").doc("labmarks").onSnapshot((d) => {
          const w = d.exists && d.data().w; W = w ? Object.assign({}, DEFAULT_W, w) : DEFAULT_W;
          const b = document.querySelector(".lm-root"); if (b && !b.contains(document.activeElement)) render(b.parentNode);
        }, () => {});
      }
      // first time: open on the most recent lab session (on assessment day, today's lab and section)
      if (!st.picked && C.L.sessLoaded) {
        st.picked = true;
        const q = new URLSearchParams(location.search).get("today"), today = q || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const last = C.L.sessions.filter((s) => s.kind === "lab" && labNo(s) && s.date <= today && s.section !== "all").sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (last) { st.lab = labNo(last); st.sec = last.section; }
      }
      bind(body);
      const mine = body.querySelector(".lm-root");
      if (mine && mine.contains(document.activeElement)) refresh(body); else render(body);
    },
    // the marks of one student (for later use, e.g. their profile for lecturers)
    of: (email) => M[email] || null, total: (email) => totalOf(M[email]), maxTotal
  };
})();
