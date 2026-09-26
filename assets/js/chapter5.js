/* NMK42003 Chapter 5: Signal Conditioning (Amplifiers & Filters)
   Live calculators, circuit diagrams, Bode plots and exercises. Ideal op-amp throughout. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAU = 2 * Math.PI;
  const MINUS = "−";
  const RAIL_DROP = 1.5; // op-amp output saturates at ±(Vcc − 1.5 V)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =====================================================================
     Number formatting
     ===================================================================== */
  const PREFIXES = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const sgn = (x) => (x < 0 ? MINUS : "");

  // Plain number to 4 significant figures; scientific notation when very large or small.
  function num(x, sig = 4) {
    if (!isFinite(x)) return (x < 0 ? MINUS : "") + "∞";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return sgn(x) + Number(a.toPrecision(sig)).toString();
    const [m, e] = a.toExponential(sig - 1).split("e");
    return `${sgn(x)}${Number(m)} × 10<sup>${e[0] === "-" ? MINUS + e.slice(1) : e.slice(1)}</sup>`;
  }

  // Engineering notation with an SI prefix: eng(47000, "Ω") → "47 kΩ".
  function eng(x, unit, sig = 4) {
    if (!isFinite(x)) return `${x < 0 ? MINUS : ""}∞ ${unit}`;
    if (x === 0) return `0 ${unit}`;
    const a = Math.abs(x);
    let i = PREFIXES.findIndex(([m]) => a >= m);
    if (i < 0) i = PREFIXES.length - 1;
    let m = Number((a / PREFIXES[i][0]).toPrecision(sig));
    if (m >= 1000 && i > 0) { i--; m = Number((a / PREFIXES[i][0]).toPrecision(sig)); }
    return `${sgn(x)}${m} ${PREFIXES[i][1]}${unit}`;
  }

  const P = (x, u) => (x < 0 ? `(${eng(x, u)})` : eng(x, u)); // bracket negatives when substituting
  const PN = (x) => (x < 0 ? `(${num(x)})` : num(x));
  const dB = (ratio) => 20 * Math.log10(ratio);
  const fmtDb = (d) => (isFinite(d) ? `${num(Math.round(d * 100) / 100, 3)} dB` : `${MINUS}∞ dB`);
  const same = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b));

  // "R1" → R<sub>1</sub>, "Vout" → V<sub>out</sub>
  function n(k) {
    if (k === "Vcc") return "V<sub>CC</sub>";
    const m = /^([A-Za-z])([A-Za-z0-9+−]+)$/.exec(k);
    return m ? `${m[1]}<sub>${m[2]}</sub>` : k;
  }

  /* =====================================================================
     Input kinds
     ===================================================================== */
  const KINDS = {
    R: { units: [["Ω", 1], ["kΩ", 1e3], ["MΩ", 1e6]], si: "Ω", positive: true },
    C: { units: [["pF", 1e-12], ["nF", 1e-9], ["µF", 1e-6]], si: "F", positive: true },
    L: { units: [["µH", 1e-6], ["mH", 1e-3], ["H", 1]], si: "H", positive: true },
    f: { units: [["Hz", 1], ["kHz", 1e3], ["MHz", 1e6]], si: "Hz", positive: true, slider: "log" },
    V: { units: [["V", 1]], si: "V", slider: "lin" },
    Vac: { units: [["V", 1]], si: "V", positive: true },
    Vcc: { units: [["V", 1]], si: "V" }
  };

  // Field definition helper: F("R1", "R", 10e3, "input resistor")
  const F = (k, kind, d, hint, extra) => Object.assign({ k, kind, d, hint }, extra);
  const VCC = () => F("Vcc", "Vcc", 15, null, { label: "Supply rails ±V<sub>CC</sub>" });

  /* =====================================================================
     Circuit drawing helpers (SVG)
     ===================================================================== */
  const D = {
    wire: (...p) => `<polyline class="w" points="${p.map((q) => q.join(",")).join(" ")}"/>`,
    dot: (x, y) => `<circle class="dot" cx="${x}" cy="${y}" r="3"/>`,
    term: (x, y) => `<circle class="term" cx="${x}" cy="${y}" r="4"/>`,
    gnd: (x, y) => `<path class="w" d="M${x},${y}v6M${x - 12},${y + 6}h24M${x - 7},${y + 11}h14M${x - 3},${y + 16}h6"/>`,
    text: (x, y, html, anchor = "middle") => `<text x="${x}" y="${y}" text-anchor="${anchor}">${html}</text>`,
    // Resistor between two points on a horizontal or vertical line (left→right or top→bottom)
    res(x1, y1, x2, y2) {
      const h = y1 === y2, a = ((h ? x2 - x1 : y2 - y1) - 36) / 2;
      const d = h
        ? `M${x1},${y1}h${a}l3,-7l6,14l6,-14l6,14l6,-14l6,14l3,-7h${a}`
        : `M${x1},${y1}v${a}l7,3l-14,6l14,6l-14,6l14,6l-14,6l7,3v${a}`;
      return `<path class="w" d="${d}"/>`;
    },
    cap(x1, y1, x2, y2) {
      const h = y1 === y2, a = ((h ? x2 - x1 : y2 - y1) - 8) / 2;
      return h
        ? `<path class="w" d="M${x1},${y1}h${a}M${x1 + a},${y1 - 12}v24M${x1 + a + 8},${y1 - 12}v24M${x1 + a + 8},${y1}h${a}"/>`
        : `<path class="w" d="M${x1},${y1}v${a}M${x1 - 12},${y1 + a}h24M${x1 - 12},${y1 + a + 8}h24M${x1},${y1 + a + 8}v${a}"/>`;
    },
    ind(x1, y, x2) {
      const a = (x2 - x1 - 40) / 2;
      return `<path class="w" d="M${x1},${y}h${a}a5,5 0 0 1 10,0a5,5 0 0 1 10,0a5,5 0 0 1 10,0a5,5 0 0 1 10,0h${a}"/>`;
    },
    // Op-amp with inputs at (x, y∓20) and output at (x+80, y)
    opamp(x, y, plusTop) {
      const [top, bot] = plusTop ? ["+", MINUS] : [MINUS, "+"];
      return `<path class="op" d="M${x},${y - 45}L${x + 80},${y}L${x},${y + 45}Z"/>` +
        `<text class="sign" x="${x + 12}" y="${y - 15}" text-anchor="middle">${top}</text>` +
        `<text class="sign" x="${x + 12}" y="${y + 25}" text-anchor="middle">${bot}</text>`;
    }
  };

  function svgName(k) {
    const m = /^([A-Za-z])([A-Za-z0-9]+)$/.exec(k);
    return m ? `${m[1]}<tspan class="sb" dy="4">${m[2]}</tspan><tspan dy="-4">` : `${esc(k)}<tspan>`;
  }

  /* =====================================================================
     Shared calculation steps
     ===================================================================== */
  const step = (t, f, s, r) => ({ t, f, s, r });

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

  // Bisection in log-frequency for mag(f) = target, between lo and hi.
  function crossing(mag, target, lo, hi) {
    let a = Math.log10(lo), b = Math.log10(hi);
    const g = (x) => mag(10 ** x) - target, ga = g(a);
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if ((g(m) > 0) === (ga > 0)) a = m; else b = m; }
    return 10 ** ((a + b) / 2);
  }

  /* =====================================================================
     Circuits
     ===================================================================== */
  const AMP_VIEW = "0 0 520 230";
  const FILT_VIEW = "0 0 520 200";

  const SECTIONS = [
    /* ---------------- Voltage follower ---------------- */
    {
      id: "follower", group: "amp", title: "Voltage follower", view: AMP_VIEW,
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
      id: "inverting", group: "amp", title: "Inverting amplifier", view: AMP_VIEW,
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
      },
      after: `<div class="callout note"><strong>Notes on the slides</strong>The inverting amplifier summary says “If Rf = R1, the G = −Vin”. Gain is a ratio with no unit, so this should read G = −1, which gives ${n("Vout")} = −${n("Vin")}.<br>
        The same summary says “If Rf &gt; R1, the G &gt; 1” and “If Rf &lt; R1, the G &lt; 1”. The gain of an inverting amplifier is always negative, so these should compare its size: |G| &gt; 1 and |G| &lt; 1.</div>`
    },

    /* ---------------- Non-inverting ---------------- */
    {
      id: "noninv", group: "amp", title: "Non-inverting amplifier", view: AMP_VIEW,
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
      },
      after: `<div class="callout note"><strong>Note on the slides</strong>The feedback equation is written with R2 (“V<sub>IN</sub> = V<sub>OUT</sub> R1 / (R1 + R2)”), but the gain formula on the same slide uses Rf. They are the same feedback resistor, so ${n("Vin")} = ${n("Vout")} × ${n("R1")} / (${n("R1")} + ${n("Rf")}), which rearranges to ${n("Av")} = 1 + ${n("Rf")} / ${n("R1")}.</div>`
    },

    /* ---------------- Differential ---------------- */
    {
      id: "diff", group: "amp", title: "Differential amplifier", view: AMP_VIEW,
      intro: `<p>A differential amplifier amplifies the <em>difference</em> between two inputs. ${n("V1")} reaches the + input through the divider ${n("R1")}, ${n("R2")}. ${n("V2")} reaches the − input through ${n("R3")}, with ${n("R4")} as the feedback resistor.</p>
        <p>Work it out by <strong>superposition</strong>. First find the output due to ${n("V1")} alone (${n("V2")} grounded), then the output due to ${n("V2")} alone (${n("V1")} grounded), and add them. When ${n("R1")} = ${n("R3")} and ${n("R2")} = ${n("R4")}, this simplifies to ${n("Vout")} = (${n("R2")} / ${n("R1")})(${n("V1")} − ${n("V2")}). Anything common to both inputs then cancels, such as interference picked up equally on two sensor wires. That's why this circuit is used with strain-gauge bridges and thermocouples. Try the common-mode offset input to see it.</p>`,
      inputs: [F("V1", "V", 5, "to the + side"), F("V2", "V", 6, "to the − side"), F("R1", "R", 10e3), F("R2", "R", 38e3), F("R3", "R", 10e3), F("R4", "R", 38e3, "feedback"),
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
      after: `<div class="callout note"><strong>Note on the slides</strong>The divider is written as “V+ = V1 (R2 / R1 + R2)”. Without brackets that reads as R2/R1 + R2. It must be V<sub>+</sub> = ${n("V1")} × ${n("R2")} / (${n("R1")} + ${n("R2")}).</div>`
    },

    /* ---------------- Passive RC low-pass ---------------- */
    {
      id: "rclpf", group: "filt", toc: "RC low-pass", title: "Passive RC low-pass filter (1st order)", view: FILT_VIEW, bode: true,
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
      after: `<div class="callout note"><strong>Note on the slides</strong>The low-pass slide says that at the end of the transition band “the gain becomes zero”. The gain gets very small but never reaches zero: a 1st-order filter keeps falling by 20 dB per decade, as the graph shows. At 100 × f<sub>c</sub> the output is still about 1% of the input.</div>`
    },

    /* ---------------- Passive RC high-pass ---------------- */
    {
      id: "rchpf", group: "filt", toc: "RC high-pass", title: "Passive RC high-pass filter (1st order)", view: FILT_VIEW, bode: true,
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
      id: "rllpf", group: "filt", toc: "RL low-pass", title: "Passive RL low-pass filter (1st order)", view: FILT_VIEW, bode: true,
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
      id: "rc2", group: "filt", toc: "2nd-order RC low-pass", title: "Passive RC low-pass filter (2nd order)", view: FILT_VIEW, bode: true,
      intro: `<p>This is two RC low-pass stages in a row. Above the cut-off the output falls twice as fast as with a single stage, 40 dB per decade instead of 20, so noise is rejected more strongly.</p>
        <p>The slides give f<sub>c</sub> = 1 / (2π√(R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>)). The working and the graph also use the exact response of the two connected stages, which shows where the output really falls by 3 dB.</p>`,
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
          step("Cut-off frequency (slide formula)", "f<sub>c</sub> = 1 / (2π √(R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>))",
            `= 1 / (2π √(${eng(v.R1, "Ω")} × ${eng(v.C1, "F")} × ${eng(v.R2, "Ω")} × ${eng(v.C2, "F")}))`, `f<sub>c</sub> = ${eng(fcs, "Hz")}`),
          step("Angular frequency", "ω = 2π f", `= 2π × ${eng(v.f, "Hz")}`, `ω = ${num(w)} rad/s`),
          step("Circuit constants", "a = R<sub>1</sub>C<sub>1</sub>R<sub>2</sub>C<sub>2</sub>, b = R<sub>1</sub>C<sub>1</sub> + R<sub>2</sub>C<sub>2</sub> + R<sub>1</sub>C<sub>2</sub>",
            `b = ${num(v.R1 * v.C1)} s + ${num(v.R2 * v.C2)} s + ${num(v.R1 * v.C2)} s`, `a = ${num(a)} s², b = ${num(b)} s`),
          step("Exact gain of the two connected stages", "|H| = 1 / √((1 − ω²a)² + (ωb)²)",
            `= 1 / √((1 − ${num(w * w * a)})² + (${num(w * b)})²)`, `|H| = ${num(H)}`),
          step("Output voltage", `${n("Vout")} = ${n("Vin")} × |H|`, `= ${eng(v.Vin, "V")} × ${num(H)}`, `${n("Vout")} = ${eng(vout, "V")}`),
          gainDbStep(vout, v.Vin),
          step("True −3 dB point", "Solve |H| = 1/√2 = 0.7071 numerically", "",
            `f<sub>−3 dB</sub> = ${eng(f3, "Hz")}, which is ${num((100 * f3) / fcs, 3)}% of the slide formula's f<sub>c</sub>`)
        ];
        const notes = [
          { type: "info", title: "Why two cut-off values?", html: `The slide formula treats the two RC stages as if they didn't affect each other. In a passive cascade the second stage loads the first, so the true −3 dB point is lower: here ${eng(f3, "Hz")} instead of ${eng(fcs, "Hz")}. The graph shows the exact response. Putting a buffer between the stages (an active filter), or making R<sub>2</sub> much larger than R<sub>1</sub>, reduces the difference.` },
          bandNote(v.f, f3, "low", 40)
        ];
        return { steps, notes, vout, sum: `f<sub>c</sub> (formula) = ${eng(fcs, "Hz")}, true f<sub>−3 dB</sub> = ${eng(f3, "Hz")}, ${n("Vout")} = ${eng(vout, "V")}`,
          bode: { mag, marks: [{ f: fcs, label: "fc formula" }, { f: f3, label: "−3 dB" }], ref: -3 } };
      }
    },

    /* ---------------- Active 1st-order LPF / HPF ---------------- */
    {
      id: "active", group: "filt", toc: "Active low/high-pass", title: "Active filter (1st order, low-pass or high-pass)", view: "0 0 520 240", bode: true,
      intro: `<p>A passive RC stage followed by an op-amp. The op-amp buffers the RC stage, so the load can't shift the cut-off frequency. As a non-inverting amplifier it can also add gain, ${n("Av")} = 1 + ${n("Rf")} / ${n("Rg")}. Without ${n("Rf")} and ${n("Rg")} it is a voltage follower with a gain of 1.</p>
        <p>The cut-off is still f<sub>c</sub> = 1 / (2πRC). Choose low-pass or high-pass below: the positions of R and C swap, and the amplifier stays the same. Because the op-amp can add gain, check the output against the supply rails.</p>`,
      inputs: [
        F("type", "sel", "lp", null, { label: "Filter type", options: [["lp", "Low-pass"], ["hp", "High-pass"]] }),
        F("mode", "sel", "noninv", null, { label: "Amplifier", options: [["noninv", "Non-inverting, gain 1 + Rf/Rg"], ["unity", "Unity gain (voltage follower)"]] }),
        F("R", "R", 1e3), F("C", "C", 1e-6),
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
      id: "bandpass", group: "filt", toc: "Band-pass", title: "Band-pass filter (high-pass then low-pass)", view: FILT_VIEW, bode: true,
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
      id: "bandstop", group: "filt", toc: "Band-stop (twin-T)", title: "Band-stop filter (twin-T notch)", view: "0 0 520 240", bode: true,
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

  // Shared frame for two-rail passive filters: Vin on the left, Vout on the right.
  function filterFrame(T) {
    return D.term(90, 60) + T(82, 64, "Vin", "end") + D.term(90, 160) + T(82, 164, "f", "end") +
      D.wire([94, 160], [466, 160]) + D.term(470, 60) + D.term(470, 160) + T(474, 44, "Vout", "end");
  }

  /* =====================================================================
     Exercises (lecture slides)
     ===================================================================== */
  const EXERCISES = [
    { id: "ex-a1", sec: "follower", title: "Amplifier exercise 1: voltage follower",
      q: `Calculate the gain and V<sub>o</sub> of this amplifier. Given V<sub>in</sub> = 15 V.`,
      runs: [{ vals: { Vin: 15, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: 1 }, { l: "V<sub>o</sub>", u: "V", v: 15 }],
      note: `15 V is the ideal answer. With ±15 V supply rails a real op-amp output only reaches about ±13.5 V, so in practice the output would clip.` },
    { id: "ex-a2", sec: "inverting", title: "Amplifier exercise 2: inverting amplifier",
      q: `Calculate the gain and V<sub>o</sub>. Given V<sub>in</sub> = 7 V, R<sub>1</sub> = 48 kΩ, R<sub>f</sub> = 200 kΩ.`,
      runs: [{ vals: { Vin: 7, R1: 48e3, Rf: 200e3, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: -4.167 }, { l: "V<sub>o</sub>", u: "V", v: -29.17 }],
      note: `<strong>Note on the slides:</strong> the text gives R<sub>1</sub> = 48 kΩ, R<sub>f</sub> = 200 kΩ and V<sub>in</sub> = 7 V, but the drawing shows 10 kΩ and 100 kΩ, V<sub>in</sub> = 1 V, and the input on the + terminal. This page uses the values in the text with a correct inverting circuit. The ideal V<sub>o</sub> of −29.17 V is beyond the ±13.5 V limit, so a real output would saturate at about −13.5 V.` },
    { id: "ex-a3", sec: "noninv", title: "Amplifier exercise 3: non-inverting amplifier",
      q: `Calculate the gain, V<sub>o</sub> and I<sub>L</sub>. Given V<sub>in</sub> = 5 V, R<sub>1</sub> = 20 kΩ, R<sub>F</sub> = 40 kΩ, R<sub>L</sub> = 4 kΩ.`,
      runs: [{ vals: { Vin: 5, R1: 20e3, Rf: 40e3, RL: 4e3, Vcc: 15 } }],
      ans: [{ l: "Gain, G", u: "", v: 3 }, { l: "V<sub>o</sub>", u: "V", v: 15 }, { l: "I<sub>L</sub>", u: "mA", v: 3.75 }],
      note: `V<sub>o</sub> = 15 V is the ideal answer. It is above the ±13.5 V limit for ±15 V rails, so check the supply in a real circuit.` },
    { id: "ex-a4", sec: "diff", title: "Amplifier exercise 4: differential amplifier",
      q: `Calculate the gain, V<sub>o</sub> and I<sub>L</sub>. Given V<sub>1</sub> = 5 V, V<sub>2</sub> = 6 V, R<sub>1</sub> = R<sub>3</sub> = 10 kΩ, R<sub>2</sub> = R<sub>4</sub> = 38 kΩ.`,
      runs: [{ vals: { V1: 5, V2: 6, R1: 10e3, R2: 38e3, R3: 10e3, R4: 38e3, RL: null, Vcm: 0, Vcc: 15 } }],
      ans: [{ l: "Differential gain", u: "", v: 3.8 }, { l: "V<sub>o</sub>", u: "V", v: -3.8 }],
      note: `<strong>Note on the slides:</strong> this exercise also asks for I<sub>L</sub>, but no load resistor is given, so I<sub>L</sub> can't be found from the data. Enter a value in the calculator's optional R<sub>L</sub> field to see I<sub>L</sub> = V<sub>o</sub> / R<sub>L</sub>.` },
    { id: "ex-f1", sec: "rclpf", title: "Filter exercise 1: passive low-pass filter",
      q: `A passive low-pass filter has a 47 kΩ resistor in series with a 47 nF capacitor, connected across a 5 V sinusoidal supply. Calculate (a) the cut-off frequency and (b) V<sub>out</sub> at 100 Hz and at 10 kHz.`,
      runs: [{ label: "At f = 100 Hz", vals: { R: 47e3, C: 47e-9, Vin: 5, f: 100 } }, { label: "At f = 10 kHz", vals: { R: 47e3, C: 47e-9, Vin: 5, f: 10e3 } }],
      ans: [{ l: "f<sub>c</sub>", u: "Hz", v: 72.05 }, { l: "V<sub>out</sub> at 100 Hz", u: "V", v: 2.92 }, { l: "V<sub>out</sub> at 10 kHz", u: "mV", v: 36.0 }] },
    { id: "ex-f2", sec: "rchpf", title: "Filter exercise 2: passive high-pass filter",
      q: `A passive high-pass filter has a 240 kΩ resistor in series with an 82 pF capacitor, connected across a 10 V sinusoidal supply. Calculate (a) the cut-off frequency and (b) V<sub>out</sub> at 100 Hz and at 10 kHz.`,
      runs: [{ label: "At f = 100 Hz", vals: { R: 240e3, C: 82e-12, Vin: 10, f: 100 } }, { label: "At f = 10 kHz", vals: { R: 240e3, C: 82e-12, Vin: 10, f: 10e3 } }],
      ans: [{ l: "f<sub>c</sub>", u: "kHz", v: 8.087 }, { l: "V<sub>out</sub> at 100 Hz", u: "V", v: 0.124 }, { l: "V<sub>out</sub> at 10 kHz", u: "V", v: 7.78 }] },
    { id: "ex-f3", sec: "active", title: "Filter exercise 3: active low-pass filter",
      q: `A 1st-order active low-pass filter has a 1 kΩ resistor in series with a 1 µF capacitor and a 10 V source. The RC output feeds a non-inverting amplifier with a 10 kΩ feedback resistor and 10 kΩ from the inverting terminal to ground. Calculate V<sub>o</sub> at 100 Hz and at 10 kHz.`,
      runs: [{ label: "At f = 100 Hz", vals: { type: "lp", mode: "noninv", R: 1e3, C: 1e-6, Rg: 10e3, Rf: 10e3, Vin: 10, f: 100, Vcc: 15 } },
        { label: "At f = 10 kHz", vals: { type: "lp", mode: "noninv", R: 1e3, C: 1e-6, Rg: 10e3, Rf: 10e3, Vin: 10, f: 10e3, Vcc: 15 } }],
      ans: [{ l: "f<sub>c</sub>", u: "Hz", v: 159.2 }, { l: "V<sub>o</sub> at 100 Hz", u: "V", v: 16.93 }, { l: "V<sub>o</sub> at 10 kHz", u: "V", v: 0.318 }],
      note: `16.93 V is the ideal answer (gain 1 + 10k/10k = 2). With ±15 V rails the output can only reach about 13.5 V, so a real circuit would clip at 100 Hz.` }
  ];

  /* =====================================================================
     Building the calculators
     ===================================================================== */
  const BY_ID = {};
  // Look up a field inside its section (works before the section is added to the page).
  const byId = (sec, id) => sec.el.querySelector(`[id="${id}"]`);

  function fieldHtml(sec, f) {
    const id = `${sec.id}-${f.k}`;
    if (f.kind === "sel") {
      return `<div class="field" data-k="${f.k}"><label for="${id}">${f.label}</label>
        <div class="ctl"><select id="${id}">${f.options.map(([val, l]) => `<option value="${val}">${esc(l)}</option>`).join("")}</select></div></div>`;
    }
    const K = KINDS[f.kind];
    const units = K.units.length > 1
      ? `<select id="${id}-u" aria-label="${f.k} unit">${K.units.map(([u], i) => `<option value="${i}">${u}</option>`).join("")}</select>`
      : `<span class="unit">${K.units[0][0]}</span>`;
    const slider = K.slider === "log"
      ? `<input type="range" id="${id}-s" min="0" max="6" step="0.01" aria-label="${f.k} slider, 1 Hz to 1 MHz">`
      : K.slider === "lin" ? `<input type="range" id="${id}-s" min="-15" max="15" step="0.1" aria-label="${f.k} slider, −15 V to 15 V">` : "";
    return `<div class="field" data-k="${f.k}">
      <label for="${id}">${f.label || n(f.k)}${f.hint ? ` <span class="hint">${f.hint}</span>` : ""}</label>
      <div class="ctl"><input id="${id}" type="number" step="any"${K.positive || f.kind === "Vcc" ? ' inputmode="decimal"' : ""}${f.opt ? ' placeholder="optional"' : ""} aria-describedby="${id}-err">${units}</div>
      ${slider}
      <p class="err" id="${id}-err" hidden></p>
    </div>`;
  }

  function setField(sec, f, si) {
    const inp = byId(sec, `${sec.id}-${f.k}`);
    if (f.kind === "sel") { inp.value = si; return; }
    const units = KINDS[f.kind].units, us = byId(sec, `${sec.id}-${f.k}-u`);
    if (si === null || si === undefined) { inp.value = ""; if (us) us.value = 1; return; } // blank optional field: offer the middle unit (e.g. kΩ)
    let i = 0;
    units.forEach(([, m], j) => { if (Math.abs(si) >= m * 0.9999) i = j; });
    if (us) us.value = i;
    inp.value = Number((si / units[i][1]).toPrecision(6));
  }

  function readField(sec, f) {
    const inp = byId(sec, `${sec.id}-${f.k}`);
    if (f.kind === "sel") return { val: inp.value };
    if (inp.validity && inp.validity.badInput) return { err: "Enter a number." };
    const raw = inp.value.trim();
    if (raw === "") return f.opt ? { val: null } : { err: "Enter a value." };
    const K = KINDS[f.kind], us = byId(sec, `${sec.id}-${f.k}-u`);
    const si = Number(raw) * K.units[us ? +us.value : 0][1];
    if (!isFinite(si)) return { err: "Enter a number." };
    if (K.positive && si <= 0) return { err: `${f.k} must be greater than 0.` };
    if (f.kind === "Vcc" && si <= RAIL_DROP) return { err: "Must be more than 1.5 V so the output has room to swing." };
    return { val: si };
  }

  function update(sec) {
    const v = {}, lab = {};
    let bad = 0;
    sec.inputs.filter((f) => f.kind === "sel").forEach((f) => { v[f.k] = readField(sec, f).val; });
    sec.inputs.forEach((f) => {
      if (f.kind === "sel") return;
      const wrap = sec.el.querySelector(`.field[data-k="${f.k}"]`), shown = !f.show || f.show(v);
      wrap.hidden = !shown;
      if (!shown) return;
      const r = readField(sec, f);
      const inp = byId(sec, `${sec.id}-${f.k}`), err = byId(sec, `${sec.id}-${f.k}-err`);
      if (r.err) {
        bad++; lab[f.k] = "?";
        inp.setAttribute("aria-invalid", "true"); err.textContent = r.err; err.hidden = false;
      } else {
        v[f.k] = r.val; lab[f.k] = r.val === null ? null : eng(r.val, KINDS[f.kind].si);
        inp.removeAttribute("aria-invalid"); err.hidden = true;
        const s = byId(sec, `${sec.id}-${f.k}-s`);
        if (s && r.val !== null && document.activeElement !== s) s.value = KINDS[f.kind].slider === "log" ? Math.log10(r.val) : r.val;
      }
    });

    const res = bad ? null : sec.compute(v);
    lab.Vout = res ? eng(res.vout, "V") : "?";
    lab.over = !!(res && res.over);

    const T = (x, y, k, anchor = "middle") => {
      const val = lab[k] === undefined ? "?" : lab[k];
      const cls = val === "?" ? "val bad" : k === "Vout" && lab.over ? "val over" : "val";
      return D.text(x, y, `${svgName(k)} = </tspan><tspan class="${cls}">${val}</tspan>`, anchor);
    };
    sec.el.querySelector(".ckt-wrap").innerHTML =
      `<svg class="ckt" viewBox="${sec.view}" role="img" aria-label="Circuit diagram: ${esc(sec.title)}">${sec.diagram(T, lab, v)}</svg>`;

    const result = sec.el.querySelector(".result"), steps = sec.el.querySelector(".steps"), warn = sec.el.querySelector(".warnings");
    if (!res) {
      result.innerHTML = `Fix the highlighted value${bad > 1 ? "s" : ""} to see the working.`;
      steps.innerHTML = ""; warn.innerHTML = "";
      if (sec.bode) { sec.lastBode = null; sec.el.querySelector(".bode-plot").innerHTML = ""; }
      return;
    }
    result.innerHTML = res.sum;
    steps.innerHTML = stepsHtml(res.steps);
    warn.innerHTML = notesHtml(res.notes);
    if (sec.bode) { sec.lastBode = Object.assign({ f: v.f }, res.bode); drawBode(sec); }
  }

  const stepsHtml = (steps) => steps.map((s, i) =>
    `<li><div class="st-t"><span class="st-n" aria-hidden="true">${i + 1}</span><span>${s.t}</span></div>` +
    (s.f ? `<div class="st-f">${s.f}</div>` : "") + (s.s ? `<div class="st-s">${s.s}</div>` : "") +
    `<div class="st-r">${s.r}</div></li>`).join("");

  const notesHtml = (notes) => notes.map((x) => `<div class="callout ${x.type}"><strong>${x.title}</strong>${x.html}</div>`).join("");

  function buildSection(sec) {
    const el = document.createElement("section");
    el.className = "circuit";
    el.id = sec.id;
    el.setAttribute("aria-labelledby", `${sec.id}-h`);
    el.innerHTML = `
      <h3 id="${sec.id}-h" tabindex="-1">${sec.title}</h3>
      <div class="explain">${sec.intro}</div>
      <div class="c-grid">
        <figure class="diagram"><div class="ckt-wrap"></div><figcaption>The labels update as you change the values.<span class="swipe"> Swipe sideways to see the whole circuit.</span></figcaption></figure>
        <form class="inputs${sec.inputs.length > 5 ? " many" : ""}" novalidate aria-label="${esc(sec.title)} values">${sec.inputs.map((f) => fieldHtml(sec, f)).join("")}</form>
      </div>
      <div class="working">
        <h4>Step-by-step working</h4>
        <p class="result" aria-live="polite"></p>
        <ol class="steps"></ol>
      </div>
      <div class="warnings"></div>
      ${sec.bode ? `<div class="bode"><h4>Frequency response (Bode magnitude plot)</h4><div class="bode-plot"></div>
        <p class="bode-cap">Gain in dB against frequency on a log scale. Dashed lines mark the cut-off frequencies and the −3 dB level, and the red dot is your chosen f. Click or tap the graph to move f.</p></div>` : ""}
      ${sec.after || ""}`;
    sec.el = el;
    BY_ID[sec.id] = sec;

    el.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
    el.addEventListener("input", (e) => {
      const t = e.target;
      if (t.type === "range") {
        const f = sec.inputs.find((x) => t.id === `${sec.id}-${x.k}-s`);
        const si = KINDS[f.kind].slider === "log" ? 10 ** +t.value : +t.value;
        setField(sec, f, Number(si.toPrecision(3)));
      }
      update(sec);
    });
    if (sec.bode) {
      el.querySelector(".bode-plot").addEventListener("click", (e) => {
        const b = sec.lastBode, svg = e.currentTarget.querySelector("svg");
        if (!b || !svg) return;
        const box = svg.getBoundingClientRect(), x = ((e.clientX - box.left) / box.width) * b.W;
        if (x < b.l || x > b.W - b.r) return;
        const f = 10 ** (b.d0 + ((x - b.l) / (b.W - b.l - b.r)) * (b.d1 - b.d0));
        setField(sec, sec.inputs.find((i) => i.k === "f"), Number(f.toPrecision(3)));
        update(sec);
      });
    }
    sec.inputs.forEach((f) => setField(sec, f, f.d));
    return el;
  }

  function loadValues(secId, vals, scroll) {
    const sec = BY_ID[secId];
    // selects first so dependent fields are shown before they're filled
    sec.inputs.filter((f) => f.kind === "sel" && f.k in vals).forEach((f) => setField(sec, f, vals[f.k]));
    sec.inputs.filter((f) => f.kind !== "sel" && f.k in vals).forEach((f) => setField(sec, f, vals[f.k]));
    update(sec);
    if (scroll) {
      sec.el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      sec.el.classList.remove("flash"); void sec.el.offsetWidth; sec.el.classList.add("flash");
      $(`#${sec.id}-h`).focus({ preventScroll: true });
    }
  }

  /* =====================================================================
     Bode plot
     ===================================================================== */
  function drawBode(sec) {
    const b = sec.lastBode, host = sec.el.querySelector(".bode-plot");
    if (!b) return;
    const W = Math.max(300, Math.round(host.clientWidth || 640)), narrow = W < 520;
    const H = narrow ? 250 : 300, l = narrow ? 44 : 54, r = 14, t = 26, bt = 36;
    const pw = W - l - r, ph = H - t - bt;
    const keys = b.marks.map((m) => m.f).concat(b.f);
    let d0 = Math.floor(Math.log10(Math.min(...keys))) - 1, d1 = Math.ceil(Math.log10(Math.max(...keys))) + 1;
    while (d1 - d0 < 4) { d0--; d1++; }
    const maxDec = narrow ? 6 : 9;
    if (d1 - d0 > maxDec) { // too wide: centre on the filter's own frequencies
      const mk = b.marks.map((m) => Math.log10(m.f)), mid = (Math.min(...mk) + Math.max(...mk)) / 2;
      d0 = Math.floor(mid - maxDec / 2); d1 = d0 + maxDec;
    }
    Object.assign(b, { W, l, r, d0, d1 });
    const X = (f) => l + ((Math.log10(f) - d0) / (d1 - d0)) * pw;

    const N = 360, pts = [];
    let maxDb = -Infinity;
    for (let i = 0; i < N; i++) {
      const f = 10 ** (d0 + (i / (N - 1)) * (d1 - d0)), g = dB(b.mag(f));
      pts.push([f, g]); if (g > maxDb) maxDb = g;
    }
    const top = Math.ceil((maxDb + 4) / 10) * 10, bot = top - 70;
    const Y = (g) => t + ((top - Math.max(bot, Math.min(top, g))) / (top - bot)) * ph;

    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(bodeLabel(b))}">`;
    for (let k = d0; k <= d1; k++) {
      s += `<line class="gl" x1="${X(10 ** k)}" x2="${X(10 ** k)}" y1="${t}" y2="${t + ph}"/>`;
      if (!narrow || (k - d0) % 2 === 0 || d1 - d0 <= 3) s += `<text class="axis" x="${X(10 ** k)}" y="${H - bt + 18}" text-anchor="${k === d1 ? "end" : "middle"}">${eng(10 ** k, "Hz", 3)}</text>`;
      if (k < d1) for (let m = 2; m <= 9; m++) s += `<line class="gl minor" x1="${X(m * 10 ** k)}" x2="${X(m * 10 ** k)}" y1="${t}" y2="${t + ph}"/>`;
    }
    for (let g = top; g >= bot; g -= 10) {
      s += `<line class="gl" x1="${l}" x2="${W - r}" y1="${Y(g)}" y2="${Y(g)}"/>`;
      s += `<text class="axis" x="${l - 6}" y="${Y(g) + 4}" text-anchor="end">${num(g)}${g === top ? " dB" : ""}</text>`;
    }
    if (b.ref != null) {
      s += `<line class="ref" x1="${l}" x2="${W - r}" y1="${Y(b.ref)}" y2="${Y(b.ref)}"/>`;
      s += `<text class="reflab" x="${W - r - 4}" y="${Y(b.ref) - 5}" text-anchor="end">${fmtDb(b.ref)}</text>`;
    }
    s += `<polyline class="curve" points="${pts.map(([f, g]) => `${X(f).toFixed(1)},${Y(g).toFixed(1)}`).join(" ")}"/>`;
    b.marks.forEach((m, i) => {
      if (m.f < 10 ** d0 || m.f > 10 ** d1) return;
      const x = X(m.f), right = x > W - r - 70;
      s += `<line class="mk" x1="${x}" x2="${x}" y1="${t}" y2="${t + ph}"/>`;
      s += `<text class="mklab" x="${right ? x - 4 : x + 4}" y="${t - 8 + (i % 2) * 18}" text-anchor="${right ? "end" : "start"}">${svgMark(m.label)}</text>`;
    });
    if (b.f >= 10 ** d0 && b.f <= 10 ** d1) {
      const g = dB(b.mag(b.f)), x = X(b.f), y = Y(g), right = x > l + pw * 0.62;
      s += `<circle class="pt" cx="${x}" cy="${y}" r="5"/>`;
      const above = y - 10, nearRef = b.ref != null && Math.abs(above - 4 - Y(b.ref)) < 12;
      s += `<text class="ptlab" x="${right ? x - 10 : x + 10}" y="${y < t + 30 || nearRef ? y + 20 : above}" text-anchor="${right ? "end" : "start"}">${eng(b.f, "Hz")}: ${fmtDb(g)}</text>`;
    }
    s += `</svg>`;
    host.innerHTML = s;
  }

  function svgMark(label) {
    const m = /^([fR])([a-zLH0-9]+)(.*)$/.exec(label);
    return m ? `${m[1]}<tspan class="sb" dy="3">${m[2]}</tspan><tspan dy="-3">${esc(m[3])}</tspan>` : esc(label);
  }

  function bodeLabel(b) {
    const s = `Bode magnitude plot from ${eng(10 ** b.d0, "Hz", 3)} to ${eng(10 ** b.d1, "Hz", 3)}. ` +
      b.marks.map((m) => `${m.label} at ${eng(m.f, "Hz")}`).join(", ") +
      `. At ${eng(b.f, "Hz")} the gain is ${fmtDb(dB(b.mag(b.f)))}.`;
    return s.replace(/<[^>]+>/g, "").replace(/−/g, "minus ");
  }

  /* =====================================================================
     Exercises
     ===================================================================== */
  function buildExercise(ex) {
    const sec = BY_ID[ex.sec];
    const el = document.createElement("article");
    el.className = "ex";
    el.id = ex.id;
    el.setAttribute("aria-labelledby", `${ex.id}-h`);
    const loads = ex.runs.map((r, i) => `<button type="button" class="btn ghost" data-load="${i}">Load into calculator${ex.runs.length > 1 ? ` (${r.label.replace("At ", "")})` : ""}</button>`).join("");
    el.innerHTML = `
      <h3 id="${ex.id}-h">${ex.title}</h3>
      <p class="q">${ex.q}</p>
      <form class="ex-answers" novalidate>
        ${ex.ans.map((a, i) => `<div class="ans">
          <label for="${ex.id}-a${i}">${a.l}</label>
          <span class="ans-in"><input id="${ex.id}-a${i}" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">${a.u ? `<span class="unit">${a.u}</span>` : ""}</span>
          <span class="mark" id="${ex.id}-m${i}" aria-live="polite"></span>
        </div>`).join("")}
        <div class="ex-actions">
          <button type="submit" class="btn">Check answers</button>
          <button type="button" class="btn ghost" data-reveal disabled aria-expanded="false" aria-controls="${ex.id}-w">Show working</button>
          ${loads}
        </div>
        <p class="ex-hint">The working unlocks after your first attempt.</p>
      </form>
      <div class="ex-working" id="${ex.id}-w" hidden></div>
      ${ex.note ? `<div class="callout note">${ex.note}</div>` : ""}`;

    const reveal = el.querySelector("[data-reveal]"), hint = el.querySelector(".ex-hint");
    el.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      ex.ans.forEach((a, i) => {
        const raw = $(`#${ex.id}-a${i}`, el).value.trim().replace(/−/g, "-").replace(/,/g, "");
        const mark = $(`#${ex.id}-m${i}`, el), x = Number(raw);
        if (raw === "" || !isFinite(x)) { mark.className = "mark"; mark.textContent = raw === "" ? "Enter an answer" : "Enter a number"; return; }
        const ok = Math.abs(x - a.v) <= 0.02 * Math.abs(a.v);
        mark.className = `mark ${ok ? "ok" : "no"}`;
        mark.textContent = ok ? "✓ Correct" : "✗ Not quite";
      });
      reveal.disabled = false;
      hint.textContent = "Checked. You can try again, or show the full working.";
    });
    reveal.addEventListener("click", () => {
      const w = $(`#${ex.id}-w`, el), open = w.hidden;
      if (open && !w.innerHTML) {
        w.innerHTML = ex.runs.map((r) => {
          const vals = {};
          sec.inputs.forEach((f) => { vals[f.k] = f.d; });
          Object.assign(vals, r.vals);
          const res = sec.compute(vals);
          return `<div class="working">${r.label ? `<h4>${r.label}</h4>` : "<h4>Working</h4>"}<p class="result">${res.sum}</p><ol class="steps">${stepsHtml(res.steps)}</ol></div>` +
            (res.notes.length ? `<div class="warnings">${notesHtml(res.notes.filter((x) => x.type === "warn"))}</div>` : "");
        }).join("");
      }
      w.hidden = !open;
      reveal.setAttribute("aria-expanded", open);
      reveal.textContent = open ? "Hide working" : "Show working";
    });
    el.querySelectorAll("[data-load]").forEach((btn) => btn.addEventListener("click", () => loadValues(ex.sec, ex.runs[+btn.dataset.load].vals, true)));
    return el;
  }

  /* =====================================================================
     Page setup
     ===================================================================== */
  const topic = COURSE.topics.find((t) => t.no === 5);
  const pageOf = (t) => t.page || `topic.html?ch=${t.no}`;

  function renderHero() {
    document.title = `Chapter ${topic.no}: ${topic.title} | ${COURSE.code} ${COURSE.name}`;
    $("#c5Title").textContent = topic.title;
    $("#c5Summary").textContent = topic.summary;
    const [y, m, d] = COURSE.semesterStart.split("-").map(Number);
    const wk = (topic.weeks.match(/\d+/g) || []).map(Number);
    let dates = "";
    if (wk.length) {
      const start = new Date(y, m - 1, d + (wk[0] - 1) * 7), end = new Date(y, m - 1, d + (wk[wk.length - 1] - 1) * 7 + 6);
      dates = `, ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    $("#c5Meta").innerHTML = `<span>${esc(topic.weeks)}${dates}</span><span class="badge ${topic.status}">Interactive</span>`;
    const prev = COURSE.topics.find((t) => t.no === topic.no - 1), next = COURSE.topics.find((t) => t.no === topic.no + 1);
    $("#c5Pager").innerHTML =
      `<span>${prev ? `<a href="${esc(pageOf(prev))}"><small>Previous</small>Chapter ${prev.no}: ${esc(prev.title)}</a>` : ""}</span>` +
      `<span style="text-align:right">${next ? `<a href="${esc(pageOf(next))}"><small>Next</small>Chapter ${next.no}: ${esc(next.title)}</a>` : ""}</span>`;
  }

  function renderGroups() {
    [["amp", "#ampList", "#ampToc"], ["filt", "#filtList", "#filtToc"]].forEach(([g, list, toc]) => {
      const secs = SECTIONS.filter((s) => s.group === g);
      secs.forEach((s) => $(list).appendChild(buildSection(s)));
      $(toc).innerHTML = secs.map((s) => `<li><a href="#${s.id}">${esc(s.toc || s.title)}</a></li>`).join("") +
        (g === "filt" ? `<li><a href="#compare">Passive vs active</a></li>` : "");
    });
    SECTIONS.forEach(update);
    EXERCISES.forEach((ex) => $("#exList").appendChild(buildExercise(ex)));
  }

  // Highlight the section-nav link for the part of the page in view.
  function trackNav() {
    const links = Array.from(document.querySelectorAll(".c5-nav a"));
    const groups = links.map((a) => document.querySelector(a.getAttribute("href")));
    let ticking = false;
    const paint = () => {
      ticking = false;
      let cur = -1;
      groups.forEach((g, i) => { if (g.getBoundingClientRect().top <= 140) cur = i; });
      links.forEach((a, i) => (i === cur ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }

  let resizeTimer;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => SECTIONS.forEach((s) => s.bode && drawBode(s)), 150);
  });

  renderHero();
  renderGroups();
  trackNav();
})();
