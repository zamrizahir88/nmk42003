/* NMK42003 Missions: a mission game for practising each chapter, one world per chapter.
   The questions are not in this file. A lecturer uploads each world's mission file on the dashboard (admin.html); it is
   kept in Firestore missions/{world N} and only lecturers, or signed-in students after the lecturer releases the game
   (meta/missions.released), can read it. This file is the engine: the map, My Character, the battle, Volt the helper
   drone, answer checking, coins and stars, sound. Students work each step on paper and key in the answer; a wrong try
   opens Volt's next hint; the full working shows only when the mission is complete. No time limit.
   Saved in this browser (and synced by account.js): nmk-missions (best result of each mission), nmk-hero (the
   character). nmk-msnd (sound on or off) stays on this device. */
(function () {
  "use strict";
  const page = document.getElementById("missions");
  if (!page || typeof COURSE === "undefined") return;
  const $ = (s, r = page) => r.querySelector(s), $$ = (s, r = page) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const val = (f, v) => (typeof f === "function" ? f(v) : f);
  let A = null, isLec = false, WORLDS = [], view = "map", openWorld = null;

  /* ---------- saved progress ---------- */
  const best = () => parse(lsGet("nmk-missions"), {}) || {};
  const totalCoins = () => Object.values(best()).reduce((s, r) => s + (r.c || 0), 0);
  function saveBest(m, r) {
    const all = best(), old = all[m.id] || {};
    all[m.id] = { t: m.title, w: openWorld.world, c: Math.max(old.c || 0, r.c), s: Math.max(old.s || 0, r.s), at: old.c >= r.c ? old.at : new Date().toISOString(),
      ...(m.boss ? { mk: Math.max(old.mk || 0, r.mk || 0), of: m.marks || 30, boss: 1 } : {}), n: (old.n || 0) + 1 };
    lsSet("nmk-missions", JSON.stringify(all));
    document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-missions" }));
  }

  /* ---------- sound: made in the browser (no sound files) ---------- */
  let soundOn = lsGet("nmk-msnd") !== "0", ac = null;
  const actx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); return ac; };
  function tone(f, t0, dur, type = "square", vol = 0.08, f2) {
    if (!soundOn) return;
    try {
      const c = actx(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0;
      o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* no audio */ }
  }
  function noise(t0, dur, vol = 0.15) {
    if (!soundOn) return;
    try {
      const c = actx(), n = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = c.createBufferSource(), g = c.createGain(); s.buffer = n; g.gain.value = vol; s.connect(g).connect(c.destination); s.start(c.currentTime + t0);
    } catch (e) { /* no audio */ }
  }
  const SFX = {
    click: () => tone(660, 0, 0.05, "square", 0.04),
    sword: () => { noise(0, 0.12, 0.12); tone(1800, 0, 0.22, "triangle", 0.05, 500); },
    blaster: () => tone(1300, 0, 0.22, "square", 0.05, 260),
    bow: () => { noise(0, 0.25, 0.06); tone(500, 0, 0.3, "sine", 0.08, 1100); },
    staff: () => { noise(0, 0.35, 0.1); tone(220, 0, 0.3, "sawtooth", 0.05, 90); },
    hit: () => { noise(0, 0.18, 0.2); tone(140, 0, 0.2, "sine", 0.2, 60); },
    coin: () => { tone(988, 0, 0.07, "square", 0.06); tone(1319, 0.07, 0.2, "square", 0.06); },
    miss: () => { tone(330, 0, 0.18, "sawtooth", 0.06, 220); tone(220, 0.2, 0.3, "sawtooth", 0.06, 140); },
    laugh: () => [0, 0.12, 0.24].forEach((t) => tone(520, t, 0.09, "triangle", 0.07, 420)),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.22, "square", 0.06)); tone(1319, 0.5, 0.5, "square", 0.06); },
    faint: () => tone(400, 0, 0.7, "triangle", 0.08, 80),
    beep: () => { tone(1320, 0, 0.08, "sine", 0.07); tone(1760, 0.09, 0.1, "sine", 0.07); },
    almost: () => tone(880, 0, 0.12, "sine", 0.06, 990),
    roar: () => { noise(0, 0.6, 0.14); tone(90, 0, 0.6, "sawtooth", 0.08, 50); }
  };

  /* ---------- the player's character ---------- */
  const OPT = {
    look: [["m", "Male"], ["f", "Female"], ["t", "Female (tudung)"]],
    hairM: [["spiky", "Spiky"], ["neat", "Neat"], ["buzz", "Short"]],
    hairF: [["long", "Long"], ["pony", "Ponytail"], ["bob", "Bob"]],
    face: [["none", "None"], ["mous", "Moustache"], ["goatee", "Goatee"], ["beard", "Beard"]],
    head: [["none", "None"], ["cap", "Cap"], ["kopiah", "Kopiah"], ["hardhat", "Safety helmet"]],
    eyes: [["none", "None"], ["round", "Glasses"], ["goggles", "Lab goggles"]],
    weapon: [["sword", "Probe Sword"], ["blaster", "Scope Blaster"], ["bow", "Signal Bow"], ["staff", "Solder Staff"]]
  };
  const NOTE = { sword: "A giant multimeter probe. Slashes up close.", blaster: "An oscilloscope cannon. Fires a sine wave.", bow: "An antenna bow. Shoots radio waves.", staff: "A soldering-iron staff. Hurls a hot spark." };
  const SKINS = ["#f6d5b5", "#e3ad80", "#b07650"], HAIRS = ["#1f1a17", "#4a2c1a", "#7a4a26", "#a8a8a8"];
  const COLORS = ["#0b6e6e", "#1e3a5f", "#b3412e", "#6b4bb8", "#2f7d32", "#c2185b"], TUDUNG = ["#e8d6c0", "#f4c6d4", "#cfe0f2", "#2b2b2b"];
  const HERO0 = { look: "m", hairM: "spiky", hairF: "long", face: "none", head: "none", eyes: "none", hair: HAIRS[0], skin: SKINS[0], color: COLORS[0], tud: TUDUNG[0], weapon: "sword" };
  let hero = Object.assign({}, HERO0, parse(lsGet("nmk-hero"), {}));
  // weapon upgrades are earned: level 5 of the course journey makes it glow; a defeated boss makes it gold ("Calibrated")
  const tier = () => { const g = window.NMKGame && NMKGame.local ? NMKGame.local() : null; return Object.values(best()).some((r) => r.boss) ? 2 : g && g.levelNo >= 3 ? 1 : 0; };
  const O = 'stroke="#15243a" stroke-width="2"';
  function weaponSvg(w, t) {
    const metal = t === 2 ? "#f2c94c" : "#dfe6ee", body = t === 2 ? "#d4a017" : null;
    const glow = (x, y, c) => (t >= 1 ? `<circle cx="${x}" cy="${y}" r="${t === 2 ? 11 : 8}" fill="${c}" opacity=".35">${reduce ? "" : `<animate attributeName="r" values="${t === 2 ? "9;14;9" : "6;10;6"}" dur="1.4s" repeatCount="indefinite"/>`}</circle>` : "");
    if (w === "sword") return `<g transform="rotate(-55)">${glow(64, 0, t === 2 ? "#ffd34d" : "#5ad1ff")}<rect x="-6" y="-5" width="18" height="10" rx="3" fill="${body || "#b3261e"}" ${O}/><rect x="11" y="-8" width="5" height="16" rx="2" fill="#15243a"/><path d="M16 -4 L60 -2 L70 0 L60 2 L16 4 Z" fill="${metal}" ${O}/><path d="M21 0 H58" stroke="#9aa9b8" stroke-width="1.5"/><path d="M-6 0 q-12 6 -6 16 t-4 14" stroke="${body || "#b3261e"}" stroke-width="2.5" fill="none"/></g>`;
    if (w === "blaster") return `<g transform="translate(-4 -22)">${glow(48, 11, t === 2 ? "#ffd34d" : "#39ff9a")}<rect x="0" y="0" width="34" height="24" rx="4" fill="${body || "#3a4a5c"}" ${O}/><rect x="4" y="4" width="20" height="14" rx="2" fill="#0d2a1e"/><path d="M5 11 q2.5 -6 5 0 t5 0 t5 0" stroke="#39ff9a" stroke-width="1.6" fill="none"/><rect x="34" y="7" width="14" height="9" rx="2" fill="${t === 2 ? "#f2c94c" : "#5d6f84"}" ${O}/><circle cx="29" cy="8" r="2" fill="#f0a830"/><circle cx="29" cy="15" r="2" fill="#f0a830"/><rect x="2" y="22" width="8" height="10" rx="2" fill="${body || "#3a4a5c"}" ${O}/></g>`;
    if (w === "bow") return `<g>${glow(10, 0, t === 2 ? "#ffd34d" : "#39a0ff")}<path d="M0 -36 Q24 0 0 36" fill="none" stroke="${body || "#8a5a2b"}" stroke-width="5" stroke-linecap="round"/><path d="M0 -36 L0 36" stroke="#cfd8e3" stroke-width="1.5"/><path d="M0 -36 l-4 -12 M0 -36 l6 -11" stroke="#15243a" stroke-width="2"/><circle cx="-4" cy="-49" r="2.5" fill="#f0a830"/><circle cx="6" cy="-48" r="2.5" fill="#f0a830"/><path d="M7 -4 q6 4 0 8 M12 -7 q9 7 0 14" stroke="#39a0ff" stroke-width="2" fill="none"/></g>`;
    return `<g>${glow(0, -62, t === 2 ? "#ffd34d" : "#ff7a1a")}<rect x="-3" y="-42" width="6" height="88" rx="3" fill="${body || "#6b4a2b"}" ${O}/><rect x="-6" y="-8" width="12" height="18" rx="4" fill="#2f2f2f"/><path d="M-5 -42 L0 -58 L5 -42 Z" fill="${metal}" ${O}/><circle cx="0" cy="-61" r="5" fill="#ff7a1a" opacity=".9"/></g>`;
  }
  function headSvg(h) {
    const sk = h.skin, hc = h.hair, m = h.look === "m", t = h.look === "t";
    let back = "", top = "";
    if (t) {
      back = `<path d="M-33 -6 Q-35 -52 0 -52 Q35 -52 33 -6 Q36 26 22 36 L-22 36 Q-36 26 -33 -6 Z" fill="${h.tud}" ${O}/>`;
      top = `<path d="M-23 -12 Q-20 -36 0 -36 Q20 -36 23 -12 Q14 -26 0 -27 Q-14 -26 -23 -12 Z" fill="${h.tud}"/><path d="M-22 -10 Q0 -40 22 -10" fill="none" stroke="#15243a" stroke-width="1" opacity=".35"/><circle cx="18" cy="-26" r="3" fill="${h.color}"/>`;
    } else if (m) {
      top = { spiky: `<path d="M-29 -12 Q-30 -44 0 -44 Q30 -44 29 -12 L24 -22 L17 -16 L10 -25 L2 -17 L-6 -26 L-13 -17 L-20 -25 Z" fill="${hc}" ${O}/>`,
        neat: `<path d="M-29 -10 Q-31 -45 0 -45 Q31 -45 29 -10 Q24 -30 -2 -31 Q-20 -30 -29 -10 Z" fill="${hc}" ${O}/>`,
        buzz: `<path d="M-28 -14 Q-28 -42 0 -42 Q28 -42 28 -14 Q14 -32 0 -33 Q-14 -32 -28 -14 Z" fill="${hc}" opacity=".9"/>` }[h.hairM] || "";
    } else {
      back = { long: `<path d="M-30 -10 Q-38 26 -26 40 L26 40 Q38 26 30 -10 Q30 -46 0 -44 Q-30 -46 -30 -10 Z" fill="${hc}" ${O}/>`,
        pony: `<path d="M-26 -30 Q-52 -24 -46 8 Q-44 22 -34 26 Q-40 4 -24 -14 Z" fill="${hc}" ${O}/>`,
        bob: `<path d="M-31 -10 Q-34 12 -24 16 L24 16 Q34 12 31 -10 Q30 -46 0 -44 Q-30 -46 -31 -10 Z" fill="${hc}" ${O}/>` }[h.hairF] || "";
      top = `<path d="M-28 -12 Q-22 -42 0 -42 Q24 -42 28 -12 Q16 -26 -2 -25 Q-16 -28 -28 -12 Z" fill="${hc}"/><path d="M14 -36 l8 -6 l2 9 z M22 -42 l8 3 l-6 6 z" fill="${h.color}"/>`;
    }
    const mous = `<path d="M-9 2 Q-4 -2 0 1 Q4 -2 9 2 Q5 5 0 3 Q-5 5 -9 2 Z" fill="${hc}"/>`;
    const beard = !m ? "" : { none: "", mous, goatee: mous + `<path d="M-6 10 Q0 22 6 10 Q0 14 -6 10 Z" fill="${hc}"/>`,
      beard: `<path d="M-27 -6 Q-26 22 0 22 Q26 22 27 -6 Q22 10 10 10 Q0 14 -10 10 Q-22 10 -27 -6 Z" fill="${hc}" ${O}/>` + mous }[h.face] || "";
    const eyes = { none: "", round: `<circle cx="-10" cy="-8" r="7.5" fill="none" stroke="#15243a" stroke-width="2"/><circle cx="10" cy="-8" r="7.5" fill="none" stroke="#15243a" stroke-width="2"/><path d="M-2.5 -8 H2.5" stroke="#15243a" stroke-width="2"/>`,
      goggles: `<rect x="-27" y="-34" width="54" height="5" rx="2.5" fill="#3a4a5c"/><circle cx="-11" cy="-32" r="7" fill="#9fd3e6" ${O}/><circle cx="11" cy="-32" r="7" fill="#9fd3e6" ${O}/>` }[h.eyes] || "";
    const hw = t ? "" : { none: "", cap: `<path d="M-29 -18 Q-28 -48 0 -48 Q28 -48 29 -18 Q0 -26 -29 -18 Z" fill="${h.color}" ${O}/><path d="M18 -22 Q38 -24 46 -16 Q34 -14 20 -17 Z" fill="${h.color}" ${O}/><circle cx="0" cy="-47" r="3" fill="#15243a"/>`,
      kopiah: `<path d="M-24 -26 L-22 -44 Q0 -50 22 -44 L24 -26 Q0 -32 -24 -26 Z" fill="#fbfbf7" ${O}/><path d="M-20 -38 Q0 -43 20 -38 M-21 -32 Q0 -37 21 -32" stroke="#c9c9c0" stroke-width="1.5" fill="none" stroke-dasharray="2 3"/>`,
      hardhat: `<path d="M-30 -22 Q0 -60 30 -22 Z" fill="#f0a830" ${O}/><rect x="-33" y="-25" width="66" height="7" rx="3.5" fill="#f0a830" ${O}/><path d="M0 -50 V-26" stroke="#c98a00" stroke-width="3"/>` }[h.head] || "";
    const face = t ? `<ellipse cx="0" cy="-6" rx="22" ry="24" fill="${sk}" ${O}/>` : `<circle cx="0" cy="-12" r="28" fill="${sk}" ${O}/>`;
    const lash = m ? "" : `<path d="M-13.5 -9.5 l-3.5 -1.5 M13.5 -9.5 l3.5 -1.5" stroke="#15243a" stroke-width="1.6" stroke-linecap="round"/>`;
    return { back, front: `${face}${beard}<circle cx="-10" cy="-8" r="3.6" fill="#15243a"/><circle cx="10" cy="-8" r="3.6" fill="#15243a"/><circle cx="-9" cy="-9.4" r="1.2" fill="#fff"/><circle cx="11" cy="-9.4" r="1.2" fill="#fff"/>${lash}
      <path d="M-6 6 Q0 11 6 6" stroke="#15243a" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="-16" cy="2" r="4" fill="#f4a3a3" opacity=".55"/><circle cx="16" cy="2" r="4" fill="#f4a3a3" opacity=".55"/>${top}${eyes}${hw}` };
  }
  function heroSvg(h, id = "", t = tier()) {
    const hd = headSvg(h), HEAD = (x) => `<g transform="translate(0 -18) scale(.82)">${x}</g>`;
    return `<g${id ? ` id="${id}"` : ""}><ellipse cx="0" cy="58" rx="30" ry="6" fill="#000" opacity=".15"/>${HEAD(hd.back)}
      <rect x="-13" y="26" width="11" height="24" rx="4" fill="#2b3440" ${O}/><rect x="2" y="26" width="11" height="24" rx="4" fill="#2b3440" ${O}/><ellipse cx="-9" cy="52" rx="9" ry="4.5" fill="#15243a"/><ellipse cx="9" cy="52" rx="9" ry="4.5" fill="#15243a"/>
      <g transform="translate(-16 2) rotate(14)"><rect x="-4.5" y="0" width="9" height="24" rx="4.5" fill="${h.color}" ${O}/><circle cx="0" cy="26" r="5" fill="${h.skin}" ${O}/></g>
      <rect x="-17" y="-2" width="34" height="32" rx="10" fill="${h.color}" ${O}/><path d="M-7 -2 L0 12 L7 -2" fill="#fff" ${O}/><rect x="-12" y="16" width="8" height="7" rx="2" fill="#f0a830"/>
      ${HEAD(hd.front)}<g transform="translate(16 2) rotate(-72)"><rect x="-4.5" y="0" width="9" height="24" rx="4.5" fill="${h.color}" ${O}/></g>
      <g transform="translate(39 9)">${weaponSvg(h.weapon, t)}<circle cx="0" cy="0" r="5" fill="${h.skin}" ${O}/></g></g>`;
  }

  /* ---------- the monsters: instrument faults ---------- */
  const eyes2 = (x1, x2, y, r = 10) => `<circle cx="${x1}" cy="${y}" r="${r}" fill="#fff" stroke="#26215c" stroke-width="2"/><circle cx="${x2}" cy="${y}" r="${r}" fill="#fff" stroke="#26215c" stroke-width="2"/><circle cx="${x1 + 3}" cy="${y + 2}" r="${r / 2}" fill="#26215c"/><circle cx="${x2 - 3}" cy="${y + 2}" r="${r / 2}" fill="#26215c"/>`;
  const MON = {
    slime: `<path d="M-62 0 Q-74 -86 0 -96 Q74 -86 62 0 Q40 6 20 -2 Q0 6 -20 -2 Q-40 6 -62 0 Z" fill="#8b7cf0" stroke="#3c3489" stroke-width="2.5"/><path d="M-40 -70 Q-30 -84 -14 -86" stroke="#fff" stroke-width="5" fill="none" opacity=".45" stroke-linecap="round"/>${eyes2(-20, 20, -50, 11)}<path d="M-14 -24 Q0 -32 14 -24" stroke="#26215c" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-36 -92 l-10 -18 M36 -92 l10 -18" stroke="#534ab7" stroke-width="4" stroke-linecap="round"/><circle cx="-46" cy="-110" r="5" fill="#d4537e"/><circle cx="46" cy="-110" r="5" fill="#d4537e"/>`,
    imp: `<path d="M30 -20 q40 0 34 -30 l8 -4 l-6 12" stroke="#7a1f1f" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="0" cy="-34" rx="34" ry="36" fill="#e2574c" stroke="#7a1f1f" stroke-width="2.5"/><path d="M-26 -62 L-36 -92 L-12 -68 Z M26 -62 L36 -92 L12 -68 Z" fill="#7a1f1f"/>${eyes2(-13, 13, -42, 9)}<path d="M-12 -18 Q0 -10 12 -18" stroke="#7a1f1f" stroke-width="3" fill="none"/><path d="M-6 -16 l2 5 l2 -5 M2 -16 l2 5 l2 -5" fill="#fff"/><rect x="-24" y="-4" width="12" height="8" rx="3" fill="#7a1f1f"/><rect x="12" y="-4" width="12" height="8" rx="3" fill="#7a1f1f"/><g transform="translate(-58 -56) rotate(-20)"><rect width="22" height="16" rx="3" fill="#f6f8fa" stroke="#15243a" stroke-width="2"/><path d="M4 12 L11 5 L18 12" stroke="#b3261e" stroke-width="2" fill="none"/></g>`,
    bat: `<path d="M-14 -50 Q-50 -90 -96 -60 Q-80 -54 -78 -40 Q-66 -50 -56 -36 Q-46 -48 -34 -32 Z M14 -50 Q50 -90 96 -60 Q80 -54 78 -40 Q66 -50 56 -36 Q46 -48 34 -32 Z" fill="#5b3f8f" stroke="#2c1d4a" stroke-width="2.5"/><ellipse cx="0" cy="-40" rx="30" ry="32" fill="#6f52aa" stroke="#2c1d4a" stroke-width="2.5"/><path d="M-20 -66 L-26 -86 L-8 -70 Z M20 -66 L26 -86 L8 -70 Z" fill="#6f52aa" stroke="#2c1d4a" stroke-width="2"/>${eyes2(-11, 11, -46, 8)}<path d="M-8 -24 l3 6 l3 -6 M2 -24 l3 6 l3 -6" fill="#fff" stroke="#2c1d4a" stroke-width="1"/><g fill="#ffd34d"><circle cx="-60" cy="-14" r="3"/><circle cx="62" cy="-20" r="3"/><circle cx="-40" cy="2" r="2.5"/><circle cx="44" cy="0" r="2.5"/></g>`,
    goblin: `<path d="M-30 -56 L-66 -70 L-34 -40 Z M30 -56 L66 -70 L34 -40 Z" fill="#6bbf59" stroke="#245a1b" stroke-width="2.5"/><path d="M-30 0 Q-40 -50 0 -78 Q40 -50 30 0 Z" fill="#6bbf59" stroke="#245a1b" stroke-width="2.5"/>${eyes2(-12, 12, -44, 9)}<path d="M-14 -20 Q0 -12 14 -20" stroke="#245a1b" stroke-width="3" fill="none"/><path d="M-8 -18 l3 -5 l3 5" fill="#fff"/><g transform="translate(26 -40)"><path d="M0 0 Q20 -4 34 6 Q32 34 14 44 Q-2 34 0 0 Z" fill="#c0c7cf" stroke="#15243a" stroke-width="2"/><path d="M8 26 A10 10 0 0 1 26 22" stroke="#15243a" stroke-width="2" fill="none"/><path d="M17 26 L24 14" stroke="#b3261e" stroke-width="2.5"/></g>`,
    troll: `<rect x="-58" y="-104" width="116" height="104" rx="40" fill="#7d93a8" stroke="#2c3e50" stroke-width="2.5"/><path d="M-58 -30 H58" stroke="#2c3e50" stroke-width="1.5" opacity=".3"/>${eyes2(-20, 20, -70, 11)}<path d="M-26 -84 L-8 -78 M26 -84 L8 -78" stroke="#2c3e50" stroke-width="4" stroke-linecap="round"/><path d="M-22 -40 Q0 -50 22 -40 L18 -32 L12 -40 L6 -32 L0 -40 L-6 -32 L-12 -40 L-18 -32 Z" fill="#fff" stroke="#2c3e50" stroke-width="2"/><g transform="translate(-92 -40) rotate(-20)"><rect x="0" y="0" width="36" height="20" rx="3" fill="#f6f8fa" stroke="#15243a" stroke-width="2"/><path d="M6 10 l6 -6 l6 12 l6 -12 l6 6" stroke="#15243a" stroke-width="1.6" fill="none"/></g>`,
    sprite: `<g fill="#ffe066" stroke="#9a7b00" stroke-width="2"><path d="M0 -110 L12 -80 L44 -92 L28 -62 L60 -48 L26 -38 L36 -6 L4 -24 L-16 2 L-18 -30 L-52 -26 L-30 -50 L-56 -74 L-20 -72 Z"/></g>${eyes2(-10, 10, -54, 9)}<path d="M-10 -32 q5 -6 10 0 t10 0" stroke="#9a7b00" stroke-width="2.5" fill="none"/><g stroke="#ffb300" stroke-width="2"><path d="M-70 -90 l8 4 M66 -100 l-6 6 M-74 -10 l8 -4 M70 -14 l-8 -2"/></g>`,
    golem: `<rect x="-70" y="-150" width="140" height="150" rx="16" fill="#8c8478" stroke="#3e3a33" stroke-width="3"/><rect x="-92" y="-112" width="26" height="70" rx="10" fill="#8c8478" stroke="#3e3a33" stroke-width="3"/><rect x="66" y="-112" width="26" height="70" rx="10" fill="#8c8478" stroke="#3e3a33" stroke-width="3"/><path d="M-70 -100 H70 M-30 -150 V-120 M40 -40 V0" stroke="#3e3a33" stroke-width="2" opacity=".35"/><circle cx="0" cy="-118" r="22" fill="#f6f8fa" stroke="#3e3a33" stroke-width="3"/><path d="M-14 -112 A16 16 0 0 1 14 -112" stroke="#3e3a33" stroke-width="2" fill="none"/><path d="M0 -112 L10 -126" stroke="#b3261e" stroke-width="3" stroke-linecap="round"/><circle cx="-30" cy="-70" r="8" fill="#ffd34d" stroke="#3e3a33" stroke-width="2"/><circle cx="30" cy="-70" r="8" fill="#ffd34d" stroke="#3e3a33" stroke-width="2"/><rect x="-28" y="-46" width="56" height="10" rx="5" fill="#3e3a33"/>`
  };
  const MON_COL = { slime: "#d4537e", imp: "#b3261e", bat: "#6f52aa", goblin: "#2f7d32", troll: "#2c3e50", sprite: "#b38600", golem: "#5a5248" };

  /* ---------- answers: units, prefixes, signs, rounding ---------- */
  const PRE = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
  function readNum(raw, unit) {
    let s = String(raw).trim().replace(/[−–—]/g, "-");
    if (/^[-+]?\d*,\d+(\s|$)/.test(s) && !s.includes(".")) s = s.replace(",", ".");
    const m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/);
    if (!m) return null;
    const x = parseFloat(m[1]), tail = m[2].trim().replace(/ohms?$/i, "Ω");
    if (!tail) return { x, dec: (m[1].split(/[eE]/)[0].split(".")[1] || "").length };
    const u = String(unit || ""), dec = (m[1].split(/[eE]/)[0].split(".")[1] || "").length;
    if (tail.toLowerCase() === u.toLowerCase()) return { x, dec };
    if (u === "%" || !u) return null;
    const base = /^[pnuµμmkKMG]./.test(u) ? u.slice(1) : u, up = u.length > base.length ? u[0] : "";
    const t = tail.match(/^([pnuµμmkKMG]?)(.*)$/);
    if (t && (t[2] === "" || t[2].toLowerCase() === base.toLowerCase()) && PRE[t[1]] !== undefined) return { x: x * PRE[t[1]] / PRE[up], dec: null };
    return null;
  }
  // ok, or "almost" (right, but rounded to fewer decimal places than asked), or "sign" (right size, wrong sign)
  function judge(raw, s, v) {
    const r = readNum(raw, val(s.unit, v));
    if (!r) return { err: `Enter a number${val(s.unit, v) ? ` (in ${val(s.unit, v)})` : ""}.` };
    const a = s.ans(v), tol = s.fixed ? s.tol : Math.max(Math.abs(a) * 0.01, s.tol || 0);
    if (Math.abs(r.x - a) <= tol) return { ok: true, x: r.x };
    if (r.dec !== null && r.dec < s.dp && Math.abs(r.x - a) <= 0.5 * 10 ** -r.dec + tol) return { almost: true };
    if (a !== 0 && Math.abs(r.x + a) <= tol) return { sign: true };
    return { no: true };
  }
  const fmtAns = (s, v) => `${s.ans(v).toFixed(s.dp)}${val(s.unit, v) ? ` ${val(s.unit, v)}` : ""}`;

  /* ---------- unlocking: a world opens in the week its chapter is lectured ---------- */
  const todayISO = () => { const q = new URLSearchParams(location.search).get("today"); if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q; try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  function opensOn(w) {
    const t = COURSE.topics.find((x) => x.no === w.chapter), wk = t ? +((String(t.weeks).match(/\d+/) || [1])[0]) : 1;
    const d = new Date(COURSE.semesterStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7 * (wk - 1));
    return { iso: d.toISOString().slice(0, 10), week: wk };
  }
  const worldOpen = (w) => isLec || opensOn(w).iso <= todayISO();
  const missionOpen = (w, i) => { if (isLec) return true; if (!worldOpen(w)) return false; const b = best(); return w.missions.slice(0, i).every((m) => b[m.id]); };
  const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
  const stars = (n, of = 3) => `<span class="ms-stars" aria-label="${n} of ${of} stars">${"★".repeat(n)}${"☆".repeat(of - n)}</span>`;

  /* ---------- the page frame: top bar and views ---------- */
  function frame(body) {
    const coins = totalCoins();
    page.innerHTML = `${isLec ? `<div class="ms-lec">${A.released ? "Released: students can play." : "<strong>Not released yet:</strong> only lecturers can see this page."} Lecturer plays are saved on this device only and never appear on the board. <a href="admin.html">Release or upload on the dashboard ›</a></div>` : ""}
      <div class="ms-bar"><span class="ms-pill" id="msCoins"><span class="ms-coin"></span><strong>${coins}</strong> coins</span>
        <span class="ms-pill">${Math.floor(coins / 2)} XP</span><span class="ms-sp"></span>
        <button type="button" class="btn ghost small" data-go="room">My Character</button>
        <button type="button" class="btn ghost small" data-snd aria-pressed="${soundOn}">${soundOn ? "🔊 Sound on" : "🔇 Sound off"}</button></div>
      <div id="msView">${body}</div>`;
  }
  function go(v, push = true, w = openWorld) {
    view = v; openWorld = w;
    if (push && window.NMKBack) NMKBack.view({ mview: v, mworld: w ? w.world : null });
    if (v === "room") return room();
    if (v === "world" && w) return worldView(w);
    return mapView();
  }
  function mapView() {
    const b = best();
    frame(`<p class="widget-lead">Each station is one chapter. Defeat the fault monsters with your calculations: work each step on paper, key in your answer, and earn coins. No time limit. A station opens in the week its chapter is lectured.</p>
      <div class="ms-worlds">${WORLDS.map((w) => {
        const open = worldOpen(w), o = opensOn(w), done = w.missions.filter((m) => b[m.id]).length, st = w.missions.reduce((s, m) => s + ((b[m.id] || {}).s || 0), 0);
        return `<button type="button" class="ms-world${open ? "" : " locked"}" data-world="${w.world}"${open ? "" : ` aria-disabled="true"`}>
          <span class="ms-wno">Station ${w.world}</span><strong>${esc(w.title.replace(/^Station \d+:\s*/, ""))}</strong><span class="small-note">Chapter ${w.chapter}: ${esc(w.place || "")}</span>
          <span class="ms-wfoot">${open ? `${done} of ${w.missions.length} missions · ${stars(Math.min(3, Math.round(st / Math.max(1, w.missions.length))))}` : `🔒 Opens ${fmtDay(o.iso)} (week ${o.week})`}</span></button>`;
      }).join("") || `<p class="small-note">No stations yet.${isLec ? " Upload a mission file on the dashboard." : ""}</p>`}</div>`);
  }
  function worldView(w) {
    const b = best();
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ All stations</button></p><h2 class="h3">Station ${w.world}: ${esc(w.title.replace(/^Station \d+:\s*/, ""))}</h2>
      <div class="ms-list">${w.missions.map((m, i) => {
        const open = missionOpen(w, i), r = b[m.id];
        return `<div class="ms-mis${m.boss ? " boss" : ""}${open ? "" : " locked"}"><svg viewBox="-110 -165 220 175" class="ms-mon" aria-hidden="true">${MON[m.monster] || MON.slime}</svg>
          <div><span class="small-note">${m.boss ? `Boss · ${m.marks || 30} marks` : `Mission ${i + 1}`} · ${esc(m.monsterName)}</span><strong>${esc(m.title)}</strong>
            <span class="small-note">${r ? `${stars(r.s)} · best ${r.c} coins${r.boss ? ` · score ${r.mk}/${r.of} marks` : ""}` : `${m.steps.length} steps`}</span></div>
          ${open ? `<button type="button" class="btn${r ? " ghost" : ""}" data-play="${i}">${r ? "Play again" : "Play"}</button>` : `<span class="small-note">🔒 ${worldOpen(w) ? "Finish the mission before" : `Opens ${fmtDay(opensOn(w).iso)}`}</span>`}</div>`;
      }).join("")}</div>`);
  }

  /* ---------- My Character ---------- */
  function room() {
    const row = (key, label, list) => `<div class="ms-opt" data-row="${key}"><p class="ms-ol">${label}</p><div class="ms-row">${list.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}">${l}</button>`).join("")}</div></div>`;
    const sw = (key, label, list) => `<div class="ms-opt" data-row="${key}"><p class="ms-ol">${label}</p><div class="ms-row">${list.map((c) => `<button type="button" class="ms-sw" data-k="${key}" data-v="${c}" aria-label="${label} ${c}" style="background:${c}"></button>`).join("")}</div></div>`;
    const t = tier();
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ Stations</button></p><h2 class="h3">My Character</h2><p class="small-note">Change it any time. It's saved to your account.</p>
      <div class="ms-mk"><div class="ms-pv"><svg id="msPv" viewBox="-60 -80 140 145" aria-label="Your character"></svg><button type="button" class="btn ghost small" data-try>Try the attack</button>
          <p class="small-note">Weapon: <strong>${["Basic", "Charged (glowing)", "Calibrated (gold)"][t]}</strong>. ${t < 2 ? (t < 1 ? "Reach journey level 3 to charge it; defeat a boss to make it gold." : "Defeat a boss to make it gold.") : "Earned by defeating a boss."}</p></div>
        <div>${row("look", "Look", OPT.look)}${row("hairM", "Hair", OPT.hairM)}${row("hairF", "Hair", OPT.hairF)}${sw("hair", "Hair colour", HAIRS)}${row("face", "Facial hair", OPT.face)}${row("head", "Headwear", OPT.head)}${sw("tud", "Tudung colour", TUDUNG)}${row("eyes", "Eyewear", OPT.eyes)}${sw("skin", "Skin tone", SKINS)}${sw("color", "Jacket colour", COLORS)}${row("weapon", "Weapon", OPT.weapon)}<p class="small-note" id="msWn"></p></div></div>`);
    const vis = { hairM: () => hero.look === "m", face: () => hero.look === "m", hairF: () => hero.look === "f", hair: () => hero.look !== "t", head: () => hero.look !== "t", tud: () => hero.look === "t" };
    const paint = () => {
      $("#msPv").innerHTML = heroSvg(hero, "msPvh");
      $$("[data-k]").forEach((b) => b.setAttribute("aria-pressed", hero[b.dataset.k] === b.dataset.v));
      $$("[data-row]").forEach((r) => { r.hidden = vis[r.dataset.row] ? !vis[r.dataset.row]() : false; });
      $("#msWn").textContent = NOTE[hero.weapon];
    };
    $$("[data-k]").forEach((b) => b.addEventListener("click", () => { hero[b.dataset.k] = b.dataset.v; SFX.click(); lsSet("nmk-hero", JSON.stringify(hero)); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-hero" })); paint(); }));
    $("[data-try]").addEventListener("click", () => { const g = $("#msPvh"); g.classList.remove("cheer"); void g.getBoundingClientRect(); g.classList.add("cheer"); SFX[hero.weapon](); });
    paint();
  }

  /* ---------- a mission ---------- */
  function battle(w, mi) {
    const m = w.missions[mi], v = m.make(Math.random), steps = m.steps;
    let i = 0, tries = 0, coins = 0, firstTry = 0, marks = 0, shown = 0, done = false;
    const got = [];
    view = "battle";
    if (window.NMKBack) NMKBack.view({ mview: "battle", mworld: w.world });
    const big = m.boss ? 1.25 : 1;
    frame(`<div class="ms-scene" id="msScene">
      <svg viewBox="0 0 640 260" role="img" aria-label="Your character facing ${esc(m.monsterName)}">
        <rect width="640" height="260" fill="${m.boss ? "#e6dccb" : "#cfe8dd"}"/><g stroke="${m.boss ? "#d6c9b2" : "#bcdccd"}" stroke-width="1"><path d="M0 40H640M0 80H640M0 120H640M80 0V200M160 0V200M240 0V200M320 0V200M400 0V200M480 0V200M560 0V200"/></g>
        <rect y="196" width="640" height="64" fill="${m.boss ? "#b9a888" : "#8fc7a6"}"/><path d="M0 196 H640" stroke="${m.boss ? "#9a8a6c" : "#6aa985"}" stroke-width="3"/>
        <g transform="translate(160 138) scale(1.15)">${heroSvg(hero, "msHero")}</g>
        <g transform="translate(215 150)">
          <g class="ms-shot" data-w="blaster"><path d="M0 0 q5 -9 10 0 t10 0 t10 0 t10 0" stroke="#1db86a" stroke-width="4" fill="none" stroke-linecap="round"/></g>
          <g class="ms-shot" data-w="bow"><path d="M0 -12 q10 12 0 24 M10 -18 q14 18 0 36 M20 -24 q18 24 0 48" stroke="#2a7fd4" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
          <g class="ms-shot" data-w="staff"><circle r="11" fill="#ff7a1a"/><circle r="6" fill="#ffd34d"/></g></g>
        <path id="msSlash" d="M420 100 Q470 120 500 190 Q480 140 420 100 Z" fill="#fff" stroke="#9aa9b8" stroke-width="2"/>
        <g transform="translate(470 200) scale(${big})"><g id="msMon"><ellipse cx="0" cy="0" rx="70" ry="10" fill="#000" opacity=".15"/>${MON[m.monster] || MON.slime}</g></g>
        <text x="470" y="${m.boss ? 22 : 44}" font-family="IBM Plex Sans, sans-serif" font-size="15" font-weight="600" text-anchor="middle" fill="#26215c">${esc(m.monsterName)}</text>
        <rect x="400" y="${m.boss ? 30 : 54}" width="140" height="12" rx="6" fill="#fff" stroke="${MON_COL[m.monster] || "#534ab7"}" stroke-width="1.5"/>
        <rect id="msHp" x="402" y="${m.boss ? 32 : 56}" width="136" height="8" rx="4" fill="${MON_COL[m.monster] || "#d4537e"}"/>
        <g id="msVolt" transform="translate(100 84)" role="button" tabindex="0" aria-label="Volt, your helper drone: tap for a hint"><g id="msVoltIn">
          <rect class="ms-prop" x="-26" y="-30" width="20" height="4" rx="2" fill="#9aa9b8"/><rect class="ms-prop" x="6" y="-30" width="20" height="4" rx="2" fill="#9aa9b8"/><path d="M-16 -26 V-18 M16 -26 V-18" stroke="#15243a" stroke-width="2"/>
          <circle r="20" fill="#f6f8fa" stroke="#15243a" stroke-width="2.5"/><rect x="-13" y="-9" width="26" height="16" rx="7" fill="#15243a"/><circle cx="-5" cy="-1" r="3" fill="#5ad1ff"/><circle cx="5" cy="-1" r="3" fill="#5ad1ff"/>
          <path d="M-12 12 H12" stroke="#0b6e6e" stroke-width="3" stroke-linecap="round"/><path d="M1 9 L-3 15 L0 15 L-2 20 L4 13 L1 13 Z" fill="#f0a830"/>
          <g class="ms-bang"><circle cx="18" cy="-18" r="9" fill="#f0a830" stroke="#15243a" stroke-width="2"/><text x="18" y="-14" font-size="12" font-weight="700" text-anchor="middle" fill="#15243a" font-family="sans-serif">!</text></g></g>
          <g class="ms-tag"><g class="ms-tagIn"><rect x="-22" y="-62" width="98" height="22" rx="11" fill="#f0a830" stroke="#15243a" stroke-width="2"/><path d="M-4 -41 L2 -33 L8 -41 Z" fill="#f0a830" stroke="#15243a" stroke-width="2" stroke-linejoin="round"/><path d="M-3 -42 H7" stroke="#f0a830" stroke-width="3"/><text x="27" y="-47" font-size="12" font-weight="700" text-anchor="middle" fill="#15243a" font-family="IBM Plex Sans, sans-serif">I have a hint!</text></g></g></g>
        <text x="320" y="240" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="14" font-weight="600" fill="#04342c">Station ${w.world} · ${m.boss ? "Boss" : `Mission ${mi + 1}`}: ${esc(m.title)}</text>
        <g id="msSparks"></g></svg>
      <div class="ms-banner" id="msBanner" aria-hidden="true"></div><div class="ms-bubble" id="msBubble" aria-live="polite"></div></div>
      <div class="ms-panel" id="msPanel"></div>`);
    const scene = $("#msScene"), panel = $("#msPanel"), H = $("#msHero"), M = $("#msMon");
    const fit = () => { const s = $("svg", scene); if (s) s.setAttribute("viewBox", matchMedia("(max-width: 560px)").matches ? "80 8 475 242" : "0 0 640 260"); };
    fit(); addEventListener("resize", fit);
    if (m.boss) setTimeout(() => { SFX.roar(); replay(M, "laugh", 1000); }, 300);
    const replay = (el, cls, ms) => { if (!el) return; el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
    const pop = (text, x, y, color) => { const f = document.createElement("div"); f.className = "ms-float"; f.textContent = text; f.style.left = x + "%"; f.style.top = y + "%"; f.style.color = color; scene.appendChild(f); setTimeout(() => f.remove(), 1000); };
    const banner = (t) => { const b = $("#msBanner"); b.textContent = t; b.classList.add("on"); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove("on"), 1800); };
    const volt = (html, ms = 6500) => { const b = $("#msBubble"); b.innerHTML = `<b>Volt:</b> ${html}`; b.classList.add("on"); clearTimeout(volt.t); volt.t = setTimeout(() => b.classList.remove("on"), ms); };
    const hintOf = (s, k) => esc(val(s.hints[k], v));
    const tapVolt = () => {
      SFX.beep(); $("#msVolt").classList.remove("alert");
      if (done) return volt("Great work, engineer! The plant is safe.");
      const open = Math.min(tries, 2);
      if (!open) return volt("Try it on paper first. If you miss, I'll find you a hint!", 4500);
      shown = shown % open; volt(`Hint ${shown + 1} of ${open}: ${hintOf(steps[i], shown)}`); shown++;
    };
    $("#msVolt").addEventListener("click", tapVolt);
    $("#msVolt").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapVolt(); } });
    const data = m.data ? m.data(v) : null;
    // choice steps show their options in a new order each time
    const order = steps.map((s) => { if (!s.choice) return null; const n = val(s.choice, v).length, o = [...Array(n).keys()]; for (let k = n - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; } return o; });

    function draw(msg = "", cls = "") {
      const s = steps[i], q = esc(val(s.q, v)), u = val(s.unit, v);
      panel.innerHTML = `<div class="ms-track">${steps.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>
        <p class="ms-step">Step ${i + 1} of ${steps.length}${s.marks ? ` · ${s.marks} marks` : ""} · ${q}</p>
        ${s.choice ? `<div class="ms-choices" role="group" aria-label="${q}">${order[i].map((k) => `<button type="button" class="btn ghost" data-c="${k}">${esc(val(s.choice, v)[k])}</button>`).join("")}</div>`
          : `<form class="ms-row" id="msF" novalidate><input type="text" id="msA" inputmode="decimal" autocomplete="off" aria-label="${q}" placeholder="Your answer"><span>${esc(u)}</span><button class="btn">Attack</button></form>`}
        <p class="ms-msg ${cls}" id="msMsg" aria-live="polite">${msg}</p>
        <p class="ms-story">${esc(m.story(v))}</p>${data ? `<div class="ms-data">${data.map((d) => `<span>${esc(d)}</span>`).join("")}</div>` : ""}
        ${s.hints.slice(0, Math.min(tries, 2)).map((h, k) => `<div class="ms-hint"><strong>Volt's hint ${k + 1}:</strong> ${hintOf(s, k)}</div>`).join("")}
        <p class="small-note">${s.choice ? "Choose one." : `Give ${s.dp} decimal place${s.dp === 1 ? "" : "s"}.`} Coins: 10 first try · 6 after one hint · 3 after that.</p>`;
      if (s.choice) $$("[data-c]", panel).forEach((b) => b.addEventListener("click", () => answer(+b.dataset.c === s.correct, b.textContent)));
      else {
        const a = $("#msA"); a.focus({ preventScroll: true });
        a.addEventListener("input", () => { $("#msMsg").textContent = ""; });
        $("#msF").addEventListener("submit", (e) => {
          e.preventDefault();
          const r = judge(a.value, s, v);
          if (r.err) { $("#msMsg").className = "ms-msg err"; $("#msMsg").textContent = r.err; return; }
          if (r.almost) { SFX.almost(); $("#msMsg").className = "ms-msg no"; $("#msMsg").textContent = `Almost! Give ${s.dp} decimal places.`; return; }
          answer(r.ok, a.value, r.sign);
        });
      }
    }
    function answer(ok, raw, sign) {
      const s = steps[i];
      if (ok) {
        const c = tries === 0 ? 10 : tries === 1 ? 6 : 3;
        if (tries === 0) firstTry++;
        if (s.marks) marks += s.marks * (tries === 0 ? 1 : tries === 1 ? 0.5 : 0.25);
        coins += c; got[i] = raw; tries = 0; shown = 0;
        $("#msVolt").classList.remove("alert"); $("#msBubble").classList.remove("on");
        if (hero.weapon === "sword") { replay(H, "atk", 450); SFX.sword(); setTimeout(() => replay($("#msSlash"), "cut", 350), 200); }
        else { replay(H, "recoil", 300); SFX[hero.weapon](); setTimeout(() => replay($(`.ms-shot[data-w="${hero.weapon}"]`), "fly", 380), 60); }
        setTimeout(() => {
          replay(M, "hit", 400); SFX.hit();
          $("#msHp").setAttribute("width", Math.max(0, 136 * (steps.length - i) / steps.length));
          pop(c === 10 ? "Critical!" : "Hit!", 73, 30, "#b3261e"); banner(s.choice ? "Correct!" : `Correct: ${fmtAns(s, v)}`);
          setTimeout(() => { pop(`+${c}`, 12, 8, "#b86e00"); SFX.coin(); }, 250);
        }, 470);
        i++;
        $$("button, input", panel).forEach((b) => { b.disabled = true; });
        if (i < steps.length) setTimeout(() => draw(s.choice ? "Correct! Next step." : `Correct! ${fmtAns(s, v)}. Next step.`, "ok"), 900);
        else setTimeout(victory, 1300);
      } else {
        tries++;
        replay(M, "laugh", 1000); replay(H, "sad", 600); SFX.miss(); setTimeout(SFX.laugh, 250);
        pop("Miss", 73, 26, "#4a5a70"); banner(sign ? "Check the sign!" : "Missed!");
        const why = sign ? "Right size, wrong sign. Is it above or below?" : "Not quite.";
        draw(tries <= 2 ? `${why} Tap Volt, your drone, for a hint.` : `${why} Check your working with Volt's hints and try again.`, "no");
        if (!s.choice) $("#msA").value = raw;
        if (tries <= 2) { shown = tries - 1; setTimeout(() => { $("#msVolt").classList.add("alert"); SFX.beep(); volt("Beep! I have a hint. Tap me!", 2500); }, 700); }
      }
    }
    function victory() {
      done = true;
      replay(M, "faint", 5000); SFX.faint();
      $("#msSparks").innerHTML = [0, 1, 2, 3, 4].map((k) => `<circle class="ms-spark" cx="${430 + k * 20}" cy="${140 + (k % 2) * 30}" r="10" fill="#ffd34d" style="animation-delay:${k * 0.1}s"/>`).join("");
      setTimeout(() => { replay(H, "cheer", 2100); SFX.win(); }, 700);
      const st = firstTry === steps.length ? 3 : firstTry >= steps.length - 1 ? 2 : 1;
      const bonus = (st === 3 ? 10 : 0) + (m.boss ? 50 : 0), total = coins + bonus, mk = Math.round(marks * 2) / 2;
      const before = best()[m.id];
      if (!isLec) saveBest(m, { c: total, s: st, mk });
      else { const all = best(); all[m.id] = Object.assign({}, all[m.id] || {}, { t: m.title, w: w.world, c: Math.max((all[m.id] || {}).c || 0, total), s: Math.max((all[m.id] || {}).s || 0, st), ...(m.boss ? { mk, of: m.marks || 30, boss: 1 } : {}) }); lsSet("nmk-missions", JSON.stringify(all)); }
      setTimeout(() => {
        const nb = before && before.c >= total ? `Your best is still ${before.c} coins.` : before ? "A new best!" : "";
        panel.innerHTML = `<div class="ms-win"><p class="ms-step" style="font-size:1.2rem">${m.boss ? "Boss defeated!" : "Mission complete!"} ${esc(m.monsterName)} is fixed.</p>
          <div class="ms-big">${stars(st)}</div>
          <p>You earned <strong>${total} coins</strong>${bonus ? ` (with a ${bonus}-coin bonus)` : ""}. ${firstTry} of ${steps.length} steps right on the first try. ${nb}</p>
          ${m.boss ? `<p class="ms-mock">Boss score: <strong>${mk} / ${m.marks || 30}</strong> <span class="small-note">(full marks for a first-try step, half after one hint, a quarter after that)</span></p>` : ""}</div>
          <div class="ms-working"><p><strong>Full working</strong> (compare with your paper)</p>${steps.map((s, k) => `<p><strong>${esc(val(s.q, v))}</strong><br>${s.choice ? `Answer: ${esc(val(s.choice, v)[s.correct])}` : `${esc(s.formula)}<br>${esc(s.sub(v))} = <strong>${esc(fmtAns(s, v))}</strong>`}${got[k] && !s.choice ? ` <span class="small-note">(you: ${esc(got[k])})</span>` : ""}</p>`).join("")}</div>
          <div class="ms-row ms-center"><button type="button" class="btn" data-again>Play again (new numbers)</button><button type="button" class="btn ghost" data-back-world>Back to the station</button></div>`;
        $("[data-again]", panel).addEventListener("click", () => { SFX.click(); battle(w, mi); });
        $("[data-back-world]", panel).addEventListener("click", () => { SFX.click(); go("world", true, w); });
        const cp = $("#msCoins strong"); if (cp) cp.textContent = totalCoins();
      }, 1600);
    }
    draw();
  }

  /* ---------- clicks ---------- */
  page.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-snd")) { soundOn = !soundOn; lsSet("nmk-msnd", soundOn ? "1" : "0"); b.setAttribute("aria-pressed", soundOn); b.textContent = soundOn ? "🔊 Sound on" : "🔇 Sound off"; SFX.click(); return; }
    if (b.dataset.go) { SFX.click(); return go(b.dataset.go); }
    if (b.dataset.world) { const w = WORLDS.find((x) => x.world === +b.dataset.world); if (w && worldOpen(w)) { SFX.click(); go("world", true, w); } return; }
    if (b.dataset.play) { SFX.click(); battle(openWorld, +b.dataset.play); }
  });

  /* ---------- start: who may play, and loading the mission files ---------- */
  function gate(html) { page.innerHTML = `<div class="ms-gate">${html}</div>`; }
  async function start(st) {
    if (!st.ready) return;
    if (!st.user) { gate(`<p><strong>Sign in to play.</strong> Missions are for NMK42003 students: sign in with your studentmail account.</p><button type="button" class="btn" id="msIn">Sign in with Google</button>`); $("#msIn").addEventListener("click", () => A.signIn()); return; }
    isLec = A.isAdmin(st.user.email);
    const db = A.db;
    let released = false;
    try { const d = await db.collection("meta").doc("missions").get(); released = !!(d.exists && d.data().released); } catch (e) { /* rules not published yet */ }
    A.released = released;
    if (!isLec && !released) { gate(`<p><strong>Missions are coming soon.</strong> Your lecturer will open them when they're ready.</p>`); return; }
    if (!isLec && !(st.profile && st.profile.status === "approved")) { gate(`<p><strong>Your account is waiting for approval.</strong> Missions open once your lecturer approves it.</p>`); return; }
    gate(`<p class="small-note">Loading the missions…</p>`);
    try {
      const q = await db.collection("missions").get();
      WORLDS = q.docs.map((d) => { try { const w = new Function(d.data().code)(); return w && Array.isArray(w.missions) ? w : null; } catch (e) { console.warn("NMK missions: could not read", d.id, e); return null; } })
        .filter(Boolean).sort((a, b) => a.world - b.world);
    } catch (e) { gate(`<p>Could not load the missions (${esc(e.code || e)}). ${isLec ? "If this says permission-denied, publish the latest firebase/firestore.rules." : "Please try again later."}</p>`); return; }
    const hs = history.state || {};
    const w = hs.mworld ? WORLDS.find((x) => x.world === hs.mworld) : null;
    go(hs.mview === "room" ? "room" : w ? "world" : "map", false, w);
    if (window.NMKBack) NMKBack.view({ mview: view, mworld: openWorld ? openWorld.world : null }, true);
  }
  if (window.NMKBack) NMKBack.onView((s) => { const w = s.mworld ? WORLDS.find((x) => x.world === s.mworld) : null; go(s.mview === "room" ? "room" : w ? "world" : "map", false, w); });
  const boot = () => { A = window.NMKAccount; if (!A) { gate(`<p>Missions need the course account system, which didn't load. Please reload the page.</p>`); return; } A.on((st) => { if (st.ready) start(st); }); };
  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
