/* INSTRUMENTA: Legends (missions.html): background music, made in the browser (no music files, nothing to download, no
   licence). Calm but catchy: a soft beat, a repeating 4-bar melody hook, chords, a moving bass line. Three styles
   (lo-fi chill, gentle synthwave, soft chiptune); each rank's world has its own key, chords and tempo. missions.js
   shares its AudioContext with it, starts it at the player's first tap (browsers block sound before that) and ducks it
   under the battle sounds. _source/Missions/music-preview.html plays every style and world for choosing. */
(function () {
  "use strict";
  const MAJ = [0, 2, 4, 7, 9], MIN = [0, 3, 5, 7, 10];
  // each world: root (MIDI), tempo change, four chords (semitones from the root), pentatonic scale for the melody
  const MOODS = [
    { name: "Lab at Dawn", root: 60, bpm: 0, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]], scale: MAJ },
    { name: "Circuit City", root: 57, bpm: 2, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]], scale: MIN },
    { name: "Signal Ocean", root: 62, bpm: -2, prog: [[0, 4, 7, 14], [5, 9, 12, 16], [-3, 0, 4, 9], [-5, -1, 2, 7]], scale: MAJ },
    { name: "Data Sky", root: 64, bpm: -4, prog: [[0, 3, 7, 14], [5, 9, 12, 15], [0, 3, 7, 10], [-2, 2, 5, 9]], scale: MIN },
    { name: "Neon Realm", root: 65, bpm: 6, prog: [[0, 4, 7, 11], [2, 6, 9, 14], [-3, 0, 4, 7], [-7, -3, 0, 4]], scale: MAJ }
  ];
  // the hook: [eighth note 0-31 across 4 bars, scale step (5 = an octave up), length in eighths]
  const HOOKS = {
    lofi: [[0, 4, 2], [2, 3, 1], [3, 2, 1], [4, 1, 3], [8, 2, 2], [10, 4, 2], [12, 3, 3], [16, 4, 2], [18, 5, 1], [19, 4, 1], [20, 3, 2], [22, 2, 2], [24, 1, 3], [28, 2, 4]],
    synth: [[0, 0, 1], [1, 2, 1], [2, 4, 2], [4, 5, 2], [6, 4, 2], [8, 3, 3], [12, 2, 2], [14, 3, 2], [16, 4, 1], [17, 5, 1], [18, 6, 2], [20, 5, 2], [22, 4, 2], [24, 3, 4], [28, 2, 2], [30, 1, 2]],
    chip: [[0, 2, 1], [1, 4, 1], [2, 5, 1], [3, 4, 1], [4, 2, 2], [6, 3, 2], [8, 4, 1], [9, 5, 1], [10, 7, 2], [12, 5, 4], [16, 2, 1], [17, 4, 1], [18, 5, 1], [19, 7, 1], [20, 6, 2], [22, 5, 2], [24, 4, 2], [26, 3, 2], [28, 2, 4]]
  };
  const STYLES = {
    lofi: { label: "Lo-fi chill", bpm: 86, swing: 0.12 },
    synth: { label: "Gentle synthwave", bpm: 94, swing: 0 },
    chip: { label: "Soft chiptune", bpm: 104, swing: 0 }
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const step = (sc, i) => sc[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
  let getCtx = null, ctx = null, out = null, verb = null, echo = null, noiseBuf = null;
  let on = false, vol = 0.6, mood = 0, style = "lofi", timer = 0, next = 0, bar = 0;

  function build() {
    ctx = getCtx();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    out = ctx.createGain(); out.gain.value = 0; out.connect(comp).connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2.4), imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const rev = ctx.createConvolver(); rev.buffer = imp; const wet = ctx.createGain(); wet.gain.value = 0.3;
    verb = ctx.createGain(); verb.connect(rev).connect(wet).connect(out);
    echo = ctx.createDelay(1.5); const fb = ctx.createGain(); fb.gain.value = 0.28; const eg = ctx.createGain(); eg.gain.value = 0.35;
    echo.connect(fb).connect(echo); echo.connect(eg).connect(out); eg.connect(verb);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  // one note: oscillator(s) → optional filter → envelope → out (+ reverb, + echo)
  function note(f, t, len, o) {
    const g = ctx.createGain(), peak = o.g, at = Math.min(o.a || 0.01, len * 0.9), d = Math.max(at + 0.005, Math.min(o.d || len, len));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * (o.sus || 0.0001)), t + d);
    if (o.sus) g.gain.setValueAtTime(peak * o.sus, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + (o.r || 0.08));
    let last = g;
    if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.setValueAtTime(o.lp, t); if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + len); g.connect(fl); last = fl; }
    last.connect(out); if (o.rev) last.connect(verb); if (o.echo) last.connect(echo);
    (o.osc || ["sine"]).forEach((type, k) => {
      const x = ctx.createOscillator(); x.type = type; x.frequency.value = f * (k ? (o.mult || 2) : 1); x.detune.value = k ? (o.det || 0) : 0;
      const xg = ctx.createGain(); xg.gain.value = k ? (o.mix || 0.3) : 1; x.connect(xg).connect(g); x.start(t); x.stop(t + len + (o.r || 0.08) + 0.05);
    });
  }
  function drum(kind, t, g) {
    if (kind === "kick") {
      const x = ctx.createOscillator(), e = ctx.createGain(); x.frequency.setValueAtTime(120, t); x.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); x.connect(e).connect(out); x.start(t); x.stop(t + 0.32); return;
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain(); s.buffer = noiseBuf;
    if (kind === "snare") { f.type = "bandpass"; f.frequency.value = 1700; f.Q.value = 0.8; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); }
    else { f.type = "highpass"; f.frequency.value = 7000; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.045); }
    s.connect(f).connect(e); e.connect(out); if (kind === "snare") e.connect(verb); s.start(t); s.stop(t + 0.2);
  }
  function playBar(t) {
    const M = MOODS[mood], S = STYLES[style], bpm = S.bpm + M.bpm, beat = 60 / bpm, e8 = beat / 2, ch = M.prog[bar % 4];
    const at = (i) => t + i * e8 + (i % 2 ? S.swing * beat : 0);   // eighth i of the bar, with swing
    echo.delayTime.setValueAtTime(beat * 0.75, t);
    const root = M.root, hookBar = bar % 8 < 4, hook = HOOKS[style], i0 = (bar % 4) * 8;
    if (style === "lofi") {
      [0, 3].forEach((i) => ch.forEach((n) => note(hz(root - 12 + n), at(i), i ? beat * 2.4 : beat * 1.4, { osc: ["sine", "triangle"], mult: 2, mix: 0.18, g: 0.032, d: beat * 2, lp: 2400, rev: true })));
      [[0, 0], [3, 0], [5, 7], [6, 0]].forEach(([i, iv]) => note(hz(root - 24 + ch[0] + iv), at(i), e8 * 1.6, { osc: ["triangle"], g: 0.09, d: e8 * 1.6, lp: 600 }));
      [0, 5].forEach((i) => drum("kick", at(i), 0.32)); [2, 6].forEach((i) => drum("snare", at(i), 0.07));
      for (let i = 0; i < 8; i++) drum("hat", at(i), i % 2 ? 0.018 : 0.03);
      if (hookBar) hook.filter(([p]) => p >= i0 && p < i0 + 8).forEach(([p, d, l]) => note(hz(root + step(M.scale, d)), at(p - i0), e8 * l, { osc: ["triangle", "sine"], mult: 2, mix: 0.25, g: 0.05, d: e8 * l, rev: true, echo: true }));
      else if (Math.random() < 0.6) note(hz(root + 12 + step(M.scale, Math.floor(Math.random() * 5))), at(Math.floor(Math.random() * 4) * 2), beat, { osc: ["sine"], g: 0.03, d: beat * 1.5, rev: true, echo: true });
    } else if (style === "synth") {
      ch.forEach((n) => note(hz(root - 12 + n), t, beat * 4, { osc: ["sawtooth", "sawtooth"], mult: 1, det: 9, mix: 1, g: 0.012, a: beat, sus: 0.8, r: beat, lp: 900, rev: true }));
      for (let i = 0; i < 8; i++) note(hz(root - 24 + ch[0] + (i % 4 === 3 ? 12 : 0)), at(i), e8 * 0.9, { osc: ["sawtooth"], g: 0.05, d: e8 * 0.9, lp: 700 });
      for (let i = 0; i < 16; i++) note(hz(root + ch[i % 4] + (i % 8 > 3 ? 12 : 0)), t + i * e8 / 2, e8 / 2, { osc: ["square"], g: 0.012, d: e8 / 2, lp: 1800, lp2: 1100, echo: true });
      [0, 2, 4, 6].forEach((i) => drum("kick", at(i), 0.28)); [2, 6].forEach((i) => drum("snare", at(i), 0.08)); for (let i = 1; i < 8; i += 2) drum("hat", at(i), 0.025);
      if (hookBar) hook.filter(([p]) => p >= i0 && p < i0 + 8).forEach(([p, d, l]) => note(hz(root + step(M.scale, d)), at(p - i0), e8 * l, { osc: ["square", "sawtooth"], mult: 1, det: 7, mix: 0.5, g: 0.022, d: e8 * l, sus: 0.5, lp: 2200, rev: true, echo: true }));
    } else {
      [0, 2, 4, 6].forEach((i) => note(hz(root - 24 + ch[0] + (i === 6 ? 7 : 0)), at(i), e8 * 1.5, { osc: ["triangle"], g: 0.1, d: e8 * 1.5 }));
      for (let i = 0; i < 16; i++) note(hz(root + ch[i % 3]), t + i * e8 / 2, e8 / 2.2, { osc: ["square"], g: 0.009, d: e8 / 2.2 });
      [0, 4].forEach((i) => drum("kick", at(i), 0.2)); for (let i = 0; i < 8; i++) drum("hat", at(i), i % 2 ? 0.014 : 0.024); drum("snare", at(4), 0.04);
      if (hookBar) hook.filter(([p]) => p >= i0 && p < i0 + 8).forEach(([p, d, l]) => note(hz(root + step(M.scale, d)), at(p - i0), e8 * l, { osc: ["square"], g: 0.03, d: e8 * l, sus: 0.6, echo: true }));
      else hook.filter(([p]) => p >= i0 && p < i0 + 8 && p % 2 === 0).forEach(([p, d]) => note(hz(root - 12 + step(M.scale, d)), at(p - i0), e8, { osc: ["triangle"], g: 0.04, d: e8 }));
    }
  }
  function tick() {
    if (!on || !ctx) return;
    while (next < ctx.currentTime + 0.8) { playBar(next); next += (60 / (STYLES[style].bpm + MOODS[mood].bpm)) * 4; bar++; }
  }
  const api = {
    STYLES, MOODS,
    init(fn) { getCtx = fn; },
    get on() { return on; },
    get style() { return style; },
    start() {
      if (on || !getCtx) return;
      try { if (!ctx) build(); if (ctx.state === "suspended") ctx.resume(); } catch (e) { return; }
      on = true; next = ctx.currentTime + 0.12; bar = 0;
      out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setValueAtTime(out.gain.value, ctx.currentTime); out.gain.linearRampToValueAtTime(vol, ctx.currentTime + 1.5);
      tick(); clearInterval(timer); timer = setInterval(tick, 200);
    },
    stop() {
      if (!on) return;
      on = false; clearInterval(timer);
      try { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setValueAtTime(out.gain.value, ctx.currentTime); out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6); } catch (e) { /* closed */ }
    },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (on && ctx) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(vol, ctx.currentTime, 0.2); } },
    setMood(m) { mood = Math.max(0, Math.min(MOODS.length - 1, m | 0)); },
    setStyle(s) { if (STYLES[s]) style = s; },
    // quieter for a moment under the battle sounds
    duck() { if (!on || !ctx) return; const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(vol * 0.35, t + 0.06); out.gain.linearRampToValueAtTime(vol, t + 0.9); }
  };
  window.NMKLegendsMusic = api;
})();
