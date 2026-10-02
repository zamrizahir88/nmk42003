/* NMK42003 Chapter 7: Transducer Calibration
   Animated notes: what calibration is and why, the five-step procedure, a virtual calibration lab
   (potentiometer angle sensor and capacitive water-level sensor) and why the whole system is calibrated.
   The calculator, exercise and animation engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, D, step, stepsHtml, MINUS, reduceMotion, chips, wireChips, fold, codeBlock,
    player, axes, poly, svg, curve, dot, label, pvCard, pick } = Lab;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const TAU = 2 * Math.PI;
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const sgn = (x, d) => (x < 0 ? MINUS : "") + Math.abs(x).toFixed(d);
  const cnum = (x, p = 5) => Number(x.toPrecision(p)).toString(); // a C/Arduino number literal

  /* =====================================================================
     Sensor models built on the textbook's measured data
     ===================================================================== */
  const POT_BOOK = [[1941, 0], [1610, 20], [1344, 40], [1034, 60], [720, 80], [402, 100], [128, 120]]; // [ADC, angle]
  const CAP_BOOK = [[29500, 0], [26530, 1.5], [24000, 3], [22250, 4.5], [20780, 6]];                  // [frequency Hz, depth cm]
  // Sensor output for a true physical value: interpolate the measured table (y → x)
  const interpX = (tab, y) => {
    const t = tab.slice().sort((a, b) => a[1] - b[1]);
    if (y <= t[0][1]) { const [a, b] = t; return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])); }
    for (let i = 1; i < t.length; i++) if (y <= t[i][1]) return lerp(t[i - 1][0], t[i][0], (y - t[i - 1][1]) / (t[i][1] - t[i - 1][1]));
    const a = t[t.length - 2], b = t[t.length - 1];
    return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
  };

  /* Least-squares fits (x = sensor reading, y = physical value) */
  function linFit(pts) {
    const n = pts.length; let Sx = 0, Sy = 0, Sxy = 0, Sxx = 0;
    pts.forEach(([x, y]) => { Sx += x; Sy += y; Sxy += x * y; Sxx += x * x; });
    const m = (n * Sxy - Sx * Sy) / (n * Sxx - Sx * Sx), c = (Sy - m * Sx) / n;
    return { kind: "lin", m, c, f: (x) => m * x + c, sums: { n, Sx, Sy, Sxy, Sxx } };
  }
  function quadFit(pts) {
    const k = 1000; // scale x to keep the numbers well-conditioned
    const S = Array(5).fill(0), R = Array(3).fill(0);
    pts.forEach(([x, y]) => { const u = x / k; let p = 1; for (let i = 0; i < 5; i++) { S[i] += p; if (i < 3) R[i] += p * y; p *= u; } });
    const A = [[S[4], S[3], S[2], R[2]], [S[3], S[2], S[1], R[1]], [S[2], S[1], S[0], R[0]]];
    for (let i = 0; i < 3; i++) { for (let j = i + 1; j < 3; j++) { const f = A[j][i] / A[i][i]; for (let q = i; q < 4; q++) A[j][q] -= f * A[i][q]; } }
    const z = [0, 0, 0];
    for (let i = 2; i >= 0; i--) { let s = A[i][3]; for (let q = i + 1; q < 3; q++) s -= A[i][q] * z[q]; z[i] = s / A[i][i]; }
    const a = z[0] / (k * k), b = z[1] / k, c = z[2];
    return { kind: "quad", a, b, c, f: (x) => a * x * x + b * x + c };
  }
  const r2 = (pts, f) => { const my = pts.reduce((s, p) => s + p[1], 0) / pts.length; let ss = 0, st = 0; pts.forEach(([x, y]) => { ss += (y - f(x)) ** 2; st += (y - my) ** 2; }); return 1 - ss / st; };

  const MODES = {
    pot: {
      tab: "Resistive: potentiometer angle", xName: "ESP32 ADC reading", yName: "Angle", yUnit: "°", yMax: 120, yStep: 1, marks: [0, 20, 40, 60, 80, 100, 120],
      book: POT_BOOK, noise: 4, xAxis: [0, 2100], xt: [0, 500, 1000, 1500, 2000], yAxis: [-10, 130], yt: [0, 30, 60, 90, 120], def: 60,
      xFmt: (x) => String(Math.round(x)), yFmt: (y) => y.toFixed(1), dp: 1,
      control: "Turn the knob to", unitWord: "°", record: "Record reading",
      sketch: (eq) => `long ADC;
float Angle;

void setup()
{
  ADC = 0;
  Angle = 0;
  Serial.begin(115200);
}

void loop()
{
  ADC = analogRead(36);          // GPIO36 (VP), 0 to 4095
  Angle = ${eq("ADC")};
  Serial.println(Angle);
  delay(5000);
}`,
      bt: (eq) => `#include "BluetoothSerial.h"
long ADC;
float Angle;
BluetoothSerial SerialBT;

void setup()
{
  SerialBT.begin("NMK42003 Potentiometer to Angle");
}

void loop()
{
  ADC = analogRead(36);
  Angle = ${eq("ADC")};
  SerialBT.println(Angle);       // read it with a Bluetooth serial terminal app
  delay(5000);
}`
    },
    cap: {
      tab: "Capacitive: water level", xName: "555 frequency (Hz)", yName: "Depth", yUnit: " cm", yMax: 6, yStep: 0.1, marks: [0, 1.5, 3, 4.5, 6],
      book: CAP_BOOK, noise: 30, xAxis: [20000, 30500], xt: [20000, 22500, 25000, 27500, 30000], yAxis: [-0.5, 7], yt: [0, 2, 4, 6], def: 3,
      xFmt: (x) => String(Math.round(x)), yFmt: (y) => y.toFixed(2), dp: 2,
      control: "Fill the bottle to", unitWord: " cm", record: "Record reading",
      sketch: (eq) => `#include "FreqCountESP.h"
uint32_t Frequency;
float Depth;

void setup()
{
  Frequency = 0;
  Depth = 0;
  Serial.begin(115200);
  FreqCountESP.begin(14, 1000);  // count pulses on GPIO14 for 1000 ms
}

void loop()
{
  if (FreqCountESP.available())
  {
    Frequency = FreqCountESP.read();
    Depth = ${eq("Frequency")};
    Serial.println(Depth);
    delay(5000);
  }
}`,
      bt: (eq) => `#include "BluetoothSerial.h"
#include "FreqCountESP.h"
uint32_t Frequency;
float Depth;
BluetoothSerial SerialBT;

void setup()
{
  SerialBT.begin("NMK42003 Water Level Sensor");
  FreqCountESP.begin(14, 1000);
}

void loop()
{
  if (FreqCountESP.available())
  {
    Frequency = FreqCountESP.read();
    Depth = ${eq("Frequency")};
    SerialBT.println(Depth);
    delay(5000);
  }
}`
    }
  };

  /* =====================================================================
     Scenes (original sketches)
     ===================================================================== */
  function potScene(angle, adcText, lcd2) {
    const cx = 92, cy = 150, R = 70, q = (a) => ((180 - a) * Math.PI) / 180; // 0° on the right, increasing anticlockwise
    let s = `<path class="prot" d="M${cx - R},${cy}A${R},${R} 0 0 1 ${cx + R},${cy}Z"/>`;
    for (let a = 0; a <= 180; a += 10) { const r0 = a % 20 === 0 ? R - 12 : R - 7, t = Math.PI - q(a); s += `<line class="tick" x1="${cx + r0 * Math.cos(t)}" y1="${cy - r0 * Math.sin(t)}" x2="${cx + R * Math.cos(t)}" y2="${cy - R * Math.sin(t)}"/>`; }
    [0, 20, 40, 60, 80, 100, 120].forEach((a) => { const t = Math.PI - q(a); s += T((cx + (R + 12) * Math.cos(t)).toFixed(1), (cy - (R + 12) * Math.sin(t) + 4).toFixed(1), a, "middle", "small"); });
    const t = Math.PI - q(angle);
    s += `<circle class="knob" cx="${cx}" cy="${cy}" r="16"/><line class="pointer" x1="${cx}" y1="${cy}" x2="${(cx + (R - 4) * Math.cos(t)).toFixed(1)}" y2="${(cy - (R - 4) * Math.sin(t)).toFixed(1)}"/><circle class="dot" cx="${cx}" cy="${cy}" r="3"/>`;
    s += T(8, cy + 24, "potentiometer on a protractor", "start", "small");
    // schematic and ESP32
    const X = 232;
    s += `<rect class="esp" x="${X + 24}" y="36" width="80" height="120" rx="8"/>${T(X + 64, 60, "ESP32", "middle", "tt inv")}`;
    s += T(X + 30, 88, "3V3", "start", "small inv") + T(X + 30, 112, "VP 36", "start", "small inv") + T(X + 30, 136, "GND", "start", "small inv");
    s += D.wire([X + 24, 84], [X - 30, 84], [X - 30, 96]) + D.res(X - 30, 96, X - 30, 150) + D.wire([X - 30, 150], [X - 30, 162], [X + 24, 162], [X + 24, 132]);
    s += `<path class="w" d="M${X - 6},123H${X - 22}m7,-5l-7,5l7,5"/>` + D.wire([X - 6, 123], [X + 4, 123], [X + 4, 108], [X + 24, 108]);
    s += `<rect class="lcd" x="${X - 20}" y="186" width="148" height="24" rx="4"/>${T(X + 54, 203, adcText, "middle", "lcdt sm")}`;
    if (lcd2) s += `<rect class="lcd" x="${X - 20}" y="214" width="148" height="22" rx="4"/>${T(X + 54, 230, lcd2, "middle", "lcdt sm dim")}`;
    return s;
  }
  function capScene(depth, fText, lcd2) {
    const bx = 30, by = 40, bw = 80, bh = 170, scale = bh / 8, wy = by + bh - depth * scale;
    let s = `<rect class="bottle" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10"/><rect class="water3" x="${bx + 3}" y="${wy}" width="${bw - 6}" height="${by + bh - wy - 3}" rx="6"/>`;
    for (let c = 0; c <= 7; c++) { const y = by + bh - c * scale; s += `<line class="tick" x1="${bx + bw}" x2="${bx + bw + (c % 1 === 0 ? 8 : 4)}" y1="${y}" y2="${y}"/>${T(bx + bw + 12, y + 4, c, "start", "small")}`; }
    s += T(bx + bw + 12, by - 6, "cm", "start", "small");
    s += `<line class="wire-w" x1="${bx + 30}" y1="${by - 14}" x2="${bx + 30}" y2="${by + bh - 8}"/><line class="wire-g" x1="${bx + 50}" y1="${by - 14}" x2="${bx + 50}" y2="${by + bh - 8}"/>`;
    s += `<path class="cable" d="M${bx + 30},${by - 14}C${bx + 30},8 170,8 176,40M${bx + 50},${by - 14}C${bx + 50},14 170,16 176,52"/>`;
    s += `<rect class="chip" x="176" y="30" width="56" height="40" rx="5"/>${T(204, 55, "555", "middle", "tt inv")}` + D.wire([232, 50], [252, 50]);
    s += `<rect class="esp" x="252" y="30" width="80" height="100" rx="8"/>${T(292, 54, "ESP32", "middle", "tt inv")}${T(258, 74, "GPIO14", "start", "small inv")}`;
    s += T(204, 88, "timer circuit", "middle", "small");
    s += `<rect class="lcd" x="176" y="150" width="156" height="24" rx="4"/>${T(254, 167, fText, "middle", "lcdt sm")}`;
    if (lcd2) s += `<rect class="lcd" x="176" y="178" width="156" height="22" rx="4"/>${T(254, 194, lcd2, "middle", "lcdt sm dim")}`;
    return s;
  }

  /* =====================================================================
     1. What is calibration? (animation)
     ===================================================================== */
  function mountWhy(el) {
    const c = pvCard(el);
    const book = linFit(POT_BOOK);
    const draw = (t) => {
      const ang = 60 - 60 * Math.cos((TAU * t) / 10), adc = Math.round(interpX(POT_BOOK, ang)), shown = book.f(adc);
      c.scene.innerHTML = svg(360, 240, `Knob at ${ang.toFixed(0)} degrees; the ESP32 reads ${adc}; calibrated reading ${shown.toFixed(1)} degrees`, potScene(ang, `raw reading: ${adc}`, `calibrated: ${shown.toFixed(1)}°`), "scene");
      const A = axes({ x: [0, 2100], y: [-10, 130], xt: [0, 500, 1000, 1500, 2000], yt: [0, 40, 80, 120], xl: "ESP32 ADC reading", yl: "Angle (°)" });
      c.graph.innerHTML = svg(A.W, A.H, "Calibration line: angle against ADC reading", A.s + poly(curve(A, book.f, 0, 2100, 2), "trace-a") + dot(A.X(adc), A.Y(shown)) + label(A.X(adc) + (adc > 1300 ? -8 : 8), A.Y(shown) - 10, `${adc} → ${shown.toFixed(1)}°`, adc > 1300 ? "end" : "start"));
      c.read.innerHTML = `The ESP32 only sees a number: <strong>${adc}</strong>. On its own that means nothing. The <strong>calibration line</strong> turns it into the angle: <strong>${shown.toFixed(1)}°</strong> (the pointer shows ${ang.toFixed(0)}°).`;
    };
    player(c.pl, el, { dur: 10, hold: 0, draw, still: 2.5, label: "Knob position" });
  }

  /* =====================================================================
     2. The five-step procedure (animated highlight)
     ===================================================================== */
  const STEPS = [
    ["Apply known inputs", "Use a trusted reference: set the angle with a protractor, or the depth with a ruler."],
    ["Record the output", "Write down the sensor's reading at each known input, in a calibration table."],
    ["Plot and fit", "Plot the physical value against the reading and fit a straight line (or a curve)."],
    ["Program the equation", "Put the fitted equation in the ESP32 sketch, so it shows real units."],
    ["Check and recalibrate", "Test new points, and repeat the calibration as the sensor ages or conditions change."]
  ];
  function mountSteps(el) {
    el.innerHTML = `<div class="pv"><ol class="cal-steps">${STEPS.map(([t, d], i) => `<li data-i="${i}"><span class="cs-n">${i + 1}</span><strong>${t}</strong><span>${d}</span></li>`).join("")}</ol><div class="pv-pl"></div></div>`;
    const lis = el.querySelectorAll(".cal-steps li");
    player(el.querySelector(".pv-pl"), el, { dur: 10, hold: 0, still: 0, auto: false, label: "Step highlight", draw: (t) => { const k = Math.min(4, Math.floor(t / 2)); lis.forEach((li, i) => li.classList.toggle("on", i === k)); } });
  }

  /* =====================================================================
     3. Virtual calibration lab (two tabs)
     ===================================================================== */
  function mountLab(el, sec) {
    const S = { mode: "pot", data: { pot: [], cap: [] }, fit: { pot: null, cap: null }, val: { pot: 60, cap: 3 } };
    el.innerHTML = `<div class="pv">${chips("Sensor", Object.entries(MODES).map(([k, m]) => [k, m.tab]), "pot")}
      <div class="pv-grid"><div class="pv-scene"></div><div class="pv-graph"></div></div>
      <div class="slider-field"><label for="${sec.id}-v"><span class="v-lab"></span> <strong class="v-v"></strong></label><input type="range" id="${sec.id}-v"></div>
      <div class="lab-btns"><button type="button" class="btn" data-a="rec">Record reading</button><button type="button" class="btn ghost" data-a="lin">Fit a straight line</button><button type="button" class="btn ghost" data-a="quad">Fit a curve</button><button type="button" class="btn ghost" data-a="book">Load the textbook data</button><button type="button" class="btn ghost" data-a="clr">Clear</button></div>
      <p class="pv-read"></p>
      <div class="lab-row"><div class="table-wrap cal-wrap"></div><div class="serial"><div class="serial-h">Serial Monitor · 115200 baud</div><pre class="serial-o"></pre></div></div>
      <div class="lab-fold"></div><div class="lab-code"></div></div>`;
    const q = (s) => el.querySelector(s), sl = q(`#${sec.id}-v`);
    const M = () => MODES[S.mode];
    const reading = (y, noisy) => { const x = interpX(M().book, y); return noisy ? x + (Math.random() * 2 - 1) * M().noise : x; };
    const eqText = (fit, v) => fit.kind === "lin" ? `${cnum(fit.m, 4)} * ${v} + ${cnum(fit.c, 5)}` : `(${cnum(fit.a, 5)} * ${v} * ${v}) + (${cnum(fit.b, 5)} * ${v}) + ${cnum(fit.c, 5)}`;
    const eqHtml = (fit) => fit.kind === "lin" ? `y = ${num(fit.m, 4)}x ${fit.c < 0 ? MINUS : "+"} ${num(Math.abs(fit.c), 5)}` : `y = ${num(fit.a, 5)}x² ${fit.b < 0 ? MINUS : "+"} ${num(Math.abs(fit.b), 5)}x ${fit.c < 0 ? MINUS : "+"} ${num(Math.abs(fit.c), 5)}`;
    const setSlider = () => { const m = M(); sl.min = 0; sl.max = m.yMax; sl.step = m.yStep; sl.value = S.val[S.mode]; q(".v-lab").textContent = `${m.control}`; q(".v-v").textContent = `${(+sl.value).toFixed(S.mode === "pot" ? 0 : 1)}${m.unitWord}`; };
    const paint = () => {
      const m = M(), data = S.data[S.mode], fit = S.fit[S.mode], y = S.val[S.mode], x = reading(y, false);
      const shown = fit ? fit.f(x) : null;
      const raw = S.mode === "pot" ? `raw reading: ${Math.round(x)}` : `frequency: ${Math.round(x)} Hz`;
      const cal = fit ? `${m.yName.toLowerCase()}: ${shown.toFixed(m.dp)}${m.yUnit}` : "";
      q(".pv-scene").innerHTML = S.mode === "pot" ? svg(360, 240, `Potentiometer at ${y} degrees, ADC ${Math.round(x)}`, potScene(y, raw, cal), "scene") : svg(360, 220, `Water depth ${y} cm, frequency ${Math.round(x)} Hz`, capScene(y, raw, cal), "scene");
      const A = axes({ x: m.xAxis, y: m.yAxis, xt: m.xt, yt: m.yt, xl: m.xName, yl: `${m.yName} (${m.yUnit.trim()})` });
      let g = A.s;
      if (fit) g += poly(curve(A, fit.f, m.xAxis[0], m.xAxis[1], 120), fit.kind === "lin" ? "trace-a" : "trace-d");
      data.forEach(([dx, dy]) => { g += dot(A.X(dx), A.Y(dy), "shot"); });
      g += `<line class="mk" x1="${A.X(x)}" x2="${A.X(x)}" y1="${A.t}" y2="${A.t + A.ph}"/>`;
      if (fit) g += dot(A.X(x), A.Y(A.clipY(shown)));
      if (fit) g += T(A.l + 8, A.t + A.ph - 24, eqHtml(fit).replace(/<sup>/g, '<tspan dy="-6" class="axis">').replace(/<\/sup>/g, '</tspan><tspan dy="6">'), "start", "mklab") + T(A.l + 8, A.t + A.ph - 8, `R² = ${r2(data, fit.f).toFixed(4)}`, "start", "axis");
      q(".pv-graph").innerHTML = svg(A.W, A.H, `Calibration points and fitted ${fit ? (fit.kind === "lin" ? "line" : "curve") : "line"}`, g);
      // table
      const rows = data.slice().sort((a, b) => a[1] - b[1]).map(([dx, dy]) => { const fy = fit ? fit.f(dx) : null; return `<tr><td>${m.xFmt(dx)}</td><td>${S.mode === "pot" ? dy.toFixed(0) : dy.toFixed(1)}</td><td>${fit ? fy.toFixed(m.dp) : "–"}</td><td class="${fit && Math.abs(fy - dy) > (S.mode === "pot" ? 2 : 0.2) ? "bad" : ""}">${fit ? sgn(fy - dy, m.dp) : "–"}</td></tr>`; }).join("");
      q(".cal-wrap").innerHTML = `<table class="cal-table"><thead><tr><th>${S.mode === "pot" ? "ESP32 ADC" : "Frequency (Hz)"}</th><th>${m.yName} (${m.yUnit.trim()})</th><th>From fit</th><th>Error</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="empty">No readings yet. Set a value and tap Record reading.</td></tr>`}</tbody></table>`;
      // serial monitor
      const lines = [];
      for (let i = 4; i >= 0; i--) { const v = Math.round(x + (i ? ((i * 37) % 7 - 3) * (S.mode === "pot" ? 1 : 8) : 0)); lines.push(fit ? fit.f(v).toFixed(m.dp) : String(v)); }
      q(".serial-o").textContent = lines.join("\n");
      // readout
      const maxErr = fit && data.length ? Math.max(...data.map(([dx, dy]) => Math.abs(fit.f(dx) - dy))) : null;
      q(".pv-read").innerHTML = !data.length
        ? `<strong>Step 1–2:</strong> ${S.mode === "pot" ? "turn the knob to a protractor mark (0°, 20°, … 120°)" : "fill the bottle to a ruler mark (0, 1.5, 3, 4.5, 6 cm)"} and tap <strong>Record reading</strong>. Do this for every mark, or tap <strong>Load the textbook data</strong>.`
        : !fit ? `${data.length} point${data.length > 1 ? "s" : ""} recorded. ${data.length < 3 ? "Record at least 3 points, then" : "Now"} <strong>fit a straight line</strong>${S.mode === "cap" ? " (and then a curve)" : ""}. Until then the ESP32 can only print the raw number.`
          : `<strong>Fitted:</strong> ${eqHtml(fit)}, R² = ${r2(data, fit.f).toFixed(4)}. Largest error at the calibration points: <strong>${maxErr.toFixed(m.dp)}${m.yUnit}</strong>. Move the slider: the Serial Monitor now shows real ${S.mode === "pot" ? "degrees" : "centimetres"}.` +
            (S.mode === "cap" && fit.kind === "lin" ? " The points curve away from the line: <strong>try Fit a curve</strong>." : "");
      // working and code
      let work = "";
      if (fit && fit.kind === "lin") {
        const s = fit.sums;
        work = fold("Step-by-Step Working: Least-Squares Straight Line", `<ol class="steps">${stepsHtml([
          step("Sums of the n calibration points", "n, Σx, Σy, Σxy, Σx²", `n = ${s.n}, Σx = ${num(s.Sx, 6)}, Σy = ${num(s.Sy, 6)}`, `Σxy = ${num(s.Sxy, 6)}, Σx² = ${num(s.Sxx, 6)}`),
          step("Slope", "m = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²)", `= (${s.n} × ${num(s.Sxy, 6)} − ${num(s.Sx, 6)} × ${num(s.Sy, 6)}) ÷ (${s.n} × ${num(s.Sxx, 6)} − ${num(s.Sx, 6)}²)`, `m = ${num(fit.m, 5)}`),
          step("Intercept", "c = (Σy − mΣx) ÷ n", `= (${num(s.Sy, 6)} − ${num(fit.m, 5)} × ${num(s.Sx, 6)}) ÷ ${s.n}`, `c = ${num(fit.c, 5)}`),
          step("How good is the fit?", "R² = 1 − Σ(y − ŷ)² ÷ Σ(y − ȳ)²", "R² = 1 means every point lies on the line", `R² = ${r2(data, fit.f).toFixed(4)}`)])}</ol>`);
      } else if (fit) {
        const rd = { a: Number(fit.a.toPrecision(1)), b: fit.b, c: fit.c }, fr = (xx) => rd.a * xx * xx + rd.b * xx + rd.c;
        const worst = Math.max(...data.map(([dx]) => Math.abs(fr(dx) - fit.f(dx))));
        work = fold("How the Curve Is Found", `<p>A second-order (quadratic) curve y = ax² + bx + c is fitted by least squares, the same method a spreadsheet trendline uses. It needs at least 3 points, and follows data that bends.</p><p>Fitted here: a = ${num(fit.a, 5)}, b = ${num(fit.b, 5)}, c = ${num(fit.c, 5)}, R² = ${r2(data, fit.f).toFixed(4)}.</p>`) +
          `<div class="callout info"><strong>Good to know: keep enough significant figures</strong>The x² term is multiplied by a very large number (x² is about ${num(data[0][0] ** 2, 2)}), so a small rounding in a changes the answer a lot. Rounding a to one significant figure (${num(rd.a, 1)}) would change the depth by up to <strong>${worst.toFixed(2)} cm</strong> on a 6 cm range. Copy the coefficients with at least 4 or 5 significant figures, as in the sketch below.</div>`;
      }
      q(".lab-fold").innerHTML = work;
      q(".lab-code").innerHTML = fit ? codeBlock(m.sketch((v) => eqText(fit, v)), "Step 4: the ESP32 sketch with your equation") + fold("Going Further: Send It to Your Phone (Bluetooth)", `<p>The ESP32 has Bluetooth built in. This version sends the value to a Bluetooth serial terminal app on your phone (pair with the ESP32 first).</p>${codeBlock(m.bt((v) => eqText(fit, v)), "Bluetooth version")}`) : "";
      q('[data-a="quad"]').hidden = S.mode === "pot";
      q('[data-a="lin"]').disabled = q('[data-a="quad"]').disabled = data.length < 3;
    };
    q(".lab-btns").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const a = b.dataset.a, data = S.data[S.mode], y = S.val[S.mode];
      if (a === "rec") { const i = data.findIndex((p) => Math.abs(p[1] - y) < 1e-9); const pt = [reading(y, true), y]; if (i >= 0) data[i] = pt; else data.push(pt); S.fit[S.mode] = null; }
      if (a === "book") { S.data[S.mode] = M().book.map((p) => p.slice()); S.fit[S.mode] = null; }
      if (a === "clr") { S.data[S.mode] = []; S.fit[S.mode] = null; }
      if (a === "lin" && data.length >= 3) S.fit[S.mode] = linFit(data);
      if (a === "quad" && data.length >= 3) S.fit[S.mode] = quadFit(data);
      paint();
    });
    sl.addEventListener("input", () => { S.val[S.mode] = +sl.value; setSlider(); paint(); });
    pick(el, (k) => { S.mode = k; setSlider(); paint(); });
    setSlider(); paint();
  }

  /* =====================================================================
     4. Why calibrate the whole system? The ESP32's own ADC
     ===================================================================== */
  // A typical ESP32 ADC: about 0.14 V low in the middle, a dead zone near 0 V and full scale (4095) reached near 3.15 V
  const realCode = (v) => Math.round(clamp((4095 * (v - 0.14)) / 3.3 + Math.max(0, v - 2.8) * 1029, 0, 4095));
  function mountAdc(el, sec) {
    const c = pvCard(el, `<div class="slider-field"><label for="${sec.id}-v">Voltage from the power supply: <strong class="v-v">2.50 V</strong></label><input type="range" id="${sec.id}-v" min="0" max="3.3" step="0.01" value="2.5"></div>`);
    const sl = el.querySelector(`#${sec.id}-v`);
    const paint = () => {
      const v = +sl.value, ideal = Math.round((v * 4095) / 3.3), real = Math.min(4095, realCode(v)), shown = (real * 3.3) / 4095;
      let s = `<rect class="psu" x="14" y="60" width="110" height="80" rx="8"/><rect class="lcd" x="24" y="72" width="90" height="30" rx="4"/>${T(69, 93, `${v.toFixed(2)} V`, "middle", "lcdt sm")}${T(69, 124, "DC supply", "middle", "small inv")}`;
      s += D.wire([124, 100], [180, 100]) + `<rect class="esp" x="180" y="60" width="80" height="80" rx="8"/>${T(220, 90, "ESP32", "middle", "tt inv")}${T(220, 110, "ADC", "middle", "small inv")}`;
      s += `<rect class="lcd" x="150" y="160" width="170" height="26" rx="4"/>${T(235, 178, `${real} → ${shown.toFixed(2)} V`, "middle", "lcdt sm")}${T(235, 204, "V = 3.3 × ADC ÷ 4095", "middle", "small")}`;
      c.scene.innerHTML = svg(330, 215, `Supply ${v.toFixed(2)} volts; the ESP32 reads ${shown.toFixed(2)} volts`, s, "scene");
      const A = axes({ x: [0, 3.3], y: [0, 4200], xt: [0, 1.1, 2.2, 3.3], yt: [0, 1000, 2000, 3000, 4095], fx: (x) => x.toFixed(1), xl: "Input voltage (V)", yl: "ADC reading" });
      let g = A.s + poly(curve(A, (x) => (x * 4095) / 3.3, 0, 3.3, 2), "trace-in") + poly(curve(A, (x) => Math.min(4095, realCode(x)), 0, 3.3, 200), "trace-a");
      g += dot(A.X(v), A.Y(real));
      c.graph.innerHTML = svg(A.W, A.H, "Ideal ADC line and a typical ESP32 ADC response", g) + `<p class="legend"><span class="key input"></span>ideal (0 V → 0, 3.3 V → 4095) <span class="key"></span>typical ESP32</p>`;
      c.read.innerHTML = `The supply says <strong>${v.toFixed(2)} V</strong>, the ESP32 shows <strong>${shown.toFixed(2)} V</strong>: ${Math.abs(v - shown) < 0.005 ? "no difference" : `${(v - shown).toFixed(2)} V too low`}. ${v < 0.15 ? "Near 0 V it reads 0: a dead zone." : v > 3.15 ? "Near the top it already reads 4095, the largest code." : "In the middle it is offset by about 0.14 V."} Either the supply or the ADC (or both) is not calibrated.`;
    };
    sl.addEventListener("input", () => { el.querySelector(".v-v").textContent = `${(+sl.value).toFixed(2)} V`; paint(); });
    paint();
  }

  /* =====================================================================
     Sections
     ===================================================================== */
  const SECTIONS = [
    { id: "what", group: "intro", title: "What Is Calibration, and Why?", toc: "Why Calibrate",
      intro: `<p>A sensor gives the microcontroller an electrical signal, and the ESP32 turns it into a number. <strong>Calibration</strong> is what gives that number a meaning in real units. Most instruments are <em>secondary</em> instruments: they must be calibrated against a reference. There are two reasons:</p>
        <ol class="rules"><li>to <strong>convert the electrical signal to the physical value</strong> (volts or counts → degrees, centimetres, °C…)</li><li>to <strong>keep the measurement accurate</strong> as the sensor ages and its surroundings change</li></ol>
        <p>A good sensor has high <strong>precision</strong> (the same output for the same input every time) and high <strong>resolution</strong> (it can detect small changes).</p>`,
      mount: mountWhy,
      after: `<dl class="defs"><div><dt>Using a standard table</dt><dd>Some sensors follow an international standard. A type K thermocouple always gives the same mV at a given temperature (see Chapter 3), so the instrument just looks up the table.</dd></div>
        <div><dt>Calibrating it yourself</dt><dd>For your own sensor, measure the real value independently with a trusted reference (a thermometer, a protractor, a ruler), record the sensor's output, and find the equation that links them.</dd></div></dl>
        <div class="callout info"><strong>Good to know</strong>In industry, sensors often send their signal as a current (the 4–20 mA loop) rather than a voltage, because a current is much less affected by the resistance of long wires and by electrical noise.</div>` },
    { id: "steps", group: "intro", title: "Calibration in Five Steps", toc: "Five Steps",
      intro: `<p>Every calibration follows the same pattern. Press play to walk through it; the virtual lab below uses exactly these steps.</p>`,
      mount: mountSteps },
    { id: "vlab", group: "lab", title: "Calibrate a Sensor, Step by Step", toc: "Virtual Lab",
      intro: `<p>Two sensors from the textbook. On the <strong>potentiometer</strong> tab, a pointer on the shaft turns over a protractor (the reference) and the wiper voltage goes to the ESP32's ADC on GPIO36. On the <strong>water level</strong> tab, a two-wire capacitive sensor stands in a bottle with a ruler (the reference); the 555 timer's frequency goes to GPIO14.</p>
        <p>Set a known value, <strong>record</strong> the reading, repeat, then <strong>fit</strong> and watch the ESP32 show real units. This is also good practice before the potentiometer lab.</p>`,
      mount: mountLab },
    { id: "system", group: "whole", title: "Why Calibrate the Whole System?", toc: "The ESP32's ADC",
      intro: `<p>In theory the ESP32's 12-bit ADC turns 0 to 3.3 V into 0 to 4095, so V = 3.3 × ADC ÷ 4095. In practice, a 2.5 V supply may be shown as about 2.36 V, and the ADC is not linear near 0 V and near 3.3 V. The power supply itself may not be calibrated either.</p>
        <p>That is why the virtual lab calibrates the <strong>angle</strong> or the <strong>depth</strong> directly: one calibration corrects the sensor, the wiring and the ADC together.</p>`,
      mount: mountAdc,
      after: `<div class="callout info"><strong>Good to know</strong>The ESP32 has 18 ADC channels. Use the ADC1 pins (GPIO32 to 39) for sensors: the ADC2 pins stop working while Wi-Fi is on. The curve above is a typical example; every chip is slightly different, which is exactly why each one is calibrated.</div>` }
  ];

  /* =====================================================================
     Exercises
     ===================================================================== */
  const W_ = (list) => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml(list)}</ol></div>`;
  const EXERCISES = [
    { id: "c7-q1", title: "Exercise 1: A Line from Two Points",
      q: `<p>A potentiometer angle sensor reads <strong>ADC = 2000 at 0°</strong> and <strong>ADC = 400 at 100°</strong>. Assume a straight line, angle = m × ADC + c.</p>`,
      ans: [{ l: "Slope m", u: "° per count", v: -0.0625, tol: 0.0005 }, { l: "Intercept c", u: "°", v: 125 }, { l: "Angle when ADC = 1200", u: "°", v: 50 }],
      hints: [`m = change in angle ÷ change in ADC = (100 − 0) ÷ (400 − 2000).`, `Then c = angle − m × ADC, using either point.`],
      working: () => W_([step("Slope", "m = Δy ÷ Δx", "= 100 ÷ (400 − 2000)", "m = <strong>−0.0625</strong>"), step("Intercept", "c = y − mx", "= 0 − (−0.0625 × 2000)", "c = <strong>125</strong>"), step("At ADC 1200", "−0.0625 × 1200 + 125", "", "<strong>50°</strong>")]) },
    { id: "c7-q2", title: "Exercise 2: Using a Calibration Equation",
      q: `<p>A calibrated sensor uses <strong>angle = −0.05 × ADC + 110</strong>.</p>`,
      ans: [{ l: "Angle when ADC = 900", u: "°", v: 65 }, { l: "ADC reading expected at 30°", u: "", v: 1600 }],
      hints: [`Substitute the ADC value into the equation.`, `For the reverse, rearrange: ADC = (angle − 110) ÷ (−0.05).`],
      working: () => W_([step("Angle", "−0.05 × 900 + 110", "", "<strong>65°</strong>"), step("ADC", "(30 − 110) ÷ (−0.05)", "", "<strong>1600</strong>")]) },
    { id: "c7-q3", title: "Exercise 3: Checking the Accuracy",
      q: `<p>After calibration, a sensor is checked at four reference angles.</p><table><thead><tr><th>True angle (°)</th><th>0</th><th>30</th><th>60</th><th>90</th></tr></thead><tbody><tr><th>Sensor shows (°)</th><td>1.2</td><td>29.1</td><td>61.5</td><td>89.4</td></tr></tbody></table>`,
      ans: [{ l: "Largest error (size only)", u: "°", v: 1.5 }, { l: "As a percentage of the 90° full scale", u: "%", v: 1.667 }],
      hints: [`Error = shown − true at each point; compare their sizes.`, `% of full scale = largest error ÷ 90 × 100.`],
      working: () => W_([step("Errors", "shown − true", "+1.2, −0.9, +1.5, −0.6", "largest: <strong>1.5°</strong> at 60°"), step("% of full scale", "1.5 ÷ 90 × 100", "", "<strong>1.67%</strong>")]) },
    { id: "c7-q4", title: "Exercise 4: Least-Squares Line",
      q: `<p>Fit y = mx + c by least squares to these calibration points.</p><table><thead><tr><th>x</th><th>1</th><th>2</th><th>3</th><th>4</th></tr></thead><tbody><tr><th>y</th><td>2.0</td><td>4.1</td><td>5.9</td><td>8.0</td></tr></tbody></table>`,
      ans: [{ l: "Slope m", u: "", v: 1.98, tol: 0.005 }, { l: "Intercept c", u: "", v: 0.05, tol: 0.005 }],
      hints: [`n = 4, Σx = 10, Σy = 20, Σx² = 30. Work out Σxy.`, `m = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²) and c = (Σy − mΣx) ÷ n.`],
      working: () => W_([step("Sums", "Σxy = 1×2.0 + 2×4.1 + 3×5.9 + 4×8.0", "", "Σxy = 59.9"), step("Slope", "(4 × 59.9 − 10 × 20) ÷ (4 × 30 − 10²)", "= 39.6 ÷ 20", "m = <strong>1.98</strong>"), step("Intercept", "(20 − 1.98 × 10) ÷ 4", "", "c = <strong>0.05</strong>")]) },
    { id: "c7-q5", title: "Exercise 5: Keep Enough Significant Figures",
      q: `<p>A water-level sensor was calibrated as <strong>depth = 3.8714 × 10<sup>−8</sup> f² − 0.002625 f + 43.781</strong> (depth in cm, f in Hz).</p>`,
      ans: [{ l: "Depth when f = 25 000 Hz", u: "cm", v: 2.352, tol: 0.01 }, { l: "Depth if a is rounded to 4 × 10<sup>−8</sup>", u: "cm", v: 3.156, tol: 0.01 }, { l: "Error caused by the rounding", u: "cm", v: 0.804, tol: 0.01 }],
      hints: [`f² = 6.25 × 10<sup>8</sup>. Work out each term, then add.`, `Only the first term changes when a is rounded.`],
      working: () => W_([step("Exact", "3.8714×10<sup>−8</sup> × 6.25×10<sup>8</sup> − 0.002625 × 25 000 + 43.781", "= 24.196 − 65.625 + 43.781", "<strong>2.352 cm</strong>"), step("Rounded a", "4×10<sup>−8</sup> × 6.25×10<sup>8</sup> − 65.625 + 43.781", "= 25.000 − 65.625 + 43.781", "<strong>3.156 cm</strong>"), step("Error", "3.156 − 2.352", "", "<strong>0.80 cm</strong>: round the coefficients too much and the sensor is wrong")]) },
    { id: "c7-q6", title: "Exercise 6: Calibration Ideas",
      q: `<p>Choose the best answer.</p>`,
      ans: [{ l: "In the potentiometer lab, the reference is", opts: ["the protractor", "the ESP32's ADC", "the Serial Monitor"], v: 0 },
        { l: "A sensor must be recalibrated because", opts: ["it ages and conditions change", "the ADC has 12 bits", "the line has a negative slope"], v: 0 },
        { l: "R² = 0.999 means", opts: ["the points lie very close to the fitted line", "the sensor is 99.9% accurate", "the slope is 0.999"], v: 0 },
        { l: "Use a curve instead of a straight line when", opts: ["the calibration points bend", "there are more than 5 points", "the slope is negative"], v: 0 },
        { l: "Calibrating the angle directly (not the voltage) corrects", opts: ["the sensor, wiring and ADC together", "only the ADC", "only the potentiometer"], v: 0 }],
      hints: [`A reference is the trusted instrument you compare against.`, `R² measures how well the fitted line matches the points, not the accuracy of the reference.`],
      working: () => W_([step("Reference", "", "", "The protractor sets the known angle"), step("Recalibrate", "", "", "Ageing and changes in temperature, humidity and wiring shift the readings"), step("R²", "", "", "Close to 1: the points lie very near the fitted line"), step("Curve", "", "", "When the data bends, as with the capacitive level sensor"), step("Whole system", "", "", "One calibration corrects the sensor, wiring and ADC together")]) }
  ];

  Lab.page({
    topic: 7,
    collapseWorking: true,
    exerciseCarousel: true,
    sections: SECTIONS,
    groups: [
      { key: "intro", list: "#introList", toc: "#introToc" },
      { key: "lab", list: "#vlabList" },
      { key: "whole", list: "#wholeList" }
    ],
    exercises: EXERCISES
  });
})();
