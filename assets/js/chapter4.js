/* NMK42003 Chapter 4: Transduction Techniques
   Animated notes: how circuits turn a sensor's change in R, C or L (or a piezo's charge) into a voltage or a frequency:
   voltage dividers, Wheatstone bridges, 555 timing circuits, LC tuned circuits and the piezo resistor circuit.
   The calculator, exercise and animation engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, F, D, step, stepsHtml, MINUS, reduceMotion, chips, wireChips, fold, loadValues,
    video, watch, player, axes, poly, svg, curve, dot, label, mixHex, pvCard, pick } = Lab;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const fx = (x, d = 2) => (x < 0 && Math.abs(x) >= 0.5 * 10 ** -d ? MINUS : "") + Math.abs(x).toFixed(d);
  const TAU = 2 * Math.PI, E0 = 8.854e-12;
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const sub = (a, b) => `${a}<tspan class="sb" dy="3">${b}</tspan><tspan dy="-3">`;

  /* =====================================================================
     Photos
     ===================================================================== */
  const CC = (lic, url) => `<a href="${url}" target="_blank" rel="noopener">${lic}</a>`;
  const commons = (file, who, lic) => `Photo: <a href="https://commons.wikimedia.org/wiki/File:${file}" target="_blank" rel="noopener">${who}</a>, ${lic}, via Wikimedia Commons`;
  const BYSA4 = CC("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0"), BYSA3 = CC("CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0");
  const OWN = "Photo: NMK42003 teaching team";
  const PHOTOS = {
    "ldr.jpg": { w: 720, h: 480, alt: "A light-dependent resistor: a round component with a wavy orange track on its face and two leads", credit: commons("25mm_light-dependent_resistor_(LDR)_(1).jpg", "Suyash Dwivedi", BYSA4) },
    "ne555-timer.jpg": { w: 720, h: 575, alt: "NE555 timer chips in an 8-pin DIP package and a small surface-mount package", credit: commons("NE555_DIP_%26_SOIC.jpg", "Swift.Hg", BYSA3) },
    "strain-gauge.jpg": { w: 594, h: 386, alt: "A foil strain gauge: a zig-zag metal track on a thin orange backing with two solder pads", credit: commons("Unmounted_strain_gauge.jpg", "Pleriche", BYSA4) },
    "timer-sensor-board.jpg": { w: 720, h: 404, alt: "A small red circuit board with a 555 timer chip powered by a 9 V battery, wired by a twisted cable to a two-wire capacitive sensor taped along a yellow ruler", credit: OWN },
    "two-wire-sensor-water.jpg": { w: 136, h: 470, alt: "The two-wire sensor standing in a clear tube partly filled with water, beside a ruler", credit: OWN },
    "../chapter-1/wheatstone-bridge.jpg": { w: 513, h: 625, alt: "A laboratory Wheatstone bridge instrument in a wooden case with dials and terminals", credit: `Photo: <a href="https://commons.wikimedia.org/wiki/File:Wheatstone_bridge,_Type_YBR-7C_-_National_Museum_of_Nature_and_Science,_Tokyo_-_DSC07795.JPG" target="_blank" rel="noopener">Daderot</a>, CC0, via Wikimedia Commons` },
    "../chapter-1/galvanometer-mechanism.jpg": { w: 900, h: 566, alt: "Inside a galvanometer: a moving coil between the poles of a magnet, with a pointer", credit: commons("Galvanometer_mechanism_details.jpg", "Mister rf", BYSA4) }
  };
  const photo = (file, caption, cls = "") => {
    const p = PHOTOS[file];
    return `<figure class="photo2 ${cls}"><img src="assets/img/chapter-4/${file}" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" loading="lazy">
      <figcaption>${caption ? `${caption} ` : ""}<span class="credit">${p.credit}</span></figcaption></figure>`;
  };

  // Vertical inductor (coil) between (x, y1) and (x, y2)
  const indV = (x, y1, y2) => { const a = (y2 - y1 - 40) / 2; return `<path class="w" d="M${x},${y1}v${a}a5,5 0 0 1 0,10a5,5 0 0 1 0,10a5,5 0 0 1 0,10a5,5 0 0 1 0,10v${a}"/>`; };
  const part = (type, x, y1, y2) => (type === "C" ? D.cap(x, y1, x, y2) : type === "L" ? indV(x, y1, y2) : D.res(x, y1, x, y2));

  /* =====================================================================
     Introduction: sensor change → circuit → voltage or frequency → ESP32
     ===================================================================== */
  const LANES = [
    ["Resistive sensor", "LDR, strain gauge", "Divider or bridge", "voltage"],
    ["Capacitive sensor", "level, moisture", "555 timer", "frequency"],
    ["Inductive sensor", "coil, metal detector", "LC tuned circuit", "resonance"],
    ["Active sensor", "piezo (charge)", "Resistor", "pulse"]
  ];
  function mountFlow(el) {
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene flow" viewBox="0 0 560 300" role="img" aria-label="Four ways to turn a sensor's change into a signal the ESP32 can read: a divider or bridge gives a voltage, a 555 timer gives a frequency, an LC tuned circuit gives a resonant frequency, and a resistor turns a piezo's charge into a voltage pulse."></svg></div></figure><div class="pv-pl"></div></div>`;
    const sv = el.querySelector("svg");
    const draw = (t) => {
      let s = `<rect class="espbig" x="486" y="40" width="66" height="220" rx="10"/>${T(519, 144, "ESP32", "middle", "tt inv")}${T(519, 162, "reads", "middle", "small inv")}${T(519, 176, "V or f", "middle", "small inv")}`;
      LANES.forEach(([a, b, c, kind], i) => {
        const y = 42 + i * 70;
        s += `<rect class="bx" x="6" y="${y - 22}" width="128" height="44" rx="6"/>${T(70, y - 3, a, "middle", "tt fsm")}${T(70, y + 13, b, "middle", "small")}`;
        s += `<rect class="drv" x="178" y="${y - 20}" width="118" height="40" rx="6"/>${T(237, y + 5, c, "middle", "fsm")}`;
        s += `<line class="flow-l" x1="134" y1="${y}" x2="176" y2="${y}"/><line class="flow-l" x1="296" y1="${y}" x2="336" y2="${y}"/><line class="flow-l" x1="446" y1="${y}" x2="484" y2="${y}"/>`;
        for (const [x0, x1] of [[134, 176], [296, 336], [446, 484]]) { const k = (t * 0.6 + i * 0.25) % 1; s += `<circle class="packet" cx="${lerp(x0, x1, k)}" cy="${y}" r="3.5"/>`; }
        s += `<rect class="scope" x="338" y="${y - 22}" width="106" height="44" rx="5"/>`;
        const pts = [];
        for (let k = 0; k <= 50; k++) {
          const u = k / 50, x = 344 + u * 94, ph = u * 3 + t * 0.8;
          let v = 0;
          if (kind === "voltage") v = 0.55 * Math.sin(t * 0.9) * 0.5 + 0.1;
          else if (kind === "frequency") v = (ph % 1) < 0.5 ? 0.6 : -0.6;
          else if (kind === "resonance") v = 0.7 * Math.sin(TAU * ph * 1.4) * Math.exp(-((u - 0.5) ** 2) * 3);
          else { const q = (ph % 1.5); v = q < 0.05 ? q * 16 : 0.8 * Math.exp(-(q - 0.05) * 4); }
          pts.push([x, y - v * 15]);
        }
        s += poly(pts, "scope-t") + T(391, y - 26, kind === "pulse" ? "voltage pulse" : kind === "resonance" ? "resonant f" : kind, "middle", "small");
      });
      sv.innerHTML = s;
    };
    player(el.querySelector(".pv-pl"), el, { dur: 6, hold: 0, draw, still: 1, label: "Flow animation position" });
  }

  /* =====================================================================
     Voltage divider
     ===================================================================== */
  function dividerDiagram(Tl, lab, v, res) {
    const ty = v.type || "R", X = 150, k1 = { R: "R1", C: "C1", L: "L1" }[ty], k2 = { R: "R2", C: "C2", L: "L2" }[ty];
    let s = `${D.term(X, 20)}${T(X + 12, 25, `${sub("V", "in")} = ${lab.Vin || "?"}${ty === "R" ? "" : " AC"}</tspan>`, "start")}`;
    s += D.wire([X, 24], [X, 34]) + part(ty, X, 34, 106) + D.wire([X, 106], [X, 136]) + part(ty, X, 136, 208) + D.gnd(X, 208);
    s += D.wire([X, 121], [X + 110, 121]) + D.dot(X, 121) + D.term(X + 114, 121);
    s += `<text x="${X + 124}" y="126">${sub("V", "out")} = </tspan><tspan class="val">${res ? eng(res.vout, "V") : "?"}</tspan></text>`;
    s += T(X - 18, 64, `${sub(k1[0], "1")} = ${lab[k1] || "?"}</tspan>`, "end") + T(X - 18, 176, `${sub(k2[0], "2")} = ${lab[k2] || "?"}</tspan>`, "end");
    if (res && ty !== "R") s += T(X - 18, 84, `X = ${eng(res.x1, "Ω")}`, "end", "small") + T(X - 18, 196, `X = ${eng(res.x2, "Ω")}`, "end", "small");
    return s;
  }
  function dividerCompute(v) {
    const ty = v.type, st = [];
    let vout, x1, x2;
    if (ty === "R") {
      vout = (v.Vin * v.R2) / (v.R1 + v.R2);
      st.push(step("Divider rule", "V<sub>out</sub> = V<sub>in</sub> × Z<sub>2</sub> ÷ (Z<sub>1</sub> + Z<sub>2</sub>), here Z = R", `= ${num(v.Vin)} V × ${eng(v.R2, "Ω")} ÷ (${eng(v.R1, "Ω")} + ${eng(v.R2, "Ω")})`, `V<sub>out</sub> = ${eng(vout, "V")}`));
    } else if (ty === "C") {
      x1 = 1 / (TAU * v.f * v.C1); x2 = 1 / (TAU * v.f * v.C2); vout = (v.Vin * x2) / (x1 + x2);
      st.push(step("Reactance of C1", "X<sub>C1</sub> = 1 ÷ (2πf C<sub>1</sub>) = 1 ÷ (ωC<sub>1</sub>)", `= 1 ÷ (2π × ${eng(v.f, "Hz")} × ${eng(v.C1, "F")})`, `X<sub>C1</sub> = ${eng(x1, "Ω")}`));
      st.push(step("Reactance of C2", "X<sub>C2</sub> = 1 ÷ (2πf C<sub>2</sub>)", `= 1 ÷ (2π × ${eng(v.f, "Hz")} × ${eng(v.C2, "F")})`, `X<sub>C2</sub> = ${eng(x2, "Ω")}`));
      st.push(step("Divider rule", "V<sub>out</sub> = V<sub>in</sub> × X<sub>C2</sub> ÷ (X<sub>C1</sub> + X<sub>C2</sub>)", `= ${num(v.Vin)} × ${eng(x2, "Ω")} ÷ ${eng(x1 + x2, "Ω")}`, `V<sub>out</sub> = ${eng(vout, "V")}`));
      st.push(step("Shortcut (f cancels out)", "V<sub>out</sub> = V<sub>in</sub> × C<sub>1</sub> ÷ (C<sub>1</sub> + C<sub>2</sub>)", `= ${num(v.Vin)} × ${eng(v.C1, "F")} ÷ ${eng(v.C1 + v.C2, "F")}`, `= ${eng((v.Vin * v.C1) / (v.C1 + v.C2), "V")}: the <em>smaller</em> capacitor takes the bigger share`));
    } else {
      x1 = TAU * v.f * v.L1; x2 = TAU * v.f * v.L2; vout = (v.Vin * x2) / (x1 + x2);
      st.push(step("Reactance of L1", "X<sub>L1</sub> = 2πf L<sub>1</sub> = ωL<sub>1</sub>", `= 2π × ${eng(v.f, "Hz")} × ${eng(v.L1, "H")}`, `X<sub>L1</sub> = ${eng(x1, "Ω")}`));
      st.push(step("Reactance of L2", "X<sub>L2</sub> = 2πf L<sub>2</sub>", `= 2π × ${eng(v.f, "Hz")} × ${eng(v.L2, "H")}`, `X<sub>L2</sub> = ${eng(x2, "Ω")}`));
      st.push(step("Divider rule", "V<sub>out</sub> = V<sub>in</sub> × X<sub>L2</sub> ÷ (X<sub>L1</sub> + X<sub>L2</sub>)", `= ${num(v.Vin)} × ${eng(x2, "Ω")} ÷ ${eng(x1 + x2, "Ω")}`, `V<sub>out</sub> = ${eng(vout, "V")}`));
      st.push(step("Shortcut (f cancels out)", "V<sub>out</sub> = V<sub>in</sub> × L<sub>2</sub> ÷ (L<sub>1</sub> + L<sub>2</sub>)", `= ${num(v.Vin)} × ${eng(v.L2, "H")} ÷ ${eng(v.L1 + v.L2, "H")}`, `= ${eng((v.Vin * v.L2) / (v.L1 + v.L2), "V")}`));
    }
    return { sum: `V<sub>out</sub> = ${eng(vout, "V")}${ty === "R" ? "" : " (AC, rms if V<sub>in</sub> is rms)"}`, vout, x1, x2, steps: st };
  }

  // Divider explorer: what happens to Vout when R1 or R2 changes
  function mountExplorer(el, sec) {
    const S = { r1: 4.7, r2: 4.7, vin: 9 };
    const c = pvCard(el, `<div class="slider-field"><label for="${sec.id}-r1">R<sub>1</sub> (top): <strong class="r1-v">4.7 kΩ</strong></label><input type="range" id="${sec.id}-r1" min="1" max="10" step="0.1" value="4.7"></div>
      <div class="slider-field"><label for="${sec.id}-r2">R<sub>2</sub> (bottom): <strong class="r2-v">4.7 kΩ</strong></label><input type="range" id="${sec.id}-r2" min="1" max="10" step="0.1" value="4.7"></div>`);
    const s1 = el.querySelector(`#${sec.id}-r1`), s2 = el.querySelector(`#${sec.id}-r2`);
    const out = (r1, r2) => (S.vin * r2) / (r1 + r2);
    const paint = () => {
      const v = out(S.r1, S.r2), frac = v / S.vin, X = 110;
      let s = `${D.term(X, 20)}${T(X + 12, 25, `+${S.vin} V`, "start")}` + D.wire([X, 24], [X, 40]) + D.res(X, 40, X, 110) + D.wire([X, 110], [X, 130]) + D.res(X, 130, X, 200) + D.gnd(X, 200);
      s += D.wire([X, 120], [X + 60, 120]) + D.dot(X, 120) + T(X - 16, 80, `${sub("R", "1")} = ${S.r1.toFixed(1)} kΩ</tspan>`, "end") + T(X - 16, 170, `${sub("R", "2")} = ${S.r2.toFixed(1)} kΩ</tspan>`, "end");
      s += `<rect class="meterbar" x="240" y="30" width="44" height="170" rx="6"/><rect class="meterfill" x="244" y="${196 - frac * 162}" width="36" height="${frac * 162}" rx="4"/>`;
      s += `<path class="w thin" d="M${X + 60},120H236"/>` + T(262, 22, `${sub("V", "out")} = ${v.toFixed(2)} V</tspan>`, "middle", "tt") + T(262, 216, `${(frac * 100).toFixed(0)}% of V<tspan class="sb" dy="3">in</tspan>`, "middle", "small");
      c.scene.innerHTML = svg(320, 230, `Voltage divider with R1 ${S.r1.toFixed(1)} kΩ and R2 ${S.r2.toFixed(1)} kΩ gives ${v.toFixed(2)} V`, s, "scene");
      const A = axes({ x: [1, 10], y: [0, 9], xt: [1, 4, 7, 10], yt: [0, 3, 6, 9], xl: "Resistance (kΩ)", yl: "Vout (V)" });
      let g = A.s + poly(curve(A, (r) => out(S.r1, r), 1, 10), "trace-a") + poly(curve(A, (r) => out(r, S.r2), 1, 10), "trace-d");
      g += dot(A.X(S.r2), A.Y(v)) + label(A.X(S.r2) + (S.r2 > 6 ? -8 : 8), A.Y(v) - 10, `${v.toFixed(2)} V`, S.r2 > 6 ? "end" : "start");
      c.graph.innerHTML = svg(A.W, A.H, "Output voltage against R2 (and against R1)", g) + `<p class="legend"><span class="key"></span>changing R2 (x-axis = R2) <span class="key digital"></span>changing R1 (x-axis = R1)</p>`;
      c.read.innerHTML = `V<sub>out</sub> = ${S.vin} × ${S.r2.toFixed(1)} ÷ (${S.r1.toFixed(1)} + ${S.r2.toFixed(1)}) = <strong>${v.toFixed(2)} V</strong>. ` +
        (Math.abs(S.r1 - S.r2) < 0.05 ? "R<sub>1</sub> = R<sub>2</sub>, so the output is exactly half of V<sub>in</sub>." : S.r2 > S.r1 ? "R<sub>2</sub> is the bigger share, so V<sub>out</sub> is more than half." : "R<sub>1</sub> takes the bigger share, so V<sub>out</sub> is less than half.") +
        " <strong>Increase R<sub>2</sub> → V<sub>out</sub> rises; increase R<sub>1</sub> → V<sub>out</sub> falls.</strong> Only the ratio matters.";
      el.querySelector(".r1-v").textContent = `${S.r1.toFixed(1)} kΩ`; el.querySelector(".r2-v").textContent = `${S.r2.toFixed(1)} kΩ`;
      s1.value = S.r1; s2.value = S.r2;
    };
    const pl = player(c.pl, el, { dur: 10, hold: 0, still: 2.5, auto: false, label: "R2 sweep position", draw: (t) => { S.r2 = Math.round((5.5 - 4.5 * Math.cos((TAU * t) / 10)) * 10) / 10; paint(); } });
    s1.addEventListener("input", () => { pl.pause(); S.r1 = +s1.value; paint(); });
    s2.addEventListener("input", () => { pl.pause(); S.r2 = +s2.value; paint(); });
  }

  // Real situation: an automatic street light with an LDR divider
  function mountStreetLight(el) {
    const S = { pos: "bottom" }, VS = 5, RF = 4.7;
    const c = pvCard(el, chips("LDR position", [["bottom", "LDR at the bottom (R2)"], ["top", "LDR at the top (R1)"]], S.pos));
    const vout = (r) => (S.pos === "bottom" ? (VS * r) / (RF + r) : (VS * RF) / (RF + r));
    const isOn = (v) => (S.pos === "bottom" ? v > 4 : v < 1);
    const draw = (t) => {
      const k = 0.5 - 0.5 * Math.cos((TAU * t) / 12), r = 5 * (300 / 5) ** k, v = vout(r), on = isOn(v);
      const sky = mixHex("#8fc7ee", "#0f1b33", k);
      let s = `<rect x="0" y="0" width="340" height="230" style="fill:${sky}"/>`;
      s += k < 0.55 ? `<circle class="sun" cx="${60}" cy="${40 + k * 120}" r="16"/>` : `<circle class="moon" cx="60" cy="${40 + (1 - k) * 80}" r="13"/>`;
      if (k > 0.6) for (let i = 0; i < 12; i++) s += `<circle class="star" cx="${(i * 71) % 330 + 5}" cy="${(i * 37) % 90 + 8}" r="1.2" style="opacity:${((k - 0.6) * 2.5).toFixed(2)}"/>`;
      s += `<rect class="grass" x="0" y="196" width="340" height="34"/><rect class="road3" x="0" y="206" width="340" height="24"/>`;
      s += `<rect class="house" x="24" y="140" width="70" height="56"/><path class="roof" d="M18,142L59,110L100,142Z"/><rect class="win${k > 0.6 ? " lit" : ""}" x="36" y="156" width="16" height="16"/><rect class="win${k > 0.6 ? " lit" : ""}" x="66" y="156" width="16" height="16"/>`;
      if (on) s += `<path class="beam" d="M218,86L178,206H300L262,86Z"/>`;
      s += `<rect class="pole" x="236" y="80" width="8" height="126"/><path class="lamp-arm" d="M240,82H262"/><rect class="lamp-head${on ? " on" : ""}" x="206" y="72" width="60" height="16" rx="6"/><circle class="ldr-dot" cx="236" cy="68" r="5"/>`;
      s += T(246, 66, "LDR", "start", "small inv-ish");
      s += `<rect class="dist-box" x="110" y="10" width="220" height="44" rx="6"/>${T(220, 28, `R<tspan class="sb" dy="3">LDR</tspan><tspan dy="-3"> = ${eng(r * 1000, "Ω", 3)}</tspan>`, "middle", "dist-t")}${T(220, 46, `V<tspan class="sb" dy="3">out</tspan><tspan dy="-3"> = ${v.toFixed(2)} V · lamp ${on ? "ON" : "off"}</tspan>`, "middle", on ? "dist-t on" : "dist-t")}`;
      c.scene.innerHTML = svg(340, 230, `${k > 0.5 ? "Night" : "Day"}: LDR ${eng(r * 1000, "Ω", 3)}, output ${v.toFixed(2)} V, street lamp ${on ? "on" : "off"}`, s, "scene");
      const A = axes({ x: [0, 300], y: [0, 5], xt: [0, 50, 100, 150, 200, 250, 300], yt: [0, 1, 2, 3, 4, 5], xl: "LDR resistance (kΩ)", yl: "Vout (V)" });
      let g = A.s + `<rect class="band" x="${A.X(5)}" y="${A.t}" width="${A.X(10) - A.X(5)}" height="${A.ph}"/>`;
      const thr = S.pos === "bottom" ? 4 : 1;
      g += `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(thr)}" y2="${A.Y(thr)}"/>` + T(A.l + A.pw - 4, A.Y(thr) + (S.pos === "bottom" ? 14 : -5), "lamp switches here", "end", "reflab");
      g += poly(curve(A, vout, 0.5, 300, 200), "trace-a") + dot(A.X(r), A.Y(v));
      c.graph.innerHTML = svg(A.W, A.H, "Divider output against LDR resistance", g) + `<p class="legend"><span class="key band"></span>5 to 10 kΩ: almost straight</p>`;
      c.read.innerHTML = `${k < 0.5 ? "Daylight" : "Dark"}: the LDR is <strong>${eng(r * 1000, "Ω", 3)}</strong>, so V<sub>out</sub> = <strong>${v.toFixed(2)} V</strong>. ` +
        (S.pos === "bottom" ? "With the LDR at the bottom, V<sub>out</sub> <strong>rises</strong> in the dark (towards 5 V)." : "With the LDR at the top, V<sub>out</sub> <strong>falls</strong> in the dark (towards 0 V).") +
        ` The curve is steep at first and then flat: the output is very <strong>non-linear</strong>, and only roughly straight between 5 and 10 kΩ.`;
    };
    const pl = player(c.pl, el, { dur: 12, hold: 0, draw, still: 7, label: "Day and night position", clock: (t) => (0.5 - 0.5 * Math.cos((TAU * t) / 12) > 0.5 ? "night" : "day") });
    pick(el, (k) => { S.pos = k; pl.redraw(); });
  }

  /* =====================================================================
     Wheatstone bridge
     A (top, +) · C (left) · D (right) · B (bottom); R1 = A–C, R2 = C–B, R3 = A–D, R4 = D–B
     ===================================================================== */
  const resDiag = (x1, y1, x2, y2) => { const L = Math.hypot(x2 - x1, y2 - y1), a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI; return `<g transform="translate(${x1} ${y1}) rotate(${a.toFixed(2)})">${D.res(0, 0, L, 0)}</g>`; };
  // A diamond bridge. o: { labels: [tl, bl, tr, br], nodes: [top, left, right, bottom], meter: "G" | "A" | "V", needle, src, arrow }
  function bridgeSvg(o) {
    const A = [220, 34], C = [110, 134], Dn = [330, 134], B = [220, 234];
    const n = o.nodes || ["A", "C", "D", "B"], lb = o.labels;
    let s = resDiag(A[0], A[1], C[0], C[1]) + resDiag(C[0], C[1], B[0], B[1]) + resDiag(A[0], A[1], Dn[0], Dn[1]) + resDiag(Dn[0], Dn[1], B[0], B[1]);
    s += D.wire([A[0], A[1]], [A[0], 14], [40, 14], [40, 122]) + D.wire([40, 140], [40, 254], [B[0], 254], [B[0], B[1]]);
    s += `<path class="w" d="M24,122H56M32,140H48"/>` + T(62, 118, "+", "start", "small") + T(50, 164, o.src || "V", "start");
    if (o.meter === "V") s += D.wire([C[0], C[1]], [196, C[1]]) + D.term(200, C[1]) + D.term(240, C[1]) + D.wire([244, C[1]], [Dn[0], Dn[1]]) + T(220, C[1] - 8, sub("V", "out") + "</tspan>");
    else {
      s += D.wire([C[0], C[1]], [198, C[1]]) + D.wire([242, C[1]], [Dn[0], Dn[1]]) + `<circle class="gmeter" cx="220" cy="${C[1]}" r="21"/>`;
      if (o.meter === "G") s += `<line class="needle" x1="220" y1="${C[1] + 12}" x2="${220 + 17 * Math.sin(((o.needle || 0) * Math.PI) / 180)}" y2="${C[1] + 12 - 26 * Math.cos(((o.needle || 0) * Math.PI) / 180)}"/>` + T(220, C[1] + 40, "G", "middle", "tt");
      else s += T(220, C[1] + 5, "A", "middle", "tt");
    }
    if (o.arrow) s += `<path class="iarrow" d="M${o.arrow > 0 ? 196 : 244},${C[1] - 30}H${o.arrow > 0 ? 244 : 196}m${o.arrow > 0 ? -7 : 7},-6l${o.arrow > 0 ? 7 : -7},6l${o.arrow > 0 ? -7 : 7},6"/>`;
    s += D.dot(...A) + D.dot(...C) + D.dot(...Dn) + D.dot(...B);
    s += T(A[0] + 10, A[1] - 6, n[0], "start", "tt") + T(C[0] - 10, C[1] + 5, n[1], "end", "tt") + T(Dn[0] + 10, Dn[1] + 5, n[2], "start", "tt") + T(B[0] + 12, B[1] + 14, n[3], "start", "tt");
    s += T(150, 74, lb[0], "end") + T(150, 206, lb[1], "end") + T(290, 74, lb[2], "start") + T(290, 206, lb[3], "start");
    return s;
  }
  function bridgeDiagram(Tl, lab, v, res) {
    const needle = res ? 55 * Math.tanh(res.vout / (0.03 * v.Vs)) : 0;
    let s = bridgeSvg({ labels: [`${sub("R", "1")} = ${lab.R1 || "?"}</tspan>`, `${sub("R", "2")} = ${lab.R2 || "?"}</tspan>`, `${sub("R", "3")} = ${lab.R3 || "?"}</tspan>`, `${sub("R", "4")} = ${lab.R4 || "?"}</tspan>`],
      meter: "G", needle, src: lab.Vs || "?", arrow: res && Math.abs(res.vout) > 1e-6 * v.Vs ? Math.sign(res.vout) : 0 });
    if (res) s += T(430, 238, `${sub("V", "C")} = ${eng(res.vc, "V")}</tspan>`, "end", "small") + T(430, 258, `${sub("V", "D")} = ${eng(res.vd, "V")}</tspan>`, "end", "small");
    s += `<text x="420" y="24" text-anchor="end">${sub("V", "out")} = </tspan><tspan class="val">${res ? eng(res.vout, "V") : "?"}</tspan></text>`;
    return s;
  }
  function bridgeCompute(v) {
    const vc = (v.Vs * v.R2) / (v.R1 + v.R2), vd = (v.Vs * v.R4) / (v.R3 + v.R4), vout = vc - vd, r4 = (v.R2 * v.R3) / v.R1, bal = Math.abs(vout) < 1e-6 * v.Vs;
    const dir = bal ? "no current: the needle stays at zero" : vout > 0 ? "C is higher than D: current flows from C to D" : "D is higher than C: current flows from D to C";
    return { sum: `V<sub>out</sub> = V<sub>C</sub> − V<sub>D</sub> = ${eng(vout, "V")}${bal ? " (balanced)" : ""}`, vc, vd, vout, r4, notes: bal ? [{ type: "info", title: "Balanced", html: "R<sub>1</sub>/R<sub>2</sub> = R<sub>3</sub>/R<sub>4</sub>, so V<sub>C</sub> = V<sub>D</sub> and the galvanometer reads zero." }] : [], steps: [
      step("Left arm A–C–B", "V<sub>C</sub> = V<sub>s</sub> × R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>)", `= ${num(v.Vs)} × ${eng(v.R2, "Ω")} ÷ (${eng(v.R1, "Ω")} + ${eng(v.R2, "Ω")})`, `V<sub>C</sub> = ${eng(vc, "V")}`),
      step("Right arm A–D–B", "V<sub>D</sub> = V<sub>s</sub> × R<sub>4</sub> ÷ (R<sub>3</sub> + R<sub>4</sub>)", `= ${num(v.Vs)} × ${eng(v.R4, "Ω")} ÷ (${eng(v.R3, "Ω")} + ${eng(v.R4, "Ω")})`, `V<sub>D</sub> = ${eng(vd, "V")}`),
      step("Output across C and D", "V<sub>out</sub> = V<sub>C</sub> − V<sub>D</sub>", `= ${eng(vc, "V")} − ${eng(vd, "V")}`, `V<sub>out</sub> = ${eng(vout, "V")}`),
      step("Galvanometer", "", "", dir),
      step("Balance condition", "V<sub>C</sub> = V<sub>D</sub> ⇔ R<sub>1</sub> ÷ R<sub>2</sub> = R<sub>3</sub> ÷ R<sub>4</sub> ⇔ R<sub>1</sub>R<sub>4</sub> = R<sub>2</sub>R<sub>3</sub>", "R<sub>4</sub> = R<sub>2</sub> R<sub>3</sub> ÷ R<sub>1</sub>", `R<sub>4</sub> needed = ${eng(v.R2, "Ω")} × ${eng(v.R3, "Ω")} ÷ ${eng(v.R1, "Ω")} = ${eng(r4, "Ω")}`)] };
  }
  function bridgeRender(extra, res, v) {
    const sec = this;
    if (!extra.dataset.ready) {
      extra.dataset.ready = "1";
      extra.innerHTML = `<div class="ex-actions"><button type="button" class="btn" data-b="bal">Balance the bridge (set R<sub>4</sub>)</button><button type="button" class="btn ghost" data-b="ex">Load the lecture example</button></div>`;
      extra.querySelector('[data-b="bal"]').addEventListener("click", () => { if (sec.lastRes) loadValues(sec.id, { R4: Number(sec.lastRes.r4.toPrecision(6)) }); });
      extra.querySelector('[data-b="ex"]').addEventListener("click", () => loadValues(sec.id, { Vs: 100, R1: 80, R2: 120, R3: 480, R4: 160 }));
    }
    sec.lastRes = res;
  }
  const WORKED = fold("Worked Example from the Lecture", `<p>An unbalanced Wheatstone bridge has a 100 V supply, R<sub>1</sub> = 80 Ω, R<sub>2</sub> = 120 Ω, R<sub>3</sub> = 480 Ω and R<sub>4</sub> = 160 Ω. Find the output across C and D, and the R<sub>4</sub> that balances the bridge.</p>
    <ol class="steps">${stepsHtml([
      step("First arm, A–C–B", "V<sub>C</sub> = V<sub>s</sub> × R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>)", "= 100 × 120 ÷ (80 + 120)", "V<sub>C</sub> = 60 V"),
      step("Second arm, A–D–B", "V<sub>D</sub> = V<sub>s</sub> × R<sub>4</sub> ÷ (R<sub>3</sub> + R<sub>4</sub>)", "= 100 × 160 ÷ (480 + 160)", "V<sub>D</sub> = 25 V"),
      step("Output", "V<sub>out</sub> = V<sub>C</sub> − V<sub>D</sub>", "= 60 − 25", "V<sub>out</sub> = 35 V"),
      step("At balance V<sub>C</sub> = V<sub>D</sub>", "R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>) = R<sub>4</sub> ÷ (R<sub>3</sub> + R<sub>4</sub>)", "R<sub>2</sub>R<sub>3</sub> + R<sub>2</sub>R<sub>4</sub> = R<sub>1</sub>R<sub>4</sub> + R<sub>2</sub>R<sub>4</sub>, so R<sub>2</sub>R<sub>3</sub> = R<sub>1</sub>R<sub>4</sub>", "R<sub>4</sub> = R<sub>2</sub>R<sub>3</sub> ÷ R<sub>1</sub>"),
      step("Balancing resistor", "R<sub>4</sub> = R<sub>2</sub>R<sub>3</sub> ÷ R<sub>1</sub>", "= 120 × 480 ÷ 80", "R<sub>4</sub> = 720 Ω")])}</ol>`);

  // Divider vs bridge: the same LDR, and the offset the bridge removes
  const gauge = (cx, cy, frac, title, val, centre) => {
    const a = centre ? frac * 60 : -60 + frac * 120, r = 58;
    let s = `<path class="gauge-arc" d="M${cx - r * Math.sin(Math.PI / 3)},${cy - r * Math.cos(Math.PI / 3)}A${r},${r} 0 0 1 ${cx + r * Math.sin(Math.PI / 3)},${cy - r * Math.cos(Math.PI / 3)}"/>`;
    for (let i = 0; i <= 4; i++) { const q = ((-60 + i * 30) * Math.PI) / 180; s += `<line class="tick" x1="${cx + (r - 8) * Math.sin(q)}" y1="${cy - (r - 8) * Math.cos(q)}" x2="${cx + r * Math.sin(q)}" y2="${cy - r * Math.cos(q)}"/>`; }
    const q = (clamp(a, -62, 62) * Math.PI) / 180;
    s += `<line class="needle" x1="${cx}" y1="${cy}" x2="${cx + (r - 6) * Math.sin(q)}" y2="${cy - (r - 6) * Math.cos(q)}"/><circle class="dot" cx="${cx}" cy="${cy}" r="4"/>`;
    s += T(cx, cy + 22, title, "middle", "tt") + T(cx, cy + 40, val, "middle", "val");
    s += T(cx - r * 0.9, cy - r * 0.45 + 16, centre ? `${MINUS}2.5` : "0", "middle", "small") + T(cx + r * 0.9, cy - r * 0.45 + 16, centre ? "+2.5" : "5 V", "middle", "small") + (centre ? T(cx, cy - r - 6, "0", "middle", "small") : "");
    return s;
  };
  function mountOffset(el) {
    const c = pvCard(el);
    const vd = (r) => (5 * 4.7) / (r + 4.7), vb = (r) => vd(r) - 2.5;
    const draw = (t) => {
      const k = 0.5 - 0.5 * Math.cos((TAU * t) / 10), r = 4.7 * (300 / 4.7) ** k;
      let s = gauge(80, 110, vd(r) / 5, "Divider", `${vd(r).toFixed(2)} V`, false) + gauge(240, 110, vb(r) / 2.5, "Bridge", `${fx(vb(r), 2)} V`, true);
      s += `<rect class="dist-box" x="70" y="186" width="180" height="28" rx="5"/>${T(160, 205, `LDR = ${eng(r * 1000, "Ω", 3)}`, "middle", "dist-t")}`;
      c.scene.innerHTML = svg(320, 230, `LDR ${eng(r * 1000, "Ω", 3)}: divider ${vd(r).toFixed(2)} V, bridge ${fx(vb(r), 2)} V`, s, "scene");
      const A = axes({ x: [0, 300], y: [-3, 3], xt: [0, 100, 200, 300], yt: [-3, -2, -1, 0, 1, 2, 3], xl: "LDR resistance (kΩ)", yl: "Output (V)" });
      let g = A.s + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(0)}" y2="${A.Y(0)}"/>`;
      g += poly(curve(A, vd, 0.5, 300, 200), "trace-d") + poly(curve(A, vb, 0.5, 300, 200), "trace-a") + dot(A.X(r), A.Y(vd(r)), "shot") + dot(A.X(r), A.Y(vb(r)));
      c.graph.innerHTML = svg(A.W, A.H, "Divider and bridge outputs against LDR resistance", g) + `<p class="legend"><span class="key digital"></span>divider <span class="key"></span>bridge</p>`;
      c.read.innerHTML = `LDR = <strong>${eng(r * 1000, "Ω", 3)}</strong>. The divider reads ${vd(r).toFixed(2)} V; the bridge reads <strong>${fx(vb(r), 2)} V</strong>. ` +
        (r < 5.2 ? "At the reference (4.7 kΩ) the divider still shows 2.5 V, but the bridge shows <strong>0 V</strong>: the offset is gone." : "The bridge curve is the divider curve moved down by 2.5 V: the <strong>offset is removed</strong>, but the curve is still <strong>non-linear</strong>.");
    };
    player(c.pl, el, { dur: 10, hold: 0, draw, still: 0, label: "LDR resistance position" });
  }

  // Real situation: a weighing scale with a strain gauge in a quarter bridge
  function mountScale(el) {
    const c = pvCard(el, "", fold("Step-by-Step Working", `<ol class="steps"></ol>`)), steps = el.querySelector(".steps");
    const R = 350, GF = 2.0, VS = 5, GAIN = 1000, EPK = 200e-6; // strain per kg
    const vq = (m) => { const x = GF * EPK * m; return (VS * x) / (2 * (2 + x)); }; // exact quarter-bridge output
    let lastM = -1;
    const draw = (t) => {
      const m = Math.round((2.5 - 2.5 * Math.cos((TAU * t) / 10)) * 100) / 100, v = vq(m), tip = m * 5;
      const yb = (u) => 120 + tip * (u * u * (3 - u)) / 2, pts = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([40 + u * 170, yb(u)]); }
      let s = `<rect class="hatch" x="8" y="80" width="32" height="110"/><line class="floor" x1="8" y1="190" x2="150" y2="190"/>`;
      s += poly(pts, "beam") + `<rect class="gauge" x="54" y="${yb(0.08) - 9}" width="30" height="6" rx="1"/>${T(50, yb(0.08) - 16, "strain gauge", "start", "small")}`;
      s += `<rect class="pan" x="186" y="${yb(1) - 10}" width="48" height="6" rx="2"/>`;
      if (m > 0.05) s += `<rect class="weight" x="${196}" y="${yb(1) - 10 - 8 - m * 6}" width="28" height="${8 + m * 6}" rx="3"/>`;
      s += `<rect class="meter" x="216" y="10" width="100" height="84" rx="8"/><rect class="lcd" x="222" y="18" width="88" height="26" rx="4"/>${T(266, 36, `${(v * 1000).toFixed(3)} mV`, "middle", "lcdt sm")}`;
      s += `<rect class="lcd" x="222" y="50" width="88" height="26" rx="4"/>${T(266, 68, `${(v * GAIN).toFixed(3)} V`, "middle", "lcdt sm")}${T(266, 90, "bridge → ×1000", "middle", "small")}`;
      s += T(120, 222, `load ${m.toFixed(2)} kg`, "middle", "tt");
      c.scene.innerHTML = svg(320, 230, `Load ${m.toFixed(2)} kg: bridge output ${(v * 1000).toFixed(3)} mV`, s, "scene");
      const A = axes({ x: [0, 5], y: [0, 3], xt: [0, 1, 2, 3, 4, 5], yt: [0, 1, 2, 3], xl: "Load (kg)", yl: "Bridge output (mV)" });
      c.graph.innerHTML = svg(A.W, A.H, "Bridge output against load: a straight line", A.s + poly(curve(A, (x) => vq(x) * 1000, 0, 5, 20), "trace-a") + dot(A.X(m), A.Y(v * 1000)) + label(A.X(m) + (m > 3 ? -8 : 8), A.Y(v * 1000) - 10, `${(v * 1000).toFixed(2)} mV`, m > 3 ? "end" : "start"));
      c.read.innerHTML = `${m.toFixed(2)} kg stretches the gauge by <strong>${(EPK * m * 1e6).toFixed(0)} µε</strong> (millionths). Its resistance rises by only <strong>${(GF * EPK * m * R).toFixed(3)} Ω</strong>, so the bridge gives a few millivolts, which an amplifier (×1000) turns into a voltage the ESP32 can read.`;
      if (m !== lastM) {
        lastM = m;
        const e = EPK * m, dR = GF * e * R;
        steps.innerHTML = stepsHtml([
          step("Strain from the load (this scale: 200 µε per kg)", "ε = 200 × 10<sup>−6</sup> × m", `= 200 × 10<sup>−6</sup> × ${m.toFixed(2)}`, `ε = ${(e * 1e6).toFixed(0)} µε`),
          step("Change in gauge resistance", "ΔR = GF × ε × R", `= ${GF} × ${(e * 1e6).toFixed(0)} × 10<sup>−6</sup> × ${R} Ω`, `ΔR = ${dR.toFixed(4)} Ω`),
          step("Quarter-bridge output (small strain)", "V<sub>out</sub> ≈ V<sub>s</sub> × GF × ε ÷ 4", `= ${VS} × ${GF} × ${(e * 1e6).toFixed(0)} × 10<sup>−6</sup> ÷ 4`, `V<sub>out</sub> ≈ ${((VS * GF * e) / 4 * 1000).toFixed(3)} mV (exact: ${(v * 1000).toFixed(3)} mV)`),
          step("After the amplifier", "V = gain × V<sub>out</sub>", `= 1000 × ${(v * 1000).toFixed(3)} mV`, `V = ${(v * GAIN).toFixed(3)} V`)]);
      }
    };
    player(c.pl, el, { dur: 10, hold: 0, draw, still: 3, label: "Load position", clock: (t) => `${(2.5 - 2.5 * Math.cos((TAU * t) / 10)).toFixed(2)} kg` });
  }

  /* =====================================================================
     Timing circuit: 555 astable
     ===================================================================== */
  const t555 = (RA, RB, C) => { const tH = 0.693 * (RA + RB) * C, tL = 0.693 * RB * C; return { tH, tL, T: tH + tL, f: 1.44 / ((RA + 2 * RB) * C), duty: (RA + RB) / (RA + 2 * RB) }; };
  const vcap = (x, p, RA, RB, C, vcc) => { // capacitor voltage at time x within a period
    const q = x % p.T;
    return q < p.tH ? vcc - (2 * vcc / 3) * Math.exp(-q / ((RA + RB) * C)) : (2 * vcc / 3) * Math.exp(-(q - p.tH) / (RB * C));
  };
  function timerDiagram(Tl, lab, v, res) {
    const X = 330;
    let s = `<rect class="chip" x="150" y="54" width="92" height="150" rx="6"/>${T(196, 134, "555", "middle", "tt inv")}`;
    s += D.term(X, 18) + T(X + 10, 22, `+V<tspan class="sb" dy="3">CC</tspan><tspan dy="-3"> = ${lab.Vcc || "?"}</tspan>`, "start");
    s += D.wire([X, 22], [X, 34]) + D.res(X, 34, X, 96) + D.wire([X, 96], [X, 116]) + D.res(X, 116, X, 170) + D.wire([X, 170], [X, 186]) + D.cap(X, 186, X, 226) + D.gnd(X, 226);
    s += D.wire([X, 28], [196, 28], [196, 54]) + D.wire([226, 28], [226, 54]) + D.dot(X, 28) + D.dot(226, 28);
    s += D.wire([242, 106], [X, 106]) + D.dot(X, 106) + D.wire([242, 158], [290, 158], [290, 178], [X, 178]) + D.wire([242, 186], [290, 186], [290, 178]) + D.dot(X, 178) + D.dot(290, 178);
    s += D.wire([196, 204], [196, 226]) + D.gnd(196, 226) + D.wire([150, 130], [70, 130]) + D.term(66, 130) + T(66, 118, "out", "middle", "small");
    s += T(252, 102, "7", "start", "small") + T(252, 154, "6", "start", "small") + T(252, 198, "2", "start", "small") + T(188, 48, "8", "end", "small") + T(220, 48, "4", "end", "small") + T(140, 126, "3", "end", "small") + T(206, 218, "1", "start", "small");
    s += T(X + 18, 68, `${sub("R", "A")} = ${lab.RA || "?"}</tspan>`, "start") + T(X + 18, 146, `${sub("R", "B")} = ${lab.RB || "?"}</tspan>`, "start") + T(X + 18, 210, `C = ${lab.C || "?"}`, "start");
    s += `<text x="20" y="176">f = </text><text x="20" y="196"><tspan class="val">${res ? eng(res.f, "Hz") : "?"}</tspan></text><text x="20" y="216" class="small">duty ${res ? (res.duty * 100).toFixed(1) + "%" : "?"}</text>`;
    return s;
  }
  function timerCompute(v) {
    const p = t555(v.RA, v.RB, v.C);
    return Object.assign({ sum: `f = ${eng(p.f, "Hz")}, duty cycle = ${(p.duty * 100).toFixed(1)}%`, steps: [
      step("Output frequency", "f = 1.44 ÷ ((R<sub>A</sub> + 2R<sub>B</sub>) C)", `= 1.44 ÷ ((${eng(v.RA, "Ω")} + 2 × ${eng(v.RB, "Ω")}) × ${eng(v.C, "F")})`, `f = ${eng(p.f, "Hz")}`),
      step("Time high (C charges through R<sub>A</sub> + R<sub>B</sub>)", "t<sub>H</sub> = 0.693 (R<sub>A</sub> + R<sub>B</sub>) C", `= 0.693 × ${eng(v.RA + v.RB, "Ω")} × ${eng(v.C, "F")}`, `t<sub>H</sub> = ${eng(p.tH, "s")}`),
      step("Time low (C discharges through R<sub>B</sub>)", "t<sub>L</sub> = 0.693 R<sub>B</sub> C", `= 0.693 × ${eng(v.RB, "Ω")} × ${eng(v.C, "F")}`, `t<sub>L</sub> = ${eng(p.tL, "s")}`),
      step("Check", "f = 1 ÷ (t<sub>H</sub> + t<sub>L</sub>)", `= 1 ÷ ${eng(p.T, "s")}`, `= ${eng(1 / p.T, "Hz")} (1.44 ≈ 1 ÷ 0.693)`),
      step("Duty cycle", "D = (R<sub>A</sub> + R<sub>B</sub>) ÷ (R<sub>A</sub> + 2R<sub>B</sub>)", `= ${eng(v.RA + v.RB, "Ω")} ÷ ${eng(v.RA + 2 * v.RB, "Ω")}`, `D = ${(p.duty * 100).toFixed(1)}%`)] }, p);
  }
  function timerRender(extra, res, v) {
    const sec = this;
    sec.scope = res ? { p: res, v } : null;
    if (!extra.dataset.ready) {
      extra.dataset.ready = "1";
      extra.innerHTML = `<h4 class="sub-h">Oscilloscope: Capacitor Voltage and Output</h4><div class="lv-graph"></div><div class="pv-pl"></div>`;
      const box = extra.querySelector(".lv-graph");
      sec.scopePl = player(extra.querySelector(".pv-pl"), extra, { dur: 6, hold: 0, still: 3, label: "Oscilloscope sweep position", draw: (t) => {
        if (!sec.scope) { box.innerHTML = ""; return; }
        const { p, v: w } = sec.scope, span = 3 * p.T, x = (t / 6) * span, vcc = w.Vcc;
        const A = axes({ x: [0, span], y: [-0.5, vcc * 1.15], xt: [0, p.T, 2 * p.T, 3 * p.T], fx: (q) => eng(q, "s", 3), yt: [0, vcc / 3, (2 * vcc) / 3, vcc], fy: (q) => (q === 0 ? "0" : q === vcc ? "V<tspan class='sb'>CC</tspan>" : q < vcc / 2 ? "⅓" : "⅔"), xl: "Time", yl: "Voltage", H: 220 });
        const cap = [], out = [];
        for (let i = 0; i <= 300; i++) { const q = (i / 300) * x; cap.push([A.X(q), A.Y(vcap(q, p, w.RA, w.RB, w.C, vcc))]); }
        for (let k = 0; k < 3; k++) { const a = k * p.T; if (a > x) break; out.push([A.X(a), A.Y(vcc * 0.98)], [A.X(Math.min(x, a + p.tH)), A.Y(vcc * 0.98)]); if (a + p.tH < x) out.push([A.X(a + p.tH), A.Y(0)], [A.X(Math.min(x, a + p.T)), A.Y(0)]); if (a + p.T <= x) out.push([A.X(a + p.T), A.Y(vcc * 0.98)]); }
        let g = A.s + [1, 2].map((q) => `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y((q * vcc) / 3)}" y2="${A.Y((q * vcc) / 3)}"/>`).join("");
        g += poly(out, "trace-d") + poly(cap, "trace-a") + dot(A.X(x), A.Y(vcap(x, p, w.RA, w.RB, w.C, vcc)));
        box.innerHTML = svg(A.W, A.H, "Capacitor voltage rising and falling between one third and two thirds of VCC, and the square-wave output", g) + `<p class="legend"><span class="key"></span>capacitor voltage <span class="key digital"></span>output (pin 3)</p>`;
      } });
    }
    sec.scopePl.redraw();
  }

  // Capacitive water-level sensor with a 555 (the lecture's two-wire sensor)
  const C0 = 20e-12, CPER = 12e-12, RAl = 10e3, RBl = 100e3; // C = 20 pF + 12 pF per cm of water
  function mountLevelTimer(el) {
    const c = pvCard(el, "", fold("Step-by-Step Working", `<ol class="steps"></ol>`)), steps = el.querySelector(".steps");
    const Cof = (l) => C0 + CPER * l, fof = (l) => t555(RAl, RBl, Cof(l)).f;
    let lastL = -1;
    const draw = (t) => {
      const l = Math.round((10 - 10 * Math.cos((TAU * t) / 12)) * 10) / 10, C = Cof(l), f = fof(l), top = 20, bot = 214, h = bot - top, wy = bot - (l / 20) * h;
      let s = `<rect class="tank" x="40" y="${top - 6}" width="64" height="${h + 12}" rx="6"/><rect class="water2" x="42" y="${wy}" width="60" height="${bot - wy + 4}"/>`;
      s += `<line class="wire-w" x1="62" y1="${top - 14}" x2="62" y2="${bot - 4}"/><line class="wire-g" x1="82" y1="${top - 14}" x2="82" y2="${bot - 4}"/>`;
      for (let i = 0; i <= 20; i += 5) s += `<line class="tick" x1="104" x2="112" y1="${bot - (i / 20) * h}" y2="${bot - (i / 20) * h}"/>` + T(116, bot - (i / 20) * h + 4, `${i}`, "start", "small");
      s += T(136, top + 4, "cm", "start", "small") + `<path class="cable" d="M62,${top - 14}C62,-4 150,-4 160,30M82,${top - 14}C82,0 150,4 160,40"/>`;
      s += `<rect class="chip" x="160" y="24" width="60" height="44" rx="5"/>${T(190, 51, "555", "middle", "tt inv")}<path class="w" d="M220,46H236"/>`;
      s += `<rect class="scope" x="236" y="20" width="96" height="54" rx="5"/>`;
      const per = clamp(4e5 / f, 3, 60), pts = []; let x = 240, hi = true;
      pts.push([x, 60]);
      while (x < 328) { const nx = Math.min(328, x + per / 2); pts.push([x, hi ? 32 : 60], [nx, hi ? 32 : 60]); x = nx; hi = !hi; }
      s += poly(pts, "scope-t");
      s += `<rect class="dist-box" x="136" y="110" width="190" height="80" rx="6"/>${T(231, 134, `depth ${l.toFixed(1)} cm`, "middle", "dist-t")}${T(231, 156, `C = ${eng(C, "F", 3)}`, "middle", "dist-t")}${T(231, 178, `f = ${eng(f, "Hz", 3)}`, "middle", "dist-t on")}`;
      c.scene.innerHTML = svg(340, 230, `Water depth ${l.toFixed(1)} cm, sensor capacitance ${eng(C, "F", 3)}, 555 frequency ${eng(f, "Hz", 3)}`, s, "scene");
      const A = axes({ x: [0, 20], y: [0, 400], xt: [0, 5, 10, 15, 20], yt: [0, 100, 200, 300, 400], xl: "Water depth (cm)", yl: "555 frequency (kHz)" });
      c.graph.innerHTML = svg(A.W, A.H, "555 frequency against water depth", A.s + poly(curve(A, (q) => fof(q) / 1000, 0, 20, 100), "trace-a") + dot(A.X(l), A.Y(f / 1000)) + label(A.X(l) + (l > 12 ? -8 : 8), A.Y(f / 1000) - 10, eng(f, "Hz", 3), l > 12 ? "end" : "start"));
      c.read.innerHTML = `More water between the wires → bigger capacitance → the capacitor takes longer to charge → <strong>lower frequency</strong>. At ${l.toFixed(1)} cm: C = ${eng(C, "F", 3)}, f = <strong>${eng(f, "Hz", 3)}</strong>. The ESP32 counts the pulses to get f, then works back to the depth.`;
      if (l !== lastL) {
        lastL = l;
        steps.innerHTML = stepsHtml([
          step("Capacitance grows in a straight line with depth (this sensor)", "C = 20 pF + 12 pF/cm × l", `= 20 pF + 12 pF × ${l.toFixed(1)}`, `C = ${eng(C, "F", 4)}`),
          step("555 frequency (R<sub>A</sub> = 10 kΩ, R<sub>B</sub> = 100 kΩ)", "f = 1.44 ÷ ((R<sub>A</sub> + 2R<sub>B</sub>) C)", `= 1.44 ÷ (210 kΩ × ${eng(C, "F", 4)})`, `f = ${eng(f, "Hz", 4)}`)]);
      }
    };
    player(c.pl, el, { dur: 12, hold: 0, draw, still: 3, label: "Water depth position", clock: (t) => `${(10 - 10 * Math.cos((TAU * t) / 12)).toFixed(1)} cm` });
  }

  /* =====================================================================
     Tuned (LC) circuit
     ===================================================================== */
  const zSeries = (f, L, C, R) => Math.hypot(R, TAU * f * L - 1 / (TAU * f * C));
  const zPar = (f, L, C, R) => 1 / Math.hypot(1 / R, TAU * f * C - 1 / (TAU * f * L));
  function lcDiagram(Tl, lab, v, res) {
    const ser = v.type !== "par";
    let s = `<circle class="ac" cx="60" cy="120" r="18"/>${T(60, 126, "~", "middle", "tt")}`;
    if (ser) {
      s += D.wire([60, 102], [60, 40], [150, 40]) + D.ind(150, 40, 250) + D.wire([250, 40], [330, 40], [330, 90]) + D.cap(330, 90, 330, 150) + D.wire([330, 150], [330, 200], [250, 200]);
      s += D.res(150, 200, 250, 200) + D.wire([150, 200], [60, 200], [60, 138]);
      s += T(200, 26, `L = ${lab.L || "?"}`) + T(346, 125, `C = ${lab.C || "?"}`, "start") + T(200, 226, `R = ${lab.R || "?"} (coil)`, "middle", "small");
      s += `<path class="iarrow" d="M100,58H134m-7,-6l7,6l-7,6"/>` + T(117, 76, "I", "middle", "small");
    } else {
      s += D.wire([60, 102], [60, 40], [330, 40]) + D.wire([60, 138], [60, 200], [330, 200]);
      s += D.wire([180, 40], [180, 80]) + indV(180, 80, 160) + D.wire([180, 160], [180, 200]);
      s += D.wire([260, 40], [260, 90]) + D.cap(260, 90, 260, 150) + D.wire([260, 150], [260, 200]);
      s += D.wire([330, 40], [330, 80]) + D.res(330, 80, 330, 160) + D.wire([330, 160], [330, 200]) + D.dot(180, 40) + D.dot(260, 40) + D.dot(180, 200) + D.dot(260, 200);
      s += T(166, 124, `L = ${lab.L || "?"}`, "end") + T(276, 124, `C = ${lab.C || "?"}`, "start") + T(346, 124, `R`, "start", "small");
    }
    s += `<text x="420" y="226" text-anchor="end">f<tspan class="sb" dy="3">res</tspan><tspan dy="-3"> = </tspan><tspan class="val">${res ? eng(res.f0, "Hz") : "?"}</tspan></text>`;
    return s;
  }
  function lcCompute(v) {
    const ser = v.type !== "par", f0 = 1 / (TAU * Math.sqrt(v.L * v.C)), xl = TAU * f0 * v.L, xc = 1 / (TAU * f0 * v.C);
    return { sum: `f<sub>res</sub> = ${eng(f0, "Hz")}; at resonance |Z| is a ${ser ? "minimum" : "maximum"} (${eng(v.R, "Ω")})`, f0, steps: [
      step("Resonant frequency", "f<sub>res</sub> = 1 ÷ (2π √(L C))", `= 1 ÷ (2π √(${eng(v.L, "H")} × ${eng(v.C, "F")}))`, `f<sub>res</sub> = ${eng(f0, "Hz")}`),
      step("Reactances at f<sub>res</sub>", "X<sub>L</sub> = 2πfL, X<sub>C</sub> = 1 ÷ (2πfC)", `X<sub>L</sub> = ${eng(xl, "Ω")}, X<sub>C</sub> = ${eng(xc, "Ω")}`, "X<sub>L</sub> = X<sub>C</sub>: they cancel"),
      ser ? step("Series LC", "|Z| = √(R² + (X<sub>L</sub> − X<sub>C</sub>)²)", "at f<sub>res</sub>, X<sub>L</sub> − X<sub>C</sub> = 0", `|Z| = R = ${eng(v.R, "Ω")}: minimum, so the current is maximum`)
        : step("Parallel LC", "1/|Z| = √((1/R)² + (ωC − 1/(ωL))²)", "at f<sub>res</sub>, ωC − 1/(ωL) = 0", `|Z| = R = ${eng(v.R, "Ω")}: maximum, so the current from the source is minimum`)] };
  }
  function lcRender(extra, res, v) {
    if (!res) { extra.innerHTML = ""; return; }
    const ser = v.type !== "par", zf = (f) => (ser ? zSeries(f, v.L, v.C, v.R) : zPar(f, v.L, v.C, v.R)), lf0 = Math.log10(res.f0);
    const zs = []; for (let i = 0; i <= 200; i++) zs.push(zf(10 ** (lf0 - 1.5 + (3 * i) / 200)));
    const y0 = Math.floor(Math.log10(Math.min(...zs))), y1 = Math.ceil(Math.log10(Math.max(...zs)));
    const A = axes({ x: [lf0 - 1.5, lf0 + 1.5], y: [y0, Math.max(y1, y0 + 1)], xt: [Math.ceil(lf0 - 1.5), Math.ceil(lf0 - 0.5), Math.ceil(lf0 + 0.5)].filter((q) => q <= lf0 + 1.5), fx: (q) => eng(10 ** q, "Hz", 3), yt: Array.from({ length: Math.max(y1, y0 + 1) - y0 + 1 }, (_, i) => y0 + i), fy: (q) => eng(10 ** q, "Ω", 3), l: 60, xl: "Frequency (log scale)", yl: "", H: 240 });
    let g = A.s + poly(curve(A, (q) => Math.log10(zf(10 ** q)), lf0 - 1.5, lf0 + 1.5, 300), "trace-a");
    g += `<line class="mk" x1="${A.X(lf0)}" x2="${A.X(lf0)}" y1="${A.t}" y2="${A.t + A.ph}"/>` + dot(A.X(lf0), A.Y(Math.log10(zf(res.f0)))) + label(A.X(lf0) + 6, A.t + 14, `fres = ${eng(res.f0, "Hz")}`, "start", "mklab");
    extra.innerHTML = `<h4 class="sub-h">Impedance |Z| Against Frequency</h4><div class="plot-box">${svg(A.W, A.H, `Impedance against frequency for a ${ser ? "series" : "parallel"} LC circuit, with a ${ser ? "dip" : "peak"} at resonance`, g)}</div>
      <p class="small-note">${ser ? "A sharp dip: at f<sub>res</sub> the series circuit lets the most current through." : "A sharp peak: at f<sub>res</sub> the parallel (tank) circuit blocks the most."}</p>`;
  }

  // Energy sloshing between C and L at resonance
  function mountTank(el) {
    const c = pvCard(el);
    const draw = (t) => {
      const ph = (TAU * t) / 4, q = Math.cos(ph), i = -Math.sin(ph), ec = q * q, elr = i * i;
      let s = D.wire([80, 40], [240, 40]) + D.wire([80, 200], [240, 200]) + D.wire([80, 40], [80, 90]) + D.wire([80, 150], [80, 200]) + D.wire([240, 40], [240, 70]) + D.wire([240, 170], [240, 200]);
      s += `<path class="w" d="M60,90H100M60,150H100"/><rect x="62" y="96" width="36" height="48" class="efield" style="opacity:${(ec * 0.8).toFixed(2)}"/>`;
      const n = Math.round(Math.abs(q) * 4);
      for (let k = 0; k < n; k++) s += T(66 + k * 9, q > 0 ? 86 : 164, "+", "middle", "chg p") + T(66 + k * 9, q > 0 ? 164 : 86, MINUS, "middle", "chg m");
      s += indV(240, 70, 170).replace('class="w"', 'class="w coilw"');
      for (let k = 1; k <= 3; k++) s += `<ellipse class="bfield" cx="240" cy="120" rx="${14 + k * 12}" ry="${40 + k * 8}" style="opacity:${(elr * (0.9 - k * 0.2)).toFixed(2)}"/>`;
      if (Math.abs(i) > 0.15) s += `<path class="iarrow" d="M${i > 0 ? 130 : 190},28H${i > 0 ? 190 : 130}m${i > 0 ? -7 : 7},-6l${i > 0 ? 7 : -7},6l${i > 0 ? -7 : 7},6" style="opacity:${Math.abs(i).toFixed(2)}"/>`;
      s += T(80, 222, "C: electric field", "middle", "small") + T(240, 222, "L: magnetic field", "middle", "small");
      s += `<rect class="ebar" x="290" y="${190 - ec * 140}" width="12" height="${ec * 140}"/><rect class="ebar l" x="308" y="${190 - elr * 140}" width="12" height="${elr * 140}"/>${T(296, 206, "E<tspan class='sb' dy='3'>C</tspan>", "middle", "small")}${T(314, 206, "E<tspan class='sb' dy='3'>L</tspan>", "middle", "small")}`;
      c.scene.innerHTML = svg(330, 230, "Energy moving back and forth between the capacitor and the inductor", s, "scene");
      const A = axes({ x: [0, 8], y: [-1.2, 1.2], xt: [0, 2, 4, 6, 8], yt: [-1, 0, 1], xl: "Time (one cycle = 4 s here)", yl: "" });
      const g = A.s + poly(curve(A, (x) => Math.cos((TAU * x) / 4), 0, 8, 120), "trace-a") + poly(curve(A, (x) => -Math.sin((TAU * x) / 4), 0, 8, 120), "trace-d") + dot(A.X(t % 8), A.Y(q)) + dot(A.X(t % 8), A.Y(i), "shot");
      c.graph.innerHTML = svg(A.W, A.H, "Capacitor voltage and inductor current over time", g) + `<p class="legend"><span class="key"></span>capacitor voltage <span class="key digital"></span>current</p>`;
      c.read.innerHTML = ec > 0.8 ? "All the energy is in the <strong>capacitor's electric field</strong> (fully charged, no current)." : elr > 0.8 ? "All the energy is in the <strong>inductor's magnetic field</strong> (maximum current, capacitor empty)." : "Energy is moving between the capacitor and the inductor. This happens f<sub>res</sub> times a second.";
    };
    player(c.pl, el, { dur: 8, hold: 0, draw, still: 0.5, label: "Oscillation position" });
  }

  // Real situation: a metal detector (an LC oscillator whose L changes near metal)
  const TARGETS = { coin: { name: "Coin (non-ferrous)", dL: -0.03 }, nail: { name: "Iron nail", dL: 0.04 } };
  function mountDetector(el) {
    const S = { k: "coin" }, L0 = 1e-3, Cd = 100e-9;
    const c = pvCard(el, chips("Buried object", Object.entries(TARGETS).map(([k, o]) => [k, o.name]), S.k), fold("Good to Know: Contactless Cards Are Tuned Circuits", `<ol class="steps">${stepsHtml([
      step("A contactless card or tag (NFC) is a coil and a capacitor", "f<sub>res</sub> = 1 ÷ (2π √(L C))", "L ≈ 2 µH (the antenna coil in the card), C ≈ 69 pF", "f<sub>res</sub> ≈ 13.56 MHz: the NFC frequency"),
      step("Why it matters", "", "", "The reader's field makes the card's LC circuit resonate, which powers the chip without a battery.")])}</ol>`));
    const xAt = (t) => lerp(30, 300, 0.5 - 0.5 * Math.cos((TAU * t) / 8)), near = (x) => Math.exp(-(((x - 170) / 34) ** 2));
    const Lof = (x) => L0 * (1 + TARGETS[S.k].dL * near(x)), fof = (x) => 1 / (TAU * Math.sqrt(Lof(x) * Cd));
    const f0 = 1 / (TAU * Math.sqrt(L0 * Cd));
    const draw = (t) => {
      const x = xAt(t), f = fof(x), df = (f - f0) / f0, beep = Math.abs(df) > 0.005;
      let s = `<rect class="soil" x="0" y="150" width="340" height="80"/><rect class="sky" x="0" y="0" width="340" height="150"/>`;
      s += S.k === "coin" ? `<ellipse class="coin" cx="170" cy="192" rx="14" ry="5"/>` : `<rect class="nail" x="150" y="188" width="40" height="5" rx="2"/>`;
      s += `<line class="shaft" x1="${x + 30}" y1="20" x2="${x}" y2="126"/><ellipse class="searchcoil${beep ? " on" : ""}" cx="${x}" cy="134" rx="34" ry="8"/>`;
      if (beep) for (let k = 1; k <= 3; k++) s += `<path class="snd" d="M${x + 44 + k * 8},${60 - k * 4}q8,14 0,28" style="opacity:${(1 - k * 0.25).toFixed(2)}"/>`;
      s += `<rect class="dist-box" x="8" y="10" width="170" height="44" rx="6"/>${T(93, 28, `L = ${eng(Lof(x), "H", 4)}`, "middle", "dist-t")}${T(93, 46, `f = ${eng(f, "Hz", 4)}`, "middle", beep ? "dist-t on" : "dist-t")}`;
      c.scene.innerHTML = svg(340, 230, `Metal detector coil ${Math.abs(x - 170) < 30 ? "over" : "away from"} the buried object; frequency ${eng(f, "Hz", 4)}`, s, "scene");
      const A = axes({ x: [0, 16], y: [15.4, 16.4], xt: [0, 4, 8, 12, 16], yt: [15.5, 15.75, 16, 16.25], fy: (q) => q.toFixed(2), xl: "Time (s)", yl: "Oscillator f (kHz)" });
      const pts = []; for (let k = 0; k <= 160; k++) { const q = (k / 160) * (t % 16); pts.push([A.X(q), A.Y(fof(xAt(q)) / 1000)]); }
      c.graph.innerHTML = svg(A.W, A.H, "Oscillator frequency against time as the coil sweeps over the object", A.s + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(f0 / 1000)}" y2="${A.Y(f0 / 1000)}"/>` + poly(pts, "trace-a"));
      c.read.innerHTML = `With no metal the coil (1 mH) and capacitor (100 nF) resonate at <strong>${eng(f0, "Hz", 4)}</strong>. ${beep ? `Over the ${S.k === "coin" ? "coin, eddy currents <strong>lower</strong> L" : "nail, the iron <strong>raises</strong> L"}, so f shifts by ${(df * 100).toFixed(2)}%: <strong>beep!</strong>` : "Sweep the coil over the ground and watch the frequency."}`;
    };
    const pl = player(c.pl, el, { dur: 16, hold: 0, draw, still: 2, label: "Sweep position" });
    pick(el, (k) => { S.k = k; pl.redraw(); });
  }

  /* =====================================================================
     Active sensor: piezo charge → voltage through a resistor
     ===================================================================== */
  function mountPiezo(el) {
    const S = { R: 1e6, C: 20e-9 }, Q = 10e-9; // 5 N press → 10 nC
    const c = pvCard(el, chips("Resistor R", [["1e5", "100 kΩ"], ["1e6", "1 MΩ"], ["1e7", "10 MΩ"]], "1e6") + chips("Piezo capacitance C", [["2e-8", "20 nF (typical piezo disc)"], ["1e-6", "1 µF"]], "2e-8"),
      fold("Step-by-Step Working", `<ol class="steps"></ol>`));
    const steps = el.querySelector(".steps");
    const vt = (x) => { const tau = S.R * S.C, v0 = Q / S.C; let v = 0; if (x >= 1) v += v0 * Math.exp(-(x - 1) / tau); if (x >= 6) v -= v0 * Math.exp(-(x - 6) / tau); return v; };
    const work = () => {
      const tau = S.R * S.C;
      steps.innerHTML = stepsHtml([
        step("Voltage the moment it is pressed", "V<sub>0</sub> = Q ÷ C", `= 10 nC ÷ ${eng(S.C, "F")}`, `V<sub>0</sub> = ${eng(Q / S.C, "V")}`),
        step("Time constant: how fast the charge leaks through R", "τ = R C", `= ${eng(S.R, "Ω")} × ${eng(S.C, "F")}`, `τ = ${eng(tau, "s")}`),
        step("Voltage while the force is held", "V(t) = V<sub>0</sub> e<sup>−t/τ</sup>", `after 5τ = ${eng(5 * tau, "s")}`, "V has fallen to under 1% of V<sub>0</sub>"),
        step("R and C form a high-pass filter", "f<sub>c</sub> = 1 ÷ (2π R C)", `= 1 ÷ (2π × ${eng(tau, "s")})`, `f<sub>c</sub> = ${eng(1 / (TAU * tau), "Hz")}: changes faster than this are measured, a steady force is not`)]);
    };
    const draw = (t) => {
      const pressed = t >= 1 && t < 6, v = vt(t), sq = pressed ? 6 : 0;
      let s = `<rect class="pz-plate" x="30" y="${80 + sq}" width="96" height="9" rx="2"/><rect class="pz-crystal" x="38" y="${89 + sq}" width="80" height="${44 - 2 * sq}"/><rect class="pz-plate" x="30" y="${133 - sq}" width="96" height="9" rx="2"/>`;
      if (pressed) s += `<path class="push" d="M78,${24 + sq}v40m-10,-12l10,12l10,-12"/>` + T(96, 40, "5 N", "start", "small");
      const nq = Math.round(Math.min(1, Math.abs(v) / (Q / S.C)) * 4);
      for (let k = 0; k < nq; k++) s += T(52 + k * 18, 86 + sq, v > 0 ? "+" : MINUS, "middle", `chg ${v > 0 ? "p" : "m"}`);
      s += D.wire([126, 84 + sq], [200, 84 + sq], [200, 96]) + D.res(200, 96, 200, 160) + D.wire([200, 160], [200, 176]) + D.gnd(200, 176) + D.wire([126, 138 - sq], [150, 138 - sq], [150, 176]) + D.gnd(150, 176);
      s += T(214, 132, `R = ${eng(S.R, "Ω")}`, "start");
      s += `<rect class="meter" x="240" y="30" width="84" height="54" rx="8"/><rect class="lcd" x="246" y="38" width="72" height="26" rx="4"/>${T(282, 56, `${fx(v, 2)} V`, "middle", "lcdt sm")}${T(282, 78, "across R", "middle", "small")}`;
      s += T(78, 172, "model: source + C", "middle", "small");
      c.scene.innerHTML = svg(330, 230, `Piezo ${pressed ? "pressed with 5 N" : "released"}; voltage across R ${fx(v, 2)} V`, s, "scene");
      const v0 = Q / S.C, A = axes({ x: [0, 10], y: [-v0 * 1.2, v0 * 1.2], xt: [0, 2, 4, 6, 8, 10], yt: [-v0, 0, v0], fy: (q) => eng(q, "V", 2), l: 58, xl: "Time (s)", yl: "" });
      const pts = []; for (let k = 0; k <= 800; k++) { const x = (k / 800) * t; pts.push([A.X(x), A.Y(vt(x))]); }
      [1, 6].forEach((x) => { if (t >= x) { pts.push([A.X(x), A.Y(vt(x - 1e-9))], [A.X(x), A.Y(vt(x))]); } });
      pts.sort((a, b) => a[0] - b[0]);
      const force = [[A.X(0), A.Y(0)], [A.X(Math.min(t, 1)), A.Y(0)]];
      if (t > 1) force.push([A.X(1), A.Y(v0 * 0.9)], [A.X(Math.min(t, 6)), A.Y(v0 * 0.9)]);
      if (t > 6) force.push([A.X(6), A.Y(0)], [A.X(t), A.Y(0)]);
      c.graph.innerHTML = svg(A.W, A.H, "Voltage across the resistor after the piezo is pressed and released", A.s + poly(force, "trace-in") + poly(pts, "trace-a")) + `<p class="legend"><span class="key input"></span>force (held from 1 s to 6 s) <span class="key"></span>voltage across R</p>`;
      const tau = S.R * S.C;
      c.read.innerHTML = `τ = RC = <strong>${eng(tau, "s")}</strong>. The press makes a jump of ${eng(v0, "V")}, but ${tau < 0.5 ? "it leaks away almost at once, even though the force is still there" : "it slowly decays while the force is held"}; releasing gives a negative jump. A piezo circuit measures <strong>changes</strong> in force (knocks, vibration, sound), not a steady force.`;
    };
    const pl = player(c.pl, el, { dur: 10, hold: 1, draw, still: 7, label: "Press and release position", clock: (t) => `${t.toFixed(1)} s` });
    el.querySelectorAll(".chips-row").forEach((row, i) => wireChips(row, (val) => { if (i === 0) S.R = +val; else S.C = +val; work(); pl.redraw(); }));
    work();
  }

  /* =====================================================================
     Sections
     ===================================================================== */
  const Rlc = (v) => (v.type === "par" ? v.Rp : v.Rs);
  const SECTIONS = [
    // ---------- Introduction ----------
    { id: "why", group: "intro", title: "Why Do Sensors Need a Transduction Circuit?", toc: "Why a Circuit?",
      intro: `<p>A <strong>passive sensor</strong> (resistive, capacitive or inductive) only changes a property: its R, C or L. The ESP32 cannot read a resistance or a capacitance directly. It can read a <strong>voltage</strong> (with its ADC) and it can count a <strong>frequency</strong> (with a timer). A transduction circuit turns the sensor's change into one of these. The three common techniques for passive sensors are:</p>
        <ol class="rules"><li><strong>voltage divider and bridge circuits</strong>: R, C or L change → a voltage</li><li><strong>timing circuits</strong> (the 555 timer): C or R change → a frequency</li><li><strong>tuned (LC) circuits</strong>: L or C change → a resonant frequency</li></ol>
        <p>An <strong>active sensor</strong> makes its own signal, but it may not be a voltage: a piezo gives a <strong>charge</strong>, which a resistor turns into a voltage.</p>`,
      mount: mountFlow },

    // ---------- Voltage divider ----------
    { id: "divider", group: "divider", title: "The Voltage Divider", toc: "Divider Rule",
      intro: `<p>Two impedances in series share the input voltage. Z<sub>1</sub> is fixed and Z<sub>2</sub> can be the sensor (or the other way round):</p>
        <p class="formula">V<sub>out</sub> = V<sub>in</sub> × Z<sub>2</sub> ÷ (Z<sub>1</sub> + Z<sub>2</sub>)</p>
        <p>Z can be a resistance, <strong>Z = R</strong>, or the reactance of a capacitor, <strong>Z<sub>C</sub> = 1 ÷ (ωC) = 1 ÷ (2πfC)</strong>, or of an inductor, <strong>Z<sub>L</sub> = ωL = 2πfL</strong>. Capacitor and inductor dividers need an AC supply. Choose the type and change the values.</p>`,
      inputs: [F("type", "sel", "R", null, { label: "Divider made of", options: [["R", "Resistors (R1, R2)"], ["C", "Capacitors (C1, C2)"], ["L", "Inductors (L1, L2)"]] }),
        F("Vin", "num", 5, null, { unit: "V", positive: true, label: "Input voltage V<sub>in</sub>", name: "Vin" }),
        F("R1", "R", 10e3, "top", { show: (v) => v.type === "R" }), F("R2", "R", 15e3, "bottom", { show: (v) => v.type === "R" }),
        F("C1", "C", 100e-9, "top", { show: (v) => v.type === "C" }), F("C2", "C", 220e-9, "bottom", { show: (v) => v.type === "C" }),
        F("L1", "L", 10e-3, "top", { show: (v) => v.type === "L" }), F("L2", "L", 22e-3, "bottom", { show: (v) => v.type === "L" }),
        F("f", "f", 1000, "AC frequency", { show: (v) => v.type !== "R" })],
      view: "0 0 400 240", diagram: dividerDiagram, caption: "The components and labels follow your choice.", compute: dividerCompute,
      after: `<div class="callout info"><strong>Good to know</strong>1 ÷ (ωC) and ωL are the <em>sizes</em> of the impedances (the reactances). When both parts of a divider are the same type, the frequency cancels: a capacitor divider gives V<sub>in</sub> × C<sub>1</sub> ÷ (C<sub>1</sub> + C<sub>2</sub>) and an inductor divider gives V<sub>in</sub> × L<sub>2</sub> ÷ (L<sub>1</sub> + L<sub>2</sub>). Mixing a resistor with a capacitor in one divider needs complex numbers, because their voltages are not in phase.</div>` },
    { id: "explorer", group: "divider", title: "What Changes V<sub>out</sub>?", toc: "Divider Explorer",
      intro: `<p>Press play to sweep R<sub>2</sub>, or drag the sliders yourself. Watch the output level and the two curves: one for changing R<sub>2</sub>, one for changing R<sub>1</sub>.</p>`,
      mount: mountExplorer },
    { id: "streetlight", group: "divider", title: "Real Situation: An Automatic Street Light", toc: "LDR Street Light",
      intro: `<p>A <strong>light-dependent resistor (LDR)</strong> is about 5 kΩ in normal light and 300 kΩ in complete darkness. In a divider with a fixed 4.7 kΩ resistor and a 5 V supply it turns light into a voltage, and a controller switches the street lamp on when the voltage crosses a set level.</p>
        <ul class="rules"><li><strong>LDR at the bottom:</strong> about 2.5 V in normal light, rising to about 5 V in the dark.</li><li><strong>LDR at the top:</strong> about 2.5 V in normal light, falling to about 0 V in the dark.</li></ul>
        <p>Either way the output is very non-linear, and only roughly linear over a short range (about 5 to 10 kΩ).</p>
        <div class="cmp-grid">${photo("ldr.jpg", "A light-dependent resistor (LDR).", "small")}</div>`,
      mount: mountStreetLight,
      after: `<div class="callout info"><strong>Good to know</strong>The ESP32's ADC reads at most 3.3 V, so on an ESP32 the divider is powered from 3.3 V instead of 5 V. The shape of the curve is the same.</div>` },

    // ---------- Bridge circuits ----------
    { id: "bridge", group: "bridge", title: "The Wheatstone Bridge", toc: "Wheatstone Bridge",
      intro: `<p>A voltage divider has two shortcomings: its transfer function is <strong>non-linear</strong>, and its output has a <strong>voltage offset</strong> from zero. A bridge, two dividers side by side, removes the offset. Its output is the difference between the two middle points:</p>
        <p class="formula">V<sub>out</sub> = V<sub>C</sub> − V<sub>D</sub> = (R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>) − R<sub>4</sub> ÷ (R<sub>3</sub> + R<sub>4</sub>)) × V<sub>s</sub></p>
        <p>The four arms can be resistors, capacitors or inductors (impedances Z). The bridge is <strong>balanced</strong> (V<sub>out</sub> = 0) when the two ratios are equal, <strong>R<sub>1</sub> ÷ R<sub>2</sub> = R<sub>3</sub> ÷ R<sub>4</sub></strong>, which includes the case where all four are equal. A <strong>galvanometer</strong> between C and D shows the balance: no current at balance, and the needle swings one way or the other depending on which point is higher.</p>
        <div class="cmp-grid two-photo">${photo("../chapter-1/wheatstone-bridge.jpg", "A laboratory Wheatstone bridge.", "small")}${photo("../chapter-1/galvanometer-mechanism.jpg", "Inside a galvanometer: a coil in a magnetic field moves the needle (see Chapter 1).", "small")}</div>`,
      inputs: [F("Vs", "num", 12, null, { unit: "V", positive: true, label: "Supply V<sub>s</sub>", name: "Vs" }),
        F("R1", "R", 1e3, "A–C"), F("R2", "R", 2.2e3, "C–B"), F("R3", "R", 3.3e3, "A–D"), F("R4", "R", 4.7e3, "D–B")],
      view: "0 0 440 270", diagram: bridgeDiagram, render: bridgeRender, compute: bridgeCompute, caption: "The needle and the current arrow follow your values. A is the positive terminal.",
      after: WORKED + watch([video("ZqAM_wQ35ow", "Basic configurations #1: Wheatstone bridge", "Electronoobs")]) },
    { id: "offset", group: "bridge", title: "Divider or Bridge? Removing the Offset", toc: "Offset Removed",
      intro: `<p>The same LDR is used twice: in a divider (LDR at the top, 4.7 kΩ at the bottom, 5 V) and in a bridge whose other three arms are 4.7 kΩ. Press play to change the light.</p>`,
      mount: mountOffset },
    { id: "scale", group: "bridge", title: "Real Situation: A Digital Weighing Scale", toc: "Weighing Scale",
      intro: `<p>A <strong>strain gauge</strong> is a zig-zag metal foil glued to a beam. When a load bends the beam, the foil stretches and its resistance rises by ΔR = GF × ε × R, where ε is the strain and GF the gauge factor (about 2). The change is tiny, so the gauge is placed in a bridge (a <em>quarter bridge</em>: one gauge and three fixed resistors), whose output is about <strong>V<sub>out</sub> ≈ V<sub>s</sub> × GF × ε ÷ 4</strong>, then amplified.</p>
        <div class="cmp-grid">${photo("strain-gauge.jpg", "A foil strain gauge.", "small")}</div>`,
      mount: mountScale },

    // ---------- Timing circuit ----------
    { id: "timer", group: "timing", title: "The 555 Timer in Astable Mode", toc: "555 Timer",
      intro: `<p>A <strong>timing circuit</strong> produces pulses at precise intervals. In <strong>astable</strong> mode the 555 timer charges a capacitor through R<sub>A</sub> + R<sub>B</sub> and discharges it through R<sub>B</sub>, again and again, between ⅓ and ⅔ of V<sub>CC</sub>. The output is a square wave:</p>
        <p class="formula">f = 1.44 ÷ ((R<sub>A</sub> + 2R<sub>B</sub>) C)</p>
        <p>If C is a <strong>capacitive sensor</strong>, its change becomes a change of frequency, and one end of the sensor can be grounded. Frequency is easy for a microcontroller to measure and is not upset by small voltage noise.</p>
        <div class="cmp-grid">${photo("ne555-timer.jpg", "555 timer chips.", "small")}</div>`,
      inputs: [F("RA", "R", 1e3, null, { label: "R<sub>A</sub>" }), F("RB", "R", 10e3, null, { label: "R<sub>B</sub>" }), F("C", "C", 10e-9, "timing capacitor or sensor"),
        F("Vcc", "num", 9, null, { unit: "V", positive: true, label: "Supply V<sub>CC</sub>", name: "Vcc" })],
      view: "0 0 440 250", diagram: timerDiagram, render: timerRender, compute: timerCompute, caption: "The 555 in astable mode, pin numbers shown." },
    { id: "leveltimer", group: "timing", title: "Real Situation: A Capacitive Water-Level Sensor", toc: "Level Sensor",
      intro: `<p>This sensor is two insulated wires taped along a ruler. The green wire is the ground; the white wire is insulated from the water. Together they form a capacitor whose capacitance depends on the water depth l, like the plate sensor in Chapter 3:</p>
        <p class="formula">C = C<sub>l</sub> + C<sub>L−l</sub> = ε<sub>0</sub>(W ÷ D)(ε<sub>l</sub> l + ε<sub>L−l</sub>(L − l))</p>
        <p>So C rises in a straight line with depth, and the 555 turns it into a frequency. The same idea is used in <strong>capacitive soil-moisture sensors</strong>, where wetter soil means a higher capacitance.</p>
        <div class="cmp-grid two-photo">${photo("timer-sensor-board.jpg", "The 555 timer board, 9 V battery and two-wire sensor.", "small")}${photo("two-wire-sensor-water.jpg", "The sensor standing in water.", "small tall")}</div>`,
      mount: mountLevelTimer,
      after: `<div class="callout info"><strong>Good to know</strong>In this example the capacitance rises by 12 pF for every centimetre of water. That is much less than ε<sub>water</sub> = 80 suggests, because the wire's plastic insulation sits in series with the water.</div>` },

    // ---------- Tuned circuit ----------
    { id: "lc", group: "tuned", title: "Tuned (LC) Circuits and Resonance", toc: "LC Resonance",
      intro: `<p>A <strong>tuned circuit</strong> (resonant or tank circuit) contains an inductor and a capacitor. At the <strong>resonant frequency</strong> their reactances are equal and cancel:</p>
        <p class="formula">f<sub>res</sub> = 1 ÷ (2π √(L C))</p>
        <ul class="rules"><li><strong>Series LC:</strong> at f<sub>res</sub> the impedance is a <strong>minimum</strong>, so the most current flows.</li><li><strong>Parallel LC:</strong> at f<sub>res</sub> the impedance is a <strong>maximum</strong>, so the least current is drawn from the source, while the current circulates between L and C.</li></ul>
        <p>If the sensor changes L or C, the resonant frequency moves. Tuned circuits are also used in filters, radio tuners and oscillators.</p>`,
      inputs: [F("type", "sel", "ser", null, { label: "Circuit", options: [["ser", "Series LC"], ["par", "Parallel LC (tank)"]] }),
        F("L", "L", 1e-3), F("C", "C", 100e-9),
        F("Rs", "R", 10, "the coil's own resistance", { label: "Series resistance R", show: (v) => v.type !== "par" }),
        F("Rp", "R", 10e3, "losses across the tank", { label: "Parallel resistance R", show: (v) => v.type === "par" })],
      view: "0 0 440 240", diagram: (Tl, lab, v, res) => lcDiagram(Tl, Object.assign({}, lab, { R: v.type === "par" ? lab.Rp : lab.Rs }), v, res),
      compute: (v) => lcCompute(Object.assign({}, v, { R: Rlc(v) })), render: (extra, res, v) => lcRender(extra, res, Object.assign({}, v, { R: Rlc(v) })),
      caption: "The circuit follows your choice of series or parallel.",
      after: `<div class="callout info"><strong>Good to know</strong>Whether an LC circuit passes or blocks f<sub>res</sub> depends on where it sits. In the signal path, a series LC is a band-pass filter and a parallel LC is a band-stop filter. Connected across the signal to ground they swap roles: the parallel tank in a radio tuner picks out one station (band-pass).</div>` },
    { id: "tank", group: "tuned", title: "Inside the Tank: Energy Moving Between L and C", toc: "Energy at Resonance",
      intro: `<p>At resonance a tuned circuit stores energy and passes it back and forth: the capacitor stores it in the <strong>electric field</strong> between its plates, and the inductor stores it in its <strong>magnetic field</strong>.</p>`,
      mount: mountTank },
    { id: "detector", group: "tuned", title: "Real Situation: A Metal Detector", toc: "Metal Detector",
      intro: `<p>A metal detector's search coil is the L of an LC oscillator. Metal under the coil changes L: eddy currents in a coin <strong>lower</strong> it, iron <strong>raises</strong> it. The resonant frequency shifts, and the detector beeps. The inductive proximity sensor in Chapter 3 works the same way.</p>`,
      mount: mountDetector },

    // ---------- Active sensors ----------
    { id: "piezo", group: "active", title: "Transduction for Active Sensors: The Piezo", toc: "Piezo Circuit",
      intro: `<p>Active sensors generate their own signal, but it may not be a voltage. A piezoelectric sensor generates <strong>charge</strong>: when it is deformed, charges build up on its surfaces. It can be modelled as a voltage source in series with a capacitor (its own capacitance C).</p>
        <p>The charge is turned into a voltage by letting it flow through a <strong>resistor</strong>. The voltage starts at V<sub>0</sub> = Q ÷ C and then leaks away with the time constant <strong>τ = RC</strong>. Together R and C form a high-pass filter, f<sub>c</sub> = 1 ÷ (2πRC).</p>`,
      mount: mountPiezo,
      after: `<div class="callout info"><strong>Good to know</strong>For slow or nearly steady forces, instruments use a <strong>charge amplifier</strong>: an op-amp with a capacitor in its feedback loop, which turns the charge into a voltage without letting it leak away quickly.</div>` }
  ];

  /* =====================================================================
     Exercises (practice: different numbers from the home exercise)
     ===================================================================== */
  const W_ = (list) => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml(list)}</ol></div>`;
  const EXERCISES = [
    { id: "c4-q1", title: "Exercise 1: Voltage Divider",
      q: `<p>V<sub>in</sub> = <strong>9 V</strong>, R<sub>1</sub> = <strong>3 kΩ</strong> (top), R<sub>2</sub> = <strong>6 kΩ</strong> (bottom).</p>`,
      ans: [{ l: "V<sub>out</sub>", u: "V", v: 6 }, { l: "V<sub>out</sub> if R<sub>2</sub> is changed to 3 kΩ", u: "V", v: 4.5 }, { l: "V<sub>out</sub> if instead R<sub>1</sub> is changed to 6 kΩ (R<sub>2</sub> = 6 kΩ)", u: "V", v: 4.5 }],
      hints: [`V<sub>out</sub> = V<sub>in</sub> × R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>).`, `When R<sub>1</sub> = R<sub>2</sub>, V<sub>out</sub> is exactly half of V<sub>in</sub>.`],
      working: () => W_([step("Original", "V<sub>out</sub> = 9 × 6 ÷ (3 + 6)", "", "<strong>6 V</strong>"), step("R<sub>2</sub> = 3 kΩ", "9 × 3 ÷ (3 + 3)", "", "<strong>4.5 V</strong> (smaller R<sub>2</sub> → lower V<sub>out</sub>)"), step("R<sub>1</sub> = 6 kΩ", "9 × 6 ÷ (6 + 6)", "", "<strong>4.5 V</strong> (larger R<sub>1</sub> → lower V<sub>out</sub>)")]) },
    { id: "c4-q2", title: "Exercise 2: Capacitor Divider",
      q: `<p>A 10 V, 1 kHz AC supply feeds C<sub>1</sub> = <strong>100 nF</strong> (top) and C<sub>2</sub> = <strong>400 nF</strong> (bottom).</p>`,
      ans: [{ l: "Reactance of C<sub>1</sub>", u: "Ω", v: 1591.5 }, { l: "V<sub>out</sub> across C<sub>2</sub>", u: "V", v: 2 }, { l: "If the frequency doubles, V<sub>out</sub>", opts: ["doubles", "halves", "stays the same"], v: 2 }],
      hints: [`X<sub>C</sub> = 1 ÷ (2πfC). Then use the divider rule with the reactances.`, `For two capacitors the frequency cancels: V<sub>out</sub> = V<sub>in</sub> × C<sub>1</sub> ÷ (C<sub>1</sub> + C<sub>2</sub>).`],
      working: () => W_([step("X<sub>C1</sub>", "1 ÷ (2π × 1000 × 100 × 10<sup>−9</sup>)", "", "<strong>1592 Ω</strong>"), step("X<sub>C2</sub>", "1 ÷ (2π × 1000 × 400 × 10<sup>−9</sup>)", "", "398 Ω"), step("V<sub>out</sub>", "10 × 398 ÷ (1592 + 398) = 10 × 100 ÷ 500", "", "<strong>2 V</strong>"), step("Frequency doubles", "both reactances halve; the ratio is unchanged", "", "<strong>stays the same</strong>")]) },
    { id: "c4-q3", title: "Exercise 3: LDR Night Light",
      q: `<p>An LDR (<strong>2 kΩ</strong> in light, <strong>200 kΩ</strong> in the dark) is at the bottom of a divider with a fixed <strong>10 kΩ</strong> resistor on top, powered from <strong>3.3 V</strong>.</p>`,
      ans: [{ l: "V<sub>out</sub> in the light", u: "V", v: 0.55 }, { l: "V<sub>out</sub> in the dark", u: "V", v: 3.143 }, { l: "To make V<sub>out</sub> fall in the dark instead, put the LDR", opts: ["at the top", "at the bottom", "in parallel with the resistor"], v: 0 }],
      hints: [`The LDR is R<sub>2</sub> here.`, `Moving the LDR to the top swaps which resistor V<sub>out</sub> is measured across.`],
      working: () => W_([step("Light", "3.3 × 2 ÷ (10 + 2)", "", "<strong>0.55 V</strong>"), step("Dark", "3.3 × 200 ÷ (10 + 200)", "", "<strong>3.14 V</strong>"), step("Reverse the action", "", "", "Put the LDR <strong>at the top</strong>")]) },
    { id: "c4-q4", title: "Exercise 4: Unbalanced Bridge",
      q: `<p>V<sub>s</sub> = <strong>12 V</strong>. R<sub>1</sub> = 2 kΩ (A–C), R<sub>2</sub> = 3 kΩ (C–B), R<sub>3</sub> = 4 kΩ (A–D), R<sub>4</sub> = 5 kΩ (D–B). A is positive.</p>`,
      ans: [{ l: "V<sub>C</sub>", u: "V", v: 7.2 }, { l: "V<sub>out</sub> = V<sub>C</sub> − V<sub>D</sub>", u: "V", v: 0.5333 }, { l: "R<sub>4</sub> that would balance the bridge", u: "kΩ", v: 6 }],
      hints: [`V<sub>C</sub> = V<sub>s</sub> R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>) and V<sub>D</sub> = V<sub>s</sub> R<sub>4</sub> ÷ (R<sub>3</sub> + R<sub>4</sub>).`, `At balance R<sub>4</sub> = R<sub>2</sub>R<sub>3</sub> ÷ R<sub>1</sub>.`],
      working: () => W_([step("V<sub>C</sub>", "12 × 3 ÷ 5", "", "<strong>7.2 V</strong>"), step("V<sub>D</sub>", "12 × 5 ÷ 9", "", "6.667 V"), step("V<sub>out</sub>", "7.2 − 6.667", "", "<strong>0.533 V</strong>"), step("Balance", "R<sub>4</sub> = 3 × 4 ÷ 2", "", "<strong>6 kΩ</strong>")]) },
    { id: "c4-q5", title: "Exercise 5: Galvanometer Direction",
      q: `<p>V<sub>s</sub> = <strong>6 V</strong> (A positive). R<sub>1</sub> = 1 kΩ, R<sub>2</sub> = 1 kΩ, R<sub>3</sub> = 2 kΩ, R<sub>4</sub> = 1 kΩ, with a galvanometer between C and D.</p>`,
      ans: [{ l: "V<sub>out</sub> = V<sub>C</sub> − V<sub>D</sub>", u: "V", v: 1 }, { l: "Current through the galvanometer flows", opts: ["from C to D", "from D to C", "no current"], v: 0 }],
      hints: [`Find V<sub>C</sub> and V<sub>D</sub> separately.`, `Current flows from the higher potential to the lower one.`],
      working: () => W_([step("V<sub>C</sub>", "6 × 1 ÷ 2", "", "3 V"), step("V<sub>D</sub>", "6 × 1 ÷ 3", "", "2 V"), step("V<sub>out</sub>", "3 − 2", "", "<strong>1 V</strong>"), step("Direction", "", "", "C is higher: <strong>from C to D</strong>")]) },
    { id: "c4-q6", title: "Exercise 6: Finding an Unknown Resistor",
      q: `<p>A bridge is <strong>balanced</strong> with R<sub>1</sub> = 250 Ω (A–C), R<sub>2</sub> = 1 kΩ (C–B) and R<sub>4</sub> = 800 Ω (D–B). R<sub>3</sub> (A–D) is unknown.</p>`,
      ans: [{ l: "R<sub>3</sub>", u: "Ω", v: 200 }, { l: "The galvanometer current at balance is", opts: ["zero", "maximum", "equal to the supply current"], v: 0 }],
      hints: [`Balanced: R<sub>1</sub> ÷ R<sub>2</sub> = R<sub>3</sub> ÷ R<sub>4</sub>.`, `The supply voltage is not needed at balance.`],
      working: () => W_([step("Balance", "R<sub>3</sub> = R<sub>1</sub> R<sub>4</sub> ÷ R<sub>2</sub>", "= 250 × 800 ÷ 1000", "<strong>200 Ω</strong>"), step("At balance", "", "", "V<sub>C</sub> = V<sub>D</sub>: the galvanometer current is <strong>zero</strong>")]) },
    { id: "c4-q7", title: "Exercise 7: Strain Gauge Bridge",
      q: `<p>A <strong>120 Ω</strong> strain gauge (GF = <strong>2.1</strong>) in a quarter bridge with V<sub>s</sub> = <strong>5 V</strong> is strained by <strong>500 µε</strong>.</p>`,
      ans: [{ l: "ΔR", u: "Ω", v: 0.126 }, { l: "Bridge output (approximate)", u: "mV", v: 1.3125 }],
      hints: [`ΔR = GF × ε × R, with ε = 500 × 10<sup>−6</sup>.`, `V<sub>out</sub> ≈ V<sub>s</sub> × GF × ε ÷ 4.`],
      working: () => W_([step("ΔR", "2.1 × 500 × 10<sup>−6</sup> × 120", "", "<strong>0.126 Ω</strong>"), step("V<sub>out</sub>", "5 × 2.1 × 500 × 10<sup>−6</sup> ÷ 4", "", "<strong>1.31 mV</strong>")]) },
    { id: "c4-q8", title: "Exercise 8: 555 Timer",
      q: `<p>A 555 in astable mode has R<sub>A</sub> = <strong>2.2 kΩ</strong>, R<sub>B</sub> = <strong>6.8 kΩ</strong> and C = <strong>47 nF</strong>.</p>`,
      ans: [{ l: "Frequency", u: "Hz", v: 1939 }, { l: "Duty cycle", u: "%", v: 56.96 }, { l: "Time low t<sub>L</sub>", u: "ms", v: 0.2215 }],
      hints: [`f = 1.44 ÷ ((R<sub>A</sub> + 2R<sub>B</sub>) C).`, `Duty = (R<sub>A</sub> + R<sub>B</sub>) ÷ (R<sub>A</sub> + 2R<sub>B</sub>); t<sub>L</sub> = 0.693 R<sub>B</sub> C.`],
      working: () => W_([step("f", "1.44 ÷ ((2.2 + 13.6) kΩ × 47 nF)", "= 1.44 ÷ 7.426 × 10<sup>−4</sup>", "<strong>1939 Hz</strong>"), step("Duty", "9.0 ÷ 15.8", "", "<strong>57.0%</strong>"), step("t<sub>L</sub>", "0.693 × 6.8 kΩ × 47 nF", "", "<strong>0.2215 ms</strong>")]) },
    { id: "c4-q9", title: "Exercise 9: Level Sensor Frequency",
      q: `<p>A two-wire level sensor has C = <strong>30 pF + 10 pF per cm</strong> of water. It is the timing capacitor of a 555 with R<sub>A</sub> = 10 kΩ and R<sub>B</sub> = 100 kΩ.</p>`,
      ans: [{ l: "f at 5 cm depth", u: "kHz", v: 85.71 }, { l: "f at 12 cm depth", u: "kHz", v: 45.71 }, { l: "As the water rises, f", opts: ["rises", "falls", "stays the same"], v: 1 }],
      hints: [`First find C at each depth.`, `f = 1.44 ÷ ((R<sub>A</sub> + 2R<sub>B</sub>) C) with R<sub>A</sub> + 2R<sub>B</sub> = 210 kΩ.`],
      working: () => W_([step("5 cm", "C = 80 pF; f = 1.44 ÷ (210 kΩ × 80 pF)", "", "<strong>85.7 kHz</strong>"), step("12 cm", "C = 150 pF; f = 1.44 ÷ (210 kΩ × 150 pF)", "", "<strong>45.7 kHz</strong>"), step("Trend", "", "", "More water → bigger C → f <strong>falls</strong>")]) },
    { id: "c4-q10", title: "Exercise 10: LC Resonance",
      q: `<p>L = <strong>3.3 mH</strong> and C = <strong>68 nF</strong>.</p>`,
      ans: [{ l: "Resonant frequency", u: "kHz", v: 10.62 }, { l: "X<sub>L</sub> at resonance", u: "Ω", v: 220.3 }, { l: "A series LC at resonance has impedance that is", opts: ["a minimum", "a maximum"], v: 0 }],
      hints: [`f<sub>res</sub> = 1 ÷ (2π √(LC)).`, `At resonance X<sub>L</sub> = X<sub>C</sub> = 2πf<sub>res</sub>L (which also equals √(L/C)).`],
      working: () => W_([step("f<sub>res</sub>", "1 ÷ (2π √(3.3 × 10<sup>−3</sup> × 68 × 10<sup>−9</sup>))", "", "<strong>10.62 kHz</strong>"), step("X<sub>L</sub>", "2π × 10.62 kHz × 3.3 mH", "", "<strong>220 Ω</strong> (= X<sub>C</sub>)"), step("Series", "", "", "Impedance is a <strong>minimum</strong>")]) },
    { id: "c4-q11", title: "Exercise 11: Piezo Circuit",
      q: `<p>A piezo disc (C = <strong>20 nF</strong>) is connected across R = <strong>1 MΩ</strong>. A knock produces Q = <strong>40 nC</strong>.</p>`,
      ans: [{ l: "Voltage just after the knock", u: "V", v: 2 }, { l: "Time constant τ", u: "ms", v: 20 }, { l: "Cut-off frequency f<sub>c</sub>", u: "Hz", v: 7.958 }],
      hints: [`V<sub>0</sub> = Q ÷ C and τ = R C.`, `f<sub>c</sub> = 1 ÷ (2π R C) = 1 ÷ (2πτ).`],
      working: () => W_([step("V<sub>0</sub>", "40 nC ÷ 20 nF", "", "<strong>2 V</strong>"), step("τ", "1 MΩ × 20 nF", "", "<strong>20 ms</strong>"), step("f<sub>c</sub>", "1 ÷ (2π × 0.02 s)", "", "<strong>7.96 Hz</strong>")]) },
    { id: "c4-q12", title: "Exercise 12: Which Technique?",
      q: `<p>Match each circuit with what it gives the ESP32.</p>`,
      ans: [{ l: "LDR voltage divider", opts: ["A voltage", "A voltage that is zero at balance", "A square-wave frequency", "A resonant frequency", "A voltage pulse from charge"], v: 0 },
        { l: "Strain gauge in a Wheatstone bridge", opts: ["A voltage", "A voltage that is zero at balance", "A square-wave frequency", "A resonant frequency", "A voltage pulse from charge"], v: 1 },
        { l: "Capacitive sensor with a 555 timer", opts: ["A voltage", "A voltage that is zero at balance", "A square-wave frequency", "A resonant frequency", "A voltage pulse from charge"], v: 2 },
        { l: "Metal-detector coil in an LC circuit", opts: ["A voltage", "A voltage that is zero at balance", "A square-wave frequency", "A resonant frequency", "A voltage pulse from charge"], v: 3 },
        { l: "Piezo sensor with a resistor", opts: ["A voltage", "A voltage that is zero at balance", "A square-wave frequency", "A resonant frequency", "A voltage pulse from charge"], v: 4 }],
      hints: [`Dividers and bridges give voltages; one of them is designed to read zero at the reference point.`, `Timing circuits give a pulse frequency; tuned circuits a resonance.`],
      working: () => W_([step("Divider", "", "", "A voltage"), step("Bridge", "", "", "A voltage that is zero at balance (no offset)"), step("555", "", "", "A square-wave frequency"), step("LC", "", "", "A resonant frequency"), step("Piezo + R", "", "", "A voltage pulse from the charge")]) }
  ];

  Lab.page({
    topic: 4,
    collapseWorking: true,
    exerciseCarousel: true,
    sections: SECTIONS,
    groups: [
      { key: "intro", list: "#introList" },
      { key: "divider", list: "#dividerList", toc: "#dividerToc" },
      { key: "bridge", list: "#bridgeList", toc: "#bridgeToc" },
      { key: "timing", list: "#timingList", toc: "#timingToc" },
      { key: "tuned", list: "#tunedList", toc: "#tunedToc" },
      { key: "active", list: "#activeList" }
    ],
    exercises: EXERCISES
  });

  // Figures for the home exercise
  const fig = (id, o, lbl) => { const el = document.getElementById(id); if (el) el.innerHTML = `<div class="scene-scroll"><svg class="scene homefig" viewBox="0 0 440 270" role="img" aria-label="${esc(lbl)}">${bridgeSvg(o)}</svg></div>`; };
  fig("homeFig2", { labels: [`${sub("R", "1")} = 120 kΩ</tspan>`, `${sub("R", "2")} = 480 kΩ</tspan>`, `${sub("R", "3")} = x</tspan>`, `${sub("R", "4")} = 60 kΩ</tspan>`], meter: "V", src: "20 V" }, "Wheatstone bridge: R1 = 120 kilohms from A to C, R2 = 480 kilohms from C to B, R3 = x from A to D, R4 = 60 kilohms from D to B, 20 V supply, output between C and D");
  fig("homeFig3", { labels: [`${sub("R", "1")} = 100 Ω</tspan>`, `${sub("R", "2")} = 200 Ω</tspan>`, `${sub("R", "3")} = 300 Ω</tspan>`, `${sub("R", "4")} = 50 Ω</tspan>`], meter: "G", src: "10 V" }, "Wheatstone bridge with a galvanometer between C and D: R1 = 100 ohms, R2 = 200 ohms, R3 = 300 ohms, R4 = 50 ohms, 10 V supply with A positive");
  fig("homeFig4", { labels: [`${sub("R", "1")} = 6.0 Ω</tspan>`, `${sub("R", "var")}</tspan>`, `${sub("R", "2")} = 1.5 Ω</tspan>`, `${sub("R", "u")}</tspan>`], meter: "A", src: "9.0 V", nodes: ["c", "a", "b", "d"] }, "Bridge with R1 = 6 ohms from c to a, R2 = 1.5 ohms from c to b, a variable resistor Rvar from a to d, an unknown Ru from b to d, an ammeter between a and b, and a 9 V battery across c and d");
})();
