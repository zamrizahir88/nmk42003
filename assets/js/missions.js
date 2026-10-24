/* INSTRUMENTA: Legends (missions.html): a battle game for practising each chapter. Each chapter has three stations,
   each guarded by a named enemy; the third is the boss (the tough level, scored in marks like an exam question).
   The questions are not in this file. A lecturer uploads each chapter's file on the dashboard (admin.html); it is kept
   in Firestore missions/{world N} and only lecturers, or signed-in students after the lecturer releases the game
   (meta/missions.released), can read it. This file is the engine: map, My Character, battle, Volt the helper drone,
   answer checking, coins, hearts, ranks, sound and music. The art is in legends-art.js, the music in legends-music.js.
   A right answer strikes the enemy and earns coins; a wrong one is blocked by the enemy's shield, the enemy strikes
   back (one heart lost) and 2 coins drop (never below 0). No hearts left: the station starts again with new numbers.
   Saved in this browser (and synced by account.js): nmk-missions (best result of each station), nmk-hero (the
   character). nmk-msnd (sound), nmk-mus and nmk-musv (music on/off and volume) stay on this device. */
(function () {
  "use strict";
  const page = document.getElementById("missions");
  if (!page || typeof COURSE === "undefined") return;
  const ART = window.NMKLegendsArt, MUS = window.NMKLegendsMusic;
  if (!ART) { page.innerHTML = `<p class="small-note">The game didn't load. Please reload the page.</p>`; return; }
  const $ = (s, r = page) => r.querySelector(s), $$ = (s, r = page) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
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

  /* ---------- sound effects and music: made in the browser (no files) ---------- */
  let soundOn = lsGet("nmk-msnd") !== "0", musicOn = lsGet("nmk-mus") === "1", musicVol = +(lsGet("nmk-musv") || 60), ac = null;
  const actx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); return ac; };
  if (MUS) { MUS.init(actx); MUS.setVolume(musicVol / 100); }
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
    $$("[data-mus]").forEach((b) => { b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "♪ Music on" : "♪ Music off"; });
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
  const HERO0 = { look: "m", hairM: "spiky", hairF: "long", face: "none", head: "none", eyes: "none", hair: HAIRS[0], skin: SKINS[0], color: COLORS[0], tud: TUDUNG[0], weapon: "sword" };
  let hero = Object.assign({}, HERO0, parse(lsGet("nmk-hero"), {}));
  // weapon upgrades are earned: journey level 3 makes it glow; a defeated boss makes it gold ("Calibrated")
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
  const fmtAns = (s, v) => `${s.ans(v).toFixed(s.dp)}${val(s.unit, v) ? ` ${val(s.unit, v)}` : ""}`;

  /* ---------- unlocking: a chapter opens in the week it is lectured; a station after the one before it ---------- */
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

  /* ---------- the page frame: the stage (rank, coins, music) and the views ---------- */
  function tools() {
    return `<span class="ms-pill"><span class="ms-coin"></span><strong id="msCoins">${totalCoins()}</strong><span class="vh"> coins</span></span>
      <button type="button" class="lg-btn" data-mus aria-pressed="${musicOn}">${musicOn ? "♪ Music on" : "♪ Music off"}</button>
      <input type="range" class="lg-vol" min="0" max="100" step="5" value="${musicVol}" aria-label="Music volume"${musicOn ? "" : " hidden"}>
      <button type="button" class="lg-btn" data-snd aria-pressed="${soundOn}">${soundOn ? "🔊 Sound on" : "🔇 Sound off"}</button>`;
  }
  function frame(body, battleView) {
    const coins = totalCoins(), rk = ART.rankOf(coins), R = ART.RANKS[rk], nx = ART.RANKS[rk + 1];
    if (MUS) MUS.setMood(rk);
    const lec = isLec ? `<div class="ms-lec">${A.released ? "Released: students can play." : "<strong>Not released yet:</strong> only lecturers can see this page."} Lecturer plays are saved on this device only and never appear on the board. <a href="admin.html">Release or upload on the dashboard ›</a></div>` : "";
    const stage = battleView ? `<div class="lg-mini"><strong class="lg-mlogo">INSTRUMENTA</strong><span class="lg-mrank">${esc(R.n)}</span><span class="ms-sp"></span>${tools()}</div>`
      : `<div class="lg-stage">${ART.bg(rk)}<div class="lg-hud">
          <div class="lg-logo"><span>INSTRUMENTA</span><em>Legends</em></div>
          <div class="lg-rank"><span class="lg-rk">Rank ${rk + 1} of ${ART.RANKS.length} · ${esc(R.scene)}</span><strong>${esc(R.n)}</strong>
            <span class="lg-bar" role="progressbar" aria-label="Progress to the next rank" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}"><i style="width:${nx ? Math.round(((coins - R.min) / (nx.min - R.min)) * 100) : 100}%"></i></span>
            <small>${nx ? `${nx.min - coins} more coins to ${esc(nx.n)}` : "Top rank reached. Legendary!"}</small></div>
          <div class="lg-tools">${tools()}<button type="button" class="lg-btn" data-go="room">My Character</button></div></div></div>`;
    page.innerHTML = `${lec}${stage}<div id="msView">${body}</div>`;
  }
  function go(v, push = true, w = openWorld) {
    cleanup();
    view = v; openWorld = w;
    if (push && window.NMKBack) NMKBack.view({ mview: v, mworld: w ? w.world : null });
    if (v === "room") return room();
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
          ${open ? `<button type="button" class="btn${r ? " ghost" : ""}" data-play="${i}">${r ? "Fight again" : "Fight"}</button>` : `<span class="lg-lock">🔒 ${worldOpen(w) ? `Defeat ${esc(enemyOf(prev).name)} first` : `Opens ${fmtDay(opensOn(w).iso)}`}</span>`}</div>`;
      }).join("")}</div>`);
  }

  /* ---------- My Character ---------- */
  function room() {
    const row = (key, label, list) => `<div class="ms-opt" data-row="${key}"><p class="ms-ol">${label}</p><div class="ms-row">${list.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}">${l}</button>`).join("")}</div></div>`;
    const sw = (key, label, list) => `<div class="ms-opt" data-row="${key}"><p class="ms-ol">${label}</p><div class="ms-row">${list.map((c) => `<button type="button" class="ms-sw" data-k="${key}" data-v="${c}" aria-label="${label} ${c}" style="background:${c}"></button>`).join("")}</div></div>`;
    const t = tier(), rk = ART.rankOf(totalCoins());
    frame(`<p><button type="button" class="btn ghost small" data-go="map">‹ All chapters</button></p><h2 class="h3">My Character</h2><p class="small-note">Change it any time. It's saved to your account.</p>
      <div class="ms-mk"><div class="ms-pv"><div class="ms-pvs">${ART.bg(rk)}<svg id="msPv" viewBox="-62 -82 144 150" aria-label="Your character"></svg></div><button type="button" class="btn ghost small" data-try>Try the attack</button>
          <p class="small-note">Weapon: <strong>${["Basic", "Charged (glowing)", "Calibrated (gold)"][t]}</strong>. ${t < 2 ? (t < 1 ? "Reach journey level 3 to charge it; defeat a boss to make it gold." : "Defeat a boss to make it gold.") : "Earned by defeating a boss."}</p></div>
        <div>${row("look", "Look", OPT.look)}${row("hairM", "Hair", OPT.hairM)}${row("hairF", "Hair", OPT.hairF)}${sw("hair", "Hair colour", HAIRS)}${row("face", "Facial hair", OPT.face)}${row("head", "Headwear", OPT.head)}${sw("tud", "Tudung colour", TUDUNG)}${row("eyes", "Eyewear", OPT.eyes)}${sw("skin", "Skin tone", SKINS)}${sw("color", "Jacket colour", COLORS)}${row("weapon", "Weapon", OPT.weapon)}<p class="small-note" id="msWn"></p></div></div>`);
    const vis = { hairM: () => hero.look === "m", face: () => hero.look === "m", hairF: () => hero.look === "f", hair: () => hero.look !== "t", head: () => hero.look !== "t", tud: () => hero.look === "t" };
    const paint = () => {
      $("#msPv").innerHTML = ART.heroSvg(hero, "msPvh", t);
      $$("[data-k]").forEach((b) => b.setAttribute("aria-pressed", hero[b.dataset.k] === b.dataset.v));
      $$("[data-row]").forEach((r) => { r.hidden = vis[r.dataset.row] ? !vis[r.dataset.row]() : false; });
      $("#msWn").textContent = NOTE[hero.weapon];
    };
    $$("[data-k]").forEach((b) => b.addEventListener("click", () => { hero[b.dataset.k] = b.dataset.v; SFX.click(); lsSet("nmk-hero", JSON.stringify(hero)); document.dispatchEvent(new CustomEvent("nmk:store", { detail: "nmk-hero" })); paint(); }));
    $("[data-try]").addEventListener("click", () => { const g = $("#msPvh"); g.classList.remove("cheer"); void g.getBoundingClientRect(); g.classList.add("cheer"); SFX[hero.weapon](); });
    paint();
  }

  /* ---------- a station: the battle ---------- */
  const heartSvg = (full, k) => `<svg class="lg-heart${full ? "" : " gone"}" viewBox="0 0 24 22" aria-hidden="true" data-h="${k}"><path d="M12 21 L3 12 A5.5 5.5 0 0 1 12 4.5 A5.5 5.5 0 0 1 21 12 Z" fill="${full ? "#e5484d" : "#d7dce3"}" stroke="#1b2a4a" stroke-width="2" stroke-linejoin="round"/>${full ? `<path d="M7 9 q1.5 -2.5 4 -2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>` : ""}</svg>`;
  function battle(w, mi) {
    cleanup();
    const m = w.missions[mi], v = m.make(Math.random), steps = m.steps, E = enemyOf(m), boss = E.boss;
    const HEARTS = boss ? 5 : 4, rk0 = ART.rankOf(totalCoins()), sc = (E.scale || 1) * 0.86;
    let i = 0, tries = 0, coins = 0, firstTry = 0, marks = 0, hearts = HEARTS, done = false, busy = false, tipLayer = null;
    const got = [], timers = [];
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
    later(startFight, boss ? 2600 : 2000);

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
    const order = steps.map((s) => { if (!s.choice) return null; const n = val(s.choice, v).length, o = [...Array(n).keys()]; for (let k = n - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; } return o; });

    function draw(msg = "", cls = "") {
      const s = steps[i], q = esc(val(s.q, v)), u = val(s.unit, v);
      panel.innerHTML = `<div class="ms-track">${steps.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>
        <p class="ms-step">Question ${i + 1} of ${steps.length}${s.marks ? ` · ${s.marks} marks` : ""} · ${q}</p>
        ${s.choice ? `<div class="ms-choices" role="group" aria-label="${q}">${order[i].map((k) => `<button type="button" class="btn ghost" data-c="${k}">${esc(val(s.choice, v)[k])}</button>`).join("")}</div>`
          : `<form class="ms-row" id="msF" novalidate><input type="text" id="msA" inputmode="decimal" autocomplete="off" aria-label="${q}" placeholder="Your answer"><span>${esc(u)}</span><button class="btn">Attack</button></form>`}
        <p class="ms-msg ${cls}" id="msMsg" aria-live="polite">${msg}</p>
        <p class="ms-story">${esc(val(m.story, v))}</p>${data ? `<div class="ms-data">${data.map((d) => `<span>${esc(d)}</span>`).join("")}</div>` : ""}
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
        got[i] = raw; tries = 0; VOLT.classList.remove("alert");
        later(() => {
          replay(M, "hit", 400); SFX.hit();
          $("#msHp").style.width = `${Math.max(0, 100 * (steps.length - i - 1) / steps.length)}%`;
          pop(c === 10 ? "Critical!" : "Hit!", 73, 28, "#b3261e"); banner(s.choice ? "Correct!" : `Correct: ${fmtAns(s, v)}`);
          later(() => { coins += c; paintCoins(); pop(`+${c}`, 12, 16, "#b86e00", "coin"); SFX.coin(); }, 250);
        }, 470);
        i++;
        if (i < steps.length) later(() => { busy = false; draw(s.choice ? "Correct! Next question." : `Correct! ${fmtAns(s, v)}. Next question.`, "ok"); }, 1000);
        else later(victory, 1350);
        return;
      }
      // wrong: the enemy's shield blocks the strike, then it strikes back
      tries++;
      later(() => { replay($("#msShield"), "on", 900); SFX.clang(); pop("Blocked!", 73, 22, "#0f766e"); }, 380);
      later(() => { replay(M, "atk", 600); SFX.strike(); replay($("#msOrb"), "fire", 520); }, 950);
      later(() => {
        replay(H, "hurt", 600); SFX.hurt();
        hearts--; paintHearts(); const hb = $(`#msHearts [data-h="${hearts}"]`); if (hb) replay(hb, "break", 700);
        const lose = Math.min(2, coins);
        if (lose) { coins -= lose; paintCoins(); SFX.drop(); pop(`−${lose}`, 12, 16, "#b23b2e", "coin"); for (let k = 0; k < 3; k++) { const d = document.createElement("span"); d.className = "ms-cdrop"; d.style.left = `${22 + k * 3}%`; d.style.animationDelay = `${k * 0.08}s`; scene.appendChild(d); later(() => d.remove(), 1200); } }
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
      done = true; closeTip();
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
      done = true;
      replay(M, "faint", 5000); SFX.faint();
      $("#msSparks").innerHTML = [0, 1, 2, 3, 4].map((k) => `<circle class="ms-spark" cx="${430 + k * 20}" cy="${150 + (k % 2) * 30}" r="10" fill="#ffd34d" style="animation-delay:${k * 0.1}s"/>`).join("");
      later(() => { replay(H, "cheer", 2100); SFX.win(); }, 700);
      const st = firstTry === steps.length ? 3 : firstTry >= steps.length - 1 ? 2 : 1;
      const bonus = (st === 3 ? 10 : 0) + (boss ? 50 : 0), total = coins + bonus, mk = Math.round(marks * 2) / 2;
      const before = best()[m.id];
      saveBest(w, m, { c: total, s: st, mk });
      const rk1 = ART.rankOf(totalCoins());
      later(() => {
        const nb = before && before.c >= total ? `Your best is still ${before.c} coins.` : before ? "A new best!" : "";
        panel.innerHTML = `<div class="ms-win"><p class="ms-step" style="font-size:1.2rem">${boss ? "Boss defeated!" : "Station cleared!"} ${esc(E.name)} is fixed.</p>
          <div class="ms-big">${stars(st)}</div>
          <p>You earned <strong>${total} coins</strong>${bonus ? ` (with a ${bonus}-coin bonus)` : ""}. ${firstTry} of ${steps.length} questions right on the first try. ${nb}</p>
          ${boss ? `<p class="ms-mock">Boss score: <strong>${mk} / ${m.marks || 30}</strong> <span class="small-note">(full marks for a first-try answer, half after one hint, a quarter after that)</span></p>` : ""}</div>
          <div class="ms-working"><p><strong>Full working</strong> (compare with your paper)</p>${steps.map((s, k) => `<p><strong>${esc(val(s.q, v))}</strong><br>${s.choice ? `Answer: ${esc(val(s.choice, v)[s.correct])}${s.why ? `<br><span class="small-note">${esc(val(s.why, v))}</span>` : ""}` : `${esc(s.formula)}<br>${esc(s.sub(v))} = <strong>${esc(fmtAns(s, v))}</strong>`}${got[k] && !s.choice ? ` <span class="small-note">(you: ${esc(got[k])})</span>` : ""}</p>`).join("")}</div>
          <div class="ms-row ms-center"><button type="button" class="btn" data-again>Fight again (new numbers)</button><button type="button" class="btn ghost" data-back-world>Back to the chapter</button></div>`;
        $("[data-again]", panel).addEventListener("click", () => { SFX.click(); battle(w, mi); });
        $("[data-back-world]", panel).addEventListener("click", () => { SFX.click(); go("world", true, w); });
        const cp = $("#msCoins"); if (cp) cp.textContent = totalCoins();
        if (rk1 > rk0) rankUp(rk1);
      }, 1600);
    }
    function rankUp(rk) {
      const R = ART.RANKS[rk];
      const old = $(".lg-bg", scene); if (old) old.outerHTML = ART.bg(rk);
      if (MUS) MUS.setMood(rk);
      SFX.rankup();
      const o = overlay(`<div class="ms-rank"><span>RANK UP!</span><strong>${esc(R.n)}</strong><p>Welcome to ${esc(R.scene)}.</p><button type="button" class="btn" data-okrank>Continue</button></div>`);
      $("[data-okrank]", o).addEventListener("click", () => { o.hidden = true; });
      $("[data-okrank]", o).focus({ preventScroll: true });
      $(".lg-mrank") && ($(".lg-mrank").textContent = R.n);
    }
    draw();
  }

  /* ---------- clicks and the music volume ---------- */
  page.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-snd")) { soundOn = !soundOn; lsSet("nmk-msnd", soundOn ? "1" : "0"); $$("[data-snd]").forEach((x) => { x.setAttribute("aria-pressed", soundOn); x.textContent = soundOn ? "🔊 Sound on" : "🔇 Sound off"; }); SFX.click(); return; }
    if (b.hasAttribute("data-mus")) { setMusic(!musicOn); return; }
    if (b.dataset.go) { SFX.click(); return go(b.dataset.go); }
    if (b.dataset.world) { const w = WORLDS.find((x) => x.world === +b.dataset.world); if (w && worldOpen(w)) { SFX.click(); go("world", true, w); } return; }
    if (b.dataset.play) { SFX.click(); battle(openWorld, +b.dataset.play); }
  });
  page.addEventListener("input", (e) => {
    if (!e.target.matches(".lg-vol")) return;
    musicVol = +e.target.value; lsSet("nmk-musv", String(musicVol)); if (MUS) MUS.setVolume(musicVol / 100);
    $$(".lg-vol").forEach((r) => { if (r !== e.target) r.value = musicVol; });
  });

  /* ---------- start: who may play, and loading the chapter files ---------- */
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
    const hs = history.state || {};
    const w = hs.mworld ? WORLDS.find((x) => x.world === hs.mworld) : null;
    go(hs.mview === "room" ? "room" : w ? "world" : "map", false, w);
    if (window.NMKBack) NMKBack.view({ mview: view, mworld: openWorld ? openWorld.world : null }, true);
  }
  if (window.NMKBack) NMKBack.onView((s) => { const w = s.mworld ? WORLDS.find((x) => x.world === s.mworld) : null; go(s.mview === "room" ? "room" : w ? "world" : "map", false, w); });
  let booted = false;
  const boot = () => { if (booted) return; booted = true; A = window.NMKAccount; if (!A) { gate(`<p>The game needs the course account system, which didn't load. Please reload the page.</p>`); return; } A.on((st) => { if (st.ready) start(st); }); };
  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
