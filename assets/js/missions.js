/* INSTRUMENTA: Legends (missions.html): a battle game for practising each chapter. Each chapter has three stations,
   each guarded by a named enemy; the third is the boss (the tough level, with 5 hearts and +50 coins). No marks: coins and hearts are the score.
   The questions are not in this file. A lecturer uploads each chapter's file on the dashboard (admin.html); it is kept
   in Firestore missions/{world N} and only lecturers, or signed-in students after the lecturer releases the game
   (meta/missions.released), can read it. This file is the engine: map, My Character, battle, Volt the helper drone,
   answer checking, coins, hearts, ranks, sound and music. The art is in legends-art.js, the music in legends-music.js.
   A right answer strikes the enemy and earns coins; a wrong one is blocked by the enemy's shield, the enemy strikes
   back (one heart lost) and 2 coins drop (never below 0). No hearts left: the station starts again with new numbers.
   Saved in this browser (and synced with the account, so a student can carry on on another device): nmk-missions
   (best result of each station), nmk-msave (a station in progress: its seed, so the same numbers come back, the
   question reached, hearts, coins; "cleared" once it is won or lost), nmk-hero (the character and its hero name).
   Also here: the splash screen (5 s, each time the page opens), the Credits (About) view and the 9:16 share cards. nmk-msnd (sound), nmk-mus and nmk-musv (music on/off and volume) stay on this device. */
(function () {
  "use strict";
  const page = document.getElementById("missions");
  if (!page || typeof COURSE === "undefined") return;
  const ART = window.NMKLegendsArt, MUS = window.NMKLegendsMusic;
  if (!ART) { page.innerHTML = `<p class="small-note">The game didn't load. Please reload the page.</p>`; return; }
  const reduceM = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- the splash: every time the game page opens, 5 s; a tap (or a key) skips it ---------- */
  (function splash() {
    if (new URLSearchParams(location.search).has("nosplash")) return;
    const s = document.createElement("div");
    s.className = "lg-splash"; s.setAttribute("aria-hidden", "true");
    s.innerHTML = `<div class="lg-spin"><div class="lg-sp1">${ART.zamm(true)}</div><p class="lg-sp2">presents</p><div class="lg-sp3">${ART.logo()}</div>
      <p class="lg-sp4"><span>Created by</span> <b>Ts. Dr. Mohd Zamri Bin Zahir Ahmad</b></p><p class="lg-sp5">Faculty of Electronic Engineering &amp; Technology · UniMAP</p></div><span class="lg-spskip">Tap to skip</span>`;
    document.body.appendChild(s);
    const end = () => { if (s.classList.contains("out")) return; s.classList.add("out"); document.removeEventListener("keydown", end); setTimeout(() => s.remove(), reduceM ? 0 : 450); };
    s.addEventListener("click", end); document.addEventListener("keydown", end);
    setTimeout(end, 5000);
  })();
  const $ = (s, r = page) => r.querySelector(s), $$ = (s, r = page) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const reduce = reduceM;
  const val = (f, v) => (typeof f === "function" ? f(v) : f);
  let A = null, isLec = false, WORLDS = [], view = "map", openWorld = null;
  // things to undo when the view changes (listeners, timers, an open hint)
  let teardown = [];
  const cleanup = () => teardown.splice(0).forEach((f) => { try { f(); } catch (e) { /* already gone */ } });

  /* ---------- saved progress ---------- */
  const best = () => parse(lsGet("nmk-missions"), {}) || {};
  const totalCoins = () => Object.values(best()).reduce((s, r) => s + (r.c || 0), 0);
  function saveBest(w, m, r) {
    const all = best(), old = all[m.id] || {};
    all[m.id] = { t: m.title, w: w.world, c: Math.max(old.c || 0, r.c), s: Math.max(old.s || 0, r.s), at: old.c >= r.c ? old.at : new Date().toISOString(),
      ...(m.boss ? { boss: 1 } : {}), n: (old.n || 0) + 1 };
    lsSet("nmk-missions", JSON.stringify(all));
    if (!isLec) document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-missions" }));
  }

  /* ---------- a station in progress: saved after every answer, so it can be continued later (on any device) ---------- */
  const saves = () => parse(lsGet("nmk-msave"), {}) || {};
  // question pools (9 Nov 2026): a mission with \`ask: n\` asks n of its steps in each battle, picked from the battle's seed
  // (so Continue brings the same ones back); steps marked \`core: true\` are always asked; the file's order is kept
  const askN = (m) => (m.ask && m.ask < m.steps.length ? m.ask : m.steps.length);
  function stepsOf(m, seed) {
    if (askN(m) === m.steps.length) return m.steps;
    const r = seeded(seed + 104729), idx = m.steps.map((x, k) => k), core = idx.filter((k) => m.steps[k].core), rest = idx.filter((k) => !m.steps[k].core);
    for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
    return core.concat(rest.slice(0, Math.max(0, askN(m) - core.length))).sort((a, b) => a - b).map((k) => m.steps[k]);
  }
  const saveOf = (m) => { const s = saves()[m.id]; return s && !s.cleared && s.n === askN(m) && s.i < s.n ? s : null; };
  // Every answer is saved on this device. To save Firestore writes it goes to the account only now and then:
  // push "soon" (every 3rd answer, a win or a knock-out) or true (Save and exit, at once); leaving the tab sends it too.
  function putSave(id, rec, push) {
    const all = saves(); all[id] = Object.assign({ at: new Date().toISOString() }, rec);
    lsSet("nmk-msave", JSON.stringify(all));
    if (push) document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-msave" }));
    if (push === true && A && A.push) A.push();
  }
  const clearSave = (id) => putSave(id, { cleared: true }, "soon");
  // numbers drawn from a saved seed, so a continued station has the same questions
  /* ---------- Ask Dr. Zamri and the game (lecturer's choice): the helper rests during a battle (Volt gives the hints);
     its answer guard knows every question of each unfinished station (the same numbers come back from the saved seed),
     so it never gives them. (The old "AI asks" count was removed on 9 Nov 2026, lecturer's choice.) ---------- */
  let liveQ = null;
  function unfinished() {
    const sv = saves(), out = [];
    WORLDS.forEach((w) => w.missions.forEach((m) => { const x = sv[m.id]; if (x && !x.cleared && x.seed) out.push({ m, seed: x.seed, at: x.at || "" }); }));
    if (liveQ && !out.some((o) => o.m.id === liveQ.m.id)) out.push({ m: liveQ.m, seed: liveQ.seed, at: new Date().toISOString() });
    return out;
  }
  (window.NMKAIGuards = window.NMKAIGuards || []).push(() => unfinished().flatMap(({ m, seed }) => {
    let v; try { v = m.make(seeded(seed)); } catch (e) { return []; }
    return stepsOf(m, seed).map((st) => {
      const q = asQuestion(val(st.q, v));
      if (st.choice) { const ch = val(st.choice, v) || []; return { q, opt: ch[st.correct], others: ch.filter((o, k) => k !== st.correct) }; }
      const a = st.ans(v); return { q, v: a, tol: st.fixed ? st.tol : Math.max(Math.abs(a) * 0.01, st.tol || 0), u: val(st.unit, v) || "" };
    });
  }));
  const seeded = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- sound effects and music: made in the browser (no files) ---------- */
  let soundOn = lsGet("nmk-msnd") !== "0", musicOn = lsGet("nmk-mus") !== "0", musicVol = +(lsGet("nmk-musv") || 60), ac = null;
  const actx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); return ac; };
  if (MUS) { MUS.init(actx); MUS.setStyle("synth"); MUS.setVolume(musicVol / 100); }
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
  const duck = () => { if (MUS && soundOn) MUS.duck(); };
  const SFX = {
    click: () => tone(660, 0, 0.05, "square", 0.04),
    sword: () => { duck(); noise(0, 0.12, 0.12); tone(1800, 0, 0.22, "triangle", 0.05, 500); },
    blaster: () => { duck(); tone(1300, 0, 0.22, "square", 0.05, 260); },
    bow: () => { duck(); noise(0, 0.25, 0.06); tone(500, 0, 0.3, "sine", 0.08, 1100); },
    staff: () => { duck(); noise(0, 0.35, 0.1); tone(220, 0, 0.3, "sawtooth", 0.05, 90); },
    hit: () => { noise(0, 0.18, 0.2); tone(140, 0, 0.2, "sine", 0.2, 60); },
    coin: () => { tone(988, 0, 0.07, "square", 0.06); tone(1319, 0.07, 0.2, "square", 0.06); },
    clang: () => { duck(); tone(1250, 0, 0.35, "square", 0.04, 980); tone(1870, 0, 0.3, "triangle", 0.05, 1500); noise(0, 0.08, 0.12); },
    strike: () => { duck(); noise(0, 0.3, 0.1); tone(180, 0, 0.35, "sawtooth", 0.07, 70); },
    hurt: () => { tone(360, 0, 0.28, "sawtooth", 0.07, 130); },
    drop: () => [0, 0.08, 0.16].forEach((t, k) => tone(880 - k * 180, t, 0.12, "square", 0.045)),
    beep: () => { tone(1320, 0, 0.08, "sine", 0.07); tone(1760, 0.09, 0.1, "sine", 0.07); },
    almost: () => tone(880, 0, 0.12, "sine", 0.06, 990),
    // the cheeky enemy: "ha-ha-ha" (bigger on the last heart), the combo chime, the battery charging, the enemy breaking up
    laugh: (big) => { duck(); (big ? [0, 0.12, 0.24, 0.36, 0.48] : [0, 0.13, 0.26]).forEach((t, k) => tone((big ? 520 : 640) - k * 34, t, 0.1, "triangle", 0.075, (big ? 400 : 520) - k * 34)); },
    combo: (n) => [0, 0.06, 0.12].forEach((t, k) => tone(660 * Math.pow(1.26, k) * (1 + Math.min(n, 6) * 0.06), t, 0.09, "square", 0.05)),
    charge: () => { duck(); tone(160, 0, 0.95, "sine", 0.08, 1300); tone(1760, 0.9, 0.22, "triangle", 0.05); tone(2349, 1.0, 0.32, "triangle", 0.05); },
    shatter: () => { noise(0, 0.45, 0.16); [1568, 1319, 1047, 1760, 2093].forEach((f, k) => tone(f, 0.04 + k * 0.05, 0.14, "square", 0.03)); },
    nooo: () => tone(320, 0, 0.9, "sawtooth", 0.05, 110),
    roar: () => { duck(); noise(0, 0.6, 0.14); tone(90, 0, 0.6, "sawtooth", 0.08, 50); },
    win: () => { duck(); [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.22, "square", 0.06)); tone(1319, 0.5, 0.5, "square", 0.06); },
    faint: () => tone(400, 0, 0.7, "triangle", 0.08, 80),
    ko: () => { duck(); [440, 370, 311, 262].forEach((f, i) => tone(f, i * 0.18, 0.3, "triangle", 0.08)); },
    rankup: () => { duck(); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.1, 0.3, "square", 0.05)); tone(2093, 0.7, 0.7, "triangle", 0.06); }
  };
  function setMusic(on) {
    musicOn = on; lsSet("nmk-mus", on ? "1" : "0");
    if (!MUS) return;
    if (on) MUS.start(); else MUS.stop();
    $$("[data-mus]").forEach((b) => b.setAttribute("aria-pressed", String(on)));
    $$(".lg-vol").forEach((r) => { r.hidden = !on; });
  }
  // browsers allow sound only after a tap: a player who left the music on hears it from their first tap
  const firstTap = () => { document.removeEventListener("pointerdown", firstTap, true); if (musicOn && MUS && !MUS.on) MUS.start(); };
  document.addEventListener("pointerdown", firstTap, true);
  document.addEventListener("visibilitychange", () => {
    page.classList.toggle("lg-paused", document.hidden);
    if (ac) { try { if (document.hidden) ac.suspend(); else ac.resume(); } catch (e) { /* closed */ } }
  });

  /* ---------- the player's character ---------- */
  const OPT = {
    look: [["m", "Male"], ["f", "Female"], ["t", "Female (tudung)"]],
    hairM: [["spiky", "Spiky"], ["neat", "Neat"], ["buzz", "Short"]],
    hairF: [["long", "Long"], ["pony", "Ponytail"], ["bob", "Bob"]],
    face: [["none", "None"], ["mous", "Moustache"], ["goatee", "Goatee"], ["beard", "Beard"]],
    head: [["none", "None"], ["cap", "Cap"], ["kopiah", "Kopiah"], ["hardhat", "Safety helmet"]],   // kopiah: male look only
    tudS: [["bawal", "Bawal"], ["sarung", "Sarung"], ["shawl", "Shawl"]],
    brooch: [["none", "None"], ["gold", "Gold"], ["pearl", "Pearl"], ["flower", "Flower"]],
    badge: [["none", "None"], ["id", "ID lanyard"]],
    eyes: [["none", "None"], ["round", "Glasses"], ["goggles", "Lab goggles"]],
    weapon: [["sword", "Probe Sword"], ["blaster", "Scope Blaster"], ["bow", "Signal Bow"], ["staff", "Solder Staff"]]
  };
  const NOTE = { sword: "A giant multimeter probe. Slashes up close.", blaster: "An oscilloscope cannon. Fires a sine wave.", bow: "An antenna bow. Shoots radio waves.", staff: "A soldering-iron staff. Hurls a hot spark." };
  const SKINS = ["#f6d5b5", "#e3ad80", "#b07650"], HAIRS = ["#1f1a17", "#4a2c1a", "#7a4a26", "#a8a8a8"];
  const COLORS = ["#0b6e6e", "#1e3a5f", "#b3412e", "#6b4bb8", "#2f7d32", "#c2185b"], TUDUNG = ["#e8d6c0", "#f4c6d4", "#cfe0f2", "#2b2b2b", "#1e3a5f", "#7a2338", "#1f7a55", "#f7f7f2"];
  const HERO0 = { look: "m", hairM: "spiky", hairF: "long", face: "none", head: "none", eyes: "none", hair: HAIRS[0], skin: SKINS[0], color: COLORS[0], tud: TUDUNG[0], tudS: "bawal", brooch: "none", badge: "none", weapon: "sword", name: "" };
  let hero = Object.assign({}, HERO0, parse(lsGet("nmk-hero"), {}));
  // weapon upgrades are earned: journey level 3 makes it glow; a defeated boss makes it gold ("Calibrated")
  /* the hero name (max 10 letters, numbers and spaces): shown on the leaderboard and the share cards. A word filter
     (English and Malay) stops rude names; a lecturer can remove any name (meta/heronames: bans {uid: name}). */
  let BANS = {}, nameRemoved = false;
  const BAD = ["fuck", "fck", "fuk", "shit", "bitch", "cunt", "pussy", "asshole", "bastard", "slut", "whore", "nigg", "fag", "porn", "penis", "vagina", "boob", "tits", "nazi", "hitler",
    "babi", "bodoh", "sial", "puki", "kimak", "pantat", "lancau", "butoh", "sundal", "jubur", "haramjadah", "celaka", "bangsat", "keparat", "anjing", "lahanat", "bapuk", "pondan",
    "jalang", "pelacur", "tetek", "burit", "kontol", "pepek", "bangang", "bengap", "bahlul", "pukimak", "ganja", "dadah", "syabu", "kokain"];
  const flat = (n) => String(n).toLowerCase().replace(/[0@4]/g, (c) => (c === "0" ? "o" : "a")).replace(/1/g, "i").replace(/3/g, "e").replace(/5/g, "s").replace(/7/g, "t").replace(/[^a-z]/g, "");
  const myUid = () => (A && A.state && A.state.user ? A.state.user.uid : "");
  const isBanned = (uid, n) => !!n && String(BANS[uid] || "").toLowerCase() === String(n).toLowerCase();
  function nameProblem(n) {
    if (!n) return "";
    if (!/^[A-Za-z0-9 ]{1,10}$/.test(n)) return "Use up to 10 letters, numbers and spaces.";
    const f = flat(n), g = f.replace(/(.)\1+/g, "$1");
    if (BAD.some((w) => f.includes(w) || g.includes(w))) return "Please choose a decent name.";
    if (isBanned(myUid(), n)) return "Your lecturer removed this name. Please choose another one.";
    return "";
  }
  const nickOf = () => (A && A.state && A.state.profile && A.state.profile.nickname) || "";
  const heroLabel = () => (hero.name && !isBanned(myUid(), hero.name) ? hero.name : nickOf() || "Player");
  const tier = () => { const g = window.NMKGame && NMKGame.local ? NMKGame.local() : null; return Object.values(best()).some((r) => r.boss) ? 2 : g && g.levelNo >= 3 ? 1 : 0; };

  /* ---------- enemies: the named ones in legends-art.js; anything else gets a plain slime ---------- */
  const SLIME = `<path d="M-62 0 Q-74 -86 0 -96 Q74 -86 62 0 Q40 6 20 -2 Q0 6 -20 -2 Q-40 6 -62 0 Z" fill="#8b7cf0" stroke="#3c3489" stroke-width="2.5"/><circle cx="-20" cy="-50" r="11" fill="#fff" stroke="#26215c" stroke-width="2"/><circle cx="20" cy="-50" r="11" fill="#fff" stroke="#26215c" stroke-width="2"/><circle cx="-17" cy="-48" r="5" fill="#26215c"/><circle cx="17" cy="-48" r="5" fill="#26215c"/>`;
  /* ---------- the battery (lecturer's choice): one battle a week keeps it Charged; rank and coins never drop ---------- */
  const GM = window.NMKGame || {};
  let PAUSES = [];   // the lecturer's pauses (meta/missions.bat.p): exam weeks and breaks don't run batteries down
  const lastPlay = () => { let t = ""; [best(), saves()].forEach((o) => Object.values(o).forEach((r) => { if (r && r.at && r.at > t) t = r.at; })); return t; };
  const bat = (last) => (GM.battery ? GM.battery(last === undefined ? lastPlay() : last, PAUSES) : null);
  const BATL = { charged: "Charged", low: "Low battery", flat: "Flat battery" };
  const batSvg = (fill, st, cls = "") => { const c = fill > 0.5 ? "#22c55e" : fill > 0.15 ? "#f59e0b" : "#ef4444";
    return `<svg class="lg-bsvg ${cls}" viewBox="0 0 40 20" aria-hidden="true" focusable="false"><rect x="1" y="2" width="34" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="36" y="7" width="3" height="6" rx="1" fill="currentColor"/><rect class="lg-bfill" x="3.5" y="4.5" width="${(29 * fill).toFixed(1)}" height="11" rx="1.5" fill="${c}" style="--fw:${(29 * fill).toFixed(1)}px"/>${st === "charged" ? `<path d="M20 4 L15 11 H19 L17 16 L23 9 H19 Z" fill="#fff" stroke="#14213d" stroke-width=".8"/>` : ""}</svg>`; };
  const batNote = (b) => (b.paused ? "Paused by your lecturer" : b.st === "charged" ? `Low in ${Math.max(1, Math.ceil(7 - b.d))} day${Math.ceil(7 - b.d) > 1 ? "s" : ""}` : b.st === "low" ? `Flat in ${Math.max(1, Math.ceil(14 - b.d))} day${Math.ceil(14 - b.d) > 1 ? "s" : ""}` : "Play one battle to recharge");
  function batBadge() {
    const b = bat(); if (!b) return "";
    return `<button type="button" class="lg-bat b-${b.st}" data-guide="battery" aria-label="Battery: ${BATL[b.st]}. ${batNote(b)}. Tap for details.">${batSvg(b.fill, b.st)}<span><b>${b.paused ? "⏸ " : ""}${BATL[b.st]}</b><small>${batNote(b)}</small></span>${b.st === "flat" ? `<i class="lg-zzz" aria-hidden="true">z z z</i>` : ""}</button>`;
  }
  // the reminder on the map: from day 8 (Low), stronger from day 12, and when Flat
  function batReminder() {
    const b = bat(); if (!b || b.paused || b.st === "charged") return "";
    const left = Math.max(1, Math.ceil(14 - b.d));
    return `<div class="lg-brem b-${b.st}" role="status">${b.st === "flat" ? "🪫 Your battery is flat. Play one battle to recharge!" : b.d >= 12 ? `🪫 ${left} day${left > 1 ? "s" : ""} until your battery is flat! Play one battle to recharge.` : "🔋 Your battery is getting low. Play one battle to recharge!"}</div>`;
  }
  const TAUNTS0 = ["Hehe! Missed me!", "Is that all you've got?", "Check your working again!", "Too slow, too wrong!", "Try harder, engineer!"];
  const enemyOf = (m) => { const e = ART.ENEMIES[m.monster] || { name: "Fault Slime", weak: "", taunt: "", color: "#534ab7", scale: 1, svg: SLIME }; return Object.assign({}, e, { name: m.monsterName || e.name, boss: !!m.boss || !!e.boss }); };
  const portrait = (e, cls = "") => `<svg class="lg-por ${cls}" viewBox="${e.boss ? "-170 -250 340 262" : "-130 -232 260 244"}" aria-hidden="true" focusable="false">${e.svg}</svg>`;

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
  // a short number question ("Absolute error, e") reads as a full question ("What is the absolute error, e?")
  const asQuestion = (q) => { q = String(q).trim(); if (/[?.]$/.test(q)) return q; const w = q.split(/[\s,]/)[0]; return `What is ${w.length > 2 && /^[A-Z][a-z]/.test(w) ? `the ${q[0].toLowerCase()}${q.slice(1)}` : q}?`; };
  const fmtAns = (s, v) => `${s.ans(v).toFixed(s.dp)}${val(s.unit, v) ? ` ${val(s.unit, v)}` : ""}`;

  /* ---------- unlocking: a chapter opens in the week it is lectured; a station after the one before it ---------- */
  const todayISO = () => { const q = new URLSearchParams(location.search).get("today"); if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q; try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  function opensOn(w) {
    const t = COURSE.topics.find((x) => x.no === w.chapter), wk = t ? +((String(t.weeks).match(/\d+/) || [1])[0]) : 1;
    const d = new Date(COURSE.semesterStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7 * (wk - 1));
    return { iso: d.toISOString().slice(0, 10), week: wk };
  }
  let asStudent = false;   // a lecturer previewing the student's locks (this visit only)
  let LOCKS = {};          // the lecturer's locks (meta/missions.locks): "world1" = a whole chapter, "w1-s3" = one station
  const free = () => isLec && !asStudent;
  const chLocked = (w) => !!LOCKS[`world${w.world}`], stLocked = (m) => !!LOCKS[m.id];
  const worldOpen = (w) => free() || (!chLocked(w) && opensOn(w).iso <= todayISO());
  const missionOpen = (w, i) => { if (free()) return true; if (!worldOpen(w) || stLocked(w.missions[i])) return false; const b = best(); return w.missions.slice(0, i).every((m) => b[m.id]); };
  const LOCKED = "🔒 Locked by your lecturer";
  const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
  const stars = (n, of = 3) => `<span class="ms-stars" aria-label="${n} of ${of} stars">${"★".repeat(n)}${"☆".repeat(of - n)}</span>`;

  /* ---------- the page frame: the stage (rank, coins, music) and the views ---------- */
  // music (with its volume when on) and sound effects as small round buttons
  const sounds = () => `<span class="lg-snds"><button type="button" class="lg-ic" data-mus aria-pressed="${musicOn}" aria-label="Music" title="Music">♪</button>
      <input type="range" class="lg-vol" min="0" max="100" step="5" value="${musicVol}" aria-label="Music volume"${musicOn ? "" : " hidden"}>
      <button type="button" class="lg-ic" data-snd aria-pressed="${soundOn}" aria-label="Sound effects" title="Sound effects">${soundOn ? "🔊" : "🔇"}</button></span>`;
  const coinPill = () => `<span class="ms-pill lg-coins"><span class="ms-coin"></span><strong id="msCoins">${totalCoins()}</strong> <small>coins</small></span>`;
  // the stage's coin counter (9 Nov 2026): gold, glowing, a ring showing the way to the next rank; a tap opens Ranks.
  // After a battle the number counts up from what this tab last showed, with a "+N" that floats away.
  const coinBig = (coins, R, nx) => { const f = nx ? Math.max(0, Math.min(1, (coins - R.min) / (nx.min - R.min))) : 1, C = 2 * Math.PI * 21;
    return `<button type="button" class="lg-coinb" data-guide="ranks" aria-label="${coins} coins. ${nx ? `${nx.min - coins} more to ${esc(nx.n)}.` : "Top rank."} See the ranks">
      <span class="lg-cring" aria-hidden="true"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="21" class="lg-crt"/><circle cx="25" cy="25" r="21" class="lg-crf" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}"/></svg><span class="lg-cface">🪙</span></span>
      <span class="lg-ctx"><strong id="msCoins">${coins}</strong><small>${nx ? `${nx.min - coins} to ${esc(nx.n)}` : "Top rank!"}</small></span><span class="lg-cplus" aria-hidden="true"></span></button>`; };
  let coinSeen = null;
  try { coinSeen = sessionStorage.getItem("nmkcoinseen"); coinSeen = coinSeen == null ? null : +coinSeen; } catch (e) { coinSeen = null; }
  function coinCount() {
    const el = $("#msCoins"), now = totalCoins(), from = coinSeen;
    coinSeen = now; try { sessionStorage.setItem("nmkcoinseen", String(now)); } catch (e) { /* private mode */ }
    if (!el || from == null || now <= from || !el.closest(".lg-coinb")) return;
    const btn = el.closest(".lg-coinb"), plus = $(".lg-cplus", btn);
    if (plus) { plus.textContent = `+${now - from}`; btn.classList.add("got"); setTimeout(() => btn.classList.remove("got"), 1600); }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now(), D = 900; el.textContent = from;
    const step = (t) => { const k = Math.min(1, (t - t0) / D); el.textContent = Math.round(from + (now - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function frame(body, battleView) {
    const coins = totalCoins(), rk = ART.rankOf(coins), R = ART.RANKS[rk], nx = ART.RANKS[rk + 1], bt = bat();
    if (MUS) MUS.setMood(R.s);
    const lec = isLec ? `<div class="ms-lec">${A.released ? "Released: students can play." : "<strong>Not released yet:</strong> only lecturers can see this page."} Lecturer plays are saved on this device only and never appear on the board. <a href="admin.html?tab=missions">Release or upload in Lecturer Tools ›</a>
      <label class="ms-asstu"><input type="checkbox" data-asstu${asStudent ? " checked" : ""}> Preview as a student: stations unlock one by one, and chapters open in the week they are lectured</label></div>` : "";
    const stage = battleView ? `<div class="lg-mini"><strong class="lg-mlogo">INSTRUMENTA: <em>Legends</em></strong><span class="lg-mrank">${esc(R.n)}</span><span class="ms-sp"></span>${coinPill()}${sounds()}<button type="button" class="lg-btn lg-save" data-saveexit><span aria-hidden="true" style="font-size:1.2em">💾</span> Save and exit</button></div>`
      : `<div class="lg-stage">${ART.bg(rk)}<div class="lg-hud">
          <div class="lg-brand">${ART.logo()}<small class="lg-by">by Ts. Dr. Zamri Zahir</small></div>
          <div class="lg-rankw"><div class="lg-rank" data-guide="ranks" role="button" tabindex="0" aria-label="Your rank: ${esc(R.n)}. See all ranks"><span class="lg-rk">Rank ${rk + 1} of ${ART.RANKS.length} · ${esc(R.scene)}</span><strong class="lg-rn${bt ? ` b-${bt.st}` : ""}">${bt ? `<span class="lg-rnb">${GM.BATTERY[bt.st][0]} ${GM.BATTERY[bt.st][1]}</span> ` : ""}${esc(R.n)}</strong>
            <span class="lg-bar" role="progressbar" aria-label="Progress to the next rank" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}"><i style="width:${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}%"></i></span>
            <small>${nx ? `${nx.min - coins} more coins to ${esc(nx.n)}` : "Top rank reached. Legendary!"}</small></div>
          ${batBadge()}</div>
        </div><div class="lg-strip">${coinBig(coins, R, nx)}<nav class="lg-nav" aria-label="Game menu">${[["map", "⚔️", "Play", `data-go="map"`], ["board", "🏆", "Leaderboard", `data-go="board"`], ["room", "👤", "My Character", `data-go="room"`], ["guide", "📖", "Guide", `data-guide="play"`]]
          .map(([k, i, l, a]) => { const on = k === "map" ? view === "map" || view === "world" : view === k; return `<button type="button" class="lg-btn lg-mn${k === "map" ? " play" : ""}${on ? " on" : ""}" ${a}${on ? ` aria-current="page"` : ""}><span aria-hidden="true">${i}</span>${l}</button>`; }).join("")}</nav>${sounds()}</div></div>`;
    page.innerHTML = `${lec}${stage}<div id="msView">${body}</div><p class="lg-copy">© 2026 Zamm Studio™ · Ts. Dr. Mohd Zamri Bin Zahir Ahmad</p>`;
    if (!battleView) coinCount();
  }
  function go(v, push = true, w = openWorld) {
    cleanup();
    view = v; openWorld = w;
    if (push && window.NMKBack) NMKBack.view({ mview: v, mworld: w ? w.world : null });
    if (v === "room") return room();
    if (v === "board") return boardView();
    if (v === "about") { guideTab = "credits"; return guideView(); }
    if (v === "guide") return guideView();
    if (v === "world" && w) return worldView(w);
    return mapView();
  }
  function mapView() {
    const b = best();
    frame(`<div class="lg-lead"><p class="lg-lead-h">Play, learn and master each chapter.</p><button type="button" class="lg-howto" data-guide="play">📖 How to play</button></div>${batReminder()}
      <div class="lg-worlds">${WORLDS.map((w) => {
        const open = worldOpen(w), o = opensOn(w), done = w.missions.filter((m) => b[m.id]).length;
        return `<button type="button" class="lg-world${open ? "" : " locked"}" data-world="${w.world}"${open ? "" : ` aria-disabled="true"`}>
          <span class="lg-wch">Chapter ${w.chapter}</span><strong>${esc(w.title.replace(/^(Station|Chapter) \d+:\s*/, ""))}</strong>
          <span class="lg-trio">${w.missions.slice(0, 3).map((m) => `<span class="lg-tri${b[m.id] ? " won" : ""}">${portrait(enemyOf(m))}</span>`).join("")}</span>
          <span class="lg-wfoot">${open ? `${done} of ${w.missions.length} defeated${isLec && chLocked(w) ? " · 🔒 locked for students" : ""}` : chLocked(w) ? LOCKED : `🔒 Opens ${fmtDay(o.iso)} (week ${o.week})`}</span></button>`;
      }).join("") || `<p class="small-note">No chapters yet.${isLec ? " Upload a mission file in Lecturer Tools (INSTRUMENTA Chapters)." : ""}</p>`}</div>`);
  }
  function worldView(w) {
    const b = best();
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ All chapters</button></p><h2 class="h3">Chapter ${w.chapter}: ${esc(w.title.replace(/^(Station|Chapter) \d+:\s*/, ""))}</h2>
      <div class="lg-cards">${w.missions.map((m, i) => {
        const open = missionOpen(w, i), r = b[m.id], e = enemyOf(m), prev = w.missions[i - 1];
        return `<div class="lg-card${e.boss ? " boss" : ""}${open ? "" : " locked"}"><div class="lg-wanted">${e.boss ? "BOSS" : "WANTED"}</div>
          ${portrait(e)}<div class="lg-nm">${esc(e.name)}</div><div class="lg-where">Station ${i + 1}${e.boss ? " · boss · 5 hearts" : ""}</div>
          <div class="lg-diff" aria-label="Difficulty ${e.boss ? 3 : i + 1} of 3">${"★".repeat(e.boss ? 3 : i + 1)}${"☆".repeat(3 - (e.boss ? 3 : i + 1))}</div>
          <div class="lg-weak"><b>Weakness:</b> ${esc(e.weak || m.title)}</div>${e.taunt ? `<div class="lg-taunt">“${esc(e.taunt)}”</div>` : ""}
          <div class="lg-res">${r ? `Defeated · ${stars(r.s)} · best ${r.c} coins` : `${askN(m)} questions${m.ask ? " (new ones each time)" : ""}`}</div>
          ${open && saveOf(m) ? `<button type="button" class="btn" data-cont="${i}">Continue · Question ${saveOf(m).i + 1} of ${askN(m)} · ${saveOf(m).hearts} ♥ · ${saveOf(m).coins} coins</button><button type="button" class="btn ghost small" data-fresh="${i}">Start over</button>`
            : open ? `<button type="button" class="btn${r ? " ghost" : ""}" data-play="${i}">${r ? "Fight again" : "Fight"}</button>` : `<span class="lg-lock">${chLocked(w) || stLocked(m) ? LOCKED : `🔒 ${worldOpen(w) ? `Defeat ${esc(enemyOf(prev).name)} first` : `Opens ${fmtDay(opensOn(w).iso)}`}`}</span>`}
          ${isLec && open && (chLocked(w) || stLocked(m)) ? `<span class="lg-lock">🔒 Locked for students</span>` : ""}
          ${r ? `<button type="button" class="btn ghost small" data-sharest="${i}">📤 Share my win</button>` : ""}</div>`;
      }).join("")}</div>`);
  }

  /* ---------- My Character: changes are a draft until Save; the newest saved character wins on every device ---------- */
  let roomUnsaved = null, roomLeave = null;   // set while My Character is open
  const plain = (h) => { const o = Object.assign({}, h); delete o.at; return JSON.stringify(o); };
  function room() {
    const row = (key, label, list) => `<div class="ms-opt" data-row="${key}"><p class="ms-ol">${label}</p><div class="ms-row">${list.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}">${l}</button>`).join("")}</div></div>`;
    const sw = (key, label, list) => `<div class="ms-opt" data-row="${key}"><p class="ms-ol">${label}</p><div class="ms-row">${list.map((c) => `<button type="button" class="ms-sw" data-k="${key}" data-v="${c}" aria-label="${label} ${c}" style="background:${c}"></button>`).join("")}</div></div>`;
    const t = tier(), rk = ART.rankOf(totalCoins());
    let draft = Object.assign({}, hero), layer = null;
    const dirty = () => plain(draft) !== plain(hero);
    frame(`<h2 class="h3">My Character</h2><p class="small-note">Try any look, then press <strong>Save my character</strong>. Your saved character appears on every device you sign in to, and on the leaderboard.</p>
      <div class="ms-leave" id="msLeave" role="alertdialog" aria-label="Unsaved changes" hidden></div>
      <div class="ms-mk"><div class="ms-pv"><div class="ms-pvs">${ART.bg(rk)}<svg id="msPv" viewBox="-50 -82 168 168" aria-label="Your character"></svg></div>
          <button type="button" class="btn" data-hsave>Save my character</button><button type="button" class="btn ghost small" data-try>Try the attack</button><button type="button" class="btn ghost small" data-shareme>📤 Share my character</button>
          <p class="small-note" id="msHs" aria-live="polite"></p>
          <p class="small-note">Weapon: <strong>${["Basic", "Charged (glowing)", "Calibrated (gold)"][t]}</strong>. ${t < 2 ? (t < 1 ? "Reach journey level 3 to charge it; defeat a boss to make it gold." : "Defeat a boss to make it gold.") : "Earned by defeating a boss."}</p></div>
        <div><div class="ms-opt"><label class="ms-ol" for="msHn">Hero name</label>
          ${nameRemoved ? `<p class="ms-msg no">Your lecturer removed your hero name. Please choose a decent one.</p>` : ""}
          <input type="text" id="msHn" class="ms-hn" maxlength="10" autocomplete="off" spellcheck="false" value="${esc(draft.name || "")}" placeholder="${esc(nickOf() || "Your hero name")}" aria-describedby="msHnN">
          <p class="ms-msg err" id="msHnE" aria-live="polite"></p>
          <p class="small-note" id="msHnN">Up to 10 letters, numbers and spaces, shown on the leaderboard and your share cards (left empty, your nickname shows). Keep it decent: no rude, offensive or illegal names. Your lecturer can see and remove any hero name.</p></div>
          ${row("look", "Look", OPT.look)}${row("hairM", "Hair", OPT.hairM)}${row("hairF", "Hair", OPT.hairF)}${sw("hair", "Hair colour", HAIRS)}${row("face", "Facial hair", OPT.face)}${row("tudS", "Tudung style", OPT.tudS)}${sw("tud", "Tudung colour", TUDUNG)}${row("brooch", "Brooch", OPT.brooch)}${row("head", "Headwear", OPT.head)}${row("eyes", "Eyewear", OPT.eyes)}${sw("skin", "Skin tone", SKINS)}${sw("color", "Jacket colour", COLORS)}${row("badge", "Accessory", OPT.badge)}${row("weapon", "Weapon", OPT.weapon)}<p class="small-note" id="msWn"></p></div></div>`);
    const vis = { hairM: () => draft.look === "m", face: () => draft.look === "m", hairF: () => draft.look === "f", hair: () => draft.look !== "t", tud: () => draft.look === "t", tudS: () => draft.look === "t", brooch: () => draft.look === "t" };
    const dropLayer = () => { if (layer) { const l = layer; layer = null; l.closed(); } };
    const guard = () => { if (dirty() && !layer && window.NMKBack) layer = NMKBack.layer(() => { layer = null; ask(() => go("map")); }); if (!dirty()) dropLayer(); };
    const paint = () => {
      $("#msPv").innerHTML = ART.heroSvg(draft, "msPvh", t);
      $$("[data-k]").forEach((b) => b.setAttribute("aria-pressed", draft[b.dataset.k] === b.dataset.v || (b.dataset.k === "head" && b.dataset.v === "none" && draft.head === "kopiah" && draft.look !== "m")));
      $$('[data-k="head"][data-v="kopiah"]').forEach((b) => { b.hidden = draft.look !== "m"; });
      $$("[data-row]").forEach((r) => { r.hidden = vis[r.dataset.row] ? !vis[r.dataset.row]() : false; });
      $("#msWn").textContent = NOTE[draft.weapon];
      const d = dirty(), sb = $("[data-hsave]"), bad = nameProblem(draft.name);
      $("#msHnE").textContent = bad;
      sb.disabled = !!bad; sb.classList.toggle("dirty", d); sb.textContent = bad ? "Fix the hero name to save" : d ? "Save my character (unsaved changes)" : "Saved ✓";
    };
    const save = () => {
      hero = Object.assign({}, draft, { at: new Date().toISOString() }); draft = Object.assign({}, hero);
      lsSet("nmk-hero", JSON.stringify(hero)); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-hero" })); if (A && A.push) A.push();
      if (hero.name) nameRemoved = false;
      dropLayer(); $("#msHs").textContent = "Saved. It now shows on all your devices."; SFX.coin(); paint();
    };
    const discard = () => { draft = Object.assign({}, hero); dropLayer(); paint(); };
    // leaving with unsaved changes: Save, Leave without saving, or Stay
    function ask(next) {
      const box = $("#msLeave");
      box.innerHTML = `<p><strong>You have unsaved changes to your character.</strong> Save them, or they will be lost.</p><div class="ms-row"><button type="button" class="btn" data-lsave>Save and continue</button><button type="button" class="btn ghost" data-ldrop>Leave without saving</button><button type="button" class="btn ghost" data-lstay>Stay here</button></div>`;
      box.hidden = false; box.scrollIntoView({ block: "nearest" }); $("[data-lsave]", box).focus({ preventScroll: true });
      $("[data-lsave]", box).addEventListener("click", () => { if (nameProblem(draft.name)) { box.hidden = true; $("#msHn").focus(); return; } save(); next(); });
      $("[data-ldrop]", box).addEventListener("click", () => { discard(); next(); });
      $("[data-lstay]", box).addEventListener("click", () => { box.hidden = true; guard(); });
    }
    $$("[data-k]").forEach((b) => b.addEventListener("click", () => { draft[b.dataset.k] = b.dataset.v; if (draft.look !== "m" && draft.head === "kopiah") draft.head = "none"; SFX.click(); $("#msHs").textContent = ""; paint(); guard(); }));
    $("[data-hsave]").addEventListener("click", () => { if (dirty() && !nameProblem(draft.name)) save(); });
    const hn = $("#msHn");
    hn.addEventListener("input", () => { const c = hn.value.replace(/[^A-Za-z0-9 ]/g, "").replace(/ {2,}/g, " ").replace(/^ /, "").slice(0, 10); if (c !== hn.value) hn.value = c; draft.name = c.trim(); $("#msHs").textContent = ""; paint(); guard(); });
    $("[data-try]").addEventListener("click", () => { const g = $("#msPvh"); g.classList.remove("cheer"); void g.getBoundingClientRect(); g.classList.add("cheer"); SFX[draft.weapon](); });
    const bu = (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", bu);
    roomUnsaved = dirty; roomLeave = ask;
    teardown.push(() => { removeEventListener("beforeunload", bu); if (layer) { layer.drop(); layer = null; } roomUnsaved = null; roomLeave = null; });
    paint();
  }

  /* ---------- the INSTRUMENTA leaderboard (game coins only; from the board summaries account.js writes) ---------- */
  const ago = (iso) => { if (!iso) return "–"; const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const SECN = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
  const heroIn = (g) => { let o = null; try { o = g && g.hero ? JSON.parse(g.hero) : null; } catch (e) { o = null; } return Object.assign({}, HERO0, o || {}); };
  const avatar = (h) => `<svg class="lg-av" viewBox="-36 -66 72 76" aria-hidden="true" focusable="false">${ART.heroSvg(h, "", 0)}</svg>`;
  // the leaderboard (fresh look, 9 Nov 2026): the game-menu panel, a podium of the top 3 with their characters, then
  // rows framed in the colour of each player's rank. One list for the whole class; students see no matric numbers.
  const RCOL = ["#9fb3c8", "#38e1c9", "#3fa9ff", "#8b5cf6", "#ff7a45", "#f0567a", "#5ee7ff", "#c4b5fd", "#ffd84d"];
  async function boardView(fresh) {
    frame(`<div class="gg lb"><div class="gg-top"><div class="gg-hero"><div><span class="gg-kick">Hall of Legends</span><h2 class="gg-h">🏆 Leaderboard</h2></div>
        ${isLec ? `<div class="lb-acts"><button type="button" class="lg-btn alt" data-lgupd>⟳ Update rankings now</button></div>` : ""}</div></div>
      <div class="gg-body"><p class="lb-note">The whole class, ranked by game coins. <span id="lgWhen"></span> Your own coins and rank are always up to date on your own screen. Tap a character or hero name to see the player card. Points never count towards grades.</p><div id="lgBoard"><p class="lb-note">Loading…</p></div></div></div>`);
    const ub = $("[data-lgupd]"); if (ub) ub.addEventListener("click", () => { ub.disabled = true; ub.textContent = "Updating…"; boardView(true); });
    const host = $("#lgBoard");
    let docs = [], roster = [];
    try {
      const r = fresh ? await A.buildRankings() : await A.boardRows();
      docs = (r && r.rows) || [];
      const w = $("#lgWhen"); if (w) w.textContent = A.rankNote(r && r.at);
      if (isLec) roster = (await A.db.collection("roster").get()).docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((r) => r.status === "active");
    } catch (e) { host.innerHTML = `<p class="lb-note">Could not load the leaderboard (${esc(e.code || e)}).</p>`; return; }
    if (view !== "board") return;
    const total = WORLDS.reduce((a, w) => a + w.missions.length, 0), bossesT = WORLDS.reduce((a, w) => a + w.missions.filter((m) => m.boss).length, 0);
    const players = docs.filter((d) => d.role !== "lecturer" && d.game && (d.game.coins || d.game.cleared || d.game.started))
      .sort((a, b) => (b.game.coins - a.game.coins) || (b.game.cleared - a.game.cleared) || String(b.game.last || "").localeCompare(String(a.game.last || "")));
    const me = myUid();
    const medal = (k) => (k === 0 ? "🥇" : k === 1 ? "🥈" : k === 2 ? "🥉" : `#${k + 1}`);
    const hname = (d) => { const n = String(heroIn(d.game).name || "").trim(); return n && !isBanned(d.uid, n) ? n : ""; };
    const label = (d) => hname(d) || d.nickname || d.name || "Player";
    const rkOf = (d) => ART.rankOf(d.game.coins || 0);
    const batI = (g) => { const b = bat(g.last || ""); return b ? `<span class="lg-bi b-${b.st}" title="${BATL[b.st]}: last battle ${Math.floor(b.d)} day${Math.floor(b.d) === 1 ? "" : "s"} ago">${GM.BATTERY[b.st][0]}</span>` : ""; };
    const lead = (players[0] && players[0].game.coins) || 1;
    // the podium: the top 3 with their own characters, the leader under a gold spotlight
    const podium = () => players.length ? `<div class="lb-pod">${[1, 0, 2].map((k) => { const d = players[k]; if (!d) return "<div></div>"; const rk = rkOf(d);
        return `<div class="lb-p p${k + 1}${d.uid === me ? " me" : ""}" style="--rc:${RCOL[rk]}">${k === 0 ? `<i class="lb-light" aria-hidden="true"></i>` : ""}<span class="lb-medal" aria-hidden="true">${medal(k)}</span>
          <button type="button" class="lb-ph" data-pcard="${esc(d.uid)}" tabindex="-1" aria-hidden="true"><svg class="lb-hero" viewBox="-46 -76 92 142" focusable="false">${ART.heroSvg(heroIn(d.game), "", k === 0 ? 2 : 0)}</svg></button>
          <button type="button" class="lb-pn" data-pcard="${esc(d.uid)}" aria-label="${esc(label(d))}: open the player card">${esc(label(d))}</button><span class="lb-pr">${batI(d.game)}<span>${esc(ART.RANKS[rk].n)}</span></span><span class="lb-pc">🪙 ${(d.game.coins || 0).toLocaleString("en")}</span><span class="lb-pl" title="Last battle">⚔️ ${ago(d.game.last)}</span><span class="lb-step">${k + 1}</span></div>`; }).join("")}</div>` : "";
    // the podium's heading with one small share button (the top 3 as a 9:16 picture)
    const podHead = () => players.length ? `<div class="lb-podh"><span>Top ${Math.min(3, players.length)}</span><button type="button" class="lb-shr" data-podshare aria-label="Share the top ${Math.min(3, players.length)} as a picture" title="Share the top 3">📤</button></div>` : "";
    const lrow = (d, k) => { const g = d.game, rk = rkOf(d), hn = hname(d);
      return `<li class="lb-row${d.uid === me ? " me" : ""}" style="--rc:${RCOL[rk]}"><span class="lb-pos">${k + 1}</span><button type="button" class="lb-av" data-pcard="${esc(d.uid)}" tabindex="-1" aria-hidden="true">${avatar(heroIn(g))}</button>
        <span class="lb-who"><button type="button" class="lb-hn" data-pcard="${esc(d.uid)}" aria-label="${esc(hn || d.nickname || "Player")}: open the player card">${esc(hn || d.nickname || "Player")}</button><a href="profile.html?u=${encodeURIComponent(d.uid)}">${esc(d.name || d.nickname || "Student")}</a><span class="lb-rk">${batI(g)}<span>${esc(ART.RANKS[rk].n)}</span></span></span>
        <span class="lb-coin"><b>${(g.coins || 0).toLocaleString("en")}</b><i class="lb-bar"><b style="width:${Math.max(3, Math.round(((g.coins || 0) / lead) * 100))}%"></b></i></span>
        <span class="lb-st"><span title="Stations cleared">⚔️ ${g.cleared || 0}/${total}</span><span title="Bosses defeated">👑 ${g.bosses || 0}</span><span title="Stars">★ ${g.stars || 0}</span></span>
        <span class="lb-last" title="Last battle">⚔️ ${ago(g.last)}</span></li>`; };
    const cols = 8 + WORLDS.length + (isLec ? 1 : 0);
    // 🃏 the player card (9 Nov 2026): everything the table has, for the podium and every row; Open profile › for the rest
    function openCard(uid, back) {
      const k = players.findIndex((x) => x.uid === uid); if (k < 0) return;
      const d = players[k], g = d.game, rk = rkOf(d), R = ART.RANKS[rk], nx = ART.RANKS[rk + 1], hn = hname(d), b = bat(g.last || "");
      const pct = nx ? Math.round(((g.coins - R.min) / (nx.min - R.min)) * 100) : 100;
      const box = document.createElement("div");
      box.className = "lb-card"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", `Player card: ${label(d)}`);
      box.innerHTML = `<div class="lb-cbox" style="--rc:${RCOL[rk]}"><button type="button" class="ms-x lb-cx" aria-label="Close">✕</button>
        <div class="lb-chead"><span class="lb-cpos">${medal(k)}</span><svg class="lb-chero" viewBox="-46 -76 92 142" aria-hidden="true" focusable="false">${ART.heroSvg(heroIn(g), "", 0)}</svg>
          <div class="lb-cwho"><b>${esc(hn || d.nickname || "Player")}</b><span>${esc(d.name || d.nickname || "Student")}</span>${hn && d.nickname ? `<small>Nickname: ${esc(d.nickname)}</small>` : ""}
            <span class="lb-pr">${batI(g)}<span>${esc(R.n)}</span></span></div></div>
        <div class="lb-ctiles"><div><span>🪙 Coins</span><strong>${(g.coins || 0).toLocaleString("en")}</strong></div><div><span>⚔️ Stations</span><strong>${g.cleared || 0}<small> / ${total}</small></strong></div>
          <div><span>👑 Bosses</span><strong>${g.bosses || 0}<small> / ${bossesT}</small></strong></div><div><span>★ Stars</span><strong>${g.stars || 0}</strong></div></div>
        <div class="lb-cnext"><span>${nx ? `${nx.min - g.coins} more coin${nx.min - g.coins === 1 ? "" : "s"} to ${esc(nx.n)}` : "Top rank: Legend of Measurement"}</span><i class="lb-bar"><b style="width:${Math.max(3, pct)}%"></b></i></div>
        <h3 class="lb-csub">Chapters</h3><ul class="lb-cch">${WORLDS.map((w) => { const c = (g.ch || {})[w.world] || 0; return `<li><span>Ch ${w.chapter}</span><i class="lb-bar"><b style="width:${Math.round((c / w.missions.length) * 100)}%"></b></i><em>${c} / ${w.missions.length}</em></li>`; }).join("")}</ul>
        <p class="lb-clast">⚔️ Last battle: <strong>${ago(g.last)}</strong>${b ? ` · ${GM.BATTERY[b.st][0]} ${BATL[b.st]}` : ""}</p>
        ${isLec ? `<p class="lb-clec">Matric ${esc(d.matric || "–")} · ${esc(SECN[d.section] || "no section")}${hn ? ` · <button type="button" class="lg-rm" data-crm>Remove hero name</button>` : ""}</p>` : ""}
        <div class="lb-cbtns"><a class="lg-btn main" href="profile.html?u=${encodeURIComponent(d.uid)}">Open profile ›</a></div></div>`;
      document.body.appendChild(box);
      let layer = null;
      const close = () => { box.remove(); document.removeEventListener("keydown", key); if (layer) { const l = layer; layer = null; l.closed(); } if (back && back.isConnected) back.focus({ preventScroll: true }); };
      const key = (e) => { if (e.key === "Escape") close(); };
      document.addEventListener("keydown", key);
      if (window.NMKBack) layer = NMKBack.layer(() => { layer = null; close(); });
      teardown.push(() => { if (box.isConnected) { if (layer) { layer.drop(); layer = null; } close(); } });
      box.addEventListener("click", (e) => { if (e.target === box) close(); });
      $(".lb-cx", box).addEventListener("click", close);
      const rm = $("[data-crm]", box);
      if (rm) rm.addEventListener("click", async () => { rm.disabled = true; rm.textContent = "Removing…";
        try { await A.db.collection("meta").doc("heronames").set({ bans: { [d.uid]: hn } }, { merge: true }); BANS[d.uid] = hn; close(); boardView(); }
        catch (e) { rm.disabled = false; rm.textContent = `Could not remove (${e.code || e})`; } });
      $(".lb-cx", box).focus({ preventScroll: true });
    }
    // 📤 the top 3 as one picture (anyone can share it; hero names or nicknames only, never real names)
    function sharePodium() {
      const top = players.slice(0, 3).map((d) => ({ hero: heroIn(d.game), name: label(d), rank: rkOf(d), rankName: ART.RANKS[rkOf(d)].n, coins: d.game.coins || 0 }));
      share({ kind: "podium", top, rank: top[0].rank, name: "Top 3", date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) },
        `The top ${top.length} of INSTRUMENTA: Legends: ${top.map((t, i) => `${i + 1}. ${t.name}`).join(", ")}. ${BY} #INSTRUMENTALegends #UniMAP ${SHARE_URL}`, "top3");
    }
    host.addEventListener("click", (e) => {
      const c = e.target.closest("[data-pcard]"); if (c) { SFX.click(); openCard(c.dataset.pcard, c); return; }
      if (e.target.closest("[data-podshare]")) { SFX.click(); sharePodium(); }
    });
    const row = (d, k) => { const g = d.game, R = ART.RANKS[rkOf(d)], hn = hname(d);
      return `<tr class="${d.uid === me ? "me" : ""}"><td class="lg-pos">${medal(k)}</td><td><span class="lg-who">${avatar(heroIn(g))}<span><b class="lg-hn">${esc(hn || d.nickname || "Player")}</b>
        <a href="profile.html?u=${encodeURIComponent(d.uid)}">${esc(d.name || d.nickname || "Student")}</a>${hn && d.nickname ? `<small>${esc(d.nickname)}</small>` : ""}
        ${isLec && hn ? `<button type="button" class="lg-rm" data-rmname="${esc(d.uid)}" data-name="${esc(hn)}">Remove hero name</button>` : ""}</span></span></td>
        ${isLec ? `<td>${esc(d.matric || "–")}</td>` : ""}<td>${batI(g)} ${esc(R.n)}</td><td class="lg-num"><strong>${g.coins || 0}</strong></td><td class="lg-num">${g.cleared || 0} / ${total}</td><td class="lg-num">${g.bosses || 0} / ${bossesT}</td><td class="lg-num">${g.stars || 0} ★</td>
        ${WORLDS.map((w) => `<td class="lg-num">${((g.ch || {})[w.world] || 0)} / ${w.missions.length}</td>`).join("")}<td>${ago(g.last)}</td></tr>`; };
    const head = `<tr><th scope="col">#</th><th scope="col">Player</th>${isLec ? `<th scope="col">Matric</th>` : ""}<th scope="col">Rank</th><th scope="col">Coins</th><th scope="col">Stations</th><th scope="col">Bosses</th><th scope="col">Stars</th>${WORLDS.map((w) => `<th scope="col">Ch ${w.chapter}</th>`).join("")}<th scope="col">Last battle</th></tr>`;
    const table = (rows) => `<div class="adm-scroll"><table class="adm lg-tab"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    if (!isLec) {
      // the top 10 (the first 3 on the podium), the player's own place, and the last 4 (everyone when 14 or fewer)
      const at = players.findIndex((d) => d.uid === me), n = players.length;
      const show = (n <= 14 ? players.map((d, k) => [d, k]) : players.slice(0, 10).map((d, k) => [d, k]).concat(at >= 10 && at < n - 4 ? [[null, -1], [players[at], at]] : [], [[null, -1]], players.slice(n - 4).map((d, k) => [d, n - 4 + k]))).filter(([, k]) => k < 0 || k >= 3);
      const above = at > 0 ? players[at - 1].game.coins - players[at].game.coins : 0;
      host.innerHTML = `<div class="lb-mine">${at >= 0 ? `<span class="lb-you">You</span><span><strong>${medal(at)} of ${n}</strong> · 🪙 ${players[at].game.coins} coins${at > 0 ? ` · ${above + 1} more to pass ${esc(label(players[at - 1]))}` : " · you're leading!"}</span><button type="button" class="lb-shr wide" data-lbshare aria-label="Share my rank as a picture">📤 Share</button>` : "Play a station to join the leaderboard."}</div>
        ${n ? `${podHead()}${podium()}${show.length ? `<ol class="lb-list">${show.map(([d, k]) => (d ? lrow(d, k) : `<li class="lb-gap" aria-hidden="true">⋯</li>`)).join("")}</ol>` : ""}` : `<p class="lb-note">Nobody has played yet. Be the first!</p>`}`;
      const sb = $("[data-lbshare]", host);
      if (sb) sb.addEventListener("click", () => { SFX.click(); shareRank(players[at], at, n, total); });
      return;
    }
    const played = new Set(players.map((d) => String(d.matric)));
    const notYet = roster.filter((r) => !played.has(String(r.matric))).sort((a, b) => (a.name < b.name ? -1 : 1));
    host.innerHTML = `${podHead()}${podium()}<div class="adm-tools"><button type="button" class="lg-btn alt" data-bcsv>⬇ Download CSV</button></div>
      <p class="lb-note">${players.length} playing · ${notYet.length} not started yet. Lecturer plays never appear here. A rude hero name? Tap <strong>Remove hero name</strong>: the player's nickname shows instead, and they are asked to choose another one.</p>
      ${players.length ? table(players.map((d, k) => row(d, k)).join("")) : `<p class="adm-empty">Nobody has played yet.</p>`}
      ${(() => { const flat = players.filter((d) => { const b = bat(d.game.last || ""); return b && b.st === "flat"; });
        return `<h3 class="h3 lg-nyh">🪫 Flat Battery for 14+ Days (${flat.length})</h3>${flat.length ? `<ul class="lg-ny">${flat.map((d) => `<li><a href="profile.html?u=${encodeURIComponent(d.uid)}">${esc(d.name || d.nickname)}</a> <small>${esc(d.matric || "")} · last battle ${ago(d.game.last)}</small></li>`).join("")}</ul>` : `<p class="small-note">Nobody: everyone who started has played in the last two weeks.</p>`}`; })()}
      <h3 class="h3 lg-nyh">Not Started Yet (${notYet.length})</h3>${notYet.length ? `<ul class="lg-ny">${notYet.map((r) => `<li><a href="profile.html?e=${encodeURIComponent(r.id)}">${esc(r.name)}</a> <small>${esc(r.matric)} · ${esc(SECN[r.section] || "–")}</small></li>`).join("")}</ul>` : `<p class="small-note">Everyone has started. 🎉</p>`}`;
    $$("[data-rmname]", host).forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Removing…";
      try { await A.db.collection("meta").doc("heronames").set({ bans: { [b.dataset.rmname]: b.dataset.name } }, { merge: true }); BANS[b.dataset.rmname] = b.dataset.name; boardView(); }
      catch (e) { b.disabled = false; b.textContent = `Could not remove (${e.code || e})`; }
    }));
    $("[data-bcsv]", host).addEventListener("click", () => {
      const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
      const lines = [["Position", "Name", "Hero name", "Nickname", "Matric", "Section", "Rank", "Battery", "Coins", "Stations cleared", "Bosses", "Stars", ...WORLDS.map((w) => `Chapter ${w.chapter}`), "Last battle"].map(q).join(",")]
        .concat(players.map((d, k) => [k + 1, d.name || d.nickname, hname(d), d.nickname || "", d.matric, SECN[d.section] || "", ART.RANKS[ART.rankOf(d.game.coins || 0)].n, (bat(d.game.last || "") || {}).st || "", d.game.coins || 0, d.game.cleared || 0, d.game.bosses || 0, d.game.stars || 0, ...WORLDS.map((w) => (d.game.ch || {})[w.world] || 0), d.game.last ? d.game.last.slice(0, 10) : ""].map(q).join(",")))
        .concat(notYet.map((r) => ["", r.name, "", "", r.matric, SECN[r.section] || "", "Not started", "", 0, 0, 0, 0, ...WORLDS.map(() => 0), ""].map(q).join(",")));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `INSTRUMENTA leaderboard ${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  /* ---------- Credits (the About button): the logo, the Creator's character, the creator card, Zamm Studio™ ---------- */
  /* ---------- 📖 the Game Guide (lecturer's choice): How to Play, Ranks, Battery and Credits (the old About page, unchanged).
     It opens by itself once for each student (nmk-mguide, synced), the first time they open the game after this update.
     Game-menu look (9 Nov 2026): START PLAYING at the top and the bottom, icon tabs, mission cards. ---------- */
  let guideTab = "play";
  const GTABS = [["play", "🎮", "How to Play"], ["ranks", "🏅", "Ranks"], ["battery", "🔋", "Battery"], ["credits", "⭐", "Credits"]];
  const gtabs = () => `<div class="gg-top"><div class="gg-hero"><div><span class="gg-kick">Game Guide</span><h2 class="gg-h">${guideTab === "credits" ? "About the Game" : guideTab === "ranks" ? "Climb the Ranks" : guideTab === "battery" ? "Stay Charged" : "How to Play"}</h2></div>
</div>
    <nav class="gg-tabs" aria-label="Game guide">${GTABS.map(([k, i, l]) => `<button type="button" class="gg-tab" data-gtab="${k}" aria-pressed="${guideTab === k}"><span aria-hidden="true">${i}</span>${l}</button>`).join("")}</nav></div>`;
  function markGuide() { if (!lsGet("nmk-mguide")) { lsSet("nmk-mguide", "1"); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-mguide" })); } }
  const card = (icon, title, text, n) => `<li class="gg-card">${n ? `<span class="gg-n">${n}</span>` : ""}<span class="gg-ic" aria-hidden="true">${icon}</span><div><strong>${title}</strong><p>${text}</p></div></li>`;
  function guideView() {
    view = "guide"; markGuide();
    const coins = totalCoins(), rk = ART.rankOf(coins), R = ART.RANKS[rk], nx = ART.RANKS[rk + 1], b = bat();
    let body = "";
    if (guideTab === "play") body = `<p class="gg-tag">Play, learn and master each chapter.</p>
      <h3 class="gg-sub">The Rules</h3><ol class="gg-cards gg-rules">
        ${card("⚔️", "Three stations", "Three stations per chapter. Beat the first two to face the boss.", "01")}
        ${card("✍️", "Paper first", "Work it out on paper, then key in your answer.", "02")}
        ${card("🪙", "Strike or be blocked", "Right: you strike and earn coins. Wrong: the enemy blocks, strikes back, and you lose 2 coins.", "03")}
        ${card("❤️", "Mind your hearts", "Lose all your hearts and the station starts again.", "04")}
        ${card("📅", "New chapters", "A new chapter opens in the week it is lectured.", "05")}</ol>
      <h3 class="gg-sub">Battle Basics</h3><ul class="gg-cards basics">
        ${card("❤️", "Hearts", "4 at every station, 5 against a boss.")}
        ${card("🪙", "Coins", "+10 right on the first try, +6 after one hint, +3 after that.")}
        ${card("🔥", "Combo", "First-try answers in a row build a combo: bigger and bigger strikes.")}
        ${card("⭐", "Stars and bonuses", "Every answer right first time: 3 stars and +10 coins. Beat a boss: +50 coins.")}
        ${card("🔢", "Almost!", "Right, but rounded too short? It costs nothing: fix the decimal places.")}
        ${card("🤖", "Volt", "After a wrong answer, tap Volt, your drone, for a hint.")}
        ${card("💾", "Save and exit", "Keeps your place: the same numbers come back, on any device.")}
        ${card("🔁", "Fight again", "New numbers every time. Your best score at each station counts.")}</ul>`;
    else if (guideTab === "ranks") body = `<div class="gg-stat"><div><span>Your coins</span><strong>${coins.toLocaleString("en")}</strong></div><div><span>Your rank</span><strong>${rk + 1} of ${ART.RANKS.length}</strong></div>
        <div class="gg-statw"><span>${nx ? `${(nx.min - coins).toLocaleString("en")} more coins to ${esc(nx.n)}` : "Top rank reached. Legendary!"}</span><i class="gg-bar"><b style="width:${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}%"></b></i></div></div>
      <p class="gg-p">Your rank grows with your <strong>coins</strong>. Only the <strong>best score of each station</strong> counts, so playing a station again raises it until you get it perfect. A chapter is worth up to <strong>260 coins</strong>.</p>
      <ol class="gg-path">${ART.RANKS.map((x, k) => `<li class="${k === rk ? "me" : k < rk ? "got" : "next"}"><span class="gg-node" aria-hidden="true">${k < rk ? "✓" : k + 1}</span>
        <span class="gg-th">${ART.bg(k).replace('class="lg-bg"', 'class="lg-bg lg-thumb"')}</span>
        <span class="gg-rt"><strong>${esc(x.n)}</strong><small>${x.min.toLocaleString("en")} coins · ${esc(x.scene)}</small></span>
        <span class="gg-chip">${k === rk ? "You are here" : k > rk ? `🔒 ${(x.min - coins).toLocaleString("en")} more` : "Reached"}</span></li>`).join("")}</ol>`;
    else if (guideTab === "credits") body = `<div class="gg-crtop">${ART.logo()}<p class="gg-tag">An original game made for NMK42003 Instrumentation.</p></div>
      <h3 class="gg-sub">Made By</h3>
      <div class="gg-cr"><div class="gg-crstand"><svg class="gg-crhero" viewBox="-50 -82 168 168" role="img" aria-label="The Creator as a game character">${ART.heroSvg(ART.CREATOR, "", 2)}</svg><span class="gg-crbase" aria-hidden="true"></span></div>
        <div class="gg-crinfo"><span class="gg-crtag">THE CREATOR</span><div class="gg-crcard"><img src="assets/img/team/zamri.jpg" alt="" width="64" height="64"><div><b>Ts. Dr. Mohd Zamri Bin Zahir Ahmad</b><small>Course coordinator, NMK42003 Instrumentation<br>Faculty of Electronic Engineering &amp; Technology, UniMAP</small></div></div>
        <div class="gg-crzamm">${ART.zamm(true)}</div></div></div>
      <h3 class="gg-sub">About the Game</h3>
      <p class="gg-p">INSTRUMENTA: Legends is an original game made for NMK42003 Instrumentation. Battle named enemies at every station, chapter by chapter, with Volt your helper drone, and grow from Apprentice to Legend of Measurement as you master each chapter.</p>
      <ul class="gg-cards basics">${card("🌍", "One world per chapter", "Each chapter opens a new world, in the week it is lectured.")}${card("⚔️", "3 stations each", "Two stations, then the boss.")}${card("👾", "Named enemies and bosses", "Every station has its own enemy to calibrate.")}${card("🎵", "Original art and music", "Drawn and composed for this course.")}</ul>
      <div class="gg-crbtns"><button type="button" class="lg-btn main" data-sharegame>📤 Share the game</button></div>
      <p class="gg-crcopy">© 2026 Zamm Studio™ · Ts. Dr. Mohd Zamri Bin Zahir Ahmad. All rights reserved. #INSTRUMENTALegends</p>`;
    else body = `<p class="gg-p">Your battery shows whether you keep playing. <strong>Your rank, coins and XP never drop</strong>: only the label beside your rank and your character's glow change.</p>
      <div class="gg-bats">${[["charged", 1, "Within 7 days", `⚡ Charged ${esc(R.n)}`, "Golden title and a glowing character"], ["low", 0.45, "8 to 13 days ago", `🔋 Low-Battery ${esc(R.n)}`, "Normal title, no glow"], ["flat", 0, "14 days or more", `🪫 Flat-Battery ${esc(R.n)}`, "Grey title, your character falls asleep"]]
        .map(([st, f, when, how, look]) => `<div class="gg-bat b-${st}${b && b.st === st ? " me" : ""}">${b && b.st === st ? `<span class="gg-you">You</span>` : ""}${batSvg(f, st, "big")}<strong>${{ charged: "Charged", low: "Low battery", flat: "Flat battery" }[st]}</strong><small>Last battle: ${when}</small><em>${how}</em><span>${look}</span></div>`).join("")}</div>
      ${b ? `<p class="gg-now">${b.paused ? "⏸ Batteries are paused by your lecturer right now." : `Your battery: <strong>${BATL[b.st]}</strong>. ${batNote(b)}.`}</p>` : `<p class="gg-now">Play your first battle to charge your battery.</p>`}
      <ul class="gg-cards basics">${card("⚡", "Recharge", "One battle fills it right up, whether you win or get knocked out.")}${card("🔔", "Reminders", "You'll get a reminder on day 8 and on day 12.")}${card("⏸", "Paused weeks", "In exam weeks and breaks your lecturer can pause every battery.")}</ul>`;
    frame(`<div class="gg">${gtabs()}<div class="gg-body">${body}</div></div>`);
  }
  /* ---------- share cards (9:16 PNG): the Web Share API with the file (WhatsApp status and more), or Save image ---------- */
  const SHARE_URL = "https://zamrizahir88.github.io/nmk42003/missions.html";
  const BY = "the game by Ts. Dr. Zamri Zahir (Zamm Studio)!";
  function cardPng(d) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { try { const c = document.createElement("canvas"); c.width = 1080; c.height = 1920; c.getContext("2d").drawImage(img, 0, 0, 1080, 1920); c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"); } catch (e) { rej(e); } };
      img.onerror = () => rej(new Error("no image"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ART.card(d));
    });
  }
  const playCard = () => { const rk = ART.rankOf(totalCoins()); return { kind: "play", hero, tier: tier(), name: heroLabel(), rank: rk, rankName: ART.RANKS[rk].n, coins: totalCoins() }; };
  // a defeated station's card (from its best result), shared from the chapter page at any time
  function shareStation(w, i) {
    const m = w.missions[i], r = best()[m.id], E = enemyOf(m), rk = ART.rankOf(totalCoins());
    if (!r) return;
    share({ kind: "win", hero, tier: tier(), name: heroLabel(), rank: rk, rankName: ART.RANKS[rk].n, coins: r.c, where: `CHAPTER ${w.chapter} · STATION ${i + 1}${E.boss ? " · BOSS" : ""}`,
      title: `I defeated ${E.name}!`, enemySvg: E.svg, enemyScale: E.scale || 1, stars: "★".repeat(r.s || 0) + "☆".repeat(3 - (r.s || 0)), extra: r.boss ? "Boss defeated" : "Defeated ✓" },
      `I defeated ${E.name} in INSTRUMENTA: Legends, ${BY} Can you beat my score? #INSTRUMENTALegends #UniMAP ${SHARE_URL}`, "win");
  }
  // 📤 Share my rank (leaderboard): the place is named in the top 10 or the top half, otherwise the rank and coins only
  function shareRank(d, at, n, total) {
    const g = d.game, rk = ART.rankOf(g.coins || 0), pos = at + 1, top10 = pos <= 10;
    share({ kind: "rank", hero, tier: tier(), name: heroLabel(), rank: rk, rankName: ART.RANKS[rk].n, coins: g.coins || 0, pos, of: n, top10, half: pos <= Math.ceil(n / 2),
      cleared: g.cleared || 0, total, bosses: g.bosses || 0, stars: g.stars || 0 },
      `${top10 ? `I'm #${pos} on the INSTRUMENTA: Legends leaderboard` : `I'm a ${ART.RANKS[rk].n} in INSTRUMENTA: Legends`}, ${BY} Can you beat my rank? #INSTRUMENTALegends #UniMAP ${SHARE_URL}`, "rank");
  }
  const sharePlay = () => share(playCard(), `Let's play INSTRUMENTA: Legends, ${BY} Join me in NMK42003! #INSTRUMENTALegends #UniMAP ${SHARE_URL}`, "play");
  function share(d, text, tag) {
    const sh = document.createElement("div");
    sh.className = "lg-share"; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", "Share your card");
    sh.innerHTML = `<div class="lg-shbox"><button type="button" class="ms-x lg-shx" aria-label="Close">✕</button><p class="lg-shh">Share your card</p>
      <div class="lg-shimg"><p class="small-note">Making your card…</p></div>
      <div class="lg-shbtns"><button type="button" class="lg-btn main" data-shgo disabled>📤 Share</button><button type="button" class="lg-btn alt" data-shsave disabled>⬇ Save image</button></div>
      <p class="lg-shmsg" aria-live="polite">On a phone, Share opens WhatsApp, Instagram, Telegram and more (for a WhatsApp status, choose My status). Save image keeps the picture in your downloads or gallery.</p></div>`;
    document.body.appendChild(sh);
    let layer = null, blob = null, url = "";
    const name = `INSTRUMENTA-Legends-${tag}-${String(d.name).replace(/[^A-Za-z0-9]+/g, "-")}.png`;
    const close = () => { sh.remove(); document.removeEventListener("keydown", key); if (url) URL.revokeObjectURL(url); if (layer) { const l = layer; layer = null; l.closed(); } };
    const key = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    if (window.NMKBack) layer = NMKBack.layer(() => { layer = null; close(); });
    teardown.push(() => { if (sh.isConnected) { if (layer) { layer.drop(); layer = null; } close(); } });
    sh.addEventListener("click", (e) => { if (e.target === sh) close(); });
    $(".lg-shx", sh).addEventListener("click", close);
    $(".lg-shx", sh).focus({ preventScroll: true });
    const msg = (t) => { $(".lg-shmsg", sh).textContent = t; };
    cardPng(d).then((b) => {
      blob = b; url = URL.createObjectURL(b);
      $(".lg-shimg", sh).innerHTML = `<img src="${url}" alt="Your INSTRUMENTA: Legends card" width="270" height="480">`;
      $$("[data-shgo], [data-shsave]", sh).forEach((x) => { x.disabled = false; });
    }).catch(() => { $(".lg-shimg", sh).innerHTML = ""; msg("This browser could not make the picture. You can still share the link."); $("[data-shgo]", sh).disabled = false; });
    $("[data-shsave]", sh).addEventListener("click", () => { if (!blob) return; const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); msg("Saved. Look in your downloads or gallery."); });
    $("[data-shgo]", sh).addEventListener("click", async () => {
      const file = blob ? new File([blob], name, { type: "image/png" }) : null;
      try {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "INSTRUMENTA: Legends", text });
        else if (navigator.share) await navigator.share({ title: "INSTRUMENTA: Legends", text });
        else { await navigator.clipboard.writeText(text); msg("The message and the link are copied. Paste them with the saved image."); }
      } catch (e) { if (e && e.name !== "AbortError") msg("Sharing didn't work here. Use Save image, then post it from your gallery."); }
    });
  }

  /* ---------- a station: the battle ---------- */
  const heartSvg = (full, k) => `<svg class="lg-heart${full ? "" : " gone"}" viewBox="0 0 24 22" aria-hidden="true" data-h="${k}"><path d="M12 21 L3 12 A5.5 5.5 0 0 1 12 4.5 A5.5 5.5 0 0 1 21 12 Z" fill="${full ? "#e5484d" : "#d7dce3"}" stroke="#1b2a4a" stroke-width="2" stroke-linejoin="round"/>${full ? `<path d="M7 9 q1.5 -2.5 4 -2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>` : ""}</svg>`;
  function battle(w, mi, cont) {
    cleanup();
    const m0 = w.missions[mi], saved = cont ? saveOf(m0) : null, seed = saved ? saved.seed : Math.floor(Math.random() * 2147483646) + 1;
    const m = m0, v = m.make(seeded(seed)), steps = stepsOf(m, seed), E = enemyOf(m), boss = E.boss;
    const HEARTS = boss ? 5 : 4, rk0 = ART.rankOf(totalCoins()), sc = (E.scale || 1) * 0.86;
    let i = 0, tries = 0, coins = 0, firstTry = 0, hearts = HEARTS, done = false, busy = false, tipLayer = null;
    // the battery before this battle (for the charge animation), the combo, the boss's second phase, the last taunt
    const bat0 = bat(); let combo = 0, phase2 = false, taunted = false, tauntN = Math.floor(Math.random() * 5);
    const got = [], timers = [];
    if (saved) ({ i, tries, coins, firstTry, hearts } = saved), (saved.got || []).forEach((x, k) => { got[k] = x; });
    let unsent = 0;
    const store = (push) => {
      if (done) return;
      unsent++;
      const send = push ? true : unsent >= 3 ? "soon" : false;
      if (send) unsent = 0;
      putSave(m.id, { w: w.world, seed, n: steps.length, i, tries, coins, firstTry, hearts, got }, send);
    };
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); return t; };
    teardown.push(() => timers.forEach(clearTimeout));
    view = "battle";
    liveQ = { m, seed }; if (window.NMKAI && NMKAI.rest) NMKAI.rest(true);
    teardown.push(() => { liveQ = null; if (window.NMKAI && NMKAI.rest) NMKAI.rest(false); });
    if (window.NMKBack) NMKBack.view({ mview: "battle", mworld: w.world });
    frame(`<div class="ms-scene${boss ? " boss" : ""}" id="msScene">${ART.bg(rk0)}
      <svg class="ms-fg" viewBox="0 0 640 300" role="img" aria-label="Your character facing ${esc(E.name)}">
        <g transform="translate(150 162) scale(1.22)">${ART.heroSvg(hero, "msHero", tier())}</g>
        <g transform="translate(222 190)">
          <g class="ms-shot" data-w="blaster"><path d="M0 0 q5 -9 10 0 t10 0 t10 0 t10 0" stroke="#1db86a" stroke-width="4" fill="none" stroke-linecap="round"/></g>
          <g class="ms-shot" data-w="bow"><path d="M0 -12 q10 12 0 24 M10 -18 q14 18 0 36 M20 -24 q18 24 0 48" stroke="#2a7fd4" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
          <g class="ms-shot" data-w="staff"><circle r="11" fill="#ff7a1a"/><circle r="6" fill="#ffd34d"/></g></g>
        <path id="msSlash" d="M420 110 Q470 130 500 200 Q480 150 420 110 Z" fill="#fff" stroke="#9aa9b8" stroke-width="2"/>
        <g transform="translate(470 234) scale(${sc})"><g id="msMon">${E.svg}</g></g>
        <g id="msShield"><ellipse cx="470" cy="150" rx="${boss ? 112 : 96}" ry="${boss ? 120 : 104}" fill="#38e1c9" fill-opacity=".18" stroke="#38e1c9" stroke-width="4"/>
          <path d="M470 60 l26 15 v30 l-26 15 l-26 -15 v-30 z M470 120 l26 15 v30 l-26 15 l-26 -15 v-30 z M418 90 l26 15 v30 l-26 15 l-26 -15 v-30 z M522 90 l26 15 v30 l-26 15 l-26 -15 v-30 z" fill="none" stroke="#bff7ee" stroke-width="2" opacity=".75"/></g>
        <g id="msOrb"><circle cx="430" cy="150" r="15" fill="${E.color}" stroke="#fff" stroke-width="3"/><circle cx="430" cy="150" r="7" fill="#fff" opacity=".75"/></g>
        <g id="msVolt" transform="translate(96 74)" role="button" tabindex="0" aria-label="Volt, your helper drone: tap for a hint" aria-haspopup="dialog"><g id="msVoltIn">
          <rect class="ms-prop" x="-26" y="-30" width="20" height="4" rx="2" fill="#9aa9b8"/><rect class="ms-prop" x="6" y="-30" width="20" height="4" rx="2" fill="#9aa9b8"/><path d="M-16 -26 V-18 M16 -26 V-18" stroke="#15243a" stroke-width="2"/>
          <circle r="20" fill="#f6f8fa" stroke="#15243a" stroke-width="2.5"/><rect x="-13" y="-9" width="26" height="16" rx="7" fill="#15243a"/><circle cx="-5" cy="-1" r="3" fill="#5ad1ff"/><circle cx="5" cy="-1" r="3" fill="#5ad1ff"/>
          <path d="M-12 12 H12" stroke="#0b6e6e" stroke-width="3" stroke-linecap="round"/><path d="M1 9 L-3 15 L0 15 L-2 20 L4 13 L1 13 Z" fill="#f0a830"/>
          <g class="ms-bang"><circle cx="18" cy="-18" r="9" fill="#f0a830" stroke="#15243a" stroke-width="2"/><text x="18" y="-14" font-size="12" font-weight="700" text-anchor="middle" fill="#15243a" font-family="sans-serif">!</text></g></g>
          <g class="ms-tag"><g class="ms-tagIn"><rect x="-22" y="-62" width="126" height="22" rx="11" fill="#f0a830" stroke="#15243a" stroke-width="2"/><path d="M-4 -41 L2 -33 L8 -41 Z" fill="#f0a830" stroke="#15243a" stroke-width="2" stroke-linejoin="round"/><path d="M-3 -42 H7" stroke="#f0a830" stroke-width="3"/><text x="41" y="-47" font-size="12" font-weight="700" text-anchor="middle" fill="#15243a" font-family="IBM Plex Sans, sans-serif">Tap me for a hint!</text></g></g></g>
        <circle id="msFlash" cx="470" cy="160" r="70" fill="#fff"/>
        ${bat0 && bat0.st === "flat" ? `<text id="msZzz" class="ms-zzz" x="186" y="64">z z z</text>` : ""}
        <g id="msSparks"></g></svg>
      <div class="ms-hud"><span class="ms-hearts" id="msHearts" aria-label="Hearts left"></span><span class="ms-sc"><span class="ms-coin"></span><b id="msSC">0</b><span class="vh"> coins this station</span></span></div>
      <div class="ms-ehud"><strong>${esc(E.name)}</strong><span class="ms-hpbar"><b id="msHpG"></b><i id="msHp" style="background:${E.color}"></i></span></div>
      <div class="ms-say" id="msSay" aria-hidden="true"></div><div class="ms-vign" aria-hidden="true"></div>
      <div class="ms-banner" id="msBanner" aria-hidden="true"></div>
      <div class="ms-bubble" id="msBubble" role="dialog" aria-label="Volt's hint" aria-hidden="true"><button type="button" class="ms-x" aria-label="Close the hint">✕</button><div class="ms-bt"></div></div>
      <div class="ms-intro on" id="msIntro" role="button" tabindex="0" aria-label="Start the fight"><div class="ms-wcard${boss ? " boss" : ""}"><span>${boss ? "BOSS" : "WANTED"}</span>${portrait(E, "big")}<strong>${esc(E.name)}</strong>${E.taunt ? `<em>“${esc(E.taunt)}”</em>` : ""}<small>Chapter ${w.chapter} · Station ${mi + 1}${E.weak ? ` · Weakness: ${esc(E.weak)}` : ""}</small><b>Tap to fight</b></div></div>
      <div class="ms-over" id="msOver" hidden></div></div>
      <div class="ms-panel" id="msPanel"></div>`, true);
    const scene = $("#msScene"), panel = $("#msPanel"), H = $("#msHero"), M = $("#msMon"), tip = $("#msBubble"), VOLT = $("#msVolt");
    let skipTo = null;
    scene.addEventListener("click", (e) => { if (skipTo && !VOLT.contains(e.target) && !tip.contains(e.target)) { const f = skipTo; skipTo = null; f(); } });
    if (bat0 && bat0.st === "charged") H.classList.add("charged");
    teardown.push(() => { if (MUS) { MUS.setBoost(0); MUS.muffle(false); } });
    // the enemy's health bar, with a white "ghost" that follows a moment later
    const setHp = (pct) => { $("#msHp").style.width = `${pct}%`; $("#msHpG").style.width = `${pct}%`; };
    // the enemy speaks (a taunt, "!?", "Nooo…")
    const say = (t, ms = 2000, cls = "") => { const b = $("#msSay"); b.textContent = t; b.className = `ms-say on ${cls}`; clearTimeout(say.t); say.t = later(() => { b.className = "ms-say"; }, ms); };
    const fit = () => { const s = $(".ms-fg", scene); if (s) s.setAttribute("viewBox", matchMedia("(max-width: 560px)").matches ? "62 4 516 296" : "0 0 640 300"); };
    fit(); addEventListener("resize", fit); teardown.push(() => removeEventListener("resize", fit));
    const replay = (el, cls, ms) => { if (!el) return; el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); later(() => el.classList.remove(cls), ms); };
    const pop = (text, x, y, color, cls = "") => { const f = document.createElement("div"); f.className = "ms-float " + cls; f.textContent = text; f.style.left = x + "%"; f.style.top = y + "%"; f.style.color = color; scene.appendChild(f); later(() => f.remove(), 1100); };
    const banner = (t) => { const b = $("#msBanner"); b.textContent = t; b.classList.add("on"); clearTimeout(banner.t); banner.t = later(() => b.classList.remove("on"), 1700); };
    const paintHearts = () => { $("#msHearts").innerHTML = Array.from({ length: HEARTS }, (_, k) => heartSvg(k < hearts, k)).join(""); $("#msHearts").setAttribute("aria-label", `${hearts} of ${HEARTS} hearts left`); };
    const paintCoins = () => { $("#msSC").textContent = coins; };
    paintHearts(); paintCoins();

    // the enemy's card first; tap (or wait) to start
    const intro = $("#msIntro");
    const startFight = () => { if (!intro.classList.contains("on")) return; intro.classList.remove("on"); if (boss) { SFX.roar(); replay(M, "laugh", 1000); } const a = $("#msA"); if (a) a.focus({ preventScroll: true }); };
    intro.addEventListener("click", startFight);
    intro.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startFight(); } });
    if (saved) { intro.classList.remove("on"); setHp(100 * (steps.length - i) / steps.length); later(() => banner(`Welcome back! Question ${i + 1} of ${steps.length}`), 300); }
    else later(startFight, boss ? 2600 : 2000);
    // Volt introduces itself until the student has tapped it once (local only)
    if (!lsGet("nmk-mvolt")) { VOLT.classList.add("intro"); later(() => pop("Stuck? Tap me!", 9, 6, "#ffd84d", "volt"), saved ? 900 : 3000); }

    /* Volt's hint bubble: Volt again, ✕, a tap outside, Esc or the Back button closes it */
    const hideTip = () => { tip.classList.remove("on"); tip.setAttribute("aria-hidden", "true"); };
    const closeTip = () => { hideTip(); if (tipLayer) { const l = tipLayer; tipLayer = null; l.closed(); } };
    const openTip = (html) => {
      $(".ms-bt", tip).innerHTML = `<b>Volt:</b> ${html}`; tip.classList.add("on"); tip.setAttribute("aria-hidden", "false");
      if (!tipLayer && window.NMKBack) tipLayer = NMKBack.layer(() => { tipLayer = null; hideTip(); });
    };
    teardown.push(() => { if (tipLayer) { tipLayer.drop(); tipLayer = null; } });
    const hintOf = (s, k) => esc(val(s.hints[k], v));
    const tapVolt = () => {
      SFX.beep(); VOLT.classList.remove("alert", "intro");
      if (!lsGet("nmk-mvolt")) lsSet("nmk-mvolt", "1");
      if (tip.classList.contains("on")) return closeTip();
      if (done) return openTip("Great work, engineer! That enemy is fixed for good.");
      const open = Math.min(tries, 2), s = steps[i];
      if (!open) return openTip("Try it on paper first. If you miss, I'll find you a hint!");
      openTip(s.hints.slice(0, open).map((h, k) => `<span class="ms-hl"><i>Hint ${k + 1}</i> ${hintOf(s, k)}</span>`).join(""));
    };
    VOLT.addEventListener("click", tapVolt);
    VOLT.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapVolt(); } });
    $(".ms-x", tip).addEventListener("click", (e) => { e.stopPropagation(); closeTip(); });
    const outside = (e) => { if (tip.classList.contains("on") && !tip.contains(e.target) && !VOLT.contains(e.target)) closeTip(); };
    const esckey = (e) => { if (e.key === "Escape" && tip.classList.contains("on")) closeTip(); };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", esckey);
    teardown.push(() => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", esckey); });

    const data = m.data ? m.data(v) : null;
    // choice steps show their options in a new order each time
    const orng = seeded(seed + 7919);
    const order = steps.map((s) => { if (!s.choice) return null; const n = val(s.choice, v).length, o = [...Array(n).keys()]; for (let k = n - 1; k > 0; k--) { const j = Math.floor(orng() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; } return o; });

    function draw(msg = "", cls = "") {
      const s = steps[i], q = esc(asQuestion(val(s.q, v))), u = val(s.unit, v);
      panel.innerHTML = `<div class="ms-track">${steps.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>
        <div class="ms-sit"><p class="ms-sitl">The situation</p><p class="ms-story">${esc(val(m.story, v))}</p>${data ? `<div class="ms-data">${data.map((d) => `<span>${esc(d)}</span>`).join("")}</div>` : ""}</div>
        <p class="ms-ql">Question ${i + 1} of ${steps.length}</p><p class="ms-step">${q}</p>
        ${s.choice ? `<div class="ms-choices" role="group" aria-label="${q}">${order[i].map((k) => `<button type="button" class="btn ghost" data-c="${k}">${esc(val(s.choice, v)[k])}</button>`).join("")}</div>`
          : `<form class="ms-row" id="msF" novalidate><input type="text" id="msA" inputmode="decimal" autocomplete="off" aria-label="${q}" placeholder="Your answer"><span>${esc(u)}</span><button class="btn">Attack</button></form>`}
        <p class="ms-msg ${cls}" id="msMsg" aria-live="polite">${msg}</p>
        ${s.hints.slice(0, Math.min(tries, 2)).map((h, k) => `<div class="ms-hint"><strong>Volt's hint ${k + 1}:</strong> ${hintOf(s, k)}</div>`).join("")}
        <p class="small-note">${s.choice ? "Choose one." : `Give ${s.dp} decimal place${s.dp === 1 ? "" : "s"}.`} Right: +10 coins first try, +6 after one hint, +3 after that. Wrong: blocked, −1 heart and −2 coins.</p>`;
      if (s.choice) $$("[data-c]", panel).forEach((b) => b.addEventListener("click", () => answer(+b.dataset.c === s.correct, b.textContent)));
      else {
        const a = $("#msA"); if (!intro.classList.contains("on")) a.focus({ preventScroll: true });
        a.addEventListener("input", () => { $("#msMsg").textContent = ""; });
        $("#msF").addEventListener("submit", (e) => {
          e.preventDefault();
          if (busy) return;
          const r = judge(a.value, s, v);
          if (r.err) { $("#msMsg").className = "ms-msg err"; $("#msMsg").textContent = r.err; return; }
          if (r.almost) { SFX.almost(); $("#msMsg").className = "ms-msg no"; $("#msMsg").textContent = `Almost! Give ${s.dp} decimal places.`; return; }
          answer(r.ok, a.value, r.sign);
        });
      }
    }
    function strike(big) {   // the hero's attack, with the chosen weapon (bigger in a combo)
      $$(".ms-shot, #msSlash", scene).forEach((x) => x.classList.toggle("big", !!big));
      if (hero.weapon === "sword") { replay(H, "atk", 450); SFX.sword(); later(() => replay($("#msSlash"), "cut", 350), 200); }
      else { replay(H, "recoil", 300); SFX[hero.weapon](); later(() => replay($(`.ms-shot[data-w="${hero.weapon}"]`), "fly", 380), 60); }
    }
    function answer(ok, raw, sign) {
      if (busy || done) return;
      busy = true; startFight(); closeTip();
      if (matchMedia("(max-width: 640px)").matches) {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const top = scene.getBoundingClientRect().top; if (top < 50 || top > innerHeight * 0.4) scrollTo({ top: Math.max(0, scrollY + top - 64), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      $$("button, input", panel).forEach((b) => { b.disabled = true; });
      const s = steps[i];
      const zz = $("#msZzz"); if (zz) zz.remove();
      const comboNow = ok && tries === 0 ? combo + 1 : 0;
      strike(comboNow >= 2);
      if (ok) {
        const c = tries === 0 ? 10 : tries === 1 ? 6 : 3;
        if (tries === 0) firstTry++;
        got[i] = raw; tries = 0; VOLT.classList.remove("alert"); coins += c; combo = comboNow;
        const left = steps.length - i - 1, wasTaunt = taunted; taunted = false;
        later(() => {
          replay(M, "hit", 400); SFX.hit(); replay($("#msFlash"), "on", 350);
          setHp(Math.max(0, 100 * left / steps.length));
          pop(c === 10 ? "Critical!" : "Hit!", 73, 28, "#b3261e"); banner(s.choice ? "Correct!" : `Correct: ${fmtAns(s, v)}`);
          if (combo >= 2) { pop(`COMBO ×${combo}!`, 46, 10, "#ffb300", "combo"); SFX.combo(combo); replay(scene, "shake", 420); VOLT.classList.add("cheer"); later(() => VOLT.classList.remove("cheer"), 1200); }
          if (wasTaunt && left) { say("!?", 900, "shock"); replay(M, "shock", 520); }
          later(() => { paintCoins(); pop(`+${c}`, 12, 16, "#b86e00", "coin"); SFX.coin(); }, 250);
        }, 470);
        i++;
        // the boss gets angry at half health: a roar, a flash, new colours and faster music
        if (boss && !phase2 && left > 0 && left <= steps.length / 2) { phase2 = true; later(() => { SFX.roar(); replay(scene, "flash2", 700); M.classList.add("phase2"); replay(M, "laugh", 1000); banner(`⚠ ${E.name} is enraged!`); if (MUS) MUS.setBoost(14); }, 1150); }
        // the final blow: slow motion, then the enemy's last word
        if (!left) { scene.classList.add("finale"); later(() => { say("Nooo…!", 1400, "big"); SFX.nooo(); }, 560); }
        if (i < steps.length) store();
        if (i < steps.length) later(() => { busy = false; draw(s.choice ? "Correct! Next question." : `Correct! ${fmtAns(s, v)}. Next question.`, "ok"); }, 1000);
        else later(victory, 1350);
        return;
      }
      // wrong: the enemy's shield blocks the strike, then it strikes back, and laughs
      if (combo >= 2) later(() => pop("Combo broken!", 46, 10, "#9aa9b8", "combo"), 300);
      combo = 0;
      tries++; hearts--;
      const lose = Math.min(2, coins); coins -= lose;
      if (hearts > 0) store();
      // one thing at a time (9 Nov 2026): blocked → strike back → heart and coins drop → the enemy laughs → the message.
      // A tap on the scene skips to the message once the heart has dropped.
      later(() => { replay($("#msShield"), "on", 900); SFX.clang(); pop("Blocked!", 73, 22, "#0f766e"); }, 450);
      later(() => { replay(M, "atk", 600); SFX.strike(); replay($("#msOrb"), "fire", 520); }, 1150);
      later(() => {
        replay(H, "hurt", 600); SFX.hurt();
        paintHearts(); const hb = $(`#msHearts [data-h="${hearts}"]`); if (hb) replay(hb, "break", 700);
        if (lose) { paintCoins(); SFX.drop(); pop(`−${lose}`, 12, 16, "#b23b2e", "coin"); for (let k = 0; k < 3; k++) { const d = document.createElement("span"); d.className = "ms-cdrop"; d.style.left = `${22 + k * 3}%`; d.style.animationDelay = `${k * 0.08}s`; scene.appendChild(d); later(() => d.remove(), 1200); } }
        banner(sign ? "Check the sign!" : lose ? `Ouch! −1 heart, −${lose} coins` : "Ouch! −1 heart");
        replay(scene, "shake", 380);
        if (hearts > 0) skipTo = finish;
      }, 1700);
      const tauntT = later(() => {
        if (hearts <= 0) return knockOut();
        const list = E.taunts && E.taunts.length ? E.taunts : TAUNTS0, last = hearts === 1;
        replay(M, last ? "laugh2" : "laugh", last ? 1500 : 1200); SFX.laugh(last); say(list[tauntN++ % list.length], last ? 2200 : 1800, last ? "big" : ""); taunted = true;
        if (last) { scene.classList.add("danger"); replay(scene, "closeup", 1400); VOLT.classList.add("worried"); later(() => pop("Careful, last heart!", 17, 34, "#ff8a80", "volt"), 700); if (MUS) MUS.muffle(true); }
      }, 2350);
      let finished = false;
      function finish() {
        if (finished) return; finished = true; skipTo = null; clearTimeout(finishT);
        busy = false;
        const why = sign ? "Right size, wrong sign. Is it above or below?" : "Not quite.";
        draw(`${why} ${tries <= 2 ? "Tap Volt, your drone, for a hint." : "Check your working with Volt's hints and try again."}`, "no");
        if (!s.choice) $("#msA").value = raw;
        VOLT.classList.add("alert"); if (tries <= 2) SFX.beep();
      }
      const finishT = later(() => { if (hearts > 0) finish(); }, hearts === 1 ? 4500 : 4100);
      void tauntT;
    }
    // ⚡ the battery fills up after every battle (win or knocked out), when it wasn't nearly full already
    function chargeUp() {
      if (bat0 && bat0.fill >= 0.9) return;
      const f0 = bat0 ? bat0.fill : 0, d = document.createElement("div");
      d.className = "ms-charge"; d.setAttribute("role", "status");
      d.innerHTML = `${batSvg(1, "charged", "charge")}<b>⚡ Fully Charged!</b>`;
      d.querySelector(".lg-bfill").style.setProperty("--f0", `${(29 * f0).toFixed(1)}px`);
      scene.appendChild(d); SFX.charge(); H.classList.add("charged"); replay(H, "zap", 900);
      later(() => d.remove(), 2800);
    }
    // the enemy breaks into glowing pixels, then comes back small, calm and calibrated
    function shatter() {
      const cols = [E.color, "#38e1c9", "#ffd84d", "#ffffff"];
      $("#msSparks").innerHTML = Array.from({ length: 28 }, (_, k) => { const a = (k / 28) * Math.PI * 2 + Math.random() * 0.4, r = 60 + Math.random() * 90;
        return `<rect class="ms-pix" x="${464 + Math.random() * 12}" y="${150 + Math.random() * 30}" width="${6 + Math.random() * 6}" height="${6 + Math.random() * 6}" fill="${cols[k % 4]}" style="--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r - 30).toFixed(0)}px;animation-delay:${(Math.random() * 0.12).toFixed(2)}s"/>`; }).join("");
      SFX.shatter();
    }
    function repaired() {
      $("#msSparks").insertAdjacentHTML("beforeend", `<g transform="translate(470 234) scale(${(sc * 0.6).toFixed(2)})"><g class="ms-fixed">${E.svg}</g></g>
        <g class="ms-fixtag"><rect x="418" y="246" width="104" height="24" rx="12" fill="#1db86a" stroke="#fff" stroke-width="2"/><text x="470" y="263" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="sans-serif">✓ Calibrated</text></g>`);
    }
    // coins fly from the enemy to the coin counter
    function flyCoins(n) {
      const sr = scene.getBoundingClientRect(), to = ($("#msSC") || scene).getBoundingClientRect(), x0 = sr.width * 0.73, y0 = sr.height * 0.42;
      for (let k = 0; k < n; k++) {
        const c = document.createElement("span"); c.className = "ms-flyc";
        c.style.left = `${x0}px`; c.style.top = `${y0}px`; c.style.setProperty("--tx", `${(to.left - sr.left + 8 - x0).toFixed(0)}px`); c.style.setProperty("--ty", `${(to.top - sr.top + 6 - y0).toFixed(0)}px`); c.style.animationDelay = `${k * 0.09}s`;
        scene.appendChild(c); later(() => c.remove(), 1400 + k * 90); if (k % 2 === 0) later(() => SFX.coin(), 700 + k * 90);
      }
    }
    function overlay(html) { const o = $("#msOver"); o.innerHTML = html; o.hidden = false; return o; }
    function knockOut() {
      done = true; closeTip(); clearSave(m.id);
      replay(H, "ko", 4000); SFX.ko(); later(() => { replay(M, "laugh2", 1600); SFX.laugh(true); }, 350); later(() => say("Hahaha! Come back stronger!", 2600, "big"), 400);
      later(() => replay(scene, "closeup", 1400), 500); later(chargeUp, 2600);
      later(() => {
        const o = overlay(`<div class="ms-ko"><strong>Knocked out!</strong><p>${esc(E.name)} wins this round. Start the station again: every question, with new numbers.</p>
          <div class="ms-row ms-center"><button type="button" class="btn" data-again>Try again</button><button type="button" class="btn ghost" data-back-world>Back to the chapter</button></div></div>`);
        $("[data-again]", o).addEventListener("click", () => { SFX.click(); battle(w, mi); });
        $("[data-back-world]", o).addEventListener("click", () => { SFX.click(); go("world", true, w); });
        $("[data-again]", o).focus({ preventScroll: true });
        panel.innerHTML = `<p class="ms-msg no">Knocked out: no hearts left. Try the station again with new numbers.</p>`;
      }, 3200);
    }
    function victory() {
      done = true; clearSave(m.id);
      replay(M, "faint", 5000); SFX.faint(); shatter(); later(repaired, 1250);
      scene.classList.remove("danger"); if (MUS) { MUS.muffle(false); MUS.setBoost(0); }
      later(() => { replay(H, "cheer", 2100); SFX.win(); scene.classList.remove("finale"); }, 700);
      later(() => flyCoins(Math.max(3, Math.min(10, Math.round(coins / 8)))), 900);
      later(chargeUp, 2300);
      const st = firstTry === steps.length ? 3 : firstTry >= steps.length - 1 ? 2 : 1;
      const bonus = (st === 3 ? 10 : 0) + (boss ? 50 : 0), total = coins + bonus;
      const before = best()[m.id];
      saveBest(w, m, { c: total, s: st, mk });
      winData = { kind: "win", coins: total, where: `CHAPTER ${w.chapter} · STATION ${mi + 1}${boss ? " · BOSS" : ""}`, title: `I defeated ${E.name}!`, enemySvg: E.svg, enemyScale: E.scale || 1,
        stars: "★".repeat(st) + "☆".repeat(3 - st), extra: boss ? "Boss defeated" : `${firstTry}/${steps.length} first try` };
      const rk1 = ART.rankOf(totalCoins()), nextM = w.missions[mi + 1] && missionOpen(w, mi + 1) ? w.missions[mi + 1] : null;
      later(() => {
        const nb = before && before.c >= total ? `Your best is still ${before.c} coins.` : before ? "A new best!" : "";
        panel.innerHTML = `<div class="ms-win"><p class="ms-step" style="font-size:1.2rem">${boss ? "Boss defeated!" : "Station cleared!"} ${esc(E.name)} is fixed.</p>
          <div class="ms-big"><span class="ms-stars rv" aria-label="${st} of 3 stars">${[0, 1, 2].map((k) => `<i class="${k < st ? "on" : ""}" style="animation-delay:${(0.25 + k * 0.38).toFixed(2)}s">${k < st ? "★" : "☆"}</i>`).join("")}</span></div>
          <p>You earned <strong>${total} coins</strong>${bonus ? ` (with a ${bonus}-coin bonus)` : ""}. ${firstTry} of ${steps.length} questions right on the first try. ${nb}</p></div>
          <div class="ms-working"><p><strong>Full working</strong> (compare with your paper)</p>${steps.map((s, k) => `<p><strong>${esc(asQuestion(val(s.q, v)))}</strong><br>${s.choice ? `Answer: ${esc(val(s.choice, v)[s.correct])}${s.why ? `<br><span class="small-note">${esc(val(s.why, v))}</span>` : ""}` : `${esc(val(s.formula, v))}<br>${esc(val(s.sub, v))} = <strong>${esc(fmtAns(s, v))}</strong>`}${got[k] && !s.choice ? ` <span class="small-note">(you: ${esc(got[k])})</span>` : ""}</p>`).join("")}</div>
          <div class="ms-row ms-center">${nextM ? `<button type="button" class="btn" data-next>Next: face ${esc(enemyOf(nextM).name)} ›</button><button type="button" class="btn ghost" data-back-world>Back to the chapter</button>` : `<button type="button" class="btn" data-back-world>Back to the chapter</button>`}<button type="button" class="btn ghost" data-again>Fight again (new numbers)</button><button type="button" class="btn ghost" data-sharewin>📤 Share my win</button></div>`;
        $("[data-again]", panel).addEventListener("click", () => { SFX.click(); battle(w, mi); });
        $("[data-back-world]", panel).addEventListener("click", () => { SFX.click(); go("world", true, w); });
        if (nextM) $("[data-next]", panel).addEventListener("click", () => { SFX.click(); battle(w, mi + 1); });
        $("[data-sharewin]", panel).addEventListener("click", () => { SFX.click(); winShare(); });
        ($("[data-next]", panel) || $("[data-back-world]", panel)).focus({ preventScroll: true });
        for (let k = 0; k < st; k++) later(() => tone(988 + k * 220, 0, 0.16, "triangle", 0.06), 250 + k * 380);
        const cp = $("#msCoins"); if (cp) cp.textContent = totalCoins();
        if (rk1 > rk0) rankUp(rk1);
      }, 1600);
    }
    // the achievement card: this enemy, or the new rank after a rank-up
    let winData = null;
    function winShare(rk) {
      const r = ART.rankOf(totalCoins()), d = Object.assign({}, winData, { hero, tier: tier(), name: heroLabel(), rank: r, rankName: ART.RANKS[r].n });
      if (rk !== undefined) Object.assign(d, { where: `RANK UP · ${ART.RANKS[rk].scene.toUpperCase()}`, title: `I reached ${ART.RANKS[rk].n}!` });
      share(d, rk !== undefined ? `I reached ${ART.RANKS[rk].n} in INSTRUMENTA: Legends, ${BY} Can you catch me? #INSTRUMENTALegends #UniMAP ${SHARE_URL}`
        : `I defeated ${E.name} in INSTRUMENTA: Legends, ${BY} Can you beat my score? #INSTRUMENTALegends #UniMAP ${SHARE_URL}`, rk !== undefined ? "rank" : "win");
    }
    function rankUp(rk) {
      const R = ART.RANKS[rk];
      const old = $(".lg-bg", scene); if (old) old.outerHTML = ART.bg(rk);
      if (MUS) MUS.setMood(R.s);
      SFX.rankup();
      const o = overlay(`<div class="ms-rank"><span>RANK UP!</span><strong>${esc(R.n)}</strong><p>Welcome to ${esc(R.scene)}.</p><div class="ms-row ms-center"><button type="button" class="btn" data-okrank>Continue</button><button type="button" class="btn ghost" data-sharerank>📤 Share</button></div></div>`);
      $("[data-okrank]", o).addEventListener("click", () => { o.hidden = true; });
      $("[data-sharerank]", o).addEventListener("click", () => { SFX.click(); winShare(rk); });
      $("[data-okrank]", o).focus({ preventScroll: true });
      $(".lg-mrank") && ($(".lg-mrank").textContent = R.n);
    }
    $("[data-saveexit]").addEventListener("click", () => {
      SFX.click();
      if (!done && (i > 0 || tries > 0)) store(true);
      go("world", true, w);
      if (!done && (i > 0 || tries > 0)) { const n = document.createElement("p"); n.className = "lg-saved"; n.setAttribute("role", "status"); n.textContent = `Saved: ${E.name}, question ${i + 1} of ${steps.length}. Continue any time, on any device signed in to your account.`; const v2 = $("#msView"); if (v2) v2.prepend(n); }
    });
    const flush = () => { if (document.hidden && !done && (i > 0 || tries > 0) && A && A.push) { unsent = 0; A.push(); } };
    document.addEventListener("visibilitychange", flush); teardown.push(() => document.removeEventListener("visibilitychange", flush));
    draw();
  }

  /* ---------- clicks and the music volume ---------- */
  function openGuide(tab) {
    guideTab = tab;
    if (view === "room" && roomUnsaved && roomUnsaved()) return roomLeave(() => go("guide"));
    if (view === "guide") { guideView(); if (window.NMKBack) NMKBack.view({ mview: "guide", mworld: null, mtab: tab }, true); }
    else { go("guide"); if (window.NMKBack) NMKBack.view({ mview: "guide", mworld: null, mtab: tab }, true); }
    const t = $(".gg"); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: "start" });
  }
  page.addEventListener("click", (e) => {
    const gd = e.target.closest("[data-guide], [data-gtab]");
    if (gd) { SFX.click(); return openGuide(gd.dataset.guide || gd.dataset.gtab); }
    if (e.target.closest("[data-guideok]")) { SFX.click(); markGuide(); return go("map"); }
  });
  page.addEventListener("keydown", (e) => { const r = e.target.closest && e.target.closest(".lg-rank[data-guide]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openGuide("ranks"); } });
  page.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-snd")) { soundOn = !soundOn; lsSet("nmk-msnd", soundOn ? "1" : "0"); $$("[data-snd]").forEach((x) => { x.setAttribute("aria-pressed", soundOn); x.textContent = soundOn ? "🔊" : "🔇"; }); SFX.click(); return; }
    if (b.hasAttribute("data-mus")) { setMusic(!musicOn); return; }
    if (b.hasAttribute("data-sharegame") || b.hasAttribute("data-shareme")) { SFX.click(); return sharePlay(); }
    if (b.dataset.sharest) { SFX.click(); return shareStation(openWorld, +b.dataset.sharest); }
    if (b.dataset.go) { SFX.click(); if (view === "room" && roomUnsaved && roomUnsaved()) { const to = b.dataset.go; return roomLeave(() => go(to)); } return go(b.dataset.go); }
    if (b.dataset.world) { const w = WORLDS.find((x) => x.world === +b.dataset.world); if (w && worldOpen(w)) { SFX.click(); go("world", true, w); } return; }
    if (b.dataset.play) { SFX.click(); battle(openWorld, +b.dataset.play); }
    if (b.dataset.cont) { SFX.click(); battle(openWorld, +b.dataset.cont, true); }
    if (b.dataset.fresh) { const m = openWorld.missions[+b.dataset.fresh]; if (confirm(`Start ${enemyOf(m).name} again from question 1? Your hearts and coins for this try go back to the start.`)) { SFX.click(); clearSave(m.id); battle(openWorld, +b.dataset.fresh); } }
  });
  page.addEventListener("change", (e) => { if (e.target.matches("[data-asstu]")) { asStudent = e.target.checked; go(view === "battle" ? "world" : view, false); } });
  page.addEventListener("input", (e) => {
    if (!e.target.matches(".lg-vol")) return;
    musicVol = +e.target.value; lsSet("nmk-musv", String(musicVol)); if (MUS) MUS.setVolume(musicVol / 100);
    $$(".lg-vol").forEach((r) => { if (r !== e.target) r.value = musicVol; });
  });

  /* ---------- start: who may play, and loading the chapter files ---------- */
  const viewOf = (s, w) => (["room", "board", "about", "guide"].includes(s.mview) ? s.mview : w ? "world" : "map");
  function gate(html) { page.innerHTML = `<div class="ms-gate">${html}</div>`; }
  async function start(st) {
    if (!st.ready) return;
    if (!st.user) { gate(`<p><strong>Sign in to play.</strong> INSTRUMENTA: Legends is for NMK42003 students: sign in with your studentmail account.</p><button type="button" class="btn" id="msIn">Sign in with Google</button>`); $("#msIn").addEventListener("click", () => A.signIn()); return; }
    isLec = A.isAdmin(st.user.email);
    const db = A.db;
    let released = false;
    try { const d = await db.collection("meta").doc("missions").get(); released = !!(d.exists && d.data().released); LOCKS = (d.exists && d.data().locks) || {}; PAUSES = (d.exists && d.data().bat && d.data().bat.p) || []; } catch (e) { /* rules not published yet */ }
    A.released = released;
    if (!isLec && !released) { gate(`<p><strong>INSTRUMENTA: Legends is coming soon.</strong> Your lecturer will open it when it's ready.</p>`); return; }
    if (!isLec && !(st.profile && st.profile.status === "approved")) { gate(`<p><strong>Your account is waiting for approval.</strong> The game opens once your lecturer approves it.</p>`); return; }
    gate(`<p class="small-note">Loading the chapters…</p>`);
    try {
      const q = await db.collection("missions").get();
      WORLDS = q.docs.map((d) => { try { const w = new Function(d.data().code)(); return w && Array.isArray(w.missions) ? w : null; } catch (e) { console.warn("NMK missions: could not read", d.id, e); return null; } })
        .filter(Boolean).sort((a, b) => a.world - b.world);
    } catch (e) { gate(`<p>Could not load the chapters (${esc(e.code || e)}). ${isLec ? "If this says permission-denied, publish the latest firebase/firestore.rules." : "Please try again later."}</p>`); return; }
    try { const d = await db.collection("meta").doc("heronames").get(); BANS = (d.exists && d.data().bans) || {}; } catch (e) { BANS = {}; }
    if (hero.name && isBanned(st.user.uid, hero.name)) {   // removed by a lecturer: back to the nickname until a new name is saved
      hero = Object.assign({}, hero, { name: "", at: new Date().toISOString() }); nameRemoved = true;
      lsSet("nmk-hero", JSON.stringify(hero)); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-hero" }));
    }
    const hs = history.state || {};
    const w = hs.mworld ? WORLDS.find((x) => x.world === hs.mworld) : null;
    if (hs.mtab) guideTab = hs.mtab;
    go(viewOf(hs, w), false, w);
    if (window.NMKBack) NMKBack.view({ mview: view, mworld: openWorld ? openWorld.world : null }, true);
    if (!lsGet("nmk-mguide") && view === "map") { guideTab = "play"; go("guide"); }
  }
  document.addEventListener("nmk:synced", () => { const h = parse(lsGet("nmk-hero"), null); if (h && String(h.at || "") > String(hero.at || "")) hero = Object.assign({}, HERO0, h); if (WORLDS.length && view !== "battle" && !(view === "room" && roomUnsaved && roomUnsaved())) go(view, false); });
  if (window.NMKBack) NMKBack.onView((s) => { if (s.mtab) guideTab = s.mtab; const w = s.mworld ? WORLDS.find((x) => x.world === s.mworld) : null; go(viewOf(s, w), false, w); });
  let booted = false;
  const boot = () => { if (booted) return; booted = true; A = window.NMKAccount; if (!A) { gate(`<p>The game needs the course account system, which didn't load. Please reload the page.</p>`); return; } A.on((st) => { if (st.ready) start(st); }); };
  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
