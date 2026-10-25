/* NMK42003 Teaching Evidence (evidence.html, lecturers only): the figures a teaching-innovation report needs, worked out
   from what the site already records.
   - Reach and engagement: accounts, weekly activity, exercise attempts, "try first" behaviour (first try, after hints).
   - Course outcome (CO) attainment: practice on the site per CO (data.js co / coMap through NMKCO), and the real CO3
     lab marks (labmarks, meta/labmarks weights).
   - Results: assessment marks the lecturer pastes in (a test, quizzes), with the previous cohort's figures for
     comparison, and the link between practice on the site and the marks (Firestore evidence/{semKey}, lecturers only).
   - INSTRUMENTA (the game), attendance, and the course survey (survey.js, NMKSurvey; consenting answers only).
   Everything can be downloaded as anonymised CSV or printed as a PDF, and "Publish to the showcase" copies class-level
   figures only (never a name, and no group smaller than 5) to meta/showcase for the public showcase.html. */
(function () {
  "use strict";
  const host = document.getElementById("evidence");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!window.NMKAccount || !window.NMKGame || !window.NMKSurvey || !window.NMKCO) { host.innerHTML = `<div class="callout warn"><strong>The page could not load</strong>Check your internet connection and reload the page.</div>`; return; }
  const A = window.NMKAccount, G = window.NMKGame, SV = window.NMKSurvey, CO = window.NMKCO, db = A.db, FV = firebase.firestore.FieldValue;
  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s) || d; } catch (e) { return d; } };
  const SEM = G.SEM, KEY = SV.semKey();
  const PASS = 50, MIN_GROUP = 5;
  const DEFAULT_W = { 1: { d: 2, r: 3 }, 2: { d: 2, r: 3 }, 3: { d: 2, r: 2 }, 4: { d: 1, r: 1 }, 5: { t: 4 } };
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
  const pct = (x, d = 0) => (x == null || isNaN(x) ? "–" : `${x.toFixed(d)}%`);
  const num = (x, d = 1) => (x == null || isNaN(x) ? "–" : x.toFixed(d));
  const share = (a, b) => (b ? (a / b) * 100 : null);
  function pearson(xs, ys) {
    const n = xs.length; if (n < 3) return null;
    const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const table = (head, rows, cls = "") => `<div class="adm-scroll"><table class="adm ${cls}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const tile = (n, t, cls = "") => `<div class="ev-tile ${cls}"><strong>${n}</strong><span>${t}</span></div>`;
  const bar = (p) => `<span class="adm-pct"><i style="width:${Math.max(0, Math.min(100, p || 0)).toFixed(0)}%"></i></span>`;

  let D = null, msg = {};

  /* ---------- load everything once ---------- */
  async function load() {
    host.innerHTML = `<p class="small-note">Loading the semester's records…</p>`;
    const get = (q) => q.get();
    try {
      const [u, p, r, at, lm, lw, sv, ev] = await Promise.all([get(db.collection("users")), get(db.collection("progress")), get(db.collection("roster")),
        get(db.collection("attendance").where("semester", "==", SEM)), get(db.collection("labmarks").where("semester", "==", SEM)),
        db.collection("meta").doc("labmarks").get(), get(db.collection("survey").where("semKey", "==", KEY)).catch(() => ({ docs: [] })),
        db.collection("evidence").doc(KEY).get().catch(() => null)]);
      D = { users: u.docs.map((d) => Object.assign({ uid: d.id }, d.data())), progress: Object.fromEntries(p.docs.map((d) => [d.id, d.data()])),
        roster: r.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => x.status === "active"),
        att: at.docs.map((d) => d.data()), labmarks: Object.fromEntries(lm.docs.map((d) => [d.data().email, d.data()])),
        W: Object.assign({}, DEFAULT_W, (lw.exists && lw.data().w) || {}), survey: sv.docs.map((d) => d.data()),
        ev: (ev && ev.exists && ev.data()) || { sets: {} } };
      if (!D.ev.sets) D.ev.sets = {};
      build();
      draw();
    } catch (e) {
      host.innerHTML = `<div class="callout warn"><strong>Could not load the records</strong>${esc(e.code || e)}. If this says "permission-denied", publish the latest firebase/firestore.rules in the Firebase console.</div>`;
    }
  }

  /* ---------- one record per student on the class list ---------- */
  const NOW_WEEK = () => G.weekOf(G.today());
  const released = () => G.STOPS.filter((s) => s.week <= NOW_WEEK() && s.ids.length);
  const releasedIds = () => released().flatMap((s) => s.ids);
  function labPct(rec) {
    let got = 0, max = 0;
    [1, 2, 3, 4].forEach((n) => {
      const x = (rec || {})[`l${n}`] || {}, w = D.W[n] || {};
      if (x.d != null) { got += (x.d / 50) * w.d; max += w.d; }
      if (x.i != null && x.r != null && x.c != null) { got += ((x.i + x.r + x.c) / 50) * w.r; max += w.r; }
    });
    const x5 = (rec || {}).l5 || {};
    if (x5.t != null && D.W[5] && D.W[5].t) { got += x5.t; max += D.W[5].t; }
    return max ? (got / max) * 100 : null;
  }
  function build() {
    const byEmail = Object.fromEntries(D.users.filter((u) => u.role !== "lecturer").map((u) => [String(u.email || "").toLowerCase(), u]));
    const ids = releasedIds();
    const coIds = {}; ids.forEach((id) => { const c = CO.of(id); if (c) (coIds[c] = coIds[c] || []).push(id); });
    D.coIds = coIds;
    D.students = D.roster.map((r) => {
      const u = byEmail[r.id], approved = !!(u && u.status === "approved"), keys = (u && D.progress[u.uid] && D.progress[u.uid].keys) || {};
      const g = G.compute(keys), log = parse(keys["nmk-ex-log"], {}), solved = new Set(parse(keys["nmk-solved"], []).filter((id) => G.CATALOG[id]));
      const co = {}; Object.keys(coIds).forEach((c) => { co[c] = share(coIds[c].filter((id) => solved.has(id)).length, coIds[c].length); });
      const mis = parse(keys["nmk-missions"], {}), st = Object.keys(mis).filter((id) => /^w\d+-s\d+$/.test(id));
      const recs = D.att.filter((x) => x.email === r.id), rate = (k) => { const a = recs.filter((x) => x.kind === k); return a.length ? share(a.filter((x) => x.status === "P" || x.status === "L").length, a.length) : null; };
      const marks = {}; Object.entries(D.ev.sets).forEach(([k, s]) => { const v = (s.marks || {})[r.id]; if (v != null && s.max) marks[k] = (v / s.max) * 100; });
      return { r, u, account: approved, g, log, solved, co, lab: labPct(D.labmarks[r.id]), mis, stations: st, lec: rate("lecture"), labAtt: rate("lab"), marks };
    });
  }

  /* ---------- the sections ---------- */
  function summary() {
    const S = D.students, acc = S.filter((s) => s.account), now = NOW_WEEK();
    const tried = acc.filter((s) => Object.keys(s.log).length);
    const solves = S.reduce((a, s) => a + s.solved.size, 0), checks = S.reduce((a, s) => a + Object.values(s.log).reduce((b, x) => b + (x.checks || 0), 0), 0);
    const recent = acc.filter((s) => s.g.lastActive && (G.today() - new Date(s.g.lastActive).getTime()) / 86400000 < 7);
    const avgWeeks = mean(acc.map((s) => s.g.weeks.filter((w) => w >= 1 && w <= now).length));
    return `<section id="summary" class="ev-sec"><h2 class="h3">At a Glance</h2>
      <p class="small-note">${esc(SEM)} · week ${now} · ${S.length} students on the class list. Figures update each time this page loads.</p>
      <div class="ev-tiles">${tile(`${acc.length}<small>/${S.length}</small>`, `students signed in (${pct(share(acc.length, S.length))})`)}${tile(tried.length, "have tried exercises")}
        ${tile(recent.length, "active in the last 7 days")}${tile(num(avgWeeks), `active weeks per student (of ${now})`)}${tile(solves, "exercises solved in total")}${tile(checks, "answers checked in total")}</div>
      ${weekly()}</section>`;
  }
  function weekly() {
    const now = Math.max(1, Math.min(NOW_WEEK(), 19)), acc = D.students.filter((s) => s.account);
    const act = [], sol = [];
    for (let w = 1; w <= now; w++) {
      act.push(acc.filter((s) => s.g.weeks.includes(w)).length);
      sol.push(acc.reduce((a, s) => a + Object.values(s.log).filter((x) => x.solved && x.solvedAt && G.weekOf(x.solvedAt) === w).length, 0));
    }
    return `<div class="ev-two"><div><h3 class="bd-h">Students Active Each Week</h3>${chart(act, "students")}</div><div><h3 class="bd-h">Exercises Solved Each Week</h3>${chart(sol, "solved")}</div></div>`;
  }
  function chart(vals, unit) {
    const W = 520, H = 170, n = vals.length, max = Math.max(1, ...vals), step = (W - 40) / n, bw = Math.min(36, step - 6);
    return `<div class="adm-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} per week: ${vals.join(", ")}"><line x1="30" x2="${W - 4}" y1="${H - 22}" y2="${H - 22}" class="adm-axl"/>
      ${vals.map((v, i) => { const x = 34 + i * step, h = (v / max) * (H - 44); return `<rect class="adm-bar" x="${x.toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>Week ${i + 1}: ${v} ${unit}</title></rect><text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="adm-ax">${i + 1}</text>${v ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - 26 - h).toFixed(1)}" text-anchor="middle" class="adm-ax n">${v}</text>` : ""}`; }).join("")}
      <text x="4" y="14" class="adm-ax">${unit}</text></svg></div>`;
  }

  function alignment() {
    const stops = (co) => G.STOPS.filter((s) => s.ids.some((id) => CO.of(id) === co)).map((s) => s.label);
    const worlds = (co) => COURSE.topics.filter((t) => t.co === co).length;
    const assess = (co) => COURSE.assessment.filter((a) => (a.detail || "").includes(co)).map((a) => `${a.name} (${a.pct}%)`);
    return `<section id="alignment" class="ev-sec"><h2 class="h3">Course Outcome Alignment</h2>
      <p class="small-note">What students practise on the site for each course outcome, and where it is assessed. Each exercise shows its CO tag, so students see what it is for.</p>
      ${table(["CO", "Outcome", "Practice on the site", "Assessed in"], CO.outcomes.map((o) => {
        const n = Object.keys(G.CATALOG).filter((id) => CO.of(id) === o.id).length, st = stops(o.id);
        return [`<strong>${o.id}</strong><small>${esc(o.level)} · ${esc(o.po)}</small>`, esc(o.text),
          n ? `${n} try-first exercises in ${esc(st.join(", "))}${worlds(o.id) ? "; INSTRUMENTA stations for each chapter uploaded to the game" : ""}${o.id === "CO3" ? "; Pre-Lab Checks and virtual benches; the mini project page" : ""}` : "Not on the site yet: taught from week 8 (data transmission, sensor networks, data storage)",
          esc(assess(o.id).join("; ") || "–")];
      }))}</section>`;
  }

  function attainment() {
    const acc = D.students.filter((s) => s.account), cos = Object.keys(D.coIds).sort();
    const rows = cos.map((c) => {
      const v = acc.map((s) => s.co[c]).filter((x) => x != null);
      return [`<strong>${c}</strong>`, D.coIds[c].length, `${bar(mean(v))}${pct(mean(v))}`, pct(share(v.filter((x) => x >= PASS).length, acc.length)), pct(share(v.filter((x) => x >= PASS).length, D.students.length))];
    });
    const lab = D.students.map((s) => s.lab).filter((x) => x != null);
    const perLab = [1, 2, 3, 4, 5].map((n) => {
      const recs = D.students.map((s) => (D.labmarks[s.r.id] || {})[`l${n}`]).filter(Boolean);
      const dm = recs.filter((x) => x.d != null).map((x) => (x.d / 50) * 100), rp = recs.filter((x) => x.i != null && x.r != null && x.c != null).map((x) => ((x.i + x.r + x.c) / 50) * 100);
      const t5 = n === 5 ? recs.filter((x) => x.t != null).map((x) => (x.t / (D.W[5].t || 4)) * 100) : [];
      return n === 5 ? (t5.length ? [`Lab 5`, "–", "–", `${pct(mean(t5))} (${t5.length})`, pct(share(t5.filter((x) => x >= PASS).length, t5.length))] : null)
        : dm.length || rp.length ? [`Lab ${n}`, `${pct(mean(dm))} (${dm.length})`, `${pct(mean(rp))} (${rp.length})`, "–", pct(share(dm.concat(rp).filter((x) => x >= PASS).length, dm.length + rp.length))] : null;
    }).filter(Boolean);
    return `<section id="attainment" class="ev-sec"><h2 class="h3">CO Attainment</h2>
      <h3 class="bd-h">Practice on the Site, by CO</h3>
      <p class="small-note">Exercises released so far (chapters and labs up to week ${NOW_WEEK()}). A student "reaches" a CO here when they have solved at least ${PASS}% of its exercises. Practice only: these points never count towards grades.</p>
      ${rows.length ? table(["CO", "Exercises", "Average solved (signed-in students)", "Signed-in students reaching 50%", "Whole class reaching 50%"], rows) : `<p class="adm-empty">No exercises released yet.</p>`}
      <h3 class="bd-h">CO3 from the Lab Marks</h3>
      ${lab.length ? `<div class="ev-tiles">${tile(pct(mean(lab)), `average lab mark so far (${lab.length} students)`)}${tile(pct(share(lab.filter((x) => x >= PASS).length, lab.length)), `scoring ${PASS}% or more`)}</div>
        ${table(["Lab", "Demonstration average (n)", "Report average (n)", "Total keyed in (n)", `Parts at ${PASS}% or more`], perLab)}
        ${prevRow("lab", "CO3 lab marks", mean(lab), share(lab.filter((x) => x >= PASS).length, lab.length))}`
        : `<p class="adm-empty">No lab marks keyed in yet (Attendance → Lab Marks).</p>`}</section>`;
  }

  function behaviour() {
    const acc = D.students.filter((s) => s.account), recs = acc.flatMap((s) => Object.values(s.log));
    const sol = recs.filter((r) => r.solved), first = sol.filter((r) => r.wrong === 0).length, few = sol.filter((r) => r.wrong >= 1 && r.wrong <= 2).length, many = sol.filter((r) => r.wrong > 2).length;
    const open = recs.filter((r) => !r.solved).length;
    const rows = G.STOPS.filter((s) => s.ids.length && s.week <= NOW_WEEK()).map((s) => {
      const per = acc.map((x) => s.ids.filter((id) => x.solved.has(id)).length / s.ids.length * 100), tried = acc.filter((x) => s.ids.some((id) => x.log[id])).length;
      const sl = acc.flatMap((x) => s.ids.map((id) => x.log[id]).filter((r) => r && r.solved));
      return [`${esc(s.label)}<small>${esc(s.title)}</small>`, `<span class="ex-co">${esc(CO.of(s.ids[0]))}</span>`, tried, `${bar(mean(per))}${pct(mean(per))}`, pct(share(sl.filter((r) => r.wrong === 0).length, sl.length)), num(mean(sl.map((r) => r.wrong || 0)))];
    });
    return `<section id="behaviour" class="ev-sec"><h2 class="h3">Try-First Learning</h2>
      <p class="small-note">Every exercise asks for an answer first. A wrong try unlocks a hint; the full working opens only after a correct answer. These figures show students persisting rather than copying a worked answer.</p>
      <div class="ev-tiles">${tile(sol.length, "exercises solved")}${tile(pct(share(first, sol.length)), "solved on the first try")}${tile(pct(share(few + many, sol.length)), "solved after a hint (kept trying)")}${tile(open, "tried, not solved yet")}</div>
      <div class="ev-stack" role="img" aria-label="Solved on the first try ${first}, after one or two hints ${few}, after more tries ${many}, not solved yet ${open}">
        ${[["first", first, "First try"], ["few", few, "After 1–2 hints"], ["many", many, "After more tries"], ["open", open, "Not solved yet"]].map(([c, n, t]) => n ? `<span class="${c}" style="flex:${n}"><b>${n}</b> ${t}</span>` : "").join("")}</div>
      <h3 class="bd-h">By Chapter and Lab</h3>
      ${table(["Where", "CO", "Students who tried", "Average done", "Solved on the first try", "Average wrong tries before solving"], rows)}</section>`;
  }

  /* results: marks the lecturer pastes in, the previous cohort, and practice against results */
  function prevRow(key, label, nowMean, nowPass) {
    const p = (D.ev.prev || {})[key] || {};
    return `<form class="ev-prev" data-prev="${key}"><span class="ev-prev-t">Previous cohort, ${esc(label)}:</span>
      <label>Cohort <input name="label" value="${esc(p.label || "")}" placeholder="2025/26" size="8"></label>
      <label>Mean % <input name="mean" type="number" step="0.1" min="0" max="100" value="${p.mean == null ? "" : p.mean}"></label>
      <label>Pass % <input name="pass" type="number" step="0.1" min="0" max="100" value="${p.pass == null ? "" : p.pass}"></label>
      <button class="btn ghost sm">Save</button>
      ${p.mean != null ? `<span class="ev-diff">This cohort ${pct(nowMean, 1)} vs ${pct(p.mean, 1)} (${diff(nowMean, p.mean)}); pass ${pct(nowPass)} vs ${pct(p.pass)} (${diff(nowPass, p.pass)})</span>` : ""}
      <span class="ev-msg" aria-live="polite">${esc(msg[`prev-${key}`] || "")}</span></form>`;
  }
  const diff = (a, b) => (a == null || b == null ? "–" : `${a - b >= 0 ? "+" : "−"}${Math.abs(a - b).toFixed(1)} points`);
  function groups(key) {
    const S = D.students.filter((s) => (key === "lab" ? s.lab : s.marks[key]) != null), val = (s) => (key === "lab" ? s.lab : s.marks[key]);
    const used = S.filter((s) => s.solved.size > 0).sort((a, b) => a.solved.size - b.solved.size), none = S.filter((s) => !s.solved.size);
    const third = Math.ceil(used.length / 3), g = [["No practice on the site", none], ["Low practice", used.slice(0, third)], ["Middle", used.slice(third, 2 * third)], ["High practice", used.slice(2 * third)]];
    const r = pearson(S.map((s) => s.solved.size), S.map(val));
    return { r, n: S.length, rows: g.map(([t, a]) => ({ t, n: a.length, mean: mean(a.map(val)), pass: share(a.filter((s) => val(s) >= PASS).length, a.length), range: !a.length ? "" : a[0].solved.size === a[a.length - 1].solved.size ? String(a[0].solved.size) : `${a[0].solved.size}–${a[a.length - 1].solved.size}` })) };
  }
  function results() {
    const sets = Object.entries(D.ev.sets).sort((a, b) => String(a[1].at || "").localeCompare(String(b[1].at || "")));
    const block = (key, name, co, vals) => {
      const gr = groups(key), m = mean(vals), p = share(vals.filter((x) => x >= PASS).length, vals.length);
      return `<div class="ev-set"><h3 class="bd-h">${esc(name)} ${co ? `<span class="ex-co">${esc(co)}</span>` : ""}</h3>
        <div class="ev-tiles">${tile(vals.length, "students with a mark")}${tile(pct(m, 1), "class average")}${tile(pct(p), `scoring ${PASS}% or more`)}${tile(gr.r == null ? "–" : gr.r.toFixed(2), "correlation: exercises solved vs mark (r)")}</div>
        ${table(["Practice on the site", "Exercises solved", "Students", "Average mark", `${PASS}% or more`], gr.rows.map((x) => [x.t, x.range, x.n, x.n ? pct(x.mean, 1) : "–", x.n ? pct(x.pass) : "–"]))}
        ${key !== "lab" ? prevRow(key, name, m, p) : ""}
        ${key !== "lab" ? `<p class="ev-del"><button type="button" class="btn ghost sm" data-delset="${esc(key)}">Remove this set of marks</button></p>` : ""}</div>`;
    };
    const lab = D.students.map((s) => s.lab).filter((x) => x != null);
    return `<section id="results" class="ev-sec"><h2 class="h3">Results and Practice</h2>
      <p class="small-note">Paste the marks of an assessment (from URLearn or your mark sheet) to compare this cohort with the previous one, and students who practised more on the site with those who practised less. Groups are by exercises solved on the site (thirds of the students who used it). This shows an association, not proof of cause: say so in a report.</p>
      ${sets.map(([k, s]) => block(k, s.name, s.co, D.students.map((x) => x.marks[k]).filter((x) => x != null))).join("")}
      ${lab.length ? block("lab", "Lab Marks So Far", "CO3", lab) : ""}
      <details class="ev-import"${sets.length ? "" : " open"}><summary>Add a set of marks</summary>
        <form data-import novalidate>
          <div class="ev-irow"><label>Assessment <input name="name" placeholder="Test (week 8)" required></label>
            <label>CO <select name="co">${CO.outcomes.map((o) => `<option>${o.id}</option>`).join("")}<option value="">–</option></select></label>
            <label>Out of <input name="max" type="number" min="1" step="any" placeholder="100" required></label></div>
          <label class="ev-paste">One student per line: matric number (or studentmail address), then the mark. Copy two columns straight from a spreadsheet.
            <textarea name="rows" rows="6" placeholder="231234567	15.5&#10;231234568	12"></textarea></label>
          <button class="btn">Save the marks</button> <span class="ev-msg" aria-live="polite">${esc(msg.import || "")}</span>
        </form><p class="small-note">Saved only for lecturers (Firestore evidence). Students never see it, and the published showcase gets class averages only.</p></details></section>`;
  }

  function game() {
    const acc = D.students.filter((s) => s.account), pl = acc.filter((s) => s.stations.length);
    const clears = pl.reduce((a, s) => a + s.stations.length, 0), bosses = pl.reduce((a, s) => a + s.stations.filter((id) => s.mis[id].boss).length, 0);
    const worlds = [...new Set(pl.flatMap((s) => s.stations.map((id) => +id.match(/^w(\d+)/)[1])))].sort((a, b) => a - b);
    const rows = worlds.map((w) => {
      const st = (k) => pl.filter((s) => s.mis[`w${w}-s${k}`]).length, mk = pl.flatMap((s) => s.stations.filter((id) => id.startsWith(`w${w}-`)).map((id) => s.mis[id])).filter((x) => x && x.boss && x.mk != null).map((x) => (x.mk / (x.of || 20)) * 100);
      const t = COURSE.topics.find((x) => x.no === w);
      return [`Chapter ${w}<small>${esc(t ? t.title : "")}</small>`, `<span class="ex-co">${esc(CO.of(`w${w}-s1`))}</span>`, st(1), st(2), st(3), pct(mean(mk))];
    });
    return `<section id="game" class="ev-sec"><h2 class="h3">INSTRUMENTA: Legends</h2>
      <p class="small-note">Game-based practice: three stations per chapter, the third a boss with step marks. Coins and ranks never count towards grades.</p>
      ${pl.length ? `<div class="ev-tiles">${tile(pl.length, "students have played")}${tile(clears, "stations cleared")}${tile(bosses, "bosses defeated")}${tile(num(mean(pl.flatMap((s) => s.stations.map((id) => s.mis[id].s || 0)))), "average stars per station")}</div>
        ${table(["Chapter", "CO", "Cleared station 1", "Cleared station 2", "Defeated the boss", "Average boss marks"], rows)}` : `<p class="adm-empty">No one has played yet.</p>`}</section>`;
  }

  function attendance() {
    const recs = D.att, by = (k) => recs.filter((x) => x.kind === k), rate = (a) => share(a.filter((x) => x.status === "P" || x.status === "L").length, a.length);
    const L = by("lecture"), B = by("lab");
    const acc = D.students.filter((s) => s.account && s.lec != null), non = D.students.filter((s) => !s.account && s.lec != null);
    return `<section id="attendance" class="ev-sec"><h2 class="h3">Attendance</h2>
      ${recs.length ? `<div class="ev-tiles">${tile(pct(rate(L)), `lecture attendance (${L.length} records)`)}${tile(pct(rate(B)), `lab attendance (${B.length} records)`)}${tile(pct(share(recs.filter((x) => x.by === "self").length, recs.filter((x) => x.status === "P" || x.status === "L").length)), "of present marks made by students themselves (QR or key)")}</div>
        <p class="small-note">Lecture attendance of students who use the site: ${pct(mean(acc.map((s) => s.lec)))} (${acc.length}); of students without an account: ${non.length >= MIN_GROUP ? pct(mean(non.map((s) => s.lec))) : "too few to compare"} (${non.length}).</p>` : `<p class="adm-empty">No attendance records yet.</p>`}</section>`;
  }

  function survey() {
    const R = Object.keys(SV.ROUNDS).map((k) => [k, D.survey.filter((x) => x.round === k && x.consent)]).filter(([, a]) => a.length);
    const all = D.survey.length, consent = D.survey.filter((x) => x.consent).length;
    if (!R.length) return `<section id="survey" class="ev-sec"><h2 class="h3">Course Survey</h2><p class="adm-empty">${all ? `${all} answers so far, none with consent for reports yet.` : "No answers yet."} Open a round on the <a href="survey.html">Course Survey</a> page.</p></section>`;
    const m = (a, k) => mean(a.map((x) => x.a[k]).filter((v) => v >= 1));
    const conf = SV.COS.map((c) => [`<span class="ex-co">${c}</span>`].concat(R.flatMap(([k, a]) => SV.later(k) ? [`${num(m(a, `b_${c}`), 2)} → <strong>${num(m(a, `n_${c}`), 2)}</strong>`] : [`<strong>${num(m(a, `n_${c}`), 2)}</strong>`])));
    const eng = SV.ENG.map(([k, t]) => [esc(t)].concat(R.map(([, a]) => num(m(a, k), 2))));
    const later = R.filter(([k]) => SV.later(k)), last = later[later.length - 1];
    const feat = last ? SV.FEAT.map(([k, t]) => { const a = last[1].map((x) => x.a[`f_${k}`]).filter((v) => v != null); const used = a.filter((v) => v >= 1); return { t, used: share(used.length, a.length), mean: mean(used) }; }).sort((x, y) => (y.mean || 0) - (x.mean || 0)) : [];
    const sus = last ? last[1].map((x) => SV.susScore(x.a)).filter((v) => v != null) : [];
    const grade = (s) => (s >= 85.5 ? "excellent" : s >= 71.4 ? "good" : s >= 50.9 ? "OK" : "poor");
    const quotes = D.survey.filter((x) => x.consent).flatMap((x) => ["o0", "o1", "o2"].filter((k) => x.a[k]).map((k) => ({ k, t: x.a[k], r: x.round })));
    const Q = { o0: "Expect to find hardest", o1: "Helped most", o2: "To improve" };
    return `<section id="survey" class="ev-sec"><h2 class="h3">Course Survey</h2>
      <p class="small-note">${all} answers, ${consent} with consent for reports (only these are shown). Scale 1 to 5.</p>
      ${table(["Round", "Answers (with consent)"], R.map(([k, a]) => [esc(SV.ROUNDS[k]), a.length]))}
      <h3 class="bd-h">Confidence in Each Course Outcome</h3><p class="small-note">From the middle round on, students also rate how confident they were before the course (before → now).</p>
      ${table(["CO"].concat(R.map(([k]) => esc(SV.ROUNDS[k]))), conf)}
      <h3 class="bd-h">How Students Learn</h3>${table(["Statement"].concat(R.map(([k]) => esc(SV.ROUNDS[k]))), eng)}
      ${last ? `<h3 class="bd-h">Usefulness of Each Part (${esc(SV.ROUNDS[last[0]])})</h3>
        ${table(["Part of the website", "Used it", "Usefulness (1–5, users only)"], feat.map((f) => [esc(f.t), pct(f.used), `${bar(f.mean ? (f.mean / 5) * 100 : 0)}${num(f.mean, 2)}`]))}
        <h3 class="bd-h">System Usability Scale</h3>
        <div class="ev-tiles">${tile(num(mean(sus), 1), `SUS score out of 100 (${sus.length} students)`)}${tile(sus.length ? grade(mean(sus)) : "–", "rating (68 is the usual average)")}${tile(num(sd(sus), 1), "standard deviation")}</div>` : ""}
      ${quotes.length ? `<h3 class="bd-h">In Their Own Words</h3><div class="ev-quotes">${Object.keys(Q).map((k) => { const q = quotes.filter((x) => x.k === k); return q.length ? `<h4>${Q[k]} (${q.length})</h4><ul>${q.map((x) => `<li>${esc(x.t)}</li>`).join("")}</ul>` : ""; }).join("")}</div>` : ""}</section>`;
  }

  function sharing() {
    const p = D.ev.published;
    return `<section id="share" class="ev-sec ev-noprint"><h2 class="h3">Export and Share</h2>
      <div class="ev-actions"><button type="button" class="btn" data-print>Print or save as PDF</button>
        <button type="button" class="btn ghost" data-csv="students">Download student data (anonymised CSV)</button>
        <button type="button" class="btn ghost" data-csv="survey">Download survey answers (anonymised CSV)</button></div>
      <h3 class="bd-h">The Public Showcase</h3>
      <p class="small-note"><a href="showcase.html">showcase.html</a> explains the innovation to visitors and judges, who can't sign in. Publishing copies class-level figures only: totals, averages and percentages, never a name or matric number, and no group of fewer than ${MIN_GROUP} students.${p ? ` Last published ${esc(new Date(p).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}.` : " Not published yet."}</p>
      <label class="ev-chk"><input type="checkbox" data-pubres checked> Include the results comparison (class averages by practice group)</label>
      <div class="ev-actions"><button type="button" class="btn" data-publish>Publish the figures to the showcase</button><a class="btn ghost" href="showcase.html" target="_blank" rel="noopener">Open the showcase ›</a>
        <span class="ev-msg" aria-live="polite">${esc(msg.publish || "")}</span></div></section>`;
  }

  function draw() {
    const NAV = [["summary", "At a Glance"], ["alignment", "Alignment"], ["attainment", "CO Attainment"], ["behaviour", "Try-First"], ["results", "Results"], ["game", "INSTRUMENTA"], ["attendance", "Attendance"], ["survey", "Survey"], ["share", "Export and Share"]];
    const y = window.scrollY;
    host.innerHTML = `<nav class="ev-nav ev-noprint" aria-label="Sections">${NAV.map(([h, t]) => `<a class="chip-btn" href="#${h}">${t}</a>`).join("")}<button type="button" class="btn ghost sm" data-reload>Refresh</button></nav>
      ${summary()}${alignment()}${attainment()}${behaviour()}${results()}${game()}${attendance()}${survey()}${sharing()}`;
    window.scrollTo(0, y);
  }

  /* ---------- saving: marks, the previous cohort, the showcase ---------- */
  const ref = () => db.collection("evidence").doc(KEY);
  async function importMarks(f) {
    const name = f.name.value.trim(), max = +f.max.value, co = f.co.value, out = {}, bad = [];
    if (!name || !(max > 0)) { msg.import = "Give the assessment a name and the full mark (out of)."; draw(); return; }
    const byMatric = Object.fromEntries(D.roster.map((r) => [String(r.matric || "").trim(), r.id]));
    f.rows.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const parts = l.split(/[\t,;]+|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      if (parts.length < 2) return;
      const id = parts[0].toLowerCase(), mark = parseFloat(parts[parts.length - 1]);
      const em = id.includes("@") ? (D.roster.some((r) => r.id === id) ? id : null) : byMatric[parts[0]];
      if (!isFinite(mark)) { if (!/^[a-z]/i.test(parts[parts.length - 1])) bad.push(parts[0]); return; }   // a header line is skipped quietly
      if (!em) { bad.push(parts[0]); return; }
      if (mark < 0 || mark > max) { bad.push(`${parts[0]} (${mark})`); return; }
      out[em] = mark;
    });
    if (!Object.keys(out).length) { msg.import = `No marks matched the class list${bad.length ? ` (not matched: ${bad.slice(0, 5).join(", ")})` : ""}.`; draw(); return; }
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "set";
    const set = { name, co, max, marks: out, at: new Date().toISOString(), by: A.state.user.email.toLowerCase() };
    try {
      await ref().set({ semester: SEM, sets: { [key]: set }, updatedAt: FV.serverTimestamp() }, { merge: true });
      D.ev.sets[key] = set; build();
      msg.import = `Saved ${Object.keys(out).length} marks for ${name}.${bad.length ? ` Not matched or out of range: ${bad.join(", ")}.` : ""}`;
    } catch (e) { msg.import = `Could not save (${e.code || e}).`; }
    draw();
  }
  async function savePrev(f) {
    const key = f.dataset.prev, val = (x) => (x.value === "" ? null : +x.value);
    const p = { label: f.label.value.trim(), mean: val(f.mean), pass: val(f.pass) };
    try { await ref().set({ semester: SEM, prev: { [key]: p } }, { merge: true }); D.ev.prev = Object.assign({}, D.ev.prev, { [key]: p }); msg[`prev-${key}`] = "Saved ✓"; }
    catch (e) { msg[`prev-${key}`] = `Could not save (${e.code || e}).`; }
    draw();
  }
  async function delSet(key) {
    if (!confirm(`Remove the marks of "${D.ev.sets[key].name}" from this page?`)) return;
    try { await ref().update({ [`sets.${key}`]: FV.delete() }); delete D.ev.sets[key]; build(); } catch (e) { alert(`Could not remove: ${e.code || e}`); }
    draw();
  }
  // class-level figures for the public showcase: no names, no matric numbers, no group under MIN_GROUP
  function figures(withResults) {
    const S = D.students, acc = S.filter((s) => s.account), recs = acc.flatMap((s) => Object.values(s.log)), sol = recs.filter((r) => r.solved);
    const ok = (n, v) => (n >= MIN_GROUP ? v : null), r1 = (x) => (x == null || isNaN(x) ? null : Math.round(x * 10) / 10);
    const co = {}; Object.keys(D.coIds).forEach((c) => { const v = acc.map((s) => s.co[c]).filter((x) => x != null); co[c] = { items: D.coIds[c].length, mean: ok(v.length, r1(mean(v))), reach: ok(v.length, r1(share(v.filter((x) => x >= PASS).length, v.length))) }; });
    const lab = S.map((s) => s.lab).filter((x) => x != null), pl = acc.filter((s) => s.stations.length);
    const rate = (k) => { const a = D.att.filter((x) => x.kind === k); return ok(a.length, r1(share(a.filter((x) => x.status === "P" || x.status === "L").length, a.length))); };
    const sv = D.survey.filter((x) => x.consent), later = Object.keys(SV.ROUNDS).filter((k) => SV.later(k) && sv.some((x) => x.round === k)).pop();
    const last = later ? sv.filter((x) => x.round === later) : [], sus = last.map((x) => SV.susScore(x.a)).filter((v) => v != null);
    const conf = {}; if (later) SV.COS.forEach((c) => { const b = last.map((x) => x.a[`b_${c}`]).filter((v) => v >= 1), n = last.map((x) => x.a[`n_${c}`]).filter((v) => v >= 1); conf[c] = { before: ok(b.length, r1(mean(b))), now: ok(n.length, r1(mean(n))) }; });
    const feat = later ? SV.FEAT.map(([k, t]) => { const u = last.map((x) => x.a[`f_${k}`]).filter((v) => v >= 1); return { t, mean: ok(u.length, r1(mean(u))), n: u.length }; }).filter((f) => f.mean != null).sort((a, b) => b.mean - a.mean) : [];
    const res = !withResults ? [] : Object.entries(D.ev.sets).map(([k, s]) => {
      const v = S.map((x) => x.marks[k]).filter((x) => x != null), g = groups(k), p = (D.ev.prev || {})[k] || {};
      return { name: s.name, co: s.co, n: v.length, mean: ok(v.length, r1(mean(v))), pass: ok(v.length, r1(share(v.filter((x) => x >= PASS).length, v.length))), r: g.r == null ? null : Math.round(g.r * 100) / 100,
        groups: g.rows.map((x) => ({ t: x.t, n: x.n, mean: ok(x.n, r1(x.mean)) })), prev: p.mean != null ? { label: p.label || "", mean: p.mean, pass: p.pass } : null };
    }).filter((x) => x.mean != null);
    return { semester: SEM, week: NOW_WEEK(), students: S.length, accounts: acc.length, solved: sol.length, checks: recs.reduce((a, r) => a + (r.checks || 0), 0),
      firstTry: r1(share(sol.filter((r) => r.wrong === 0).length, sol.length)), afterHint: r1(share(sol.filter((r) => r.wrong > 0).length, sol.length)),
      exercises: Object.keys(G.CATALOG).length, co, lab: { n: lab.length, mean: ok(lab.length, r1(mean(lab))), pass: ok(lab.length, r1(share(lab.filter((x) => x >= PASS).length, lab.length))), prev: (D.ev.prev || {}).lab || null },
      attendance: { lecture: rate("lecture"), lab: rate("lab") }, game: { players: pl.length, clears: pl.reduce((a, s) => a + s.stations.length, 0), bosses: pl.reduce((a, s) => a + s.stations.filter((id) => s.mis[id].boss).length, 0) },
      survey: later ? { round: SV.ROUNDS[later], n: last.length, sus: ok(sus.length, r1(mean(sus))), conf, feat } : null, results: res };
  }
  async function publish() {
    const withRes = !!(host.querySelector("[data-pubres]") || {}).checked;
    try {
      const f = figures(withRes), at = new Date().toISOString();
      await db.collection("meta").doc("showcase").set({ figures: f, publishedAt: at, by: A.state.user.email.toLowerCase() });
      await ref().set({ published: at }, { merge: true }); D.ev.published = at;
      msg.publish = "Published ✓ The showcase shows these figures now.";
    } catch (e) { msg.publish = `Could not publish (${e.code || e}). If this says permission-denied, publish the latest firebase/firestore.rules.`; }
    draw();
  }

  /* ---------- anonymised CSV ---------- */
  function csv(kind) {
    let head, lines;
    const code = {}; D.students.slice().sort((a, b) => String(a.r.matric).localeCompare(String(b.r.matric))).forEach((s, i) => { code[s.r.id] = `S${String(i + 1).padStart(3, "0")}`; });
    if (kind === "survey") {
      const byUid = Object.fromEntries(D.users.map((u) => [u.uid, String(u.email || "").toLowerCase()]));
      const keys = [...new Set(D.survey.flatMap((x) => Object.keys(x.a || {})))].sort();
      head = ["Student", "Round", "Consent"].concat(keys, ["SUS score"]);
      lines = D.survey.map((x) => [code[byUid[x.uid]] || "–", SV.ROUNDS[x.round] || x.round, x.consent ? "yes" : "no"].concat(keys.map((k) => (x.a || {})[k] == null ? "" : x.a[k]), [SV.susScore(x.a) == null ? "" : SV.susScore(x.a)]));
    } else {
      const sets = Object.entries(D.ev.sets), cos = Object.keys(D.coIds).sort();
      head = ["Student", "Section", "Signed in", "Exercises solved", "Solved on first try", "XP", "Active weeks", ...cos.map((c) => `${c} practice %`), "CO3 lab marks %", ...sets.map(([, s]) => `${s.name} %`), "Lecture attendance %", "Lab attendance %", "INSTRUMENTA stations"];
      lines = D.students.map((s) => [code[s.r.id], s.r.section || "", s.account ? "yes" : "no", s.solved.size, Object.values(s.log).filter((r) => r.solved && r.wrong === 0).length, s.g.xp, s.g.weeks.length,
        ...cos.map((c) => (s.co[c] == null ? "" : s.co[c].toFixed(1))), s.lab == null ? "" : s.lab.toFixed(1), ...sets.map(([k]) => (s.marks[k] == null ? "" : s.marks[k].toFixed(1))),
        s.lec == null ? "" : s.lec.toFixed(1), s.labAtt == null ? "" : s.labAtt.toFixed(1), s.stations.length]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }
    const text = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = `nmk42003-evidence-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  host.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-reload")) load();
    else if (b.hasAttribute("data-print")) window.print();
    else if (b.dataset.csv) csv(b.dataset.csv);
    else if (b.hasAttribute("data-publish")) { b.disabled = true; publish(); }
    else if (b.dataset.delset) delSet(b.dataset.delset);
  });
  host.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.matches("[data-import]")) importMarks(e.target);
    else if (e.target.matches("[data-prev]")) savePrev(e.target);
  });

  A.on((st) => {
    if (!st.user) { host.innerHTML = `<div class="adm-gate"><p>This page is for the course lecturers. Sign in with your UniMAP lecturer account.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`; host.querySelector("[data-signin]").onclick = () => A.signIn(); return; }
    if (!A.isAdmin(st.user.email)) { host.innerHTML = `<div class="callout warn"><strong>Lecturers only</strong>You are signed in as ${esc(st.user.email)}, which is not a lecturer account.</div>`; return; }
    if (!D) load();
  });
})();
