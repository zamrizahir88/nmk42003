/* NMK42003 Lab 2: Transduction and Conversion Calibration, virtual lab.
   A potentiometer on a printed protractor is the angle sensor. The page simulates powering it safely,
   the ESP32's ADC, collecting Table 1, the straight-line fit, and showing the angle on the Serial Monitor,
   a phone (Bluetooth) and a web page. Then a pre-lab check, the Lab Task rehearsal and a printable plan.
   Shared lab pieces (board, blocks, phone, quiz gate) are in labkit.js; the page engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, step, stepsHtml, reduceMotion, store, chips, wireChips, codeBlock, fold, player, poly, axes, svg, dot } = Lab;
  const { $, T, sleep, clamp, every, W_, pinXY, board, serialBox, phoneFrame, bf, bs, bn, inl, bk, ws, HEAD } = LabKit;

  const IP = "192.168.43.45", MAC = "08:3A:F2:6C:1D:94";
  const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
  const cnum = (x, p = 5) => Number(x.toPrecision(p)).toString(); // a C/Arduino number literal
  const row = (label) => `[aria-label="${label}"]`;

  // The name (shared with Lab 1): it goes into the Bluetooth name and the phone hotspot name.
  const ME = LabKit.nameBox({
    key: "nmk-lab1-name", label: "Your name or group name",
    out: (a) => `Bluetooth name: <strong>${esc(a.bt())}</strong> · hotspot name: <strong>${esc(a.who())}_wifi</strong>`
  });
  const who = ME.who, btName = ME.bt, hotspot = () => `${who()}_wifi`;

  /* =====================================================================
     The virtual sensor
     A 10 kΩ potentiometer: the protractor's 0° to 180° is only part of its travel, so the wiper
     voltage is V = Vs × (angle + t0) / span. Each device gets its own t0 and span, so every
     group's calibration constants come out a little different, as with real parts.
     The ADC model follows a typical ESP32: nothing below about 0.14 V, close to a straight line
     up to 2.5 V, steeper above that, and full scale (4095) from about 3.15 V.
     ===================================================================== */
  const SENSOR = (() => {
    let s = store.get("nmk-lab2-sensor", null);
    const top = (x) => (3.3 * (180 + x.t0)) / x.span; // wiper voltage at 180°
    if (!s || !(s.t0 >= 50 && s.t0 <= 66) || !(top(s) >= 2.57 && top(s) <= 2.67)) {
      // the top of the range just reaches the ADC's bend, so the best line is 2° to 3.5° out at the worst point
      const t0 = 50 + Math.round(Math.random() * 16);
      s = { t0, span: Math.round((3.3 * (180 + t0)) / (2.58 + Math.random() * 0.08)) };
      store.set("nmk-lab2-sensor", s);
    }
    return s;
  })();
  const frac = (angle, swap) => { const f = (angle + SENSOR.t0) / SENSOR.span; return swap ? 1 - f : f; };
  const adcOf = (v) => clamp(v < 0.14 ? 0 : v <= 2.5 ? 1271.2 * (v - 0.14) : 3000 + (1095 * (v - 2.5)) / 0.65, 0, 4095);
  const jitter = () => (Math.random() + Math.random() + Math.random() - 1.5) * 14;
  // One ADC reading for a knob angle. o: { vs, swap, quiet }
  function readAdc(angle, o = {}) {
    const base = adcOf((o.vs === undefined ? 3.3 : o.vs) * frac(angle, o.swap));
    return Math.round(clamp(base + (o.quiet || base <= 0 || base >= 4095 ? 0 : jitter()), 0, 4095));
  }

  /* Least-squares straight line (x = ADC count, y = angle) */
  function linFit(pts) {
    const n = pts.length; let Sx = 0, Sy = 0, Sxy = 0, Sxx = 0;
    pts.forEach(([x, y]) => { Sx += x; Sy += y; Sxy += x * y; Sxx += x * x; });
    const m = (n * Sxy - Sx * Sy) / (n * Sxx - Sx * Sx), c = (Sy - m * Sx) / n;
    return { m, c, f: (x) => m * x + c, sums: { n, Sx, Sy, Sxy, Sxx } };
  }
  const r2 = (pts, f) => { const my = pts.reduce((s, p) => s + p[1], 0) / pts.length; let ss = 0, st = 0; pts.forEach(([x, y]) => { ss += (y - f(x)) ** 2; st += (y - my) ** 2; }); return 1 - ss / st; };

  const ANGLES = Array.from({ length: 19 }, (_, i) => i * 10);
  // The line the simulation itself would find (used where a lesson needs an angle before the student has fitted one)
  const BOOK = linFit(ANGLES.map((a) => [readAdc(a, { quiet: true }), a]));

  /* ---------- Progress: a tick on the step bar once a part's main job has been done on this device ---------- */
  const DONE_KEY = "nmk-lab2-done", DONE = store.get(DONE_KEY, {}) || {};
  const paintTicks = () => document.querySelectorAll(".lab-nav.steps a").forEach((a) => {
    const on = !!DONE[a.getAttribute("href").slice(1)];
    if (a.classList.contains("ok") === on) return;
    a.classList.toggle("ok", on);
    if (on) a.insertAdjacentHTML("beforeend", `<span class="vh"> (done)</span>`);
  });
  const done = (k) => { if (DONE[k]) return; DONE[k] = 1; store.set(DONE_KEY, DONE); paintTicks(); };

  /* ---------- Table 1 (saved on this device) and the student's own m and c ---------- */
  const CAL_KEY = "nmk-lab2-cal", MC_KEY = "nmk-lab2-mc";
  let CAL = (() => {
    const raw = store.get(CAL_KEY, {}), ok = {};
    ANGLES.forEach((a) => { const v = raw && raw[a]; if (Number.isFinite(v) && v >= 0 && v <= 4095) ok[a] = Math.round(v); });
    return ok;
  })();
  const calListeners = [], mcListeners = [];
  const calChanged = () => { store.set(CAL_KEY, CAL); calListeners.forEach((f) => f()); };
  const calPts = () => ANGLES.filter((a) => CAL[a] !== undefined).map((a) => [CAL[a], a]);
  const myFit = () => { const p = calPts(); return p.length >= 3 ? linFit(p) : null; };
  let MC = (() => { const v = store.get(MC_KEY, null); return v && Number.isFinite(v.m) && Number.isFinite(v.c) ? v : null; })();
  const setMc = (v) => { MC = v; store.set(MC_KEY, v); mcListeners.forEach((f) => f()); };
  // The angle the student's program would show for a count (their m and c, or the simulation's line until then)
  const shown = (count) => (MC ? MC.m * count + MC.c : BOOK.f(count));
  const eqC = (v) => (v ? `(${cnum(v.m)} * ADC) ${v.c < 0 ? "-" : "+"} ${cnum(Math.abs(v.c), 4)}` : "(m * ADC) + c");
  const eqText = (v) => `Angle = ${num(v.m, 5)} × ADC ${v.c < 0 ? "−" : "+"} ${num(Math.abs(v.c), 4)}`;

  /* =====================================================================
     The bench drawing: potentiometer on the protractor, three jumper wires, the ESP32,
     and (when used) the bench power supply, the multimeter and the warning LED.
     o: { angle, src: "pin" | "bench", conn, gnd, dead, r1, r2, meter, meterOn, psu, led, prog: { r, k, y } }
     ===================================================================== */
  const VW = 670, VH = 350, RX = 150, RY = 200, RR = 108, BX = 372, BY = 96, BK = 0.74;
  const [VPX, VPY] = pinXY(BX, BY, BK, "top", "VP"), [GX, GY] = pinXY(BX, BY, BK, "bot", "GND");
  const [PX, PY] = pinXY(BX, BY, BK, "bot", "3V3"), [LX, LY] = pinXY(BX, BY, BK, "top", "D32");
  const KX = 616, KY = 238; // the bench supply's voltage knob: 0 V to 12 V over three-quarters of a turn
  const knobDeg = (v) => ((v || 0) / 12) * 270 - 135;
  const polar = (a, r) => [RX + r * Math.cos((a * Math.PI) / 180), RY - r * Math.sin((a * Math.PI) / 180)];
  const dash = (p) => (p >= 1 ? "" : ` pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - p).toFixed(3)}"`);
  // A jumper wire with a pale casing, so a wire crossing another reads as passing over it
  const wire = (cls, d, p = 1) => (p <= 0 ? "" : `<path class="wire-c" d="${d}"${dash(p)}/><path class="wire ${cls}" d="${d}"${dash(p)}/>`);

  function protractor(angle) {
    let s = `<rect class="pr-card" x="22" y="70" width="256" height="168" rx="6"/>`;
    s += `<path class="prot" d="M${RX - RR},${RY}A${RR},${RR} 0 0 1 ${RX + RR},${RY}Z"/>`;
    for (let a = 0; a <= 180; a += 5) {
      const big = a % 30 === 0, [x1, y1] = polar(a, RR - (big ? 14 : a % 10 === 0 ? 9 : 5)), [x2, y2] = polar(a, RR);
      s += `<line class="tick${big ? " big" : ""}" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`;
    }
    for (let a = 0; a <= 180; a += 30) { const [x, y] = polar(a, RR - 26); s += T(f1(x), f1(y + (a % 180 === 0 ? -5 : 4)), a, "middle", "pr-n"); }
    const [px, py] = polar(angle, RR - 6);
    s += `<path class="leg" d="M136,222V244M150,226V244M164,222V244"/><circle class="pot-body" cx="${RX}" cy="${RY}" r="27"/>`;
    s += `<line class="pointer rig-ptr" x1="${RX}" y1="${RY}" x2="${f1(px)}" y2="${f1(py)}"/><circle class="knob" cx="${RX}" cy="${RY}" r="11"/>`;
    s += `<path class="prot-hit" d="M${RX - RR - 12},${RY + 16}V${RY}A${RR + 12},${RR + 12} 0 0 1 ${RX + RR + 12},${RY}V${RY + 16}Z"/>`;
    return s;
  }

  function rigSvg(o) {
    const bench = o.src === "bench", pg = o.prog || { r: 1, k: 1, y: 1 }, off = bench && !o.conn ? " off" : "";
    let s = protractor(o.angle);
    s += board(BX, BY, { k: BK, pwr: true, hi: ["t:VP", "b:GND", "b:3V3"].concat(o.led === undefined ? [] : ["t:D32"]) });
    s += T(VPX + 7, VPY - 10, "VP", "start", "wl sm") + T(PX - 6, 204, "3V3", "end", "wl sm") + T(GX + 6, 204, "GND", "start", "wl sm");
    if (bench) {
      s += `<g class="psu"><rect class="psu-b" x="470" y="208" width="170" height="112" rx="8"/><rect class="lcd" x="500" y="220" width="92" height="34" rx="4"/>` +
        T(546, 244, esc(o.psu || ""), "middle", "lcdt rig-psu") + `<circle class="psu-k" cx="${KX}" cy="${KY}" r="18"/><line class="psu-m rig-psuk" x1="${KX}" y1="${KY}" x2="${KX}" y2="${KY - 14}" transform="rotate(${knobDeg(o.setV)} ${KX} ${KY})"/><circle class="psu-hit" cx="${KX}" cy="${KY}" r="26"/>` +
        `<circle class="psu-t p" cx="470" cy="246" r="7"/><circle class="psu-t n" cx="470" cy="290" r="7"/>` + T(484, 251, "+", "start", "psu-l") + T(484, 295, "−", "start", "psu-l") +
        T(566, 290, "Bench power supply", "middle", "psu-l sm") + T(566, 306, bench && o.conn ? "output connected" : "output not connected", "middle", "psu-l sm dim") + `</g>`;
      s += `<g class="sup${off}">` + wire("r", "M164,244V258H452V246H470", pg.r) + wire("k", "M136,244V290H470", pg.k) + `</g>`;
      s += o.gnd ? wire("k", `M${GX},${GY}V290`) + `<circle class="join" cx="${GX}" cy="290" r="4"/>`
        : `<path class="wire open" d="M${GX},${GY}V268"/>` + T(GX - 8, 240, "no GND link", "end", "open-t");
    } else {
      s += wire("r", `M164,244V258H${PX}V${PY}`, pg.r) + wire("k", `M136,244V290H${GX}V${GY}`, pg.k);
    }
    s += `<g class="${o.hot ? "vp-wire hot" : "vp-wire"}">` + wire("y", `M150,244V272H300V338H654V70H${VPX}V${VPY}`, pg.y) + `</g>`;
    if (o.hot) s += `<circle class="vp-hot" cx="${VPX}" cy="${VPY}" r="9"/>`;
    if (o.led !== undefined) {
      s += `<path class="wire r thin" d="M${LX},${LY}V88"/><path class="led-dome rig-led${o.led ? " on" : ""}" d="M${LX - 11},88V76a11,11 0 0 1 22,0V88Z"/>` + T(LX + 16, 58, "LED (GPIO32)", "start", "wl sm");
    }
    if (o.dead) {
      const puff = [[0, 9, 0], [7, 8, .35], [-7, 7, .7], [3, 10, 1.05], [-4, 8, 1.4]];
      s += `<g class="burn">${puff.map(([dx, r, d]) => `<circle class="smoke" cx="${VPX + dx}" cy="${VPY - 6}" r="${r}" style="animation-delay:${d}s"/>`).join("")}` +
        `<circle class="burn-pin" cx="${VPX}" cy="${VPY}" r="8"/><path class="burn-x" d="M${VPX - 6},${VPY - 6}l12,12m0,-12l-12,12"/>` +
        (o.zap ? `<path class="spark" d="M${VPX},${VPY - 26}l6,16l17,-5l-11,13l13,11l-17,1l-1,17l-9,-14l-13,10l5,-16l-16,-6l16,-6l-6,-15l13,9z"/>` : "") + `</g>`;
      s += `<g class="dead-banner"><rect x="22" y="14" width="328" height="40" rx="8"/>${T(186, 40, "⚡ VP PIN DAMAGED", "middle", "db-t")}</g>`;
    }
    if (o.r1 !== undefined) {
      s += `<g class="rd${o.dead ? " dead" : o.hot ? " hot" : ""}"><rect x="372" y="12" width="148" height="50" rx="6"/>${T(382, 32, esc(o.r1), "start", "rd-l rig-r1")}${T(382, 52, esc(o.r2 || ""), "start", "rd-v hi rig-r2")}</g>`;
    }
    if (o.meter !== undefined) {
      s += `<g class="mm"><rect class="mm-b" x="14" y="256" width="112" height="82" rx="8"/><rect class="lcd" x="24" y="266" width="92" height="30" rx="4"/>` +
        T(70, 287, esc(o.meter), "middle", "lcdt rig-meter") + T(70, 314, "Multimeter", "middle", "mm-t") + T(70, 329, esc(o.meterOn || "wiper to GND"), "middle", "mm-t sm rig-meter-on") + `</g>`;
    }
    if (o.probe) { // dashed outlines mark where the meter's probes can go; tap one to measure there
      const zone = (name, shape) => `<g class="probe-zone${o.probe === name ? " on" : ""}" data-probe="${name}">${shape}</g>`;
      s += zone("wiper", `<circle cx="150" cy="239" r="13"/>`) + zone("supply", bench ? `<rect x="455" y="232" width="30" height="72" rx="9"/>` : `<circle cx="${PX}" cy="${PY}" r="11"/>`);
    }
    return `<svg class="scene rig${o.zap ? " zap" : ""}" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(o.aria || `Potentiometer on a protractor, wired to the ESP32. The pointer is at ${Math.round(o.angle)} degrees.`)}">${s}</svg>`;
  }

  /* An interactive bench: drag the pointer or use the slider. The drawing is built once per wiring
     change; the pointer, the readouts and the LED are then updated in place.
     makeRig(host, { snap, caption, state, onAngle, onSupply, onProbe }) → { st, set(patch), upd(patch), setAngle(a) } */
  let RIG_N = 0;
  function makeRig(host, o = {}) {
    const id = `rig${++RIG_N}`, snap = o.snap || 1;
    const st = Object.assign({ angle: 60, src: "pin", conn: true, gnd: true, dead: false }, o.state);
    host.innerHTML = `<figure class="scene-box rig-box"><div class="scene-scroll"><div class="rig-svg"></div></div>
        <figcaption>${o.caption || "Drag the red pointer round the protractor, or use the slider."}<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
      <div class="slider-field rig-knob"><label for="${id}">Turn the knob: <output>${st.angle}°</output></label>
        <input type="range" id="${id}" min="0" max="180" step="${snap}" value="${st.angle}">
        <p class="rig-live"></p></div>`;
    const box = $(".rig-svg", host), slider = $("input", host), out = $("output", host), liveEl = $(".rig-live", host);
    const q = (s) => box.querySelector(s), txt = (s, v) => { const e = q(s); if (e && v !== undefined && e.textContent !== v) e.textContent = v; };
    const paint = () => {
      const [x, y] = polar(st.angle, RR - 6), p = q(".rig-ptr");
      if (p) { p.setAttribute("x2", f1(x)); p.setAttribute("y2", f1(y)); }
      txt(".rig-r1", st.r1); txt(".rig-r2", st.r2); txt(".rig-meter", st.meter); txt(".rig-meter-on", st.meterOn); txt(".rig-psu", st.psu);
      const led = q(".rig-led"), kn = q(".rig-psuk");
      if (led) led.classList.toggle("on", !!st.led);
      if (kn) kn.setAttribute("transform", `rotate(${knobDeg(st.setV)} ${KX} ${KY})`);
      out.textContent = `${st.angle}°`;
      // on a phone the readout box may be scrolled out of view, so the same values are repeated under the slider
      const lv = [st.r1, st.r2].filter(Boolean).join(" · ");
      if (liveEl.textContent !== lv) liveEl.textContent = lv;
      liveEl.classList.toggle("bad", !!st.dead);
    };
    const build = () => { box.innerHTML = rigSvg(st); paint(); };
    const setAngle = (a, quiet) => {
      a = clamp(Math.round(a / snap) * snap, 0, 180);
      if (a === st.angle && !quiet) return;
      st.angle = a; slider.value = a; paint();
      if (o.onAngle && !quiet) o.onAngle(a);
    };
    slider.addEventListener("input", () => setAngle(+slider.value));
    // Drag on the protractor: the angle from the centre of the potentiometer to the pointer
    let drag = "";
    const at = (e, cx, cy) => { const r = box.querySelector("svg").getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * VW - cx, cy - ((e.clientY - r.top) / r.height) * VH]; };
    const toAngle = (e) => { const [x, y] = at(e, RX, RY); return y < 0 ? (x < 0 ? 180 : 0) : (Math.atan2(y, x) * 180) / Math.PI; };
    // the supply knob: straight up is the middle of its travel
    const toVolts = (e) => { const [x, y] = at(e, KX, KY); return Math.round(((clamp((Math.atan2(x, y) * 180) / Math.PI, -135, 135) + 135) / 270) * 120) / 10; };
    const move = (e) => { if (drag === "pot") setAngle(toAngle(e)); else if (drag === "psu" && o.onSupply) o.onSupply(toVolts(e)); };
    box.addEventListener("pointerdown", (e) => {
      const zone = e.target.closest("[data-probe]");
      if (zone) { if (o.onProbe) o.onProbe(zone.dataset.probe); return; }
      drag = e.target.closest(".prot-hit") ? "pot" : e.target.closest(".psu-hit") ? "psu" : "";
      if (!drag) return;
      e.preventDefault();
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      move(e);
    });
    box.addEventListener("pointermove", move);
    ["pointerup", "pointercancel"].forEach((ev) => box.addEventListener(ev, () => { drag = ""; }));
    build();
    return { st, setAngle, set(patch) { Object.assign(st, patch); build(); }, upd(patch) { Object.assign(st, patch); paint(); } };
  }

  // A Serial Monitor that keeps only its last lines (these monitors run for as long as the page is open)
  function logBox(el, max = 30) {
    const o = el.querySelector(".serial-o"), lines = [];
    return { add(t) { lines.push(t); if (lines.length > max) lines.shift(); o.textContent = lines.join("\n") + "\n"; o.scrollTop = o.scrollHeight; }, clear() { lines.length = 0; o.textContent = ""; } };
  }
  const blocksAndCode = (blocks, code, file, label) => `<div class="bc-grid"><div>${ws(blocks, label)}</div><div>${codeBlock(code, file)}</div></div>
    <p class="small-note">TUNIOT may name a few blocks slightly differently. What matters is that your Arduino code does the same.</p>`;

  /* =====================================================================
     BEFORE YOU START
     ===================================================================== */
  const KIT = [
    ["ESP32 Wi-Fi module and micro-USB cable", "The ESP32 DevKit V1 (30 pins), with the basic circuit from Lab 1."],
    ["10 kΩ variable resistor (potentiometer)", "The angle sensor. It has three pins: two ends and a wiper in the middle."],
    ["Printed protractor on A4 paper", "The reference for the angle. Tape it to a piece of cardboard so it can't move."],
    ["Breadboard", "Holds the potentiometer, and the LED for the Lab Task."],
    ["Male-female jumper wires (at least 5)", "Three for the potentiometer, two more for the Lab Task LED."],
    ["Multimeter", "Checks the supply voltage before you connect it, and the wiper voltage."],
    ["Bench power supply (optional)", "Another way to power the potentiometer. It must be set to 3.3 V."],
    ["LED and resistor (220 Ω to 1 kΩ)", "The warning LED on GPIO32 for the Lab Task, as in Lab 1 Lesson 4."],
    ["Mobile phone and computer", "The phone shows the angle by Bluetooth and Wi-Fi, and makes the hotspot."]
  ];
  const SOFT = [
    ["Web browser", "For TUNIOT, App Inventor and the ESP32's own web page.", ""],
    ["TUNIOT for ESP32", "Build programs from blocks and get the Arduino code.", "http://easycoding.tn/esp32/demos/code/"],
    ["Arduino IDE", "Uploads the code and shows the Serial Monitor.", "https://www.arduino.cc/en/software"],
    ["Spreadsheet (Microsoft Excel)", "Plots Table 1 and fits the straight line.", ""],
    ["MIT App Inventor", "For the phone app that shows the angle.", "https://appinventor.mit.edu/"],
    ["S2 Terminal for Bluetooth and MIT AI2 Companion", "On the phone, as in Lab 1.", ""]
  ];

  // The whole lab on one line: each stage is a link, and a highlight walks through them.
  const FLOW = [
    ["l1", "1", "Power", "Wire the sensor and check the supply is 3.3 V"],
    ["l2", "2", "Understand", "An angle becomes a voltage, then a number"],
    ["l3", "3", "Read", "Print the ADC count on the Serial Monitor"],
    ["l4", "4", "Collect", "Record the count at 19 angles in Table 1"],
    ["l5", "5", "Fit", "Plot the graph and find the straight-line equation"],
    ["l6", "6", "Apply", "Put the equation in the program and check the error"],
    ["l7", "7", "Display", "Send the angle to a phone and a web page"],
    ["exercises", "✓", "Check", "Pass the Pre-Lab Check to unlock the task"],
    ["labtask", "★", "Plan", "Rehearse the Lab Task and print your plan"]
  ];
  function mountFlow(el) {
    el.innerHTML = `<ol class="flow">${FLOW.map(([h, n, t, d]) => `<li><a href="#${h}"><span class="fl-n" aria-hidden="true">${n}</span><strong>${t}</strong><small>${d}</small></a></li>`).join("")}</ol>`;
    if (reduceMotion) return;
    const items = [...el.querySelectorAll("li")];
    // one pass through the stages when the strip comes into view, then it rests
    let i = -1, id = 0;
    const run = () => { id = every(el, 1100, () => { i++; items.forEach((x, k) => x.classList.toggle("on", k === i)); if (i >= items.length) clearInterval(id); }); };
    if (!("IntersectionObserver" in window)) return run();
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.4 });
    io.observe(el);
  }

  /* =====================================================================
     LESSON 1: wire the potentiometer, then power it safely
     ===================================================================== */
  function mountWiring(el) {
    el.innerHTML = `<figure class="scene-box rig-box"><div class="scene-scroll"><div class="rig-svg"></div></div>
        <figcaption>The potentiometer on the printed protractor, and its three wires to the ESP32. VP is GPIO36.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
      <div class="pv-pl"></div><p class="small-note">The animation plays once. Press the replay button to watch it again, or drag the slider to go through it at your own speed.</p><p class="pv-read"></p>`;
    const box = $(".rig-svg", el), read = $(".pv-read", el);
    const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
    const draw = (t) => {
      const sweep = t >= 9.5, angle = sweep ? Math.round(90 - 70 * Math.cos(((t - 9.5) / 3.5) * Math.PI * 2)) : 20;
      const o = { angle, src: "pin", prog: { r: seg(t, 2, 4.2), k: seg(t, 4.5, 6.7), y: seg(t, 7, 9.2) } };
      if (sweep) { o.r1 = `VP = ${f2(3.3 * frac(angle))} V`; o.r2 = `ADC count: ${readAdc(angle, { quiet: true })}`; }
      box.innerHTML = rigSvg(o);
      read.innerHTML = t < 2 ? `<strong>1. Fix the sensor.</strong> Tape the printed protractor to cardboard and fix the potentiometer at its centre. Fit a pointer to the shaft, so it sweeps from 0° to 180°.`
        : t < 4.5 ? `<strong>2. Red wire.</strong> One outer pin goes to <strong>3.3 V</strong>: the ESP32's 3V3 pin, or the + terminal of a bench supply set to 3.3 V.`
        : t < 7 ? `<strong>3. Black wire.</strong> The other outer pin goes to <strong>GND</strong>.`
        : t < 9.5 ? `<strong>4. Yellow wire.</strong> The middle pin (the wiper) goes to <strong>VP</strong>. VP is GPIO36, one of the ESP32's analog inputs.`
        : `<strong>5. Turn the knob.</strong> The wiper voltage follows the angle, and the ESP32 turns that voltage into a number: the ADC count.`;
    };
    player($(".pv-pl", el), el, { dur: 13, loop: false, draw, still: 11.2, label: "Wiring the potentiometer" });
  }

  // The power bench: the 3V3 pin can't be set wrong; a bench supply can. Find out what happens.
  const PW_STEPS = ["Put the meter on the supply", "Set it so the meter reads 3.30 V", "Join the supply − to the ESP32 GND", "Connect the supply", "Turn the knob from 0° to 180° and watch VP"];
  function mountPower(el) {
    const S = { src: "pin", set: 5, gnd: false, conn: false, dead: false, probe: "wiper", saw: false, lo: 180, hi: 0 };
    el.innerHTML = `${chips("Supply for the potentiometer", [["pin", "ESP32 3V3 pin"], ["bench", "Bench power supply"]], "pin")}
      <div class="pw-grid"><div class="pw-left"><div class="pw-rig"></div><div class="pw-gauge"></div></div>
        <div class="pw-side">
          <div class="pw-alert" role="alert" hidden></div>
          <div class="pw-ctl">
            <div class="pw-bench" hidden>
              <ol class="pw-steps" aria-label="Steps for a bench power supply"></ol>
              <div class="slider-field"><label for="pwV">Supply voltage knob: <output>5.0 V</output> <span class="hint">shown on the supply's display</span></label>
                <input type="range" id="pwV" min="0" max="12" step="0.1" value="5"></div>
              ${chips("Common ground", [["1", "Supply − joined to ESP32 GND"], ["0", "Not joined"]], "0")}
              <div class="wf-row"><button type="button" class="btn" data-conn>Connect the supply</button></div>
            </div>
            ${chips("Multimeter probes", [["wiper", "Meter on the wiper"], ["supply", "Meter on the supply"]], "wiper")}
          </div>
          <div class="pw-status" aria-live="polite"></div>
        </div></div>`;
    const benchEl = $(".pw-bench", el), status = $(".pw-status", el), alertEl = $(".pw-alert", el), ctl = $(".pw-ctl", el);
    const connBtn = $("[data-conn]", el), vOut = $(".pw-bench output", el), stepsEl = $(".pw-steps", el), gauge = $(".pw-gauge", el);
    // The supply's own display reads 0.1 V low: only the meter shows the true voltage
    const actual = () => (S.src === "pin" ? 3.3 : S.set > 0 ? S.set + 0.1 : 0);
    const live = () => S.src === "pin" || S.conn;
    const note = (type, title, html) => `<div class="callout ${type}"><strong>${title}</strong>${html}</div>`;
    const html = (node, h) => { if (node.dataset.h !== h) { node.dataset.h = h; node.innerHTML = h; } };
    // The voltage on VP against the pin's limits: safe up to 3.3 V, at risk up to 3.6 V, damaged beyond
    const drawGauge = (v, on) => {
      const W = 520, X = (x) => 14 + (clamp(x, 0, 5) / 5) * (W - 28);
      return `<svg class="plot pw-g" viewBox="0 0 ${W} 64" role="img" aria-label="Voltage on VP: ${on ? f2(v) + " volts" : "nothing connected"}. Safe up to 3.3 volts, damaged above 3.6 volts.">
        ${T(14, 12, "Voltage on VP", "start", "axl")}${T(W - 14, 12, on ? `${f2(v)} V${v > 5 ? " (off the scale)" : ""}` : "not connected", "end", `axl g-v${v > 3.6 ? " bad" : v > 3.3 ? " hot" : ""}`)}
        <rect class="g-ok" x="${X(0)}" y="22" width="${X(3.3) - X(0)}" height="14"/><rect class="g-hot" x="${X(3.3)}" y="22" width="${X(3.6) - X(3.3)}" height="14"/><rect class="g-bad" x="${X(3.6)}" y="22" width="${X(5) - X(3.6)}" height="14"/>
        ${[0, 1, 2].map((x) => T(X(x), 52, x, "middle", "axis")).join("")}${T(X(3.3), 52, "3.3", "end", "axis")}${T(X(3.6) + 2, 52, "3.6", "start", "axis")}${T(X(5), 52, "5 V", "end", "axis")}
        ${on ? `<path class="tk-mk" d="M${f1(X(v))},20l-5,-7h10z"/><line class="tk-ml" x1="${f1(X(v))}" x2="${f1(X(v))}" y1="20" y2="38"/>` : ""}</svg>`;
    };
    let lastKey = "";
    const update = () => {
      const a = rig.st.angle, vs = actual(), bench = S.src === "bench", floating = bench && S.conn && !S.gnd, vw = live() ? vs * frac(a) : 0;
      const wasDead = S.dead;
      if (live() && !floating && vw > 3.6) S.dead = true;
      const hot = !S.dead && live() && !floating && vw > 3.3;
      if (bench && S.probe === "supply") S.saw = true;
      if (bench && S.conn && !floating && !S.dead) { S.lo = Math.min(S.lo, a); S.hi = Math.max(S.hi, a); }
      const key = [S.src, S.conn, S.gnd, S.dead, hot, S.probe].join();
      if (key !== lastKey) { lastKey = key; rig.set({ src: S.src, conn: S.conn, gnd: S.gnd, dead: S.dead, hot, probe: S.probe, setV: S.set, zap: S.dead && !wasDead }); }
      const count = S.dead ? "----" : !live() ? Math.round(Math.random() * 300) : floating ? Math.round(Math.random() * 4095) : readAdc(a, { vs });
      rig.upd({
        r1: !live() ? "VP: not connected" : floating ? "VP: no reference" : `VP = ${f2(vw)} V`, r2: S.dead ? "VP DAMAGED" : `ADC count: ${count}`,
        meter: `${f2(S.probe === "supply" ? vs : floating ? 0 : vw)} V`, meterOn: S.probe === "supply" ? (bench ? "supply + to −" : "3V3 to GND") : "wiper to GND", psu: `${f1(S.set)} V`, setV: S.set
      });
      benchEl.hidden = !bench;
      connBtn.textContent = S.conn ? "Disconnect the supply" : "Connect the supply";
      vOut.textContent = `${f1(S.set)} V`;
      html(gauge, drawGauge(vw, live() && !floating));
      // the five steps: each is ticked when done, and the first one still to do is highlighted
      const ok = [S.saw, S.saw && Math.abs(vs - 3.3) < 0.051, S.gnd, S.conn, S.conn && S.lo <= 10 && S.hi >= 170 && Math.abs(vs - 3.3) < 0.051], next = ok.indexOf(false);
      if (bench && next < 0) done("l1");
      html(stepsEl, PW_STEPS.map((t, i) => `<li class="${ok[i] ? "done" : i === next ? "now" : ""}"><span class="ps-n" aria-hidden="true">${ok[i] ? "✓" : i + 1}</span><span>${t}${ok[i] ? `<span class="vh"> (done)</span>` : ""}</span></li>`).join(""));
      // a damaged pin stops everything: the message and the way out go to the top of the panel
      alertEl.hidden = !S.dead; status.hidden = S.dead;
      ctl.classList.toggle("locked", S.dead); ctl.inert = S.dead;
      html(alertEl, S.dead ? `<p class="pa-h"><span aria-hidden="true">⚡</span> The VP Pin Is Damaged</p>
        <p>The wiper reached more than <strong>3.6 V</strong>, the most an ESP32 pin can take, so the ADC no longer gives a reading. A real pin may survive a short overvoltage, but you can't count on it: treat <strong>3.3 V</strong> as the limit.</p>
        <button type="button" class="btn" data-new>Replace the board and try again</button>` : "");
      html(status, S.dead ? "" : !bench
          ? note("info", "✓ Safe", `The 3V3 pin is always 3.3 V: the board's regulator makes it from the 5 V on the USB cable, so it can't be set wrong. The wiper is at ${f2(vw)} V.`)
        : !S.conn
          ? (S.probe === "supply"
            ? (Math.abs(vs - 3.3) < 0.051 ? note("info", "✓ The meter reads 3.30 V", `The supply is ready. Notice its own display shows ${f1(S.set)} V: displays can be a little off, so trust the meter.`)
              : vs > 3.3 ? note("warn", `The meter reads ${f2(vs)} V: too high`, `Turn the knob down until the <strong>meter</strong> reads 3.30 V. Don't connect it yet.`)
              : note("note", `The meter reads ${f2(vs)} V`, ` Turn the knob up until the <strong>meter</strong> reads 3.30 V.`))
            : note("note", "The supply is not connected", ` Somebody left it at ${f1(S.set)} V. Follow the five steps above. Or connect it as it is, turn the knob, and see what happens.`))
        : floating
          ? note("warn", "No common ground", `The supply's − terminal isn't joined to the ESP32's GND, so the ESP32 has nothing to measure the wiper voltage against. The count jumps about at random. Join the grounds.`)
        : hot
          ? note("warn", `Danger: the wiper is at ${f2(vw)} V`, `That is above 3.3 V. The ADC can't count any higher, so the reading is stuck at 4095. A little more (above 3.6 V) and the pin is damaged.`)
        : vs > 3.351
          ? note("warn", `The supply is at ${f2(vs)} V: too high`, `At this angle the wiper is only at ${f2(vw)} V, so nothing looks wrong yet. Turn the knob towards 180° and watch the marker climb.`)
        : vs < 3
          ? note("note", `The supply is at ${f2(vs)} V`, ` It works and it is safe, but the count now uses a smaller part of the ADC's range, so each degree is fewer counts. Use 3.30 V.`)
          : note("info", next < 0 ? "✓ All five steps done" : "✓ Safe", `The supply gives ${f2(vs)} V and its ground is joined to the ESP32's. The wiper is at ${f2(vw)} V, and the highest it can reach is ${f2(vs * frac(180))} V.`));
    };
    const fresh = () => { S.saw = S.probe === "supply"; S.lo = 180; S.hi = 0; };
    const vIn = $("#pwV", el), probeRow = $(row("Multimeter probes"), el);
    const setProbe = (v) => { S.probe = v; probeRow.querySelectorAll(".chip-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v)); update(); };
    const rig = makeRig($(".pw-rig", el), { state: { angle: 60, r1: "", r2: "", meter: "", psu: "", probe: "wiper", setV: S.set }, onAngle: () => update(),
      onSupply: (v) => { if (S.dead) return; S.set = v; vIn.value = v; update(); }, onProbe: (v) => { if (!S.dead) setProbe(v); },
      caption: "Drag the red pointer, turn the knob on the bench supply, and tap a dashed outline to put the meter there." });
    wireChips($(row("Supply for the potentiometer"), el), (v) => { S.src = v; S.conn = false; fresh(); update(); });
    wireChips($(row("Common ground"), el), (v) => { S.gnd = v === "1"; update(); });
    wireChips(probeRow, setProbe);
    vIn.addEventListener("input", () => { S.set = +vIn.value; update(); });
    connBtn.addEventListener("click", () => { S.conn = !S.conn; if (!S.conn) { S.lo = 180; S.hi = 0; } update(); });
    alertEl.addEventListener("click", (e) => {
      if (!e.target.closest("[data-new]")) return;
      S.dead = false; S.conn = false; fresh(); update();
      (S.src === "bench" ? connBtn : $(".chip-btn", el)).focus();
    });
    every(el, 700, update);
    update();
  }

  /* =====================================================================
     LESSON 2: from angle to number (the measurement chain, then the ADC itself)
     ===================================================================== */
  function chainSvg(angle) {
    const fr = frac(angle), v = 3.3 * fr, count = readAdc(angle, { quiet: true }), ang = BOOK.f(count);
    const bits = count.toString(2).padStart(12, "0").replace(/(.{4})/g, "$1 ").trim();
    const X = [10, 200, 390, 580], Wd = 170, kinds = ["Mechanical", "Electrical", "Digital", "Computational"];
    let s = "";
    X.forEach((x, i) => {
      s += `<rect class="ch-box" x="${x}" y="30" width="${Wd}" height="140" rx="10"/>` + T(x + Wd / 2, 22, kinds[i], "middle", "ch-k");
      if (i) s += `<path class="ch-arrow" d="M${x - 18},100h12"/><path class="ch-head" d="M${x - 8},94l7,6l-7,6z"/>`;
    });
    // 1. the angle
    const cx = 95, cy = 128, R = 62, p = (a, r) => [cx + r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];
    s += `<path class="prot" d="M${cx - R},${cy}A${R},${R} 0 0 1 ${cx + R},${cy}Z"/>`;
    for (let a = 0; a <= 180; a += 30) { const [x1, y1] = p(a, R - 8), [x2, y2] = p(a, R); s += `<line class="tick big" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`; }
    const [px, py] = p(angle, R - 4);
    s += `<line class="pointer" x1="${cx}" y1="${cy}" x2="${f1(px)}" y2="${f1(py)}"/><circle class="knob" cx="${cx}" cy="${cy}" r="7"/>` + T(cx, 156, `angle = ${Math.round(angle)}°`, "middle", "ch-v");
    // 2. the potentiometer as a voltage divider
    const wy = 150 - 100 * fr;
    s += `<rect class="ch-trk" x="232" y="50" width="12" height="100" rx="3"/><rect class="ch-fill" x="232" y="${f1(wy)}" width="12" height="${f1(150 - wy)}" rx="3"/>` +
      T(238, 44, "3.3 V", "middle", "ch-s") + T(238, 164, "GND", "middle", "ch-s");
    s += `<path class="ch-wip" d="M266,${f1(wy)}h-18m6,-5l-6,5l6,5"/>` + T(274, 86, "wiper voltage", "start", "ch-s") + T(274, 108, `${f2(v)} V`, "start", "ch-v") + T(274, 128, `3.3 V × ${f2(fr)}`, "start", "ch-s");
    // 3. the ADC
    s += T(475, 62, "ADC count", "middle", "ch-s") + T(475, 98, count, "middle", "ch-big") + T(475, 124, bits, "middle", "ch-bits") + T(475, 148, "12 bits: 0 to 4095", "middle", "ch-s");
    // 4. the program
    s += T(665, 62, "Angle = m × ADC + c", "middle", "ch-s") + T(665, 98, `${f1(ang)}°`, "middle", "ch-big") + T(665, 124, `m = ${num(BOOK.m, 4)}`, "middle", "ch-s") + T(665, 142, `c = ${num(BOOK.c, 4)}`, "middle", "ch-s");
    return `<svg class="scene chain" viewBox="0 0 760 178" role="img" aria-label="The measurement chain: the angle ${Math.round(angle)} degrees becomes a wiper voltage of ${f2(v)} volts, the ADC turns it into the count ${count}, and the program calculates ${f1(ang)} degrees.">${s}</svg>`;
  }
  function mountChain(el) {
    el.innerHTML = `<figure class="scene-box"><div class="scene-scroll"><div class="chain-host"></div></div>
        <figcaption>The four stages of the measurement, with live values as the knob turns.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
      <div class="pv-pl"></div><p class="small-note">The knob turns once from 0° to 180°. Press the replay button to see it again, or drag the slider to turn the knob yourself.</p><p class="pv-read"></p>
      <ol class="what chain-list">
        <li><strong>Mechanical.</strong> You turn the shaft: the quantity being measured is an angle.</li>
        <li><strong>Electrical.</strong> The potentiometer is a voltage divider. Its wiper slides along a resistive track, so the wiper voltage is a fraction of 3.3 V that depends on the angle. This is the <strong>transduction</strong>: a mechanical quantity becomes an electrical one.</li>
        <li><strong>Digital.</strong> The ESP32's analog-to-digital converter (ADC) measures the voltage on VP and gives a whole number from 0 to 4095. This is the <strong>conversion</strong>.</li>
        <li><strong>Computational.</strong> The program turns the count back into degrees with an equation. Finding that equation is the <strong>calibration</strong>, and it is what this lab is about.</li>
      </ol>`;
    const host = $(".chain-host", el), read = $(".pv-read", el);
    let seen = false; // not on the first, still drawing: only once the knob has been moved
    setTimeout(() => { seen = true; }, 1500);
    const draw = (t) => {
      host.innerHTML = chainSvg((t / 10) * 180);
      if (t >= 9.9 && seen) done("l2");
      read.innerHTML = `The ESP32 never sees the angle itself: it only gets the count, and has to work back to the angle.`;
    };
    player($(".pv-pl", el), el, { dur: 10, loop: false, draw, still: 4, label: "Knob position" });
  }

  // The ADC curve: the ideal straight line against what a typical ESP32 really reports
  function adcPlot(el, res, v) {
    if (!res) { el.innerHTML = ""; return; }
    const A = axes({ W: 520, H: 300, x: [0, 3.3], y: [0, 4095], xt: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.3], yt: [0, 1000, 2000, 3000, 4095], xl: "Voltage on VP (V)", yl: "ADC count", l: 56 });
    const ideal = [[A.X(0), A.Y(0)], [A.X(3.3), A.Y(4095)]], real = [];
    for (let i = 0; i <= 165; i++) { const x = (i / 165) * 3.3; real.push([A.X(x), A.Y(adcOf(x))]); }
    el.innerHTML = `<figure class="scene-box plot-box">${svg(A.W, A.H, `ADC count against voltage: the ideal straight line and a typical ESP32. At ${f2(v.Vin)} volts the ideal count is ${Math.round(res.ideal)} and the typical count is ${Math.round(res.real)}.`,
      A.s + poly(ideal, "trace-in") + poly(real, "trace-a") + dot(A.X(v.Vin), A.Y(res.real)))}
      <figcaption><span class="key input"></span> ideal ADC <span class="key"></span> a typical ESP32. The red dot is your voltage.</figcaption></figure>`;
  }

  function mountAdc(el) {
    el.innerHTML = fold("The ADC Explorer", `<p class="explain-p">The ESP32's ADC has 12 bits, so it reports one of 2<sup>12</sup> = 4096 numbers, from 0 to 4095, for a voltage from 0 to 3.3 V. An ideal ADC would follow <span class="formula">count = V<sub>in</sub> / 3.3 V × 4095</span></p>
        <p class="explain-p">Change the voltage and compare the ideal count with what a typical ESP32 reports.</p>
        <div class="slider-field adc-in"><label for="adcV">Voltage on VP: <output></output></label><input type="range" id="adcV" min="0.05" max="3.3" step="0.01" value="1.65"></div>
        <p class="result fold-result" aria-live="polite"></p><div class="adc-plot"></div>
        ${fold("Step-by-Step Working", `<ol class="steps"></ol>`)}`);
    const inp = $("#adcV", el), out = $(".adc-in output", el), panel = $("details", el);
    const draw = () => {
      const Vin = +inp.value, ideal = (Vin / 3.3) * 4095, real = adcOf(Vin), d = Math.round(real) - Math.round(ideal);
      out.textContent = `${f2(Vin)} V`;
      $(".result", el).textContent = `Ideal count ${Math.round(ideal)}. A typical ESP32 reports about ${Math.round(real)}.`;
      $(".steps", el).innerHTML = stepsHtml([
        step("The size of one count (the resolution)", "ΔV = 3.3 V / 4095", "3.3 / 4095", "ΔV = 0.000806 V = <strong>0.806 mV</strong>"),
        step("Ideal count", "count = V<sub>in</sub> / 3.3 V × 4095", `${f2(Vin)} / 3.3 × 4095`, `count = ${num(ideal, 5)} → <strong>${Math.round(ideal)}</strong>`),
        step("What a typical ESP32 reports", "", "from its measured curve (the solid line in the graph)", `count ≈ <strong>${Math.round(real)}</strong>, which is ${d === 0 ? "the same as the ideal" : `${Math.abs(d)} counts ${d < 0 ? "below" : "above"} the ideal`}`)
      ]);
      adcPlot($(".adc-plot", el), { ideal, real }, { Vin });
    };
    inp.addEventListener("input", draw);
    // a link to this section opens the panel
    document.addEventListener("click", (e) => { if (e.target.closest('a[href="#adc"]')) panel.open = true; });
    if (location.hash === "#adc") panel.open = true;
    draw();
  }

  /* =====================================================================
     LESSON 3: read the ADC count
     ===================================================================== */
  const readBlocks = () =>
    bk("root", "Setup", bk("var", `Declare ${bf("ADC")} as long Value ${bn(0)}`) + bk("print", `Serial begin baudrate ${bn(115200)}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("ADC")} to ${inl("pin", `Analog read PIN# ${bf("VP")}`)}`) +
      bk("print", `Print on new line ${inl("var", bf("ADC"))}`) +
      bk("delay", `Delay Ms ${bn(500)}`));
  const readCode = () => `${HEAD}
long ADC;

void setup()
{
ADC = 0;
Serial.begin(115200);
}

void loop()
{

    ADC = analogRead(36);          // VP is GPIO36: gives 0 to 4095
    Serial.println(ADC);
    delay(500);

}`;
  function mountReadBlocks(el) {
    el.innerHTML = blocksAndCode(readBlocks(), readCode(), "read_adc.ino (from TUNIOT)", "TUNIOT blocks: read the ADC count and print it") +
      `<ol class="what">
        <li><strong>Declare ADC as long.</strong> A whole-number variable to hold the count.</li>
        <li><strong>Serial begin 115200.</strong> Opens the link to the Serial Monitor. Set the Serial Monitor to the same baud rate.</li>
        <li><strong>set ADC to Analog read VP.</strong> Measures the voltage on VP (GPIO36) and stores the count, 0 to 4095.</li>
        <li><strong>Print on new line, then Delay 500 ms.</strong> Prints the count twice a second, slowly enough to read.</li>
      </ol>`;
  }
  function mountRead(el) {
    let swap = false;
    el.innerHTML = `${chips("Outer wires", [["0", "Wired as in Lesson 1"], ["1", "Outer wires swapped"]], "0")}
      <div class="task-sim"><div class="rd-rig"></div>
        <div class="task-side">${serialBox()}<p class="pv-read"></p></div></div>`;
    const log = logBox($(".serial", el)), read = $(".pv-read", el);
    let lo = 180, hi = 0;
    const tick = (print) => {
      const a = rig.st.angle, v = 3.3 * frac(a, swap), n = readAdc(a, { swap });
      lo = Math.min(lo, a); hi = Math.max(hi, a);
      if (hi - lo >= 120) done("l3");
      rig.upd({ r1: `VP = ${f2(v)} V`, r2: `ADC count: ${n}`, meter: `${f2(v)} V` });
      if (print) log.add(String(n));
      read.innerHTML = swap
        ? `With the two outer wires swapped, the count <strong>falls</strong> as the angle rises. Nothing is wrong: the calibration line just slopes the other way (m is negative). Decide on one wiring and keep it.`
        : `Turn the knob slowly from 0° to 180°: the count <strong>rises</strong> with the angle. Hold it still and the last digits still change a little. That is electrical noise, and every real ADC has some.`;
    };
    const rig = makeRig($(".rd-rig", el), { state: { r1: "", r2: "", meter: "" }, onAngle: () => tick(false) });
    wireChips($(".chips-row", el), (v) => { swap = v === "1"; log.clear(); tick(false); });
    every(el, 500, () => tick(true));
    tick(false);
  }

  /* =====================================================================
     LESSON 4: collect the calibration data (Table 1)
     ===================================================================== */
  function mountCollect(el) {
    let nAvg = 1;
    el.innerHTML = `<div class="task-sim"><div class="cl-rig"></div>
        <div class="task-side cl-side">
          ${chips("Readings per angle", [["1", "One reading"], ["5", "Average of 5 readings"]], "1")}
          <div class="wf-row"><button type="button" class="btn" data-rec>Record this angle</button><button type="button" class="btn ghost" data-clear>Clear the table</button></div>
          <p class="pv-read cl-read" aria-live="polite"></p>
          <div class="cal-box" tabindex="0" role="region" aria-label="Table 1: angle and ADC count"><table class="cal-table"><caption>Table 1: angle and ADC count</caption>
            <thead><tr><th scope="col">Angle (°)</th><th scope="col">ADC count</th><th scope="col"><span class="vh">Go to this angle</span></th></tr></thead><tbody></tbody></table></div>
        </div></div>`;
    const body = $("tbody", el), read = $(".cl-read", el), recBtn = $("[data-rec]", el);
    const count = () => ANGLES.filter((a) => CAL[a] !== undefined).length;
    const paint = (msg) => {
      const cur = rig.st.angle;
      body.innerHTML = ANGLES.map((a) => `<tr class="${a === cur ? "cur" : ""}"><th scope="row">${a}</th><td class="${CAL[a] === undefined ? "empty" : ""}">${CAL[a] === undefined ? "not recorded" : CAL[a]}</td>
        <td><button type="button" class="row-go" data-a="${a}" aria-label="Turn the knob to ${a} degrees">${a === cur ? "●" : "set"}</button></td></tr>`).join("");
      recBtn.textContent = CAL[cur] === undefined ? `Record ${cur}°` : `Record ${cur}° again`;
      if (count() === ANGLES.length) done("l4");
      read.innerHTML = (msg ? msg + " " : "") + (count() === ANGLES.length
        ? `<span class="ok-t">✓ Table 1 is complete: 19 readings.</span> Go on to <a href="#l5">Lesson 5</a>.`
        : `<strong>${count()} of ${ANGLES.length}</strong> angles recorded. The knob clicks round in 10° steps here.`);
    };
    const rig = makeRig($(".cl-rig", el), { snap: 10, state: { angle: 0, r1: "", r2: "" }, onAngle: () => { live(); paint(); },
      caption: "Set each angle from 0° to 180° in 10° steps, and record the count each time." });
    const live = () => { const a = rig.st.angle; rig.upd({ r1: `VP = ${f2(3.3 * frac(a))} V`, r2: `ADC count: ${readAdc(a)}` }); };
    wireChips($(".chips-row", el), (v) => { nAvg = +v; });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.a !== undefined) { rig.setAngle(+b.dataset.a); return; }
      if (b.hasAttribute("data-clear")) { CAL = {}; calChanged(); rig.setAngle(0, true); live(); paint("Table cleared."); return; }
      if (!b.hasAttribute("data-rec")) return;
      const a = rig.st.angle, xs = Array.from({ length: nAvg }, () => readAdc(a)), avg = Math.round(xs.reduce((s, x) => s + x, 0) / nAvg);
      CAL[a] = avg;
      calChanged();
      const msg = nAvg > 1 ? `${a}°: readings ${xs.join(", ")} → average <strong>${avg}</strong>.` : `${a}°: recorded <strong>${avg}</strong>.`;
      // move on to the next angle that has no reading yet
      const next = ANGLES.find((x) => x > a && CAL[x] === undefined);
      const any = next !== undefined ? next : ANGLES.find((x) => CAL[x] === undefined);
      if (any !== undefined) rig.setAngle(any, true);
      live(); paint(msg);
      const cur = $("tr.cur", body);
      if (cur && cur.scrollIntoView) { const boxEl = $(".cal-box", el); boxEl.scrollTop = Math.max(0, cur.offsetTop - boxEl.clientHeight / 2); }
    });
    every(el, 600, live);
    live(); paint();
  }

  /* =====================================================================
     LESSON 5: plot the graph and fit the straight line
     ===================================================================== */
  function mountFit(el) {
    const draw = () => {
      const pts = calPts();
      if (pts.length < 3) {
        el.innerHTML = `<div class="callout note"><strong>Table 1 needs at least 3 readings.</strong> You have ${pts.length}. Record them in <a href="#collect">Lesson 4</a>, and the graph appears here. All 19 give the best line.</div>`;
        return;
      }
      const fit = linFit(pts), R2 = r2(pts, fit.f), S = fit.sums;
      const errs = pts.map(([x, y]) => [y, fit.f(x) - y]), worst = errs.reduce((m, e) => (Math.abs(e[1]) > Math.abs(m[1]) ? e : m), errs[0]);
      // the calibration graph: X = ADC count (what the ESP32 knows), Y = angle (what it must work out)
      const A = axes({ W: 520, H: 320, x: [0, 4000], y: [-20, 200], xt: [0, 1000, 2000, 3000, 4000], yt: [0, 45, 90, 135, 180], xl: "ADC count (x)", yl: "Angle in degrees (y)", l: 56 });
      const x0 = (-20 - fit.c) / fit.m, x1 = (200 - fit.c) / fit.m, xa = clamp(Math.min(x0, x1), 0, 4000), xb = clamp(Math.max(x0, x1), 0, 4000);
      const graph = svg(A.W, A.H, `Calibration graph of angle against ADC count with ${pts.length} points and the best-fit line ${eqText(fit)}.`,
        A.s + poly([[A.X(xa), A.Y(fit.f(xa))], [A.X(xb), A.Y(fit.f(xb))]], "trace-a") + pts.map(([x, y]) => `<circle class="cal-pt" cx="${f1(A.X(x))}" cy="${f1(A.Y(y))}" r="4"/>`).join(""));
      // how far each point is from the line
      const lim = Math.max(2, Math.ceil(Math.abs(worst[1]))), B = axes({ W: 520, H: 200, x: [0, 180], y: [-lim, lim], xt: [0, 30, 60, 90, 120, 150, 180], yt: [-lim, 0, lim], xl: "True angle (°)", yl: "Error (°)", l: 56 });
      const resid = svg(B.W, B.H, `Error of the fitted line at each recorded angle. The largest is ${f1(worst[1])} degrees at ${worst[0]} degrees.`,
        B.s + `<line class="ref" x1="${B.X(0)}" x2="${B.X(180)}" y1="${B.Y(0)}" y2="${B.Y(0)}"/>` + errs.map(([a, e]) => `<line class="stem" x1="${f1(B.X(a))}" x2="${f1(B.X(a))}" y1="${f1(B.Y(0))}" y2="${f1(B.Y(e))}"/><circle class="cal-pt" cx="${f1(B.X(a))}" cy="${f1(B.Y(e))}" r="4"/>`).join(""));
      const den = S.n * S.Sxx - S.Sx * S.Sx, big = (x) => Math.round(x).toLocaleString("en");
      el.innerHTML = `<div class="fit-eq" aria-live="polite"><span class="fit-l">Your calibration equation</span><strong>${eqText(fit)}</strong>
          <span class="fit-s">m = ${num(fit.m, 5)} ° per count · c = ${num(fit.c, 4)}° · R² = ${R2.toFixed(4)} · ${pts.length} points</span></div>
        <div class="fit-grid">
          <figure class="scene-box plot-box">${graph}<figcaption>The calibration graph. Each dot is one row of Table 1, and the line is the best straight line through them.</figcaption></figure>
          <figure class="scene-box plot-box">${resid}<figcaption>How far the line is from each point (line − true angle). The largest error is ${num(worst[1], 2)}° at ${worst[0]}°.</figcaption></figure>
        </div>
        ${pts.length < ANGLES.length ? `<p class="small-note">Only ${pts.length} of 19 angles are recorded. Record the rest in <a href="#collect">Lesson 4</a> for a better line.</p>` : ""}
        ${fold("Step-by-Step Working: The Least-Squares Line", `<ol class="steps">${stepsHtml([
          step("Add up the columns of Table 1 (x = ADC count, y = angle)", "", `n = ${S.n}`, `Σx = ${big(S.Sx)}, Σy = ${big(S.Sy)}, Σxy = ${big(S.Sxy)}, Σx<sup>2</sup> = ${big(S.Sxx)}`),
          step("Slope", "m = (nΣxy − ΣxΣy) / (nΣx<sup>2</sup> − (Σx)<sup>2</sup>)", `(${S.n} × ${big(S.Sxy)} − ${big(S.Sx)} × ${big(S.Sy)}) / ${big(den)}`, `m = <strong>${num(fit.m, 5)}</strong> ° per count`),
          step("Intercept", "c = (Σy − mΣx) / n", `(${big(S.Sy)} − ${num(fit.m, 5)} × ${big(S.Sx)}) / ${S.n}`, `c = <strong>${num(fit.c, 4)}</strong>°`),
          step("The calibration equation", "Angle = m × ADC + c", "", `<strong>${eqText(fit)}</strong>`)
        ])}</ol><p class="small-note">A spreadsheet does this sum for you. It is shown so you know what the trendline means.</p>`)}
        ${fold("How to Do This in Excel", `<ol class="what">
          <li>Type Table 1 into two columns: <strong>ADC count</strong> in the first column and <strong>Angle</strong> in the second. The first column becomes the X axis.</li>
          <li>Select both columns, then choose <em>Insert → Scatter</em> (markers only, no joining lines).</li>
          <li>Click a point on the chart, then right-click and choose <em>Add Trendline</em>. Choose <strong>Linear</strong>.</li>
          <li>Tick <em>Display Equation on chart</em> and <em>Display R-squared value on chart</em>.</li>
          <li>Read m and c from the equation <code>y = mx + c</code>. Add axis titles with units, and a chart title.</li>
        </ol><p class="small-note">Excel may show only a few digits of m. Right-click the equation, choose <em>Format Trendline Label</em>, and set Number to 6 decimal places: with counts in the thousands, a rounded m gives a large error.</p>`)}`;
    };
    calListeners.push(draw);
    draw();
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && calPts().length === ANGLES.length) done("l5"); }, { threshold: 0.3 }).observe(el);
  }

  /* =====================================================================
     LESSON 6: use the equation in the program
     ===================================================================== */
  const mathBlock = (v) => inl("math", `${inl("math", `${bn(v ? cnum(v.m) : "m")} × ${bf("ADC")}`)} + ${bn(v ? cnum(v.c, 4) : "c")}`);
  const applyBlocks = (v) =>
    bk("root", "Setup", bk("var", `Declare ${bf("ADC")} as long Value ${bn(0)}`) + bk("var", `Declare ${bf("Angle")} as float Value ${bn(0)}`) + bk("print", `Serial begin baudrate ${bn(115200)}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("ADC")} to ${inl("pin", `Analog read PIN# ${bf("VP")}`)}`) +
      bk("var", `set ${bf("Angle")} to ${mathBlock(v)}`) +
      bk("print", `Print on new line ${inl("var", bf("Angle"))}`) +
      bk("delay", `Delay Ms ${bn(1000)}`));
  const applyCode = (v) => `${HEAD}
long ADC;
float Angle;

void setup()
{
ADC = 0;
Angle = 0;
Serial.begin(115200);
}

void loop()
{

    ADC = analogRead(36);
    Angle = ${eqC(v)};${v ? "" : "        // put your own m and c here"}
    Serial.println(Angle);
    delay(1000);

}`;
  function mountApply(el) {
    el.innerHTML = `<form class="mc-form" novalidate>
        <div class="mc-f"><label for="mcM">m <span class="hint">slope, ° per count</span></label><input id="mcM" type="number" step="any" inputmode="decimal" autocomplete="off"></div>
        <div class="mc-f"><label for="mcC">c <span class="hint">intercept, °</span></label><input id="mcC" type="number" step="any" inputmode="decimal" autocomplete="off"></div>
        <button type="button" class="btn ghost" data-mine>Use my equation from Lesson 5</button>
        <p class="mc-note" aria-live="polite"></p></form>
      <div class="ap-code"></div>
      <h4 class="sub-h">Try It: The Angle on the Serial Monitor</h4>
      <div class="task-sim"><div class="ap-rig"></div>
        <div class="task-side">${serialBox()}<p class="pv-read ap-read"></p></div></div>
      <h4 class="sub-h">How Good Is Your Calibration?</h4>
      <div class="ap-err"></div>`;
    const mIn = $("#mcM", el), cIn = $("#mcC", el), noteEl = $(".mc-note", el), codeEl = $(".ap-code", el), errEl = $(".ap-err", el), read = $(".ap-read", el);
    const log = logBox($(".serial", el));
    if (MC) { mIn.value = cnum(MC.m); cIn.value = cnum(MC.c, 4); }
    const paintCode = () => { codeEl.innerHTML = blocksAndCode(applyBlocks(MC), applyCode(MC), "angle_serial.ino (from TUNIOT)", "TUNIOT blocks: turn the ADC count into an angle"); };
    const paintErr = () => {
      if (!MC) { errEl.innerHTML = `<p class="small-note">Enter m and c above to see the error at each angle.</p>`; return; }
      const rows = [0, 30, 60, 90, 120, 150, 180].map((a) => { const n = readAdc(a, { quiet: true }), s = MC.m * n + MC.c; return [a, n, s, s - a]; });
      const worst = Math.max(...rows.map((r) => Math.abs(r[3])));
      if (worst <= 5) done("l6");
      errEl.innerHTML = `<div class="cal-box wide"><table class="cal-table"><caption>The displayed angle against the true angle</caption>
          <thead><tr><th scope="col">True angle (°)</th><th scope="col">ADC count</th><th scope="col">Displayed angle (°)</th><th scope="col">Error (°)</th></tr></thead>
          <tbody>${rows.map(([a, n, s, e]) => `<tr><th scope="row">${a}</th><td>${n}</td><td>${f1(s)}</td><td class="${Math.abs(e) > 5 ? "bad" : ""}">${num(Number(e.toFixed(1)), 3)}</td></tr>`).join("")}</tbody></table></div>
        <p class="pv-read">Error = displayed angle − true angle. The largest error is <strong>${f1(worst)}°</strong>. ${worst <= 5
          ? `<span class="ok-t">✓ Within ±5° everywhere.</span> The small errors that are left come from noise in the readings, and from the ADC not being a perfectly straight line.`
          : `<span class="warn-t">More than 5° somewhere.</span> Check m and c against Lesson 5: an m with too few digits, a missing minus sign or swapped values are the usual causes.`}</p>`;
    };
    const tick = (print) => {
      const a = rig.st.angle, n = readAdc(a), s = MC ? MC.m * n + MC.c : null;
      rig.upd({ r1: `ADC count: ${n}`, r2: s === null ? "Angle: no m, c yet" : `Angle: ${f1(s)}°` });
      if (print) log.add(s === null ? "(no equation yet)" : s.toFixed(2));
      read.innerHTML = s === null ? `Enter your m and c first. Then the program can turn each count into an angle.`
        : `The pointer is at <strong>${a}°</strong> and your program prints <strong>${f1(s)}°</strong>: an error of ${num(Number((s - a).toFixed(1)), 3)}°. Turn the knob and compare the two.`;
    };
    const readMc = () => {
      const m = mIn.value.trim() === "" ? NaN : Number(mIn.value), c = cIn.value.trim() === "" ? NaN : Number(cIn.value);
      if (!Number.isFinite(m) || !Number.isFinite(c)) { if (MC) setMc(null); noteEl.textContent = "Enter both m and c."; }
      else if (m === 0) { if (MC) setMc(null); noteEl.textContent = "m can't be 0: the angle would never change."; }
      else { setMc({ m, c }); noteEl.innerHTML = `Your program uses <strong>${eqText(MC)}</strong>.`; }
    };
    const rig = makeRig($(".ap-rig", el), { state: { angle: 90, r1: "", r2: "" }, onAngle: () => tick(false) });
    el.querySelector(".mc-form").addEventListener("submit", (e) => e.preventDefault());
    el.querySelector(".mc-form").addEventListener("input", readMc);
    $("[data-mine]", el).addEventListener("click", () => {
      const fit = myFit();
      if (!fit) { noteEl.innerHTML = `No equation yet: record at least 3 angles in <a href="#collect">Lesson 4</a> first.`; return; }
      mIn.value = cnum(fit.m); cIn.value = cnum(fit.c, 4);
      readMc();
    });
    mcListeners.push(() => { paintCode(); paintErr(); log.clear(); tick(false); });
    every(el, 1000, () => tick(true));
    noteEl.innerHTML = MC ? `Your program uses <strong>${eqText(MC)}</strong>.` : "Type the m and c you found, or use the button.";
    paintCode(); paintErr(); tick(false);
  }

  /* =====================================================================
     LESSON 7: display the angle wirelessly (Bluetooth, then a web page)
     ===================================================================== */
  const tried = {};
  const noMc = () => (MC ? "" : `<p class="small-note">You haven't entered m and c in <a href="#apply">Lesson 6</a> yet, so this page uses the simulation's own line for now.</p>`);
  const btBlocks = () =>
    bk("root", "Setup", bk("var", `Declare ${bf("ADC")} as long Value ${bn(0)}`) + bk("var", `Declare ${bf("Angle")} as float Value ${bn(0)}`) +
      bk("bt", `Start Internal Bluetooth<br>Name ${bs(esc(btName()))}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("ADC")} to ${inl("pin", `Analog read PIN# ${bf("VP")}`)}`) +
      bk("var", `set ${bf("Angle")} to ${mathBlock(MC)}`) +
      bk("bt", `SerialBT print on new line ${inl("var", bf("Angle"))}`) +
      bk("delay", `Delay Ms ${bn(1000)}`));
  const btCode = () => `${HEAD}#include "BluetoothSerial.h"

long ADC;
float Angle;
BluetoothSerial SerialBT;

void setup()
{
ADC = 0;
Angle = 0;
SerialBT.begin("${btName()}");
}

void loop()
{

    ADC = analogRead(36);
    Angle = ${eqC(MC)};
    SerialBT.println(Angle);
    delay(1000);

}`;
  const AI_ANGLE = () => bk("ai-ev", `when ${bf("Clock1")} .Timer`,
    bk("ai-ctl", `if ${inl("ai-call", `${inl("ai-get", `${bf("BluetoothClient1")} . ${bf("IsConnected")}`)} and ${inl("ai-get", `${bf("BluetoothClient1")} . ${bf("BytesAvailableToReceive")}`)} &gt; ${bn(0)}`)}`,
      bk("ai-set", `then set ${bf("Label_Angle")} . ${bf("Text")} to ${inl("ai-text", `join “ Angle: ” ${inl("ai-text", `trim ${inl("ai-call", `call ${bf("BluetoothClient1")} .ReceiveText<br>numberOfBytes ${bn(-1)}`)}`)} “ ° ”`)}`)));

  function mountBt(el) {
    let connected = false, list = false, status = "Not Connected", label = "Angle: --";
    el.innerHTML = `<div class="sw-blocks"></div>
      <h4 class="sub-h">The Phone App</h4>
      <p class="explain-p">Use a Bluetooth terminal app to see the numbers arrive, or extend your Lab 1 app: add a label <code>Label_Angle</code> and a <strong>Clock</strong> (TimerInterval 200 ms), set <code>BluetoothClient1</code>'s <strong>DelimiterByte to 10</strong>, and add this block. It works the same way as the switch monitor in <a href="lab-1.html#t82">Lab 1, Lesson 5</a>.</p>
      ${ws(AI_ANGLE(), "App Inventor block that receives the angle and shows it in a label")}
      <h4 class="sub-h">Try It: The Angle on a Phone via Bluetooth</h4>
      <div class="sim-grid"><div class="sim-phone">${phoneFrame("Phone app")}</div>
        <div class="sim-side"><div class="bt-rig"></div><div class="mc-warn"></div><p class="pv-read bt-read"></p></div></div>`;
    const screen = $(".ph-screen", el), read = $(".bt-read", el);
    const blocks = () => { $(".sw-blocks", el).innerHTML = blocksAndCode(btBlocks(), btCode(), "angle_bluetooth.ino (from TUNIOT)", "TUNIOT blocks: send the angle by Bluetooth"); $(".mc-warn", el).innerHTML = noMc(); };
    const render = () => {
      const lst = list ? `<div class="ai-list" role="dialog" aria-label="Choose a device"><p class="ai-list-h">Choose a device</p><button type="button" class="ai-li" data-pick="esp">${esc(MAC)} ${esc(btName())}</button><button type="button" class="ai-li cancel" data-pick="">Cancel</button></div>` : "";
      screen.innerHTML = `<div class="ai-app"><div class="app-bar ai">Screen1</div><div class="ai-body">
          <div class="ai-title">Angle Monitor</div>
          <div class="ai-row"><button type="button" class="ai-btn blue" data-c="pick">Connect Bluetooth</button><span class="ai-status">${esc(status)}</span></div>
          <div class="ai-switch ai-angle${connected ? " on" : ""}" aria-live="off">${esc(label)}</div>
          <div class="ai-by">Created by ${esc(who())}</div></div>${lst}</div>`;
    };
    const rig = makeRig($(".bt-rig", el), { state: { angle: 45, r1: "", r2: "" } });
    const tick = (send) => {
      const n = readAdc(rig.st.angle), s = shown(n);
      rig.upd({ r1: `ADC count: ${n}`, r2: `Sends: ${s.toFixed(2)}` });
      if (send && connected && !list) { label = `Angle: ${s.toFixed(2)} °`; const l = $(".ai-angle", screen); if (l) l.textContent = label; }
    };
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || !screen.contains(b)) return;
      if (b.dataset.c === "pick") { list = true; render(); const f = $(".ai-li", screen); if (f) f.focus(); }
      else if (b.dataset.pick !== undefined) {
        list = false;
        if (!b.dataset.pick) { render(); return; }
        status = "Connecting…"; render(); await sleep(800);
        connected = true; status = "BT is now connected"; render();
        tried.bt = 1; if (tried.web) done("l7");
        read.innerHTML = `Connected. A new angle arrives every second (the <em>Delay 1000</em> block). Turn the knob and watch the phone follow.`;
      }
    });
    ME.on(() => { blocks(); render(); });
    mcListeners.push(blocks);
    every(el, 1000, () => tick(true));
    blocks(); render(); tick(false);
    read.innerHTML = `Tap <strong>Connect Bluetooth</strong> on the phone and choose your ESP32. Bluetooth Classic needs an Android phone, as in Lab 1.`;
  }

  const webBlocks = () =>
    bk("root", "Setup", bk("var", `Declare ${bf("ADC")} as long Value ${bn(0)}`) + bk("var", `Declare ${bf("Angle")} as float Value ${bn(0)}`) +
      bk("print", `Serial begin baudrate ${bn(115200)}`) + bk("wifi", `Connect Network ssid ${bs(esc(hotspot()))} password ${bs("Password")}`) +
      bk("print", `Print on new line ${inl("wifi", "Local IP")}`) + bk("wifi", `Start Server Port ${bn(80)}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("ADC")} to ${inl("pin", `Analog read PIN# ${bf("VP")}`)}`) +
      bk("var", `set ${bf("Angle")} to ${mathBlock(MC)}`) +
      bk("wifi", "Wait Connection") + bk("wifi", "client flush") +
      bk("wbk", "Answer Web page",
        bk("wbk", `Head ${inl("wbk", `Web page HTML ${bs("&lt;meta http-equiv='refresh' content='1'&gt;&lt;title&gt;Angle Monitor&lt;/title&gt;")}`)}`) +
        bk("wbk", `Body ${inl("wbk", `Heading ${bf("1")} Text ${bs("Angle Monitor")}`)}`) +
        bk("wbk", `${inl("wbk", `Heading ${bf("2")} Text ${inl("var", `join ${bs("Angle: ")} ${bf("Angle")} ${bs(" deg")}`)}`)}`)));
  const webCode = () => `${HEAD}#include <WiFi.h>

long ADC;
float Angle;
WiFiServer server(80);
WiFiClient client;

void setup()
{
ADC = 0;
Angle = 0;
Serial.begin(115200);
  WiFi.disconnect();
  delay(1000);
  WiFi.begin("${hotspot()}","Password");      // your phone's hotspot
  while ((!(WiFi.status() == WL_CONNECTED))){
    delay(1000);
    Serial.println("Waiting for an IP address");
  }
  Serial.println("Obtained an IP address");
  Serial.println((WiFi.localIP()));
  server.begin();
}

void loop()
{
    ADC = analogRead(36);               // read the sensor first, every loop
    Angle = ${eqC(MC)};
    client = server.available();
    if (!client) { return; }
    while(!client.available()){  delay(1); }
    client.flush();
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: text/html");
    client.println("");
    client.println("<!DOCTYPE HTML>");
    client.println("<html>");
    client.println("<head>");
    client.println("<meta http-equiv='refresh' content='1'><title>Angle Monitor</title>");
    client.println("</head>");
    client.println("<body>");
    client.println("<h1>Angle Monitor</h1>");
    client.println("<h2>Angle: " + String(Angle) + " deg</h2>");
    client.println("</body>");
    client.println("</html>");
    client.stop();
    delay(1);
}`;
  function mountWeb(el) {
    let loaded = false, auto = true, loads = 0, page = 0;
    el.innerHTML = `<div class="sw-blocks"></div>
      <h4 class="sub-h">Try It: The Angle on a Web Page</h4>
      <div class="sim-grid"><div class="sim-phone">${phoneFrame("Phone web browser")}</div>
        <div class="sim-side"><div class="wb-rig"></div>
          ${chips("Auto refresh", [["1", "With the refresh tag"], ["0", "Without it"]], "1")}
          ${serialBox()}<div class="mc-warn"></div><p class="pv-read wb-read"></p></div></div>`;
    const screen = $(".ph-screen", el), read = $(".wb-read", el), log = logBox($(".serial", el));
    const boot = () => { log.clear(); ["Waiting for an IP address", "Obtained an IP address", IP].forEach((x) => log.add(x)); };
    const blocks = () => { $(".sw-blocks", el).innerHTML = blocksAndCode(webBlocks(), webCode(), "angle_web.ino (from TUNIOT)", "TUNIOT blocks: show the angle on a web page"); $(".mc-warn", el).innerHTML = noMc(); };
    screen.innerHTML = `<form class="br-bar ph" data-go><input type="text" inputmode="url" aria-label="Address" autocomplete="off" autocapitalize="off" spellcheck="false" value="${IP}"><button type="submit" class="go-b">Go</button></form><div class="br-view"></div>`;
    const view = $(".br-view", screen);
    // Only the page area changes, so typing in the address bar is never interrupted
    const render = () => {
      view.innerHTML = loaded
        ? `<div class="web"><h1>Angle Monitor</h1><h2>Angle: ${page.toFixed(2)} deg</h2><p class="web-note">Page loaded ${loads} time${loads === 1 ? "" : "s"}</p></div>`
        : `<div class="web blank"><p>Join the phone to the hotspot, type the ESP32's IP address, then tap Go.</p></div>`;
    };
    const rig = makeRig($(".wb-rig", el), { state: { angle: 120, r1: "", r2: "" } });
    const tick = () => { const n = readAdc(rig.st.angle); rig.upd({ r1: `ADC count: ${n}`, r2: `Angle: ${f1(shown(n))}°` }); return shown(n); };
    const load = () => { loads++; page = tick(); loaded = true; render(); tried.web = 1; if (tried.bt) done("l7"); };
    every(el, 1000, () => { if (loaded && auto) load(); else tick(); });
    el.addEventListener("submit", (e) => {
      if (!e.target.matches("[data-go]")) return;
      e.preventDefault();
      const url = e.target.querySelector("input").value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
      if (url !== IP) { loaded = false; render(); read.innerHTML = `No device at <code>${esc(url || "(blank)")}</code>. The Serial Monitor shows <strong>${IP}</strong>.`; return; }
      load();
      read.innerHTML = auto ? `The page reloads itself every second, so turn the knob and watch the angle follow.` : `Without the refresh tag the page only changes when you tap Go again.`;
    });
    wireChips($(".chips-row", el), (v) => {
      auto = v === "1";
      read.innerHTML = auto ? `With <code>&lt;meta http-equiv='refresh' content='1'&gt;</code> the browser asks for the page again every second, so it keeps up with the knob.`
        : `Without the tag the browser keeps showing the page from the last time it loaded. Turn the knob: the page doesn't change until you tap Go.`;
    });
    ME.on(blocks);
    mcListeners.push(blocks);
    blocks(); boot(); render(); tick();
    read.innerHTML = `The ESP32 has joined your hotspot and printed its IP address. Tap <strong>Go</strong> in the phone's browser, then turn the knob.`;
  }

  /* =====================================================================
     LAB TASK: the brief, a rehearsal bench and the printable plan
     ===================================================================== */
  const TASK_KEY = "nmk-lab2-task", PLAN_KEY = "nmk-lab2-plan";
  const PLAN = Object.assign({ power: "", wireless: "", notes: "" }, store.get(PLAN_KEY, {})), planListeners = [];
  const planChanged = () => { store.set(PLAN_KEY, PLAN); planListeners.forEach((f) => f()); };
  function mountTask(el) {
    const V = Object.assign({ lo: 50, hi: 100, on: 300, off: 300 }, store.get(TASK_KEY, {}));
    let mode = PLAN.wireless === "wifi" ? "wifi" : "bt";
    el.innerHTML = `<div class="demo-grid">
        <div class="task-card wide"><h4>Requirements</h4><ol>
          <li><strong>Calibrate</strong> your own potentiometer on the real hardware: your own Table 1, graph and equation.</li>
          <li><strong>Display</strong> the calibrated angle on the Serial Monitor and on <strong>one</strong> wireless display of your choice: a phone app via Bluetooth (<code>ESP32_YourName</code>), or a web page through your hotspot (<code>YourName_wifi</code>). The wireless display shows the <strong>angle</strong> and the <strong>LED status</strong>.</li>
          <li><strong>Warning LED.</strong> On the lab day your lecturer gives your group an <strong>angle range</strong>, for example 50° to 100°. While the angle is inside the range, the LED on GPIO32 stays off. When the angle is <strong>below the lower limit or above the upper limit</strong>, the LED blinks.</li>
          <li><strong>You choose</strong> the blink on-time and off-time, and say why.</li>
          <li><strong>Accuracy.</strong> At three angles your lecturer picks, the displayed angle is within <strong>±5°</strong> of the protractor.</li></ol></div>
        <div class="task-card"><h4>At the Demo, Be Ready To</h4><ol>
          <li>show every requirement working on your own board and phone;</li>
          <li>change the angle range on the spot when your lecturer asks, and upload it in a few minutes;</li>
          <li>answer two short questions, for example what m and c mean, or where your errors come from.</li></ol></div>
        <div class="task-card"><h4>What to Submit</h4><ol>
          <li>your calibration table (angle and ADC count);</li>
          <li>your graph, with the fitted equation on it;</li>
          <li>a short reflection on the accuracy you reached and the sources of error.</li></ol></div>
      </div>
      <h4 class="sub-h">Rehearse It: What the Finished Task Should Do</h4>
      <p class="explain-p">Type any range and blink times, choose your wireless display, then turn the knob. This bench shows the <strong>behaviour</strong> you have to build. The blocks are for you to work out.</p>
      <form class="mc-form tk-form" novalidate>
        <div class="mc-f"><label for="tkLo">Lower limit <span class="hint">°</span></label><input id="tkLo" type="number" min="0" max="180" step="1" inputmode="numeric" value="${V.lo}"></div>
        <div class="mc-f"><label for="tkHi">Upper limit <span class="hint">°</span></label><input id="tkHi" type="number" min="0" max="180" step="1" inputmode="numeric" value="${V.hi}"></div>
        <div class="mc-f"><label for="tkOn">LED on-time <span class="hint">ms</span></label><input id="tkOn" type="number" min="50" max="5000" step="50" inputmode="numeric" value="${V.on}"></div>
        <div class="mc-f"><label for="tkOff">LED off-time <span class="hint">ms</span></label><input id="tkOff" type="number" min="50" max="5000" step="50" inputmode="numeric" value="${V.off}"></div>
        <p class="mc-note" aria-live="polite"></p></form>
      ${chips("Wireless display", [["bt", "Phone app via Bluetooth"], ["wifi", "Web page via Wi-Fi"]], mode)}
      <div class="sim-grid"><div class="sim-phone">${phoneFrame("Your wireless display")}</div>
        <div class="sim-side"><div class="tk-rig"></div><div class="tk-band"></div><p class="pv-read tk-read" aria-live="polite"></p><div class="mc-warn"></div></div></div>`;
    const noteEl = $(".tk-form .mc-note", el), read = $(".tk-read", el), band = $(".tk-band", el), screen = $(".ph-screen", el), modeRow = $(row("Wireless display"), el);
    let ok = true, lastState = "";
    const rig = makeRig($(".tk-rig", el), { state: { angle: 75, r1: "", r2: "", led: false } });
    const readForm = () => {
      const g = (id) => Number($(id, el).value);
      const lo = g("#tkLo"), hi = g("#tkHi"), on = g("#tkOn"), off = g("#tkOff");
      ok = false;
      if (![lo, hi, on, off].every(Number.isFinite)) noteEl.textContent = "Enter a number in every box.";
      else if (lo < 0 || hi > 180 || lo >= hi) noteEl.textContent = "The lower limit must be less than the upper limit, and both between 0° and 180°.";
      else if (on < 50 || off < 50 || on > 5000 || off > 5000) noteEl.textContent = "Keep the blink times between 50 ms and 5000 ms.";
      else { ok = true; Object.assign(V, { lo, hi, on, off }); store.set(TASK_KEY, V); noteEl.innerHTML = `One blink takes ${V.on + V.off} ms: about <strong>${num(1000 / (V.on + V.off), 3)}</strong> blinks a second.`; }
      lastState = ""; paintBand();
    };
    // a 0° to 180° bar: the safe range in teal, the warning zones in amber, and a marker at the displayed angle
    const paintBand = (s) => {
      const W = 300, X = (a) => 18 + (clamp(a, 0, 180) / 180) * (W - 36);
      band.innerHTML = `<svg class="plot tk-svg" viewBox="0 0 ${W} 58" role="img" aria-label="Angle range: the LED blinks below ${V.lo} degrees and above ${V.hi} degrees.">
        <rect class="tk-warn" x="${X(0)}" y="14" width="${X(180) - X(0)}" height="16" rx="4"/><rect class="tk-ok" x="${X(V.lo)}" y="14" width="${X(V.hi) - X(V.lo)}" height="16"/>
        ${[0, V.lo, V.hi, 180].map((a) => T(f1(X(a)), 46, a + "°", "middle", "axis")).join("")}
        ${s === undefined ? "" : `<path class="tk-mk" d="M${f1(X(s))},10l-5,-8h10z"/><line class="tk-ml" x1="${f1(X(s))}" x2="${f1(X(s))}" y1="10" y2="32"/>`}</svg>`;
    };
    // the phone: an app screen (Bluetooth) or a browser page (Wi-Fi), already connected and showing live values
    const paintPhone = () => {
      screen.innerHTML = mode === "bt"
        ? `<div class="ai-app"><div class="app-bar ai">Screen1</div><div class="ai-body">
            <div class="ai-title">Angle Monitor</div><div class="ai-status">BT is now connected</div>
            <div class="ai-switch ai-angle on"><span class="tk-ang"></span></div><div class="ai-switch tk-st"><span class="tk-led"></span></div>
            <div class="ai-by">Created by ${esc(who())}</div></div></div>`
        : `<div class="br-bar ph"><span class="br-url">${IP}</span></div>
           <div class="br-view"><div class="web"><h1>Angle Monitor</h1><h2 class="tk-ang"></h2><h2 class="tk-st"><span class="tk-led"></span></h2><p class="web-note">This page reloads every second.</p></div></div>`;
      phoneTxt = "";
    };
    let phoneTxt = "";
    const setPhone = (s, out) => {
      const a = mode === "bt" ? `Angle: ${s.toFixed(1)} °` : `Angle: ${s.toFixed(1)} deg`, t = a + out;
      if (t === phoneTxt) return;
      phoneTxt = t;
      const ang = $(".tk-ang", screen), led = $(".tk-led", screen), st = $(".tk-st", screen);
      if (!ang) return;
      ang.textContent = a; led.textContent = `LED status: ${out ? "BLINKING" : "OFF"}`; st.classList.toggle("warn", out);
    };
    let n = readAdc(rig.st.angle), slow = 0;
    every(el, 50, () => {
      const beat = ++slow % 6 === 0; // the program reads the sensor a few times a second
      if (beat) n = readAdc(rig.st.angle);
      const s = shown(n), out = ok && (s < V.lo || s > V.hi), led = out && Date.now() % (V.on + V.off) < V.on;
      rig.upd({ r1: `Angle: ${f1(s)}°`, r2: !ok ? "check the values" : out ? "LED: blinking" : "LED: off", led });
      if (mode === "bt" ? beat : slow % 20 === 0 || !phoneTxt) setPhone(s, out); // the app follows at once, the web page once a second
      const state = `${out}|${Math.round(s)}`;
      if (state === lastState) return;
      lastState = state; paintBand(s);
      read.innerHTML = !ok ? "Fix the values above." : out
        ? `<span class="warn-t">Outside the range.</span> The displayed angle ${f1(s)}° is ${s < V.lo ? `below ${V.lo}°` : `above ${V.hi}°`}, so the LED blinks (${V.on} ms on, ${V.off} ms off) and the ${mode === "bt" ? "app" : "web page"} reports it.`
        : `<span class="ok-t">Inside the range.</span> ${f1(s)}° is between ${V.lo}° and ${V.hi}°, so the LED stays off.`;
    });
    el.querySelector(".tk-form").addEventListener("submit", (e) => e.preventDefault());
    el.querySelector(".tk-form").addEventListener("input", readForm);
    const setMode = (v) => { mode = v; modeRow.querySelectorAll(".chip-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v)); paintPhone(); lastState = ""; };
    wireChips(modeRow, (v) => { setMode(v); PLAN.wireless = v; planChanged(); });
    planListeners.push(() => { if (PLAN.wireless && PLAN.wireless !== mode) setMode(PLAN.wireless); });
    ME.on(paintPhone);
    const warn = () => { $(".mc-warn", el).innerHTML = noMc(); };
    mcListeners.push(warn);
    warn(); paintPhone(); readForm();
  }

  // My Lab Plan: what the student decides before the lab, with the simulation's results, on one printed page.
  function mountPlan(el) {
    const P = PLAN;
    const radio = (name, v, label) => `<label class="pl-opt"><input type="radio" name="${name}" value="${v}"${P[name] === v ? " checked" : ""}><span>${label}</span></label>`;
    el.innerHTML = `<div class="plan">
        <div class="plan-card"><h4>1. How Will You Power the Potentiometer?</h4>
          <div class="pl-opts">${radio("power", "pin", "The ESP32's 3V3 pin")}${radio("power", "bench", "A bench power supply set to 3.3 V")}</div></div>
        <div class="plan-card"><h4>2. Which Wireless Display Will You Build?</h4>
          <div class="pl-opts">${radio("wireless", "bt", "A phone app via Bluetooth")}${radio("wireless", "wifi", "A web page through my hotspot")}</div></div>
        <div class="plan-card wide"><h4>3. Your Plan for the Warning LED</h4>
          <label for="planNotes">Write the steps your program will follow, in your own words or as a flowchart in text.</label>
          <textarea id="planNotes" rows="5" maxlength="900" placeholder="e.g. 1. Read the count. 2. Work out the angle. 3. …">${esc(P.notes)}</textarea></div>
        <div class="plan-card wide"><h4>4. From the Simulation</h4><div class="plan-sim" aria-live="polite"></div></div>
      </div>
      <div class="wf-row"><button type="button" class="btn" data-print>Print my plan</button><span class="small-note">One page, with a blank column for the counts you measure in the lab. Saved on this device only.</span></div>`;
    const sim = $(".plan-sim", el);
    const paint = () => {
      const fit = myFit(), n = calPts().length;
      sim.innerHTML = `<ul class="plan-list">
        <li>${n === ANGLES.length ? "✓" : "○"} Table 1: <strong>${n} of 19</strong> angles recorded${n < ANGLES.length ? ` (<a href="#collect">Lesson 4</a>)` : ""}</li>
        <li>${fit ? "✓" : "○"} Fitted equation: <strong>${fit ? eqText(fit) : "not yet"}</strong>${fit ? "" : ` (<a href="#fit">Lesson 5</a>)`}</li>
        <li>${MC ? "✓" : "○"} Equation in the program: <strong>${MC ? eqText(MC) : "not yet"}</strong>${MC ? "" : ` (<a href="#apply">Lesson 6</a>)`}</li></ul>
        <p class="small-note">These numbers belong to this page's virtual sensor. Your real potentiometer will give different ones: that is why you calibrate it yourself in the lab.</p>`;
    };
    el.addEventListener("input", (e) => {
      if (e.target.name === "power" || e.target.name === "wireless") P[e.target.name] = e.target.value;
      if (e.target.id === "planNotes") P.notes = e.target.value;
      planChanged();
    });
    planListeners.push(() => { el.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = P[r.name] === r.value; }); });
    $("[data-print]", el).addEventListener("click", () => printPlan(P));
    calListeners.push(paint); mcListeners.push(paint);
    paint();
  }
  function printPlan(P) {
    const fit = myFit(), task = store.get(TASK_KEY, null), tick = (on) => (on ? "☑" : "☐");
    const half = (list) => `<table><thead><tr><th>Angle (°)</th><th>Simulation count</th><th>Lab count</th></tr></thead><tbody>${list.map((a) => `<tr><td>${a}</td><td>${CAL[a] === undefined ? "" : CAL[a]}</td><td></td></tr>`).join("")}</tbody></table>`;
    let sheet = $("#printSheet");
    if (!sheet) { sheet = document.createElement("div"); sheet.id = "printSheet"; document.body.appendChild(sheet); }
    sheet.innerHTML = `<h1>NMK42003 Lab 2: My Lab Plan</h1>
      <p class="ps-meta">Name or group: <strong>${esc(who() === "YourName" ? "________________" : who())}</strong> &nbsp; Date of lab: ______________ &nbsp; Bluetooth name: ${esc(btName())} &nbsp; Hotspot: ${esc(hotspot())}</p>
      <h2>1. Power and Wiring</h2>
      <p>${tick(P.power === "pin")} ESP32 3V3 pin &nbsp; ${tick(P.power === "bench")} Bench power supply, set to 3.3 V and checked with the multimeter before connecting</p>
      <p>☐ Outer pin to 3.3 V &nbsp; ☐ Other outer pin to GND &nbsp; ☐ Wiper to VP (GPIO36) &nbsp; ☐ Supply − joined to ESP32 GND &nbsp; ☐ Protractor and potentiometer fixed</p>
      <h2>2. Table 1: Angle and ADC Count</h2>
      <div class="ps-two">${half(ANGLES.slice(0, 10))}${half(ANGLES.slice(10))}</div>
      <h2>3. Calibration Equation (Angle = m × ADC + c)</h2>
      <p>Simulation: ${fit ? eqText(fit) : "not fitted yet"}</p>
      <p>Lab: m = ______________ &nbsp; c = ______________ &nbsp; R² = ____________</p>
      <h2>4. Lab Task: Warning LED on GPIO32</h2>
      <p>Assigned range: ________° to ________° &nbsp; (the LED blinks below the lower limit and above the upper limit)</p>
      <p>Blink on-time: ${task ? task.on : "____"} ms &nbsp; off-time: ${task ? task.off : "____"} ms &nbsp; Wireless display: ${tick(P.wireless === "bt")} Bluetooth app &nbsp; ${tick(P.wireless === "wifi")} Web page</p>
      <p class="ps-h">My plan for the program:</p>
      <div class="ps-notes">${esc(P.notes || "")}</div>
      <h2>5. Accuracy Check at the Demo</h2>
      <table class="ps-acc"><thead><tr><th>Angle asked (°)</th><th>Displayed (°)</th><th>Error (°)</th><th>Within ±5°?</th></tr></thead><tbody>${"<tr><td></td><td></td><td></td><td></td></tr>".repeat(3)}</tbody></table>`;
    document.documentElement.classList.add("print-plan");
    const done = () => { document.documentElement.classList.remove("print-plan"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done);
    window.print();
  }

  /* =====================================================================
     Sections
     ===================================================================== */
  const sections = [
    { id: "equipment", group: "kit", title: "Equipment and Software", toc: "Equipment",
      intro: `<p>Tick each item as you get it ready. You also need the Arduino IDE with ESP32 board support, and the basic ESP32 circuit from <a href="lab-1.html#basic">Lab 1</a>.</p>`,
      mount: LabKit.kit("nmk-lab2-kit", KIT, SOFT) },
    { id: "flow", group: "kit", title: "The Lab at a Glance", toc: "At a Glance",
      intro: `<p>You turn a potentiometer into an <strong>angle sensor</strong>. The work goes in this order, and each lesson below is one stage. Tap a stage to jump to it.</p>`,
      mount: mountFlow },

    { id: "wiring", group: "l1", title: "Wire the Potentiometer", toc: "Wiring",
      intro: `<p>A potentiometer has three pins. The two outer pins are the ends of a resistive track, and the middle pin is the <strong>wiper</strong>, which slides along the track as you turn the shaft. Play the animation to see the three connections.</p>`,
      mount: mountWiring,
      after: `<div class="callout warn"><strong>3.3 V only</strong>An ESP32 input pin must never see more than 3.3 V. Power the potentiometer from 3.3 V, never from 5 V or the VIN pin.</div>` },
    { id: "power", group: "l1", title: "Choose the Supply and Test It", toc: "Power It Safely",
      intro: `<p>The ESP32 itself is powered by the USB cable, as in Lab 1. The potentiometer needs its own 3.3 V, and you can get it in two ways:</p>
        <ul class="what"><li><strong>The ESP32's 3V3 pin.</strong> The simplest way: nothing to set.</li>
        <li><strong>A bench power supply.</strong> Set it to 3.3 V, check it with the multimeter <em>before</em> you connect it, and join its − terminal to the ESP32's GND.</li></ul>
        <p>Try both here. With the bench supply, follow the five steps, then break the rules on purpose: leave the voltage too high, or leave the grounds apart. Nothing real can break on this page.</p>`,
      mount: mountPower },

    { id: "chain", group: "l2", title: "The Measurement Chain", toc: "The Chain",
      intro: `<p>Between the knob and the number on your screen, the measurement changes form three times.</p>`,
      mount: mountChain },
    { id: "adc", group: "l2", title: "How the ADC Counts", toc: "The ADC",
      intro: `<p><strong>Extra reading.</strong> Open this if you'd like to see how the ESP32 turns a voltage into a count. You can do the lab without it.</p>`,
      mount: mountAdc,
      after: `<div class="callout info"><strong>Good to know: why you calibrate</strong>A real ADC reads nothing until about 0.14 V, runs a little below the ideal line, and reaches 4095 before 3.3 V. Every board is slightly different, and so is every potentiometer. So instead of trusting an ideal formula, you <strong>measure</strong> the count at known angles and fit your own line.</div>` },

    { id: "readblocks", group: "l3", title: "The Blocks and Code", toc: "Blocks and Code",
      intro: `<p>Before you can calibrate, you need the raw number. In TUNIOT, build a program that reads VP and prints the count. Upload it as in Lab 1.</p>`,
      mount: mountReadBlocks },
    { id: "readrun", group: "l3", title: "Try It: Read the Count", toc: "Try It",
      intro: `<p>Open the Serial Monitor at 115200 baud and turn the knob. The multimeter on the wiper shows the voltage that the ADC is measuring.</p>`,
      mount: mountRead,
      after: `<div class="callout info"><strong>Good to know</strong>If the count doesn't change when you turn the knob, check that the middle pin goes to VP. If it stays at 0 or 4095, an outer wire has come loose.</div>` },

    { id: "collect", group: "l4", title: "Fill In Table 1", toc: "Table 1",
      intro: `<p>Calibration means comparing the sensor with a <strong>trusted reference</strong>. Here the reference is the protractor. Set the pointer to each angle from 0° to 180° in 10° steps, wait for the count to settle, and record it: 19 rows.</p>
        <ul class="what"><li>Read the protractor from straight above the pointer, and don't let the protractor or the potentiometer move.</li>
        <li>Don't force the shaft past its end stops.</li>
        <li>Try <em>Average of 5 readings</em>: it takes out most of the noise, and you can do the same on the real hardware.</li></ul>`,
      mount: mountCollect },

    { id: "fit", group: "l5", title: "Plot the Graph and Find the Equation", toc: "Graph and Equation",
      intro: `<p>Plot Table 1 with the <strong>ADC count on the X axis</strong> and the <strong>angle on the Y axis</strong>. The ESP32 knows the count and has to work out the angle, so the count is the input. Then fit a straight line (a first-order polynomial):</p>
        <p class="formula">Angle = m × ADC + c</p>
        <p>m is the slope, in degrees per count. c is the angle the line gives at a count of 0.</p>`,
      mount: mountFit,
      after: `<p class="small-note">More on calibration, with a second sensor to try, in <a href="chapter-7.html#vlab">Chapter 7: Calibrate a Sensor, Step by Step</a>.</p>` },

    { id: "apply", group: "l6", title: "Put the Equation in the Program", toc: "The Equation in Code",
      intro: `<p>Add one block to the Lesson 3 program: after reading the count, calculate the angle with your own m and c, and print the angle instead of the count. Type your values here and the blocks and code follow.</p>`,
      mount: mountApply },

    { id: "bt", group: "l7", title: "On a Phone via Bluetooth", toc: "Phone via Bluetooth",
      intro: `<p>Replace the Serial Monitor with Bluetooth: start the ESP32's Bluetooth with your name, and send the angle once a second.</p>`,
      mount: mountBt },
    { id: "web", group: "l7", title: "On a Web Page", toc: "Web Page",
      intro: `<p>Turn on your phone's hotspot and name it <code>YourName_wifi</code>. The ESP32 joins it, prints its IP address on the Serial Monitor, and serves a page that shows the angle. Open that address in the phone's browser.</p>`,
      mount: mountWeb,
      after: `<div class="callout info"><strong>Good to know</strong>Set the hotspot to <strong>2.4 GHz</strong>: the ESP32 can't join a 5 GHz network. And keep the sensor on VP: the pins of the ESP32's second ADC (GPIO0, 2, 4, 12 to 15 and 25 to 27) can't be read while Wi-Fi is on. VP belongs to the first ADC, which always works.</div>` },

    { id: "task", group: "task", title: "Angle Range Warning", toc: "Angle Range Warning",
      intro: `<p>Build this <strong>on your own</strong> and demonstrate it in the lab. It uses what you learnt in Lessons 1 to 7 and the LED from Lab 1, but there is no worked solution here. Each group gets a different angle range on the lab day, so plan a program that is easy to change.</p>`,
      mount: mountTask },
    { id: "plan", group: "task", title: "My Lab Plan", toc: "My Lab Plan",
      intro: `<p>Decide these things now, so that in the lab you can start building straight away. Print the plan and bring it with you.</p>`,
      mount: mountPlan }
  ];

  /* =====================================================================
     Pre-Lab Check questions (the first option is the right one; the order is shuffled on screen)
     ===================================================================== */
  const BANK = [
    { q: "Which ESP32 pin reads the potentiometer's wiper in this lab?", opts: ["VP (GPIO36)", "GPIO2", "3V3", "EN"], a: 0, why: "VP is GPIO36, an analog input. The wiper's voltage goes there." },
    { q: "What is the highest voltage an ESP32 input pin such as VP should see?", opts: ["3.3 V", "5 V", "12 V", "9 V"], a: 0, why: "The ESP32 runs on 3.3 V. More than that on a pin can damage it." },
    { q: "The ESP32's ADC has 12 bits. What range of counts does it give?", opts: ["0 to 4095", "0 to 1023", "0 to 255", "0 to 3300"], a: 0, why: "2<sup>12</sup> = 4096 different numbers: 0 to 4095." },
    { q: "With an ideal 12-bit ADC and a 3.3 V range, what count does 1.65 V give?", opts: ["About 2048", "About 1650", "4095", "About 512"], a: 0, why: "1.65 V is half of 3.3 V, so the count is half of 4095." },
    { q: "On the calibration graph, what goes on the X axis?", opts: ["The ADC count", "The angle", "The time", "The supply voltage"], a: 0, why: "The ESP32 knows the count and must work out the angle, so the count is the input (x) and the angle the output (y)." },
    { q: "In Angle = m × ADC + c, what is m?", opts: ["The slope: degrees per count", "The count at 0°", "The supply voltage", "The number of readings"], a: 0, why: "m says how many degrees the angle changes for each count." },
    { q: "Why calibrate, when a formula gives the ideal count for any voltage?", opts: ["Each potentiometer and each ESP32 ADC is a little different, and the ADC isn't perfectly straight", "Calibration makes the program run faster", "The formula only works with Wi-Fi off", "The ESP32 can't multiply"], a: 0, why: "Real parts differ from the ideal. Measuring at known angles finds the line for <em>your</em> parts." },
    { q: "You use a bench power supply for the potentiometer. What do you do before connecting it?", opts: ["Set it to 3.3 V and check it with the multimeter", "Set it to 5 V, the same as USB", "Turn the current limit to maximum", "Connect it first, then adjust it"], a: 0, why: "A supply left at a higher voltage would put more than 3.3 V on VP. Check with the meter first: the supply's own display can be a little off." },
    { q: "A bench supply powers the potentiometer and USB powers the ESP32. Which extra connection is essential?", opts: ["The supply's − terminal to the ESP32's GND", "The supply's + terminal to VIN", "The supply's − terminal to EN", "None"], a: 0, why: "Voltages are measured against ground. Without a common ground the ESP32 has no reference, and the count is meaningless." },
    { q: "With the knob still, the count jumps about by a few counts. What is the best fix?", opts: ["Average several readings", "Raise the baud rate", "Use a longer USB cable", "Add a bigger LED resistor"], a: 0, why: "The jumps are random noise. Averaging several readings cancels most of it." },
    { q: "You swap the two outer wires of the potentiometer. What happens?", opts: ["The count now falls as the angle rises, and m becomes negative", "The ESP32 is damaged", "Nothing changes", "The count stays at 0"], a: 0, why: "The wiper now moves towards GND as the angle rises. Calibration still works: the line just slopes the other way." },
    { q: "Why is VP (on the first ADC) a good pin for a sensor you show over Wi-Fi?", opts: ["The pins of the second ADC can't be read while Wi-Fi is on", "It is the fastest pin", "It is the only 12-bit pin", "It is nearest the antenna"], a: 0, why: "Wi-Fi uses the second ADC. VP is on the first ADC, which is always free." },
    { q: "Your web page shows an old angle until you reload it. What makes it update by itself?", opts: ["A refresh tag in the page's head", "A shorter delay in the loop", "A stronger hotspot", "Pairing by Bluetooth"], a: 0, why: "The ESP32 can't push a change to the browser. The refresh tag makes the browser ask again every second." },
    { q: "Your phone's hotspot is for the ESP32. Which setting matters?", opts: ["It must be 2.4 GHz", "It must be 5 GHz", "It must be hidden", "It must have no password"], a: 0, why: "The ESP32's Wi-Fi radio works on 2.4 GHz only." },
    { q: "The pointer is at 90° and your system shows 93°. What is the error?", opts: ["+3°", "−3°", "93°", "3%"], a: 0, why: "Error = measured value − true value = 93° − 90° = +3°." },
    { q: "Table 1 runs from 0° to 180° in 10° steps. How many rows is that?", opts: ["19", "18", "10", "180"], a: 0, why: "180 / 10 = 18 steps, and both ends count: 19 rows." },
    { q: "In the measurement chain, what does the potentiometer do?", opts: ["Turns an angle into a voltage", "Turns a voltage into a number", "Turns a number into an angle", "Turns a voltage into light"], a: 0, why: "It is the transducer: mechanical in, electrical out. The ADC then does the conversion to a number." },
    { q: "During calibration, why must the protractor and potentiometer stay fixed?", opts: ["If the reference moves, every angle shifts and the equation is wrong", "To save power", "To keep the Wi-Fi signal strong", "It makes no difference"], a: 0, why: "The protractor is your reference. If it slips after you calibrate, the same count no longer means the same angle." }
  ];

  /* =====================================================================
     Lab 2 Review exercises
     ===================================================================== */
  const exercises = [
    { id: "l2-q1", title: "Exercise 1: Voltage to Count",
      q: `<p>The wiper of the potentiometer is at 1.20 V. Treat the ESP32's ADC as ideal: 12 bits over 0 to 3.3 V.</p><p>(a) What is the size of one count, in millivolts? (b) What count does 1.20 V give, to the nearest whole number?</p>`,
      ans: [{ l: "(a) One count", u: "mV", v: 0.806 }, { l: "(b) Count", v: 1489, tol: 1 }],
      hints: ["A 12-bit ADC divides its range into 4095 steps. One count is the range divided by the number of steps.",
        "The count is the fraction of the range that the voltage covers, times 4095: V<sub>in</sub> / 3.3 V × 4095."],
      working: () => W_([
        step("Size of one count", "ΔV = 3.3 V / 4095", "3.3 / 4095", "ΔV = 0.000806 V = <strong>0.806 mV</strong>"),
        step("Count for 1.20 V", "count = V<sub>in</sub> / 3.3 V × 4095", "1.20 / 3.3 × 4095", "count = 1489.1 → <strong>1489</strong>")]) },
    { id: "l2-q2", title: "Exercise 2: The Line Through Two Points",
      q: `<p>A group records only two rows of Table 1:</p><table><thead><tr><th>Angle (°)</th><th>ADC count</th></tr></thead><tbody><tr><td>20</td><td>800</td></tr><tr><td>160</td><td>2800</td></tr></tbody></table>
        <p>Find m and c for the straight line Angle = m × ADC + c through these two points.</p>`,
      ans: [{ l: "m", u: "° per count", v: 0.07 }, { l: "c", u: "°", v: -36 }],
      hints: ["The slope is the change in angle divided by the change in count: (y<sub>2</sub> − y<sub>1</sub>) / (x<sub>2</sub> − x<sub>1</sub>), with the count as x.",
        "Put one of the points into Angle = m × ADC + c and solve for c. It can be negative."],
      working: () => W_([
        step("Slope", "m = (y<sub>2</sub> − y<sub>1</sub>) / (x<sub>2</sub> − x<sub>1</sub>)", "(160 − 20) / (2800 − 800) = 140 / 2000", "m = <strong>0.07</strong> ° per count"),
        step("Intercept, from the first point", "c = y<sub>1</sub> − m × x<sub>1</sub>", "20 − 0.07 × 800 = 20 − 56", "c = <strong>−36</strong>°"),
        step("Check with the second point", "Angle = 0.07 × ADC − 36", "0.07 × 2800 − 36 = 196 − 36", "160° ✓")]) },
    { id: "l2-q3", title: "Exercise 3: Use the Equation",
      q: `<p>A calibrated sensor uses <strong>Angle = 0.07 × ADC − 36</strong>.</p><p>(a) The ESP32 reads a count of 1950. What angle does it display? (b) What count would it read at exactly 90°?</p>`,
      ans: [{ l: "(a) Angle", u: "°", v: 100.5 }, { l: "(b) Count", v: 1800, tol: 2 }],
      hints: ["For (a), put the count into the equation as it stands.",
        "For (b), turn the equation round: ADC = (Angle − c) / m. Take care with the sign of c."],
      working: () => W_([
        step("Angle for a count of 1950", "Angle = 0.07 × ADC − 36", "0.07 × 1950 − 36 = 136.5 − 36", "Angle = <strong>100.5°</strong>"),
        step("Count at 90°", "ADC = (Angle − c) / m", "(90 − (−36)) / 0.07 = 126 / 0.07", "ADC = <strong>1800</strong>")]) },
    { id: "l2-q4", title: "Exercise 4: The Error of a Reading",
      q: `<p>At the demo the lecturer sets the pointer to 120°. The phone shows 117.6°. The Lab Task allows ±5°.</p>`,
      ans: [{ l: "Error (displayed − true)", u: "°", v: -2.4, tol: 0.05 }, { l: "Error as a percentage of the true value", u: "%", v: -2, tol: 0.05 }, { l: "Is it within ±5°?", opts: ["Yes", "No"], v: 0 }],
      hints: ["Error = measured value − true value. Here the measured value is what the phone shows. Keep the sign.",
        "Percentage error = error / true value × 100%."],
      working: () => W_([
        step("Error", "e = displayed − true", "117.6° − 120°", "e = <strong>−2.4°</strong> (the system reads low)"),
        step("Percentage error", "e / true × 100%", "−2.4 / 120 × 100%", "<strong>−2%</strong>"),
        step("Compare with the tolerance", "|e| ≤ 5°?", "2.4° ≤ 5°", "<strong>Yes</strong>, it passes")]) }
  ];

  Lab.page({
    lab: 2,
    collapseWorking: true,
    sections,
    groups: [
      { key: "kit", list: "#kitList", toc: "#kitToc" },
      { key: "l1", list: "#l1List", toc: "#l1Toc" },
      { key: "l2", list: "#l2List", toc: "#l2Toc" },
      { key: "l3", list: "#l3List", toc: "#l3Toc" },
      { key: "l4", list: "#l4List" },
      { key: "l5", list: "#l5List" },
      { key: "l6", list: "#l6List" },
      { key: "l7", list: "#l7List", toc: "#l7Toc" },
      { key: "task", list: "#taskList" }
    ],
    exercises, exList: "#exList", exerciseCarousel: true
  });
  const GATE = LabKit.gate(BANK, "nmk-lab2-prelab");
  GATE.mount($("#quizBox"));
  GATE.setLock(GATE.passed());
  LabKit.stepCaption();
  const poll = () => {
    if (GATE.passed()) done("exercises");
    if (PLAN.power && PLAN.wireless) done("labtask");
    const solved = store.get("nmk-solved", []);
    if (exercises.every((x) => solved.includes(x.id))) done("review");
  };
  poll(); paintTicks();
  setInterval(poll, 1500);
  // A link straight to a locked part lands on the lock notice instead
  if (!GATE.passed() && /^#(task|plan)$/.test(location.hash)) setTimeout(() => $("#labtask").scrollIntoView(), 0);
})();
