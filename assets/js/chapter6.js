/* NMK42003 Chapter 6: Data Conversion and Acquisition
   Animated notes: the analog → digital → analog journey, digital codes, the ESP32's converters, the ADC (Vref, resolution,
   output code, the fx-570MS for base conversion, an ESP32 thermometer), the binary-weighted and R-2R DACs and the ESP32's DAC,
   and how an ADC finds the number (counter vs successive approximation).
   The calculator, exercise and animation engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, F, D, step, stepsHtml, MINUS, reduceMotion, chips, wireChips, fold, codeBlock,
    player, axes, poly, svg, curve, dot, label, pvCard, pick, tone } = Lab;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const TAU = 2 * Math.PI;
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const sub = (a, b) => `${a}<tspan class="sb" dy="3">${b}</tspan><tspan dy="-3">`;
  const bin = (v, n) => v.toString(2).padStart(n, "0");
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(Math.ceil(n / 4), "0");
  const bcd = (v) => String(v).split("").map((d) => bin(+d, 4)).join(" ");
  const nib = (s) => s.replace(/\B(?=(.{4})+$)/g, " ");   // 101010111100 → 1010 1011 1100
  const TALL = "(max-width: 640px)";
  const tall = () => window.matchMedia(TALL).matches;
  // redraw a drawing when the phone turns (or the window crosses the phone width)
  const onTall = (fn) => { const mq = window.matchMedia(TALL); if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn); };
  const ESP = `<figure class="photo2 small"><img src="assets/img/chapter-2/esp-wroom-32.jpg" alt="Close-up of an ESP-WROOM-32 module" width="800" height="800" loading="lazy"><figcaption>The ESP-WROOM-32 module: the ADC and DAC are inside this metal can. <span class="credit">Photo: <a href="https://commons.wikimedia.org/wiki/File:Espressif_ESP-WROOM-32_Wi-Fi_%26_Bluetooth_Module.jpg" target="_blank" rel="noopener">Brian Krent</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a>, via Wikimedia Commons</span></figcaption></figure>`;
  // a small figure for an exercise
  const xfig = (w, h, lab, body, cls = "") => `<div class="scene-scroll"><svg class="scene exfig${cls ? " " + cls : ""}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(lab)}">${body}</svg></div>`;

  /* =====================================================================
     Introduction: the whole journey in 7 stages (sense → sample → quantise → encode → store → DAC → smooth)
     ===================================================================== */
  const JST = [
    ["Sense", "sense"], ["Sample", "adc"], ["Quantise", "adc"], ["Encode", "adc"], ["Store / send", "store"], ["DAC", "dac"], ["Smooth", "smooth"]];
  const sig = (x) => 1.65 + 1.15 * Math.sin(TAU * 1.5 * x) + 0.3 * Math.sin(TAU * 3.7 * x + 1);
  function mountJourney(el) {
    const S = { bits: 3 }, SEG = 3.2, DUR = SEG * 7;
    el.innerHTML = `<div class="pv">${chips("Bits per sample", [["3", "3 bits (8 levels)"], ["4", "4 bits (16 levels)"], ["8", "8 bits (256 levels)"]], "3")}
      <figure class="scene-box jr-box"><svg class="scene jr" role="img" aria-label="Animated: a sound is sensed, sampled, quantised and encoded into binary words by an ADC, stored, turned back into a staircase voltage by a DAC, then smoothed by a filter for the speaker."></svg></figure>
      <div class="jr-nav"><button type="button" class="btn ghost jr-prev">‹ Back</button><span class="jr-at" aria-live="polite"></span><button type="button" class="btn ghost jr-next">Next step ›</button></div>
      <div class="pv-pl"></div><p class="pv-read jr-read"></p></div>`;
    const sv = el.querySelector("svg"), read = el.querySelector(".jr-read"), at = el.querySelector(".jr-at");
    const draw = (t) => {
      const tl = tall(), N = tl ? 10 : 16, L = 2 ** S.bits, lv = (v) => Math.round((v / 3.3) * (L - 1)), vq = (k) => (k * 3.3) / (L - 1);
      const st = Math.min(6, Math.floor(t / SEG)), p = clamp((t - st * SEG) / SEG, 0, 1);
      const W = tl ? 360 : 760, H = tl ? 500 : 384;
      const gx0 = tl ? 46 : 64, gx1 = tl ? 346 : 742, gy0 = tl ? 130 : 108, gy1 = tl ? 404 : 318;
      const X = (x) => gx0 + x * (gx1 - gx0), Y = (v) => gy1 - (v / 3.3) * (gy1 - gy0);
      let s = "";
      // the 7 stages as blocks (two rows on a phone)
      JST.forEach(([name, kind], i) => {
        const w = tl ? 80 : 98, h = tl ? 40 : 46, r1 = tl && i >= 4, x = tl ? (r1 ? 50 + (i - 4) * 87 : 6 + i * 87) : 6 + i * 107, y = tl ? (r1 ? 58 : 8) : 10;
        s += `<g class="jb ${kind}${i === st ? " on" : i < st ? " done" : ""}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>${T(x + w / 2, y + h / 2 - 2, `${i + 1}`, "middle", "jn")}${T(x + w / 2, y + h / 2 + 13, name, "middle", "jl")}</g>`;
        if (!tl && i < 6) s += `<path class="jarr" d="M${x + w + 1},${y + h / 2}h6m-4,-4l4,4l-4,4"/>`;
      });
      if (!tl) s += `<path class="jbr adc" d="M113,62v6H425v-6"/>${T(269, 82, "inside the ADC", "middle", "jbt adc")}<path class="jbr dac" d="M541,62v6H633v-6"/>${T(587, 82, "the DAC", "middle", "jbt dac")}`;
      else s += T(180, 118, "steps 2–4 happen inside the ADC; step 6 is the DAC", "middle", "jbt");
      // axes
      s += `<path class="jax" d="M${gx0},${gy0 - 6}V${gy1}H${gx1}"/>${T(gx0 - 6, Y(3.3) + 4, "3.3 V", "end", "small")}${T(gx0 - 6, gy1 + 4, "0 V", "end", "small")}${T(gx1, gy1 + (tl ? 54 : 52), "time →", "end", "small")}`;
      // sample times, readings, levels
      const xs = Array.from({ length: N }, (_, i) => (i + 0.5) / N), vs = xs.map(sig), ks = vs.map(lv), hk = tl ? 3 : 5;
      // the analog wave
      const wave = (a, b, cls) => { const pts = []; for (let i = 0; i <= 120; i++) { const x = a + ((b - a) * i) / 120; pts.push([X(x), Y(sig(x))]); } return poly(pts, cls); };
      if (st === 0) s += wave(0, Math.max(0.01, p), "jw");
      else if (st <= 4) s += wave(0, 1, st >= 3 ? "jw dim" : "jw");
      else s += wave(0, 1, "jw ghost");
      // level grid (stages 3 to 5; only when the levels are far enough apart to see)
      if (st >= 2 && st <= 5 && L <= 16) for (let k = 0; k < L; k++) { s += `<line class="jgrid" x1="${gx0}" x2="${gx1}" y1="${Y(vq(k))}" y2="${Y(vq(k))}"/>`; if (L <= 8) s += T(gx1 + 2, Y(vq(k)) + 4, `${k}`, "start", "jlev"); }
      if (st >= 2 && st <= 5 && L <= 8 && !tl) s += T(gx1 + 2, gy0 - 10, "level", "start", "jlev");
      // the clock ticks and samples
      const shown = st === 1 ? Math.ceil(p * N) : st >= 2 && st <= 4 ? N : 0;
      for (let i = 0; i < shown; i++) {
        const v = st === 2 ? lerp(vs[i], vq(ks[i]), p) : st >= 3 ? vq(ks[i]) : vs[i];
        s += `<line class="jstem" x1="${X(xs[i])}" x2="${X(xs[i])}" y1="${gy1}" y2="${Y(v)}"/><path class="jtick" d="M${X(xs[i])},${gy1}v6"/>`;
        s += i === hk ? `<circle class="jdot hk" cx="${X(xs[i])}" cy="${Y(v)}" r="6"/>` : `<circle class="jdot" cx="${X(xs[i])}" cy="${Y(v)}" r="3.6"/>`;
      }
      // binary words under the samples (stage 4 writes them, stage 6 reads them back)
      const wy = gy1 + 22, small = S.bits <= 4;
      const wordAt = (i, cls) => small || i === hk ? T(X(xs[i]), wy, bin(ks[i], S.bits), "middle", `jword${i === hk ? " hk" : ""}${cls ? " " + cls : ""}`) : "";
      if (st === 3) for (let i = 0; i < Math.ceil(p * N); i++) s += wordAt(i);
      // stage 5: the words travel to storage
      const sx = gx1 - 34, sy = gy0 + 6;
      if (st === 4 || st === 5) s += `<g class="jstore${st === 4 ? " on" : ""}"><rect x="${sx}" y="${sy}" width="34" height="44" rx="6"/><rect class="cap" x="${sx + 9}" y="${sy - 8}" width="16" height="9" rx="2"/>${T(sx + 17, sy + 28, "💾", "middle", "")}</g>`;
      if (st === 4) for (let i = 0; i < N; i++) {
        const k = clamp(p * 1.6 - (i / N) * 0.6, 0, 1);
        if (!small && i !== hk) continue;
        if (k < 1) s += T(lerp(X(xs[i]), sx + 17, k), lerp(wy, sy + 20, k), bin(ks[i], S.bits), "middle", `jword${i === hk ? " hk" : ""}`);
      }
      // stages 6 and 7: the DAC's staircase, then the filter's smooth output
      if (st >= 5) {
        const n = st === 5 ? Math.ceil(p * N) : N, pts = [];
        for (let i = 0; i < n; i++) { const a = i / N, b = (i + 1) / N, y = Y(vq(ks[i])); pts.push([X(a), y], [X(b), y]); s += wordAt(i, st === 6 ? "dim" : ""); }
        if (pts.length) s += poly(pts, st === 6 ? "jstair dim" : "jstair");
        if (st === 5 && n) { const i = n - 1; s += `<circle class="jdot hk" cx="${X((i + 0.5) / N)}" cy="${Y(vq(ks[i]))}" r="${i === hk ? 6 : 0}"/>`; }
      }
      if (st === 6) {
        const mids = xs.map((x, i) => [x, vq(ks[i])]), cr = (u) => { // Catmull-Rom through the step centres
          const f = clamp(u * N - 0.5, 0, N - 1.0001), i = Math.floor(f), q = f - i, P = (j) => mids[clamp(j, 0, N - 1)][1];
          const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
          return 0.5 * (2 * b + (c - a) * q + (2 * a - 5 * b + 4 * c - d) * q * q + (3 * b - a - 3 * c + d) * q * q * q); };
        const pts = []; for (let i = 0; i <= 160 * p; i++) { const u = i / 160; pts.push([X(u), Y(clamp(cr(u), 0, 3.3))]); }
        if (pts.length > 1) s += poly(pts, "jsmooth");
        const cone = reduceMotion ? 0 : Math.sin(t * 22) * 2, kx = gx1 - 30, ky = gy0 + 18;
        s += `<rect class="mspk" x="${kx}" y="${ky}" width="10" height="18"/><path class="mspk" d="M${kx + 10 + cone},${ky}L${kx + 26 + cone},${ky - 12}V${ky + 30}L${kx + 10 + cone},${ky + 18}Z"/>`;
        if (p > 0.3) s += `<path class="jsnd" d="M${kx + 32},${ky - 4}q6,13 0,26M${kx + 38},${ky - 10}q10,19 0,38"/>`;
      }
      sv.setAttribute("viewBox", `0 0 ${W} ${H}`);
      sv.classList.toggle("tall", tl);
      sv.innerHTML = s;
      // the words under the picture follow ONE reading (the highlighted one) through every stage
      const v = vs[hk], k = ks[hk], w = bin(k, S.bits), vo = vq(k), dv = 3.3 / (L - 1);
      const TXT = [
        `<strong>1 · Sense.</strong> The microphone turns the sound into a smooth (analog) voltage. It can take <em>any</em> value between 0 and 3.3 V.`,
        `<strong>2 · Sample.</strong> A clock ticks many times a second, and at each tick the ADC takes one reading and holds it. Follow the big amber dot: it reads <strong>${v.toFixed(2)} V</strong>.`,
        `<strong>3 · Quantise.</strong> With ${S.bits} bits there are only <strong>${L} levels</strong>, ${dv.toFixed(dv < 0.1 ? 4 : 3)} V apart, so each reading snaps to the nearest level: ${v.toFixed(2)} V → <strong>level ${k}</strong> (${vo.toFixed(3)} V).`,
        `<strong>4 · Encode.</strong> Each level number is written in binary: level ${k} → <strong>${w}</strong>. Steps 2 to 4 are what an <strong>ADC</strong> does.`,
        `<strong>5 · Store or send.</strong> Only the binary words are kept (pendrive, phone, cloud) or sent (Wi-Fi, Bluetooth). Numbers don't pick up noise, so every copy is exactly the same.`,
        `<strong>6 · DAC.</strong> The <strong>DAC</strong> reads each word and gives out that level's voltage, holding it until the next word: ${w} → <strong>${vo.toFixed(3)} V</strong>. The result is a staircase.`,
        `<strong>7 · Smooth.</strong> A low-pass filter (Chapter 5) rounds off the steps and the speaker plays the sound. ${S.bits < 8 ? `With only ${S.bits} bits the copy is rough: try 8 bits.` : "With 8 bits the copy is very close to the original (dashed)."}`];
      read.innerHTML = TXT[st];
      at.textContent = `Step ${st + 1} of 7: ${JST[st][0]}`;
      el.querySelector(".jr-prev").disabled = st === 0;
      el.querySelector(".jr-next").disabled = st === 6;
    };
    const pl = player(el.querySelector(".pv-pl"), el, { dur: DUR, hold: 2.5, draw, still: DUR, label: "Journey position", clock: (t) => `step ${Math.min(7, Math.floor(t / SEG) + 1)} of 7` });
    const go = (d) => { pl.pause(); const st = clamp(Math.min(6, Math.floor(Math.min(pl.t, DUR - 0.01) / SEG)) + d, 0, 6); pl.set(st * SEG + SEG - 0.01); };
    el.querySelector(".jr-prev").addEventListener("click", () => go(-1));
    el.querySelector(".jr-next").addEventListener("click", () => go(1));
    pick(el, (k) => { S.bits = +k; pl.redraw(); });
    onTall(() => pl.redraw());
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
      codes.innerHTML = `<dl class="defs code-out"><div><dt>Decimal</dt><dd>${S.v}</dd></div><div><dt>Binary</dt><dd>${nib(bin(S.v, n))}</dd></div><div><dt>Hexadecimal</dt><dd>${hex(S.v, n)}</dd></div><div><dt>BCD (each decimal digit in 4 bits)</dt><dd>${bcd(S.v)}</dd></div></dl>`;
      const ones = [...bin(S.v, n)].map((c, i) => (c === "1" ? 2 ** (n - 1 - i) : 0)).filter(Boolean);
      read.innerHTML = `${n} bits give 2<sup>${n}</sup> = <strong>${(max + 1).toLocaleString("en")}</strong> combinations, from 0 to ${max.toLocaleString("en")}. ${S.v ? `This word is ${ones.join(" + ")} = <strong>${S.v}</strong>.` : "All bits are 0."} A 1 is sent as a HIGH voltage (3.3 V on the ESP32) and a 0 as 0 V.`;
    };
    row.addEventListener("click", (e) => { const b = e.target.closest(".bit"); if (!b) return; pl.pause(); S.v ^= 1 << +b.dataset.b; paint(); });
    const pl = player(el.querySelector(".pv-pl"), el, { dur: 16, hold: 1, still: (16 * 45) / 255, auto: false, label: "Counting position", clock: () => `${S.v}`, draw: (t) => { S.v = Math.round((t / 16) * (S.n <= 8 ? 2 ** S.n - 1 : 255)); paint(); } });
    pick(el, (k) => { S.n = +k; pl.redraw(); });
  }

  /* =====================================================================
     The ESP32's converters: one board picture, ADC pins and DAC pins
     ===================================================================== */
  // ESP32 DevKit (30-pin) headers, top to bottom; a = ADC input (ADC1), d = DAC output
  const PINS_L = [["EN"], ["VP (36)", "a"], ["VN (39)", "a"], ["D34", "a"], ["D35", "a"], ["D32", "a"], ["D33", "a"], ["D25", "d"], ["D26", "d"], ["D27"], ["D14"], ["D12"], ["D13"], ["GND"], ["VIN"]];
  const PINS_R = [["D23"], ["D22"], ["TX0"], ["RX0"], ["D21"], ["D19"], ["D18"], ["D5"], ["TX2"], ["RX2"], ["D4"], ["D2"], ["D15"], ["GND"], ["3V3"]];
  function mountMeet(el) {
    let s = `<rect class="pcb" x="120" y="34" width="140" height="426" rx="10"/><rect class="can" x="140" y="54" width="100" height="120" rx="4"/>${T(190, 108, "ESP32", "middle", "tt inv")}${T(190, 126, "ADC + DAC", "middle", "small inv")}${T(190, 142, "inside", "middle", "small inv")}`;
    s += `<rect class="usb" x="168" y="446" width="44" height="22" rx="3"/>${T(190, 486, "USB", "middle", "small")}`;
    const pin = (side, i, [name, k]) => {
      const y = 196 + i * 17.5, x = side ? 250 : 130, cls = k === "a" ? " adc" : k === "d" ? " dac" : "";
      return `<circle class="pin${cls}" cx="${x}" cy="${y}" r="5"/>${T(side ? 270 : 110, y + 4, name, side ? "start" : "end", `pinl${cls}`)}`;
    };
    PINS_L.forEach((q, i) => { s += pin(0, i, q); });
    PINS_R.forEach((q, i) => { s += pin(1, i, q); });
    s += `<path class="brk adc" d="M58,${196 + 17.5 - 6}h-6V${196 + 6 * 17.5 + 6}h6"/>${T(46, 196 + 3.5 * 17.5, "ADC in", "end", "brt adc")}${T(46, 196 + 3.5 * 17.5 + 15, "12-bit", "end", "brt adc sm")}`;
    s += `<path class="brk dac" d="M58,${196 + 7 * 17.5 - 6}h-6V${196 + 8 * 17.5 + 6}h6"/>${T(46, 196 + 7.5 * 17.5, "DAC out", "end", "brt dac")}${T(46, 196 + 7.5 * 17.5 + 15, "8-bit", "end", "brt dac sm")}`;
    el.innerHTML = `<div class="meet">
      <figure class="scene-box meet-fig"><svg class="scene meetsvg" viewBox="-4 20 372 480" role="img" aria-label="ESP32 DevKit board. The ADC input pins VP (36), VN (39), D34, D35, D32 and D33 are marked teal; the DAC output pins D25 and D26 are marked amber.">${s}</svg>
        <figcaption>ESP32 DevKit (30 pins). Teal: ADC inputs used in this course. Amber: the two DAC outputs.</figcaption></figure>
      <div class="meet-side">
        <div class="tbl-wrap"><table class="meet-tbl"><thead><tr><th></th><th class="adc">ADC</th><th class="dac">DAC</th></tr></thead><tbody>
          <tr><th>Direction</th><td>voltage → number</td><td>number → voltage</td></tr>
          <tr><th>Bits</th><td><strong>12</strong></td><td><strong>8</strong></td></tr>
          <tr><th>Codes</th><td>0 to 4095</td><td>0 to 255</td></tr>
          <tr><th>One step (3.3 V)</th><td>3.3 ÷ 4095 = 0.806 mV</td><td>3.3 ÷ 255 = 12.9 mV</td></tr>
          <tr><th>Pins</th><td>GPIO32 to GPIO39</td><td>GPIO25, GPIO26</td></tr>
          <tr><th>Arduino</th><td><code>analogRead(34)</code></td><td><code>dacWrite(25, 128)</code></td></tr>
        </tbody></table></div>
        <div class="callout info"><strong>Good to know</strong>Only the original ESP32 has a DAC: the newer ESP32-S3 and ESP32-C3 chips do not. GPIO25 and GPIO26 can also be ADC inputs, but those belong to ADC2, which stops working while Wi-Fi is on, so this course reads sensors on GPIO32 to GPIO39.</div>
      </div></div>`;
  }

  /* =====================================================================
     ADC: Vref is the ruler; Vin above Vref
     ===================================================================== */
  function mountVref(el, sec) {
    const S = { ref: 3.3, vin: 1.65 };
    el.innerHTML = `<div class="pv">${chips("Reference V<sub>ref</sub>", [["3.3", "3.3 V (ESP32)"], ["5", "5 V (Arduino Uno style)"]], "3.3")}
      <div class="slider-field"><label for="${sec.id}-v">Sensor voltage V<sub>in</sub>: <strong class="v-v">1.65 V</strong></label><input type="range" id="${sec.id}-v" min="0" max="4.8" step="0.01" value="1.65"></div>
      <figure class="scene-box vref-box"><svg class="scene vrefsvg" viewBox="0 0 412 400" role="img" aria-label="A 12-bit ADC drawn as a ruler from 0 V to Vref, with the input voltage as an arrow and the output code beside it"></svg></figure>
      <p class="pv-read"></p></div>`;
    const sv = el.querySelector("svg"), read = el.querySelector(".pv-read"), sl = el.querySelector(`#${sec.id}-v`);
    const paint = () => {
      const ref = S.ref, top = ref + 1.5, y0 = 370, y1 = 30, Y = (v) => y0 - (v / top) * (y0 - y1), over = S.vin > ref + 1e-9;
      const code = Math.round((Math.min(S.vin, ref) / ref) * 4095), danger = ref === 3.3 && S.vin > 3.6;
      // left: the input arrow; middle: the ruler; right: each tick's voltage and code; far right: the read-out
      const BX = 104, BW = 40, LX = BX + BW + 8;
      let s = `<rect class="rul" x="${BX}" y="${Y(ref)}" width="${BW}" height="${y0 - Y(ref)}" rx="3"/><rect class="rul-over" x="${BX}" y="${y1}" width="${BW}" height="${Y(ref) - y1}"/>`;
      s += `<rect class="rul-fill${over ? " full" : ""}" x="${BX}" y="${Y(Math.min(S.vin, ref))}" width="${BW}" height="${y0 - Y(Math.min(S.vin, ref))}" rx="3"/>`;
      [0, 0.25, 0.5, 0.75, 1].forEach((q) => { const y = Y(q * ref), v = +(q * ref).toFixed(3);
        s += `<line class="rtick" x1="${BX - 4}" x2="${BX + BW + 4}" y1="${y}" y2="${y}"/>${T(LX, y + 4, q === 1 ? `V<tspan class='sb' dy='3'>ref</tspan><tspan dy='-3'> = ${v} V → ${Math.round(q * 4095)}</tspan>` : `${v} V → ${Math.round(q * 4095)}`, "start", q === 1 ? "small ref-t" : "small")}`; });
      s += T(LX, y1 + 14, "no codes left here", "start", "small over-t") + T(LX, y0 + 24, "volts → code", "start", "small");
      if (ref === 3.3) s += `<line class="danger-l" x1="${BX - 4}" x2="${BX + BW + 4}" y1="${Y(3.6)}" y2="${Y(3.6)}"/>${T(LX, Y(3.6) + 4, "3.6 V: pin limit", "start", "small danger-t")}`;
      const ya = Y(S.vin);
      s += `<path class="vin-arr${over ? " over" : ""}" d="M8,${ya}H${BX - 2}m-8,-6l8,6l-8,6"/>${T(6, ya - 8, `V<tspan class='sb' dy='3'>in</tspan><tspan dy='-3'> = ${S.vin.toFixed(2)} V</tspan>`, "start", "small vin-t")}`;
      // the read-out panel
      const b = bin(code, 12), PX = 284, PC = PX + 62;
      s += `<rect class="ro" x="${PX}" y="60" width="124" height="196" rx="10"/>${T(PC, 84, "12-bit output", "middle", "small")}${T(PC, 124, `${code}`, "middle", `ro-code${over ? " over" : ""}`)}`;
      s += T(PC, 152, nib(b), "middle", "ro-bin") + T(PC, 174, `hex ${hex(code, 12)}`, "middle", "small");
      if (over) s += T(PC, 204, "stuck at the top:", "middle", "small over-t") + T(PC, 222, `${S.vin.toFixed(2)} V reads`, "middle", "small over-t") + T(PC, 240, `like ${ref} V`, "middle", "small over-t");
      else s += T(PC, 210, `${S.vin.toFixed(2)} ÷ ${ref}`, "middle", "small") + T(PC, 228, "× 4095", "middle", "small");
      if (danger) s += `<rect class="dz" x="${PX}" y="270" width="124" height="58" rx="8"/>${T(PC, 294, "⚠ above 3.6 V:", "middle", "dz-t")}${T(PC, 314, "pin can be damaged", "middle", "dz-t")}`;
      sv.innerHTML = s;
      read.innerHTML = over
        ? `V<sub>in</sub> (${S.vin.toFixed(2)} V) is above V<sub>ref</sub> (${ref} V). The ruler has run out: the ADC gives its largest code, <strong>4095</strong>, whatever the input, so the reading is wrong.${danger ? " On the ESP32, more than about 3.6 V on a pin can also <strong>destroy</strong> it." : ""}`
        : `V<sub>in</sub> = ${S.vin.toFixed(2)} V is <strong>${((S.vin / ref) * 100).toFixed(1)} %</strong> of V<sub>ref</sub>, so the code is ${(S.vin / ref).toFixed(4)} × 4095 = <strong>${code}</strong>.`;
    };
    sl.addEventListener("input", () => { S.vin = +sl.value; el.querySelector(".v-v").textContent = `${S.vin.toFixed(2)} V`; paint(); });
    pick(el, (k) => { S.ref = +k; paint(); });
    paint();
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
    extra.innerHTML = `<h4 class="sub-h">Transfer Graph</h4><div class="plot-box">${svg(A.W, A.H, "ADC output code against input voltage", g)}</div><p class="small-note">${n <= 6 ? "Each flat step is one code: every voltage inside it gives the same number." : "With this many bits the steps are too small to see: try 3 or 4 bits to see the staircase."}</p>`;
  }

  /* =====================================================================
     The fx-570MS: decimal ↔ binary ↔ hex in BASE mode (key presses from Casio's fx-570MS user's guide)
     ===================================================================== */
  // screen: [top line, main line, base indicator]; a menu screen puts its two lines in top and main
  const CASIO = {
    small: { name: "45 → binary and hex", steps: [
      { k: null, s: ["", "0.", ""], c: "Start in the normal COMP mode." },
      { k: "MODE", s: ["COMP  CMPLX", "  1      2", "menu"], c: "Press <b>MODE</b>: the first mode menu." },
      { k: "MODE", s: ["SD  REG  BASE", " 1    2    3", "menu"], c: "Press <b>MODE</b> again: BASE is number 3." },
      { k: "3", s: ["", "0.", "d"], c: "Press <b>3</b>. You are in BASE mode, in decimal (the small <b>d</b>)." },
      { k: "4", s: ["4", "0.", "d"], c: "Type the decimal number: <b>4</b>…" },
      { k: "5", s: ["45", "0.", "d"], c: "…<b>5</b>." },
      { k: "=", s: ["45", "45.", "d"], c: "Press <b>=</b>. The number is now on the screen." },
      { k: "BIN", s: ["45", "101101.", "b"], c: "Press <b>BIN</b> (the log key): 45 = <b>101101</b> in binary (<b>b</b>)." },
      { k: "HEX", s: ["45", "2d.", "h"], c: "Press <b>HEX</b> (the x⁻¹ key): 45 = <b>2D</b> in hex (<b>h</b>). The screen writes D as a small d." },
      { k: "DEC", s: ["45", "45.", "d"], c: "Press <b>DEC</b> (the x² key) to go back to decimal." }] },
    big: { name: "3000 → binary (via hex)", steps: [
      { k: null, s: ["", "0.", "d"], c: "Already in BASE mode, in decimal (MODE, MODE, 3)." },
      { k: "3", s: ["3", "0.", "d"], c: "An ESP32 ADC reading: type <b>3000</b>…" },
      { k: "0", s: ["30", "0.", "d"], c: "…" },
      { k: "0", s: ["300", "0.", "d"], c: "…" },
      { k: "0", s: ["3000", "0.", "d"], c: "…" },
      { k: "=", s: ["3000", "3000.", "d"], c: "Press <b>=</b>." },
      { k: "BIN", s: ["", "Math ERROR", ""], c: "Press <b>BIN</b>: <b>Math ERROR</b>! In BASE mode the fx-570MS shows only 10 binary digits, so the largest positive binary number is 0111111111 = <b>511</b>." },
      { k: "AC", s: ["", "0.", "b"], c: "Press <b>AC</b> to clear the error." },
      { k: "DEC", s: ["", "0.", "d"], c: "Press <b>DEC</b> to go back to decimal…" },
      { k: "3", s: ["3", "0.", "d"], c: "…type <b>3000</b> again…" },
      { k: "0", s: ["30", "0.", "d"], c: "…" },
      { k: "0", s: ["300", "0.", "d"], c: "…" },
      { k: "0", s: ["3000", "0.", "d"], c: "…" },
      { k: "=", s: ["3000", "3000.", "d"], c: "…and press <b>=</b>." },
      { k: "HEX", s: ["3000", "bb8.", "h"], c: "Press <b>HEX</b> instead: 3000 = <b>BB8</b> in hex. Hex works up to 7FFFFFFF." },
      { k: null, s: ["3000", "bb8.", "h"], c: "Now write each hex digit as 4 bits, by hand: B → 1011, B → 1011, 8 → 1000. So 3000 = <b>1011 1011 1000</b>.", hand: ["B", "B", "8"] }] },
    back: { name: "Hex 2D → decimal", steps: [
      { k: null, s: ["", "0.", "d"], c: "In BASE mode (MODE, MODE, 3)." },
      { k: "HEX", s: ["", "0.", "h"], c: "Press <b>HEX</b> first, so what you type is read as hex (<b>h</b>)." },
      { k: "2", s: ["2", "0.", "h"], c: "Type <b>2</b>…" },
      { k: "D", s: ["2d", "0.", "h"], c: "…then <b>D</b>: the hex letters A to F are on the (−), °’”, hyp, sin, cos and tan keys. D is the <b>sin</b> key." },
      { k: "=", s: ["2d", "2d.", "h"], c: "Press <b>=</b>." },
      { k: "DEC", s: ["2d", "45.", "d"], c: "Press <b>DEC</b>: hex 2D = <b>45</b>." },
      { k: "MODE", s: ["COMP  CMPLX", "  1      2", "menu"], c: "Finished? Press <b>MODE</b>…" },
      { k: "1", s: ["", "0.", ""], c: "…and <b>1</b> to go back to COMP, or your next normal calculation will go wrong." }] }
  };
  function casioSvg(stp) {
    const k = stp.k, on = (name) => (k === name ? " press" : "");
    let s = `<rect class="cb-body" x="6" y="6" width="248" height="448" rx="22"/>${T(26, 34, "fx-570MS", "start", "cb-brand")}`;
    // screen
    s += `<rect class="cb-lcd" x="22" y="46" width="216" height="74" rx="6"/>`;
    const err = stp.s[1] === "Math ERROR", menu = stp.s[2] === "menu";
    if (menu) s += T(34, 76, stp.s[0], "start", "cb-l1 big") + T(34, 106, stp.s[1], "start", "cb-l1 big");
    else {
      s += T(34, 66, stp.s[0], "start", "cb-l1") + T(err ? 34 : 214, 106, stp.s[1], err ? "start" : "end", "cb-l2");
      if (stp.s[2]) s += T(230, 82, stp.s[2], "end", "cb-ind");
    }
    // keys: MODE row, the four base keys, the hex letter keys, then the number pad
    const key = (x, y, w, face, lab, name, cls = "") => `<g class="ck${on(name)}${cls ? " " + cls : ""}"><rect x="${x}" y="${y}" width="${w}" height="24" rx="7"/>${T(x + w / 2, y + 16, face, "middle", "ckf")}${lab ? T(x + w / 2, y - 4, lab, "middle", "ckl") : ""}</g>`;
    s += key(22, 134, 48, "SHIFT", "", "", "dim") + key(78, 134, 48, "ALPHA", "", "", "dim") + key(190, 134, 48, "MODE", "", "MODE", "mode");
    s += key(22, 186, 48, "x²", "DEC", "DEC") + key(78, 186, 48, "x⁻¹", "HEX", "HEX") + key(134, 186, 48, "log", "BIN", "BIN") + key(190, 186, 48, "ln", "OCT", "OCT");
    ["(−)", "°’”", "hyp", "sin", "cos", "tan"].forEach((f, i) => { s += key(22 + i * 37, 236, 31, f, "ABCDEF"[i], "ABCDEF"[i], "sm"); });
    const pad = [["7", "8", "9", "DEL", "AC"], ["4", "5", "6", "×", "÷"], ["1", "2", "3", "+", "−"], ["0", ".", "EXP", "Ans", "="]];
    pad.forEach((row, r) => row.forEach((f, c) => { s += key(22 + c * 44, 290 + r * 38, 38, f, "", f, /\d/.test(f) ? "num" : f === "AC" || f === "DEL" ? "ac" : ""); }));
    s += T(130, 446, "Simplified: only the keys you need", "middle", "cb-note");
    return s;
  }
  function mountCasio(el) {
    const S = { ex: "small" }, SEG = 1.9;
    el.innerHTML = `<div class="pv">${chips("Example", [["small", "45 → binary and hex"], ["big", "3000 → binary (via hex)"], ["back", "Hex 2D → decimal"]], "small")}
      <div class="cs-grid"><figure class="scene-box cs-fig"><svg class="scene casio" viewBox="0 0 260 460" role="img" aria-label="A simplified fx-570MS calculator showing each key press"></svg></figure>
      <div class="cs-side"><div class="cs-cap" aria-live="polite"></div><div class="cs-hand"></div>
        <div class="jr-nav"><button type="button" class="btn ghost cs-prev">‹ Back</button><span class="cs-at"></span><button type="button" class="btn ghost cs-next">Next key ›</button></div>
        <ol class="cs-list"></ol></div></div>
      <div class="pv-pl"></div></div>`;
    const sv = el.querySelector("svg"), cap = el.querySelector(".cs-cap"), list = el.querySelector(".cs-list"), hand = el.querySelector(".cs-hand"), at = el.querySelector(".cs-at");
    const steps = () => CASIO[S.ex].steps, dur = () => steps().length * SEG;
    const keyName = (k) => ({ BIN: "BIN (log)", HEX: "HEX (x⁻¹)", DEC: "DEC (x²)", D: "D (sin)" }[k] || k);
    const draw = (t) => {
      const st = steps(), i = Math.min(st.length - 1, Math.floor(t / SEG)), cur = st[i];
      sv.innerHTML = casioSvg(cur);
      cap.innerHTML = `<span class="cs-n">${cur.k ? `Press ${esc(keyName(cur.k))}` : "Screen"}</span>${cur.c}`;
      hand.innerHTML = cur.hand ? `<div class="hexbits">${cur.hand.map((h) => `<div><b>${h}</b><span>${bin(parseInt(h, 16), 4)}</span></div>`).join("")}</div>` : "";
      at.textContent = `${i + 1} of ${st.length}`;
      list.innerHTML = st.filter((q) => q.k).map((q) => `<li class="${q === cur ? "on" : st.indexOf(q) < i ? "done" : ""}">${esc(keyName(q.k))}</li>`).join("");
      el.querySelector(".cs-prev").disabled = i === 0;
      el.querySelector(".cs-next").disabled = i === st.length - 1;
    };
    let pl = null;
    const make = () => { pl = player(el.querySelector(".pv-pl"), el, { dur: dur(), hold: 2.5, draw, still: dur(), auto: false, label: "Key press position", clock: (t) => `key ${Math.min(steps().length, Math.floor(t / SEG) + 1)}` }); };
    make();
    const go = (d) => { pl.pause(); const i = clamp(Math.floor(Math.min(pl.t, dur() - 0.01) / SEG) + d, 0, steps().length - 1); pl.set(i * SEG + 0.5); };
    el.querySelector(".cs-prev").addEventListener("click", () => go(-1));
    el.querySelector(".cs-next").addEventListener("click", () => go(1));
    pick(el, (k) => { S.ex = k; make(); pl.set(0); });
  }

  /* =====================================================================
     Real situation: an ESP32 reading an LM35 temperature sensor
     ===================================================================== */
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
    const c = pvCard(el, "", `${codeBlock(LM35, "ESP32: reading an LM35")}<div class="callout info"><strong>Good to know</strong>The common LM35DZ measures <strong>0 to 100 °C</strong>, so its output is at most 1.0 V, well inside the ADC's 3.3 V. Other versions reach further: the LM35 and LM35A go from −55 to 150 °C (below about 2 °C they need a negative supply) and the LM35C from −40 to 110 °C. The LM35 needs at least 4 V, so power it from the board's 5 V (VIN) pin. The ESP32's ADC is not perfectly linear near 0 V and near 3.3 V, and <code>analogReadMilliVolts()</code> uses the chip's factory calibration for a better reading.</div>`);
    const R = 3.3 / 4095, tOf = (t) => 50 - 50 * Math.cos((TAU * t) / 12);
    const draw = (t) => {
      const T0 = tOf(t), v = T0 * 0.01, code = Math.round(v / R), back = (code * R) / 0.01;
      let s = `<rect class="lm" x="30" y="90" width="44" height="40" rx="4"/><path class="lm" d="M30,90A22,22 0 0 1 74,90Z"/>${T(52, 116, "LM35", "middle", "small inv")}`;
      s += `<path class="w" d="M40,130V160M52,130V160M64,130V160"/>${T(58, 184, "out", "start", "small")}`;
      const th = 8 + (T0 / 100) * 70;
      s += `<rect class="tube" x="10" y="10" width="10" height="80" rx="5"/><rect class="merc" x="12.5" y="${88 - th}" width="5" height="${th}"/>${T(24, 16, `${T0.toFixed(1)} °C`, "start", "tt")}`;
      s += D.wire([52, 160], [52, 196], [150, 196], [150, 130]) + T(100, 212, `${(v * 1000).toFixed(0)} mV`, "middle", "small");
      s += `<rect class="espbig" x="120" y="60" width="90" height="70" rx="8"/>${T(165, 90, "ESP32", "middle", "tt inv")}${T(165, 110, "ADC GPIO34", "middle", "small inv")}`;
      s += `<rect class="meter" x="222" y="40" width="100" height="100" rx="8"/><rect class="lcd" x="228" y="48" width="88" height="26" rx="4"/>${T(272, 66, `code ${code}`, "middle", "lcdt sm")}<rect class="lcd" x="228" y="80" width="88" height="26" rx="4"/>${T(272, 98, `${back.toFixed(1)} °C`, "middle", "lcdt sm")}${T(272, 128, "Serial Monitor", "middle", "small")}`;
      c.scene.innerHTML = svg(330, 225, `LM35 at ${T0.toFixed(1)} °C gives ${(v * 1000).toFixed(0)} mV, ESP32 code ${code}`, s, "scene");
      const A = axes({ x: [0, 100], y: [0, 1300], xt: [0, 25, 50, 75, 100], yt: [0, 400, 800, 1200], xl: "Temperature (°C)", yl: "ADC code" });
      c.graph.innerHTML = svg(A.W, A.H, "ESP32 ADC code against temperature", A.s + poly(curve(A, (x) => (x * 0.01) / R, 0, 100, 4), "trace-a") + dot(A.X(T0), A.Y(code)) + label(A.X(T0) + (T0 > 60 ? -8 : 8), A.Y(code) - 10, `${code}`, T0 > 60 ? "end" : "start"));
      c.read.innerHTML = `${T0.toFixed(1)} °C → LM35 gives ${(v * 1000).toFixed(0)} mV → code = ${v.toFixed(3)} V ÷ ${(R * 1000).toFixed(4)} mV = <strong>${code}</strong> → back to ${back.toFixed(1)} °C. One ADC step (0.806 mV) is less than 0.1 °C, so 12 bits are plenty here.`;
    };
    player(c.pl, el, { dur: 12, hold: 0, draw, still: 3, label: "Temperature position", clock: (t) => `${tOf(t).toFixed(0)} °C` });
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
      <p class="small-note">Tap a switch in the circuit to change a bit, or press play to count through every code.</p>`, fold("Step-by-Step Working", `<ol class="steps"></ol>`));
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

  /* =====================================================================
     DAC 2: R-2R ladder
     ===================================================================== */
  function r2rSvg(code, VH, sw) {
    let s = D.res(40, 70, 40, 150) + D.gnd(40, 150) + T(26, 114, "2R", "end", "small");
    const xs = [120, 220, 320, 420];
    s += D.wire([40, 70], [80, 70]);
    xs.forEach((x, b) => {
      const on = (code >> b) & 1;
      s += (b === 0 ? D.wire([80, 70], [x, 70]) : D.res(xs[b - 1], 70, x, 70)) + D.dot(x, 70);
      if (b > 0) s += T((xs[b - 1] + x) / 2, 58, "R", "middle", "small");
      s += D.res(x, 70, x, 160) + T(x + 12, 118, "2R", "start", "small");
      s += `<g class="sw${on ? " on" : ""}" data-b="${b}"${sw ? ` tabindex="0" role="button" aria-pressed="${!!on}" aria-label="D${b} ${on ? "on" : "off"}"` : ""}><rect class="swbox" x="${x - 33}" y="172" width="66" height="24" rx="12"/>${T(x - 13, 189, `D${b}`, "middle", "tt")}<circle class="swdot" cx="${on ? x + 19 : x + 7}" cy="184" r="8"/></g>`;
      s += D.wire([x, 160], [x, 172]) + T(x, 214, on ? `V<tspan class='sb' dy='3'>H</tspan><tspan dy='-3'>${VH ? ` = ${VH} V` : ""}</tspan>` : "0 V", "middle", "small");
    });
    s += D.wire([420, 70], [460, 70]) + D.opamp(460, 90, true) + D.wire([540, 90], [548, 90]) + D.term(552, 90);
    s += D.wire([460, 110], [452, 110], [452, 136], [548, 136], [548, 90]) + T(500, 150, "buffer (×1)", "middle", "small");
    s += T(40, 244, "LSB end", "middle", "small") + T(420, 244, "MSB end", "middle", "small");
    return s;
  }
  function mountR2R(el) {
    const S = { code: 0b1010, VH: 5 };
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene r2r" viewBox="0 0 560 250" role="img" aria-label="Four-bit R-2R ladder DAC"></svg></div><figcaption>Tap a switch to change a bit. A 1 connects that 2R leg to V<sub>H</sub> (logic HIGH), a 0 to 0 V. Only two resistor values are used: R and 2R.</figcaption></figure><p class="pv-read"></p>${fold("Step-by-Step Working", `<ol class="steps"></ol>`)}</div>`;
    const sv = el.querySelector("svg"), read = el.querySelector(".pv-read"), steps = el.querySelector(".steps");
    const fmt = (v) => v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    const paint = () => {
      const code = S.code, v = (S.VH * code) / 16;
      sv.innerHTML = r2rSvg(code, S.VH, true) + `<text x="552" y="34" text-anchor="end">${sub("V", "out")} = </tspan><tspan class="val">${fmt(v)} V</tspan></text>`;
      sv.querySelectorAll(".sw").forEach((g) => { const tog = () => { S.code ^= 1 << +g.dataset.b; paint(); }; g.addEventListener("click", tog); g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } }); });
      read.innerHTML = `Input <strong>${bin(code, 4)}</strong> (decimal ${code}): V<sub>out</sub> = ${S.VH} V × ${code} ÷ 16 = <strong>${fmt(v)} V</strong>. Each bit's share is halved at every node on its way to the output, so D3 counts ½, D2 ¼, D1 ⅛ and D0 1/16.`;
      steps.innerHTML = stepsHtml([
        step("R-2R ladder output (N bits, buffered)", "V<sub>out</sub> = V<sub>H</sub> × (D<sub>N−1</sub>/2 + D<sub>N−2</sub>/4 + … + D<sub>0</sub>/2<sup>N</sup>) = V<sub>H</sub> × code ÷ 2<sup>N</sup>", `= ${S.VH} × ${code} ÷ 16`, `V<sub>out</sub> = ${v.toFixed(4)} V`),
        step("Step size (1 LSB)", "V<sub>H</sub> ÷ 2<sup>N</sup>", `= ${S.VH} ÷ 16`, `${(S.VH / 16).toFixed(4)} V; full scale (1111) = ${((S.VH * 15) / 16).toFixed(4)} V`),
        step("Why engineers prefer it", "", "", "An 8-bit binary-weighted DAC needs 8 precise values from R to 128R; an R-2R ladder of any size needs only R and 2R, which are easy to match on a chip.")]);
    };
    paint();
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
     Inside an ADC: counter (ramp) vs successive approximation
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
     Sections
     ===================================================================== */
  const SECTIONS = [
    { id: "journey", group: "intro", title: "Analog to Digital and Back Again", toc: "The Journey",
      intro: `<p>Electronic data conversion lets an analog signal be kept in digital form, and the digital data later rebuild the analog signal.</p>
        <p>For example, a song from a microphone is turned into numbers and kept on a pendrive, a phone or the cloud. Later the numbers are turned back into a voltage, and a speaker plays the song again.</p>
        <ul class="tight"><li><strong>ADC</strong> (analog-to-digital converter): voltage → numbers.</li><li><strong>DAC</strong> (digital-to-analog converter): numbers → voltage.</li><li><strong>Data acquisition</strong>: gathering information about a system or process. In modern instruments that means measuring with an ADC.</li></ul>
        <p>Follow one sound through all 7 steps: press play, or use <strong>Next step</strong>.</p>`,
      mount: mountJourney },
    { id: "bits", group: "codes", title: "Bits, Words and Codes", toc: "Digital Codes",
      intro: `<p>A digital code has two states, sent as <strong>logic 0</strong> (0 V) and <strong>logic 1</strong> (3.3 V or 5 V).</p>
        <p>A group of bits is a <strong>word</strong>, normally 8 to 64 bits long. An n-bit word has <strong>2<sup>n</sup></strong> combinations:</p>
        <div class="eg"><span class="eg-h">Example</span>4 bits → 2<sup>4</sup> = 16 combinations, from 0 to 15.</div>
        <p>Positive-only (unipolar) signals use:</p>
        <ul class="tight"><li><strong>straight binary</strong>,</li><li><strong>binary-coded decimal (BCD)</strong>: each decimal digit gets its own 4 bits,</li><li><strong>hexadecimal (HEX)</strong>: each group of 4 bits becomes one digit, 0 to 9 then A to F.</li></ul>
        <p>Signals with both signs (bipolar) use 1s complement, 2s complement, offset binary or sign-magnitude codes. Tap the bits below.</p>`,
      mount: mountBits },
    { id: "meet", group: "esp", title: "Meet the ESP32's Converters", toc: "ESP32 Converters",
      intro: `<p>The ESP32 board you use in the labs has <strong>both</strong> kinds of converter inside: an <strong>ADC</strong> to read sensors and a <strong>DAC</strong> to make a voltage. The rest of this chapter explains how each one works, and comes back to these two real ones.</p>`,
      mount: mountMeet },
    { id: "vref", group: "adc", title: "V<sub>ref</sub>: The ADC's Ruler", toc: "What Vref Means",
      intro: `<p>An ADC doesn't measure volts by itself. It compares the input V<sub>in</sub> with a known voltage, the <strong>reference voltage V<sub>ref</sub></strong>, and tells you what fraction of V<sub>ref</sub> the input is.</p>
        <p>Think of V<sub>ref</sub> as the <strong>length of a ruler</strong> marked with 2<sup>n</sup> − 1 equal steps. V<sub>in</sub> is the thing being measured against it:</p>
        <p class="formula">code = (V<sub>in</sub> ÷ V<sub>ref</sub>) × (2<sup>n</sup> − 1)</p>
        <ul class="where"><li>V<sub>in</sub>: the sensor's voltage (it changes)</li><li>V<sub>ref</sub>: the full length of the ruler (fixed: 3.3 V on the ESP32)</li><li>n: the number of bits (12 on the ESP32, so 2<sup>12</sup> − 1 = 4095)</li></ul>
        <h4 class="sub-h">Why V<sub>in</sub> Must Not Go Above V<sub>ref</sub></h4>
        <ol class="tight"><li><strong>There is no code left.</strong> V<sub>in</sub> = V<sub>ref</sub> already gives the largest code (4095, all 1s). Anything higher also reads 4095, so 3.3 V and 4 V look the same: the reading <em>clips</em>, like an op-amp saturating in Chapter 5.</li>
        <li><strong>It can damage the chip.</strong> Above the pin's limit (about 3.6 V on the ESP32) the input's protection conducts and the pin can be destroyed. A 5 V sensor needs a voltage divider (Chapter 4) first.</li></ol>
        <p>Move V<sub>in</sub> past V<sub>ref</sub> below and watch the code.</p>`,
      mount: mountVref },
    { id: "adccalc", group: "adc", title: "ADC Resolution and Output Code", toc: "Resolution and Code",
      intro: `<p>The <strong>resolution</strong> (step size) is the smallest voltage change the ADC can detect: one step of the ruler.</p>
        <p class="formula">R = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1)</p>
        <div class="eg"><span class="eg-h">Example</span>A 5 V, 8-bit ADC:<br>R = 5 ÷ 255 = <strong>19.6 mV</strong>.<br>Every 19.6 mV adds 1 to the output number.</div>
        <p>The digital output is the input divided by one step, rounded to a whole number:</p>
        <p class="formula">code = V<sub>in</sub> ÷ R</p>
        <div class="eg"><span class="eg-h">Example</span>The same ADC with V<sub>in</sub> = 2.94 V:<br>code = 2.94 V ÷ 19.6 mV = <strong>150</strong>.</div>
        <p>Going the other way, from a reading back to the voltage:</p>
        <p class="formula">V<sub>in</sub> = code × R</p>`,
      inputs: [F("n", "num", 12, "8 to 16 is typical", { unit: "bits", positive: true, label: "Number of bits n", name: "n", validate: (x) => (x !== Math.round(x) || x > 24 ? "Enter a whole number up to 24." : "") }),
        F("Vref", "num", 3.3, null, { unit: "V", positive: true, label: "Reference V<sub>ref</sub>", name: "Vref" }),
        F("Vin", "num", 2, null, { unit: "V", positive: false, label: "Input V<sub>in</sub>", name: "Vin", validate: (x) => (x < 0 ? "Enter 0 or more." : "") })],
      view: "0 0 440 200", diagram: adcDiagram, render: adcRender, caption: "The output bits follow your values.",
      compute(v) { if (v.Vin > v.Vref) return Object.assign(adcCompute(Object.assign({}, v, { Vin: v.Vref })), { notes: [{ type: "warn", title: "Input above V<sub>ref</sub>", html: `The ADC can't read more than V<sub>ref</sub>: it just gives its largest code, ${2 ** Math.round(v.n) - 1}.` }] }); return adcCompute(v); },
      after: `<div class="callout info"><strong>Good to know</strong>Some books and datasheets define the step as V<sub>ref</sub> ÷ 2<sup>n</sup> instead of V<sub>ref</sub> ÷ (2<sup>n</sup> − 1). For 8 bits or more the difference is tiny; this course uses V<sub>ref</sub> ÷ (2<sup>n</sup> − 1).</div>` },
    { id: "casio", group: "adc", title: "Converting with the Calculator (fx-570MS)", toc: "Using the fx-570MS",
      intro: `<p>The fx-570MS converts between decimal, binary and hexadecimal in its <strong>BASE</strong> mode. In BASE mode the keys with the small labels <strong>DEC</strong>, <strong>HEX</strong>, <strong>BIN</strong> and <strong>OCT</strong> beside them switch the number system. Choose an example and step through the key presses.</p>`,
      mount: mountCasio,
      after: `<div class="callout info"><strong>Good to know</strong><ul class="tight"><li>BASE mode works with <b>whole numbers only</b>.</li><li>Binary is limited to 10 digits: the largest positive binary number is 0111111111 = <b>511</b>. For bigger numbers (most 12-bit ADC readings) convert to <b>hex</b>, then write each hex digit as 4 bits by hand.</li><li>The calculator does not do <b>BCD</b>: write each decimal digit as 4 bits yourself.</li><li>Go back to COMP (<b>MODE</b>, <b>1</b>) when you finish, or your next normal calculation will go wrong.</li></ul></div>` },
    { id: "lm35", group: "adc", title: "Real Situation: An ESP32 Thermometer", toc: "ESP32 Thermometer",
      intro: `<p>The ESP32's ADC is 12-bit with V<sub>ref</sub> = 3.3 V:</p>
        <div class="eg">codes 0 to 4095<br>R = 3.3 ÷ 4095 = <strong>0.806 mV</strong></div>
        <p>An LM35 temperature sensor gives <strong>10 mV per °C</strong>. Watch the temperature change and follow the numbers.</p>`,
      mount: mountLm35 },
    { id: "weighted", group: "dac", title: "DAC 1: The Binary-Weighted Resistor DAC", toc: "Binary-Weighted DAC",
      intro: `<p>A DAC takes a binary number and gives out an analog voltage (or current) that the next analog circuit can use. The binary-weighted DAC has three parts:</p>
        <ol class="tight"><li>a network of <strong>precision binary-weighted resistors</strong>,</li><li>a <strong>current-to-voltage converter</strong> (an op-amp with R<sub>f</sub>),</li><li>a <strong>×1 inverter</strong>.</li></ol>
        <p>For an N-bit DAC, bit n gets the resistor (D0 is the least significant bit, the LSB):</p>
        <p class="formula">R<sub>n</sub> = 2<sup>N − 1 − n</sup> R</p>
        <div class="eg"><span class="eg-h">Example</span>N = 8 and R = 1 kΩ:
          <div class="tbl-wrap"><table class="eg-tbl"><tr><th>Bit</th><td>D7 (MSB)</td><td>D6</td><td>D5</td><td>…</td><td>D1</td><td>D0 (LSB)</td></tr><tr><th>Resistor</th><td>1 kΩ</td><td>2 kΩ</td><td>4 kΩ</td><td>…</td><td>64 kΩ</td><td>128 kΩ</td></tr></table></div>
          The MSB gets the smallest resistor, so it carries the most current.</div>
        <p>The currents add at point A (a virtual ground), and their sum equals the current through R<sub>f</sub>:</p>
        <p class="formula">D<sub>0</sub>/R<sub>0</sub> + D<sub>1</sub>/R<sub>1</sub> + … + D<sub>N−1</sub>/R<sub>N−1</sub> = (0 − V<sub>A</sub>) ÷ R<sub>f</sub></p>
        <ul class="where"><li>D<sub>n</sub>: the bit's voltage, logic HIGH (e.g. 5 V) or 0 V</li><li>V<sub>A</sub>: the op-amp's output (negative)</li></ul>
        <p>The inverter makes the output positive:</p>
        <p class="formula">V<sub>out</sub> = R<sub>f</sub> × (D<sub>0</sub>/R<sub>0</sub> + … + D<sub>N−1</sub>/R<sub>N−1</sub>)</p>`,
      mount: mountWeighted },
    { id: "r2r", group: "dac", title: "DAC 2: The R-2R Ladder", toc: "R-2R Ladder",
      intro: `<p>The second type of DAC uses a ladder of only <strong>two resistor values, R and 2R</strong>, however many bits there are.</p>
        <p>Each bit's switch connects its 2R leg to <strong>V<sub>H</sub></strong> (for a 1) or to 0 V (for a 0). Every node in the ladder halves the share of the bits behind it, so the MSB counts ½, the next bit ¼, and so on:</p>
        <p class="formula">V<sub>out</sub> = V<sub>H</sub> × code ÷ 2<sup>N</sup></p>
        <ul class="where"><li>V<sub>H</sub>: the logic HIGH voltage, the voltage a 1 bit connects to (5 V on 5 V logic, 3.3 V on the ESP32). It sets the DAC's full scale, like V<sub>ref</sub> for an ADC.</li><li>code: the input in decimal; N: the number of bits</li></ul>
        <div class="eg"><span class="eg-h">Example</span>4 bits, V<sub>H</sub> = 5 V:<br>MSB only (1000 = 8): 5 × 8 ÷ 16 = <strong>2.5 V</strong>, half of V<sub>H</sub><br>All 1s (1111 = 15): 5 × 15 ÷ 16 = <strong>4.6875 V</strong>, one step short of V<sub>H</sub></div>`,
      mount: mountR2R,
      after: `<div class="callout warn"><strong>Common mistake</strong>Two formulas look alike but divide by different numbers. The R-2R DAC divides by <strong>2<sup>N</sup></strong> (V<sub>out</sub> = V<sub>H</sub> × code ÷ 2<sup>N</sup>); the ADC resolution divides by <strong>2<sup>n</sup> − 1</strong> (R = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1)).</div>
        <div class="callout info"><strong>Which DAC is inside the ESP32?</strong>Espressif does not publish the ESP32 DAC's inner circuit. It is not binary-weighted: 8 bits would need precise resistors from R to 128R, which are hard to make on a chip, so binary-weighted DACs are rare in ICs. Chip DACs use designs with one or two resistor values, such as the R-2R ladder or a resistor string. Whichever is inside, you use the ESP32's own formula: V<sub>out</sub> = 3.3 V × code ÷ 255.</div>` },
    { id: "esp32dac", group: "dac", title: "Real Situation: Making a Sound with the ESP32's DAC", toc: "ESP32 DAC",
      intro: `<p>The ESP32 has two 8-bit DACs, on GPIO25 and GPIO26 (<code>dacWrite</code> from Chapter 2):</p>
        <p class="formula">V<sub>out</sub> = 3.3 V × code ÷ 255</p>
        <p>Sending a table of codes one after another makes a waveform, such as a tone for a speaker. The number of bits decides how smooth it is.</p>`,
      mount: mountSine },
    { id: "adcrace", group: "inside", title: "How an ADC Finds the Number: Counter vs Successive Approximation", toc: "Counter vs SAR",
      intro: `<p>Now that you know the DAC, here is how many ADCs work inside: they <strong>guess with a DAC</strong>. A <strong>comparator</strong> compares the DAC's output with the input signal.</p>
        <ul class="tight"><li><strong>Counter (ramp) ADC</strong>: the digital input goes up one step at a time until the DAC output equals or passes the input. The comparator then stops the conversion, and the last digital input is the answer.</li>
        <li><strong>Successive-approximation (SAR) ADC</strong>: much faster. It tests one bit at a time, from the MSB down.</li></ul>
        <p>Other types include flash and dual-slope ADCs. Try both below with a 5-bit ADC (0.1 V per step).</p>`,
      mount: mountAdcRace }
  ];

  /* =====================================================================
     Exercise figures
     ===================================================================== */
  const FIG = {
    bits8: () => { let s = ""; for (let i = 0; i < 8; i++) { const b = 7 - i, x = 10 + i * 46; s += `<rect class="xcell" x="${x}" y="20" width="40" height="36" rx="5"/>${T(x + 20, 44, "?", "middle", "tt")}${T(x + 20, 72, `D${b}`, "middle", "small")}${T(x + 20, 88, `${2 ** b}`, "middle", "small")}`; } return xfig(380, 96, "Eight empty bit boxes, D7 (weight 128) on the left to D0 (weight 1) on the right", s); },
    adc: (bits, ref, inLab, outLab) => { let s = `${D.term(20, 60)}${T(20, 42, inLab, "start", "small")}` + D.wire([24, 60], [100, 60]) + `<rect class="adc" x="100" y="24" width="110" height="72" rx="8"/>${T(155, 56, `${bits}-bit ADC`, "middle", "tt inv")}${T(155, 76, `V<tspan class='sb' dy='3'>ref</tspan><tspan dy='-3'> = ${ref}</tspan>`, "middle", "small inv")}`; for (let i = 0; i < 5; i++) s += D.wire([210, 40 + i * 10], [260, 40 + i * 10]); s += T(266, 64, outLab, "start", "small"); return xfig(390, 110, `${bits}-bit ADC with Vref ${ref}`, s); },
    casioErr: () => xfig(300, 120, "Calculator screen showing Math ERROR after pressing BIN", `<rect class="cb-lcd" x="10" y="10" width="280" height="70" rx="6"/>${T(24, 32, "2748", "start", "cb-l1")}${T(24, 66, "Math ERROR", "start", "cb-l2")}${T(150, 104, "after pressing BIN", "middle", "small")}`),
    above: () => { let s = `<rect class="bx" x="10" y="30" width="90" height="56" rx="8"/>${T(55, 54, "sensor", "middle", "tt")}${T(55, 74, "0 to 5 V", "middle", "small")}` + D.wire([100, 58], [190, 58]) + T(145, 50, "V<tspan class='sb' dy='3'>in</tspan>", "middle", "small"); s += `<rect class="espbig" x="190" y="20" width="120" height="76" rx="8"/>${T(250, 50, "ESP32", "middle", "tt inv")}${T(250, 70, "12-bit, 3.3 V", "middle", "small inv")}${T(250, 86, "GPIO34", "middle", "small inv")}`; return xfig(320, 104, "A sensor giving 0 to 5 V wired straight to an ESP32 ADC pin", s); },
    lm: () => { let s = `<rect class="lm" x="20" y="40" width="40" height="36" rx="4"/><path class="lm" d="M20,40A20,20 0 0 1 60,40Z"/>${T(40, 64, "LM35", "middle", "small inv")}` + D.wire([60, 58], [150, 58]) + T(105, 50, "10 mV/°C", "middle", "small"); s += `<rect class="espbig" x="150" y="20" width="120" height="76" rx="8"/>${T(210, 50, "ESP32", "middle", "tt inv")}${T(210, 70, "12-bit, 3.3 V", "middle", "small inv")}${T(210, 86, "GPIO34", "middle", "small inv")}`; return xfig(290, 104, "LM35 temperature sensor connected to an ESP32 ADC pin", s); },
    race: () => { let s = ""; [["Counter ADC", "counts 1 step per tick"], ["SAR ADC", "1 bit per tick"]].forEach(([a, b], i) => { const x = 10 + i * 180; s += `<rect class="adc" x="${x}" y="30" width="150" height="56" rx="8"/>${T(x + 75, 56, a, "middle", "tt inv")}${T(x + 75, 74, `8-bit · ${b}`, "middle", "small inv")}`; }); s += T(180, 18, "both clocked at 1 MHz (1 step = 1 µs)", "middle", "small"); return xfig(360, 96, "An 8-bit counter ADC and an 8-bit SAR ADC, both with a 1 MHz clock", s); },
    dac5: () => { let s = ""; for (let b = 0; b < 5; b++) { const y = 30 + b * 34; s += T(20, y + 5, `D${b}`, "middle", "tt") + D.term(38, y) + D.wire([42, y], [60, y]) + D.res(60, y, 140, y) + T(100, y - 11, `R<tspan class="sb" dy="3">${b}</tspan>`, "middle", "small") + D.wire([140, y], [170, y]) + D.dot(170, y); }
      const ym = 98;
      s += D.wire([170, 30], [170, 166]) + D.wire([170, ym], [240, ym]) + D.dot(214, ym) + D.opamp(240, ym + 20, false) + D.wire([240, ym + 40], [228, ym + 40], [228, ym + 58]) + D.gnd(228, ym + 58);
      s += D.wire([214, ym], [214, ym - 56], [248, ym - 56]) + D.res(248, ym - 56, 308, ym - 56) + D.wire([308, ym - 56], [338, ym - 56], [338, ym + 20]) + T(278, ym - 68, `R<tspan class="sb" dy="3">f</tspan>`, "middle", "small");
      s += D.wire([320, ym + 20], [360, ym + 20]) + `<rect class="inv-box" x="360" y="${ym}" width="62" height="40" rx="6"/>${T(391, ym + 25, "× (−1)", "middle", "tt")}` + D.wire([422, ym + 20], [446, ym + 20]) + D.term(450, ym + 20) + T(450, ym + 46, "V<tspan class='sb' dy='3'>out</tspan>", "middle", "small");
      return xfig(470, 200, "Five-bit binary-weighted DAC: inputs D0 to D4 through resistors R0 to R4 into a current-to-voltage converter with feedback resistor Rf, followed by a times minus one inverter", s, "wide"); },
    r2r: () => xfig(560, 250, "Four-bit R-2R ladder DAC with the switches set to 1010 and a buffer at the output", r2rSvg(0b1010, 0, false), "wide"),
    espdac: () => { let s = `<rect class="espbig" x="10" y="20" width="120" height="76" rx="8"/>${T(70, 50, "ESP32", "middle", "tt inv")}${T(70, 70, "8-bit DAC", "middle", "small inv")}${T(70, 86, "GPIO25", "middle", "small inv")}` + D.wire([130, 58], [200, 58]) + `<circle class="bx" cx="230" cy="58" r="28"/>${T(230, 64, "V", "middle", "tt")}` + D.wire([258, 58], [280, 58], [280, 100], [230, 100], [230, 86]); s += T(165, 50, "dacWrite(25, 200)", "middle", "small"); return xfig(300, 112, "ESP32 DAC pin GPIO25 connected to a voltmeter", s); },
    chain: () => { const B = [["🎤", "mic"], ["?", ""], ["ESP32", ""], ["?", ""], ["🔊", "speaker"]]; let s = ""; B.forEach(([a, b], i) => { const x = 8 + i * 74; s += `<rect class="${a === "?" ? "xq" : "bx"}" x="${x}" y="24" width="58" height="44" rx="8"/>${T(x + 29, 52, a, "middle", "tt")}${b ? T(x + 29, 86, b, "middle", "small") : ""}`; if (i < 4) s += `<path class="jarr" d="M${x + 60},46h12m-4,-4l4,4l-4,4"/>`; }); return xfig(380, 96, "A chain: microphone, unknown box, ESP32, unknown box, speaker", s); }
  };

  /* =====================================================================
     Exercises: codes, ADC (most), DAC, then how an ADC works inside
     ===================================================================== */
  const W_ = (list) => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml(list)}</ol></div>`;
  const EXERCISES = [
    { id: "c6-q1", title: "Exercise 1: Binary, Hex and BCD",
      q: `<p>Write the decimal number <strong>45</strong> in other codes.</p>`, fig: FIG.bits8,
      ans: [{ l: "Straight binary", u: "", v: 101101, tol: 0 }, { l: "Hexadecimal", opts: ["2D", "45", "D2", "2B"], v: 0 }, { l: "BCD", opts: ["0100 0101", "0010 1101", "0101 0100", "0100 1011"], v: 0 }],
      hints: [`45 = 32 + 8 + 4 + 1. Write a 1 for each power of 2 used.`, `For hex split the binary into groups of 4 from the right; for BCD code each decimal digit (4 and 5) separately.`],
      working: () => W_([step("Binary", "45 = 32 + 8 + 4 + 1", "", "<strong>101101</strong>"), step("Hex", "0010 1101 → 2 and D (13)", "", "<strong>2D</strong>"), step("BCD", "4 → 0100, 5 → 0101", "", "<strong>0100 0101</strong>")]) },
    { id: "c6-q2", title: "Exercise 2: Word Length",
      q: `<p>An ADC produces <strong>10-bit</strong> words.</p>`, fig: () => FIG.adc(10, "5 V", "V<tspan class='sb' dy='3'>in</tspan>", "10 bits: D0 to D9"),
      ans: [{ l: "Number of different codes", u: "", v: 1024, tol: 0 }, { l: "Largest code (decimal)", u: "", v: 1023, tol: 0 }],
      hints: [`n bits give 2<sup>n</sup> combinations.`, `Counting starts at 0.`],
      working: () => W_([step("Combinations", "2<sup>10</sup>", "", "<strong>1024</strong>"), step("Largest", "2<sup>10</sup> − 1", "", "<strong>1023</strong> (11 1111 1111)")]) },
    { id: "c6-q13", title: "Exercise 3: Big Numbers on the fx-570MS",
      q: `<p>An ESP32 reads <strong>2748</strong>. You type 2748 in BASE mode (decimal), press <strong>=</strong>, then <strong>BIN</strong>, and the calculator shows Math ERROR.</p>`, fig: FIG.casioErr,
      ans: [{ l: "Why Math ERROR?", opts: ["In BASE mode the fx-570MS shows binary only up to 0111111111 (511)", "The calculator cannot do binary at all", "2748 is not a whole number", "BASE mode needs the number in hex first"], v: 0 },
        { l: "2748 in hexadecimal", opts: ["ABC", "CBA", "AB4", "10BC"], v: 0 },
        { l: "2748 in binary (no spaces)", u: "", v: 101010111100, tol: 0 }],
      hints: [`What is the biggest number that fits in 10 binary digits, with the first one 0?`, `Press HEX instead of BIN, then write each hex digit as 4 bits (A = 10, B = 11, C = 12).`],
      working: () => W_([step("Why the error", "10 binary digits, first one 0 for positive", "0111111111 = 511", "2748 > 511, so <strong>Math ERROR</strong>"), step("Hex on the calculator", "2748 = then HEX", "", "<strong>ABC</strong>"), step("Hex → binary by hand", "A → 1010, B → 1011, C → 1100", "", "<strong>1010 1011 1100</strong>")]) },
    { id: "c6-q7", title: "Exercise 4: A 15-Bit ADC",
      q: `<p>A microcontroller reads a sensor with a <strong>15-bit</strong> ADC whose reference is <strong>V<sub>ref</sub> = 10 V</strong>.</p>`, fig: () => FIG.adc(15, "10 V", "sensor V<tspan class='sb' dy='3'>in</tspan>", "15-bit code"),
      ans: [{ l: "(i) The smallest voltage change it can detect (resolution)", u: "mV", v: 0.3052 }, { l: "(ii) The digital output when the sensor gives 7.94 V", u: "", v: 26017, tol: 1 }, { l: "(iii) The input voltage when the ADC reading is 2000", u: "V", v: 0.6104 }],
      hints: [`Resolution R = V<sub>ref</sub> ÷ (2<sup>n</sup> − 1), with 2<sup>15</sup> = 32768.`, `code = V<sub>in</sub> ÷ R, rounded; going back, V<sub>in</sub> = reading × R.`],
      working: () => W_([step("(i) Resolution", "R = 10 ÷ (2<sup>15</sup> − 1)", "= 10 ÷ 32767", "<strong>0.305 mV</strong>"), step("(ii) Digital output", "7.94 V ÷ 0.305185 mV", "= 26017.0", "<strong>26017</strong>"), step("(iii) Input voltage", "2000 × 0.305185 mV", "", "<strong>0.610 V</strong>")]) },
    { id: "c6-q14", title: "Exercise 5: Input Above V<sub>ref</sub>",
      q: `<p>A sensor that gives <strong>0 to 5 V</strong> is wired straight to an ESP32 ADC pin (12-bit, V<sub>ref</sub> = 3.3 V).</p>`, fig: FIG.above,
      ans: [{ l: "The reading when the sensor gives 2.0 V", u: "", v: 2482, tol: 1 }, { l: "The reading at 4.2 V (if the pin survives)", u: "", v: 4095, tol: 0 },
        { l: "The safe fix", opts: ["Add a voltage divider so 5 V becomes 3.3 V or less", "Change Vref to 5 V in the code", "Use a longer wire", "Read the pin twice as fast"], v: 0 }],
      hints: [`code = (V<sub>in</sub> ÷ V<sub>ref</sub>) × 4095, but only while V<sub>in</sub> ≤ V<sub>ref</sub>.`, `Above V<sub>ref</sub> there are no codes left. The pin itself can only take about 3.6 V.`],
      working: () => W_([step("At 2.0 V", "2.0 ÷ 3.3 × 4095", "= 2481.8", "<strong>2482</strong>"), step("At 4.2 V", "4.2 V > V<sub>ref</sub>: no code left", "", "<strong>4095</strong> (clipped), and above about 3.6 V the pin can be damaged"), step("Fix", "", "", "A <strong>voltage divider</strong> scales 0 to 5 V down to 0 to 3.3 V")]) },
    { id: "c6-q10", title: "Exercise 6: How Many Bits?",
      q: `<p>A 5 V sensor must be read with a resolution of <strong>1 mV or better</strong>.</p>`, fig: () => FIG.adc("?", "5 V", "sensor 0 to 5 V", "? bits"),
      ans: [{ l: "Smallest number of bits", u: "bits", v: 13, tol: 0 }, { l: "Its resolution", u: "mV", v: 0.6104 }],
      hints: [`You need 5 V ÷ (2<sup>n</sup> − 1) ≤ 1 mV, so 2<sup>n</sup> − 1 ≥ 5000.`, `2<sup>12</sup> = 4096 is not enough.`],
      working: () => W_([step("Condition", "2<sup>n</sup> − 1 ≥ 5000", "12 bits → 4095 (too few); 13 bits → 8191", "<strong>13 bits</strong>"), step("Resolution", "5 ÷ 8191", "", "<strong>0.610 mV</strong>")]) },
    { id: "c6-q8", title: "Exercise 7: ESP32 Thermometer",
      q: `<p>An ESP32 (12-bit ADC, V<sub>ref</sub> = 3.3 V) reads an LM35 (10 mV/°C).</p>`, fig: FIG.lm,
      ans: [{ l: "ADC code at 30 °C", u: "", v: 372, tol: 1 }, { l: "Temperature when the code is 620", u: "°C", v: 49.96 }],
      hints: [`Resolution = 3.3 ÷ 4095 = 0.806 mV.`, `30 °C → 0.30 V. For the reverse, V = code × resolution, then ÷ 10 mV.`],
      working: () => W_([step("Code at 30 °C", "0.30 V ÷ 0.806 mV", "= 372.3", "<strong>372</strong>"), step("Temperature", "620 × 3.3 ÷ 4095 = 0.4996 V", "0.4996 ÷ 0.010", "<strong>50.0 °C</strong>")]) },
    { id: "c6-q3", title: "Exercise 8: A 5-Bit Binary-Weighted DAC",
      q: `<p>The 5-bit binary-weighted DAC below has inputs D<sub>0</sub> to D<sub>4</sub>, logic HIGH = <strong>5 V</strong>, and R<sub>0</sub> = <strong>640 kΩ</strong>.</p>`, fig: FIG.dac5,
      ans: [{ l: "(a) R<sub>4</sub> (the MSB resistor)", u: "kΩ", v: 40 }, { l: "(a) R<sub>2</sub>", u: "kΩ", v: 160 },
        { l: "(b) R<sub>f</sub> for a maximum output of 8 V", u: "kΩ", v: 33.03 }, { l: "(c) V<sub>out</sub> when D<sub>0</sub>, D<sub>1</sub> and D<sub>3</sub> are HIGH", u: "V", v: 2.839 }],
      hints: [`Each resistor is half the one before it: R<sub>1</sub> = R<sub>0</sub> ÷ 2, and so on up to the MSB.`, `Maximum output = all 5 bits HIGH: R<sub>f</sub> = 8 V ÷ ΣI. For (c) add only the currents of D0, D1 and D3.`],
      working: () => W_([step("(a) Resistors", "R<sub>n</sub> halves towards the MSB", "R<sub>1</sub> = 320, R<sub>2</sub> = 160, R<sub>3</sub> = 80 kΩ", "<strong>R<sub>4</sub> = 40 kΩ</strong>"),
        step("(b) Full-scale current", "5 × (1/640k + 1/320k + 1/160k + 1/80k + 1/40k)", "= 5 × 31/640k", "= 0.2422 mA"),
        step("(b) R<sub>f</sub>", "8 V ÷ 0.2422 mA", "", "<strong>33.0 kΩ</strong>"),
        step("(c) Current for D0, D1, D3", "5 × (1/640k + 1/320k + 1/80k)", "= 5 × 11/640k", "= 0.0859 mA"),
        step("(c) V<sub>out</sub>", "33.03 kΩ × 0.0859 mA", "(check: 8 V × 11/31)", "<strong>2.84 V</strong>")]) },
    { id: "c6-q6", title: "Exercise 9: R-2R Ladder",
      q: `<p>The buffered 4-bit R-2R ladder DAC below runs from V<sub>H</sub> = <strong>5 V</strong>. Its switches are set to <strong>1010</strong>.</p>`, fig: FIG.r2r,
      ans: [{ l: "V<sub>out</sub> for 1010", u: "V", v: 3.125 }, { l: "Step size (1 LSB)", u: "V", v: 0.3125 }, { l: "Number of different resistor values needed", u: "", v: 2, tol: 0 }],
      hints: [`V<sub>out</sub> = V<sub>H</sub> × code ÷ 2<sup>N</sup>.`, `1010 is decimal 10; 2<sup>4</sup> = 16.`],
      working: () => W_([step("V<sub>out</sub>", "5 × 10 ÷ 16", "", "<strong>3.125 V</strong>"), step("Step", "5 ÷ 16", "", "<strong>0.3125 V</strong>"), step("Resistors", "", "", "Only <strong>2</strong>: R and 2R")]) },
    { id: "c6-q11", title: "Exercise 10: ESP32 DAC",
      q: `<p>The ESP32's DAC is 8-bit with a 3.3 V range (codes 0 to 255).</p>`, fig: FIG.espdac,
      ans: [{ l: "Output for <code>dacWrite(25, 200)</code>", u: "V", v: 2.588 }, { l: "Step size", u: "mV", v: 12.94 }],
      hints: [`V = code × 3.3 ÷ 255.`, `Step = 3.3 ÷ 255.`],
      working: () => W_([step("Output", "200 × 3.3 ÷ 255", "", "<strong>2.588 V</strong>"), step("Step", "3.3 ÷ 255", "", "<strong>12.94 mV</strong>")]) },
    { id: "c6-q9", title: "Exercise 11: Counter vs SAR",
      q: `<p>Compare an <strong>8-bit</strong> counter ADC with an 8-bit SAR ADC, both with a <strong>1 MHz</strong> clock (one step per microsecond).</p>`, fig: FIG.race,
      ans: [{ l: "Worst-case steps for the counter ADC", u: "", v: 255, tol: 1 }, { l: "Steps for the SAR ADC", u: "", v: 8, tol: 0 }, { l: "Worst-case counter conversion time", u: "µs", v: 255, tol: 1 }],
      hints: [`The counter may need to climb through every code up to 2<sup>n</sup> − 1.`, `SAR decides one bit per step.`],
      working: () => W_([step("Counter", "up to 2<sup>8</sup> − 1 steps", "", "<strong>255 steps → 255 µs</strong>"), step("SAR", "one step per bit", "", "<strong>8 steps → 8 µs</strong>")]) },
    { id: "c6-q12", title: "Exercise 12: DAC or ADC?",
      q: `<p>Choose the right answer for each. The first two are the boxes marked ? in the chain below.</p>`, fig: FIG.chain,
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
      { key: "esp", list: "#espList" },
      { key: "adc", list: "#adcList", toc: "#adcToc" },
      { key: "dac", list: "#dacList", toc: "#dacToc" },
      { key: "inside", list: "#insideList" }
    ],
    exercises: EXERCISES
  });
})();
