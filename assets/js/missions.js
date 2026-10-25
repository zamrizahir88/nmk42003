/* INSTRUMENTA: Legends (missions.html): a battle game for practising each chapter. Each chapter has three stations,
   each guarded by a named enemy; the third is the boss (the tough level, scored in marks like an exam question).
   The questions are not in this file. A lecturer uploads each chapter's file on the dashboard (admin.html); it is kept
   in Firestore missions/{world N} and only lecturers, or signed-in students after the lecturer releases the game
   (meta/missions.released), can read it. This file is the engine: map, My Character, battle, Volt the helper drone,
   answer checking, coins, hearts, ranks, sound and music. The art is in legends-art.js, the music in legends-music.js.
   A right answer strikes the enemy and earns coins; a wrong one is blocked by the enemy's shield, the enemy strikes
   back (one heart lost) and 2 coins drop (never below 0). No hearts left: the station starts again with new numbers.
   Saved in this browser (and synced with the account, so a student can carry on on another device): nmk-missions
   (best result of each station), nmk-msave (a station in progress: its seed, so the same numbers come back, the
   question reached, hearts, coins, marks; "cleared" once it is won or lost), nmk-hero (the character and its hero name).
   Also here: the splash screen (once per browser session), the Credits (About) view and the 9:16 share cards. nmk-msnd (sound), nmk-mus and nmk-musv (music on/off and volume) stay on this device. */
(function () {
  "use strict";
  const page = document.getElementById("missions");
  if (!page || typeof COURSE === "undefined") return;
  const ART = window.NMKLegendsArt, MUS = window.NMKLegendsMusic;
  if (!ART) { page.innerHTML = `<p class="small-note">The game didn't load. Please reload the page.</p>`; return; }
  const reduceM = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- the splash: once per browser session, about 1.5 s; a tap (or a key) skips it ---------- */
  (function splash() {
    let seen = false;
    try { seen = sessionStorage.getItem("nmk-lgsplash") === "1"; sessionStorage.setItem("nmk-lgsplash", "1"); } catch (e) { seen = false; }
    if (seen || new URLSearchParams(location.search).has("nosplash")) return;
    const s = document.createElement("div");
    s.className = "lg-splash"; s.setAttribute("aria-hidden", "true");
    s.innerHTML = `<div class="lg-spin"><div class="lg-sp1">${ART.zamm(true)}</div><p class="lg-sp2">presents</p><div class="lg-sp3">${ART.logo()}</div>
      <p class="lg-sp4"><span>Created by</span> <b>Ts. Dr. Mohd Zamri Bin Zahir Ahmad</b></p><p class="lg-sp5">Faculty of Electronic Engineering &amp; Technology · UniMAP</p></div><span class="lg-spskip">Tap to skip</span>`;
    document.body.appendChild(s);
    const end = () => { if (s.classList.contains("out")) return; s.classList.add("out"); document.removeEventListener("keydown", end); setTimeout(() => s.remove(), reduceM ? 0 : 450); };
    s.addEventListener("click", end); document.addEventListener("keydown", end);
    setTimeout(end, reduceM ? 1200 : 1700);
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
      ...(m.boss ? { mk: Math.max(old.mk || 0, r.mk || 0), of: m.marks || 30, boss: 1 } : {}), n: (old.n || 0) + 1 };
    lsSet("nmk-missions", JSON.stringify(all));
    if (!isLec) document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-missions" }));
  }

  /* ---------- a station in progress: saved after every answer, so it can be continued later (on any device) ---------- */
  const saves = () => parse(lsGet("nmk-msave"), {}) || {};
  const saveOf = (m) => { const s = saves()[m.id]; return s && !s.cleared && s.n === m.steps.length && s.i < s.n ? s : null; };
  function putSave(id, rec, push) {
    const all = saves(); all[id] = Object.assign({ at: new Date().toISOString() }, rec);
    lsSet("nmk-msave", JSON.stringify(all));
    document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-msave" }));
    if (push && A && A.push) A.push();
  }
  const clearSave = (id) => putSave(id, { cleared: true });
  // numbers drawn from a saved seed, so a continued station has the same questions
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
    head: [["none", "None"], ["cap", "Cap"], ["kopiah", "Kopiah"], ["hardhat", "Safety helmet"]],
    eyes: [["none", "None"], ["round", "Glasses"], ["goggles", "Lab goggles"]],
    weapon: [["sword", "Probe Sword"], ["blaster", "Scope Blaster"], ["bow", "Signal Bow"], ["staff", "Solder Staff"]]
  };
  const NOTE = { sword: "A giant multimeter probe. Slashes up close.", blaster: "An oscilloscope cannon. Fires a sine wave.", bow: "An antenna bow. Shoots radio waves.", staff: "A soldering-iron staff. Hurls a hot spark." };
  const SKINS = ["#f6d5b5", "#e3ad80", "#b07650"], HAIRS = ["#1f1a17", "#4a2c1a", "#7a4a26", "#a8a8a8"];
  const COLORS = ["#0b6e6e", "#1e3a5f", "#b3412e", "#6b4bb8", "#2f7d32", "#c2185b"], TUDUNG = ["#e8d6c0", "#f4c6d4", "#cfe0f2", "#2b2b2b"];
  const HERO0 = { look: "m", hairM: "spiky", hairF: "long", face: "none", head: "none", eyes: "none", hair: HAIRS[0], skin: SKINS[0], color: COLORS[0], tud: TUDUNG[0], weapon: "sword", name: "" };
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
  const free = () => isLec && !asStudent;
  const worldOpen = (w) => free() || opensOn(w).iso <= todayISO();
  const missionOpen = (w, i) => { if (free()) return true; if (!worldOpen(w)) return false; const b = best(); return w.missions.slice(0, i).every((m) => b[m.id]); };
  const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
  const stars = (n, of = 3) => `<span class="ms-stars" aria-label="${n} of ${of} stars">${"★".repeat(n)}${"☆".repeat(of - n)}</span>`;

  /* ---------- the page frame: the stage (rank, coins, music) and the views ---------- */
  // music (with its volume when on) and sound effects as small round buttons
  const sounds = () => `<span class="lg-snds"><button type="button" class="lg-ic" data-mus aria-pressed="${musicOn}" aria-label="Music" title="Music">♪</button>
      <input type="range" class="lg-vol" min="0" max="100" step="5" value="${musicVol}" aria-label="Music volume"${musicOn ? "" : " hidden"}>
      <button type="button" class="lg-ic" data-snd aria-pressed="${soundOn}" aria-label="Sound effects" title="Sound effects">${soundOn ? "🔊" : "🔇"}</button></span>`;
  const coinPill = () => `<span class="ms-pill lg-coins"><span class="ms-coin"></span><strong id="msCoins">${totalCoins()}</strong> <small>coins</small></span>`;
  function frame(body, battleView) {
    const coins = totalCoins(), rk = ART.rankOf(coins), R = ART.RANKS[rk], nx = ART.RANKS[rk + 1];
    if (MUS) MUS.setMood(rk);
    const lec = isLec ? `<div class="ms-lec">${A.released ? "Released: students can play." : "<strong>Not released yet:</strong> only lecturers can see this page."} Lecturer plays are saved on this device only and never appear on the board. <a href="admin.html">Release or upload on the dashboard ›</a>
      <label class="ms-asstu"><input type="checkbox" data-asstu${asStudent ? " checked" : ""}> Preview as a student: stations unlock one by one, and chapters open in the week they are lectured</label></div>` : "";
    const stage = battleView ? `<div class="lg-mini"><strong class="lg-mlogo">INSTRUMENTA: <em>Legends</em></strong><span class="lg-mrank">${esc(R.n)}</span><span class="ms-sp"></span>${coinPill()}${sounds()}<button type="button" class="lg-btn lg-save" data-saveexit>💾 Save and exit</button></div>`
      : `<div class="lg-stage">${ART.bg(rk)}<div class="lg-hud">
          <div class="lg-brand">${ART.logo()}<small class="lg-by">by Ts. Dr. Zamri Zahir</small></div>
          <div class="lg-rank"><span class="lg-rk">Rank ${rk + 1} of ${ART.RANKS.length} · ${esc(R.scene)}</span><strong>${esc(R.n)}</strong>
            <span class="lg-bar" role="progressbar" aria-label="Progress to the next rank" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}"><i style="width:${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}%"></i></span>
            <small>${nx ? `${nx.min - coins} more coins to ${esc(nx.n)}` : "Top rank reached. Legendary!"}</small></div>
        </div><div class="lg-strip">${coinPill()}<span class="lg-nav"><button type="button" class="lg-btn main" data-go="board">🏆 Leaderboard</button><button type="button" class="lg-btn alt" data-go="room">👤 My Character</button><button type="button" class="lg-btn alt" data-go="about">ⓘ About</button></span>${sounds()}</div></div>`;
    page.innerHTML = `${lec}${stage}<div id="msView">${body}</div><p class="lg-copy">© 2026 Zamm Studio™ · Ts. Dr. Mohd Zamri Bin Zahir Ahmad</p>`;
  }
  function go(v, push = true, w = openWorld) {
    cleanup();
    view = v; openWorld = w;
    if (push && window.NMKBack) NMKBack.view({ mview: v, mworld: w ? w.world : null });
    if (v === "room") return room();
    if (v === "board") return boardView();
    if (v === "about") return aboutView();
    if (v === "world" && w) return worldView(w);
    return mapView();
  }
  function mapView() {
    const b = best();
    frame(`<p class="lg-lead">INSTRUMENTA: Legends helps you understand each chapter and practise for your real examination. Each chapter has three stations, each guarded by an enemy; beat the first two to face the boss. Work each step on paper and key in your answer: a right answer strikes and earns coins, a wrong one is blocked, the enemy strikes back and you drop 2 coins. Lose all your hearts and the station starts again. A chapter opens in the week it is lectured.</p>
      <div class="lg-worlds">${WORLDS.map((w) => {
        const open = worldOpen(w), o = opensOn(w), done = w.missions.filter((m) => b[m.id]).length;
        return `<button type="button" class="lg-world${open ? "" : " locked"}" data-world="${w.world}"${open ? "" : ` aria-disabled="true"`}>
          <span class="lg-wch">Chapter ${w.chapter}</span><strong>${esc(w.title.replace(/^(Station|Chapter) \d+:\s*/, ""))}</strong>
          <span class="lg-trio">${w.missions.slice(0, 3).map((m) => `<span class="lg-tri${b[m.id] ? " won" : ""}">${portrait(enemyOf(m))}</span>`).join("")}</span>
          <span class="lg-wfoot">${open ? `${done} of ${w.missions.length} defeated` : `🔒 Opens ${fmtDay(o.iso)} (week ${o.week})`}</span></button>`;
      }).join("") || `<p class="small-note">No chapters yet.${isLec ? " Upload a mission file on the dashboard." : ""}</p>`}</div>`);
  }
  function worldView(w) {
    const b = best();
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ All chapters</button></p><h2 class="h3">Chapter ${w.chapter}: ${esc(w.title.replace(/^(Station|Chapter) \d+:\s*/, ""))}</h2>
      <div class="lg-cards">${w.missions.map((m, i) => {
        const open = missionOpen(w, i), r = b[m.id], e = enemyOf(m), prev = w.missions[i - 1];
        return `<div class="lg-card${e.boss ? " boss" : ""}${open ? "" : " locked"}"><div class="lg-wanted">${e.boss ? "BOSS" : "WANTED"}</div>
          ${portrait(e)}<div class="lg-nm">${esc(e.name)}</div><div class="lg-where">Station ${i + 1}${e.boss ? ` · tough level · ${m.marks || 30} marks` : ""}</div>
          <div class="lg-diff" aria-label="Difficulty ${e.boss ? 3 : i + 1} of 3">${"★".repeat(e.boss ? 3 : i + 1)}${"☆".repeat(3 - (e.boss ? 3 : i + 1))}</div>
          <div class="lg-weak"><b>Weakness:</b> ${esc(e.weak || m.title)}</div>${e.taunt ? `<div class="lg-taunt">“${esc(e.taunt)}”</div>` : ""}
          <div class="lg-res">${r ? `Defeated · ${stars(r.s)} · best ${r.c} coins${r.boss ? ` · ${r.mk}/${r.of} marks` : ""}` : `${m.steps.length} questions`}</div>
          ${open && saveOf(m) ? `<button type="button" class="btn" data-cont="${i}">Continue · Question ${saveOf(m).i + 1} of ${m.steps.length} · ${saveOf(m).hearts} ♥ · ${saveOf(m).coins} coins</button><button type="button" class="btn ghost small" data-fresh="${i}">Start over</button>`
            : open ? `<button type="button" class="btn${r ? " ghost" : ""}" data-play="${i}">${r ? "Fight again" : "Fight"}</button>` : `<span class="lg-lock">🔒 ${worldOpen(w) ? `Defeat ${esc(enemyOf(prev).name)} first` : `Opens ${fmtDay(opensOn(w).iso)}`}</span>`}
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
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ All chapters</button></p><h2 class="h3">My Character</h2><p class="small-note">Try any look, then press <strong>Save my character</strong>. Your saved character appears on every device you sign in to, and on the leaderboard.</p>
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
          ${row("look", "Look", OPT.look)}${row("hairM", "Hair", OPT.hairM)}${row("hairF", "Hair", OPT.hairF)}${sw("hair", "Hair colour", HAIRS)}${row("face", "Facial hair", OPT.face)}${row("head", "Headwear", OPT.head)}${sw("tud", "Tudung colour", TUDUNG)}${row("eyes", "Eyewear", OPT.eyes)}${sw("skin", "Skin tone", SKINS)}${sw("color", "Jacket colour", COLORS)}${row("weapon", "Weapon", OPT.weapon)}<p class="small-note" id="msWn"></p></div></div>`);
    const vis = { hairM: () => draft.look === "m", face: () => draft.look === "m", hairF: () => draft.look === "f", hair: () => draft.look !== "t", head: () => draft.look !== "t", tud: () => draft.look === "t" };
    const dropLayer = () => { if (layer) { const l = layer; layer = null; l.closed(); } };
    const guard = () => { if (dirty() && !layer && window.NMKBack) layer = NMKBack.layer(() => { layer = null; ask(() => go("map")); }); if (!dirty()) dropLayer(); };
    const paint = () => {
      $("#msPv").innerHTML = ART.heroSvg(draft, "msPvh", t);
      $$("[data-k]").forEach((b) => b.setAttribute("aria-pressed", draft[b.dataset.k] === b.dataset.v));
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
    $$("[data-k]").forEach((b) => b.addEventListener("click", () => { draft[b.dataset.k] = b.dataset.v; SFX.click(); $("#msHs").textContent = ""; paint(); guard(); }));
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
  // one list for the whole class (no sections); students see no matric numbers
  async function boardView() {
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ All chapters</button></p><h2 class="h3">🏆 INSTRUMENTA Leaderboard</h2>
      <p class="small-note">The whole class, ranked by game coins. It updates each time a player's progress syncs. Tap a name to open the profile. Points never count towards grades.</p><div id="lgBoard"><p class="small-note">Loading…</p></div>`);
    const host = $("#lgBoard");
    let docs = [], roster = [];
    try {
      const q = await A.db.collection("board").where("semester", "==", A.SEM).get();
      docs = q.docs.map((d) => Object.assign({ uid: d.id }, d.data()));
      if (isLec) roster = (await A.db.collection("roster").get()).docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((r) => r.status === "active");
    } catch (e) { host.innerHTML = `<p class="small-note">Could not load the leaderboard (${esc(e.code || e)}).</p>`; return; }
    if (view !== "board") return;
    const total = WORLDS.reduce((a, w) => a + w.missions.length, 0), bossesT = WORLDS.reduce((a, w) => a + w.missions.filter((m) => m.boss).length, 0);
    const players = docs.filter((d) => d.role !== "lecturer" && d.game && (d.game.coins || d.game.cleared || d.game.started))
      .sort((a, b) => (b.game.coins - a.game.coins) || (b.game.cleared - a.game.cleared) || String(b.game.last || "").localeCompare(String(a.game.last || "")));
    const me = myUid();
    const medal = (k) => (k === 0 ? "🥇" : k === 1 ? "🥈" : k === 2 ? "🥉" : `#${k + 1}`);
    const hname = (d) => { const n = String(heroIn(d.game).name || "").trim(); return n && !isBanned(d.uid, n) ? n : ""; };
    const label = (d) => hname(d) || d.nickname || d.name || "Player";
    const cols = 8 + WORLDS.length + (isLec ? 1 : 0);
    const row = (d, k) => { const g = d.game, R = ART.RANKS[ART.rankOf(g.coins || 0)], hn = hname(d);
      return `<tr class="${d.uid === me ? "me" : ""}"><td class="lg-pos">${medal(k)}</td><td><span class="lg-who">${avatar(heroIn(g))}<span><b class="lg-hn">${esc(hn || d.nickname || "Player")}</b>
        <a href="profile.html?u=${encodeURIComponent(d.uid)}">${esc(d.name || d.nickname || "Student")}</a>${hn && d.nickname ? `<small>${esc(d.nickname)}</small>` : ""}
        ${isLec && hn ? `<button type="button" class="lg-rm" data-rmname="${esc(d.uid)}" data-name="${esc(hn)}">Remove hero name</button>` : ""}</span></span></td>
        ${isLec ? `<td>${esc(d.matric || "–")}</td>` : ""}<td>${esc(R.n)}</td><td class="lg-num"><strong>${g.coins || 0}</strong></td><td class="lg-num">${g.cleared || 0} / ${total}</td><td class="lg-num">${g.bosses || 0} / ${bossesT}</td><td class="lg-num">${g.stars || 0} ★</td>
        ${WORLDS.map((w) => `<td class="lg-num">${((g.ch || {})[w.world] || 0)} / ${w.missions.length}</td>`).join("")}<td>${ago(g.last)}</td></tr>`; };
    const head = `<tr><th scope="col">#</th><th scope="col">Player</th>${isLec ? `<th scope="col">Matric</th>` : ""}<th scope="col">Rank</th><th scope="col">Coins</th><th scope="col">Stations</th><th scope="col">Bosses</th><th scope="col">Stars</th>${WORLDS.map((w) => `<th scope="col">Ch ${w.chapter}</th>`).join("")}<th scope="col">Last played</th></tr>`;
    const table = (rows) => `<div class="adm-scroll"><table class="adm lg-tab"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    if (!isLec) {
      // the top 10, the player's own place, and the last 4 (everyone when 14 or fewer)
      const at = players.findIndex((d) => d.uid === me), n = players.length;
      const show = n <= 14 ? players.map((d, k) => [d, k]) : players.slice(0, 10).map((d, k) => [d, k]).concat(at >= 10 && at < n - 4 ? [[null, -1], [players[at], at]] : [], [[null, -1]], players.slice(n - 4).map((d, k) => [d, n - 4 + k]));
      const above = at > 0 ? players[at - 1].game.coins - players[at].game.coins : 0;
      host.innerHTML = `<div class="lg-mine">${at >= 0 ? `You: <strong>${medal(at)} of ${n}</strong> · ${players[at].game.coins} coins${at > 0 ? ` · ${above + 1} more to pass ${esc(label(players[at - 1]))}` : " · you're leading!"}` : "Play a station to join the leaderboard."}</div>
        ${n ? table(show.map(([d, k]) => (d ? row(d, k) : `<tr class="lg-gap"><td colspan="${cols}">⋯</td></tr>`)).join("")) : `<p class="adm-empty">Nobody has played yet. Be the first!</p>`}`;
      return;
    }
    const played = new Set(players.map((d) => String(d.matric)));
    const notYet = roster.filter((r) => !played.has(String(r.matric))).sort((a, b) => (a.name < b.name ? -1 : 1));
    host.innerHTML = `<div class="adm-tools"><button type="button" class="btn ghost small" data-bcsv>Download CSV</button></div>
      <p class="small-note">${players.length} playing · ${notYet.length} not started yet. Lecturer plays never appear here. A rude hero name? Tap <strong>Remove hero name</strong>: the player's nickname shows instead, and they are asked to choose another one.</p>
      ${players.length ? table(players.map((d, k) => row(d, k)).join("")) : `<p class="adm-empty">Nobody has played yet.</p>`}
      <h3 class="h3 lg-nyh">Not Started Yet (${notYet.length})</h3>${notYet.length ? `<ul class="lg-ny">${notYet.map((r) => `<li><a href="profile.html?e=${encodeURIComponent(r.id)}">${esc(r.name)}</a> <small>${esc(r.matric)} · ${esc(SECN[r.section] || "–")}</small></li>`).join("")}</ul>` : `<p class="small-note">Everyone has started. 🎉</p>`}`;
    $$("[data-rmname]", host).forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Removing…";
      try { await A.db.collection("meta").doc("heronames").set({ bans: { [b.dataset.rmname]: b.dataset.name } }, { merge: true }); BANS[b.dataset.rmname] = b.dataset.name; boardView(); }
      catch (e) { b.disabled = false; b.textContent = `Could not remove (${e.code || e})`; }
    }));
    $("[data-bcsv]", host).addEventListener("click", () => {
      const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
      const lines = [["Position", "Name", "Hero name", "Nickname", "Matric", "Section", "Rank", "Coins", "Stations cleared", "Bosses", "Stars", ...WORLDS.map((w) => `Chapter ${w.chapter}`), "Last played"].map(q).join(",")]
        .concat(players.map((d, k) => [k + 1, d.name || d.nickname, hname(d), d.nickname || "", d.matric, SECN[d.section] || "", ART.RANKS[ART.rankOf(d.game.coins || 0)].n, d.game.coins || 0, d.game.cleared || 0, d.game.bosses || 0, d.game.stars || 0, ...WORLDS.map((w) => (d.game.ch || {})[w.world] || 0), d.game.last ? d.game.last.slice(0, 10) : ""].map(q).join(",")))
        .concat(notYet.map((r) => ["", r.name, "", "", r.matric, SECN[r.section] || "", "Not started", 0, 0, 0, 0, ...WORLDS.map(() => 0), ""].map(q).join(",")));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `INSTRUMENTA leaderboard ${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  /* ---------- Credits (the About button): the logo, the Creator's character, the creator card, Zamm Studio™ ---------- */
  function aboutView() {
    frame(`<div class="lg-cr"><div class="lg-crin"><h2 class="vh">About INSTRUMENTA: Legends</h2>${ART.logo()}<span class="lg-tag">THE CREATOR</span>
      <svg class="lg-crhero" viewBox="-50 -82 168 168" role="img" aria-label="The Creator as a game character">${ART.heroSvg(ART.CREATOR, "", 2)}</svg>
      <div class="lg-crcard"><img src="assets/img/team/zamri.jpg" alt="" width="56" height="56"><div><b>Ts. Dr. Mohd Zamri Bin Zahir Ahmad</b><small>Course coordinator, NMK42003 Instrumentation<br>Faculty of Electronic Engineering &amp; Technology, UniMAP</small></div></div>
      ${ART.zamm(true)}
      <p class="lg-crab">INSTRUMENTA: Legends is an original game made for NMK42003 Instrumentation. Battle named enemies at every station, chapter by chapter, with Volt your helper drone, and grow from Apprentice to Legend of Measurement while you practise for your real examination.</p>
      <div class="lg-facts"><span>One world per chapter</span><span>3 stations each</span><span>Named enemies and bosses</span><span>Original art and music</span></div>
      <div class="lg-crbtns"><button type="button" class="lg-btn main" data-go="map">⚔️ Back to the game</button><button type="button" class="lg-btn alt" data-sharegame>📤 Share the game</button></div>
      <p class="lg-crcopy">© 2026 Zamm Studio™ · Ts. Dr. Mohd Zamri Bin Zahir Ahmad. All rights reserved. #INSTRUMENTALegends</p></div></div>`);
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
      title: `I defeated ${E.name}!`, enemySvg: E.svg, enemyScale: E.scale || 1, stars: "★".repeat(r.s || 0) + "☆".repeat(3 - (r.s || 0)), extra: r.boss ? `${r.mk}/${r.of} marks` : "Defeated ✓" },
      `I defeated ${E.name} in INSTRUMENTA: Legends, ${BY} Can you beat my score? #INSTRUMENTALegends #UniMAP ${SHARE_URL}`, "win");
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
    const m = m0, v = m.make(seeded(seed)), steps = m.steps, E = enemyOf(m), boss = E.boss;
    const HEARTS = boss ? 5 : 4, rk0 = ART.rankOf(totalCoins()), sc = (E.scale || 1) * 0.86;
    let i = 0, tries = 0, coins = 0, firstTry = 0, marks = 0, hearts = HEARTS, done = false, busy = false, tipLayer = null;
    const got = [], timers = [];
    if (saved) ({ i, tries, coins, firstTry, marks, hearts } = saved), (saved.got || []).forEach((x, k) => { got[k] = x; });
    const store = (push) => { if (!done) putSave(m.id, { w: w.world, seed, n: steps.length, i, tries, coins, firstTry, marks, hearts, got }, push); };
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); return t; };
    teardown.push(() => timers.forEach(clearTimeout));
    view = "battle";
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
          <g class="ms-tag"><g class="ms-tagIn"><rect x="-22" y="-62" width="98" height="22" rx="11" fill="#f0a830" stroke="#15243a" stroke-width="2"/><path d="M-4 -41 L2 -33 L8 -41 Z" fill="#f0a830" stroke="#15243a" stroke-width="2" stroke-linejoin="round"/><path d="M-3 -42 H7" stroke="#f0a830" stroke-width="3"/><text x="27" y="-47" font-size="12" font-weight="700" text-anchor="middle" fill="#15243a" font-family="IBM Plex Sans, sans-serif">I have a hint!</text></g></g></g>
        <g id="msSparks"></g></svg>
      <div class="ms-hud"><span class="ms-hearts" id="msHearts" aria-label="Hearts left"></span><span class="ms-sc"><span class="ms-coin"></span><b id="msSC">0</b><span class="vh"> coins this station</span></span></div>
      <div class="ms-ehud"><strong>${esc(E.name)}</strong><span class="ms-hpbar"><i id="msHp" style="background:${E.color}"></i></span></div>
      <div class="ms-banner" id="msBanner" aria-hidden="true"></div>
      <div class="ms-bubble" id="msBubble" role="dialog" aria-label="Volt's hint" aria-hidden="true"><button type="button" class="ms-x" aria-label="Close the hint">✕</button><div class="ms-bt"></div></div>
      <div class="ms-intro on" id="msIntro" role="button" tabindex="0" aria-label="Start the fight"><div class="ms-wcard${boss ? " boss" : ""}"><span>${boss ? "BOSS" : "WANTED"}</span>${portrait(E, "big")}<strong>${esc(E.name)}</strong>${E.taunt ? `<em>“${esc(E.taunt)}”</em>` : ""}<small>Chapter ${w.chapter} · Station ${mi + 1}${E.weak ? ` · Weakness: ${esc(E.weak)}` : ""}</small><b>Tap to fight</b></div></div>
      <div class="ms-over" id="msOver" hidden></div></div>
      <div class="ms-panel" id="msPanel"></div>`, true);
    const scene = $("#msScene"), panel = $("#msPanel"), H = $("#msHero"), M = $("#msMon"), tip = $("#msBubble"), VOLT = $("#msVolt");
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
    if (saved) { intro.classList.remove("on"); $("#msHp").style.width = `${100 * (steps.length - i) / steps.length}%`; later(() => banner(`Welcome back! Question ${i + 1} of ${steps.length}`), 300); }
    else later(startFight, boss ? 2600 : 2000);

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
      SFX.beep(); VOLT.classList.remove("alert");
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
        <p class="ms-ql">Question ${i + 1} of ${steps.length}${s.marks ? ` · ${s.marks} marks` : ""}</p><p class="ms-step">${q}</p>
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
    function strike() {   // the hero's attack, with the chosen weapon
      if (hero.weapon === "sword") { replay(H, "atk", 450); SFX.sword(); later(() => replay($("#msSlash"), "cut", 350), 200); }
      else { replay(H, "recoil", 300); SFX[hero.weapon](); later(() => replay($(`.ms-shot[data-w="${hero.weapon}"]`), "fly", 380), 60); }
    }
    function answer(ok, raw, sign) {
      if (busy || done) return;
      busy = true; startFight(); closeTip();
      $$("button, input", panel).forEach((b) => { b.disabled = true; });
      const s = steps[i];
      strike();
      if (ok) {
        const c = tries === 0 ? 10 : tries === 1 ? 6 : 3;
        if (tries === 0) firstTry++;
        if (s.marks) marks += s.marks * (tries === 0 ? 1 : tries === 1 ? 0.5 : 0.25);
        got[i] = raw; tries = 0; VOLT.classList.remove("alert"); coins += c;
        const left = steps.length - i - 1;
        later(() => {
          replay(M, "hit", 400); SFX.hit();
          $("#msHp").style.width = `${Math.max(0, 100 * left / steps.length)}%`;
          pop(c === 10 ? "Critical!" : "Hit!", 73, 28, "#b3261e"); banner(s.choice ? "Correct!" : `Correct: ${fmtAns(s, v)}`);
          later(() => { paintCoins(); pop(`+${c}`, 12, 16, "#b86e00", "coin"); SFX.coin(); }, 250);
        }, 470);
        i++;
        if (i < steps.length) store();
        if (i < steps.length) later(() => { busy = false; draw(s.choice ? "Correct! Next question." : `Correct! ${fmtAns(s, v)}. Next question.`, "ok"); }, 1000);
        else later(victory, 1350);
        return;
      }
      // wrong: the enemy's shield blocks the strike, then it strikes back
      tries++; hearts--;
      const lose = Math.min(2, coins); coins -= lose;
      if (hearts > 0) store();
      later(() => { replay($("#msShield"), "on", 900); SFX.clang(); pop("Blocked!", 73, 22, "#0f766e"); }, 380);
      later(() => { replay(M, "atk", 600); SFX.strike(); replay($("#msOrb"), "fire", 520); }, 950);
      later(() => {
        replay(H, "hurt", 600); SFX.hurt();
        paintHearts(); const hb = $(`#msHearts [data-h="${hearts}"]`); if (hb) replay(hb, "break", 700);
        if (lose) { paintCoins(); SFX.drop(); pop(`−${lose}`, 12, 16, "#b23b2e", "coin"); for (let k = 0; k < 3; k++) { const d = document.createElement("span"); d.className = "ms-cdrop"; d.style.left = `${22 + k * 3}%`; d.style.animationDelay = `${k * 0.08}s`; scene.appendChild(d); later(() => d.remove(), 1200); } }
        banner(sign ? "Check the sign!" : lose ? `Ouch! −1 heart, −${lose} coins` : "Ouch! −1 heart");
      }, 1420);
      later(() => {
        if (hearts <= 0) return knockOut();
        busy = false;
        const why = sign ? "Right size, wrong sign. Is it above or below?" : "Not quite.";
        draw(`${why} ${tries <= 2 ? "Tap Volt, your drone, for a hint." : "Check your working with Volt's hints and try again."}`, "no");
        if (!s.choice) $("#msA").value = raw;
        if (tries <= 2) { VOLT.classList.add("alert"); SFX.beep(); }
      }, 1900);
    }
    function overlay(html) { const o = $("#msOver"); o.innerHTML = html; o.hidden = false; return o; }
    function knockOut() {
      done = true; closeTip(); clearSave(m.id);
      replay(H, "ko", 4000); SFX.ko();
      later(() => {
        const o = overlay(`<div class="ms-ko"><strong>Knocked out!</strong><p>${esc(E.name)} wins this round. Start the station again: every question, with new numbers.</p>
          <div class="ms-row ms-center"><button type="button" class="btn" data-again>Try again</button><button type="button" class="btn ghost" data-back-world>Back to the chapter</button></div></div>`);
        $("[data-again]", o).addEventListener("click", () => { SFX.click(); battle(w, mi); });
        $("[data-back-world]", o).addEventListener("click", () => { SFX.click(); go("world", true, w); });
        $("[data-again]", o).focus({ preventScroll: true });
        panel.innerHTML = `<p class="ms-msg no">Knocked out: no hearts left. Try the station again with new numbers.</p>`;
      }, 900);
    }
    function victory() {
      done = true; clearSave(m.id);
      replay(M, "faint", 5000); SFX.faint();
      $("#msSparks").innerHTML = [0, 1, 2, 3, 4].map((k) => `<circle class="ms-spark" cx="${430 + k * 20}" cy="${150 + (k % 2) * 30}" r="10" fill="#ffd34d" style="animation-delay:${k * 0.1}s"/>`).join("");
      later(() => { replay(H, "cheer", 2100); SFX.win(); }, 700);
      const st = firstTry === steps.length ? 3 : firstTry >= steps.length - 1 ? 2 : 1;
      const bonus = (st === 3 ? 10 : 0) + (boss ? 50 : 0), total = coins + bonus, mk = Math.round(marks * 2) / 2;
      const before = best()[m.id];
      saveBest(w, m, { c: total, s: st, mk });
      winData = { kind: "win", coins: total, where: `CHAPTER ${w.chapter} · STATION ${mi + 1}${boss ? " · BOSS" : ""}`, title: `I defeated ${E.name}!`, enemySvg: E.svg, enemyScale: E.scale || 1,
        stars: "★".repeat(st) + "☆".repeat(3 - st), extra: boss ? `${mk}/${m.marks || 30} marks` : `${firstTry}/${steps.length} first try` };
      const rk1 = ART.rankOf(totalCoins()), nextM = w.missions[mi + 1] && missionOpen(w, mi + 1) ? w.missions[mi + 1] : null;
      later(() => {
        const nb = before && before.c >= total ? `Your best is still ${before.c} coins.` : before ? "A new best!" : "";
        panel.innerHTML = `<div class="ms-win"><p class="ms-step" style="font-size:1.2rem">${boss ? "Boss defeated!" : "Station cleared!"} ${esc(E.name)} is fixed.</p>
          <div class="ms-big">${stars(st)}</div>
          <p>You earned <strong>${total} coins</strong>${bonus ? ` (with a ${bonus}-coin bonus)` : ""}. ${firstTry} of ${steps.length} questions right on the first try. ${nb}</p>
          ${boss ? `<p class="ms-mock">Boss score: <strong>${mk} / ${m.marks || 30}</strong> <span class="small-note">(full marks for a first-try answer, half after one hint, a quarter after that)</span></p>` : ""}</div>
          <div class="ms-working"><p><strong>Full working</strong> (compare with your paper)</p>${steps.map((s, k) => `<p><strong>${esc(asQuestion(val(s.q, v)))}</strong><br>${s.choice ? `Answer: ${esc(val(s.choice, v)[s.correct])}${s.why ? `<br><span class="small-note">${esc(val(s.why, v))}</span>` : ""}` : `${esc(s.formula)}<br>${esc(s.sub(v))} = <strong>${esc(fmtAns(s, v))}</strong>`}${got[k] && !s.choice ? ` <span class="small-note">(you: ${esc(got[k])})</span>` : ""}</p>`).join("")}</div>
          <div class="ms-row ms-center">${nextM ? `<button type="button" class="btn" data-next>Next: face ${esc(enemyOf(nextM).name)} ›</button><button type="button" class="btn ghost" data-back-world>Back to the chapter</button>` : `<button type="button" class="btn" data-back-world>Back to the chapter</button>`}<button type="button" class="btn ghost" data-again>Fight again (new numbers)</button><button type="button" class="btn ghost" data-sharewin>📤 Share my win</button></div>`;
        $("[data-again]", panel).addEventListener("click", () => { SFX.click(); battle(w, mi); });
        $("[data-back-world]", panel).addEventListener("click", () => { SFX.click(); go("world", true, w); });
        if (nextM) $("[data-next]", panel).addEventListener("click", () => { SFX.click(); battle(w, mi + 1); });
        $("[data-sharewin]", panel).addEventListener("click", () => { SFX.click(); winShare(); });
        ($("[data-next]", panel) || $("[data-back-world]", panel)).focus({ preventScroll: true });
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
      if (MUS) MUS.setMood(rk);
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
    const flush = () => { if (document.hidden && !done && (i > 0 || tries > 0) && A && A.push) A.push(); };
    document.addEventListener("visibilitychange", flush); teardown.push(() => document.removeEventListener("visibilitychange", flush));
    draw();
  }

  /* ---------- clicks and the music volume ---------- */
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
  const viewOf = (s, w) => (["room", "board", "about"].includes(s.mview) ? s.mview : w ? "world" : "map");
  function gate(html) { page.innerHTML = `<div class="ms-gate">${html}</div>`; }
  async function start(st) {
    if (!st.ready) return;
    if (!st.user) { gate(`<p><strong>Sign in to play.</strong> INSTRUMENTA: Legends is for NMK42003 students: sign in with your studentmail account.</p><button type="button" class="btn" id="msIn">Sign in with Google</button>`); $("#msIn").addEventListener("click", () => A.signIn()); return; }
    isLec = A.isAdmin(st.user.email);
    const db = A.db;
    let released = false;
    try { const d = await db.collection("meta").doc("missions").get(); released = !!(d.exists && d.data().released); } catch (e) { /* rules not published yet */ }
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
    go(viewOf(hs, w), false, w);
    if (window.NMKBack) NMKBack.view({ mview: view, mworld: openWorld ? openWorld.world : null }, true);
  }
  document.addEventListener("nmk:synced", () => { const h = parse(lsGet("nmk-hero"), null); if (h && String(h.at || "") > String(hero.at || "")) hero = Object.assign({}, HERO0, h); if (WORLDS.length && view !== "battle" && !(view === "room" && roomUnsaved && roomUnsaved())) go(view, false); });
  if (window.NMKBack) NMKBack.onView((s) => { const w = s.mworld ? WORLDS.find((x) => x.world === s.mworld) : null; go(viewOf(s, w), false, w); });
  let booted = false;
  const boot = () => { if (booted) return; booted = true; A = window.NMKAccount; if (!A) { gate(`<p>The game needs the course account system, which didn't load. Please reload the page.</p>`); return; } A.on((st) => { if (st.ready) start(st); }); };
  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
