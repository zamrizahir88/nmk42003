/* NMK42003 Chapter 7: Transducer Calibration
   Animated notes: what calibration is and why, the five-step procedure, a virtual calibration lab
   (potentiometer angle sensor and capacitive water-level sensor), why the whole system is calibrated, the three kinds of
   calibration line and worked calibrations of nine common project sensors.
   The calculator, exercise and animation engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, D, step, stepsHtml, MINUS, reduceMotion, chips, wireChips, fold, codeBlock,
    player, axes, poly, svg, curve, dot, label, pvCard, pick, mixHex } = Lab;
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
     2b. Checking the calibration: error at each point and percent of full scale (animated)
     An analog pressure sensor, 0 to 10 kPa; the rounded equation ADC = 310P + 120.
     ===================================================================== */
  const CHK = { data: [[0, 118], [2.5, 912], [5, 1655], [7.5, 2460], [10, 3212]], m: 310, c: 120, fs: 10, mag: 10 };
  const chkP = (r) => (r - CHK.c) / CHK.m;
  function mountCheck(el) {
    el.innerHTML = `<div class="pv"><div class="pv-grid"><div class="pv-graph ck-graph"></div><div class="ck-side"><div class="ck-work" aria-live="polite"></div><div class="ck-fs"></div></div></div><div class="pv-pl"></div><p class="pv-read"></p></div>`;
    const q = (s) => el.querySelector(s), N = CHK.data.length, SEG = 2.6, DUR = N * SEG + 2.5;
    const errs = CHK.data.map(([p, r]) => chkP(r) - p), worst = errs.reduce((b, e, i) => (Math.abs(e) > Math.abs(errs[b]) ? i : b), 0);
    const f3 = (x) => (x < 0 ? MINUS : "+") + Math.abs(x).toFixed(3);
    const graph = (k, show) => {
      const A = axes({ W: 380, H: 260, l: 54, x: [-0.4, 10.6], y: [0, 3500], xt: [0, 2.5, 5, 7.5, 10], yt: [0, 1000, 2000, 3000], xl: "Pressure from the reference gauge, P (kPa)", yl: "ADC reading" });
      let g = A.s + poly([[A.X(-0.4), A.Y(CHK.m * -0.4 + CHK.c)], [A.X(10.6), A.Y(CHK.m * 10.6 + CHK.c)]], "trace-a");
      g += T(A.X(0.2), A.Y(3330), "ADC = 310P + 120", "start", "mklab");
      CHK.data.forEach(([p, r], i) => {
        const e = errs[i], on = i === k, yLine = A.Y(CHK.m * p + CHK.c), yPt = yLine - (A.Y(0) - A.Y(CHK.m * e * CHK.mag));
        if (i <= show) g += `<line class="ck-bar${on ? " on" : ""}" x1="${A.X(p)}" x2="${A.X(p)}" y1="${yLine.toFixed(1)}" y2="${yPt.toFixed(1)}"/>`;
        g += `<circle class="${on ? "pt" : "shot"} ck-pt" data-i="${i}" cx="${A.X(p).toFixed(1)}" cy="${(i <= show ? yPt : A.Y(r)).toFixed(1)}" r="${on ? 7 : 5.5}" tabindex="0" role="button" aria-label="Show the working for ${p} kPa"/>`;
      });
      g += T(A.l + A.pw - 4, A.t + A.ph - 8, `gaps drawn ${CHK.mag}× larger`, "end", "axis");
      return svg(A.W, A.H, "Calibration points of a pressure sensor, the fitted line and the gap from each point to the line", g);
    };
    const fsBar = (e, p) => {
      const W = 330, x0 = 14, w = W - 28, ew = Math.max(2, (Math.abs(e) / CHK.fs) * w);
      return svg(W, 74, `Full-scale bar: an error of ${Math.abs(e).toFixed(3)} kPa out of ${CHK.fs} kPa`,
        `<rect class="fsb" x="${x0}" y="18" width="${w}" height="18" rx="4"/><rect class="fse" x="${x0}" y="18" width="${ew.toFixed(1)}" height="18" rx="2"/>` +
        T(x0, 12, "0", "start", "small") + T(x0 + w, 12, `${CHK.fs} kPa (full scale)`, "end", "small") +
        T(x0, 56, `error ${Math.abs(e).toFixed(3)} kPa = ${((Math.abs(e) / CHK.fs) * 100).toFixed(2)}% of the bar`, "start", "small"), "scene ck-fsbar");
    };
    const draw = (t) => {
      const k = Math.min(N - 1, Math.floor(t / SEG)), fin = t >= N * SEG, i = fin ? worst : k, [p, r] = CHK.data[i], v = chkP(r), e = errs[i], vs = (v < 0 ? MINUS : "") + Math.abs(v).toFixed(3);
      q(".ck-graph").innerHTML = graph(i, fin ? N - 1 : k);
      q(".ck-work").innerHTML = `<div class="ck-h">${fin ? "Largest error" : `Point ${k + 1} of ${N}`}: reference ${p} kPa, ADC ${r}</div><ol class="ck-steps">
        <li><span>Equation used backwards</span>P = (ADC − 120) ÷ 310</li>
        <li><span>Value it gives</span>P = (${r} − 120) ÷ 310 = <strong>${vs} kPa</strong></li>
        <li><span>Error = from the equation − true</span>${vs} − ${p} = <strong>${f3(e)} kPa</strong> (${e >= 0 ? "reads high" : "reads low"})</li>
        <li><span>% of full scale</span>${Math.abs(e).toFixed(3)} ÷ ${CHK.fs} × 100 = <strong>${((Math.abs(e) / CHK.fs) * 100).toFixed(2)}%</strong></li></ol>`;
      q(".ck-fs").innerHTML = fsBar(e, p);
      q(".pv-read").innerHTML = fin
        ? `The largest gap is at <strong>${p} kPa</strong>: ${Math.abs(e).toFixed(3)} kPa, which is <strong>${((Math.abs(e) / CHK.fs) * 100).toFixed(2)}% of full scale</strong>. The line is a best fit through all five points, so it passes close to each one but not exactly through any of them. Tap a point to see its working.`
        : `The point sits ${e >= 0 ? "above" : "below"} the line, so the equation gives a little ${e >= 0 ? "more" : "less"} than the true ${p} kPa. Tap any point to see its working.`;
    };
    const pl = player(q(".pv-pl"), el, { dur: DUR, hold: 3, draw, still: DUR, label: "Checking position", clock: (t) => (t < N * SEG ? `point ${Math.min(N, Math.floor(t / SEG) + 1)} of ${N}` : "largest") });
    const pickPt = (e) => { const c = e.target.closest(".ck-pt"); if (!c) return; if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); pl.pause(); pl.set(+c.dataset.i * SEG + 1); };
    el.addEventListener("click", pickPt);
    el.addEventListener("keydown", pickPt);
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
     5. Sensor calibration examples (nine common sensors) and the kinds of calibration line
     All data are realistic examples made for teaching; the fits are worked out live.
     ===================================================================== */
  const lg = Math.log10;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const fmtN = (x, dp) => (Math.abs(x) >= 1000 ? Math.round(x).toString() : x.toFixed(dp));
  const tick10 = (v) => { const x = Number((10 ** v).toPrecision(3)); return x >= 1000 ? `${Number((x / 1000).toPrecision(3))}k` : String(x); };

  /* ---- the drawings: each returns { s: svg body, port: [x, y] where the signal wire leaves } ---- */
  const ART = {
    lm35(T, t) {
      const k = clamp(T / 70, 0, 1), col = mixHex("#5aa9e6", "#e5533d", k);
      let s = `<rect class="beaker" x="30" y="66" width="124" height="100" rx="8"/><rect class="liq" x="33" y="88" width="118" height="75" rx="6" style="fill:${col}"/>`;
      if (T < 8) s += `<rect class="ice" x="46" y="90" width="18" height="14" rx="3" transform="rotate(-12 55 97)"/><rect class="ice" x="118" y="92" width="16" height="13" rx="3" transform="rotate(10 126 98)"/>`;
      if (T > 45) for (let i = 0; i < 3; i++) { const x = 60 + i * 28, y0 = 58 - ((t * 14 + i * 9) % 22); s += `<path class="steam" style="opacity:${(0.25 + k * 0.5).toFixed(2)}" d="M${x},${y0}q5,-6 0,-12q-5,-6 0,-12"/>`; }
      s += `<path class="cable" d="M74,18V140"/><rect class="blk" x="67" y="138" width="14" height="18" rx="3"/>${T_(58, 186, "LM35", "middle", "small")}`;
      s += `<path class="tprobe" d="M120,26V152"/><rect class="thandle" x="110" y="12" width="20" height="26" rx="4"/>${T_(134, 186, "thermometer", "middle", "small")}`;
      return { s, port: [74, 18] };
    },
    acs(I, t) {
      let s = `<rect class="psu" x="12" y="44" width="58" height="46" rx="6"/>${T_(41, 72, "DC", "middle", "tt inv")}`;
      s += D.wire([70, 58], [110, 58]) + `<rect class="pcbr" x="110" y="44" width="50" height="28" rx="4"/>${T_(135, 63, "ACS712", "middle", "small inv")}` + D.wire([160, 58], [214, 58], [214, 104]);
      s += D.res(214, 104, 214, 150) + T_(226, 132, "load", "start", "small") + D.wire([214, 150], [214, 162], [112, 162]);
      s += `<circle class="mmc" cx="96" cy="162" r="15"/>${T_(96, 167, "A", "middle", "tt")}` + D.wire([81, 162], [41, 162], [41, 90]);
      // current dots go round the loop, faster for more current
      const loop = [[70, 58], [214, 58], [214, 162], [41, 162], [41, 90]], segs = [];
      let L = 0; for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]); segs.push(d); L += d; }
      for (let j = 0; j < 7; j++) {
        let p = ((t * I * 55 + (j * L) / 7) % L + L) % L, i = 0;
        while (p > segs[i]) { p -= segs[i]; i++; }
        const a = loop[i], b = loop[i + 1], f = p / segs[i];
        if (I > 0.02) s += `<circle class="edot" cx="${(a[0] + (b[0] - a[0]) * f).toFixed(1)}" cy="${(a[1] + (b[1] - a[1]) * f).toFixed(1)}" r="3.5"/>`;
      }
      s += `<rect class="divbox" x="168" y="12" width="40" height="18" rx="4"/>${T_(188, 25, "× 2/3", "middle", "small")}` + `<path class="cable" d="M135,44V21H168"/>`;
      return { s, port: [208, 21] };
    },
    pot(a) {
      const cx = 106, cy = 150, R = 72, q = (d) => (d * Math.PI) / 180;
      let s = `<path class="prot" d="M${cx - R},${cy}A${R},${R} 0 0 1 ${cx + R},${cy}Z"/>`;
      for (let d = 0; d <= 180; d += 10) { const r0 = d % 40 === 0 ? R - 12 : R - 6; s += `<line class="tick" x1="${(cx + r0 * Math.cos(q(d))).toFixed(1)}" y1="${(cy - r0 * Math.sin(q(d))).toFixed(1)}" x2="${(cx + R * Math.cos(q(d))).toFixed(1)}" y2="${(cy - R * Math.sin(q(d))).toFixed(1)}"/>`; }
      [0, 40, 80, 120, 160].forEach((d) => { s += T_((cx + (R + 12) * Math.cos(q(d))).toFixed(1), (cy - (R + 12) * Math.sin(q(d)) + 4).toFixed(1), d, "middle", "small"); });
      s += `<circle class="knob" cx="${cx}" cy="${cy}" r="15"/><line class="pointer" x1="${cx}" y1="${cy}" x2="${(cx + (R - 4) * Math.cos(q(a))).toFixed(1)}" y2="${(cy - (R - 4) * Math.sin(q(a))).toFixed(1)}"/>`;
      s += T_(cx, 175, "potentiometer on a protractor", "middle", "small");
      return { s, port: [cx + 15, cy] };
    },
    hcsr(d, t) {
      const wx = 52 + d * 3.2;
      let s = `<rect class="pcbb" x="12" y="78" width="40" height="56" rx="4"/><circle class="usc" cx="32" cy="94" r="10"/><circle class="usc" cx="32" cy="118" r="10"/>`;
      s += `<rect class="wall" x="${wx}" y="62" width="9" height="88" rx="2"/>`;
      for (let i = 0; i < 3; i++) { const k = (t * 0.9 + i / 3) % 1, x = 54 + k * (wx - 58); s += `<path class="sonic" style="opacity:${(1 - k).toFixed(2)}" d="M${x.toFixed(1)},90q6,16 0,32"/>`; }
      s += `<line class="rul" x1="52" y1="160" x2="230" y2="160"/>`;
      for (let c = 0; c <= 50; c += 5) { const x = 52 + c * 3.2; s += `<line class="tick" x1="${x}" x2="${x}" y1="160" y2="${c % 10 ? 165 : 169}"/>${c % 10 ? "" : T_(x, 180, c, "middle", "small")}`; }
      s += T_(32, 150, "HC-SR04", "middle", "small");
      return { s, port: [32, 78] };
    },
    level(h) {
      const by = 168, sc = 26, wy = by - h * sc;
      let s = `<rect class="beaker" x="40" y="40" width="104" height="${by - 40}" rx="6"/><rect class="liq" x="43" y="${wy.toFixed(1)}" width="98" height="${(by - 3 - wy).toFixed(1)}" rx="4" style="fill:var(--water)"/>`;
      s += `<rect class="strip" x="72" y="44" width="20" height="120" rx="3"/>`;
      for (let i = 0; i < 9; i++) s += `<line class="stripl" x1="${i % 2 ? 78 : 76}" x2="${i % 2 ? 78 : 76}" y1="54" y2="160" transform="translate(${i * 1.4} 0)"/>`;
      for (let c = 0; c <= 4; c++) { const y = by - c * sc; s += `<line class="tick" x1="144" x2="152" y1="${y}" y2="${y}"/>${T_(156, y + 4, c, "start", "small")}`; }
      s += T_(156, 32, "cm", "start", "small") + T_(82, 186, "level strip", "middle", "small");
      return { s, port: [82, 44] };
    },
    ldr(E) {
      const k = clamp((lg(E) - 1) / 2, 0, 1);
      let s = `<circle class="glow" cx="92" cy="34" r="${(18 + k * 22).toFixed(1)}" style="opacity:${(0.15 + k * 0.6).toFixed(2)}"/><circle class="bulb" cx="92" cy="34" r="14" style="opacity:${(0.35 + k * 0.65).toFixed(2)}"/><rect class="lampb" x="84" y="8" width="16" height="12" rx="2"/>`;
      for (let i = 0; i < 5; i++) { const ang = (-60 + i * 30) * Math.PI / 180, l = 8 + k * 26; s += `<line class="ray" style="opacity:${(0.2 + k * 0.8).toFixed(2)}" x1="${(92 + 20 * Math.sin(ang)).toFixed(1)}" y1="${(34 + 20 * Math.cos(ang)).toFixed(1)}" x2="${(92 + (20 + l) * Math.sin(ang)).toFixed(1)}" y2="${(34 + (20 + l) * Math.cos(ang)).toFixed(1)}"/>`; }
      s += `<circle class="ldrc" cx="92" cy="140" r="13"/><path class="ldrz" d="M83,136h4v8h4v-8h4v8h4"/>${T_(92, 172, "LDR", "middle", "small")}`;
      s += `<rect class="phone" x="150" y="106" width="36" height="62" rx="6"/><rect class="lcd" x="154" y="118" width="28" height="22" rx="2"/>${T_(168, 156, "lux", "middle", "small inv")}`;
      return { s, port: [105, 140] };
    },
    gas(C, t) {
      const n = Math.round(4 + (lg(C) - 2) * 7);
      let s = `<rect class="gbox" x="18" y="34" width="170" height="134" rx="8"/>`;
      for (let i = 0; i < n; i++) { const x = 30 + ((i * 53) % 146), y = 50 + ((i * 37 + t * 9 * (1 + (i % 3))) % 100); s += `<circle class="puff" cx="${x}" cy="${y.toFixed(1)}" r="${5 + (i % 3) * 2}"/>`; }
      s += `<rect class="mq" x="52" y="118" width="38" height="30" rx="4"/>`;
      for (let i = 0; i < 6; i++) s += `<line class="mesh" x1="${56 + i * 6}" x2="${56 + i * 6}" y1="120" y2="146"/>`;
      s += T_(71, 162, "MQ-2", "middle", "small") + `<rect class="det" x="128" y="104" width="34" height="50" rx="5"/><rect class="lcd" x="132" y="110" width="26" height="16" rx="2"/>${T_(145, 146, "ppm", "middle", "small")}`;
      return { s, port: [71, 118] };
    },
    ph(p) {
      const col = p <= 7 ? mixHex("#e5533d", "#3fae5a", (p - 4) / 3) : mixHex("#3fae5a", "#3b6fd8", (p - 7) / 3);
      let s = `<rect class="beaker" x="34" y="74" width="110" height="94" rx="8"/><rect class="liq" x="37" y="96" width="104" height="69" rx="6" style="fill:${col}"/>`;
      s += `<rect class="probe" x="86" y="14" width="10" height="132" rx="4"/><circle class="bulbg" cx="91" cy="150" r="8"/>`;
      [[4, "#e5533d"], [7, "#3fae5a"], [10, "#3b6fd8"]].forEach(([v, c], i) => { const x = 160 + i * 26, on = Math.abs(p - v) < 0.2; s += `<rect class="bottle2${on ? " on" : ""}" x="${x}" y="118" width="20" height="40" rx="4" style="fill:${c}"/>${T_(x + 10, 174, v, "middle", "small")}`; });
      s += T_(186, 108, "buffers", "middle", "small");
      return { s, port: [91, 14] };
    },
    div(V, t, src = "DC supply") {
      let s = `<rect class="psu" x="12" y="50" width="62" height="56" rx="6"/>${T_(43, 82, src === "DC supply" ? "DC" : "☀", "middle", "tt inv")}${T_(43, 124, src, "middle", "small")}`;
      s += D.wire([74, 62], [160, 62]) + D.res(160, 62, 160, 112) + D.res(160, 112, 160, 162) + D.wire([160, 162], [160, 170], [52, 170], [52, 106]) + D.dot(160, 112);
      s += T_(172, 92, "30 kΩ", "start", "small") + T_(172, 142, "7.5 kΩ", "start", "small");
      s += D.wire([110, 62], [110, 98]) + `<circle class="mmc" cx="110" cy="112" r="14"/>${T_(110, 117, "V", "middle", "tt")}` + D.wire([110, 126], [110, 170]);
      s += D.wire([160, 112], [204, 112]);
      return { s, port: [204, 112] };
    }
  };
  const T_ = (x, y, t, a, c) => T(x, y, t, a, c);

  /* the whole rig: the drawing, the reference display, wires and the ESP32 with what it reads */
  function rig(o, v, t, refTxt, readTxt, flash, src) {
    const a = ART[o.k](v, t, src);
    let s = a.s;
    s += `<path class="cable sig" d="M${a.port[0]},${a.port[1]}C${a.port[0] + 40},${Math.min(a.port[1], 60) - 20} 230,40 262,72"/>`;
    s += `<rect class="esp" x="262" y="34" width="86" height="98" rx="8"/>${T_(305, 60, "ESP32", "middle", "tt inv")}${T_(305, 84, o.pinS, "middle", "small inv")}`;
    s += `<rect class="lcd${flash ? " flash" : ""}" x="232" y="150" width="120" height="26" rx="4"/>${T_(292, 168, readTxt, "middle", "lcdt sm")}${T_(292, 194, o.readLab, "middle", "small")}`;
    s += `<rect class="refbox${flash ? " flash" : ""}" x="8" y="200" width="196" height="28" rx="5"/>${T_(16, 219, `${o.refS}:`, "start", "small")}${T_(196, 220, refTxt, "end", "lcdt sm")}`;
    return s;
  }

  const SENS = [
    { k: "lm35", chip: "LM35 temperature", name: "LM35 Temperature Sensor", q: "Temperature", qs: "T", qu: " °C", rName: "ADC reading", rs: "ADC", ru: "", fit: "lin", qdp: 1, rdp: 0,
      data: [[0, 22], [25, 326], [40, 515], [55, 694], [70, 880]], xr: [-4, 78], xt: [0, 20, 40, 60], yr: [0, 1000], yt: [0, 250, 500, 750, 1000],
      pinS: "GPIO34", refS: "Thermometer", readLab: "ESP32 reads (ADC)",
      out: "10 mV per °C, 0 V at 0 °C. At 70 °C it gives 0.70 V, well inside the ESP32's 0 to 3.3 V.", pin: "GPIO34 (an ADC1 pin)",
      ref: "A <strong>reference thermometer</strong> (a calibrated digital probe thermometer) in the same water as the LM35.",
      how: "Ice water (0 °C), room-temperature water, then warm water mixed to about 40, 55 and 70 °C. Stir, wait about a minute until both readings are steady, then record.",
      why: "The LM35 is linear, so a straight line fits.",
      bad: "A multimeter on the LM35's output only checks the <em>voltage</em>, not the temperature: the reference must measure the real quantity, here a thermometer. Waterproof the LM35's legs (heat-shrink tubing) before it goes into water.",
      pre: "ADC = analogRead(34);", vr: "ADC", vq: "Temp" },
    { k: "acs", chip: "ACS712 current", name: "ACS712 Current Sensor", q: "Current", qs: "I", qu: " A", rName: "ADC reading", rs: "ADC", ru: "", fit: "lin", qdp: 3, rdp: 0,
      data: [[0, 2058], [0.5, 2139], [1, 2211], [1.5, 2291], [2, 2364]], xr: [-0.1, 2.2], xt: [0, 0.5, 1, 1.5, 2], yr: [2000, 2400], yt: [2000, 2100, 2200, 2300, 2400],
      pinS: "GPIO35", refS: "Multimeter (series)", readLab: "ESP32 reads (ADC)",
      out: "2.5 V at 0 A and 185 mV per amp (5 A version on a 5 V supply). A 10 kΩ / 20 kΩ divider scales it by 2/3: 1.67 V at 0 A and 123 mV per amp at the pin.", pin: "GPIO35, through the divider",
      ref: "A <strong>digital multimeter in series</strong> with the load (on its 10 A range).",
      how: "Change a DC load step by step (power resistors, a 12 V DC motor or a DC electronic load) from 0 A to about 2 A, and record the multimeter's current and the ESP32's reading at each step.",
      why: "The ACS712 is linear, so a straight line fits. Its intercept is the 0 A reading, which is large because the output sits at half the supply.",
      bad: "Without the divider the output reaches 3.43 V at 5 A: above 3.3 V the reading clips, and near 3.6 V the ESP32 pin can be damaged. Take a fresh 0 A reading each time you start, because the zero drifts a little.",
      pre: "ADC = analogRead(35);", vr: "ADC", vq: "Current" },
    { k: "pot", chip: "Potentiometer angle", name: "Potentiometer Angle Sensor", q: "Angle", qs: "θ", qu: "°", rName: "ADC reading", rs: "ADC", ru: "", fit: "lin", qdp: 1, rdp: 0,
      data: [[0, 176], [40, 1090], [80, 1985], [120, 2868], [160, 3770]], xr: [-6, 170], xt: [0, 40, 80, 120, 160], yr: [0, 4095], yt: [0, 1000, 2000, 3000, 4000],
      pinS: "GPIO36", refS: "Protractor", readLab: "ESP32 reads (ADC)",
      out: "The wiper voltage, from near 0 V to near 3.3 V as the shaft turns.", pin: "GPIO36 (VP)",
      ref: "A <strong>protractor</strong>, with a pointer fixed to the shaft.",
      how: "Turn the shaft to 0°, 40°, 80°, 120° and 160° (the range your project uses) and record each reading. The virtual lab above lets you do this yourself.",
      why: "A linear potentiometer gives a straight line.",
      bad: "Near the ends of the track, and near 0 V and 3.3 V on the ESP32's ADC, the reading goes flat. Calibrate only the range you use and keep away from the ends.",
      pre: "ADC = analogRead(36);", vr: "ADC", vq: "Angle" },
    { k: "hcsr", chip: "HC-SR04 distance", name: "HC-SR04 Ultrasonic Distance Sensor", q: "Distance", qs: "d", qu: " cm", rName: "Echo time (µs)", rs: "t", ru: " µs", fit: "lin", qdp: 1, rdp: 0,
      data: [[10, 596], [20, 1172], [30, 1761], [40, 2337], [50, 2925]], xr: [0, 55], xt: [0, 10, 20, 30, 40, 50], yr: [0, 3200], yt: [0, 1000, 2000, 3000],
      pinS: "Echo GPIO18", refS: "Ruler", readLab: "ESP32 times the echo",
      out: "A pulse on the Echo pin as long as the sound takes to reach the target and come back: about 58 µs per cm.", pin: "Trig on GPIO5; Echo on GPIO18 through a 1 kΩ / 2 kΩ divider (digital pins, not the ADC)",
      ref: "A <strong>ruler or measuring tape</strong> from the sensor's face to a large, flat board.",
      how: "Put the board at 10, 20, 30, 40 and 50 cm and average several readings at each distance.",
      why: "Echo time rises in step with distance, so a straight line fits.",
      bad: "The HC-SR04 is not an analog sensor: the ESP32 times a pulse with <code>pulseIn()</code> instead of reading the ADC. Its Echo pin gives 5 V, so it needs a divider, and the speed of sound changes with air temperature, so recalibrate if the room is much hotter or colder.",
      pre: "t = pulseIn(18, HIGH);", vr: "t", vq: "Distance" },
    { k: "level", chip: "Liquid level strip", name: "Analog Liquid Level Strip", q: "Depth", qs: "h", qu: " cm", rName: "ADC reading", rs: "ADC", ru: "", fit: "quad", qdp: 2, rdp: 0,
      data: [[0.5, 820], [1, 1250], [2, 1720], [3, 2010], [4, 2200]], xr: [0, 4.5], xt: [0, 1, 2, 3, 4], yr: [0, 2500], yt: [0, 500, 1000, 1500, 2000, 2500],
      pinS: "GPIO32", refS: "Ruler", readLab: "ESP32 reads (ADC)",
      out: "The voltage rises as more of the strip is under water: quickly at first, then more slowly.", pin: "GPIO32, with the strip powered from GPIO25 only while reading",
      ref: "A <strong>ruler</strong> fixed beside the container.",
      how: "Add water in steps to 0.5, 1, 2, 3 and 4 cm and record the reading at each depth.",
      why: "The points bend, so a straight line would miss them. Fit a curve, and fit it the other way round (depth from the reading) so the ESP32 can use it directly.",
      bad: "Powered all the time, the strip corrodes within days: switch its power from a GPIO only while you read it. The reading also depends on the liquid (tap, rain or salty water), so calibrate in the liquid you will measure.",
      pre: "digitalWrite(25, HIGH);\ndelay(10);\nADC = analogRead(32);\ndigitalWrite(25, LOW);", vr: "ADC", vq: "Depth" },
    { k: "ldr", chip: "LDR light", name: "LDR Light Sensor", q: "Light", qs: "E", qu: " lux", rName: "ADC reading", rs: "ADC", ru: "", fit: "pow", qdp: 0, rdp: 0,
      data: [[10, 385], [50, 820], [100, 1100], [300, 1840], [1000, 3150]], xr: [lg(6), lg(1600)], xt: [1, 2, 3], yr: [lg(250), lg(4000)], yt: [lg(300), lg(1000), lg(3000)],
      pinS: "GPIO33", refS: "Lux meter", readLab: "ESP32 reads (ADC)",
      out: "The LDR's resistance falls as the light rises, so the divider voltage rises, but not in a straight line.", pin: "GPIO33: LDR to 3.3 V, 10 kΩ to GND (the reading rises with light)",
      ref: "A <strong>lux meter</strong>, or a phone lux meter app held where the LDR is (good enough for a project; say so in your report).",
      how: "Dim a lamp or move it closer in steps: about 10, 50, 100, 300 and 1000 lux.",
      why: "On normal axes the points bend strongly. On log axes they lie on a straight line (a power law), so fit log(ADC) against log(lux).",
      bad: "Every LDR is different, even from the same bag, and it takes a few seconds to settle after the light changes. Calibrate your own LDR and wait before you record.",
      pre: "ADC = analogRead(33);", vr: "ADC", vq: "Lux" },
    { k: "gas", chip: "MQ-2 / MQ-135 gas", name: "MQ-2 or MQ-135 Gas Sensor", q: "Gas", qs: "C", qu: " ppm", rName: "R<tspan class='sb' dy='3'>s</tspan><tspan dy='-3'>/R</tspan><tspan class='sb' dy='3'>0</tspan>", rText: "Rs/R0", rs: "Rs/R0", ru: "", fit: "pow", qdp: 0, rdp: 3,
      data: [[200, 1.62], [500, 1.11], [1000, 0.80], [2000, 0.57], [5000, 0.385]], xr: [lg(120), lg(8000)], xt: [lg(200), lg(500), lg(1000), lg(2000), lg(5000)], yr: [lg(0.3), lg(2.2)], yt: [lg(0.3), lg(0.5), lg(1), lg(2)],
      pinS: "GPIO39", refS: "Gas detector", readLab: "ESP32 works out Rs/R0",
      out: "The sensor's resistance R<sub>s</sub> falls as the gas rises. The ESP32 works out R<sub>s</sub> from the voltage, then divides it by R<sub>0</sub>, its resistance in clean air.", pin: "GPIO39 (VN), through a divider (the module's output can reach 5 V)",
      ref: "A <strong>calibrated gas detector</strong> beside the sensor in a closed box; without one, the curve in the sensor's datasheet.",
      how: "Heat a new sensor for 24 to 48 hours first (burn-in). In clean air find R<sub>0</sub> = R<sub>s</sub> ÷ the clean-air ratio on the datasheet chart (about 9.8 for the MQ-2). Then let in small, safe amounts of gas and record the detector's ppm and R<sub>s</sub>/R<sub>0</sub> at each step.",
      why: "Gas sensors follow a power law: the straight line on the datasheet's log-log chart. Fit log(R<sub>s</sub>/R<sub>0</sub>) against log(ppm).",
      bad: "The ADC number is not ppm: work out R<sub>s</sub>, then R<sub>s</sub>/R<sub>0</sub>, then ppm. MQ sensors also react to temperature, humidity and other gases, so treat the ppm as approximate. Do any gas test only with your lecturer present, away from flames.",
      pre: "Vout = analogRead(39) * 3.3 / 4095 * 1.5;   // undo the divider\nRs = RL * (5.0 - Vout) / Vout;\nRatio = Rs / R0;", vr: "Ratio", vq: "PPM" },
    { k: "ph", chip: "pH probe", name: "pH Probe", q: "pH", qs: "pH", qu: "", rName: "ADC reading", rs: "ADC", ru: "", fit: "lin", qdp: 2, rdp: 0,
      data: [[4, 2482], [7, 1961], [10, 1430]], xr: [3, 11], xt: [4, 7, 10], yr: [1200, 2700], yt: [1200, 1600, 2000, 2400],
      pinS: "GPIO34", refS: "Buffer solution", readLab: "ESP32 reads (ADC)",
      out: "The probe gives a small voltage that falls as the pH rises; the module amplifies it to roughly 1 to 3 V.", pin: "GPIO34 (check the output stays below 3.3 V; add a divider if the module runs from 5 V)",
      ref: "<strong>pH buffer solutions</strong> of pH 4.00, 7.00 and 10.00.",
      how: "Dip the probe in each buffer, wait about a minute until the reading is steady and record it. Rinse the probe in distilled water and blot it dry before the next buffer. Three points are normal for pH.",
      why: "Over pH 4 to 10 the probe is linear, so a straight line fits. The slope is negative: the reading falls as the pH rises.",
      bad: "pH probes drift: recalibrate every week or two, at the temperature you will measure at. Never let the glass bulb dry out; keep it in its storage solution.",
      pre: "ADC = analogRead(34);", vr: "ADC", vq: "pH" },
    { k: "div", chip: "Voltage divider", name: "Voltage Divider (Battery or Solar Panel)", q: "Voltage", qs: "V", qu: " V", rName: "ADC reading", rs: "ADC", ru: "", fit: "lin", qdp: 2, rdp: 0,
      data: [[2, 350], [4, 841], [6, 1343], [8, 1835], [10, 2336], [12, 2826]], xr: [0, 13], xt: [0, 4, 8, 12], yr: [0, 3200], yt: [0, 1000, 2000, 3000],
      pinS: "GPIO35", refS: "Multimeter", readLab: "ESP32 reads (ADC)",
      out: "The divider scales the voltage down: 12 V × 7.5 ÷ (30 + 7.5) = 2.4 V at the pin.", pin: "GPIO35, through 30 kΩ (top) and 7.5 kΩ (bottom)",
      ref: "A <strong>digital multimeter</strong> across the input, with a DC supply set to each voltage.",
      how: "Set 2, 4, 6, 8, 10 and 12 V (check each on the multimeter) and record the reading.",
      why: "A divider is linear, so a straight line fits. The line reaches ADC = 0 a little above 0 V because the ESP32's ADC reads low near 0 V.",
      bad: "Working it out from theory alone (V = ADC × 3.3 ÷ 4095 × 5) gives an answer about 0.6 V off, because the ESP32's ADC reads low (see Why Calibrate the Whole System above). Choose the divider so the largest input stays below about 3.1 V at the pin, where the ADC is still linear.",
      pre: "ADC = analogRead(35);", vr: "ADC", vq: "Volts" }
  ];

  /* fit each sensor once: lin → reading = m q + c; quad → q = a r² + b r + c; pow → log r = m log q + c */
  function fitOf(o) {
    if (o._fit) return o._fit;
    let f;
    if (o.fit === "lin") { const L = linFit(o.data); f = { m: L.m, c: L.c, fwd: (q) => L.m * q + L.c, inv: (r) => (r - L.c) / L.m, R2: r2(o.data, L.f) }; }
    else if (o.fit === "quad") { const Q = quadFit(o.data.map(([q, r]) => [r, q])); f = { a: Q.a, b: Q.b, c: Q.c, inv: Q.f, R2: r2(o.data.map(([q, r]) => [r, q]), Q.f) }; }
    else { const L = linFit(o.data.map(([q, r]) => [lg(q), lg(r)])); f = { m: L.m, c: L.c, fwd: (q) => 10 ** (L.m * lg(q) + L.c), inv: (r) => 10 ** ((lg(r) - L.c) / L.m), R2: r2(o.data.map(([q, r]) => [lg(q), lg(r)]), L.f) }; }
    o._fit = f; return f;
  }
  const pm = (x, d) => `${x < 0 ? MINUS : "+"} ${Math.abs(x).toFixed(d)}`;
  const sig = (x, p = 4) => Number(x.toPrecision(p));
  // a number for an equation shown on the page: 4 significant figures, small numbers as × 10^n
  const sci = (x) => { if (x !== 0 && Math.abs(x) < 0.001) { const e = Math.floor(lg(Math.abs(x))), m = x / 10 ** e; return `${m.toFixed(3)} × 10<sup>${MINUS}${-e}</sup>`; } return String(sig(x)).replace("-", MINUS); };
  const plusC = (c) => `${c < 0 ? MINUS : "+"} ${sci(Math.abs(c))}`;
  function eqLines(o) {
    const f = fitOf(o), R = o.rText || o.rs;
    if (o.fit === "lin") return { fit: `${R} = ${sci(f.m)} × ${o.qs} ${plusC(f.c)}`, back: `${o.qs} = (${R} ${f.c < 0 ? "+" : MINUS} ${sci(Math.abs(f.c))}) ÷ ${f.m < 0 ? `(${sci(f.m)})` : sci(f.m)}`,
      code: `${o.vq} = (${o.vr} - (${cnum(f.c, 5)})) / ${cnum(f.m, 4)};` };
    if (o.fit === "quad") return { fit: `${o.qs} = ${sci(f.a)} × ${R}² ${plusC(f.b)} × ${R} ${plusC(f.c)}`, back: "",
      code: `${o.vq} = (${cnum(f.a, 5)} * ${o.vr} * ${o.vr}) + (${cnum(f.b, 5)} * ${o.vr}) + (${cnum(f.c, 5)});` };
    return { fit: `log(${R}) = ${sci(f.m)} × log(${o.qs}) ${plusC(f.c)}`, back: `${o.qs} = 10<sup>(log(${R}) ${f.c < 0 ? "+" : MINUS} ${sci(Math.abs(f.c))}) ÷ ${f.m < 0 ? `(${sci(f.m)})` : sci(f.m)}</sup>`,
      code: `${o.vq} = pow(10, (log10(${o.vr}) - (${cnum(f.c, 5)})) / ${cnum(f.m, 4)});` };
  }

  /* the calibration graph, revealing n points and k (0..1) of the fitted line */
  function calGraph(o, n, k, hi) {
    const f = fitOf(o), lp = o.fit === "pow";
    const A = axes({ x: o.xr, y: o.yr, xt: o.xt, yt: o.yt, fx: lp ? tick10 : undefined, fy: lp ? tick10 : undefined, l: 52,
      xl: `${o.q}${o.qu ? ` (${o.qu.trim()})` : ""}${lp ? ", log scale" : ""}`, yl: `${o.rName}${lp ? ", log" : ""}` });
    let g = A.s;
    const P = ([q, r]) => [A.X(lp ? lg(q) : q), A.Y(lp ? lg(r) : r)];
    if (k > 0) {
      let pts = [];
      if (o.fit === "quad") { const r0 = 650, r1 = 2350; for (let i = 0; i <= 60 * k; i++) { const r = r0 + ((r1 - r0) * i) / 60; pts.push([A.X(A.clipX(f.inv(r))), A.Y(r)]); } }
      else { const x0 = o.xr[0], x1 = o.xr[1]; for (let i = 0; i <= 60 * k; i++) { const x = x0 + ((x1 - x0) * i) / 60; const y = lp ? f.m * x + f.c : f.fwd(x); pts.push([A.X(x), A.Y(A.clipY(y))]); } }
      if (pts.length > 1) g += poly(pts, "trace-a");
    }
    o.data.slice(0, n).forEach((d, i) => { const [x, y] = P(d); g += `<circle class="${i === hi ? "pt" : "shot"}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === hi ? 6 : 5}"/>`; });
    if (k >= 1) g += T(A.l + 8, A.t + 14, `R² = ${f.R2.toFixed(4)}`, "start", "mklab");
    return svg(A.W, A.H, `Calibration graph for the ${o.name}`, g);
  }

  function sensorTable(o) {
    const f = fitOf(o), span = o.data[o.data.length - 1][0] - o.data[0][0];
    let worst = 0;
    const rows = o.data.map(([q, r]) => { const b = f.inv(r), e = b - q; worst = Math.max(worst, Math.abs(e)); return `<tr><td>${fmtN(q, o.qdp === 0 ? 0 : Math.min(o.qdp, 2))}</td><td>${fmtN(r, o.rdp)}</td><td>${fmtN(b, o.qdp)}</td><td>${sgn(e, o.qdp)}</td></tr>`; }).join("");
    return { html: `<div class="tbl-wrap"><table class="cal-table"><thead><tr><th>Reference ${o.q === "pH" ? "pH" : o.q.toLowerCase()}${o.qu ? ` (${o.qu.trim()})` : ""}</th><th>${o.rText || o.rName.replace(/<[^>]+>/g, "")}</th><th>From the fit</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></div>`, worst, span };
  }

  function mountSensors(el) {
    el.innerHTML = `<div class="pv">${chips("Sensor", SENS.map((o) => [o.k, o.chip]), "lm35")}<h4 class="sub-h sx-name"></h4>
      <div class="pv-grid"><div class="pv-scene"></div><div class="pv-graph"></div></div><div class="pv-pl"></div><p class="pv-read" aria-live="polite"></p><div class="sx-body"></div></div>`;
    const q = (s) => el.querySelector(s);
    let o = SENS[0];
    const SEG = 2.2, FIT = 3, DUR = 14;           // the player runs 0..DUR; each sensor's own time is scaled into it
    const N = () => o.data.length, own = () => N() * SEG + FIT;
    const fmtR = (r) => `${fmtN(r, o.rdp)}${o.ru}`;
    const qTxt = (v) => (o.k === "ph" ? `pH ${v.toFixed(2)}` : `${fmtN(v, o.qdp === 0 ? 0 : Math.min(o.qdp, 2))}${o.qu}`);
    const draw = (T0) => {
      const t = (T0 / DUR) * own(), n = N(), seg = Math.floor(t / SEG), inSeg = t - seg * SEG, lp = o.fit === "pow";
      let v, r, shown, flash = false, k = 0, hi = -1;
      if (seg < n) {
        const a = o.data[Math.max(0, seg - 1)], m = smooth(inSeg / 1.2);
        v = lp ? 10 ** lerp(lg(a[0]), lg(o.data[seg][0]), m) : lerp(a[0], o.data[seg][0], m);
        r = lp ? 10 ** lerp(lg(a[1]), lg(o.data[seg][1]), m) : lerp(a[1], o.data[seg][1], m);
        const done = inSeg >= 1.2; shown = done ? seg + 1 : seg; flash = done && inSeg < 1.7; hi = done ? seg : -1;
      } else { [v, r] = o.data[n - 1]; shown = n; k = clamp((t - n * SEG) / (FIT * 0.8), 0, 1); }
      q(".pv-scene").innerHTML = svg(360, 234, `${o.name} being calibrated: reference ${qTxt(v)}, reading ${fmtR(r)}`, rig(o, v, T0, qTxt(v), fmtR(r), flash), "scene calrig");
      q(".pv-graph").innerHTML = calGraph(o, shown, k, hi);
      q(".pv-read").innerHTML = seg < n
        ? `<strong>Point ${seg + 1} of ${n}.</strong> Reference: <strong>${qTxt(v)}</strong>. The ESP32 ${o.k === "hcsr" ? "times" : o.k === "gas" ? "works out" : "reads"} <strong>${fmtR(r)}</strong>. ${inSeg >= 1.2 ? "Both are steady: <strong>record</strong> the pair, and the point goes on the graph." : "Wait until both readings are steady…"}`
        : `<strong>${k < 1 ? "Fitting…" : "Fitted:"}</strong> ${eqLines(o).fit}${lp ? " (a straight line on log axes)" : ""}, R² = ${fitOf(o).R2.toFixed(4)}. The ${o.fit === "quad" ? "curve" : "line"} passes close to every point.`;
    };
    const body = () => {
      q(".sx-name").textContent = o.name;
      const e = eqLines(o), tb = sensorTable(o), dp = o.qdp === 0 ? 0 : o.qdp, lo = o.data[0][0], hi = o.data[N() - 1][0];
      q(".sx-body").innerHTML = `<dl class="defs sx-defs"><div><dt>What it gives out</dt><dd>${o.out}</dd></div><div><dt>ESP32 pin</dt><dd>${o.pin}</dd></div><div><dt>Reference</dt><dd>${o.ref}</dd></div><div><dt>How to take the points</dt><dd>${o.how}</dd></div><div><dt>Which line?</dt><dd>${o.why}</dd></div></dl>
        <h5 class="sx-h">Calibration Table (Example Data)</h5>${tb.html}
        <h5 class="sx-h">The Equation</h5><p class="formula">${e.fit}</p>${e.back ? `<p>Used backwards, from the reading to the ${o.q === "pH" ? "pH" : o.q.toLowerCase()}:</p><p class="formula">${e.back}</p>` : `<p>It already gives the ${o.q.toLowerCase()} from the reading, so the ESP32 can use it as it is.</p>`}
        <p>Largest error at the calibration points: <strong>${tb.worst.toFixed(dp)}${o.qu}</strong>, which is <strong>${((tb.worst / tb.span) * 100).toFixed(2)}% of full scale</strong> (the calibrated range, ${qTxt(lo)} to ${qTxt(hi)}; see <a href="#check">Checking the Calibration</a>).</p>
        ${codeBlock(`${o.pre}\n${e.code}`, "In the ESP32 sketch")}
        <div class="callout warn"><strong>Common mistake</strong>${o.bad}</div>`;
    };
    const pl = player(q(".pv-pl"), el, { dur: DUR, hold: 3, draw, still: DUR, label: "Calibration position", clock: (T0) => { const t = (T0 / DUR) * own(); return t < N() * SEG ? `point ${Math.min(N(), Math.floor(t / SEG) + 1)} of ${N()}` : "fit"; } });
    pick(el, (key) => { o = SENS.find((x) => x.k === key); body(); if (reduceMotion) pl.set(DUR); else pl.restart(); });
    body();
  }

  /* three kinds of calibration line, and why log axes straighten a power law */
  const LDRD = [[10, 390], [50, 810], [100, 1110], [300, 1830], [1000, 3162]];
  function miniPlot(kind) {
    const A = axes({ W: 220, H: 150, l: 30, b: 26, t: 10, r: 10, x: [0, 1], y: [0, 1], xt: [], yt: [], xl: kind === "pow" ? "log value" : "value", yl: kind === "pow" ? "log reading" : "reading" });
    let g = A.s;
    const P = kind === "lin" ? [[0.1, 0.16], [0.3, 0.37], [0.5, 0.53], [0.7, 0.74], [0.9, 0.9]] : kind === "quad" ? [[0.1, 0.25], [0.25, 0.52], [0.45, 0.72], [0.7, 0.86], [0.9, 0.92]] : [[0.1, 0.14], [0.3, 0.35], [0.5, 0.56], [0.7, 0.73], [0.9, 0.94]];
    const fn = kind === "quad" ? (x) => 1.02 - 0.95 * Math.exp(-3.1 * x) : (x) => 0.04 + 0.97 * x;
    g += poly(curve(A, fn, 0.04, 0.98, 40), "trace-a");
    P.forEach(([x, y]) => { g += `<circle class="shot" cx="${A.X(x).toFixed(1)}" cy="${A.Y(y).toFixed(1)}" r="4"/>`; });
    return svg(A.W, A.H, kind === "lin" ? "Points on a straight line" : kind === "quad" ? "Points on a curve" : "Points on a straight line on log axes", g);
  }
  function mountKinds(el) {
    el.innerHTML = `<div class="kinds">
        <figure class="kind">${miniPlot("lin")}<figcaption><strong>Straight line</strong>reading = m × value + c<span>LM35, ACS712, potentiometer, HC-SR04, pH probe, voltage divider</span></figcaption></figure>
        <figure class="kind">${miniPlot("quad")}<figcaption><strong>Curve</strong>value = a × reading² + b × reading + c<span>liquid level strip, capacitive level sensor</span></figcaption></figure>
        <figure class="kind">${miniPlot("pow")}<figcaption><strong>Power law</strong>log(reading) = m × log(value) + c<span>LDR, MQ gas sensors</span></figcaption></figure></div>
      <div class="pv"><h4 class="sub-h">Why Log Axes? Watch an LDR's Points Straighten</h4><div class="pv-graph kinds-morph"></div><div class="pv-pl"></div><p class="pv-read"></p></div>`;
    const box = el.querySelector(".kinds-morph"), read = el.querySelector(".pv-read");
    const W = 380, H = 240, l = 58, r = 14, t0 = 14, b = 42, pw = W - l - r, ph = H - t0 - b;
    const Xl = (v) => l + (v / 1100) * pw, Xg = (v) => l + ((lg(v) - lg(6)) / (lg(1600) - lg(6))) * pw;
    const Yl = (v) => t0 + (1 - v / 3500) * ph, Yg = (v) => t0 + (1 - (lg(v) - lg(250)) / (lg(4000) - lg(250))) * ph;
    const draw = (t) => {
      const p = smooth((t - 2.5) / 2), X = (v) => lerp(Xl(v), Xg(v), p), Y = (v) => lerp(Yl(v), Yg(v), p);
      let g = "";
      [0, 250, 500, 750, 1000].forEach((v) => { g += `<g style="opacity:${(1 - p).toFixed(2)}"><line class="gl" x1="${Xl(v)}" x2="${Xl(v)}" y1="${t0}" y2="${t0 + ph}"/>${T(Xl(v), t0 + ph + 15, v, "middle", "axis")}</g>`; });
      [10, 100, 1000].forEach((v) => { g += `<g style="opacity:${p.toFixed(2)}"><line class="gl" x1="${Xg(v)}" x2="${Xg(v)}" y1="${t0}" y2="${t0 + ph}"/>${T(Xg(v), t0 + ph + 15, v, "middle", "axis")}</g>`; });
      [0, 1000, 2000, 3000].forEach((v) => { g += `<g style="opacity:${(1 - p).toFixed(2)}"><line class="gl" x1="${l}" x2="${l + pw}" y1="${Yl(v)}" y2="${Yl(v)}"/>${T(l - 5, Yl(v) + 4, v, "end", "axis")}</g>`; });
      [300, 1000, 3000].forEach((v) => { g += `<g style="opacity:${p.toFixed(2)}"><line class="gl" x1="${l}" x2="${l + pw}" y1="${Yg(v)}" y2="${Yg(v)}"/>${T(l - 5, Yg(v) + 4, v, "end", "axis")}</g>`; });
      g += `<path class="ax" d="M${l},${t0}V${t0 + ph}H${l + pw}"/>` + T(l + pw / 2, H - 6, p < 0.5 ? "Light (lux)" : "Light (lux), log scale", "middle", "axl") + `<text class="axl" transform="translate(13 ${t0 + ph / 2}) rotate(-90)" text-anchor="middle">${p < 0.5 ? "ADC reading" : "ADC reading, log scale"}</text>`;
      const curvePts = []; for (let i = 0; i <= 50; i++) { const v = 10 * 100 ** (i / 50); curvePts.push([X(v), Y(10 ** ((lg(v) + 4.7) / 2.2))]); }
      g += poly(curvePts, p > 0.98 ? "trace-a" : "trace-in");
      LDRD.forEach(([v, a]) => { g += `<circle class="shot" cx="${X(v).toFixed(1)}" cy="${Y(a).toFixed(1)}" r="5"/>`; });
      box.innerHTML = svg(W, H, p < 0.5 ? "LDR calibration points on normal axes: they bend" : "The same points on log axes: a straight line", g);
      read.innerHTML = p < 0.05 ? "On <strong>normal axes</strong> the LDR's points bend: a straight line would be badly wrong in the middle." : p < 0.98 ? "Stretching both axes to <strong>log scales</strong>…" : "On <strong>log axes</strong> the same points lie on a <strong>straight line</strong>. Fit that line, log(ADC) = m × log(lux) + c, and the power law is found.";
    };
    player(el.querySelector(".pv-pl"), el, { dur: 8, hold: 2, draw, still: 8, label: "Axis change position" });
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
    { id: "check", group: "intro", title: "Checking the Calibration: Error and Percent of Full Scale", toc: "Error and % Full Scale",
      intro: `<p>Step 5 of a calibration is to <strong>check</strong> it: how far is the equation from the truth? You already have everything you need in the calibration table.</p>
        <h4 class="sub-h">1. The Error at a Calibration Point</h4>
        <p>At each point you know the <strong>true value</strong> (from the reference) and the <strong>reading</strong> taken at that moment. Put the reading into the calibration equation, used backwards, and compare:</p>
        <p class="formula">error = value from the equation − true value</p>
        <ul class="where"><li>a <strong>positive</strong> error: the system reads high</li><li>a <strong>negative</strong> error: it reads low</li></ul>
        <h4 class="sub-h">2. Percent of Full Scale</h4>
        <p>To judge whether an error is big or small, compare it with the <strong>full-scale range</strong>, the whole range the instrument is calibrated to measure:</p>
        <p class="formula">% FS error = |error| ÷ full-scale range × 100</p>
        <ul class="where"><li>|error|: the size of the error, without its sign</li><li>full-scale range: for example 0 to 80 °C gives 80 °C, and 0 to 10 kPa gives 10 kPa</li></ul>
        <div class="callout info"><strong>Why full scale, not % of the reading?</strong>The same 0.4 °C error is 1% of a 40 °C reading but 40% of a 1 °C reading, and at 0 °C it cannot be worked out at all. Full scale gives one fixed yardstick for the whole range. It is also how manufacturers state accuracy (Chapter 1: "accurate to ±1% of full scale").</div>
        <div class="eg"><span class="eg-h">Worked example</span>A pressure sensor is calibrated from 0 to 10 kPa against a reference gauge. The equation obtained is ADC = 310P + 120. At a true 2.5 kPa the ESP32 read 912.<br>
          Used backwards: P = (ADC − 120) ÷ 310 = (912 − 120) ÷ 310 = <strong>2.555 kPa</strong><br>
          Error = 2.555 − 2.5 = <strong>+0.055 kPa</strong> (it reads a little high)<br>
          % FS = 0.055 ÷ 10 × 100 = <strong>0.55% of full scale</strong></div>
        <p>Press play to check every point of this sensor. The gap from each point to the line is its error (drawn larger so you can see it), and the bar shows how small it is against the full scale.</p>`,
      mount: mountCheck,
      after: `<h4 class="sub-h">3. Why Does the Error Occur?</h4>
        <ol class="tight"><li><strong>The line is a best fit.</strong> Least squares draws one straight line through all the points together, so it passes close to each point but not exactly through every one. This is the main reason, and the gap at each point is its error.</li>
          <li><strong>The sensor is not perfectly linear:</strong> its real response bends a little.</li>
          <li><strong>The ESP32's ADC</strong> has its own offset and non-linearity (see Why Calibrate the Whole System, below).</li>
          <li><strong>Noise</strong>, or a reading recorded before it was steady.</li>
          <li><strong>The reference</strong> has its own accuracy limit: the calibration can never be better than the reference.</li>
          <li><strong>Rounding</strong> the equation's coefficients (see Exercise 8).</li>
          <li><strong>Drift</strong>: temperature and ageing move the readings over time, which is why sensors are recalibrated.</li></ol>
        <div class="callout tip"><strong>How to write it</strong>Name the cause, say what it does to the points, and link it to the line. For the pressure sensor: "The equation is a least-squares straight line fitted through all five points. Because of small non-linearity and noise in the sensor and the ADC, the points do not lie exactly on the line, so at 2.5 kPa the equation reads 0.055 kPa high."</div>` },
    { id: "vlab", group: "lab", title: "Calibrate a Sensor, Step by Step", toc: "Virtual Lab",
      intro: `<p>Two sensors from the textbook. On the <strong>potentiometer</strong> tab, a pointer on the shaft turns over a protractor (the reference) and the wiper voltage goes to the ESP32's ADC on GPIO36. On the <strong>water level</strong> tab, a two-wire capacitive sensor stands in a bottle with a ruler (the reference); the 555 timer's frequency goes to GPIO14.</p>
        <p>Set a known value, <strong>record</strong> the reading, repeat, then <strong>fit</strong> and watch the ESP32 show real units. The Error column is worked out as in Checking the Calibration above. This is also good practice before the potentiometer lab: the full version is the <a href="lab-2.html">Lab 2 virtual lab</a>.</p>`,
      mount: mountLab },
    { id: "system", group: "whole", title: "Why Calibrate the Whole System?", toc: "The ESP32's ADC",
      intro: `<p>In theory the ESP32's 12-bit ADC turns 0 to 3.3 V into 0 to 4095, so V = 3.3 × ADC ÷ 4095. In practice, a 2.5 V supply may be shown as about 2.36 V, and the ADC is not linear near 0 V and near 3.3 V. The power supply itself may not be calibrated either.</p>
        <p>That is why the virtual lab calibrates the <strong>angle</strong> or the <strong>depth</strong> directly: one calibration corrects the sensor, the wiring and the ADC together.</p>`,
      mount: mountAdc,
      after: `<div class="callout info"><strong>Good to know</strong>The ESP32 has 18 ADC channels. Use the ADC1 pins (GPIO32 to 39) for sensors: the ADC2 pins stop working while Wi-Fi is on. The curve above is a typical example; every chip is slightly different, which is exactly why each one is calibrated.</div>` },
    { id: "kinds", group: "sensors", title: "Three Kinds of Calibration Line", toc: "Three Kinds of Line",
      intro: `<p>Every calibration ends with an equation that links the sensor's reading to the real value. Plot the calibration points first: their shape tells you which kind of equation to fit.</p>
        <ul class="tight"><li><strong>Straight line</strong>: the points lie along a line. Most sensors behave like this over the range a project uses.</li><li><strong>Curve</strong>: the points bend. Fit a second-order curve (a quadratic), as the virtual lab did for the capacitive level sensor.</li><li><strong>Power law</strong>: the points bend strongly, but lie on a straight line when <em>both</em> axes are logarithmic. LDRs and gas sensors behave like this.</li></ul>`,
      mount: mountKinds },
    { id: "sensors", group: "sensors", title: "Calibrating Nine Common Sensors", toc: "Nine Sensors",
      intro: `<p>Choose a sensor. The animation takes each calibration point in turn: set the reference, wait until both readings are steady, record the pair, then fit the line. Below it are the reference to use, how to take the points, the table, the equation, the line for the ESP32 sketch and the mistake to avoid.</p>
        <p>The numbers are realistic example data. Your own sensor will give slightly different numbers, which is exactly why each one is calibrated.</p>`,
      mount: mountSensors }
  ];

  /* =====================================================================
     Exercise figures
     ===================================================================== */
  const SX = (k) => SENS.find((o) => o.k === k);
  const xfig = (inner, cls = "") => `<div class="scene-scroll">${inner}</div>`;
  const rigFig = (k, v, refTxt, readTxt, lab, src) => xfig(svg(360, 234, lab, rig(SX(k), v, 0, refTxt, readTxt, false, src), "scene exfig calrig"));
  const tbl = (head, rows) => `<div class="tbl-wrap"><table class="eg-tbl ex-tbl"><tr><th>${head[0]}</th>${head.slice(1).map((h) => `<td>${h}</td>`).join("")}</tr>${rows.map((r) => `<tr><th>${r[0]}</th>${r.slice(1).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
  const FIG = {
    load: () => {
      let s = `<rect class="lplat" x="30" y="56" width="150" height="10" rx="3"/><rect class="lweight" x="78" y="20" width="54" height="36" rx="5"/>${T(105, 43, "300 g", "middle", "tt inv")}`;
      s += `<rect class="lbar" x="40" y="74" width="130" height="18" rx="3"/><rect class="lfoot" x="150" y="92" width="34" height="40" rx="3"/><rect class="lfoot" x="26" y="66" width="18" height="8"/>`;
      s += `<line class="lbase" x1="10" y1="132" x2="200" y2="132"/>${T(105, 152, "load cell", "middle", "small")}`;
      s += `<path class="cable" d="M170,83C200,83 200,60 214,60"/><rect class="pcbr" x="214" y="44" width="52" height="32" rx="4"/>${T(240, 64, "HX711", "middle", "small inv")}`;
      s += `<path class="cable sig" d="M266,60H290"/><rect class="esp" x="290" y="26" width="80" height="80" rx="8"/>${T(330, 56, "ESP32", "middle", "tt inv")}${T(330, 78, "GPIO16, 4", "middle", "small inv")}`;
      s += `<rect class="lcd" x="250" y="120" width="120" height="26" rx="4"/>${T(310, 138, "reading = ?", "middle", "lcdt sm")}`;
      return xfig(svg(380, 160, "A load cell under a platform with a 300 g weight, connected to an HX711 amplifier and an ESP32", s, "scene exfig"));
    },
    lm35: () => rigFig("lm35", 40, "? °C", "ADC = ?", "An LM35 in a beaker of water beside a reference thermometer, wired to GPIO34 of an ESP32"),
    acs: () => rigFig("acs", 1.5, "? A", "ADC = ?", "A DC supply, an ACS712 current sensor, a load and an ammeter in series; the ACS712 output goes through a two-thirds divider to GPIO35 of an ESP32"),
    divGraph: () => {
      const A = axes({ W: 380, H: 250, l: 54, x: [0, 11], y: [0, 2600], xt: [0, 2, 4, 6, 8, 10], yt: [0, 500, 1000, 1500, 2000, 2500], xl: "Voltage from the multimeter (V)", yl: "ADC reading" });
      let g = A.s + poly([[A.X(0.8), A.Y(0)], [A.X(11), A.Y(2550)]], "trace-a");
      [[2, 310], [4, 790], [6, 1300], [8, 1810], [10, 2290]].forEach(([x, y]) => { g += `<circle class="shot" cx="${A.X(x).toFixed(1)}" cy="${A.Y(y).toFixed(1)}" r="5"/>`; });
      [[2, 300], [10, 2300]].forEach(([x, y]) => { g += `<circle class="ring" cx="${A.X(x).toFixed(1)}" cy="${A.Y(y).toFixed(1)}" r="9"/>${T(A.X(x) + (x < 5 ? 14 : -14), A.Y(y) + (x < 5 ? 22 : -12), `(${x}, ${y})`, x < 5 ? "start" : "end", "mklab")}`; });
      return xfig(svg(A.W, A.H, "Calibration graph of a solar panel voltage divider: five points and a fitted straight line through the marked points (2, 300) and (10, 2300)", g, "plot exfig"));
    },
    divRig: () => rigFig("div", 8, "8.00 V", "ADC = ?", "A solar panel feeding a 30 kilo-ohm and 7.5 kilo-ohm divider into GPIO35, with a voltmeter across the panel", "solar panel"),
    ldr: () => {
      const one = (log) => {
        const A = log ? axes({ W: 250, H: 210, l: 46, x: [lg(6), lg(1600)], y: [lg(250), lg(4000)], xt: [1, 2, 3], yt: [lg(300), lg(1000), lg(3000)], fx: tick10, fy: tick10, xl: "Light (lux), log", yl: "ADC, log" })
          : axes({ W: 250, H: 210, l: 46, x: [0, 1100], y: [0, 3500], xt: [0, 500, 1000], yt: [0, 1000, 2000, 3000], xl: "Light (lux)", yl: "ADC reading" });
        let g = A.s;
        LDRD.forEach(([v, a]) => { g += `<circle class="shot" cx="${A.X(log ? lg(v) : v).toFixed(1)}" cy="${A.Y(log ? lg(a) : a).toFixed(1)}" r="4.5"/>`; });
        if (!log) g += poly([[A.X(10), A.Y(390)], [A.X(1000), A.Y(3162)]], "trace-in");
        return svg(A.W, A.H, log ? "The LDR points on log axes" : "The LDR points on normal axes, with a straight line through the first and last points", g, "plot exfig half");
      };
      return `<div class="ex-two">${xfig(one(false))}${xfig(one(true))}</div>`;
    },
    ph: () => {
      let s = "";
      [[4, 2420, "#e5533d"], [7, 1890, "#3fae5a"]].forEach(([p, a, c], i) => { const x = 20 + i * 170; s += `<rect class="beaker" x="${x}" y="54" width="110" height="84" rx="8"/><rect class="liq" x="${x + 3}" y="74" width="104" height="61" rx="6" style="fill:${c}"/><rect class="probe" x="${x + 50}" y="10" width="10" height="112" rx="4"/><circle class="bulbg" cx="${x + 55}" cy="124" r="7"/>${T(x + 55, 158, `buffer pH ${p}.00`, "middle", "tt")}<rect class="lcd" x="${x + 6}" y="170" width="98" height="24" rx="4"/>${T(x + 55, 187, `ADC = ${a}`, "middle", "lcdt sm")}`; });
      return xfig(svg(320, 204, "A pH probe in pH 4.00 buffer reads ADC 2420, and in pH 7.00 buffer reads ADC 1890", s, "scene exfig"));
    },
    lsq: () => {
      const A = axes({ W: 320, H: 220, x: [0, 5], y: [0, 9], xt: [0, 1, 2, 3, 4, 5], yt: [0, 2, 4, 6, 8], xl: "x", yl: "y" });
      let g = A.s; [[1, 2.0], [2, 4.1], [3, 5.9], [4, 8.0]].forEach(([x, y]) => { g += `<circle class="shot" cx="${A.X(x)}" cy="${A.Y(y).toFixed(1)}" r="5"/>${T(A.X(x) + 8, A.Y(y) + 14, `(${x}, ${y.toFixed(1)})`, "start", "axis")}`; });
      return xfig(svg(A.W, A.H, "Four calibration points that lie almost on a straight line", g, "plot exfig"));
    },
    sigf: () => {
      const f = (x) => 3.8714e-8 * x * x - 0.002625 * x + 43.781;
      const A = axes({ W: 340, H: 230, l: 46, x: [20000, 30000], y: [-0.5, 7.5], xt: [20000, 22500, 25000, 27500, 30000], yt: [0, 2, 4, 6], fx: (v) => `${v / 1000}k`, xl: "Frequency f (Hz)", yl: "Depth (cm)" });
      let g = A.s + poly(curve(A, f, 20000, 30000, 60), "trace-a") + `<line class="mk" x1="${A.X(25000)}" x2="${A.X(25000)}" y1="${A.t}" y2="${A.t + A.ph}"/>${dot(A.X(25000), A.Y(f(25000)))}${T(A.X(25000) + 8, A.Y(f(25000)) - 10, "f = 25 000 Hz", "start", "mklab")}`;
      return xfig(svg(A.W, A.H, "The water-level sensor's calibration curve, depth against frequency, with f = 25 000 Hz marked", g, "plot exfig"));
    }
  };

  /* =====================================================================
     Exercises: the calibration question pattern, with new sensors; then least squares and significant figures
     ===================================================================== */
  const X = (t, why, lines, r) => step(t, why ? `<span class="st-why">${why}</span>` : "", lines.join("<br>"), r || "");
  const W_ = (list) => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml(list)}</ol></div>`;
  const REFS = ["Reference thermometer", "Multimeter in series", "Ruler or measuring tape", "Calibrated gas detector", "pH buffer solutions"];
  const EXERCISES = [
    { id: "c7-q12", title: "Exercise 1: Error and Percent of Full Scale",
      q: `<p>A load cell with an HX711 amplifier is calibrated from <strong>0 to 500 g</strong> with standard weights. The calibration equation obtained is <strong>R = 42m + 8150</strong>, where R is the HX711 reading and m is the mass in grams.</p>` +
        `<div class="tbl-wrap"><table class="eg-tbl ex-tbl ex-tblv"><thead><tr><th>Standard mass, m (g)</th><th>HX711 reading, R</th></tr></thead><tbody>${[[0, 8140], [100, 12360], [200, 16540], [300, 20790], [400, 24930], [500, 29170]].map(([m, r]) => `<tr><td>${m}</td><td>${r}</td></tr>`).join("")}</tbody></table></div>`,
      fig: () => FIG.load(),
      ans: [{ l: "(a) The mass the equation gives for the reading at 300 g", u: "g", v: 300.95, tol: 0.02 },
        { l: "(b) The error at 300 g", u: "g", v: 0.95, tol: 0.02 },
        { l: "(c) That error as a percentage of the 500 g full-scale range", u: "%", v: 0.19, tol: 0.005 },
        { l: "(d) Which point has the largest error?", opts: ["0 g", "100 g", "200 g", "300 g", "400 g", "500 g"], v: 3 },
        { l: "(e) Why is the error given as % of full scale, not % of the reading?", opts: ["Near 0 g the % of the reading becomes huge (and at 0 g it cannot be worked out), so full scale gives one fixed yardstick", "% of the reading is always larger, so it looks worse", "The full scale is easier to read on the HX711", "% of full scale removes the error"], v: 0 },
        { l: "(f) Why does the equation not give exactly 300 g?", opts: ["It is a best-fit line through all six points, which do not lie exactly on a straight line (non-linearity and noise)", "The standard weights are always wrong", "The HX711 can only read even numbers", "300 g is outside the calibrated range"], v: 0 }],
      hints: [`Use the equation backwards: m = (R − 8150) ÷ 42. Error = the mass it gives − the true mass.`, `% FS = |error| ÷ 500 g × 100. Work out the error at every point to find the largest.`],
      working: () => W_([
        X("Use the equation backwards", "The equation gives the reading from the mass; turn it round.", ["R = 42m + 8150", "m = (R − 8150) ÷ 42"], ""),
        X("(a) The reading at 300 g", "The table says R = 20790 at a true 300 g.", ["m = (20790 − 8150) ÷ 42 = 12640 ÷ 42"], "m = <strong>300.95 g</strong>"),
        X("(b) Error", "Value from the equation − true value.", ["error = 300.95 − 300"], "<strong>+0.95 g</strong> (it reads high)"),
        X("(c) Percent of full scale", "Compare the size of the error with the 0 to 500 g range.", ["% FS = 0.952 ÷ 500 × 100"], "<strong>0.19%</strong> of full scale"),
        X("(d) Every point", "Do the same at each point and compare the sizes.", ["0 g: (8140 − 8150) ÷ 42 = −0.24 g", "100 g: 100.24 → +0.24 g", "200 g: 199.76 → −0.24 g", "300 g: 300.95 → +0.95 g", "400 g: 399.52 → −0.48 g", "500 g: 500.48 → +0.48 g"], "largest at <strong>300 g</strong>"),
        X("(e) Why full scale", "At 100 g, 0.24 g is 0.24% of the reading, but at 0 g a % of the reading cannot be worked out at all. Full scale gives one fixed yardstick.", [], "One yardstick for the whole range"),
        X("(f) Why the error occurs", "The equation is a least-squares line through all six points. Small non-linearity and noise in the load cell and HX711 put the points slightly off the line, so it cannot pass exactly through each one.", [], "A best fit, not an exact fit")]) },
    { id: "c7-q7", title: "Exercise 2: An LM35 Thermometer",
      q: `<p>An ESP32 reads an LM35 temperature sensor on GPIO34 through its <strong>12-bit</strong> ADC, with a reference voltage of <strong>3.3 V</strong>. The sensor was calibrated against a reference thermometer, and the results are in the table. The calibration equation obtained is <strong>ADC = 12.5T + 15</strong>, where T is the temperature in °C.</p>` +
        tbl(["Temperature, T (°C)", 0, 20, 40, 60, 80], [["ADC reading", 12, 268, 520, 761, 1016]]),
      fig: FIG.lm35,
      ans: [{ l: "(i) The resolution of the ADC", u: "mV", v: 0.8059 }, { l: "(i) The input voltage when the ADC reading is 700", u: "V", v: 0.5641 },
        { l: "(ii) The temperature when the ADC reading is 700", u: "°C", v: 54.8, tol: 0.1 }, { l: "(ii) The temperature when the ADC reading is 520", u: "°C", v: 40.4, tol: 0.05 },
        { l: "(iii) The error at 40 °C as a percentage of the 80 °C full-scale range", u: "%", v: 0.5, tol: 0.02 },
        { l: "(iii) Why does this error occur?", opts: ["The line is a best fit through all five points, so it cannot pass exactly through each one (small non-linearity and noise in the sensor and the ADC)", "The ADC does not have enough bits to read 40 °C", "The LM35 only works below 40 °C", "The thermometer is always 0.4 °C wrong"], v: 0 }],
      hints: [`Resolution = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1). For the temperature, rearrange the equation: T = (ADC − 15) ÷ 12.5.`, `The table says ADC 520 was measured at exactly 40 °C. Compare that with what the equation gives, then divide the difference by 80 °C (see Checking the Calibration).`],
      working: () => W_([
        X("(i) Resolution", "One step of the ADC's ruler.", ["R = V<sub>ref</sub> ÷ (2<sup>12</sup> − 1) = 3.3 ÷ 4095", "= 0.000805861 V"], "R = <strong>0.8059 mV</strong>"),
        X("(i) Input voltage at ADC 700", "Number of steps × size of one step.", ["V<sub>in</sub> = 700 × 0.000805861 V", "= 700 × 3.3 ÷ 4095"], "V<sub>in</sub> = <strong>0.5641 V</strong>"),
        X("(ii) Rearrange the equation", "The equation gives the ADC from the temperature; turn it round to get the temperature from the ADC.", ["ADC = 12.5T + 15", "ADC − 15 = 12.5T", "T = (ADC − 15) ÷ 12.5"], ""),
        X("(ii) At ADC 700", "", ["T = (700 − 15) ÷ 12.5 = 685 ÷ 12.5"], "T = <strong>54.8 °C</strong>"),
        X("(ii) At ADC 520", "", ["T = (520 − 15) ÷ 12.5 = 505 ÷ 12.5"], "T = <strong>40.4 °C</strong>"),
        X("(iii) Error at 40 °C", "In the table, ADC 520 was recorded at a true 40 °C, but the equation says 40.4 °C.", ["error = 40.4 − 40 = 0.4 °C", "% of full scale = 0.4 ÷ 80 × 100"], "<strong>0.5%</strong> of the full-scale range"),
        X("(iii) Why", "A straight line is fitted through all five points by least squares. Real readings have small non-linearity and noise (in the LM35 and the ESP32's ADC), so the line passes close to the points but not exactly through each one.", [], "The equation reads 0.4 °C high at 40 °C")]) },
    { id: "c7-q8", title: "Exercise 3: An ACS712 Current Sensor",
      q: `<p>An ACS712 current sensor (5 A version on a 5 V supply: <strong>2.5 V at 0 A</strong>, <strong>185 mV per amp</strong>) measures the current of a DC load. Its output goes to GPIO35 of an ESP32 through a <strong>10 kΩ / 20 kΩ divider</strong> (it scales the voltage by 2/3). It was calibrated against a multimeter in series with the load. The calibration equation obtained is <strong>ADC = 153I + 2050</strong>, where I is the current in amps.</p>` +
        tbl(["Current, I (A)", 0, 1, 2, 3, 4], [["ADC reading", 2048, 2205, 2353, 2511, 2662]]),
      fig: FIG.acs,
      ans: [{ l: "(a) The ACS712's output voltage at 5 A", u: "V", v: 3.425, tol: 0.003 }, { l: "(a) The voltage at GPIO35 at 5 A, after the divider", u: "V", v: 2.283, tol: 0.003 },
        { l: "(b) Why is the divider needed?", opts: ["Without it the output goes above 3.3 V: the reading clips and the pin can be damaged", "It makes the ACS712 more sensitive", "It removes the 2.5 V at 0 A", "The ESP32's ADC pins need exactly 5 V"], v: 0 },
        { l: "(c) The current when the ADC reading is 2400", u: "A", v: 2.288, tol: 0.003 },
        { l: "(d) The error at 2 A as a percentage of the 4 A full-scale range", u: "%", v: 0.49, tol: 0.02 }],
      hints: [`Output = 2.5 V + 0.185 V × I. After the divider multiply by 20 ÷ (10 + 20).`, `I = (ADC − 2050) ÷ 153. At 2 A the table reading is 2353: work out what current the equation gives for it.`],
      working: () => W_([
        X("(a) Output at 5 A", "The output starts at 2.5 V and rises 0.185 V for every amp.", ["V = 2.5 + 0.185 × 5", "= 2.5 + 0.925"], "<strong>3.425 V</strong>"),
        X("(a) After the divider", "The bottom resistor's share: 20 ÷ (10 + 20) = 2/3.", ["V<sub>pin</sub> = 3.425 × 20 ÷ 30"], "<strong>2.283 V</strong>, safely below 3.3 V"),
        X("(b) Why the divider", "3.425 V is above the ADC's 3.3 V reference, so the reading would stick at 4095, and close to the pin's limit of about 3.6 V.", [], "It keeps the voltage inside 0 to 3.3 V"),
        X("(c) Rearrange the equation", "", ["ADC = 153I + 2050", "I = (ADC − 2050) ÷ 153"], ""),
        X("(c) At ADC 2400", "", ["I = (2400 − 2050) ÷ 153 = 350 ÷ 153"], "I = <strong>2.288 A</strong>"),
        X("(d) Error at 2 A", "The table's reading at a true 2 A is 2353.", ["I = (2353 − 2050) ÷ 153 = 303 ÷ 153 = 1.980 A", "error = 1.980 − 2 = −0.020 A", "% of full scale = 0.0196 ÷ 4 × 100"], "<strong>0.49%</strong> of the full-scale range")]) },
    { id: "c7-q9", title: "Exercise 4: Read the Line from a Graph",
      q: `<p>An ESP32 measures a solar panel's voltage through a 30 kΩ / 7.5 kΩ voltage divider on GPIO35. It was calibrated against a multimeter. The graph shows the calibration points and the fitted straight line, ADC = mV + c, which passes through the two marked points.</p>` +
        tbl(["Voltage, V (V)", 2, 4, 6, 8, 10], [["ADC reading", 310, 790, 1300, 1810, 2290]]),
      fig: () => FIG.divGraph() + FIG.divRig(),
      ans: [{ l: "(a) The slope m", u: "per V", v: 250, tol: 0.5 }, { l: "(a) The intercept c", u: "", v: -200, tol: 0.5 },
        { l: "(b) The panel voltage when the ADC reading is 1550", u: "V", v: 7, tol: 0.01 },
        { l: "(c) The error at 4 V as a percentage of the 10 V full-scale range", u: "%", v: 0.4, tol: 0.02 },
        { l: "(d) The line reaches ADC = 0 at about 0.8 V, not at 0 V. Why?", opts: ["The ESP32's ADC reads low near 0 V, so small inputs give 0", "The solar panel gives no voltage below 0.8 V", "The multimeter adds 0.8 V", "The divider adds 0.8 V"], v: 0 }],
      hints: [`Slope = change in ADC ÷ change in voltage between the two marked points. Then c = ADC − m × V at either point.`, `For the voltage, rearrange: V = (ADC − c) ÷ m. Watch the sign of c.`],
      working: () => W_([
        X("(a) Slope from the two marked points", "Rise over run between (2, 300) and (10, 2300).", ["m = (2300 − 300) ÷ (10 − 2)", "= 2000 ÷ 8"], "m = <strong>250</strong> counts per volt"),
        X("(a) Intercept", "Put one marked point into ADC = mV + c.", ["300 = 250 × 2 + c", "c = 300 − 500"], "c = <strong>−200</strong>, so ADC = 250V − 200"),
        X("(b) Rearrange and use it", "", ["V = (ADC − c) ÷ m = (ADC + 200) ÷ 250", "V = (1550 + 200) ÷ 250 = 1750 ÷ 250"], "V = <strong>7.0 V</strong>"),
        X("(c) Error at 4 V", "The table's reading at a true 4 V is 790.", ["V = (790 + 200) ÷ 250 = 3.96 V", "error = 3.96 − 4 = −0.04 V", "% of full scale = 0.04 ÷ 10 × 100"], "<strong>0.4%</strong> of the full-scale range"),
        X("(d) Why the line misses 0 V", "ADC = 0 when 250V = 200, so V = 0.8 V at the panel, which is 0.16 V at the pin. The ESP32's ADC has a dead zone near 0 V: it reads 0 until the pin is above about 0.1 to 0.15 V.", [], "The ADC reads low near 0 V")]) },
    { id: "c7-q10", title: "Exercise 5: Straight Line or Power Law?",
      q: `<p>An LDR in a voltage divider on GPIO33 was calibrated against a lux meter. The table and the two graphs show the same data. The power law fitted on log axes is <strong>log(E) = 2.2 log(ADC) − 4.70</strong>, where E is the light in lux.</p>` +
        tbl(["Light, E (lux)", 10, 50, 100, 300, 1000], [["ADC reading", 390, 810, 1110, 1830, 3162]]),
      fig: FIG.ldr,
      ans: [{ l: "(a) Which calibration suits this sensor?", opts: ["A power law: a straight line on log axes", "A straight line on normal axes", "One point at 100 lux is enough", "None: the ADC number is already in lux"], v: 0 },
        { l: "(b) The light when the ADC reading is 2000, from the power law", u: "lux", v: 365, tol: 5 },
        { l: "(c) A straight line drawn through the first and last points (dashed): the light it gives at ADC 1110", u: "lux", v: 267, tol: 2 },
        { l: "(d) That straight line's error at 100 lux, as a percentage of the 1000 lux full scale", u: "%", v: 16.7, tol: 0.3 }],
      hints: [`On normal axes the points bend; on log axes they are straight. For (b) work out log(E), then E = 10 to that power.`, `The straight line goes through (390, 10 lux) and (3162, 1000 lux): find its slope in lux per count, then the lux at 1110.`],
      working: () => W_([
        X("(a) Which fit", "On normal axes the points bend strongly; on log axes they lie on a straight line. That is a power law.", [], "<strong>A power law</strong> (straight on log axes)"),
        X("(b) log(E) at ADC 2000", "", ["log(2000) = 3.30103", "log(E) = 2.2 × 3.30103 − 4.70 = 7.26227 − 4.70", "= 2.56227"], ""),
        X("(b) Undo the log", "E = 10<sup>log(E)</sup>. On the fx-570MS: SHIFT log (10<sup>x</sup>) 2.56227 =", ["E = 10<sup>2.56227</sup>"], "E = <strong>365 lux</strong>"),
        X("(c) The straight line through the end points", "", ["slope = (1000 − 10) ÷ (3162 − 390) = 990 ÷ 2772", "= 0.35714 lux per count", "E = 10 + 0.35714 × (ADC − 390)"], ""),
        X("(c) At ADC 1110", "", ["E = 10 + 0.35714 × (1110 − 390)", "= 10 + 0.35714 × 720 = 10 + 257.1"], "E = <strong>267 lux</strong>"),
        X("(d) Its error", "The true light at ADC 1110 is 100 lux.", ["error = 267.1 − 100 = 167.1 lux", "% of full scale = 167.1 ÷ 1000 × 100"], "<strong>16.7%</strong>: far too big, so use the power law")]) },
    { id: "c7-q11", title: "Exercise 6: The Right Reference, and a pH Probe",
      q: `<p><strong>Part A.</strong> Choose the right reference instrument to calibrate each sensor.</p>` +
        tbl(["Sensor", "Measures", "Reference"], [["LM35", "temperature", "?"], ["ACS712", "current", "?"], ["HC-SR04", "distance", "?"], ["MQ-2", "gas (ppm)", "?"]]) +
        `<p><strong>Part B.</strong> A pH probe on GPIO34 is calibrated in two buffer solutions (figure). Use a straight line, pH = m × ADC + c.</p>`,
      fig: FIG.ph,
      ans: [{ l: "A: LM35", opts: REFS, v: 0 }, { l: "A: ACS712", opts: REFS, v: 1 }, { l: "A: HC-SR04", opts: REFS, v: 2 }, { l: "A: MQ-2", opts: REFS, v: 3 },
        { l: "B: The slope m", u: "pH per count", v: -0.00566, tol: 0.00003 }, { l: "B: The pH when the ADC reading is 2100", u: "", v: 5.811, tol: 0.015 }],
      hints: [`The reference must measure the same quantity as the sensor, and be trusted.`, `m = (7 − 4) ÷ (1890 − 2420). Then pH = 7 + m × (ADC − 1890).`],
      working: () => W_([
        X("A: References", "The reference must measure the same quantity, more accurately than the sensor.", ["LM35 → reference thermometer", "ACS712 → multimeter in series", "HC-SR04 → ruler or measuring tape", "MQ-2 → calibrated gas detector"], ""),
        X("B: Slope", "Change in pH ÷ change in ADC between the two buffers.", ["m = (7 − 4) ÷ (1890 − 2420)", "= 3 ÷ (−530)"], "m = <strong>−0.005660</strong> pH per count (the reading falls as the pH rises)"),
        X("B: Intercept", "Use the pH 7 point.", ["7 = −0.0056604 × 1890 + c", "c = 7 + 10.698 = 17.698"], "pH = −0.0056604 × ADC + 17.698"),
        X("B: At ADC 2100", "", ["pH = −0.0056604 × 2100 + 17.698", "= −11.887 + 17.698"], "pH = <strong>5.81</strong>"),
        X("Check", "2100 lies between 2420 (pH 4) and 1890 (pH 7), so the pH must be between 4 and 7.", [], "✓")]) },
    { id: "c7-q4", title: "Exercise 7: Least-Squares Line",
      q: `<p>Fit y = mx + c by least squares to these calibration points (also plotted below).</p>` + tbl(["x", 1, 2, 3, 4], [["y", "2.0", "4.1", "5.9", "8.0"]]),
      fig: FIG.lsq,
      ans: [{ l: "Slope m", u: "", v: 1.98, tol: 0.005 }, { l: "Intercept c", u: "", v: 0.05, tol: 0.005 }],
      hints: [`n = 4, Σx = 10, Σy = 20, Σx² = 30. Work out Σxy.`, `m = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²) and c = (Σy − mΣx) ÷ n.`],
      working: () => W_([
        X("The sums", "Make a column for each: x, y, xy and x².", ["n = 4", "Σx = 1 + 2 + 3 + 4 = 10", "Σy = 2.0 + 4.1 + 5.9 + 8.0 = 20.0", "Σxy = 1×2.0 + 2×4.1 + 3×5.9 + 4×8.0 = 2 + 8.2 + 17.7 + 32 = 59.9", "Σx² = 1 + 4 + 9 + 16 = 30"], ""),
        X("Slope", "", ["m = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²)", "= (4 × 59.9 − 10 × 20) ÷ (4 × 30 − 10²)", "= (239.6 − 200) ÷ (120 − 100) = 39.6 ÷ 20"], "m = <strong>1.98</strong>"),
        X("Intercept", "", ["c = (Σy − mΣx) ÷ n", "= (20 − 1.98 × 10) ÷ 4 = 0.2 ÷ 4"], "c = <strong>0.05</strong>, so y = 1.98x + 0.05")]) },
    { id: "c7-q5", title: "Exercise 8: Keep Enough Significant Figures",
      q: `<p>A water-level sensor was calibrated as <strong>depth = 3.8714 × 10<sup>−8</sup> f² − 0.002625 f + 43.781</strong> (depth in cm, f in Hz). Its curve is shown below.</p>`,
      fig: FIG.sigf,
      ans: [{ l: "Depth when f = 25 000 Hz", u: "cm", v: 2.352, tol: 0.01 }, { l: "Depth if a is rounded to 4 × 10<sup>−8</sup>", u: "cm", v: 3.156, tol: 0.01 }, { l: "Error caused by the rounding", u: "cm", v: 0.804, tol: 0.01 }],
      hints: [`f² = 6.25 × 10<sup>8</sup>. Work out each term, then add.`, `Only the first term changes when a is rounded.`],
      working: () => W_([
        X("f²", "", ["f² = 25 000² = 6.25 × 10<sup>8</sup>"], ""),
        X("Exact coefficients", "Work out each term, then add them.", ["3.8714 × 10<sup>−8</sup> × 6.25 × 10<sup>8</sup> = 24.196", "0.002625 × 25 000 = 65.625", "24.196 − 65.625 + 43.781"], "depth = <strong>2.352 cm</strong>"),
        X("Rounded a", "Only the first term changes.", ["4 × 10<sup>−8</sup> × 6.25 × 10<sup>8</sup> = 25.000", "25.000 − 65.625 + 43.781"], "depth = <strong>3.156 cm</strong>"),
        X("Error", "", ["3.156 − 2.352"], "<strong>0.80 cm</strong>: round the coefficients too much and the sensor is wrong")]) }
  ];

  Lab.page({
    topic: 7,
    collapseWorking: true,
    exerciseCarousel: true,
    sections: SECTIONS,
    groups: [
      { key: "intro", list: "#introList", toc: "#introToc" },
      { key: "lab", list: "#vlabList" },
      { key: "whole", list: "#wholeList" },
      { key: "sensors", list: "#sensList", toc: "#sensToc" }
    ],
    exercises: EXERCISES
  });
})();
