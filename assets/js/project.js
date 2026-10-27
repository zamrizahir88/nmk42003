/* The mini project (project.html): group registration, the title proposal, the lecturers' review, the title-clash
   check and the class's list of approved titles. Opened to students by the lecturer's switch (meta/project.released),
   like the game. Firestore:
   - meta/project        { released, dueAt }: the switch and the proposal deadline (lecturers write)
   - pgroups/{id}        a group: leader, memberM and inviteM (matric numbers), declinedM, status (forming, submitted,
                         amend, approved), proposal, history, review, no (group number, given at the first approval), ai
   - pmember/{sem_matric} one per student: the group they are in, so nobody is in two groups
   - ptitles/{id}        an approved title for the whole class: number, title, industry, synopsis, parts, members
   Names come from the class list (meta/classmates for students, roster for lecturers). */
(function () {
  "use strict";
  // the page has three tabs: Guidelines, Group and Title Submission (#project), Progress Monitoring (#projectProg)
  const host = document.getElementById("project"), host2 = document.getElementById("projectProg");
  if (!host || typeof COURSE === "undefined") return;
  const root = document.querySelector("main") || document;
  const $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SEM = COURSE.semesterId, SLUG = String(SEM).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const SEC = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
  const IND = { a: "Electronics industry", b: "Semiconductor industry", c: "Energy management" };
  const PLAT = ["ThingSpeak", "Blynk", "Webpage hosted by the ESP32", "Other"];
  const STATUS = { forming: "Forming", submitted: "Waiting for review", amend: "Amendment requested", approved: "Approved" };
  const DUE0 = "2026-11-29T23:59:00+08:00";   // Sunday of week 8
  const MAX = 4, MIN = 3, WORDS = 150;
  let A = null, db = null, FV = null, isLec = false, me = null, meta = {}, mates = [], unsubs = [];
  const stop = () => unsubs.splice(0).forEach((f) => { try { f(); } catch (e) { /* gone */ } });
  const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === "number" ? t : t ? Date.parse(t) || 0 : 0);
  const dueMs = () => ms(meta.dueAt) || Date.parse(DUE0);
  const beforeDue = () => Date.now() < dueMs();
  const when = (t) => { if (!t) return "–"; const d = new Date(ms(t) + 8 * 3600000); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}, ${((d.getUTCHours() + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${d.getUTCHours() < 12 ? "AM" : "PM"}`; };
  const words = (s) => (String(s || "").trim().match(/\S+/g) || []).length;
  const gname = (g) => (g.no ? `Group ${String(g.no).padStart(2, "0")}` : "New group (no number yet)");
  const gtag = (no) => `G${String(no).padStart(2, "0")}`;

  /* ---------- the title-clash check: compares the idea, not only the words ---------- */
  // words that say nothing about the idea (English and Malay)
  const STOP = new Set(("a an and the of for with in on to by via at from into using use based system systems sistem smart iot internet things monitor monitoring monitored control controller controlling " +
    "automatic automated auto design development develop project prototype device unit kit module modul sensor sensors data real time realtime alert alarm notification app application dashboard " +
    "esp32 wifi bluetooth thingspeak blynk platform cloud industry industrial dan untuk dengan pintar kawalan pemantauan berasaskan menggunakan yang di ke new simple low cost efficient efficiency").split(" "));
  // everyday words and parts that mean the same thing are counted as one idea
  const SYN = {
    temp: "temperature temp suhu thermistor ntc lm35 ds18b20 thermal heat overheat overheating thermometer",
    humid: "humidity humid kelembapan dht22 dht11 dht moisture",
    level: "level tank ultrasonic hcsr04 depth overflow paras jsnsr04t",
    current: "current acs712 arus ampere amp amps overload overcurrent",
    voltage: "voltage divider volt voltan undervoltage overvoltage",
    energy: "energy power tenaga meter metering kwh consumption usage electricity elektrik saver saving",
    solar: "solar pv photovoltaic panel suria",
    light: "light ldr lux bh1750 cahaya lighting lamp brightness illumination",
    gas: "gas mq2 mq135 mq7 leak leakage smoke asap",
    motion: "pir motion occupancy presence",
    vibration: "vibration getaran sw420 accelerometer mpu6050 adxl345",
    dust: "dust pm25 particulate particle gp2y1010",
    air: "airflow aqi cleanroom ventilation",
    sort: "conveyor sorting sort reject product jam belt",
    battery: "battery bateri soc charge charging charger",
    pump: "pump pam irrigation",
    fan: "fan kipas exhaust cooling",
    weight: "weight loadcell hx711 berat mass scale",
    flow: "flow aliran yfs201 flowmeter",
    pressure: "pressure bmp280 bme280 tekanan",
    fire: "fire flame api",
    soil: "soil tanah",
    pcb: "pcb jig tester testing inspection",
    machine: "machine mesin equipment motor",
    maint: "predictive maintenance health condition fault wear worn failure",
    distance: "distance proximity obstacle ir jarak"
  };
  const CANON = {};
  Object.entries(SYN).forEach(([k, v]) => v.split(" ").forEach((w) => { CANON[w] = k; }));
  const toks = (s) => String(s || "").toLowerCase().replace(/hc-sr04/g, "hcsr04").replace(/load cell/g, "loadcell").replace(/pm2\.5/g, "pm25").replace(/mq-(\d+)/g, "mq$1").replace(/acs-?712/g, "acs712")
    .split(/[^a-z0-9]+/).filter(Boolean).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .map((w) => CANON[w] || w).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  const jac = (a, b) => { const A1 = new Set(a), B1 = new Set(b); if (!A1.size || !B1.size) return 0; let n = 0; A1.forEach((x) => { if (B1.has(x)) n++; }); return n / (A1.size + B1.size - n); };
  const cos = (a, b) => { const f = (l) => l.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {}); const x = f(a), y = f(b); let d = 0, nx = 0, ny = 0;
    Object.keys(x).forEach((k) => { nx += x[k] * x[k]; if (y[k]) d += x[k] * y[k]; }); Object.values(y).forEach((v) => { ny += v * v; }); return nx && ny ? d / Math.sqrt(nx * ny) : 0; };
  const sensorsOf = (p) => (p.sensors || []).flatMap((s) => toks(s.name));
  const calOf = (p) => { const s = (p.sensors || []).find((x) => x.cal); return s ? toks(s.name)[0] || "" : ""; };
  // 0 (different) to 1 (the same idea)
  function similarity(p, q) {
    if (!p || !q) return 0;
    const t = jac(toks(p.title), toks(q.title));
    const x = cos(toks(`${p.title} ${p.synopsis} ${(p.conds || []).map((c) => c.name).join(" ")}`), toks(`${q.title} ${q.synopsis} ${(q.conds || []).map((c) => c.name).join(" ")}`));
    const s = jac(sensorsOf(p), sensorsOf(q)), c = calOf(p) && calOf(p) === calOf(q) ? 1 : 0, i = p.industry && p.industry === q.industry ? 1 : 0;
    return Math.min(1, 0.3 * t + 0.25 * x + 0.3 * s + 0.05 * c + 0.1 * i);
  }
  const level = (v) => (v >= 0.5 ? "red" : v >= 0.32 ? "amber" : "green");
  const LEVEL = { red: "🔴 Likely clash", amber: "🟠 Similar", green: "🟢 Different" };

  /* ---------- the parts list students choose from (they may type others) ---------- */
  const SENSORS = ["Ultrasonic sensor (HC-SR04)", "IR obstacle sensor", "LM35 temperature sensor", "Thermistor (NTC)", "DS18B20 temperature sensor", "DHT22 temperature and humidity", "DHT11 temperature and humidity",
    "ACS712 current sensor", "Voltage divider (to the ADC)", "LDR (light)", "BH1750 lux sensor", "PIR motion sensor", "MQ-2 gas sensor", "MQ-135 air quality sensor", "Vibration sensor (SW-420)",
    "MPU6050 accelerometer", "Dust sensor (GP2Y1010)", "Capacitive soil moisture sensor", "Potentiometer (angle or position)", "Load cell with HX711", "Water flow sensor (YF-S201)", "Water level sensor", "Flame sensor", "BMP280 pressure sensor"];
  const OUTS = ["Relay with fan", "Relay with pump", "Relay cuts the load", "Servo motor", "DC motor", "Buzzer", "LED", "RGB LED", "LCD 16x2 (I2C)", "OLED display", "PWM fan", "Solenoid valve", "Stepper motor"];
  // the guideline's example titles (★ = the sensor to calibrate)
  const EXAMPLES = [
    ["a", [["Product sorting and jam detection on a conveyor", "★ Ultrasonic (product height); IR obstacle (counter)", "Undersize / OK / Oversize", "Servo reject arm; buzzer; relay stops the conveyor motor", "Ruler"],
      ["PCB test-jig voltage and current checker", "★ Voltage divider to the ADC; ACS712 current", "Under / OK / Over voltage", "Relay cuts power; buzzer; LCD result", "Multimeter"],
      ["Production machine health monitor", "★ LM35 or thermistor; vibration sensor", "Normal / Warning / Critical", "Fan relay; buzzer; relay stops the motor", "Known temperatures or DS18B20"],
      ["ESD-safe workstation humidity monitor", "★ Thermistor; DHT22", "Too dry / Normal / Too humid", "Humidifier or fan relay; buzzer; LED", "Known temperatures or DS18B20"]]],
    ["b", [["Wet-bench tank temperature and level controller (water as the liquid)", "★ Ultrasonic or capacitive level; DS18B20", "Low / Normal / Overflow", "Pump relay; buzzer; servo valve", "Ruler on the tank"],
      ["Gas cabinet leak and temperature monitor", "★ Thermistor; MQ-2 gas sensor", "Safe / Warning / Danger", "Exhaust fan relay; buzzer; servo closes the valve", "Known temperatures or DS18B20"],
      ["Vacuum pump predictive maintenance", "★ ACS712 current; vibration sensor", "Normal / Worn / Fault", "Relay shuts down the pump; buzzer; app alert", "Multimeter"],
      ["Cleanroom air quality and airflow control", "★ Potentiometer airflow flap; dust sensor", "Clean / Moderate / Contaminated", "PWM fan; relay; buzzer", "Protractor"]]],
    ["c", [["Solar panel monitor with smart load switching", "★ Voltage divider (panel); LDR or BH1750", "Low / Medium / High generation", "Load relay; LED; fan", "Multimeter"],
      ["Smart DC energy meter with overload protection", "★ ACS712 current; voltage divider", "Normal / Warning / Overload", "Relay cuts the load; buzzer; LCD", "Multimeter"],
      ["Classroom lighting and fan energy saver", "★ LDR; PIR; DHT22", "Bright / Dim / Dark", "PWM LED lamp; fan relay; buzzer", "BH1750 lux sensor"],
      ["Battery bank state-of-charge monitor", "★ Voltage divider; thermistor", "Full / Normal / Low", "Charger or load relay; buzzer; LED", "Multimeter"],
      ["Water tank pump energy saver", "★ Ultrasonic level; ACS712", "Low / Normal / Full", "Pump relay; buzzer; LCD", "Ruler"]]]
  ];

  /* ---------- the key dates, the timeline and the example titles (week numbers include the mid-term break) ---------- */
  (function pageText() {
    const day0 = Date.parse(`${COURSE.semesterStart}T00:00:00+08:00`), wkOf = (iso) => Math.floor((Date.parse(`${iso}T00:00:00+08:00`) - day0) / 604800000) + 1;
    const q = new URLSearchParams(location.search).get("today"), now = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), w = wkOf(now);
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], dd = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${M[d.getUTCMonth()]}`; };
    const span = (a, b) => { const s = day0 + 7 * (a - 1) * 86400000 + 8 * 3600000, e = day0 + (7 * b - 1) * 86400000 + 8 * 3600000; return `${dd(s)} to ${dd(e)} ${new Date(e).getUTCFullYear()}`; };
    const box = document.getElementById("pjDates");
    if (box) box.innerHTML = [[7, 7, "Week 7", "Released: the brief, group registration and title proposals"], [8, 8, "Week 8", "Groups formed; proposal due Sunday, 11:59 PM"],
      [10, 14, "Weeks 10 to 14", "Weekly progress logbook"], [15, 15, "Week 15", "Demonstration, oral verification and peer evaluation"]]
      .map(([a, b, t, d]) => `<div class="pj-date${w >= a && w <= b ? " now" : ""}"><b>${t}</b><span>${d}</span></div>`).join("");
    const tl = document.getElementById("pjTime");
    if (tl) tl.innerHTML = [[7, 7, "Release", "The brief, group registration and title proposals open on this page."],
      [8, 8, "Groups and title proposals", "Mini project briefing. Register your group and submit your title proposal on this page by Sunday, 11:59 PM."],
      [9, 9, "Block diagram (mid-term break)", "The block diagram of your system, submitted on URLearn."],
      [10, 14, "Progress logbook", "One logbook entry per group each week on this page: what was done, by whom, problems met and the plan for next week."],
      [12, 12, "Progress check", "Sensors read by the ESP32; calibration started."],
      [14, 14, "Discussion", "Mini project discussion with the lecturers."],
      [15, 15, "Demonstration", "Group technical demonstration and individual oral verification. Submit the report on URLearn, and the peer evaluation on this page."]]
      .map(([a, b, t, d]) => `<li class="${w >= a && w <= b ? "now" : w > b ? "past" : ""}"><span class="pj-tw">Week ${a}${b > a ? ` to ${b}` : ""}<small>${span(a, b)}</small></span><span><b>${t}</b>${d}</span></li>`).join("");
    const ex = document.getElementById("pjExamples");
    if (ex) ex.innerHTML = EXAMPLES.map(([ind, rows]) => `<h3 class="h3">${IND[ind]}</h3><div class="pj-scroll"><table class="pj-table pj-ex"><thead><tr><th scope="col">Title</th><th scope="col">Sensors</th><th scope="col">3 conditions</th><th scope="col">Actuators and outputs</th><th scope="col">Calibration reference</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("");
  })();

  /* ---------- the page's three tabs: #guidelines, #group, #progress (a guideline section's own link opens Guidelines) ---------- */
  const PTABS = ["guidelines", "group", "progress"];
  let pageTab = "guidelines";
  function showTab(t) {
    pageTab = t;
    $$(".pj-panel").forEach((p) => { p.hidden = p.id !== t; });
    $$("[data-ptab]").forEach((a) => { a.setAttribute("aria-selected", String(a.dataset.ptab === t)); if (a.dataset.ptab === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.dispatchEvent(new CustomEvent("pj:tab", { detail: t }));
  }
  // with no tab in the address: Guidelines until week 7, Group and Title until week 9, then Progress Monitoring
  const tabNow = () => { const w = Math.floor((Date.now() - Date.parse(`${COURSE.semesterStart}T00:00:00+08:00`)) / 604800000) + 1; return w >= 10 ? "progress" : w >= 7 ? "group" : "guidelines"; };
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (PTABS.includes(h)) return showTab(h);
    if (h === "register") return showTab("group");
    const el = h && document.getElementById(h), panel = el && el.closest(".pj-panel");
    if (panel) { showTab(panel.id); el.scrollIntoView(); return; }
    showTab(tabNow());
  }
  $$("[data-ptab]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); if (pageTab === a.dataset.ptab) return; history.pushState(history.state, "", `#${a.dataset.ptab}`); showTab(a.dataset.ptab); }));
  addEventListener("hashchange", fromHash);
  addEventListener("popstate", () => { const h = location.hash.slice(1); if (PTABS.includes(h) && h !== pageTab) showTab(h); });
  fromHash();

  /* ---------- start: who sees what ---------- */
  function boot() {
    A = window.NMKAccount;
    if (!A) { host.innerHTML = `<p class="small-note">The mini project system needs the course account system, which didn't load. Please reload the page.</p>`; return; }
    db = A.db; FV = firebase.firestore.FieldValue;
    A.on((st) => { if (st.ready) start(st); });
  }
  let started = "";
  async function start(st) {
    const key = st.user ? `${st.user.uid}|${st.profile && st.profile.status}` : "out";
    if (key === started) return;
    started = key; stop();
    if (!st.user) { gate(`<p><strong>Sign in to register your group.</strong> Use your studentmail account.</p><button type="button" class="btn" data-signin>Sign in with Google</button>`); return; }
    isLec = A.isAdmin(st.user.email);
    try { const d = await db.collection("meta").doc("project").get(); meta = d.exists ? d.data() : {}; } catch (e) { meta = {}; }
    if (isLec) return lecturer();
    me = st.roster && st.roster.status === "active" ? { m: String(st.roster.matric), n: st.roster.name, s: st.roster.section || "" } : null;
    if (!me) { gate(`<p><strong>You are not on the NMK42003 class list.</strong> The mini project is for students of this course. If you take NMK42003, please tell your lecturer.</p>`); return; }
    if (!meta.released) { gate(`<p><strong>Group registration opens in week 7.</strong> Your lecturer will open it here. Read the brief, requirements and rubric below in the meantime.</p>`); return; }
    try { const d = await db.collection("meta").doc("classmates").get(); mates = d.exists ? (d.data().list || []) : []; } catch (e) { mates = []; }
    student();
  }
  function gate(html) {
    [host, host2].forEach((h) => { if (!h) return; h.innerHTML = `<div class="pj-gate">${html}</div>`; const b = $("[data-signin]", h); if (b) b.addEventListener("click", () => A.signIn()); });
  }
  const nameOf = (m) => { const x = mates.find((y) => String(y.m) === String(m)); return x ? x.n : `Matric ${m}`; };
  const secOf = (m) => { const x = mates.find((y) => String(y.m) === String(m)); return x && x.s ? SEC[x.s] : ""; };
  const hist = (g, act, note) => (g.history || []).concat([{ at: Date.now(), by: isLec ? "Lecturer" : me.n, act, note: note || "", title: g.proposal ? g.proposal.title : "" }]).slice(-60);

  /* ---------- the weekly progress logbook (weeks 10 to 14): one entry per group per week, plog/{group}_w{week} ---------- */
  const LOG_WEEKS = [10, 11, 12, 13, 14];
  const DAY0 = Date.parse(`${COURSE.semesterStart}T00:00:00+08:00`);
  const nowMs = () => { const q = new URLSearchParams(location.search).get("today"); return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? Date.parse(`${q}T12:00:00+08:00`) : Date.now(); };
  const weekStart = (w) => DAY0 + 7 * (w - 1) * 86400000, weekEnd = (w) => weekStart(w + 1) - 1000;   // Monday 00:00 to Sunday 23:59:59
  const curWeek = () => Math.floor((nowMs() - DAY0) / 604800000) + 1;
  // on time (written by Sunday of its week), late, missing (the week is over), this week, or not open yet
  const logState = (e, w) => (e ? (ms(e.at) <= weekEnd(w) ? "ok" : "late") : nowMs() > weekEnd(w) ? "missing" : nowMs() >= weekStart(w) ? "open" : "soon");
  const LOGS = { ok: "✓ On time", late: "Written late", missing: "Missing", open: "This week", soon: "Not open yet" };
  const dayOf = (t) => { const d = new Date(t + 8 * 3600000); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
  function logEntry(e, g, w, names) {
    const nm = names || ((m) => m);
    return `<dl class="pj-dl"><dt>What we did</dt><dd>${esc(e.done)}</dd>
      <dt>Who did what</dt><dd><ul>${g.memberM.map((m) => `<li><strong>${esc(nm(m))}</strong>: ${esc((e.members || {})[m] || "–")}</li>`).join("")}</ul></dd>
      <dt>Problems</dt><dd>${esc(e.problems || "–")}</dd><dt>Plan for next week</dt><dd>${esc(e.next || "–")}</dd></dl>
      <p class="small-note">Written by ${esc(e.byName || e.by)}, ${esc(when(e.at))}${logState(e, w) === "late" ? " (late)" : ""}${e.editedAt ? ` · edited ${esc(when(e.editedAt))}${e.editedByName ? ` by ${esc(e.editedByName)}` : ""}` : ""}</p>
      ${e.comment && e.comment.text ? `<div class="pj-cmt"><strong>Lecturer's comment:</strong> ${esc(e.comment.text)} <small>${esc(when(e.comment.at))}</small></div>` : ""}`;
  }
  // print the whole logbook, or save it as a PDF, for the report
  function printLog(g, logs, names) {
    const old = document.getElementById("pjPrint"); if (old) old.remove();
    const box = document.createElement("div");
    box.id = "pjPrint";
    box.innerHTML = `<h1>Mini Project Progress Logbook</h1><p><strong>${esc(gname(g))}</strong>: ${esc((g.proposal && g.proposal.title) || "")}<br>Members: ${g.memberM.map((m) => esc(names(m))).join(", ")}<br>NMK42003 Instrumentation, ${esc(SEM)}</p>
      ${LOG_WEEKS.map((w) => `<h2>Week ${w} <small>(${dayOf(weekStart(w))} to ${dayOf(weekEnd(w))})</small></h2>${logs[w] ? logEntry(logs[w], g, w, names) : "<p>No entry.</p>"}`).join("")}`;
    document.body.appendChild(box); document.body.classList.add("pj-print");
    const done = () => { box.remove(); document.body.classList.remove("pj-print"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done);
    window.print();
  }

  /* ---------- peer evaluation and marks (the rubric's Part D) ---------- */
  const PEER_ITEMS = [["Commitment", "attended meetings and laboratory sessions, met deadlines and was responsible for agreed tasks"],
    ["Collaboration", "worked well with the group, shared information and helped solve problems"],
    ["Contribution", "the amount and quality of work in hardware, programming, calibration, testing and the report"]];
  const SCALE = { 5: "Excellent: led or contributed far beyond what was expected", 4: "Good: contributed fully and reliably", 3: "Satisfactory: contributed what was asked", 2: "Poor: contributed less than expected", 1: "Very poor: contributed little or nothing" };
  const D1 = [["full", "Full", 1.0], ["good", "Good", 0.9], ["partial", "Partial", 0.8], ["weak", "Weak", 0.7], ["none", "None", 0.6]];
  const PARTS = [["A1", "Design requirements", 20], ["A2", "Measurement and calibration", 15], ["A3", "Reliability, build quality and safety", 15], ["B1", "Tool and component selection, system design", 10],
    ["B2", "Test and calibration results with analysis", 12], ["B3", "Limitations and interdependence", 8], ["C1", "Live operation", 10], ["C2", "Fault-finding or modification on request", 10]];
  // the average total (out of 15) a student received from the other members, and the adjustment it gives
  function peerOf(m, g, peers) {
    const got = peers.filter((p) => p.gid === g.id && p.m !== m && p.ratings && p.ratings[m]).map((p) => p.ratings[m].reduce((a, b) => a + (+b || 0), 0));
    const avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
    return { n: got.length, avg, adj: avg === null ? 0 : avg >= 9 ? 0 : avg >= 6 ? -0.1 : -0.2 };
  }
  const round2 = (x) => Math.round(x * 100) / 100;

  /* =====================================================================
     STUDENTS
     ===================================================================== */
  function student() {
    host.innerHTML = `<div id="pjView"><p class="small-note">Loading…</p></div><section class="pj-tsec" aria-labelledby="pjTitlesH"><span class="pj-over">For the whole class</span><h2 class="pj-h2" id="pjTitlesH">Approved Titles</h2><div id="pjTitles"></div></section>`;
    if (host2) host2.innerHTML = `<div id="pjLog"></div><div id="pjPeer"></div>`;
    let mineG = null, invites = [], claims = {}, titles = [], editing = false, draft = null, shown = "";
    let logs = {}, logSubs = [], logGid = null, logWeek = null, logEditing = false;
    function fail(e) { $("#pjView").innerHTML = `<p class="small-note">Could not load your group (${esc(e.code || e)}). Reload the page to try again.</p>`; }
    function paint() {
      const v = $("#pjView"), tt = $("#pjTitles");
      if (tt) tt.innerHTML = titleList(titles, false);
      // keep a half-typed proposal: only redraw the form when the group itself changed
      const sig = JSON.stringify([mineG && [mineG.id, mineG.status, mineG.memberM, mineG.inviteM, mineG.declinedM, mineG.leader, mineG.review, mineG.version, mineG.no, editing ? 0 : mineG.proposal], invites.map((g) => [g.id, g.memberM, g.inviteM]), editing]);
      if (editing && sig === shown && $("#pjForm")) { checks(); return; }
      shown = sig;
      v.innerHTML = mineG ? groupView(mineG) : noGroup();
      wire(); paintLog(); paintPeer();
    }
    /* the logbook card, under the group */
    function watchLogs() {
      const id = mineG ? mineG.id : null;
      if (id === logGid) return;
      logSubs.splice(0).forEach((f) => f()); logs = {}; logGid = id; logEditing = false; logWeek = null;
      if (!id) return;
      LOG_WEEKS.forEach((w) => logSubs.push(db.collection("plog").doc(`${id}_w${w}`).onSnapshot((d) => { if (d.exists) logs[w] = d.data(); else delete logs[w]; paintLog(); }, () => {})));
    }
    unsubs.push(() => logSubs.splice(0).forEach((f) => f()));
    function paintLog(force) {
      const box = $("#pjLog");
      if (!box) return;
      if (!mineG) { box.innerHTML = `<div class="pj-card"><h2 class="h3">Progress Logbook</h2><p>Join or create a group first, in <a href="#group" data-goto="group">Group and Title Submission</a>. Your group's weekly logbook appears here from week ${LOG_WEEKS[0]}.</p></div>`; return; }
      if (logEditing && !force) return;
      const g = mineG, cw = curWeek();
      if (cw < LOG_WEEKS[0]) { box.innerHTML = `<div class="pj-card"><h2 class="h3">Progress Logbook</h2><p>Your group's weekly logbook opens in week ${LOG_WEEKS[0]} (${dayOf(weekStart(LOG_WEEKS[0]))}). Each week, one of you writes what the group did, who did what, the problems you met and the plan for next week. Each entry is due on Sunday at 11:59 PM.</p></div>`; return; }
      const sel = logWeek || Math.min(LOG_WEEKS[LOG_WEEKS.length - 1], Math.max(LOG_WEEKS[0], cw)), e = logs[sel], st = logState(e, sel);
      const chips = LOG_WEEKS.map((w) => { const s2 = logState(logs[w], w); return `<button type="button" class="pj-wk ${s2}" data-lw="${w}" aria-pressed="${w === sel}">Week ${w}<small>${LOGS[s2]}</small></button>`; }).join("");
      let body;
      if (st === "soon") body = `<p class="small-note">Week ${sel} opens on ${dayOf(weekStart(sel))}.</p>`;
      else if (e && !logEditing) body = `<h3 class="h3">Week ${sel} <small class="pj-wd">${dayOf(weekStart(sel))} to ${dayOf(weekEnd(sel))}</small></h3>${logEntry(e, g, sel, nameOf)}<p class="pj-row"><button type="button" class="btn ghost small" data-ledit>Edit this entry</button></p>`;
      else body = `<form id="pjLogF" novalidate><h3 class="h3">Week ${sel} <small class="pj-wd">${dayOf(weekStart(sel))} to ${dayOf(weekEnd(sel))}${st === "missing" ? " · now late" : ""}</small></h3>
        <label class="pj-l" for="pjLd">What the group did this week</label><textarea id="pjLd" class="pj-in" rows="4" name="done">${esc(e ? e.done : "")}</textarea>
        <fieldset class="pj-fs"><legend class="pj-l">Who did what</legend>${g.memberM.map((m) => `<label class="pj-part"><span>${esc(nameOf(m))}</span><input class="pj-in" name="m_${esc(m)}" value="${esc(e ? (e.members || {})[m] || "" : "")}"></label>`).join("")}</fieldset>
        <label class="pj-l" for="pjLp">Problems we met <span>(and how we solved them, or what we still need)</span></label><textarea id="pjLp" class="pj-in" rows="3" name="problems">${esc(e ? e.problems : "")}</textarea>
        <label class="pj-l" for="pjLn">Plan for next week</label><textarea id="pjLn" class="pj-in" rows="3" name="next">${esc(e ? e.next : "")}</textarea>
        <div class="pj-row"><button class="btn">Save the entry</button>${e ? `<button type="button" class="btn ghost" data-lcancel>Cancel</button>` : ""}</div><p class="pj-err" id="pjLerr" role="alert"></p></form>`;
      box.innerHTML = `<div class="pj-card pj-log"><div class="pj-gh"><h2 class="h3">Progress Logbook</h2><button type="button" class="btn ghost small" data-lprint>🖨 Print or save as PDF</button></div>
        <p class="small-note">One entry per group each week, due on Sunday at 11:59 PM. Any member can write or edit it; the logbook shows who wrote it.</p><div class="pj-weeks">${chips}</div><div class="pj-lw">${body}</div></div>`;
      $$("[data-lw]", box).forEach((b) => b.addEventListener("click", () => { if (logEditing && !confirm("Leave this entry without saving?")) return; logWeek = +b.dataset.lw; logEditing = false; paintLog(true); }));
      $("[data-lprint]", box).addEventListener("click", () => printLog(g, logs, nameOf));
      const ed = $("[data-ledit]", box); if (ed) ed.addEventListener("click", () => { logEditing = true; paintLog(true); });
      const cn = $("[data-lcancel]", box); if (cn) cn.addEventListener("click", () => { logEditing = false; paintLog(true); });
      const f = $("#pjLogF", box);
      if (!f) return;
      f.addEventListener("input", () => { logEditing = true; });
      f.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const val = (n) => (f.elements[n] ? f.elements[n].value.trim() : ""), members = {};
        g.memberM.forEach((m) => { members[m] = val(`m_${m}`); });
        if (val("done").length < 15) { $("#pjLerr", f).textContent = "Write what the group did this week (at least a sentence)."; return; }
        if (val("next").length < 5) { $("#pjLerr", f).textContent = "Write the plan for next week."; return; }
        const ref = db.collection("plog").doc(`${g.id}_w${sel}`), d = { done: val("done"), members, problems: val("problems"), next: val("next") };
        const job = e ? ref.update(Object.assign(d, { editedAt: FV.serverTimestamp(), editedBy: me.m, editedByName: me.n }))
          : ref.set(Object.assign(d, { semester: SEM, gid: g.id, week: sel, by: me.m, byName: me.n, at: FV.serverTimestamp() }));
        $("button.btn", f).disabled = true;
        job.then(() => { logEditing = false; paintLog(true); }).catch((err) => { $("button.btn", f).disabled = false; $("#pjLerr", f).textContent = `Not saved (${err.code || err}).`; });
      });
    }
    /* the confidential peer evaluation (open when the lecturer opens it, in week 15) */
    let peerDoc = null, peerGid = null, peerEditing = false;
    function paintPeer() {
      const box = $("#pjPeer");
      if (!box) return;
      if (!mineG || mineG.memberM.length < 2) { box.innerHTML = ""; return; }
      const g = mineG, others = g.memberM.filter((m) => m !== me.m);
      if (!meta.peer) { box.innerHTML = curWeek() >= 15 ? `<div class="pj-card"><h2 class="h3">Peer Evaluation</h2><p>The peer evaluation opens here when your lecturer opens it, in week 15.</p></div>` : ""; return; }
      if (peerGid !== g.id) { peerGid = g.id; peerDoc = undefined; db.collection("ppeer").doc(`${SLUG}_${me.m}`).get().then((d) => { peerDoc = d.exists ? d.data() : null; paintPeer(); }).catch(() => { peerDoc = null; paintPeer(); }); }
      if (peerDoc === undefined) { box.innerHTML = `<div class="pj-card"><p class="small-note">Loading the peer evaluation…</p></div>`; return; }
      if (peerEditing && $("#pjPeerF", box)) return;
      const p = (peerDoc && peerDoc.gid === g.id) ? peerDoc : null, parts = (g.proposal && g.proposal.parts) || {};
      const intro = `<h2 class="h3">Peer Evaluation</h2><p><strong>Confidential.</strong> Rate every other member of your group, not yourself, on the three items (1 to 5 each). Your ratings are never shown to your group. They are used only to share the group mark fairly (the individual factor).</p>`;
      if (p && !peerEditing) {
        box.innerHTML = `<div class="pj-card ok">${intro}<p><strong>✓ Submitted ${esc(when(p.at))}.</strong> You can change it until your lecturer closes the peer evaluation.</p><p class="pj-row"><button type="button" class="btn ghost small" data-pedit>Change my ratings</button></p></div>`;
        $("[data-pedit]", box).addEventListener("click", () => { peerEditing = true; paintPeer(); });
        return;
      }
      const val = (m, i) => (p && p.ratings && p.ratings[m] ? p.ratings[m][i] : "");
      box.innerHTML = `<form class="pj-card pj-peer" id="pjPeerF" novalidate>${intro}
        <details class="pj-scale"><summary>The rating scale</summary><ul>${[5, 4, 3, 2, 1].map((k) => `<li><b>${k}</b> ${esc(SCALE[k])}</li>`).join("")}</ul><ol>${PEER_ITEMS.map(([t, d]) => `<li><b>${t}:</b> ${esc(d)}.</li>`).join("")}</ol></details>
        ${others.map((m) => `<fieldset class="pj-prate"><legend><strong>${esc(nameOf(m))}</strong>${parts[m] ? ` <span class="small-note">Own part: ${esc(parts[m])}</span>` : ""}</legend>
          <div class="pj-items">${PEER_ITEMS.map(([t], i) => `<label>${t}<select class="pj-in" name="r_${esc(m)}_${i}"><option value="">–</option>${[5, 4, 3, 2, 1].map((k) => `<option value="${k}"${+val(m, i) === k ? " selected" : ""}>${k}</option>`).join("")}</select></label>`).join("")}<span class="pj-tot" data-tot="${esc(m)}"></span></div>
          <label class="pj-l">Comment <span>(needed for any score of 2 or below)</span><input class="pj-in" name="c_${esc(m)}" value="${esc(p && p.comments ? p.comments[m] || "" : "")}"></label></fieldset>`).join("")}
        <label class="pj-radio"><input type="checkbox" name="decl"${p ? " checked" : ""}> I declare that these ratings are honest and based on each member's actual work in this project.</label>
        <div class="pj-row"><button class="btn">${p ? "Save my changes" : "Submit my ratings"}</button>${p ? `<button type="button" class="btn ghost" data-pcancel>Cancel</button>` : ""}</div><p class="pj-err" id="pjPerr" role="alert"></p></form>`;
      const f = $("#pjPeerF", box);
      const totals = () => others.forEach((m) => { const r = [0, 1, 2].map((i) => +f.elements[`r_${m}_${i}`].value || 0); $(`[data-tot="${m}"]`, f).textContent = r.every(Boolean) ? `Total ${r.reduce((a, b) => a + b, 0)} / 15` : ""; });
      f.addEventListener("input", () => { peerEditing = true; totals(); });
      totals();
      const cn = $("[data-pcancel]", f); if (cn) cn.addEventListener("click", () => { peerEditing = false; paintPeer(); });
      f.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const ratings = {}, comments = {}, err = (t) => { $("#pjPerr", f).textContent = t; };
        for (const m of others) {
          const r = [0, 1, 2].map((i) => +f.elements[`r_${m}_${i}`].value || 0), c = f.elements[`c_${m}`].value.trim();
          if (!r.every(Boolean)) return err(`Rate ${nameOf(m)} on all three items.`);
          if (r.some((x) => x <= 2) && c.length < 5) return err(`Give a short reason for the score of 2 or below for ${nameOf(m)}.`);
          ratings[m] = r; comments[m] = c;
        }
        if (!f.elements.decl.checked) return err("Tick the declaration.");
        const d = { semester: SEM, gid: g.id, m: me.m, ratings, comments, at: FV.serverTimestamp() };
        $("button.btn", f).disabled = true;
        db.collection("ppeer").doc(`${SLUG}_${me.m}`).set(d).then(() => { peerDoc = Object.assign({}, d, { at: Date.now() }); peerEditing = false; paintPeer(); })
          .catch((e2) => { $("button.btn", f).disabled = false; err(`Not saved (${e2.code || e2}). The peer evaluation may have closed.`); });
      });
    }
    /* no group yet: invitations, or start one */
    function noGroup() {
      const open = beforeDue();
      const cards = invites.filter((g) => g.status !== "approved").map((g) => `<div class="pj-card pj-inv"><p><strong>${esc(nameOf(g.leader))}</strong> invites you to join their mini project group.</p>
        <p class="small-note">Members: ${g.memberM.map((m) => esc(nameOf(m))).join(", ")}${g.inviteM.length > 1 ? ` · also invited: ${g.inviteM.filter((m) => m !== me.m).map((m) => esc(nameOf(m))).join(", ")}` : ""}${g.proposal && g.proposal.title ? ` · Title so far: “${esc(g.proposal.title)}”` : ""}</p>
        <div class="pj-row"><button type="button" class="btn" data-accept="${g.id}">Accept and join</button><button type="button" class="btn ghost" data-decline="${g.id}">Decline</button></div></div>`).join("");
      return `${cards ? `<h2 class="h3">Invitations</h2>${cards}` : ""}
        <div class="pj-card"><h2 class="h3">You Are Not in a Group Yet</h2>
        <p>Groups have ${MIN} to ${MAX} students, from any lab section. One of you creates the group and invites the others; each of them accepts the invitation. Then your group writes and submits its title proposal by <strong>${esc(when(dueMs()))}</strong>.</p>
        ${open ? `<button type="button" class="btn" data-create>Create a group</button><p class="small-note">Waiting for an invitation from a classmate? It appears here and in the 🔔 bell.</p>`
          : `<p class="pj-warn">The deadline for group registration has passed. Please see your lecturer, who will place you in a group.</p>`}</div>`;
    }
    /* in a group */
    function groupView(g) {
      const lead = g.leader === me.m, open = beforeDue() || ["amend", "approved"].includes(g.status), n = g.memberM.length;
      const team = open && ["forming", "amend"].includes(g.status);   // members change only while the proposal is being written
      const members = g.memberM.map((m) => `<li><strong>${esc(nameOf(m))}</strong>${m === g.leader ? ' <span class="pj-tag">Created the group</span>' : ""}${m === me.m ? ' <span class="pj-tag me">You</span>' : ""} <small>${esc(m)}${secOf(m) ? ` · ${esc(secOf(m))} lab` : ""}</small>
        ${team && m !== me.m && lead ? `<button type="button" class="pj-x" data-remove="${esc(m)}" aria-label="Remove ${esc(nameOf(m))} from the group">Remove</button>` : ""}</li>`).join("");
      const pend = g.inviteM.map((m) => `<li>${esc(nameOf(m))} <span class="pj-tag wait">Invited, waiting</span>${team ? ` <button type="button" class="pj-x" data-uninvite="${esc(m)}">Cancel invitation</button>` : ""}</li>`).join("");
      const dec = (g.declinedM || []).filter((m) => !g.inviteM.includes(m) && !g.memberM.includes(m)).map((m) => `<li class="pj-dec">${esc(nameOf(m))} declined</li>`).join("");
      const canInvite = team && n + g.inviteM.length < MAX;
      const full = n >= MIN && !g.inviteM.length, wrote = !!(g.proposal && g.proposal.title), st = g.status;
      const steps = [["Group formed", full ? `${n} members` : `${n} of ${MIN} to ${MAX} members`, full], ["Proposal written", st === "forming" ? (wrote ? "In progress" : "Not started") : "Submitted", st !== "forming"],
        ["Lecturer's review", st === "submitted" ? "Waiting for review" : st === "amend" ? "Amendment requested" : st === "approved" ? "Done" : "After you submit", st === "approved"], ["Approved", st === "approved" ? gname(g) : "Group number given", st === "approved"]];
      const cur = steps.findIndex((x) => !x[2]);
      const tracker = `<ol class="pj-steps" aria-label="Your progress">${steps.map(([t, d, ok], i) => `<li class="${ok ? "done" : i === cur ? "now" : ""}"${i === cur ? ' aria-current="step"' : ""}><b>${i + 1} · ${t}</b><span>${esc(d)}</span></li>`).join("")}</ol>`;
      const head = tracker + `<div class="pj-card"><div class="pj-gh"><h2 class="h3">${g.no ? esc(gname(g)) : "Your Group"}</h2><span class="pj-st ${g.status}">${STATUS[g.status]}</span></div>${g.no ? "" : `<p class="small-note">Your group gets its number when the title is approved.</p>`}
        <ul class="pj-mem">${members}${pend}${dec}</ul>
        ${canInvite ? `<div class="pj-invite" id="pjInvite"></div>` : ""}
        <p class="small-note">${n + g.inviteM.length}/${MAX} places used. ${n < MIN ? `Your group needs at least ${MIN} members before it can submit.` : n === MIN ? "Groups of 3 only where the class numbers require it: your lecturer may ask you to take a fourth member." : ""}</p>
        ${team ? `<p class="pj-row"><button type="button" class="btn ghost small" data-leave>${n === 1 ? "Delete this group" : "Leave this group"}</button></p>` : ""}</div>`;
      let body = "";
      if (g.status === "approved" && !editing) {
        body = `<div class="pj-card ok"><p><strong>✓ Your title is approved.</strong> ${g.review && g.review.note ? `Lecturer's note: “${esc(g.review.note)}”` : ""}</p>${proposalView(g.proposal, g)}
          <p class="pj-row"><button type="button" class="btn ghost small" data-change>Request a title change</button></p><p class="small-note">A change goes back to your lecturer for approval. Your approved title stays until the change is approved.</p></div>`;
      } else if (g.status === "submitted" && !editing) {
        body = `<div class="pj-card"><p><strong>Submitted ${esc(when(g.submittedAt))}.</strong> Your lecturer will review it and approve it or ask for an amendment. You'll see it here and in the 🔔 bell.</p>${proposalView(g.proposal, g)}
          ${beforeDue() ? `<p class="pj-row"><button type="button" class="btn ghost small" data-edit>Edit the proposal</button></p><p class="small-note">Editing takes it back from the review queue until you submit again.</p>` : ""}</div>`;
      } else if (open) {
        body = `${g.status === "amend" ? `<div class="pj-card warn"><p><strong>Your lecturer asks for an amendment:</strong></p><p class="pj-note">“${esc(g.review && g.review.note)}”</p><p class="small-note">Change the proposal below, then submit it again.</p></div>` : ""}${form(g)}`;
      } else body = `<p class="pj-warn">The deadline has passed. Please see your lecturer.</p>`;
      return head + body + timeline(g);
    }
    /* the proposal form */
    function form(g) {
      const fresh = !draft, own = g.status === "forming" || g.status === "amend", mineLocal = fresh && own ? localDraft(g.id) : null;
      const p = draft || mineLocal || (g.proposal ? JSON.parse(JSON.stringify(g.proposal)) : { title: "", industry: "", synopsis: "", sensors: [{ name: "", analog: false, cal: false }, { name: "", analog: false, cal: false }], conds: [{ name: "", resp: "" }, { name: "", resp: "" }, { name: "", resp: "" }], outs: ["", ""], platform: "", platformOther: "", calRef: "", parts: {} });
      if (fresh) { loadedP = JSON.stringify(g.proposal || null); dirty = !!mineLocal && JSON.stringify(mineLocal) !== loadedP; restored = dirty; if (!dirty && own) dropLocal(); }
      draft = p; editing = true;
      const opt = (l) => l.map((x) => `<option value="${esc(x)}">`).join("");
      return `<form class="pj-card pj-form" id="pjForm" novalidate><h2 class="h3">Title Proposal</h2><p class="small-note">${own ? "Any member can edit it. Press <strong>Save</strong> to share your changes with your group; submit when every check below is ticked." : "Change what you need, then submit it: the change goes to your lecturer."}</p>${dirty && restored ? `<p class="pj-note pj-restored">Your unsaved changes on this device are back. Press Save to keep them for your group.</p>` : ""}<div id="pjOther"></div>
        <datalist id="pjSens">${opt(SENSORS)}</datalist><datalist id="pjOuts">${opt(OUTS)}</datalist>
        <label class="pj-l" for="pjT">Project title</label><input id="pjT" class="pj-in" maxlength="120" data-f="title" value="${esc(p.title)}" placeholder="e.g. Smart DC Energy Meter with Overload Protection">
        <div id="pjClash" aria-live="polite"></div>
        <fieldset class="pj-fs"><legend class="pj-l">Industry</legend>${Object.entries(IND).map(([k, l]) => `<label class="pj-radio"><input type="radio" name="ind" value="${k}"${p.industry === k ? " checked" : ""}> (${k}) ${l}</label>`).join("")}</fieldset>
        <label class="pj-l" for="pjS">Short synopsis <span>(what your system does, and for whom; up to ${WORDS} words)</span></label><textarea id="pjS" class="pj-in" rows="5" data-f="synopsis">${esc(p.synopsis)}</textarea><p class="small-note" id="pjWc"></p>
        <fieldset class="pj-fs"><legend class="pj-l">Sensors <span>(at least 2; at least one analog sensor that you will calibrate ★)</span></legend><div id="pjSensors">${p.sensors.map((s, i) => sensorRow(s, i)).join("")}</div>
          <button type="button" class="btn ghost small" data-addsens>+ Add a sensor</button></fieldset>
        <fieldset class="pj-fs"><legend class="pj-l">The three conditions <span>(of one sensor, e.g. Normal, Warning, Critical, and what the system does in each)</span></legend>
          ${p.conds.map((c, i) => `<div class="pj-cond"><input class="pj-in" data-cond="${i}" data-k="name" value="${esc(c.name)}" placeholder="Condition ${i + 1}" aria-label="Condition ${i + 1}"><input class="pj-in" data-cond="${i}" data-k="resp" value="${esc(c.resp)}" placeholder="System response" aria-label="Response to condition ${i + 1}"></div>`).join("")}</fieldset>
        <fieldset class="pj-fs"><legend class="pj-l">Actuators and outputs <span>(at least 2 different types)</span></legend><div id="pjOutsBox">${p.outs.map((o, i) => outRow(o, i)).join("")}</div>
          <button type="button" class="btn ghost small" data-addout>+ Add an output</button></fieldset>
        <label class="pj-l" for="pjP">IoT platform (WiFi dashboard with analytics)</label><select id="pjP" class="pj-in" data-f="platform"><option value="">Choose…</option>${PLAT.map((x) => `<option${p.platform === x ? " selected" : ""}>${x}</option>`).join("")}</select>
        <input class="pj-in" data-f="platformOther" value="${esc(p.platformOther)}" placeholder="Which platform?" aria-label="Other platform"${p.platform === "Other" ? "" : " hidden"}>
        <label class="pj-l" for="pjR">Calibration reference <span>(what you will compare the ★ sensor with, e.g. multimeter, ruler, known temperatures)</span></label><input id="pjR" class="pj-in" data-f="calRef" value="${esc(p.calRef)}">
        <fieldset class="pj-fs"><legend class="pj-l">Each member's own part <span>(e.g. the sensor and its calibration, the condition logic, the actuators, the WiFi and Bluetooth apps)</span></legend>
          ${g.memberM.map((m) => `<label class="pj-part"><span>${esc(nameOf(m))}</span><input class="pj-in" data-part="${esc(m)}" value="${esc((p.parts || {})[m] || "")}" aria-label="Own part of ${esc(nameOf(m))}"></label>`).join("")}</fieldset>
        <ul class="pj-checks" id="pjChecks"></ul>
        <div class="pj-row"><button class="btn" id="pjSubmit">${g.status === "approved" ? "Submit the title change" : g.status === "amend" ? "Submit again" : "Submit the proposal"}</button>${own ? `<button type="button" class="btn ghost pj-save" id="pjSave" hidden>Save</button>` : `<button type="button" class="btn ghost" data-cancel>Cancel</button>`}<span class="small-note" id="pjSaved" aria-live="polite"></span></div></form>`;
    }
    const sensorRow = (s, i) => `<div class="pj-sens"><input class="pj-in" list="pjSens" data-sens="${i}" value="${esc(s.name)}" placeholder="Sensor ${i + 1}" aria-label="Sensor ${i + 1}">
      <label class="pj-chk"><input type="checkbox" data-analog="${i}"${s.analog ? " checked" : ""}> Analog</label><label class="pj-chk"><input type="radio" name="cal" data-cal="${i}"${s.cal ? " checked" : ""}> ★ Calibrate</label>
      ${i > 1 ? `<button type="button" class="pj-x" data-delsens="${i}" aria-label="Remove sensor ${i + 1}">✕</button>` : ""}</div>`;
    const outRow = (o, i) => `<div class="pj-sens"><input class="pj-in" list="pjOuts" data-out="${i}" value="${esc(o)}" placeholder="Output ${i + 1}" aria-label="Output ${i + 1}">${i > 1 ? `<button type="button" class="pj-x" data-delout="${i}" aria-label="Remove output ${i + 1}">✕</button>` : ""}</div>`;
    // the design requirements a proposal must meet before it can be submitted
    function problems(p, g) {
      const sens = p.sensors.filter((s) => s.name.trim()), outs = p.outs.map((o) => o.trim()).filter(Boolean);
      return [
        [p.title.trim().length >= 8, "A project title"],
        [!!p.industry, "The industry: (a), (b) or (c)"],
        [words(p.synopsis) >= 20 && words(p.synopsis) <= WORDS, `A synopsis of 20 to ${WORDS} words (now ${words(p.synopsis)})`],
        [sens.length >= 2, "At least 2 sensors"],
        [sens.some((s) => s.analog && s.cal), "One analog sensor marked ★ to calibrate"],
        [new Set(outs.map((o) => toks(o).join(" ") || o.toLowerCase())).size >= 2, "At least 2 different actuators or outputs"],
        [p.conds.every((c) => c.name.trim() && c.resp.trim()) && new Set(p.conds.map((c) => c.resp.trim().toLowerCase())).size === 3, "Three conditions, each with a different response"],
        [!!p.platform && (p.platform !== "Other" || !!p.platformOther.trim()), "The IoT platform"],
        [p.calRef.trim().length >= 3, "The calibration reference"],
        [g.memberM.every((m) => ((p.parts || {})[m] || "").trim()), "Each member's own part"],
        [g.memberM.length >= MIN && g.memberM.length <= MAX, `${MIN} to ${MAX} members in the group (now ${g.memberM.length})`],
        [!g.inviteM.length, "No invitations still waiting (cancel them, or wait for an answer)"]
      ];
    }
    function checks() {
      if (!mineG || !$("#pjForm")) return;
      const list = problems(draft, mineG), ok = list.every(([y]) => y);
      $("#pjChecks").innerHTML = list.map(([y, t]) => `<li class="${y ? "ok" : ""}">${y ? "✓" : "○"} ${esc(t)}</li>`).join("");
      $("#pjSubmit").disabled = !ok;
      $("#pjWc").textContent = `${words(draft.synopsis)} of ${WORDS} words`;
      // the closest approved title (other groups)
      const near = titles.filter((t) => t.id !== mineG.id).map((t) => [t, similarity(draft, t)]).sort((a, b) => b[1] - a[1])[0];
      $("#pjClash").innerHTML = near && draft.title.trim().length > 5 && level(near[1]) !== "green"
        ? `<p class="pj-clash ${level(near[1])}">${level(near[1]) === "red" ? "This looks like an approved title:" : "Similar to an approved title:"} <strong>${esc(gtag(near[0].no))} · ${esc(near[0].title)}</strong>. Choose a different application, industry or sensor so your project is your own. <a href="#pjTitlesH">See the approved titles</a></p>` : "";
    }
    // The proposal is saved with the Save button, not as you type (every pause was a write, half-typed text included).
    // While typing, the draft is kept on this device (no reads or writes), so a refresh or a closed tab loses nothing.
    const DKEY = "nmk-pj-draft";
    let dirty = false, loadedP = "", saveT = 0, restored = false;
    const localDraft = (gid) => { try { const x = JSON.parse(localStorage.getItem(DKEY) || "null"); return x && x.gid === gid ? x.draft : null; } catch (e) { return null; } };
    const keepLocal = () => { try { if (mineG && draft) localStorage.setItem(DKEY, JSON.stringify({ gid: mineG.id, draft, at: Date.now() })); } catch (e) { /* private mode */ } };
    const dropLocal = () => { try { localStorage.removeItem(DKEY); } catch (e) { /* private mode */ } };
    const paintSave = (msg) => {
      const b = $("#pjSave"), t = $("#pjSaved");
      if (b) { b.hidden = !dirty; b.disabled = false; }
      if (t) { t.textContent = msg !== undefined ? msg : dirty ? "Unsaved changes" : ""; t.classList.toggle("pj-unsaved", dirty && msg === undefined); }
    };
    const saveDraft = () => { dirty = true; clearTimeout(saveT); saveT = setTimeout(keepLocal, 400); paintSave(); };
    function saveNow() {
      if (!mineG || !draft) return;
      const b = $("#pjSave"); if (b) b.disabled = true;
      paintSave("Saving…");
      db.collection("pgroups").doc(mineG.id).update({ proposal: draft, updatedAt: FV.serverTimestamp() })
        .then(() => { dirty = false; restored = false; loadedP = JSON.stringify(draft); dropLocal(); paintSave("Saved ✓"); $$(".pj-restored").forEach((x) => x.remove()); const o = $("#pjOther"); if (o) o.innerHTML = ""; })
        .catch((e) => { paintSave(`Not saved (${e.code || e}). Try again.`); if (b) { b.hidden = false; b.disabled = false; } });
    }
    addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    function wire() {
      const v = $("#pjView"), g = mineG;
      const on = (sel, f) => $$(sel, v).forEach((b) => b.addEventListener("click", f));
      on("[data-create]", async (e) => {
        e.target.disabled = true;
        const ref = db.collection("pgroups").doc(), b = db.batch();
        b.set(ref, { semester: SEM, semKey: SLUG, leader: me.m, memberM: [me.m], inviteM: [], declinedM: [], status: "forming", no: null, proposal: null, history: [{ at: Date.now(), by: me.n, act: "created the group", note: "", title: "" }], createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
        b.set(db.collection("pmember").doc(`${SLUG}_${me.m}`), { semester: SEM, m: me.m, gid: ref.id });
        b.commit().catch((err) => { e.target.disabled = false; alertIn(v, `Could not create the group (${err.code || err}).`); });
      });
      on("[data-accept]", async (e) => {
        const gr = invites.find((x) => x.id === e.target.dataset.accept);
        if (!gr) return;
        if (gr.memberM.length >= MAX) return alertIn(v, "That group is already full.");
        e.target.disabled = true;
        const b = db.batch();
        b.update(db.collection("pgroups").doc(gr.id), { memberM: gr.memberM.concat([me.m]), inviteM: gr.inviteM.filter((m) => m !== me.m), updatedAt: FV.serverTimestamp(), history: hist(gr, "joined the group") });
        b.set(db.collection("pmember").doc(`${SLUG}_${me.m}`), { semester: SEM, m: me.m, gid: gr.id });
        b.commit().catch((err) => { e.target.disabled = false; alertIn(v, `Could not join (${err.code || err}). You may already be in a group, or the deadline has passed.`); });
      });
      on("[data-decline]", (e) => {
        const gr = invites.find((x) => x.id === e.target.dataset.decline);
        if (gr) db.collection("pgroups").doc(gr.id).update({ inviteM: gr.inviteM.filter((m) => m !== me.m), declinedM: (gr.declinedM || []).concat([me.m]), updatedAt: FV.serverTimestamp(), history: hist(gr, "declined the invitation") }).catch((err) => alertIn(v, `Could not decline (${err.code || err}).`));
      });
      if (!g) return;
      const ref = db.collection("pgroups").doc(g.id);
      on("[data-uninvite]", (e) => { const m = e.target.dataset.uninvite; ref.update({ inviteM: g.inviteM.filter((x) => x !== m), updatedAt: FV.serverTimestamp(), history: hist(g, `cancelled the invitation to ${nameOf(m)}`) }).catch((err) => alertIn(v, err.code || err)); });
      on("[data-remove]", (e) => {
        const m = e.target.dataset.remove;
        if (!confirm(`Remove ${nameOf(m)} from your group?`)) return;
        const b = db.batch(), parts = Object.assign({}, (g.proposal || {}).parts); delete parts[m];
        b.update(ref, Object.assign({ memberM: g.memberM.filter((x) => x !== m), updatedAt: FV.serverTimestamp(), history: hist(g, `removed ${nameOf(m)}`) }, g.proposal ? { proposal: Object.assign({}, g.proposal, { parts }) } : {}));
        b.delete(db.collection("pmember").doc(`${SLUG}_${m}`));
        b.commit().catch((err) => alertIn(v, `Could not remove (${err.code || err}).`));
      });
      on("[data-leave]", () => {
        const last = g.memberM.length === 1;
        if (!confirm(last ? "Delete your group? Pending invitations are cancelled." : "Leave this group? You can then join or create another one.")) return;
        const b = db.batch();
        if (last) b.delete(ref);
        else b.update(ref, { memberM: g.memberM.filter((x) => x !== me.m), leader: g.leader === me.m ? g.memberM.find((x) => x !== me.m) : g.leader, updatedAt: FV.serverTimestamp(), history: hist(g, "left the group") });
        b.delete(db.collection("pmember").doc(`${SLUG}_${me.m}`));
        editing = false; draft = null;
        b.commit().catch((err) => alertIn(v, `Could not leave (${err.code || err}).`));
      });
      on("[data-edit]", () => { ref.update({ status: "forming", updatedAt: FV.serverTimestamp(), history: hist(g, "took the proposal back to edit it") }).catch((err) => alertIn(v, err.code || err)); });
      on("[data-change]", () => { editing = true; draft = JSON.parse(JSON.stringify(g.proposal)); shown = ""; v.innerHTML = groupView(g); wire(); });
      on("[data-cancel]", () => { editing = false; draft = null; shown = ""; dirty = false; paint(); });
      if ($("#pjInvite", v)) invitePicker($("#pjInvite", v), g);
      const f = $("#pjForm", v);
      if (!f) { editing = false; return; }
      const redraw = (box, rows) => { $(box, v).innerHTML = rows; };
      f.addEventListener("input", (e) => {
        const t = e.target, d = draft;
        if (t.dataset.f) { d[t.dataset.f] = t.value; if (t.dataset.f === "platform") $("[data-f=platformOther]", f).hidden = t.value !== "Other"; }
        else if (t.dataset.sens) d.sensors[+t.dataset.sens].name = t.value;
        else if (t.dataset.analog) d.sensors[+t.dataset.analog].analog = t.checked;
        else if (t.dataset.cal) d.sensors.forEach((s, i) => { s.cal = i === +t.dataset.cal; });
        else if (t.dataset.cond) d.conds[+t.dataset.cond][t.dataset.k] = t.value;
        else if (t.dataset.out) d.outs[+t.dataset.out] = t.value;
        else if (t.dataset.part) { d.parts = d.parts || {}; d.parts[t.dataset.part] = t.value; }
        else if (t.name === "ind") d.industry = t.value;
        checks(); saveDraft();
      });
      f.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.hasAttribute("data-addsens")) { draft.sensors.push({ name: "", analog: false, cal: false }); redraw("#pjSensors", draft.sensors.map(sensorRow).join("")); }
        else if (b.dataset.delsens) { draft.sensors.splice(+b.dataset.delsens, 1); redraw("#pjSensors", draft.sensors.map(sensorRow).join("")); }
        else if (b.hasAttribute("data-addout")) { draft.outs.push(""); redraw("#pjOutsBox", draft.outs.map(outRow).join("")); }
        else if (b.dataset.delout) { draft.outs.splice(+b.dataset.delout, 1); redraw("#pjOutsBox", draft.outs.map(outRow).join("")); }
        else return;
        checks(); saveDraft();
      });
      const sv = $("#pjSave", f); if (sv) sv.addEventListener("click", saveNow);
      paintSave();
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (problems(draft, g).some(([y]) => !y)) return;
        clearTimeout(saveT);
        const near = titles.filter((t) => t.id !== g.id).map((t) => [t, similarity(draft, t)]).sort((a, b) => b[1] - a[1])[0];
        if (near && level(near[1]) === "red" && !confirm(`Your proposal looks like ${gtag(near[0].no)} · “${near[0].title}”, which is already approved. Your lecturer will see this. Submit anyway?`)) return;
        $("#pjSubmit").disabled = true;
        const p = Object.assign({}, draft, { title: draft.title.trim().replace(/\s+/g, " "), synopsis: draft.synopsis.trim(), sensors: draft.sensors.filter((s) => s.name.trim()).map((s) => Object.assign({}, s, { name: s.name.trim() })), outs: draft.outs.map((o) => o.trim()).filter(Boolean) });
        ref.update({ proposal: p, status: "submitted", submittedAt: FV.serverTimestamp(), version: (g.version || 0) + 1, updatedAt: FV.serverTimestamp(), history: hist(Object.assign({}, g, { proposal: p }), g.status === "approved" ? "asked for a title change" : g.status === "amend" ? "submitted the amended proposal" : "submitted the proposal") })
          .then(() => { editing = false; draft = null; shown = ""; dirty = false; dropLocal(); })
          .catch((err) => { $("#pjSubmit").disabled = false; alertIn(v, `Could not submit (${err.code || err}).`); });
      });
      checks();
    }
    async function loadClaims() {
      loadClaims.done = true;
      try { const q = await db.collection("pmember").where("semester", "==", SEM).get(); claims = {}; q.docs.forEach((d) => { claims[d.data().m] = d.data().gid; }); }
      catch (e) { /* the rules still stop a student joining two groups */ }
    }
    // invite by search only: classmates not in a group and not already invited
    function invitePicker(el, g) {
      el.innerHTML = `<label class="pj-l" for="pjQ">Invite a classmate <span>Type at least 2 letters of a name, or the matric number</span></label><input id="pjQ" class="pj-in" type="search" autocomplete="off" spellcheck="false" placeholder="e.g. Ahmad or 2313"><ul class="pj-pick" role="listbox"></ul>`;
      const inp = $("input", el), ul = $("ul", el);
      // who is already in a group: read once per page, only when someone starts typing a name here
      inp.addEventListener("input", async () => {
        if (!loadClaims.done) await loadClaims();
        const q = inp.value.trim().toLowerCase(), ws = q.split(/\s+/).filter(Boolean);
        const hits = q.length < 2 ? [] : mates.filter((x) => String(x.m) !== me.m && !g.memberM.includes(String(x.m)) && !g.inviteM.includes(String(x.m)) && !claims[String(x.m)])
          .filter((x) => (/^\d+$/.test(q) ? String(x.m).includes(q) : ws.every((w) => x.n.toLowerCase().split(/\s+/).some((p) => p.startsWith(w))))).slice(0, 8);
        ul.innerHTML = hits.map((x) => `<li><button type="button" data-m="${esc(x.m)}"><strong>${esc(x.n)}</strong><span>${esc(x.m)}${x.s ? ` · ${SEC[x.s]} lab` : ""}</span></button></li>`).join("") || (q.length >= 2 ? `<li class="pj-none">No classmate found who is free to invite.</li>` : "");
      });
      ul.addEventListener("click", (e) => {
        const b = e.target.closest("[data-m]"); if (!b) return;
        const m = b.dataset.m; b.disabled = true;
        db.collection("pgroups").doc(g.id).update({ inviteM: g.inviteM.concat([m]), declinedM: (g.declinedM || []).filter((x) => x !== m), updatedAt: FV.serverTimestamp(), history: hist(g, `invited ${nameOf(m)}`) })
          .catch((err) => alertIn(el, `Could not invite (${err.code || err}).`));
      });
    }
    const mine = db.collection("pgroups").where("memberM", "array-contains", me.m), inv = db.collection("pgroups").where("inviteM", "array-contains", me.m);
    const sems = (q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((g) => g.semester === SEM);
    unsubs.push(mine.onSnapshot((q) => {
      mineG = sems(q)[0] || null;
      if (!editing) draft = null;
      else if (mineG && (mineG.status === "forming" || mineG.status === "amend") && JSON.stringify(mineG.proposal || null) !== loadedP) {
        if (!dirty) { draft = null; shown = ""; }   // a group member saved: show their version
        else { const o = $("#pjOther"); if (o) o.innerHTML = `<p class="pj-warn">Another member of your group just saved changes. If you press Save, your version replaces theirs. <button type="button" class="btn ghost small" data-theirs>Show their version instead</button></p>`; }
      }
      watchLogs(); paint();
    }, (e) => fail(e)));
    host.addEventListener("click", (e) => { if (e.target.closest("[data-theirs]")) { dirty = false; dropLocal(); draft = null; shown = ""; paint(); } });
    unsubs.push(inv.onSnapshot((q) => { invites = sems(q); paint(); }, () => {}));
    unsubs.push(db.collection("ptitles").where("semester", "==", SEM).onSnapshot((q) => { titles = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.no - b.no); paint(); }, () => {}));
  }
  function alertIn(el, t) { let p = el.querySelector(".pj-err"); if (!p) { p = document.createElement("p"); p.className = "pj-err"; p.setAttribute("role", "alert"); el.prepend(p); } p.textContent = t; }

  /* ---------- shared views ---------- */
  function proposalView(p, g, names) {
    if (!p) return `<p class="small-note">No proposal yet.</p>`;
    const nm = names || nameOf;
    return `<dl class="pj-dl"><dt>Title</dt><dd><strong>${esc(p.title)}</strong></dd><dt>Industry</dt><dd>${esc(IND[p.industry] || "–")}</dd><dt>Synopsis</dt><dd>${esc(p.synopsis)}</dd>
      <dt>Sensors</dt><dd><ul>${(p.sensors || []).map((s) => `<li>${esc(s.name)}${s.analog ? " · analog" : ""}${s.cal ? " · <strong>★ calibrated</strong>" : ""}</li>`).join("")}</ul></dd>
      <dt>Conditions</dt><dd><ol>${(p.conds || []).map((c) => `<li><strong>${esc(c.name)}</strong>: ${esc(c.resp)}</li>`).join("")}</ol></dd>
      <dt>Outputs</dt><dd>${(p.outs || []).map(esc).join(" · ")}</dd><dt>Platform</dt><dd>${esc(p.platform === "Other" ? p.platformOther : p.platform)}</dd><dt>Calibration reference</dt><dd>${esc(p.calRef)}</dd>
      ${g ? `<dt>Own parts</dt><dd><ul>${g.memberM.map((m) => `<li><strong>${esc(nm(m))}</strong>: ${esc((p.parts || {})[m] || "–")}</li>`).join("")}</ul></dd>` : ""}</dl>`;
  }
  function timeline(g) {
    const h = (g.history || []).slice().reverse();
    return h.length ? `<details class="pj-card pj-hist"><summary>History (${h.length})</summary><ul>${h.map((x) => `<li><small>${esc(when(x.at))}</small> <strong>${esc(x.by)}</strong> ${esc(x.act)}${x.title ? `: “${esc(x.title)}”` : ""}${x.note ? `<br><span class="pj-note">“${esc(x.note)}”</span>` : ""}</li>`).join("")}</ul></details>` : "";
  }
  function titleList(titles, lec) {
    if (!titles.length) return `<p class="pj-empty">No titles approved yet. Approved titles appear here for the whole class, so you can see which ideas are taken.</p>`;
    return `<p class="small-note">${titles.length} approved title${titles.length === 1 ? "" : "s"}. Choose a project that is different from these: another application, industry or sensor.</p>
      <div class="pj-titles">${titles.map((t) => `<article class="pj-tcard"><span class="pj-no">${esc(gtag(t.no))}</span><h3>${esc(t.title)}</h3><p class="pj-ind">${esc(IND[t.industry] || "")}</p>
        <p>${esc(t.synopsis)}</p><p class="small-note"><strong>Sensors:</strong> ${(t.sensors || []).map((s) => esc(s.name)).join(", ")}<br><strong>Outputs:</strong> ${(t.outs || []).map(esc).join(", ")}</p>
        <p class="pj-team"><strong>Team:</strong> ${(t.members || []).map(esc).join(", ")}</p>${lec ? `<p class="small-note">Approved ${esc(when(t.approvedAt))}</p>` : ""}</article>`).join("")}</div>`;
  }

  /* =====================================================================
     LECTURERS
     ===================================================================== */
  function lecturer() {
    const SETS = { group: [["groups", "Groups"], ["clash", "Possible Clashes"], ["nogroup", "Not in a Group"], ["titles", "Approved Titles"]], progress: [["log", "Logbook"], ["peer", "Peer Evaluation"], ["marks", "Marks"]] };
    const lec = document.createElement("div");
    lec.innerHTML = `<div class="pj-tabs" role="tablist" aria-label="Lecturer views">${[...SETS.group, ...SETS.progress].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="false">${t}</button>`).join("")}</div>
      <div class="pj-review" id="pjRev" hidden></div><div id="pjView"><p class="small-note">Loading…</p></div>`;
    host.innerHTML = ""; host.appendChild(lec);
    if (host2) host2.innerHTML = "";
    let tab = (history.state && history.state.ptab) || "groups", groups = [], roster = [], claims = {}, titles = [], filter = "all", openId = null, layer = null, logsAll = {}, peers = [], marks = {};
    $$("[data-tab]", lec).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; closeRev(); if (window.NMKBack) NMKBack.view({ ptab: tab }); paint(); }));
    if (window.NMKBack) NMKBack.onView((s) => { if (s.ptab) { tab = s.ptab; place(); } });
    // show the lecturer's views that belong to the open page tab (Guidelines keeps the box under Group and Title)
    function place() {
      const set = pageTab === "progress" ? "progress" : "group", target = set === "progress" && host2 ? host2 : host;
      if (lec.parentNode !== target) { (lec.parentNode || target).innerHTML = ""; target.appendChild(lec); }
      $$("[data-tab]", lec).forEach((b) => { b.hidden = !SETS[set].some(([k]) => k === b.dataset.tab); });
      if (!SETS[set].some(([k]) => k === tab)) tab = SETS[set][0][0];
      if (groups.length || roster.length) paint();
    }
    document.addEventListener("pj:tab", () => { closeRev(); place(); });
    const N = () => roster.length, threesAllowed = () => { const n = N(); return n ? Math.max(0, MAX * Math.ceil(n / MAX) - n) : 0; };
    // every pair of proposals, most alike first
    const pairs = () => { const ps = groups.filter((g) => g.proposal && g.proposal.title && g.status !== "forming"), out = [];
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) out.push({ a: ps[i], b: ps[j], v: similarity(ps[i].proposal, ps[j].proposal) });
      return out.sort((x, y) => y.v - x.v); };
    const nearest = (g) => groups.filter((x) => x.id !== g.id && x.proposal && x.proposal.title && x.status !== "forming").map((x) => ({ g: x, v: similarity(g.proposal, x.proposal) })).sort((a, b) => b.v - a.v);
    function settings() {
      const due = new Date(dueMs() + 8 * 3600000).toISOString().slice(0, 16), inG = Object.keys(claims).length, threes = groups.filter((g) => g.memberM.length === 3 && g.status !== "forming").length;
      return `<div class="pj-card pj-set"><label class="pj-sw"><input type="checkbox" data-release${meta.released ? " checked" : ""}> <strong>Open to students</strong> <span>${meta.released ? "Students can register groups and submit proposals." : "Only lecturers can see this. Turn it on in week 7."}</span></label>
        <label class="pj-l" for="pjDue">Proposal deadline (Malaysia time)</label><div class="pj-row"><input type="datetime-local" id="pjDue" class="pj-in" value="${due}"><button type="button" class="btn ghost small" data-savedue>Save the deadline</button><span class="small-note" id="pjDueMsg"></span></div>
        <p class="pj-stats"><span><b>${N()}</b> students</span><span><b>${inG}</b> in a group</span><span><b>${Math.max(0, N() - inG)}</b> not yet</span><span><b>${groups.length}</b> groups (${N() ? Math.ceil(N() / MAX) : "–"} expected)</span>
          <span><b>${groups.filter((g) => g.status === "submitted").length}</b> to review</span><span><b>${groups.filter((g) => g.status === "approved").length}</b> approved</span><span>Groups of 3: <b>${threes}</b> of ${threesAllowed()} allowed</span></p></div>`;
    }
    function paint() {
      $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
      const v = $("#pjView");
      if (tab === "titles") { v.innerHTML = titleList(titles, true); return; }
      if (tab === "peer") return peerTab(v);
      if (tab === "marks") return marksTab(v);
      if (tab === "log") {
        const gs = groups.filter((g) => g.memberM.length).sort((a, b) => (a.no || 99) - (b.no || 99));
        const count = (w) => gs.filter((g) => (logsAll[g.id] || {})[w]).length;
        v.innerHTML = `<p class="small-note">One entry per group each week (weeks ${LOG_WEEKS[0]} to ${LOG_WEEKS[LOG_WEEKS.length - 1]}), due on Sunday at 11:59 PM. Green: on time · amber: written late · red: missing after the week ended. Tap a cell to read the entry and comment on it.</p>
          ${gs.length ? `<div class="adm-scroll"><table class="adm pj-lgrid"><thead><tr><th scope="col">Group</th>${LOG_WEEKS.map((w) => `<th scope="col">Week ${w}<small>${count(w)}/${gs.length} written</small></th>`).join("")}</tr></thead><tbody>
            ${gs.map((g) => `<tr><th scope="row">${g.no ? esc(gtag(g.no)) : "–"} <span>${esc((g.proposal && g.proposal.title) || g.memberM.map(nameOf).join(", "))}</span></th>${LOG_WEEKS.map((w) => { const e = (logsAll[g.id] || {})[w], st = logState(e, w);
              return `<td><button type="button" class="pj-cell ${st}" data-lcell="${g.id}|${w}"${!e && st === "soon" ? " disabled" : ""}>${LOGS[st]}${e && e.comment && e.comment.text ? " 💬" : ""}</button></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="pj-empty">No groups yet.</p>`}`;
        $$("[data-lcell]", v).forEach((b) => b.addEventListener("click", () => { const [gid, w] = b.dataset.lcell.split("|"); logPanel(gid, +w); }));
        return;
      }
      if (tab === "nogroup") {
        const free = roster.filter((r) => !claims[String(r.matric)]).sort((a, b) => (a.name < b.name ? -1 : 1));
        v.innerHTML = `<p class="small-note">${free.length} of ${N()} students are not in a group yet. To place one, open a group and use “Add a student”.</p>
          ${free.length ? `<ul class="pj-free">${free.map((r) => `<li><a href="profile.html?e=${encodeURIComponent(r.email)}">${esc(r.name)}</a> <small>${esc(r.matric)} · ${esc(SEC[r.section] || "no lab section")}</small></li>`).join("")}</ul>` : `<p class="pj-empty">Everyone is in a group. 🎉</p>`}`;
        return;
      }
      if (tab === "clash") {
        const ps = pairs().filter((p) => level(p.v) !== "green");
        v.innerHTML = `<p class="small-note">Pairs of submitted proposals that look alike, most alike first: the title and synopsis words (with everyday synonyms, in English and Malay), the sensors, the calibrated sensor and the industry. Open a pair to compare them side by side, or ask the AI for a second opinion.</p>
          ${ps.length ? `<ul class="pj-pairs">${ps.map((p) => pairLi(p)).join("")}</ul>` : `<p class="pj-empty">No similar pairs. 🟢</p>`}`;
        $$("[data-pair]", v).forEach((b) => b.addEventListener("click", () => { const [a, c] = b.dataset.pair.split("|"); compare(a, c); }));
        return;
      }
      const list = groups.filter((g) => filter === "all" || g.status === filter).sort((a, b) => (["submitted", "amend", "forming", "approved"].indexOf(a.status) - ["submitted", "amend", "forming", "approved"].indexOf(b.status)) || ((a.no || 99) - (b.no || 99)) || (ms(a.submittedAt) - ms(b.submittedAt)));
      v.innerHTML = `${settings()}<div class="pj-row pj-filt">${[["all", "All"], ["submitted", "To review"], ["amend", "Amendment requested"], ["approved", "Approved"], ["forming", "Forming"]].map(([k, l]) => `<button type="button" class="chip-btn" data-filt="${k}" aria-pressed="${filter === k}">${l} (${k === "all" ? groups.length : groups.filter((g) => g.status === k).length})</button>`).join("")}
        <button type="button" class="btn ghost small" data-csv>Download CSV</button></div>
        ${list.length ? `<div class="adm-scroll"><table class="adm pj-tab"><thead><tr><th scope="col">Group</th><th scope="col">Title</th><th scope="col">Members</th><th scope="col">Status</th><th scope="col">Closest match</th><th scope="col"></th></tr></thead><tbody>
          ${list.map((g) => { const nb = g.proposal && g.status !== "forming" ? nearest(g)[0] : null;
            return `<tr><td>${g.no ? esc(gtag(g.no)) : "–"}</td><td>${g.proposal && g.proposal.title ? esc(g.proposal.title) : '<span class="small-note">No title yet</span>'}</td>
              <td>${g.memberM.map((m) => esc(nameOf(m))).join("<br>")}${g.inviteM.length ? `<br><small>+ ${g.inviteM.length} invited</small>` : ""}</td><td><span class="pj-st ${g.status}">${STATUS[g.status]}</span>${g.submittedAt && g.status === "submitted" ? `<br><small>${esc(when(g.submittedAt))}</small>` : ""}</td>
              <td>${nb ? `<span class="pj-lv ${level(nb.v)}" title="Similarity ${Math.round(nb.v * 100)}%">${LEVEL[level(nb.v)]}</span><br><small>${esc(nb.g.proposal.title)}</small>` : "–"}</td>
              <td><button type="button" class="btn small${g.status === "submitted" ? "" : " ghost"}" data-open="${g.id}">${g.status === "submitted" ? "Review" : "Open"}</button></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="pj-empty">No groups here yet.</p>`}`;
      $$("[data-filt]", v).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.filt; paint(); }));
      $$("[data-open]", v).forEach((b) => b.addEventListener("click", () => review(b.dataset.open)));
      $("[data-release]", v).addEventListener("change", (e) => {
        const on = e.target.checked;
        const d = { released: on, updatedAt: FV.serverTimestamp() };
        if (!meta.dueAt) d.dueAt = firebase.firestore.Timestamp.fromDate(new Date(DUE0));
        db.collection("meta").doc("project").set(d, { merge: true }).then(() => { meta.released = on; if (d.dueAt) meta.dueAt = d.dueAt; paint(); }).catch((err) => { e.target.checked = !on; alertIn(v, `Could not change it (${err.code || err}). Publish the latest firebase/firestore.rules first.`); });
      });
      $("[data-savedue]", v).addEventListener("click", () => {
        const val = $("#pjDue", v).value; if (!val) return;
        const t = firebase.firestore.Timestamp.fromDate(new Date(`${val}:00+08:00`));
        db.collection("meta").doc("project").set({ dueAt: t }, { merge: true }).then(() => { meta.dueAt = t; $("#pjDueMsg", v).textContent = `Saved: ${when(t)}`; }).catch((err) => { $("#pjDueMsg", v).textContent = `Not saved (${err.code || err})`; });
      });
      $("[data-csv]", v).addEventListener("click", csv);
    }
    const pairLi = (p) => { const ai = ((p.a.ai || {})[p.b.id]) || ((p.b.ai || {})[p.a.id]);
      return `<li class="pj-pair"><span class="pj-lv ${level(p.v)}">${LEVEL[level(p.v)]} · ${Math.round(p.v * 100)}%</span>
        <span><strong>${esc(p.a.no ? gtag(p.a.no) : "–")}</strong> ${esc(p.a.proposal.title)} <span class="small-note">(${STATUS[p.a.status]})</span></span><span><strong>${esc(p.b.no ? gtag(p.b.no) : "–")}</strong> ${esc(p.b.proposal.title)} <span class="small-note">(${STATUS[p.b.status]})</span></span>
        ${ai ? `<span class="pj-ai ${ai.v}">AI: ${esc(AIV[ai.v] || ai.v)}${ai.r ? `: ${esc(ai.r)}` : ""}</span>` : ""}<button type="button" class="btn ghost small" data-pair="${p.a.id}|${p.b.id}">Compare</button></li>`; };
    /* the review panel: one group, in the page */
    const closeRev = () => { $("#pjRev").hidden = true; $("#pjRev").innerHTML = ""; openId = null; if (layer) { const l = layer; layer = null; l.closed(); } };
    function panel(html) {
      const r = $("#pjRev"); r.innerHTML = `<div class="pj-revin"><button type="button" class="pj-close" data-close aria-label="Close">✕ Close</button>${html}</div>`; r.hidden = false;
      if (!layer && window.NMKBack) layer = NMKBack.layer(() => { layer = null; $("#pjRev").hidden = true; openId = null; });
      $("[data-close]", r).addEventListener("click", closeRev); r.scrollIntoView({ block: "start" });
      return r;
    }
    function review(id, refresh) {
      const g = groups.find((x) => x.id === id);
      if (!g) { if (refresh) closeRev(); return; }
      if (refresh && $("#pjRev").contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") return;   // don't wipe a note being typed
      openId = id;
      const nb = g.proposal && g.status !== "forming" ? nearest(g).slice(0, 3) : [];
      const r = panel(`<div class="pj-gh"><h2 class="h3">${esc(gname(g))}</h2><span class="pj-st ${g.status}">${STATUS[g.status]}</span></div>
        <ul class="pj-mem">${g.memberM.map((m) => `<li><strong>${esc(nameOf(m))}</strong>${m === g.leader ? ' <span class="pj-tag">Created the group</span>' : ""} <small>${esc(m)}${secOf(m) ? ` · ${esc(secOf(m))} lab` : ""}</small> <button type="button" class="pj-x" data-lrm="${esc(m)}">Remove</button></li>`).join("")}
          ${g.inviteM.map((m) => `<li>${esc(nameOf(m))} <span class="pj-tag wait">Invited, waiting</span></li>`).join("")}</ul>
        ${g.memberM.length < MAX ? `<div id="pjAdd"></div>` : ""}
        ${g.memberM.length === 3 ? `<p class="small-note">A group of 3: ${groups.filter((x) => x.memberM.length === 3 && x.status !== "forming").length} of ${threesAllowed()} groups of 3 allowed for ${N()} students.</p>` : ""}
        ${proposalView(g.proposal, g)}
        ${nb.length ? `<h3 class="h3">Closest Proposals</h3><ul class="pj-pairs">${nb.map((x) => pairLi({ a: g, b: x.g, v: x.v })).join("")}</ul>` : ""}
        ${g.proposal && g.status !== "forming" ? `<label class="pj-l" for="pjNote">Note to the group <span>(needed for an amendment; optional when approving)</span></label><textarea id="pjNote" class="pj-in" rows="3"></textarea>
          <div class="pj-row"><button type="button" class="btn" data-approve>${g.status === "approved" ? "Approved ✓ (approve again)" : "Approve"}</button><button type="button" class="btn ghost" data-amend>Request amendment</button></div><p class="pj-err" id="pjRevErr" role="alert"></p>` : `<p class="small-note">The group has not submitted a proposal yet.</p>`}
        ${timeline(g)}<p class="pj-row"><button type="button" class="btn ghost small pj-danger" data-dissolve>Dissolve this group</button></p>`);
      const ref = db.collection("pgroups").doc(g.id), err = (t) => { $("#pjRevErr", r).textContent = t; };
      $$("[data-pair]", r).forEach((b) => b.addEventListener("click", () => { const [a, c] = b.dataset.pair.split("|"); compare(a, c); }));
      if ($("#pjAdd", r)) {
        const el = $("#pjAdd", r);
        el.innerHTML = `<label class="pj-l" for="pjAq">Add a student <span>not yet in a group</span></label><input id="pjAq" class="pj-in" type="search" autocomplete="off" placeholder="Name or matric"><ul class="pj-pick"></ul>`;
        const inp = $("input", el), ul = $("ul", el);
        inp.addEventListener("input", () => { const q = inp.value.trim().toLowerCase();
          ul.innerHTML = q.length < 2 ? "" : roster.filter((x) => !claims[String(x.matric)] && `${x.name} ${x.matric}`.toLowerCase().includes(q)).slice(0, 8).map((x) => `<li><button type="button" data-m="${esc(x.matric)}"><strong>${esc(x.name)}</strong><span>${esc(x.matric)} · ${esc(SEC[x.section] || "–")}</span></button></li>`).join("") || `<li class="pj-none">No free student found.</li>`; });
        ul.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; const m = String(b.dataset.m), bt = db.batch();
          bt.update(ref, { memberM: g.memberM.concat([m]), inviteM: g.inviteM.filter((x) => x !== m), updatedAt: FV.serverTimestamp(), history: hist(g, `added ${nameOf(m)}`) });
          bt.set(db.collection("pmember").doc(`${SLUG}_${m}`), { semester: SEM, m, gid: g.id });
          bt.commit().catch((e2) => err(`Could not add (${e2.code || e2}).`)); });
      }
      $$("[data-lrm]", r).forEach((b) => b.addEventListener("click", () => {
        const m = b.dataset.lrm; if (!confirm(`Remove ${nameOf(m)} from ${gname(g)}?`)) return;
        const bt = db.batch(); bt.update(ref, { memberM: g.memberM.filter((x) => x !== m), leader: g.leader === m ? (g.memberM.find((x) => x !== m) || g.leader) : g.leader, updatedAt: FV.serverTimestamp(), history: hist(g, `removed ${nameOf(m)}`) });
        bt.delete(db.collection("pmember").doc(`${SLUG}_${m}`)); bt.commit().catch((e2) => err(`Could not remove (${e2.code || e2}).`));
      }));
      $("[data-dissolve]", r).addEventListener("click", () => {
        if (!confirm(`Dissolve ${gname(g)}? Its members become free to join other groups, and its approved title is removed from the class list.`)) return;
        const bt = db.batch(); g.memberM.forEach((m) => bt.delete(db.collection("pmember").doc(`${SLUG}_${m}`))); bt.delete(ref); bt.delete(db.collection("ptitles").doc(g.id));
        bt.commit().then(closeRev).catch((e2) => err(`Could not dissolve (${e2.code || e2}).`));
      });
      const ap = $("[data-approve]", r);
      if (ap) ap.addEventListener("click", () => {
        const note = $("#pjNote", r).value.trim(), no = g.no || (Math.max(0, ...groups.map((x) => x.no || 0)) + 1), bt = db.batch();
        bt.update(ref, { status: "approved", no, approvedAt: FV.serverTimestamp(), review: { note, at: Date.now(), by: A.state.user.email }, updatedAt: FV.serverTimestamp(), history: hist(g, "approved the title", note) });
        bt.set(db.collection("ptitles").doc(g.id), { semester: SEM, no, title: g.proposal.title, industry: g.proposal.industry, synopsis: g.proposal.synopsis, sensors: g.proposal.sensors, outs: g.proposal.outs, conds: g.proposal.conds, members: g.memberM.map(nameOf), approvedAt: FV.serverTimestamp() });
        bt.commit().catch((e2) => err(`Could not approve (${e2.code || e2}).`));
      });
      const am = $("[data-amend]", r);
      if (am) am.addEventListener("click", () => {
        const note = $("#pjNote", r).value.trim(); if (!note) { err("Write what the group should change."); $("#pjNote", r).focus(); return; }
        ref.update({ status: "amend", review: { note, at: Date.now(), by: A.state.user.email }, updatedAt: FV.serverTimestamp(), history: hist(g, "asked for an amendment", note) }).catch((e2) => err(`Could not send (${e2.code || e2}).`));
      });
    }
    /* the peer evaluation: who rated whom (lecturers only) */
    function peerTab(v) {
      const gs = groups.filter((g) => g.memberM.length > 1).sort((a, b) => (a.no || 99) - (b.no || 99));
      const done = new Set(peers.map((p) => p.m)), all = gs.flatMap((g) => g.memberM), left = all.filter((m) => !done.has(m));
      v.innerHTML = `<div class="pj-card pj-set"><label class="pj-sw"><input type="checkbox" data-peeropen${meta.peer ? " checked" : ""}> <strong>Peer evaluation open</strong> <span>${meta.peer ? "Students can submit and change their ratings." : "Open it in week 15; close it after the demonstrations so the ratings stay final."}</span></label>
        <p class="pj-stats"><span><b>${done.size}</b> of ${all.length} students have submitted</span>${left.length ? `<span>Still to submit: ${left.map((m) => esc(nameOf(m))).join(", ")}</span>` : ""}</p></div>
        <p class="small-note">Each cell is the total (out of 15) the rater gave: Commitment + Collaboration + Contribution. Scores of 2 or below are marked ⚠, with the rater's reason. Students never see these.</p>
        ${gs.map((g) => { const ps = peers.filter((p) => p.gid === g.id);
          return `<div class="pj-card pj-pg"><h3 class="h3">${g.no ? esc(gtag(g.no)) : "–"} · ${esc((g.proposal && g.proposal.title) || "")}</h3><div class="pj-scroll"><table class="pj-table"><thead><tr><th scope="col">Rater ↓ / rated →</th>${g.memberM.map((m) => `<th scope="col">${esc(nameOf(m))}</th>`).join("")}</tr></thead><tbody>
            ${g.memberM.map((r) => { const p = ps.find((x) => x.m === r);
              return `<tr><th scope="row">${esc(nameOf(r))}${p ? `<small class="pj-sub">${esc(when(p.at))}</small>` : '<small class="pj-sub pj-warn">not submitted</small>'}</th>${g.memberM.map((t) => { if (t === r) return `<td class="pj-self">–</td>`; const x = p && p.ratings && p.ratings[t];
                return `<td>${x ? `<b>${x.reduce((a, b) => a + b, 0)}</b> <small>(${x.join(" + ")})</small>${x.some((y) => y <= 2) ? ` ⚠` : ""}${p.comments && p.comments[t] ? `<br><small class="pj-note">“${esc(p.comments[t])}”</small>` : ""}` : "–"}</td>`; }).join("")}</tr>`; }).join("")}
            <tr class="tot"><th scope="row">Average received</th>${g.memberM.map((m) => { const q = peerOf(m, g, peers); return `<td><b>${q.avg === null ? "–" : round2(q.avg)}</b> <small>${q.n} rating${q.n === 1 ? "" : "s"} · ${q.avg === null ? "no change" : q.adj ? q.adj.toFixed(1) : "no change"}</small></td>`; }).join("")}</tr></tbody></table></div></div>`; }).join("") || `<p class="pj-empty">No groups yet.</p>`}`;
      $("[data-peeropen]", v).addEventListener("change", (e) => {
        const on = e.target.checked;
        db.collection("meta").doc("project").set({ peer: on }, { merge: true }).then(() => { meta.peer = on; paint(); }).catch((err) => { e.target.checked = !on; alertIn(v, `Could not change it (${err.code || err}).`); });
      });
    }
    /* Project Marks: the group mark (A1 to C2) and each student's individual factor; saves as you type */
    const factorOf = (m, g, mk) => {
      const base = (D1.find((d) => d[0] === ((mk.d1 || {})[m])) || [0, 0, null])[2], q = peerOf(m, g, peers), ov = (mk.d2 || {})[m];
      const adj = ov === undefined || ov === "" ? q.adj : +ov;
      return { base, q, adj, auto: ov === undefined || ov === "", f: base === null ? null : Math.min(1, Math.max(0.6, round2(base + adj))) };
    };
    const groupMark = (mk) => PARTS.reduce((a, [k, , max]) => a + Math.min(max, Math.max(0, +((mk.parts || {})[k]) || 0)), 0);
    function marksTab(v) {
      const gs = groups.filter((g) => g.memberM.length).sort((a, b) => (a.no || 99) - (b.no || 99));
      v.innerHTML = `<p class="small-note">Only lecturers see this. Group mark = A1 to C2 (out of 100). Individual factor = D1 base factor (oral verification) + D2 peer adjustment, limited to 0.6 to 1.0. Individual mark = group mark × factor; grade = individual mark × 15 / 100. Everything saves as you type.</p>
        <p class="pj-row"><button type="button" class="btn ghost small" data-mcsv>Download the mark sheet (CSV)</button><span class="small-note" id="pjMkMsg" aria-live="polite"></span></p>
        ${gs.map((g) => { const mk = marks[g.id] || {};
          return `<div class="pj-card pj-mk" data-mg="${g.id}"><div class="pj-gh"><h3 class="h3">${g.no ? esc(gtag(g.no)) : "–"} · ${esc((g.proposal && g.proposal.title) || "No title yet")}</h3><span class="pj-gm">Group mark <b data-gm>${groupMark(mk)}</b> / 100</span></div>
            <div class="pj-mparts">${PARTS.map(([k, t, max]) => `<label><span>${k} ${esc(t)}</span><span class="pj-mx"><input type="number" class="pj-in" min="0" max="${max}" step="0.5" inputmode="decimal" data-mp="${k}" value="${(mk.parts || {})[k] === undefined ? "" : esc(mk.parts[k])}"> / ${max}</span></label>`).join("")}</div>
            <div class="pj-scroll"><table class="pj-table pj-mt"><thead><tr><th scope="col">Student</th><th scope="col">D1 oral verification</th><th scope="col">Peer average</th><th scope="col">D2 adjustment</th><th scope="col">Factor</th><th scope="col">Individual mark</th><th scope="col">Grade (15%)</th></tr></thead><tbody>
              ${g.memberM.map((m) => `<tr data-mm="${esc(m)}"><th scope="row">${esc(nameOf(m))}<small class="pj-sub">${esc(m)}</small></th>
                <td><select class="pj-in" data-d1="${esc(m)}"><option value="">Choose…</option>${D1.map(([k, l, f]) => `<option value="${k}"${(mk.d1 || {})[m] === k ? " selected" : ""}>${l} (${f.toFixed(1)})</option>`).join("")}</select></td>
                <td data-pa></td><td><select class="pj-in" data-d2="${esc(m)}"><option value="">From the ratings</option>${["0", "-0.1", "-0.2"].map((x) => `<option value="${x}"${(mk.d2 || {})[m] === x ? " selected" : ""}>${x === "0" ? "No change" : x} (reviewed)</option>`).join("")}</select><small class="pj-sub" data-d2a></small></td>
                <td data-f></td><td data-im></td><td data-gr></td></tr>`).join("")}</tbody></table></div></div>`; }).join("") || `<p class="pj-empty">No groups yet.</p>`}`;
      $$(".pj-mk", v).forEach(calc);
      if (!v.dataset.mk) { v.dataset.mk = "1"; v.addEventListener("input", onMark); v.addEventListener("change", onMark); }
      $("[data-mcsv]", v).addEventListener("click", markCsv);
    }
    function calc(card) {
      const g = groups.find((x) => x.id === card.dataset.mg), mk = marks[g.id] || {}, gm = groupMark(mk);
      $("[data-gm]", card).textContent = round2(gm);
      $$("[data-mp]", card).forEach((i) => { const x = i.value === "" ? null : +i.value; i.classList.toggle("bad", x !== null && (isNaN(x) || x < 0 || x > +i.max)); });
      $$("tr[data-mm]", card).forEach((tr) => {
        const m = tr.dataset.mm, r = factorOf(m, g, mk);
        $("[data-pa]", tr).innerHTML = r.q.avg === null ? `– <small class="pj-sub">no ratings yet</small>` : `${round2(r.q.avg)} / 15<small class="pj-sub">${r.q.n} rating${r.q.n === 1 ? "" : "s"}</small>`;
        $("[data-d2a]", tr).textContent = r.auto ? `= ${r.q.adj ? r.q.adj.toFixed(1) : "no change"}` : "";
        $("[data-f]", tr).textContent = r.f === null ? "–" : r.f.toFixed(2);
        $("[data-im]", tr).textContent = r.f === null ? "–" : round2(gm * r.f);
        $("[data-gr]", tr).textContent = r.f === null ? "–" : round2(gm * r.f * 0.15);
      });
    }
    const saveT = {};
    function onMark(e) {
      const card = e.target.closest(".pj-mk"); if (!card) return;
      const id = card.dataset.mg, mk = marks[id] = marks[id] || { semester: SEM, gid: id };
      if (e.target.dataset.mp) { mk.parts = Object.assign({}, mk.parts); if (e.target.value === "") delete mk.parts[e.target.dataset.mp]; else mk.parts[e.target.dataset.mp] = +e.target.value; }
      else if (e.target.dataset.d1 !== undefined) { mk.d1 = Object.assign({}, mk.d1, { [e.target.dataset.d1]: e.target.value }); }
      else if (e.target.dataset.d2 !== undefined) { mk.d2 = Object.assign({}, mk.d2, { [e.target.dataset.d2]: e.target.value }); }
      else return;
      calc(card);
      const msg = $("#pjMkMsg"); if (msg) msg.textContent = "Saving…";
      clearTimeout(saveT[id]);
      saveT[id] = setTimeout(() => db.collection("pmarks").doc(id).set({ semester: SEM, gid: id, parts: mk.parts || {}, d1: mk.d1 || {}, d2: mk.d2 || {}, updatedAt: FV.serverTimestamp(), by: A.state.user.email })
        .then(() => { delete saveT[id]; if (msg) msg.textContent = "Saved"; }).catch((err) => { delete saveT[id]; if (msg) msg.textContent = `Not saved (${err.code || err})`; }), 700);
    }
    function markCsv() {
      const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
      const rows = [["Group", "Title", ...PARTS.map(([k, , max]) => `${k} (${max})`), "Group mark (100)", "Student name", "Matric no.", "D1 base factor", "Peer average (15)", "D2 peer adjustment", "Individual factor", "Individual mark (100)", "Grade (15%)"].map(q).join(",")];
      groups.filter((g) => g.memberM.length).sort((a, b) => (a.no || 99) - (b.no || 99)).forEach((g) => { const mk = marks[g.id] || {}, gm = groupMark(mk);
        g.memberM.forEach((m) => { const r = factorOf(m, g, mk);
          rows.push([g.no ? gtag(g.no) : "", (g.proposal && g.proposal.title) || "", ...PARTS.map(([k]) => (mk.parts || {})[k] === undefined ? "" : mk.parts[k]), round2(gm), nameOf(m), m,
            r.base === null ? "" : r.base.toFixed(1), r.q.avg === null ? "" : round2(r.q.avg), r.adj.toFixed(1), r.f === null ? "" : r.f.toFixed(2), r.f === null ? "" : round2(gm * r.f), r.f === null ? "" : round2(gm * r.f * 0.15)].map(q).join(",")); }); });
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv" })); a.download = `NMK42003 mini project marks ${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    /* one logbook entry, with the lecturer's comment */
    function logPanel(gid, w) {
      const g = groups.find((x) => x.id === gid), e = (logsAll[gid] || {})[w];
      if (!g) return;
      openId = null;
      const r = panel(`<h2 class="h3">${esc(gname(g))}: Week ${w} <small class="pj-wd">${dayOf(weekStart(w))} to ${dayOf(weekEnd(w))}</small></h2><p class="small-note">${esc((g.proposal && g.proposal.title) || "")}</p>
        ${e ? `${logEntry(e, g, w, nameOf)}<label class="pj-l" for="pjLc">Your comment to the group</label><textarea id="pjLc" class="pj-in" rows="3">${esc((e.comment && e.comment.text) || "")}</textarea>
          <div class="pj-row"><button type="button" class="btn" data-lsave>Save the comment</button><span class="small-note" id="pjLcMsg" aria-live="polite"></span></div>` : `<p class="pj-warn">No entry for this week${nowMs() > weekEnd(w) ? ": it is missing." : " yet."}</p>`}
        <p class="pj-row"><button type="button" class="btn ghost small" data-lprint2>🖨 Print this group's logbook</button></p>`);
      $("[data-lprint2]", r).addEventListener("click", () => printLog(g, logsAll[gid] || {}, nameOf));
      const sv = $("[data-lsave]", r);
      if (sv) sv.addEventListener("click", () => {
        const text = $("#pjLc", r).value.trim();
        db.collection("plog").doc(`${gid}_w${w}`).update({ comment: { text, by: A.state.user.email, at: Date.now() } }).then(() => { $("#pjLcMsg", r).textContent = text ? "Saved. The group sees it under this week." : "Comment removed."; }).catch((err) => { $("#pjLcMsg", r).textContent = `Not saved (${err.code || err})`; });
      });
    }
    /* two proposals side by side, with the AI's second opinion */
    function compare(aId, bId) {
      const a = groups.find((x) => x.id === aId), b = groups.find((x) => x.id === bId);
      if (!a || !b) return;
      openId = null;
      const v = similarity(a.proposal, b.proposal), ai = ((a.ai || {})[b.id]) || ((b.ai || {})[a.id]);
      const r = panel(`<h2 class="h3">Compare Two Proposals</h2><p><span class="pj-lv ${level(v)}">${LEVEL[level(v)]} · ${Math.round(v * 100)}% alike</span></p>
        <div class="pj-cmp">${[a, b].map((g) => `<div><h3 class="h3">${esc(gname(g))} <span class="pj-st ${g.status}">${STATUS[g.status]}</span></h3>${proposalView(g.proposal, g)}<button type="button" class="btn ghost small" data-open2="${g.id}">Open this group</button></div>`).join("")}</div>
        <div class="pj-aibox">${ai ? `<p class="pj-ai ${ai.v}"><strong>AI second opinion:</strong> ${esc(AIV[ai.v] || ai.v)}${ai.r ? `. ${esc(ai.r)}` : ""} <small>(${esc(when(ai.at))})</small></p>` : ""}
          <button type="button" class="btn ghost" data-ai>🤖 ${ai ? "Ask the AI again" : "Ask AI: same idea?"}</button><p class="small-note" id="pjAiMsg" aria-live="polite">Only the project text is sent (no names or matric numbers). The AI only advises: you decide.</p></div>`);
      $$("[data-open2]", r).forEach((x) => x.addEventListener("click", () => review(x.dataset.open2)));
      $("[data-ai]", r).addEventListener("click", async (e) => {
        e.target.disabled = true; $("#pjAiMsg", r).textContent = "Asking the AI…";
        try {
          const res = await askAI(a.proposal, b.proposal);
          await db.collection("pgroups").doc(a.id).set({ ai: { [b.id]: Object.assign(res, { at: Date.now() }) } }, { merge: true });
          a.ai = Object.assign({}, a.ai, { [b.id]: Object.assign(res, { at: Date.now() }) }); compare(aId, bId);
        } catch (err) { e.target.disabled = false; $("#pjAiMsg", r).textContent = `The AI couldn't answer (${err.message || err}). Try again in a minute.`; }
      });
    }
    function csv() {
      const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
      const rows = [["Group", "Status", "Title", "Industry", "Synopsis", "Sensors", "Calibrated sensor", "Conditions", "Outputs", "Platform", "Calibration reference", "Members", "Matric numbers", "Own parts", "Submitted", "Approved"].map(q).join(",")];
      groups.slice().sort((x, y) => (x.no || 99) - (y.no || 99)).forEach((g) => { const p = g.proposal || {};
        rows.push([g.no ? gtag(g.no) : "", STATUS[g.status], p.title, IND[p.industry] || "", p.synopsis, (p.sensors || []).map((s) => s.name).join("; "), ((p.sensors || []).find((s) => s.cal) || {}).name || "", (p.conds || []).map((c) => `${c.name}: ${c.resp}`).join("; "), (p.outs || []).join("; "),
          p.platform === "Other" ? p.platformOther : p.platform, p.calRef, g.memberM.map(nameOf).join("; "), g.memberM.join("; "), g.memberM.map((m) => `${nameOf(m)}: ${(p.parts || {})[m] || ""}`).join("; "), g.submittedAt ? when(g.submittedAt) : "", g.approvedAt ? when(g.approvedAt) : ""].map(q).join(",")); });
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv" })); a.download = `NMK42003 mini project groups ${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    db.collection("roster").get().then((q) => { roster = q.docs.map((d) => Object.assign({ email: d.id }, d.data())).filter((r) => r.status === "active"); mates = roster.map((r) => ({ m: String(r.matric), n: r.name, s: r.section || "" })); paint(); }).catch(() => {});
    unsubs.push(db.collection("pgroups").where("semester", "==", SEM).onSnapshot((q) => { groups = q.docs.map((d) => Object.assign({ id: d.id }, d.data())); paint(); if (openId) review(openId, true); }, (e) => { $("#pjView").innerHTML = `<p class="small-note">Could not load the groups (${esc(e.code || e)}). If this says permission-denied, publish the latest firebase/firestore.rules.</p>`; }));
    unsubs.push(db.collection("pmember").where("semester", "==", SEM).onSnapshot((q) => { claims = {}; q.docs.forEach((d) => { claims[d.data().m] = d.data().gid; }); paint(); }, () => {}));
    unsubs.push(db.collection("ptitles").where("semester", "==", SEM).onSnapshot((q) => { titles = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.no - b.no); paint(); }, () => {}));
    unsubs.push(db.collection("plog").where("semester", "==", SEM).onSnapshot((q) => { logsAll = {}; q.docs.forEach((d) => { const x = d.data(); (logsAll[x.gid] = logsAll[x.gid] || {})[x.week] = x; }); if (tab === "log" && !$("#pjLc")) paint(); }, () => {}));
    unsubs.push(db.collection("ppeer").where("semester", "==", SEM).onSnapshot((q) => { peers = q.docs.map((d) => d.data()); if (tab === "peer") paint(); else if (tab === "marks") $$(".pj-mk").forEach(calc); }, () => {}));
    unsubs.push(db.collection("pmarks").where("semester", "==", SEM).onSnapshot((q) => { q.docs.forEach((d) => { if (!saveT[d.id]) marks[d.id] = d.data(); }); if (tab === "marks" && !(document.activeElement && document.activeElement.closest && document.activeElement.closest(".pj-mk"))) paint(); }, () => {}));
    place();
  }

  /* ---------- the AI's second opinion (through the Ask Dr. Zamri connection) ---------- */
  const AIV = { same: "Same idea", similar: "Similar but different", different: "Different" };
  async function askAI(p, q) {
    const AI = window.NMKAI;
    if (!AI) throw new Error("the AI connection didn't load");
    const brief = (x) => `Title: ${x.title}\nIndustry: ${IND[x.industry] || ""}\nSynopsis: ${x.synopsis}\nSensors: ${(x.sensors || []).map((s) => s.name + (s.cal ? " (calibrated)" : "")).join(", ")}\nConditions: ${(x.conds || []).map((c) => `${c.name} -> ${c.resp}`).join("; ")}\nOutputs: ${(x.outs || []).join(", ")}`;
    const resp = await fetch(AI.ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI.MODEL, temperature: 0, max_tokens: 300, reasoning_effort: "low", messages: [
        { role: "system", content: "You help a university lecturer check whether two student IoT mini project proposals are the same idea. Judge the application and purpose, what is measured, and how the system responds; ignore wording. Same idea = a lecturer would see one as a copy of the other. Similar but different = same area but a clearly different application, measurement or response. Different = different projects. Reply with JSON only: {\"verdict\":\"same|similar|different\",\"reason\":\"one short sentence\"}" },
        { role: "user", content: `Proposal A\n${brief(p)}\n\nProposal B\n${brief(q)}` }] }) });
    const data = await resp.json().catch(() => ({}));
    const txt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!txt) throw new Error(resp.status === 429 ? "busy" : `no reply (${resp.status})`);
    const m = txt.match(/\{[\s\S]*\}/); let o = null; try { o = m ? JSON.parse(m[0]) : null; } catch (e) { o = null; }
    if (!o || !AIV[o.verdict]) throw new Error("an unclear reply");
    return { v: o.verdict, r: String(o.reason || "").slice(0, 240) };
  }

  if (window.NMKAccount) boot(); else window.addEventListener("load", boot);
})();
