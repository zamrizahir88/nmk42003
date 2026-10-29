/* NMK42003 Name Picker (picker.html, lecturers only): picks a student to answer a question in class, with a fun
   animation starring the students' own INSTRUMENTA characters.
   - Styles: Meter Needle (the needle overshoots and settles: a second-order response), Bluetooth Pairing (a phone scans
     the heroes' phones and pairs with one) and Volt Calibrates (Volt's scanner beam sweeps the line and locks on).
   - Pool: the whole class, a lab section, a lab group, or the students marked Present / Late in one of today's sessions.
   - The winner is drawn first (crypto random, from the whole pool); the animation only shows it. Up to 10 heroes are
     on stage: the winner and nine others from the pool.
   - Lifelines after a pick: Ask a friend (the student chooses a helper) and Team up (a second student is drawn).
   - Firebase: the class list (roster), the rankings (boardsum, 1 document, holds every character) and meta/heronames
     when the page opens; today's sessions and one session's attendance only when "Present" is chosen. Every pick, switch
     and lifeline works on this device: no writes. Who has been picked is kept in this browser (nmk-pick, local only). */
(function () {
  "use strict";
  const host = document.getElementById("picker");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!window.NMKAccount || !window.NMKLegendsArt) { host.innerHTML = `<div class="callout warn"><strong>The page could not load</strong>Check your internet connection and reload the page.</div>`; return; }
  const A = window.NMKAccount, ART = window.NMKLegendsArt, db = A.db;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ls = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const PICK_KEY = "nmk-pick", SET_KEY = "nmk-pick-set";
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SECTION = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
  const STYLES = { meter: "Meter Needle", bt: "Bluetooth Pairing", volt: "Volt Calibrates" };
  const MAX_ON = 10;
  const HERO0 = { look: "m", hairM: "spiky", hairF: "long", face: "none", head: "none", eyes: "none", hair: "#1f1a17", skin: "#f6d5b5", color: "#0b6e6e", tud: "#e8d6c0", tudS: "bawal", brooch: "none", badge: "none", weapon: "sword", name: "" };
  const BOTC = ["#0b6e6e", "#1e3a5f", "#b3412e", "#6b4bb8", "#2f7d32", "#c2185b", "#c47f00", "#2f8cff"];
  const CHEER = ["Take a breath, you've got this.", "Any answer is a good start.", "Volt believes in you!", "Give it your best shot.", "No pressure: think out loud."];

  /* ---------- names ---------- */
  const title = (s) => String(s || "").toLowerCase().replace(/(^|[\s'/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  // the part before bin / binti / a/l / a/p / @, at most three words: "AHMAD ALI BIN ABU" → "Ahmad Ali"
  const shortName = (n) => { const w = String(n || "").split(/\s+(?:BIN|BINTI|BT|A\/L|A\/P|@)\s+/i)[0].trim().split(/\s+/); return title(w.slice(0, 3).join(" ")); };
  const nameOf = (st, mode) => {
    if (mode === "full") return title(st.name);
    if (mode === "short") return st.short;
    if (mode === "nick") return st.nick || st.short;
    return st.heroName || st.nick || st.short;
  };
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  /* ---------- state ---------- */
  const set = Object.assign({ mode: "all", sec: "", grp: "", ses: "", show: "hero", style: "meter", skip: true, snd: true }, ls.get(SET_KEY, {}));
  let picked = ls.get(PICK_KEY, { ids: [], log: [] });
  if (!Array.isArray(picked.ids)) picked = { ids: [], log: [] };
  let S = [], byId = {}, rankAt = 0, sessions = null, present = {}, busy = false, cast = [], styleNow = set.style === "any" ? "meter" : set.style, win = null;
  const saveSet = () => ls.set(SET_KEY, set);
  const savePicked = () => { picked.log = picked.log.slice(-200); ls.set(PICK_KEY, picked); };

  /* ---------- sound (made here, no files) ---------- */
  let ac = null;
  const actx = () => { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (e) { ac = null; } return ac; };
  function tone(f, dur, type = "square", vol = 0.05, at = 0) {
    if (!set.snd) return;
    const c = actx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const tick = () => tone(1600, 0.03, "square", 0.035);
  const clunk = () => tone(110, 0.09, "triangle", 0.12);
  const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.4 : 0.14, "triangle", 0.09, i * 0.11));

  /* ---------- drawing ---------- */
  const INK = ART.INK;
  const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h; };
  // students without a character: a friendly robot (no guess at anyone's look)
  const bot = (st) => { const c = BOTC[hash(st.id) % BOTC.length], O = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;
    return `<g><ellipse cx="0" cy="59" rx="30" ry="6" fill="#000" opacity=".18"/><rect x="-15" y="30" width="11" height="27" rx="4" fill="#2b3440" ${O}/><rect x="4" y="30" width="11" height="27" rx="4" fill="#2b3440" ${O}/>
      <rect x="-27" y="-8" width="54" height="44" rx="12" fill="${c}" ${O}/><circle cx="0" cy="14" r="8" fill="#ffd84d" ${O}/><path d="M-27 4 l-10 16 M27 4 l10 16" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <rect x="-23" y="-58" width="46" height="44" rx="13" fill="#f6f8fa" ${O}/><rect x="-17" y="-50" width="34" height="24" rx="8" fill="#15243a"/><circle cx="-7" cy="-38" r="3.6" fill="#5ad1ff"/><circle cx="7" cy="-38" r="3.6" fill="#5ad1ff"/>
      <path d="M0 -58 V-70" stroke="${INK}" stroke-width="2.5"/><circle cx="0" cy="-73" r="4.5" fill="#ffd84d" ${O}/></g>`; };
  const heroOf = (st) => (st.hero ? ART.heroSvg(st.hero) : bot(st));
  const VOLT = `<rect class="pk-prop" x="-26" y="-30" width="20" height="4" rx="2" fill="#9aa9b8"/><rect class="pk-prop" x="6" y="-30" width="20" height="4" rx="2" fill="#9aa9b8"/><path d="M-16 -26 V-18 M16 -26 V-18" stroke="#15243a" stroke-width="2"/>
    <circle r="20" fill="#f6f8fa" stroke="#15243a" stroke-width="2.5"/><rect x="-13" y="-9" width="26" height="16" rx="7" fill="#15243a"/><circle cx="-5" cy="-1" r="3" fill="#5ad1ff"/><circle cx="5" cy="-1" r="3" fill="#5ad1ff"/>
    <path d="M-12 12 H12" stroke="#0b6e6e" stroke-width="3" stroke-linecap="round"/><path d="M1 9 L-3 15 L0 15 L-2 20 L4 13 L1 13 Z" fill="#f0a830"/>`;
  // one hero on stage: feet at (x, y), drawn at scale s (mirrored when flip), with its name tag under the feet
  const heroAt = (st, i, x, y, s, flip, extra = "") => `<g class="pk-h" data-i="${i}" transform="translate(${x} ${y})">
      <ellipse class="pk-glow" cx="0" cy="0" rx="${46 * s + 10}" ry="${12 * s + 4}" fill="#ffd84d"/>
      <g transform="translate(0 ${-59 * s}) scale(${flip ? -s : s} ${s})">${heroOf(st)}</g>${extra}
      <g class="pk-tag"><rect x="-52" y="6" width="104" height="24" rx="12"/><text x="0" y="23" text-anchor="middle">${esc(cut(nameOf(st, set.show), 12))}</text></g></g>`;
  const pt = (cx, cy, r, a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const meterAng = (i, n) => (n < 2 ? 0 : -76 + (152 * i) / (n - 1));

  function scene() {
    const n = cast.length, svg = $("#pkStage");
    let body = "";
    if (styleNow === "meter") {
      const C = [500, 500], arc = (r, a0, a1) => { const p0 = pt(C[0], C[1], r, a0), p1 = pt(C[0], C[1], r, a1); return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`; };
      const face = pt(C[0], C[1], 300, -86), face1 = pt(C[0], C[1], 300, 86);
      let ticks = "";
      for (let a = -80; a <= 80; a += 4) { const big = a % 20 === 0, p0 = pt(C[0], C[1], big ? 228 : 240, a), p1 = pt(C[0], C[1], 256, a); ticks += `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="${INK}" stroke-width="${big ? 3 : 1.5}"/>`; }
      cast.forEach((st, i) => { const a = meterAng(i, n), p0 = pt(C[0], C[1], 262, a), p1 = pt(C[0], C[1], 292, a); ticks += `<path class="pk-mk" data-i="${i}" d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke-width="7" stroke-linecap="round"/>`; });
      body = `<path d="M${face[0].toFixed(1)} ${face[1].toFixed(1)} A300 300 0 0 1 ${face1[0].toFixed(1)} ${face1[1].toFixed(1)} L${C[0]} ${C[1]} Z" fill="#f4efe1" stroke="${INK}" stroke-width="4"/>
        <path d="${arc(250, -80, -20)}" stroke="#2f7d32" stroke-width="10" fill="none"/><path d="${arc(250, -20, 30)}" stroke="#e0b341" stroke-width="10" fill="none"/><path d="${arc(250, 30, 80)}" stroke="#c0392b" stroke-width="10" fill="none"/>
        ${ticks}<text x="500" y="350" text-anchor="middle" class="pk-mtxt">NMK42003</text><text x="500" y="378" text-anchor="middle" class="pk-msub">STUDENT-O-METER</text>
        ${cast.map((st, i) => { const p = pt(C[0], C[1], 375, meterAng(i, n)); return heroAt(st, i, p[0].toFixed(1), (p[1] + 12).toFixed(1), 0.62, false); }).join("")}
        <g id="pkNeedle" transform="rotate(-82 500 500)"><path d="M494 520 L500 222 L506 520 Z" fill="#c0392b" stroke="${INK}" stroke-width="2"/><circle cx="500" cy="500" r="24" fill="${INK}"/><circle cx="500" cy="500" r="9" fill="#e3e9f0"/></g>
        <rect x="300" y="514" width="400" height="40" rx="10" fill="#0b1320" stroke="#38e1c9" stroke-width="2"/><text x="500" y="541" text-anchor="middle" class="pk-read" id="pkRead">READY</text>`;
    } else if (styleNow === "bt") {
      const L = Math.ceil(n / 2), R = n - L, rowH = Math.min(34, 320 / Math.max(n, 1)), side = (k, cnt) => (cnt < 2 ? 300 : 150 + (k * 320) / (cnt - 1));
      const pos = cast.map((st, i) => { const right = i >= L, k = right ? i - L : i, cnt = right ? R : L; return { x: right ? (k % 2 ? 735 : 880) : (k % 2 ? 265 : 120), y: side(k, cnt), right }; });
      body = `${reduce ? "" : `<g class="pk-rip">${[0, 0.9, 1.8].map((d) => `<circle cx="500" cy="280" r="40" fill="none" stroke="#38e1c9" stroke-width="3"><animate attributeName="r" values="60;330" dur="2.7s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="2.7s" begin="${d}s" repeatCount="indefinite"/></circle>`).join("")}</g>`}
        ${cast.map((st, i) => { const p = pos[i], s = 0.6; return heroAt(st, i, p.x, p.y, s, p.right, `<g class="pk-ph" data-i="${i}" transform="translate(${p.right ? -34 : 34} ${-118 * s - 10})"><rect x="-8" y="-14" width="16" height="28" rx="3"/><rect x="-5.5" y="-10" width="11" height="17" rx="1.5" class="pk-phs"/></g>`); }).join("")}
        <rect x="395" y="34" width="210" height="496" rx="32" fill="#0b1320" stroke="#38e1c9" stroke-width="3"/><rect x="407" y="70" width="186" height="440" rx="14" fill="#f6f8fa"/><rect x="470" y="46" width="60" height="8" rx="4" fill="#26364a"/>
        <text x="420" y="100" class="pk-bth">Bluetooth</text><rect x="545" y="86" width="36" height="20" rx="10" fill="#2f8cff"/><circle cx="571" cy="96" r="7" fill="#fff"/>
        <text x="420" y="126" class="pk-bts" id="pkBtSt">Tap Pick to scan</text>
        ${cast.map((st, i) => `<g class="pk-row" data-i="${i}" transform="translate(413 ${140 + i * rowH})"><rect width="174" height="${rowH - 4}" rx="7"/><text x="10" y="${(rowH - 4) / 2 + 5}">📱 ${esc(cut(nameOf(st, set.show), 15))}</text></g>`).join("")}`;
    } else {
      const s = n > 8 ? 0.8 : 0.9, x = (i) => (n < 2 ? 500 : 70 + (i * 860) / (n - 1));
      body = `<text x="40" y="58" class="pk-vt">Volt is calibrating the class…</text>
        <g transform="translate(830 52)"><rect x="-130" y="-30" width="260" height="60" rx="10" fill="#0b1320" stroke="#38e1c9" stroke-width="2"/><text x="0" y="-8" text-anchor="middle" class="pk-msub" fill="#9fb3c8">CALIBRATION ERROR</text><text x="0" y="20" text-anchor="middle" class="pk-read" id="pkErr">—</text></g>
        <path d="M40 492 H960" stroke="#38e1c9" stroke-width="2" opacity=".35"/>
        ${cast.map((st, i) => heroAt(st, i, x(i).toFixed(1), 480, s, false)).join("")}
        <g id="pkVolt" transform="translate(${x(0)} 150)"><path id="pkBeam" d="M-12 18 L12 18 L52 ${330 - 118 * s} L-52 ${330 - 118 * s} Z"/><g transform="scale(1.7)">${VOLT}</g></g>`;
    }
    svg.innerHTML = `<defs><pattern id="pkGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#38e1c9" stroke-width=".6" opacity=".18"/></pattern></defs>
      <rect width="1000" height="560" fill="#14213d"/><rect width="1000" height="560" fill="url(#pkGrid)"/>${body}`;
    svg.setAttribute("aria-label", `${STYLES[styleNow]}: ${n} students on stage`);
  }
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const light = (i) => { $$(".pk-h, .pk-row, .pk-ph, .pk-mk", $("#pkStage")).forEach((g) => g.classList.toggle("on", +g.dataset.i === i)); };

  /* ---------- the three animations: each ends on cast index w ---------- */
  const frames = (dur, f) => new Promise((done) => { const t0 = performance.now(); const step = (now) => { const t = Math.min(1, (now - t0) / dur); f(t, now - t0); if (t < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  async function runMeter(w) {
    const n = cast.length, target = meterAng(w, n), needle = $("#pkNeedle"), read = $("#pkRead"), z = 0.22, wn = 4.4, wd = wn * Math.sqrt(1 - z * z);
    let last = -1, pinned = false;
    const near = (a) => (n < 2 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((a + 76) * (n - 1)) / 152))));
    const show = (a) => { needle.setAttribute("transform", `rotate(${a.toFixed(2)} 500 500)`); const k = near(a); if (k !== last) { last = k; light(k); read.textContent = cut(nameOf(cast[k], set.show), 20).toUpperCase(); tick(); } };
    await frames(450, (t) => show(-82 + Math.sin(t * 40) * 1.5));   // the needle twitches at zero
    await frames(5200, (t, ms) => {
      const s = ms / 1000, a0 = -82;
      let a = target + (a0 - target) * Math.exp(-z * wn * s) * (Math.cos(wd * s) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * s));
      if (a > 86 || a < -86) { a = Math.sign(a) * 86; if (!pinned) { pinned = true; clunk(); } } else pinned = false;
      show(t >= 1 ? target : a);
    });
    show(target);
  }
  async function runBt(w) {
    const n = cast.length, st = $("#pkBtSt");
    st.textContent = "Scanning for devices…";
    let k = rnd(n), steps = 26 + ((w - k - 26) % n + n) % n, dt = 55;
    for (let i = 0; i < steps; i++) { k = (k + 1) % n; light(k); tick(); await sleep(dt); dt = Math.min(dt * 1.085, 520); }
    light(w);
    for (let d = 0; d < 3; d++) { st.textContent = `Pairing${".".repeat(d + 1)}`; tone(880 + d * 120, 0.06, "sine", 0.05); await sleep(320); }
    st.textContent = "✓ Paired";
  }
  async function runVolt(w) {
    const n = cast.length, V = $("#pkVolt"), err = $("#pkErr"), xs = $$(".pk-h", $("#pkStage")).map((g) => +g.getAttribute("transform").match(/translate\(([-\d.]+)/)[1]);
    if (n < 2) { light(0); return; }
    const L = n - 1, total = 4 * L + w, tri = (u) => { const m = u % (2 * L); return m > L ? 2 * L - m : m; };
    let last = -1;
    await frames(6000, (t) => {
      const e = 1 - Math.pow(1 - t, 3), u = tri(e * total), i = Math.floor(u), x = xs[i] + (xs[Math.min(L, i + 1)] - xs[i]) * (u - i), k = Math.round(u);
      V.setAttribute("transform", `translate(${x.toFixed(1)} 150)`);
      if (k !== last) { last = k; light(k); tick(); }
      err.textContent = (0.999 * Math.pow(1 - t, 1.6)).toFixed(3);
    });
    V.setAttribute("transform", `translate(${xs[w]} 150)`); light(w); err.textContent = "0.000"; V.classList.add("lock");
  }

  /* ---------- the pool ---------- */
  function pool() {
    let p = S;
    if (set.mode === "sec") p = S.filter((s) => s.section === set.sec);
    else if (set.mode === "grp") p = S.filter((s) => `${s.section}-${s.group}` === set.grp);
    else if (set.mode === "att") p = present[set.ses] ? S.filter((s) => present[set.ses].has(s.id)) : [];
    return p;
  }
  const waiting = () => { const p = pool(); return set.skip ? p.filter((s) => !picked.ids.includes(s.id)) : p; };
  function markPicked(st, how) { if (!picked.ids.includes(st.id)) picked.ids.push(st.id); picked.log.push({ e: st.id, at: Date.now(), how }); savePicked(); drawList(); }

  // up to 10 on stage: the winner (already drawn) and others from the pool
  function makeCast(w) {
    const avail = waiting().filter((s) => s !== w), others = shuffle(avail.length >= MAX_ON - 1 ? avail.slice() : avail.concat(pool().filter((s) => s !== w && !avail.includes(s)))).slice(0, MAX_ON - 1);
    return shuffle(others.concat([w]));
  }
  function idleCast() { const p = waiting().length ? waiting() : pool(); cast = shuffle(p.slice()).slice(0, MAX_ON); }

  async function pick() {
    if (busy) return;
    const avail = waiting();
    if (!avail.length) { status(); return; }
    busy = true; closeResult(); actx();
    styleNow = set.style === "any" ? Object.keys(STYLES)[rnd(3)] : set.style;
    win = avail[rnd(avail.length)]; cheer = CHEER[rnd(CHEER.length)]; confetti = true;
    cast = makeCast(win);
    const w = cast.indexOf(win);
    scene(); status();
    $("#pkGo").disabled = true;
    if (reduce) { light(w); await sleep(300); }
    else if (styleNow === "meter") await runMeter(w);
    else if (styleNow === "bt") await runBt(w);
    else await runVolt(w);
    $("#pkStage").classList.add("won");
    fanfare();
    markPicked(win, "pick");
    await sleep(reduce ? 0 : 650);
    showResult();
    busy = false; $("#pkGo").disabled = false; status();
  }

  /* ---------- the result card and the lifelines ---------- */
  const LEAD = { meter: "The needle has settled on…", bt: "Paired with…", volt: "Calibrated! Volt found…" };
  let team = null, helper = null, friendLayer = null, cheer = "", confetti = true;
  const fig = (st, role) => `<figure class="pk-fig${role ? " sm" : ""}"><svg viewBox="-70 -90 150 160" aria-hidden="true">${heroOf(st)}</svg>
      <figcaption>${role ? `<span class="pk-role">${role}</span>` : ""}<strong>${esc(nameOf(st, set.show))}</strong></figcaption></figure>`;
  function showResult() {
    const r = $("#pkResult");
    r.innerHTML = `<div class="pk-rcard${confetti ? "" : " calm"}" role="dialog" aria-label="Picked student">${reduce || !confetti ? "" : `<div class="pk-conf" aria-hidden="true">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${rnd(100)}%;--d:${(rnd(90) / 100).toFixed(2)}s;--c:${["#38e1c9", "#ffd84d", "#8b5cf6", "#ff7a59", "#2f8cff"][i % 5]}"></i>`).join("")}</div>`}
      <p class="pk-lead">${LEAD[styleNow]}</p>
      <div class="pk-figs">${fig(win)}${team ? fig(team, "Team-mate") : ""}${helper ? fig(helper, "Helper") : ""}</div>
      <p class="pk-cheer">⚡ ${esc(nameOf(win, set.show))}, you're in the spotlight! ${cheer}</p>
      <div class="pk-life"><button type="button" class="btn ghost" data-friend${helper ? " disabled" : ""}>🤝 Ask a friend</button><button type="button" class="btn ghost" data-team${team ? " disabled" : ""}>👥 Team up</button><button type="button" class="btn" data-done>✔ Done</button></div>
      <div class="pk-friend" hidden></div></div>`;
    r.hidden = false; confetti = false;
    $("[data-done]", r).focus();
  }
  function closeResult() { const r = $("#pkResult"); if (r) { r.hidden = true; r.innerHTML = ""; } team = null; helper = null; if (friendLayer) { friendLayer.closed(); friendLayer = null; } const s = $("#pkStage"); if (s) s.classList.remove("won"); }
  async function teamUp(btn) {
    const others = waiting().filter((s) => s !== win), from = others.length ? others : pool().filter((s) => s !== win);
    if (!from.length) { btn.textContent = "No one else in the pool"; btn.disabled = true; return; }
    btn.disabled = true;
    const pickT = from[rnd(from.length)];
    for (let i = 0; i < (reduce ? 0 : 14); i++) { btn.textContent = `👥 ${cut(nameOf(from[rnd(from.length)], set.show), 16)}`; tick(); await sleep(60 + i * 12); }
    team = pickT; markPicked(team, "team"); tone(988, 0.15, "triangle", 0.08);
    showResult();
  }
  function friendList(box) {
    const all = pool().filter((s) => s !== win && s !== team);
    box.hidden = false;
    box.innerHTML = `<label class="pk-flbl" for="pkFq">Who would you like to help you? <span>Type a name</span></label><input id="pkFq" type="search" autocomplete="off">
      <div class="pk-fl" role="list"></div><button type="button" class="btn ghost pk-fx" data-fx>Cancel</button>`;
    const list = $(".pk-fl", box), q = $("#pkFq", box);
    const draw = () => { const t = q.value.trim().toLowerCase(), m = all.filter((s) => !t || [nameOf(s, set.show), s.name, s.nick, s.heroName].some((x) => String(x || "").toLowerCase().includes(t))).slice(0, 30);
      list.innerHTML = m.length ? m.map((s) => `<button type="button" role="listitem" data-h="${esc(s.id)}">${esc(nameOf(s, set.show))}</button>`).join("") : `<p class="small-note">No one found.</p>`; };
    q.addEventListener("input", draw); draw(); q.focus();
    friendLayer = window.NMKBack ? NMKBack.layer(() => { friendLayer = null; box.hidden = true; box.innerHTML = ""; }) : null;
  }

  /* ---------- the page ---------- */
  function drawList() {
    const box = $("#pkList"); if (!box) return;
    const rows = picked.log.slice().reverse().filter((x) => byId[x.e]);
    const fmt = (t) => { const d = new Date(t + 8 * 3600000), h = d.getUTCHours(); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}, ${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
    box.innerHTML = `<div class="pk-lh"><h2 class="h3">Picked So Far (${picked.ids.filter((e) => byId[e]).length})</h2>${picked.ids.length ? `<button type="button" class="btn ghost" data-reset>Start a new round for everyone</button>` : ""}</div>
      ${rows.length ? `<ol class="pk-log">${rows.slice(0, 40).map((x) => { const st = byId[x.e], back = picked.ids.includes(x.e); return `<li><span class="pk-lt">${fmt(x.at)}</span><strong>${esc(nameOf(st, set.show))}</strong>${set.show !== "full" ? `<span class="pk-ln">${esc(title(st.name))}</span>` : ""}<span class="pk-how">${x.how === "team" ? "Team up" : ""}</span>${back ? `<button type="button" class="pk-back" data-back="${esc(x.e)}" title="Put back in the pool">↺ Put back</button>` : ""}</li>`; }).join("")}</ol>`
        : `<p class="small-note">No one picked yet. Students picked here sit out until everyone in the pool has had a turn (when "Skip students already picked" is ticked).</p>`}`;
  }
  function status() {
    const p = pool(), wt = waiting(), el = $("#pkInfo"); if (!el) return;
    const go = $("#pkGo"), empty = !p.length;
    let msg;
    if (set.mode === "att" && !set.ses) msg = "Choose a session.";
    else if (set.mode === "att" && !present[set.ses]) msg = "Loading who is present…";
    else if (empty) msg = set.mode === "att" ? "No one is marked Present or Late in this session yet." : "No students here.";
    else if (!wt.length) msg = `Everyone here (${p.length}) has had a turn. <button type="button" class="pk-inl" data-round>Start a new round</button>`;
    else msg = `<strong>${wt.length}</strong> of ${p.length} student${p.length === 1 ? "" : "s"} waiting for a turn${p.length > MAX_ON ? ` · ${MAX_ON} on stage, and everyone in the pool has the same chance` : ""}.`;
    el.innerHTML = msg;
    go.disabled = busy || !wt.length;
  }
  function options() {
    const secs = [...new Set(S.map((s) => s.section).filter(Boolean))].sort((a, b) => Object.keys(SECTION).indexOf(a) - Object.keys(SECTION).indexOf(b));
    const grps = [...new Set(S.filter((s) => s.section && s.group).map((s) => `${s.section}-${s.group}`))].sort((a, b) => { const [x, i] = a.split("-"), [y, j] = b.split("-"); return Object.keys(SECTION).indexOf(x) - Object.keys(SECTION).indexOf(y) || i - j; });
    if (!secs.includes(set.sec)) set.sec = secs[0] || "";
    if (!grps.includes(set.grp)) set.grp = grps[0] || "";
    $("#pkSec").innerHTML = secs.map((s) => `<option value="${s}"${s === set.sec ? " selected" : ""}>${SECTION[s] || s} section (${S.filter((x) => x.section === s).length})</option>`).join("");
    $("#pkGrp").innerHTML = grps.map((g) => { const [s, n] = g.split("-"); return `<option value="${g}"${g === set.grp ? " selected" : ""}>${SECTION[s] || s}, group ${n} (${S.filter((x) => `${x.section}-${x.group}` === g).length})</option>`; }).join("");
    $("#pkSecL").hidden = set.mode !== "sec"; $("#pkGrpL").hidden = set.mode !== "grp"; $("#pkSesL").hidden = set.mode !== "att";
  }
  const todayYMD = () => { const q = new URLSearchParams(location.search).get("today"); return /^\d{4}-\d{2}-\d{2}$/.test(q || "") ? q : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); };
  async function loadSessions() {
    const sel = $("#pkSes");
    if (!sessions) {
      sel.innerHTML = `<option value="">Loading today's sessions…</option>`;
      try { const q = await db.collection("sessions").where("date", "==", todayYMD()).get(); sessions = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => String(a.start).localeCompare(String(b.start))); }
      catch (e) { sessions = []; sel.innerHTML = `<option value="">Could not load the sessions (${esc(e.code || e)})</option>`; return; }
    }
    if (!sessions.find((s) => s.id === set.ses)) set.ses = (sessions.find((s) => s.state === "open") || sessions[0] || {}).id || "";
    sel.innerHTML = sessions.length ? sessions.map((s) => `<option value="${esc(s.id)}"${s.id === set.ses ? " selected" : ""}>${esc(s.title)}${s.start ? ` · ${esc(s.start)}` : ""}${s.state === "open" ? " (open now)" : ""}</option>`).join("") : `<option value="">No sessions today</option>`;
    await loadPresent();
  }
  async function loadPresent(fresh) {
    const sid = set.ses; if (!sid || (present[sid] && !fresh)) { refresh(); return; }
    status();
    try { const q = await db.collection("attendance").where("session", "==", sid).get(); present[sid] = new Set(q.docs.map((d) => d.data()).filter((a) => a.status === "P" || a.status === "L").map((a) => String(a.email).toLowerCase())); }
    catch (e) { present[sid] = new Set(); }
    refresh();
  }
  function refresh() { options(); saveSet(); if (!busy) { closeResult(); idleCast(); styleNow = set.style === "any" ? styleNow : set.style; scene(); } status(); drawList(); }

  function build() {
    host.innerHTML = `<div class="pk-setup">
        <label>Pick from<select id="pkMode"><option value="all">Whole class</option><option value="sec">A lab section</option><option value="grp">A lab group</option><option value="att">Present in a session today</option></select></label>
        <label id="pkSecL" hidden>Section<select id="pkSec"></select></label>
        <label id="pkGrpL" hidden>Group<select id="pkGrp"></select></label>
        <label id="pkSesL" hidden>Session<span class="pk-sesrow"><select id="pkSes"></select><button type="button" class="pk-inl" data-reload title="Read the attendance again">⟳</button></span></label>
        <label>Show<select id="pkShow"><option value="hero">Hero name</option><option value="nick">Nickname</option><option value="short">Short name</option><option value="full">Full name</option></select></label>
        <label>Style<select id="pkStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}<option value="any">Surprise me</option></select></label>
        <label class="pk-chk"><input type="checkbox" id="pkSkip"> Skip students already picked</label>
      </div>
      <p class="small-note pk-note">A student with no hero name shows their nickname, then their short name. Students without an INSTRUMENTA character appear as a robot. Characters come from the class rankings: ${esc(A.rankNote(rankAt).replace("Rankings are updated", "updated"))}</p>
      <div class="pk-wrap" id="pkWrap">
        <div class="pk-bar"><p id="pkInfo" aria-live="polite"></p><span class="pk-tools"><button type="button" class="pk-tb" id="pkSnd" aria-pressed="${set.snd}"></button><button type="button" class="pk-tb" id="pkFull">⛶ Full screen</button></span></div>
        <div class="pk-box"><svg id="pkStage" class="pk-stage" viewBox="0 0 1000 560" role="img"></svg><div class="pk-result" id="pkResult" hidden></div></div>
        <div class="pk-go"><button type="button" class="btn pk-gob" id="pkGo">🎯 Pick a student</button><span class="pk-key">or press Space</span></div>
      </div>
      <section class="pk-side" id="pkList" aria-label="Picked so far"></section>`;
    $("#pkMode").value = set.mode; $("#pkShow").value = set.show; $("#pkStyle").value = set.style; $("#pkSkip").checked = set.skip;
    const snd = () => { $("#pkSnd").textContent = set.snd ? "🔊 Sound on" : "🔇 Sound off"; $("#pkSnd").setAttribute("aria-pressed", String(set.snd)); };
    snd();
    $("#pkMode").addEventListener("change", (e) => { set.mode = e.target.value; if (set.mode === "att") { options(); loadSessions(); } else refresh(); });
    $("#pkSec").addEventListener("change", (e) => { set.sec = e.target.value; refresh(); });
    $("#pkGrp").addEventListener("change", (e) => { set.grp = e.target.value; refresh(); });
    $("#pkSes").addEventListener("change", (e) => { set.ses = e.target.value; loadPresent(); });
    $("#pkShow").addEventListener("change", (e) => { set.show = e.target.value; if (!busy) { scene(); if (win && !$("#pkResult").hidden) showResult(); } saveSet(); drawList(); });
    $("#pkStyle").addEventListener("change", (e) => { set.style = e.target.value; if (set.style !== "any") styleNow = set.style; saveSet(); if (!busy) { closeResult(); scene(); } });
    $("#pkSkip").addEventListener("change", (e) => { set.skip = e.target.checked; refresh(); });
    $("#pkSnd").addEventListener("click", () => { set.snd = !set.snd; saveSet(); snd(); });
    $("#pkGo").addEventListener("click", pick);
    const wrap = $("#pkWrap");
    const full = (on) => { wrap.classList.toggle("pk-full", on); document.body.classList.toggle("pk-noscroll", on); $("#pkFull").textContent = on ? "✕ Exit full screen" : "⛶ Full screen";
      try { if (on && wrap.requestFullscreen && !document.fullscreenElement) wrap.requestFullscreen().catch(() => {}); if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* not supported: the page fills the window */ } };
    $("#pkFull").addEventListener("click", () => full(!wrap.classList.contains("pk-full")));
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && wrap.classList.contains("pk-full")) full(false); });
    document.addEventListener("keydown", (e) => {
      if (e.target.closest && e.target.closest("input, select, textarea, button, a")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!$("#pkResult").hidden && !busy) closeResult(); else pick(); }
      else if (e.key === "Escape" && wrap.classList.contains("pk-full")) full(false);
    });
    host.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("[data-reload]")) loadPresent(true);
      else if (t.closest("[data-round]")) { const ids = new Set(pool().map((s) => s.id)); picked.ids = picked.ids.filter((x) => !ids.has(x)); savePicked(); refresh(); }
      else if (t.closest("[data-reset]")) { const b = t.closest("[data-reset]"); if (b.dataset.sure) { picked = { ids: [], log: picked.log }; savePicked(); refresh(); } else { b.dataset.sure = "1"; b.textContent = "Tap again to put everyone back"; } }
      else if (t.closest("[data-back]")) { const id = t.closest("[data-back]").dataset.back; picked.ids = picked.ids.filter((x) => x !== id); savePicked(); status(); drawList(); }
      else if (t.closest("[data-done]")) closeResult();
      else if (t.closest("[data-team]")) teamUp(t.closest("[data-team]"));
      else if (t.closest("[data-friend]")) friendList($(".pk-friend"));
      else if (t.closest("[data-fx]")) { if (friendLayer) { friendLayer.closed(); friendLayer = null; } const b = $(".pk-friend"); b.hidden = true; b.innerHTML = ""; }
      else if (t.closest("[data-h]")) { helper = byId[t.closest("[data-h]").dataset.h]; if (friendLayer) { friendLayer.closed(); friendLayer = null; } tone(988, 0.15, "triangle", 0.08); showResult(); }
    });
    if (set.mode === "att") { options(); loadSessions(); } else refresh();
  }

  /* ---------- load: the class list, the rankings (characters) and the removed hero names ---------- */
  async function load() {
    host.innerHTML = `<p class="small-note">Loading the class…</p>`;
    try {
      const [r, b, hn] = await Promise.all([db.collection("roster").get(), A.boardRows().catch(() => null), db.collection("meta").doc("heronames").get().catch(() => null)]);
      const bans = (hn && hn.exists && hn.data().bans) || {}, rows = (b && b.rows) || [];
      rankAt = (b && b.at) || 0;
      const byM = {};
      rows.forEach((x) => { if (x.matric) byM[String(x.matric)] = x; });
      S = r.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => (x.status || "active") === "active").map((x) => {
        const bd = byM[String(x.matric)], g = bd && bd.game;
        let h = null; try { h = g && g.hero ? JSON.parse(g.hero) : null; } catch (e) { h = null; }
        const hn2 = h && h.name && bans[bd.uid] !== h.name ? String(h.name) : "";
        return { id: String(x.id).toLowerCase(), name: x.name || "", short: shortName(x.name), matric: String(x.matric || ""), section: x.section || "", group: +x.group || 0,
          nick: (bd && bd.nickname) || "", heroName: hn2, hero: h ? Object.assign({}, HERO0, h) : null };
      }).sort((a, b2) => a.name.localeCompare(b2.name));
      byId = Object.fromEntries(S.map((s) => [s.id, s]));
      if (!S.length) { host.innerHTML = `<div class="callout warn"><strong>No class list yet</strong>Load the class list in Attendance → Class List first.</div>`; return; }
      build();
    } catch (e) {
      host.innerHTML = `<div class="callout warn"><strong>Could not load the class</strong>${esc(e.code || e)}. Check your connection and reload the page.</div>`;
    }
  }
  let started = false;
  A.on((st) => {
    if (!st.user) { host.innerHTML = `<div class="adm-gate"><p>This page is for the course lecturers. Sign in with your UniMAP lecturer account.</p><button type="button" class="btn" data-signin>Sign in with Google</button></div>`; host.querySelector("[data-signin]").onclick = () => A.signIn(); return; }
    if (!A.isAdmin(st.user.email)) { host.innerHTML = `<div class="callout warn"><strong>Lecturers only</strong>You are signed in as ${esc(st.user.email)}, which is not a lecturer account.</div>`; return; }
    if (!started) { started = true; load(); }
  });
})();
