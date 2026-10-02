/* NMK42003 Chapter 3: Transducers, Sensors and Actuators
   Animated notes: what a transducer is, electrical sensor parameters (each with a real situation),
   passive sensors (resistive, capacitive, inductive), active sensors (piezoelectric, photodiode, Hall effect)
   and actuators (LED, DC motor, servo, relay), with calculators and exercises.
   The calculator and exercise engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, withUnit, F, step, stepsHtml, MINUS, reduceMotion, chips, wireChips, quiz, codeBlock, fold,
    video, readLink, watch, player, axes, poly, svg, curve, dot, label, mixHex, pvCard, pick, tone } = Lab;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const fx = (x, d = 2) => (x < 0 && Math.abs(x) >= 0.5 * 10 ** -d ? MINUS : "") + Math.abs(x).toFixed(d);
  const E0 = 8.854e-12, MU0 = 4 * Math.PI * 1e-7, VSOUND = 343;
  const IMG = "assets/img/chapter-3/";
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const r1 = (x) => Math.round(x * 10) / 10;

  /* =====================================================================
     Photos (free licences, Wikimedia Commons) and videos
     ===================================================================== */
  const CC = (lic, url) => `<a href="${url}" target="_blank" rel="noopener">${lic}</a>`;
  const commons = (file, who, lic) => `Photo: <a href="https://commons.wikimedia.org/wiki/File:${file}" target="_blank" rel="noopener">${who}</a>, ${lic}, via Wikimedia Commons`;
  const BYSA4 = CC("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0"), BYSA3 = CC("CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0");
  const BYSA2DE = CC("CC BY-SA 2.0 DE", "https://creativecommons.org/licenses/by-sa/2.0/de/deed.en"), BY25 = CC("CC BY 2.5", "https://creativecommons.org/licenses/by/2.5");
  const PHOTOS = {
    "potentiometer.jpg": { w: 615, h: 720, alt: "A rotary potentiometer with its shaft, threaded bushing and three solder tags", credit: commons("Potentiometer.jpg", "Iainf", BY25) },
    "ntc-thermistor-ice.jpg": { w: 720, h: 540, alt: "An NTC thermistor on long leads dipped in a glass of ice water, connected to a digital multimeter measuring its resistance, with a glass of warm water beside it", credit: commons("MFrey_NTC_Resistor_cold.JPG", "Michael Frey", BYSA2DE) },
    "piezo-discs.jpg": { w: 720, h: 699, alt: "Two piezoelectric discs: brass discs with a ceramic layer and red and blue wires soldered on", credit: commons("Piezo.jpg", "Stefan Riepl", BYSA2DE) },
    "inductive-proximity-switch.jpg": { w: 720, h: 480, alt: "A cylindrical threaded inductive proximity switch with a green sensing face", credit: commons("Pepperl%2BFuchs_inductive_proximity_switch_3RG4113-3AG33-PF.jpg", "Lucasbosch", BYSA3) },
    "relay-module.jpg": { w: 720, h: 480, alt: "A blue 5 V one-channel relay module on a small circuit board with screw terminals", credit: commons("SRD-05VDC-SL-C_5V_one-channel_relay_module.jpg", "Suyash Dwivedi", BYSA4) },
    "sg90-servo.jpg": { w: 720, h: 480, alt: "A small blue SG90 micro servo motor with a white horn and a three-wire cable", credit: commons("Tower_Pro_SG90_micro_servo_motor.jpg", "Suyash Dwivedi", BYSA4) }
  };
  const photo = (file, caption, cls = "") => {
    const p = PHOTOS[file];
    return `<figure class="photo2 ${cls}"><img src="${IMG}${file}" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" loading="lazy">
      <figcaption>${caption ? `${caption} ` : ""}<span class="credit">${p.credit}</span></figcaption></figure>`;
  };

  const waterCol = (T) => mixHex("#5aaee8", "#e8795a", (T - 10) / 60);

  // A beaker of water on a hot plate, with a thermometer and a sensor probe wired to a meter.
  function bath(o) {
    const tmin = o.tmin === undefined ? 0 : o.tmin, tmax = o.tmax === undefined ? 100 : o.tmax;
    const frac = clamp((o.thermoT - tmin) / (tmax - tmin), 0, 1), heat = o.heat || 0;
    const pb = lerp(78, 184, o.probeIn === undefined ? 1 : smooth(o.probeIn)), pt = pb - 112;
    let s = `<rect class="plate" x="26" y="200" width="138" height="12" rx="3" style="fill:${o.cool ? "#6aa6d8" : mixHex("#7b8794", "#e2553a", heat)}"/>`;
    s += T(95, 226, o.cool ? "cooling" : heat > 0.05 ? "heating" : "", "middle", "small");
    s += `<rect x="42" y="94" width="106" height="102" style="fill:${waterCol(o.water)}" class="water"/>`;
    if (o.cool) s += `<rect class="ice" x="96" y="98" width="16" height="14" rx="3" transform="rotate(12 104 105)"/><rect class="ice" x="116" y="100" width="14" height="13" rx="3" transform="rotate(-10 123 106)"/>`;
    if (heat > 0.2) for (let i = 0; i < 4; i++) { const y = 188 - ((o.bub || 0) * 90 + i * 27) % 92; s += `<circle class="bubble" cx="${52 + i * 26}" cy="${y}" r="${2 + (i % 2)}"/>`; }
    s += `<path class="glass" d="M40,60V190Q40,198 48,198H142Q150,198 150,190V60"/>`;
    // thermometer
    s += `<rect class="tube" x="59" y="34" width="10" height="138" rx="5"/><rect class="merc" x="61.5" y="${(168 - frac * 124).toFixed(1)}" width="5" height="${(frac * 124 + 6).toFixed(1)}"/><circle class="merc" cx="64" cy="176" r="8"/>`;
    s += T(64, 26, `${o.thermoLabel || fx(o.thermoT, 0) + " °C"}`, "middle", "tt");
    // sensor probe and cable
    s += `<path class="cable" d="M124,${pt}C124,${pt - 30} 196,${pt - 34} 214,84"/><rect class="probe" x="120" y="${pt}" width="8" height="112" rx="3"/><circle class="probe-tip" cx="124" cy="${pb}" r="5"/>`;
    s += `<rect class="meter" x="204" y="70" width="108" height="78" rx="8"/><rect class="lcd" x="212" y="80" width="92" height="32" rx="4"/>${T(258, 102, o.lcd, "middle", "lcdt")}`;
    s += T(258, 132, o.lcdLab || "", "middle", "small");
    return s;
  }

  /* =====================================================================
     Introduction: microphone → amplifier → loudspeaker (redrawn from the lecture figure)
     ===================================================================== */
  function mountMicSystem(el, sec) {
    const act = sec.mode === "act";
    el.innerHTML = `<div class="pv"><figure class="scene-box"><div class="scene-scroll"><svg class="scene mic" viewBox="0 0 480 ${act ? 250 : 215}" role="img" aria-label="Animated block diagram: a sound wave enters the microphone (input device), the electrical signal passes through the amplifier (controller or system) and drives the loudspeaker (output device), which sends out a bigger sound wave."></svg></div></figure>
      <div class="slider-field"><label for="${sec.id}-g">Amplifier gain: <strong class="g-v">3</strong></label><input type="range" id="${sec.id}-g" min="1" max="5" step="0.5" value="3"></div>
      <div class="pv-pl"></div></div>`;
    const sv = el.querySelector("svg"), g = el.querySelector("input"), gv = el.querySelector(".g-v");
    const wave = (x0, x1, y, a, ph) => { const p = []; for (let x = x0; x <= x1; x += 2) p.push([x, y - a * Math.sin((x - x0) / 36 * 2 * Math.PI - ph)]); return poly(p, "mw"); };
    const arrows = (x, ph) => [84, 98, 112, 126].map((y, i) => `<path class="ma" style="opacity:${(0.45 + 0.55 * Math.max(0, Math.sin(ph - i * 0.6))).toFixed(2)}" d="M${x},${y}h18m-5,-4l5,4l-5,4"/>`).join("");
    const draw = (t) => {
      const gain = +g.value, ph = t * 2 * Math.PI * 0.8, vib = Math.sin(ph);
      let s = `<defs><marker id="mh" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" class="mfill"/></marker></defs>`;
      s += `<line class="msep" x1="178" y1="40" x2="178" y2="182"/><line class="msep" x1="340" y1="40" x2="340" y2="182"/>`;
      s += wave(12, 74, 105, 13, ph) + arrows(80, ph);
      s += `<ellipse class="mic-y" cx="${136 + vib * 1.5}" cy="105" rx="${17 + vib * 1.2}" ry="20"/>`;
      s += `<line class="mline" x1="156" y1="105" x2="212" y2="105" marker-end="url(#mh)"/>`;
      for (let i = 0; i < 3; i++) { const k = ((t * 0.9 + i / 3) % 1); s += `<circle class="mpulse" cx="${160 + k * 46}" cy="105" r="3"/>`; }
      s += `<rect class="mamp" x="216" y="72" width="88" height="66" rx="7" style="opacity:${(0.82 + 0.18 * Math.abs(vib)).toFixed(2)}"/>`;
      s += `<line class="mline" x1="305" y1="105" x2="352" y2="105" marker-end="url(#mh)"/>`;
      for (let i = 0; i < 3; i++) { const k = ((t * 0.9 + i / 3) % 1); s += `<circle class="mpulse" cx="${309 + k * 38}" cy="105" r="${2.5 + gain * 0.4}"/>`; }
      const cx = 372 + vib * gain * 0.7;
      s += `<rect class="mspk" x="356" y="95" width="13" height="20"/><path class="mspk" d="M${cx - 3},95L${cx + 17},78V132L${cx - 3},115Z"/>`;
      s += arrows(398, ph - 1.2);
      s += wave(424, 474, 105, Math.min(34, 4.3 * gain), ph - 1.8);
      s += T(136, 58, "Microphone", "middle", "mlab") + T(136, 158, "Input", "middle", "msub") + T(136, 172, "device", "middle", "msub");
      s += T(260, 58, "Amplifier", "middle", "mlab") + T(260, 158, "Controller", "middle", "msub") + T(260, 172, "or system", "middle", "msub");
      s += T(376, 58, "Loudspeaker", "middle", "mlab") + T(376, 158, "Output", "middle", "msub") + T(376, 172, "device", "middle", "msub");
      if (act) {
        s += `<path class="mred" d="M84,214L122,184" marker-end="url(#mr)"/><path class="mred" d="M416,214L386,184" marker-end="url(#mr)"/>`;
        s += `<defs><marker id="mr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" class="mredf"/></marker></defs>`;
        s += T(10, 230, "Sensor (diaphragm): sound waves", "start", "mcap") + T(10, 246, "→ electric signal", "start", "mcap");
        s += T(470, 230, "Actuator (speaker): electric", "end", "mcap") + T(470, 246, "signal → motion (sound)", "end", "mcap");
      } else {
        s += T(136, 200, "sound → electrical", "middle", "mcap") + T(376, 200, "electrical → sound", "middle", "mcap");
      }
      sv.innerHTML = s;
    };
    const pl = player(el.querySelector(".pv-pl"), el, { dur: 5, hold: 0, draw, still: 0.6, label: "Sound animation position" });
    g.addEventListener("input", () => { gv.textContent = g.value; pl.redraw(); });
  }

  /* =====================================================================
     Example: car parking sensors (redrawn from the lecture figure)
     ===================================================================== */
  const car = (bx, y) => { // side view, rear bumper at bx, facing left, ground at y
    return `<g class="car"><path class="car-body" d="M${bx - 230},${y - 22}V${y - 52}Q${bx - 222},${y - 70} ${bx - 190},${y - 74}L${bx - 150},${y - 104}Q${bx - 140},${y - 110} ${bx - 120},${y - 110}H${bx - 58}Q${bx - 34},${y - 110} ${bx - 22},${y - 86}L${bx - 6},${y - 58}Q${bx},${y - 50} ${bx},${y - 40}V${y - 26}Q${bx},${y - 18} ${bx - 8},${y - 18}H${bx - 230}Z"/>
      <path class="car-win" d="M${bx - 142},${y - 98}Q${bx - 136},${y - 102} ${bx - 124},${y - 102}H${bx - 92}V${y - 76}H${bx - 160}Z"/><path class="car-win" d="M${bx - 86},${y - 102}H${bx - 60}Q${bx - 42},${y - 102} ${bx - 32},${y - 84}L${bx - 26},${y - 76}H${bx - 86}Z"/>
      <rect class="tail" x="${bx - 12}" y="${y - 70}" width="8" height="16" rx="2"/><rect class="car-sens" x="${bx - 5}" y="${y - 34}" width="6" height="7" rx="2"/>
      <circle class="tyre" cx="${bx - 58}" cy="${y - 18}" r="21"/><circle class="hub" cx="${bx - 58}" cy="${y - 18}" r="9"/></g>`;
  };
  const car2 = (fx0, y, brake) => { // orange hatchback facing left, front bumper at fx0
    const w = 118;
    return `<g class="car2"><path class="car2-body" d="M${fx0},${y - 16}V${y - 30}Q${fx0 + 2},${y - 40} ${fx0 + 16},${y - 42}L${fx0 + 36},${y - 60}Q${fx0 + 42},${y - 64} ${fx0 + 52},${y - 64}H${fx0 + 92}Q${fx0 + 104},${y - 64} ${fx0 + 110},${y - 50}L${fx0 + w},${y - 36}V${y - 16}Z"/>
      <path class="car-win" d="M${fx0 + 40},${y - 56}H${fx0 + 70}V${y - 42}H${fx0 + 26}Z"/><path class="car-win" d="M${fx0 + 75},${y - 56}H${fx0 + 96}L${fx0 + 104},${y - 42}H${fx0 + 75}Z"/>
      <circle class="tyre" cx="${fx0 + 26}" cy="${y - 12}" r="12"/><circle class="tyre" cx="${fx0 + 94}" cy="${y - 12}" r="12"/><circle class="hub" cx="${fx0 + 26}" cy="${y - 12}" r="5"/><circle class="hub" cx="${fx0 + 94}" cy="${y - 12}" r="5"/>
      ${brake ? `<path class="brk" d="M${fx0 + 14},${y + 2}l-8,6M${fx0 + 22},${y + 2}l-6,8M${fx0 + 82},${y + 2}l-8,6M${fx0 + 90},${y + 2}l-6,8"/>` : ""}</g>`;
  };
  function mountParking(el, sec) {
    el.innerHTML = `<div class="pv"><div class="pv-grid park">
      <figure class="scene-box"><svg class="scene park-rear" viewBox="0 0 330 230" role="img" aria-label="Animated rear parking sensor: a car reverses towards a wall; the rear sensor sends ultrasonic pulses that bounce back from the wall, and the beeping gets faster as the car gets closer."></svg><figcaption>Rear (reverse) sensors</figcaption></figure>
      <figure class="scene-box"><svg class="scene park-front" viewBox="0 0 330 230" role="img" aria-label="Animated front sensors: a car approaches an obstacle; first a warning sound, then initial braking, then auxiliary (full) braking."></svg><figcaption>Front sensors</figcaption>
        <ol class="stages"><li data-s="1">Warning sound</li><li data-s="2">Initial brake</li><li data-s="3">Auxiliary brake</li></ol></figure>
      </div><div class="pv-pl"></div><p class="pv-read"></p>${fold("Step-by-Step Working: Distance from the Echo Time", `<ol class="steps"></ol>`)}</div>`;
    const rear = el.querySelector(".park-rear"), front = el.querySelector(".park-front"), read = el.querySelector(".pv-read"), steps = el.querySelector(".steps"), stages = el.querySelectorAll(".stages li");
    let lastD = -1;
    const draw = (t) => {
      // Rear: the car reverses from 2.0 m to 0.25 m from the wall
      const k = smooth(t / 8), d = lerp(2.0, 0.25, k), wallX = 296, bx = wallX - d * 100;
      let s = `<rect class="sky" x="0" y="0" width="330" height="230"/><rect class="ground" x="0" y="196" width="330" height="34"/>`;
      const period = d > 1.5 ? 0 : d < 0.3 ? 0.001 : 0.12 + (d - 0.3) * 0.55; // beep interval in seconds
      const sx = bx + 1, sy = 166;
      // expanding pulses from the sensor to the wall, and echoes coming back
      const gapPx = wallX - sx, arc = (cx, rr, dir, cls, op) => {
        const a = 0.7, x1 = cx + dir * rr * Math.cos(a), y1 = sy - rr * Math.sin(a), y2 = Math.min(195, sy + rr * Math.sin(a));
        const x2 = cx + dir * Math.sqrt(Math.max(0, rr * rr - (y2 - sy) ** 2));
        return `<path class="${cls}" style="opacity:${op.toFixed(2)}" d="M${x1.toFixed(1)},${y1.toFixed(1)}A${rr.toFixed(1)},${rr.toFixed(1)} 0 0 ${dir > 0 ? 1 : 0} ${x2.toFixed(1)},${y2.toFixed(1)}"/>`;
      };
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.4 + i / 3) % 1, rr = 6 + ph * gapPx * 2; // the pulse travels to the wall and back
        if (rr < gapPx) s += arc(sx, rr, 1, "ping", 1 - ph * 0.6);
        else s += arc(2 * wallX - sx, rr, -1, "echo", 1 - ph * 0.6); // reflection: as if from a mirror image behind the wall
      }
      s += `<rect class="wall" x="${wallX}" y="30" width="34" height="166"/>` + car(bx, 196);
      const beepOn = period === 0.001 || (period > 0 && (t % period) < period * 0.45);
      if (period) s += `<g class="beep${beepOn ? " on" : ""}"><path class="beep-burst" d="M${bx - 120},46l8,-14l6,10l10,-12l2,14l12,-4l-6,12l12,6l-14,4l4,12l-12,-6l-6,12l-4,-12l-12,4l6,-12z"/>${T(bx - 104, 52, "BEEP", "middle", "beep-t")}</g>`;
      s += `<rect class="dist-box" x="8" y="8" width="118" height="26" rx="5"/>${T(67, 26, `Distance ${fx(d, 2)} m`, "middle", "dist-t")}`;
      s += T(wallX - 40, 20, "Sound waves →", "middle", "small");
      rear.innerHTML = s;
      // Front: the car approaches an obstacle and brakes in three stages
      const fk = smooth(t / 7.5), gap = lerp(170, 26, fk), obsR = 76, fx0 = obsR + gap;
      const stage = gap < 50 ? 3 : gap < 95 ? 2 : gap < 140 ? 1 : 0;
      let f = `<rect class="sky" x="0" y="0" width="330" height="230"/><rect class="ground" x="0" y="176" width="330" height="54"/><line class="road" x1="0" y1="176" x2="330" y2="176"/>`;
      f += `<g class="obst"><rect x="4" y="96" width="${obsR - 4}" height="68" rx="6"/><circle cx="36" cy="166" r="10" class="tyre"/></g>${T(40, 200, "Obstacle", "middle", "on-road")}`;
      if (stage) f += `<path class="gap-arrow" d="M${fx0 - 6},120H${obsR + 12}m10,-8l-10,8l10,8"/>`;
      f += car2(fx0, 176, stage >= 2);
      if (stage) f += `<g class="warn-snd"><path d="M${fx0 + 60},70l8,-12l6,10l10,-14l-4,18" />${T(fx0 + 58, 44, ["", "Warning sound", "Initial brake", "Auxiliary brake"][stage], "middle", "stage-t")}</g>`;
      front.innerHTML = f;
      stages.forEach((li) => li.classList.toggle("on", +li.dataset.s <= stage));
      // Readout (only when the distance changes enough)
      const dr = Math.round(d * 100) / 100;
      if (dr !== lastD) {
        lastD = dr;
        const te = (2 * dr) / VSOUND;
        read.innerHTML = `Distance to the wall <strong>${fx(dr, 2)} m</strong>. The echo returns after <strong>${fx(te * 1000, 2)} ms</strong>. ${dr > 1.5 ? "Too far: no beep yet." : dr < 0.3 ? "<strong>Stop!</strong> Continuous tone." : "The closer the car, the faster the beeps."}`;
        steps.innerHTML = stepsHtml([
          step("The pulse goes to the wall and back", "total path = 2 × d", `= 2 × ${fx(dr, 2)} m`, `= ${fx(2 * dr, 2)} m`),
          step("Echo time", "t = 2d ÷ v", `= ${fx(2 * dr, 2)} m ÷ ${VSOUND} m/s`, `t = ${fx(te * 1000, 3)} ms`),
          step("Turned round: what the sensor does", "d = v × t ÷ 2", `= ${VSOUND} m/s × ${fx(te * 1000, 3)} ms ÷ 2`, `d = ${fx(dr, 2)} m`)]);
      }
    };
    player(el.querySelector(".pv-pl"), el, { dur: 8.5, hold: 1.5, draw, still: 6, label: "Parking animation position" });
  }

  /* =====================================================================
     Electrical sensor parameters: each one is a real situation, animated
     ===================================================================== */
  // NTC thermistor: R = R0·e^(β(1/T − 1/T0)), 10 kΩ at 25 °C, β = 3950 K
  const ntcR = (Tc, R0 = 10e3, B = 3950) => R0 * Math.exp(B * (1 / (Tc + 273.15) - 1 / 298.15));

  // 1. Linearity: LM35 (10 mV/°C) against an NTC thermistor in a voltage divider
  function mountLinearity(el) {
    const S = { k: "lm35" };
    const c = pvCard(el, chips("Sensor", [["lm35", "LM35 temperature sensor"], ["ntc", "NTC thermistor + 10 kΩ divider"]], S.k));
    const out = (T) => (S.k === "lm35" ? 0.01 * T : (3.3 * 10e3) / (10e3 + ntcR(T)));
    const draw = (t) => {
      const T = clamp((t / 6) * 100, 0, 100), v = out(T), vmax = S.k === "lm35" ? 1 : 3.3;
      c.scene.innerHTML = svg(320, 230, `Beaker of water heated to ${T.toFixed(0)} °C; the sensor gives ${v.toFixed(3)} V`,
        bath({ water: T, thermoT: T, heat: 0.3 + T / 140, bub: t, lcd: `${v.toFixed(3)} V`, lcdLab: S.k === "lm35" ? "LM35 output" : "Divider output" }), "scene");
      const A = axes({ x: [0, 100], y: [0, vmax], xt: [0, 25, 50, 75, 100], yt: S.k === "lm35" ? [0, 0.25, 0.5, 0.75, 1] : [0, 1, 2, 3], fy: (y) => y, xl: "Temperature (°C)", yl: "Output (V)" });
      const v0 = out(0), v1 = out(100), ideal = (x) => v0 + ((v1 - v0) * x) / 100, err = v - ideal(T);
      let g = A.s + poly([[A.X(0), A.Y(v0)], [A.X(100), A.Y(v1)]], "trace-in") + poly(curve(A, out, 0, 100), "ghost") + poly(curve(A, out, 0, T, Math.max(2, Math.round(T))), "trace-a");
      if (Math.abs(err) > 0.01) g += `<line class="lagline" x1="${A.X(T)}" x2="${A.X(T)}" y1="${A.Y(ideal(T))}" y2="${A.Y(v)}"/>`;
      g += dot(A.X(T), A.Y(v)) + label(A.X(T) + (T > 60 ? -8 : 8), A.Y(v) - 9, `${T.toFixed(0)} °C → ${v.toFixed(2)} V`, T > 60 ? "end" : "start");
      c.graph.innerHTML = svg(A.W, A.H, "Output voltage against temperature, compared with a straight line", g);
      c.read.innerHTML = S.k === "lm35"
        ? `At <strong>${T.toFixed(0)} °C</strong> the LM35 gives <strong>${(v * 1000).toFixed(0)} mV</strong>: exactly 10 mV for every degree. The points lie on the straight dashed line, so the sensor is <strong>linear</strong> and the temperature is simply V ÷ 10 mV.`
        : `At <strong>${T.toFixed(0)} °C</strong> the divider gives <strong>${v.toFixed(2)} V</strong>, but a straight line through the end points would give ${ideal(T).toFixed(2)} V. The red gap is the <strong>non-linearity error</strong>: ${fx(Math.abs(err), 2)} V, or ${(Math.abs(err) / (v1 - v0) * 100).toFixed(0)}% of full scale.`;
    };
    const pl = player(c.pl, el, { dur: 6, draw, still: 3.6, label: "Heating animation position", clock: (t) => `${clamp((t / 6) * 100, 0, 100).toFixed(0)} °C` });
    pick(el, (k) => { S.k = k; pl.redraw(); });
  }

  // 2. Sensitivity: thermocouple types (NIST reference tables, mV at 0 °C reference junction)
  const TC = {
    E: [[0, 0], [200, 13.421], [400, 28.946], [600, 45.093], [800, 61.017], [1000, 76.373]],
    J: [[0, 0], [200, 10.779], [400, 21.848], [600, 33.102], [800, 45.494], [1000, 57.953]],
    K: [[0, 0], [200, 8.138], [400, 16.397], [600, 24.905], [800, 33.275], [1000, 41.276]],
    N: [[0, 0], [200, 5.913], [400, 12.974], [600, 20.613], [800, 28.455], [1000, 36.256]],
    T: [[0, 0], [100, 4.279], [200, 9.288], [300, 14.862], [400, 20.872]],
    R: [[0, 0], [200, 1.469], [400, 3.408], [600, 5.583], [800, 7.95], [1000, 10.506]],
    S: [[0, 0], [200, 1.441], [400, 3.259], [600, 5.239], [800, 7.345], [1000, 9.587]]
  };
  const tcV = (k, T) => { const p = TC[k]; for (let i = 1; i < p.length; i++) if (T <= p[i][0]) return lerp(p[i - 1][1], p[i][1], (T - p[i - 1][0]) / (p[i][0] - p[i - 1][0])); return null; };
  const tcS = (k, T) => { const p = TC[k]; for (let i = 1; i < p.length; i++) if (T <= p[i][0]) return ((p[i][1] - p[i - 1][1]) / (p[i][0] - p[i - 1][0])) * 1000; return null; };
  function mountSensitivity(el) {
    const S = { k: "K" };
    const c = pvCard(el, chips("Thermocouple type", Object.keys(TC).map((k) => [k, `Type ${k}`]), S.k));
    const draw = (t) => {
      const deg = clamp((t / 7) * 1000, 0, 1000), v = tcV(S.k, deg), sens = tcS(S.k, Math.max(deg, 1));
      let s = `<rect class="furnace" x="14" y="56" width="160" height="140" rx="8"/><rect class="furnace-in" x="28" y="70" width="132" height="112" rx="5" style="fill:${mixHex("#3b2a22", "#ff9a3c", deg / 1000)}"/>`;
      s += deg > 150 ? `<path class="flame" d="M70,182q-12,-26 6,-44q-2,16 10,22q2,-14 14,-24q-4,22 10,30q4,-8 2,-16q14,14 4,32z" style="opacity:${(deg / 1000).toFixed(2)}"/>` : "";
      s += T(94, 48, `${deg.toFixed(0)} °C`, "middle", "tt");
      s += `<path class="tc-a" d="M100,120H230V92"/><path class="tc-b" d="M100,124H238V92"/><circle class="tc-j" cx="100" cy="122" r="5"/>${T(100, 110, "hot junction", "middle", "small inv")}`;
      s += `<rect class="meter" x="204" y="30" width="108" height="64" rx="8"/><rect class="lcd" x="212" y="38" width="92" height="30" rx="4"/>${T(258, 59, v === null ? "OVER" : `${v.toFixed(2)} mV`, "middle", "lcdt")}${T(258, 86, `Type ${S.k}`, "middle", "small")}`;
      c.scene.innerHTML = svg(320, 230, `Thermocouple type ${S.k} in a furnace at ${deg.toFixed(0)} °C`, s, "scene");
      const A = axes({ x: [0, 1000], y: [0, 80], xt: [0, 250, 500, 750, 1000], yt: [0, 20, 40, 60, 80], xl: "Temperature (°C)", yl: "Output E(T) (mV)" });
      let g = A.s;
      const ends = [];
      Object.keys(TC).forEach((k) => {
        const p = TC[k].map(([x, y]) => [A.X(x), A.Y(y)]), last = p[p.length - 1];
        g += poly(p, k === S.k ? "trace-a" : "ghost");
        ends.push({ k, x: last[0] + (last[0] > A.W - 30 ? -3 : 4), y: last[1] - 3, a: last[0] > A.W - 30 ? "end" : "start" });
      });
      ends.filter((e) => e.a === "end").sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 12) e.y = arr[i - 1].y + 12; });
      ends.forEach((e) => { g += T(e.x.toFixed(1), e.y.toFixed(1), e.k, e.a, e.k === S.k ? "mklab" : "axis"); });
      if (v !== null) {
        const a = Math.max(0, deg - 120), b = Math.min(TC[S.k][TC[S.k].length - 1][0], deg + 120);
        g += `<path class="slope" d="M${A.X(a)},${A.Y(tcV(S.k, a))}H${A.X(b)}V${A.Y(tcV(S.k, b))}"/>`;
        g += dot(A.X(deg), A.Y(v));
      }
      c.graph.innerHTML = svg(A.W, A.H, "Thermocouple output against temperature for types E, J, K, N, T, R and S", g);
      c.read.innerHTML = v === null
        ? `Type ${S.k} only works up to ${TC[S.k][TC[S.k].length - 1][0]} °C. Above that it is <strong>out of range</strong>: choose another type for a hotter furnace.`
        : `Type ${S.k} at <strong>${deg.toFixed(0)} °C</strong> gives <strong>${v.toFixed(2)} mV</strong>. Its sensitivity here is about <strong>${sens.toFixed(0)} µV/°C</strong> (the slope, shown by the triangle). A steeper line means a more sensitive sensor.`;
    };
    const pl = player(c.pl, el, { dur: 7, draw, still: 4.2, label: "Furnace animation position", clock: (t) => `${clamp((t / 7) * 1000, 0, 1000).toFixed(0)} °C` });
    pick(el, (k) => { S.k = k; pl.redraw(); });
  }

  // 3. Repeatability: stepping on a bathroom scale 8 times
  const Z8 = [0.42, -1.05, 0.73, -0.38, 1.36, -0.66, 0.12, -1.52];
  const SCALES = { good: { sd: 0.05, bias: 0, name: "Good scale" }, poor: { sd: 0.6, bias: 0, name: "Poor scale" }, bias: { sd: 0.05, bias: 1.5, name: "Repeatable but not accurate" } };
  function mountRepeat(el) {
    const S = { k: "good" };
    const c = pvCard(el, chips("Scale", Object.entries(SCALES).map(([k, v]) => [k, v.name]), S.k));
    const person = (x, y) => `<g class="person"><circle cx="${x}" cy="${y - 118}" r="13"/><path d="M${x},${y - 104}V${y - 50}M${x},${y - 92}l-20,26M${x},${y - 92}l20,26M${x},${y - 50}l-12,48M${x},${y - 50}l12,48"/></g>`;
    const draw = (t) => {
      const sc = SCALES[S.k], i = Math.min(7, Math.floor(t)), f = t - i, reads = Z8.map((z) => 60 + sc.bias + z * sc.sd);
      const done = t >= 8 ? 8 : i + (f > 0.4 ? 1 : 0);
      const px = f < 0.25 ? lerp(290, 160, smooth(f / 0.25)) : f < 0.75 ? 160 : lerp(160, 290, smooth((f - 0.75) / 0.25));
      const onScale = t < 8 && f >= 0.25 && f < 0.75;
      let s = `<line class="floor" x1="0" y1="204" x2="320" y2="204"/><rect class="scale" x="100" y="186" width="120" height="18" rx="6"/>`;
      s += `<rect class="meter" x="206" y="18" width="104" height="58" rx="8"/><rect class="lcd" x="214" y="26" width="88" height="28" rx="4"/>`;
      s += T(258, 46, onScale && f > 0.4 ? `${reads[i].toFixed(2)} kg` : "0.00 kg", "middle", "lcdt") + T(258, 70, "scale reading", "middle", "small");
      s += t < 8 ? person(px, onScale ? 186 : 204) : "";
      s += T(20, 26, t < 8 ? `Trial ${i + 1} of 8` : "8 trials done", "start", "tt") + T(20, 44, "True mass: 60.00 kg", "start", "small");
      c.scene.innerHTML = svg(320, 230, "A person steps on a bathroom scale again and again", s, "scene");
      const A = axes({ x: [0.5, 8.5], y: [58, 62.5], xt: [1, 2, 3, 4, 5, 6, 7, 8], yt: [58, 59, 60, 61, 62], xl: "Trial number", yl: "Reading (kg)" });
      let g = A.s + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(60)}" y2="${A.Y(60)}"/>` + T(A.l + A.pw - 4, A.Y(60) + 14, "true value 60 kg", "end", "reflab");
      const shown = reads.slice(0, done);
      if (shown.length > 1) {
        const lo = Math.min(...shown), hi = Math.max(...shown), mean = shown.reduce((a, b) => a + b, 0) / shown.length;
        g += `<rect class="band" x="${A.l}" y="${A.Y(A.clipY(hi))}" width="${A.pw}" height="${Math.max(1, A.Y(A.clipY(lo)) - A.Y(A.clipY(hi)))}" opacity=".7"/>`;
        g += `<line class="meanline" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(mean)}" y2="${A.Y(mean)}"/>`;
      }
      shown.forEach((r, k) => { g += dot(A.X(k + 1), A.Y(A.clipY(r)), "shot"); });
      c.graph.innerHTML = svg(A.W, A.H, "Scale readings for each trial with their spread", g);
      if (shown.length) {
        const lo = Math.min(...shown), hi = Math.max(...shown), mean = shown.reduce((a, b) => a + b, 0) / shown.length;
        c.read.innerHTML = `${shown.length} reading${shown.length > 1 ? "s" : ""}: average <strong>${mean.toFixed(2)} kg</strong>, spread (max − min) <strong>${(hi - lo).toFixed(2)} kg</strong>. ` +
          (S.k === "good" ? "The same input gives almost the same output every time: <strong>good repeatability</strong>." : S.k === "poor" ? "The same person gives different readings each time: <strong>poor repeatability</strong>. You can't trust one reading." : "The readings agree closely (good repeatability) but are all about 1.5 kg too high: repeatable is <strong>not the same as accurate</strong>. Calibration fixes the offset.");
      } else c.read.textContent = "The same person steps on the scale 8 times. Watch where the readings land.";
    };
    const pl = player(c.pl, el, { dur: 8, hold: 2, draw, label: "Scale animation position", clock: (t) => `trial ${Math.min(8, Math.floor(t) + 1)}` });
    pick(el, (k) => { S.k = k; pl.restart(); });
  }

  // 4. Dynamic response: a probe plunged from 20 °C air into 60 °C water
  const PROBES = [["0.5", "Bare thermocouple bead (τ = 0.5 s)"], ["3", "Thermistor probe (τ = 3 s)"], ["8", "Probe in a thick steel sheath (τ = 8 s)"]];
  function mountDynamic(el, sec) {
    const S = { tau: 3 };
    const c = pvCard(el, chips("Probe", PROBES, "3") + `<div class="slider-field"><label for="${sec.id}-tau">Time constant τ: <strong class="tau-v">3 s</strong></label><input type="range" id="${sec.id}-tau" min="0.5" max="10" step="0.5" value="3"></div>`,
      fold("Step-by-Step Working", `<ol class="steps"></ol>`));
    const sl = el.querySelector(`#${sec.id}-tau`), tv = el.querySelector(".tau-v"), steps = el.querySelector(".steps");
    const T0 = 20, T1 = 60, t0 = 2, SPAN = 40, out = (ts) => (ts < t0 ? T0 : T0 + (T1 - T0) * (1 - Math.exp(-(ts - t0) / S.tau)));
    const draw = (t) => {
      const ts = (t / 8) * SPAN, y = out(ts), tau = S.tau;
      c.scene.innerHTML = svg(320, 230, `Probe reading ${y.toFixed(1)} °C while the water is 60 °C`,
        bath({ water: 60, thermoT: 60, heat: 0.8, bub: t, probeIn: clamp((ts - t0 + 0.6) / 0.6, 0, 1), lcd: `${y.toFixed(1)} °C`, lcdLab: "sensor reading", thermoLabel: "water 60 °C" }), "scene");
      const A = axes({ x: [0, SPAN], y: [15, 65], xt: [0, 10, 20, 30, 40], yt: [20, 30, 40, 50, 60], xl: "Time (s)", yl: "Temperature (°C)" });
      let g = A.s + poly([[A.X(0), A.Y(T0)], [A.X(t0), A.Y(T0)], [A.X(t0), A.Y(T1)], [A.X(SPAN), A.Y(T1)]], "trace-in");
      g += poly(curve(A, out, 0, ts, Math.max(2, Math.round(ts * 4))), "trace-a");
      const x63 = t0 + tau, y63 = T0 + 0.632 * (T1 - T0);
      if (ts >= x63 && x63 <= SPAN) g += `<path class="mk" d="M${A.X(x63)},${A.Y(15)}V${A.Y(y63)}H${A.X(0)}"/>` + label(A.X(x63) + 5, A.Y(y63) + 16, "τ: 63.2%", "start", "mklab");
      if (ts >= t0 + 5 * tau && t0 + 5 * tau <= SPAN) g += `<line class="mk" x1="${A.X(t0 + 5 * tau)}" x2="${A.X(t0 + 5 * tau)}" y1="${A.Y(15)}" y2="${A.Y(T1)}"/>` + label(A.X(t0 + 5 * tau) - 4, A.Y(T1) + 16, "5τ: 99.3%", "end", "mklab");
      g += dot(A.X(ts), A.Y(y));
      c.graph.innerHTML = svg(A.W, A.H, "Sensor reading against time after a sudden change from 20 to 60 °C", g);
      c.read.innerHTML = `At t = ${ts.toFixed(1)} s the water is 60 °C but the sensor reads <strong>${y.toFixed(1)} °C</strong>. ${ts < t0 ? "The probe is still in the air." : ts - t0 < 5 * tau ? "It is still catching up." : "It has caught up (within 1%)."}`;
    };
    const setTau = (v) => {
      S.tau = +v; sl.value = v; tv.textContent = `${v} s`;
      const y1 = T0 + (T1 - T0) * (1 - Math.exp(-1)), y5 = T0 + (T1 - T0) * (1 - Math.exp(-5));
      steps.innerHTML = stepsHtml([
        step("First-order response to a step", "T(t) = T₁ + (T₂ − T₁)(1 − e<sup>−t/τ</sup>)", `T₁ = ${T0} °C, T₂ = ${T1} °C, τ = ${S.tau} s`, "t is counted from the moment the probe enters the water"),
        step("After one time constant (t = τ)", "T = T₁ + (T₂ − T₁)(1 − e<sup>−1</sup>)", `= ${T0} + ${T1 - T0} × 0.632`, `T = ${y1.toFixed(1)} °C, at t = ${S.tau} s`),
        step("After five time constants (t = 5τ)", "T = T₁ + (T₂ − T₁)(1 − e<sup>−5</sup>)", `= ${T0} + ${T1 - T0} × 0.993`, `T = ${y5.toFixed(1)} °C, at t = ${5 * S.tau} s: settled`)]);
    };
    const pl = player(c.pl, el, { dur: 8, hold: 1.5, draw, still: 5, label: "Response animation position", clock: (t) => `t = ${((t / 8) * SPAN).toFixed(1)} s` });
    pick(el, (v) => { setTau(v); pl.restart(); });
    sl.addEventListener("input", () => { setTau(sl.value); el.querySelectorAll(".chip-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === sl.value)); pl.redraw(); });
    setTau(3); pl.redraw();
  }

  // 5. Output signal quality: a sensor cable next to a noisy motor
  const noiseAt = (x) => (Math.sin(2 * Math.PI * 7.3 * x + 1.1) + 0.8 * Math.sin(2 * Math.PI * 11.9 * x + 2.3) + 0.7 * Math.sin(2 * Math.PI * 17.1 * x + 0.4) + 0.6 * Math.sin(2 * Math.PI * 23.7 * x + 5.1) + 0.5 * Math.sin(2 * Math.PI * 31.3 * x + 3.3)) / 2.4;
  function mountSnr(el, sec) {
    const S = { n: 0.1, shield: false, amp: false };
    const c = pvCard(el, `<div class="slider-field"><label for="${sec.id}-n">Noise picked up from the motor: <strong class="n-v">0.10 V</strong></label><input type="range" id="${sec.id}-n" min="0" max="0.3" step="0.01" value="0.1"></div>
      <label class="check"><input type="checkbox" data-o="shield"> Use a shielded, twisted-pair cable (noise ÷ 5)</label>
      <label class="check"><input type="checkbox" data-o="amp"> Amplify ×10 at the sensor, before the long cable</label>`);
    const nv = el.querySelector(".n-v"), sl = el.querySelector(`#${sec.id}-n`);
    const draw = (t) => {
      const vs = 0.2 * (S.amp ? 10 : 1), vn = S.n * (S.shield ? 0.2 : 1), snr = vn > 0 ? 20 * Math.log10(vs / vn) : Infinity;
      let s = `<rect class="bx" x="10" y="78" width="58" height="44" rx="6"/>${T(39, 104, "Sensor", "middle", "small")}`;
      if (S.amp) s += `<path class="ampt" d="M74,86V114L100,100Z"/>${T(84, 128, "×10", "middle", "small")}`;
      const cable = []; for (let x = 100; x <= 252; x += 4) cable.push([x, 100 + 3 * Math.sin(x / 7)]);
      if (S.shield) s += `<rect class="shield" x="100" y="90" width="152" height="20" rx="10"/>`;
      s += poly(cable, "cablew") + `<rect class="bx" x="252" y="76" width="60" height="48" rx="6"/>${T(282, 104, "Controller", "middle", "small")}`;
      s += `<circle class="motor" cx="176" cy="176" r="24"/>${T(176, 182, "M", "middle", "tt")}${T(176, 216, "motor", "middle", "small")}`;
      if (S.n > 0) {
        const fl = Math.sin(t * 40) > 0;
        const reach = S.shield ? 116 : 104;
        s += `<path class="spark" style="opacity:${fl ? 1 : 0.35}" d="M160,156l-8,-10l6,-3l-10,${reach - 146}M190,156l8,-10l-6,-3l10,${reach - 146}"/>`;
      }
      c.scene.innerHTML = svg(320, 230, "A sensor cable passes close to an electric motor that radiates electrical noise", s, "scene");
      const A = axes({ x: [0, 2], y: [-2.6, 2.6], xt: [0, 0.5, 1, 1.5, 2], yt: [-2, -1, 0, 1, 2], xl: "Time (s)", yl: "Received signal (V)" });
      const scaleUp = S.amp ? 1 : 10; // the controller amplifies small signals ×10 if the sensor didn't
      const sig = (x) => vs * scaleUp * Math.sin(2 * Math.PI * 0.75 * (x + t * 0.5)), rx = (x) => sig(x) + vn * scaleUp * noiseAt(x + t * 0.5);
      let g = A.s + poly(curve(A, sig, 0, 2, 60), "trace-in") + poly(curve(A, rx, 0, 2, 220), "trace-a");
      c.graph.innerHTML = svg(A.W, A.H, "The signal as received by the controller, with noise added", g);
      c.read.innerHTML = `Signal ${fx(vs, 2)} V, noise ${fx(vn, 3)} V → <strong>SNR = 20 log(${fx(vs, 2)} ÷ ${fx(vn, 3)}) = ${isFinite(snr) ? snr.toFixed(1) + " dB" : "∞"}</strong>. ` +
        (snr > 30 ? "Clean: the controller reads the true value." : snr > 15 ? "Usable, but the reading jitters." : "Poor: the noise hides the signal.") +
        (S.amp ? "" : " (The graph shows it after ×10 gain at the controller: the noise is amplified too.)");
    };
    const pl = player(c.pl, el, { dur: 4, hold: 0, draw, still: 1, label: "Signal animation position" });
    sl.addEventListener("input", () => { S.n = +sl.value; nv.textContent = `${S.n.toFixed(2)} V`; pl.redraw(); });
    el.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("change", () => { S[b.dataset.o] = b.checked; pl.redraw(); }));
  }

  // 6. Reliability and stability: an outdoor weather station over two years
  const rainy = (m) => [0, 1, 10, 11].includes(Math.floor(m) % 12); // Nov to Feb: monsoon
  const drift = (m) => 0.07 * m + (rainy(m) ? 0.35 * (m / 24) : 0) + 0.08 * Math.sin(m * 2.1);
  const steady = (m) => 0.06 * Math.sin(m * 1.7) + 0.03 * Math.sin(m * 4.3);
  function mountStability(el) {
    const S = { k: "cheap" };
    const c = pvCard(el, chips("Sensor shown on the display", [["sealed", "Well-sealed sensor"], ["cheap", "Cheap unsealed sensor"]], S.k));
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const draw = (t) => {
      const m = clamp((t / 12) * 24, 0, 24), tr = 31 + 2 * Math.sin((m / 12) * 2 * Math.PI) - (rainy(m) ? 2.5 : 0), err = S.k === "cheap" ? drift(m) : steady(m);
      let s = `<rect class="sky" x="0" y="0" width="320" height="230"/><rect class="ground grass" x="0" y="204" width="320" height="26"/><rect class="pole" x="96" y="92" width="7" height="112"/>`;
      s += `<rect class="screen" x="74" y="64" width="52" height="46" rx="3"/>${[72, 80, 88, 96, 104].map((y) => `<line class="louvre" x1="78" x2="122" y1="${y}" y2="${y}"/>`).join("")}`;
      if (rainy(m)) { s += `<path class="cloud" d="M30,52a14,14 0 0 1 22,-12a18,18 0 0 1 32,4a12,12 0 0 1 4,24H34a10,10 0 0 1 -4,-16z"/>`; for (let i = 0; i < 7; i++) { const y = 80 + ((t * 160 + i * 23) % 110); s += `<line class="rain" x1="${36 + i * 8}" x2="${32 + i * 8}" y1="${y}" y2="${y + 9}"/>`; } }
      else s += `<circle class="sun" cx="48" cy="44" r="16"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i * Math.PI) / 4 + t; return `<line class="sunray" x1="${48 + 22 * Math.cos(a)}" y1="${44 + 22 * Math.sin(a)}" x2="${48 + 29 * Math.cos(a)}" y2="${44 + 29 * Math.sin(a)}"/>`; }).join("")}`;
      s += `<rect class="meter" x="170" y="40" width="140" height="92" rx="8"/><rect class="lcd" x="178" y="48" width="124" height="52" rx="4"/>`;
      s += T(240, 68, `Sensor ${(tr + err).toFixed(1)} °C`, "middle", "lcdt sm") + T(240, 90, `True ${tr.toFixed(1)} °C`, "middle", "lcdt sm dim");
      s += T(240, 120, `Month ${m.toFixed(0)} · ${MON[Math.floor(m) % 12]}`, "middle", "small");
      c.scene.innerHTML = svg(320, 230, `Outdoor weather station, month ${m.toFixed(0)}`, s, "scene");
      const A = axes({ x: [0, 24], y: [-0.5, 2.5], xt: [0, 6, 12, 18, 24], yt: [-0.5, 0, 0.5, 1, 1.5, 2, 2.5], xl: "Months outdoors", yl: "Reading error (°C)" });
      let g = A.s + `<rect class="band" x="${A.l}" y="${A.Y(0.5)}" width="${A.pw}" height="${A.Y(-0.5) - A.Y(0.5)}"/>` + T(A.l + 4, A.Y(0.5) - 4, "±0.5 °C allowed", "start", "axis");
      g += poly(curve(A, steady, 0, m, Math.max(2, Math.round(m * 4))), "trace-a") + poly(curve(A, drift, 0, m, Math.max(2, Math.round(m * 4))), "trace-d");
      g += dot(A.X(m), A.Y(A.clipY(S.k === "cheap" ? drift(m) : steady(m))));
      c.graph.innerHTML = svg(A.W, A.H, "Reading error over two years: the sealed sensor stays near zero, the cheap one drifts", g) + `<p class="legend"><span class="key"></span>Well-sealed sensor <span class="key digital"></span>Cheap unsealed sensor</p>`;
      c.read.innerHTML = S.k === "cheap"
        ? `After ${m.toFixed(0)} months the cheap sensor is <strong>${err.toFixed(2)} °C</strong> off${Math.abs(err) > 0.5 ? ", outside the allowed ±0.5 °C: it has drifted and needs recalibration or replacing" : ""}. Heat, sun and monsoon humidity slowly change it: poor <strong>stability</strong>.`
        : `After ${m.toFixed(0)} months the sealed sensor is still within <strong>${Math.abs(err).toFixed(2)} °C</strong>: it is <strong>stable and reliable</strong> through sun, rain and humidity.`;
    };
    const pl = player(c.pl, el, { dur: 12, hold: 2, draw, label: "Two-year animation position", clock: (t) => `month ${((t / 12) * 24).toFixed(0)}` });
    pick(el, (k) => { S.k = k; pl.redraw(); });
  }

  // 7. Hysteresis: heating 20 → 50 °C, then cooling back to 20 °C
  function mountHysteresis(el) {
    const S = { h: 0.06 };
    const c = pvCard(el, chips("Sensor", [["0.01", "Good sensor"], ["0.06", "Poor sensor"]], "0.06"));
    const base = (T) => 0.8 + 0.04 * (T - 20), hump = (T) => Math.sin((Math.PI * (T - 20)) / 30);
    const up = (T) => base(T) - S.h * hump(T), down = (T) => base(T) + S.h * hump(T);
    const draw = (t) => {
      const rising = t < 4, T = rising ? 20 + (30 * t) / 4 : 50 - (30 * Math.min(t - 4, 4)) / 4, v = rising ? up(T) : down(T);
      c.scene.innerHTML = svg(320, 230, `Water at ${T.toFixed(0)} °C, ${rising ? "heating" : "cooling"}`,
        bath({ water: T, thermoT: T, tmin: 10, tmax: 60, heat: rising ? 0.8 : 0, cool: !rising, bub: t, lcd: `${v.toFixed(3)} V`, lcdLab: rising ? "rising ↑" : "falling ↓" }), "scene");
      const A = axes({ x: [20, 50], y: [0.7, 2.1], xt: [20, 25, 30, 35, 40, 45, 50], yt: [0.8, 1.2, 1.6, 2.0], fy: (y) => y.toFixed(1), xl: "Temperature (°C)", yl: "Output (V)" });
      let g = A.s + poly(curve(A, up, 20, rising ? T : 50), "trace-a");
      if (!rising) g += poly(curve(A, down, T, 50), "trace-d");
      if (!rising && T <= 35) g += `<line class="lagline" x1="${A.X(35)}" x2="${A.X(35)}" y1="${A.Y(up(35))}" y2="${A.Y(down(35))}"/>` + label(A.X(35) + 6, (A.Y(up(35)) + A.Y(down(35))) / 2 + 4, `gap ${(down(35) - up(35)).toFixed(2)} V`, "start", "ptlab");
      g += dot(A.X(T), A.Y(v));
      c.graph.innerHTML = svg(A.W, A.H, "Output against temperature: going up and coming down follow different paths", g) + `<p class="legend"><span class="key"></span>rising <span class="key digital"></span>falling</p>`;
      const gap = down(35) - up(35);
      c.read.innerHTML = rising
        ? `Heating: <strong>${T.toFixed(0)} °C → ${v.toFixed(3)} V</strong>. Watch what happens on the way back down.`
        : `Cooling: <strong>${T.toFixed(0)} °C → ${v.toFixed(3)} V</strong>. ${T <= 35 ? `At 35 °C it read ${up(35).toFixed(2)} V going up but ${down(35).toFixed(2)} V coming down. Hysteresis = ${gap.toFixed(2)} V, which is <strong>${((gap / 1.2) * 100).toFixed(0)}% of the 1.2 V full scale</strong>.` : "The falling path is above the rising one."}`;
    };
    const pl = player(c.pl, el, { dur: 8, hold: 2, draw, label: "Heating and cooling animation position", clock: (t) => (t < 4 ? "heating" : "cooling") });
    pick(el, (v) => { S.h = +v; pl.redraw(); });
  }

  // 8. Residual deformation: a load cell overloaded beyond its rating
  function mountResidual(el) {
    const S = { k: "over" };
    const c = pvCard(el, chips("Load", [["ok", "2 kg (within the 5 kg rating)"], ["over", "20 kg (overload)"]], S.k));
    const read = (t) => {
      const over = S.k === "over", on = t >= 2.2 && t < 4.5, after = t >= 4.5;
      if (on) return over ? 20 : 2;
      return after && over ? 0.085 : 0;
    };
    const draw = (t) => {
      const over = S.k === "over", w = over ? 20 : 2, down = t < 1.5 ? 0 : t < 2.2 ? (t - 1.5) / 0.7 : t < 4.5 ? 1 : t < 5.2 ? 1 - (t - 4.5) / 0.7 : 0;
      const loaded = t >= 2.2 && t < 4.5, after = t >= 4.5;
      const tip = loaded ? (over ? 46 : 9) : after && over ? 7 : t >= 1.5 && t < 2.2 ? (over ? 46 : 9) * ((t - 1.5) / 0.7) : 0;
      const yb = (u) => 100 + tip * (u * u * (3 - u)) / 2, pts = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([46 + u * 190, yb(u)]); }
      let s = `<rect class="hatch" x="10" y="54" width="36" height="120"/><line class="floor" x1="10" y1="174" x2="120" y2="174"/>`;
      s += poly(pts, over && (loaded || after) ? "beam hurt" : "beam") + `<rect class="gauge" x="56" y="${yb(0.05) - 9}" width="30" height="6" rx="1"/>${T(56, yb(0.05) - 16, "strain gauge", "start", "small")}`;
      const hx = 236, hy = yb(1), wy = hy + 14 + (1 - down) * -60;
      s += `<line class="hook" x1="${hx}" y1="${hy}" x2="${hx}" y2="${Math.max(hy, wy)}"/>`;
      if (t < 5.2) s += `<rect class="weight${over ? " heavy" : ""}" x="${hx - (over ? 26 : 16)}" y="${Math.min(wy, hy + 14)}" width="${over ? 52 : 32}" height="${over ? 40 : 28}" rx="4"/>${T(hx, Math.min(wy, hy + 14) + (over ? 25 : 19), `${w} kg`, "middle", "wt")}`;
      const r = read(t);
      s += `<rect class="meter" x="206" y="10" width="106" height="56" rx="8"/><rect class="lcd" x="214" y="18" width="90" height="28" rx="4"/>`;
      s += T(259, 38, r > 5 ? "OVER" : `${r.toFixed(3)} kg`, "middle", "lcdt") + T(259, 60, "rated 0 to 5 kg", "middle", "small");
      c.scene.innerHTML = svg(320, 230, `Load cell with ${loaded ? w + " kg on it" : "no load"}`, s, "scene");
      const A = axes({ x: [0, 9], y: [0, 6], xt: [0, 3, 6, 9], yt: [0, 1, 2, 3, 4, 5, 6], xl: "Time (s)", yl: "Reading (kg)" });
      let g = A.s + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(5)}" y2="${A.Y(5)}"/>` + T(A.l + 4, A.Y(5) - 5, "rated maximum 5 kg", "start", "reflab");
      const pts2 = []; for (let x = 0; x <= t; x += 0.05) pts2.push([A.X(x), A.Y(Math.min(6, read(x)))]);
      g += poly(pts2, "trace-a");
      if (after && over) g += label(A.X(Math.min(t, 8.8)) - 4, A.Y(0.085) - 10, "stuck at 0.085 kg", "end");
      c.graph.innerHTML = svg(A.W, A.H, "Load cell reading against time", g);
      c.read.innerHTML = !after ? (loaded ? (over ? "20 kg on a 5 kg load cell: the beam bends far beyond its elastic limit." : "2 kg: the beam bends a little, well within its rating.") : "The load cell is empty and reads zero.")
        : over ? "The load is gone but the beam stays slightly bent and the scale reads <strong>0.085 kg</strong> with nothing on it: <strong>residual deformation</strong>. Every future reading is now 85 g too high." : "The load is gone and the reading is back to <strong>0.000 kg</strong>: no residual deformation.";
    };
    const pl = player(c.pl, el, { dur: 9, hold: 1.5, draw, label: "Load animation position", clock: (t) => `${t.toFixed(1)} s` });
    pick(el, (k) => { S.k = k; pl.restart(); });
  }

  /* =====================================================================
     Classification of sensors
     ===================================================================== */
  function mountTree(el) {
    const node = (x, y, w, t, href, cls = "") => `<a href="#${href}"><rect class="tnode ${cls}" x="${x - w / 2}" y="${y - 17}" width="${w}" height="34" rx="17"/>${T(x, y + 5, t, "middle", "tnt")}</a>`;
    const ln = (x1, y1, x2, y2) => `<path class="tln" d="M${x1},${y1}V${(y1 + y2) / 2}H${x2}V${y2}"/>`;
    let s = ln(270, 42, 135, 96) + ln(270, 42, 405, 96);
    [60, 135, 210].forEach((x) => { s += ln(135, 113, x, 168); });
    [330, 405, 480].forEach((x) => { s += ln(405, 113, x, 168); });
    s += node(270, 25, 130, "Sensors", "classify", "root");
    s += node(135, 96, 170, "Passive (modulating)", "resistive", "pas") + node(405, 96, 170, "Active (self-generating)", "piezo", "act");
    s += node(60, 168, 104, "Resistive", "resistive") + node(135, 222, 104, "Capacitive", "capacitive") + node(210, 168, 104, "Inductive", "inductance");
    s += node(330, 168, 104, "Piezoelectric", "piezo") + node(405, 222, 108, "Photodiode", "photodiode") + node(480, 168, 104, "Hall effect", "hall");
    s += `<path class="tln" d="M135,${113 + 27}V205"/><path class="tln" d="M405,${113 + 27}V205"/>`;
    el.innerHTML = `<figure class="scene-box"><div class="scene-scroll"><svg class="scene tree" viewBox="0 0 540 245" role="img" aria-label="Sensors are passive (resistive, capacitive, inductive) or active (piezoelectric, photodiode, Hall effect). Each box links to its section.">${s}</svg></div><figcaption>Tap a box to jump to that sensor.</figcaption></figure>`;
  }

  /* =====================================================================
     Passive: resistive sensors
     ===================================================================== */
  function wireDiagram(Tl, lab, v, res) {
    const l = v.l > 0 ? v.l : 2, A = v.A > 0 ? v.A : 0.2;
    const Lpx = clamp(170 + 90 * Math.log10(l / 2), 50, 330), h = clamp(10 + 14 * Math.sqrt(A), 5, 50), x0 = 70, y = 100;
    let s = `<rect class="wire3d" x="${x0}" y="${y - h / 2}" width="${Lpx}" height="${h}" rx="${Math.min(h / 2, 6)}"/><ellipse class="wire-end" cx="${x0}" cy="${y}" rx="${Math.max(3, h / 4)}" ry="${h / 2}"/>`;
    s += `<path class="w thin" d="M${x0},${y + h / 2 + 14}v10M${x0 + Lpx},${y + h / 2 + 14}v10M${x0},${y + h / 2 + 19}H${x0 + Lpx}"/>`;
    s += T(x0 + Lpx / 2, y + h / 2 + 40, `l = ${lab.l || "?"}`) + T(x0 - 8, y - h / 2 - 12, `A = ${lab.A || "?"}`, "start");
    s += `<text x="${x0 + Lpx / 2}" y="30" text-anchor="middle">R = <tspan class="val">${res ? eng(res.R, "Ω") : "?"}</tspan></text>`;
    return s;
  }
  function potDiagram(Tl, lab, v, res) {
    const p = clamp(v.p === undefined ? 50 : v.p, 0, 100) / 100, cx = 115, cy = 118, R = 72;
    const pt = (a, r = R) => [cx + r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];
    const arc = (a, b, cls) => { if (a - b < 0.5) return ""; const [x1, y1] = pt(a), [x2, y2] = pt(b); return `<path class="${cls}" d="M${x1.toFixed(1)},${y1.toFixed(1)}A${R},${R} 0 ${a - b > 180 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}"/>`; };
    const aw = 225 - p * 270, [wx, wy] = pt(aw, R - 4), [gx, gy] = pt(225, R + 20), [vx, vy] = pt(-45, R + 20);
    let s = arc(225, -45, "strip") + arc(225, aw, "strip r2") + arc(aw, -45, "strip r1");
    s += `<circle class="knob" cx="${cx}" cy="${cy}" r="30"/><line class="wiper" x1="${cx}" y1="${cy}" x2="${wx.toFixed(1)}" y2="${wy.toFixed(1)}"/><circle class="dot" cx="${cx}" cy="${cy}" r="4"/>`;
    s += T(gx, gy + 6, "GND", "middle", "small") + T(vx, vy + 6, "+V<tspan class=\"sb\" dy=\"3\">in</tspan>", "middle", "small") + T(cx, 226, "wiper → V<tspan class=\"sb\" dy=\"3\">out</tspan>", "middle", "small");
    s += T(cx, 30, `${(p * 270).toFixed(0)}° of 270°`, "middle", "val");
    const X = 300;
    s += `<circle class="term" cx="${X}" cy="22" r="4"/>${T(X + 12, 26, `V<tspan class="sb" dy="3">in</tspan><tspan dy="-3"> = ${lab.Vin || "?"}</tspan>`, "start")}`;
    s += Lab.D.res(X, 26, X, 104) + Lab.D.res(X, 124, X, 202) + Lab.D.wire([X, 104], [X, 124]) + Lab.D.wire([X, 114], [X + 50, 114]) + Lab.D.dot(X, 114) + Lab.D.term(X + 54, 114) + Lab.D.gnd(X, 202);
    s += `<text x="${X - 14}" y="70" text-anchor="end" class="r1t">R<tspan class="sb" dy="3">1</tspan><tspan dy="-3"> = ${res ? eng(res.R1, "Ω") : "?"}</tspan></text>`;
    s += `<text x="${X - 14}" y="168" text-anchor="end" class="r2t">R<tspan class="sb" dy="3">2</tspan><tspan dy="-3"> = ${res ? eng(res.R2, "Ω") : "?"}</tspan></text>`;
    s += `<text x="${X + 64}" y="142" text-anchor="middle">V<tspan class="sb" dy="3">out</tspan><tspan dy="-3"> = </tspan><tspan class="val">${res ? eng(res.vout, "V") : "?"}</tspan></text>`;
    return s;
  }

  // Thermistor and RTD: resistance against temperature
  const RT = {
    ntc: { name: "NTC thermistor", R: (T) => ntcR(T), y: [0, 36e3], yt: [0, 10e3, 20e3, 30e3], fy: (y) => `${y / 1000}k` },
    ptc: { name: "PTC silicon sensor", R: (T) => 1000 * (1 + 7.88e-3 * (T - 25) + 1.937e-5 * (T - 25) ** 2), y: [600, 1800], yt: [800, 1200, 1600], fy: (y) => y },
    rtd: { name: "Pt100 RTD", R: (T) => 100 * (1 + 0.00385 * T), y: [90, 145], yt: [100, 120, 140], fy: (y) => y }
  };
  function mountThermistor(el) {
    const S = { k: "ntc" };
    const c = pvCard(el, chips("Sensor", [["ntc", "NTC thermistor"], ["ptc", "PTC sensor"], ["rtd", "Pt100 RTD (metal)"]], S.k), fold("Step-by-Step Working", `<ol class="steps"></ol>`));
    const steps = el.querySelector(".steps");
    let lastT = null;
    const work = (T) => {
      const r = RT[S.k].R(T), Tk = T + 273.15;
      steps.innerHTML = stepsHtml(S.k === "ntc" ? [
        step("NTC model (β equation), temperatures in kelvin", "R = R<sub>0</sub> e<sup>β(1/T − 1/T<sub>0</sub>)</sup>", "R<sub>0</sub> = 10 kΩ at T<sub>0</sub> = 25 °C = 298.15 K, β = 3950 K", ""),
        step("Temperature in kelvin", "T(K) = T(°C) + 273.15", `= ${T.toFixed(0)} + 273.15`, `T = ${Tk.toFixed(2)} K`),
        step("Resistance", "R = 10 kΩ × e<sup>3950 (1/T − 1/298.15)</sup>", `= 10 kΩ × e<sup>${(3950 * (1 / Tk - 1 / 298.15)).toFixed(3)}</sup>`, `R = ${eng(r, "Ω")}`)]
        : S.k === "rtd" ? [
          step("Metal resistance rises in a straight line", "ρ(T) = ρ<sub>0</sub>(1 + α(T − T<sub>0</sub>)), so R = R<sub>0</sub>(1 + α(T − T<sub>0</sub>))", "Pt100: R<sub>0</sub> = 100 Ω at T<sub>0</sub> = 0 °C, α = 0.00385 /°C", ""),
          step("Resistance", "R = R<sub>0</sub>(1 + α(T − T<sub>0</sub>))", `= 100 × (1 + 0.00385 × (${T.toFixed(0)} − 0))`, `R = ${eng(r, "Ω")}`)]
          : [step("Silicon PTC sensor (datasheet model)", "R = R<sub>25</sub>(1 + A(T − 25) + B(T − 25)²)", "R<sub>25</sub> = 1 kΩ, A = 7.88 × 10<sup>−3</sup> /°C, B = 1.937 × 10<sup>−5</sup> /°C²", ""),
            step("Resistance", "R = 1000 (1 + 7.88 × 10<sup>−3</sup> ΔT + 1.937 × 10<sup>−5</sup> ΔT²)", `ΔT = ${T.toFixed(0)} − 25 = ${(T - 25).toFixed(0)} °C`, `R = ${eng(r, "Ω")}`)]);
    };
    const draw = (t) => {
      const T = 50 - 50 * Math.cos((2 * Math.PI * t) / 10), m = RT[S.k], r = m.R(T);
      c.scene.innerHTML = svg(320, 230, `${m.name} in water at ${T.toFixed(0)} °C measures ${eng(r, "Ω")}`,
        bath({ water: T, thermoT: T, heat: T > 50 ? 0.7 : 0.2, cool: t > 5 && T < 50, bub: t, lcd: eng(r, "Ω", 3), lcdLab: "multimeter (Ω)" }), "scene");
      const A = axes({ x: [0, 100], y: m.y, xt: [0, 25, 50, 75, 100], yt: m.yt, fy: m.fy, xl: "Temperature (°C)", yl: "Resistance (Ω)" });
      const g = A.s + poly(curve(A, m.R, 0, 100), "trace-a") + dot(A.X(T), A.Y(A.clipY(r))) + label(A.X(T) + (T > 55 ? -8 : 8), A.Y(A.clipY(r)) - 10, eng(r, "Ω", 3), T > 55 ? "end" : "start");
      c.graph.innerHTML = svg(A.W, A.H, `Resistance against temperature for the ${m.name}`, g);
      c.read.innerHTML = S.k === "ntc" ? `<strong>${T.toFixed(0)} °C → ${eng(r, "Ω")}</strong>. Hotter water, lower resistance: a <strong>negative</strong> temperature coefficient, and a big, curved change.`
        : S.k === "ptc" ? `<strong>${T.toFixed(0)} °C → ${eng(r, "Ω")}</strong>. Hotter water, higher resistance: a <strong>positive</strong> temperature coefficient.`
          : `<strong>${T.toFixed(0)} °C → ${eng(r, "Ω")}</strong>. A platinum wire's resistance rises by 0.385 Ω for every degree: small, but almost perfectly linear.`;
      const Tr = Math.round(T);
      if (Tr !== lastT) { lastT = Tr; work(Tr); }
    };
    const pl = player(c.pl, el, { dur: 10, hold: 0, draw, still: 3, label: "Temperature sweep position", clock: (t) => `${(50 - 50 * Math.cos((2 * Math.PI * t) / 10)).toFixed(0)} °C` });
    pick(el, (k) => { S.k = k; lastT = null; pl.redraw(); });
  }

  /* =====================================================================
     Passive: capacitive sensors
     ===================================================================== */
  function plateDiagram(Tl, lab, v, res) {
    const d = v.d > 0 ? v.d : 1, A = v.A > 0 ? v.A : 0.01, er = v.er > 0 ? v.er : 4;
    const gap = clamp(26 + 34 * Math.log10(d), 10, 110), W = clamp(200 + 110 * Math.log10(A / 0.01), 60, 330), cx = 220, cy = 118;
    const n = res ? clamp(Math.round(2 + 2.2 * Math.log10(res.C / 1e-12)), 2, 12) : 4;
    let s = `<rect class="diel" x="${cx - W / 2}" y="${cy - gap / 2}" width="${W}" height="${gap}" style="opacity:${clamp(0.1 + (er - 1) / 12, 0.1, 0.85).toFixed(2)}"/>`;
    s += `<rect class="plate-m" x="${cx - W / 2}" y="${cy - gap / 2 - 9}" width="${W}" height="9"/><rect class="plate-m" x="${cx - W / 2}" y="${cy + gap / 2}" width="${W}" height="9"/>`;
    for (let i = 0; i < n; i++) { const x = cx - W / 2 + ((i + 0.5) * W) / n; s += T(x, cy - gap / 2 - 13, "+", "middle", "chg p") + T(x, cy + gap / 2 + 24, MINUS, "middle", "chg m"); }
    s += `<path class="w thin" d="M${cx + W / 2 + 14},${cy - gap / 2}h10M${cx + W / 2 + 14},${cy + gap / 2}h10M${cx + W / 2 + 19},${cy - gap / 2}V${cy + gap / 2}"/>`;
    s += T(Math.min(430, cx + W / 2 + 28), cy + 5, `d = ${lab.d || "?"}`, "start") + T(cx, cy + 5, `ε<tspan class="sb" dy="3">r</tspan><tspan dy="-3"> = ${lab.er || "?"}</tspan>`);
    s += T(cx, 26, `A = ${lab.A || "?"}`) + `<text x="${cx}" y="${cy + gap / 2 + 52}" text-anchor="middle">C = <tspan class="val">${res ? eng(res.C, "F") : "?"}</tspan></text>`;
    return s;
  }
  function levelDiagram(Tl, lab, v, res) {
    const L = v.L > 0 ? v.L : 20, x = clamp(v.x >= 0 ? v.x : 0, 0, L), top = 28, bot = 204, h = bot - top, wy = bot - (x / L) * h;
    let s = `<rect class="tank" x="150" y="${top - 12}" width="140" height="${h + 20}" rx="6"/>`;
    s += `<rect class="water2" x="152" y="${wy}" width="136" height="${bot - wy + 6}"/>`;
    s += `<rect class="elec" x="200" y="${top}" width="7" height="${h}"/><rect class="elec" x="233" y="${top}" width="7" height="${h}"/>`;
    s += `<path class="w thin" d="M130,${top}h10M130,${bot}h10M135,${top}V${bot}"/>` + T(124, (top + bot) / 2 + 4, `L = ${lab.L || "?"}`, "end");
    if (x > 0) s += `<path class="w thin" d="M300,${wy}h10M300,${bot}h10M305,${wy}V${bot}"/>` + T(316, (wy + bot) / 2 + 4, `x = ${lab.x || "?"}`, "start");
    if (x < L) s += T(316, (top + wy) / 2 + 4, `L − x`, "start", "small");
    s += T(220, top - 18, "two electrode plates, gap d", "middle", "small");
    s += `<text x="12" y="34">C<tspan class="sb" dy="3">air</tspan><tspan dy="-3"> = </tspan><tspan class="val">${res ? eng(res.Ca, "F") : "?"}</tspan></text>`;
    s += `<text x="12" y="56">C<tspan class="sb" dy="3">water</tspan><tspan dy="-3"> = </tspan><tspan class="val">${res ? eng(res.Cw, "F") : "?"}</tspan></text>`;
    s += `<text x="12" y="78">C<tspan class="sb" dy="3">net</tspan><tspan dy="-3"> = </tspan><tspan class="val">${res ? eng(res.C, "F") : "?"}</tspan></text>`;
    return s;
  }
  function levelRender(extra, res, v) {
    const sec = this;
    if (!extra.dataset.ready) {
      extra.dataset.ready = "1";
      extra.innerHTML = `<div class="lv-graph"></div><div class="pv-pl"></div><p class="small-note">Press play to fill and empty the tank.</p>`;
      sec.fillPlayer = player(extra.querySelector(".pv-pl"), extra, { dur: 8, hold: 0, auto: false, still: 0, label: "Tank filling position",
        draw: (t) => { if (!sec.fillPlayer) return; const L = sec.lastL || 30; Lab.loadValues(sec.id, { x: Math.round(L * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 8)) * 10) / 10 }); } });
    }
    const box = extra.querySelector(".lv-graph");
    if (!res) { box.innerHTML = ""; return; }
    sec.lastL = v.L;
    const f = (x) => (res.a * x) / 100 + res.b, A = axes({ x: [0, v.L], y: [0, f(v.L) * 1.08], xt: [0, v.L / 4, v.L / 2, (3 * v.L) / 4, v.L].map((q) => Math.round(q * 10) / 10), yt: [0, f(v.L) / 2, f(v.L)], fy: (y) => eng(y, "F", 3), l: 62, xl: "Water depth x (cm)", yl: "" });
    box.innerHTML = svg(A.W, A.H, "Net capacitance against water depth: a straight line", A.s + poly(curve(A, f, 0, v.L, 4), "trace-a") + dot(A.X(res.x), A.Y(res.C)) + label(A.X(res.x) + (res.x > v.L * 0.6 ? -8 : 8), A.Y(res.C) - 10, eng(res.C, "F"), res.x > v.L * 0.6 ? "end" : "start"));
  }

  /* =====================================================================
     Passive: inductive sensors
     ===================================================================== */
  function coilDiagram(Tl, lab, v, res) {
    const N = v.N > 0 ? v.N : 100, l = v.l > 0 ? v.l : 0.05, mur = v.mur > 0 ? v.mur : 1;
    const r = v.by === "A" ? Math.sqrt((v.A > 0 ? v.A : 3e-4) / Math.PI) : (v.r > 0 ? v.r : 10) / 1000;
    const Lpx = clamp(180 + 100 * Math.log10(l / 0.05), 60, 330), Rpx = clamp(30 + 22 * Math.log10(r / 0.01), 10, 60), x0 = 220 - Lpx / 2, cy = 112, loops = clamp(Math.round(N / 10), 3, 18);
    let s = mur > 1.01 ? `<rect class="core-iron" x="${x0 - 14}" y="${cy - Rpx * 0.7}" width="${Lpx + 28}" height="${Rpx * 1.4}" rx="4"/>` : `<rect class="core-air" x="${x0 - 14}" y="${cy - Rpx * 0.7}" width="${Lpx + 28}" height="${Rpx * 1.4}" rx="4"/>`;
    for (let i = 0; i < loops; i++) {
      const x = x0 + ((i + 0.5) * Lpx) / loops;
      s += `<path class="coil-back" d="M${x + 4},${cy - Rpx}A5,${Rpx} 0 0 0 ${x - 2},${cy + Rpx}"/><path class="coil" d="M${x - 2},${cy + Rpx}A5,${Rpx} 0 0 1 ${x + 4 + Lpx / loops - 6},${cy - Rpx}"/>`;
    }
    s += `<path class="w" d="M${x0 - 2},${cy + Rpx}V${cy + Rpx + 26}H${x0 - 40}M${x0 + Lpx - 2},${cy - Rpx}V${cy - Rpx - 14}H${x0 + Lpx + 40}"/>`;
    s += `<path class="w thin" d="M${x0},${cy + Rpx + 38}v10M${x0 + Lpx},${cy + Rpx + 38}v10M${x0},${cy + Rpx + 43}H${x0 + Lpx}"/>` + T(220, cy + Rpx + 64, `l = ${lab.l || "?"}`);
    s += T(220, 26, `N = ${lab.N || "?"}, μ<tspan class="sb" dy="3">r</tspan><tspan dy="-3"> = ${lab.mur || "?"}</tspan> (${mur > 1.01 ? "iron core" : "air core"})`);
    s += T(x0 - 18, cy - Rpx - 10, v.by === "A" ? `A = ${lab.A || "?"}` : `r = ${lab.r || "?"}`, "end", "small");
    s += `<text x="220" y="${Math.min(232, cy + Rpx + 88)}" text-anchor="middle">L = <tspan class="val">${res ? eng(res.L, "H") : "?"}</tspan></text>`;
    return s;
  }

  // Inductive proximity switch: a metal part approaches the sensing face
  const METALS = { steel: { name: "Steel", sn: 8, cls: "steel" }, alu: { name: "Aluminium", sn: 3.2, cls: "alu" }, plastic: { name: "Plastic", sn: 0, cls: "plast" } };
  const oscAmp = (d, sn) => (sn ? clamp(1 - 0.4 * Math.exp((sn - d) / 2.5), 0.05, 1) : 1);
  function mountProximity(el) {
    const S = { k: "steel" };
    const c = pvCard(el, chips("Target material", Object.entries(METALS).map(([k, m]) => [k, m.name]), S.k), "");
    c.box.insertAdjacentHTML("beforeend", `<ol class="chain"><li data-c="0">Coil</li><li data-c="1">Oscillator</li><li data-c="2">Detection circuit</li><li data-c="3">Output circuit</li></ol>`);
    const chain = el.querySelectorAll(".chain li");
    const draw = (t) => {
      const m = METALS[S.k], d = 9 - 7.5 * Math.cos((2 * Math.PI * t) / 8), a = oscAmp(d, m.sn), on = a < 0.6;
      let s = `<rect class="sens-body" x="18" y="74" width="112" height="52" rx="4"/>`;
      for (let x = 26; x < 128; x += 7) s += `<line class="thread" x1="${x}" y1="74" x2="${x + 4}" y2="126"/>`;
      s += `<rect class="sens-face" x="128" y="72" width="10" height="56" rx="3"/><circle class="led${on ? " on" : ""}" cx="10" cy="100" r="6"/>${T(10, 146, "LED", "middle", "small")}`;
      for (let i = 1; i <= 3; i++) s += `<path class="field" style="opacity:${(a * 0.9 - i * 0.12).toFixed(2)}" d="M138,${100 - 12 * i}q${14 * i},${12 * i} 0,${24 * i}"/>`;
      const bx = 140 + d * 9;
      s += `<rect class="belt" x="120" y="152" width="210" height="10" rx="5"/><circle class="roller" cx="126" cy="157" r="7"/><circle class="roller" cx="324" cy="157" r="7"/>`;
      s += `<rect class="target ${m.cls}" x="${bx}" y="78" width="40" height="74" rx="4"/>${T(bx + 20, 120, m.name, "middle", "small tgt")}`;
      s += `<path class="w thin" d="M138,60h0M138,54v12M${bx},54v12M138,60H${bx}"/>` + T((138 + bx) / 2, 48, `d = ${d.toFixed(1)} mm`, "middle", "small");
      s += `<rect class="dist-box" x="170" y="176" width="150" height="26" rx="5"/>${T(245, 194, on ? "OUTPUT ON: metal!" : "output off", "middle", on ? "dist-t on" : "dist-t")}`;
      c.scene.innerHTML = svg(340, 215, `A ${m.name.toLowerCase()} part ${d.toFixed(1)} mm from the sensing face; the output is ${on ? "on" : "off"}`, s, "scene");
      const A = axes({ x: [0, 16], y: [0, 1.1], xt: [0, 4, 8, 12, 16], yt: [0, 0.5, 1], fy: (y) => `${y * 100}%`, xl: "Distance to the face (mm)", yl: "Oscillation amplitude" });
      let g = A.s + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(0.6)}" y2="${A.Y(0.6)}"/>` + T(A.l + A.pw - 4, A.Y(0.6) + 14, "switch point", "end", "reflab");
      g += poly(curve(A, (x) => oscAmp(x, m.sn), 0, 16), "trace-a") + dot(A.X(d), A.Y(a));
      c.graph.innerHTML = svg(A.W, A.H, "Oscillator amplitude against distance", g);
      chain.forEach((li, i) => li.classList.toggle("on", i < 2 || (i === 2 && a < 0.98) || (i === 3 && on)));
      c.read.innerHTML = !m.sn ? "Plastic does not change the coil's field: the oscillation stays at 100% and the sensor never switches. Use a <strong>capacitive</strong> sensor for plastic."
        : `${m.name} at <strong>${d.toFixed(1)} mm</strong>: eddy currents in the metal take energy from the field, so the oscillation drops to <strong>${(a * 100).toFixed(0)}%</strong>. ${on ? "Below the switch point: the output turns <strong>on</strong>." : "Still above the switch point: output off."} Switching distance for ${m.name.toLowerCase()}: about ${m.sn} mm.`;
    };
    const pl = player(c.pl, el, { dur: 8, hold: 0, draw, still: 4, label: "Conveyor animation position" });
    pick(el, (k) => { S.k = k; pl.redraw(); });
  }

  // Traffic light with an inductive loop in the road
  function mountLoop(el) {
    const c = pvCard(el);
    const L0 = 100, dL = 3;
    const pos = (t) => (t < 3.5 ? lerp(-20, 256, 1 - (1 - t / 3.5) ** 2) : t < 6.5 ? 256 : 256 + 190 * ((t - 6.5) / 4) ** 2);
    const overlap = (front) => clamp((Math.min(front, 252) - Math.max(front - 62, 200)) / 52, 0, 1);
    const Lof = (t) => L0 - dL * overlap(pos(t));
    let tDet = null;
    for (let x = 0; x < 6.5; x += 0.05) if (overlap(pos(x)) > 0.5) { tDet = x; break; }
    const draw = (t) => {
      const f = pos(t), green = tDet !== null && t > tDet + 1.4, L = Lof(t);
      let s = `<rect class="grass" x="0" y="0" width="340" height="230"/><rect class="road2" x="0" y="64" width="340" height="128"/><line class="lane" x1="0" y1="128" x2="340" y2="128"/><line class="stopl" x1="262" y1="130" x2="262" y2="190"/>`;
      s += `<rect class="loopcut${overlap(f) > 0.5 ? " hit" : ""}" x="200" y="138" width="52" height="44" rx="2"/><path class="lead" d="M226,182V204H280"/>`;
      s += `<rect class="cab" x="280" y="194" width="56" height="28" rx="3"/>${T(308, 212, "detector", "middle", "small")}`;
      s += `<g class="car-top"><rect x="${f - 62}" y="143" width="62" height="32" rx="9"/><rect class="car-glass" x="${f - 24}" y="147" width="12" height="24" rx="3"/><rect class="car-glass" x="${f - 52}" y="148" width="10" height="22" rx="3"/></g>`;
      s += `<rect class="tl-pole" x="300" y="24" width="5" height="40"/><rect class="tl-box" x="286" y="6" width="34" height="60" rx="6"/>`;
      s += `<circle class="lamp r${green ? "" : " on"}" cx="303" cy="20" r="7"/><circle class="lamp a" cx="303" cy="36" r="7"/><circle class="lamp g${green ? " on" : ""}" cx="303" cy="52" r="7"/>`;
      s += `<rect class="dist-box" x="8" y="10" width="150" height="26" rx="5"/>${T(83, 28, `L = ${L.toFixed(1)} µH`, "middle", "dist-t")}`;
      c.scene.innerHTML = svg(340, 230, `Top view of a road junction; a car ${overlap(f) > 0.5 ? "is over" : "is not over"} the loop; the light is ${green ? "green" : "red"}`, s, "scene");
      const A = axes({ x: [0, 11], y: [96, 101], xt: [0, 2, 4, 6, 8, 10], yt: [96, 97, 98, 99, 100, 101], xl: "Time (s)", yl: "Loop inductance (µH)" });
      const pts = []; for (let x = 0; x <= t; x += 0.05) pts.push([A.X(x), A.Y(Lof(x))]);
      let g = A.s + poly(pts, "trace-a");
      if (tDet !== null && t > tDet) g += `<line class="mk" x1="${A.X(tDet)}" x2="${A.X(tDet)}" y1="${A.t}" y2="${A.t + A.ph}"/>` + label(A.X(tDet) + 4, A.t + 14, "car detected", "start", "mklab");
      c.graph.innerHTML = svg(A.W, A.H, "Loop inductance against time", g);
      c.read.innerHTML = overlap(f) > 0.5 ? `The car's steel body is over the loop. Eddy currents in it oppose the loop's field, so the inductance <strong>drops</strong> from ${L0} to ${L.toFixed(1)} µH. The detector notices the change and ${green ? "the light has turned <strong>green</strong>." : "asks the controller for a green light."}`
        : f > 262 ? "The car has gone and the inductance is back to normal." : `No car over the loop: L = ${L0} µH and the light stays red.`;
    };
    player(c.pl, el, { dur: 11, hold: 1, draw, still: 5.5, label: "Traffic animation position", clock: (t) => `${t.toFixed(1)} s` });
  }

  // LVDT: a moving iron core between one primary and two secondary coils
  function mountLvdt(el) {
    const c = pvCard(el);
    const xAt = (t) => 8 * Math.sin((2 * Math.PI * t) / 8);
    const coil = (x0, x1, cls, lab) => { let s = ""; for (let x = x0; x < x1; x += 8) s += `<path class="${cls}" d="M${x},82a4,22 0 0 1 0,44"/>`; return s + T((x0 + x1) / 2, 70, lab, "middle", "small"); };
    const draw = (t) => {
      const x = xAt(t), v1 = 1 + 0.1 * x, v2 = 1 - 0.1 * x, vo = v1 - v2;
      let s = `<rect class="tube" x="40" y="88" width="250" height="32" rx="4"/>`;
      s += `<rect class="core-iron" x="${115 - x * 8}" y="96" width="110" height="16" rx="3"/><line class="w" x1="${225 - x * 8}" y1="104" x2="330" y2="104"/><path class="w" d="M322,98l8,6l-8,6"/>`;
      s += coil(48, 120, "coil s1", "S1") + coil(134, 196, "coil pri", "Primary") + coil(210, 282, "coil s2", "S2");
      s += `<circle class="ac" cx="165" cy="160" r="12"/>${T(165, 165, "~", "middle", "tt")}<path class="w thin" d="M134,126V160H153M196,126V160H177"/>${T(165, 188, "AC input", "middle", "small")}`;
      s += T(70, 150, `V1 = ${v1.toFixed(2)} V`, "middle", "small s1t") + T(260, 150, `V2 = ${v2.toFixed(2)} V`, "middle", "small s2t");
      s += T(165, 36, `core displacement ${fx(x, 1)} mm`, "middle", "tt");
      // mini oscilloscope of V1, V2 and Vout
      const o = { x0: 20, y0: 212, w: 300, h: 26 };
      const wv = (A, cls) => { const p = []; for (let i = 0; i <= 60; i++) p.push([o.x0 + (i / 60) * o.w, o.y0 - A * o.h * Math.sin((i / 60) * 4 * Math.PI)]); return poly(p, cls); };
      s += `<line class="gl" x1="${o.x0}" x2="${o.x0 + o.w}" y1="${o.y0}" y2="${o.y0}"/>` + wv(v1 * 0.5, "osc1") + wv(v2 * 0.5, "osc2") + wv(vo * 0.5, "osco");
      c.scene.innerHTML = svg(340, 245, `LVDT with the core ${fx(x, 1)} mm from centre; output ${fx(vo, 2)} V`, s, "scene");
      const A = axes({ x: [-10, 10], y: [-2, 2], xt: [-10, -5, 0, 5, 10], yt: [-2, -1, 0, 1, 2], xl: "Core displacement (mm)", yl: "Output V1 − V2 (V)" });
      let g = A.s + poly([[A.X(-10), A.Y(-2)], [A.X(10), A.Y(2)]], "trace-a") + poly([[A.X(-10), A.Y(2)], [A.X(0), A.Y(0)], [A.X(10), A.Y(2)]], "trace-in");
      g += dot(A.X(x), A.Y(vo)) + label(A.X(x) + (x > 3 ? -8 : 8), A.Y(vo) - 10, `${fx(vo, 2)} V`, x > 3 ? "end" : "start");
      c.graph.innerHTML = svg(A.W, A.H, "LVDT output against core position: a straight line through zero", g) + `<p class="legend"><span class="key"></span>output with phase (sign) <span class="key input"></span>size only |V1 − V2|</p>`;
      c.read.innerHTML = `Core at <strong>${fx(x, 1)} mm</strong>: V1 = ${v1.toFixed(2)} V, V2 = ${v2.toFixed(2)} V, so V<sub>out</sub> = V1 − V2 = <strong>${fx(vo, 2)} V</strong>. ${Math.abs(x) < 0.3 ? "At the centre (null position) the two secondaries cancel." : x > 0 ? "Core towards S1: the output is in phase with the input." : "Core towards S2: the output is 180° out of phase."} Here 1 mm gives 0.2 V.`;
    };
    player(c.pl, el, { dur: 8, hold: 0, draw, still: 1.2, label: "Core position" });
  }

  /* =====================================================================
     Active: piezoelectric
     ===================================================================== */
  const TAPS = [[0.8, 1], [2.3, 0.5], [3.8, 0.8], [5.2, 0.3]];
  const force = (t) => TAPS.reduce((a, [c, k]) => a + k * Math.exp(-(((t - c) / 0.14) ** 2)), 0);
  const piezoV = (t) => TAPS.reduce((a, [c, k]) => { const u = t - c; return a + k * 4 * (u < -0.35 ? 0 : Math.exp(-((u / 0.14) ** 2)) - (u > 0 ? 0.25 * Math.exp(-u / 0.25) * (1 - Math.exp(-u / 0.05)) : 0)); }, 0);
  const BUZZ = `void setup()
{
  ledcSetup(0, 2000, 8);    // PWM channel 0
  ledcAttachPin(25, 0);     // buzzer on GPIO25
}

void loop()
{
  ledcWriteTone(0, 1000);   // 1 kHz tone
  delay(500);
  ledcWriteTone(0, 0);      // silence
  delay(500);
}`;
  function mountPiezo(el, sec) {
    const S = { k: "sensor", f: 2000 };
    const c = pvCard(el, chips("Use the piezo as", [["sensor", "Sensor: press it"], ["buzzer", "Actuator: buzzer"]], S.k) +
      `<div class="slider-field buzz-f" hidden><label for="${sec.id}-f">Tone frequency: <strong class="f-v">2000 Hz</strong></label><input type="range" id="${sec.id}-f" min="500" max="4000" step="100" value="2000"></div>`,
      `<div class="buzz-code" hidden><div class="tone-host"></div><p class="small-note">Play the tone and move the frequency slider. A real buzzer driven by a square wave sounds like this. Keep the volume low.</p>${codeBlock(BUZZ, "ESP32 buzzer with PWM (Arduino core 2.x)")}</div>`);
    const fsl = el.querySelector(`#${sec.id}-f`), fv = el.querySelector(".f-v");
    const draw = (t) => {
      let s = "", g;
      if (S.k === "sensor") {
        const F = force(t), sq = F * 7, v = piezoV(t);
        s += `<rect class="pz-plate" x="90" y="${88 + sq}" width="120" height="10" rx="2"/><rect class="pz-crystal" x="100" y="${98 + sq}" width="100" height="${56 - 2 * sq}"/><rect class="pz-plate" x="90" y="${154 - sq}" width="120" height="10" rx="2"/>`;
        if (F > 0.08) { s += `<path class="push" d="M150,${36 + sq}v38m-10,-12l10,12l10,-12M150,${222 - sq}v-38m-10,12l10,-12l10,12"/>`; const n = Math.round(F * 5); for (let i = 0; i < n; i++) { s += T(110 + i * 20, 94 + sq, "+", "middle", "chg p") + T(110 + i * 20, 170 - sq, MINUS, "middle", "chg m"); } }
        s += `<path class="w" d="M210,${93 + sq}H224V112H236M210,${159 - sq}H224V142H236"/><rect class="meter" x="236" y="96" width="78" height="60" rx="8"/><rect class="lcd" x="242" y="104" width="66" height="26" rx="4"/>${T(275, 123, `${v.toFixed(1)} V`, "middle", "lcdt")}${T(275, 148, "voltage", "middle", "small")}`;
        s += F > 0.08 ? T(166, 60 + sq, "force", "start", "small") : "";
        const A = axes({ x: [0, 6], y: [-1.5, 4.5], xt: [0, 1, 2, 3, 4, 5, 6], yt: [-1, 0, 1, 2, 3, 4], xl: "Time (s)", yl: "Voltage (V)" });
        g = A.s + poly(curve(A, piezoV, 0, t, Math.max(2, Math.round(t * 60))), "trace-a") + dot(A.X(t), A.Y(A.clipY(piezoV(t))));
        c.graph.innerHTML = svg(A.W, A.H, "Voltage from the piezo crystal each time it is pressed", g);
        c.read.innerHTML = F > 0.08 ? `Pressing squeezes the crystal: charges separate and a voltage appears (<strong>${v.toFixed(1)} V</strong> now). A harder press gives a bigger spike. No battery is needed: the piezo is <strong>self-generating (active)</strong>.` : "Each press gives a voltage spike. A steady force gives no lasting voltage: the charge leaks away, so piezo sensors measure changing forces (vibration, knocks, sound).";
      } else {
        const ph = Math.sin(t * 2 * Math.PI * 3), bend = ph * 9, per = 1000 / S.f;
        s += `<rect class="bz-case" x="40" y="118" width="130" height="50" rx="8"/><path class="bz-disc" d="M52,118Q105,${118 - bend} 158,118"/><circle class="bz-cer" cx="105" cy="${118 - bend / 2 - 3}" r="3"/>`;
        for (let i = 0; i < 4; i++) { const r = 20 + ((t * S.f / 200 + i * 20) % 80); s += `<path class="snd" style="opacity:${(1 - r / 100).toFixed(2)}" d="M${105 - r * 0.7},${100 - r * 0.7}Q105,${100 - r * 1.1} ${105 + r * 0.7},${100 - r * 0.7}"/>`; }
        s += `<rect class="bx" x="210" y="120" width="96" height="46" rx="6"/>${T(258, 141, "ESP32", "middle", "tt")}${T(258, 158, "GPIO25 PWM", "middle", "small")}<path class="w" d="M170,142H210"/>`;
        const A = axes({ x: [0, 4 * per], y: [-0.5, 4], xt: [0, per, 2 * per, 3 * per, 4 * per], fx: (x) => x.toFixed(x < 1 ? 2 : 1), yt: [0, 3.3], fy: (y) => y, xl: "Time (ms)", yl: "Pin voltage (V)" });
        const pts = []; for (let k = 0; k < 4; k++) pts.push([A.X(k * per), A.Y(0)], [A.X(k * per), A.Y(3.3)], [A.X((k + 0.5) * per), A.Y(3.3)], [A.X((k + 0.5) * per), A.Y(0)]);
        pts.push([A.X(4 * per), A.Y(0)]);
        g = A.s + poly(pts, "trace-d");
        c.graph.innerHTML = svg(A.W, A.H, `Square wave at ${S.f} Hz driving the buzzer`, g);
        c.read.innerHTML = `The ESP32 switches the pin on and off <strong>${S.f} times a second</strong> (period ${per.toFixed(2)} ms). Each pulse bends the disc, so it vibrates at ${S.f} Hz and you hear a tone. Here the piezo is an <strong>actuator</strong>: electrical energy in, sound out.`;
      }
      c.scene.innerHTML = svg(320, 230, S.k === "sensor" ? "Piezo crystal between two metal plates being pressed" : "Piezo buzzer disc vibrating and sending out sound", s, "scene");
    };
    const pl = player(c.pl, el, { dur: 6, hold: 0, draw, still: 0.8, label: "Piezo animation position" });
    const snd = tone(el.querySelector(".tone-host"));
    const wave = () => snd.set((sr, secs) => { const n = Math.round(sr * secs), d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = ((i / sr) * S.f) % 1 < 0.5 ? 0.5 : -0.5; return d; });
    wave();
    pick(el, (k) => { S.k = k; el.querySelector(".buzz-f").hidden = k !== "buzzer"; el.querySelector(".buzz-code").hidden = k !== "buzzer"; if (k !== "buzzer") snd.stop(); pl.restart(); });
    fsl.addEventListener("input", () => { S.f = +fsl.value; fv.textContent = `${S.f} Hz`; pl.redraw(); wave(); });
  }

  /* =====================================================================
     Active: photodiode (photoconductive mode) and Hall effect
     ===================================================================== */
  const RESP = 0.05e-6; // A per lux, a BPW34-type photodiode
  function photoDiagram(Tl, lab, v, res) {
    const E = v.E >= 0 ? v.E : 0, k = clamp(E / 1500, 0, 1), X = 190;
    let s = `<circle class="sun" cx="50" cy="96" r="${14 + 8 * k}" style="opacity:${(0.25 + 0.75 * k).toFixed(2)}"/>`;
    for (let i = 0; i < 3; i++) s += `<path class="ray${E > 0 ? " live" : ""}" style="opacity:${(0.2 + 0.8 * k).toFixed(2)};animation-delay:${i * 0.25}s" d="M${86},${80 + i * 14}L${150},${88 + i * 8}"/>`;
    s += `<circle class="term" cx="${X}" cy="22" r="4"/>` + T(X + 12, 26, `V<tspan class="sb" dy="3">CC</tspan><tspan dy="-3"> = ${lab.Vcc || "?"}</tspan>`, "start");
    s += `<path class="w" d="M${X},26V78M${X},104V132"/><path class="w" d="M${X - 12},104H${X + 12}L${X},80Z"/><path class="w" d="M${X - 12},78H${X + 12}"/>`;
    s += `<path class="w thin" d="M${X - 26},70l10,8m-4,0h4v-4M${X - 26},86l10,8m-4,0h4v-4"/>`;
    s += `<path class="iarrow" d="M${X + 28},70V118m-6,-8l6,8l6,-8"/>` + T(X + 40, 98, `I<tspan class="sb" dy="3">λ</tspan><tspan dy="-3"> = ${res ? eng(res.I, "A") : "?"}</tspan>`, "start");
    s += Lab.D.res(X, 132, X, 200) + Lab.D.gnd(X, 200) + T(X - 16, 170, `R<tspan class="sb" dy="3">L</tspan><tspan dy="-3"> = ${lab.RL || "?"}</tspan>`, "end");
    s += `<path class="w" d="M${X},132H${X + 70}"/>` + Lab.D.dot(X, 132) + Lab.D.term(X + 74, 132);
    s += `<text x="${X + 88}" y="136">V<tspan class="sb" dy="3">out</tspan><tspan dy="-3"> = </tspan><tspan class="val${res && res.sat ? " over" : ""}">${res ? eng(res.vout, "V") : "?"}</tspan></text>`;
    s += T(50, 140, `${E} lux`, "middle", "small");
    return s;
  }
  function photoRender(extra, res, v) {
    if (!res) { extra.innerHTML = ""; return; }
    const emax = Math.max(2000, v.E * 1.2), f = (e) => Math.min(v.Vcc, RESP * e * v.RL);
    const A = axes({ x: [0, emax], y: [0, v.Vcc * 1.15], xt: [0, emax / 4, emax / 2, (3 * emax) / 4, emax].map((q) => Math.round(q)), yt: [0, v.Vcc / 2, v.Vcc], fy: (y) => y.toFixed(2), xl: "Light (lux)", yl: "Vout (V)" });
    extra.innerHTML = `<div class="plot-box">${svg(A.W, A.H, "Output voltage against light level", A.s + poly(curve(A, f, 0, emax, 120), "trace-a") + dot(A.X(v.E), A.Y(res.vout)))}</div>`;
  }
  function mountHall(el) {
    const c = pvCard(el, "", fold("Step-by-Step Working: The Hall Voltage", `<ol class="steps"></ol>`));
    const steps = el.querySelector(".steps"), I = 5e-3, n = 1e22, q = 1.602e-19, th = 1e-4;
    const dAt = (t) => 17 - 15 * Math.cos((2 * Math.PI * t) / 8), Bof = (d) => 0.25 / (1 + (d / 6) ** 2), VH = (B) => (I * B) / (n * q * th);
    let last = -1;
    const draw = (t) => {
      const d = dAt(t), B = Bof(d), vh = VH(B), k = B / 0.25;
      let s = `<rect class="hall" x="40" y="110" width="220" height="74" rx="4"/>${T(150, 204, "thin semiconductor plate (top view)", "middle", "small")}`;
      s += `<path class="iarrow" d="M14,147H36m-8,-6l8,6l-8,6"/>${T(18, 136, "I", "middle", "tt")}<path class="iarrow" d="M264,147H290m-8,-6l8,6l-8,6"/>`;
      const my = 20 + (d / 32) * 40;
      s += `<g style="opacity:${(0.35 + 0.65 * k).toFixed(2)}"><rect class="mag-n" x="110" y="${my}" width="80" height="22" rx="3"/><rect class="mag-s" x="110" y="${my + 22}" width="80" height="22" rx="3"/>${T(150, my + 16, "N", "middle", "lt")}${T(150, my + 38, "S", "middle", "lt")}</g>`;
      s += T(206, my + 30, `${d.toFixed(0)} mm away`, "start", "small");
      for (let i = 0; i < 9; i++) { const x = 44 + ((t * 60 + i * 26) % 214), yy = 147 - k * 26 * ((x - 40) / 220); s += `<circle class="carrier" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="3"/>`; }
      const nc = Math.round(k * 7);
      for (let i = 0; i < nc; i++) s += T(70 + i * 26, 124, MINUS, "middle", "chg m") + T(70 + i * 26, 180, "+", "middle", "chg p");
      s += `<path class="w thin" d="M250,110V96H300M250,184V198H300V96"/><rect class="meter" x="286" y="122" width="48" height="50" rx="6"/>${T(310, 144, "V<tspan class='sb' dy='3'>H</tspan>", "middle", "tt")}${T(310, 162, `${(vh * 1000).toFixed(1)} mV`, "middle", "small")}`;
      c.scene.innerHTML = svg(340, 215, `Magnet ${d.toFixed(0)} mm above a Hall plate; Hall voltage ${(vh * 1000).toFixed(1)} mV`, s, "scene");
      const A = axes({ x: [0, 32], y: [0, 8], xt: [0, 8, 16, 24, 32], yt: [0, 2, 4, 6, 8], xl: "Magnet distance (mm)", yl: "Hall voltage (mV)" });
      c.graph.innerHTML = svg(A.W, A.H, "Hall voltage against magnet distance", A.s + poly(curve(A, (x) => VH(Bof(x)) * 1000, 0, 32), "trace-a") + dot(A.X(d), A.Y(vh * 1000)));
      c.read.innerHTML = `Magnet ${d.toFixed(0)} mm away: B ≈ <strong>${(B * 1000).toFixed(0)} mT</strong>. The field pushes the moving charges to one edge of the plate, so a voltage appears across it: <strong>V<sub>H</sub> = ${(vh * 1000).toFixed(2)} mV</strong>. Closer magnet, stronger field, bigger V<sub>H</sub>. It needs the bias current I from a supply.`;
      const Br = Math.round(B * 1000);
      if (Br !== last) {
        last = Br;
        steps.innerHTML = stepsHtml([
          step("Hall voltage", "V<sub>H</sub> = I B ÷ (n q t)", "I = bias current, B = field, n = charge carriers per m³, q = 1.602 × 10<sup>−19</sup> C, t = plate thickness", ""),
          step("Substitute", "", `= (5 mA × ${(B * 1000).toFixed(0)} mT) ÷ (10<sup>22</sup> m<sup>−3</sup> × 1.602 × 10<sup>−19</sup> C × 0.1 mm)`, `V<sub>H</sub> = ${eng(vh, "V")}`)]);
      }
    };
    player(c.pl, el, { dur: 8, hold: 0, draw, still: 3.5, label: "Magnet position" });
  }

  /* =====================================================================
     Actuators: LED, DC motor, servo, relay
     ===================================================================== */
  const pwmPlot = (duty, vs, per, unit, label2) => {
    const A = axes({ x: [0, 3 * per], y: [0, vs * 1.25], xt: [0, per, 2 * per, 3 * per], fx: (x) => `${+x.toFixed(2)}`, yt: [0, vs], fy: (y) => y, xl: `Time (${unit})`, yl: "Voltage (V)", H: 200 });
    const d = clamp(duty, 0, 1), pts = [];
    for (let k = 0; k < 3; k++) {
      if (d === 0) pts.push([A.X(k * per), A.Y(0)], [A.X((k + 1) * per), A.Y(0)]);
      else if (d === 1) pts.push([A.X(k * per), A.Y(vs)], [A.X((k + 1) * per), A.Y(vs)]);
      else pts.push([A.X(k * per), A.Y(0)], [A.X(k * per), A.Y(vs)], [A.X((k + d) * per), A.Y(vs)], [A.X((k + d) * per), A.Y(0)], [A.X((k + 1) * per), A.Y(0)]);
    }
    return svg(A.W, A.H, label2, A.s + poly(pts, "trace-d") + `<line class="ref" x1="${A.l}" x2="${A.l + A.pw}" y1="${A.Y(d * vs)}" y2="${A.Y(d * vs)}"/>` + T(A.l + A.pw - 4, A.Y(d * vs) - 5, `average ${(d * vs).toFixed(2)} V`, "end", "reflab"));
  };
  const LEDS = { red: { vf: 2.0, c: "#ff4a3d", n: "Red" }, yellow: { vf: 2.1, c: "#ffc93d", n: "Yellow" }, blue: { vf: 3.0, c: "#4ea3ff", n: "Blue" }, white: { vf: 3.0, c: "#f4f7ff", n: "White" } };
  function mountLed(el, sec) {
    const S = { k: "red", d: 60 };
    el.innerHTML = `<div class="pv">${chips("LED colour", Object.entries(LEDS).map(([k, m]) => [k, m.n]), S.k)}
      <div class="slider-field"><label for="${sec.id}-d">PWM duty cycle: <strong class="d-v">60%</strong></label><input type="range" id="${sec.id}-d" min="0" max="100" step="1" value="60"></div>
      <div class="pv-grid"><div class="pv-scene"></div><div class="pv-graph"></div></div><p class="pv-read"></p>${fold("Step-by-Step Working", `<ol class="steps"></ol>`)}</div>`;
    const q = (s) => el.querySelector(s), sl = q(`#${sec.id}-d`);
    const draw = () => {
      const m = LEDS[S.k], d = S.d / 100, R = (3.3 - m.vf) / 0.01;
      let s = `<rect class="bx" x="12" y="84" width="74" height="52" rx="6"/>${T(49, 106, "ESP32", "middle", "tt")}${T(49, 124, "GPIO23", "middle", "small")}`;
      s += `<path class="w" d="M86,110H112"/>` + Lab.D.res(112, 110, 176, 110) + T(144, 94, `${Math.round(R)} Ω`, "middle", "small");
      s += `<path class="w" d="M176,110H190V190H213V168"/><circle class="led-glow" cx="220" cy="150" r="${22 + 20 * d}" style="fill:${m.c};opacity:${(0.65 * d).toFixed(2)}"/>`;
      s += `<path class="led-body" d="M206,122h28v34a14,14 0 0 1 -28,0z" style="fill:${m.c};opacity:${(0.35 + 0.65 * d).toFixed(2)}"/><path class="w" d="M227,168V200"/>` + Lab.D.gnd(227, 200) + T(206, 186, "+", "end", "small") + T(236, 188, MINUS, "start", "small");
      q(".pv-scene").innerHTML = svg(320, 230, `${m.n} LED at ${S.d}% brightness`, s, "scene");
      q(".pv-graph").innerHTML = pwmPlot(d, 3.3, 0.2, "ms", `PWM at 5 kHz with ${S.d}% duty cycle`);
      q(".pv-read").innerHTML = `At <strong>${S.d}% duty</strong> the pin is HIGH for ${S.d}% of each 0.2 ms period. The LED flickers 5000 times a second, far too fast to see, so it looks <strong>${S.d}% bright</strong> (average ${(d * 3.3).toFixed(2)} V).`;
      q(".steps").innerHTML = stepsHtml([
        step("Current-limiting resistor", "R = (V<sub>pin</sub> − V<sub>F</sub>) ÷ I<sub>LED</sub>", `= (3.3 V − ${m.vf.toFixed(1)} V) ÷ 10 mA`, `R = ${Math.round(R)} Ω (nearest standard value ${m.vf >= 3 ? "33" : m.vf >= 2.1 ? "120" : "130"} Ω)`),
        step("Average pin voltage with PWM", "V<sub>avg</sub> = D × V<sub>HIGH</sub>", `= ${d.toFixed(2)} × 3.3 V`, `V<sub>avg</sub> = ${(d * 3.3).toFixed(2)} V`),
        step("8-bit PWM value for this duty", "value = D × 255", `= ${d.toFixed(2)} × 255`, `ledcWrite(0, ${Math.round(d * 255)})`)]);
    };
    pick(el, (k) => { S.k = k; draw(); });
    sl.addEventListener("input", () => { S.d = +sl.value; q(".d-v").textContent = `${S.d}%`; draw(); });
    draw();
  }
  function mountMotor(el, sec) {
    const S = { d: 50, dir: "fwd" };
    el.innerHTML = `<div class="pv">${chips("Direction", [["fwd", "Forward"], ["rev", "Reverse"]], S.dir)}
      <div class="slider-field"><label for="${sec.id}-d">PWM duty cycle: <strong class="d-v">50%</strong></label><input type="range" id="${sec.id}-d" min="0" max="100" step="1" value="50"></div>
      <div class="pv-grid"><div class="pv-scene"></div><div class="pv-graph"></div></div><p class="pv-read"></p>${fold("Step-by-Step Working", `<ol class="steps"></ol>`)}</div>`;
    const q = (s) => el.querySelector(s), sl = q(`#${sec.id}-d`);
    let s = `<rect class="bx" x="8" y="40" width="64" height="44" rx="6"/>${T(40, 60, "ESP32", "middle", "tt")}${T(40, 76, "PWM", "middle", "small")}<path class="w" d="M72,62H96"/>`;
    s += `<rect class="drv" x="96" y="36" width="76" height="52" rx="6"/>${T(134, 58, "motor", "middle", "small")}${T(134, 74, "driver", "middle", "small")}<path class="w" d="M172,56H196M172,68H196"/>`;
    s += `<rect class="mot-can" x="196" y="40" width="62" height="44" rx="10"/><rect class="gearbox" x="250" y="34" width="34" height="56" rx="4"/>${T(227, 66, "M", "middle", "tt")}`;
    s += `<g class="wheel-g"><g class="wheel"><circle class="tyre" cx="232" cy="164" r="50"/><circle class="rim" cx="232" cy="164" r="32"/>${[0, 60, 120, 180, 240, 300].map((a) => `<line class="spoke" x1="232" y1="164" x2="${232 + 30 * Math.cos((a * Math.PI) / 180)}" y2="${164 + 30 * Math.sin((a * Math.PI) / 180)}"/>`).join("")}<circle class="hub" cx="232" cy="164" r="8"/></g></g>`;
    s += `<path class="w" d="M267,90V112"/>${T(40, 190, "12 V supply", "middle", "small")}<path class="w thin" d="M40,172V120H134V88"/>`;
    q(".pv-scene").innerHTML = svg(320, 230, "DC gear motor driving a wheel", s, "scene");
    const draw = () => {
      const d = S.d / 100, va = d * 12, rpm = (va / 12) * 200, wh = q(".wheel");
      wh.style.animationDuration = rpm > 0 ? `${Math.max(0.25, 60 / rpm)}s` : "0s";
      wh.style.animationDirection = S.dir === "rev" ? "reverse" : "normal";
      wh.classList.toggle("spin", rpm > 0 && !reduceMotion);
      q(".pv-graph").innerHTML = pwmPlot(d, 12, 0.05, "ms", `PWM at 20 kHz with ${S.d}% duty cycle`);
      q(".pv-read").innerHTML = `${S.d}% duty gives an average of <strong>${va.toFixed(1)} V</strong>, so the motor turns at about <strong>${Math.round(rpm)} rpm</strong> ${S.dir === "rev" ? "in reverse" : "forwards"}. The driver swaps the polarity to reverse it.`;
      q(".steps").innerHTML = stepsHtml([
        step("Average voltage to the motor", "V<sub>avg</sub> = D × V<sub>S</sub>", `= ${d.toFixed(2)} × 12 V`, `V<sub>avg</sub> = ${va.toFixed(1)} V`),
        step("Speed (a PMDC motor's speed is roughly proportional to its voltage)", "n ≈ (V<sub>avg</sub> ÷ V<sub>rated</sub>) × n<sub>rated</sub>", `= (${va.toFixed(1)} ÷ 12) × 200 rpm`, `n ≈ ${Math.round(rpm)} rpm`)]);
    };
    pick(el, (k) => { S.dir = k; draw(); });
    sl.addEventListener("input", () => { S.d = +sl.value; q(".d-v").textContent = `${S.d}%`; draw(); });
    draw();
  }
  function mountServo(el, sec) {
    const S = { pw: 1.5 };
    el.innerHTML = `<div class="pv"><div class="slider-field"><label for="${sec.id}-p">Pulse width: <strong class="p-v">1.50 ms</strong></label><input type="range" id="${sec.id}-p" min="1" max="2" step="0.05" value="1.5"></div>
      <div class="pv-grid"><div class="pv-scene"></div><div class="pv-graph"></div></div><p class="pv-read"></p>${fold("Step-by-Step Working", `<ol class="steps"></ol>`)}</div>`;
    const q = (s) => el.querySelector(s), sl = q(`#${sec.id}-p`), cx = 160, cy = 150;
    let s = `<path class="prot" d="M${cx - 100},${cy}A100,100 0 0 1 ${cx + 100},${cy}"/>`;
    [0, 45, 90, 135, 180].forEach((a) => { const r = (a * Math.PI) / 180; s += `<line class="tick" x1="${cx - 92 * Math.cos(r)}" y1="${cy - 92 * Math.sin(r)}" x2="${cx - 100 * Math.cos(r)}" y2="${cy - 100 * Math.sin(r)}"/>` + T(cx - 114 * Math.cos(r), cy - 114 * Math.sin(r) + 4, `${a}°`, "middle", "small"); });
    s += `<rect class="servo" x="${cx - 60}" y="${cy - 8}" width="120" height="62" rx="6"/>${T(cx, cy + 40, "servo", "middle", "lt")}`;
    s += `<g class="horn" style="transform-origin:${cx}px ${cy}px"><path class="horn-p" d="M${cx},${cy - 9}L${cx - 84},${cy - 4}A5,5 0 0 0 ${cx - 84},${cy + 4}L${cx},${cy + 9}Z"/><circle class="hub" cx="${cx}" cy="${cy}" r="10"/></g>`;
    q(".pv-scene").innerHTML = svg(320, 230, "Servo motor horn pointing to the commanded angle", s, "scene");
    const draw = () => {
      const ang = (S.pw - 1) * 180;
      q(".horn").style.transform = `rotate(${ang}deg)`;
      const A = axes({ x: [0, 60], y: [0, 4], xt: [0, 20, 40, 60], yt: [0, 3.3], fy: (y) => y, xl: "Time (ms)", yl: "Signal (V)", H: 200 }), pts = [];
      for (let k = 0; k < 3; k++) pts.push([A.X(k * 20), A.Y(0)], [A.X(k * 20), A.Y(3.3)], [A.X(k * 20 + S.pw), A.Y(3.3)], [A.X(k * 20 + S.pw), A.Y(0)], [A.X((k + 1) * 20), A.Y(0)]);
      q(".pv-graph").innerHTML = svg(A.W, A.H, `Servo signal: a ${S.pw.toFixed(2)} ms pulse every 20 ms`, A.s + poly(pts, "trace-d") + label(A.X(S.pw) + 6, A.Y(3.3) - 6, `${S.pw.toFixed(2)} ms`, "start", "mklab") + label(A.X(10.75), A.Y(1.6), "period 20 ms (50 Hz)", "middle", "axis"));
      q(".pv-read").innerHTML = `A <strong>${S.pw.toFixed(2)} ms</strong> pulse every 20 ms turns the horn to <strong>${Math.round(ang)}°</strong>. Inside the servo, a potentiometer on the output shaft tells its circuit where the horn is, and the motor turns until it matches the pulse (closed-loop control).`;
      q(".steps").innerHTML = stepsHtml([step("Pulse width to angle (1 ms = 0°, 2 ms = 180°)", "θ = (t<sub>pulse</sub> − 1 ms) ÷ 1 ms × 180°", `= (${S.pw.toFixed(2)} − 1) ÷ 1 × 180°`, `θ = ${Math.round(ang)}°`)]);
    };
    sl.addEventListener("input", () => { S.pw = +sl.value; q(".p-v").textContent = `${S.pw.toFixed(2)} ms`; draw(); });
    draw();
  }
  function mountRelay(el) {
    el.innerHTML = `<div class="pv"><div class="relay-ctl"><button type="button" class="btn" data-r aria-pressed="false">Set GPIO HIGH</button><span class="relay-state">GPIO LOW: coil off, lamp off</span></div>
      <figure class="scene-box"><div class="scene-scroll"><svg class="scene relay" viewBox="0 0 480 250" role="img" aria-label="Relay circuit: the ESP32 pin drives a transistor, which energises the relay coil; the coil pulls the switch from NC to NO and the lamp lights."></svg></div></figure><p class="pv-read"></p></div>`;
    const sv = el.querySelector("svg"), b = el.querySelector("[data-r]"), st = el.querySelector(".relay-state"), read = el.querySelector(".pv-read");
    let on = false, flyT;
    const draw = (fly) => {
      let s = `<rect class="bx" x="8" y="150" width="70" height="46" rx="6"/>${T(43, 171, "ESP32", "middle", "tt")}${T(43, 188, on ? "GPIO HIGH" : "GPIO LOW", "middle", "small")}`;
      s += `<path class="w" d="M78,173H96"/>` + Lab.D.res(96, 173, 150, 173) + T(123, 160, "1 kΩ", "middle", "small");
      s += `<circle class="q" cx="176" cy="173" r="22"/><path class="w" d="M150,173H166M166,160V186M166,166L186,152V120M166,180L186,194V222"/><path class="w" d="M180,188l6,6l-8,1"/>` + Lab.D.gnd(186, 222);
      s += T(176, 212, "NPN", "end", "small");
      s += `<path class="w" d="M186,120H230M186,40H230M230,40V56M230,104V120"/><rect class="coil-box${on ? " on" : ""}" x="214" y="56" width="32" height="48" rx="3"/>${T(230, 84, "coil", "middle", "small")}`;
      s += `<path class="w" d="M230,40V20"/>${T(230, 14, "+5 V", "middle", "small")}`;
      s += `<path class="w" d="M186,40V120"/><path class="w" d="M176,90H196L186,74Z"/><path class="w" d="M176,74H196"/>${T(170, 84, "diode", "end", "small")}`;
      if (fly) s += `<path class="flyloop" d="M186,70V96M236,62C260,64 262,100 236,104"/>`;
      if (on) s += `<path class="iarrow" d="M252,62V96m-6,-8l6,8l6,-8"/>`;
      // contacts
      const ax = 320, ay = 130, tipY = on ? 150 : 104;
      s += `<circle class="term" cx="${ax}" cy="${ay}" r="4"/>${T(ax - 6, ay + 22, "COM", "end", "small")}`;
      s += `<circle class="term" cx="380" cy="100" r="4"/>${T(380, 88, "NC", "middle", "small")}<circle class="term" cx="380" cy="156" r="4"/>${T(380, 176, "NO", "middle", "small")}`;
      s += `<line class="arm${on ? " on" : ""}" x1="${ax}" y1="${ay}" x2="376" y2="${tipY}"/><path class="link" d="M246,80H${ax + 20}"/>`;
      s += `<path class="w" d="M384,156H440V200M${ax},${ay}V230H440V222"/><circle class="lamp2${on ? " on" : ""}" cx="440" cy="212" r="12"/><path class="w thin" d="M432,204l16,16M448,204l-16,16"/>`;
      s += `<circle class="ac" cx="${ax}" cy="196" r="12"/>${T(ax, 201, "~", "middle", "tt")}` + T(440, 244, "lamp", "middle", "small") + T(ax + 18, 200, "230 V AC", "start", "small");
      sv.innerHTML = s;
      read.innerHTML = on ? "The pin turns the transistor on, current flows through the coil and its magnetic field pulls the switch arm from <strong>NC</strong> to <strong>NO</strong>: the lamp lights. A tiny 3.3 V signal now controls a mains lamp, and the two circuits stay electrically separate."
        : fly ? "Switched off: the coil's magnetic field collapses and tries to keep the current flowing. The <strong>flyback diode</strong> gives that current a safe loop, so the voltage spike can't destroy the transistor." : "The coil is off. A spring holds the arm on <strong>NC</strong> (normally closed), so the lamp circuit is open.";
    };
    b.addEventListener("click", () => {
      on = !on; b.setAttribute("aria-pressed", on); b.textContent = on ? "Set GPIO LOW" : "Set GPIO HIGH";
      st.textContent = on ? "GPIO HIGH: coil on, lamp on" : "GPIO LOW: coil off, lamp off";
      clearTimeout(flyT); draw(!on);
      if (!on) flyT = setTimeout(() => draw(false), reduceMotion ? 2500 : 1400);
    });
    draw(false);
  }

  /* =====================================================================
     Static content: overview cards and comparison tables
     ===================================================================== */
  const PARAMS = [
    ["linearity", "Linearity", "Output proportional to input: a straight-line graph."],
    ["sensitivity", "Sensitivity", "How much the output changes for each unit of input."],
    ["repeatability", "Repeatability", "The same input gives the same output, every time."],
    ["dynamic", "Good dynamic response", "The output keeps up when the input changes quickly."],
    ["snr", "High output signal quality", "A strong signal with little noise (high SNR)."],
    ["stability", "High reliability and stability", "Stays accurate for a long time in real surroundings."],
    ["hysteresis", "No hysteresis", "Same output whether the input is rising or falling."],
    ["residual", "No residual deformation", "Returns to its original state after the load is removed."]
  ];
  const mountParams = (el) => { el.innerHTML = `<div class="param-grid">${PARAMS.map(([id, t, d], i) => `<a class="param-card" href="#${id}"><span class="pc-n">${i + 1}</span><strong>${t}</strong><span>${d}</span></a>`).join("")}</div>`; };
  const CRITERIA = [
    ["Type of sensing", "The quantity to be sensed: temperature, pressure, light, distance…"],
    ["Accuracy", "How close the reading is to the true value: a key factor."],
    ["Resolution and range", "The smallest change it can sense, and the limits it can measure between."],
    ["Calibration and repeatability", "How much it drifts with time, and whether it repeats under the same conditions."],
    ["Operating principle", "How it works (resistive, capacitive, piezoelectric…), which decides what it can and can't sense."],
    ["Power consumption", "Adds to the power of the whole system: vital for battery-powered nodes."],
    ["Cost", "A low-cost sensor for a simple job, a high-cost one where accuracy really matters."],
    ["Environmental conditions", "Heat, water, dust, vibration and noise decide how rugged it must be."]
  ];
  const mountCriteria = (el) => { el.innerHTML = `<div class="spec-grid">${CRITERIA.map(([t, d]) => `<div class="spec"><h4>${t}</h4><p>${d}</p></div>`).join("")}</div>`; };
  const table = (head, rows, cls = "") => `<div class="table-wrap ${cls}"><table class="cmp"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const PASSIVE_CMP = table(["", "Resistive", "Capacitive", "Inductive"], [
    ["Principle", "Measures changes in resistance", "Measures changes in capacitance", "Measures changes in inductance"],
    ["How it works", "Resistance changes with position, temperature, light, pressure or strain", "Capacitance changes with the dielectric (εr), plate area or gap, e.g. when a conductive object comes near", "Inductance changes when conductive material (usually metal) comes near the coil"],
    ["Contact", "Often contact (potentiometers, strain gauges); thermistors and light sensors need none", "Mostly non-contact (touchscreens, proximity switches)", "Non-contact"],
    ["Accuracy", "Limited, often non-linear", "Good, especially for proximity", "High for ferrous metals"],
    ["Range", "Millimetres to centimetres", "A few millimetres to centimetres", "Millimetres to centimetres"],
    ["Applications", "Position sensing, pressure sensing, older resistive touchscreens, temperature", "Smartphone touchscreens, touchless switches, liquid level", "Metal detectors, position and displacement, speed and RPM (tachometers)"]]);
  const ACTIVE_CMP = table(["", "Passive (modulating)", "Active (self-generating)"], [
    ["Energy", "Needs an external supply (excitation) to give an output", "Turns the measured energy directly into an electrical signal"],
    ["Output", "A change in R, C or L, turned into a voltage by a circuit (divider, bridge, oscillator)", "A voltage, current or charge, often very small (µV to mV)"],
    ["Signal conditioning", "Excitation plus a conversion circuit", "Usually an amplifier, because the output is small"],
    ["Examples", "Potentiometer, thermistor, RTD, strain gauge, capacitive and inductive sensors, LVDT", "Thermocouple, piezoelectric sensor, photodiode in photovoltaic mode (solar cell)"]]);
  const EXAMPLES_CMP = table(["Measuring", "Active (self-generating)", "Passive (modulating)"], [
    ["Temperature", "Thermocouple: a small voltage from two joined metals", "Thermistor (thermostats, air-conditioning), RTD (precise industrial measurement)"],
    ["Light", "Photodiode in photovoltaic mode, solar cell", "Light-dependent resistor; photodiode in photoconductive mode (reverse biased)"],
    ["Force and vibration", "Piezoelectric sensor (seismic monitors, accelerometers)", "Strain gauge (its resistance changes; needs excitation)"]]);
  const SA_CMP = table(["", "Sensor", "Actuator"], [
    ["Primary function", "Converts a physical quantity from the environment into an electrical signal for the system", "Converts an electrical signal from the system into a physical action in the environment"],
    ["Input", "An external stimulus: light, temperature, pressure, motion…", "A control signal: an electrical or digital command"],
    ["Output", "An electrical signal, data or information", "Movement, force, light, sound or heat"],
    ["Place in the system", "At the input", "At the output"],
    ["Examples", "Thermometer, photovoltaic cell, tilt sensor, accelerometer, ultrasonic sensor", "LED, display, heater, relay, electric motor, hydraulic and pneumatic cylinders"]]);
  const CLASS_QUIZ = [
    { q: "A <strong>thermocouple</strong> produces a few millivolts when its junction is heated.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 1, why: "It makes its own voltage from the heat (the Seebeck effect): no supply needed." },
    { q: "A <strong>thermistor</strong> changes resistance with temperature.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 0, why: "A resistance change can only be measured by passing a current through it: it needs excitation." },
    { q: "A <strong>piezo disc</strong> gives a voltage spike when it is knocked.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 1, why: "The squeezed crystal separates charge by itself." },
    { q: "An <strong>LVDT</strong> measures the position of a moving core.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 0, why: "It needs an AC supply on its primary coil; the core only changes how that is shared between the secondaries." },
    { q: "A <strong>solar cell</strong> (photodiode in photovoltaic mode) gives a voltage in sunlight.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 1, why: "Light energy is turned directly into electrical energy." },
    { q: "A <strong>capacitive level sensor</strong> in a water tank.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 0, why: "Capacitance must be measured with an AC signal or an oscillator from a supply." },
    { q: "A <strong>potentiometer</strong> senses the angle of a robot joint.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 0, why: "It needs V<sub>in</sub> across it; the wiper just picks off part of that voltage." },
    { q: "A <strong>strain gauge</strong> glued to a beam.", opts: ["Passive (needs excitation)", "Active (self-generating)"], a: 0, why: "Stretching changes its resistance, which needs an excitation voltage (usually a Wheatstone bridge) to measure." }
  ];

  /* =====================================================================
     Sections
     ===================================================================== */
  const SECTIONS = [
    // ---------- Introduction ----------
    { id: "transducer", group: "intro", title: "What Is a Transducer?", toc: "Transducers", mode: "intro",
      intro: `<p>A <strong>transducer</strong> converts one form of energy or physical variable into another. Physical variables can be mechanical, chemical, electrical, thermal or optical. In instrumentation we mostly convert <strong>mechanical to electrical</strong> and back again.</p>
        <dl class="defs"><div><dt>Sensor</dt><dd>A transducer that turns a physical variable (mechanical, optical, thermal…) into an <strong>electrical</strong> signal we can measure.</dd></div>
        <div><dt>Actuator</dt><dd>A transducer that turns an electrical signal back into a <strong>physical</strong> action: motion, light, sound or heat.</dd></div></dl>
        <p>A <strong>microphone</strong> is a sensor: sound waves vibrate its diaphragm and create an electrical signal. A <strong>loudspeaker</strong> is an actuator: the electrical signal moves its diaphragm and makes sound waves. Watch the signal travel through the system below.</p>`,
      mount: mountMicSystem,
      after: `<h4 class="sub-h">Electrical and Mechanical Variables Are Equivalent</h4>
        <p class="widget-lead">The same equations describe electrical circuits and mechanical (acoustic) systems. That is why one can be converted into the other.</p>
        ${table(["Quantity", "Electrical", "Mechanical (acoustic)"], [
          ["Effort (“tension”)", "Voltage, V (V)", "Acoustic pressure, p (Pa)"],
          ["Flow", "Current, I (A)", "Particle velocity, v (m/s)"],
          ["Storage (spring)", "Capacitance, C (F)", "Compliance, 1/K (m/N), the inverse of stiffness K"],
          ["Inertia", "Inductance, L (H)", "Mass, M (kg)"],
          ["Impedance", "Z<sub>e</sub> = V ÷ I (Ω)", "Z<sub>a</sub> = p ÷ v (Pa·s/m, called rayl)"]])}` },
    { id: "parking", group: "intro", title: "Transducers at Work: Car Parking Sensors", toc: "Parking Sensors",
      intro: `<p>A car's <strong>collision avoidance system</strong> uses ultrasound, millimetre-wave radar, laser or LED transducers mounted at the front and rear. Each one sends out a high-frequency signal; if an object is in the way, part of the signal is reflected back and detected.</p>
        <p>The sensor times the echo. Because the signal travels to the object <strong>and back</strong>, the distance is <span class="formula">d = v × t ÷ 2</span> where v is the speed of the signal (343 m/s for sound in air at 20 °C). When reversing, the beeps speed up as the car gets closer. At the front, the system first sounds a warning, then starts braking, then brakes fully.</p>`,
      mount: mountParking },

    // ---------- Sensor parameters ----------
    { id: "params", group: "params", title: "What Makes a Good Sensor?", toc: "Overview",
      intro: `<p>A sensor must respond only to the quantity it is designed to measure, within its specified limits, and the relationship between its input and output must be known and fixed. Eight parameters describe how well it does that. Each one below is shown in a <strong>real situation</strong>: press play, change the settings and watch the graph.</p>`,
      mount: mountParams },
    { id: "linearity", group: "params", title: "1. Linearity", toc: "Linearity",
      intro: `<p>The output should be <strong>linearly proportional</strong> to the input: equal steps in input give equal steps in output, so the graph is a straight line. A linear sensor is easy to read and to calibrate.</p>
        <p><strong>Real situation: a lab temperature logger.</strong> The LM35 gives exactly 10 mV per °C, so 25 °C gives 250 mV and 50 °C gives 500 mV. An NTC thermistor changes far more, but along a curve, so the logger needs an equation or a lookup table to convert it.</p>`,
      mount: mountLinearity },
    { id: "sensitivity", group: "params", title: "2. Sensitivity", toc: "Sensitivity",
      intro: `<p><strong>Sensitivity</strong> is how much the output changes for each unit change of input: the slope of the input–output graph.</p><p class="formula">Sensitivity = Δoutput ÷ Δinput</p>
        <p><strong>Real situation: choosing a thermocouple for a furnace.</strong> Every type gives a different number of microvolts per degree. Type E gives the most (easiest to measure), type K is the common all-rounder, and types R and S survive very high temperatures but give a tiny signal.</p>`,
      mount: mountSensitivity },
    { id: "repeatability", group: "params", title: "3. Repeatability", toc: "Repeatability",
      intro: `<p>A sensor must produce the <strong>same output every time</strong> it gets the same input. For example, a temperature sensor put into 30 °C water again and again should give the same voltage each time.</p>
        <p><strong>Real situation: a bathroom scale.</strong> The same person steps on it eight times. A good scale shows almost the same number every time; a poor one scatters. The third option shows why repeatability is not the same as accuracy.</p>`,
      mount: mountRepeat },
    { id: "dynamic", group: "params", title: "4. Good Dynamic Response", toc: "Dynamic Response",
      intro: `<p>The output should follow the input <strong>faithfully in time</strong>. When the input jumps, a real sensor catches up along a curve. Its <strong>time constant τ</strong> is the time to reach 63.2% of the change; after about 5τ it has settled (99.3%). Dynamic behaviour is also analysed as the sensor's frequency response.</p>
        <p class="formula">T(t) = T₁ + (T₂ − T₁)(1 − e<sup>−t/τ</sup>)</p>
        <p><strong>Real situation: industrial heating.</strong> A probe moves from 20 °C air into 60 °C water. A fast sensor reports the new temperature almost at once; a slow one lags behind, and a control system using it would react too late.</p>`,
      mount: mountDynamic },
    { id: "snr", group: "params", title: "5. High Output Signal Quality", toc: "Signal Quality",
      intro: `<p>The output should be <strong>strong and clean</strong>: its amplitude must be large enough, and the ratio of signal to noise (SNR) must be high.</p><p class="formula">SNR (dB) = 20 log<sub>10</sub>(V<sub>signal</sub> ÷ V<sub>noise</sub>)</p>
        <p><strong>Real situation: a noisy factory.</strong> A temperature sensor's cable runs past a large motor, which radiates electrical noise into it. Try a shielded twisted-pair cable, and amplifying the signal at the sensor before the long cable.</p>`,
      mount: mountSnr },
    { id: "stability", group: "params", title: "6. High Reliability and Stability", toc: "Reliability and Stability",
      intro: `<p>The sensor should keep its error small despite <strong>temperature changes, vibration, humidity and time</strong>. A stable sensor keeps its calibration; an unstable one slowly <strong>drifts</strong>.</p>
        <p><strong>Real situation: an outdoor weather station.</strong> Two sensors spend two years outside through sun, heat and monsoon rain. Watch how far each one's reading moves away from the true temperature.</p>`,
      mount: mountStability },
    { id: "hysteresis", group: "params", title: "7. No Hysteresis", toc: "Hysteresis",
      intro: `<p>The output should be the same at a given input whether the input is <strong>rising or falling</strong>. If the two paths differ, the sensor has hysteresis.</p><p class="formula">Hysteresis (% of full scale) = largest difference between the two paths ÷ full-scale output × 100</p>
        <p><strong>Real situation:</strong> water heats from 20 °C to 50 °C and then cools back to 20 °C. At 35 °C a sensor with hysteresis reads differently on the way down than on the way up.</p>`,
      mount: mountHysteresis,
      after: `<div class="callout info"><strong>Good to know</strong>Hysteresis in a <em>sensor</em> is an error, but engineers add it on purpose to <em>controllers</em>. An air-conditioner thermostat switches on at 25 °C but off at 23 °C, so it doesn't click on and off every few seconds.</div>` },
    { id: "residual", group: "params", title: "8. No Residual Deformation", toc: "Residual Deformation",
      intro: `<p>After a load has been applied, even for a long time, the sensor should return to its original state when the load is removed. A permanent change is <strong>residual deformation</strong>, and it leaves a zero error in every later reading.</p>
        <p><strong>Real situation: a load cell.</strong> The bending beam in a kitchen or industrial scale carries a strain gauge. Within its rating it springs back; overloaded, it stays bent. The same idea applies to heat: a temperature sensor pushed beyond its rated temperature (say 200 °C) may not return to its original reading.</p>`,
      mount: mountResidual },
    { id: "criteria", group: "params", title: "Criteria for Choosing a Sensor", toc: "Choosing a Sensor",
      intro: `<p>Before buying a sensor for a project, check it against these eight criteria.</p>`,
      mount: mountCriteria },

    // ---------- Passive sensors ----------
    { id: "classify", group: "passive", title: "Classification of Sensors", toc: "Classification",
      intro: `<p>Sensors are divided into two groups by where the energy for the output comes from.</p>
        <dl class="defs"><div><dt>Passive sensors</dt><dd>Do not generate an electrical signal themselves. Their resistance, capacitance or inductance changes, and an external supply (excitation) is needed to turn that into a voltage.</dd></div>
        <div><dt>Active sensors</dt><dd>Generate their own electrical signal from the quantity they sense. The output is usually very small, so an amplifier is needed.</dd></div></dl>`,
      mount: mountTree,
      after: `<div class="callout info"><strong>Good to know</strong>Textbooks don't all use these two words the same way: some call any sensor that needs a power supply “active”. To avoid confusion, say what you mean: <em>self-generating</em> (makes its own signal) or <em>modulating</em> (changes a signal supplied to it).</div>` },
    { id: "resistive", group: "passive", title: "Resistive Sensors: R = ρl ÷ A", toc: "Resistive",
      intro: `<p>A resistive sensor converts a change such as displacement, temperature or light into a change of resistance, which is measured after signal conditioning. Potentiometers, thermistors and photoresistors are common examples. For a wire of length l and cross-section A:</p><p class="formula">R = ρ l ÷ A</p>
        <p>ρ is the resistivity. Any change in ρ, l or A changes R. A <strong>strain gauge</strong> uses this: stretching its wire makes it longer and thinner, so R rises.</p>`,
      inputs: [F("rho", "num", 1.1e-6, "nichrome 1.1 × 10⁻⁶, copper 1.72 × 10⁻⁸", { unit: "Ω·m", positive: true, label: "Resistivity ρ", name: "Resistivity" }),
        F("l", "num", 2, null, { unit: "m", positive: true, label: "Length l", name: "Length" }),
        F("A", "num", 0.2, null, { unit: "mm²", positive: true, label: "Cross-section area A", name: "Area", slider: { min: 0.05, max: 2, step: 0.05 } })],
      view: "0 0 440 190", diagram: wireDiagram, caption: "The wire's length and thickness follow your values.",
      compute(v) {
        const A = v.A * 1e-6, R = (v.rho * v.l) / A;
        return { sum: `R = ${eng(R, "Ω")}`, R, steps: [
          step("Area in m²", "A (m²) = A (mm²) × 10<sup>−6</sup>", `= ${num(v.A)} × 10<sup>−6</sup>`, `A = ${num(A)} m²`),
          step("Resistance", "R = ρ l ÷ A", `= ${num(v.rho)} Ω·m × ${num(v.l)} m ÷ ${num(A)} m²`, `R = ${eng(R, "Ω")}`),
          step("What if…", "", "double the length → 2R; double the area → R ÷ 2", `stretch to 2l (area halves) → 4R = ${eng(4 * R, "Ω")}`)] };
      } },
    { id: "pot", group: "passive", title: "Potentiometer: Sensing Angle", toc: "Potentiometer",
      intro: `<p>The resistance between GND and +V<sub>in</sub> is fixed, but the resistance between GND and the <strong>wiper</strong> depends on its position. The pot is a voltage divider, so the wiper voltage tells us the angle:</p><p class="formula">V<sub>out</sub> = V<sub>in</sub> × R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>)</p>
        <p><strong>Real situations:</strong> volume knobs, joysticks, the position feedback inside a servo motor, and robot-arm joints. Move the slider to turn the knob.</p>
        <div class="cmp-grid">${photo("potentiometer.jpg", "A rotary potentiometer.", "small")}</div>`,
      inputs: [F("Rt", "R", 100e3, "total track resistance", { label: "Total resistance" }),
        F("Vin", "num", 5, null, { unit: "V", positive: true, label: "Supply V<sub>in</sub>", name: "Vin" }),
        F("p", "num", 30, "0% = at GND, 100% = at V<sub>in</sub>", { unit: "%", positive: false, label: "Wiper position", slider: { min: 0, max: 100, step: 1 }, validate: (x) => (x < 0 || x > 100 ? "Enter 0 to 100%." : "") })],
      view: "0 0 440 240", diagram: potDiagram, caption: "Turn the knob with the wiper slider.",
      compute(v) {
        const R2 = (v.Rt * v.p) / 100, R1 = v.Rt - R2, vout = (v.Vin * R2) / v.Rt;
        return { sum: `R<sub>1</sub> = ${eng(R1, "Ω")}, R<sub>2</sub> = ${eng(R2, "Ω")}, V<sub>out</sub> = ${eng(vout, "V")}`, R1, R2, vout, steps: [
          step("Wiper to GND", "R<sub>2</sub> = R<sub>total</sub> × position", `= ${eng(v.Rt, "Ω")} × ${num(v.p / 100)}`, `R<sub>2</sub> = ${eng(R2, "Ω")}`),
          step("V<sub>in</sub> to wiper", "R<sub>1</sub> = R<sub>total</sub> − R<sub>2</sub>", `= ${eng(v.Rt, "Ω")} − ${eng(R2, "Ω")}`, `R<sub>1</sub> = ${eng(R1, "Ω")}`),
          step("Output voltage", "V<sub>out</sub> = V<sub>in</sub> × R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>)", `= ${num(v.Vin)} V × ${eng(R2, "Ω")} ÷ ${eng(v.Rt, "Ω")}`, `V<sub>out</sub> = ${eng(vout, "V")}`)] };
      },
      after: watch([video("Wdl77HBP_yU", "Resistive transducers: working of transducers", "EzEd Channel")]) },
    { id: "thermistor", group: "passive", title: "Thermistors and RTDs: Sensing Temperature", toc: "Thermistor",
      intro: `<p>These sensors change resistance when the temperature changes. They have two leads, like a resistor.</p>
        <dl class="defs"><div><dt>NTC thermistor</dt><dd>Negative temperature coefficient: resistance <strong>falls</strong> as temperature rises. Large change, non-linear: R = R<sub>0</sub> e<sup>β(1/T − 1/T<sub>0</sub>)</sup>, with T in kelvin.</dd></div>
        <div><dt>PTC thermistor</dt><dd>Positive temperature coefficient: resistance <strong>rises</strong> as temperature rises.</dd></div>
        <div><dt>RTD (metal wire, e.g. Pt100)</dt><dd>Resistivity rises in a straight line, ρ(T) = ρ<sub>0</sub>(1 + α(T − T<sub>0</sub>)). Putting this into R = ρl/A gives <strong>R = R<sub>0</sub>(1 + α(T − T<sub>0</sub>))</strong>. Small change, very linear.</dd></div></dl>
        <p><strong>Real situation:</strong> checking a thermistor with a multimeter in ice water and warm water, just like the photo. Watch the resistance as the water heats and cools.</p>
        <div class="cmp-grid">${photo("ntc-thermistor-ice.jpg", "An NTC thermistor tested in ice water.", "small")}</div>`,
      mount: mountThermistor },
    { id: "capacitive", group: "passive", title: "Capacitive Sensors: C = ε<sub>r</sub>ε<sub>0</sub>A ÷ d", toc: "Capacitive",
      intro: `<p>Capacitive proximity sensors are <strong>non-contact</strong> devices that can detect almost any object, whatever its material. They work by the change in capacitance when something changes the electric field at the sensor's face. The basic sensor is a parallel-plate capacitor:</p>
        <p class="formula">C = ε<sub>r</sub> ε<sub>0</sub> A ÷ d = ε<sub>r</sub> ε<sub>0</sub> l w ÷ d</p>
        <p>ε<sub>0</sub> = 8.854 × 10<sup>−12</sup> F/m is the permittivity of free space, ε<sub>r</sub> the relative permittivity of the material between the plates, A = l × w the plate area and d the gap. Changing <strong>ε<sub>r</sub></strong> (liquid level, humidity), <strong>A</strong> (overlap, touch) or <strong>d</strong> (pressure, displacement) changes C.</p>`,
      inputs: [F("er", "num", 4, "air 1, paper 3.7, glass 4.7 to 10, water 80", { unit: "", positive: true, label: "Relative permittivity ε<sub>r</sub>", name: "εr" }),
        F("A", "num", 0.01, null, { unit: "m²", positive: true, label: "Plate area A", name: "Area" }),
        F("d", "num", 1, null, { unit: "mm", positive: true, label: "Plate gap d", name: "Gap", slider: { min: 0.1, max: 10, step: 0.1 } })],
      view: "0 0 440 230", diagram: plateDiagram, caption: "The plates move and the dielectric darkens as you change the values.",
      compute(v) {
        const d = v.d / 1000, C = (v.er * E0 * v.A) / d;
        return { sum: `C = ${eng(C, "F")}`, C, steps: [
          step("Gap in metres", "d (m) = d (mm) ÷ 1000", `= ${num(v.d)} ÷ 1000`, `d = ${num(d)} m`),
          step("Capacitance", "C = ε<sub>r</sub> ε<sub>0</sub> A ÷ d", `= ${num(v.er)} × 8.854 × 10<sup>−12</sup> × ${num(v.A)} ÷ ${num(d)}`, `C = ${num(C)} F = ${eng(C, "F")}`)] };
      } },
    { id: "level", group: "passive", title: "Capacitive Liquid-Level Sensor", toc: "Liquid Level",
      intro: `<p>Two plates stand in a tank. Below the water line the gap is filled with water; above it, with air. The sensor is two capacitors side by side, and the net capacitance is their sum (water outside the plates doesn't count):</p>
        <p class="formula">C<sub>net</sub> = C<sub>water</sub> + C<sub>air</sub> = ε<sub>water</sub>ε<sub>0</sub> x w ÷ d + ε<sub>air</sub>ε<sub>0</sub>(L − x) w ÷ d</p>
        <p>Since ε<sub>air</sub> = 1, this becomes <strong>C<sub>net</sub> = ε<sub>0</sub>(w/d)(ε<sub>water</sub> − 1) x + ε<sub>0</sub>(w/d) L = a x + b</strong>: a straight line, so C<sub>net</sub> is proportional to the depth x. Press play to fill the tank.</p>`,
      inputs: [F("L", "num", 30, null, { unit: "cm", positive: true, label: "Plate length L", name: "L" }),
        F("w", "num", 5, null, { unit: "cm", positive: true, label: "Plate width w", name: "w" }),
        F("d", "num", 2, null, { unit: "mm", positive: true, label: "Plate gap d", name: "d" }),
        F("ew", "num", 80, null, { unit: "", positive: true, label: "ε<sub>water</sub>", name: "εwater" }),
        F("x", "num", 12, "0 to L", { unit: "cm", positive: false, label: "Water depth x", slider: { min: 0, max: 40, step: 0.5 }, validate: (x) => (x < 0 ? "Depth can't be negative." : "") })],
      view: "0 0 440 230", diagram: levelDiagram, render: levelRender, caption: "The water level follows x.",
      compute(v) {
        const L = v.L / 100, w = v.w / 100, d = v.d / 1000, xc = Math.min(v.x, v.L), x = xc / 100, k = (E0 * w) / d;
        const Cw = v.ew * k * x, Ca = k * (L - x), C = Cw + Ca, notes = [];
        if (v.x > v.L) notes.push({ type: "warn", title: "Tank overflowing", html: `The depth can't be more than the plate length, so x = L = ${num(v.L)} cm is used.` });
        return { sum: `C<sub>net</sub> = ${eng(C, "F")}`, C, Cw, Ca, x: xc, a: k * (v.ew - 1), b: k * L, notes, steps: [
          step("Units", "", `L = ${num(L)} m, w = ${num(w)} m, d = ${num(d)} m, x = ${num(x)} m`, `ε<sub>0</sub> w ÷ d = 8.854 × 10<sup>−12</sup> × ${num(w)} ÷ ${num(d)} = ${num(k)} F/m`),
          step("Water part", "C<sub>water</sub> = ε<sub>water</sub> ε<sub>0</sub> x w ÷ d", `= ${num(v.ew)} × ${num(k)} × ${num(x)}`, `C<sub>water</sub> = ${eng(Cw, "F")}`),
          step("Air part", "C<sub>air</sub> = ε<sub>air</sub> ε<sub>0</sub> (L − x) w ÷ d", `= 1 × ${num(k)} × ${num(L - x)}`, `C<sub>air</sub> = ${eng(Ca, "F")}`),
          step("Net capacitance", "C<sub>net</sub> = C<sub>water</sub> + C<sub>air</sub>", `= ${eng(Cw, "F")} + ${eng(Ca, "F")}`, `C<sub>net</sub> = ${eng(C, "F")}`),
          step("As a straight line", "C<sub>net</sub> = a x + b", `a = ε<sub>0</sub>(w/d)(ε<sub>water</sub> − 1) = ${num(k * (v.ew - 1))} F/m, b = ε<sub>0</sub>(w/d)L = ${eng(k * L, "F")}`, `each extra cm of water adds ${eng(k * (v.ew - 1) / 100, "F")}`)] };
      },
      after: watch([video("0du-QU1Q0T4", "How capacitive liquid level sensors work", "Gill Group")]) },
    { id: "inductance", group: "passive", title: "Inductive Sensors: L = μ<sub>r</sub>μ<sub>0</sub>N²A ÷ l", toc: "Inductive",
      intro: `<p>An inductive sensor works from the changing magnetic field of a coil. The inductance of a simple coil is:</p>
        <p class="formula">L<sub>coil</sub> = μ<sub>r</sub> μ<sub>0</sub> N² A ÷ l = μ<sub>r</sub> μ<sub>0</sub> N² π r² ÷ l</p>
        <p>μ<sub>r</sub> is the relative permeability of the core, μ<sub>0</sub> = 4π × 10<sup>−7</sup> H/m, N the number of turns, A the coil area (radius r) and l its length. Any change in μ<sub>r</sub>, A or l changes L; moving metal near the coil does exactly that.</p>`,
      inputs: [F("N", "num", 150, null, { unit: "turns", positive: true, label: "Number of turns N", name: "N" }),
        F("mur", "num", 1, "air 1, ferrite about 100 to 2000", { unit: "", positive: true, label: "Core μ<sub>r</sub>", name: "μr" }),
        F("by", "sel", "r", null, { label: "Coil size given as", options: [["r", "Radius r"], ["A", "Area A"]] }),
        F("r", "num", 10, null, { unit: "mm", positive: true, label: "Coil radius r", name: "Radius", show: (v) => v.by === "r" }),
        F("A", "num", 3.1416e-4, null, { unit: "m²", positive: true, label: "Coil area A", name: "Area", show: (v) => v.by === "A" }),
        F("l", "num", 0.05, null, { unit: "m", positive: true, label: "Coil length l", name: "Length" })],
      view: "0 0 440 240", diagram: coilDiagram, caption: "The coil's turns, size and core follow your values.",
      compute(v) {
        const A = v.by === "A" ? v.A : Math.PI * (v.r / 1000) ** 2, L = (v.mur * MU0 * v.N ** 2 * A) / v.l, st = [];
        if (v.by !== "A") st.push(step("Coil area", "A = π r²", `= π × (${num(v.r / 1000)} m)²`, `A = ${num(A)} m²`));
        st.push(step("Inductance", "L = μ<sub>r</sub> μ<sub>0</sub> N² A ÷ l", `= ${num(v.mur)} × 4π × 10<sup>−7</sup> × ${num(v.N)}² × ${num(A)} ÷ ${num(v.l)}`, `L = ${num(L)} H = ${eng(L, "H")}`));
        st.push(step("Why an iron core helps", "L ∝ μ<sub>r</sub>", `with μ<sub>r</sub> = 200 instead of ${num(v.mur)}`, `L would be ${eng((L * 200) / v.mur, "H")}`));
        return { sum: `L = ${eng(L, "H")}`, L, steps: st };
      } },
    { id: "proximity", group: "passive", title: "Inductive Proximity Sensor", toc: "Proximity Sensor",
      intro: `<p>An inductive proximity sensor has four parts: the <strong>coil, oscillator, detection circuit and output circuit</strong>. An alternating current in the coil makes a magnetic field at the sensor face. When a metal object comes close, eddy currents in the metal take energy from the field, the oscillation gets weaker, and the detection circuit switches the output when the change passes a preset level.</p>
        <p><strong>Real situations:</strong> counting metal cans on a conveyor, checking a machine part is in place, sensing a piston's end position. It has no moving parts and never touches the object.</p>
        <div class="cmp-grid">${photo("inductive-proximity-switch.jpg", "An industrial inductive proximity switch.", "small")}</div>`,
      mount: mountProximity,
      after: watch([video("bvds2vkEWoQ", "How an inductive sensor works", "Rajvir Singh")]) },
    { id: "loop", group: "passive", title: "Traffic Lights with Inductive Loops", toc: "Traffic Loop",
      intro: `<p>An <strong>inductive loop</strong> is a coil of wire laid in a slot cut into the road surface near the stop line. The empty loop has inductance L<sub>0</sub> = μ<sub>0</sub>N²A ÷ l. When a vehicle stops over it, the vehicle's metal body changes the magnetic field of the loop, and the detector registers the vehicle by measuring that change.</p>`,
      mount: mountLoop },
    { id: "lvdt", group: "passive", title: "LVDT: Linear Variable Differential Transformer", toc: "LVDT",
      intro: `<p>An LVDT turns mechanical motion into an electrical signal to measure <strong>displacement</strong>. An AC supply drives the primary coil. Two secondary coils, connected in series opposition, pick up voltages V1 and V2 that depend on where the moveable iron core is. At the centre they cancel; move the core and V<sub>out</sub> = V1 − V2 grows in proportion to the displacement, with its phase showing the direction.</p>
        <p><strong>Real situations:</strong> force, tension, pressure and weight are first converted into a displacement (by a spring or diaphragm), which the LVDT measures. LVDTs are used in industrial automation, aircraft, turbines, satellites and hydraulics.</p>`,
      mount: mountLvdt,
      after: watch([video("E-kDsP0wq6w", "LVDT: linear variable differential transformer working", "ADTW Study")]) },
    { id: "passivecompare", group: "passive", title: "Resistive, Capacitive and Inductive Sensors Compared", toc: "Comparison",
      mount: (el) => { el.innerHTML = PASSIVE_CMP; } },

    // ---------- Active sensors ----------
    { id: "piezo", group: "active", title: "Piezoelectric Sensors", toc: "Piezoelectric",
      intro: `<p><em>Piezo</em> is Greek for pressure: piezoelectricity is electricity from pressure. Squeeze a piezoelectric crystal and charges appear on its faces, in proportion to the force (stress). It also works the other way: apply a voltage and the crystal deforms. Piezo materials are either <strong>ceramics</strong> or <strong>polymers</strong>.</p>
        <p><strong>Real situations:</strong> gas-stove igniters, microphones, knock and vibration sensors, and buzzers. Piezo actuators make movements as small as 1 ångström (10<sup>−10</sup> m) in scanning tunnelling and atomic force microscopes.</p>
        <div class="cmp-grid">${photo("piezo-discs.jpg", "Piezo discs: a ceramic layer on a brass plate.", "small")}</div>`,
      mount: mountPiezo,
      after: watch([readLink("https://deepbluembedded.com/arduino-active-passive-buzzer/", "Active and passive buzzers with Arduino", "DeepBlue Embedded · article"),
        readLink("https://techtutorialsx.com/2017/07/01/esp32-arduino-controlling-a-buzzer-with-pwm/", "ESP32 Arduino: controlling a buzzer with PWM", "techtutorialsx · tutorial")], "Read") },
    { id: "photodiode", group: "active", title: "Photodiode in Photoconductive Mode", toc: "Photodiode",
      intro: `<p>In <strong>photoconductive mode</strong> the photodiode is <strong>reverse biased</strong> by an external supply. Light falling on it releases charge carriers, so its resistance drops and a photocurrent I<sub>λ</sub> flows, in proportion to the light. The load resistor turns that current into a voltage: <span class="formula">V<sub>out</sub> = I<sub>λ</sub> × R<sub>L</sub></span></p>
        <p>With no bias (<strong>photovoltaic mode</strong>) the same diode generates its own voltage, like a small solar cell: that is the self-generating way to use it. <strong>Real situations:</strong> optical-fibre receivers, smoke detectors, safety light curtains, and heart-rate sensors on smartwatches.</p>`,
      inputs: [F("E", "num", 400, "office 400, bright window 1000+", { unit: "lux", positive: false, label: "Light level", slider: { min: 0, max: 2000, step: 10 }, validate: (x) => (x < 0 ? "Light can't be negative." : "") }),
        F("RL", "R", 47e3, null, { label: "Load resistor R<sub>L</sub>" }),
        F("Vcc", "num", 3.3, null, { unit: "V", positive: true, label: "Supply V<sub>CC</sub>", name: "Vcc" })],
      view: "0 0 440 230", diagram: photoDiagram, render: photoRender, caption: "The lamp brightens with the light level. Photodiode sensitivity: 0.05 µA per lux.",
      compute(v) {
        const I = RESP * v.E, raw = I * v.RL, sat = raw > v.Vcc, vout = Math.min(raw, v.Vcc), notes = [];
        if (sat) notes.push({ type: "warn", title: "Output saturated", html: `I<sub>λ</sub> × R<sub>L</sub> = ${eng(raw, "V")} is more than the ${num(v.Vcc)} V supply, so V<sub>out</sub> stops at about ${num(v.Vcc)} V. Use a smaller R<sub>L</sub> for bright light.` });
        return { sum: `I<sub>λ</sub> = ${eng(I, "A")}, V<sub>out</sub> = ${eng(vout, "V")}`, I, vout, over: sat, sat, notes, steps: [
          step("Photocurrent", "I<sub>λ</sub> = sensitivity × light", `= 0.05 µA/lux × ${num(v.E)} lux`, `I<sub>λ</sub> = ${eng(I, "A")}`),
          step("Output voltage", "V<sub>out</sub> = I<sub>λ</sub> × R<sub>L</sub>", `= ${eng(I, "A")} × ${eng(v.RL, "Ω")}`, `V<sub>out</sub> = ${eng(raw, "V")}${sat ? ` → limited to ${num(v.Vcc)} V` : ""}`)] };
      } },
    { id: "hall", group: "active", title: "Hall Effect Sensors", toc: "Hall Effect",
      intro: `<p>A Hall sensor detects a <strong>magnetic field</strong>. A bias current flows through a thin semiconductor plate; a magnetic field pushes the moving charges to one edge, so a voltage, the <strong>Hall voltage</strong>, appears across the plate in proportion to the field strength. It needs an external supply for the bias current.</p>
        <p><strong>Real situations:</strong> wheel-speed sensors for ABS brakes, brushless fan and motor control, the flip-cover sensor in a phone, contactless current sensors, and joysticks.</p>`,
      mount: mountHall },
    { id: "activecompare", group: "active", title: "Passive and Active Sensors Compared", toc: "Comparison",
      mount: (el) => { el.innerHTML = `${ACTIVE_CMP}<h4 class="sub-h">By Example</h4>${EXAMPLES_CMP}<h4 class="sub-h">Quick Check: Passive or Active?</h4><div class="quiz-host"></div>`; quiz(el.querySelector(".quiz-host"), CLASS_QUIZ); } },

    // ---------- Actuators ----------
    { id: "actuators", group: "actuators", title: "Actuators", toc: "Actuators", mode: "act",
      intro: `<p>Actuators convert <strong>electrical energy</strong> into optical, mechanical or other forms of energy. They take an electrical signal from a system and produce an output in the environment. Examples: LEDs, LCD displays, relays and motors.</p>
        <p>The microphone system is a complete example: the diaphragm is the <strong>sensor</strong> and the loudspeaker is the <strong>actuator</strong>.</p>`,
      mount: mountMicSystem,
      after: `<h4 class="sub-h">Sensor or Actuator?</h4>${SA_CMP}` },
    { id: "led", group: "actuators", title: "Light Emitting Diode (LED)", toc: "LED",
      intro: `<p>An LED turns electrical energy into light. It needs a resistor to limit its current, and the ESP32 controls its brightness with <strong>PWM</strong>: switching fully on and off very fast, with the duty cycle setting the average power.</p>`,
      mount: mountLed },
    { id: "motor", group: "actuators", title: "Permanent Magnet DC Motor", toc: "DC Motor",
      intro: `<p>A permanent magnet DC (PMDC) motor turns electrical energy into rotation. Its speed is roughly proportional to its voltage, so PWM controls the speed; swapping the polarity reverses it. The ESP32 pin can't supply a motor's current, so a <strong>motor driver</strong> (H-bridge) sits in between.</p>`,
      mount: mountMotor },
    { id: "servo", group: "actuators", title: "Servo Motor", toc: "Servo",
      intro: `<p>A servo turns to an <strong>angle</strong> set by the width of a pulse repeated every 20 ms. Inside is a DC motor, a gearbox and a potentiometer that feeds back the shaft position: a sensor and an actuator working together.</p>
        <div class="cmp-grid">${photo("sg90-servo.jpg", "An SG90 micro servo.", "small")}</div>`,
      mount: mountServo,
      after: `<div class="callout info"><strong>Good to know</strong>1 to 2 ms for 0° to 180° is the standard. Many small hobby servos, like the SG90, need 0.5 to 2.5 ms for their full 180°, so check the datasheet.</div>` },
    { id: "relay", group: "actuators", title: "Relay", toc: "Relay",
      intro: `<p>A relay is an electrically operated switch. A small current through its <strong>coil</strong> makes a magnetic field that pulls a switch arm, so a 3.3 V microcontroller pin can safely switch a mains lamp, pump or heater. <strong>COM</strong> is the common contact, <strong>NC</strong> is normally closed and <strong>NO</strong> normally open.</p>
        <div class="cmp-grid">${photo("relay-module.jpg", "A one-channel 5 V relay module.", "small")}</div>`,
      mount: mountRelay,
      after: `<div class="callout note"><strong>Next week's lab</strong>From the reference book: (1) turning a DC motor on and off from a web page and a phone app, (2) controlling the DC motor's speed from a web page and a phone app, and (3) controlling the position of a servo motor.</div>` }
  ];

  /* =====================================================================
     Exercises (practice versions of the slide questions, with different numbers)
     ===================================================================== */
  const W_ = (list) => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml(list)}</ol></div>`;
  const PNAMES = PARAMS.map((p) => p[1]);
  const EXERCISES = [
    { id: "c3-q1", title: "Exercise 1: Which Parameter?",
      q: `<p>Each situation shows one sensor parameter going wrong. Choose the parameter.</p>`,
      ans: [{ l: "A pressure gauge reads 2.10 bar as pressure rises to 2 bar, but 2.18 bar as it falls back to 2 bar", opts: PNAMES, v: 6 },
        { l: "A thermometer takes 40 s to show the new temperature after being moved into a hot room", opts: PNAMES, v: 3 },
        { l: "After an overload, a load cell reads 0.2 kg with nothing on it", opts: PNAMES, v: 7 },
        { l: "The same 1 kg mass reads 0.998, 1.004, 0.991 and 1.009 kg", opts: PNAMES, v: 2 },
        { l: "A sensor near a welding machine gives a fuzzy, jumpy signal", opts: PNAMES, v: 4 }],
      hints: [`Ask yourself what is being compared: rising vs falling, time, before vs after a load, repeated tries, or noise.`, `Replay the animations for hysteresis, dynamic response, residual deformation, repeatability and signal quality.`],
      working: () => W_([step("Rising vs falling", "", "", "Different readings at the same pressure depending on direction: <strong>hysteresis</strong>"), step("Slow to follow", "", "", "<strong>Dynamic response</strong> (a large time constant)"), step("Offset after overload", "", "", "<strong>Residual deformation</strong>"), step("Scatter for the same input", "", "", "<strong>Repeatability</strong>"), step("Noise", "", "", "<strong>Signal quality</strong>: low SNR")]) },
    { id: "c3-q2", title: "Exercise 2: Sensitivity of a Linear Sensor",
      q: `<p>A linear temperature sensor gives <strong>0.50 V at 20 °C</strong> and <strong>1.30 V at 100 °C</strong>.</p>`,
      ans: [{ l: "Sensitivity", u: "mV/°C", v: 10 }, { l: "Output at 60 °C", u: "V", v: 0.9 }, { l: "Temperature when the output is 1.05 V", u: "°C", v: 75 }],
      hints: [`Sensitivity = change in output ÷ change in input. Convert volts to millivolts.`, `A linear sensor: V = V at 20 °C + sensitivity × (T − 20).`],
      working: () => W_([step("Sensitivity", "S = ΔV ÷ ΔT", "= (1.30 − 0.50) V ÷ (100 − 20) °C = 0.80 V ÷ 80 °C", "S = 0.010 V/°C = <strong>10 mV/°C</strong>"),
        step("Output at 60 °C", "V = 0.50 + S × (T − 20)", "= 0.50 + 0.010 × 40", "V = <strong>0.90 V</strong>"),
        step("Temperature at 1.05 V", "T = 20 + (V − 0.50) ÷ S", "= 20 + 0.55 ÷ 0.010", "T = <strong>75 °C</strong>")]) },
    { id: "c3-q3", title: "Exercise 3: Dynamic Response",
      q: `<p>A probe with a time constant <strong>τ = 4 s</strong> is moved from 20 °C air into 60 °C water.</p>`,
      ans: [{ l: "Reading after 4 s", u: "°C", v: 45.28 }, { l: "Reading after 12 s", u: "°C", v: 58.01 }, { l: "Time to settle (5τ)", u: "s", v: 20 }],
      hints: [`T(t) = T₁ + (T₂ − T₁)(1 − e<sup>−t/τ</sup>), with T₁ = 20 °C and T₂ = 60 °C.`, `4 s is one τ (63.2%), 12 s is three τ (95.0%).`],
      working: () => W_([step("After 4 s = 1τ", "T = 20 + 40(1 − e<sup>−1</sup>)", "= 20 + 40 × 0.632", "T = <strong>45.3 °C</strong>"), step("After 12 s = 3τ", "T = 20 + 40(1 − e<sup>−3</sup>)", "= 20 + 40 × 0.950", "T = <strong>58.0 °C</strong>"), step("Settling time", "≈ 5τ", "= 5 × 4 s", "<strong>20 s</strong> (99.3% of the change)")]) },
    { id: "c3-q4", title: "Exercise 4: Hysteresis",
      q: `<p>A sensor's full-scale output is 0.80 V to 2.00 V. At 35 °C it reads <strong>1.34 V</strong> while heating and <strong>1.46 V</strong> while cooling (the biggest difference).</p>`,
      ans: [{ l: "Hysteresis", u: "V", v: 0.12 }, { l: "Hysteresis as % of full scale", u: "%", v: 10 }],
      hints: [`Hysteresis is the difference between the falling and rising readings.`, `Full scale = 2.00 − 0.80 V. Divide and multiply by 100.`],
      working: () => W_([step("Difference", "h = V<sub>falling</sub> − V<sub>rising</sub>", "= 1.46 − 1.34", "h = <strong>0.12 V</strong>"), step("As % of full scale", "h ÷ (V<sub>max</sub> − V<sub>min</sub>) × 100", "= 0.12 ÷ 1.20 × 100", "= <strong>10%</strong>")]) },
    { id: "c3-q5", title: "Exercise 5: Potentiometer",
      q: `<p>A <strong>20 kΩ</strong> potentiometer is connected between V<sub>in</sub> = <strong>3.3 V</strong> and GND.</p>`,
      ans: [{ l: "V<sub>out</sub> with the wiper at the midpoint", u: "V", v: 1.65 }, { l: "R<sub>1</sub> when R<sub>2</sub> = 5 kΩ", u: "kΩ", v: 15 }, { l: "V<sub>out</sub> when R<sub>2</sub> = 5 kΩ", u: "V", v: 0.825 }],
      hints: [`R<sub>1</sub> + R<sub>2</sub> always equals the total resistance.`, `V<sub>out</sub> = V<sub>in</sub> × R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>). Try the potentiometer calculator.`],
      working: () => W_([step("Midpoint", "R<sub>1</sub> = R<sub>2</sub> = 10 kΩ", "V<sub>out</sub> = 3.3 × 10 ÷ 20", "V<sub>out</sub> = <strong>1.65 V</strong>"), step("R<sub>1</sub>", "R<sub>1</sub> = 20 kΩ − R<sub>2</sub>", "= 20 − 5", "R<sub>1</sub> = <strong>15 kΩ</strong>"), step("V<sub>out</sub>", "V<sub>out</sub> = V<sub>in</sub> R<sub>2</sub> ÷ (R<sub>1</sub> + R<sub>2</sub>)", "= 3.3 × 5 ÷ 20", "V<sub>out</sub> = <strong>0.825 V</strong>")]) },
    { id: "c3-q6", title: "Exercise 6: Resistance of a Wire",
      q: `<p>A nichrome wire has resistivity <strong>ρ = 1.1 × 10<sup>−6</sup> Ω·m</strong>, length <strong>0.5 m</strong> and cross-section <strong>0.25 mm²</strong>.</p>`,
      ans: [{ l: "Resistance", u: "Ω", v: 2.2 }, { l: "Resistance if the area is doubled", u: "Ω", v: 1.1 }, { l: "Resistance if it is stretched to twice the length (area halves)", u: "Ω", v: 8.8 }],
      hints: [`Convert the area: 1 mm² = 10<sup>−6</sup> m². Then R = ρl ÷ A.`, `R is proportional to l and inversely proportional to A.`],
      working: () => W_([step("Resistance", "R = ρ l ÷ A", "= 1.1 × 10<sup>−6</sup> × 0.5 ÷ 0.25 × 10<sup>−6</sup>", "R = <strong>2.2 Ω</strong>"), step("Area doubled", "R ÷ 2", "= 2.2 ÷ 2", "<strong>1.1 Ω</strong>"), step("Stretched", "2l and A ÷ 2 → R × 4", "= 2.2 × 4", "<strong>8.8 Ω</strong>")]) },
    { id: "c3-q7", title: "Exercise 7: Parallel-Plate Capacitive Sensor",
      q: `<p>Plate area <strong>A = 0.01 m²</strong>, gap <strong>d = 2 mm</strong>, dielectric <strong>ε<sub>r</sub> = 2.2</strong>. (ε<sub>0</sub> = 8.854 × 10<sup>−12</sup> F/m)</p>`,
      ans: [{ l: "Capacitance", u: "pF", v: 97.39 }, { l: "Capacitance when the gap closes to 1 mm", u: "pF", v: 194.8 }],
      hints: [`C = ε<sub>r</sub>ε<sub>0</sub>A ÷ d with d in metres; 1 pF = 10<sup>−12</sup> F.`, `C is inversely proportional to d.`],
      working: () => W_([step("Capacitance", "C = ε<sub>r</sub> ε<sub>0</sub> A ÷ d", "= 2.2 × 8.854 × 10<sup>−12</sup> × 0.01 ÷ 0.002", "C = 9.739 × 10<sup>−11</sup> F = <strong>97.39 pF</strong>"), step("Half the gap", "C ∝ 1/d", "= 97.39 × 2", "<strong>194.8 pF</strong>")]) },
    { id: "c3-q8", title: "Exercise 8: Liquid-Level Sensor",
      q: `<p>Plates <strong>L = 20 cm</strong> long and <strong>w = 4 cm</strong> wide, gap <strong>d = 2 mm</strong>, ε<sub>water</sub> = 80, ε<sub>air</sub> = 1.</p>`,
      ans: [{ l: "C<sub>net</sub> with the tank empty (x = 0)", u: "pF", v: 35.42 }, { l: "C<sub>net</sub> with x = 5 cm of water", u: "pF", v: 734.9 }, { l: "C<sub>net</sub> with the tank full (x = L)", u: "pF", v: 2833 }],
      hints: [`First work out ε<sub>0</sub>w ÷ d in F/m, with w and d in metres.`, `C<sub>net</sub> = ε<sub>0</sub>(w/d)(ε<sub>water</sub>x + ε<sub>air</sub>(L − x)), with x and L in metres.`],
      working: () => W_([step("Common factor", "ε<sub>0</sub> w ÷ d", "= 8.854 × 10<sup>−12</sup> × 0.04 ÷ 0.002", "= 1.771 × 10<sup>−10</sup> F/m"), step("Empty", "C = 1.771 × 10<sup>−10</sup> × (1 × 0.20)", "", "C = <strong>35.42 pF</strong>"), step("x = 5 cm", "C = 1.771 × 10<sup>−10</sup> × (80 × 0.05 + 1 × 0.15)", "= 1.771 × 10<sup>−10</sup> × 4.15", "C = <strong>734.9 pF</strong>"), step("Full", "C = 1.771 × 10<sup>−10</sup> × (80 × 0.20)", "", "C = <strong>2833 pF</strong> (2.833 nF)")]) },
    { id: "c3-q9", title: "Exercise 9: Coil Inductance",
      q: `<p>A coil has <strong>N = 200</strong> turns, radius <strong>r = 1 cm</strong>, length <strong>l = 10 cm</strong> and a core with <strong>μ<sub>r</sub> = 100</strong>. (μ<sub>0</sub> = 4π × 10<sup>−7</sup> H/m)</p>`,
      ans: [{ l: "Inductance", u: "mH", v: 15.79 }, { l: "Inductance with the core removed (air)", u: "mH", v: 0.1579 }],
      hints: [`Area A = πr², with r in metres.`, `L = μ<sub>r</sub>μ<sub>0</sub>N²A ÷ l. Removing the core makes μ<sub>r</sub> = 1.`],
      working: () => W_([step("Area", "A = π r²", "= π × 0.01²", "A = 3.142 × 10<sup>−4</sup> m²"), step("Inductance", "L = μ<sub>r</sub> μ<sub>0</sub> N² A ÷ l", "= 100 × 4π × 10<sup>−7</sup> × 200² × 3.142 × 10<sup>−4</sup> ÷ 0.1", "L = <strong>15.79 mH</strong>"), step("Air core", "L ÷ 100", "", "<strong>0.158 mH</strong> (158 µH)")]) },
    { id: "c3-q10", title: "Exercise 10: Passive, Active or Actuator?",
      q: `<p>Classify each device.</p>`,
      ans: [{ l: "Thermocouple", opts: ["Passive sensor", "Active sensor", "Actuator"], v: 1 }, { l: "LVDT", opts: ["Passive sensor", "Active sensor", "Actuator"], v: 0 },
        { l: "Piezo disc used as a knock sensor", opts: ["Passive sensor", "Active sensor", "Actuator"], v: 1 }, { l: "Servo motor", opts: ["Passive sensor", "Active sensor", "Actuator"], v: 2 },
        { l: "NTC thermistor", opts: ["Passive sensor", "Active sensor", "Actuator"], v: 0 }],
      hints: [`Does it produce its own electrical signal (active), need a supply to show a change (passive), or turn electricity into action (actuator)?`, `Two of these generate a voltage by themselves.`],
      working: () => W_([step("Thermocouple", "", "", "<strong>Active</strong>: makes its own voltage from heat"), step("LVDT", "", "", "<strong>Passive</strong>: needs an AC supply on the primary"), step("Piezo knock sensor", "", "", "<strong>Active</strong>: pressure makes charge"), step("Servo motor", "", "", "<strong>Actuator</strong>: electrical signal in, movement out"), step("Thermistor", "", "", "<strong>Passive</strong>: resistance change needs excitation")]) },
    { id: "c3-q11", title: "Exercise 11: Parking Sensor",
      q: `<p>A reversing sensor uses ultrasound at <strong>343 m/s</strong>.</p>`,
      ans: [{ l: "Distance when the echo returns after 2.9 ms", u: "m", v: 0.4974 }, { l: "Echo time for an object 1.5 m away", u: "ms", v: 8.746 }],
      hints: [`The sound travels to the object and back.`, `d = v × t ÷ 2, so t = 2d ÷ v.`],
      working: () => W_([step("Distance", "d = v t ÷ 2", "= 343 × 0.0029 ÷ 2", "d = <strong>0.497 m</strong>"), step("Echo time", "t = 2d ÷ v", "= 2 × 1.5 ÷ 343", "t = 8.75 × 10<sup>−3</sup> s = <strong>8.75 ms</strong>")]) },
    { id: "c3-q12", title: "Exercise 12: Actuators",
      q: `<p>Answer these about the actuators in this chapter.</p>`,
      ans: [{ l: "Servo angle for a 1.25 ms pulse (1 ms = 0°, 2 ms = 180°)", u: "°", v: 45 }, { l: "Average voltage on a 12 V motor at 75% duty", u: "V", v: 9 },
        { l: "Resistor for a red LED (V<sub>F</sub> = 2.0 V) from a 3.3 V pin at 10 mA", u: "Ω", v: 130 }, { l: "When a relay coil is energised, COM connects to", opts: ["NC", "NO"], v: 1 }],
      hints: [`Servo: θ = (t − 1 ms) ÷ 1 ms × 180°. Motor: V<sub>avg</sub> = D × V<sub>S</sub>.`, `LED: R = (V<sub>pin</sub> − V<sub>F</sub>) ÷ I. The relay arm leaves its normally closed contact.`],
      working: () => W_([step("Servo", "θ = (1.25 − 1) ÷ 1 × 180°", "", "θ = <strong>45°</strong>"), step("Motor", "V<sub>avg</sub> = 0.75 × 12 V", "", "<strong>9 V</strong>"), step("LED resistor", "R = (3.3 − 2.0) ÷ 0.010", "", "R = <strong>130 Ω</strong>"), step("Relay", "", "", "The coil pulls the arm to <strong>NO</strong> (normally open)")]) }
  ];

  Lab.page({
    topic: 3,
    collapseWorking: true,
    exerciseCarousel: true,
    sections: SECTIONS,
    groups: [
      { key: "intro", list: "#introList", toc: "#introToc" },
      { key: "params", list: "#paramsList", toc: "#paramsToc" },
      { key: "passive", list: "#passiveList", toc: "#passiveToc" },
      { key: "active", list: "#activeList", toc: "#activeToc" },
      { key: "actuators", list: "#actList", toc: "#actToc" }
    ],
    exercises: EXERCISES
  });
})();
