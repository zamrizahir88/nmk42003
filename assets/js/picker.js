/* NMK42003 Name Picker (picker.html, lecturers only): picks a student to answer a question in class, with a fun
   animation starring the students' own INSTRUMENTA characters. The whole pool is on stage as a crowd (up to 80; a
   bigger pool shows 80 of them); the student the animation passes over pops up bigger, with their name in the banner.
   - Styles: Meter Needle (the needle hunts, nearly settles on a neighbour, then settles: a second-order response),
     Bluetooth Pairing (the phone discovers every student's phone, cycles through them, nearly connects to one, then
     pairs) and Volt Calibrates (Volt scans the crowd round by round; students who pass sit down: 61 → 31 → 16 → 8 → 5 → 1).
   - Length: Quick (~6 s), Normal (~12 s, default) or Dramatic (~20 s). Sci-fi signal sounds, no files.
   - Pool: the whole class, a lab section, a lab group, or the students marked Present / Late in one of today's sessions.
   - The winner is drawn first (crypto random); the animation only shows it.
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
  const LENGTH = { quick: ["Quick (about 6 s)", 6000], normal: ["Normal (about 12 s)", 12000], drama: ["Dramatic (about 20 s)", 20000] };
  const MAX_ON = 80, VW = 1000, VH = 640;
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
  const cut = (s, n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

  /* ---------- state ---------- */
  const set = Object.assign({ mode: "all", sec: "", grp: "", ses: "", show: "hero", style: "meter", len: "normal", skip: true, snd: true }, ls.get(SET_KEY, {}));
  if (!LENGTH[set.len]) set.len = "normal";
  let picked = ls.get(PICK_KEY, { ids: [], log: [] });
  if (!Array.isArray(picked.ids)) picked = { ids: [], log: [] };
  let S = [], byId = {}, rankAt = 0, sessions = null, present = {}, busy = false, cast = [], pos = [], styleNow = set.style === "any" ? "meter" : set.style, win = null;
  const saveSet = () => ls.set(SET_KEY, set);
  const savePicked = () => { picked.log = picked.log.slice(-200); ls.set(PICK_KEY, picked); };
  const LEN = () => LENGTH[set.len][1];

  /* ---------- sound: sci-fi signals, made here (no files) ---------- */
  let ac = null, hum = null;
  const actx = () => { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (e) { ac = null; } return ac; };
  // a pitch glide: f0 → f1 over dur seconds
  function glide(f0, f1, dur, type = "sine", vol = 0.05, at = 0) {
    if (!set.snd) return;
    const c = actx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  const blip = () => { const f = 700 + Math.random() * 700; glide(f, f * 1.7, 0.06, "sine", 0.045); };      // a signal "bleep"
  const ping = () => glide(1800, 2600, 0.09, "triangle", 0.04);                                                // a device found
  const wah = () => { glide(520, 180, 0.45, "sawtooth", 0.035); glide(780, 260, 0.45, "sine", 0.03, 0.05); }; // the near miss
  const sink = () => glide(600, 140, 0.35, "sine", 0.05);                                                      // students sit down
  const lockOn = () => [0, 0.09, 0.18].forEach((d, i) => glide(900 + i * 300, 1400 + i * 400, 0.08, "square", 0.025, d));
  const win5 = () => [523, 784, 1047, 1568, 2093].forEach((f, i) => { glide(f, f * 1.01, i === 4 ? 0.6 : 0.16, "triangle", 0.07, i * 0.09); glide(f * 2, f * 2, 0.12, "sine", 0.02, i * 0.09 + 0.05); });
  // a theremin-like hum that rises while the search goes on (the suspense)
  function humStart(sec) {
    if (!set.snd || hum) return;
    const c = actx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain(), t = c.currentTime;
    o.type = "sine"; o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(620, t + sec);
    l.frequency.value = 6.5; lg.gain.value = 14; l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.4);
    o.connect(g); g.connect(c.destination); o.start(t); l.start(t);
    hum = { o, l, g };
  }
  function humStop() {
    if (!hum) return;
    const c = ac, t = c.currentTime, h = hum; hum = null;
    try { h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); h.o.stop(t + 0.3); h.l.stop(t + 0.3); } catch (e) { /* stopped */ }
  }

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
  // a hero standing with its feet at (x, y), drawn at scale s (mirrored when flip); the name tag under the feet fits w px
  const body = (st, s, flip) => `<g transform="translate(0 ${(-59 * s).toFixed(1)}) scale(${flip ? -s : s} ${s})">${heroOf(st)}</g>`;
  const tag = (txt, w, fs) => `<g class="pk-tag"><rect x="${(-w / 2).toFixed(1)}" y="3" width="${w.toFixed(1)}" height="${fs + 6}" rx="${(fs + 6) / 2}"/><text x="0" y="${fs + 4.5}" text-anchor="middle" style="font-size:${fs}px">${esc(txt)}</text></g>`;
  const heroAt = (st, i, p, extra = "") => `<g class="pk-h" data-i="${i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
      <ellipse class="pk-glow" cx="0" cy="0" rx="${(46 * p.s + 8).toFixed(1)}" ry="${(12 * p.s + 3).toFixed(1)}" fill="#ffd84d"/>${body(st, p.s, p.flip)}${extra}
      ${p.tw ? tag(cut(nameOf(st, set.show), Math.floor(p.tw / (p.fs * 0.58))), p.tw, p.fs) : ""}</g>`;
  const pt = (cx, cy, r, a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  // a crowd in a box: rows and columns that fit n heroes, the biggest scale that fits
  function grid(n, x0, y0, x1, y1, maxS = 0.75) {
    const W = x1 - x0, H = y1 - y0;
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols), cw = W / cols, ch = H / rows, s = Math.min(maxS, cw / 92, (ch - 18) / 122);
      if (!best || s > best.s) best = { cols, rows, cw, ch, s };
    }
    const fs = Math.max(9, Math.min(15, best.cw / 7));
    return Array.from({ length: n }, (_, i) => { const r = Math.floor(i / best.cols), c = i % best.cols, inRow = Math.min(best.cols, n - r * best.cols), off = (best.cols - inRow) * best.cw / 2;
      return { x: x0 + off + best.cw * (c + 0.5), y: y0 + best.ch * (r + 1) - 18, s: best.s, tw: Math.min(best.cw - 4, 120), fs, row: r }; });
  }
  // the meter: every student has an angle of their own, spread over 1 to 3 arcs behind the dial
  const MC = [500, 628];
  function meterLayout(n) {
    const rows = n <= 14 ? 1 : n <= 32 ? 2 : 3, R = [[400], [372, 462], [352, 428, 504]][rows - 1], span = 74;
    const s = n <= 14 ? 0.6 : n <= 32 ? 0.48 : 0.38;
    return Array.from({ length: n }, (_, i) => { const a = n < 2 ? 0 : -span + (2 * span * i) / (n - 1), r = R[i % rows], p = pt(MC[0], MC[1], r, a), gap = (2 * Math.PI * r * (2 * span / 360)) / Math.ceil(n / rows);
      return { x: p[0], y: p[1], s, a, tw: Math.min(gap - 3, 110), fs: Math.max(9, Math.min(14, gap / 6.5)) }; });
  }
  function btLayout(n) {
    const L = Math.ceil(n / 2), left = grid(L, 18, 78, 382, 632, 0.62), right = grid(n - L, 618, 78, 982, 632, 0.62);
    return left.concat(right.map((p) => Object.assign(p, { flip: true })));
  }
  const voltLayout = (n) => grid(n, 24, 150, 976, 634, 0.85);

  const BAN = `<g id="pkBan"><rect x="230" y="8" width="540" height="54" rx="27" fill="#0b1320" stroke="#38e1c9" stroke-width="2"/><text x="500" y="45" text-anchor="middle" class="pk-ban" id="pkBanT">Ready</text></g>`;
  function scene() {
    const n = cast.length, svg = $("#pkStage");
    let out = "";
    if (styleNow === "meter") {
      pos = meterLayout(n);
      const C = MC, arc = (r, a0, a1) => { const p0 = pt(C[0], C[1], r, a0), p1 = pt(C[0], C[1], r, a1); return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`; };
      const f0 = pt(C[0], C[1], 300, -82), f1 = pt(C[0], C[1], 300, 82);
      let ticks = "";
      for (let a = -80; a <= 80; a += 4) { const big = a % 20 === 0, p0 = pt(C[0], C[1], big ? 228 : 240, a), p1 = pt(C[0], C[1], 256, a); ticks += `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="${INK}" stroke-width="${big ? 3 : 1.5}"/>`; }
      pos.forEach((p, i) => { const p0 = pt(C[0], C[1], 264, p.a), p1 = pt(C[0], C[1], 292, p.a); ticks += `<path class="pk-mk" data-i="${i}" d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke-width="${n > 40 ? 3 : 5}" stroke-linecap="round"/>`; });
      out = `${cast.map((st, i) => heroAt(st, i, pos[i])).join("")}
        <path d="M${f0[0].toFixed(1)} ${f0[1].toFixed(1)} A300 300 0 0 1 ${f1[0].toFixed(1)} ${f1[1].toFixed(1)} L${C[0]} ${C[1]} Z" fill="#f4efe1" stroke="${INK}" stroke-width="4"/>
        <path d="${arc(250, -80, -20)}" stroke="#2f7d32" stroke-width="10" fill="none"/><path d="${arc(250, -20, 30)}" stroke="#e0b341" stroke-width="10" fill="none"/><path d="${arc(250, 30, 80)}" stroke="#c0392b" stroke-width="10" fill="none"/>
        ${ticks}<text x="500" y="490" text-anchor="middle" class="pk-mtxt">NMK42003</text><text x="500" y="518" text-anchor="middle" class="pk-msub">STUDENT-O-METER</text>
        <g id="pkNeedle" transform="rotate(-82 ${C[0]} ${C[1]})"><path d="M${C[0] - 6} ${C[1] + 16} L${C[0]} ${C[1] - 278} L${C[0] + 6} ${C[1] + 16} Z" fill="#c0392b" stroke="${INK}" stroke-width="2"/><circle cx="${C[0]}" cy="${C[1]}" r="24" fill="${INK}"/><circle cx="${C[0]}" cy="${C[1]}" r="9" fill="#e3e9f0"/></g>`;
    } else if (styleNow === "bt") {
      pos = btLayout(n);
      out = `${reduce ? "" : `<g class="pk-rip">${[0, 0.9, 1.8].map((d) => `<circle cx="500" cy="350" r="60" fill="none" stroke="#38e1c9" stroke-width="3"><animate attributeName="r" values="80;520" dur="2.7s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".55;0" dur="2.7s" begin="${d}s" repeatCount="indefinite"/></circle>`).join("")}</g>`}
        ${cast.map((st, i) => { const p = pos[i]; return heroAt(st, i, p, `<g class="pk-ph" data-i="${i}" transform="translate(${((p.flip ? -30 : 30) * p.s / 0.6).toFixed(1)} ${(-118 * p.s).toFixed(1)}) scale(${(p.s / 0.8).toFixed(2)})"><rect x="-8" y="-14" width="16" height="28" rx="3"/><rect x="-5.5" y="-10" width="11" height="17" rx="1.5" class="pk-phs"/></g>`); }).join("")}
        <rect x="395" y="76" width="210" height="556" rx="32" fill="#0b1320" stroke="#38e1c9" stroke-width="3"/><rect x="407" y="110" width="186" height="500" rx="14" fill="#f6f8fa"/><rect x="470" y="88" width="60" height="8" rx="4" fill="#26364a"/>
        <text x="420" y="140" class="pk-bth">Bluetooth</text><rect x="545" y="126" width="36" height="20" rx="10" fill="#2f8cff"/><circle cx="571" cy="136" r="7" fill="#fff"/>
        <text x="420" y="166" class="pk-bts" id="pkBtSt">Ready to scan</text>
        <g id="pkRows"></g>`;
    } else {
      pos = voltLayout(n);
      out = `<text x="24" y="44" class="pk-vt" id="pkRound">Volt is ready</text>
        <g transform="translate(888 35)"><rect x="-100" y="-27" width="200" height="54" rx="10" fill="#0b1320" stroke="#38e1c9" stroke-width="2"/><text x="0" y="-7" text-anchor="middle" class="pk-msub" fill="#9fb3c8">CALIBRATION ERROR</text><text x="0" y="19" text-anchor="middle" class="pk-read" id="pkErr">—</text></g>
        ${cast.map((st, i) => heroAt(st, i, pos[i])).join("")}
        <path id="pkBeam" d=""/><g id="pkVolt" transform="translate(500 104)"><g transform="scale(1.5)">${VOLT}</g></g>`;
    }
    svg.innerHTML = `<defs><pattern id="pkGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#38e1c9" stroke-width=".6" opacity=".18"/></pattern></defs>
      <rect width="${VW}" height="${VH}" fill="#14213d"/><rect width="${VW}" height="${VH}" fill="url(#pkGrid)"/>${out}<g id="pkPop"></g>${BAN}`;
    svg.setAttribute("aria-label", `${STYLES[styleNow]}: ${n} students on stage`);
    if (styleNow === "bt") { order = cast.map((_, i) => i); btRows(-1, n); }
    if (styleNow === "volt") beamTo(500, -1);
  }
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  // the student the animation is on: glows, pops up bigger above the crowd, name in the banner
  let lit = -1;
  function light(i, banner = true) {
    lit = i;
    $$(".pk-h.on, .pk-ph.on, .pk-mk.on", $("#pkStage")).forEach((g) => g.classList.remove("on"));
    $$(`[data-i="${i}"]`, $("#pkStage")).forEach((g) => g.classList.add("on"));
    const pop = $("#pkPop"); if (!pop) return;
    if (i < 0) { pop.innerHTML = ""; return; }
    const p = pos[i], S2 = Math.max(p.s * 1.7, 0.62), y = Math.max(p.y, 70 + 124 * S2);
    pop.innerHTML = `<g transform="translate(${Math.max(60, Math.min(VW - 60, p.x)).toFixed(1)} ${Math.min(VH - 30, y).toFixed(1)})"><ellipse cx="0" cy="0" rx="${46 * S2 + 10}" ry="${12 * S2 + 5}" fill="#ffd84d" opacity=".75"/>${body(cast[i], S2, p.flip)}${tag(cut(nameOf(cast[i], set.show), 16), 150, 16)}</g>`;
    if (banner) $("#pkBanT").textContent = cut(nameOf(cast[i], set.show), 26);
  }
  const banner = (t) => { const b = $("#pkBanT"); if (b) b.textContent = t; };

  /* ---------- the three animations: each ends on cast index w ---------- */
  const frames = (dur, f) => new Promise((done) => { const t0 = performance.now(); const step = (now) => { const t = Math.min(1, (now - t0) / dur); f(t, now - t0); if (t < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  // a neighbour of w (2 or 3 places away) for the near miss
  const nearOf = (w, n) => { if (n < 3) return w; const d = (2 + rnd(2)) * (rnd(2) ? 1 : -1), k = w + d; return k >= 0 && k < n ? k : w - d >= 0 && w - d < n ? w - d : (w + 1) % n; };

  async function runMeter(w) {
    const n = cast.length, needle = $("#pkNeedle"), T = LEN(), fake = nearOf(w, n), C = MC;
    let last = -1, pinned = false;
    const near = (a) => { let k = 0, d = 1e9; pos.forEach((p, i) => { const e = Math.abs(p.a - a); if (e < d) { d = e; k = i; } }); return k; };
    const show = (a) => { needle.setAttribute("transform", `rotate(${a.toFixed(2)} ${C[0]} ${C[1]})`); const k = near(a); if (k !== last) { last = k; light(k); blip(); } };
    // a second-order step from a0 to a1: z damping, settling in about sec seconds
    const step2 = (a0, a1, z, sec) => { const wn = 4 / (z * sec), wd = wn * Math.sqrt(1 - z * z);
      return (s) => a1 + (a0 - a1) * Math.exp(-z * wn * s) * (Math.cos(wd * s) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * s)); };
    const pin = (a) => { if (a > 86 || a < -86) { if (!pinned) { pinned = true; glide(140, 90, 0.1, "triangle", 0.12); } return Math.sign(a) * 86; } pinned = false; return a; };
    humStart((T * 0.95) / 1000);
    await frames(450, (t) => show(-82 + Math.sin(t * 40) * 1.5));               // the needle twitches at zero
    const tA = T * 0.66, fA = step2(-82, pos[fake].a, 0.1, tA / 1000);
    await frames(tA, (t, ms) => show(pin(fA(ms / 1000))));
    show(pos[fake].a);
    banner(`${cut(nameOf(cast[fake], set.show), 20)}?`);
    await sleep(Math.min(900, T * 0.08));                                        // it almost stops here…
    wah();
    const tB = T * 0.26 - 450, fB = step2(pos[fake].a, pos[w].a, 0.32, (tB / 1000) * 0.85);
    await frames(tB, (t, ms) => show(pin(fB(ms / 1000))));
    show(pos[w].a); light(w); humStop();
  }

  // the phone's list: the 9 rows around the student it is on (it scrolls like a real list)
  function btRows(k, found) {
    const box = $("#pkRows"); if (!box) return;
    const n = cast.length, show = Math.min(9, found), rowH = 46, rows = [];
    if (k < 0) { for (let j = 0; j < show; j++) rows.push(j); }
    else for (let j = -Math.floor(show / 2); j < show - Math.floor(show / 2); j++) rows.push(((k + j) % found + found) % found);
    box.innerHTML = rows.map((i, r) => `<g class="pk-row${i === k ? " on" : ""}" transform="translate(413 ${180 + r * rowH})"><rect width="174" height="${rowH - 6}" rx="8"/><text x="10" y="${(rowH - 6) / 2 + 5}">📱 ${esc(cut(nameOf(cast[order[i]], set.show), 15))}</text></g>`).join("");
  }
  let order = [];
  async function runBt(w) {
    const n = cast.length, st = $("#pkBtSt"), T = LEN();
    humStart((T * 0.95) / 1000);
    // 1. discover every phone, in a random order
    order = shuffle(cast.map((_, i) => i));
    st.textContent = "Scanning for devices…";
    const dDisc = Math.max(25, (T * 0.3) / n);
    for (let j = 0; j < n; j++) {
      $$(`.pk-ph[data-i="${order[j]}"]`, $("#pkStage")).forEach((g) => g.classList.add("found"));
      light(order[j]); btRows(j, j + 1); st.textContent = `Found ${j + 1} device${j ? "s" : ""}…`;
      if (j % 2 === 0 || n < 30) ping();
      await sleep(dDisc);
    }
    // 2. go through the list, slowing down, and stop one before the winner (the near miss)
    const wi = order.indexOf(w), d0 = 45, dMax = 520, tCyc = T * 0.5;
    let m = 12, r = 1;
    for (; m < 600; m++) { r = Math.pow(dMax / d0, 1 / (m - 1)); if ((d0 * (Math.pow(r, m) - 1)) / (r - 1) >= tCyc) break; }
    const missAt = (wi - 1 + n) % n;
    let k = ((missAt - m) % n + n) % n, dt = d0;
    st.textContent = "Choosing a device…";
    for (let j = 0; j < m; j++) { k = (k + 1) % n; light(order[k]); btRows(k, n); blip(); await sleep(dt); dt *= r; }
    st.textContent = `Connecting to ${cut(nameOf(cast[order[k]], set.show), 11)}…`;
    await sleep(Math.min(1100, T * 0.09));
    st.textContent = "✗ Connection failed"; wah();
    await sleep(500);
    k = wi; light(w); btRows(k, n); humStop();
    for (let d = 0; d < 3; d++) { st.textContent = `Pairing${".".repeat(d + 1)}`; glide(880 + d * 200, 1200 + d * 200, 0.08, "sine", 0.05); await sleep(Math.max(250, T * 0.03)); }
    st.textContent = "✓ Paired"; lockOn();
  }

  // Volt's beam: from Volt down to the student at index i (none when i < 0)
  function beamTo(vx, i, lock) {
    const V = $("#pkVolt"), B = $("#pkBeam"); if (!V) return;
    V.setAttribute("transform", `translate(${vx.toFixed(1)} 104)`);
    if (i < 0) { B.setAttribute("d", ""); return; }
    const p = pos[i], top = p.y - 122 * p.s, w = 30 * p.s / 0.5;
    B.setAttribute("d", `M${vx - 10} 128 L${vx + 10} 128 L${p.x + w} ${top + 8} L${p.x - w} ${top + 8} Z`);
    B.classList.toggle("lock", !!lock);
  }
  async function runVolt(w) {
    const n = cast.length, T = LEN(), err = $("#pkErr"), rd = $("#pkRound");
    let alive = cast.map((_, i) => i);
    const counts = []; for (let c = n; c > 1;) { c = c > 5 ? Math.max(5, Math.ceil(c / 2)) : 1; counts.push(c); }
    const rounds = counts.length, wts = counts.map((c, r) => (r === rounds - 1 ? 1.8 : 1)), wsum = wts.reduce((a, b) => a + b, 0), pause = 550;
    const budget = Math.max(T - rounds * pause, rounds * 900);
    humStart((T * 0.95) / 1000);
    for (let r = 0; r < rounds; r++) {
      const last = r === rounds - 1, sweep = (budget * wts[r]) / wsum * (last ? 0.62 : 1);
      rd.textContent = `Round ${r + 1} of ${rounds} · ${alive.length} left`;
      // visit the students still standing, row by row (a zigzag), smoothly
      // the last round ends on a decoy (the near miss), never on the winner
      const decoy = last ? alive.filter((i) => i !== w)[rnd(alive.length - 1)] : -1;
      const path = alive.slice().sort((a, b) => pos[a].row - pos[b].row || (pos[a].row % 2 ? pos[b].x - pos[a].x : pos[a].x - pos[b].x)).filter((i) => i !== decoy).concat(last ? [decoy] : []);
      let prev = -1;
      const e0 = 0.999 * Math.pow(1 - r / rounds, 1.4), e1 = last ? 0.004 : 0.999 * Math.pow(1 - (r + 1) / rounds, 1.4);
      await frames(sweep, (t) => {
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, u = e * (path.length - 1), j = Math.min(path.length - 1, Math.round(u)), a = Math.floor(u), b = Math.min(path.length - 1, a + 1);
        const vx = pos[path[a]].x + (pos[path[b]].x - pos[path[a]].x) * (u - a);
        beamTo(vx, path[j]);
        if (path[j] !== prev) { prev = path[j]; light(path[j]); blip(); }
        err.textContent = (e0 + (e1 - e0) * t).toFixed(3);
      });
      if (last) {
        // the near miss: Volt stops over someone else, then moves on to the winner
        light(decoy); beamTo(pos[decoy].x, decoy); err.textContent = "0.004"; banner(`${cut(nameOf(cast[decoy], set.show), 20)}?`);
        await sleep(Math.min(1000, T * 0.08)); wah();
        await frames(Math.min(900, T * 0.07), (t) => { beamTo(pos[decoy].x + (pos[w].x - pos[decoy].x) * t, t > 0.5 ? w : decoy); });
        light(w); beamTo(pos[w].x, w, true); err.textContent = "0.000"; lockOn(); humStop();
      }
      // the ones who passed calibration sit down
      const keep = new Set(shuffle(alive.filter((i) => i !== w)).slice(0, counts[r] - 1).concat([w]));
      alive.filter((i) => !keep.has(i)).forEach((i) => { const g = $(`.pk-h[data-i="${i}"]`, $("#pkStage")); if (g) g.classList.add("out"); });
      alive = alive.filter((i) => keep.has(i));
      if (!last) { light(-1); beamTo(pos[prev].x, -1); sink(); banner(`${alive.length} still standing…`); await sleep(pause); }
    }
    rd.textContent = "Calibrated!";
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

  // on stage: everyone still waiting (with the winner), in a random order; a pool over 80 shows 80 of them
  function makeCast(w) {
    const others = shuffle(waiting().filter((s) => s !== w)).slice(0, MAX_ON - 1);
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
    try {
      if (reduce || cast.length < 2) { light(w); await sleep(300); }
      else if (styleNow === "meter") await runMeter(w);
      else if (styleNow === "bt") await runBt(w);
      else await runVolt(w);
    } finally { humStop(); }
    light(w);
    $("#pkStage").classList.add("won");
    win5();
    markPicked(win, "pick");
    await sleep(reduce ? 0 : 900);
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
    for (let i = 0; i < (reduce ? 0 : 14); i++) { btn.textContent = `👥 ${cut(nameOf(from[rnd(from.length)], set.show), 16)}`; blip(); await sleep(60 + i * 12); }
    team = pickT; markPicked(team, "team"); lockOn();
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
    const rows = picked.log.slice().reverse().filter((x) => byId[x.e] && picked.ids.includes(x.e));   // this round only
    const fmt = (t) => { const d = new Date(t + 8 * 3600000), h = d.getUTCHours(); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}, ${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
    box.innerHTML = `<div class="pk-lh"><h2 class="h3">Picked So Far (${picked.ids.filter((e) => byId[e]).length})</h2>${picked.ids.length ? `<span class="pk-lbtn"><button type="button" class="btn ghost" data-reset>Start a new round for everyone</button><button type="button" class="btn ghost" data-clear>🗑 Clear the list</button></span>` : ""}</div>
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
    else msg = `<strong>${wt.length}</strong> of ${p.length} student${p.length === 1 ? "" : "s"} waiting for a turn${wt.length > MAX_ON ? ` · ${MAX_ON} of them on stage, and everyone has the same chance` : ", all on stage"}.`;
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
        <label>Length<select id="pkLen">${Object.entries(LENGTH).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></label>
        <label class="pk-chk"><input type="checkbox" id="pkSkip"> Skip students already picked</label>
      </div>
      <p class="small-note pk-note">A student with no hero name shows their nickname, then their short name. Students without an INSTRUMENTA character appear as a robot. Characters come from the class rankings: ${esc(A.rankNote(rankAt).replace("Rankings are updated", "updated"))}</p>
      <div class="pk-wrap" id="pkWrap">
        <div class="pk-bar"><p id="pkInfo" aria-live="polite"></p><span class="pk-tools"><button type="button" class="pk-tb" id="pkSnd" aria-pressed="${set.snd}"></button><button type="button" class="pk-tb" id="pkFull">⛶ Full screen</button></span></div>
        <div class="pk-box"><svg id="pkStage" class="pk-stage" viewBox="0 0 1000 640" role="img"></svg><div class="pk-result" id="pkResult" hidden></div></div>
        <div class="pk-go"><button type="button" class="btn pk-gob" id="pkGo">🎯 Pick a student</button><span class="pk-key">or press Space</span></div>
      </div>
      <section class="pk-side" id="pkList" aria-label="Picked so far"></section>`;
    $("#pkMode").value = set.mode; $("#pkShow").value = set.show; $("#pkStyle").value = set.style; $("#pkLen").value = set.len; $("#pkSkip").checked = set.skip;
    const snd = () => { $("#pkSnd").textContent = set.snd ? "🔊 Sound on" : "🔇 Sound off"; $("#pkSnd").setAttribute("aria-pressed", String(set.snd)); };
    snd();
    $("#pkMode").addEventListener("change", (e) => { set.mode = e.target.value; if (set.mode === "att") { options(); loadSessions(); } else refresh(); });
    $("#pkSec").addEventListener("change", (e) => { set.sec = e.target.value; refresh(); });
    $("#pkGrp").addEventListener("change", (e) => { set.grp = e.target.value; refresh(); });
    $("#pkSes").addEventListener("change", (e) => { set.ses = e.target.value; loadPresent(); });
    $("#pkShow").addEventListener("change", (e) => { set.show = e.target.value; if (!busy) { scene(); if (win && !$("#pkResult").hidden) showResult(); } saveSet(); drawList(); });
    $("#pkStyle").addEventListener("change", (e) => { set.style = e.target.value; if (set.style !== "any") styleNow = set.style; saveSet(); if (!busy) { closeResult(); scene(); } });
    $("#pkLen").addEventListener("change", (e) => { set.len = e.target.value; saveSet(); });
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
      else if (t.closest("[data-clear]")) { const b = t.closest("[data-clear]"); if (b.dataset.sure) { picked = { ids: [], log: [] }; savePicked(); refresh(); } else { b.dataset.sure = "1"; b.textContent = "Tap again to clear the list"; } }
      else if (t.closest("[data-back]")) { const id = t.closest("[data-back]").dataset.back; picked.ids = picked.ids.filter((x) => x !== id); savePicked(); status(); drawList(); }
      else if (t.closest("[data-done]")) closeResult();
      else if (t.closest("[data-team]")) teamUp(t.closest("[data-team]"));
      else if (t.closest("[data-friend]")) friendList($(".pk-friend"));
      else if (t.closest("[data-fx]")) { if (friendLayer) { friendLayer.closed(); friendLayer = null; } const b = $(".pk-friend"); b.hidden = true; b.innerHTML = ""; }
      else if (t.closest("[data-h]")) { helper = byId[t.closest("[data-h]").dataset.h]; if (friendLayer) { friendLayer.closed(); friendLayer = null; } lockOn(); showResult(); }
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
