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
    const A = axes({ x: [0, span], y: [-ymax, ymax], xt: [0, T0, span], fx: (q) => eng(q, "s", 3), yt: [-ymax / 1.15, 0, ymax / 1.15], fy: (q) => eng(q, "V", 3), l: 62, xl: "Time", yl: "", H: 220 });
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
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene cond" viewBox="0 0 640 230" role="img" aria-label="A thermocouple gives a few millivolts with 50 hertz hum; an amplifier multiplies it by 500; a low-pass filter removes the hum; the ESP32 reads a clean 0 to 3 volt signal."></svg></div></figure><div class="pv-pl"></div><p class="pv-read"></p></div>`;
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
      s += `<rect class="espbig" x="600" y="80" width="36" height="50" rx="6"/>${T(618, 110, "ESP32", "middle", "small inv")}<line class="flow-l" x1="596" y1="105" x2="600" y2="105"/>`;
      s += T(320, 214, `now: sensor ${mV} mV → amplified ${(mV * 0.5).toFixed(2)} V → ADC code ${Math.round((mV * 0.5 * 4095) / 3.3)}`, "middle", "small");
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
      after: `<div class="callout info"><strong>Common mistake: brackets in the divider</strong>V<sub>+</sub> = ${n("V1")} × ${n("R2")} / (${n("R1")} + ${n("R2")}). Without the brackets, a calculator works out R<sub>2</sub>/R<sub>1</sub> + R<sub>2</sub>, which is wrong.</div>`
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
        F("mode", "sel", "noninv", null, { label: "Amplifier", options: [["noninv", "Non-inverting, gain 1 + Rf/Rg"], ["unity", "Unity gain (voltage follower)"]] }),
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
            D.res(300, 150, 370, 150) + T(335, 141, "Rf") + D.wire([370, 150], [420, 150], [420, 80]);
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
     Exercises
     ===================================================================== */
  const EXERCISES = [
    { id: "ex-a1", sec: "follower", title: "Amplifier Exercise 1: Voltage Follower",
      q: `Calculate the gain and V<sub>o</sub> of this amplifier. Given V<sub>in</sub> = 15 V.`,
      runs: [{ vals: { Vin: 15, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: 1 }, { l: "V<sub>o</sub>", u: "V", v: 15 }],
      hints: [`In a voltage follower the output is wired straight back to the − input. What gain does that give?`, `The gain is 1, so V<sub>o</sub> = G × V<sub>in</sub>. Give the ideal value; don't clip it to the supply rails.`],
      note: `15 V is the ideal answer. With ±15 V supply rails a real op-amp output only reaches about ±13.5 V, so in practice the output would clip.` },
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
      { key: "filt", list: "#filtList", toc: "#filtToc", extraToc: `<li><a href="#compare">Passive vs active</a></li>` }
    ],
    exercises: EXERCISES
  });
})();
