/* NMK42003 Chapter 1: Introduction to Electronic Instrumentation
   Interactive notes: IoT, measurement vs control, classification, Wheatstone bridge, signals,
   static and dynamic characteristics, standards, errors, statistics and exercises.
   The calculator and exercise engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, withUnit, PN, F, step, stepsHtml, notesHtml, MINUS, reduceMotion, chips, wireChips, quiz } = Lab;
  const fx = (x, d = 2) => (x < 0 && Math.abs(x) >= 0.5 * 10 ** -d ? MINUS : "") + Math.abs(x).toFixed(d);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  // Small seeded random generator so "take new readings" is repeatable within a session
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

  /* =====================================================================
     Shared bits: photos, chip buttons, quizzes
     ===================================================================== */
  const PHOTOS = {
    "tangent-galvanometer": { w: 600, h: 900, by: "Rama", lic: "public domain", url: "https://commons.wikimedia.org/wiki/File:Sine_and_Tangent_Galvanometer-MHS_98-P5200147.JPG", alt: "A brass tangent galvanometer: a large vertical coil ring with a compass needle at its centre" },
    "analog-multimeter": { w: 900, h: 600, by: "Islander61", lic: `<a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a>`, url: "https://commons.wikimedia.org/wiki/File:Analog_multimeter_HARTIG_%26_HELLING_VM-10K.jpg", alt: "An analog multimeter with a pointer and printed scales, a rotary range switch and red and black test leads" },
    "digital-multimeter": { w: 609, h: 900, by: "Tomasz Sienicki", lic: `<a href="https://creativecommons.org/licenses/by/3.0" target="_blank" rel="noopener">CC BY 3.0</a>`, url: "https://commons.wikimedia.org/wiki/File:Digital_universal_multimeter_(ubt).jpeg", alt: "A handheld digital multimeter with an LCD number display and rotary range switch" },
    "wheatstone-bridge": { w: 513, h: 625, by: "Daderot", lic: "CC0", url: "https://commons.wikimedia.org/wiki/File:Wheatstone_bridge,_Type_YBR-7C_-_National_Museum_of_Nature_and_Science,_Tokyo_-_DSC07795.JPG", alt: "A laboratory Wheatstone bridge with decade resistance dials and a centre-zero galvanometer" },
    "chart-recorder": { w: 675, h: 900, by: "ArnoldReinhold", lic: `<a href="https://creativecommons.org/licenses/by-sa/3.0" target="_blank" rel="noopener">CC BY-SA 3.0</a>`, url: "https://commons.wikimedia.org/wiki/File:Circular_chart_recorder.agr.jpg", alt: "A wall-mounted circular chart recorder with a pen tracing on a round paper chart" },
    "energy-meter": { w: 885, h: 900, by: "Asurnipal", lic: `<a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a>`, url: "https://commons.wikimedia.org/wiki/File:Vorarlberger_Kraftwerke-Energy_meter_(electro)-09ASD_crop.jpg", alt: "An electromechanical kilowatt-hour energy meter with a number counter" },
    "galvanometer-mechanism": { w: 900, h: 566, by: "Mister rf", lic: `<a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a>`, url: "https://commons.wikimedia.org/wiki/File:Galvanometer_mechanism_details.jpg", alt: "The moving-coil mechanism of a meter: coil, spiral springs, jewel bearings and pointer" },
    "pressure-gauge": { w: 675, h: 900, by: "In Transit", lic: `<a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a>`, url: "https://commons.wikimedia.org/wiki/File:Pressure_Gauge.jpg", alt: "A dial pressure gauge with a pointer, mounted on a pipe" }
  };
  const photo = (key, caption) => {
    const p = PHOTOS[key];
    return `<figure class="photo"><img src="assets/img/chapter-1/${key}.jpg" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" loading="lazy">
      <figcaption>${caption ? `${caption} ` : ""}<span class="credit">Photo: <a href="${p.url}" target="_blank" rel="noopener">${esc(p.by)}</a>, ${p.lic}, via Wikimedia Commons</span></figcaption></figure>`;
  };

  const ICON = {
    sensor: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/></svg>`,
    cloud: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M12 14v7M9 21h6"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M6 14l4-4 3 3 5-5M8 21h8"/></svg>`
  };

  /* =====================================================================
     Basics
     ===================================================================== */
  const IOT = {
    farm: { label: "Smart farming", things: "Soil-moisture and temperature sensors in the field, and a valve that switches the water pump.", conn: "A long-range radio link (such as LoRa) to a gateway, then the internet.", app: "A dashboard shows soil moisture. The system opens the valve when the soil is too dry." },
    health: { label: "Health monitoring", things: "A wearable sensor that measures heart rate and blood oxygen.", conn: "Bluetooth to the patient's phone, then mobile data to a cloud server.", app: "The doctor sees trends on a dashboard, and an alert is sent if a reading goes out of range." },
    home: { label: "Smart home", things: "Door, motion and temperature sensors, plus smart plugs and lights.", conn: "Wi-Fi or Zigbee to a home hub and router.", app: "A phone app controls the devices. Rules act automatically, such as lights off when nobody is home." },
    waste: { label: "Waste management", things: "An ultrasonic sensor in each bin that measures how full it is.", conn: "A low-power cellular link (such as NB-IoT) to the council's server.", app: "A map shows which bins are full, and collection trucks get the shortest route to them." }
  };

  const BLOCK_SVG = `<svg class="ckt blocks" viewBox="0 0 660 300" role="img" aria-label="Feedback control system block diagram. Control part: controller and actuator acting on the process. Measurement part: sensor, signal conditioning and display, with the measured signal fed back to the comparator.">
    <defs>
      <marker id="arrI" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="ah-ink"/></marker>
      <marker id="arrM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="ah-meas"/></marker>
    </defs>
    <g class="grp ctrl">
      <text x="10" y="64">Set point</text>
      <line class="w" x1="68" y1="70" x2="98" y2="70" marker-end="url(#arrI)"/>
      <circle class="w sum" cx="118" cy="70" r="18"/><text x="118" y="75" text-anchor="middle" class="sym">Σ</text>
      <text x="96" y="56" class="small">+</text>
      <line class="w" x1="136" y1="70" x2="158" y2="70" marker-end="url(#arrI)"/>
      <rect class="blk" x="160" y="46" width="104" height="48" rx="6"/><text x="212" y="75" text-anchor="middle">Controller</text>
      <line class="w" x1="264" y1="70" x2="286" y2="70" marker-end="url(#arrI)"/>
      <rect class="blk" x="288" y="46" width="104" height="48" rx="6"/><text x="340" y="75" text-anchor="middle">Actuator</text>
      <line class="w" x1="392" y1="70" x2="414" y2="70" marker-end="url(#arrI)"/>
    </g>
    <g class="grp plant">
      <rect class="blk" x="416" y="46" width="104" height="48" rx="6"/><text x="468" y="75" text-anchor="middle">Process</text>
      <line class="w" x1="520" y1="70" x2="648" y2="70" marker-end="url(#arrI)"/>
      <text x="646" y="58" text-anchor="end">Output</text>
    </g>
    <g class="grp meas">
      <circle class="dotm" cx="580" cy="70" r="3.5"/>
      <polyline class="wm" points="580,70 580,180 546,180" marker-end="url(#arrM)"/>
      <rect class="blk" x="440" y="156" width="104" height="48" rx="6"/><text x="492" y="185" text-anchor="middle">Sensor</text>
      <line class="wm" x1="440" y1="180" x2="410" y2="180" marker-end="url(#arrM)"/>
      <rect class="blk" x="276" y="156" width="132" height="48" rx="6"/><text x="342" y="176" text-anchor="middle">Signal</text><text x="342" y="194" text-anchor="middle">conditioning</text>
      <polyline class="wm" points="276,180 118,180 118,90" marker-end="url(#arrM)"/>
      <text x="108" y="112" text-anchor="end" class="small">${MINUS}</text>
      <line class="wm" x1="342" y1="204" x2="342" y2="232" marker-end="url(#arrM)"/>
      <rect class="blk" x="276" y="234" width="132" height="44" rx="6"/><text x="342" y="261" text-anchor="middle">Display / recorder</text>
      <text x="196" y="172" text-anchor="middle" class="small">measured value</text>
    </g>
  </svg>`;

  /* =====================================================================
     Classification
     ===================================================================== */
  const CLASSES = [
    { k: "principle", tab: "Working principle", intro: "How the instrument gets its answer.", items: [
      { name: "Absolute instrument", photo: "tangent-galvanometer", text: "Gives the value directly from its deflection and its own physical constants (such as the number of coil turns and the coil radius). No calibration is needed.", ex: "Tangent galvanometer, Rayleigh current balance, absolute electrometer." },
      { name: "Secondary instrument", photo: "analog-multimeter", text: "Shows the value as a pointer deflection, but the deflection alone does not give the value. The instrument must first be calibrated against a standard, then read from its calibrated scale. Most instruments you will use are secondary instruments.", ex: "Ammeter, voltmeter, thermometer." }
    ] },
    { k: "technique", tab: "Technique", intro: "How the result is produced.", items: [
      { name: "Null technique", photo: "wheatstone-bridge", text: "Uses two inputs, the unknown and an adjustable balancing input. You adjust the balance until a detector reads zero (the null). The unknown is then found from the known values. Very accurate, because the detector only has to show zero.", ex: "Wheatstone bridge (try the simulator below)." },
      { name: "Deflection technique", photo: "galvanometer-mechanism", text: "Uses one input. The quantity moves a pointer away from its starting position, and the size of the deflection is read off a calibrated scale. Simpler and faster, but less accurate and less sensitive than the null technique.", ex: "Moving-coil ammeter, spring balance, dial gauge." }
    ] },
    { k: "signal", tab: "Signal type", intro: "What kind of output signal it produces.", items: [
      { name: "Analog", photo: "pressure-gauge", text: "The output changes continuously with the measured quantity, so within its range it can take an infinite number of values.", ex: "Dial pressure gauge, pointer voltmeter, liquid thermometer." },
      { name: "Digital", photo: "digital-multimeter", text: "The output changes in discrete steps, so it can only show a finite number of values. The smallest step is the instrument's resolution.", ex: "Digital multimeter, digital thermometer. See the analog vs digital demo below." }
    ] },
    { k: "function", tab: "Function", intro: "What it is used for.", items: [
      { name: "Indicating", photo: "analog-multimeter", text: "Shows the present value on a scale or display for someone to read.", ex: "Voltmeter, pressure gauge, speedometer." },
      { name: "Recording", photo: "chart-recorder", text: "Draws or stores the value over time. It gives a graphic display where the data is collected and a permanent record for checking later.", ex: "Chart recorder, data logger." },
      { name: "Integrating", photo: "energy-meter", text: "Adds up (integrates) a quantity over time and shows the total, not the present value.", ex: "Energy meter (kWh), water meter, fuel dispenser." }
    ] }
  ];

  const CLASS_QUIZ = [
    { q: "Based on its <strong>working principle</strong>, a tangent galvanometer is…", opts: ["an absolute instrument", "a secondary instrument"], a: 0, why: "It gives current from its deflection and its own constants (turns, coil radius, Earth's field), with no calibration." },
    { q: "Based on its <strong>working principle</strong>, a moving-coil voltmeter is…", opts: ["an absolute instrument", "a secondary instrument"], a: 1, why: "Its scale only means something after it has been calibrated against a standard." },
    { q: "A Wheatstone bridge finds an unknown resistance using the…", opts: ["null technique", "deflection technique"], a: 0, why: "You adjust a known resistor until the galvanometer reads zero, then calculate the unknown." },
    { q: "A dial pressure gauge whose pointer moves across a scale uses the…", opts: ["null technique", "deflection technique"], a: 1, why: "One input moves the pointer, and the size of the deflection is read from the scale." },
    { q: "A liquid-in-glass thermometer produces…", opts: ["an analog signal", "a digital signal"], a: 0, why: "The liquid column can stop at any height, so the reading varies continuously." },
    { q: "A multimeter showing “12.47 V” on an LCD produces…", opts: ["an analog signal", "a digital signal"], a: 1, why: "It can only show values in steps of 0.01 V, a finite set of values." },
    { q: "Based on <strong>function</strong>, a household kWh energy meter is…", opts: ["indicating", "recording", "integrating"], a: 2, why: "It adds up energy used over time and shows the running total." },
    { q: "Based on <strong>function</strong>, a chart recorder in a factory control room is…", opts: ["indicating", "recording", "integrating"], a: 1, why: "It keeps a permanent record of the value over time." },
    { q: "Based on <strong>function</strong>, a car's speedometer is…", opts: ["indicating", "recording", "integrating"], a: 0, why: "It shows the present speed. (The odometer next to it is integrating: it adds up distance.)" },
    { q: "Which technique is usually <strong>more accurate</strong>?", opts: ["Null", "Deflection"], a: 0, why: "At null the detector only has to show zero, so its own calibration errors don't affect the result." }
  ];

  /* =====================================================================
     Wheatstone bridge simulator
     ===================================================================== */
  function mountBridge(el, sec) {
    const S = { mode: "explore", Vs: 5, R1: 1000, R2: 1000, Rx: 4700, R3: [1, 0, 0, 0], hidden: null, solved: false };
    const R3 = () => S.R3[0] * 1000 + S.R3[1] * 100 + S.R3[2] * 10 + S.R3[3];
    const rx = () => (S.mode === "challenge" ? S.hidden : S.Rx);

    el.innerHTML = `
      ${chips("Bridge mode", [["explore", "Explore"], ["challenge", "Challenge: find the unknown R<sub>x</sub>"]], "explore")}
      <div class="bridge-grid">
        <figure class="diagram"><div class="ckt-wrap bridge-svg"></div>
          <figcaption>R<sub>1</sub> and R<sub>2</sub> are the ratio arms, R<sub>3</sub> is the adjustable decade box, and G is the galvanometer.</figcaption></figure>
        <div class="bridge-ctl">
          <div class="meter" aria-live="polite"></div>
          <div class="decades" role="group" aria-label="R3 decade box">
            ${[1000, 100, 10, 1].map((m, i) => `<div class="decade"><button type="button" class="dec-btn" data-d="${i}" data-s="1" aria-label="Increase R3 ×${m} dial">▲</button><output class="dec-val" data-i="${i}">0</output><button type="button" class="dec-btn" data-d="${i}" data-s="-1" aria-label="Decrease R3 ×${m} dial">▼</button><span class="dec-m">×${m}</span></div>`).join("")}
          </div>
          <p class="r3-read">R<sub>3</sub> = <strong class="r3-val"></strong></p>
          <div class="bridge-fields">
            <label>V<sub>s</sub> <span class="ctl"><input type="number" step="any" inputmode="decimal" data-f="Vs"><span class="unit">V</span></span></label>
            <label>R<sub>1</sub> <span class="ctl"><input type="number" step="any" inputmode="decimal" data-f="R1"><span class="unit">Ω</span></span></label>
            <label>R<sub>2</sub> <span class="ctl"><input type="number" step="any" inputmode="decimal" data-f="R2"><span class="unit">Ω</span></span></label>
            <label class="rx-field">R<sub>x</sub> <span class="ctl"><input type="number" step="any" inputmode="decimal" data-f="Rx"><span class="unit">Ω</span></span></label>
          </div>
          <p class="err bridge-err" hidden></p>
        </div>
      </div>
      <div class="challenge-box" hidden></div>
      <div class="working"><h4>Step-by-step working</h4><p class="result" aria-live="polite"></p><ol class="steps"></ol></div>`;

    const q = (s) => el.querySelector(s), meter = q(".meter"), chBox = q(".challenge-box");
    const inputs = el.querySelectorAll("[data-f]");
    const syncInputs = () => inputs.forEach((i) => { i.value = S[i.dataset.f]; i.readOnly = S.mode === "challenge" && i.dataset.f !== "Vs"; });

    function newChallenge() {
      const R2s = [100, 1000, 10000];
      S.R1 = 1000; S.R2 = R2s[Math.floor(Math.random() * 3)];
      const r3t = 200 + Math.floor(Math.random() * 9700);
      S.hidden = (S.R2 * r3t) / S.R1;
      S.R3 = [1, 0, 0, 0]; S.solved = false;
      chBox.innerHTML = `<p><strong>Your task:</strong> R<sub>x</sub> is hidden. Turn the R<sub>3</sub> dials until the galvanometer reads zero, then calculate R<sub>x</sub>.</p>`;
    }

    function draw() {
      const Rx = rx(), r3 = R3(), { Vs, R1, R2 } = S;
      const bad = [Vs, R1, R2, Rx].some((x) => !(x > 0)) || r3 <= 0;
      const errEl = q(".bridge-err");
      errEl.hidden = !bad;
      errEl.textContent = bad ? (r3 <= 0 ? "Set R3 above 0 Ω with the dials." : "Every value must be greater than 0.") : "";
      el.querySelectorAll(".dec-val").forEach((o) => { o.textContent = S.R3[+o.dataset.i]; });
      q(".r3-val").textContent = `${r3.toLocaleString("en")} Ω`;
      if (bad) return;
      const Va = (Vs * R2) / (R1 + R2), Vb = (Vs * Rx) / (r3 + Rx), Vg = Va - Vb;
      const stepSize = (Vs * Rx) / (r3 + Rx) ** 2; // change in Vb for 1 Ω change in R3
      const balanced = Math.abs(Vg) < Math.max(1e-12, 0.3 * stepSize);
      const showRx = S.mode === "explore" ? withUnit(Rx, "Ω") : "?";

      // Circuit
      const L = (x, y, name, val, a = "start") => `<text x="${x}" y="${y}" text-anchor="${a}">${name} = <tspan class="val">${val}</tspan></text>`;
      const gA = clamp(Vg / 0.004, -1.2, 1.2) * 0.9; // needle angle inside the G symbol
      q(".bridge-svg").innerHTML = `<svg class="ckt bridge" viewBox="-70 0 590 320" role="img" aria-label="Wheatstone bridge circuit">
        ${Lab.D.wire([30, 40], [390, 40])}${Lab.D.wire([30, 280], [390, 280])}
        ${Lab.D.wire([30, 40], [30, 148])}${Lab.D.wire([30, 172], [30, 280])}
        <path class="w" d="M16,148h28M22,158h16M16,166h28M22,176h16" /><text x="50" y="150" class="small">+</text>
        <g class="vs-lab">${L(8, 166, "V<tspan class='sb' dy='4'>s</tspan><tspan dy='-4'></tspan>", `${num(Vs)} V`, "end")}</g>
        ${Lab.D.res(190, 40, 190, 150)}${Lab.D.res(190, 170, 190, 280)}${Lab.D.wire([190, 150], [190, 170])}
        ${Lab.D.res(390, 40, 390, 150)}${Lab.D.res(390, 170, 390, 280)}${Lab.D.wire([390, 150], [390, 170])}
        ${Lab.D.dot(190, 40)}${Lab.D.dot(390, 40)}${Lab.D.dot(190, 280)}${Lab.D.dot(390, 280)}
        ${Lab.D.dot(190, 160)}${Lab.D.dot(390, 160)}
        ${Lab.D.wire([190, 160], [262, 160])}${Lab.D.wire([318, 160], [390, 160])}
        <circle class="term gcirc${balanced ? " nullok" : ""}" cx="290" cy="160" r="28"/>
        <line class="gneedle" x1="290" y1="176" x2="${290 + 22 * Math.sin(gA)}" y2="${176 - 22 * Math.cos(gA)}"/>
        <text x="290" y="150" text-anchor="middle" class="small">G</text>
        ${L(178, 100, "R<tspan class='sb' dy='4'>1</tspan><tspan dy='-4'></tspan>", withUnit(R1, "Ω"), "end")}
        ${L(178, 230, "R<tspan class='sb' dy='4'>2</tspan><tspan dy='-4'></tspan>", withUnit(R2, "Ω"), "end")}
        ${L(402, 100, "R<tspan class='sb' dy='4'>3</tspan><tspan dy='-4'></tspan>", withUnit(r3, "Ω"))}
        ${L(402, 230, "R<tspan class='sb' dy='4'>x</tspan><tspan dy='-4'></tspan>", showRx)}
        <text x="180" y="180" text-anchor="end" class="small">V<tspan class="sb" dy="4">a</tspan></text>
        <text x="400" y="180" class="small">V<tspan class="sb" dy="4">b</tspan></text>
      </svg>`;

      // Galvanometer meter (centre zero), like the real bridge in the photo
      const ang = clamp(Vg / 0.004, -1.25, 1.25) * 50; // degrees
      meter.innerHTML = `<svg viewBox="0 0 220 128" class="gmeter" role="img" aria-label="Galvanometer reads ${balanced ? "zero: the bridge is balanced" : (Vg > 0 ? "to the right" : "to the left")}">
        <rect x="2" y="2" width="216" height="124" rx="10" class="gface"/>
        ${[-60, -45, -30, -15, 0, 15, 30, 45, 60].map((a) => { const r = (a * Math.PI) / 180; return `<line x1="${110 + 78 * Math.sin(r)}" y1="${112 - 78 * Math.cos(r)}" x2="${110 + (a === 0 ? 64 : 70) * Math.sin(r)}" y2="${112 - (a === 0 ? 64 : 70) * Math.cos(r)}" class="gtick"/>`; }).join("")}
        <text x="110" y="28" text-anchor="middle" class="gtext">0</text><text x="30" y="60" class="gtext">${MINUS}</text><text x="182" y="60" class="gtext">+</text>
        <line x1="110" y1="112" x2="${110 + 80 * Math.sin((ang * Math.PI) / 180)}" y2="${112 - 80 * Math.cos((ang * Math.PI) / 180)}" class="gpointer${balanced ? " nullok" : ""}"/>
        <circle cx="110" cy="112" r="5" class="gpivot"/>
      </svg>
      <p class="meter-read ${balanced ? "ok" : ""}">${balanced ? "✓ Null: the bridge is balanced" : `V<sub>a</sub> ${MINUS} V<sub>b</sub> = ${num(Vg * 1000, 3)} mV, ${Vg < 0 ? "increase" : "decrease"} R<sub>3</sub>`}</p>`; // a larger R3 lowers Vb, raising Va − Vb

      // Working
      const steps = [
        step("Voltage at node a (left divider)", `V<sub>a</sub> = V<sub>s</sub> × R<sub>2</sub> / (R<sub>1</sub> + R<sub>2</sub>)`, `= ${num(Vs)} V × ${withUnit(R2, "Ω")} / (${withUnit(R1, "Ω")} + ${withUnit(R2, "Ω")})`, `V<sub>a</sub> = ${num(Va, 5)} V`)
      ];
      if (S.mode === "explore") {
        steps.push(step("Voltage at node b (right divider)", `V<sub>b</sub> = V<sub>s</sub> × R<sub>x</sub> / (R<sub>3</sub> + R<sub>x</sub>)`, `= ${num(Vs)} V × ${withUnit(Rx, "Ω")} / (${withUnit(r3, "Ω")} + ${withUnit(Rx, "Ω")})`, `V<sub>b</sub> = ${num(Vb, 5)} V`));
        steps.push(step("Galvanometer voltage", `V<sub>g</sub> = V<sub>a</sub> ${MINUS} V<sub>b</sub>`, `= ${num(Va, 5)} V ${MINUS} ${num(Vb, 5)} V`, `V<sub>g</sub> = ${num(Vg * 1000, 4)} mV${balanced ? " (null)" : ""}`));
        steps.push(step("Balance condition", `At null, R<sub>1</sub>R<sub>x</sub> = R<sub>2</sub>R<sub>3</sub>, so R<sub>x</sub> = (R<sub>2</sub> / R<sub>1</sub>) × R<sub>3</sub>`,
          `= (${withUnit(R2, "Ω")} / ${withUnit(R1, "Ω")}) × ${withUnit(r3, "Ω")}`,
          balanced ? `R<sub>x</sub> = ${withUnit((R2 * r3) / R1, "Ω")}, which matches the real R<sub>x</sub>` : `= ${withUnit((R2 * r3) / R1, "Ω")}, but the bridge is not balanced yet, so this is not R<sub>x</sub>. Keep adjusting R<sub>3</sub>.`));
      } else {
        steps.push(step("What the galvanometer shows", `V<sub>g</sub> = V<sub>a</sub> ${MINUS} V<sub>b</sub>`, "", balanced ? "V<sub>g</sub> = 0: the bridge is balanced" : `V<sub>g</sub> = ${num(Vg * 1000, 3)} mV: not balanced yet`));
      }
      q(".result").innerHTML = balanced ? "Balanced: V<sub>a</sub> = V<sub>b</sub>, no current through the galvanometer" : `Not balanced: V<sub>a</sub> ${MINUS} V<sub>b</sub> = ${num(Vg * 1000, 3)} mV`;
      q(".steps").innerHTML = stepsHtml(steps);

      // Challenge flow
      if (S.mode === "challenge") {
        let box = chBox.querySelector(".rx-answer");
        if (balanced && !box && !S.solved) {
          chBox.insertAdjacentHTML("beforeend", `<form class="rx-answer" novalidate>
            <p><strong>✓ Balanced!</strong> Now calculate R<sub>x</sub> from R<sub>1</sub>, R<sub>2</sub> and R<sub>3</sub>.</p>
            <div class="ans-in"><input type="text" inputmode="decimal" aria-label="Your value of Rx in ohms" autocomplete="off"><span class="unit">Ω</span><button class="btn" type="submit">Check</button></div>
            <p class="rx-fb" aria-live="polite"></p></form>`);
          box = chBox.querySelector(".rx-answer");
          box.addEventListener("submit", (e) => {
            e.preventDefault();
            const x = Number(box.querySelector("input").value.replace(/[,\s]/g, "").replace(/[Ωa-zA-Z]+$/, ""));
            const fb = box.querySelector(".rx-fb");
            if (!isFinite(x) || x <= 0) { fb.textContent = "Enter a resistance in ohms."; return; }
            if (Math.abs(x - S.hidden) <= 0.01 * S.hidden) {
              S.solved = true;
              fb.innerHTML = `<strong>✓ Correct!</strong> R<sub>x</sub> = (${withUnit(S.R2, "Ω")} / ${withUnit(S.R1, "Ω")}) × ${withUnit(R3(), "Ω")} = <strong>${withUnit(S.hidden, "Ω")}</strong>. That is exactly how a real bridge measures resistance.`;
              box.querySelector("button").disabled = true;
              chBox.insertAdjacentHTML("beforeend", `<button type="button" class="btn ghost" data-new>Try another unknown resistor</button>`);
              chBox.querySelector("[data-new]").onclick = () => { newChallenge(); syncInputs(); draw(); };
            } else {
              fb.innerHTML = `✗ Not quite. At balance the products of opposite arms are equal: R<sub>1</sub> × R<sub>x</sub> = R<sub>2</sub> × R<sub>3</sub>. Rearrange for R<sub>x</sub>.`;
            }
          });
        } else if (!balanced && box && !S.solved) box.remove();
      }
    }

    wireChips(el.querySelector(".chips-row"), (m) => {
      S.mode = m;
      el.querySelector(".rx-field").hidden = m === "challenge";
      chBox.hidden = m !== "challenge";
      if (m === "challenge") newChallenge(); else { S.R1 = 1000; S.R2 = 1000; S.R3 = [1, 0, 0, 0]; }
      syncInputs(); draw();
    });
    el.querySelector(".decades").addEventListener("click", (e) => {
      const b = e.target.closest(".dec-btn");
      if (!b) return;
      const i = +b.dataset.d;
      S.R3[i] = (S.R3[i] + +b.dataset.s + 10) % 10;
      draw();
    });
    inputs.forEach((i) => i.addEventListener("input", () => { if (!i.readOnly) { S[i.dataset.f] = Number(i.value); draw(); } }));
    syncInputs(); draw();
  }

  /* =====================================================================
     Analog vs digital
     ===================================================================== */
  function mountSignal(el) {
    let bits = 3;
    el.innerHTML = `
      <div class="field slider-field"><label for="sig-bits">Digital resolution: <strong class="bits-val"></strong></label>
        <input type="range" id="sig-bits" min="1" max="8" step="1" value="3"></div>
      <figure class="diagram plot-box"><div class="sig-plot"></div>
        <figcaption><span class="key analog"></span> Analog signal (continuous) &nbsp; <span class="key digital"></span> Digital reading (steps)</figcaption></figure>
      <p class="sig-read" aria-live="polite"></p>`;
    const sig = (t) => 2.5 + 1.6 * Math.sin(2 * Math.PI * t / 10) + 0.5 * Math.sin(2 * Math.PI * t / 3.3);
    const draw = () => {
      const levels = 2 ** bits, stepV = 5 / levels;
      el.querySelector(".bits-val").textContent = `${bits} bit${bits > 1 ? "s" : ""} (${levels} levels)`;
      const W = 600, H = 220, l = 40, r = 10, t = 12, b = 26, X = (s) => l + (s / 10) * (W - l - r), Y = (v) => t + (1 - v / 5) * (H - t - b);
      let a = "", d = "";
      for (let i = 0; i <= 300; i++) { const s = (i / 300) * 10; a += `${i ? "L" : "M"}${X(s).toFixed(1)},${Y(sig(s)).toFixed(1)}`; }
      const N = 40;
      for (let i = 0; i < N; i++) {
        const s0 = (i / N) * 10, s1 = ((i + 1) / N) * 10, q = Math.min(levels - 1, Math.floor(sig(s0) / stepV)) * stepV;
        d += `${i ? "L" : "M"}${X(s0).toFixed(1)},${Y(q).toFixed(1)}L${X(s1).toFixed(1)},${Y(q).toFixed(1)}`;
      }
      let grid = "";
      for (let v = 0; v <= 5; v++) grid += `<line class="gl" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v} V</text>`;
      let lv = "";
      if (levels <= 32) for (let k = 0; k <= levels; k++) lv += `<line class="lvl" x1="${l}" x2="${W - r}" y1="${Y(k * stepV)}" y2="${Y(k * stepV)}"/>`;
      el.querySelector(".sig-plot").innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="A smooth analog signal and its ${bits}-bit digital version, which can only take ${levels} levels">${grid}${lv}<path class="trace-a" d="${a}"/><path class="trace-d" d="${d}"/><text class="axis" x="${W - r}" y="${H - 6}" text-anchor="end">time</text></svg>`;
      el.querySelector(".sig-read").innerHTML = `With <strong>${bits} bit${bits > 1 ? "s" : ""}</strong> over a 0 to 5 V range, the digital reading can only take <strong>${levels}</strong> different values, in steps of <strong>${num(stepV * 1000, 3)} mV</strong>. ${bits <= 3 ? "The steps are coarse: small changes in the signal are lost." : bits >= 7 ? "The steps are fine, so the digital reading follows the analog signal closely." : "More bits give smaller steps and a closer match."} The analog signal can take any value in between.`;
    };
    el.querySelector("#sig-bits").addEventListener("input", (e) => { bits = +e.target.value; draw(); });
    draw();
  }

  /* =====================================================================
     Static characteristics: target board, resolution
     ===================================================================== */
  function mountTarget(el) {
    const S = { bias: 0.03, spread: 0.03, seed: 7 };
    const PRESETS = { ap: [0.0, 0.02, "Accurate and precise"], pn: [0.25, 0.02, "Precise, not accurate"], an: [0.0, 0.12, "Accurate, not precise"], nn: [0.25, 0.14, "Neither"] };
    el.innerHTML = `
      <p class="widget-lead">A voltmeter takes 10 readings of a source whose expected value is <strong>10.00 V</strong>. Think of each reading as a dart: the bullseye is the expected value. Move the sliders, or pick a case.</p>
      ${chips("Example cases", Object.entries(PRESETS).map(([k, p]) => [k, p[2]]), "")}
      <div class="target-grid">
        <figure class="diagram target-fig"><div class="target-svg"></div></figure>
        <div>
          <div class="field slider-field"><label for="tg-bias">Systematic offset (bias): <strong class="bias-val"></strong></label><input type="range" id="tg-bias" min="0" max="0.4" step="0.01"></div>
          <div class="field slider-field"><label for="tg-spread">Random scatter: <strong class="spread-val"></strong></label><input type="range" id="tg-spread" min="0.005" max="0.2" step="0.005"></div>
          <button type="button" class="btn ghost" data-new>Take 10 new readings</button>
          <div class="verdicts" aria-live="polite"></div>
        </div>
      </div>
      <p class="readings-list"></p>`;
    const draw = () => {
      const r = rng(S.seed), pts = [];
      for (let i = 0; i < 10; i++) { const ex = gauss(r) * S.spread, ey = gauss(r) * S.spread; pts.push({ v: 10 + S.bias + ex, ey }); }
      const vals = pts.map((p) => p.v), mean = sum(vals) / 10, sd = Math.sqrt(sum(vals.map((x) => (x - mean) ** 2)) / 9);
      const acc = Math.abs(mean - 10) / 10 * 100, accurate = acc < 0.5, precise = sd < 0.05;
      const C = 120, K = 300; // px per volt
      let s = `<svg viewBox="0 0 240 240" class="target" role="img" aria-label="Target with 10 readings. Mean ${fx(mean)} volts, spread ${fx(sd, 3)} volts.">`;
      [110, 88, 66, 44, 22].forEach((rad, i) => { s += `<circle cx="${C}" cy="${C}" r="${rad}" class="ring r${i}"/>`; });
      s += `<line x1="${C}" x2="${C}" y1="6" y2="234" class="cross"/><line y1="${C}" y2="${C}" x1="6" x2="234" class="cross"/>`;
      pts.forEach((p) => { s += `<circle cx="${clamp(C + (p.v - 10) * K, 4, 236)}" cy="${clamp(C + p.ey * K, 4, 236)}" r="5" class="shot"/>`; });
      s += `<circle cx="${clamp(C + (mean - 10) * K, 4, 236)}" cy="${C}" r="8" class="meanmark"/></svg>`;
      el.querySelector(".target-svg").innerHTML = s;
      el.querySelector(".bias-val").textContent = `${fx(S.bias)} V`;
      el.querySelector(".spread-val").textContent = `± ${fx(S.spread, 3)} V`;
      el.querySelector("#tg-bias").value = S.bias; el.querySelector("#tg-spread").value = S.spread;
      el.querySelector(".verdicts").innerHTML = `
        <div class="verdict ${accurate ? "yes" : "no"}"><strong>${accurate ? "Accurate" : "Not accurate"}</strong>Mean reading ${fx(mean)} V is ${fx(Math.abs(mean - 10))} V (${fx(acc)}%) from the expected 10.00 V. <em>Accuracy is closeness to the expected value.</em></div>
        <div class="verdict ${precise ? "yes" : "no"}"><strong>${precise ? "Precise" : "Not precise"}</strong>The readings spread by about ± ${fx(sd, 3)} V (standard deviation). <em>Precision is how close the readings are to each other.</em></div>`;
      el.querySelector(".readings-list").innerHTML = `<span>Readings (V):</span> ${vals.map((v) => fx(v)).join(", ")}`;
    };
    wireChips(el.querySelector(".chips-row"), (k) => { [S.bias, S.spread] = PRESETS[k]; S.seed++; draw(); });
    el.querySelector("#tg-bias").addEventListener("input", (e) => { S.bias = +e.target.value; draw(); });
    el.querySelector("#tg-spread").addEventListener("input", (e) => { S.spread = +e.target.value; draw(); });
    el.querySelector("[data-new]").addEventListener("click", () => { S.seed++; draw(); });
    draw();
  }

  function mountResolution(el) {
    let v = 7.342;
    el.innerHTML = `
      <p class="widget-lead">Two digital voltmeters measure the same voltage. Meter A has a resolution of 0.1 V and meter B has 0.01 V. Nudge the true voltage by a few millivolts and watch which display responds.</p>
      <div class="res-grid">
        <div class="lcd"><span class="lcd-label">Meter A, resolution 0.1 V</span><output class="lcd-num" data-r="0.1"></output></div>
        <div class="lcd"><span class="lcd-label">Meter B, resolution 0.01 V</span><output class="lcd-num" data-r="0.01"></output></div>
      </div>
      <div class="field slider-field"><label for="res-v">True voltage: <strong class="res-true"></strong></label><input type="range" id="res-v" min="0" max="19.99" step="0.001"></div>
      <div class="nudges"><button type="button" class="btn ghost" data-n="-0.005">${MINUS} 5 mV</button><button type="button" class="btn ghost" data-n="0.005">+ 5 mV</button><button type="button" class="btn ghost" data-n="-0.05">${MINUS} 50 mV</button><button type="button" class="btn ghost" data-n="0.05">+ 50 mV</button></div>
      <p class="res-note" aria-live="polite"></p>`;
    let last = null;
    const draw = () => {
      el.querySelector(".res-true").textContent = `${v.toFixed(3)} V`;
      el.querySelector("#res-v").value = v;
      const shown = [...el.querySelectorAll(".lcd-num")].map((o) => { const r = +o.dataset.r, d = r === 0.1 ? 1 : 2, txt = (Math.round(v / r) * r).toFixed(d); o.textContent = `${txt} V`; return txt; });
      if (last) {
        const moved = shown.map((s, i) => s !== last[i]);
        el.querySelector(".res-note").textContent = moved[0] && moved[1] ? "Both displays changed." : moved[1] ? "Only meter B changed: the change was smaller than meter A's resolution, so meter A could not respond." : moved[0] ? "Meter A changed as the value crossed one of its rounding points." : "Neither display changed: the change was smaller than both resolutions.";
      }
      last = shown;
    };
    el.querySelector("#res-v").addEventListener("input", (e) => { v = +e.target.value; draw(); });
    el.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => { v = clamp(Math.round((v + +b.dataset.n) * 1000) / 1000, 0, 19.99); draw(); }));
    draw();
    el.querySelector(".res-note").textContent = "Resolution is the smallest change in the input that the instrument will respond to.";
  }

  /* =====================================================================
     Dynamic characteristics: first-order instrument response
     ===================================================================== */
  function mountDynamic(el, sec) {
    const S = { type: "step", tau: 1.0, dead: 0.3, f: 0.2 };
    el.innerHTML = `
      <p class="widget-lead">A thermometer is a typical <strong>first-order</strong> instrument: it takes time to warm up to the temperature it measures. Its <strong>time constant</strong> τ sets how fast it responds, and some instruments also have a pure <strong>dead time</strong> before they start to respond.</p>
      ${chips("Input change", [["step", "Step change"], ["ramp", "Linear change (ramp)"], ["sine", "Sinusoidal change"]], "step")}
      <div class="dyn-grid">
        <div>
          <div class="field slider-field"><label for="dy-tau">Time constant τ: <strong class="tau-val"></strong></label><input type="range" id="dy-tau" min="0.1" max="3" step="0.05"></div>
          <div class="field slider-field"><label for="dy-dead">Dead time: <strong class="dead-val"></strong></label><input type="range" id="dy-dead" min="0" max="2" step="0.1"></div>
          <div class="field slider-field sine-only"><label for="dy-f">Frequency of the change: <strong class="f-val"></strong></label><input type="range" id="dy-f" min="0.05" max="1" step="0.01"></div>
          <button type="button" class="btn ghost" data-play>▶ Replay</button>
        </div>
        <figure class="diagram plot-box"><div class="dyn-plot"></div>
          <figcaption><span class="key input"></span> True temperature (input) &nbsp; <span class="key analog"></span> Thermometer reading (output)</figcaption></figure>
      </div>
      <div class="dyn-metrics" aria-live="polite"></div>`;
    const W = 620, H = 250, l = 46, r = 12, t = 14, b = 30, T = 10, N = 1000, dt = T / N;
    const X = (s) => l + (s / T) * (W - l - r), Y = (v) => t + (1 - v / 100) * (H - t - b);
    const input = (s) => S.type === "step" ? (s < 1 ? 20 : 80) : S.type === "ramp" ? (s < 1 ? 20 : 20 + 6 * (s - 1)) : 50 + 25 * Math.sin(2 * Math.PI * S.f * s);
    let anim = null;

    function simulate() {
      const out = [input(0)];
      for (let i = 1; i <= N; i++) { const s = (i - 1) * dt, u = input(Math.max(0, s - S.dead)); out.push(out[i - 1] + (dt / S.tau) * (u - out[i - 1])); }
      return out;
    }
    function draw(upto = T) {
      const out = simulate();
      let grid = "", xin = "", yout = "";
      for (let v = 0; v <= 100; v += 20) grid += `<line class="gl" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v} °C</text>`;
      for (let s = 0; s <= T; s += 1) grid += `<text class="axis" x="${X(s)}" y="${H - 10}" text-anchor="middle">${s}${s === T ? " s" : ""}</text>`;
      for (let i = 0; i <= N; i += 2) { const s = i * dt; xin += `${i ? "L" : "M"}${X(s).toFixed(1)},${Y(input(s)).toFixed(1)}`; if (s <= upto) yout += `${i ? "L" : "M"}${X(s).toFixed(1)},${Y(out[i]).toFixed(1)}`; }
      let marks = "";
      const lagT = S.tau + S.dead;
      if (S.type === "step") {
        const t63 = 1 + lagT;
        marks = `<line class="mk" x1="${X(t63)}" x2="${X(t63)}" y1="${t}" y2="${H - b}"/><text class="mklab" x="${X(t63) + 4}" y="${t + 12}">63% at ${fx(t63)} s</text><line class="mk" x1="${l}" x2="${W - r}" y1="${Y(20 + 0.632 * 60)}" y2="${Y(20 + 0.632 * 60)}"/>`;
      } else if (S.type === "ramp") {
        const tm = 7, yo = out[Math.round(tm / dt)];
        marks = `<line class="lagline" x1="${X(tm)}" x2="${X(tm)}" y1="${Y(input(tm))}" y2="${Y(yo)}"/><text class="mklab" x="${X(tm) + 6}" y="${Y((input(tm) + yo) / 2) + 4}">dynamic error ${fx(input(tm) - yo, 1)} °C</text>`;
      }
      el.querySelector(".dyn-plot").innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Input temperature and thermometer reading against time">${grid}<path class="trace-in" d="${xin}"/><path class="trace-a" d="${yout}"/>${upto >= T ? marks : ""}</svg>`;

      el.querySelector(".tau-val").textContent = `${fx(S.tau)} s`;
      el.querySelector(".dead-val").textContent = `${fx(S.dead, 1)} s`;
      el.querySelector(".f-val").textContent = `${fx(S.f)} Hz`;
      el.querySelector(".sine-only").hidden = S.type !== "sine";
      ["tau", "dead", "f"].forEach((k) => { el.querySelector(`#dy-${k}`).value = S[k]; });

      const w = 2 * Math.PI * S.f, ratio = 1 / Math.sqrt(1 + (w * S.tau) ** 2), phaseT = Math.atan(w * S.tau) / w + S.dead;
      const M = {
        step: [
          ["Speed of response", `The reading reaches 63% of the 60 °C jump after τ + dead time = <strong>${fx(lagT)} s</strong>, and about 98% after 4τ + dead time = <strong>${fx(4 * S.tau + S.dead)} s</strong>.`],
          ["Lag", `The reading does not move at all for the first <strong>${fx(S.dead, 1)} s</strong> (dead time), then rises gradually.`],
          ["Dynamic error", `While it is still rising, the reading is below the true 80 °C. The error dies away once it settles.`]
        ],
        ramp: [
          ["Lag", `Once it settles, the reading trails the true temperature by <strong>τ + dead time = ${fx(lagT)} s</strong>.`],
          ["Dynamic error", `The temperature rises at 6 °C/s, so the reading stays <strong>6 × ${fx(lagT)} = ${fx(6 * lagT, 1)} °C</strong> too low. This error does not go away while the ramp continues.`],
          ["Speed of response", `A smaller τ makes the lag, and so the dynamic error, smaller.`]
        ],
        sine: [
          ["Fidelity", `The reading swings by <strong>${fx(ratio * 100, 1)}%</strong> of the true swing (${fx(25 * ratio, 1)} °C instead of 25 °C). ${ratio > 0.95 ? "High fidelity: a faithful copy." : ratio > 0.7 ? "Some of the change is lost." : "Low fidelity: most of the change is lost."}`],
          ["Lag", `Each peak of the reading arrives <strong>${fx(phaseT)} s</strong> after the true peak.`],
          ["Dynamic error", `Try a faster change (higher frequency) or a larger τ: the reading can no longer keep up.`]
        ]
      }[S.type];
      el.querySelector(".dyn-metrics").innerHTML = M.map(([k, v]) => `<div class="metric"><strong>${k}</strong><span>${v}</span></div>`).join("");
    }
    function play() {
      if (anim) cancelAnimationFrame(anim);
      if (reduceMotion) { draw(); return; }
      const t0 = performance.now();
      const frame = (now) => { const u = Math.min(T, ((now - t0) / 3000) * T); draw(u); if (u < T) anim = requestAnimationFrame(frame); };
      anim = requestAnimationFrame(frame);
    }
    wireChips(el.querySelector(".chips-row"), (k) => { S.type = k; play(); });
    ["tau", "dead", "f"].forEach((k) => el.querySelector(`#dy-${k}`).addEventListener("input", (e) => { S[k] = +e.target.value; draw(); }));
    el.querySelector("[data-play]").addEventListener("click", play);
    draw();
  }

  /* =====================================================================
     Standards pyramid
     ===================================================================== */
  const STANDARDS = [
    { k: "intl", name: "International standards", who: "Defined by international agreement and maintained by the International Bureau of Weights and Measures (BIPM) at Sèvres, near Paris.", use: "The most accurate standards that current science and technology can achieve. Countries compare their national standards against them.", ex: "Since 2019, SI units such as the kilogram are defined by fixed constants of nature instead of physical objects, and realised with instruments such as the Kibble balance." },
    { k: "primary", name: "Primary standards", who: "Kept by each country's national standards laboratory. In Malaysia this is the National Metrology Institute of Malaysia (NMIM), operated by SIRIM.", use: "Used to calibrate and certify secondary standards. Not used outside the national laboratory.", ex: "A national voltage standard used to certify the reference voltmeters of calibration labs." },
    { k: "secondary", name: "Secondary standards", who: "Held by industrial measurement and calibration laboratories. Each industry has its own.", use: "The lab's main reference. It is sent to the national laboratory from time to time for calibration, and comes back with a certificate that links its accuracy to the primary standard.", ex: "A calibration lab's reference resistors, sent for recalibration every year." },
    { k: "working", name: "Working standards", who: "Used on the lab bench and the factory floor.", use: "Used every day to check and calibrate lab instruments for accuracy and performance.", ex: "A resistor manufacturer checks the values of the resistors it produces against a working standard." }
  ];
  function mountStandards(el) {
    let cur = 1;
    const W = 420, H = 300, top = 20, rowH = 64, gap = 6, cx = W / 2;
    const halfW = (y) => 78 + (y - top) * 0.47;
    el.innerHTML = `<div class="std-grid">
        <figure class="diagram"><div class="std-svg"></div><figcaption>Select a level. Accuracy is highest at the top; the number of standards grows towards the bottom.</figcaption></figure>
        <div class="std-detail" aria-live="polite"></div>
      </div>`;
    const draw = () => {
      let s = `<svg viewBox="0 0 ${W + 60} ${H}" class="ckt pyramid" role="group" aria-label="Hierarchy of standards">`;
      s += `<defs><marker id="arrS" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" class="ah-ink"/></marker></defs>`;
      STANDARDS.forEach((st, i) => {
        const y0 = top + i * (rowH + gap), y1 = y0 + rowH;
        s += `<g class="lvl${i === cur ? " on" : ""}" data-i="${i}" tabindex="0" role="button" aria-pressed="${i === cur}" aria-label="${st.name}">
          <path d="M${cx - halfW(y0)},${y0}L${cx + halfW(y0)},${y0}L${cx + halfW(y1)},${y1}L${cx - halfW(y1)},${y1}Z"/>
          <text x="${cx}" y="${y0 + rowH / 2 + 5}" text-anchor="middle">${st.name.replace(" standards", "")}</text></g>`;
      });
      s += `<line class="w" x1="${W + 30}" y1="${H - 20}" x2="${W + 30}" y2="${top + 6}" marker-end="url(#arrS)"/><text x="${W + 22}" y="${H / 2}" class="small" text-anchor="middle" transform="rotate(-90 ${W + 22} ${H / 2})">accuracy increases</text>`;
      s += `</svg>`;
      el.querySelector(".std-svg").innerHTML = s;
      const st = STANDARDS[cur];
      el.querySelector(".std-detail").innerHTML = `<h4>${st.name}</h4><p><strong>Who keeps it:</strong> ${st.who}</p><p><strong>What it's for:</strong> ${st.use}</p><p class="std-ex"><strong>Example:</strong> ${st.ex}</p>
        ${cur > 0 ? `<p class="std-trace">Calibrated against the <strong>${STANDARDS[cur - 1].name.toLowerCase()}</strong> above it. This unbroken chain of calibrations is called <em>traceability</em>.</p>` : `<p class="std-trace">The top of the chain: every calibration below traces back to here.</p>`}`;
    };
    el.addEventListener("click", (e) => { const g = e.target.closest(".lvl"); if (g) { cur = +g.dataset.i; draw(); el.querySelector(`.lvl[data-i="${cur}"]`).focus(); } });
    el.addEventListener("keydown", (e) => {
      const g = e.target.closest(".lvl");
      if (!g) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cur = +g.dataset.i; draw(); el.querySelector(`.lvl[data-i="${cur}"]`).focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cur = clamp(cur + (e.key === "ArrowDown" ? 1 : -1), 0, 3); draw(); el.querySelector(`.lvl[data-i="${cur}"]`).focus(); }
    });
    draw();
  }

  /* =====================================================================
     Statistics lab
     ===================================================================== */
  function parseData(s) { return s.split(/[\s,;]+/).map((x) => x.replace(/−/g, "-")).filter((x) => x !== "").map(Number); }
  function stats(xs) {
    const nn = xs.length, mean = sum(xs) / nn, d = xs.map((x) => x - mean), ad = d.map(Math.abs), d2 = d.map((x) => x * x);
    const sumD = sum(d), sumAd = sum(ad), sumD2 = sum(d2);
    return { n: nn, mean, d, ad, d2, sumD: Math.abs(sumD) < 1e-9 * Math.max(1, Math.abs(mean)) ? 0 : sumD, sumAd, sumD2, avgDev: sumAd / nn, sdPop: Math.sqrt(sumD2 / nn), sdSample: nn > 1 ? Math.sqrt(sumD2 / (nn - 1)) : NaN, P: xs.map((x) => 1 - Math.abs(x - mean) / Math.abs(mean)) };
  }
  function statsSteps(xs, st, u, focus) {
    const U = u ? ` ${u}` : "";
    const list = xs.length <= 10 ? xs.map((x) => num(x, 6)).join(" + ") : `${num(xs[0], 6)} + ${num(xs[1], 6)} + … + ${num(xs[xs.length - 1], 6)}`;
    const steps = [
      step("Arithmetic mean", "x̄ = Σx<sub>n</sub> / n", `= (${list}) / ${st.n} = ${num(sum(xs), 6)} / ${st.n}`, `x̄ = ${num(st.mean, 7)}${U}`),
      step("Deviation of each reading", `d<sub>n</sub> = x<sub>n</sub> ${MINUS} x̄`, `e.g. d<sub>1</sub> = ${num(xs[0], 6)} ${MINUS} ${num(st.mean, 7)}`,
        xs.length <= 10 ? st.d.map((x, i) => `d<sub>${i + 1}</sub> = ${num(x, 4)}`).join(", ") : `d<sub>1</sub> = ${num(st.d[0], 4)}${U} (all deviations are in the table)`),
      step("Algebraic sum of the deviations", `Σd<sub>n</sub>`, st.d.slice(0, 6).map((x) => PN(x, 4)).join(" + ") + (st.n > 6 ? " + …" : ""), `Σd<sub>n</sub> = ${num(st.sumD, 4)}. The deviations always cancel, so this is always zero.`),
      step("Average deviation", `d̄ = Σ|d<sub>n</sub>| / n`, `= ${num(st.sumAd, 5)} / ${st.n}`, `d̄ = ${num(st.avgDev, 4)}${U}`),
      step("Standard deviation, population (divide by N)", `σ = √(Σd<sub>n</sub>² / N)`, `= √(${num(st.sumD2, 5)} / ${st.n})`, `σ = ${num(st.sdPop, 4)}${U}`),
      step("Standard deviation, sample (divide by n − 1)", `σ = √(Σd<sub>n</sub>² / (n ${MINUS} 1))`, `= √(${num(st.sumD2, 5)} / ${st.n - 1})`, `σ = ${num(st.sdSample, 4)}${U}`)
    ];
    if (focus) {
      const i = focus - 1;
      steps.push(step(`Precision of reading ${focus}`, `P<sub>${focus}</sub> = 1 ${MINUS} |x<sub>${focus}</sub> ${MINUS} x̄| / x̄`, `= 1 ${MINUS} |${num(xs[i], 6)} ${MINUS} ${num(st.mean, 7)}| / ${num(st.mean, 7)}`, `P<sub>${focus}</sub> = ${num(st.P[i], 4)}`));
    }
    return steps;
  }

  function mountStats(el, sec) {
    const DEFAULT = "100.2, 99.8, 100.5, 100.1, 99.7, 100.3, 100.0, 99.9";
    el.innerHTML = `
      <div class="stats-in">
        <label for="st-data">Your readings <span class="hint">type or paste, separated by commas or spaces</span></label>
        <textarea id="st-data" rows="2" spellcheck="false" inputmode="decimal" aria-describedby="st-err">${DEFAULT}</textarea>
        <div class="stats-row"><label for="st-unit">Unit</label><input id="st-unit" type="text" value="Ω" maxlength="6">
          <button type="button" class="btn ghost" data-add>Add a random reading</button><button type="button" class="btn ghost" data-reset>Reset</button></div>
        <p class="err" id="st-err" hidden></p>
      </div>
      <figure class="diagram plot-box"><div class="st-plot"></div><figcaption><span class="key digital"></span> Readings &nbsp; <span class="key analog"></span> Mean x̄ &nbsp; <span class="key band"></span> x̄ ± σ (sample)</figcaption></figure>
      <div class="table-wrap st-table"></div>
      <div class="working"><h4>Step-by-step working</h4><p class="result" aria-live="polite"></p><ol class="steps"></ol></div>`;
    const ta = el.querySelector("#st-data"), unitEl = el.querySelector("#st-unit"), err = el.querySelector("#st-err");
    const draw = () => {
      const xs = parseData(ta.value), u = unitEl.value.trim();
      const bad = xs.some((x) => !isFinite(x));
      err.hidden = true; ta.removeAttribute("aria-invalid");
      if (bad || xs.length < 2) {
        err.textContent = bad ? "Only numbers please, separated by commas or spaces." : "Enter at least two readings.";
        err.hidden = false; ta.setAttribute("aria-invalid", "true");
        el.querySelector(".result").textContent = "Fix the readings to see the working.";
        el.querySelector(".steps").innerHTML = ""; return;
      }
      if (xs.length > 40) { err.textContent = "Only the first 40 readings are used."; err.hidden = false; xs.length = 40; }
      const st = stats(xs);
      el.querySelector(".result").innerHTML = `n = ${st.n}, x̄ = ${num(st.mean, 7)}, d̄ = ${num(st.avgDev, 4)}, σ = ${num(st.sdPop, 4)} (population), ${num(st.sdSample, 4)} (sample)${u ? ` ${esc(u)}` : ""}`;
      el.querySelector(".steps").innerHTML = stepsHtml(statsSteps(xs, st, esc(u)));
      el.querySelector(".st-table").innerHTML = `<table class="sched stats-table"><thead><tr><th>n</th><th>x<sub>n</sub></th><th>d<sub>n</sub> = x<sub>n</sub> ${MINUS} x̄</th><th>|d<sub>n</sub>|</th><th>d<sub>n</sub>²</th><th>Precision P<sub>n</sub></th></tr></thead><tbody>
        ${xs.map((x, i) => `<tr><td>${i + 1}</td><td>${num(x, 6)}</td><td>${num(st.d[i], 4)}</td><td>${num(st.ad[i], 4)}</td><td>${num(st.d2[i], 4)}</td><td>${num(st.P[i], 4)}</td></tr>`).join("")}
        </tbody><tfoot><tr><th>Σ</th><td>${num(sum(xs), 6)}</td><td>${num(st.sumD, 4)}</td><td>${num(st.sumAd, 4)}</td><td>${num(st.sumD2, 4)}</td><td></td></tr></tfoot></table>`;
      // Dot plot
      const W = 600, H = 150, l = 20, r = 20, lo = Math.min(...xs, st.mean - 2 * st.sdSample), hi = Math.max(...xs, st.mean + 2 * st.sdSample), pad = (hi - lo) * 0.08 || 1;
      const X = (x) => l + ((x - (lo - pad)) / (hi - lo + 2 * pad)) * (W - l - r), base = 110;
      const stack = {};
      let s = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Dot plot of ${st.n} readings with the mean and one standard deviation either side">`;
      s += `<rect class="band" x="${X(st.mean - st.sdSample)}" y="14" width="${X(st.mean + st.sdSample) - X(st.mean - st.sdSample)}" height="${base - 14}"/>`;
      s += `<line class="gl" x1="${l}" x2="${W - r}" y1="${base}" y2="${base}"/>`;
      for (let k = 0; k <= 4; k++) { const v = lo - pad + ((hi - lo + 2 * pad) * k) / 4; s += `<text class="axis" x="${X(v)}" y="${base + 20}" text-anchor="middle">${num(v, 4)}</text>`; }
      xs.forEach((x) => { const key = X(x).toFixed(0), c = (stack[key] = (stack[key] || 0) + 1); s += `<circle class="shot" cx="${X(x)}" cy="${base - 8 - (c - 1) * 12}" r="5"/>`; });
      s += `<line class="meanline" x1="${X(st.mean)}" x2="${X(st.mean)}" y1="10" y2="${base}"/><text class="mklab" x="${X(st.mean) + 5}" y="22">x̄ = ${num(st.mean, 7)}</text></svg>`;
      el.querySelector(".st-plot").innerHTML = s;
    };
    ta.addEventListener("input", draw); unitEl.addEventListener("input", draw);
    el.querySelector("[data-add]").addEventListener("click", () => {
      const xs = parseData(ta.value).filter(isFinite), st = xs.length > 1 ? stats(xs) : { mean: 100, sdSample: 0.3 };
      const dec = Math.max(1, ...xs.map((x) => ((String(x).split(".")[1] || "").length)));
      ta.value = `${ta.value.trim()}, ${(st.mean + gauss(Math.random) * (st.sdSample || 0.3)).toFixed(Math.min(dec, 4))}`;
      draw();
    });
    el.querySelector("[data-reset]").addEventListener("click", () => { ta.value = DEFAULT; unitEl.value = "Ω"; draw(); });
    sec.load = (vals) => { ta.value = vals.data; unitEl.value = vals.unit || ""; draw(); };
    draw();
  }

  /* =====================================================================
     Significant figures drill
     ===================================================================== */
  function sigCount(str) {
    let s = str.trim().replace(/^[+\-−]/, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return NaN;
    if (s.includes(".")) { s = s.replace(".", "").replace(/^0+/, ""); return s.length || 1; }
    return s.replace(/^0+/, "").replace(/0+$/, "").length || 1;
  }
  const decimals = (str) => (str.includes(".") ? str.split(".")[1].length : 0);
  function makeSigQ() {
    const type = Math.floor(Math.random() * 5), R = Math.random;
    if (type === 0) {
      const pool = ["0.0148", "15.046", "0.00450", "2.030", "100.0", "6.31", "8.736", "40.10", "3.0005", "0.060", "1250.0", "0.7020"];
      const x = pool[Math.floor(R() * pool.length)], c = sigCount(x);
      return { q: `How many significant figures are in <strong>${x}</strong>?`, check: (a) => Number(a) === c,
        hint: "Leading zeros never count. Zeros between non-zero digits always count. Trailing zeros after the decimal point count, because someone measured them.",
        why: `${x} has <strong>${c}</strong> significant figures${/^0\.0/.test(x) ? ": the zeros at the front only place the decimal point" : /\.\d*0$/.test(x) ? ": the zero at the end counts, because it was measured" : ""}.` };
    }
    if (type === 1) {
      const k = Math.floor(R() * 5) - 3, sf = 2 + Math.floor(R() * 2), x = Number(((1 + R() * 8.99) * 10 ** k).toPrecision(5));
      const exp = Number(x).toPrecision(sf);
      if (/e/.test(exp)) return makeSigQ(); // e.g. 99.97 → "1.0e+2": pick another number
      return { q: `Round <strong>${x}</strong> to <strong>${sf}</strong> significant figures.`, check: (a) => Math.abs(Number(a) - Number(exp)) < 1e-12 && sigCount(a) === sf,
        hint: `Start counting at the first non-zero digit and keep ${sf} digits. Then look at the first digit you drop: 5 or more rounds the last kept digit up.`,
        why: `${x} to ${sf} significant figures is <strong>${exp}</strong>.` };
    }
    if (type === 2) {
      const a = (1 + R() * 20).toFixed(2), b = (1 + R() * 20).toFixed(3), exact = Number(a) + Number(b), exp = exact.toFixed(2);
      return { q: `Add <strong>${a} V + ${b} V</strong> and give the answer to the correct precision.`, check: (x) => Math.abs(Number(x) - Number(exp)) < 1e-9 && decimals(x) === 2,
        hint: "For adding and subtracting, count decimal places, not significant figures. The answer keeps as many decimal places as the number with the fewest.",
        why: `${a} + ${b} = ${num(exact, 7)}. ${a} V says nothing about the thousandths place, so the answer keeps 2 decimal places: <strong>${exp} V</strong>.` };
    }
    if (type === 3) {
      const a = (1 + R() * 8.99).toFixed(2), b = (1 + R() * 8.9).toFixed(1), exact = Number(a) * Number(b), exp = exact.toPrecision(2);
      return { q: `A current of <strong>${a} A</strong> flows through <strong>${b} Ω</strong>. Calculate the voltage V = IR to the correct number of significant figures.`, check: (x) => Math.abs(Number(x) - Number(exp)) < 1e-9 && sigCount(x) === sigCount(exp),
        hint: "For multiplying and dividing, count significant figures. The answer keeps as many as the quantity with the fewest.",
        why: `${a} × ${b} = ${num(exact, 6)}. ${a} A has 3 significant figures but ${b} Ω has only 2, so the answer is <strong>${exp} V</strong>.` };
    }
    // Rounding in one step: x.46 to x.49 rounded to 1 significant figure (x.45 avoided: binary floating point rounds it unpredictably)
    const whole = 1 + Math.floor(R() * 8), x = `${whole}.4${6 + Math.floor(R() * 4)}`;
    return { q: `Round <strong>${x}</strong> to <strong>1</strong> significant figure.`, check: (a) => a === String(whole),
      hint: `Look only at the first digit you drop, which is the 4. Don't round ${x} to ${(Number(x)).toFixed(1)} first and then round again.`,
      why: `The first dropped digit is 4, so ${x} rounds down to <strong>${whole}</strong>. Rounding in two steps (${x} → ${(Number(x)).toFixed(1)} → ${whole + 1}) gives the wrong answer.` };
  }
  function mountSigFig(el) {
    let Q, streak = 0;
    el.innerHTML = `<div class="quiz-card sig-card">
        <div class="quiz-top"><span>Practice</span><span class="streak">Correct in a row: 0</span></div>
        <p class="quiz-q sig-q"></p>
        <form class="sig-form" novalidate><div class="ans-in"><input type="text" inputmode="decimal" aria-label="Your answer" autocomplete="off" spellcheck="false"><button type="submit" class="btn">Check</button></div></form>
        <p class="quiz-fb" aria-live="polite"></p>
        <button type="button" class="btn ghost" data-next>New question</button>
      </div>`;
    const inp = el.querySelector("input"), fb = el.querySelector(".quiz-fb");
    const next = () => { Q = makeSigQ(); el.querySelector(".sig-q").innerHTML = Q.q; inp.value = ""; fb.innerHTML = ""; inp.disabled = false; };
    el.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const a = inp.value.trim().replace(/−/g, "-").replace(/\s*(V|Ω|A)$/i, "");
      if (!a) { fb.textContent = "Type an answer first."; return; }
      if (Q.check(a)) { streak++; fb.innerHTML = `<strong>✓ Correct.</strong> ${Q.why}`; inp.disabled = true; el.querySelector("[data-next]").focus(); }
      else { streak = 0; fb.innerHTML = `<strong>✗ Not yet.</strong> ${Q.hint}`; }
      el.querySelector(".streak").textContent = `Correct in a row: ${streak}`;
    });
    el.querySelector("[data-next]").addEventListener("click", () => { next(); inp.focus(); });
    next();
  }

  /* =====================================================================
     Static errors: parallax demo and sorting quiz
     ===================================================================== */
  function mountParallax(el) {
    const S = { ang: 20, mirror: false }, TRUE = 6.2;
    el.innerHTML = `
      <p class="widget-lead">The pointer sits a few millimetres above the scale. If your eye is not directly above it, the pointer lines up with the wrong mark: that is <strong>parallax error</strong>, the most common observational error.</p>
      <div class="par-grid">
        <figure class="diagram"><div class="par-svg"></div></figure>
        <div>
          <div class="field slider-field"><label for="par-ang">Eye position: <strong class="ang-val"></strong></label><input type="range" id="par-ang" min="-35" max="35" step="1"></div>
          <label class="check"><input type="checkbox" id="par-mirror"> Show the anti-parallax mirror</label>
          <p class="par-read" aria-live="polite"></p>
        </div>
      </div>`;
    const cx = 260, cy = 250, R = 190, a0 = -55, a1 = 55;
    const angOf = (v) => ((a0 + (v / 10) * (a1 - a0)) * Math.PI) / 180;
    const P = (v, r) => [cx + r * Math.sin(angOf(v)), cy - r * Math.cos(angOf(v))];
    const draw = () => {
      // Pointer sits above the scale: seen from the right it lines up with a mark further left (lower),
      // and its reflection in the mirror (below the scale) appears the same amount to the other side.
      const off = -0.9 * Math.tan((S.ang * Math.PI) / 180), seen = TRUE + off;
      let s = `<svg viewBox="50 0 430 275" class="ckt parallax" role="img" aria-label="Meter scale with pointer at ${TRUE} volts. The eye reads ${fx(seen)} volts.">`;
      s += `<path d="M${P(0, R)[0]},${P(0, R)[1]}A${R},${R} 0 0 1 ${P(10, R)[0]},${P(10, R)[1]}" class="w"/>`;
      if (S.mirror) s += `<path d="M${P(0, R - 22)[0]},${P(0, R - 22)[1]}A${R - 22},${R - 22} 0 0 1 ${P(10, R - 22)[0]},${P(10, R - 22)[1]}" class="mirror"/>`;
      for (let v = 0; v <= 10.001; v += 0.2) {
        const major = Math.abs(v - Math.round(v)) < 1e-6, [x1, y1] = P(v, R), [x2, y2] = P(v, R + (major ? 16 : 8));
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="w thin"/>`;
        if (major && Math.round(v) % 2 === 0) { const [tx, ty] = P(v, R + 30); s += `<text x="${tx}" y="${ty + 4}" text-anchor="middle">${Math.round(v)}</text>`; }
      }
      if (S.mirror && Math.abs(off) > 0.01) { const [mx, my] = P(TRUE - off, R - 4); s += `<line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" class="reflection"/>`; }
      const [nx, ny] = P(TRUE, R + 6); s += `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" class="needle"/>`;
      const [sx, sy] = P(seen, R + 12); s += `<line x1="${cx}" y1="${cy}" x2="${sx}" y2="${sy}" class="seen"/>`;
      const ex = cx + 230 * Math.sin((S.ang * Math.PI) / 180) + (P(TRUE, R)[0] - cx), ey = 18;
      s += `<line x1="${ex}" y1="${ey + 8}" x2="${sx}" y2="${sy}" class="sight"/>`;
      s += `<g transform="translate(${ex},${ey})" class="eye"><path d="M-14,0Q0,-10 14,0Q0,10 -14,0Z"/><circle r="4"/></g>`;
      s += `<circle cx="${cx}" cy="${cy}" r="7" class="gpivot"/><text x="${cx}" y="${cy + 24}" text-anchor="middle" class="small">V</text></svg>`;
      el.querySelector(".par-svg").innerHTML = s;
      el.querySelector(".ang-val").textContent = S.ang === 0 ? "directly above" : `${Math.abs(S.ang)}° to the ${S.ang < 0 ? "left" : "right"}`;
      el.querySelector("#par-ang").value = S.ang;
      const e = seen - TRUE;
      el.querySelector(".par-read").innerHTML = Math.abs(e) < 0.005
        ? `You read <strong>${fx(seen)} V</strong>, the true value. Looking straight down removes parallax error.${S.mirror ? " With the mirror, the pointer now hides its own reflection." : ""}`
        : `You read <strong>${fx(seen)} V</strong> but the pointer is at <strong>${fx(TRUE)} V</strong>: an error of ${e > 0 ? "+" : MINUS}${fx(Math.abs(e))} V (${fx((Math.abs(e) / TRUE) * 100, 1)}%). ${S.mirror ? "The grey line is the pointer's reflection. Move your eye until the pointer covers its reflection." : "Turn on the mirror to see how meters help you find the right position."}`;
    };
    el.querySelector("#par-ang").addEventListener("input", (e) => { S.ang = +e.target.value; draw(); });
    el.querySelector("#par-mirror").addEventListener("change", (e) => { S.mirror = e.target.checked; draw(); });
    draw();
  }

  const ERR_OPTS = ["Gross (human)", "Instrumental", "Environmental", "Observational", "Random"];
  const ERR_QUIZ = [
    { q: "A student reads 3.8 V from a meter but writes 8.3 V in the lab report.", a: 0, why: "A human mistake in recording. Taking and checking several readings catches it." },
    { q: "A student forgets to zero an analog ohmmeter before measuring.", a: 0, why: "Incorrect adjustment of the instrument by the user is a gross error." },
    { q: "The spiral spring in an old moving-coil meter has stretched, so every reading is a little high.", a: 1, why: "A fault in the instrument's own mechanism. Calibrate it against a standard or apply a correction factor." },
    { q: "Friction in a meter's bearings stops the pointer from settling in exactly the right place.", a: 1, why: "An instrumental error, caused by the meter's mechanical structure." },
    { q: "A resistance measured in a hot lab in the afternoon is higher than the same measurement taken in the cool morning.", a: 2, why: "Temperature is an external condition. Control the environment, for example with air-conditioning." },
    { q: "A meter placed next to a large transformer gives readings that drift.", a: 2, why: "The transformer's magnetic field is an environmental effect. A magnetic shield reduces it." },
    { q: "A student reads a pointer meter while looking at it from the side.", a: 3, why: "Parallax is the classic observational error. Look straight down, or use the mirror scale." },
    { q: "Repeated readings of the same voltage differ slightly in an unpredictable way, sometimes higher and sometimes lower, even after every known cause is removed.", a: 4, why: "Random errors have no single cause you can remove. Take many readings and use the mean and standard deviation." }
  ];

  /* =====================================================================
     Sections
     ===================================================================== */
  const SECTIONS = [
    /* ---------------- Basics ---------------- */
    { id: "iot", group: "basics", title: "Instrumentation in the Internet of Things", toc: "IoT",
      intro: `<p>The <strong>Internet of Things (IoT)</strong> is a system of connected devices, machines and objects, each with a unique identifier (UID), that share data over a network without needing a person to pass it on. Every IoT system has three parts. Choose an example to see what each part does.</p>`,
      mount(el) {
        el.innerHTML = `${chips("IoT example", Object.entries(IOT).map(([k, v]) => [k, v.label]), "farm")}
          <div class="iot-flow">
            <div class="iot-card meas-card"><div class="iot-icon">${ICON.sensor}</div><h4>Connected things</h4><p class="iot-role">Sensors measure, actuators act.</p><p class="iot-ex" data-p="things"></p><span class="iot-tag">Measurement: this course</span></div>
            <div class="iot-arrow" aria-hidden="true"></div>
            <div class="iot-card"><div class="iot-icon">${ICON.cloud}</div><h4>Connectivity and infrastructure</h4><p class="iot-role">Carries the data: radio links, gateways, the internet, cloud servers.</p><p class="iot-ex" data-p="conn"></p></div>
            <div class="iot-arrow" aria-hidden="true"></div>
            <div class="iot-card"><div class="iot-icon">${ICON.chart}</div><h4>Analytics and applications</h4><p class="iot-role">Turns data into information, decisions and actions.</p><p class="iot-ex" data-p="app"></p></div>
          </div>`;
        const set = (k) => ["things", "conn", "app"].forEach((p) => { el.querySelector(`[data-p="${p}"]`).textContent = IOT[k][p]; });
        wireChips(el.querySelector(".chips-row"), set);
        set("farm");
      },
      after: `<div class="callout info"><strong>Where instrumentation fits</strong>No IoT system is better than its data. The sensors and the circuits that condition, convert and transmit their signals are electronic instrumentation, and that is what this course is about.</div>` },

    { id: "what", group: "basics", title: "What is instrumentation?", toc: "Measurement vs control",
      intro: `<p><strong>Instrumentation</strong> is the branch of engineering that deals with <strong>measurement and control</strong>. In a feedback control system, the measurement part tells the control part what is really happening. This course concentrates on the measurement part. Use the buttons to highlight each part.</p>`,
      mount(el) {
        el.innerHTML = `${chips("Highlight", [["both", "Both parts"], ["meas", "Measurement part"], ["ctrl", "Control part"]], "both")}
          <figure class="diagram blocks-fig" data-show="both"><div class="ckt-wrap">${BLOCK_SVG}</div>
            <figcaption>Feedback control system. <span class="swipe">Swipe sideways to see the whole diagram.</span></figcaption></figure>
          <div class="defs">
            <div><dt>Metrology</dt><dd>The science of measurement, both theory and practice: finding the amount of a quantity by comparing it with accepted standards.</dd></div>
            <div><dt>Instrument</dt><dd>A device for finding the value or size of a quantity or variable.</dd></div>
            <div><dt>Electronic instrument</dt><dd>An instrument that uses electrical or electronic principles to measure.</dd></div>
          </div>
          <h4 class="sub-h">Why measure electronically?</h4>
          <ul class="ticks"><li><strong>High sensitivity and little loading.</strong> Amplifiers boost tiny signals, and their high input impedance draws almost no power from what is being measured.</li><li><strong>Remote monitoring.</strong> An electrical signal can be sent by wire or radio and read far away.</li></ul>`;
        wireChips(el.querySelector(".chips-row"), (k) => { el.querySelector(".blocks-fig").dataset.show = k; });
      } },

    /* ---------------- Classification ---------------- */
    { id: "classes", group: "classify", title: "Four ways to classify an instrument", toc: "Four classifications",
      intro: `<p>The same instrument can be described in four different ways. Choose a tab.</p>`,
      mount(el) {
        el.innerHTML = `<div class="tabs" role="tablist" aria-label="Ways to classify instruments">${CLASSES.map((c, i) => `<button type="button" role="tab" id="tab-${c.k}" aria-controls="panel-${c.k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${String.fromCharCode(97 + i)}) ${c.tab}</button>`).join("")}</div>
          ${CLASSES.map((c, i) => `<div class="tabpanel" role="tabpanel" id="panel-${c.k}" aria-labelledby="tab-${c.k}"${i ? " hidden" : ""}>
            <p class="panel-intro">${c.intro}</p>
            <div class="class-cards">${c.items.map((it) => `<article class="class-card">${photo(it.photo)}<div><h4>${it.name}</h4><p>${it.text}</p><p class="class-ex"><strong>Examples:</strong> ${it.ex}</p></div></article>`).join("")}</div>
          </div>`).join("")}`;
        const tabs = [...el.querySelectorAll('[role="tab"]')];
        const select = (t) => {
          tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; el.querySelector(`#${x.getAttribute("aria-controls")}`).hidden = !on; });
          t.focus();
        };
        tabs.forEach((t, i) => {
          t.addEventListener("click", () => select(t));
          t.addEventListener("keydown", (e) => {
            const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
            if (k) { e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length]); }
            if (e.key === "Home") { e.preventDefault(); select(tabs[0]); }
            if (e.key === "End") { e.preventDefault(); select(tabs[tabs.length - 1]); }
          });
        });
      } },

    { id: "bridge", group: "classify", title: "Null technique: the Wheatstone bridge", toc: "Wheatstone bridge",
      intro: `<p>Two voltage dividers share one supply. When V<sub>a</sub> = V<sub>b</sub>, no current flows through the galvanometer: the bridge is at <strong>null</strong>. Then the voltage across R<sub>1</sub> equals the voltage across R<sub>3</sub> (I<sub>1</sub>R<sub>1</sub> = I<sub>2</sub>R<sub>3</sub>), and the voltage across R<sub>2</sub> equals the voltage across R<sub>x</sub> (I<sub>1</sub>R<sub>2</sub> = I<sub>2</sub>R<sub>x</sub>). Dividing one equation by the other cancels the currents:</p>
        <p class="formula">R<sub>x</sub> = (R<sub>2</sub> / R<sub>1</sub>) × R<sub>3</sub></p>
        <p>Turn the R<sub>3</sub> dials with ▲ and ▼ to balance the bridge. In <strong>Challenge</strong> mode R<sub>x</sub> is hidden, just like in the lab.</p>`,
      mount: mountBridge },

    { id: "signal", group: "classify", title: "Analog vs digital signals", toc: "Analog vs digital",
      intro: `<p>An <strong>analog</strong> instrument's output varies continuously, so it can take any value in its range. A <strong>digital</strong> instrument's output changes in steps, so it can only show a finite number of values. Slide the resolution to see how the steps change.</p>`,
      mount: mountSignal },

    { id: "classquiz", group: "classify", title: "Check yourself: classify it", toc: "Quiz",
      intro: `<p>Ten quick questions. You get feedback after each one.</p>`,
      mount: (el) => quiz(el, CLASS_QUIZ) },

    /* ---------------- Characteristics ---------------- */
    { id: "static", group: "chars", title: "Static characteristics", toc: "Static",
      intro: `<p><strong>Performance characteristics</strong> describe how well an instrument performs, so you can choose the right one for a job. <strong>Static</strong> characteristics apply to quantities that are constant or change slowly.</p>
        <dl class="defs">
          <div><dt>Accuracy</dt><dd>How close a measurement is to the expected value.</dd></div>
          <div><dt>Precision</dt><dd>How consistent repeated measurements are: successive readings do not differ much.</dd></div>
          <div><dt>Resolution</dt><dd>The smallest change in the measured quantity that the instrument will respond to.</dd></div>
          <div><dt>Sensitivity</dt><dd>The change in output for a given change in input: S = Δoutput / Δinput.</dd></div>
          <div><dt>Expected value</dt><dd>The design value, or the most probable value you expect to obtain.</dd></div>
          <div><dt>Error</dt><dd>The difference between the true (expected) value and the measured value.</dd></div>
        </dl>
        <h4 class="sub-h">Accuracy is not the same as precision</h4>`,
      mount: mountTarget },

    { id: "resolution", group: "chars", title: "Resolution", toc: "Resolution", mount: mountResolution },

    { id: "sensitivity", group: "chars", title: "Sensitivity calculator", toc: "Sensitivity",
      intro: `<p>An LM35 temperature sensor, for example, gives 10 mV more output for every 1 °C rise. Enter any change in output and the change in input that caused it.</p>`,
      inputs: [
        F("dOut", "num", 250, "change in output", { label: "Δoutput", positive: false, validate: (x) => (x === 0 ? "Must not be 0." : null) }),
        F("outU", "sel", "mV", null, { label: "Output unit", options: [["mV", "mV"], ["V", "V"], ["mA", "mA"], ["mm", "mm (pointer movement)"], ["°", "° (pointer deflection)"]] }),
        F("dIn", "num", 25, "change in input", { label: "Δinput", positive: false, validate: (x) => (x === 0 ? "Must not be 0." : null) }),
        F("inU", "sel", "°C", null, { label: "Input unit", options: [["°C", "°C"], ["V", "V"], ["mA", "mA"], ["kPa", "kPa"], ["N", "N"]] })
      ],
      compute(v) {
        const S = v.dOut / v.dIn, u = `${v.outU}/${v.inU}`;
        return { sum: `Sensitivity S = ${num(S)} ${u}`, steps: [
          step("Sensitivity", "S = Δoutput / Δinput", `= ${num(v.dOut)} ${v.outU} / ${num(v.dIn)} ${v.inU}`, `S = ${num(S)} ${u}`),
          step("What it means", "", "", `Every 1 ${v.inU} change at the input moves the output by ${num(Math.abs(S))} ${v.outU}. A larger S means a more sensitive instrument.`)
        ], notes: [] };
      } },

    { id: "dynamic", group: "chars", title: "Dynamic characteristics", toc: "Dynamic",
      intro: `<p><strong>Dynamic</strong> characteristics apply to quantities that change with time. Real instruments never respond instantly, because of mass, thermal capacitance, fluid capacitance or electrical capacitance. To test one, you apply a known change to its sensing element: a <strong>step</strong>, a <strong>linear (ramp)</strong> change or a <strong>sinusoidal</strong> change. The four dynamic characteristics:</p>
        <dl class="defs">
          <div><dt>Speed of response</dt><dd>How quickly the instrument responds to a change.</dd></div>
          <div><dt>Lag</dt><dd>The delay before the output responds to a change.</dd></div>
          <div><dt>Dynamic error</dt><dd>The difference between the true and the measured value while the quantity is changing (with no static error).</dd></div>
          <div><dt>Fidelity</dt><dd>How faithfully the output follows the changes, without dynamic error.</dd></div>
        </dl>`,
      mount: mountDynamic },

    /* ---------------- Standards ---------------- */
    { id: "standards", group: "standards", title: "The hierarchy of standards", toc: "Four categories",
      intro: `<p>A <strong>standard</strong> is a known, accurate measure of a physical quantity. Other measurements get their values by comparison with it. There are four categories, each calibrated against the one above.</p>`,
      mount: mountStandards,
      after: `<div class="callout info"><strong>Good to know</strong><strong>BIPM</strong> stands for <em>Bureau International des Poids et Mesures</em>, French for the International Bureau of Weights and Measures. It is at Sèvres, just outside Paris.</div>` },

    /* ---------------- Errors ---------------- */
    { id: "errcalc", group: "errors", title: "Error and accuracy calculator", toc: "Error and accuracy",
      intro: `<p>Measurement always introduces some error. It comes from three main sources: the <strong>limitations of the instrument</strong> (its accuracy is given as a percentage of full-scale deflection), the <strong>operator</strong> (for example misreading a scale), and the <strong>instrument disturbing the circuit</strong> it measures. For an expected value Y<sub>n</sub> and a measured value X<sub>n</sub>:</p>`,
      inputs: [
        F("Yn", "num", 50, null, { unit: "V", positive: false, validate: (x) => (x === 0 ? "The expected value must not be 0." : null), label: "Expected value Y<sub>n</sub>" }),
        F("Xn", "num", 49.2, null, { unit: "V", positive: false, label: "Measured value X<sub>n</sub>" })
      ],
      view: "0 0 520 130", caption: "Expected and measured values on a number line.", figLabel: "Number line showing the expected and measured values and the error between them",
      diagram(T, lab, v, res) {
        if (v.Yn === undefined || v.Xn === undefined) return `<text x="260" y="70" text-anchor="middle">Enter both values</text>`;
        const span = Math.max(Math.abs(v.Yn - v.Xn) * 1.6, Math.abs(v.Yn) * 0.01, 1e-9), lo = Math.min(v.Yn, v.Xn) - span * 0.35, hi = Math.max(v.Yn, v.Xn) + span * 0.35;
        const X = (x) => 40 + ((x - lo) / (hi - lo)) * 440, y = 70;
        return `<line class="w" x1="30" y1="${y}" x2="490" y2="${y}"/>
          <line class="w" x1="${X(v.Yn)}" y1="${y - 14}" x2="${X(v.Yn)}" y2="${y + 14}"/><circle class="mk-exp" cx="${X(v.Yn)}" cy="${y}" r="6"/>
          <text x="${X(v.Yn)}" y="${y - 22}" text-anchor="middle">Expected Y<tspan class="sb" dy="4">n</tspan><tspan dy="-4"> = </tspan><tspan class="val">${lab.Yn}</tspan></text>
          <circle class="mk-meas" cx="${X(v.Xn)}" cy="${y}" r="6"/>
          <text x="${X(v.Xn)}" y="${y + 34}" text-anchor="middle">Measured X<tspan class="sb" dy="4">n</tspan><tspan dy="-4"> = </tspan><tspan class="val">${lab.Xn}</tspan></text>
          ${res ? `<path class="bracket" d="M${X(v.Yn)},${y + 8}L${X(v.Yn)},${y + 12}L${X(v.Xn)},${y + 12}L${X(v.Xn)},${y + 8}"/>` : ""}`;
      },
      compute(v) {
        const e = v.Yn - v.Xn, pct = (Math.abs(e) / Math.abs(v.Yn)) * 100, A = 1 - Math.abs(e / v.Yn), a = A * 100;
        const steps = [
          step("Absolute error", `e = Y<sub>n</sub> ${MINUS} X<sub>n</sub>`, `= ${num(v.Yn, 6)} V ${MINUS} ${PN(v.Xn, 6)} V`, `e = ${num(e, 5)} V`),
          step("Percentage error", `%error = |(Y<sub>n</sub> ${MINUS} X<sub>n</sub>) / Y<sub>n</sub>| × 100`, `= |${num(e, 5)} V / ${num(v.Yn, 6)} V| × 100`, `%error = ${num(pct, 4)}%`),
          step("Relative accuracy", `A = 1 ${MINUS} |(Y<sub>n</sub> ${MINUS} X<sub>n</sub>) / Y<sub>n</sub>|`, `= 1 ${MINUS} ${num(pct / 100, 4)}`, `A = ${num(A, 5)}`),
          step("Percentage accuracy", `a = A × 100 = 100% ${MINUS} %error`, `= ${num(A, 5)} × 100`, `a = ${num(a, 5)}%`)
        ];
        const notes = [{ type: "info", title: "Reading the sign of e", html: e === 0 ? "e = 0: the measurement equals the expected value." : `e is ${e > 0 ? "positive: the reading is <strong>lower</strong>" : "negative: the reading is <strong>higher</strong>"} than expected. The percentage error and the accuracy use the size of the error only.` }];
        if (a < 0) notes.push({ type: "warn", title: "Accuracy below zero", html: "The error is bigger than the expected value itself, so the accuracy formula gives a negative number. The measurement is useless." });
        return { steps, notes, sum: `e = ${num(e, 5)} V, %error = ${num(pct, 4)}%, A = ${num(A, 5)}, a = ${num(a, 5)}%` };
      } },

    { id: "limiting", group: "errors", title: "Limiting error", toc: "Limiting error",
      intro: `<p>A manufacturer guarantees an instrument's accuracy as a percentage of its <strong>full scale</strong> (FS). That gives a fixed absolute error, dV = accuracy × FS, wherever the pointer is. So a small reading has a much larger <strong>percentage</strong> error. Move the reading and watch the graph.</p>`,
      inputs: [
        F("FS", "num", 100, "full-scale range", { unit: "V", positive: true, label: "Full scale FS" }),
        F("acc", "num", 1, "of full scale", { unit: "%", positive: true, label: "Accuracy" }),
        F("Vm", "num", 40, "the reading", { unit: "V", positive: true, label: "Measured value V<sub>m</sub>", slider: { min: 1, max: 100, step: 1 }, sliderSig: 4 })
      ],
      compute(v) {
        const dV = (v.acc / 100) * v.FS, pct = (dV / v.Vm) * 100;
        const steps = [
          step("Absolute limiting error", "dV = accuracy × full scale", `= ${num(v.acc)}% × ${num(v.FS)} V = ${num(v.acc / 100)} × ${num(v.FS)} V`, `dV = ${num(dV)} V`),
          step("Limiting error at this reading", `%error = dV / V<sub>m</sub> × 100%`, `= ${num(dV)} V / ${num(v.Vm)} V × 100%`, `%error = ${num(pct)}%`),
          step("What the reading really means", `V<sub>m</sub> ± dV`, `= ${num(v.Vm)} V ± ${num(dV)} V`, `The true value lies between ${num(v.Vm - dV)} V and ${num(v.Vm + dV)} V`)
        ];
        const notes = [];
        if (v.Vm > v.FS) notes.push({ type: "warn", title: "Off scale", html: `The reading is above the ${num(v.FS)} V full scale. Choose a higher range.` });
        else if (pct > 2 * v.acc) notes.push({ type: "info", title: "Use a lower range if you can", html: `At ${num((v.Vm / v.FS) * 100, 3)}% of full scale, the error is ${num(pct / v.acc, 3)} times the rated ${num(v.acc)}%. Choose the range that puts the reading as close to full scale as possible.` });
        return { steps, notes, sum: `dV = ${num(dV)} V, limiting error at ${num(v.Vm)} V = ${num(pct)}%` };
      },
      render(host, res, v) {
        if (!res || !(v.FS > 0 && v.acc > 0 && v.Vm > 0)) { host.innerHTML = ""; return; }
        const W = 600, H = 230, l = 50, r = 14, t = 14, b = 34, xmax = v.FS, ymax = Math.min(Math.max(v.acc * 10, (v.acc * v.FS / Math.min(v.Vm, v.FS)) * 1.2), v.acc * 20);
        const X = (x) => l + (x / xmax) * (W - l - r), Y = (p) => t + (1 - Math.min(p, ymax) / ymax) * (H - t - b);
        let s = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Limiting error in percent against the reading. It falls as the reading approaches full scale.">`;
        for (let k = 0; k <= 5; k++) { const p = (ymax * k) / 5; s += `<line class="gl" x1="${l}" x2="${W - r}" y1="${Y(p)}" y2="${Y(p)}"/><text class="axis" x="${l - 6}" y="${Y(p) + 4}" text-anchor="end">${num(p, 2)}%</text>`; }
        for (let k = 0; k <= 5; k++) { const x = (xmax * k) / 5; s += `<text class="axis" x="${X(x)}" y="${H - 14}" text-anchor="middle">${num(x, 3)} V</text>`; }
        let d = "";
        for (let i = 0; i <= 200; i++) { // plot only where the curve is inside the chart (it rises steeply at low readings)
          const x = xmax * (0.02 + (0.98 * i) / 200), p = (v.acc * v.FS) / x;
          if (p <= ymax) d += `${d ? "L" : "M"}${X(x).toFixed(1)},${Y(p).toFixed(1)}`;
        }
        s += `<line class="ref" x1="${l}" x2="${W - r}" y1="${Y(v.acc)}" y2="${Y(v.acc)}"/><text class="reflab" x="${W - r - 4}" y="${Y(v.acc) - 6}" text-anchor="end">rated ${num(v.acc)}% (at full scale)</text>`;
        s += `<path class="trace-a" d="${d}"/>`;
        if (v.Vm <= xmax) { const pp = (v.acc * v.FS) / v.Vm; s += `<circle class="pt" cx="${X(v.Vm)}" cy="${Y(pp)}" r="6"/><text class="ptlab" x="${X(v.Vm) + (v.Vm > xmax * 0.6 ? -10 : 10)}" y="${Y(pp) - 10}" text-anchor="${v.Vm > xmax * 0.6 ? "end" : "start"}">${num(v.Vm)} V: ${num(pp, 3)}%</text>`; }
        s += `</svg>`;
        host.innerHTML = `<div class="bode"><h4>Limiting error across the range</h4>${s}<p class="bode-cap">The percentage error is smallest at full scale and grows rapidly as the reading gets smaller.</p></div>`;
      } },

    { id: "combine", group: "errors", title: "Combining limiting errors", toc: "Combining errors",
      intro: `<p>Power is calculated from two measurements, P = V × I, and both have limiting errors. In the worst case both errors push the result the same way, so for a <strong>product or a quotient the percentage errors add</strong>. (For a sum or a difference, the absolute errors add instead.) You need this rule for Exercise 5.</p>`,
      inputs: [
        F("V", "num", 12, "voltage reading", { unit: "V", positive: true, label: "V" }),
        F("eV", "num", 1.5, "limiting error of V", { unit: "%", positive: true, label: "Error of V" }),
        F("I", "num", 500, "current reading", { unit: "mA", positive: true, label: "I" }),
        F("eI", "num", 2, "limiting error of I", { unit: "%", positive: true, label: "Error of I" })
      ],
      compute(v) {
        const P = (v.V * v.I) / 1000, eP = v.eV + v.eI, dP = (P * eP) / 100, worst = P * (1 + v.eV / 100) * (1 + v.eI / 100);
        return { sum: `P = ${num(P)} W ± ${num(eP)}% (± ${num(dP)} W)`, notes: [], steps: [
          step("Power", "P = V × I", `= ${num(v.V)} V × ${num(v.I)} mA = ${num(v.V)} × ${num(v.I / 1000)}`, `P = ${num(P)} W`),
          step("Limiting error of a product", "%error<sub>P</sub> = %error<sub>V</sub> + %error<sub>I</sub>", `= ${num(v.eV)}% + ${num(v.eI)}%`, `%error<sub>P</sub> = ${num(eP)}%`),
          step("As an absolute error", "dP = %error<sub>P</sub> × P", `= ${num(eP / 100)} × ${num(P)} W`, `P = ${num(P)} W ± ${num(dP)} W`),
          step("Why adding works", "Worst case: both readings high", `P<sub>max</sub> = ${num(v.V * (1 + v.eV / 100))} V × ${num((v.I / 1000) * (1 + v.eI / 100))} A = ${num(worst)} W`, `${num(((worst - P) / P) * 100)}% above P, almost exactly ${num(eP)}%. The tiny difference is the product of the two small errors, which is ignored.`)
        ] };
      } },

    { id: "sigfig", group: "errors", title: "Significant figures", toc: "Significant figures",
      intro: `<p>The <strong>significant figures</strong> of a measured value are all the digits you are sure of, plus the first uncertain one. A voltmeter reading of 12.47 V has four: the 7 is the uncertain digit. More significant figures mean a more precise measurement.</p>
        <p>The rules below are the standard way to <strong>report</strong> a calculated result in lab reports and exams, so that the answer never claims to be more precise than the measurements it came from.</p>`,
      mount(el) {
        el.innerHTML = `<div class="sf-rules">
          <article class="sf-card"><h4>Counting significant figures</h4>
            <table class="sf-table"><tbody>
              <tr><td>Non-zero digits always count</td><td>6.31</td><td>3</td></tr>
              <tr><td>Zeros between digits count</td><td>3.0005</td><td>5</td></tr>
              <tr><td>Leading zeros never count (they only place the decimal point)</td><td>0.0148</td><td>3</td></tr>
              <tr><td>Trailing zeros after the decimal point count (they were measured)</td><td>2.030</td><td>4</td></tr>
              <tr><td>Trailing zeros in a whole number are unclear. Write 1.20 × 10³ to show 3.</td><td>1200</td><td>2 to 4</td></tr>
            </tbody></table></article>

          <article class="sf-card"><h4><span class="sf-no">Rule 1</span> Adding or subtracting: keep the fewest <em>decimal places</em></h4>
            <div class="col-sum" aria-label="6.31 plus 8.736 written in columns">
              <div><span>6</span><span>.</span><span>3</span><span>1</span><span class="unk">?</span></div>
              <div><span>+ 8</span><span>.</span><span>7</span><span>3</span><span>6</span></div>
              <div class="tot"><span>15</span><span>.</span><span>0</span><span>4</span><span class="unk">6</span></div>
            </div>
            <p><strong>Why:</strong> 6.31 V tells us nothing about the thousandths place (the “?”), so the thousandths digit of the answer is unknown too. Keep 2 decimal places, like 6.31: <strong>15.05 V</strong>.</p>
            <p class="sf-tip">It is decimal places that matter, not significant figures: 99.5 + 0.72 = 100.22, which becomes 100.2 (4 significant figures, more than either number).</p></article>

          <article class="sf-card"><h4><span class="sf-no">Rule 2</span> Multiplying or dividing: keep the fewest <em>significant figures</em></h4>
            <p>Example: P = V × I = 12.47 V × 0.53 A = 6.6091 W, which becomes <strong>6.6 W</strong>.</p>
            <p><strong>Why:</strong> 0.53 A has only 2 significant figures, so the current could be anything from 0.525 A to 0.535 A. That makes P anywhere from 6.55 W to 6.67 W. The first decimal place is already uncertain, so digits after it mean nothing.</p></article>

          <article class="sf-card"><h4><span class="sf-no">Rule 3</span> Dropping figures (rounding)</h4>
            <p>Look at the <strong>first digit you drop</strong>. If it is 5 or more, round the last kept digit up. If it is less than 5, leave it.</p>
            <p>0.0148 to 2 significant figures: the first dropped digit is 8, so it becomes <strong>0.015</strong>. To 1 significant figure: the first dropped digit is 4, so it becomes <strong>0.01</strong>.</p>
            <p class="sf-tip">Always round in <strong>one step</strong> from the original number. Rounding 0.0148 → 0.015 → 0.02 is wrong.</p></article>

          <article class="sf-card"><h4><span class="sf-no">Rule 4</span> Round only the final answer</h4>
            <p>Keep every digit while you calculate, and round once at the end. Rounding in the middle adds error.</p>
            <p>Example: V = 1.24 V and I = 0.0355 A. The power is P = VI = 0.04402 W, so <strong>0.0440 W</strong>. If you first round R = V/I = 34.929 Ω to 34.9 Ω and then use P = V²/R, you get 0.0441 W, which is wrong in the last digit.</p>
            <p class="sf-tip">Exact numbers, such as the 2 in 2πf, the 100 in a percentage or the number of readings n, never limit the significant figures.</p></article>
        </div>
        <h4 class="sub-h">Practice: try to get five in a row</h4>
        <div class="sf-drill"></div>`;
        mountSigFig(el.querySelector(".sf-drill"));
      } },

    { id: "errtypes", group: "errors", title: "Types of static error", toc: "Types of error",
      intro: `<p>Static errors fall into three groups. Knowing which kind you are dealing with tells you how to reduce it.</p>`,
      mount(el) {
        el.innerHTML = `<div class="err-types">
          <div class="err-card"><h4>1. Gross (human) errors</h4><p>Human mistakes in reading, recording or calculating, or setting up the instrument wrongly. They cannot be treated mathematically. You can't remove them completely, but you can minimise them by taking care and by taking at least three readings.</p></div>
          <div class="err-card"><h4>2. Systematic errors</h4><p>Caused by shortcomings of the instrument or its surroundings, and push every reading the same way. <strong>Static</strong> systematic errors come from the limits of the device; <strong>dynamic</strong> ones from an instrument too slow to follow a change.</p>
            <ul><li><strong>Instrumental:</strong> built into the instrument, such as bearing friction or a stretched spring. Reduce them by choosing a suitable instrument, applying correction factors, and calibrating against a standard.</li>
            <li><strong>Environmental:</strong> external conditions such as temperature, humidity, air pressure or magnetic fields. Reduce them with air-conditioning, sealed components and magnetic shields.</li>
            <li><strong>Observational:</strong> introduced by the observer, mainly parallax and estimation errors when reading a scale.</li></ul></div>
          <div class="err-card"><h4>3. Random errors</h4><p>Small, unpredictable variations that remain after gross and systematic errors are removed. Readings scatter above and below the true value, so they can't be corrected one at a time. They are handled with statistics: take many readings and use the mean and standard deviation (next section).</p></div>
        </div><h4 class="sub-h">Parallax: the classic observational error</h4><div class="parallax-box"></div><h4 class="sub-h">Check yourself: which type of error?</h4><div class="err-quiz"></div>`;
        mountParallax(el.querySelector(".parallax-box"));
        quiz(el.querySelector(".err-quiz"), ERR_QUIZ.map((x) => Object.assign({ opts: ERR_OPTS }, x)));
      } },

    /* ---------------- Statistics ---------------- */
    { id: "stats", group: "stats", title: "Statistics lab", toc: "Statistics lab",
      intro: `<p>Statistical analysis finds how uncertain a set of test results is. It needs many readings. Enter your own below, and every value, the table and the graph update as you type.</p>
        <dl class="defs">
          <div><dt>Arithmetic mean</dt><dd>x̄ = Σx<sub>n</sub> / n, where x<sub>n</sub> is the n-th reading and n is the number of readings. It is the best estimate of the true value.</dd></div>
          <div><dt>Deviation from the mean</dt><dd>d<sub>n</sub> = x<sub>n</sub> ${MINUS} x̄, how far each reading is from the mean.</dd></div>
          <div><dt>Average deviation</dt><dd>d̄ = Σ|d<sub>n</sub>| / n. A small value means a precise instrument.</dd></div>
          <div><dt>Standard deviation</dt><dd>σ = √(Σd<sub>n</sub>² / N) for a whole <strong>population</strong>; σ = √(Σd<sub>n</sub>² / (n ${MINUS} 1)) for a <strong>sample</strong> from a larger population. N and n are both the number of readings. A smaller σ means better measurements.</dd></div>
          <div><dt>Precision of a reading</dt><dd>P = 1 ${MINUS} |(x<sub>n</sub> ${MINUS} x̄) / x̄|. The closer to 1, the more precise that reading.</dd></div>
        </dl>`,
      mount: mountStats,
      after: `<div class="callout info"><strong>Common mistake: forgetting the absolute value</strong>Readings above the mean give positive deviations and readings below give negative ones, so they always cancel: Σd<sub>n</sub> = 0 (look at the Σ row of the table). That is why the average deviation adds the sizes of the deviations, |d<sub>n</sub>|, not the deviations themselves.</div>` }
  ];

  /* =====================================================================
     Exercises
     ===================================================================== */
  const EX2 = [98, 101, 102, 97, 101, 100, 103, 98, 106, 99], EX3 = [49.7, 50.1, 50.2, 49.6, 49.7];
  const statsWorking = (xs, focus, label) => { const st = stats(xs); return `<div class="working"><h4>${label || "Working"}</h4><ol class="steps">${stepsHtml(statsSteps(xs, st, "", focus))}</ol></div>`; };
  const dataTable = (xs) => `<div class="table-scroll"><table class="data-row"><tbody><tr><th scope="row">No.</th>${xs.map((_, i) => `<td>${i + 1}</td>`).join("")}</tr><tr><th scope="row">x<sub>n</sub></th>${xs.map((x) => `<td>${x}</td>`).join("")}</tr></tbody></table></div>`;

  const EXERCISES = [
    { id: "c1-ex1", sec: "errcalc", title: "Exercise 1: error and accuracy",
      q: `<p>The expected voltage across a resistor is 80 V. The measurement is 79 V. Calculate the absolute error, the percentage error, the relative accuracy and the percentage accuracy.</p>`,
      runs: [{ vals: { Yn: 80, Xn: 79 } }],
      ans: [{ l: "Absolute error, e", u: "V", v: 1 }, { l: "% error", u: "%", v: 1.25 }, { l: "Relative accuracy, A", u: "", v: 0.9875, tol: 0.0006 }, { l: "% accuracy, a", u: "%", v: 98.75, tol: 0.06 }],
      hints: [`Absolute error e = Y<sub>n</sub> ${MINUS} X<sub>n</sub>, where Y<sub>n</sub> is the expected value and X<sub>n</sub> the measured value. Then %error = |e / Y<sub>n</sub>| × 100.`,
        `Relative accuracy A = 1 ${MINUS} |e / Y<sub>n</sub>|, written as a decimal (just under 1). Percentage accuracy a = A × 100, which is also 100% ${MINUS} %error.`] },
    { id: "c1-ex2", sec: "stats", title: "Exercise 2: precision of one reading",
      q: `<p>From the values in the table, calculate the precision of the 6th element.</p>${dataTable(EX2)}`,
      runs: [{ vals: { data: EX2.join(", "), unit: "" } }], working: () => statsWorking(EX2, 6),
      ans: [{ l: "Mean, x̄", u: "", v: 100.5, tol: 0.01 }, { l: "Precision of the 6th element, P<sub>6</sub>", u: "", v: 0.995, tol: 0.0006 }],
      hints: [`First find the mean: add all 10 readings and divide by 10.`, `P<sub>6</sub> = 1 ${MINUS} |x<sub>6</sub> ${MINUS} x̄| / x̄, with x<sub>6</sub> = 100. Give P as a decimal close to 1.`] },
    { id: "c1-ex3", sec: "stats", title: "Exercise 3: statistics of five readings",
      q: `<p>For the data x<sub>1</sub> = 49.7, x<sub>2</sub> = 50.1, x<sub>3</sub> = 50.2, x<sub>4</sub> = 49.6, x<sub>5</sub> = 49.7, calculate the arithmetic mean, the deviation of each value, the algebraic sum of the deviations, the average deviation and the standard deviation (both population and sample).</p>`,
      runs: [{ vals: { data: EX3.join(", "), unit: "" } }], working: () => statsWorking(EX3),
      ans: [{ l: "Mean, x̄", u: "", v: 49.86, tol: 0.005 },
        { l: "d<sub>1</sub>", u: "", v: -0.16, tol: 0.005 }, { l: "d<sub>2</sub>", u: "", v: 0.24, tol: 0.005 }, { l: "d<sub>3</sub>", u: "", v: 0.34, tol: 0.005 }, { l: "d<sub>4</sub>", u: "", v: -0.26, tol: 0.005 }, { l: "d<sub>5</sub>", u: "", v: -0.16, tol: 0.005 },
        { l: "Algebraic sum Σd<sub>n</sub>", u: "", v: 0, tol: 0.005 }, { l: "Average deviation, d̄", u: "", v: 0.232, tol: 0.002 },
        { l: "σ, population (÷ N)", u: "", v: 0.2417, tol: 0.002 }, { l: "σ, sample (÷ (n − 1))", u: "", v: 0.2702, tol: 0.002 }],
      hints: [`x̄ = (49.7 + 50.1 + 50.2 + 49.6 + 49.7) / 5. Each deviation is d<sub>n</sub> = x<sub>n</sub> ${MINUS} x̄, so readings below the mean have negative deviations.`,
        `The deviations always add up to zero. For d̄, add the deviations <em>without</em> their signs and divide by 5. For σ, square each deviation, add them, divide by 5 (population) or 4 (sample), then take the square root.`] },
    { id: "c1-ex5", sec: "limiting", title: "Exercise 4: limiting error of a voltmeter",
      q: `<p>A 600 V voltmeter has an accuracy of 2% of full scale. Calculate the limiting error when it is used to measure 250 V.</p>`,
      runs: [{ vals: { FS: 600, acc: 2, Vm: 250 } }],
      ans: [{ l: "Absolute limiting error, dV", u: "V", v: 12, tol: 0.05 }, { l: "Limiting error at 250 V", u: "%", v: 4.8, tol: 0.02 }],
      hints: [`The accuracy is a percentage of full scale, so the absolute error is dV = 2% × 600 V wherever the pointer is.`, `Now express that same dV as a percentage of the actual reading: dV / 250 V × 100%.`] },
    { id: "c1-ex6", sec: "combine", title: "Exercise 5: limiting error of power",
      q: `<p>In a measurement, the limiting error of the voltmeter at 70 V is 2.143% and the limiting error of the ammeter at 80 mA is 2.813%. Determine the limiting error of the power.</p>`,
      runs: [{ vals: { V: 70, eV: 2.143, I: 80, eI: 2.813 } }],
      ans: [{ l: "Limiting error of P", u: "%", v: 4.956, tol: 0.005 }, { l: "Power, P", u: "W", v: 5.6, tol: 0.01 }],
      hints: [`P = V × I. Remember to convert 80 mA to amperes.`, `For a product, the percentage limiting errors add: %error<sub>P</sub> = %error<sub>V</sub> + %error<sub>I</sub>.`] },
    { id: "c1-ex7", title: "Exercise 6: precision and significant figures",
      q: `<p>Find the precision of X<sub>1</sub> and X<sub>2</sub>, given the mean X̄<sub>n</sub> = 101, X<sub>1</sub> = 98 (2 significant figures) and X<sub>2</sub> = 98.5 (3 significant figures).</p>`,
      working: () => `<div class="working"><h4>Working</h4><ol class="steps">${stepsHtml([
        step("Precision of X<sub>1</sub>", `P<sub>1</sub> = 1 ${MINUS} |X<sub>1</sub> ${MINUS} X̄<sub>n</sub>| / X̄<sub>n</sub>`, `= 1 ${MINUS} |98 ${MINUS} 101| / 101 = 1 ${MINUS} 3 / 101`, `P<sub>1</sub> = 0.9703`),
        step("Precision of X<sub>2</sub>", `P<sub>2</sub> = 1 ${MINUS} |X<sub>2</sub> ${MINUS} X̄<sub>n</sub>| / X̄<sub>n</sub>`, `= 1 ${MINUS} |98.5 ${MINUS} 101| / 101 = 1 ${MINUS} 2.5 / 101`, `P<sub>2</sub> = 0.9752`),
        step("Compare", "", "", `X<sub>2</sub>, recorded to more significant figures, has the higher precision (0.9752 vs 0.9703).`)])}</ol></div>`,
      ans: [{ l: "P<sub>1</sub>", u: "", v: 0.9703, tol: 0.0006 }, { l: "P<sub>2</sub>", u: "", v: 0.9752, tol: 0.0006 }],
      hints: [`Use P = 1 ${MINUS} |X ${MINUS} X̄<sub>n</sub>| / X̄<sub>n</sub> for each reading.`, `For X<sub>1</sub>: |98 ${MINUS} 101| = 3, so P<sub>1</sub> = 1 ${MINUS} 3 / 101. Give 4 decimal places.`] }
  ];

  Lab.page({
    topic: 1,
    sections: SECTIONS,
    groups: [
      { key: "basics", list: "#basicsList", toc: "#basicsToc" },
      { key: "classify", list: "#classifyList", toc: "#classifyToc" },
      { key: "chars", list: "#charsList", toc: "#charsToc" },
      { key: "standards", list: "#standardsList" },
      { key: "errors", list: "#errorsList", toc: "#errorsToc" },
      { key: "stats", list: "#statsList" }
    ],
    exercises: EXERCISES
  });
})();
