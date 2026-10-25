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
  const host = document.getElementById("project");
  if (!host || typeof COURSE === "undefined") return;
  const $ = (s, r = host) => r.querySelector(s), $$ = (s, r = host) => [...r.querySelectorAll(s)];
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

  /* ---------- the key dates (week numbers include the mid-term break) ---------- */
  (function dates() {
    const box = document.getElementById("pjDates");
    if (!box) return;
    const wkOf = (iso) => Math.floor((Date.parse(`${iso}T00:00:00+08:00`) - Date.parse(`${COURSE.semesterStart}T00:00:00+08:00`)) / 604800000) + 1;
    const q = new URLSearchParams(location.search).get("today"), now = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), w = wkOf(now);
    box.innerHTML = [[7, 7, "Week 7", "Released: the brief, group registration and title proposals"], [8, 8, "Week 8", "Groups formed; proposal due Sunday, 11:59 PM"],
      [10, 14, "Weeks 10 to 14", "Weekly progress logbook"], [15, 15, "Week 15", "Demonstration, oral verification and peer evaluation"]]
      .map(([a, b, t, d]) => `<div class="pj-date${w >= a && w <= b ? " now" : ""}"><b>${t}</b><span>${d}</span></div>`).join("");
  })();

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
    if (!meta.released) { gate(`<p><strong>Group registration opens in week 7.</strong> Your lecturer will open it here. Read the brief below in the meantime.</p>`); return; }
    try { const d = await db.collection("meta").doc("classmates").get(); mates = d.exists ? (d.data().list || []) : []; } catch (e) { mates = []; }
    student();
  }
  function gate(html) {
    host.innerHTML = `<div class="pj-gate">${html}</div>`;
    const b = $("[data-signin]"); if (b) b.addEventListener("click", () => A.signIn());
  }
  const nameOf = (m) => { const x = mates.find((y) => String(y.m) === String(m)); return x ? x.n : `Matric ${m}`; };
  const secOf = (m) => { const x = mates.find((y) => String(y.m) === String(m)); return x && x.s ? SEC[x.s] : ""; };
  const hist = (g, act, note) => (g.history || []).concat([{ at: Date.now(), by: isLec ? "Lecturer" : me.n, act, note: note || "", title: g.proposal ? g.proposal.title : "" }]).slice(-60);

  /* =====================================================================
     STUDENTS
     ===================================================================== */
  function student() {
    host.innerHTML = `<div class="pj-tabs" role="tablist"><button type="button" role="tab" data-tab="mine" aria-selected="true">My Group</button><button type="button" role="tab" data-tab="titles" aria-selected="false">Approved Titles</button></div>
      <div id="pjView"><p class="small-note">Loading…</p></div>`;
    let tab = (history.state && history.state.ptab) || "mine", mineG = null, invites = [], claims = {}, titles = [], editing = false, draft = null, shown = "";
    $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; if (window.NMKBack) NMKBack.view({ ptab: tab }); paint(); }));
    if (window.NMKBack) NMKBack.onView((s) => { tab = s.ptab || "mine"; paint(); });
    function fail(e) { $("#pjView").innerHTML = `<p class="small-note">Could not load your group (${esc(e.code || e)}). Reload the page to try again.</p>`; }
    function paint() {
      $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
      const v = $("#pjView");
      if (tab === "titles") { v.innerHTML = titleList(titles, false); return; }
      // keep a half-typed proposal: only redraw the form when the group itself changed
      const sig = JSON.stringify([mineG && [mineG.id, mineG.status, mineG.memberM, mineG.inviteM, mineG.declinedM, mineG.leader, mineG.review, mineG.version, mineG.no, editing ? 0 : mineG.proposal], invites.map((g) => [g.id, g.memberM, g.inviteM]), editing]);
      if (editing && sig === shown && $("#pjForm")) { checks(); return; }
      shown = sig;
      v.innerHTML = mineG ? groupView(mineG) : noGroup();
      wire();
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
      const head = `<div class="pj-card"><div class="pj-gh"><h2 class="h3">${g.no ? esc(gname(g)) : "Your Group"}</h2><span class="pj-st ${g.status}">${STATUS[g.status]}</span></div>${g.no ? "" : `<p class="small-note">Your group gets its number when the title is approved.</p>`}
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
      const p = draft || (g.proposal ? JSON.parse(JSON.stringify(g.proposal)) : { title: "", industry: "", synopsis: "", sensors: [{ name: "", analog: false, cal: false }, { name: "", analog: false, cal: false }], conds: [{ name: "", resp: "" }, { name: "", resp: "" }, { name: "", resp: "" }], outs: ["", ""], platform: "", platformOther: "", calRef: "", parts: {} });
      draft = p; editing = true;
      const opt = (l) => l.map((x) => `<option value="${esc(x)}">`).join("");
      return `<form class="pj-card pj-form" id="pjForm" novalidate><h2 class="h3">Title Proposal</h2><p class="small-note">Saved for your group as you type. Any member can edit it. Submit when every check below is ticked.</p>
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
        <div class="pj-row"><button class="btn" id="pjSubmit">${g.status === "approved" ? "Submit the title change" : g.status === "amend" ? "Submit again" : "Submit the proposal"}</button>${g.status === "approved" || g.status === "submitted" ? `<button type="button" class="btn ghost" data-cancel>Cancel</button>` : ""}<span class="small-note" id="pjSaved" aria-live="polite"></span></div></form>`;
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
        ? `<p class="pj-clash ${level(near[1])}">${level(near[1]) === "red" ? "This looks like an approved title:" : "Similar to an approved title:"} <strong>${esc(gtag(near[0].no))} · ${esc(near[0].title)}</strong>. Choose a different application, industry or sensor so your project is your own. <a href="#" data-tabgo="titles">See the approved titles</a></p>` : "";
    }
    let saveT = 0;
    const saveDraft = () => {
      clearTimeout(saveT);
      $("#pjSaved").textContent = "Saving…";
      saveT = setTimeout(() => {
        if (!mineG || mineG.status === "approved" || mineG.status === "submitted") { $("#pjSaved").textContent = ""; return; }   // a change of an approved or submitted proposal is sent only with Submit
        db.collection("pgroups").doc(mineG.id).update({ proposal: draft, updatedAt: FV.serverTimestamp() }).then(() => { $("#pjSaved").textContent = "Saved"; }).catch((e) => { $("#pjSaved").textContent = `Not saved (${e.code || e})`; });
      }, 900);
    };
    function wire() {
      const v = $("#pjView"), g = mineG;
      const on = (sel, f) => $$(sel, v).forEach((b) => b.addEventListener("click", f));
      on("[data-tabgo]", (e) => { e.preventDefault(); tab = e.currentTarget.dataset.tabgo; if (window.NMKBack) NMKBack.view({ ptab: tab }); paint(); });
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
      on("[data-cancel]", () => { editing = false; draft = null; shown = ""; paint(); });
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
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (problems(draft, g).some(([y]) => !y)) return;
        clearTimeout(saveT);
        const near = titles.filter((t) => t.id !== g.id).map((t) => [t, similarity(draft, t)]).sort((a, b) => b[1] - a[1])[0];
        if (near && level(near[1]) === "red" && !confirm(`Your proposal looks like ${gtag(near[0].no)} · “${near[0].title}”, which is already approved. Your lecturer will see this. Submit anyway?`)) return;
        $("#pjSubmit").disabled = true;
        const p = Object.assign({}, draft, { sensors: draft.sensors.filter((s) => s.name.trim()), outs: draft.outs.map((o) => o.trim()).filter(Boolean) });
        ref.update({ proposal: p, status: "submitted", submittedAt: FV.serverTimestamp(), version: (g.version || 0) + 1, updatedAt: FV.serverTimestamp(), history: hist(Object.assign({}, g, { proposal: p }), g.status === "approved" ? "asked for a title change" : g.status === "amend" ? "submitted the amended proposal" : "submitted the proposal") })
          .then(() => { editing = false; draft = null; shown = ""; })
          .catch((err) => { $("#pjSubmit").disabled = false; alertIn(v, `Could not submit (${err.code || err}).`); });
      });
      checks();
    }
    // invite by search only: classmates not in a group and not already invited
    function invitePicker(el, g) {
      el.innerHTML = `<label class="pj-l" for="pjQ">Invite a classmate <span>Type at least 2 letters of a name, or the matric number</span></label><input id="pjQ" class="pj-in" type="search" autocomplete="off" spellcheck="false" placeholder="e.g. Ahmad or 2313"><ul class="pj-pick" role="listbox"></ul>`;
      const inp = $("input", el), ul = $("ul", el);
      inp.addEventListener("input", () => {
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
    unsubs.push(mine.onSnapshot((q) => { mineG = sems(q)[0] || null; if (!editing) draft = null; paint(); }, (e) => fail(e)));
    unsubs.push(inv.onSnapshot((q) => { invites = sems(q); paint(); }, () => {}));
    unsubs.push(db.collection("pmember").where("semester", "==", SEM).onSnapshot((q) => { claims = {}; q.docs.forEach((d) => { claims[d.data().m] = d.data().gid; }); paint(); }, () => {}));
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
    host.innerHTML = `<div class="pj-tabs" role="tablist"><button type="button" role="tab" data-tab="groups" aria-selected="true">Groups</button><button type="button" role="tab" data-tab="clash" aria-selected="false">Possible Clashes</button>
      <button type="button" role="tab" data-tab="nogroup" aria-selected="false">Not in a Group</button><button type="button" role="tab" data-tab="titles" aria-selected="false">Approved Titles</button></div>
      <div class="pj-review" id="pjRev" hidden></div><div id="pjView"><p class="small-note">Loading…</p></div>`;
    let tab = (history.state && history.state.ptab) || "groups", groups = [], roster = [], claims = {}, titles = [], filter = "all", openId = null, layer = null;
    $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; closeRev(); if (window.NMKBack) NMKBack.view({ ptab: tab }); paint(); }));
    if (window.NMKBack) NMKBack.onView((s) => { tab = s.ptab || "groups"; paint(); });
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
