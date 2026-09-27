/* NMK42003 Chapter 6: Data Conversion and Acquisition
   Animated notes: digital codes, the binary-weighted and R-2R DACs, the counter and successive-approximation ADCs,
   ADC resolution and output code, and the ESP32's own DAC and ADC.
   The calculator, exercise and animation engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, F, D, step, stepsHtml, MINUS, reduceMotion, chips, wireChips, fold, codeBlock,
    player, axes, poly, svg, curve, dot, label, pvCard, pick, tone } = Lab;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const TAU = 2 * Math.PI;
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const sub = (a, b) => `${a}<tspan class="sb" dy="3">${b}</tspan><tspan dy="-3">`;
  const bin = (v, n) => v.toString(2).padStart(n, "0");
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(Math.ceil(n / 4), "0");
  const bcd = (v) => String(v).split("").map((d) => bin(+d, 4)).join(" ");
  const ESP = `<figure class="photo2 small"><img src="assets/img/chapter-2/esp-wroom-32.jpg" alt="Close-up of an ESP-WROOM-32 module" width="800" height="800" loading="lazy"><figcaption>The ESP32 has two 8-bit DACs and 12-bit ADCs. <span class="credit">Photo: <a href="https://commons.wikimedia.org/wiki/File:Espressif_ESP-WROOM-32_Wi-Fi_%26_Bluetooth_Module.jpg" target="_blank" rel="noopener">Brian Krent</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a>, via Wikimedia Commons</span></figcaption></figure>`;

  /* =====================================================================
     Introduction: a song's journey (analog → digital → analog)
     ===================================================================== */
  const song = (x) => 0.6 * Math.sin(TAU * x) + 0.3 * Math.sin(TAU * 2.3 * x + 1);
  function mountSong(el) {
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene song" viewBox="0 0 600 260" role="img" aria-label="Animated: a microphone's analog signal is sampled by an ADC into binary words and stored on a pendrive or in the cloud; later a DAC turns the words back into a stepped analog signal for a speaker."></svg></div></figure><div class="pv-pl"></div><p class="pv-read"></p></div>`;
    const sv = el.querySelector("svg"), read = el.querySelector(".pv-read");
    const draw = (t) => {
      const ph = t * 0.35;
      let s = `<rect class="bx" x="6" y="44" width="30" height="46" rx="15"/><line class="w" x1="21" y1="90" x2="21" y2="106"/>${T(21, 124, "mic", "middle", "small")}`;
      // analog wave with samples
      const wv = []; for (let i = 0; i <= 80; i++) { const x = i / 80; wv.push([50 + x * 190, 70 - 32 * song(x * 1.5 + ph)]); }
      s += poly(wv, "trace-a");
      for (let i = 0; i <= 12; i++) { const x = i / 12, y = 70 - 32 * song(x * 1.5 + ph); s += `<line class="samp" x1="${50 + x * 190}" y1="70" x2="${50 + x * 190}" y2="${y}"/><circle class="sdot" cx="${50 + x * 190}" cy="${y}" r="3"/>`; }
      s += T(145, 22, "analog: smooth, any value", "middle", "small");
      s += `<rect class="adc" x="256" y="46" width="56" height="48" rx="6"/>${T(284, 75, "ADC", "middle", "tt inv")}`;
      // words moving to storage
      for (let i = 0; i < 1; i++) { const k = (t * 0.25) % 1, x = 316 + k * 84; const code = Math.round((song((i + Math.floor(t * 0.75)) * 0.37) + 1) * 127); s += T(x, 76, bin(clamp(code, 0, 255), 8), "start", "word"); }
      s += `<rect class="store" x="470" y="40" width="54" height="60" rx="8"/><rect class="store-cap" x="484" y="30" width="26" height="12" rx="2"/>${T(497, 75, "0101", "middle", "small inv")}${T(497, 118, "pendrive / cloud", "middle", "small")}`;
      // return path
      s += `<path class="flow-l" d="M497,130V150H90V168"/>`;
      for (let i = 0; i < 3; i++) { const k = ((t * 0.25 + i / 3) % 1), x = 440 - k * 300; s += T(x, 146, "10110010", "middle", "word dim"); }
      s += `<rect class="dac" x="62" y="170" width="56" height="48" rx="6"/>${T(90, 199, "DAC", "middle", "tt inv")}`;
      const st = []; for (let i = 0; i <= 12; i++) { const x = i / 12, lv = Math.round((song(x * 1.5 + ph) + 1) * 3.5) / 3.5 - 1, y = 200 - 32 * lv; st.push([134 + x * 330, y], [134 + (x + 1 / 12) * 330 - (i === 12 ? 330 / 12 : 0), y]); }
      s += poly(st, "trace-d") + T(300, 250, "stepped analog again (8 levels here, far more in practice)", "middle", "small");
      const cone = Math.sin(t * 20) * 2;
      s += `<rect class="mspk" x="${478}" y="190" width="12" height="20"/><path class="mspk" d="M${490 + cone},190L${508 + cone},176V224L${490 + cone},210Z"/>${T(500, 244, "speaker", "middle", "small")}`;
      sv.innerHTML = s;
    };
    read.innerHTML = "An <strong>ADC</strong> (analog-to-digital converter) measures the sound wave many times a second and stores each measurement as a binary word. A <strong>DAC</strong> (digital-to-analog converter) later turns the words back into a voltage for the speaker.";
    player(el.querySelector(".pv-pl"), el, { dur: 12, hold: 0, draw, still: 2, label: "Song animation position" });
  }

  /* =====================================================================
     Digital codes: flip the bits
     ===================================================================== */
  function mountBits(el) {
    const S = { n: 8, v: 45 };
    el.innerHTML = `<div class="pv">${chips("Word length", [["4", "4 bits"], ["8", "8 bits"], ["12", "12 bits"], ["16", "16 bits"]], "8")}
      <div class="bitrow" role="group" aria-label="Bits, most significant on the left"></div>
      <div class="codes"></div><div class="pv-pl"></div><p class="pv-read"></p></div>`;
    const row = el.querySelector(".bitrow"), codes = el.querySelector(".codes"), read = el.querySelector(".pv-read");
    const paint = () => {
      const n = S.n, max = 2 ** n - 1;
      S.v = clamp(S.v, 0, max);
      row.innerHTML = Array.from({ length: n }, (_, i) => { const b = n - 1 - i, on = (S.v >> b) & 1; return `<button type="button" class="bit${on ? " on" : ""}" data-b="${b}" aria-pressed="${!!on}" aria-label="Bit D${b}, weight ${2 ** b}"><span class="bv">${on}</span><span class="bl">D${b}</span><span class="bw">${2 ** b}</span></button>`; }).join("");
      codes.innerHTML = `<dl class="defs code-out"><div><dt>Decimal</dt><dd>${S.v}</dd></div><div><dt>Binary</dt><dd>${bin(S.v, n).replace(/(.{4})(?=.)/g, "$1 ")}</dd></div><div><dt>Hexadecimal</dt><dd>${hex(S.v, n)}</dd></div><div><dt>BCD (each decimal digit in 4 bits)</dt><dd>${bcd(S.v)}</dd></div></dl>`;
      const ones = [...bin(S.v, n)].map((c, i) => (c === "1" ? 2 ** (n - 1 - i) : 0)).filter(Boolean);
      read.innerHTML = `${n} bits give 2<sup>${n}</sup> = <strong>${(max + 1).toLocaleString("en")}</strong> combinations, from 0 to ${max.toLocaleString("en")}. ${S.v ? `This word is ${ones.join(" + ")} = <strong>${S.v}</strong>.` : "All bits are 0."} A 1 is sent as a HIGH voltage (3.3 V on the ESP32) and a 0 as 0 V.`;
    };
    row.addEventListener("click", (e) => { const b = e.target.closest(".bit"); if (!b) return; pl.pause(); S.v ^= 1 << +b.dataset.b; paint(); });
    const pl = player(el.querySelector(".pv-pl"), el, { dur: 16, hold: 1, still: (16 * 45) / 255, auto: false, label: "Counting position", clock: () => `${S.v}`, draw: (t) => { S.v = Math.round((t / 16) * (S.n <= 8 ? 2 ** S.n - 1 : 255)); paint(); } });
    pick(el, (k) => { S.n = +k; pl.redraw(); });
  }

  /* =====================================================================
     DAC 1: binary-weighted resistor type
     ===================================================================== */
  function mountWeighted(el, sec) {
    const S = { n: 8, R: 1e3, Rf: 500, VH: 5, code: 0b10110010 };
    const c = pvCard(el, `${chips("Number of bits N", [["4", "4"], ["5", "5"], ["6", "6"], ["8", "8"]], "8")}
      <div class="mini-inputs"><label>R (the MSB resistor) <span class="ctl"><input type="number" step="any" data-k="R" value="1" inputmode="decimal"><span class="unit">kΩ</span></span></label>
      <label>R<sub>f</sub> <span class="ctl"><input type="number" step="any" data-k="Rf" value="0.5" inputmode="decimal"><span class="unit">kΩ</span></span></label>
      <label>Logic HIGH <span class="ctl"><input type="number" step="any" data-k="VH" value="5" inputmode="decimal"><span class="unit">V</span></span></label></div>
      <p class="small-note">Tap a switch in the circuit to change a bit, or press play to count through every code.</p>`, fold("Step-by-step working", `<ol class="steps"></ol>`));
    c.box.querySelector(".pv-grid").classList.add("stack");
    const steps = el.querySelector(".steps");
    const Rn = (b) => 2 ** (S.n - 1 - b) * S.R;
    const out = (code) => { let I = 0; for (let b = 0; b < S.n; b++) if ((code >> b) & 1) I += S.VH / Rn(b); return S.Rf * I; };
    const paint = () => {
      const n = S.n, max = 2 ** n - 1, code = S.code & max, H = 60 + n * 32, ym = 44 + ((n - 1) * 32) / 2;
      let s = "", I = 0;
      for (let b = 0; b < n; b++) {
        const y = 44 + b * 32, on = (code >> b) & 1, i = on ? S.VH / Rn(b) : 0; I += i;
        s += `<g class="sw${on ? " on" : ""}" data-b="${b}" tabindex="0" role="button" aria-pressed="${!!on}" aria-label="D${b} ${on ? "on" : "off"}"><rect class="swbox" x="4" y="${y - 12}" width="66" height="24" rx="12"/>${T(24, y + 5, `D${b}`, "middle", "tt")}<circle class="swdot" cx="${on ? 56 : 44}" cy="${y}" r="8"/></g>`;
        s += D.wire([70, y], [84, y]) + D.res(84, y, 164, y) + D.wire([164, y], [190, y]) + D.dot(190, y);
        s += T(124, y - 11, eng(Rn(b), "Ω", 3), "middle", "small");
        if (on) s += `<path class="iarrow" style="stroke-width:${(1.5 + 3 * (i / (S.VH / S.R))).toFixed(1)}" d="M166,${y - 7}H184m-5,-4l5,4l-5,4"/>`;
      }
      s += D.wire([190, 44], [190, 44 + (n - 1) * 32]) + D.wire([190, ym], [262, ym]) + D.dot(236, ym) + T(232, ym - 8, "A", "end", "tt");
      s += D.opamp(262, ym + 20, false) + D.wire([262, ym + 40], [250, ym + 40], [250, ym + 58]) + D.gnd(250, ym + 58);
      s += D.wire([236, ym], [236, ym - 56], [270, ym - 56]) + D.res(270, ym - 56, 330, ym - 56) + D.wire([330, ym - 56], [360, ym - 56], [360, ym + 20]) + D.dot(360, ym + 20);
      s += T(300, ym - 68, `${sub("R", "f")} = ${eng(S.Rf, "Ω", 3)}</tspan>`, "middle", "small");
      const v1 = -S.Rf * I;
      s += D.wire([342, ym + 20], [384, ym + 20]) + `<rect class="inv-box" x="384" y="${ym}" width="62" height="40" rx="6"/>${T(415, ym + 25, "× (−1)", "middle", "tt")}` + D.wire([446, ym + 20], [470, ym + 20]) + D.term(474, ym + 20);
      s += T(400, ym - 10, `${fxV(v1)}`, "middle", "small") + T(474, ym + 48, `${sub("V", "out")} =</tspan>`, "middle") + T(474, ym + 66, `${fxV(-v1)}`, "middle", "val");
      s += T(300, ym + 84, "current-to-voltage converter", "middle", "small") + T(415, ym + 84, "inverter", "middle", "small");
      c.scene.innerHTML = `<div class="scene-scroll">${svg(530, H + 40, `Binary-weighted DAC with input ${bin(code, n)}; output ${fxV(-v1)}`, s, "scene wdac")}</div>`;
      c.scene.querySelectorAll(".sw").forEach((g) => { const tog = () => { pl.pause(); S.code ^= 1 << +g.dataset.b; paint(); }; g.addEventListener("click", tog); g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } }); });
      const vmax = out(max), A = axes({ x: [0, max], y: [0, vmax * 1.1 || 1], xt: [0, Math.round(max / 4), Math.round(max / 2), Math.round((3 * max) / 4), max], yt: [0, vmax / 2, vmax], fy: (q) => q.toFixed(2), xl: "Input code (decimal)", yl: "Vout (V)" });
      const pts = []; for (let k = 0; k <= max; k++) pts.push([A.X(k), A.Y(out(k))], [A.X(k + 1 > max ? max : k + 1), A.Y(out(k))]);
      c.graph.innerHTML = svg(A.W, A.H, "Output voltage against input code: a staircase", A.s + poly(pts, "trace-a") + dot(A.X(code), A.Y(-v1)) + label(A.X(code) + (code > max * 0.6 ? -8 : 8), A.Y(-v1) - 10, `${code} → ${fxV(-v1)}`, code > max * 0.6 ? "end" : "start"));
      c.read.innerHTML = `Input <strong>${bin(code, n)}</strong> (decimal ${code}). Each 1 connects its resistor to ${S.VH} V; the MSB resistor is the smallest, so it carries the most current. The currents add at A, R<sub>f</sub> turns the total into a voltage, and the inverter makes it positive: <strong>V<sub>out</sub> = ${fxV(-v1)}</strong>. One step (1 LSB) = ${fxV(out(1))}.`;
      const on = []; for (let b = 0; b < n; b++) if ((code >> b) & 1) on.push(b);
      steps.innerHTML = stepsHtml([
        step("Resistor for bit n (D0 = LSB)", "R<sub>n</sub> = 2<sup>N − 1 − n</sup> R", `N = ${n}, R = ${eng(S.R, "Ω")}`, Array.from({ length: n }, (_, b) => `R<sub>${b}</sub> = ${eng(Rn(b), "Ω", 3)}`).join(", ")),
        step("Current from each HIGH bit", "I<sub>n</sub> = D<sub>n</sub> ÷ R<sub>n</sub>, with D<sub>n</sub> = " + S.VH + " V or 0 V", on.length ? on.map((b) => `I<sub>${b}</sub> = ${S.VH} ÷ ${eng(Rn(b), "Ω", 3)} = ${eng(S.VH / Rn(b), "A", 3)}`).join("; ") : "no bits are HIGH", `ΣI = I<sub>f</sub> = ${eng(I, "A")}`),
        step("Current-to-voltage converter (KCL at A, a virtual ground)", "ΣD<sub>n</sub>/R<sub>n</sub> = (0 − V<sub>A</sub>) ÷ R<sub>f</sub> → V = −R<sub>f</sub> × ΣI", `= −${eng(S.Rf, "Ω")} × ${eng(I, "A")}`, `= ${fxV(v1)}`),
        step("After the ×1 inverter", "V<sub>out</sub> = +R<sub>f</sub> × ΣD<sub>n</sub>/R<sub>n</sub>", "", `V<sub>out</sub> = ${fxV(-v1)}`)]);
    };
    const fxV = (v) => eng(Math.abs(v) < 1e-12 ? 0 : v, "V");
    const pl = player(c.pl, el, { dur: 16, hold: 1, still: (16 * 178) / 255, auto: false, label: "Code counting position", clock: () => `code ${S.code & (2 ** S.n - 1)}`, draw: (t) => { S.code = Math.round((t / 16) * (2 ** S.n - 1)); paint(); } });
    pick(el, (k) => { S.n = +k; pl.redraw(); });
    el.querySelectorAll(".mini-inputs input").forEach((inp) => inp.addEventListener("input", () => { const v = +inp.value; if (v > 0) { S[inp.dataset.k] = inp.dataset.k === "VH" ? v : v * 1e3; paint(); } }));
  }

  // The ESP32's 8-bit DAC making a sine wave
  const SINE = `void loop()
{
  for (int i = 0; i < 64; i++) {
    int code = 128 + 127 * sin(2 * PI * i / 64);  // 1 to 255
    dacWrite(25, code);      // 8-bit DAC on GPIO25
    delayMicroseconds(100);
  }
}`;
  function mountSine(el, sec) {
    const S = { bits: 3 };
    const c = pvCard(el, `<div class="slider-field"><label for="${sec.id}-b">DAC resolution: <strong class="b-v">3 bits (8 levels)</strong></label><input type="range" id="${sec.id}-b" min="2" max="8" step="1" value="3"></div><div class="tone-host"></div><p class="small-note">Play the tone (440 Hz), then move the slider: at 2 or 3 bits it sounds buzzy and harsh, at 8 bits it sounds clean. Keep the volume low.</p>`, `<div class="cmp-grid">${ESP}</div>${codeBlock(SINE, "ESP32: a sine wave from the DAC")}`);
    const sl = el.querySelector(`#${sec.id}-b`);
    const draw = (t) => {
      const lv = 2 ** S.bits, q = (x) => Math.round((0.5 + 0.5 * Math.sin(TAU * x)) * (lv - 1)) / (lv - 1) * 3.3;
      const A = axes({ x: [0, 2], y: [0, 3.5], xt: [0, 0.5, 1, 1.5, 2], yt: [0, 1.1, 2.2, 3.3], fy: (y) => y.toFixed(1), xl: "Time (cycles)", yl: "DAC output (V)" });
      const N = 64, pts = [];
      for (let i = 0; i < 2 * N; i++) { const x0 = i / N, x1 = (i + 1) / N, y = q(x0); pts.push([A.X(x0), A.Y(y)], [A.X(x1), A.Y(y)]); }
      const x = Math.floor(((t / 4) % 2) * N) / N;
      c.graph.innerHTML = svg(A.W, A.H, `Sine wave made by a ${S.bits}-bit DAC`, A.s + poly(curve(A, (u) => 1.65 + 1.65 * Math.sin(TAU * u), 0, 2, 200), "trace-in") + poly(pts, "trace-a") + dot(A.X(x), A.Y(q(x))));
      const code = Math.round((0.5 + 0.5 * Math.sin(TAU * x)) * (lv - 1));
      let s = `<rect class="espbig" x="16" y="70" width="110" height="90" rx="8"/>${T(71, 108, "ESP32", "middle", "tt inv")}${T(71, 128, "DAC GPIO25", "middle", "small inv")}`;
      s += `<rect class="lcd" x="16" y="24" width="110" height="30" rx="4"/>${T(71, 44, `code ${code}`, "middle", "lcdt sm")}`;
      s += D.wire([126, 115], [180, 115]) + `<rect class="mspk" x="186" y="104" width="12" height="22"/><path class="mspk" d="M198,104L${218 + Math.sin(t * 30) * 2},90V140L198,126Z"/>`;
      s += T(170, 190, `${lv} levels, step ${(3.3 / (lv - 1)).toFixed(3)} V`, "middle", "small");
      c.scene.innerHTML = svg(300, 210, `ESP32 DAC output code ${code}`, s, "scene");
      c.read.innerHTML = `With <strong>${S.bits} bits</strong> the DAC has only <strong>${lv}</strong> output levels, ${(3.3 / (lv - 1)).toFixed(3)} V apart, so the wave is ${S.bits < 5 ? "clearly stepped" : "nearly smooth"}. The ESP32's DAC has 8 bits: 256 levels, 12.9 mV apart. More bits → smaller steps → a closer copy of the analog signal.`;
    };
    const pl = player(c.pl, el, { dur: 8, hold: 0, draw, still: 1, label: "Waveform position" });
    const snd = tone(el.querySelector(".tone-host"));
    const wave = () => snd.set((sr, secs) => { const n = Math.round(sr * secs), d = new Float32Array(n), lv = 2 ** S.bits; for (let i = 0; i < n; i++) { const k = Math.floor(((i / sr) * 440 * 64) % 64), code = Math.round((0.5 + 0.5 * Math.sin((TAU * k) / 64)) * (lv - 1)); d[i] = (code / (lv - 1)) * 2 - 1; } return d; });
    wave();
    sl.addEventListener("input", () => { S.bits = +sl.value; el.querySelector(".b-v").textContent = `${S.bits} bits (${2 ** S.bits} levels)`; pl.redraw(); wave(); });
  }

  /* =====================================================================
     DAC 2: R-2R ladder
     ===================================================================== */
  function mountR2R(el) {
    const S = { code: 0b1010, VH: 5 };
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene r2r" viewBox="0 0 560 250" role="img" aria-label="Four-bit R-2R ladder DAC"></svg></div><figcaption>Tap a switch to change a bit. Only two resistor values are used: R and 2R.</figcaption></figure><p class="pv-read"></p>${fold("Step-by-step working", `<ol class="steps"></ol>`)}</div>`;
    const sv = el.querySelector("svg"), read = el.querySelector(".pv-read"), steps = el.querySelector(".steps");
    const paint = () => {
      const code = S.code, v = (S.VH * code) / 16;
      let s = D.res(40, 70, 40, 150) + D.gnd(40, 150) + T(26, 114, "2R", "end", "small");
      const xs = [120, 220, 320, 420];
      s += D.wire([40, 70], [80, 70]);
      xs.forEach((x, b) => {
        const on = (code >> b) & 1;
        s += (b === 0 ? D.wire([80, 70], [x, 70]) : D.res(xs[b - 1], 70, x, 70)) + D.dot(x, 70);
        if (b > 0) s += T((xs[b - 1] + x) / 2, 58, "R", "middle", "small");
        s += D.res(x, 70, x, 160) + T(x + 12, 118, "2R", "start", "small");
        s += `<g class="sw${on ? " on" : ""}" data-b="${b}" tabindex="0" role="button" aria-pressed="${!!on}" aria-label="D${b} ${on ? "on" : "off"}"><rect class="swbox" x="${x - 33}" y="172" width="66" height="24" rx="12"/>${T(x - 13, 189, `D${b}`, "middle", "tt")}<circle class="swdot" cx="${on ? x + 19 : x + 7}" cy="184" r="8"/></g>`;
        s += D.wire([x, 160], [x, 172]) + T(x, 214, on ? `${S.VH} V` : "0 V", "middle", "small");
      });
      s += D.wire([420, 70], [460, 70]) + D.opamp(460, 90, true) + D.wire([540, 90], [548, 90]) + D.term(552, 90);
      s += D.wire([460, 110], [452, 110], [452, 136], [548, 136], [548, 90]) + T(500, 150, "buffer (×1)", "middle", "small");
      s += `<text x="552" y="34" text-anchor="end">${sub("V", "out")} = </tspan><tspan class="val">${v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} V</tspan></text>`;
      s += T(40, 244, "LSB end", "middle", "small") + T(420, 244, "MSB end", "middle", "small");
      sv.innerHTML = s;
      sv.querySelectorAll(".sw").forEach((g) => { const tog = () => { S.code ^= 1 << +g.dataset.b; paint(); }; g.addEventListener("click", tog); g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } }); });
      read.innerHTML = `Input <strong>${bin(code, 4)}</strong> (decimal ${code}): V<sub>out</sub> = ${S.VH} V × ${code} ÷ 16 = <strong>${v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} V</strong>. Each bit's contribution is halved at every node on its way to the output, so D3 counts ½, D2 ¼, D1 ⅛ and D0 1/16.`;
      steps.innerHTML = stepsHtml([
        step("R-2R ladder output (N bits, buffered)", "V<sub>out</sub> = V<sub>H</sub> × (D<sub>N−1</sub>/2 + D<sub>N−2</sub>/4 + … + D<sub>0</sub>/2<sup>N</sup>) = V<sub>H</sub> × code ÷ 2<sup>N</sup>", `= ${S.VH} × ${code} ÷ 16`, `V<sub>out</sub> = ${v.toFixed(4)} V`),
        step("Step size (1 LSB)", "V<sub>H</sub> ÷ 2<sup>N</sup>", `= ${S.VH} ÷ 16`, `${(S.VH / 16).toFixed(4)} V; full scale (1111) = ${((S.VH * 15) / 16).toFixed(4)} V`),
        step("Why engineers prefer it", "", "", "An 8-bit binary-weighted DAC needs 8 precise values from R to 128R; an R-2R ladder of any size needs only R and 2R, which are easy to match on a chip.")]);
    };
    paint();
  }

  /* =====================================================================
     ADC: counter (ramp) vs successive approximation
     ===================================================================== */
  function mountAdcRace(el, sec) {
    const S = { mode: "counter", vin: 2.34 }, NB = 5, LSB = 0.1, MAX = 31;
    const c = pvCard(el, `${chips("ADC type", [["counter", "Counter (ramp) ADC"], ["sar", "Successive approximation (SAR)"]], "counter")}
      <div class="slider-field"><label for="${sec.id}-v">Input voltage V<sub>in</sub>: <strong class="v-v">2.34 V</strong></label><input type="range" id="${sec.id}-v" min="0" max="3.1" step="0.01" value="2.34"></div>`);
    const sl = el.querySelector(`#${sec.id}-v`);
    const trace = () => {
      const tr = [];
      if (S.mode === "counter") { let k = 0; tr.push({ code: 0, keep: 0 >= S.vin }); while (k * LSB < S.vin - 1e-9 && k < MAX) { k++; tr.push({ code: k, keep: k * LSB >= S.vin - 1e-9 }); } }
      else { let r = 0; for (let i = NB - 1; i >= 0; i--) { const trial = r | (1 << i), ok = trial * LSB <= S.vin + 1e-9; tr.push({ code: trial, keep: ok, bit: i }); if (ok) r = trial; } tr.result = r; }
      return tr;
    };
    const draw = (t) => {
      const tr = trace(), n = tr.length, k = Math.min(n - 1, Math.floor((t / 8) * n)), cur = tr[k], done = k === n - 1;
      const final = S.mode === "counter" ? tr[n - 1].code : tr.result;
      const cmpHigh = cur.code * LSB >= S.vin - 1e-9;
      let s = `<rect class="bx" x="10" y="40" width="70" height="40" rx="6"/>${T(45, 65, `${S.vin.toFixed(2)} V`, "middle", "tt")}${T(45, 30, "V<tspan class='sb' dy='3'>in</tspan>", "middle", "small")}`;
      s += `<path class="cmp" d="M140,40L200,70L140,100Z"/>${T(152, 60, "+", "middle", "small")}${T(152, 90, MINUS, "middle", "small")}` + D.wire([80, 60], [140, 60]);
      s += `<rect class="dac" x="120" y="150" width="70" height="44" rx="6"/>${T(155, 177, "DAC", "middle", "tt inv")}` + D.wire([155, 150], [155, 120], [128, 120], [128, 90], [140, 90]) + T(100, 132, `${(cur.code * LSB).toFixed(1)} V`, "end", "small");
      s += D.wire([200, 70], [236, 70]) + `<circle class="led${cmpHigh ? " on" : ""}" cx="246" cy="70" r="9"/>${T(262, 74, cmpHigh ? "≥ V<tspan class='sb' dy='3'>in</tspan>" : "< V<tspan class='sb' dy='3'>in</tspan>", "start", "small")}`;
      s += `<rect class="reg" x="220" y="150" width="96" height="44" rx="6"/>${T(268, 168, S.mode === "counter" ? "counter" : "SAR register", "middle", "small inv")}${T(268, 186, bin(done ? final : cur.code, NB), "middle", "lcdt sm")}` + D.wire([220, 172], [190, 172]);
      s += D.wire([246, 79], [246, 150]);
      s += `<rect class="dist-box" x="10" y="208" width="306" height="26" rx="5"/>${T(163, 226, done ? `done: code ${final} (${bin(final, NB)}) after ${n} ${n === 1 ? "step" : "steps"}` : `step ${k + 1}: trying ${bin(cur.code, NB)} = ${(cur.code * LSB).toFixed(1)} V`, "middle", done ? "dist-t on" : "dist-t")}`;
      c.scene.innerHTML = svg(330, 240, `${S.mode === "counter" ? "Counter" : "Successive approximation"} ADC converting ${S.vin.toFixed(2)} V`, s, "scene");
      const xmax = S.mode === "counter" ? 32 : NB + 0.5, A = axes({ x: [0, xmax], y: [0, 3.3], xt: S.mode === "counter" ? [0, 8, 16, 24, 32] : [1, 2, 3, 4, 5], yt: [0, 1, 2, 3], xl: "Clock step", yl: "DAC trial output (V)" });
      let g = A.s + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(S.vin)}" y2="${A.Y(S.vin)}"/>` + T(A.l + A.pw - 4, A.Y(S.vin) - 5, "V<tspan class='sb' dy='3'>in</tspan>", "end", "reflab");
      const pts = []; tr.slice(0, k + 1).forEach((q, i) => { const x = S.mode === "counter" ? i : i + 1; pts.push([A.X(x - (S.mode === "counter" ? 0 : 0.5)), A.Y(q.code * LSB)], [A.X(x + (S.mode === "counter" ? 1 : 0.5)), A.Y(q.code * LSB)]); });
      g += poly(pts, "trace-a");
      if (S.mode === "sar") tr.slice(0, k + 1).forEach((q, i) => { g += T(A.X(i + 1), A.Y(q.code * LSB) - 8, q.keep ? "keep" : "clear", "middle", q.keep ? "mklab" : "axis"); });
      c.graph.innerHTML = svg(A.W, A.H, "DAC trial voltage at each clock step", g);
      const cnt = Math.min(MAX, Math.ceil(S.vin / LSB - 1e-9)) + 1;
      c.read.innerHTML = S.mode === "counter"
        ? `The counter adds 1 every clock tick and the DAC output climbs in 0.1 V steps until it reaches or passes V<sub>in</sub>; then the comparator flips and the count stops. Here that took <strong>${n} steps</strong>. The worst case for 5 bits is 32 steps: for 12 bits it would be 4096.`
        : `SAR tries each bit from the MSB down, like guessing a number with “higher or lower?”. A bit is <strong>kept</strong> if the DAC stays at or below V<sub>in</sub>, and <strong>cleared</strong> if not. It always takes exactly <strong>${NB} steps</strong> for 5 bits (12 steps for 12 bits), instead of up to 32. The counter would need ${cnt} steps for this input. SAR keeps the largest step at or below V<sub>in</sub> (${Math.floor(S.vin / LSB + 1e-9)}), while the counter stops at the first step at or above it (${Math.min(MAX, Math.ceil(S.vin / LSB - 1e-9))}): both are within one 0.1 V step, the quantisation error.`;
    };
    const pl = player(c.pl, el, { dur: 8, hold: 2, loop: true, draw, still: 8, label: "Conversion position" });
    pick(el, (m) => { S.mode = m; pl.restart(); });
    sl.addEventListener("input", () => { S.vin = +sl.value; el.querySelector(".v-v").textContent = `${S.vin.toFixed(2)} V`; pl.restart(); });
  }

  /* =====================================================================
     ADC resolution and output code (calculator)
     ===================================================================== */
  function adcDiagram(Tl, lab, v, res) {
    const n = Math.round(v.n) || 8, bits = res ? bin(res.code, n) : "?".repeat(Math.min(n, 12));
    let s = `${D.term(20, 90)}${T(20, 72, `${sub("V", "in")} = ${lab.Vin || "?"}</tspan>`, "start")}` + D.wire([24, 90], [110, 90]);
    s += `<rect class="adc" x="110" y="50" width="110" height="80" rx="8"/>${T(165, 86, `${n}-bit ADC`, "middle", "tt inv")}${T(165, 106, `${sub("V", "ref")} = ${lab.Vref || "?"}</tspan>`, "middle", "small inv")}`;
    s += D.wire([220, 90], [250, 90]);
    const show = n <= 16, w = show ? Math.min(22, 170 / n) : 0;
    if (show) [...bits].forEach((b, i) => { s += `<rect class="bitcell${b === "1" ? " on" : ""}" x="${250 + i * w}" y="78" width="${w - 2}" height="24" rx="3"/>${T(250 + i * w + (w - 2) / 2, 95, b, "middle", "small")}`; });
    s += `<text x="250" y="140">code = </text><text x="300" y="140" class="val">${res ? res.code : "?"}</text>`;
    s += `<text x="250" y="162" class="small">hex ${res ? hex(res.code, n) : "?"}</text>`;
    s += `<text x="20" y="180" class="small">resolution ${res ? eng(res.R, "V") : "?"}</text>`;
    return s;
  }
  function adcCompute(v) {
    const n = Math.round(v.n), steps = 2 ** n - 1, R = v.Vref / steps, raw = v.Vin / R, code = Math.round(raw), fl = Math.floor(raw + 1e-9), err = v.Vin - code * R, notes = [];
    if (fl !== code) notes.push({ type: "info", title: "Rounding", html: `Rounded to the nearest whole number the code is ${code}. Many real ADCs round down instead, which would give ${fl}. Either way the code is within 1 step of the true value.` });
    return { sum: `Resolution = ${eng(R, "V")}, digital output = ${code} (${bin(code, n)})`, R, code, notes, steps: [
      step("Number of steps", "2<sup>n</sup> − 1", `= 2<sup>${n}</sup> − 1`, `= ${steps.toLocaleString("en")}`),
      step("Resolution (step size)", "R = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1)", `= ${num(v.Vref)} V ÷ ${steps.toLocaleString("en")}`, `R = ${eng(R, "V")}`),
      step("Digital output", "code = V<sub>in</sub> ÷ R", `= ${num(v.Vin)} V ÷ ${eng(R, "V")} = ${num(raw, 6)}`, `code = <strong>${code}</strong> (to the nearest whole number)`),
      step("In binary and hexadecimal", "", "", `${bin(code, n)} = ${hex(code, n)} hex`),
      step("Quantisation error", "V<sub>in</sub> − code × R", `= ${num(v.Vin)} − ${code} × ${eng(R, "V")}`, `= ${eng(err, "V")} (always within ±½ step)`)] };
  }
  function adcRender(extra, res, v) {
    if (!res) { extra.innerHTML = ""; return; }
    const n = Math.round(v.n), max = 2 ** n - 1, A = axes({ x: [0, v.Vref], y: [0, max], xt: [0, v.Vref / 2, v.Vref].map((q) => +q.toPrecision(3)), yt: [0, Math.round(max / 2), max], xl: "Input voltage (V)", yl: "Output code", l: 58 });
    let g = A.s;
    if (n <= 6) { const pts = []; for (let k = 0; k <= max; k++) { const a = Math.max(0, (k - 0.5) * res.R), b = Math.min(v.Vref, (k + 0.5) * res.R); pts.push([A.X(a), A.Y(k)], [A.X(b), A.Y(k)]); } g += poly(pts, "trace-a"); }
    else g += poly([[A.X(0), A.Y(0)], [A.X(v.Vref), A.Y(max)]], "trace-a");
    g += dot(A.X(clamp(v.Vin, 0, v.Vref)), A.Y(res.code));
    extra.innerHTML = `<h4 class="sub-h">Transfer graph</h4><div class="plot-box">${svg(A.W, A.H, "ADC output code against input voltage", g)}</div><p class="small-note">${n <= 6 ? "Each flat step is one code: every voltage inside it gives the same number." : "With this many bits the steps are too small to see: try 3 or 4 bits to see the staircase."}</p>`;
  }

  // Real situation: an ESP32 reading an LM35 temperature sensor
  const LM35 = `void setup()
{
  Serial.begin(115200);
}

void loop()
{
  int code = analogRead(34);            // 12-bit: 0 to 4095
  float volts = code * 3.3 / 4095.0;    // resolution = 3.3 V / 4095
  float tempC = volts / 0.010;          // LM35: 10 mV per °C
  Serial.println(tempC);
  delay(1000);
}`;
  function mountLm35(el) {
    const c = pvCard(el, "", `${codeBlock(LM35, "ESP32: reading an LM35")}<div class="callout info"><strong>Good to know</strong>The LM35 needs at least 4 V, so power it from the board's 5 V (VIN) pin; its output (10 mV/°C, under 1.5 V) is still safe for the ADC. The ESP32's ADC is not perfectly linear near 0 V and near 3.3 V, and <code>analogReadMilliVolts()</code> uses the chip's factory calibration for a better reading.</div>`);
    const R = 3.3 / 4095;
    const draw = (t) => {
      const T0 = 50 - 45 * Math.cos((TAU * t) / 12), v = T0 * 0.01, code = Math.round(v / R), back = (code * R) / 0.01;
      let s = `<rect class="lm" x="30" y="90" width="44" height="40" rx="4"/><path class="lm" d="M30,90A22,22 0 0 1 74,90Z"/>${T(52, 116, "LM35", "middle", "small inv")}`;
      s += `<path class="w" d="M40,130V160M52,130V160M64,130V160"/>${T(58, 184, "out", "start", "small")}`;
      const th = 20 + (T0 / 100) * 60;
      s += `<rect class="tube" x="10" y="10" width="10" height="80" rx="5"/><rect class="merc" x="12.5" y="${90 - th}" width="5" height="${th}"/>${T(24, 16, `${T0.toFixed(1)} °C`, "start", "tt")}`;
      s += D.wire([52, 160], [52, 196], [150, 196], [150, 130]) + T(100, 212, `${(v * 1000).toFixed(0)} mV`, "middle", "small");
      s += `<rect class="espbig" x="120" y="60" width="90" height="70" rx="8"/>${T(165, 90, "ESP32", "middle", "tt inv")}${T(165, 110, "ADC GPIO34", "middle", "small inv")}`;
      s += `<rect class="meter" x="222" y="40" width="100" height="100" rx="8"/><rect class="lcd" x="228" y="48" width="88" height="26" rx="4"/>${T(272, 66, `code ${code}`, "middle", "lcdt sm")}<rect class="lcd" x="228" y="80" width="88" height="26" rx="4"/>${T(272, 98, `${back.toFixed(1)} °C`, "middle", "lcdt sm")}${T(272, 128, "Serial Monitor", "middle", "small")}`;
      c.scene.innerHTML = svg(330, 225, `LM35 at ${T0.toFixed(1)} °C gives ${(v * 1000).toFixed(0)} mV, ESP32 code ${code}`, s, "scene");
      const A = axes({ x: [0, 100], y: [0, 1300], xt: [0, 25, 50, 75, 100], yt: [0, 400, 800, 1200], xl: "Temperature (°C)", yl: "ADC code" });
      c.graph.innerHTML = svg(A.W, A.H, "ESP32 ADC code against temperature", A.s + poly(curve(A, (x) => (x * 0.01) / R, 0, 100, 4), "trace-a") + dot(A.X(T0), A.Y(code)) + label(A.X(T0) + (T0 > 60 ? -8 : 8), A.Y(code) - 10, `${code}`, T0 > 60 ? "end" : "start"));
      c.read.innerHTML = `${T0.toFixed(1)} °C → LM35 gives ${(v * 1000).toFixed(0)} mV → code = ${v.toFixed(3)} V ÷ ${(R * 1000).toFixed(4)} mV = <strong>${code}</strong> → back to ${back.toFixed(1)} °C. One ADC step (0.806 mV) is less than 0.1 °C, so 12 bits are plenty here.`;
    };
    player(c.pl, el, { dur: 12, hold: 0, draw, still: 3, label: "Temperature position", clock: (t) => `${(50 - 45 * Math.cos((TAU * t) / 12)).toFixed(0)} °C` });
  }

  /* =====================================================================
     Sections
     ===================================================================== */
  const SECTIONS = [
    { id: "journey", group: "intro", title: "Analog to digital and back again", toc: "A song's journey",
      intro: `<p>Electronic data conversion lets analog signals be stored in digital form, and the stored digital data reproduce the analog signal. A song from a microphone is converted to digital form to be kept on pendrives, hard drives, CDs and cloud storage; the digital data can later be converted back to analog and turned into sound by a speaker.</p>
        <p>Conversion goes both ways: <strong>analog to digital (ADC)</strong> and <strong>digital to analog (DAC)</strong>. <strong>Data acquisition</strong> is simply gathering information about a system or process, and in modern instruments that means measuring with an ADC.</p>`,
      mount: mountSong },
    { id: "bits", group: "codes", title: "Bits, words and codes", toc: "Digital codes",
      intro: `<p>A digital code has two states, false or true, sent as <strong>logic 0</strong> (0 V) and <strong>logic 1</strong> (3.3 V or 5 V). A group of bits is a <strong>word</strong>, normally 8 to 64 bits long. An n-bit word has <strong>2<sup>n</sup></strong> combinations: 4 bits give 2<sup>4</sup> = 16, from 0 to 15.</p>
        <p>Unipolar (positive-only) signals use <strong>straight binary</strong>, <strong>binary-coded decimal (BCD)</strong>, where each decimal digit gets its own 4 bits, or <strong>hexadecimal (HEX)</strong>. Bipolar signals (positive and negative) use 1s complement, 2s complement, offset binary or sign-magnitude codes. Tap the bits below.</p>`,
      mount: mountBits },
    { id: "weighted", group: "dac", title: "DAC 1: the binary-weighted resistor DAC", toc: "Binary-weighted DAC",
      intro: `<p>A DAC takes a binary number and outputs an analog voltage (or current) that the next analog circuit can use. The binary-weighted DAC has three parts: a network of <strong>precision binary-weighted resistors</strong>, a <strong>current-to-voltage converter</strong> (an op-amp with R<sub>f</sub>) and a <strong>×1 inverter</strong>.</p>
        <p>For an N-bit DAC, bit n (D0 is the least significant bit, LSB) gets the resistor</p><p class="formula">R<sub>n</sub> = 2<sup>N − 1 − n</sup> R</p>
        <p>so for N = 8 and R = 1 kΩ: R<sub>0</sub> = 128 kΩ, R<sub>1</sub> = 64 kΩ, … R<sub>7</sub> = 1 kΩ. The currents add at point A (a virtual ground), and the sum of currents equals the current through R<sub>f</sub>:</p>
        <p class="formula">D<sub>0</sub>/R<sub>0</sub> + D<sub>1</sub>/R<sub>1</sub> + … + D<sub>N−1</sub>/R<sub>N−1</sub> = (0 − V<sub>A</sub>) ÷ R<sub>f</sub></p>
        <p>where each D<sub>n</sub> is the bit's voltage (logic HIGH or 0 V). The op-amp's output is negative, so the inverter makes the final output <strong>V<sub>out</sub> = R<sub>f</sub> × (D<sub>0</sub>/R<sub>0</sub> + … + D<sub>N−1</sub>/R<sub>N−1</sub>)</strong>.</p>`,
      mount: mountWeighted },
    { id: "esp32dac", group: "dac", title: "Real situation: making a sound with the ESP32's DAC", toc: "ESP32 DAC",
      intro: `<p>The ESP32 has two 8-bit DACs, on GPIO25 and GPIO26 (<code>dacWrite</code> from Chapter 2). Sending a table of codes one after another makes a waveform, such as a tone for a speaker. The number of bits decides how smooth it is.</p>`,
      mount: mountSine },
    { id: "r2r", group: "dac", title: "DAC 2: the R-2R ladder", toc: "R-2R ladder",
      intro: `<p>The second type of DAC uses a ladder of only <strong>two resistor values, R and 2R</strong>, however many bits there are. Each bit's switch connects its 2R leg to logic HIGH or to 0 V. Every node in the ladder halves the contribution of the bits behind it, so the MSB counts ½, the next bit ¼, and so on:</p>
        <p class="formula">V<sub>out</sub> = V<sub>H</sub> × code ÷ 2<sup>N</sup></p>`,
      mount: mountR2R },
    { id: "adcrace", group: "adc", title: "How an ADC finds the number: counter vs successive approximation", toc: "Counter vs SAR",
      intro: `<p>Many ADCs work by guessing with a DAC: the DAC's output is compared with the input signal by a <strong>comparator</strong>. In a <strong>counter (ramp) ADC</strong> the digital input is increased one step at a time until the DAC output equals or passes the input; the comparator then stops the conversion, and the last digital input is the digital value of the analog input.</p>
        <p>A <strong>successive-approximation (SAR) ADC</strong> is much faster: it tests one bit at a time, from the MSB down. Other types include flash and dual-slope ADCs. Try both below with a 5-bit ADC (0.1 V per step).</p>`,
      mount: mountAdcRace },
    { id: "adccalc", group: "adc", title: "ADC resolution and output code", toc: "Resolution and code",
      intro: `<p>The <strong>resolution</strong> (step size) is the smallest voltage change the ADC can detect:</p><p class="formula">R = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1)</p>
        <p>where n is the number of bits and V<sub>ref</sub> the maximum input voltage. For example, a 5 V, 8-bit ADC has R = 5 ÷ 255 = 19.6 mV: every 19.6 mV adds 1 to the output number. The digital output is</p><p class="formula">code = V<sub>in</sub> ÷ R</p>
        <p>rounded to a whole number. For example, 2.94 V ÷ 19.6 mV = 150.</p>`,
      inputs: [F("n", "num", 12, "8 to 16 is typical", { unit: "bits", positive: true, label: "Number of bits n", name: "n", validate: (x) => (x !== Math.round(x) || x > 24 ? "Enter a whole number up to 24." : "") }),
        F("Vref", "num", 3.3, null, { unit: "V", positive: true, label: "Reference V<sub>ref</sub>", name: "Vref" }),
        F("Vin", "num", 2, null, { unit: "V", positive: false, label: "Input V<sub>in</sub>", name: "Vin", validate: (x) => (x < 0 ? "Enter 0 or more." : "") })],
      view: "0 0 440 200", diagram: adcDiagram, render: adcRender, caption: "The output bits follow your values.",
      compute(v) { if (v.Vin > v.Vref) return Object.assign(adcCompute(Object.assign({}, v, { Vin: v.Vref })), { notes: [{ type: "warn", title: "Input above V<sub>ref</sub>", html: `The ADC can't read more than V<sub>ref</sub>: it just gives its largest code, ${2 ** Math.round(v.n) - 1}.` }] }); return adcCompute(v); },
      after: `<div class="callout info"><strong>Good to know</strong>Some books and datasheets define the step as V<sub>ref</sub> ÷ 2<sup>n</sup> instead of V<sub>ref</sub> ÷ (2<sup>n</sup> − 1). For 8 bits or more the difference is tiny; this course uses V<sub>ref</sub> ÷ (2<sup>n</sup> − 1).</div>` },
    { id: "lm35", group: "adc", title: "Real situation: an ESP32 thermometer", toc: "ESP32 ADC",
      intro: `<p>The ESP32's ADC is 12-bit, so it gives codes from 0 to 4095 for 0 to about 3.3 V: a resolution of 3.3 ÷ 4095 = 0.806 mV. An LM35 temperature sensor gives 10 mV per °C. Watch the temperature change and follow the numbers.</p>`,
      mount: mountLm35 }
  ];

  /* =====================================================================
     Exercises (practice; the slide questions are the URLearn home exercise)
     ===================================================================== */
  const W_ = (list) => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml(list)}</ol></div>`;
  const EXERCISES = [
    { id: "c6-q1", title: "Exercise 1: binary, hex and BCD",
      q: `<p>Write the decimal number <strong>45</strong> in other codes.</p>`,
      ans: [{ l: "Straight binary", u: "", v: 101101, tol: 0 }, { l: "Hexadecimal", opts: ["2D", "45", "D2", "2B"], v: 0 }, { l: "BCD", opts: ["0100 0101", "0010 1101", "0101 0100", "0100 1011"], v: 0 }],
      hints: [`45 = 32 + 8 + 4 + 1. Write a 1 for each power of 2 used.`, `For hex split the binary into groups of 4 from the right; for BCD code each decimal digit (4 and 5) separately.`],
      working: () => W_([step("Binary", "45 = 32 + 8 + 4 + 1", "", "<strong>101101</strong>"), step("Hex", "0010 1101 → 2 and D (13)", "", "<strong>2D</strong>"), step("BCD", "4 → 0100, 5 → 0101", "", "<strong>0100 0101</strong>")]) },
    { id: "c6-q2", title: "Exercise 2: word length",
      q: `<p>An ADC produces <strong>10-bit</strong> words.</p>`,
      ans: [{ l: "Number of different codes", u: "", v: 1024, tol: 0 }, { l: "Largest code (decimal)", u: "", v: 1023, tol: 0 }],
      hints: [`n bits give 2<sup>n</sup> combinations.`, `Counting starts at 0.`],
      working: () => W_([step("Combinations", "2<sup>10</sup>", "", "<strong>1024</strong>"), step("Largest", "2<sup>10</sup> − 1", "", "<strong>1023</strong> (11 1111 1111)")]) },
    { id: "c6-q3", title: "Exercise 3: binary-weighted resistors",
      q: `<p>A <strong>6-bit</strong> binary-weighted DAC has R<sub>0</sub> (the LSB resistor) = <strong>320 kΩ</strong>.</p>`,
      ans: [{ l: "R (the MSB resistor, R<sub>5</sub>)", u: "kΩ", v: 10 }, { l: "R<sub>3</sub>", u: "kΩ", v: 40 }],
      hints: [`R<sub>n</sub> = 2<sup>N − 1 − n</sup> R, so R<sub>0</sub> = 2<sup>5</sup> R.`, `Each step towards the MSB halves the resistor.`],
      working: () => W_([step("R", "R = R<sub>0</sub> ÷ 2<sup>5</sup>", "= 320 ÷ 32", "<strong>10 kΩ</strong>"), step("R<sub>3</sub>", "2<sup>6−1−3</sup> R = 4R", "", "<strong>40 kΩ</strong>")]) },
    { id: "c6-q4", title: "Exercise 4: binary-weighted DAC output",
      q: `<p>A 4-bit binary-weighted DAC has R = <strong>10 kΩ</strong> (so R<sub>3</sub> = 10 kΩ … R<sub>0</sub> = 80 kΩ), R<sub>f</sub> = <strong>5 kΩ</strong>, logic HIGH = <strong>5 V</strong>, and an inverter after the converter.</p>`,
      ans: [{ l: "V<sub>out</sub> for input 1011", u: "V", v: 3.4375 }, { l: "V<sub>out</sub> for 1111 (full scale)", u: "V", v: 4.6875 }],
      hints: [`1011 means D3, D1 and D0 are HIGH.`, `V<sub>out</sub> = R<sub>f</sub> × Σ(5 V ÷ R<sub>n</sub>) for the HIGH bits.`],
      working: () => W_([step("Currents for 1011", "5/10k + 5/40k + 5/80k", "= 0.5 + 0.125 + 0.0625 mA", "= 0.6875 mA"), step("V<sub>out</sub>", "5 kΩ × 0.6875 mA", "", "<strong>3.4375 V</strong>"), step("Full scale", "5 kΩ × 5 × (1/10k + 1/20k + 1/40k + 1/80k)", "= 5 kΩ × 0.9375 mA", "<strong>4.6875 V</strong>")]) },
    { id: "c6-q5", title: "Exercise 5: choosing R<sub>f</sub>",
      q: `<p>A 4-bit binary-weighted DAC has R<sub>0</sub> = <strong>160 kΩ</strong>, logic HIGH = <strong>3.3 V</strong>, and must give <strong>6 V</strong> at full scale (1111).</p>`,
      ans: [{ l: "R (the MSB resistor)", u: "kΩ", v: 20 }, { l: "R<sub>f</sub>", u: "kΩ", v: 19.39 }],
      hints: [`R<sub>0</sub> = 2<sup>3</sup> R for 4 bits.`, `At full scale all four bits are HIGH: R<sub>f</sub> = 6 V ÷ ΣI.`],
      working: () => W_([step("R", "160 ÷ 8", "", "<strong>20 kΩ</strong>"), step("Full-scale current", "3.3 × (1/20k + 1/40k + 1/80k + 1/160k)", "= 3.3 × 15/160k", "= 0.3094 mA"), step("R<sub>f</sub>", "6 V ÷ 0.3094 mA", "", "<strong>19.39 kΩ</strong>")]) },
    { id: "c6-q6", title: "Exercise 6: R-2R ladder",
      q: `<p>A buffered 4-bit R-2R ladder DAC runs from logic HIGH = <strong>5 V</strong>.</p>`,
      ans: [{ l: "V<sub>out</sub> for 1010", u: "V", v: 3.125 }, { l: "Step size (1 LSB)", u: "V", v: 0.3125 }, { l: "Number of different resistor values needed", u: "", v: 2, tol: 0 }],
      hints: [`V<sub>out</sub> = V<sub>H</sub> × code ÷ 2<sup>N</sup>.`, `1010 is decimal 10; 2<sup>4</sup> = 16.`],
      working: () => W_([step("V<sub>out</sub>", "5 × 10 ÷ 16", "", "<strong>3.125 V</strong>"), step("Step", "5 ÷ 16", "", "<strong>0.3125 V</strong>"), step("Resistors", "", "", "Only <strong>2</strong>: R and 2R")]) },
    { id: "c6-q7", title: "Exercise 7: ADC resolution",
      q: `<p>A <strong>10-bit</strong> ADC has V<sub>ref</sub> = <strong>3.3 V</strong>.</p>`,
      ans: [{ l: "Resolution", u: "mV", v: 3.226 }, { l: "Digital output for 1.30 V", u: "", v: 403, tol: 0 }],
      hints: [`R = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1).`, `code = V<sub>in</sub> ÷ R, rounded to a whole number.`],
      working: () => W_([step("Resolution", "3.3 ÷ 1023", "", "<strong>3.226 mV</strong>"), step("Code", "1.30 V ÷ 3.226 mV", "= 403.0", "<strong>403</strong>")]) },
    { id: "c6-q8", title: "Exercise 8: ESP32 thermometer",
      q: `<p>An ESP32 (12-bit ADC, 3.3 V) reads an LM35 (10 mV/°C).</p>`,
      ans: [{ l: "ADC code at 30 °C", u: "", v: 372, tol: 1 }, { l: "Temperature when the code is 620", u: "°C", v: 49.96 }],
      hints: [`Resolution = 3.3 ÷ 4095 = 0.806 mV.`, `30 °C → 0.30 V. For the reverse, V = code × resolution, then ÷ 10 mV.`],
      working: () => W_([step("Code at 30 °C", "0.30 V ÷ 0.806 mV", "= 372.3", "<strong>372</strong>"), step("Temperature", "620 × 3.3 ÷ 4095 = 0.4996 V", "0.4996 ÷ 0.010", "<strong>50.0 °C</strong>")]) },
    { id: "c6-q9", title: "Exercise 9: counter vs SAR",
      q: `<p>Compare an <strong>8-bit</strong> counter ADC with an 8-bit SAR ADC, both with a <strong>1 MHz</strong> clock (one step per microsecond).</p>`,
      ans: [{ l: "Worst-case steps for the counter ADC", u: "", v: 255, tol: 1 }, { l: "Steps for the SAR ADC", u: "", v: 8, tol: 0 }, { l: "Worst-case counter conversion time", u: "µs", v: 255, tol: 1 }],
      hints: [`The counter may need to climb through every code up to 2<sup>n</sup> − 1.`, `SAR decides one bit per step.`],
      working: () => W_([step("Counter", "up to 2<sup>8</sup> − 1 steps", "", "<strong>255 steps → 255 µs</strong>"), step("SAR", "one step per bit", "", "<strong>8 steps → 8 µs</strong>")]) },
    { id: "c6-q10", title: "Exercise 10: how many bits?",
      q: `<p>A 5 V sensor must be read with a resolution of <strong>1 mV or better</strong>.</p>`,
      ans: [{ l: "Smallest number of bits", u: "bits", v: 13, tol: 0 }, { l: "Its resolution", u: "mV", v: 0.6104 }],
      hints: [`You need 5 V ÷ (2<sup>n</sup> − 1) ≤ 1 mV, so 2<sup>n</sup> − 1 ≥ 5000.`, `2<sup>12</sup> = 4096 is not enough.`],
      working: () => W_([step("Condition", "2<sup>n</sup> − 1 ≥ 5000", "12 bits → 4095 (too few); 13 bits → 8191", "<strong>13 bits</strong>"), step("Resolution", "5 ÷ 8191", "", "<strong>0.610 mV</strong>")]) },
    { id: "c6-q11", title: "Exercise 11: ESP32 DAC",
      q: `<p>The ESP32's DAC is 8-bit with a 3.3 V range (0 to 255).</p>`,
      ans: [{ l: "Output for <code>dacWrite(25, 200)</code>", u: "V", v: 2.588 }, { l: "Step size", u: "mV", v: 12.94 }],
      hints: [`V = code × 3.3 ÷ 255.`, `Step = 3.3 ÷ 255.`],
      working: () => W_([step("Output", "200 × 3.3 ÷ 255", "", "<strong>2.588 V</strong>"), step("Step", "3.3 ÷ 255", "", "<strong>12.94 mV</strong>")]) },
    { id: "c6-q12", title: "Exercise 12: DAC or ADC?",
      q: `<p>Choose the right answer for each.</p>`,
      ans: [{ l: "Turns a microphone signal into numbers", opts: ["ADC", "DAC"], v: 0 },
        { l: "Plays a song stored on a pendrive through a speaker", opts: ["ADC", "DAC"], v: 1 },
        { l: "In a binary-weighted DAC, the largest resistor belongs to", opts: ["the LSB (D0)", "the MSB"], v: 0 },
        { l: "Needs only two resistor values", opts: ["Binary-weighted DAC", "R-2R ladder DAC"], v: 1 },
        { l: "Faster for 12 bits", opts: ["Counter (ramp) ADC", "Successive-approximation ADC"], v: 1 }],
      hints: [`Analog in, digital out is an ADC.`, `The LSB has the smallest weight, so the smallest current and the largest resistor.`],
      working: () => W_([step("Microphone to numbers", "", "", "ADC"), step("Numbers to speaker", "", "", "DAC"), step("Largest resistor", "", "", "LSB (D0): 2<sup>N−1</sup>R"), step("Two values", "", "", "R-2R ladder"), step("Faster", "", "", "SAR: 12 steps instead of up to 4095")]) }
  ];

  Lab.page({
    topic: 6,
    collapseWorking: true,
    exerciseCarousel: true,
    sections: SECTIONS,
    groups: [
      { key: "intro", list: "#introList" },
      { key: "codes", list: "#codesList" },
      { key: "dac", list: "#dacList", toc: "#dacToc" },
      { key: "adc", list: "#adcList", toc: "#adcToc" }
    ],
    exercises: EXERCISES
  });

  // Figure for the home exercise: a 5-bit binary-weighted DAC
  const hf = document.getElementById("homeFigDac");
  if (hf) {
    let s = "";
    for (let b = 0; b < 5; b++) { const y = 30 + b * 34; s += T(20, y + 5, `D${b}`, "middle", "tt") + D.term(38, y) + D.wire([42, y], [60, y]) + D.res(60, y, 140, y) + T(100, y - 11, `R<tspan class="sb" dy="3">${b}</tspan>`, "middle", "small") + D.wire([140, y], [170, y]) + D.dot(170, y); }
    const ym = 98;
    s += D.wire([170, 30], [170, 166]) + D.wire([170, ym], [240, ym]) + D.dot(214, ym) + D.opamp(240, ym + 20, false) + D.wire([240, ym + 40], [228, ym + 40], [228, ym + 58]) + D.gnd(228, ym + 58);
    s += D.wire([214, ym], [214, ym - 56], [248, ym - 56]) + D.res(248, ym - 56, 308, ym - 56) + D.wire([308, ym - 56], [338, ym - 56], [338, ym + 20]) + T(278, ym - 68, `R<tspan class="sb" dy="3">f</tspan>`, "middle", "small");
    s += D.wire([320, ym + 20], [360, ym + 20]) + `<rect class="inv-box" x="360" y="${ym}" width="62" height="40" rx="6"/>${T(391, ym + 25, "× (−1)", "middle", "tt")}` + D.wire([422, ym + 20], [446, ym + 20]) + D.term(450, ym + 20) + T(450, ym + 46, "analog out", "middle", "small");
    hf.innerHTML = `<div class="scene-scroll"><svg class="scene homefig" viewBox="0 0 470 200" role="img" aria-label="Five-bit binary-weighted DAC: inputs D0 to D4 through resistors R0 to R4 into a current-to-voltage converter with feedback resistor Rf, followed by a times minus one inverter">${s}</svg></div>`;
  }
})();
