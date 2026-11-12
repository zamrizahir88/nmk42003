/* NMK42003 Chapter 5: Signal Conditioning (Amplifiers & Filters)
   Circuit sections and exercises. The calculator, diagram, Bode plot and exercise engine is in lab.js.
   Ideal op-amp throughout. */
(function () {
  "use strict";

  const { TAU, MINUS, num, eng, P, PN, dB, fmtDb, same, n, F, D, step, crossing, player, axes, poly, svg } = Lab;
  const RAIL_DROP = 1.5; // op-amp output saturates at ±(Vcc − 1.5 V)
  const VCC = () => F("Vcc", "Vcc", 15, null, {
    label: "Supply rails ±V<sub>CC</sub>",
    validate: (si) => (si <= RAIL_DROP ? "Must be more than 1.5 V so the output has room to swing." : null)
  });

  /* =====================================================================
     Shared calculation steps
     ===================================================================== */
  function saturation(vout, vcc, steps, notes, extra = "") {
    const lim = vcc - RAIL_DROP, over = Math.abs(vout) > lim * (1 + 1e-9), clip = Math.sign(vout) * lim;
    steps.push(step("Saturation check",
      `Output limit = ±(${n("Vcc")} − 1.5 V)`,
      `= ±(${eng(vcc, "V")} − 1.5 V)`,
      `= ±${eng(lim, "V")}. ` + (over
        ? `|${n("Vout")}| = ${eng(Math.abs(vout), "V")} is above this, so a real op-amp clips at <strong>${eng(clip, "V")}</strong>.`
        : `|${n("Vout")}| = ${eng(Math.abs(vout), "V")} is within the limit, so the ideal answer holds.`)));
    if (over) notes.push({
      type: "warn", title: "Output saturates",
      html: `The ideal answer is ${n("Vout")} = ${eng(vout, "V")}, but with ±${eng(vcc, "V")} supply rails the op-amp output can only swing to about ±${eng(lim, "V")}. A real circuit would clip at <strong>${eng(clip, "V")}</strong>. Reduce the gain or the input to stay in the linear region.${extra}`
    });
    return over;
  }

  const gainDbStep = (vout, vin) => step("Gain in decibels",
    `Gain = 20 log<sub>10</sub>(${n("Vout")} / ${n("Vin")})`,
    `= 20 log<sub>10</sub>(${eng(vout, "V")} / ${eng(vin, "V")})`,
    `= ${fmtDb(dB(vout / vin))}`);

  function bandNote(f, fc, pass, slope = 20) {
    const r = f / fc, inPass = pass === "low" ? r < 1 : r > 1;
    const where = Math.abs(Math.log10(r)) < 0.02
      ? `right at the cut-off, where the output is 0.707 of the pass-band value (${MINUS}3 dB)`
      : inPass
        ? "in the pass band, so most of the signal gets through"
        : `in the stop band, so the signal is attenuated. Far from f<sub>c</sub> it drops by about ${slope} dB for every tenfold change in frequency`;
    return { type: "info", title: "Where f sits", html: `f = ${eng(f, "Hz")} is ${r < 1 ? "below" : "above"} f<sub>c</sub> = ${eng(fc, "Hz")}: ${where}.` };
  }

  /* =====================================================================
     Oscilloscope: input and output waveforms for every circuit
     ===================================================================== */
  const cx = (re, im) => ({ re, im });
  const cmag = (z) => Math.hypot(z.re, z.im), carg = (z) => Math.atan2(z.im, z.re);
  const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const LPr = (r) => cdiv(cx(1, 0), cx(1, r)), HPr = (r) => cdiv(cx(0, r), cx(1, r)); // first-order low- and high-pass, r = f / fc
  const clipTo = (x, L) => Math.max(-L, Math.min(L, x));
  const railOf = (v) => v.Vcc - RAIL_DROP;
  const KEY = { "trace-in": "key input", "trace-d": "key digital", "trace-a": "key" };

  // Amplifiers: the input is shown as a 1 kHz sine whose peak is Vin
  const ampWave = (gain) => (v) => {
    const G = gain(v), L = railOf(v), A = v.Vin, w = TAU * 1000, clipped = Math.abs(G * A) > L;
    return { period: 1e-3, rails: L, traces: [
      { fn: (t) => A * Math.sin(w * t), cls: "trace-in", label: "input" },
      { fn: (t) => clipTo(G * A * Math.sin(w * t), L), cls: "trace-a", label: "output" }],
      note: `The input is drawn as a 1 kHz sine with a peak of ${eng(Math.abs(A), "V")}. ` +
        (clipped ? `The ideal output peak would be ${eng(Math.abs(G * A), "V")}, but it is <strong>clipped flat at ±${eng(L, "V")}</strong>: the op-amp is saturating.` :
          G < 0 ? `The output is ${num(Math.abs(G))} times bigger and <strong>upside down</strong> (180° out of phase).` :
            Math.abs(G - 1) < 1e-9 ? "The output sits exactly on top of the input: gain 1, no inversion." : `The output is ${num(G)} times bigger and <strong>in phase</strong> with the input.`) };
  };
  // Filters: complex gain H(f) gives the output's size and phase
  const filtWave = (H, clip) => (v) => {
    const z = H(v, v.f), m = cmag(z), ph = carg(z), A = v.Vin, w = TAU * v.f, L = clip ? railOf(v) : null;
    const deg = Math.abs((ph * 180) / Math.PI), dt = Math.abs(ph) / w;
    return { period: 1 / v.f, rails: L, traces: [
      { fn: (t) => A * Math.sin(w * t), cls: "trace-in", label: "input" },
      { fn: (t) => { const y = A * m * Math.sin(w * t + ph); return L ? clipTo(y, L) : y; }, cls: "trace-a", label: "output" }],
      note: `At ${eng(v.f, "Hz")} the output is <strong>${num(m, 3)} ×</strong> the input` + (deg < 0.5 ? " and in phase with it." : ` and ${ph < 0 ? "<strong>lags</strong> behind" : "<strong>leads</strong>"} it by ${num(deg, 3)}° (${eng(dt, "s", 3)}).`) +
        (L && A * m > L ? ` It is clipped at ±${eng(L, "V")}: the op-amp saturates.` : "") };
  };
  const WAVES = {
    follower: ampWave(() => 1),
    inverting: ampWave((v) => -v.Rf / v.R1),
    noninv: ampWave((v) => 1 + v.Rf / v.R1),
    diff: (v) => {
      const L = railOf(v), h = v.Vcm || 0, w = TAU * 50, hum = (t) => h * Math.sin(w * t);
      const run = (a, b) => ((a * v.R2) / (v.R1 + v.R2)) * (1 + v.R4 / v.R3) - (b * v.R4) / v.R3;
      const leak = Math.abs(run(v.V1 + 1, v.V2 + 1) - run(v.V1, v.V2)) > 1e-9;
      return { period: 0.02, rails: L, traces: [
        { fn: (t) => v.V1 + hum(t), cls: "trace-in", label: "V₁" },
        { fn: (t) => v.V2 + hum(t), cls: "trace-d", label: "V₂" },
        { fn: (t) => clipTo(run(v.V1 + hum(t), v.V2 + hum(t)), L), cls: "trace-a", label: "output" }],
        note: !h ? "Enter a common-mode offset V<sub>cm</sub> above: it is shown here as 50 Hz mains hum added equally to both inputs."
          : leak ? `Both inputs carry the same 50 Hz hum (peak ${eng(h, "V")}), and some of it <strong>leaks into the output</strong> because the resistors are not matched.`
            : `Both inputs carry the same 50 Hz hum (peak ${eng(h, "V")}), yet the output is a <strong>flat line</strong>: only the difference V<sub>1</sub> − V<sub>2</sub> is amplified, so the hum is rejected.` };
    },
    rclpf: filtWave((v, f) => LPr(f * TAU * v.R * v.C)),
    rchpf: filtWave((v, f) => HPr(f * TAU * v.R * v.C)),
    rllpf: filtWave((v, f) => LPr((f * TAU * v.L) / v.R)),
    rc2: filtWave((v, f) => { const a = v.R1 * v.C1 * v.R2 * v.C2, b = v.R1 * v.C1 + v.R2 * v.C2 + v.R1 * v.C2, w = TAU * f; return cdiv(cx(1, 0), cx(1 - w * w * a, w * b)); }),
    active: filtWave((v, f) => { const r = f * TAU * v.R * v.C, G = v.mode === "noninv" ? 1 + v.Rf / v.Rg : 1, z = v.type === "hp" ? HPr(r) : LPr(r); return cx(G * z.re, G * z.im); }, true),
    bandpass: filtWave((v, f) => cmul(HPr(f * TAU * v.R1 * v.C1), LPr(f * TAU * v.R2 * v.C2))),
    bandstop: filtWave((v, f) => { const x = f * TAU * v.R * v.C; return cdiv(cx(1 - x * x, 0), cx(1 - x * x, 4 * x)); })
  };
  function scopeRender(extra, res, v) {
    const sec = this;
    sec.scopeData = res && WAVES[sec.id] ? WAVES[sec.id](v, res) : null;
    if (!extra.dataset.ready) {
      extra.dataset.ready = "1";
      extra.innerHTML = `<h4 class="sub-h">Oscilloscope: Input and Output</h4><div class="scope-box"></div><div class="pv-pl"></div><p class="small-note scope-note"></p>`;
      sec.scopePl = player(extra.querySelector(".pv-pl"), extra, { dur: 4, hold: 0, auto: false, still: 0, label: "Oscilloscope sweep", draw: (t) => drawScope(sec, extra, t) });
    }
    sec.scopePl.redraw();
  }
  function drawScope(sec, extra, t) {
    const d = sec.scopeData, box = extra.querySelector(".scope-box"), note = extra.querySelector(".scope-note");
    if (!d) { box.innerHTML = ""; note.innerHTML = ""; return; }
    const T0 = d.period, span = 2 * T0, off = (t / 4) * T0, N = 240;
    let ymax = 0;
    d.traces.forEach((tr) => { for (let i = 0; i <= 60; i++) ymax = Math.max(ymax, Math.abs(tr.fn((i / 60) * T0))); });
    if (d.rails && d.rails < ymax * 1.6) ymax = Math.max(ymax, d.rails); // show the rails only when the signal gets near them
    ymax = ymax > 0 ? ymax * 1.15 : 1;
    const wide = box.clientWidth > 640;
    const A = axes({ x: [0, span], y: [-ymax, ymax], xt: wide ? [0, T0 / 2, T0, 1.5 * T0, span] : [0, T0, span], fx: (q) => eng(q, "s", 3), yt: [-ymax / 1.15, 0, ymax / 1.15], fy: (q) => eng(q, "V", 3), l: 62, r: 24, xl: "Time", yl: "", W: wide ? 760 : 360, H: wide ? 240 : 220 });
    let g = A.s + `<line class="gl" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(0)}" y2="${A.Y(0)}"/>`;
    if (d.rails && d.rails < ymax) [d.rails, -d.rails].forEach((r) => { g += `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(r)}" y2="${A.Y(r)}"/>`; });
    d.traces.forEach((tr) => { const pts = []; for (let i = 0; i <= N; i++) { const x = (i / N) * span; pts.push([A.X(x), A.Y(tr.fn(x + off))]); } g += poly(pts, tr.cls); });
    box.innerHTML = svg(A.W, A.H, "Oscilloscope: input and output against time", g) +
      `<p class="legend">${d.traces.map((tr) => `<span><span class="${KEY[tr.cls]}"></span>${tr.label}</span>`).join(" ")}${d.rails && d.rails < ymax ? ' <span><span class="key ref-key"></span>rail limit</span>' : ""}</p>`;
    note.innerHTML = d.note;
  }

  /* =====================================================================
     Overview animation: why signals need conditioning
     ===================================================================== */
  function mountWhy(el) {
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene cond" viewBox="0 0 664 230" role="img" aria-label="A thermocouple gives a few millivolts with 50 hertz hum; an amplifier multiplies it by 500; a low-pass filter removes the hum; the ESP32 reads a clean 0 to 3 volt signal."></svg></div></figure><div class="pv-pl"></div><p class="pv-read"></p></div>`;
    const sv = el.querySelector("svg"), read = el.querySelector(".pv-read");
    const scopeAt = (x0, title, sub, fn, amp) => {
      let s = `<rect class="scope" x="${x0}" y="60" width="120" height="90" rx="6"/>`;
      const pts = []; for (let i = 0; i <= 80; i++) { const u = i / 80; pts.push([x0 + 6 + u * 108, 140 - Math.max(0, Math.min(1, fn(u) / amp)) * 70]); }
      return s + poly(pts, "scope-t") + T(x0 + 60, 48, title, "middle", "tt sm") + T(x0 + 60, 172, sub, "middle", "small");
    };
    const draw = (t) => {
      const slow = (u) => 2.5 + 1.8 * Math.sin(TAU * (u * 0.6 + t / 8)), hum = (u) => 1.2 * Math.sin(TAU * 9 * u + t * 6);
      const mV = slow(0.5).toFixed(1);
      let s = `<rect class="bx" x="6" y="80" width="54" height="50" rx="8"/>${T(33, 100, "thermo-", "middle", "small")}${T(33, 114, "couple", "middle", "small")}`;
      s += `<line class="flow-l" x1="60" y1="105" x2="76" y2="105"/>`;
      s += scopeAt(78, "Sensor", "a few mV + 50 Hz hum", (u) => slow(u) + hum(u), 6);
      s += `<line class="flow-l" x1="198" y1="105" x2="212" y2="105"/><path class="op" d="M212,80L262,105L212,130Z"/>${T(232, 110, "×500", "middle", "small")}${T(237, 150, "amplifier", "middle", "small")}<line class="flow-l" x1="262" y1="105" x2="276" y2="105"/>`;
      s += scopeAt(276, "Amplified", "0 to 3 V, hum too", (u) => (slow(u) + hum(u)) * 0.5, 3.3);
      s += `<line class="flow-l" x1="396" y1="105" x2="408" y2="105"/><rect class="bx" x="408" y="84" width="54" height="42" rx="6"/>${T(435, 102, "low-", "middle", "small")}${T(435, 116, "pass", "middle", "small")}<line class="flow-l" x1="462" y1="105" x2="476" y2="105"/>`;
      s += scopeAt(476, "Filtered", "clean, ready for the ADC", (u) => slow(u) * 0.5, 3.3);
      s += `<rect class="espbig" x="606" y="80" width="54" height="50" rx="6"/>${T(633, 110, "ESP32", "middle", "small inv")}<line class="flow-l" x1="596" y1="105" x2="606" y2="105"/>`;
      s += T(332, 214, `now: sensor ${mV} mV → amplified ${(mV * 0.5).toFixed(2)} V → ADC code ${Math.round((mV * 0.5 * 4095) / 3.3)}`, "middle", "small");
      sv.innerHTML = s;
    };
    read.innerHTML = "A thermocouple gives only a few millivolts, with 50 Hz mains hum on top. The ESP32 needs a clean signal between 0 and 3.3 V. <strong>Signal conditioning</strong> fixes both: an <strong>amplifier</strong> makes the signal big enough, and a <strong>filter</strong> removes the noise. This chapter covers both.";
    player(el.querySelector(".pv-pl"), el, { dur: 8, hold: 0, draw, still: 2, label: "Signal animation position" });
  }
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;

  /* =====================================================================
     Circuits
     ===================================================================== */
  const AMP_VIEW = "0 0 520 230";
  const FILT_VIEW = "0 0 520 200";

  const SECTIONS = [
    /* ---------------- Voltage follower ---------------- */
    {
      id: "follower", group: "amp", title: "Voltage Follower", view: AMP_VIEW,
      intro: `<p>The output is wired straight back to the inverting (−) input, so the op-amp drives its output until it equals the input: ${n("Vout")} = ${n("Vin")} and the gain is exactly 1. It is also called a unity-gain buffer.</p>
        <p>It doesn't make the voltage any bigger. Its job is <strong>isolation</strong>. Its very high input impedance means it draws almost no current from the source, and its very low output impedance means it can supply current to the next stage without the source voltage sagging. Use it between a high-impedance sensor (a pH probe, a potentiometer, an RC filter) and whatever reads it.</p>`,
      inputs: [F("Vin", "V", 2, "input voltage"), VCC()],
      diagram: (T) => D.opamp(270, 120, true) +
        D.term(95, 100) + T(87, 104, "Vin", "end") + D.wire([99, 100], [270, 100]) +
        D.wire([270, 140], [240, 140], [240, 185], [390, 185], [390, 120]) + D.dot(390, 120) +
        D.wire([350, 120], [471, 120]) + D.term(475, 120) + T(398, 108, "Vout", "start"),
      compute(v) {
        const steps = [], notes = [];
        steps.push(step("Gain", `${n("Av")} = 1 + ${n("Rf")} / ${n("R1")}, with ${n("Rf")} = 0 and ${n("R1")} = ∞`, "= 1 + 0", `${n("Av")} = 1`));
        steps.push(step("Output voltage", `${n("Vout")} = ${n("Av")} × ${n("Vin")}`, `= 1 × ${P(v.Vin, "V")}`, `${n("Vout")} = ${eng(v.Vin, "V")}`));
        const over = saturation(v.Vin, v.Vcc, steps, notes);
        return { steps, notes, vout: v.Vin, over, sum: `${n("Av")} = 1, ${n("Vout")} = ${eng(v.Vin, "V")}` };
      },
      after: `<div class="callout note"><strong>In practice</strong>A real follower's output is very slightly different from its input, and it can never go beyond the supply rails.</div>`
    },

    /* ---------------- Inverting ---------------- */
    {
      id: "inverting", group: "amp", title: "Inverting Amplifier", view: AMP_VIEW,
      intro: `<p>The input goes through ${n("R1")} into the inverting (−) input, and ${n("Rf")} feeds the output back to the same point. The + input is grounded. The gain depends only on the two resistors, ${n("Av")} = −${n("Rf")} / ${n("R1")}, so it is accurate and doesn't depend on the op-amp's very large open-loop gain.</p>
        <p>The minus sign means the output is inverted: a positive input gives a negative output. If ${n("Rf")} &gt; ${n("R1")} the signal is amplified. If ${n("Rf")} &lt; ${n("R1")} it is made smaller. If ${n("Rf")} = ${n("R1")} you get a unity-gain inverter (${n("Vout")} = −${n("Vin")}). It is used to scale sensor signals and, with several input resistors, to add signals together.</p>`,
      inputs: [F("Vin", "V", 1, "input voltage"), F("R1", "R", 10e3, "input resistor"), F("Rf", "R", 47e3, "feedback resistor"), VCC()],
      diagram: (T) => D.opamp(270, 120, false) +
        D.term(95, 100) + T(87, 104, "Vin", "end") + D.wire([99, 100], [130, 100]) + D.res(130, 100, 200, 100) + T(165, 86, "R1") +
        D.wire([200, 100], [270, 100]) + D.dot(235, 100) +
        D.wire([235, 100], [235, 45], [260, 45]) + D.res(260, 45, 330, 45) + T(295, 31, "Rf") + D.wire([330, 45], [390, 45], [390, 120]) + D.dot(390, 120) +
        D.wire([270, 140], [245, 140], [245, 165]) + D.gnd(245, 165) +
        D.wire([350, 120], [471, 120]) + D.term(475, 120) + T(398, 108, "Vout", "start"),
      compute(v) {
        const steps = [], notes = [];
        const Av = -v.Rf / v.R1, vout = Av * v.Vin;
        steps.push(step("Gain", `${n("Av")} = −${n("Rf")} / ${n("R1")}`, `= −${eng(v.Rf, "Ω")} / ${eng(v.R1, "Ω")}`, `${n("Av")} = ${num(Av)}`));
        steps.push(step("Output voltage", `${n("Vout")} = ${n("Av")} × ${n("Vin")}`, `= ${PN(Av)} × ${P(v.Vin, "V")}`, `${n("Vout")} = ${eng(vout, "V")}`));
        if (same(v.Rf, v.R1)) notes.push({ type: "info", title: "Unity-gain inverter", html: `With ${n("Rf")} = ${n("R1")} the gain is −1, so ${n("Vout")} = −${n("Vin")}: the same size with the opposite sign. This is also called an inverting buffer.` });
        else if (v.Rf < v.R1) notes.push({ type: "info", title: "Gain below 1", html: `${n("Rf")} is smaller than ${n("R1")}, so |${n("Av")}| &lt; 1 and the output is smaller than the input.` });
        const over = saturation(vout, v.Vcc, steps, notes);
        return { steps, notes, vout, over, sum: `${n("Av")} = ${num(Av)}, ${n("Vout")} = ${eng(vout, "V")}` };
      }
    },

    /* ---------------- Non-inverting ---------------- */
    {
      id: "noninv", group: "amp", title: "Non-Inverting Amplifier", view: AMP_VIEW,
      intro: `<p>The input goes into the non-inverting (+) input. ${n("Rf")} and ${n("R1")} form a divider that feeds a fraction of the output back to the − input, and the op-amp drives its output until that fraction equals ${n("Vin")}. The gain is ${n("Av")} = 1 + ${n("Rf")} / ${n("R1")}. It is always at least 1, and the output has the same sign as the input.</p>
        <p>The very high input impedance of the + input is kept, so this is the usual choice for amplifying a weak sensor voltage without loading the sensor. With a load ${n("RL")}, the op-amp supplies both the load current ${n("IL")} and the small current ${n("I1")} through the feedback resistors.</p>`,
      inputs: [F("Vin", "V", 1, "input voltage"), F("R1", "R", 10e3, "resistor to ground"), F("Rf", "R", 47e3, "feedback resistor"), F("RL", "R", null, "load resistor (optional)", { opt: true }), VCC()],
      diagram: (T, lab) => D.opamp(270, 120, true) +
        D.term(95, 100) + T(87, 104, "Vin", "end") + D.wire([99, 100], [270, 100]) +
        D.wire([270, 140], [200, 140]) + D.dot(240, 140) + D.res(200, 140, 200, 200) + D.gnd(200, 200) + T(190, 174, "R1", "end") +
        D.wire([240, 140], [240, 185], [275, 185]) + D.res(275, 185, 345, 185) + T(310, 212, "Rf") + D.wire([345, 185], [390, 185], [390, 120]) + D.dot(390, 120) +
        D.wire([350, 120], [471, 120]) + D.term(475, 120) + T(398, 108, "Vout", "start") +
        (lab.RL ? D.dot(430, 120) + D.res(430, 120, 430, 190) + D.gnd(430, 190) + T(440, 160, "RL", "start") : ""),
      compute(v) {
        const steps = [], notes = [];
        const Av = 1 + v.Rf / v.R1, vout = Av * v.Vin;
        steps.push(step("Gain", `${n("Av")} = 1 + ${n("Rf")} / ${n("R1")}`, `= 1 + ${eng(v.Rf, "Ω")} / ${eng(v.R1, "Ω")}`, `${n("Av")} = ${num(Av)}`));
        steps.push(step("Output voltage", `${n("Vout")} = ${n("Av")} × ${n("Vin")}`, `= ${num(Av)} × ${P(v.Vin, "V")}`, `${n("Vout")} = ${eng(vout, "V")}`));
        let extra = "";
        if (v.RL) {
          const IL = vout / v.RL, I1 = vout / (v.R1 + v.Rf), Io = IL + I1;
          steps.push(step("Load current", `${n("IL")} = ${n("Vout")} / ${n("RL")}`, `= ${P(vout, "V")} / ${eng(v.RL, "Ω")}`, `${n("IL")} = ${eng(IL, "A")}`));
          steps.push(step("Feedback current", `${n("I1")} = ${n("Vout")} / (${n("R1")} + ${n("Rf")})`, `= ${P(vout, "V")} / (${eng(v.R1, "Ω")} + ${eng(v.Rf, "Ω")})`, `${n("I1")} = ${eng(I1, "A")}`));
          steps.push(step("Op-amp output current", `${n("Io")} = ${n("IL")} + ${n("I1")}`, `= ${eng(IL, "A")} + ${P(I1, "A")}`, `${n("Io")} = ${eng(Io, "A")}`));
          const lim = Math.sign(vout) * (v.Vcc - RAIL_DROP);
          extra = ` The currents above use the ideal ${n("Vout")}. With clipping, ${n("IL")} would be about ${eng(lim / v.RL, "A")}.`;
        }
        const over = saturation(vout, v.Vcc, steps, notes, extra);
        return { steps, notes, vout, over, sum: `${n("Av")} = ${num(Av)}, ${n("Vout")} = ${eng(vout, "V")}${v.RL ? `, ${n("IL")} = ${eng(vout / v.RL, "A")}` : ""}` };
      }
    },

    /* ---------------- Differential ---------------- */
    {
      id: "diff", group: "amp", title: "Differential Amplifier", view: AMP_VIEW,
      intro: `<p>A differential amplifier amplifies the <em>difference</em> between two inputs. ${n("V1")} reaches the + input through the divider ${n("R1")}, ${n("R2")}. ${n("V2")} reaches the − input through ${n("R3")}, with ${n("R4")} as the feedback resistor.</p>
        <p>Work it out by <strong>superposition</strong>. First find the output due to ${n("V1")} alone (${n("V2")} grounded), then the output due to ${n("V2")} alone (${n("V1")} grounded), and add them. When ${n("R1")} = ${n("R3")} and ${n("R2")} = ${n("R4")}, this simplifies to ${n("Vout")} = (${n("R2")} / ${n("R1")})(${n("V1")} − ${n("V2")}). Anything common to both inputs then cancels, such as interference picked up equally on two sensor wires. That's why this circuit is used with strain-gauge bridges and thermocouples. Try the common-mode offset input to see it.</p>`,
      inputs: [F("V1", "V", 2.5, "to the + side"), F("V2", "V", 2, "to the − side"), F("R1", "R", 10e3), F("R2", "R", 47e3), F("R3", "R", 10e3), F("R4", "R", 47e3, "feedback"),
        F("RL", "R", null, "load resistor (optional)", { opt: true }), F("Vcm", "V", 2, "added to both V<sub>1</sub> and V<sub>2</sub>", { label: "Common-mode offset V<sub>cm</sub>" }), VCC()],
      diagram: (T, lab) => D.opamp(270, 120, false) +
        D.term(95, 100) + T(87, 104, "V2", "end") + D.wire([99, 100], [130, 100]) + D.res(130, 100, 200, 100) + T(165, 86, "R3") +
        D.wire([200, 100], [270, 100]) + D.dot(235, 100) +
        D.wire([235, 100], [235, 45], [260, 45]) + D.res(260, 45, 330, 45) + T(295, 31, "R4") + D.wire([330, 45], [390, 45], [390, 120]) + D.dot(390, 120) +
        D.term(95, 140) + T(87, 144, "V1", "end") + D.wire([99, 140], [130, 140]) + D.res(130, 140, 200, 140) + T(165, 166, "R1") +
        D.wire([200, 140], [270, 140]) + D.dot(245, 140) + D.res(245, 140, 245, 200) + D.gnd(245, 200) + T(255, 186, "R2", "start") +
        D.wire([350, 120], [471, 120]) + D.term(475, 120) + T(398, 108, "Vout", "start") +
        (lab.RL ? D.dot(430, 120) + D.res(430, 120, 430, 190) + D.gnd(430, 190) + T(440, 160, "RL", "start") : ""),
      compute(v) {
        const steps = [], notes = [];
        const run = (V1, V2) => {
          const Vp = V1 * v.R2 / (v.R1 + v.R2), Gp = 1 + v.R4 / v.R3, Vop = Vp * Gp, Vom = -V2 * v.R4 / v.R3;
          return { Vp, Gp, Vop, Vom, vout: Vop + Vom };
        };
        const d = run(v.V1, v.V2), vout = d.vout;
        steps.push(step("Voltage at the + input (divider)", `V<sub>+</sub> = ${n("V1")} × ${n("R2")} / (${n("R1")} + ${n("R2")})`, `= ${P(v.V1, "V")} × ${eng(v.R2, "Ω")} / (${eng(v.R1, "Ω")} + ${eng(v.R2, "Ω")})`, `V<sub>+</sub> = ${eng(d.Vp, "V")}`));
        steps.push(step("Non-inverting gain", `G<sub>+</sub> = 1 + ${n("R4")} / ${n("R3")}`, `= 1 + ${eng(v.R4, "Ω")} / ${eng(v.R3, "Ω")}`, `G<sub>+</sub> = ${num(d.Gp)}`));
        steps.push(step(`Output due to ${n("V1")}`, `V<sub>out+</sub> = V<sub>+</sub> × G<sub>+</sub>`, `= ${P(d.Vp, "V")} × ${num(d.Gp)}`, `V<sub>out+</sub> = ${eng(d.Vop, "V")}`));
        steps.push(step(`Output due to ${n("V2")}`, `V<sub>out−</sub> = ${n("V2")} × (−${n("R4")} / ${n("R3")})`, `= ${P(v.V2, "V")} × (−${eng(v.R4, "Ω")} / ${eng(v.R3, "Ω")})`, `V<sub>out−</sub> = ${eng(d.Vom, "V")}`));
        steps.push(step("Add the two (superposition)", `${n("Vout")} = V<sub>out+</sub> + V<sub>out−</sub>`, `= ${eng(d.Vop, "V")} + ${P(d.Vom, "V")}`, `${n("Vout")} = ${eng(vout, "V")}`));

        const matched = same(v.R1, v.R3) && same(v.R2, v.R4), Ad = v.R2 / v.R1, sc = Ad * (v.V1 - v.V2);
        if (matched) {
          steps.push(step(`Shortcut check (${n("R1")} = ${n("R3")}, ${n("R2")} = ${n("R4")})`,
            `${n("Vout")} = (${n("R2")} / ${n("R1")})(${n("V1")} − ${n("V2")})`,
            `= (${eng(v.R2, "Ω")} / ${eng(v.R1, "Ω")}) × (${P(v.V1, "V")} − ${P(v.V2, "V")})`,
            `= ${num(Ad)} × ${P(v.V1 - v.V2, "V")} = ${eng(sc, "V")}, the same as step 5. Differential gain A<sub>d</sub> = ${n("R2")} / ${n("R1")} = ${num(Ad)}.`));
        } else {
          notes.push({ type: "warn", title: "Shortcut does not apply",
            html: `The shortcut ${n("Vout")} = (${n("R2")} / ${n("R1")})(${n("V1")} − ${n("V2")}) only works when ${n("R1")} = ${n("R3")} and ${n("R2")} = ${n("R4")}. Here ${n("R1")} = ${eng(v.R1, "Ω")}, ${n("R3")} = ${eng(v.R3, "Ω")}, ${n("R2")} = ${eng(v.R2, "Ω")} and ${n("R4")} = ${eng(v.R4, "Ω")}, so the shortcut would give <strong>${eng(sc, "V")}</strong>, which is wrong. The correct value from superposition is <strong>${eng(vout, "V")}</strong>.` });
        }
        if (v.RL) steps.push(step("Load current", `${n("IL")} = ${n("Vout")} / ${n("RL")}`, `= ${P(vout, "V")} / ${eng(v.RL, "Ω")}`, `${n("IL")} = ${eng(vout / v.RL, "A")}`));

        if (v.Vcm) {
          const c = run(v.V1 + v.Vcm, v.V2 + v.Vcm);
          let dv = c.vout - vout;
          if (Math.abs(dv) < 1e-9 * Math.max(1, Math.abs(vout))) dv = 0;
          steps.push(step("Common-mode check",
            `Add ${n("Vcm")} to both inputs and repeat steps 1 to 5`,
            `${n("V1")} = ${eng(v.V1 + v.Vcm, "V")}, ${n("V2")} = ${eng(v.V2 + v.Vcm, "V")} → ${n("Vout")} = ${eng(c.vout, "V")}`,
            `Change in ${n("Vout")} = ${eng(dv, "V")}`));
          notes.push(dv === 0
            ? { type: "info", title: "Common-mode offset rejected", html: `Adding ${eng(v.Vcm, "V")} to both inputs leaves the output unchanged: only the difference ${n("V1")} − ${n("V2")} is amplified. Noise that appears equally on both sensor wires is removed the same way.` }
            : { type: "warn", title: "Common-mode signal leaks through", html: `Adding ${eng(v.Vcm, "V")} to both inputs changes the output by ${eng(dv, "V")}, a common-mode gain of ${num(dv / v.Vcm)}. Match ${n("R1")} = ${n("R3")} and ${n("R2")} = ${n("R4")} to reject it.` });
        }
        const over = saturation(vout, v.Vcc, steps, notes);
        return { steps, notes, vout, over, sum: `${matched ? `A<sub>d</sub> = ${num(Ad)}, ` : ""}${n("Vout")} = ${eng(vout, "V")}${v.RL ? `, ${n("IL")} = ${eng(vout / v.RL, "A")}` : ""}` };
      },
      after: `<div class="c5-hum"><span>🎧 Noise test (watch the oscilloscope):</span><button type="button" class="btn ghost small" data-hum="match">Matched resistors + 50 Hz hum</button><button type="button" class="btn ghost small" data-hum="mis">R<sub>4</sub> 10 % too big</button></div>
        <div class="callout info"><strong>Common mistake: brackets in the divider</strong>V<sub>+</sub> = ${n("V1")} × ${n("R2")} / (${n("R1")} + ${n("R2")}). Without the brackets, a calculator works out R<sub>2</sub>/R<sub>1</sub> + R<sub>2</sub>, which is wrong.</div>`
    },

    /* ---------------- Passive RC low-pass ---------------- */
    {
      id: "rclpf", group: "filt", toc: "RC Low-Pass", title: "Passive RC Low-Pass Filter (1st Order)", view: FILT_VIEW, bode: true,
      intro: `<p>R is in series and C sits across the output. At low frequencies the capacitor's reactance X<sub>C</sub> is large, so almost all of ${n("Vin")} appears across it. As frequency rises X<sub>C</sub> falls and the capacitor shorts more of the signal to ground. The circuit is a voltage divider whose ratio depends on frequency.</p>
        <p>It is used to remove high-frequency noise from slowly changing sensor signals (temperature, pressure) and as an anti-aliasing filter before an ADC. Above f<sub>c</sub> the output falls by 20 dB per decade.</p>`,
      inputs: [F("R", "R", 10e3), F("C", "C", 100e-9), F("Vin", "Vac", 5, "amplitude"), F("f", "f", 100, "signal frequency")],
      diagram: (T) => filterFrame(T) +
        D.wire([94, 60], [140, 60]) + D.res(140, 60, 210, 60) + T(175, 86, "R") + D.wire([210, 60], [466, 60]) +
        D.dot(290, 60) + D.cap(290, 60, 290, 160) + D.dot(290, 160) + T(306, 114, "C", "start"),
      compute(v) {
        const fc = 1 / (TAU * v.R * v.C), Xc = 1 / (TAU * v.f * v.C), Z = Math.hypot(v.R, Xc), ratio = Xc / Z, vout = v.Vin * ratio;
        const steps = [
          step("Cut-off frequency", "f<sub>c</sub> = 1 / (2π R C)", `= 1 / (2π × ${eng(v.R, "Ω")} × ${eng(v.C, "F")})`, `f<sub>c</sub> = ${eng(fc, "Hz")}`),
          step("Capacitive reactance at f", "X<sub>C</sub> = 1 / (2π f C)", `= 1 / (2π × ${eng(v.f, "Hz")} × ${eng(v.C, "F")})`, `X<sub>C</sub> = ${eng(Xc, "Ω")}`),
          step("Total impedance", "Z = √(R² + X<sub>C</sub>²)", `= √((${eng(v.R, "Ω")})² + (${eng(Xc, "Ω")})²)`, `Z = ${eng(Z, "Ω")}`),
          step("Output voltage (voltage divider)", `${n("Vout")} = ${n("Vin")} × X<sub>C</sub> / Z`, `= ${eng(v.Vin, "V")} × ${eng(Xc, "Ω")} / ${eng(Z, "Ω")}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin)
        ];
        return { steps, notes: [bandNote(v.f, fc, "low")], vout, sum: `f<sub>c</sub> = ${eng(fc, "Hz")}, ${n("Vout")} = ${eng(vout, "V")} at ${eng(v.f, "Hz")}`,
          bode: { mag: (x) => 1 / Math.sqrt(1 + (x / fc) ** 2), marks: [{ f: fc, label: "fc" }], ref: -3 } };
      },
      after: `<div class="callout info"><strong>Good to know</strong>Beyond the cut-off the gain gets very small but never reaches exactly zero: a 1st-order filter keeps falling by 20 dB per decade, as the graph shows. At 100 × f<sub>c</sub> the output is still about 1% of the input.</div>`
    },

    /* ---------------- Passive RC high-pass ---------------- */
    {
      id: "rchpf", group: "filt", toc: "RC High-Pass", title: "Passive RC High-Pass Filter (1st Order)", view: FILT_VIEW, bode: true,
      intro: `<p>Swap R and C: C is in series and R sits across the output. The capacitor blocks DC and low frequencies and passes high ones. The cut-off formula is the same as for the low-pass filter, f<sub>c</sub> = 1 / (2πRC), but now the output is taken across R.</p>
        <p>It is used to remove a DC offset or slow drift from a signal, for example to AC-couple a vibration or audio sensor. Below f<sub>c</sub> the output falls by 20 dB per decade.</p>`,
      inputs: [F("R", "R", 10e3), F("C", "C", 100e-9), F("Vin", "Vac", 5, "amplitude"), F("f", "f", 1000, "signal frequency")],
      diagram: (T) => filterFrame(T) +
        D.wire([94, 60], [140, 60]) + D.cap(140, 60, 210, 60) + T(175, 86, "C") + D.wire([210, 60], [466, 60]) +
        D.dot(290, 60) + D.res(290, 60, 290, 160) + D.dot(290, 160) + T(306, 114, "R", "start"),
      compute(v) {
        const fc = 1 / (TAU * v.R * v.C), Xc = 1 / (TAU * v.f * v.C), Z = Math.hypot(v.R, Xc), ratio = v.R / Z, vout = v.Vin * ratio;
        const steps = [
          step("Cut-off frequency", "f<sub>c</sub> = 1 / (2π R C)", `= 1 / (2π × ${eng(v.R, "Ω")} × ${eng(v.C, "F")})`, `f<sub>c</sub> = ${eng(fc, "Hz")}`),
          step("Capacitive reactance at f", "X<sub>C</sub> = 1 / (2π f C)", `= 1 / (2π × ${eng(v.f, "Hz")} × ${eng(v.C, "F")})`, `X<sub>C</sub> = ${eng(Xc, "Ω")}`),
          step("Total impedance", "Z = √(R² + X<sub>C</sub>²)", `= √((${eng(v.R, "Ω")})² + (${eng(Xc, "Ω")})²)`, `Z = ${eng(Z, "Ω")}`),
          step("Output voltage (voltage divider)", `${n("Vout")} = ${n("Vin")} × R / Z`, `= ${eng(v.Vin, "V")} × ${eng(v.R, "Ω")} / ${eng(Z, "Ω")}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin)
        ];
        return { steps, notes: [bandNote(v.f, fc, "high")], vout, sum: `f<sub>c</sub> = ${eng(fc, "Hz")}, ${n("Vout")} = ${eng(vout, "V")} at ${eng(v.f, "Hz")}`,
          bode: { mag: (x) => (x / fc) / Math.sqrt(1 + (x / fc) ** 2), marks: [{ f: fc, label: "fc" }], ref: -3 } };
      }
    },

    /* ---------------- Passive RL low-pass ---------------- */
    {
      id: "rllpf", group: "filt", toc: "RL Low-Pass", title: "Passive RL Low-Pass Filter (1st Order)", view: FILT_VIEW, bode: true,
      intro: `<p>An inductor is in series and R sits across the output. An inductor's reactance X<sub>L</sub> = 2πfL grows with frequency, the opposite of a capacitor, so the inductor blocks high frequencies and passes low ones. The cut-off is f<sub>c</sub> = R / (2πL).</p>
        <p>RL filters are common in power circuits, for example smoothing the supply to a sensor. Inductors are bulky and pick up magnetic fields, so RC filters are preferred for small signals.</p>`,
      inputs: [F("R", "R", 100), F("L", "L", 10e-3), F("Vin", "Vac", 5, "amplitude"), F("f", "f", 1000, "signal frequency")],
      diagram: (T) => filterFrame(T) +
        D.wire([94, 60], [140, 60]) + D.ind(140, 60, 210) + T(175, 86, "L") + D.wire([210, 60], [466, 60]) +
        D.dot(290, 60) + D.res(290, 60, 290, 160) + D.dot(290, 160) + T(306, 114, "R", "start"),
      compute(v) {
        const fc = v.R / (TAU * v.L), XL = TAU * v.f * v.L, Z = Math.hypot(v.R, XL), ratio = v.R / Z, vout = v.Vin * ratio;
        const steps = [
          step("Cut-off frequency", "f<sub>c</sub> = R / (2π L)", `= ${eng(v.R, "Ω")} / (2π × ${eng(v.L, "H")})`, `f<sub>c</sub> = ${eng(fc, "Hz")}`),
          step("Inductive reactance at f", "X<sub>L</sub> = 2π f L", `= 2π × ${eng(v.f, "Hz")} × ${eng(v.L, "H")}`, `X<sub>L</sub> = ${eng(XL, "Ω")}`),
          step("Total impedance", "Z = √(R² + X<sub>L</sub>²)", `= √((${eng(v.R, "Ω")})² + (${eng(XL, "Ω")})²)`, `Z = ${eng(Z, "Ω")}`),
          step("Output voltage (voltage divider)", `${n("Vout")} = ${n("Vin")} × R / Z`, `= ${eng(v.Vin, "V")} × ${eng(v.R, "Ω")} / ${eng(Z, "Ω")}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin)
        ];
        return { steps, notes: [bandNote(v.f, fc, "low")], vout, sum: `f<sub>c</sub> = ${eng(fc, "Hz")}, ${n("Vout")} = ${eng(vout, "V")} at ${eng(v.f, "Hz")}`,
          bode: { mag: (x) => 1 / Math.sqrt(1 + (x / fc) ** 2), marks: [{ f: fc, label: "fc" }], ref: -3 } };
      }
    },

    /* ---------------- 2nd-order passive RC low-pass ---------------- */
    {
      id: "rc2", group: "filt", toc: "2nd-Order RC Low-Pass", title: "Passive RC Low-Pass Filter (2nd Order)", view: FILT_VIEW, bode: true,
      intro: `<p>This is two RC low-pass stages in a row. Above the cut-off the output falls twice as fast as with a single stage, 40 dB per decade instead of 20, so noise is rejected more strongly.</p>
        <p>The usual quick formula is f<sub>c</sub> = 1 / (2π√(R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>)). The working and the graph also use the exact response of the two connected stages, which shows where the output really falls by 3 dB.</p>`,
      inputs: [F("R1", "R", 10e3), F("C1", "C", 10e-9), F("R2", "R", 10e3), F("C2", "C", 10e-9), F("Vin", "Vac", 5, "amplitude"), F("f", "f", 1000, "signal frequency")],
      diagram: (T) => filterFrame(T) +
        D.wire([94, 60], [120, 60]) + D.res(120, 60, 190, 60) + T(155, 86, "R1") + D.wire([190, 60], [280, 60]) +
        D.dot(230, 60) + D.cap(230, 60, 230, 160) + D.dot(230, 160) + T(246, 114, "C1", "start") +
        D.res(280, 60, 350, 60) + T(315, 86, "R2") + D.wire([350, 60], [466, 60]) +
        D.dot(400, 60) + D.cap(400, 60, 400, 160) + D.dot(400, 160) + T(416, 114, "C2", "start"),
      compute(v) {
        const a = v.R1 * v.C1 * v.R2 * v.C2, b = v.R1 * v.C1 + v.R2 * v.C2 + v.R1 * v.C2;
        const fcs = 1 / (TAU * Math.sqrt(a));
        const mag = (x) => { const w = TAU * x; return 1 / Math.hypot(1 - w * w * a, w * b); };
        const w = TAU * v.f, H = mag(v.f), vout = v.Vin * H;
        const f3 = crossing(mag, Math.SQRT1_2, fcs / 1e4, fcs * 10);
        const steps = [
          step("Cut-off frequency (quick formula)", "f<sub>c</sub> = 1 / (2π √(R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>))",
            `= 1 / (2π √(${eng(v.R1, "Ω")} × ${eng(v.C1, "F")} × ${eng(v.R2, "Ω")} × ${eng(v.C2, "F")}))`, `f<sub>c</sub> = ${eng(fcs, "Hz")}`),
          step("Angular frequency", "ω = 2π f", `= 2π × ${eng(v.f, "Hz")}`, `ω = ${num(w)} rad/s`),
          step("Circuit constants", "a = R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>, b = R<sub>1</sub>C<sub>1</sub> + R<sub>2</sub>C<sub>2</sub> + R<sub>1</sub>C<sub>2</sub>",
            `b = ${num(v.R1 * v.C1)} s + ${num(v.R2 * v.C2)} s + ${num(v.R1 * v.C2)} s`, `a = ${num(a)} s², b = ${num(b)} s`),
          step("Exact gain of the two connected stages", "|H| = 1 / √((1 − ω²a)² + (ωb)²)",
            `= 1 / √((1 − ${num(w * w * a)})² + (${num(w * b)})²)`, `|H| = ${num(H)}`),
          step("Output voltage", `${n("Vout")} = ${n("Vin")} × |H|`, `= ${eng(v.Vin, "V")} × ${num(H)}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin),
          step("True −3 dB point", "Solve |H| = 1/√2 = 0.7071 numerically", "",
            `f<sub>−3 dB</sub> = ${eng(f3, "Hz")}, which is ${num((100 * f3) / fcs, 3)}% of the quick formula's f<sub>c</sub>`)
        ];
        const notes = [
          { type: "info", title: "Why two cut-off values?", html: `The quick formula treats the two RC stages as if they didn't affect each other. In a passive cascade the second stage loads the first, so the true −3 dB point is lower: here ${eng(f3, "Hz")} instead of ${eng(fcs, "Hz")}. The graph shows the exact response. Putting a buffer between the stages (an active filter), or making R<sub>2</sub> much larger than R<sub>1</sub>, reduces the difference.` },
          bandNote(v.f, f3, "low", 40)
        ];
        return { steps, notes, vout, sum: `f<sub>c</sub> (formula) = ${eng(fcs, "Hz")}, true f<sub>−3 dB</sub> = ${eng(f3, "Hz")}, ${n("Vout")} = ${eng(vout, "V")}`,
          bode: { mag, marks: [{ f: fcs, label: "fc quick" }, { f: f3, label: "−3 dB" }], ref: -3 } };
      }
    },

    /* ---------------- Active 1st-order LPF / HPF ---------------- */
    {
      id: "active", group: "filt", toc: "Active Low/High-Pass", title: "Active Filter (1st Order, Low-Pass or High-Pass)", view: "0 0 520 240", bode: true,
      intro: `<p>A passive RC stage followed by an op-amp. The op-amp buffers the RC stage, so the load can't shift the cut-off frequency. As a non-inverting amplifier it can also add gain, ${n("Av")} = 1 + ${n("Rf")} / ${n("Rg")}. Without ${n("Rf")} and ${n("Rg")} it is a voltage follower with a gain of 1.</p>
        <p>The cut-off is still f<sub>c</sub> = 1 / (2πRC). Choose low-pass or high-pass below: the positions of R and C swap, and the amplifier stays the same. Because the op-amp can add gain, check the output against the supply rails.</p>`,
      inputs: [
        F("type", "sel", "lp", null, { label: "Filter type", options: [["lp", "Low-pass"], ["hp", "High-pass"]] }),
        F("mode", "sel", "noninv", null, { label: "Amplifier", options: [["noninv", "Non-inverting (adds gain)"], ["unity", "Unity gain (follower)"]] }),
        F("R", "R", 3.3e3), F("C", "C", 470e-9),
        F("Rg", "R", 10e3, "to ground", { show: (v) => v.mode === "noninv" }),
        F("Rf", "R", 10e3, "feedback", { show: (v) => v.mode === "noninv" }),
        F("Vin", "Vac", 1, "amplitude (peak)"), F("f", "f", 100, "signal frequency"), VCC()
      ],
      diagram(T, lab, v) {
        const lp = v.type !== "hp", series = lp ? D.res(130, 60, 200, 60) : D.cap(130, 60, 200, 60), shunt = lp ? D.cap(240, 60, 240, 210) : D.res(240, 60, 240, 210);
        const fb = v.mode === "unity"
          ? D.wire([310, 100], [285, 100], [285, 150], [420, 150], [420, 80])
          : D.wire([310, 100], [285, 100], [285, 150], [300, 150]) + D.dot(285, 150) + D.res(285, 150, 285, 210) + D.dot(285, 210) + T(297, 198, "Rg", "start") +
            D.res(300, 150, 370, 150) + T(348, 168, "Rf") + D.wire([370, 150], [420, 150], [420, 80]);
        return D.opamp(310, 80, true) +
          D.term(90, 60) + T(82, 64, "Vin", "end") + D.term(90, 210) + T(82, 214, "f", "end") + D.wire([94, 210], [466, 210]) + D.term(470, 210) +
          D.wire([94, 60], [130, 60]) + series + T(165, 86, lp ? "R" : "C") + D.wire([200, 60], [310, 60]) +
          D.dot(240, 60) + shunt + D.dot(240, 210) + T(220, 130, lp ? "C" : "R", "end") +
          fb + D.dot(420, 80) + D.wire([390, 80], [466, 80]) + D.term(470, 80) + T(474, 56, "Vout", "end");
      },
      compute(v) {
        const lp = v.type === "lp", G = v.mode === "noninv" ? 1 + v.Rf / v.Rg : 1;
        const fc = 1 / (TAU * v.R * v.C), Xc = 1 / (TAU * v.f * v.C), Z = Math.hypot(v.R, Xc), ratio = lp ? Xc / Z : v.R / Z, vout = v.Vin * ratio * G;
        const steps = [
          step("Cut-off frequency", "f<sub>c</sub> = 1 / (2π R C)", `= 1 / (2π × ${eng(v.R, "Ω")} × ${eng(v.C, "F")})`, `f<sub>c</sub> = ${eng(fc, "Hz")}`),
          step("Capacitive reactance at f", "X<sub>C</sub> = 1 / (2π f C)", `= 1 / (2π × ${eng(v.f, "Hz")} × ${eng(v.C, "F")})`, `X<sub>C</sub> = ${eng(Xc, "Ω")}`),
          step("Total impedance", "Z = √(R² + X<sub>C</sub>²)", `= √((${eng(v.R, "Ω")})² + (${eng(Xc, "Ω")})²)`, `Z = ${eng(Z, "Ω")}`),
          step(`RC stage output (${lp ? "low-pass" : "high-pass"})`, `V<sub>x</sub> / ${n("Vin")} = ${lp ? "X<sub>C</sub>" : "R"} / Z`,
            `= ${eng(lp ? Xc : v.R, "Ω")} / ${eng(Z, "Ω")}`, `= ${num(ratio)}, so V<sub>x</sub> = ${eng(v.Vin * ratio, "V")}`),
          v.mode === "noninv"
            ? step("Amplifier gain (non-inverting)", `${n("Av")} = 1 + ${n("Rf")} / ${n("Rg")}`, `= 1 + ${eng(v.Rf, "Ω")} / ${eng(v.Rg, "Ω")}`, `${n("Av")} = ${num(G)} (${fmtDb(dB(G))} in the pass band)`)
            : step("Amplifier gain (voltage follower)", `${n("Av")} = 1`, "", `${n("Av")} = 1 (0 dB): the op-amp only buffers the RC stage`),
          step("Output voltage", `${n("Vout")} = ${n("Vin")} × (V<sub>x</sub> / ${n("Vin")}) × ${n("Av")}`, `= ${eng(v.Vin, "V")} × ${num(ratio)} × ${num(G)}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin)
        ];
        const notes = [bandNote(v.f, fc, lp ? "low" : "high")];
        const over = saturation(vout, v.Vcc, steps, notes);
        return { steps, notes, vout, over, sum: `f<sub>c</sub> = ${eng(fc, "Hz")}, ${n("Av")} = ${num(G)}, ${n("Vout")} = ${eng(vout, "V")} at ${eng(v.f, "Hz")}`,
          bode: { mag: (x) => G * (lp ? 1 / Math.sqrt(1 + (x / fc) ** 2) : (x / fc) / Math.sqrt(1 + (x / fc) ** 2)), marks: [{ f: fc, label: "fc" }], ref: dB(G) - 3 } };
      }
    },

    /* ---------------- Band-pass ---------------- */
    {
      id: "bandpass", group: "filt", toc: "Band-Pass", title: "Band-Pass Filter (High-Pass Then Low-Pass)", view: FILT_VIEW, bode: true,
      intro: `<p>A high-pass stage followed by a low-pass stage. The high-pass stage (${n("R1")}, ${n("C1")}) removes frequencies below f<sub>L</sub>, and the low-pass stage (${n("R2")}, ${n("C2")}) removes frequencies above f<sub>H</sub>. Only the band between them passes.</p>
        <p>This only works if f<sub>L</sub> is below f<sub>H</sub>. The bandwidth is BW = f<sub>H</sub> − f<sub>L</sub> and the centre frequency is f<sub>c</sub> = √(f<sub>L</sub> × f<sub>H</sub>). Band-pass filters pick one signal out of noise, for example a modulated sensor carrier or a heart-rate signal.</p>`,
      inputs: [F("R1", "R", 10e3, "high-pass stage"), F("C1", "C", 100e-9, "high-pass stage"), F("R2", "R", 10e3, "low-pass stage"), F("C2", "C", 1e-9, "low-pass stage"),
        F("Vin", "Vac", 1, "amplitude"), F("f", "f", 1000, "signal frequency")],
      diagram: (T) => filterFrame(T) +
        D.wire([94, 60], [120, 60]) + D.cap(120, 60, 190, 60) + T(155, 86, "C1") + D.wire([190, 60], [280, 60]) +
        D.dot(230, 60) + D.res(230, 60, 230, 160) + D.dot(230, 160) + T(246, 114, "R1", "start") +
        D.res(280, 60, 350, 60) + T(315, 86, "R2") + D.wire([350, 60], [466, 60]) +
        D.dot(400, 60) + D.cap(400, 60, 400, 160) + D.dot(400, 160) + T(416, 114, "C2", "start"),
      compute(v) {
        const fL = 1 / (TAU * v.R1 * v.C1), fH = 1 / (TAU * v.R2 * v.C2), ok = fL < fH;
        const Xc1 = 1 / (TAU * v.f * v.C1), Xc2 = 1 / (TAU * v.f * v.C2);
        const hp = v.R1 / Math.hypot(v.R1, Xc1), lp = Xc2 / Math.hypot(v.R2, Xc2), vout = v.Vin * hp * lp;
        const steps = [
          step("Lower cut-off (high-pass stage)", `f<sub>L</sub> = 1 / (2π ${n("R1")} ${n("C1")})`, `= 1 / (2π × ${eng(v.R1, "Ω")} × ${eng(v.C1, "F")})`, `f<sub>L</sub> = ${eng(fL, "Hz")}`),
          step("Upper cut-off (low-pass stage)", `f<sub>H</sub> = 1 / (2π ${n("R2")} ${n("C2")})`, `= 1 / (2π × ${eng(v.R2, "Ω")} × ${eng(v.C2, "F")})`, `f<sub>H</sub> = ${eng(fH, "Hz")}`)
        ];
        const notes = [];
        if (ok) {
          steps.push(step("Bandwidth", "BW = f<sub>H</sub> − f<sub>L</sub>", `= ${eng(fH, "Hz")} − ${eng(fL, "Hz")}`, `BW = ${eng(fH - fL, "Hz")}`));
          steps.push(step("Centre frequency", "f<sub>c</sub> = √(f<sub>L</sub> × f<sub>H</sub>)", `= √(${eng(fL, "Hz")} × ${eng(fH, "Hz")})`, `f<sub>c</sub> = ${eng(Math.sqrt(fL * fH), "Hz")}`));
        } else {
          notes.push({ type: "warn", title: "No pass band", html: `f<sub>L</sub> = ${eng(fL, "Hz")} is not below f<sub>H</sub> = ${eng(fH, "Hz")}. The high-pass stage blocks everything below f<sub>L</sub> and the low-pass stage blocks everything above f<sub>H</sub>, so no band gets through cleanly. Make ${n("R1")}${n("C1")} larger than ${n("R2")}${n("C2")}.` });
        }
        steps.push(
          step("High-pass stage at f", `${n("R1")} / √(${n("R1")}² + X<sub>C1</sub>²), with X<sub>C1</sub> = 1 / (2π f ${n("C1")})`,
            `X<sub>C1</sub> = ${eng(Xc1, "Ω")}, so ${eng(v.R1, "Ω")} / √((${eng(v.R1, "Ω")})² + (${eng(Xc1, "Ω")})²)`, `= ${num(hp)}`),
          step("Low-pass stage at f", `X<sub>C2</sub> / √(${n("R2")}² + X<sub>C2</sub>²), with X<sub>C2</sub> = 1 / (2π f ${n("C2")})`,
            `X<sub>C2</sub> = ${eng(Xc2, "Ω")}, so ${eng(Xc2, "Ω")} / √((${eng(v.R2, "Ω")})² + (${eng(Xc2, "Ω")})²)`, `= ${num(lp)}`),
          step("Output voltage", `${n("Vout")} = ${n("Vin")} × (high-pass) × (low-pass)`, `= ${eng(v.Vin, "V")} × ${num(hp)} × ${num(lp)}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin)
        );
        notes.push({ type: "info", title: "Stages treated as independent", html: `These values assume the two stages don't load each other, as in the active version with a buffer between them. In a purely passive build the second stage loads the first and the measured output will be somewhat lower. Making ${n("R2")} at least 10 times ${n("R1")} keeps the difference small.` });
        return { steps, notes, vout, sum: `f<sub>L</sub> = ${eng(fL, "Hz")}, f<sub>H</sub> = ${eng(fH, "Hz")}${ok ? `, BW = ${eng(fH - fL, "Hz")}` : ""}, ${n("Vout")} = ${eng(vout, "V")}`,
          bode: { mag: (x) => ((x / fL) / Math.sqrt(1 + (x / fL) ** 2)) / Math.sqrt(1 + (x / fH) ** 2), marks: [{ f: fL, label: "fL" }, { f: fH, label: "fH" }], ref: -3 } };
      }
    },

    /* ---------------- Band-stop (twin-T) ---------------- */
    {
      id: "bandstop", group: "filt", toc: "Band-Stop (Twin-T)", title: "Band-Stop Filter (Twin-T Notch)", view: "0 0 520 240", bode: true,
      intro: `<p>A band-stop (notch) filter blocks a narrow band and passes everything else. The twin-T puts a low-pass T (R, R and 2C) <strong>in parallel</strong> with a high-pass T (C, C and R/2). Well below the notch the low-pass path carries the signal, and well above it the high-pass path does. At the notch frequency the two paths deliver equal signals in opposite phase, so they cancel.</p>
        <p>With these component ratios the notch sits at f<sub>notch</sub> = 1 / (2πRC). A classic instrumentation use is removing 50 Hz mains hum from a sensor signal.</p>`,
      inputs: [F("R", "R", 10e3), F("C", "C", 10e-9), F("Vin", "Vac", 1, "amplitude"), F("f", "f", 1000, "signal frequency")],
      diagram(T, lab, v) {
        const r2 = v.R ? eng(v.R / 2, "Ω") : "?", c2 = v.C ? eng(2 * v.C, "F") : "?";
        const L = (x, y, name, val, a) => D.text(x, y, `${name} = <tspan class="val${val === "?" ? " bad" : ""}">${val}</tspan>`, a);
        return D.term(90, 110) + T(82, 114, "Vin", "end") + T(82, 134, "f", "end") +
          D.wire([94, 110], [120, 110]) + D.wire([120, 50], [120, 170]) + D.dot(120, 110) +
          D.wire([120, 50], [150, 50]) + D.res(150, 50, 220, 50) + T(185, 36, "R") + D.wire([220, 50], [300, 50]) +
          D.dot(260, 50) + D.cap(260, 50, 260, 100) + D.gnd(260, 100) + L(276, 82, "2C", c2, "start") +
          D.res(300, 50, 370, 50) + T(335, 36, "R") + D.wire([370, 50], [410, 50], [410, 170], [370, 170]) +
          D.wire([120, 170], [150, 170]) + D.cap(150, 170, 220, 170) + T(185, 156, "C") + D.wire([220, 170], [300, 170]) +
          D.dot(260, 170) + D.res(260, 170, 260, 215) + D.gnd(260, 215) + L(276, 200, "R/2", r2, "start") +
          D.cap(300, 170, 370, 170) + T(335, 156, "C") +
          D.dot(410, 110) + D.wire([410, 110], [466, 110]) + D.term(470, 110) +
          D.text(508, 94, `V<tspan class="sb" dy="4">out</tspan>`, "end") + D.text(508, 138, `<tspan class="val${lab.over ? " over" : ""}">${lab.Vout}</tspan>`, "end");
      },
      compute(v) {
        const fn = 1 / (TAU * v.R * v.C), x = v.f / fn, H = Math.abs(1 - x * x) / Math.hypot(1 - x * x, 4 * x), vout = v.Vin * H;
        const f1 = (Math.sqrt(5) - 2) * fn, f2 = (Math.sqrt(5) + 2) * fn;
        const steps = [
          step("Component values", "Low-pass T: R, R and 2C. High-pass T: C, C and R/2.",
            `R = ${eng(v.R, "Ω")}, R/2 = ${eng(v.R / 2, "Ω")}; C = ${eng(v.C, "F")}, 2C = ${eng(2 * v.C, "F")}`, "Both Ts are tuned to the same frequency"),
          step("Notch frequency", "f<sub>notch</sub> = 1 / (2π R C)", `= 1 / (2π × ${eng(v.R, "Ω")} × ${eng(v.C, "F")})`, `f<sub>notch</sub> = ${eng(fn, "Hz")}`),
          step("Frequency ratio", "x = f / f<sub>notch</sub>", `= ${eng(v.f, "Hz")} / ${eng(fn, "Hz")}`, `x = ${num(x)}`),
          step("Gain of the twin-T (no load)", "|H| = |1 − x²| / √((1 − x²)² + (4x)²)",
            `= ${num(Math.abs(1 - x * x))} / √(${num((1 - x * x) ** 2)} + ${num(16 * x * x)})`, `|H| = ${num(H)}`),
          step("Output voltage", `${n("Vout")} = ${n("Vin")} × |H|`, `= ${eng(v.Vin, "V")} × ${num(H)}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin),
          step("Stop band (−3 dB points)", "f<sub>1</sub> = (√5 − 2) f<sub>notch</sub>, f<sub>2</sub> = (√5 + 2) f<sub>notch</sub>",
            `= 0.236 × ${eng(fn, "Hz")} and 4.236 × ${eng(fn, "Hz")}`, `f<sub>1</sub> = ${eng(f1, "Hz")}, f<sub>2</sub> = ${eng(f2, "Hz")}`)
        ];
        const inStop = v.f > f1 && v.f < f2;
        const notes = [{ type: "info", title: "Where f sits", html: `f = ${eng(v.f, "Hz")} is ${inStop ? "inside the stop band, so it is attenuated. The deepest cut is exactly at f<sub>notch</sub>." : "outside the stop band, so it passes with little loss."} In a real circuit, component tolerances limit the notch depth to around −40 dB rather than −∞.` }];
        return { steps, notes, vout, sum: `f<sub>notch</sub> = ${eng(fn, "Hz")}, ${n("Vout")} = ${eng(vout, "V")} at ${eng(v.f, "Hz")}`,
          bode: { mag: (y) => { const q = y / fn; return Math.abs(1 - q * q) / Math.hypot(1 - q * q, 4 * q); }, marks: [{ f: f1, label: "f1" }, { f: fn, label: "notch" }, { f: f2, label: "f2" }], ref: -3 } };
      }
    }
  ];

  SECTIONS.forEach((sec) => { if (WAVES[sec.id]) sec.render = scopeRender; });
  SECTIONS.unshift({ id: "why", group: "why", title: "Why Condition a Signal?", toc: "Overview",
    intro: `<p>Sensor signals are rarely ready to measure. They are often <strong>too small</strong> (millivolts), <strong>noisy</strong> (mains hum, motor interference), or have the wrong range for the ADC. Signal conditioning means amplifying, filtering and shifting a signal so the next stage can measure it accurately.</p>`,
    mount: mountWhy });

  // Shared frame for two-rail passive filters: Vin on the left, Vout on the right.
  function filterFrame(T) {
    return D.term(90, 60) + T(82, 64, "Vin", "end") + D.term(90, 160) + T(82, 164, "f", "end") +
      D.wire([94, 160], [466, 160]) + D.term(470, 60) + D.term(470, 160) + T(474, 44, "Vout", "end");
  }


  /* =====================================================================
     Added 11 Nov 2026 (lecturer's requests): the loading effect (why a voltage follower), the Types of Filters tree,
     the Filter Lab (a noisy signal in, a clean one out) and the Learn More at Home group.
     ===================================================================== */
  const { chips, wireChips, quiz, stepsHtml } = Lab;
  const kfmt = (x, u, d = 3) => eng(x, u, d);
  const logSlider = (id, label, min, max, val) => `<label class="c5-sl"><span>${label} <b id="${id}-v"></b></span><input type="range" id="${id}" min="${Math.log10(min)}" max="${Math.log10(max)}" step="0.01" value="${Math.log10(val)}"></label>`;
  const linSlider = (id, label, min, max, st, val) => `<label class="c5-sl"><span>${label} <b id="${id}-v"></b></span><input type="range" id="${id}" min="${min}" max="${max}" step="${st}" value="${val}"></label>`;

  /* ---------- The loading effect: a sensor with internal resistance Rs driving a load RL, with and without a follower ---------- */
  // tidy values for the sliders (9 kΩ and 1 kΩ give the 500 µA / 5 mA example; megaohms for a pH probe)
  const RS_VALS = [100, 220, 470, 1e3, 2.2e3, 4.7e3, 9e3, 10e3, 22e3, 47e3, 100e3, 470e3, 1e6], RL_VALS = [100, 220, 470, 1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3];
  // "What's inside the dashed box?": an LDR divider and the same thing as Vs with Rs inside
  function eqvFigure() {
    const T = (x, y, t, a = "middle", c = "small") => `<text x="${x}" y="${y}" text-anchor="${a}" class="${c}">${t}</text>`;
    const sub = (b, s) => `${b}<tspan dy='3' font-size='0.75em'>${s}</tspan><tspan dy='-3'></tspan>`;
    const ldr = D.term(70, 22) + T(84, 26, "+10 V", "start") + D.wire([70, 26], [70, 42]) + D.res(70, 42, 70, 98) +
      `<circle class="w c5-nofill" cx="70" cy="70" r="22"/><path class="c5-arr" d="M28,34l18,14m0,0l-7,-1m7,1l-2,-7M20,46l18,14m0,0l-7,-1m7,1l-2,-7"/>` +
      T(100, 66, "LDR", "start") + T(100, 82, "18 kΩ", "start", "small val") +
      D.wire([70, 98], [70, 132]) + D.dot(70, 115) + D.wire([70, 115], [214, 115]) + D.term(218, 115) + T(218, 103, "output") +
      D.res(70, 132, 70, 188) + T(86, 164, "18 kΩ", "start", "small val") + D.gnd(70, 188) + T(100, 202, "0 V", "start");
    const box = `<rect class="c5-dash" x="10" y="30" width="170" height="160" rx="10"/>` + T(95, 22, "Sensor (the dashed box)") +
      `<circle class="w c5-src" cx="50" cy="118" r="17"/>` + T(50, 114, "+") + T(50, 130, "−") + T(76, 123, sub("V", "s") + " = 5 V", "start", "small val") +
      D.wire([50, 101], [50, 70], [72, 70]) + D.res(72, 70, 140, 70) + T(106, 56, sub("R", "s") + " = 9 kΩ", "middle", "small val") +
      D.wire([140, 70], [250, 70]) + D.term(254, 70) + T(254, 58, "output") + D.wire([50, 135], [50, 176], [250, 176]) + D.term(254, 176) + T(254, 200, "0 V");
    return `<h4 class="sub-h">What's Inside the Sensor? An Example</h4><div class="c5-eqv">
      <figure class="c5-eqf"><svg class="ckt c5-eqsvg" viewBox="0 0 260 214" role="img" aria-label="A light-dependent resistor of 18 kilohms and a fixed 18 kilohm resistor in series across 10 volts, with the output taken from the middle">${ldr}</svg><figcaption>Real sensor circuit: an LDR voltage divider</figcaption></figure>
      <div class="c5-eqeq" aria-hidden="true">=</div>
      <figure class="c5-eqf"><svg class="ckt c5-eqsvg" viewBox="0 0 280 214" role="img" aria-label="The same circuit seen from the output: a 5 volt source with 9 kilohms in series, inside a dashed box">${box}</svg><figcaption>What the output "sees": V<sub>s</sub> with R<sub>s</sub> inside</figcaption></figure>
    </div>
    <div class="c5-eqmath"><p>V<sub>s</sub> = 10 V × 18 kΩ / (18 kΩ + 18 kΩ) = <strong>5 V</strong> <span>(the output voltage with nothing connected)</span></p>
      <p>R<sub>s</sub> = 18 kΩ × 18 kΩ / (18 kΩ + 18 kΩ) = <strong>9 kΩ</strong> <span>(the two resistors in parallel)</span></p></div>
    <p class="small-note">Any sensor in a divider can be replaced by its open-circuit voltage V<sub>s</sub> and its internal resistance R<sub>s</sub>. The demo below uses this 5 V, 9 kΩ sensor. R<sub>L</sub> is whatever the output drives next: a meter, a filter, a relay driver or a long cable.</p>`;
  }
  function mountLoading(el) {
    el.innerHTML = `${eqvFigure()}<h4 class="sub-h">Try It: With and Without a Follower</h4><div class="c5-fd">
      ${chips("Circuit", [["off", "Without follower"], ["on", "With voltage follower"]], "off")}
      <div class="c5-bench">
        <figure class="scene-box c5-fdfig"><div class="scene-scroll"><svg class="ckt c5-fdsvg" viewBox="0 0 560 200" role="img" aria-label="A sensor modelled as a voltage source with internal resistance, driving a load, with or without a voltage follower in between"></svg></div></figure>
        <div class="c5-ctl"><p class="c5-ctlh">Change the values</p>${linSlider("fdVs", "Sensor voltage V<sub>s</sub>", 1, 10, 0.5, 5)}${linSlider("fdRs", "Sensor's internal resistance R<sub>s</sub>", 0, RS_VALS.length - 1, 1, RS_VALS.indexOf(9e3))}${linSlider("fdRL", "Load R<sub>L</sub>", 0, RL_VALS.length - 1, 1, RL_VALS.indexOf(1e3))}</div>
      </div>
      <div class="c5-meters">
        <div class="c5-m"><span>Voltage across R<sub>L</sub></span><strong id="fdV"></strong></div>
        <div class="c5-m"><span>Current in R<sub>L</sub></span><strong id="fdI"></strong></div>
        <div class="c5-m"><span>Current from the sensor</span><strong id="fdS"></strong></div>
      </div>
      <div class="c5-bar"><span>Signal reaching the load</span><i><b id="fdBar"></b></i><strong id="fdPct"></strong></div>
      <p class="pv-read c5-read" id="fdRead" aria-live="polite"></p></div>`;
    let mode = "off";
    const $ = (s) => el.querySelector(s);
    const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
    function draw() {
      const Vs = +$("#fdVs").value, Rs = RS_VALS[+$("#fdRs").value], RL = RL_VALS[+$("#fdRL").value], on = mode === "on";
      $("#fdVs-v").textContent = `${Vs} V`; $("#fdRs-v").textContent = eng(Rs, "Ω"); $("#fdRL-v").textContent = eng(RL, "Ω");
      const VL = on ? Vs : (Vs * RL) / (Rs + RL), IL = VL / RL, Is = on ? 0 : IL, pct = (VL / Vs) * 100;
      // the circuit
      let s = `<rect class="c5-dash" x="8" y="22" width="166" height="176" rx="10"/>${T(91, 16, "Sensor", "middle", "small")}`;
      s += `<circle class="w c5-src" cx="46" cy="118" r="17"/>${T(46, 114, "+", "middle", "small")}${T(46, 130, "−", "middle", "small")}${T(38, 160, `${Vs} V`, "end", "small val")}`;
      s += D.wire([46, 101], [46, 60], [70, 60]) + D.res(70, 60, 140, 60) + T(105, 48, `R<tspan dy='3' font-size='0.75em'>s</tspan><tspan dy='-3'> = ${eng(Rs, "Ω")}</tspan>`, "middle", "small") + D.wire([140, 60], [174, 60]) + D.wire([46, 135], [46, 186], [174, 186]);
      if (!on) {
        s += D.wire([174, 60], [470, 60], [470, 82]) + D.res(470, 82, 470, 150) + D.wire([470, 150], [470, 186], [174, 186]);
        s += `<path class="c5-arr" d="M250,50h60l-8,-5M310,50l-8,5"/>${T(280, 40, `I = ${kfmt(IL, "A")}`, "middle", "small c5-red")}`;
      } else {
        s += D.wire([174, 60], [220, 60], [220, 72], [262, 72]) + D.opamp(262, 92, true) + D.wire([262, 112], [240, 112], [240, 150], [365, 150], [365, 92]) + D.dot(365, 92);
        s += D.wire([342, 92], [470, 92], [470, 100]) + D.res(470, 100, 470, 160) + D.wire([470, 160], [470, 186], [174, 186]);
        s += T(205, 48, "I ≈ 0", "middle", "small c5-green") + `<path class="c5-arr" d="M385,82h50l-8,-5M435,82l-8,5"/>${T(410, 72, `I = ${kfmt(IL, "A")}`, "middle", "small c5-green")}`;
      }
      s += T(458, 126, `R<tspan dy='3' font-size='0.75em'>L</tspan><tspan dy='-3'> = ${eng(RL, "Ω")}</tspan>`, "end", "small") + T(458, 146, `V = ${kfmt(VL, "V")}`, "end", "small val");
      $("#fdV").textContent = kfmt(VL, "V"); $("#fdI").textContent = kfmt(IL, "A"); $("#fdS").textContent = on ? "≈ 0 (the op-amp supplies the load)" : kfmt(Is, "A");
      $("#fdBar").style.width = `${Math.max(1, pct)}%`; $("#fdBar").className = pct > 95 ? "ok" : pct > 60 ? "mid" : "low"; $("#fdPct").textContent = `${num(pct, 3)} %`;
      el.querySelector(".c5-fdsvg").innerHTML = s;
      $("#fdRead").innerHTML = on
        ? `<strong>With the follower:</strong> the op-amp's + input draws almost no current, so nothing is lost across R<sub>s</sub> and V<sub>L</sub> = V<sub>s</sub> = ${kfmt(Vs, "V")}. The op-amp's output supplies the load current, I<sub>L</sub> = V<sub>s</sub> / R<sub>L</sub> = ${kfmt(Vs, "V")} / ${eng(RL, "Ω")} = <strong>${kfmt(IL, "A")}</strong>. The sensor itself supplies almost nothing.` +
          (IL > 0.02 ? ` <span class="c5-warn">⚠ ${kfmt(IL, "A")} is more than a typical op-amp can supply (about 20 mA). Use a bigger R<sub>L</sub> or add a current booster.</span>` : "")
        : `<strong>Without a follower:</strong> R<sub>s</sub> and R<sub>L</sub> form a voltage divider. I = V<sub>s</sub> / (R<sub>s</sub> + R<sub>L</sub>) = ${kfmt(Vs, "V")} / ${eng(Rs + RL, "Ω")} = <strong>${kfmt(IL, "A")}</strong>, so V<sub>L</sub> = I × R<sub>L</sub> = ${kfmt(VL, "V")}. Only ${num(pct, 3)} % of the sensor's voltage reaches the load, and the sensor has to supply the load current. This is the <strong>loading effect</strong>.`;
    }
    wireChips(el.querySelector(".chips-row"), (v) => { mode = v; draw(); });
    el.addEventListener("input", (e) => { if (e.target.type === "range") draw(); });
    draw();
  }

  /* ---------- Types of Filters: the tree from the lecture notes, with a card for each type ---------- */
  const FT = {
    lp: { n: "Low pass", passes: "frequencies below f<sub>c</sub>", blocks: "frequencies above f<sub>c</sub>", ex: "Removes hiss and fast noise from a slow sensor signal, such as temperature.", shape: "M8,22 H70 C88,22 96,40 152,60" },
    hp: { n: "High pass", passes: "frequencies above f<sub>c</sub>", blocks: "frequencies below f<sub>c</sub>, including DC", ex: "Removes slow drift or a DC offset from a vibration or audio signal.", shape: "M8,60 C64,40 72,22 90,22 H152" },
    bp: { n: "Band pass", passes: "a band between f<sub>L</sub> and f<sub>H</sub>", blocks: "frequencies below f<sub>L</sub> and above f<sub>H</sub>", ex: "Picks out a heart-rate signal (about 0.5 to 40 Hz) from drift and hiss.", shape: "M8,60 C40,48 46,22 62,22 H98 C114,22 120,48 152,60" },
    br: { n: "Band reject", passes: "everything except one band", blocks: "a band between f<sub>L</sub> and f<sub>H</sub> (a notch blocks one frequency)", ex: "A notch at 50 Hz removes mains hum from an ECG or a thermocouple signal.", shape: "M8,22 H58 C68,22 72,58 80,60 C88,58 92,22 102,22 H152" },
    ap: { n: "All pass", passes: "every frequency at the same size", blocks: "nothing: it only shifts the phase (the timing) of the signal", ex: "Corrects the phase or delay of a signal, for example in audio and communication circuits.", shape: "M8,26 H152" }
  };
  const FT_LINK = { p: { lp: "rclpf", hp: "rchpf", bp: "bandpass", br: "bandstop" }, a: { lp: "active", hp: "active", bp: "bandpass", br: "bandstop" } };
  const FT_HOW = {
    p: { lp: "An RC (or RL) circuit with the output across C (or R). See also the 2nd-order RC filter.", hp: "An RC circuit with the output across R.", bp: "A high-pass stage followed by a low-pass stage.", br: "A twin-T network: a low-pass and a high-pass path in parallel.", ap: "Rarely built from R and C alone: an all-pass is usually an active circuit." },
    a: { lp: "An RC stage feeding an op-amp (unity gain, or a non-inverting amplifier for gain).", hp: "A CR stage feeding an op-amp.", bp: "Active high-pass and low-pass stages in a row (this page calculates the passive version).", br: "Active low-pass and high-pass paths combined (this page calculates the passive twin-T).", ap: "An op-amp circuit whose gain stays at 1 while the phase changes with frequency." }
  };
  function mountFilterTypes(el) {
    const leaf = (b, k) => `<button type="button" class="c5-leaf" data-b="${b}" data-k="${k}"><svg viewBox="0 0 160 70" aria-hidden="true"><path class="c5-ax" d="M8,64 H154 M8,64 V8"/><path class="c5-shape" d="${FT[k].shape}"/></svg>${FT[k].n}</button>`;
    const branch = (b, title, sub) => `<div class="c5-br"><button type="button" class="c5-bh" data-bh="${b}"><strong>${title}</strong><small>${sub}</small></button><div class="c5-leaves">${Object.keys(FT).map((k) => leaf(b, k)).join("")}</div></div>`;
    el.innerHTML = `<div class="c5-tree" role="group" aria-label="Types of filters">
        <div class="c5-root">Electronic Filters</div><div class="c5-split" aria-hidden="true"></div>
        <div class="c5-brs">${branch("p", "Passive filters", "R, C and L only")}${branch("a", "Active filters", "with an op-amp")}</div></div>
      <div class="c5-card" id="ftCard" aria-live="polite"><p class="small-note">Tap a filter type to see what it passes, what it blocks and where it is used. Tap <strong>Passive</strong> or <strong>Active</strong> to compare them.</p></div>
`;
    const card = el.querySelector("#ftCard");
    el.addEventListener("click", (e) => {
      const bh = e.target.closest("[data-bh]"), lf = e.target.closest("[data-k]");
      if (!bh && !lf) return;
      el.querySelectorAll(".c5-leaf, .c5-bh").forEach((x) => x.classList.toggle("on", x === (lf || bh)));
      if (bh) {
        card.innerHTML = bh.dataset.bh === "p"
          ? `<h4>Passive Filters</h4><p>Built from <strong>resistors, capacitors and inductors only</strong>. They need no power supply, but the output can never be bigger than the input, and the load changes how they behave.</p>`
          : `<h4>Active Filters</h4><p>Built around an <strong>op-amp</strong> (plus R and C). They need a DC supply, but they can <strong>amplify</strong> while they filter, and the op-amp buffers the output so the load doesn't change the filter.</p>`;
        return;
      }
      const b = lf.dataset.b, k = lf.dataset.k, f = FT[k], link = FT_LINK[b][k];
      card.innerHTML = `<div class="c5-cardg"><svg viewBox="0 0 160 70" aria-hidden="true"><path class="c5-ax" d="M8,64 H154 M8,64 V8"/><path class="c5-shape big" d="${f.shape}"/><text x="152" y="70" text-anchor="end" class="c5-axl">f →</text><text x="4" y="8" class="c5-axl">gain</text></svg>
        <div><h4>${b === "p" ? "Passive" : "Active"} ${f.n} Filter</h4>
        <p><strong>Passes:</strong> ${f.passes}. <strong>Blocks:</strong> ${f.blocks}.</p>
        <p><strong>How it is built:</strong> ${FT_HOW[b][k]}</p>
        <p><strong>Where it is used:</strong> ${f.ex}</p>
        ${link ? `<p><a class="btn ghost small" href="#${link}" data-go="${link}">Try it in the calculator ›</a></p>` : `<p class="small-note">For information: the all-pass filter is not calculated in this chapter.</p>`}</div></div>`;
    });
    el.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g && Lab.BY_ID[g.dataset.go]) { e.preventDefault(); Lab.scrollToSection(Lab.BY_ID[g.dataset.go]); } });
  }

  /* ---------- Filter Lab: a noisy signal goes in, you move the cut-off, the scope and the Bode plot show what comes out ---------- */
  const LABS = {
    lp: { label: "Hiss on a temperature signal", type: "lp", span: 1, parts: [{ f: 2, a: 1, sig: true, n: "temperature signal, 2 Hz" }, { f: 180, a: 0.35, n: "hiss, 180 Hz" }, { f: 430, a: 0.25, n: "hiss, 430 Hz" }], fc: 2000, range: [1, 10e3],
      tip: "Move the cut-off down until the hiss (red dots) falls in the stop band but the 2 Hz signal (green dot) still passes." },
    hp: { label: "Drift on a vibration signal", type: "hp", span: 2, parts: [{ f: 25, a: 0.6, sig: true, n: "vibration, 25 Hz" }, { f: 0.5, a: 1.2, n: "drift, 0.5 Hz" }], fc: 0.05, range: [0.01, 1000],
      tip: "Move the cut-off up until the slow drift is blocked but the 25 Hz vibration still passes." },
    bp: { label: "Heart-rate signal with drift and hiss", type: "bp", span: 3, parts: [{ f: 1.2, a: 0.7, sig: true, n: "heartbeat, 1.2 Hz" }, { f: 0.03, a: 1, n: "drift, 0.03 Hz" }, { f: 150, a: 0.3, n: "hiss, 150 Hz" }], fc: 0.01, fc2: 2000, range: [0.005, 5000],
      tip: "Set f<sub>L</sub> above the drift and f<sub>H</sub> below the hiss, with the heartbeat in between." },
    bs: { label: "50 Hz mains hum", type: "bs", span: 1, parts: [{ f: 3, a: 1, sig: true, n: "sensor signal, 3 Hz" }, { f: 50, a: 0.6, n: "mains hum, 50 Hz" }], fc: 400, range: [5, 5000],
      tip: "Move the notch frequency onto the hum at 50 Hz." }
  };
  const Hof = (type, f, fc, fc2) => type === "lp" ? LPr(f / fc) : type === "hp" ? HPr(f / fc) : type === "bp" ? cmul(HPr(f / fc), LPr(f / fc2)) : (() => { const x = f / fc; return cdiv(cx(1 - x * x, 0), cx(1 - x * x, 4 * x)); })();
  function mountFilterLab(el) {
    el.innerHTML = `<div class="c5-fl">${chips("Situation", Object.entries(LABS).map(([k, o]) => [k, o.label]), "lp")}
      <div class="c5-ctl c5-flctl"><p class="c5-tip" id="flTip"></p><div class="c5-sls" id="flSl"></div></div>
      <div class="c5-flres" aria-live="polite"><div class="c5-m"><span>Signal kept</span><strong id="flSig"></strong></div><div class="c5-m"><span>Noise left</span><strong id="flNoise"></strong></div><div class="c5-m c5-verdict"><strong id="flOk"></strong></div></div>
      <div class="c5-pair"><div><h4 class="sub-h">Oscilloscope</h4><div class="scope-box" id="flScope"></div></div>
      <div><h4 class="sub-h">Where Each Part Sits on the Bode Plot</h4><div class="scope-box" id="flBode"></div></div></div>
      <p class="small-note">Green dot: the signal you want. Red dots: the noise. Dashed line: your cut-off (−3 dB). A part in the pass band gets through; a part in the stop band is attenuated.</p></div>`;
    let key = "lp", fc, fc2;
    const $ = (s) => el.querySelector(s);
    function sliders() {
      const L = LABS[key];
      fc = L.fc; fc2 = L.fc2;
      $("#flSl").innerHTML = L.type === "bp" ? logSlider("flF", "Lower cut-off f<sub>L</sub>", L.range[0], L.range[1], fc) + logSlider("flF2", "Upper cut-off f<sub>H</sub>", L.range[0], L.range[1], fc2)
        : logSlider("flF", L.type === "bs" ? "Notch frequency f<sub>0</sub>" : "Cut-off frequency f<sub>c</sub>", L.range[0], L.range[1], fc);
      $("#flTip").innerHTML = L.tip;
    }
    function draw() {
      const L = LABS[key];
      fc = Number((10 ** +$("#flF").value).toPrecision(3)); if ($("#flF2")) fc2 = Number((10 ** +$("#flF2").value).toPrecision(3));
      $("#flF-v").textContent = eng(fc, "Hz"); if ($("#flF2")) $("#flF2-v").textContent = eng(fc2, "Hz");
      const gains = L.parts.map((p) => Hof(L.type, p.f, fc, fc2)), sigG = cmag(gains[L.parts.findIndex((p) => p.sig)]);
      const nz = L.parts.map((p, k) => (p.sig ? null : cmag(gains[k]))).filter((x) => x !== null), noiseG = Math.max(...nz);
      $("#flSig").textContent = `${num(sigG * 100, 3)} %`; $("#flNoise").textContent = `${num(noiseG * 100, 3)} %`;
      const bad = L.type === "bp" && fc >= fc2, ok = !bad && sigG >= 0.7 && noiseG <= 0.2;
      $("#flOk").innerHTML = bad ? "⚠ f<sub>L</sub> must be below f<sub>H</sub>" : ok ? "✓ Clean signal!" : sigG < 0.7 ? "The signal is being cut too" : "Noise still getting through";
      $("#flOk").className = ok ? "c5-good" : "c5-bad";
      // scope
      const span = L.span, N = 900, inp = (t) => L.parts.reduce((s, p) => s + p.a * Math.sin(TAU * p.f * t), 0);
      const out = (t) => L.parts.reduce((s, p, k) => s + p.a * cmag(gains[k]) * Math.sin(TAU * p.f * t + carg(gains[k])), 0);
      let ymax = 0; for (let i = 0; i <= 300; i++) ymax = Math.max(ymax, Math.abs(inp((i / 300) * span)));
      ymax *= 1.15;
      const A = axes({ x: [0, span], y: [-ymax, ymax], xt: [0, span / 2, span], fx: (q) => eng(q, "s", 3), yt: [-ymax / 1.15, 0, ymax / 1.15], fy: (q) => eng(q, "V", 2), l: 58, xl: "Time", yl: "", H: 210 });
      const pts = (fn) => { const a = []; for (let i = 0; i <= N; i++) { const x = (i / N) * span; a.push([A.X(x), A.Y(fn(x))]); } return a; };
      $("#flScope").innerHTML = svg(A.W, A.H, "Noisy input and filtered output against time", A.s + `<line class="gl" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(0)}" y2="${A.Y(0)}"/>` + poly(pts(inp), "trace-in") + poly(pts(out), "trace-a")) +
        `<p class="legend"><span><span class="key input"></span>noisy input</span> <span><span class="key"></span>filtered output</span></p>`;
      // Bode with the parts as dots
      const d0 = Math.floor(Math.log10(L.range[0])), d1 = Math.ceil(Math.log10(L.range[1])), M = 240;
      const B = axes({ x: [d0, d1], y: [-60, 6], xt: Array.from({ length: d1 - d0 + 1 }, (_, i) => d0 + i), fx: (q) => eng(10 ** q, "Hz", 2), yt: [-60, -40, -20, 0], fy: (q) => `${q} dB`, l: 58, r: 30, xl: "Frequency", yl: "", H: 210 });
      const gdb = (f) => Math.max(-60, dB(cmag(Hof(L.type, f, fc, fc2))));
      const curve = []; for (let i = 0; i <= M; i++) { const q = d0 + ((d1 - d0) * i) / M; curve.push([B.X(q), B.Y(gdb(10 ** q))]); }
      let g = B.s + poly(curve, "trace-a") + `<line class="ref" x1="${B.l}" x2="${B.l + B.pw}" y1="${B.Y(-3)}" y2="${B.Y(-3)}"/>`;
      [fc, L.type === "bp" ? fc2 : null].filter(Boolean).forEach((c) => { const x = B.X(Math.log10(c)); g += `<line class="ref" x1="${x}" x2="${x}" y1="${B.Y(6)}" y2="${B.Y(-60)}"/>`; });
      L.parts.forEach((p) => { const x = B.X(Math.log10(p.f)), y = B.Y(gdb(p.f)); g += `<circle cx="${x}" cy="${y}" r="6" class="${p.sig ? "c5-dsig" : "c5-dnoise"}"><title>${p.n}</title></circle>`; });
      $("#flBode").innerHTML = svg(B.W, B.H, "Bode plot of the filter with the signal and noise frequencies marked", g) +
        `<p class="legend">${L.parts.map((p) => `<span><span class="c5-k ${p.sig ? "sig" : "noise"}"></span>${p.n}: ${num(cmag(Hof(L.type, p.f, fc, fc2)) * 100, 3)} % gets through</span>`).join(" ")}</p>`;
    }
    wireChips(el.querySelector(".chips-row"), (v) => { key = v; sliders(); draw(); });
    el.addEventListener("input", (e) => { if (e.target.type === "range") draw(); });
    sliders(); draw();
  }

  /* ---------- Learn More at Home ---------- */
  function mountReal(el) {
    const C = [
      ["🌡️", "Thermocouple Thermometer", "Non-inverting amplifier + low-pass filter", "A thermocouple gives about 41 µV per °C. A non-inverting amplifier with gain 1 + 100 kΩ / 1 kΩ = 101 turns 4.1 mV (100 °C) into about 0.41 V, and a low-pass filter removes the hum before the ESP32 reads it.", "noninv"],
      ["❤️", "ECG Heart Monitor", "Differential amplifier + band-pass + 50 Hz notch", "The heart signal is about 1 mV between two electrodes, but the body picks up mains hum on both. A differential amplifier rejects the common hum, a band-pass keeps about 0.5 to 40 Hz, and a 50 Hz notch removes what is left.", "diff"],
      ["⚖️", "Strain-Gauge Bridge", "Wheatstone bridge (Chapter 4) + differential amplifier", "A bridge gives a few millivolts as V<sub>C</sub> − V<sub>D</sub>. The differential amplifier amplifies exactly that difference, while any voltage common to both points cancels.", "diff"],
      ["🔊", "Speaker Crossover", "Low-pass to the woofer, high-pass to the tweeter", "A 2-way speaker splits the music at about 3 kHz: a low-pass filter sends the bass to the big woofer, and a high-pass filter sends the treble to the small tweeter.", "rchpf"],
      ["🧪", "pH Probe", "Voltage follower", "A pH probe has a very high internal resistance (megaohms). Connected straight to a meter it would lose most of its voltage (the loading effect), so a voltage follower sits between them.", "loading"]
    ];
    el.innerHTML = `<div class="c5-real">${C.map(([i, t, c, d, go]) => `<article class="c5-rc"><span class="c5-ri" aria-hidden="true">${i}</span><div><h4>${t}</h4><p class="c5-rcc">${c}</p><p>${d}</p><a class="btn ghost small" href="#${go}" data-go="${go}">See the circuit ›</a></div></article>`).join("")}</div>`;
    el.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g && Lab.BY_ID[g.dataset.go]) { e.preventDefault(); Lab.scrollToSection(Lab.BY_ID[g.dataset.go]); } });
  }
  function mountFiltQuiz(el) {
    el.innerHTML = `<div class="c5-quiz"></div>`;
    quiz(el.querySelector(".c5-quiz"), [
      { q: "You need to remove 50 Hz mains hum from an ECG signal without losing the heartbeat.", opts: ["Band reject (notch)", "Low pass", "High pass", "All pass"], a: 0, why: "A notch (band-reject) filter at 50 Hz removes just the hum and lets the rest of the signal through." },
      { q: "A slow temperature signal has hiss at a few kilohertz on top.", opts: ["Low pass", "High pass", "Band reject", "All pass"], a: 0, why: "The wanted signal is slow (low frequency) and the hiss is fast, so a low-pass filter keeps the temperature and removes the hiss." },
      { q: "A vibration sensor's output slowly drifts up and down, but you only want the fast vibration.", opts: ["High pass", "Low pass", "Band reject", "All pass"], a: 0, why: "The drift is very low frequency. A high-pass filter blocks it (and any DC offset) and keeps the fast vibration." },
      { q: "You want only the heart-rate band (about 0.5 to 40 Hz) from a signal that has both slow drift and fast hiss.", opts: ["Band pass", "Low pass", "High pass", "Band reject"], a: 0, why: "A band-pass filter blocks both the slow drift below 0.5 Hz and the hiss above 40 Hz." },
      { q: "You must change a signal's timing (phase) without changing its size at any frequency.", opts: ["All pass", "Low pass", "Band pass", "High pass"], a: 0, why: "An all-pass filter keeps every frequency at the same size and only shifts the phase." },
      { q: "A tiny thermocouple signal needs amplifying AND its hum removed, in one stage.", opts: ["An active low-pass filter", "A passive low-pass filter", "A passive band-reject filter", "A passive high-pass filter"], a: 0, why: "An active filter can amplify while it filters. A passive filter can never give an output bigger than its input." }
    ]);
  }
  function mountCompare(el) {
    el.innerHTML = `<div class="table-wrap">
            <table class="cmp">
              <thead><tr><th scope="col"></th><th scope="col">Passive</th><th scope="col">Active</th></tr></thead>
              <tbody>
                <tr><th scope="row">Components</th><td>Resistors, capacitors and inductors only</td><td>Op-amps, transistors or FETs, plus resistors and capacitors. Usually no inductors.</td></tr>
                <tr><th scope="row">Power supply</th><td>None needed</td><td>Needs a DC supply</td></tr>
                <tr><th scope="row">Gain</th><td>At most 1 for RC and RL filters: the output is never larger than the input</td><td>Can be greater than 1, set accurately by the feedback resistors</td></tr>
                <tr><th scope="row">Effect of the load</th><td>The load changes the filter's characteristics</td><td>The op-amp buffers the output, so the load has little effect</td></tr>
                <tr><th scope="row">Frequency range</th><td>Works to very high frequencies, around 500 MHz</td><td>Limited by the op-amp, often to about 500 kHz</td></tr>
                <tr><th scope="row">Size and practicality</th><td>Inductors are bulky, dissipate power and create stray magnetic fields</td><td>Small, light and easy to integrate. Used for Butterworth, Chebyshev and Cauer designs.</td></tr>
                <tr><th scope="row">Drawbacks</th><td>No gain, and sensitive to loading</td><td>More sensitive to component and environmental changes</td></tr>
              </tbody>
            </table>
          </div>`;
  }
  function mountAmpQuiz(el) {
    el.innerHTML = `<div class="c5-quiz"></div>`;
    quiz(el.querySelector(".c5-quiz"), [
      { q: "A pH probe with a very high internal resistance must drive a meter without losing voltage. Which circuit goes in between?", opts: ["Voltage follower", "Inverting amplifier", "Differential amplifier", "Passive high-pass filter"], a: 0, why: "A voltage follower has a very high input impedance and a very low output impedance, so it isolates the probe from the meter." },
      { q: "Which amplifier gives an output that is upside down (180° out of phase)?", opts: ["Inverting amplifier", "Non-inverting amplifier", "Voltage follower", "None of them"], a: 0, why: "The inverting amplifier's gain is −R<sub>f</sub> / R<sub>1</sub>: the minus sign means the output is inverted." },
      { q: "An inverting amplifier has R<sub>1</sub> = 10 kΩ and R<sub>f</sub> = 100 kΩ, with ±15 V rails and V<sub>in</sub> = 2 V. What does a real op-amp give?", opts: ["About −13.5 V (it saturates)", "−20 V", "+20 V", "−0.2 V"], a: 0, why: "The ideal output is −10 × 2 = −20 V, beyond the ±13.5 V limit, so the output clips at about −13.5 V." },
      { q: "What is the smallest gain a non-inverting amplifier can have?", opts: ["1", "0", "−1", "10"], a: 0, why: "A<sub>v</sub> = 1 + R<sub>f</sub> / R<sub>1</sub> is always at least 1 (when R<sub>f</sub> = 0 it becomes a voltage follower)." },
      { q: "Two sensor wires pick up the same 1 V of hum. Which amplifier removes it?", opts: ["A differential amplifier with matched resistors", "An inverting amplifier", "A non-inverting amplifier", "A voltage follower"], a: 0, why: "A differential amplifier amplifies only V<sub>1</sub> − V<sub>2</sub>, so a voltage common to both inputs cancels, as long as R<sub>1</sub> = R<sub>3</sub> and R<sub>2</sub> = R<sub>4</sub>." },
      { q: "In a differential amplifier, when can you use V<sub>out</sub> = (R<sub>2</sub> / R<sub>1</sub>)(V<sub>1</sub> − V<sub>2</sub>)?", opts: ["Only when R<sub>1</sub> = R<sub>3</sub> and R<sub>2</sub> = R<sub>4</sub>", "Always", "Only when V<sub>1</sub> = V<sub>2</sub>", "Only with a load resistor"], a: 0, why: "The shortcut needs matched resistors. Otherwise, work it out by superposition." }
    ]);
  }
  const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  function mountDesign(el) {
    const opts = (decs, unit) => decs.flatMap((d) => E12.map((m) => m * d)).map((v) => `<option value="${v}">${eng(v, unit, 2)}</option>`).join("");
    el.innerHTML = `<div class="c5-dz">${chips("Challenge", [["gain", "Make a gain"], ["fc", "Make a cut-off frequency"]], "gain")}
      <div class="c5-ctl c5-dzcard"><p class="c5-target" id="dzT"></p><div class="c5-dzin" id="dzIn"></div><p class="c5-dzout" id="dzOut" aria-live="polite"></p>
      <p class="c5-dznew"><button type="button" class="btn ghost small" data-new>New target</button></p></div>
      <p class="small-note">Real resistors and capacitors only come in standard values. These are the E12 values (1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2, times a power of 10). Get within 5 % of the target.</p></div>`;
    let mode = "gain", target = 10;
    const $ = (s) => el.querySelector(s), G = [5, 10, 22, 47, 101], FCS = [50, 100, 159, 500, 1000];
    const setup = () => {
      if (mode === "gain") { $("#dzT").innerHTML = `🎯 Design a <strong>non-inverting amplifier</strong> with a gain of <strong>${target}</strong>.`; $("#dzIn").innerHTML = `<label><span>R<sub>1</sub></span> <select id="dzA">${opts([1e3, 10e3], "Ω")}</select></label><label><span>R<sub>f</sub></span> <select id="dzB">${opts([1e3, 10e3, 100e3], "Ω")}</select></label>`; }
      else { $("#dzT").innerHTML = `🎯 Design an <strong>RC low-pass filter</strong> with f<sub>c</sub> ≈ <strong>${eng(target, "Hz")}</strong>.`; $("#dzIn").innerHTML = `<label><span>R</span> <select id="dzA">${opts([1e3, 10e3, 100e3], "Ω")}</select></label><label><span>C</span> <select id="dzB">${opts([1e-9, 10e-9, 100e-9, 1e-6], "F")}</select></label>`; }
      calc();
    };
    const calc = () => {
      const a = +$("#dzA").value, b = +$("#dzB").value, got = mode === "gain" ? 1 + b / a : 1 / (TAU * a * b), err = ((got - target) / target) * 100, ok = Math.abs(err) <= 5;
      $("#dzOut").innerHTML = (mode === "gain" ? `A<sub>v</sub> = 1 + R<sub>f</sub> / R<sub>1</sub> = 1 + ${eng(b, "Ω")} / ${eng(a, "Ω")} = <strong>${num(got, 3)}</strong>` : `f<sub>c</sub> = 1 / (2πRC) = 1 / (2π × ${eng(a, "Ω")} × ${eng(b, "F")}) = <strong>${eng(got, "Hz")}</strong>`) +
        ` · ${num(Math.abs(err), 2)} % ${err >= 0 ? "above" : "below"} the target ${ok ? '<span class="c5-good">✓ Within 5 %. Well designed!</span>' : '<span class="c5-bad">Keep trying</span>'}`;
    };
    const fresh = () => { const L = mode === "gain" ? G : FCS; let t; do { t = L[Math.floor(Math.random() * L.length)]; } while (t === target && L.length > 1); target = t; setup(); };
    wireChips(el.querySelector(".chips-row"), (v) => { mode = v; fresh(); });
    el.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") calc(); });
    el.querySelector("[data-new]").addEventListener("click", fresh);
    setup();
  }
  function mountChain(el) {
    const B = [["Sensor", "Chapter 3", "a thermistor, strain gauge or thermocouple turns the quantity into R, V or charge"], ["Transduction circuit", "Chapter 4", "a divider or bridge turns the change into a voltage"], ["Signal conditioning: amplify and filter", "Chapter 5", "an amplifier makes millivolts into volts (a differential amp for a bridge), and a filter removes hum and hiss"], ["ADC and ESP32", "Chapter 6", "turns the clean voltage into numbers"]];
    el.innerHTML = `<ol class="c5-chain">${B.map(([t, c, d], i) => `<li><span class="c5-cn">${i + 1}</span><strong>${t}</strong><small>${c}</small><p>${d}</p></li>`).join("")}</ol>
      <p class="small-note">Every instrument you build follows this chain. Chapter 5 sits in the middle: it takes the small, noisy voltage from the transduction circuit and makes it big and clean enough for the ADC.</p>
      <div class="callout info"><strong>The order can change</strong><p>Usually amplify first (so the signal stays above the noise) and filter last (the low-pass before the ADC). Filter first when big noise or an offset would saturate the amplifier. An active filter does both in one stage.</p></div>`;
  }
  function mountSheet(el) {
    const R = [["Voltage follower", "A<sub>v</sub> = 1, V<sub>out</sub> = V<sub>in</sub>"], ["Inverting amplifier", "A<sub>v</sub> = −R<sub>f</sub> / R<sub>1</sub>"], ["Non-inverting amplifier", "A<sub>v</sub> = 1 + R<sub>f</sub> / R<sub>1</sub>; I<sub>L</sub> = V<sub>out</sub> / R<sub>L</sub>"],
      ["Differential amplifier", "V<sub>out</sub> = V<sub>1</sub> × R<sub>2</sub>/(R<sub>1</sub> + R<sub>2</sub>) × (1 + R<sub>4</sub>/R<sub>3</sub>) − V<sub>2</sub> × R<sub>4</sub>/R<sub>3</sub>; if R<sub>1</sub> = R<sub>3</sub>, R<sub>2</sub> = R<sub>4</sub>: V<sub>out</sub> = (R<sub>2</sub>/R<sub>1</sub>)(V<sub>1</sub> − V<sub>2</sub>)"],
      ["Saturation", "|V<sub>out</sub>| can't exceed about V<sub>CC</sub> − 1.5 V"], ["Loading effect", "V<sub>L</sub> = V<sub>s</sub> × R<sub>L</sub> / (R<sub>s</sub> + R<sub>L</sub>) without a buffer"],
      ["RC low-pass", "f<sub>c</sub> = 1/(2πRC); X<sub>C</sub> = 1/(2πfC); V<sub>out</sub> = V<sub>in</sub> × X<sub>C</sub> / √(R² + X<sub>C</sub>²)"], ["RC high-pass", "f<sub>c</sub> = 1/(2πRC); V<sub>out</sub> = V<sub>in</sub> × R / √(R² + X<sub>C</sub>²)"],
      ["RL low-pass", "f<sub>c</sub> = R/(2πL); X<sub>L</sub> = 2πfL; V<sub>out</sub> = V<sub>in</sub> × R / √(R² + X<sub>L</sub>²)"], ["2nd-order RC", "f<sub>c</sub> = 1/(2π√(R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>))"],
      ["Active 1st-order", "gain = 1 + R<sub>f</sub>/R<sub>g</sub>; V<sub>out</sub> = V<sub>in</sub> × (RC ratio) × gain"], ["Band-pass", "f<sub>L</sub> = 1/(2πR<sub>1</sub>C<sub>1</sub>); f<sub>H</sub> = 1/(2πR<sub>2</sub>C<sub>2</sub>); BW = f<sub>H</sub> − f<sub>L</sub>; f<sub>c</sub> = √(f<sub>L</sub>f<sub>H</sub>)"],
      ["Band-stop (twin-T)", "f<sub>notch</sub> = 1/(2πRC)"], ["Decibels", "gain (dB) = 20 log<sub>10</sub>(V<sub>out</sub>/V<sub>in</sub>); f<sub>c</sub> is at −3 dB (0.707)"]];
    el.innerHTML = `<div class="table-wrap"><table class="cmp c5-sheet"><thead><tr><th scope="col">Circuit</th><th scope="col">Formulas</th></tr></thead><tbody>${R.map(([a, b]) => `<tr><th scope="row">${a}</th><td>${b}</td></tr>`).join("")}</tbody></table></div>
      <p class="c5-printp"><button type="button" class="btn ghost small" data-print>🖨 Print or save as PDF</button></p>`;
    el.querySelector("[data-print]").addEventListener("click", () => { document.body.classList.add("c5-printing"); el.closest(".circuit").classList.add("c5-printme"); window.print(); setTimeout(() => { document.body.classList.remove("c5-printing"); el.closest(".circuit").classList.remove("c5-printme"); }, 500); });
  }

  const NEW_SECS = {
    loading: { id: "loading", group: "amp", toc: "Loading Effect", title: "Why Use a Voltage Follower? The Loading Effect", mount: mountLoading,
      intro: `<p>A real sensor is not a perfect voltage source: it has its own <strong>internal resistance R<sub>s</sub></strong> inside. When it drives a load R<sub>L</sub> directly, R<sub>s</sub> and R<sub>L</sub> share the voltage like a divider, so the load sees less than the real signal and the sensor has to supply the load current. A voltage follower in between fixes this.</p>`,
      after: `<h4 class="sub-h">Worked Example: 5 V Sensor, R<sub>s</sub> = 9 kΩ, R<sub>L</sub> = 1 kΩ</h4>
        <div class="c5-vs">
          <div class="c5-vsc bad"><p class="c5-vsh">✗ Without a follower</p><p>I<sub>L</sub> = 5 V / (9 kΩ + 1 kΩ)</p><p class="c5-vsr">I<sub>L</sub> = 500 µA</p><p>V<sub>L</sub> = 500 µA × 1 kΩ = 0.5 V: only 10 % of the signal reaches the load.</p></div>
          <div class="c5-vsc good"><p class="c5-vsh">✓ With a follower</p><p>V<sub>L</sub> = V<sub>s</sub> = 5 V</p><p class="c5-vsr">I<sub>L</sub> = 5 V / 1 kΩ = 5 mA</p><p>supplied by the op-amp. The sensor supplies almost nothing.</p></div>
        </div>
        <div class="callout info"><strong>Key idea</strong><p>The follower doesn't amplify the voltage. It <b>isolates</b> the sensor from the load: high input impedance (it takes almost no current) and low output impedance (it can supply the load).</p></div>` },
    ftypes: { id: "ftypes", group: "filt", toc: "Types of Filters", title: "Types of Filters", mount: mountFilterTypes,
      intro: `<p>Electronic filters are grouped two ways: by what they are <strong>built from</strong> (passive or active) and by <strong>which frequencies they pass</strong>. Each family has the same five types.</p>` },
    flab: { id: "flab", group: "filt", toc: "Filter Lab", title: "Filter Lab: Clean Up a Noisy Signal", mount: mountFilterLab,
      intro: `<p>Put the filters to work. A real sensor signal arrives with noise on it. Pick a situation, then move the cut-off frequency and watch the noise disappear on the oscilloscope while the signal you want stays.</p>` },
    real: { id: "real", group: "more", toc: "Real Situations", title: "Real Situations", mount: mountReal, intro: `<p>Where these circuits are used in real instruments.</p>` },
    ampquiz: { id: "ampquiz", group: "amp", toc: "Quick Check: Amplifiers", title: "Quick Check: Which Amplifier?", mount: mountAmpQuiz,
      intro: `<p>You have now seen all the amplifier circuits. Six quick questions to check you can tell them apart. The filters come next.</p>` },
    compare: { id: "compare", group: "filt", toc: "Passive vs Active", title: "Passive vs Active Filters", mount: mountCompare },
    fquiz: { id: "fquiz", group: "filt", toc: "Quick Check: Filters", title: "Quick Check: Which Filter Would You Use?", mount: mountFiltQuiz,
      intro: `<p>You have now seen every filter type. Six quick questions: pick the filter for each situation. When you are ready, the exercises for both parts are in the last section.</p>` },
    design: { id: "design", group: "more", toc: "Design Challenge", title: "Design Challenge: Real Component Values", mount: mountDesign, intro: `<p>Engineers can't buy any value they like. Pick standard values to hit the target.</p>` },
    chain: { id: "chain", group: "more", toc: "The Signal Chain", title: "The Whole Signal Chain", mount: mountChain },
    sheet: { id: "sheet", group: "more", toc: "Formula Sheet", title: "Formula Sheet", mount: mountSheet }
  };
  { const at = (id) => SECTIONS.findIndex((s) => s.id === id);
    SECTIONS.splice(at("follower") + 1, 0, NEW_SECS.loading);
    SECTIONS.splice(at("diff") + 1, 0, NEW_SECS.ampquiz);
    SECTIONS.splice(at("rclpf"), 0, NEW_SECS.ftypes);
    SECTIONS.splice(at("bandstop") + 1, 0, NEW_SECS.compare, NEW_SECS.flab, NEW_SECS.fquiz);
    SECTIONS.push(NEW_SECS.real, NEW_SECS.design, NEW_SECS.chain, NEW_SECS.sheet); }

  // the differential amplifier's noise test: one tap loads matched or mismatched resistors with 50 Hz hum
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hum]"); if (!b) return;
    const base = { V1: 2.5, V2: 2, R1: 10e3, R2: 47e3, R3: 10e3, R4: 47e3, Vcm: 1, Vcc: 15 };
    Lab.loadValues("diff", b.dataset.hum === "mis" ? Object.assign(base, { R4: 51.7e3 }) : base, false);
    const sc = document.querySelector("#diff .extra"); if (sc) sc.scrollIntoView({ behavior: Lab.reduceMotion ? "auto" : "smooth", block: "center" });
  });

  /* =====================================================================
     Exercises
     ===================================================================== */
  const EXERCISES = [
    { id: "ex-a1", sec: "follower", title: "Amplifier Exercise 1: Voltage Follower",
      q: `Calculate the gain and V<sub>o</sub> of this amplifier. Given V<sub>in</sub> = 15 V.`,
      runs: [{ vals: { Vin: 15, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: 1 }, { l: "V<sub>o</sub>", u: "V", v: 15 }],
      hints: [`In a voltage follower the output is wired straight back to the − input. What gain does that give?`, `The gain is 1, so V<sub>o</sub> = G × V<sub>in</sub>. Give the ideal value; don't clip it to the supply rails.`],
      note: `15 V is the ideal answer. With ±15 V supply rails a real op-amp output only reaches about ±13.5 V, so in practice the output would clip.` },
    { id: "ex-a0", title: "Amplifier Exercise 1b: The Loading Effect",
      q: `A sensor gives 3 V and has an internal resistance of 20 kΩ. It drives a 2 kΩ load. Calculate (a) the load current and (b) the load voltage when the sensor is connected directly, and (c) the load current when a voltage follower is placed between the sensor and the load.`,
      ans: [{ l: "(a) I<sub>L</sub> without a follower", u: "µA", v: 136.36 }, { l: "(b) V<sub>L</sub> without a follower", u: "V", v: 0.2727 }, { l: "(c) I<sub>L</sub> with a follower", u: "mA", v: 1.5 }],
      hints: [`Without a follower, the 20 kΩ inside the sensor and the 2 kΩ load are in series: I = V<sub>s</sub> / (R<sub>s</sub> + R<sub>L</sub>).`, `With a follower, the load gets the full sensor voltage, so I<sub>L</sub> = V<sub>s</sub> / R<sub>L</sub>. Watch the units: µA and mA.`],
      working: () => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml([
        step("(a) Without a follower: R<sub>s</sub> and R<sub>L</sub> in series", "I<sub>L</sub> = V<sub>s</sub> / (R<sub>s</sub> + R<sub>L</sub>)", "= 3 V / (20 kΩ + 2 kΩ) = 3 V / 22 kΩ", "I<sub>L</sub> = 136.4 µA"),
        step("(b) Voltage across the load", "V<sub>L</sub> = I<sub>L</sub> × R<sub>L</sub>", "= 136.4 µA × 2 kΩ", "V<sub>L</sub> = 0.273 V (only 9 % of the 3 V)"),
        step("(c) With a voltage follower", "V<sub>L</sub> = V<sub>s</sub>, so I<sub>L</sub> = V<sub>s</sub> / R<sub>L</sub>", "= 3 V / 2 kΩ", "I<sub>L</sub> = 1.5 mA, supplied by the op-amp; the sensor supplies almost nothing")])}</ol></div>` },
    { id: "ex-a2", sec: "inverting", title: "Amplifier Exercise 2: Inverting Amplifier",
      q: `Calculate the gain and V<sub>o</sub>. Given V<sub>in</sub> = 7 V, R<sub>1</sub> = 48 kΩ, R<sub>f</sub> = 200 kΩ.`,
      runs: [{ vals: { Vin: 7, R1: 48e3, Rf: 200e3, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: -4.167 }, { l: "V<sub>o</sub>", u: "V", v: -29.17 }],
      hints: [`For an inverting amplifier, G = −R<sub>f</sub> / R<sub>1</sub>. Keep the minus sign.`, `G = −200 kΩ / 48 kΩ. Then V<sub>o</sub> = G × 7 V. Give the ideal value; the output would saturate in practice.`],
      note: `The ideal V<sub>o</sub> of −29.17 V is beyond the ±13.5 V limit, so a real output would saturate at about −13.5 V.` },
    { id: "ex-a3", sec: "noninv", title: "Amplifier Exercise 3: Non-Inverting Amplifier",
      q: `Calculate the gain, V<sub>o</sub> and I<sub>L</sub>. Given V<sub>in</sub> = 5 V, R<sub>1</sub> = 20 kΩ, R<sub>F</sub> = 40 kΩ, R<sub>L</sub> = 4 kΩ.`,
      runs: [{ vals: { Vin: 5, R1: 20e3, Rf: 40e3, RL: 4e3, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: 3 }, { l: "V<sub>o</sub>", u: "V", v: 15 }, { l: "I<sub>L</sub>", u: "mA", v: 3.75 }],
      hints: [`For a non-inverting amplifier, G = 1 + R<sub>F</sub> / R<sub>1</sub>, then V<sub>o</sub> = G × V<sub>in</sub>.`, `I<sub>L</sub> = V<sub>o</sub> / R<sub>L</sub>. The answer box is in mA (1 mA = 0.001 A).`],
      note: `V<sub>o</sub> = 15 V is the ideal answer. It is above the ±13.5 V limit for ±15 V rails, so check the supply in a real circuit.` },
    { id: "ex-a4", sec: "diff", title: "Amplifier Exercise 4: Differential Amplifier",
      q: `Calculate the gain and V<sub>o</sub>. Given V<sub>1</sub> = 5 V, V<sub>2</sub> = 6 V, R<sub>1</sub> = R<sub>3</sub> = 10 kΩ, R<sub>2</sub> = R<sub>4</sub> = 38 kΩ.`,
      runs: [{ vals: { V1: 5, V2: 6, R1: 10e3, R2: 38e3, R3: 10e3, R4: 38e3, RL: null, Vcm: 0, Vcc: 15 } }],
      ans: [{ l: "Differential gain", u: "", v: 3.8 }, { l: "V<sub>o</sub>", u: "V", v: -3.8 }],
      hints: [`R<sub>1</sub> = R<sub>3</sub> and R<sub>2</sub> = R<sub>4</sub>, so the shortcut V<sub>o</sub> = (R<sub>2</sub>/R<sub>1</sub>)(V<sub>1</sub> − V<sub>2</sub>) applies. The differential gain is R<sub>2</sub>/R<sub>1</sub>.`, `Watch the order: V<sub>1</sub> − V<sub>2</sub> = 5 V − 6 V.`] },
    { id: "ex-f1", sec: "rclpf", title: "Filter Exercise 1: Passive Low-Pass Filter",
      q: `A passive low-pass filter has a 47 kΩ resistor in series with a 47 nF capacitor, connected across a 5 V sinusoidal supply. Calculate (a) the cut-off frequency and (b) V<sub>out</sub> at 100 Hz and at 10 kHz.`,
      runs: [{ label: "At f = 100 Hz", vals: { R: 47e3, C: 47e-9, Vin: 5, f: 100 } }, { label: "At f = 10 kHz", vals: { R: 47e3, C: 47e-9, Vin: 5, f: 10e3 } }],
      ans: [{ l: "f<sub>c</sub>", u: "Hz", v: 72.05 }, { l: "V<sub>out</sub> at 100 Hz", u: "V", v: 2.92 }, { l: "V<sub>out</sub> at 10 kHz", u: "mV", v: 36.0 }],
      hints: [`f<sub>c</sub> = 1 / (2πRC). For V<sub>out</sub>, first find X<sub>C</sub> = 1 / (2πfC) at each frequency.`, `V<sub>out</sub> = V<sub>in</sub> × X<sub>C</sub> / √(R² + X<sub>C</sub>²). At 10 kHz the answer is small: give it in mV.`], },
    { id: "ex-f2", sec: "rchpf", title: "Filter Exercise 2: Passive High-Pass Filter",
      q: `A passive high-pass filter has a 240 kΩ resistor in series with an 82 pF capacitor, connected across a 10 V sinusoidal supply. Calculate (a) the cut-off frequency and (b) V<sub>out</sub> at 100 Hz and at 10 kHz.`,
      runs: [{ label: "At f = 100 Hz", vals: { R: 240e3, C: 82e-12, Vin: 10, f: 100 } }, { label: "At f = 10 kHz", vals: { R: 240e3, C: 82e-12, Vin: 10, f: 10e3 } }],
      ans: [{ l: "f<sub>c</sub>", u: "kHz", v: 8.087 }, { l: "V<sub>out</sub> at 100 Hz", u: "V", v: 0.124 }, { l: "V<sub>out</sub> at 10 kHz", u: "V", v: 7.78 }],
      hints: [`The cut-off formula is the same as for the low-pass filter, f<sub>c</sub> = 1 / (2πRC). Give it in kHz.`, `In a high-pass filter the output is taken across R: V<sub>out</sub> = V<sub>in</sub> × R / √(R² + X<sub>C</sub>²).`], },
    { id: "ex-f3", sec: "active", title: "Filter Exercise 3: Active Low-Pass Filter",
      q: `A 1st-order active low-pass filter has a 1 kΩ resistor in series with a 1 µF capacitor and a 10 V source. The RC output feeds a non-inverting amplifier with a 10 kΩ feedback resistor and 10 kΩ from the inverting terminal to ground. Calculate V<sub>o</sub> at 100 Hz and at 10 kHz.`,
      runs: [{ label: "At f = 100 Hz", vals: { type: "lp", mode: "noninv", R: 1e3, C: 1e-6, Rg: 10e3, Rf: 10e3, Vin: 10, f: 100, Vcc: 15 } },
        { label: "At f = 10 kHz", vals: { type: "lp", mode: "noninv", R: 1e3, C: 1e-6, Rg: 10e3, Rf: 10e3, Vin: 10, f: 10e3, Vcc: 15 } }],
      ans: [{ l: "f<sub>c</sub>", u: "Hz", v: 159.2 }, { l: "V<sub>o</sub> at 100 Hz", u: "V", v: 16.93 }, { l: "V<sub>o</sub> at 10 kHz", u: "V", v: 0.318 }],
      hints: [`The RC stage is a low-pass filter with f<sub>c</sub> = 1 / (2πRC). The amplifier gain is 1 + 10 kΩ / 10 kΩ.`, `V<sub>o</sub> = V<sub>in</sub> × X<sub>C</sub> / √(R² + X<sub>C</sub>²) × gain. Give the ideal value, even if it is above the supply rails.`],
      note: `16.93 V is the ideal answer (gain 1 + 10k/10k = 2). With ±15 V rails the output can only reach about 13.5 V, so a real circuit would clip at 100 Hz.` }
  ];

  Lab.page({
    topic: 5,
    collapseWorking: true,
    exerciseCarousel: true,
    sections: SECTIONS,
    groups: [
      { key: "why", list: "#whyList" },
      { key: "amp", list: "#ampList", toc: "#ampToc" },
      { key: "filt", list: "#filtList", toc: "#filtToc" },
      { key: "more", list: "#moreList", toc: "#moreToc" }
    ],
    exercises: EXERCISES
  });
})();
