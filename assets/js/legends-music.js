/* INSTRUMENTA: Legends (missions.html): soft background music, made in the browser (no music files, nothing to
   download, no licence). Slow ambient pads, a low bass note and a gentle, sparse melody through a soft echo and reverb.
   Each rank's world has its own mood. Off until the player turns it on; missions.js shares its AudioContext with it. */
(function () {
  "use strict";
  // root note (MIDI), tempo, four chords (semitones from the root) and the melody's scale
  const MAJ = [0, 2, 4, 7, 9], MIN = [0, 3, 5, 7, 10];
  const MOODS = [
    { root: 60, bpm: 64, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]], scale: MAJ },     // Lab at Dawn: warm, C major
    { root: 57, bpm: 68, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]], scale: MIN },      // Circuit City: dusk, A minor
    { root: 62, bpm: 62, prog: [[0, 4, 7, 14], [5, 9, 12, 16], [-3, 0, 4, 9], [-5, -1, 2, 7]], scale: MAJ },     // Signal Ocean: D major, open
    { root: 64, bpm: 58, prog: [[0, 3, 7, 14], [5, 9, 12, 15], [0, 3, 7, 10], [-2, 2, 5, 9]], scale: MIN },      // Data Sky: night, E dorian
    { root: 65, bpm: 70, prog: [[0, 4, 7, 11], [2, 6, 9, 14], [-3, 0, 4, 7], [-7, -3, 0, 4]], scale: MAJ }       // Neon Realm: F lydian, bright
  ];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let getCtx = null, ctx = null, out = null, send = null, echo = null, on = false, vol = 0.5, mood = 0, timer = 0, next = 0, bar = 0;

  function build() {
    ctx = getCtx();
    out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    out.connect(lp).connect(ctx.destination);
    // reverb: a decaying noise impulse
    const len = Math.floor(ctx.sampleRate * 3.2), imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const rev = ctx.createConvolver(); rev.buffer = imp;
    const wet = ctx.createGain(); wet.gain.value = 0.42;
    send = ctx.createGain(); send.gain.value = 1;
    send.connect(rev).connect(wet).connect(out);
    // a soft echo for the melody
    echo = ctx.createDelay(1.5); const fb = ctx.createGain(); fb.gain.value = 0.32; const eg = ctx.createGain(); eg.gain.value = 0.5;
    echo.connect(fb).connect(echo); echo.connect(eg).connect(out); eg.connect(send);
  }
  function voice(f, t, len, type, peak, att, rel, toEcho) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setValueAtTime(peak, t + Math.max(att, len - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out); g.connect(send); if (toEcho) g.connect(echo);
    o.start(t); o.stop(t + len + 0.05);
  }
  function playBar(t) {
    const M = MOODS[mood], beat = 60 / M.bpm, L = beat * 4, ch = M.prog[bar % 4];
    echo.delayTime.setValueAtTime(beat * 0.75, t);
    ch.forEach((n, k) => { const f = hz(M.root - 12 + n); voice(f, t, L + 1.4, "sine", 0.028, 1.4, 1.6, false); voice(f * 1.003, t + 0.02 * k, L + 1.4, "triangle", 0.012, 1.6, 1.6, false); });
    voice(hz(M.root - 24 + ch[0]), t, L, "sine", 0.05, 0.4, 1.2, false);
    for (let e = 0; e < 8; e++) {
      if (Math.random() > (e % 2 ? 0.16 : 0.34)) continue;
      const deg = M.scale[Math.floor(Math.random() * M.scale.length)], oct = Math.random() > 0.7 ? 24 : 12;
      voice(hz(M.root + deg + oct - 12), t + e * beat / 2, 1.6, "sine", 0.03, 0.012, 1.4, true);
    }
  }
  function tick() {
    if (!on || !ctx) return;
    while (next < ctx.currentTime + 1.2) { playBar(next); next += (60 / MOODS[mood].bpm) * 4; bar++; }
  }
  const api = {
    init(fn) { getCtx = fn; },
    get on() { return on; },
    start() {
      if (on || !getCtx) return;
      try { if (!ctx) build(); if (ctx.state === "suspended") ctx.resume(); } catch (e) { return; }
      on = true; next = ctx.currentTime + 0.15; bar = 0;
      out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setValueAtTime(out.gain.value, ctx.currentTime); out.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2.5);
      tick(); clearInterval(timer); timer = setInterval(tick, 250);
    },
    stop() {
      if (!on) return;
      on = false; clearInterval(timer);
      try { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setValueAtTime(out.gain.value, ctx.currentTime); out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); } catch (e) { /* closed */ }
    },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (on && ctx) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(vol, ctx.currentTime, 0.2); } },
    setMood(m) { mood = Math.max(0, Math.min(MOODS.length - 1, m | 0)); },
    // quieter for a moment under the battle sounds
    duck() { if (!on || !ctx) return; const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(vol * 0.35, t + 0.06); out.gain.linearRampToValueAtTime(vol, t + 0.9); }
  };
  window.NMKLegendsMusic = api;
})();
