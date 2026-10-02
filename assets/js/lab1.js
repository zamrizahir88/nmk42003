/* NMK42003 Lab 1: Introduction (Software & Hardware), virtual lab.
   Simulations of the ESP32 DevKit V1 (30-pin), TUNIOT blocks, the Arduino IDE upload, OTA upload,
   a Bluetooth terminal, an MIT App Inventor app and a Wi-Fi web server, then a pre-lab check.
   The page, calculator, quiz and exercise engine is in lab.js. */
(function () {
  "use strict";

  const { esc, num, eng, F, D, step, stepsHtml, reduceMotion, store, chips, wireChips, codeBlock, fold, player, poly } = Lab;
  const $ = (s, r = document) => r.querySelector(s);
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const IP = "192.168.1.45", MAC = "08:3A:F2:6C:1D:94", SSID = "Network_Name";

  /* =====================================================================
     Screenshots (the teaching team's own, shared with Chapter 2)
     ===================================================================== */
  const IMG = "assets/img/chapter-2/";
  const SHOT = "Screenshot: NMK42003 teaching team", TSHOT = "TUNIOT screenshot: NMK42003 teaching team";
  const PHOTOS = {
    "tuniot-menu.png": { w: 425, h: 175, alt: "TUNIOT FOR ESP32 button on the easycoding.tn website, under Code ESP32 with blocs", credit: TSHOT },
    "tuniot-workspace.png": { w: 960, h: 397, alt: "Empty TUNIOT FOR ESP32 workspace with a block palette on the left and the Setup and Main loop blocks", credit: TSHOT },
    "ide-board-port.png": { w: 677, h: 470, alt: "Arduino IDE Tools menu with Board set to ESP32 Dev Module and Port set to COM3 highlighted", credit: SHOT },
    "ide-ota-example.png": { w: 653, h: 547, alt: "Arduino IDE File, Examples menu opened at ArduinoOTA, OTAWebUpdater", credit: SHOT },
    "ota-upload-page.png": { w: 459, h: 219, alt: "Browser page from the ESP32 with Choose File, the binary file name, an Update button and progress 100%", credit: SHOT }
  };
  const photo = (file, caption, cls = "") => {
    const p = PHOTOS[file];
    return `<figure class="photo2 shot ${cls}"><img src="${IMG}${file}" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" loading="lazy"><figcaption>${caption ? caption + " " : ""}${p.credit}</figcaption></figure>`;
  };

  /* =====================================================================
     The student's name: used in the Bluetooth name and the Serial Monitor
     ===================================================================== */
  const NAME_KEY = "nmk-lab1-name";
  const clean = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 14);
  let NAME = clean(store.get(NAME_KEY, ""));
  const who = () => NAME || "YourName";
  const btName = () => `ESP32_${who()}`;
  const nameListeners = [];
  const onName = (f) => nameListeners.push(f);

  function mountName() {
    const box = $("#nameBox");
    if (!box) return;
    box.innerHTML = `<label for="yourName">Your name <span class="hint">letters and numbers, no spaces</span></label>
      <div class="name-row"><input id="yourName" type="text" maxlength="14" autocomplete="off" spellcheck="false" placeholder="e.g. Aina">
      <span class="name-out">Your ESP32's Bluetooth name: <strong id="btOut"></strong></span></div>`;
    const inp = $("#yourName", box), out = $("#btOut", box);
    inp.value = NAME;
    out.textContent = btName();
    inp.addEventListener("input", () => {
      NAME = clean(inp.value);
      store.set(NAME_KEY, NAME);
      out.textContent = btName();
      nameListeners.forEach((f) => f());
    });
  }

  /* =====================================================================
     Drawings: ESP32 DevKit V1 (30-pin), laptop, router, phone, packets
     The board is drawn sideways: USB on the left, antenna on the right.
     Its top row is the left pin header (EN at the antenna end), the bottom row the right header.
     ===================================================================== */
  const TOP = ["EN", "VP", "VN", "D34", "D35", "D32", "D33", "D25", "D26", "D27", "D14", "D12", "D13", "GND", "VIN"];
  const BOT = ["D23", "D22", "TX0", "RX0", "D21", "D19", "D18", "D5", "TX2", "RX2", "D4", "D2", "D15", "GND", "3V3"];
  const pinXY = (bx, by, k, row, name) => {
    const i = (row === "top" ? TOP : BOT).indexOf(name);
    return [bx + (318 - i * 18.5) * k, by + (row === "top" ? 9 : 111) * k];
  };
  const btnSvg = (x, y, lab, down, ly) =>
    `<rect class="dk-btnb" x="${x - 10}" y="${y - 10}" width="20" height="20" rx="3"/><circle class="dk-btnc${down ? " down" : ""}" cx="${x}" cy="${y}" r="6.5"/>${T(x, y + ly, lab, "middle", "dk-t")}`;

  // o: { k: scale, pwr, led, dim, en, boot: pressed, hi: ["t:EN", "b:GND"] }
  function board(bx, by, o = {}) {
    const k = o.k || 1, hi = o.hi || [];
    let s = `<g class="dk" transform="translate(${bx} ${by}) scale(${k})">`;
    s += `<rect class="dk-usb" x="-12" y="44" width="30" height="32" rx="3"/>`;
    s += `<rect class="dk-pcb" x="0" y="0" width="360" height="120" rx="8"/>`;
    s += `<rect class="dk-can" x="200" y="32" width="112" height="58" rx="4"/>${T(256, 60, "ESP-WROOM-32", "middle", "dk-can-t")}${T(256, 76, "Wi-Fi + Bluetooth", "middle", "dk-can-s")}`;
    s += `<path class="dk-ant" d="M322,32h24v12h-18v12h18v12h-18v12h18v12h-24"/>`;
    s += `<rect class="dk-chip" x="94" y="44" width="30" height="32" rx="2"/>`;
    s += btnSvg(30, 36, "BOOT", o.boot, -16) + btnSvg(30, 84, "EN", o.en, 26);
    s += `<circle class="dk-led red${o.pwr ? " on" : ""}" cx="146" cy="44" r="5"/>${T(155, 48, "PWR", "start", "dk-t")}`;
    s += `<circle class="dk-led blue${o.led ? " on" : ""}${o.dim ? " dim" : ""}" cx="146" cy="78" r="5"/>${T(155, 82, "GPIO2", "start", "dk-t")}`;
    [TOP, BOT].forEach((list, r) => list.forEach((p, i) => {
      const x = 318 - i * 18.5, on = hi.includes((r ? "b:" : "t:") + p);
      s += `<circle class="dk-pin${on ? " hi" : ""}" cx="${x}" cy="${r ? 111 : 9}" r="4"/>${T(x, r ? 101 : 25, p, "middle", `dk-pl${on ? " hi" : ""}`)}`;
    }));
    return s + "</g>";
  }
  const laptop = (x, y, scr = "") =>
    `<g class="lap"><rect class="lap-b" x="${x}" y="${y}" width="110" height="72" rx="5"/><rect class="lap-s" x="${x + 6}" y="${y + 6}" width="98" height="58" rx="2"/>${scr}<path class="lap-b" d="M${x - 10},${y + 76}h130l-8,10h-114z"/></g>`;
  const router = (x, y, on) =>
    `<g class="rtr${on ? " on" : ""}"><path class="rtr-a" d="M${x + 14},${y}v-20M${x + 66},${y}v-20"/><rect class="rtr-b" x="${x}" y="${y}" width="80" height="28" rx="6"/>` +
    [0, 1, 2, 3].map((i) => `<circle class="rtr-l" cx="${x + 18 + i * 10}" cy="${y + 14}" r="2.5"/>`).join("") + T(x + 40, y + 44, "Wi-Fi router", "middle", "small") + `</g>`;
  const phoneIco = (x, y, lab = "") =>
    `<g class="ph-i"><rect class="ph-b" x="${x}" y="${y}" width="42" height="76" rx="7"/><rect class="ph-s" x="${x + 4}" y="${y + 9}" width="34" height="56" rx="2"/>${lab ? T(x + 21, y + 92, lab, "middle", "small") : ""}</g>`;
  const btMark = (x, y) => `<path class="bt-mark" d="M${x - 5},${y - 5}l10,10l-5,5v-20l5,5l-10,10"/>`;

  // Send a labelled packet along an SVG path. Resolves when it arrives.
  function fly(svgEl, d, label, ms = 850, cls = "") {
    return new Promise((done) => {
      if (!svgEl || !svgEl.isConnected) return done();
      const NS = "http://www.w3.org/2000/svg";
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d); p.setAttribute("class", "fly-path");
      const g = document.createElementNS(NS, "g");
      const w = Math.max(34, label.length * 7.4 + 16);
      g.setAttribute("class", `pkt ${cls}`);
      g.innerHTML = `<rect x="${-w / 2}" y="-10" width="${w}" height="20" rx="10"/><text y="4" text-anchor="middle">${esc(label)}</text>`;
      svgEl.appendChild(p); svgEl.appendChild(g);
      const L = p.getTotalLength(), t0 = performance.now(), dur = reduceMotion ? 1 : ms;
      let over = false;
      const finish = () => { if (over) return; over = true; g.remove(); p.remove(); done(); };
      const tick = (now) => {
        if (over) return;
        const k = Math.min(1, (now - t0) / dur), pt = p.getPointAtLength(k * L);
        g.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
        if (k < 1) requestAnimationFrame(tick);
        else setTimeout(finish, reduceMotion ? 0 : 150);
      };
      requestAnimationFrame(tick);
      setTimeout(finish, dur + 500); // animation frames stop in a hidden tab: arrive anyway
    });
  }

  const serialBox = (title = "Serial Monitor · 115200 baud") => `<div class="serial"><div class="serial-h">${title}</div><pre class="serial-o" role="log"></pre></div>`;
  function serialOut(el) {
    const o = el.querySelector(".serial-o");
    return {
      clear() { o.textContent = ""; },
      add(t) { o.textContent += t + "\n"; o.scrollTop = o.scrollHeight; }
    };
  }

  // A phone frame; its screen is filled by each widget.
  const phoneFrame = (label) => `<div class="phone" role="group" aria-label="${esc(label)}"><div class="ph-top"><span>12:30</span><span class="ph-ico" aria-hidden="true">▲ ▮</span></div><div class="ph-screen"></div><div class="ph-home" aria-hidden="true"></div></div>`;

  /* =====================================================================
     Blocks, drawn in the TUNIOT / App Inventor style (original HTML, not screenshots)
     bk(colour, head)        a statement block
     bk(colour, head, kids)  a C-shaped block with blocks inside
     ===================================================================== */
  const bf = (t) => `<span class="bk-f">${t} ▾</span>`;          // dropdown field
  const bs = (t) => `<span class="bk-s">“ ${t} ”</span>`;         // text value
  const bn = (t) => `<span class="bk-n">${t}</span>`;             // number value
  const inl = (c, h) => `<span class="bk-inl ${c}">${h}</span>`; // plugged-in value block
  const bk = (c, head, kids) => kids === undefined
    ? `<div class="bk ${c}"><div class="bk-h">${head}</div></div>`
    : `<div class="bk ${c} cb"><div class="bk-h">${head}</div><div class="bk-in">${kids || `<span class="bk-empty">(empty)</span>`}</div><div class="bk-foot"></div></div>`;
  const ws = (inner, label) => `<div class="bk-ws" role="img" aria-label="${esc(label)}">${inner}</div>`;

  const HEAD = `////////////////////////////////
// Generated with a lot of love//
// with TUNIOT FOR ESP32     //
// Website: Easycoding.tn      //
////////////////////////////////
`;

  /* =====================================================================
     BEFORE YOU START
     ===================================================================== */
  const KIT = [
    ["ESP32 Wi-Fi module and micro-USB cable", "The ESP32 DevKit V1 (30 pins). The cable powers it and carries the program."],
    ["Breadboard", "Holds the capacitor, and later the LED and resistor."],
    ["0.47 µF capacitor", "Goes between EN and GND, for automatic programming mode."],
    ["Toggle switch", "An input on GPIO33, for Lesson 5 and the Lab Task."],
    ["LED", "The external LED on GPIO32 in Lesson 4."],
    ["Resistor", "In series with the LED, to limit its current."],
    ["Male-female jumper wires (at least 7)", "From the board's pins to the breadboard: 4 for the capacitor and LED, 3 more for the switch."],
    ["Mobile phone", "Runs the Bluetooth terminal, your App Inventor app and the web page."],
    ["10 kΩ resistor (only for a 2-pin switch)", "Pulls the switch input up to 3.3 V. Not needed with a 3-pin switch."]
  ];
  const SOFT = [
    ["Web browser", "For TUNIOT, App Inventor and the ESP32's own web pages.", ""],
    ["TUNIOT for ESP32", "Build programs from blocks and get the Arduino code.", "http://easycoding.tn/esp32/demos/code/"],
    ["Arduino IDE", "Uploads the code to the ESP32. Install the ESP32 board package first.", "https://www.arduino.cc/en/software"],
    ["MIT App Inventor", "Design your phone app in the browser. Sign in with a Google account.", "https://appinventor.mit.edu/"],
    ["S2 Terminal for Bluetooth", "On the phone: sends text to the ESP32 by Bluetooth. Any Bluetooth serial terminal app works.", ""],
    ["MIT AI2 Companion", "On the phone: runs the app you design in App Inventor.", ""]
  ];
  function mountKit(el) {
    const KEY = "nmk-lab1-kit";
    let got = store.get(KEY, []);
    const item = (grp, i, [t, d, url]) => {
      const k = `${grp}${i}`;
      return `<li><label class="kit-item"><input type="checkbox" data-k="${k}"${got.includes(k) ? " checked" : ""}><span><strong>${esc(t)}</strong>${url ? ` <a href="${url}" target="_blank" rel="noopener">open ↗</a>` : ""}<small>${esc(d)}</small></span></label></li>`;
    };
    el.innerHTML = `<div class="kit-grid">
        <div class="kit-col"><h4 class="sub-h">Equipment and Components</h4><ul class="kit">${KIT.map((x, i) => item("e", i, x)).join("")}</ul></div>
        <div class="kit-col"><h4 class="sub-h">Software</h4><ul class="kit">${SOFT.map((x, i) => item("s", i, x)).join("")}</ul></div>
      </div>
      <p class="kit-count" aria-live="polite"></p>`;
    const count = $(".kit-count", el), total = KIT.length + SOFT.length;
    const paint = () => {
      count.innerHTML = got.length === total ? `<strong>✓ All ${total} ready.</strong> You're set for the lab.` : `${got.length} of ${total} ticked. Tick each one as you get it ready (saved on this device).`;
    };
    el.addEventListener("change", (e) => {
      const c = e.target.closest("input[data-k]");
      if (!c) return;
      got = got.filter((x) => x !== c.dataset.k);
      if (c.checked) got.push(c.dataset.k);
      store.set(KEY, got);
      paint();
    });
    paint();
  }

  // Figure 1: the basic circuit, animated: plug in, power LED, the EN capacitor, choose the port.
  function mountBasic(el) {
    el.innerHTML = `<figure class="scene-box"><div class="scene-scroll"><div class="basic-scene"></div></div>
      <figcaption>The basic ESP32 circuit: the board on USB, with a 0.47 µF capacitor from EN to GND on the breadboard.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
      <div class="pv-pl"></div><p class="pv-read"></p>`;
    const sc = $(".basic-scene", el), read = $(".pv-read", el);
    const bx = 175, by = 124;
    const [enX, enY] = pinXY(bx, by, 1, "top", "EN"), [gX, gY] = pinXY(bx, by, 1, "top", "GND");
    const draw = (t) => {
      const px = t < 1.2 ? 108 + (t / 1.2) * 33 : 141, pwr = t >= 1.4, capHi = t >= 3.4 && t < 6.2, port = t >= 6.2;
      let s = `<rect class="bb" x="${bx}" y="8" width="360" height="72" rx="6"/>`;
      for (let x = bx + 12; x < bx + 352; x += 12) s += `<circle class="bb-h" cx="${x}" cy="28" r="1.6"/><circle class="bb-h" cx="${x}" cy="66" r="1.6"/>`;
      s += `<line class="rail-n" x1="${bx + 8}" x2="${bx + 352}" y1="18" y2="18"/>${T(bx + 12, 48, "GND rail", "start", "bb-t")}`;
      s += board(bx, by, { pwr, hi: capHi ? ["t:EN", "t:GND"] : [] });
      s += `<path class="wire g${capHi ? " glow" : ""}" d="M${gX},${gY}V18"/>`;
      s += `<path class="wire r${capHi ? " glow" : ""}" d="M${enX},${enY}V60H${enX - 50}"/>`;
      s += `<g class="${capHi ? "glow" : ""}"><path class="w cap-w" d="M${enX - 50},60V44M${enX - 62},44h24M${enX - 62},36h24M${enX - 50},36V18"/></g>`;
      s += T(enX - 68, 45, "C1 0.47 µF", "end", `cap-l${capHi ? " on" : ""}`);
      s += T(enX + 6, 100, "EN", "start", "wl") + T(gX + 6, 100, "GND", "start", "wl");
      s += laptop(10, 116, T(65, 150, port ? "Port: COM3" : pwr ? "USB connected" : "", "middle", "lap-t"));
      s += `<path class="cable" d="M112,196C128,196 ${px - 20},${by + 60} ${px},${by + 60}"/><rect class="plug" x="${px}" y="${by + 50}" width="24" height="20" rx="3"/>`;
      sc.innerHTML = `<svg class="scene basic" viewBox="0 0 545 256" role="img" aria-label="ESP32 board connected by USB to a laptop, with a 0.47 microfarad capacitor between EN and GND${pwr ? "; the red power LED is on" : ""}">${s}</svg>`;
      read.innerHTML = t < 1.4 ? `<strong>1. Plug in.</strong> Connect the micro-USB cable from the PC to the ESP32.`
        : t < 3.4 ? `<strong>2. Power.</strong> The red power LED lights. The board takes 5 V from USB and its regulator makes the 3.3 V the ESP32 runs on.`
        : t < 6.2 ? `<strong>3. The capacitor.</strong> The 0.47 µF capacitor goes between <strong>EN</strong> and <strong>GND</strong>. It lets the Arduino IDE switch the board into programming mode by itself, so you don't need to press any buttons (automatic mode).`
        : `<strong>4. Choose the port.</strong> The board appears on the PC as a COM port. In the Arduino IDE choose the ESP32 board (ESP32 Dev Module or DOIT ESP32 DEVKIT V1) and that port under <em>Tools</em>.`;
    };
    player($(".pv-pl", el), el, { dur: 9, hold: 1.5, draw, still: 5, label: "Setting up the circuit" });
  }

  // Why the capacitor helps: simplified timing of BOOT (GPIO0) and EN during an upload.
  function mountAuto(el) {
    let withCap = true;
    el.innerHTML = chips("Capacitor", [["1", "With the 0.47 µF capacitor"], ["0", "Without it"]], "1") +
      `<figure class="scene-box auto-box"><div class="scene-scroll"><div class="auto-plot"></div></div><figcaption>Simplified timing: the exact times depend on the board and its USB chip.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure><p class="pv-read auto-read"></p>`;
    const host = $(".auto-plot", el), read = $(".auto-read", el);
    const draw = () => {
      const W = 520, H = 210, l = 96, r = 34, X = (ms) => l + (ms / 200) * (W - l - r);
      const bootY = (ms) => (ms >= 103 && ms < 153 ? 78 : 42), enHi = 116, enLo = 156, thr = (enHi + enLo) / 2;
      const tau = 20, enY = (ms) => (ms < 100 ? enLo : withCap ? enLo - (enLo - enHi) * (1 - Math.exp(-(ms - 100) / tau)) : enHi);
      const tStart = withCap ? 100 + tau * Math.log(2) : 100.4, ok = bootY(tStart) === 78;
      let s = "";
      [0, 50, 100, 150, 200].forEach((ms) => { s += `<line class="gl" x1="${X(ms)}" x2="${X(ms)}" y1="26" y2="166"/>${T(X(ms), 184, ms + (ms === 200 ? " ms" : ""), "middle", "axis")}`; });
      s += T(l - 10, 50, "BOOT", "end", "axl") + T(l - 10, 64, "(GPIO0)", "end", "axis") + T(l - 10, 140, "EN", "end", "axl");
      s += T(X(0) + 2, 36, "HIGH", "start", "axis") + T(X(0) + 2, 92, "LOW", "start", "axis");
      const bp = [], ep = [];
      for (let i = 0; i <= 400; i++) { const ms = i / 2; bp.push([X(ms), bootY(ms)]); ep.push([X(ms), enY(ms)]); }
      s += `<rect class="band" x="${X(103)}" y="26" width="${X(153) - X(103)}" height="140" opacity=".6"/>` + T(X(128), 20, "BOOT held LOW", "middle", "axis");
      s += poly(bp, "trace-d") + poly(ep, "trace-a");
      s += `<line class="ref" x1="${X(0)}" x2="${X(200)}" y1="${thr}" y2="${thr}"/>${T(X(200) - 2, thr - 5, "chip starts", "end", "reflab")}`;
      s += `<line class="mk" x1="${X(tStart)}" x2="${X(tStart)}" y1="26" y2="166"/><circle class="pt" cx="${X(tStart)}" cy="${bootY(tStart)}" r="5"/>`;
      s += T(X(tStart) + 8, 106, ok ? "BOOT is LOW ✓" : "BOOT still HIGH ✗", "start", "ptlab");
      host.innerHTML = `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Timing of the BOOT and EN lines ${withCap ? "with" : "without"} the capacitor. The chip starts at about ${Math.round(tStart)} milliseconds, when BOOT is ${ok ? "low, so it enters download mode" : "still high, so it runs the old program"}.">${s}</svg>`;
      read.innerHTML = withCap
        ? `To upload, the USB chip holds EN low (reset), then lets it go and pulls BOOT low. The capacitor makes EN rise <strong>slowly</strong>, so the chip starts a moment later, while BOOT is already LOW. A chip that starts with BOOT LOW enters <strong>download mode</strong> and the upload works.`
        : `Without the capacitor, EN can rise <strong>almost instantly</strong>. On some boards the chip then starts a moment before BOOT goes LOW, so it runs the old program instead of waiting for the new one, and the IDE shows <em>Failed to connect</em>. The fix without a capacitor: hold the BOOT button while the IDE shows <em>Connecting…</em> (manual mode).`;
    };
    wireChips($(".chips-row", el), (v) => { withCap = v === "1"; draw(); });
    draw();
  }

  /* =====================================================================
     LESSON 1: blink studio (blocks → code → upload by cable → board)
     ===================================================================== */
  const SHEET_BLINK = [{ t: "led", v: "HIGH" }, { t: "delay", ms: 2000 }, { t: "led", v: "LOW" }, { t: "delay", ms: 2000 }];
  const sameProg = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function blinkCode(prog) {
    const led = prog.some((s) => s.t === "led");
    const body = prog.map((s) => (s.t === "led" ? `    digitalWrite(2,${s.v});` : `    delay(${s.ms});`)).join("\n");
    return `${HEAD}
void setup()
{
${led ? "pinMode(2, OUTPUT);\n" : ""}}

void loop()
{

${body}

}`;
  }
  // Summary of a program that loops forever.
  function blinkInfo(prog) {
    const leds = prog.filter((s) => s.t === "led");
    const total = prog.reduce((a, s) => a + (s.t === "delay" ? s.ms : 0), 0);
    if (!leds.length) return { kind: "none", total };
    if (!total) return new Set(leds.map((s) => s.v)).size > 1 ? { kind: "fast", total } : { kind: "steady", on: leds[0].v === "HIGH", total };
    let st = leds[leds.length - 1].v === "HIGH", on = 0, off = 0;
    prog.forEach((s) => { if (s.t === "led") st = s.v === "HIGH"; else if (st) on += s.ms; else off += s.ms; });
    if (!on || !off) return { kind: "steady", on: on > 0, total };
    return { kind: "blink", on, off, total };
  }
  // LED state at time t (s)
  function ledAt(prog, t) {
    const info = blinkInfo(prog);
    if (info.kind === "none") return { on: false };
    if (info.kind === "fast") return { on: true, dim: true };
    if (info.kind === "steady") return { on: info.on };
    const leds = prog.filter((s) => s.t === "led");
    let st = leds[leds.length - 1].v === "HIGH", acc = 0;
    const tt = (t * 1000) % info.total;
    for (const s of prog) {
      if (s.t === "led") st = s.v === "HIGH";
      else { if (tt < acc + s.ms) return { on: st }; acc += s.ms; }
    }
    return { on: st };
  }
  const secs = (ms) => `${num(ms / 1000, 3)} s`;
  function describe(prog) {
    const i = blinkInfo(prog);
    if (i.kind === "none") return "The program has no LED blocks, so the blue LED stays off.";
    if (i.kind === "fast") return "There are no delays, so the loop repeats thousands of times a second. The LED switches too fast to see a blink: it just looks dim.";
    if (i.kind === "steady") return `The LED stays ${i.on ? "on" : "off"} all the time: it never ${i.on ? "turns off" : "turns on"} for long enough to see.`;
    return `The LED is on for ${secs(i.on)} and off for ${secs(i.off)}: one blink every <strong>${secs(i.total)}</strong> (${num(1000 / i.total, 3)} Hz).`;
  }

  function mountBlink(el) {
    const KEY = "nmk-lab1-blink";
    let prog = store.get(KEY, []), running = [], cap = true, busy = false, bootHeld = false;
    prog = (Array.isArray(prog) ? prog : []).filter((s) => s && ((s.t === "led" && (s.v === "HIGH" || s.v === "LOW")) || (s.t === "delay" && isFinite(s.ms)))).slice(0, 12);
    const up = { en: false, boot: false, flow: false, scr: "", off: false };
    el.innerHTML = `
      <div class="studio">
        <div class="st-col">
          <div class="st-head"><span class="st-title">TUNIOT workspace</span><span class="st-btns"><button type="button" class="btn ghost sm" data-sheet>Use the lab sheet blocks</button><button type="button" class="btn ghost sm" data-clear>Clear</button></span></div>
          <div class="bk-ws edit"></div>
          <div class="palette" role="group" aria-label="Add a block to the main loop"><span class="pal-l">Add to the main loop:</span>
            <button type="button" class="pal-b" data-add="led"><span class="bk led mini">Integrated LED Stat</span></button>
            <button type="button" class="pal-b" data-add="delay"><span class="bk delay mini">Delay Ms</span></button></div>
          <p class="small-note">Tap a block to add it. Change HIGH or LOW and the delay inside each block, and use the arrows to put them in order.</p>
        </div>
        <div class="st-col">
          <figure class="scene-box"><div class="blink-scene"></div></figure>
          <div class="strip-box"><div class="blink-strip"></div></div>
          <div class="pv-pl"></div>
          <p class="pv-read blink-read"></p>
        </div>
      </div>
      <div class="upl">
        ${chips("EN capacitor", [["1", "0.47 µF capacitor fitted"], ["0", "No capacitor"]], "1")}
        <div class="upl-row"><button type="button" class="btn" data-upload>Upload by cable</button>
          <button type="button" class="btn ghost boot-btn" data-boot hidden aria-pressed="false">Press and hold BOOT</button>
          <span class="upl-state" aria-live="polite"></span></div>
        <div class="ide"><div class="ide-h">Arduino IDE · Output</div><pre class="ide-o" role="log">Press Upload to compile the code and send it to the ESP32.</pre></div>
      </div>
      ${fold("Arduino Code Made from Your Blocks", `<div class="code-slot"></div>`, true)}`;

    const wsEl = $(".bk-ws", el), sceneEl = $(".blink-scene", el), stripEl = $(".blink-strip", el), read = $(".blink-read", el);
    const ide = $(".ide-o", el), stateEl = $(".upl-state", el), upBtn = $("[data-upload]", el), bootBtn = $("[data-boot]", el);

    const row = (s, i) => `<div class="bk-row" data-i="${i}">${s.t === "led"
      ? `<div class="bk led"><div class="bk-h">Integrated LED Stat <select data-f="v" aria-label="Block ${i + 1}: LED state"><option${s.v === "HIGH" ? " selected" : ""}>HIGH</option><option${s.v === "LOW" ? " selected" : ""}>LOW</option></select></div></div>`
      : `<div class="bk delay"><div class="bk-h">Delay Ms <input type="number" data-f="ms" min="0" max="60000" step="100" inputmode="numeric" value="${s.ms}" aria-label="Block ${i + 1}: delay in milliseconds"></div></div>`}
      <span class="bk-tools"><button type="button" data-mv="-1" aria-label="Move block ${i + 1} up"${i ? "" : " disabled"}>▲</button><button type="button" data-mv="1" aria-label="Move block ${i + 1} down"${i < prog.length - 1 ? "" : " disabled"}>▼</button><button type="button" data-del aria-label="Remove block ${i + 1}">✕</button></span></div>`;
    const renderWs = () => {
      wsEl.innerHTML = bk("root", "Setup", "") + bk("root", "Main loop", prog.length ? prog.map(row).join("") : `<span class="bk-empty">Add blocks here</span>`);
    };
    const renderCode = () => { $(".code-slot", el).innerHTML = codeBlock(blinkCode(prog), "blink.ino (from TUNIOT)"); };
    const paintRead = () => {
      const changed = !sameProg(prog, running);
      read.innerHTML = (running.length ? `<strong>On the board.</strong> ${describe(running)}` : `<strong>On the board.</strong> An empty program, so the blue LED stays off. Build the blocks, then upload.`) +
        (changed ? ` <span class="warn-t">Your blocks have changed since the last upload: upload again to see them on the board.</span>` : "") +
        (sameProg(running, SHEET_BLINK) ? ` <span class="ok-t">✓ This is the lab sheet's blink: 2 s on, 2 s off.</span>` : "");
    };
    const changed = () => { store.set(KEY, prog); renderCode(); paintRead(); };

    const drawScene = (t) => {
      const st = up.off ? { on: false } : ledAt(running, t);
      sceneEl.innerHTML = `<svg class="scene" viewBox="0 0 475 158" role="img" aria-label="Laptop connected by USB to the ESP32. The blue LED on GPIO2 is ${st.dim ? "dimly lit" : st.on ? "on" : "off"}.">` +
        laptop(4, 44, T(59, 80, esc(up.scr || "Arduino IDE"), "middle", "lap-t")) +
        `<path class="cable${up.flow ? " flow" : ""}" d="M112,124C130,124 124,97 139,97"/>` +
        board(150, 44, { k: 0.88, pwr: true, led: st.on, dim: st.dim, en: up.en, boot: up.boot || bootHeld }) + `</svg>`;
    };
    const drawStrip = (t) => {
      const W = 470, H = 96, l = 40, r = 12, top = 14, bot = 62, X = (s) => l + (s / 12) * (W - l - r);
      let s = "";
      for (let k = 0; k <= 12; k += 2) s += `<line class="gl" x1="${X(k)}" x2="${X(k)}" y1="${top - 6}" y2="${bot + 4}"/>${T(X(k), bot + 20, k + (k === 12 ? " s" : ""), "middle", "axis")}`;
      s += T(l - 6, top + 4, "ON", "end", "axis") + T(l - 6, bot + 4, "OFF", "end", "axis");
      const pts = [];
      let prev = null;
      for (let i = 0; i <= 600; i++) {
        const tt = (i / 600) * 12, st = up.off ? { on: false } : ledAt(running, tt), y = st.dim ? (top + bot) / 2 : st.on ? top : bot;
        if (prev !== null && prev !== y) pts.push([X(tt), prev]);
        pts.push([X(tt), y]); prev = y;
      }
      s += poly(pts, "trace-a") + `<line class="cursor" x1="${X(t)}" x2="${X(t)}" y1="${top - 8}" y2="${bot + 6}"/>`;
      stripEl.innerHTML = `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Timing of the blue LED over 12 seconds">${s}</svg>`;
    };
    const pl = player($(".pv-pl", el), el, { dur: 12, hold: 0, draw: (t) => { drawScene(t); drawStrip(t); }, still: 1, label: "Time", clock: (t) => `${Math.max(0, t).toFixed(1)} s` });

    // Workspace editing
    wsEl.addEventListener("input", (e) => {
      const r = e.target.closest(".bk-row");
      if (!r) return;
      const s = prog[+r.dataset.i];
      if (e.target.dataset.f === "v") s.v = e.target.value;
      if (e.target.dataset.f === "ms") { const v = Math.round(+e.target.value); s.ms = isFinite(v) ? clamp(v, 0, 60000) : 0; }
      changed();
    });
    wsEl.addEventListener("click", (e) => {
      const b = e.target.closest("button"), r = e.target.closest(".bk-row");
      if (!b || !r) return;
      const i = +r.dataset.i;
      let focus = null;
      if (b.dataset.mv) { const j = i + +b.dataset.mv; [prog[i], prog[j]] = [prog[j], prog[i]]; focus = `[data-i="${j}"] [data-mv="${b.dataset.mv}"]`; }
      if (b.hasAttribute("data-del")) { prog.splice(i, 1); focus = prog.length ? `[data-i="${Math.min(i, prog.length - 1)}"] [data-del]` : null; }
      renderWs(); changed();
      const f = focus && $(focus, wsEl);
      if (f && !f.disabled) f.focus(); else if (focus) { const alt = $(`[data-i] [data-del]`, wsEl); if (alt) alt.focus(); }
    });
    el.querySelector(".palette").addEventListener("click", (e) => {
      const b = e.target.closest("[data-add]");
      if (!b || prog.length >= 12) return;
      prog.push(b.dataset.add === "led" ? { t: "led", v: prog.filter((s) => s.t === "led").length % 2 ? "LOW" : "HIGH" } : { t: "delay", ms: 1000 });
      renderWs(); changed();
    });
    $("[data-sheet]", el).addEventListener("click", () => { prog = SHEET_BLINK.map((s) => Object.assign({}, s)); renderWs(); changed(); });
    $("[data-clear]", el).addEventListener("click", () => { prog = []; renderWs(); changed(); });
    wireChips($(".upl .chips-row", el), (v) => { cap = v === "1"; });

    // BOOT button: press and hold (mouse, touch or keyboard); a screen-reader click toggles it.
    const setBoot = (v) => { bootHeld = v; bootBtn.setAttribute("aria-pressed", v); pl.redraw(); };
    bootBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); setBoot(true); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => bootBtn.addEventListener(ev, () => { if (bootHeld) setBoot(false); }));
    bootBtn.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) setBoot(true); } });
    bootBtn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") setBoot(false); });
    bootBtn.addEventListener("click", (e) => { if (e.detail === 0 && !e.pointerType) setBoot(!bootHeld); });

    const out = (t) => { ide.textContent += t + "\n"; ide.scrollTop = ide.scrollHeight; };
    async function upload() {
      if (busy) return;
      busy = true; upBtn.disabled = true; ide.textContent = ""; stateEl.textContent = "Uploading…";
      const size = 263520 + prog.length * 48;
      up.scr = "Compiling…"; pl.redraw();
      out("Compiling sketch…"); await sleep(700);
      out(`Sketch uses ${size.toLocaleString("en")} bytes (20%) of program storage space. Maximum is 1,310,720 bytes.`);
      out("Global variables use 21,048 bytes (6%) of dynamic memory."); await sleep(300);
      out("esptool.py v4.6"); out("Serial port COM3");
      up.scr = "Connecting…"; up.off = true;
      ide.textContent += "Connecting";
      let ok = cap;
      if (cap) {
        up.en = up.boot = true; pl.redraw();
        for (let i = 0; i < 4; i++) { await sleep(180); ide.textContent += "."; }
        up.en = up.boot = false; pl.redraw();
      } else {
        bootBtn.hidden = false;
        stateEl.textContent = "Connecting… hold BOOT now!";
        for (let i = 0; i < 24 && !ok; i++) { await sleep(170); ide.textContent += i % 6 < 3 ? "." : "_"; ide.scrollTop = ide.scrollHeight; if (bootHeld) ok = true; }
        bootBtn.hidden = true; setBoot(false);
      }
      ide.textContent += "\n";
      if (!ok) {
        out("A fatal error occurred: Failed to connect to ESP32: Wrong boot mode detected (0x13)! The chip needs to be in download mode.");
        up.scr = "Upload failed"; up.off = false; pl.redraw();
        stateEl.innerHTML = `<span class="warn-t">Upload failed.</span> Fit the capacitor, or hold BOOT while the IDE shows <em>Connecting…</em>.`;
        busy = false; upBtn.disabled = false; return;
      }
      out("Chip is ESP32-D0WD-V3 (revision v3.0)");
      out("Features: WiFi, BT, Dual Core, 240MHz");
      out(`MAC: ${MAC.toLowerCase()}`);
      out("Uploading stub…"); out("Running stub…"); out("Stub running…"); await sleep(250);
      out("Changing baud rate to 921600"); out("Changed.");
      up.flow = true;
      for (let p = 10; p <= 100; p += 10) { up.scr = `Uploading ${p}%`; pl.redraw(); out(`Writing at 0x${(0x10000 + p * 2600).toString(16).padStart(8, "0")}… (${p} %)`); await sleep(220); }
      out(`Wrote ${size.toLocaleString("en")} bytes. Hash of data verified.`); out(""); out("Leaving…"); out("Hard resetting via RTS pin…");
      up.flow = false; up.scr = "Done uploading"; up.en = true; pl.redraw(); await sleep(300);
      up.en = false; up.off = false; running = prog.map((s) => Object.assign({}, s));
      pl.restart(); paintRead();
      stateEl.innerHTML = `<span class="ok-t">✓ Done uploading.</span> The ESP32 restarted and runs your program.`;
      busy = false; upBtn.disabled = false;
    }
    upBtn.addEventListener("click", upload);

    renderWs(); renderCode(); paintRead(); pl.redraw();
  }

  // Lesson 1 (f)(ii): upload over the air, step by step.
  function mountOta(el) {
    let cur = 0, ssid = "LabWiFi", done = { exp: false, cable: false, serial: false, login: false, bin: false, upd: false }, blinkT = 0, ledOn = false, run = 0;
    const STEPS = ["Export the binary", "Open the OTA example", "Enter your Wi-Fi", "Upload it by cable", "Find the IP address", "Log in", "Upload the binary"];
    el.innerHTML = `<figure class="scene-box"><div class="scene-scroll"><div class="ota-scene"></div></div><figcaption>The laptop, the Wi-Fi router and the ESP32. Active links are highlighted in each step.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
      <ol class="stp-tabs">${STEPS.map((s, i) => `<li><button type="button" data-go="${i}"><span class="stp-n">${i + 1}</span><span class="stp-t">${s}</span></button></li>`).join("")}</ol>
      <div class="stp-panel" tabindex="-1"></div>
      <div class="stp-nav"><button type="button" class="btn ghost" data-d="-1">‹ Back</button><button type="button" class="btn" data-d="1">Next ›</button></div>`;
    const sceneEl = $(".ota-scene", el), panel = $(".stp-panel", el);
    const links = () => ({ cable: cur === 3, wifiLap: cur >= 5, wifiEsp: cur >= 4 && done.cable });
    const drawScene = () => {
      const L = links(), bx = 330, by = 108, k = 0.5;
      let s = laptop(14, 70, T(69, 104, cur === 0 || cur === 1 || cur === 2 ? "Arduino IDE" : cur === 3 ? "Uploading…" : cur === 4 ? "Serial Monitor" : IP, "middle", "lap-t"));
      s += router(210, 34, L.wifiLap || L.wifiEsp);
      s += `<path class="cable${L.cable ? " flow" : " dim"}" d="M124,148C200,190 280,138 ${bx - 6},138"/>`;
      s += `<path id="otaA" class="rf-link${L.wifiLap ? " on" : ""}" d="M112,76Q160,30 208,48"/><path id="otaB" class="rf-link${L.wifiEsp ? " on" : ""}" d="M292,48Q370,40 ${bx + 128},${by - 2}"/>`;
      s += board(bx, by, { k, pwr: true, led: ledOn });
      s += T(bx + 90, by + 82, "ESP32", "middle", "small");
      sceneEl.innerHTML = `<svg class="scene ota" viewBox="0 0 520 200" role="img" aria-label="Laptop, Wi-Fi router and ESP32. ${L.cable ? "The USB cable is in use." : ""}${L.wifiLap || L.wifiEsp ? " Wi-Fi links are active." : ""}">${s}</svg>`;
    };
    const panels = [
      () => `<h4>1. Export the Blink Program as a Binary File</h4>
        <p>Open your blink sketch from Lesson 1 in the Arduino IDE and choose <em>Sketch → Export Compiled Binary</em>. The IDE compiles the sketch and saves the compiled program as a <code>.bin</code> file in the same folder as the project.</p>
        <div class="menu-mock" role="group" aria-label="Arduino IDE Sketch menu"><div class="mm-bar"><span>File</span><span>Edit</span><span class="on">Sketch</span><span>Tools</span><span>Help</span></div>
          <div class="mm-list"><span class="mm-i">Verify/Compile <kbd>Ctrl+R</kbd></span><span class="mm-i">Upload <kbd>Ctrl+U</kbd></span><span class="mm-i">Upload Using Programmer <kbd>Ctrl+Shift+U</kbd></span>
          <button type="button" class="mm-i hl" data-exp>Export Compiled Binary <kbd>Ctrl+Alt+S</kbd></button><span class="mm-i">Show Sketch Folder <kbd>Ctrl+K</kbd></span></div></div>
        <div class="folder" aria-live="polite"><div class="fd-h">blink (sketch folder)</div><div class="fd-i">blink.ino</div>${done.exp ? `<div class="fd-i new">blink.ino.bin <small>new, 264 KB</small></div>` : ""}</div>
        ${done.exp ? "" : `<p class="small-note">Click <em>Export Compiled Binary</em> in the menu above.</p>`}`,
      () => `<h4>2. Open the OTA Web Updater Example</h4>
        <p>Choose <em>File → Examples → ArduinoOTA → OTAWebUpdater</em>. This sketch joins your Wi-Fi network and runs a small web server with an upload page. It has to be on the ESP32 first, so the board can accept programs over Wi-Fi.</p>
        ${photo("ide-ota-example.png", "", "small")}`,
      () => `<h4>3. Put in Your Wi-Fi Name and Password</h4>
        <p>Near the top of the example, type the name (SSID) and password of the Wi-Fi network you'll use. The laptop must join the <strong>same network</strong>.</p>
        <div class="ssid-box"><label for="otaSsid">Wi-Fi name in this simulation</label><input id="otaSsid" type="text" maxlength="24" value="${esc(ssid)}" autocomplete="off" spellcheck="false"></div>
        <div class="ota-code"></div>
        <p class="small-note">Don't type a real password into this page. In the lab you type it only into the Arduino IDE.</p>`,
      () => `<h4>4. Upload the OTA Sketch by Cable (Once)</h4>
        <p>Upload the example with the USB cable, the same way as the blink program. From now on the board can be updated over Wi-Fi.</p>
        <button type="button" class="btn" data-cable${done.cable ? " disabled" : ""}>${done.cable ? "✓ Uploaded" : "Upload by cable"}</button>
        <div class="ide"><div class="ide-h">Arduino IDE · Output</div><pre class="ide-o" role="log">${done.cable ? "Wrote 912,384 bytes. Hash of data verified.\nHard resetting via RTS pin…" : ""}</pre></div>`,
      () => `<h4>5. Open the Serial Monitor to Get the IP Address</h4>
        <p>Open <em>Tools → Serial Monitor</em> and set it to <strong>115200 baud</strong>. The ESP32 prints the IP address the router gave it. If nothing appears, press <strong>EN</strong> on the board to restart it.</p>
        ${serialBox()}<button type="button" class="btn ghost" data-en>Press EN (restart)</button>`,
      () => `<h4>6. Go to the IP Address and Log In</h4>
        <p>In a browser on the laptop, type the IP address. Log in with user name and password <code>admin</code> (the example's defaults).</p>
        <div class="browser"><div class="br-bar"><span class="br-dots" aria-hidden="true"></span><span class="br-url">http://${IP}/</span></div>
          <form class="br-page login" data-login><p class="br-h">ESP32 Login Page</p>
            <label>Username <input type="text" value="admin" readonly></label><label>Password <input type="password" value="admin" readonly></label>
            <button type="submit" class="br-btn">Login</button></form></div>`,
      () => `<h4>7. Upload the Binary from Step 1</h4>
        <p>On the upload page choose the <code>.bin</code> file and click <em>Update</em>. At 100% the ESP32 restarts and runs the new program: the blue LED blinks. No cable needed.</p>
        <div class="browser"><div class="br-bar"><span class="br-dots" aria-hidden="true"></span><span class="br-url">http://${IP}/serverIndex</span></div>
          <div class="br-page"><div class="br-file"><button type="button" class="br-btn ghost" data-file>Choose File</button><span class="br-fn">${done.bin ? "blink.ino.bin" : "No file chosen"}</span></div>
          <button type="button" class="br-btn" data-upd${done.bin && !done.upd ? "" : " disabled"}>Update</button>
          <div class="br-prog"><span style="width:${done.upd ? 100 : 0}%"></span></div><p class="br-pct">progress: ${done.upd ? 100 : 0}%</p></div></div>
        ${done.upd ? `<p class="ok-t">✓ Updated over the air. The ESP32 restarted and runs your blink program.</p>` : ""}
        ${photo("ota-upload-page.png", "The real upload page looks like this.", "small")}`
    ];
    const otaCode = () => codeBlock(`const char* host = "esp32";
const char* ssid = "${ssid.replace(/"/g, "")}";
const char* password = "********";`, "OTAWebUpdater.ino (top of the sketch)");

    const startBlink = () => {
      clearInterval(blinkT);
      blinkT = setInterval(() => { if (!el.isConnected) return clearInterval(blinkT); ledOn = !ledOn; drawScene(); }, 2000);
    };
    async function bootSerial() {
      const my = ++run, box = panel.querySelector(".serial");
      if (!box) return;
      const so = serialOut(box);
      so.clear(); ledOn = false; clearInterval(blinkT); drawScene();
      for (const line of ["", `Connected to ${ssid}`, `IP address: ${IP}`, "mDNS responder started"]) {
        await sleep(line ? 550 : 200);
        if (my !== run) return;
        so.add(line);
      }
      done.serial = true;
    }
    const show = (i, focus) => {
      cur = clamp(i, 0, STEPS.length - 1);
      run++;
      panel.innerHTML = panels[cur]();
      el.querySelectorAll("[data-go]").forEach((b, k) => { b.setAttribute("aria-current", k === cur ? "step" : "false"); b.classList.toggle("done", k < cur); });
      $('[data-d="-1"]', el).disabled = cur === 0;
      $('[data-d="1"]', el).disabled = cur === STEPS.length - 1;
      if (cur === 2) { $(".ota-code", panel).innerHTML = otaCode(); }
      if (cur === 4 && done.cable) bootSerial();
      if (cur === 4 && !done.cable) serialOut(panel.querySelector(".serial")).add("(nothing yet: upload the OTA sketch first, in Step 4)");
      drawScene();
      if (focus) panel.focus({ preventScroll: true });
    };
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.go !== undefined) show(+b.dataset.go, true);
      else if (b.dataset.d) show(cur + +b.dataset.d, true);
      else if (b.hasAttribute("data-exp")) { done.exp = true; show(0); }
      else if (b.hasAttribute("data-en")) { if (done.cable) bootSerial(); }
      else if (b.hasAttribute("data-file")) { done.bin = true; done.upd = false; show(6); }
      else if (b.hasAttribute("data-cable")) {
        b.disabled = true;
        const o = $(".ide-o", panel), my = run;
        for (const line of ["Compiling sketch…", "Sketch uses 912,384 bytes (69%) of program storage space.", "Connecting....", "Writing at 0x00010000… (10 %)", "Writing at 0x00050000… (50 %)", "Writing at 0x000e0000… (100 %)", "Wrote 912,384 bytes. Hash of data verified.", "Hard resetting via RTS pin…"]) {
          await sleep(320);
          if (my !== run) return;
          o.textContent += line + "\n"; o.scrollTop = o.scrollHeight;
        }
        done.cable = true; b.textContent = "✓ Uploaded"; drawScene();
      } else if (b.hasAttribute("data-upd")) {
        b.disabled = true;
        const bar = $(".br-prog span", panel), pct = $(".br-pct", panel), svgEl = $("svg", sceneEl), my = run;
        for (let p = 0; p <= 100; p += 10) {
          bar.style.width = p + "%"; pct.textContent = `progress: ${p}%`;
          if (p % 30 === 0 && p < 100) { fly(svgEl, $("#otaA", sceneEl).getAttribute("d"), "bin", 500).then(() => fly($("svg", sceneEl), $("#otaB", sceneEl).getAttribute("d"), "bin", 500)); }
          await sleep(260);
          if (my !== run) return;
        }
        done.upd = true; show(6); startBlink();
      }
    });
    el.addEventListener("submit", (e) => { if (e.target.matches("[data-login]")) { e.preventDefault(); done.login = true; show(6, true); } });
    el.addEventListener("input", (e) => {
      if (e.target.id !== "otaSsid") return;
      ssid = e.target.value.replace(/[^\w .-]/g, "").slice(0, 24) || "LabWiFi";
      $(".ota-code", panel).innerHTML = otaCode();
    });
    show(0);
  }

  /* =====================================================================
     LESSON 2: Bluetooth blocks and terminal
     ===================================================================== */
  const btBlocks = () =>
    bk("root", "Setup",
      bk("var", `Declare ${bf("LED")} as String Value ${bs("")}`) +
      bk("bt", `Start Internal Bluetooth<br>Name ${bs(esc(btName()))}`)) +
    bk("root", "Main loop",
      bk("logic", `if ${inl("bt", "SerialBT Available?")}`,
        bk("var", `set STRING ${bf("LED")} to ${inl("bt", "SerialBT Read String")}`) +
        bk("logic", `if ${inl("var", `${bf("LED")} ${bf("=")} ${bs("ON")}`)}`, bk("led", `Integrated LED Stat ${bf("HIGH")}`)) +
        bk("logic", `if ${inl("var", `${bf("LED")} ${bf("=")} ${bs("OFF")}`)}`, bk("led", `Integrated LED Stat ${bf("LOW")}`))));
  const btCode = () => `${HEAD}#include "BluetoothSerial.h"

String LED;
BluetoothSerial SerialBT;

void setup()
{
LED = "";
SerialBT.begin("${btName()}");
pinMode(2, OUTPUT);
}

void loop()
{

    if (SerialBT.available()) {
      LED = SerialBT.readString();
      if (LED == "ON") {
        digitalWrite(2,HIGH);

      }
      if (LED == "OFF") {
        digitalWrite(2,LOW);

      }

    }

}`;
  function mountBtBlocks(el) {
    const draw = () => {
      el.innerHTML = `<div class="bc-grid"><div>${ws(btBlocks(), "TUNIOT blocks for Bluetooth LED control")}</div><div>${codeBlock(btCode(), "bluetooth_led.ino (from TUNIOT)")}</div></div>
        <ol class="what">
          <li><strong>Declare LED as String.</strong> A text variable to hold whatever the phone sends.</li>
          <li><strong>Start Internal Bluetooth, Name.</strong> Turns on the ESP32's Bluetooth with the name your phone will see: <code>${esc(btName())}</code>.</li>
          <li><strong>if SerialBT Available?</strong> Only reads when the phone has sent something.</li>
          <li><strong>set LED to SerialBT Read String.</strong> Reads the text into the LED variable.</li>
          <li><strong>if LED = "ON" / if LED = "OFF".</strong> Compares the text and switches the built-in LED (GPIO2) HIGH or LOW. The comparison must match exactly, capital letters included.</li>
        </ol>`;
    };
    onName(draw);
    draw();
  }
  const showStr = (s) => `"${esc(s).replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;

  function mountBtTerm(el) {
    let scr = "settings", paired = false, connected = false, ending = "", led = false, log = [], busy = false, pairing = "";
    el.innerHTML = `<div class="sim-grid">
        <div class="sim-phone">${phoneFrame("Phone")}</div>
        <div class="sim-side">
          <figure class="scene-box"><div class="bt-scene"></div></figure>
          <div class="esp-in"><h4>Inside the ESP32</h4><pre class="esp-vars" aria-live="polite">Waiting for the phone…</pre></div>
          <div><span class="pal-l">Terminal app setting, line ending:</span>${chips("Line ending", [["none", "None"], ["crlf", "CR+LF"]], "none")}</div>
          <p class="pv-read bt-read"></p>
        </div></div>`;
    const screen = $(".ph-screen", el), sceneEl = $(".bt-scene", el), vars = $(".esp-vars", el), read = $(".bt-read", el);
    const drawScene = () => {
      sceneEl.innerHTML = `<svg class="scene" viewBox="0 0 420 150" role="img" aria-label="Phone and ESP32. ${connected ? "Connected by Bluetooth." : "Not connected."} The blue LED is ${led ? "on" : "off"}.">` +
        phoneIco(8, 30, "phone") + btMark(29, 18) + `<path id="btPath" class="rf-link${connected ? " on" : ""}" d="M54,60C120,4 250,4 300,40"/>` +
        board(92, 40, { k: 0.8, pwr: true, led }) + `</svg>`;
    };
    const bar = (t, extra = "") => `<div class="app-bar">${t}${extra}</div>`;
    const render = () => {
      let h;
      if (scr === "settings") {
        const others = [["Galaxy Buds2", "earbuds"], ["LAPTOP-7Q2F", "laptop"]];
        h = bar("Bluetooth") + `<div class="app-body"><div class="set-row"><span>Bluetooth</span><span class="tog on" aria-label="on"></span></div>
          <p class="set-h">Paired devices</p>${paired ? `<div class="set-dev paired">${esc(btName())}<small>Paired</small></div>` : `<p class="set-none">None</p>`}
          <p class="set-h">Available devices</p>
          ${paired ? "" : `<button type="button" class="set-dev" data-pair="esp">${esc(btName())}<small>${pairing === "esp" ? "Pairing…" : "Tap to pair"}</small></button>`}
          ${others.map(([n, k]) => `<button type="button" class="set-dev" data-pair="${k}">${n}<small>${pairing === k ? "That's not your ESP32" : "Tap to pair"}</small></button>`).join("")}
          ${paired ? `<button type="button" class="app-btn" data-open>Open the terminal app</button>` : ""}</div>`;
      } else if (scr === "devices") {
        h = bar("Bluetooth Terminal", `<button type="button" class="bar-b" data-back aria-label="Back to Bluetooth settings">‹</button>`) + `<div class="app-body"><p class="set-h">Choose a paired device</p>
          <button type="button" class="set-dev" data-conn>${esc(btName())}<small>${busy ? "Connecting…" : "Tap to connect"}</small></button></div>`;
      } else {
        h = bar("Terminal", `<span class="bar-pill">${connected ? "Connected" : "Disconnected"}</span>`) +
          `<div class="term-log" role="log">${log.map((m) => `<div class="tl ${m.c}">${esc(m.t)}</div>`).join("") || `<div class="tl sys">Connected to ${esc(btName())}</div>`}</div>
          <div class="term-mac"><button type="button" class="mac-b" data-send="ON">ON</button><button type="button" class="mac-b" data-send="OFF">OFF</button><button type="button" class="mac-b ghost" data-disc>Disconnect</button></div>
          <form class="term-in" data-form><input type="text" aria-label="Message to send" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type ON or OFF" maxlength="20"><button type="submit" class="send-b" aria-label="Send">➤</button></form>`;
      }
      screen.innerHTML = h;
      const lg = $(".term-log", screen);
      if (lg) lg.scrollTop = lg.scrollHeight;
      read.innerHTML = scr === "settings" ? (paired ? `Paired. Now open the terminal app and connect to <strong>${esc(btName())}</strong>.` : `<strong>Step 1:</strong> pair the phone with your ESP32 in the phone's Bluetooth settings. Look for <strong>${esc(btName())}</strong>.`)
        : scr === "devices" ? `<strong>Step 2:</strong> in the terminal app, connect to the paired ESP32.`
        : `<strong>Step 3:</strong> send <strong>ON</strong> or <strong>OFF</strong>. Try small letters, or change the line ending, and watch what the ESP32 receives.`;
    };
    async function send(txt) {
      if (!txt || busy || !connected) return;
      busy = true;
      const payload = txt + ending;
      log.push({ c: "me", t: txt }); render();
      await fly($("svg", sceneEl), $("#btPath", sceneEl).getAttribute("d"), txt, 800);
      const on = payload === "ON", off = payload === "OFF";
      if (on) led = true;
      if (off) led = false;
      drawScene();
      vars.innerHTML = `SerialBT.available()   → true
LED = SerialBT.readString();
LED = ${showStr(payload)}   (${payload.length} characters)
LED == "ON"            → <b class="${on ? "t" : "f"}">${on}</b>
LED == "OFF"           → <b class="${off ? "t" : "f"}">${off}</b>
${on ? "digitalWrite(2, HIGH): LED on" : off ? "digitalWrite(2, LOW): LED off" : "Neither matches: the LED doesn't change."}`;
      const up = payload.trim().toUpperCase();
      read.innerHTML = on || off ? `✓ The text matched, so the ESP32 switched the LED ${on ? "on" : "off"}.`
        : ending && (up === "ON" || up === "OFF") ? `<strong>Common mistake:</strong> the app adds CR+LF (<code>\\r\\n</code>) to each message, so the ESP32 receives <code>${showStr(payload)}</code>, which is not equal to <code>"${up}"</code>. Set the app's line ending to <strong>None</strong>.`
        : up === "ON" || up === "OFF" ? `<strong>Common mistake:</strong> the comparison is case-sensitive. <code>${showStr(payload)}</code> is not <code>"${up}"</code>: send capital letters.`
        : `The ESP32 only reacts to exactly <code>"ON"</code> or <code>"OFF"</code>.`;
      busy = false;
    }
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || !screen.contains(b)) return;
      if (b.dataset.pair) {
        pairing = b.dataset.pair; render();
        if (pairing === "esp") { await sleep(900); paired = true; pairing = ""; render(); }
      } else if (b.hasAttribute("data-open")) { scr = "devices"; render(); $(".set-dev", screen).focus(); }
      else if (b.hasAttribute("data-back")) { scr = "settings"; render(); }
      else if (b.hasAttribute("data-conn")) {
        if (busy) return;
        busy = true; render(); await sleep(900); busy = false;
        connected = true; scr = "term"; log = []; drawScene(); render();
        vars.textContent = "Bluetooth client connected. Waiting for data…";
      } else if (b.dataset.send) send(b.dataset.send);
      else if (b.hasAttribute("data-disc")) { connected = false; scr = "devices"; drawScene(); render(); vars.textContent = "Bluetooth client disconnected."; }
    });
    el.addEventListener("submit", (e) => {
      if (!e.target.matches("[data-form]")) return;
      e.preventDefault();
      const inp = e.target.querySelector("input"), v = inp.value;
      inp.value = "";
      send(v);
      setTimeout(() => { const i = $(".term-in input", screen); if (i) i.focus(); }, 0);
    });
    wireChips($(".chips-row", el), (v) => { ending = v === "crlf" ? "\r\n" : ""; });
    onName(() => { render(); drawScene(); });
    drawScene(); render();
  }

  /* =====================================================================
     LESSON 3: MIT App Inventor
     ===================================================================== */
  const AI = [
    { id: "Screen1", kind: "Screen", lvl: 0, pal: "", desc: "The app's screen. Every component sits inside it.", props: [["Title", "Screen1"]] },
    { id: "Project_Title1", kind: "Label", lvl: 1, pal: "User Interface", desc: "The app's title.", props: [["Text", "Bluetooth LED Control"], ["FontSize", "20"]] },
    { id: "Project_Title2", kind: "Label", lvl: 1, pal: "User Interface", desc: "A subtitle.", props: [["Text", "using ESP32 Internal Bluetooth"]] },
    { id: "HorizontalArrangement1", kind: "HorizontalArrangement", lvl: 1, pal: "Layout", desc: "Puts the two components inside it side by side.", props: [["AlignHorizontal", "Center"]] },
    { id: "ListPicker_BT", kind: "ListPicker", lvl: 2, pal: "User Interface", desc: "Looks like a button. When tapped it opens a list (here, the paired Bluetooth devices) and you pick one.", props: [["Text", "Connect Bluetooth"], ["BackgroundColor", "Blue"]] },
    { id: "Label_Status", kind: "Label", lvl: 2, pal: "User Interface", desc: "Shows whether the app is connected.", props: [["Text", "Not Connected"]] },
    { id: "Disconnect_BT", kind: "Button", lvl: 1, pal: "User Interface", desc: "Closes the Bluetooth connection.", props: [["Text", "Disconnect"]] },
    { id: "HorizontalArrangement2", kind: "HorizontalArrangement", lvl: 1, pal: "Layout", desc: "Puts the two LED buttons side by side.", props: [["AlignHorizontal", "Center"]] },
    { id: "Button_ON", kind: "Button", lvl: 2, pal: "User Interface", desc: "Sends ON to the ESP32.", props: [["Text", "LED ON"], ["BackgroundColor", "Green"]] },
    { id: "Button_OFF", kind: "Button", lvl: 2, pal: "User Interface", desc: "Sends OFF to the ESP32.", props: [["Text", "LED OFF"], ["BackgroundColor", "Red"]] },
    { id: "Designer_Name", kind: "Label", lvl: 1, pal: "User Interface", desc: "Your name as the app's designer.", props: [["Text", "Created by (your name)"]] },
    { id: "BluetoothClient1", kind: "BluetoothClient", lvl: 1, pal: "Connectivity", nv: true, desc: "A non-visible component: it does the Bluetooth work (lists the paired devices, connects, sends text). It shows under the phone as a non-visible component, not on the screen.", props: [] }
  ];
  const appHtml = (st = {}) => `<div class="ai-app">
      <div class="app-bar ai">Screen1</div>
      <div class="ai-body">
        <div class="ai-c ai-title" data-c="Project_Title1">Bluetooth LED Control</div>
        <div class="ai-c ai-sub" data-c="Project_Title2">using ESP32 Internal Bluetooth</div>
        <div class="ai-c ai-row" data-c="HorizontalArrangement1">
          <button type="button" class="ai-c ai-btn blue" data-c="ListPicker_BT">Connect Bluetooth</button>
          <span class="ai-c ai-status" data-c="Label_Status">${esc(st.status || "Not Connected")}</span></div>
        <div class="ai-row"><button type="button" class="ai-c ai-btn grey" data-c="Disconnect_BT">Disconnect</button></div>
        <div class="ai-c ai-row" data-c="HorizontalArrangement2">
          <button type="button" class="ai-c ai-btn green" data-c="Button_ON">LED ON</button>
          <button type="button" class="ai-c ai-btn red" data-c="Button_OFF">LED OFF</button></div>
        <div class="ai-c ai-by" data-c="Designer_Name">Created by ${esc(who())}</div>
      </div>
      ${st.list || ""}${st.toast ? `<div class="ai-toast" role="alert">${esc(st.toast)}</div>` : ""}
    </div>`;

  function mountAiDesign(el) {
    let sel = "ListPicker_BT";
    el.innerHTML = `<div class="ai-design">
        <div class="ai-viewer"><p class="ai-h">Viewer</p>${phoneFrame("App design preview")}<button type="button" class="ai-nv" data-c="BluetoothClient1"><small>Non-visible components</small>ᛒ BluetoothClient1</button></div>
        <div class="ai-tree"><p class="ai-h">Components</p><ul role="list">${AI.map((c) => `<li><button type="button" class="ai-node lvl${c.lvl}" data-c="${c.id}"><span class="ai-k">${c.kind === "Label" ? "A" : c.kind.includes("Arrangement") ? "▥" : c.kind === "Screen" ? "▢" : c.kind === "BluetoothClient" ? "ᛒ" : "▭"}</span>${c.id}</button></li>`).join("")}</ul></div>
        <div class="ai-props"><p class="ai-h">Properties</p><div class="ai-prop-b" aria-live="polite"></div></div>
      </div>`;
    const screen = $(".ph-screen", el), props = $(".ai-prop-b", el);
    const paint = () => {
      screen.innerHTML = appHtml();
      screen.querySelectorAll(".ai-btn").forEach((b) => b.setAttribute("tabindex", "-1"));
      el.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("sel", x.dataset.c === sel));
      el.querySelectorAll(".ai-node").forEach((x) => x.setAttribute("aria-pressed", x.dataset.c === sel));
      const c = AI.find((x) => x.id === sel);
      props.innerHTML = `<p class="ai-pn">${c.id}</p><p class="ai-pk">${c.kind}${c.pal ? ` · from the <strong>${c.pal}</strong> palette` : ""}</p><p>${c.desc}</p>` +
        (c.props.length ? `<dl class="ai-pl">${c.props.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(k === "Text" && c.id === "Designer_Name" ? `Created by ${who()}` : v)}</dd></div>`).join("")}</dl>` : "");
    };
    el.addEventListener("click", (e) => {
      const n = e.target.closest("[data-c]");
      if (!n || !el.contains(n)) return;
      sel = n.dataset.c; paint();
    });
    onName(paint);
    paint();
  }

  const AI_EVENTS = [
    { b: () => bk("ai-ev", `when ${bf("ListPicker_BT")} .BeforePicking`, bk("ai-set", `set ${bf("ListPicker_BT")} . ${bf("Elements")} to ${inl("ai-get", `${bf("BluetoothClient1")} . ${bf("AddressesAndNames")}`)}`)),
      w: "Just before the list opens, fill it with the paired Bluetooth devices (the address and name of each)." },
    { b: () => bk("ai-ev", `when ${bf("ListPicker_BT")} .AfterPicking`, bk("ai-ctl", `if ${inl("ai-call", `call ${bf("BluetoothClient1")} .Connect<br>address ${inl("ai-get", `${bf("ListPicker_BT")} . ${bf("Selection")}`)}`)}`, bk("ai-set", `then set ${bf("Label_Status")} . ${bf("Text")} to ${inl("ai-text", "“ BT is now connected ”")}`))),
      w: "After you pick a device, connect to its address. If the connection works, the status label says so." },
    { b: () => bk("ai-ev", `when ${bf("Disconnect_BT")} .Click`, bk("ai-call", `call ${bf("BluetoothClient1")} .Disconnect`) + bk("ai-set", `set ${bf("Label_Status")} . ${bf("Text")} to ${inl("ai-text", "“ BT is now disconnected ”")}`)),
      w: "The Disconnect button closes the connection and updates the status label." },
    { b: () => bk("ai-ev", `when ${bf("Button_ON")} .Click`, bk("ai-call", `call ${bf("BluetoothClient1")} .SendText<br>text ${inl("ai-text", "“ ON ”")}`)),
      w: "The LED ON button sends the text ON: the same text you typed in the terminal in Lesson 2." },
    { b: () => bk("ai-ev", `when ${bf("Button_OFF")} .Click`, bk("ai-call", `call ${bf("BluetoothClient1")} .SendText<br>text ${inl("ai-text", "“ OFF ”")}`)),
      w: "The LED OFF button sends OFF." }
  ];
  function mountAiBlocks(el) {
    el.innerHTML = `<ol class="ai-bl">${AI_EVENTS.map((x, i) => `<li><div class="ai-bl-b">${ws(x.b(), `App Inventor block ${i + 1}`)}</div><p>${x.w}</p></li>`).join("")}</ol>`;
  }

  // A decorative QR-like pattern (not a real code)
  function fakeQr() {
    const N = 21, c = 6;
    let s = "", seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const finder = (x, y) => `<rect x="${x * c}" y="${y * c}" width="${7 * c}" height="${7 * c}" class="qr-d"/><rect x="${(x + 1) * c}" y="${(y + 1) * c}" width="${5 * c}" height="${5 * c}" class="qr-l"/><rect x="${(x + 2) * c}" y="${(y + 2) * c}" width="${3 * c}" height="${3 * c}" class="qr-d"/>`;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inF = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (!inF && rnd() > 0.5) s += `<rect x="${x * c}" y="${y * c}" width="${c}" height="${c}" class="qr-d"/>`;
    }
    return `<svg class="qr" viewBox="-6 -6 ${N * c + 12} ${N * c + 12}" aria-hidden="true"><rect x="-6" y="-6" width="${N * c + 12}" height="${N * c + 12}" class="qr-l"/>${s}${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}</svg>`;
  }
  function mountAiLoad(el) {
    el.innerHTML = `<ol class="load-steps">
        <li><span class="ls-n">1</span><div><h4>Install the Companion</h4><p>On your phone, install <strong>MIT AI2 Companion</strong> from the Play Store or App Store.</p></div></li>
        <li><span class="ls-n">2</span><div><h4>Connect → AI Companion</h4><p>In App Inventor, open <em>Connect → AI Companion</em>. It shows a QR code and a six-letter code.</p>
          <div class="qr-card">${fakeQr()}<div><small>Your code is:</small><strong>mfsdiv</strong><small>(example)</small></div></div></div></li>
        <li><span class="ls-n">3</span><div><h4>Scan It</h4><p>Open the Companion on the phone and scan the QR code (or type the code). Your app opens on the phone, and it updates live while you change the design or blocks.</p></div></li>
        <li><span class="ls-n">4</span><div><h4>Pair First</h4><p>In the phone's Bluetooth settings, pair with <strong class="bt-n"></strong> (as in Lesson 2). The ListPicker only lists <strong>paired</strong> devices.</p></div></li>
      </ol>`;
    const paint = () => { $(".bt-n", el).textContent = btName(); };
    onName(paint);
    paint();
  }

  function mountAiRun(el) {
    let connected = false, led = false, status = "Not Connected", list = false, toast = "", busy = false, fired = -1;
    const OTHER = "4C:87:5D:12:9A:0E Galaxy Buds2";
    el.innerHTML = `<div class="sim-grid">
        <div class="sim-phone">${phoneFrame("Your app running on the phone")}</div>
        <div class="sim-side">
          <figure class="scene-box"><div class="ai-scene"></div></figure>
          <div class="ai-fired"><h4>Block That Just Ran</h4><div class="ai-fired-b"><p class="small-note">Tap a button in the app.</p></div></div>
          <p class="pv-read ai-read"></p>
        </div></div>`;
    const screen = $(".ph-screen", el), sceneEl = $(".ai-scene", el), firedEl = $(".ai-fired-b", el), read = $(".ai-read", el);
    const drawScene = () => {
      sceneEl.innerHTML = `<svg class="scene" viewBox="0 0 420 150" role="img" aria-label="Phone app and ESP32. ${connected ? "Connected by Bluetooth." : "Not connected."} The blue LED is ${led ? "on" : "off"}.">` +
        phoneIco(8, 30, "your app") + btMark(29, 18) + `<path id="aiPath" class="rf-link${connected ? " on" : ""}" d="M54,60C120,4 250,4 300,40"/>` +
        board(92, 40, { k: 0.8, pwr: true, led }) + `</svg>`;
    };
    const render = () => {
      const lst = list ? `<div class="ai-list" role="dialog" aria-label="Choose a device"><p class="ai-list-h">Choose a device</p>
        <button type="button" class="ai-li" data-pick="esp">${esc(MAC)} ${esc(btName())}</button><button type="button" class="ai-li" data-pick="other">${esc(OTHER)}</button>
        <button type="button" class="ai-li cancel" data-pick="">Cancel</button></div>` : "";
      screen.innerHTML = appHtml({ status, list: lst, toast });
    };
    const fire = (i) => {
      fired = i;
      firedEl.innerHTML = ws(AI_EVENTS[i].b(), `App Inventor block that ran`) + `<p class="small-note">${AI_EVENTS[i].w}</p>`;
      const w = firedEl.querySelector(".bk-ws");
      if (w && !reduceMotion) { w.classList.remove("pulse"); void w.offsetWidth; w.classList.add("pulse"); }
    };
    const say = (t) => { toast = t; render(); setTimeout(() => { if (toast === t) { toast = ""; render(); } }, 2600); };
    async function sendText(t) {
      if (!connected) { say("Error 515: Not connected to a Bluetooth device."); read.innerHTML = `Connect first: tap <strong>Connect Bluetooth</strong> and choose your ESP32.`; return; }
      busy = true;
      await fly($("svg", sceneEl), $("#aiPath", sceneEl).getAttribute("d"), t, 800);
      led = t === "ON"; drawScene();
      read.innerHTML = `The ESP32 received <code>"${t}"</code>. App Inventor's SendText sends exactly the text, with no line ending, so <code>LED == "${t}"</code> is true and the LED turns ${t === "ON" ? "on" : "off"}. The ESP32 runs the same program as in Lesson 2.`;
      busy = false;
    }
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || !screen.contains(b) || busy) return;
      const c = b.dataset.c;
      if (c === "ListPicker_BT") { fire(0); list = true; render(); const f = $(".ai-li", screen); if (f) f.focus(); read.innerHTML = `The list shows the <strong>paired</strong> devices: each one's address and name.`; }
      else if (b.dataset.pick !== undefined) {
        list = false;
        if (!b.dataset.pick) { render(); return; }
        fire(1); status = "Connecting…"; render(); busy = true; await sleep(900); busy = false;
        if (b.dataset.pick === "esp") { connected = true; status = "BT is now connected"; read.innerHTML = `Connected to <strong>${esc(btName())}</strong>. Now tap LED ON and LED OFF.`; }
        else { status = "Not Connected"; say("Error 507: Unable to connect. Is the device turned on?"); read.innerHTML = `The earbuds can't take a serial connection. Pick your ESP32.`; }
        drawScene(); render();
      } else if (c === "Disconnect_BT") { fire(2); connected = false; status = "BT is now disconnected"; drawScene(); render(); read.innerHTML = "Disconnected. The LED keeps its last state: the ESP32 only changes it when it receives ON or OFF."; }
      else if (c === "Button_ON") { fire(3); sendText("ON"); }
      else if (c === "Button_OFF") { fire(4); sendText("OFF"); }
    });
    onName(render);
    drawScene(); render();
    read.innerHTML = `Try the app: tap <strong>Connect Bluetooth</strong>, choose your ESP32, then switch the LED. Try LED ON before connecting too.`;
  }

  /* =====================================================================
     LESSON 4: external LED, resistor calculator, Wi-Fi web server
     ===================================================================== */
  function mountWire(el) {
    let high = true, rev = false;
    el.innerHTML = chips("GPIO32 output", [["1", "GPIO32 HIGH (3.3 V)"], ["0", "GPIO32 LOW (0 V)"]], "1") +
      chips("LED direction", [["0", "LED the right way round"], ["1", "LED reversed"]], "0") +
      `<figure class="scene-box"><div class="scene-scroll"><div class="wire-scene"></div></div><figcaption>GPIO32 → LED → resistor → GND. The long leg of the LED (anode, +) goes to GPIO32.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure><p class="pv-read wire-read"></p>`;
    const sc = $(".wire-scene", el), read = $(".wire-read", el);
    const draw = () => {
      const bx = 80, by = 136, [dX, dY] = pinXY(bx, by, 1, "top", "D32"), [gX, gY] = pinXY(bx, by, 1, "top", "GND");
      const on = high && !rev, lx = dX - 40, rL = gX + 30, rR = lx - 28;
      let s = `<rect class="bb" x="${bx}" y="10" width="360" height="92" rx="6"/>`;
      for (let x = bx + 12; x < bx + 352; x += 12) for (const y of [30, 42, 54, 66, 78]) s += `<circle class="bb-h" cx="${x}" cy="${y}" r="1.6"/>`;
      s += board(bx, by, { pwr: true, hi: ["t:D32", "t:GND"] });
      // wires from the pins up to the breadboard
      s += `<path class="wire r" d="M${dX},${dY}V66H${lx + 8}V60"/><path class="wire g" d="M${gX},${gY}V66H${gX + 20}"/>`;
      // resistor from the LED's cathode row to the GND wire
      s += `<path class="leg" d="M${lx - 8},60V66H${rR}M${gX + 20},66H${rL}"/><rect class="res-body" x="${rL}" y="59" width="${rR - rL}" height="14" rx="6"/>`;
      [0.18, 0.34, 0.5, 0.8].forEach((f, i) => { s += `<rect class="band b${i}" x="${rL + f * (rR - rL) - 2}" y="59" width="5" height="14"/>`; });
      // LED: legs (anode longer, bent) and dome
      const aX = rev ? lx - 8 : lx + 8, cX = rev ? lx + 8 : lx - 8;
      s += `<path class="leg" d="M${aX},60V36"/><path class="leg" d="M${cX},60V40"/>`;
      s += `<path class="led-dome${on ? " on" : ""}" d="M${lx - 13},38V24a13,13 0 0 1 26,0V38Z"/><rect class="led-rim${on ? " on" : ""}" x="${lx - 15}" y="36" width="30" height="5" rx="1.5"/>`;
      s += T(lx + 22, 24, rev ? "long leg (+) on the resistor side" : "long leg (+), anode", "start", "bb-t") + T(lx - 22, 24, rev ? "" : "short leg (−), cathode", "end", "bb-t");
      if (on) s += `<path class="current" d="M${dX},${dY}V66H${lx + 8}V36M${lx - 8},40V66H${gX}V${gY}"/>`;
      s += T(dX + 6, 124, "D32 (GPIO32)", "start", "wl") + T(gX + 6, 124, "GND", "start", "wl") + T((rL + rR) / 2, 92, "resistor", "middle", "bb-t");
      sc.innerHTML = `<svg class="scene wire-svg" viewBox="0 0 520 262" role="img" aria-label="External LED and resistor on a breadboard wired to GPIO32 and GND. The LED is ${on ? "lit" : "off"}.">${s}</svg>`;
      read.innerHTML = on ? `<strong>The LED is lit.</strong> Current flows from GPIO32 (3.3 V) through the LED, from its long leg to its short leg, then through the resistor to GND.`
        : !high ? `<strong>The LED is off.</strong> GPIO32 is at 0 V, the same as GND, so no current flows.`
        : `<strong>The LED stays off.</strong> An LED only conducts one way, from anode (long leg) to cathode (short leg). Turn it round. (A reversed LED isn't damaged at 3.3 V.)`;
    };
    const rows = el.querySelectorAll(".chips-row");
    wireChips(rows[0], (v) => { high = v === "1"; draw(); });
    wireChips(rows[1], (v) => { rev = v === "1"; draw(); });
    draw();
  }

  const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  const nextE12 = (R) => {
    for (let d = 1; d <= 1e6; d *= 10) for (const m of E12) if (m * d >= R * 0.9999) return Number((m * d).toPrecision(3));
    return R;
  };

  const wifiBlocks = () =>
    bk("root", "Setup",
      bk("var", `Declare ${bf("ClientRequest")} as String Value ${bs("")}`) +
      bk("wifi", "Disconnect") + bk("delay", `Delay Ms ${bn(1000)}`) +
      bk("print", `Print on new line ${bs("Searching for an access point (AP)")}`) +
      bk("wifi", `Connect Network ssid ${bs(SSID)} password ${bs("Password")}`) +
      bk("logic", `repeat while ${inl("logic", `not ${inl("wifi", "Is Connected?")}`)}`, bk("delay", `Delay Ms ${bn(1000)}`) + bk("print", `Print on new line ${bs("Waiting for an IP address")}`)) +
      bk("print", `Print on new line ${bs("Obtained an IP address")}`) +
      bk("print", `Print on new line ${inl("wifi", "Local IP")}`) +
      bk("print", `Print on new line ${bs(esc(who()))}`) +
      bk("print", `Print on new line ${inl("wifi", "Show MAC Address")}`) +
      bk("wifi", `Start Server Port ${bn(80)}`)) +
    bk("root", "Main loop",
      bk("wifi", "Wait Connection") +
      bk("var", `set STRING ${bf("ClientRequest")} to ${inl("wifi", "Server Read request")}`) +
      bk("wifi", "client flush") +
      bk("logic", `if ${inl("var", `${bf("ClientRequest")} Index of ${bs("LED=ON")}`)} ${bf("&gt;")} ${bn(0)}`, bk("pin", `DigitalWrite PIN# ${bf("D32")} STAT ${bf("HIGH")}`)) +
      bk("logic", `if ${inl("var", `${bf("ClientRequest")} Index of ${bs("LED=OFF")}`)} ${bf("&gt;")} ${bn(0)}`, bk("pin", `DigitalWrite PIN# ${bf("D32")} STAT ${bf("LOW")}`)) +
      bk("wbk", "Answer Web page",
        bk("wbk", `Head ${inl("wbk", `Web page HTML ${bs("&lt;title&gt;WEB Based LED Control&lt;/title&gt;")}`)}`) +
        bk("wbk", `Body ${inl("wbk", `Heading ${bf("1")} Color <span class="swatch"></span> Text ${bs("WEB Based LED Control")}`)}`) +
        bk("wbk", `${inl("wbk", `Button Href / ${bs("LED=ON")} Button title ${bs("ON")}`)}`) +
        bk("wbk", `${inl("wbk", `Button Href / ${bs("LED=OFF")} Button title ${bs("OFF")}`)}`)));
  const wifiCode = () => `${HEAD}#include <WiFi.h>

String ClientRequest;
WiFiServer server(80);
WiFiClient client;

void setup()
{
ClientRequest = "";
Serial.begin(115200);
pinMode(32, OUTPUT);
  WiFi.disconnect();
  delay(1000);
  Serial.println("Searching for an access point (AP)");
  WiFi.begin("${SSID}","Password");
  while ((!(WiFi.status() == WL_CONNECTED))){
    delay(1000);
    Serial.println("Waiting for an IP address");
  }
  Serial.println("Obtained an IP address");
  Serial.println((WiFi.localIP()));
  Serial.println("${who()}");
  Serial.println((WiFi.macAddress()));
  server.begin();
}

void loop()
{
    client = server.available();
    if (!client) { return; }
    while(!client.available()){  delay(1); }
    ClientRequest = (client.readStringUntil('\\r'));
    client.flush();
    if (ClientRequest.indexOf("LED=ON") > 0) {
      digitalWrite(32,HIGH);
    }
    if (ClientRequest.indexOf("LED=OFF") > 0) {
      digitalWrite(32,LOW);
    }
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: text/html");
    client.println("");
    client.println("<!DOCTYPE HTML>");
    client.println("<html>");
    client.println("<head>");
    client.println("<title>WEB Based LED Control</title>");
    client.println("</head>");
    client.println("<body>");
    client.println("<h1 style='color:#000000'>WEB Based LED Control</h1>");
    client.println("<a href='/LED=ON'><button>ON</button></a>");
    client.println("<a href='/LED=OFF'><button>OFF</button></a>");
    client.println("</body>");
    client.println("</html>");
    client.stop();
    delay(1);
}`;
  function mountWifiBlocks(el) {
    const draw = () => {
      el.innerHTML = `<div class="bc-grid"><div>${ws(wifiBlocks(), "TUNIOT blocks for the Wi-Fi web server")}</div><div>${codeBlock(wifiCode(), "wifi_led.ino (from TUNIOT)")}</div></div>
        <ol class="what">
          <li><strong>Setup: join the Wi-Fi.</strong> Connect to the network (put your own network name and password), wait until connected, then print the IP address, your name and the MAC address on the Serial Monitor.</li>
          <li><strong>Start Server Port 80.</strong> Port 80 is the normal port for web pages.</li>
          <li><strong>Main loop: read the request.</strong> Wait for a browser, and read the first line of its request into <code>ClientRequest</code>.</li>
          <li><strong>Index of.</strong> Looks for <code>LED=ON</code> or <code>LED=OFF</code> in the request and switches GPIO32 (D32).</li>
          <li><strong>Answer Web page.</strong> Sends back a page with a heading and ON and OFF buttons. Each button is a link to <code>/LED=ON</code> or <code>/LED=OFF</code>.</li>
        </ol>`;
    };
    onName(draw);
    draw();
  }

  function mountWifiRun(el) {
    let ready = false, booting = false, led = false, page = "", url = IP, busy = false, run = 0, started = false;
    el.innerHTML = `<div class="sim-grid">
        <div class="sim-phone">${phoneFrame("Phone web browser")}</div>
        <div class="sim-side">
          <figure class="scene-box"><div class="wf-scene"></div></figure>
          <div class="wf-row"><button type="button" class="btn ghost" data-en>Press EN (restart the ESP32)</button></div>
          ${serialBox()}
          <div class="esp-in"><h4>Inside the ESP32</h4><pre class="esp-vars" aria-live="polite">Waiting for a browser…</pre></div>
          <p class="pv-read wf-read"></p>
        </div></div>`;
    const screen = $(".ph-screen", el), sceneEl = $(".wf-scene", el), so = serialOut($(".serial", el)), vars = $(".esp-vars", el), read = $(".wf-read", el);
    const drawScene = () => {
      const bx = 262, by = 116, k = 0.5, [dX, dY] = pinXY(bx, by, k, "top", "D32"), [gX, gY] = pinXY(bx, by, k, "top", "GND");
      let s = phoneIco(8, 56, "phone") + router(140, 40, ready) + `<path id="wfA" class="rf-link${ready ? " on" : ""}" d="M52,86Q90,40 138,52"/><path id="wfB" class="rf-link${ready ? " on" : ""}" d="M222,52Q300,30 ${bx + 128},${by - 2}"/>`;
      s += board(bx, by, { k, pwr: true });
      s += `<path class="wire r thin" d="M${dX},${dY}V96"/><path class="leg" d="M${dX},96V88"/><path class="led-dome sm${led ? " on" : ""}" d="M${dX - 7},88V80a7,7 0 0 1 14,0V88Z"/>`;
      s += `<path class="wire g thin" d="M${dX - 4},90V100H${gX}V${gY}"/><rect class="res-body" x="${(dX + gX) / 2 - 12}" y="96" width="24" height="8" rx="3"/>`;
      s += T(dX + 12, 80, "GPIO32 LED", "start", "small");
      sceneEl.innerHTML = `<svg class="scene" viewBox="0 0 460 190" role="img" aria-label="Phone, Wi-Fi router and ESP32 with an external LED on GPIO32. The LED is ${led ? "on" : "off"}.">${s}</svg>`;
    };
    const render = () => {
      const body = page === "led"
        ? `<div class="web"><h1>WEB Based LED Control</h1><p><button type="button" class="web-b" data-path="/LED=ON">ON</button> <button type="button" class="web-b" data-path="/LED=OFF">OFF</button></p></div>`
        : page === "err" ? `<div class="web err"><p class="err-h">This site can't be reached</p><p>${ready ? "Check the IP address in the Serial Monitor." : "Is the ESP32 connected to the Wi-Fi yet? Watch the Serial Monitor."}</p></div>`
        : `<div class="web blank"><p>Type the ESP32's IP address from the Serial Monitor, then tap Go.</p></div>`;
      screen.innerHTML = `<form class="br-bar ph" data-go><input type="text" inputmode="url" aria-label="Address" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(url)}"><button type="submit" class="go-b">Go</button></form><div class="br-view">${body}</div>`;
    };
    async function boot() {
      const my = ++run;
      booting = true; ready = false; led = false; page = ""; so.clear(); drawScene(); render();
      vars.textContent = "Waiting for a browser…";
      const lines = ["", "Searching for an access point (AP)", "Waiting for an IP address", "Waiting for an IP address", "Waiting for an IP address", "Obtained an IP address", IP, who(), MAC];
      for (const [i, line] of lines.entries()) {
        await sleep(i === 0 ? 150 : i < 5 ? 700 : 350);
        if (my !== run) return;
        so.add(line);
        if (line === "Obtained an IP address") { ready = true; drawScene(); }
      }
      booting = false;
      read.innerHTML = `The ESP32 is on the Wi-Fi at <strong>${IP}</strong>. Type that into the phone's browser and tap Go.`;
    }
    async function request(path) {
      if (busy) return;
      busy = true;
      url = IP + (path === "/" ? "" : path); render();
      const req = `GET ${path} HTTP/1.1`, svgEl = $("svg", sceneEl);
      await fly(svgEl, $("#wfA", sceneEl).getAttribute("d"), "GET", 600);
      await fly($("svg", sceneEl), $("#wfB", sceneEl).getAttribute("d"), "GET", 600);
      const on = req.indexOf("LED=ON"), off = req.indexOf("LED=OFF");
      if (on > 0) led = true;
      if (off > 0) led = false;
      drawScene();
      vars.innerHTML = `ClientRequest = "${esc(req)}"
indexOf("LED=ON")  → ${on}   ${on > 0 ? `<b class="t">${on} &gt; 0: digitalWrite(32, HIGH)</b>` : `<b class="f">not &gt; 0: no change</b>`}
indexOf("LED=OFF") → ${off}   ${off > 0 ? `<b class="t">${off} &gt; 0: digitalWrite(32, LOW)</b>` : `<b class="f">not &gt; 0: no change</b>`}
Answer: send the web page back`;
      const back = (d) => d.replace(/^M([\d.]+),([\d.]+)Q([\d.]+),([\d.]+) ([\d.]+),([\d.]+)$/, "M$5,$6Q$3,$4 $1,$2");
      await fly($("svg", sceneEl), back($("#wfB", sceneEl).getAttribute("d")), "page", 600, "back");
      await fly($("svg", sceneEl), back($("#wfA", sceneEl).getAttribute("d")), "page", 600, "back");
      page = "led"; render();
      read.innerHTML = path === "/" ? `The ESP32 answered with its web page. Tap <strong>ON</strong> or <strong>OFF</strong>.`
        : `The button loaded <code>${esc(path)}</code>. The ESP32 found <code>${on > 0 ? "LED=ON" : "LED=OFF"}</code> at position ${Math.max(on, off)} of the request, switched GPIO32 ${led ? "HIGH" : "LOW"} and sent the page back.`;
      busy = false;
    }
    el.addEventListener("submit", (e) => {
      if (!e.target.matches("[data-go]")) return;
      e.preventDefault();
      const v = e.target.querySelector("input").value.trim().replace(/^https?:\/\//i, "");
      const m = /^([^/]*)(\/.*)?$/.exec(v), host = m ? m[1] : "", path = (m && m[2]) || "/";
      url = v;
      if (!ready || host !== IP) { page = "err"; render(); read.innerHTML = !ready ? "Wait until the Serial Monitor shows the IP address." : `No device at <code>${esc(host || "(blank)")}</code> on this network. The ESP32 printed <strong>${IP}</strong>.`; return; }
      request(path);
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-en")) boot();
      else if (b.dataset.path && screen.contains(b)) request(b.dataset.path);
    });
    drawScene(); render();
    read.textContent = "The ESP32 starts and joins the Wi-Fi. Watch the Serial Monitor for its IP address.";
    // Start the ESP32 when the widget first scrolls into view.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es[es.length - 1].isIntersecting && !started) { started = true; io.disconnect(); boot(); } }, { threshold: 0.3 });
      io.observe(el);
    } else boot();
  }

  /* =====================================================================
     LESSON 5: monitor the condition of a toggle switch on GPIO33
     The bench: breadboard with a 3V3 rail and a GND rail, the switch, the LED on GPIO32, the board.
     ON is always the lever on the left (pin A). 3-pin switch: A → 3V3, B → GND, middle (C) → GPIO33.
     2-pin switch: A → GND, C → GPIO33, plus a 10 kΩ pull-up (or nothing: a floating input).
     ===================================================================== */
  const BX = 130, BY = 150;
  // GPIO33 reading for a wiring type and switch position (null = floating: random)
  const swRead = (type, on) => (type === "spdt" ? (on ? 1 : 0) : on ? 0 : type === "pull" ? 1 : null);

  // o: { type, on, read, led2, led32, phone, hiSw }
  function bench(o) {
    const [cX, cY] = pinXY(BX, BY, 1, "top", "D33"), [dX, dY] = pinXY(BX, BY, 1, "top", "D32");
    const [gX, gY] = pinXY(BX, BY, 1, "top", "GND"), [vX, vY] = pinXY(BX, BY, 1, "bot", "3V3");
    const A = 300, C = 330, B = 360, two = o.type !== "spdt";
    let s = `<rect class="bb" x="${BX}" y="-8" width="360" height="128" rx="6"/>`;
    for (let x = BX + 12; x < BX + 352; x += 12) for (const y of [44, 92, 104]) s += `<circle class="bb-h" cx="${x}" cy="${y}" r="1.6"/>`;
    s += `<line class="rail-p" x1="${BX + 8}" x2="${BX + 352}" y1="16" y2="16"/><line class="rail-n" x1="${BX + 8}" x2="${BX + 352}" y1="30" y2="30"/>`;
    s += T(BX + 12, 10, "3V3 rail", "start", "bb-t sm") + T(BX + 12, 41, "GND rail", "start", "bb-t sm");
    s += board(BX, BY, { pwr: true, led: o.led2, hi: ["t:D33", "t:D32", "t:GND", "b:3V3"] });
    // rails to the board
    s += `<path class="wire r" d="M${vX},${vY}V290H112V16H${BX + 8}"/><path class="wire g" d="M${gX},${gY}V30"/>`;
    // switch legs and jumpers
    s += `<path class="leg" d="M${A},64V80M${C},64V80${two ? "" : `M${B},64V80`}"/>`;
    s += `<path class="wire y" d="M${C},80V92H${cX}V${cY}"/>`;
    if (o.type === "spdt") s += `<path class="wire r" d="M${A},80H280V16"/><path class="wire g" d="M${B},80H390V30"/>`;
    else s += `<path class="wire g" d="M${A},80H280V30"/>`;
    if (o.type === "pull") s += `<path class="wire r thin" d="M${C},92H262V16"/><rect class="res-body" x="257" y="40" width="10" height="28" rx="3"/>` + T(250, 60, "10 kΩ", "end", "bb-t sm");
    // switch body and lever (clickable)
    s += `<g class="sw${o.hiSw ? " hl" : ""}" tabindex="0" role="button" aria-label="Toggle switch, now ${o.on ? "ON" : "OFF"}. Press to flip it.">
      <rect class="sw-body" x="285" y="44" width="90" height="22" rx="4"/><rect class="sw-slot" x="295" y="50" width="70" height="10" rx="3"/>
      <rect class="sw-lever${o.on ? " on" : ""}" x="${o.on ? 297 : 333}" y="36" width="30" height="20" rx="4"/>
      ${T(o.on ? 312 : 348, 50, o.on ? "ON" : "OFF", "middle", "sw-t")}</g>`;
    // LED on GPIO32, resistor to the GND rail
    s += `<path class="wire r" d="M${dX},${dY}V112H473V84"/><path class="leg" d="M473,84V70M457,84V72"/><path class="wire g thin" d="M457,84H440V30"/><rect class="res-body" x="435" y="40" width="10" height="28" rx="3"/>`;
    s += `<path class="led-dome${o.led32 ? " on" : ""}" d="M452,72V58a13,13 0 0 1 26,0V72Z"/>`;
    s += T(cX - 4, 136, "GPIO33", "end", "wl sm") + T(dX + 4, 136, "GPIO32", "start", "wl sm");
    const rd = o.read === null || o.read === undefined ? "?" : o.read;
    s += `<g class="rd"><rect x="2" y="56" width="104" height="44" rx="6"/>${T(54, 74, "digitalRead(33)", "middle", "rd-l")}${T(54, 93, rd === "?" ? "?" : `${rd} (${rd ? "HIGH" : "LOW"})`, "middle", `rd-v${rd === 1 ? " hi" : ""}`)}</g>`;
    if (o.phone) s += phoneIco(20, 170, "phone") + `<path id="${o.phone}" class="rf-link${o.link ? " on" : ""}" d="M${BX + 256},${BY + 30}C${BX + 200},${BY - 30} 90,${BY - 10} 64,${BY + 40}"/>`;
    return `<svg class="scene bench" viewBox="0 -12 520 312" role="img" aria-label="Breadboard with a toggle switch on GPIO33 and an LED on GPIO32. The switch is ${o.on ? "ON" : "OFF"}; GPIO33 reads ${rd === "?" ? "a random value (floating)" : rd ? "HIGH" : "LOW"}.">${s}</svg>`;
  }
  // Click or press Enter/Space on the drawn switch, or the button next to it
  function wireSwitch(el, flip) {
    el.addEventListener("click", (e) => { if (e.target.closest(".sw") || e.target.closest("[data-flip]")) flip(); });
    el.addEventListener("keydown", (e) => { if (e.target.closest && e.target.closest(".sw") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); flip(true); } });
  }
  const refocusSw = (host) => { const g = host.querySelector(".sw"); if (g) g.focus(); };
  // Run a 200 ms tick while the page is open (cheap; stops when the element leaves the page)
  function every(el, ms, fn) { const id = setInterval(() => { if (!el.isConnected) return clearInterval(id); fn(); }, ms); return id; }

  // 8 wiring: three ways to wire the switch, with a 6-second record of what GPIO33 reads
  function mountSwWire(el) {
    let type = "spdt", on = false, hist = [];
    el.innerHTML = chips("Switch wiring", [["spdt", "3-pin switch (recommended)"], ["pull", "2-pin + 10 kΩ pull-up"], ["float", "2-pin, no resistor"]], "spdt") +
      `<div class="task-sim"><figure class="scene-box"><div class="scene-scroll"><div class="bench-host"></div></div><figcaption>Tap the switch to flip it.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
        <div class="task-side"><button type="button" class="btn" data-flip>Flip the switch</button><div class="strip-box"><div class="sw-strip"></div></div><p class="pv-read sw-read"></p></div></div>`;
    const host = $(".bench-host", el), strip = $(".sw-strip", el), read = $(".sw-read", el);
    const val = () => { const r = swRead(type, on); return r === null ? (Math.random() < 0.5 ? 0 : 1) : r; };
    const draw = (focus) => {
      const r = hist.length ? hist[hist.length - 1] : val(), fl = swRead(type, on) === null;
      host.innerHTML = bench({ type, on, read: fl ? null : r, led2: r === 1, led32: r === 1 });
      const W = 300, H = 80, l = 40, X = (i) => l + (i / 29) * (W - l - 10), Y = (v) => (v ? 16 : 56);
      const pts = []; hist.forEach((v, i) => { if (i) pts.push([X(i), Y(hist[i - 1])]); pts.push([X(i), Y(v)]); });
      strip.innerHTML = `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="What GPIO33 read over the last 6 seconds">${T(l - 6, 20, "1", "end", "axis")}${T(l - 6, 60, "0", "end", "axis")}<line class="gl" x1="${l}" x2="${W - 10}" y1="16" y2="16"/><line class="gl" x1="${l}" x2="${W - 10}" y1="56" y2="56"/>${pts.length > 1 ? poly(pts, "trace-a") : ""}${T(W - 10, 76, "last 6 s", "end", "axis")}</svg>`;
      read.innerHTML = type === "spdt" ? `<strong>3-pin switch.</strong> The middle pin is always joined to 3V3 (ON) or GND (OFF), so GPIO33 reads a clean <strong>${on ? "1" : "0"}</strong>. ON = 1. This is the wiring used in this lesson.`
        : type === "pull" ? `<strong>2-pin switch with a pull-up.</strong> OFF: the 10 kΩ resistor pulls GPIO33 up to 3.3 V, so it reads 1. ON: the switch joins GPIO33 to GND, so it reads 0. It works, but <strong>ON reads 0</strong>: swap the 1 and the 0 in your program.`
        : on ? `<strong>2-pin switch, no resistor, switch ON.</strong> GPIO33 is joined to GND and reads 0.` : `<strong>Floating input.</strong> With the switch OFF, nothing sets the voltage on GPIO33. It picks up noise and reads 0 and 1 at random, so the LEDs flicker. Add a pull-up resistor, or use a 3-pin switch.`;
      if (focus) refocusSw(host);
    };
    every(el, 200, () => { hist.push(val()); if (hist.length > 30) hist.shift(); draw(); });
    wireChips($(".chips-row", el), (v) => { type = v; draw(); });
    wireSwitch(el, (k) => { on = !on; hist.push(val()); draw(k); });
    draw();
  }

  /* ---------- TUNIOT blocks and code for Lesson 5 ---------- */
  const ifVar = (a, op, b) => inl("var", `${bf(a)} ${bf(op)} ${b}`);
  const ledBoth = (st) => bk("led", `Integrated LED Stat ${bf(st)}`) + bk("pin", `DigitalWrite PIN# ${bf("D32")} STAT ${bf(st)}`);
  const t81Blocks = () =>
    bk("root", "Setup", bk("var", `Declare ${bf("SW")} as int Value ${bn(0)}`) + bk("var", `Declare ${bf("LAST")} as int Value ${bn(-1)}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("SW")} to ${inl("pin", `Digital read PIN# ${bf("D33")}`)}`) +
      bk("logic", `if ${ifVar("SW", "≠", bf("LAST"))}`,
        bk("logic", `if ${ifVar("SW", "=", bn(1))}`, ledBoth("HIGH") + bk("print", `Print on new line ${bs("Switch ON")}`)) +
        bk("logic", `if ${ifVar("SW", "=", bn(0))}`, ledBoth("LOW") + bk("print", `Print on new line ${bs("Switch OFF")}`)) +
        bk("var", `set ${bf("LAST")} to ${bf("SW")}`)) +
      bk("delay", `Delay Ms ${bn(200)}`));
  const t81Code = () => `${HEAD}
int SW;
int LAST;

void setup()
{
SW = 0;
LAST = -1;
Serial.begin(115200);
pinMode(33, INPUT);
pinMode(2, OUTPUT);
pinMode(32, OUTPUT);
}

void loop()
{

    SW = digitalRead(33);
    if (SW != LAST) {
      if (SW == 1) {
        digitalWrite(2,HIGH);
        digitalWrite(32,HIGH);
        Serial.println("Switch ON");
      }
      if (SW == 0) {
        digitalWrite(2,LOW);
        digitalWrite(32,LOW);
        Serial.println("Switch OFF");
      }
      LAST = SW;
    }
    delay(200);

}`;
  const t82Blocks = () =>
    bk("root", "Setup",
      bk("var", `Declare ${bf("SW")} as int Value ${bn(0)}`) + bk("var", `Declare ${bf("LAST")} as int Value ${bn(-1)}`) + bk("var", `Declare ${bf("COUNT")} as int Value ${bn(0)}`) +
      bk("bt", `Start Internal Bluetooth<br>Name ${bs(esc(btName()))}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("SW")} to ${inl("pin", `Digital read PIN# ${bf("D33")}`)}`) +
      bk("var", `set ${bf("COUNT")} to ${inl("var", `${bf("COUNT")} + ${bn(1)}`)}`) +
      bk("logic", `if ${inl("logic", `${ifVar("SW", "≠", bf("LAST"))} or ${ifVar("COUNT", "≥", bn(10))}`)}`,
        bk("logic", `if ${ifVar("SW", "=", bn(1))}`, ledBoth("HIGH") + bk("bt", `SerialBT print on new line ${bs("ON")}`)) +
        bk("logic", `if ${ifVar("SW", "=", bn(0))}`, ledBoth("LOW") + bk("bt", `SerialBT print on new line ${bs("OFF")}`)) +
        bk("var", `set ${bf("LAST")} to ${bf("SW")}`) + bk("var", `set ${bf("COUNT")} to ${bn(0)}`)) +
      bk("delay", `Delay Ms ${bn(200)}`));
  const t82Code = () => `${HEAD}#include "BluetoothSerial.h"

int SW;
int LAST;
int COUNT;
BluetoothSerial SerialBT;

void setup()
{
SW = 0;
LAST = -1;
COUNT = 0;
SerialBT.begin("${btName()}");
pinMode(33, INPUT);
pinMode(2, OUTPUT);
pinMode(32, OUTPUT);
}

void loop()
{

    SW = digitalRead(33);
    COUNT = COUNT + 1;
    if (SW != LAST || COUNT >= 10) {      // on a change, or every 10 × 200 ms = 2 s
      if (SW == 1) {
        digitalWrite(2,HIGH);
        digitalWrite(32,HIGH);
        SerialBT.println("ON");
      }
      if (SW == 0) {
        digitalWrite(2,LOW);
        digitalWrite(32,LOW);
        SerialBT.println("OFF");
      }
      LAST = SW;
      COUNT = 0;
    }
    delay(200);

}`;
  const AI_RX = () => bk("ai-ev", `when ${bf("Clock1")} .Timer`,
    bk("ai-ctl", `if ${inl("ai-call", `${inl("ai-get", `${bf("BluetoothClient1")} . ${bf("IsConnected")}`)} and ${inl("ai-get", `${bf("BluetoothClient1")} . ${bf("BytesAvailableToReceive")}`)} &gt; ${bn(0)}`)}`,
      bk("ai-set", `then set ${bf("Label_Switch")} . ${bf("Text")} to ${inl("ai-text", `join “ Switch: ” ${inl("ai-text", `trim ${inl("ai-call", `call ${bf("BluetoothClient1")} .ReceiveText<br>numberOfBytes ${bn(-1)}`)}`)}`)}`)));
  const t83Blocks = () =>
    bk("root", "Setup", `<span class="bk-empty">The same Setup blocks as Lesson 4 (join the Wi-Fi, print the IP, your name and the MAC, Start Server Port 80)</span>` +
      bk("var", `Declare ${bf("SW")} as int Value ${bn(0)}`) + bk("var", `Declare ${bf("STATE")} as String Value ${bs("OFF")}`)) +
    bk("root", "Main loop",
      bk("var", `set ${bf("SW")} to ${inl("pin", `Digital read PIN# ${bf("D33")}`)}`) +
      bk("logic", `if ${ifVar("SW", "=", bn(1))}`, bk("var", `set STRING ${bf("STATE")} to ${bs("ON")}`) + ledBoth("HIGH")) +
      bk("logic", `if ${ifVar("SW", "=", bn(0))}`, bk("var", `set STRING ${bf("STATE")} to ${bs("OFF")}`) + ledBoth("LOW")) +
      bk("wifi", "Wait Connection") +
      bk("var", `set STRING ${bf("ClientRequest")} to ${inl("wifi", "Server Read request")}`) +
      bk("wifi", "client flush") +
      bk("wbk", "Answer Web page",
        bk("wbk", `Head ${inl("wbk", `Web page HTML ${bs("&lt;meta http-equiv='refresh' content='1'&gt;&lt;title&gt;Switch Monitor&lt;/title&gt;")}`)}`) +
        bk("wbk", `Body ${inl("wbk", `Heading ${bf("1")} Text ${bs("Switch Monitor")}`)}`) +
        bk("wbk", `${inl("wbk", `Heading ${bf("2")} Text ${inl("var", `join ${bs("Switch: ")} ${bf("STATE")}`)}`)}`) +
        bk("wbk", `${inl("wbk", `Heading ${bf("2")} Text ${inl("var", `join ${bs("LEDs: ")} ${bf("STATE")}`)}`)}`)));
  const t83Code = () => `${HEAD}#include <WiFi.h>

String ClientRequest;
int SW;
String STATE;
WiFiServer server(80);
WiFiClient client;

void setup()
{
ClientRequest = "";
SW = 0;
STATE = "OFF";
Serial.begin(115200);
pinMode(33, INPUT);
pinMode(2, OUTPUT);
pinMode(32, OUTPUT);
  WiFi.disconnect();
  delay(1000);
  Serial.println("Searching for an access point (AP)");
  WiFi.begin("${SSID}","Password");
  while ((!(WiFi.status() == WL_CONNECTED))){
    delay(1000);
    Serial.println("Waiting for an IP address");
  }
  Serial.println("Obtained an IP address");
  Serial.println((WiFi.localIP()));
  Serial.println("${who()}");
  Serial.println((WiFi.macAddress()));
  server.begin();
}

void loop()
{
    SW = digitalRead(33);               // read the switch first, every loop
    if (SW == 1) {
      STATE = "ON";
      digitalWrite(2,HIGH);
      digitalWrite(32,HIGH);
    }
    if (SW == 0) {
      STATE = "OFF";
      digitalWrite(2,LOW);
      digitalWrite(32,LOW);
    }
    client = server.available();
    if (!client) { return; }
    while(!client.available()){  delay(1); }
    ClientRequest = (client.readStringUntil('\\r'));
    client.flush();
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: text/html");
    client.println("");
    client.println("<!DOCTYPE HTML>");
    client.println("<html>");
    client.println("<head>");
    client.println("<meta http-equiv='refresh' content='1'><title>Switch Monitor</title>");
    client.println("</head>");
    client.println("<body>");
    client.println("<h1>Switch Monitor</h1>");
    client.println("<h2>Switch: " + STATE + "</h2>");
    client.println("<h2>LEDs: " + STATE + "</h2>");
    client.println("</body>");
    client.println("</html>");
    client.stop();
    delay(1);
}`;
  const stateCode = `    // Optional: a plain-text reply for an App Inventor app (put it before the HTML page)
    if (ClientRequest.indexOf("/state") > 0) {
      client.println("HTTP/1.1 200 OK");
      client.println("Content-Type: text/plain");
      client.println("");
      client.println(STATE);
      client.stop();
      return;
    }`;
  const AI_WEB = () =>
    bk("ai-ev", `when ${bf("Clock1")} .Timer`, bk("ai-set", `set ${bf("Web1")} . ${bf("Url")} to ${inl("ai-text", `“ http://${IP}/state ”`)}`) + bk("ai-call", `call ${bf("Web1")} .Get`)) +
    bk("ai-ev", `when ${bf("Web1")} .GotText<br><small>url, responseCode, responseType, responseContent</small>`, bk("ai-set", `set ${bf("Label_Switch")} . ${bf("Text")} to ${inl("ai-text", `join “ Switch: ” ${inl("ai-text", `trim ${inl("ai-get", "get responseContent")}`)}`)}`));

  const blocksAndCode = (blocks, code, file, label) => `<div class="bc-grid"><div>${ws(blocks, label)}</div><div>${codeBlock(code, file)}</div></div>
    <p class="small-note">TUNIOT may name a few blocks slightly differently. What matters is that your Arduino code does the same.</p>`;

  function mountT81(el) {
    let on = false, last = -1, so;
    el.innerHTML = `<div class="sw-blocks"></div>
      <h4 class="sub-h">Try It: Monitor on the Serial Monitor</h4>
      <div class="task-sim"><figure class="scene-box"><div class="scene-scroll"><div class="bench-host"></div></div><figcaption>Tap the switch to flip it.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
        <div class="task-side"><button type="button" class="btn" data-flip>Flip the switch</button>${serialBox()}<p class="pv-read t81-read"></p></div></div>`;
    const host = $(".bench-host", el), read = $(".t81-read", el);
    so = serialOut($(".serial", el));
    const blocks = () => { $(".sw-blocks", el).innerHTML = blocksAndCode(t81Blocks(), t81Code(), "switch_serial.ino", "TUNIOT blocks: monitor the switch on the Serial Monitor"); };
    const step_ = (focus) => {
      const sw = on ? 1 : 0;
      if (sw !== last) { so.add(sw ? "Switch ON" : "Switch OFF"); last = sw; }
      host.innerHTML = bench({ type: "spdt", on, read: sw, led2: !!sw, led32: !!sw });
      read.innerHTML = `The loop reads GPIO33 every 200 ms. It only prints when <code>SW</code> is different from <code>LAST</code>, so each flip gives exactly <strong>one line</strong>. Both LEDs follow the switch.`;
      if (focus) refocusSw(host);
    };
    wireSwitch(el, (k) => { on = !on; step_(k); });
    onName(blocks);
    blocks(); step_();
  }

  function mountT82(el) {
    let on = false, connected = false, list = false, status = "Not Connected", label = "Switch: --", last = -1, count = 0, busy = false, sent = "";
    el.innerHTML = `<div class="sw-blocks"></div>
      <h4 class="sub-h">Add to Your Lesson 3 App</h4>
      <ul class="what"><li>A <strong>Label</strong> named <code>Label_Switch</code>, text <code>Switch: --</code>.</li>
        <li>A <strong>Clock</strong> (Sensors palette), TimerInterval <strong>200</strong> ms.</li>
        <li>On <code>BluetoothClient1</code>, set <strong>DelimiterByte = 10</strong>. That is the line-feed character that <code>println</code> puts at the end of each message, so <code>ReceiveText</code> with −1 reads exactly one message.</li></ul>
      ${ws(AI_RX(), "App Inventor block that receives the switch state")}
      <h4 class="sub-h">Try It: Monitor on a Phone via Bluetooth</h4>
      <div class="sim-grid"><div class="sim-phone">${phoneFrame("Phone app")}</div>
        <div class="sim-side"><figure class="scene-box"><div class="scene-scroll"><div class="bench-host"></div></div></figure>
          <div class="wf-row"><button type="button" class="btn" data-flip>Flip the switch</button></div>
          <div class="esp-in"><h4>Inside the ESP32</h4><pre class="esp-vars" aria-live="polite"></pre></div><p class="pv-read t82-read"></p></div></div>`;
    const host = $(".bench-host", el), screen = $(".ph-screen", el), vars = $(".esp-vars", el), read = $(".t82-read", el);
    const blocks = () => { $(".sw-blocks", el).innerHTML = blocksAndCode(t82Blocks(), t82Code(), "switch_bluetooth.ino", "TUNIOT blocks: monitor the switch on a phone via Bluetooth"); };
    const drawBench = (focus) => { host.innerHTML = bench({ type: "spdt", on, read: on ? 1 : 0, led2: on, led32: on, phone: "t82Path", link: connected }); if (focus) refocusSw(host); };
    const render = () => {
      const lst = list ? `<div class="ai-list" role="dialog" aria-label="Choose a device"><p class="ai-list-h">Choose a device</p><button type="button" class="ai-li" data-pick="esp">${esc(MAC)} ${esc(btName())}</button><button type="button" class="ai-li cancel" data-pick="">Cancel</button></div>` : "";
      screen.innerHTML = `<div class="ai-app"><div class="app-bar ai">Screen1</div><div class="ai-body">
          <div class="ai-title">Switch Monitor</div>
          <div class="ai-row"><button type="button" class="ai-btn blue" data-c="ListPicker_BT">Connect Bluetooth</button><span class="ai-status">${esc(status)}</span></div>
          <div class="ai-switch${/ON$/.test(label) ? " on" : ""}" aria-live="polite">${esc(label)}</div>
          <div class="ai-by">Created by ${esc(who())}</div></div>${lst}</div>`;
    };
    const showVars = () => {
      vars.textContent = `SW = digitalRead(33)   → ${on ? 1 : 0}\nLAST = ${last}   COUNT = ${count}\n${sent ? `Last sent: SerialBT.println("${sent}")` : "Nothing sent yet"}${connected ? "" : "\n(no phone connected: nothing is received)"}`;
    };
    async function send(txt) {
      sent = txt; showVars();
      if (!connected) return;
      busy = true;
      await fly($("svg", host), $("#t82Path", host).getAttribute("d"), txt, 700);
      busy = false;
      label = `Switch: ${txt}`; render();
    }
    // The ESP32's loop, every 200 ms
    every(el, 200, () => {
      const sw = on ? 1 : 0;
      count++;
      if (sw !== last || count >= 10) { last = sw; count = 0; send(sw ? "ON" : "OFF"); }
      showVars();
    });
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || !screen.contains(b)) return;
      if (b.dataset.c === "ListPicker_BT") { list = true; render(); const f = $(".ai-li", screen); if (f) f.focus(); }
      else if (b.dataset.pick !== undefined) {
        list = false;
        if (!b.dataset.pick) { render(); return; }
        status = "Connecting…"; render(); await sleep(800);
        connected = true; status = "BT is now connected"; drawBench(); render();
        read.innerHTML = `Connected. Within 2 s the ESP32's regular update arrives, then flip the switch: the label changes within about half a second.`;
      }
    });
    wireSwitch(el, (k) => { on = !on; drawBench(k); });
    onName(() => { blocks(); render(); });
    blocks(); drawBench(); render(); showVars();
    read.innerHTML = `Tap <strong>Connect Bluetooth</strong> and choose your ESP32, then flip the switch. The ESP32 sends on every change, and again every 2 s so a phone that connects later still gets the state.`;
  }

  function mountT83(el) {
    let on = false, loaded = false, auto = true, loads = 0, pageState = "OFF", url = IP;
    el.innerHTML = `<div class="sw-blocks"></div>
      ${fold("Optional: Show It in an App Inventor App Instead", `<p>Add a path that replies with just <code>ON</code> or <code>OFF</code> as plain text. In the Arduino IDE, put these lines straight after <code>client.flush();</code>:</p>
        ${codeBlock(stateCode, "Add to switch_web.ino")}
        <p>In the app, add a <strong>Web</strong> component (Connectivity), a <strong>Clock</strong> (TimerInterval 1000 ms) and a <code>Label_Switch</code>. The app asks <code>http://${IP}/state</code> every second:</p>
        ${ws(AI_WEB(), "App Inventor blocks that read the switch state over Wi-Fi")}`)}
      <h4 class="sub-h">Try It: Monitor on a Web Page</h4>
      <div class="sim-grid"><div class="sim-phone">${phoneFrame("Phone web browser")}</div>
        <div class="sim-side"><figure class="scene-box"><div class="scene-scroll"><div class="bench-host"></div></div></figure>
          <div class="wf-row"><button type="button" class="btn" data-flip>Flip the switch</button></div>
          ${chips("Auto refresh", [["1", "With the refresh tag"], ["0", "Without it"]], "1")}
          ${serialBox()}<p class="pv-read t83-read"></p></div></div>`;
    const host = $(".bench-host", el), screen = $(".ph-screen", el), read = $(".t83-read", el), so = serialOut($(".serial", el));
    ["Obtained an IP address", IP, who(), MAC].forEach((x) => so.add(x));
    const blocks = () => { $(".sw-blocks", el).innerHTML = blocksAndCode(t83Blocks(), t83Code(), "switch_web.ino", "TUNIOT blocks: monitor the switch on a web page"); };
    const drawBench = (focus) => { host.innerHTML = bench({ type: "spdt", on, read: on ? 1 : 0, led2: on, led32: on }); if (focus) refocusSw(host); };
    screen.innerHTML = `<form class="br-bar ph" data-go><input type="text" inputmode="url" aria-label="Address" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(url)}"><button type="submit" class="go-b">Go</button></form><div class="br-view"></div>`;
    const view = $(".br-view", screen), go = $(".go-b", screen);
    // Only the page area and the Go button change, so typing in the address bar is never interrupted
    const render = (spin) => {
      view.innerHTML = loaded
        ? `<div class="web"><h1>Switch Monitor</h1><h2>Switch: ${pageState}</h2><h2>LEDs: ${pageState}</h2><p class="web-note">Page loaded ${loads} time${loads === 1 ? "" : "s"}</p></div>`
        : `<div class="web blank"><p>Type the ESP32's IP address, then tap Go.</p></div>`;
      go.textContent = spin ? "↻" : "Go";
    };
    const load = () => { loads++; pageState = on ? "ON" : "OFF"; loaded = true; render(true); setTimeout(() => { if (el.isConnected) go.textContent = "Go"; }, 250); };
    every(el, 1000, () => { if (loaded && auto) load(); });
    el.addEventListener("submit", (e) => {
      if (!e.target.matches("[data-go]")) return;
      e.preventDefault();
      url = e.target.querySelector("input").value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
      if (url !== IP) { loaded = false; render(); read.innerHTML = `No device at <code>${esc(url || "(blank)")}</code>. The Serial Monitor shows <strong>${IP}</strong>.`; return; }
      load();
      read.innerHTML = auto ? `The page reloads itself every second, so flip the switch and watch it follow.` : `Without the refresh tag the page only changes when you tap Go again.`;
    });
    wireChips($(".chips-row", el), (v) => {
      auto = v === "1";
      read.innerHTML = auto ? `With <code>&lt;meta http-equiv='refresh' content='1'&gt;</code> the browser asks for the page again every second, so it keeps up with the switch.`
        : `Without the tag the browser shows the page from the last time it loaded it. Flip the switch: the page doesn't change until you tap Go. The ESP32 can't push a change to the browser; the browser has to ask.`;
    });
    wireSwitch(el, (k) => { on = !on; drawBench(k); });
    onName(blocks);
    blocks(); drawBench(); render();
    read.innerHTML = `The ESP32 is already on the Wi-Fi (see the Serial Monitor). Tap <strong>Go</strong> in the phone's browser, then flip the switch.`;
  }

  /* ---------- Lab Task: brief only, with values from the student's matric number ---------- */
  const DEMO_PINS = [33, 25, 26, 27, 14];
  const demoVals = (m) => {
    const d = String(m || "").replace(/\D/g, "");
    if (d.length < 3) return null;
    const d1 = +d[d.length - 1], d2 = +d[d.length - 2], d3 = +d[d.length - 3];
    return { on: ((d1 % 5) + 1) * 200, off: ((d2 % 5) + 2) * 200, pin: DEMO_PINS[d3 % 5], d1, d2, d3 };
  };
  function demoTiming(v) {
    // Expected behaviour: switch ON at 1 s, OFF at 7 s, window 0 to 10 s
    const W = 520, H = 170, l = 92, r = 12, X = (t) => l + (t / 10) * (W - l - r), tOn = 1, tOff = 7;
    const rows = [["Switch", 30], ["Built-in LED", 80], ["GPIO32 LED", 130]];
    const sw = (t) => t >= tOn && t < tOff;
    const ext = (t) => {
      if (t < tOn) return 0;
      if (t < tOff) { const p = (v.on + v.off) / 1000, k = (t - tOn) % p; return k < v.on / 1000 ? 1 : 0; }
      const k = t - tOff; return k < 0.6 && (k % 0.2) < 0.1 ? 1 : 0;
    };
    const intl = (t) => (t >= tOn && t < tOff + 0.6 ? 1 : 0);
    let s = "";
    for (let k = 0; k <= 10; k++) s += `<line class="gl" x1="${X(k)}" x2="${X(k)}" y1="14" y2="${H - 22}"/>` + T(X(k), H - 6, k + (k === 10 ? " s" : ""), "middle", "axis");
    [sw, intl, ext].forEach((f, i) => {
      const y0 = rows[i][1], pts = []; let prev = null;
      for (let j = 0; j <= 2000; j++) { const t = (j / 2000) * 10, y = f(t) ? y0 - 14 : y0 + 6; if (prev !== null && prev !== y) pts.push([X(t), prev]); pts.push([X(t), y]); prev = y; }
      s += T(l - 8, y0 + 2, rows[i][0], "end", "axl") + poly(pts, i ? "trace-a" : "trace-d");
    });
    s += T(X(tOn), 10, "switch ON", "middle", "axis") + T(X(tOff), 10, "switch OFF", "middle", "axis");
    return `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Expected timing: the switch turns on at 1 second and off at 7 seconds. While on, the built-in LED is on and the GPIO32 LED blinks ${v.on} ms on, ${v.off} ms off. After the switch turns off, the GPIO32 LED flashes 3 times quickly, then both LEDs are off.">${s}</svg>`;
  }
  function mountDemo(el) {
    el.innerHTML = `<div class="demo-me"><label for="matric">Your matric number</label><div class="name-row"><input id="matric" type="text" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="e.g. 251234567"></div>
        <div class="demo-vals" aria-live="polite"></div></div>
      <div class="demo-tl"></div>
      <div class="demo-grid">
        <div class="task-card"><h4>Requirements</h4><ol>
          <li>Wire the toggle switch (3-pin) to <strong class="dv-pin">your GPIO</strong>, and keep the LED on GPIO32.</li>
          <li><strong>Switch ON:</strong> the built-in LED turns on, and the GPIO32 LED blinks: on for <strong class="dv-on">T<sub>on</sub></strong>, off for <strong class="dv-off">T<sub>off</sub></strong>, again and again.</li>
          <li><strong>Switch OFF:</strong> the GPIO32 LED flashes <strong>3 times</strong> quickly (100 ms on, 100 ms off), then both LEDs turn off and stay off.</li>
          <li>The Serial Monitor shows <code>Pattern running</code> when the pattern starts and <code>Pattern stopped</code> when it stops: once each time, not over and over.</li>
          <li>It is fine if the LED finishes its current blink before reacting to the switch.</li></ol></div>
        <div class="task-card"><h4>Extension: Choose One</h4>
          <p><strong>A. Bluetooth:</strong> your app shows <code>Pattern: RUNNING</code> or <code>Pattern: STOPPED</code>.</p>
          <p><strong>B. Wi-Fi:</strong> a web page from the ESP32 shows the same, and updates by itself.</p>
          <p class="small-note">Doing both in one program is an extra challenge: the program gets large, and the web server has to answer while the LED is blinking.</p></div>
        <div class="task-card"><h4>At the Demo, Be Ready To</h4><ol>
          <li>show every requirement working on your own board and phone;</li>
          <li>make a change the lecturer asks for on the spot (for example a new blink time or another GPIO), and upload it in a few minutes;</li>
          <li>answer two short questions about your circuit and program.</li></ol></div>
      </div>`;
    const out = $(".demo-vals", el), tl = $(".demo-tl", el), inp = $("#matric", el);
    const paint = () => {
      const v = demoVals(inp.value), show = v || { on: 600, off: 800, pin: 33 };
      out.innerHTML = v
        ? `<div class="dv"><span>T<sub>on</sub></span><strong>${v.on} ms</strong></div><div class="dv"><span>T<sub>off</sub></span><strong>${v.off} ms</strong></div><div class="dv"><span>Switch pin</span><strong>GPIO${v.pin}</strong></div>
           <p class="small-note">From the last three digits (${v.d3}, ${v.d2}, ${v.d1}): T<sub>on</sub> = (${v.d1} mod 5 + 1) × 200 ms, T<sub>off</sub> = (${v.d2} mod 5 + 2) × 200 ms, pin = list [33, 25, 26, 27, 14] at position ${v.d3} mod 5.</p>`
        : `<p class="small-note">Type your matric number to get your own blink times and switch pin. Nothing is saved or sent anywhere. The chart below uses example values until then.</p>`;
      el.querySelector(".dv-pin").textContent = `GPIO${show.pin}`;
      el.querySelector(".dv-on").innerHTML = `${show.on} ms`;
      el.querySelector(".dv-off").innerHTML = `${show.off} ms`;
      tl.innerHTML = `<figure class="scene-box demo-fig"><div class="scene-scroll">${demoTiming(show)}</div><figcaption>What it should look like: the switch is turned ON at 1 s and OFF at 7 s${v ? "" : " (example values)"}.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>`;
    };
    inp.addEventListener("input", paint);
    paint();
  }

  /* =====================================================================
     Sections
     ===================================================================== */
  const W_ = (steps, h = "Working") => `<div class="working"><h4>${h}</h4><ol class="steps">${stepsHtml(steps)}</ol></div>`;

  const sections = [
    { id: "equipment", group: "kit", title: "Equipment and Software", toc: "Equipment",
      intro: `<p>Tick each item as you get it ready. You need a Google account for MIT App Inventor, and the Arduino IDE with ESP32 board support on your laptop.</p>`,
      mount: mountKit,
      after: `<div class="callout info"><strong>Good to know</strong>The ESP32 uses Classic Bluetooth serial in Lessons 2 and 3. Android phones support it, but iPhones don't let apps use it. If you have an iPhone, work with a classmate who has an Android phone for those two lessons. Lesson 4 (Wi-Fi) works on any phone.</div>` },
    { id: "basic", group: "kit", title: "The Basic ESP32 Circuit", toc: "Basic Circuit",
      intro: `<p>Assemble the basic circuit first: the ESP32 on USB, and a 0.47 µF capacitor between its <strong>EN</strong> pin and <strong>GND</strong>. Play the animation to see each step.</p>`,
      mount: mountBasic,
      after: fold("Where to Choose the Board and Port in the Arduino IDE", photo("ide-board-port.png", "Tools → Board and Tools → Port.", "small")) },
    { id: "autoreset", group: "kit", title: "Why the Capacitor Helps", toc: "Why the Capacitor",
      intro: `<p>To upload, the ESP32 must start in <strong>download mode</strong>. It does that when its BOOT pin (GPIO0) is LOW at the moment it starts. The USB chip on the board drives both EN and BOOT; the capacitor makes sure their timing works. Switch between the two cases.</p>`,
      mount: mountAuto,
      after: `<p class="small-note">More on programming modes in <a href="chapter-2.html#rcreset">Chapter 2: Automatic programming mode</a>.</p>` },

    { id: "blink", group: "l1", title: "Build and Upload the Blink Program", toc: "Blink by Cable",
      intro: `<p>In the lab you go to <a href="http://easycoding.tn/esp32/demos/code/" target="_blank" rel="noopener">TUNIOT for ESP32</a>, build the blocks, download the code, open it in the Arduino IDE and upload it. The program switches the built-in LED on and off every 2 seconds:</p>
        <p class="formula">Main loop: LED HIGH → wait 2000 ms → LED LOW → wait 2000 ms</p>
        <p>Build it here, then press <strong>Upload by cable</strong>. The board runs whatever you uploaded, so try other delays too. Also try uploading with no capacitor.</p>`,
      mount: mountBlink,
      after: fold("What TUNIOT Looks Like", `<div class="two-photos">${photo("tuniot-menu.png", "Choose TUNIOT FOR ESP32.")}${photo("tuniot-workspace.png", "The workspace: blocks on the left, Setup and Main loop on the right.")}</div>`) },
    { id: "ota", group: "l1", title: "Upload over the Air (OTA)", toc: "Upload by Wi-Fi",
      intro: `<p>The second way to upload needs no cable: the ESP32 runs a small web server, and you send it the compiled program from a web browser over Wi-Fi. Go through the seven steps. Tap the buttons inside each step.</p>`,
      mount: mountOta,
      after: `<div class="callout info"><strong>Good to know</strong>The program you upload over the air <em>replaces</em> the OTA sketch. After the blink upload the board blinks, but it can't take another OTA upload until you put the OTA sketch back by cable. To keep OTA working, add your own code into the OTA sketch (see <a href="chapter-2.html#ota">Chapter 2: OTA</a>).</div>` },

    { id: "btblocks", group: "l2", title: "The Bluetooth Blocks", toc: "Blocks and Code",
      intro: `<p>Change the Lesson 1 blocks so the ESP32 receives text from the phone by Bluetooth. Include your name in the Bluetooth name, so you can find your own board in the lab (type your name at the top of this page). Then upload as before.</p>`,
      mount: mountBtBlocks },
    { id: "btterm", group: "l2", title: "Try It: A Bluetooth Terminal", toc: "Try It",
      intro: `<p>Install a Bluetooth terminal app on the phone (for example S2 Terminal for Bluetooth). Pair the phone with the ESP32, connect from the app, and send <strong>ON</strong> and <strong>OFF</strong>.</p>`,
      mount: mountBtTerm },

    { id: "aidesign", group: "l3", title: "Design the App Screen", toc: "Design",
      intro: `<p>Go to <a href="https://appinventor.mit.edu/" target="_blank" rel="noopener">MIT App Inventor</a>, click <em>Create Apps!</em>, sign in with your Google account and start a new project (for example <code>BT_LEDControl_YourName</code>). In the Designer, drag in the components below from the palettes, and <strong>rename each one</strong> as shown: the names make the blocks much easier to build. Tap a component to see what it is.</p>`,
      mount: mountAiDesign },
    { id: "aiblocks", group: "l3", title: "The App's Blocks", toc: "Blocks",
      intro: `<p>Switch to the <em>Blocks</em> editor and build these five event blocks. Each one runs when something happens in the app.</p>`,
      mount: mountAiBlocks },
    { id: "aiload", group: "l3", title: "Put the App on Your Phone", toc: "Load the App",
      intro: `<p>The AI Companion runs your app on the phone while you build it. No installing needed.</p>`,
      mount: mountAiLoad },
    { id: "airun", group: "l3", title: "Try It: Your App", toc: "Try It",
      intro: `<p>The ESP32 runs the same Bluetooth program as in Lesson 2. Now your own app sends the text. Each tap shows which block ran.</p>`,
      mount: mountAiRun },

    { id: "wire", group: "l4", title: "Wire the External LED", toc: "Wiring",
      intro: `<p>Add an LED and a resistor to the circuit: <strong>GPIO32 → LED → resistor → GND</strong>. The resistor limits the current. Switch GPIO32 and turn the LED round to see what happens.</p>`,
      mount: mountWire },
    { id: "ledcalc", group: "l4", title: "LED Resistor Calculator", toc: "Resistor",
      intro: `<p>The resistor takes the voltage the LED doesn't use, and sets the current: <span class="formula">R = (V<sub>pin</sub> − V<sub>F</sub>) / I</span></p>
        <p>V<sub>F</sub> is the LED's forward voltage: about 1.8 to 2.2 V for red, 2.0 to 2.4 V for yellow and green, and 2.8 to 3.3 V for blue and white. An indicator LED needs only a few milliamps.</p>`,
      inputs: [
        F("Vpin", "num", 3.3, "GPIO HIGH voltage", { unit: "V", positive: true, label: "V<sub>pin</sub>" }),
        F("Vf", "num", 2.0, "LED forward voltage", { unit: "V", positive: true, label: "V<sub>F</sub>" }),
        F("I", "num", 5, "current you want", { unit: "mA", positive: true, label: "I" }),
        F("Rfit", "R", null, "the resistor you have", { opt: true, label: "R<sub>fitted</sub>" })
      ],
      view: "0 0 470 150", figLabel: "Circuit: GPIO32, LED, resistor, ground",
      caption: "GPIO32 drives the LED through the resistor. The labels update as you change the values.",
      diagram: (Tl, lab, v, res) => {
        let s = D.term(40, 60) + D.text(40, 40, "GPIO32") + D.wire([44, 60], [150, 60]);
        s += `<path class="w" d="M150,60h10M160,46v28l24,-14z M184,46v28M184,60h56"/><path class="w thin" d="M170,40l8,-8m-3,0h3v3M180,44l8,-8m-3,0h3v3"/>`;
        s += D.res(240, 60, 320, 60) + D.wire([320, 60], [390, 60], [390, 96]) + D.gnd(390, 96);
        s += Tl(40, 100, "Vpin", "middle") + Tl(172, 100, "Vf") + D.text(280, 40, `R = <tspan class="val">${res ? eng(res.Rstd, "Ω") : "?"}</tspan>`);
        s += D.text(280, 100, `I = <tspan class="val">${res && isFinite(res.Iact) ? eng(res.Iact, "A") : "?"}</tspan>`);
        return s;
      },
      compute: (v) => {
        const VR = v.Vpin - v.Vf, Ia = v.I / 1000;
        if (VR <= 0) {
          return { sum: "The LED won't light: its forward voltage is not below the pin voltage.", Rstd: NaN, Iact: NaN,
            steps: [step("Voltage left for the resistor", `V<sub>R</sub> = V<sub>pin</sub> − V<sub>F</sub>`, `${num(v.Vpin)} − ${num(v.Vf)}`, `V<sub>R</sub> = ${num(VR)} V`)],
            notes: [{ type: "warn", title: "Not enough voltage", html: "The LED needs at least its forward voltage to conduct. A blue or white LED can be very dim, or not light at all, on a 3.3 V pin." }] };
        }
        const R = VR / Ia, Rstd = nextE12(R), Iact = VR / Rstd, P = Iact * Iact * Rstd;
        const steps = [
          step("Voltage across the resistor", `V<sub>R</sub> = V<sub>pin</sub> − V<sub>F</sub>`, `${num(v.Vpin)} V − ${num(v.Vf)} V`, `V<sub>R</sub> = ${num(VR)} V`),
          step("Resistance for the current you want", `R = V<sub>R</sub> / I`, `${num(VR)} V / ${num(Ia)} A`, `R = ${eng(R, "Ω")}`),
          step("Choose the next standard (E12) value up", "", "", `R = ${eng(Rstd, "Ω")}`),
          step("Current with the standard resistor", `I = V<sub>R</sub> / R`, `${num(VR)} V / ${eng(Rstd, "Ω")}`, `I = ${eng(Iact, "A")}`)
        ];
        if (v.Rfit) steps.push(step("Current with the resistor you have", `I = V<sub>R</sub> / R<sub>fitted</sub>`, `${num(VR)} V / ${eng(v.Rfit, "Ω")}`, `I = ${eng(VR / v.Rfit, "A")}`));
        steps.push(step("Power in the resistor", `P = I<sup>2</sup>R`, `(${eng(Iact, "A")})<sup>2</sup> × ${eng(Rstd, "Ω")}`, `P = ${eng(P, "W")}`));
        const notes = [];
        const Imax = Math.max(Iact, v.Rfit ? VR / v.Rfit : 0);
        if (Imax > 0.02) notes.push({ type: "warn", title: "Too much current for one pin", html: `${eng(Imax, "A")} is more than the ESP32 should give from one GPIO pin (keep it below about 20 mA). Use a bigger resistor.` });
        if (v.Vf >= 2.7) notes.push({ type: "info", title: "Blue and white LEDs", html: "Only a little voltage is left for the resistor, so small changes in V<sub>F</sub> change the current a lot. Expect a dimmer LED on 3.3 V." });
        return { sum: `Use ${eng(Rstd, "Ω")} (the exact value is ${eng(R, "Ω")}). The LED current is then ${eng(Iact, "A")}.`, steps, notes, Rstd, Iact };
      } },
    { id: "wifiblocks", group: "l4", title: "The Wi-Fi Web Server Blocks", toc: "Blocks and Code",
      intro: `<p>These blocks join the Wi-Fi, print your name, the ESP32's MAC address and its IP address, and serve a web page that switches the LED on GPIO32 (D32). Put your own network name and password in the <em>Connect Network</em> block.</p>`,
      mount: mountWifiBlocks },
    { id: "wifirun", group: "l4", title: "Try It: Control the LED from a Browser", toc: "Try It",
      intro: `<p>Upload the code and open the Serial Monitor to get the IP address. Then type it into a browser on your phone (on the same Wi-Fi network) and use the buttons.</p>`,
      mount: mountWifiRun },

    { id: "swwire", group: "l5", title: "Read the Switch Condition", toc: "Read the Switch",
      intro: `<p>Start from the Lesson 4 circuit (LED on GPIO32) and add a toggle switch on <strong>GPIO33</strong>. The ESP32 reads its condition as 1 or 0.</p>
        <ul class="what"><li><strong>3-pin switch (use this):</strong> middle pin to GPIO33, one outer pin to 3V3, the other outer pin to GND. GPIO33 is always joined to 3.3 V or to 0 V, so no resistor is needed. ON reads 1.</li>
        <li><strong>2-pin switch:</strong> one pin to GPIO33, the other to GND, and a 10 kΩ resistor from GPIO33 to 3V3. Here ON reads 0.</li></ul>
        <p>You need 3 more male-female jumper wires. Try all three wirings below, including what happens with no resistor.</p>`,
      mount: mountSwWire,
      after: `<div class="callout info"><strong>Good to know: choosing an input pin</strong>GPIO33 is a safe choice. Avoid GPIO2 (the built-in LED), GPIO0, 5, 12 and 15 (they decide how the ESP32 starts), TX0 and RX0 (used for uploading) and GPIO32 (the LED). GPIO34 to 39 work as inputs, but they have no internal pull-up or pull-down resistors.</div>` },
    { id: "t81", group: "l5", title: "On the Serial Monitor", toc: "Serial Monitor",
      intro: `<p>The ESP32 checks the switch every 200 ms, makes both LEDs follow it, and reports each change on the Serial Monitor.</p>
        <ol class="what"><li>In TUNIOT, read GPIO33 every 200 ms. When the switch is ON, turn on the built-in LED (GPIO2) and the external LED (GPIO32). When it is OFF, turn both off.</li>
        <li>Print <code>Switch ON</code> or <code>Switch OFF</code> on the Serial Monitor (115200 baud), <strong>only when the condition changes</strong>.</li></ol>
        <p><strong>Check:</strong> flip the switch 5 times. Both LEDs follow it, and the Serial Monitor shows exactly one line per flip.</p>`,
      mount: mountT81 },
    { id: "t82", group: "l5", title: "On a Phone via Bluetooth", toc: "Phone via Bluetooth",
      intro: `<p>The ESP32 sends the switch condition to your phone, and your App Inventor app displays it.</p>
        <ol class="what"><li>Use the Bluetooth name <code>ESP32_YourName</code>. Send <code>ON</code> or <code>OFF</code> (print on new line) when the switch changes, and again every 2 s, so the app catches up after it connects. The LEDs still follow the switch.</li>
        <li>In MIT App Inventor, add a label, a Clock and the receiving block below to your Lesson 3 app.</li></ol>
        <p><strong>Check:</strong> the app shows the new condition within 1 s of flipping the switch. (Android phone needed, as in Lessons 2 and 3.)</p>`,
      mount: mountT82 },
    { id: "t83", group: "l5", title: "On a Web Page", toc: "Web Page",
      intro: `<p>The ESP32's web server from Lesson 4 now reports the switch condition, and the page keeps itself up to date.</p>
        <ol class="what"><li>Change the Lesson 4 web server so the page shows <code>Switch: ON/OFF</code> and <code>LEDs: ON/OFF</code>. The LEDs still follow the switch.</li>
        <li>Add <code>&lt;meta http-equiv='refresh' content='1'&gt;</code> in the page's Head, so the browser reloads the page every second.</li></ol>
        <p><strong>Check:</strong> the page updates within 2 s of flipping the switch.</p>`,
      mount: mountT83,
      after: `<div class="callout info"><strong>Good to know</strong>Read the switch <em>before</em> the <em>Wait Connection</em> block. That block leaves the loop early when no browser is asking, so anything after it only runs when the page is loaded.</div>` },
    { id: "demo", group: "task", title: "Your Own Blink Pattern", toc: "Your Own Blink Pattern",
      intro: `<p>Build this <strong>on your own</strong> and demonstrate it in the lab. It uses what you learnt in Lessons 1 to 5, but there is no worked solution here. Your blink times and switch pin come from your matric number, so everyone's program is a little different.</p>
        <p class="small-note">Plan first: write the steps as a short flowchart before you build the blocks.</p>`,
      mount: mountDemo }
  ];

  /* =====================================================================
     Pre-Lab Check quiz and the Lab 1 Review exercises
     ===================================================================== */
  const BANK = [
    { q: "Which GPIO drives the ESP32's built-in blue LED?", opts: ["GPIO2", "GPIO32", "GPIO0", "GPIO23"], a: 0, why: "The built-in LED is on GPIO2. The TUNIOT <em>Integrated LED Stat</em> block writes to GPIO2." },
    { q: "Where does the 0.47 µF capacitor go?", opts: ["Between EN and GND", "Between 3V3 and GND", "In series with the LED", "Between GPIO2 and GND"], a: 0, why: "Between EN (reset) and GND. It slows EN down so the board enters programming mode by itself when you upload." },
    { q: "What must be true for an OTA (over-the-air) upload?", opts: ["The laptop and the ESP32 are on the same Wi-Fi network", "The USB cable stays plugged in", "The phone is paired by Bluetooth", "BOOT is held down"], a: 0, why: "The browser talks to the ESP32's web server through the Wi-Fi network, so both must be on it." },
    { q: "Which file do you upload on the OTA web page?", opts: ["The .bin compiled binary", "The .ino sketch", "The .aia App Inventor project", "A .txt file of the code"], a: 0, why: "The page takes the compiled program, made with <em>Sketch → Export Compiled Binary</em>." },
    { q: "You send \"on\" (small letters) from the Bluetooth terminal. What happens?", opts: ["Nothing: \"on\" is not equal to \"ON\"", "The LED turns on", "The LED turns off", "The ESP32 restarts"], a: 0, why: "String comparison is case-sensitive, so <code>\"on\" == \"ON\"</code> is false." },
    { q: "In App Inventor, which component does the Bluetooth work?", opts: ["BluetoothClient (non-visible)", "ListPicker", "Label", "HorizontalArrangement"], a: 0, why: "BluetoothClient lists the paired devices, connects and sends text. It doesn't appear on the screen." },
    { q: "What does the ListPicker show when you tap it?", opts: ["The paired Bluetooth devices", "The Wi-Fi networks nearby", "The LED's state", "The ESP32's IP address"], a: 0, why: "Its BeforePicking block sets its Elements to <code>BluetoothClient1.AddressesAndNames</code>." },
    { q: "In Lesson 4, how do you find the address to type into the browser?", opts: ["Read the IP address on the Serial Monitor", "It's printed on the ESP32 board", "Use the Bluetooth name", "It's always 192.168.4.1"], a: 0, why: "The router gives the ESP32 an IP address when it joins, and the program prints it on the Serial Monitor." },
    { q: "Which way round does the external LED go?", opts: ["Long leg (anode) to GPIO32, short leg towards GND", "Long leg to GND", "Either way works", "Both legs to GPIO32"], a: 0, why: "Current flows from anode (long leg) to cathode (short leg). Reversed, it stays off." },
    { q: "A 2-pin switch is wired from GPIO33 to GND with no resistor. With the switch OFF, what does GPIO33 read?", opts: ["0 and 1 at random (a floating input)", "Always 1", "Always 0", "The ESP32 resets"], a: 0, why: "Nothing sets the voltage on an open input, so it picks up noise. A pull-up resistor or a 3-pin switch fixes it." },
    { q: "Your switch web page only changes when you reload it. What makes it update by itself?", opts: ["A refresh tag in the page head", "A faster delay in the loop", "A bigger resistor", "Pairing by Bluetooth"], a: 0, why: "The ESP32 can't push a change to the browser. <code>&lt;meta http-equiv='refresh' content='1'&gt;</code> makes the browser ask again every second." },
    { q: "The Serial Monitor shows random symbols. What do you check first?", opts: ["The baud rate matches Serial.begin() (115200)", "The LED's direction", "The Bluetooth name", "The capacitor's value"], a: 0, why: "Both sides of a serial link must use the same baud rate, or the characters come out garbled." },
    { q: "Why does the Bluetooth example send the switch condition again every 2 s, not only when it changes?", opts: ["So a phone that connects later still gets the condition", "To save battery", "Bluetooth disconnects if nothing is sent", "To make the LED blink"], a: 0, why: "If the phone connects after the last change, it would wait forever. A regular update every 2 s fixes that." },
    { q: "In App Inventor, why set BluetoothClient1's DelimiterByte to 10?", opts: ["So ReceiveText with −1 reads exactly one line, up to the line feed", "To send 10 bytes at a time", "To connect 10 times faster", "To limit messages to 10 characters"], a: 0, why: "println ends each message with a line feed (byte 10). With DelimiterByte 10, ReceiveText(−1) reads up to it: one message at a time." },
    { q: "Which pin is a safe choice for the switch input?", opts: ["GPIO33", "GPIO2", "GPIO0", "TX0"], a: 0, why: "GPIO2 is the built-in LED and a boot pin, GPIO0 decides the boot mode, and TX0 is used for uploading. GPIO33 is free." },
    { q: "Why should the Serial Monitor example print only when the switch changes?", opts: ["Otherwise it prints every 200 ms and floods the screen", "Printing is slow", "The ESP32 can only print 10 lines", "The switch stops working"], a: 0, why: "The loop runs every 200 ms. Printing only on a change gives one clear line per flip." }
  ];

  /* ---------- Pre-Lab Check quiz: unlocks the Lab Task at 7/10 ----------
     One question at a time (arrows, dots, swipe). A random 10 from the bank, options shuffled.
     Picking an answer moves on to the next unanswered question. No marks until all 10 are submitted.
     The first attempt is the score. Wrong answers can then be re-answered until right (to learn),
     and a new random set is offered once they are all corrected. A pass is remembered on this device. */
  const PASS_KEY = "nmk-lab1-prelab", PASS_MARK = 7, NQ = 10;
  const GATE_LOCKED = $("#gateNote") ? $("#gateNote").innerHTML : "";
  function setLock(pass) {
    const lock = $("#taskLock"), list = $("#taskList"), nav = $("#taskNav"), note = $("#gateNote");
    if (lock) lock.hidden = !!pass;
    if (list) list.hidden = !pass;
    if (nav) {
      nav.querySelector(".sb-k").hidden = !!pass;
      nav.title = pass ? "Lab Task" : "Lab Task (locked)";
    }
    if (note) {
      note.classList.toggle("ok", !!pass);
      note.innerHTML = pass ? `<span aria-hidden="true">✓</span> <span>You passed the Pre-Lab Check (${pass.score} out of ${NQ}). The <a href="#labtask">Lab Task</a> is unlocked.</span>` : GATE_LOCKED;
    }
  }
  function mountPrelab(host) {
    let set = [], picks = [], tried = [], fixed = [], state = "answer", score = 0, cur = 0, timer = 0, dir = 0;
    const shuffle = Lab.shuffle;
    const answered = () => picks.filter((x) => x !== null).length;
    const isRight = (i) => picks[i] === 0 || fixed[i];
    const wrongLeft = () => set.filter((_, i) => !isRight(i)).length;
    const start = (focus) => {
      set = shuffle(BANK).slice(0, NQ).map((q) => ({ q, order: shuffle(q.opts.map((_, k) => k)) }));
      picks = Array(NQ).fill(null); tried = set.map(() => []); fixed = Array(NQ).fill(false);
      state = "answer"; score = 0; cur = 0; dir = 0;
      draw();
      if (focus) focusCard();
    };
    const focusCard = () => { const l = host.querySelector(".pq-card legend"); if (l) l.focus({ preventScroll: true }); };
    const go = (i, focus = true) => { clearTimeout(timer); dir = Math.sign(i - cur); cur = clamp(i, 0, NQ - 1); draw(); if (focus) focusCard(); };

    // In each bank question the right answer is option 0; the order on screen is shuffled.
    const card = (i) => {
      const it = set[i], firstOk = state === "review" && picks[i] === 0, done = state === "review" && isRight(i);
      const cls = state === "answer" ? "" : firstOk ? " ok" : fixed[i] ? " ok late" : " no";
      const fb = state === "answer" ? "" : firstOk ? `<strong>✓ Correct.</strong> ${it.q.why}` : fixed[i] ? `<strong>✓ Correct now.</strong> ${it.q.why}` : `<strong>✗ Not right.</strong> Choose another answer.`;
      const opts = it.order.map((k) => {
        const bad = state === "review" && tried[i].includes(k), right = done && k === 0, chosen = state === "answer" ? picks[i] === k : right;
        return `<label class="pq-opt${bad ? " bad" : ""}${right ? " right" : ""}"><input type="radio" name="pq-${i}" value="${k}"${chosen ? " checked" : ""}${state === "review" && (done || bad) ? " disabled" : ""}><span>${it.q.opts[k]}</span></label>`;
      }).join("");
      return `<div class="pq-card${cls}${dir ? (dir > 0 ? " in-r" : " in-l") : ""}"><fieldset><legend tabindex="-1"><span class="pq-n">Question ${i + 1} of ${NQ}</span>${it.q.q}</legend>
        <div class="pq-opts">${opts}</div><p class="pq-fb" aria-live="polite">${fb}</p></fieldset></div>`;
    };
    const dots = () => set.map((_, i) => {
      const st = state === "answer" ? (picks[i] !== null ? "done" : "") : isRight(i) ? (picks[i] === 0 ? "ok" : "ok late") : "no";
      const lab = state === "answer" ? (picks[i] !== null ? "answered" : "not answered") : picks[i] === 0 ? "right" : fixed[i] ? "corrected" : "wrong";
      return `<button type="button" class="pq-dot ${st}${i === cur ? " on" : ""}" data-i="${i}" aria-label="Question ${i + 1}, ${lab}"${i === cur ? ' aria-current="true"' : ""}></button>`;
    }).join("");
    const resultHtml = () => {
      const left = wrongLeft();
      return score >= PASS_MARK
        ? `<div class="pq-res pass"><p><strong>✓ You scored ${score} out of ${NQ}: passed!</strong> The Lab Task is now unlocked.</p><a class="btn" href="#labtask">Go to the Lab Task</a>${score < NQ ? `<p class="small-note">The red dots are the ones you got wrong. Correct them, to learn from them.</p>` : ""}</div>`
        : `<div class="pq-res fail"><p><strong>You scored ${score} out of ${NQ}. You need at least ${PASS_MARK}.</strong></p><p>${left ? `Correct the ${left} wrong answer${left > 1 ? "s" : ""} first (the red dots). Then you can start a new quiz.` : "All corrected. Start a new quiz when you're ready: it has a new random set of questions."}</p>
           <button type="button" class="btn" data-new${left ? " disabled" : ""}>Start a new quiz</button></div>`;
    };
    const draw = () => {
      const saved = store.get(PASS_KEY, null), fresh = state === "answer" && !answered();
      const nextWrong = state === "review" ? set.findIndex((_, i) => i > cur && !isRight(i)) : -1;
      host.innerHTML = `<div class="pq">
        ${saved && fresh ? `<div class="pq-res pass"><p><strong>✓ You passed the Pre-Lab Check on this device (${saved.score} out of ${NQ}).</strong> The Lab Task is unlocked. You can take the quiz again for practice.</p></div>` : ""}
        <div class="pq-result" tabindex="-1">${state === "review" ? resultHtml() : ""}</div>
        <div class="pq-head"><span>Pass mark: <strong>${PASS_MARK} out of ${NQ}</strong></span><span class="pq-count">${state === "answer" ? `${answered()} of ${NQ} answered` : `Score: ${score} out of ${NQ}`}</span></div>
        <div class="ex-nav pq-nav"><button type="button" class="ex-arrow" data-d="-1" aria-label="Previous question"${cur === 0 ? " disabled" : ""}>‹</button>
          <span class="ex-count">Question ${cur + 1} of ${NQ}</span>
          <button type="button" class="ex-arrow" data-d="1" aria-label="Next question"${cur === NQ - 1 ? " disabled" : ""}>›</button>
          <div class="ex-dots pq-dots">${dots()}</div></div>
        <div class="pq-stage">${card(cur)}</div>
        ${state === "answer"
          ? `<div class="pq-foot"><button type="button" class="btn" data-submit${answered() < NQ ? " disabled" : ""}>Submit answers</button><span class="small-note">${answered() < NQ ? `Answer all ${NQ} questions to submit. Marks appear after you submit.` : "All answered. Check any answer with the dots, then submit."}</span></div>`
          : nextWrong >= 0 && isRight(cur) ? `<div class="pq-foot"><button type="button" class="btn ghost" data-i="${nextWrong}">Next question to correct ›</button></div>` : ""}
      </div>`;
    };
    host.addEventListener("change", (e) => {
      const r = e.target.closest('input[type="radio"]');
      if (!r) return;
      const i = +r.name.slice(3), k = +r.value;
      if (state === "answer") {
        picks[i] = k;
        draw();
        // move on to the next unanswered question (after a short pause, so the choice is seen)
        let nxt = -1;
        for (let s = 1; s <= NQ; s++) { const j = (i + s) % NQ; if (picks[j] === null) { nxt = j; break; } }
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (nxt >= 0) go(nxt);
          else { const b = host.querySelector("[data-submit]"); if (b) b.focus(); }
        }, Lab.reduceMotion ? 0 : 450);
        return;
      }
      if (k === 0) fixed[i] = true; else tried[i].push(k);
      dir = 0; draw();
      const back = host.querySelector(".pq-card input:not([disabled])") || host.querySelector(".pq-card legend");
      if (back) back.focus({ preventScroll: true });
    });
    host.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.d) go(cur + +b.dataset.d);
      else if (b.dataset.i !== undefined) go(+b.dataset.i);
      else if (b.hasAttribute("data-submit")) {
        clearTimeout(timer);
        score = picks.filter((k) => k === 0).length;
        set.forEach((_, i) => { if (picks[i] !== 0) tried[i].push(picks[i]); });
        state = "review";
        const firstWrong = set.findIndex((_, i) => picks[i] !== 0);
        cur = firstWrong >= 0 ? firstWrong : 0; dir = 0;
        if (score >= PASS_MARK) {
          const old = store.get(PASS_KEY, null);
          if (!old || old.score < score) store.set(PASS_KEY, { score, date: new Date().toISOString().slice(0, 10) });
          setLock(store.get(PASS_KEY, null) || { score });
        }
        draw();
        const r = host.querySelector(".pq-result");
        r.scrollIntoView({ behavior: Lab.reduceMotion ? "auto" : "smooth", block: "start" });
        r.focus({ preventScroll: true });
      } else if (b.hasAttribute("data-new")) {
        start(true);
      }
    });
    // Swipe left or right on the question card (phones)
    let sx = null, sy = 0;
    host.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" && e.target.closest(".pq-stage")) { sx = e.clientX; sy = e.clientY; } });
    host.addEventListener("pointerup", (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
    });
    host.addEventListener("keydown", (e) => {
      if (e.target.matches('input[type="radio"]')) return; // arrow keys move between options
      if (e.key === "ArrowRight" && e.target.closest(".pq-nav")) go(cur + 1);
      if (e.key === "ArrowLeft" && e.target.closest(".pq-nav")) go(cur - 1);
    });
    start();
  }

  // Step bar: on phones, the name of the current part shows under the numbers
  function stepCaption() {
    const cap = $(".sb-cap");
    if (!cap) return;
    let last = null;
    const paint = () => {
      const a = $(".lab-nav a[aria-current]");
      const t = a ? a.querySelector(".sb-l").textContent : "Before You Start";
      if (t !== last) { cap.textContent = t; last = t; }
    };
    let tick = false;
    addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; paint(); }); } }, { passive: true });
    paint();
  }


  const exercises = [
    { id: "l1-q1", title: "Exercise 1: Blink Timing",
      q: `<p>Your blocks switch the built-in LED on, wait 2000 ms, switch it off, wait 2000 ms, and repeat. Find the period of one blink, its frequency, and the duty cycle (the percentage of time the LED is on).</p>`,
      ans: [{ l: "Period T", u: "s", v: 4 }, { l: "Frequency f", u: "Hz", v: 0.25 }, { l: "Duty cycle", u: "%", v: 50 }],
      hints: ["One period is one full on-and-off cycle: add up all the delays in the main loop, then change milliseconds to seconds.",
        "Frequency is the number of periods in one second, f = 1 / T. Duty cycle = on time ÷ period × 100%."],
      working: () => W_([
        step("Period: add the delays", "T = t<sub>on</sub> + t<sub>off</sub>", "2000 ms + 2000 ms", "T = 4000 ms = <strong>4 s</strong>"),
        step("Frequency", "f = 1 / T", "1 / 4 s", "f = <strong>0.25 Hz</strong>"),
        step("Duty cycle", "D = t<sub>on</sub> / T × 100%", "2 s / 4 s × 100%", "D = <strong>50%</strong>")]) },
    { id: "l1-q2", title: "Exercise 2: The LED Resistor",
      q: `<p>A GPIO pin gives 3.3 V when HIGH. A red LED has a forward voltage of 2.0 V and should carry 5 mA.</p><p>(a) What resistance gives exactly 5 mA? (b) The next standard value up is 270 Ω. What current flows with 270 Ω, in mA?</p>`,
      ans: [{ l: "(a) R", u: "Ω", v: 260 }, { l: "(b) I", u: "mA", v: 4.815 }],
      hints: ["The resistor takes the voltage the LED doesn't: V<sub>R</sub> = V<sub>pin</sub> − V<sub>F</sub>.",
        "Use Ohm's law R = V<sub>R</sub> / I with I in amperes (5 mA = 0.005 A). For (b) turn it round: I = V<sub>R</sub> / R."],
      sec: "ledcalc", runs: [{ vals: { Vpin: 3.3, Vf: 2, I: 5, Rfit: 270 } }] },
    { id: "l1-q3", title: "Exercise 3: Reading the Web Request",
      q: `<p>You tap ON on the ESP32's web page. The first line of the request is:</p><p><code>GET /LED=ON HTTP/1.1</code></p><p>Counting the first character as position 0, what do these return, and does the LED turn on? (The program switches it when the result is greater than 0.)</p>`,
      ans: [{ l: 'ClientRequest.indexOf("LED=ON")', v: 5, tol: 0.01 }, { l: 'ClientRequest.indexOf("LED=OFF")', v: -1, tol: 0.01 }, { l: "Does the LED turn on?", opts: ["Yes", "No"], v: 0 }],
      hints: ["indexOf gives the position where the text starts, counting from 0. Count G, E, T, the space and the / first.",
        "If the text isn't there at all, indexOf returns −1."],
      working: () => W_([
        step("Find LED=ON", "", "G(0) E(1) T(2) space(3) /(4) L(5)", "indexOf(\"LED=ON\") = <strong>5</strong>"),
        step("Look for LED=OFF", "", "The request has LED=ON, not LED=OFF", "indexOf(\"LED=OFF\") = <strong>−1</strong> (not found)"),
        step("Decide", "if (indexOf(\"LED=ON\") > 0)", "5 > 0 is true", "digitalWrite(32, HIGH): <strong>yes</strong>, the LED turns on")]) },
    { id: "l1-q4", title: "Exercise 4: The Line Ending",
      q: `<p>The Bluetooth terminal app is set to add CR+LF (carriage return and line feed, one character each) to every message. You type <code>ON</code> and send it to the Lesson 2 program.</p>`,
      ans: [{ l: "Characters the ESP32 receives", v: 4, tol: 0.01 }, { l: 'Is LED == "ON" true?', opts: ["Yes", "No"], v: 1 }, { l: "Line-ending setting that works", opts: ["None", "CR", "LF", "CR+LF"], v: 0 }],
      hints: ["Count the letters you typed, then add the characters the app puts on the end.",
        "== compares the whole text, character by character, including the hidden ones at the end."],
      working: () => W_([
        step("What is sent", "", "O, N, then CR (\\r) and LF (\\n)", "<code>\"ON\\r\\n\"</code>: <strong>4</strong> characters"),
        step("Compare", "LED == \"ON\"", "\"ON\\r\\n\" has 4 characters, \"ON\" has 2", "Not equal: <strong>No</strong>, the LED doesn't change"),
        step("Fix", "", "Send nothing after the text", "Set the line ending to <strong>None</strong>")]) }
  ];

  mountName();
  Lab.page({
    lab: 1,
    collapseWorking: true,
    sections,
    groups: [
      { key: "kit", list: "#kitList", toc: "#kitToc" },
      { key: "l1", list: "#l1List", toc: "#l1Toc" },
      { key: "l2", list: "#l2List", toc: "#l2Toc" },
      { key: "l3", list: "#l3List", toc: "#l3Toc" },
      { key: "l4", list: "#l4List", toc: "#l4Toc" },
      { key: "l5", list: "#l5List", toc: "#l5Toc" },
      { key: "task", list: "#taskList" }
    ],
    exercises, exList: "#exList", exerciseCarousel: true
  });
  mountPrelab($("#quizBox"));
  setLock(store.get(PASS_KEY, null));
  stepCaption();
  // A link straight to the locked task lands on the lock notice instead
  if (!store.get(PASS_KEY, null) && /^#demo/.test(location.hash)) setTimeout(() => $("#labtask").scrollIntoView(), 0);
})();
