/* NMK42003 Lab 3: Smart Sensors, virtual lab.
   An RFID RC522 reader on the SPI bus and a 16 × 4 LCD on the I2C bus. The page simulates reading a card
   with a phone, wiring and reading the RC522, the LCD (TUNIOT blocks), merging the two programs into an
   RFID display, and a rehearsal bench for the Lab Task (a security system). Then a printable plan.
   Shared lab pieces (board, blocks, phone, quiz gate) are in labkit.js; the page engine is in lab.js. */
(function () {
  "use strict";

  const { esc, step, reduceMotion, store, chips, wireChips, codeBlock, fold, player } = Lab;
  const { $, T, sleep, clamp, every, W_, pinXY, board, serialBox, phoneFrame, bf, bs, bn, bk, ws, HEAD } = LabKit;

  const f1 = (x) => x.toFixed(1);
  const row = (label) => `[aria-label="${label}"]`;
  const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, "0");

  // The name (shared with the other labs): it goes on the LCD.
  const ME = LabKit.nameBox({
    key: "nmk-lab1-name", label: "Your name or group name",
    out: (a) => `On the LCD: <strong>${esc(a.who().toUpperCase().slice(0, 6))}</strong> <span class="hint">(the first 6 letters fit beside "Card UID:")</span>`
  });
  const who = ME.who, lcdName = () => who().toUpperCase().slice(0, 6);

  /* =====================================================================
     The virtual cards. Each device gets its own serial numbers (UIDs), as every real card has its own.
     The white card and the key fob are MIFARE Classic 1K (4-byte UID); the sticker is an NTAG213
     (7-byte UID), which the RC522 library reports as a MIFARE Ultralight type.
     ===================================================================== */
  const CARDS = (() => {
    let c = store.get("nmk-lab3-cards", null);
    const ok = (a, n) => Array.isArray(a) && a.length === n && a.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
    if (!c || !ok(c.card, 4) || !ok(c.fob, 4) || !ok(c.tag, 7)) {
      const rnd = (n) => Array.from({ length: n }, () => 16 + Math.floor(Math.random() * 240));
      c = { card: rnd(4), fob: rnd(4), tag: [4].concat(rnd(6)) };
      store.set("nmk-lab3-cards", c);
    }
    return c;
  })();
  const TAGS = [
    { k: "card", name: "White card", nfc: "NXP MIFARE Classic 1k", picc: "MIFARE 1KB", valid: true, atqa: "0x0004", sak: "0x08", mem: "1 kB: 16 sectors of 4 blocks" },
    { k: "fob", name: "Blue key fob", nfc: "NXP MIFARE Classic 1k", picc: "MIFARE 1KB", valid: true, atqa: "0x0004", sak: "0x08", mem: "1 kB: 16 sectors of 4 blocks" },
    { k: "tag", name: "Round sticker", nfc: "NXP NTAG213", picc: "MIFARE Ultralight or Ultralight C", valid: false, atqa: "0x0044", sak: "0x00", mem: "144 bytes" }
  ];
  const tagOf = (k) => TAGS.find((t) => t.k === k);
  const uid = (k, sep = " ") => CARDS[k].map(hex2).join(sep);
  const SEEN_KEY = "nmk-lab3-seen";
  let SEEN = store.get(SEEN_KEY, {}) || {};
  const seenListeners = [];
  const saw = (k, by) => { if (SEEN[k + by]) return; SEEN[k + by] = 1; store.set(SEEN_KEY, SEEN); seenListeners.forEach((f) => f()); };

  /* =====================================================================
     Drawings: the 16 × 4 LCD, the RC522 module and the cards
     ===================================================================== */
  // rows: up to 4 strings; anything past column 16 is lost, as on the real display.
  // o: { light (backlight), contrast 0 to 1, off (no text: wrong address or not started) }
  function lcdSvg(rows, o = {}) {
    const c = o.contrast === undefined ? 0.6 : o.contrast, light = o.light !== false;
    const txt = o.off ? 0 : clamp((c - 0.2) / 0.3, 0, 1), blk = clamp((c - 0.75) / 0.2, 0, 1) * 0.85;
    let s = `<rect class="lcd-pcb" x="0" y="0" width="372" height="162" rx="6"/><rect class="lcd-bz" x="12" y="14" width="348" height="134" rx="5"/>` +
      `<rect class="lcd-scr${light ? " on" : ""}" x="22" y="22" width="328" height="118" rx="3"/>`;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 16; k++) {
      const x = 26 + k * 20, y = 26 + r * 28, ch = ((rows[r] || "")[k] || " ");
      s += `<rect class="lcd-cell" x="${x}" y="${y}" width="18" height="26" opacity="${(0.1 + blk).toFixed(2)}"/>`;
      if (ch !== " " && txt > 0) s += `<text class="lcd-ch" x="${x + 9}" y="${y + 20}" text-anchor="middle" opacity="${txt.toFixed(2)}">${esc(ch)}</text>`;
    }
    const said = o.off || txt === 0 ? "nothing readable" : rows.filter((r) => r && r.trim()).map((r) => r.slice(0, 16).trim()).join("; ") || "nothing";
    return `<svg class="lcd16" viewBox="0 0 372 162" role="img" aria-label="16 by 4 LCD showing: ${esc(said)}">${s}</svg>`;
  }

  // The RC522 board: antenna coil on the left, its 8-pin header down the right edge.
  const RC_PINS = ["SDA", "SCK", "MOSI", "MISO", "IRQ", "GND", "RST", "3.3V"];
  const rcPin = (x, y, name) => [x + 156, y + 22 + RC_PINS.indexOf(name) * 22];
  function rc522G(x, y, o = {}) {
    let s = `<g class="rc${o.dead ? " dead" : ""}"><rect class="rc-pcb" x="${x}" y="${y}" width="164" height="198" rx="8"/>`;
    for (let i = 0; i < 4; i++) s += `<rect class="rc-coil" x="${x + 12 + i * 9}" y="${y + 40 + i * 9}" width="${104 - i * 18}" height="${118 - i * 18}" rx="${10 - i * 2}"/>`;
    s += `<rect class="rc-chip" x="${x + 50}" y="${y + 12}" width="26" height="20" rx="2"/>` + T(x + 64, y + 186, "RFID-RC522", "middle", "rc-t") +
      `<circle class="rc-led${o.power ? " on" : ""}" cx="${x + 92}" cy="${y + 22}" r="4"/>`;
    RC_PINS.forEach((p) => { const [px, py] = rcPin(x, y, p); s += `<rect class="rc-hd" x="${px - 8}" y="${py - 8}" width="16" height="16" rx="2"/><circle class="dk-pin" cx="${px}" cy="${py}" r="4"/>` + T(px - 12, py + 4, p, "end", "rc-pl"); });
    return s + `</g>`;
  }
  // A card, a key fob or a sticker, centred on (0, 0): the caller moves it with a transform
  const tagShape = (k) => k === "card" ? `<rect class="tg-card" x="-52" y="-33" width="104" height="66" rx="7"/>${T(0, 5, "NMK42003", "middle", "tg-t")}`
    : k === "fob" ? `<path class="tg-fob" d="M-30,0a30,30 0 1 1 46,25l-16,14l-16,-14a30,30 0 0 1 -14,-25z"/><circle class="tg-hole" cx="0" cy="-16" r="6"/>`
    : `<circle class="tg-tag" cx="0" cy="0" r="27"/><circle class="tg-ring" cx="0" cy="0" r="18"/>`;

  /* The reader bench: RC522 wired to the ESP32, and a card that moves onto the reader when tapped.
     readerBench(host) → { tap(k, far) → Promise<boolean read>, led(on), busy } */
  const BX = 320, BY = 96;
  const RC_MAP = { SDA: "b:D5", SCK: "b:D18", MOSI: "b:D23", MISO: "b:D19", GND: "b:GND", RST: "t:D27", "3.3V": "b:3V3" };
  const LCD_MAP = { GND: "t:GND", VCC: "t:VIN", SDA: "b:D21", SCL: "b:D22" };
  const WIRE_COL = { SDA: "y", SCK: "o", MOSI: "b", MISO: "g", GND: "k", RST: "v", "3.3V": "r", VCC: "r", SCL: "o" };
  const espXY = (id) => pinXY(BX, BY, 1, id[0] === "t" ? "top" : "bot", id.slice(2));
  // a jumper leaves the module, swings above or below the board, and comes down onto its pin
  const jumper = (sx, sy, id, cls) => { const [ex, ey] = espXY(id), up = id[0] === "t"; return `<path class="jw ${cls}" d="M${sx},${sy}C${sx + 70},${up ? 12 : 336} ${f1(ex)},${ey + (up ? -110 : 120)} ${f1(ex)},${f1(ey)}"/>`; };
  function readerBench(host, o = {}) {
    const RX = 16, RY = 60, cx = RX + 64, cy = RY + 99, rest = [596, 290];
    let s = rc522G(RX, RY, { power: true });
    s += board(BX, BY, { pwr: true, hi: Object.values(RC_MAP) });
    Object.keys(RC_MAP).forEach((p) => { const [px, py] = rcPin(RX, RY, p); s += jumper(px, py, RC_MAP[p], WIRE_COL[p]); });
    s += `<g class="rf">${[26, 44, 62].map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join("")}</g>`;
    s += T(rest[0], rest[1] + 50, "", "middle", "small bench-cap") + `<g class="tagmove" style="transform:translate(${rest[0]}px,${rest[1]}px)"></g>`;
    host.innerHTML = `<figure class="scene-box"><div class="scene-scroll"><svg class="scene bench3" viewBox="0 0 700 340" role="img" aria-label="RC522 reader wired to the ESP32, with a card beside it">${s}</svg></div>
      <figcaption>${o.caption || "The RC522 on the SPI bus. Tap a card below to hold it on the reader."}<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>`;
    const mover = $(".tagmove", host), rf = $(".rf", host), cap = $(".bench-cap", host), svgEl = $("svg", host);
    let back = 0;
    const api = { busy: false,
      led(on) { const l = $(".dk-led.blue", host); if (l) l.classList.toggle("on", !!on); },
      async tap(k, far) {
        if (api.busy) return null;
        api.busy = true;
        clearTimeout(back); rf.classList.remove("on");
        mover.innerHTML = tagShape(k); cap.textContent = tagOf(k).name;
        mover.style.transform = `translate(${rest[0]}px,${rest[1]}px)`;
        await sleep(40);
        mover.style.transform = far ? `translate(${cx + 150}px,${cy}px)` : `translate(${cx}px,${cy}px)`;
        await sleep(520);
        if (!far) rf.classList.add("on");
        svgEl.setAttribute("aria-label", `RC522 reader wired to the ESP32. The ${tagOf(k).name.toLowerCase()} is ${far ? "held about 8 cm away" : "on the reader"}.`);
        await sleep(far ? 500 : 700);
        // the card goes back to the tray a moment later; another tap in the meantime simply takes over
        back = setTimeout(() => { rf.classList.remove("on"); mover.style.transform = `translate(${rest[0]}px,${rest[1]}px)`; }, 1100);
        api.busy = false;
        return !far;
      } };
    return api;
  }
  const tagButtons = (label = "Tap a card on the reader") => `<div class="tag-row" role="group" aria-label="${label}">${TAGS.map((t) =>
    `<button type="button" class="tag-btn" data-tag="${t.k}"><svg viewBox="-56 -40 112 80" aria-hidden="true">${tagShape(t.k)}</svg><span>${t.name}</span></button>`).join("")}</div>`;

  // A Serial Monitor that keeps only its last lines
  function logBox(el, max = 40) {
    const o = el.querySelector(".serial-o"), lines = [];
    return { add(t) { lines.push(t); if (lines.length > max) lines.shift(); o.textContent = lines.join("\n") + "\n"; o.scrollTop = o.scrollHeight; }, clear() { lines.length = 0; o.textContent = ""; } };
  }

  /* =====================================================================
     BEFORE YOU START
     ===================================================================== */
  const KIT = [
    ["ESP32 Wi-Fi module and micro-USB cable", "The ESP32 DevKit V1 (30 pins), with the basic circuit from Lab 1."],
    ["RFID RC522 module", "The reader. It talks to the ESP32 over the SPI bus and runs on 3.3 V only."],
    ["RFID cards or tags", "Each one has its own serial number, the UID. Use only the lab's cards."],
    ["16 × 4 LCD module", "Shows 4 rows of 16 characters."],
    ["I2C I/O expander (LCD backpack)", "Soldered to the back of the LCD. It lets the ESP32 drive the LCD with just two signal wires."],
    ["Male-female jumper wires (at least 11)", "Seven for the RC522 and four for the LCD."],
    ["Android phone with NFC", "For Lesson 1. Reading these cards with a phone works on Android only: bring one, or pair up with a classmate who has one."]
  ];
  const SOFT = [
    ["Web browser", "For TUNIOT.", ""],
    ["TUNIOT for ESP32", "Builds the LCD program from blocks.", "http://easycoding.tn/esp32/demos/code/"],
    ["Arduino IDE", "Installs the libraries, takes the code you add by hand, and uploads.", "https://www.arduino.cc/en/software"],
    ["MFRC522 library", "Installed from the Arduino IDE's Library Manager. It does the talking to the RC522.", ""],
    ["LiquidCrystal I2C library", "Installed from the Library Manager. TUNIOT's LCD blocks use it.", ""],
    ["NFC Tools (Android)", "On the phone: reads a card's type and serial number.", ""]
  ];
  const FLOW = [
    ["l1", "1", "Scan", "Read a card's serial number (UID) with a phone"],
    ["l2", "2", "Read", "Wire the RC522 and read the UID with the ESP32"],
    ["l3", "3", "Show", "Wire the LCD and show your name on it"],
    ["l4", "4", "Combine", "Merge the two programs: the UID on the LCD"],
    ["exercises", "✓", "Check", "Pass the Pre-Lab Check to unlock the task"],
    ["labtask", "★", "Plan", "Rehearse the security system and print your plan"]
  ];
  function mountFlow(el) {
    el.innerHTML = `<ol class="flow">${FLOW.map(([h, n, t, d]) => `<li><a href="#${h}"><span class="fl-n" aria-hidden="true">${n}</span><strong>${t}</strong><small>${d}</small></a></li>`).join("")}</ol>`;
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const items = [...el.querySelectorAll("li")];
    // one pass through the stages when the strip comes into view, then it rests
    let i = -1, id = 0;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      id = every(el, 1100, () => { i++; items.forEach((x, k) => x.classList.toggle("on", k === i)); if (i >= items.length) clearInterval(id); });
    }, { threshold: 0.4 });
    io.observe(el);
  }

  // How RFID works: the reader's field powers the card, and the card answers with its UID.
  function mountHow(el) {
    el.innerHTML = `<figure class="scene-box"><div class="scene-scroll"><div class="how-host"></div></div>
        <figcaption>The reader, a card and the ESP32. The card has no battery.<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
      <div class="pv-pl"></div><p class="small-note">The animation plays once. Press the replay button to watch it again, or drag the slider to go through it at your own speed.</p><p class="pv-read"></p>`;
    const host = $(".how-host", el), read = $(".pv-read", el), bytes = CARDS.card.map(hex2);
    const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
    const draw = (t) => {
      const cardX = 520 - 250 * seg(t, 0, 2.5), field = t >= 2.5 && t < 11, lit = t >= 4;
      let s = `<rect class="rc-pcb" x="40" y="50" width="150" height="150" rx="8"/>`;
      for (let i = 0; i < 4; i++) s += `<rect class="rc-coil" x="${56 + i * 10}" y="${66 + i * 10}" width="${118 - i * 20}" height="${118 - i * 20}" rx="8"/>`;
      s += T(115, 222, "RC522 reader", "middle", "tt") + T(115, 240, "its coil is an antenna", "middle", "small");
      if (field) [0, 1, 2].forEach((i) => { const k = ((t * 0.7 + i / 3) % 1); s += `<circle class="how-ring" cx="190" cy="125" r="${f1(20 + k * 110)}" opacity="${(0.8 * (1 - k)).toFixed(2)}"/>`; });
      s += `<g transform="translate(${f1(cardX)} 125)"><rect class="tg-card" x="-52" y="-66" width="104" height="132" rx="8"/><rect class="how-ant" x="-40" y="-54" width="80" height="108" rx="6"/>` +
        `<rect class="how-chip${lit ? " on" : ""}" x="-10" y="-10" width="20" height="20" rx="3"/>${T(0, 84, "RFID card", "middle", "tt")}${T(0, 102, lit ? "chip powered" : "no battery", "middle", "small")}</g>`;
      // the UID comes back one byte at a time
      bytes.forEach((b, i) => { const k = seg(t, 5 + i * 0.9, 6.2 + i * 0.9); if (k > 0 && k < 1) s += `<g class="pkt" transform="translate(${f1(cardX - 60 - k * (cardX - 250))} ${106 + i * 12})"><rect x="-17" y="-10" width="34" height="20" rx="10"/><text y="4" text-anchor="middle">${b}</text></g>`; });
      s += `<rect class="how-esp" x="560" y="80" width="120" height="90" rx="8"/>${T(620, 108, "ESP32", "middle", "tt inv")}${T(620, 132, t >= 10.5 ? bytes.join(" ") : "waiting…", "middle", "how-uid")}${T(620, 152, t >= 10.5 ? "UID received" : "", "middle", "small inv")}`;
      s += `<path class="how-spi${t >= 9 && t < 10.5 ? " on" : ""}" d="M190,60C300,10 480,20 560,100"/>${T(380, 28, "SPI bus", "middle", "small")}`;
      host.innerHTML = `<svg class="scene how" viewBox="0 0 700 250" role="img" aria-label="How RFID works: the reader's field powers the card, the card sends back its UID ${bytes.join(" ")}, and the reader passes it to the ESP32.">${s}</svg>`;
      read.innerHTML = t < 2.5 ? `<strong>1. Bring the card near.</strong> An RFID card has a small chip and a coil of wire inside, but no battery.`
        : t < 5 ? `<strong>2. The reader powers the card.</strong> The RC522's coil makes a 13.56 MHz magnetic field. Within a few centimetres, the card's coil picks up enough energy to switch its chip on.`
        : t < 9 ? `<strong>3. The card answers.</strong> The chip sends back its serial number, the <strong>UID</strong>: ${bytes.length} bytes here, written in hexadecimal as <strong>${bytes.join(" ")}</strong>. No two cards should have the same UID.`
        : t < 10.5 ? `<strong>4. The reader tells the ESP32.</strong> The RC522 passes the UID to the ESP32 over the SPI bus.`
        : `<strong>5. The ESP32 decides what to do.</strong> A sensor that works out and reports a ready-made answer like this, not just a raw voltage, is called a <strong>smart sensor</strong>.`;
    };
    player($(".pv-pl", el), el, { dur: 12, loop: false, draw, still: 7, label: "How RFID works" });
  }

  /* =====================================================================
     LESSON 1: read a card with a phone (NFC Tools)
     ===================================================================== */
  function mountPhone(el) {
    let nfc = true, shown = null, scanning = false;
    el.innerHTML = `${chips("NFC on the phone", [["1", "NFC switched on"], ["0", "NFC switched off"]], "1")}
      <div class="sim-grid"><div class="sim-phone">${phoneFrame("Phone with NFC Tools")}</div>
        <div class="sim-side">
          ${tagButtons("Hold a card to the back of the phone")}
          <p class="pv-read ph-read" aria-live="polite"></p>
          <div class="cal-box wide"><table class="cal-table"><caption>The UIDs you have read</caption>
            <thead><tr><th scope="col">Card</th><th scope="col">UID from the phone</th><th scope="col">Tag type</th></tr></thead><tbody></tbody></table></div>
          <p class="small-note">Write your real UIDs down in the lab: you compare them with the RC522's in Lesson 2.</p>
        </div></div>`;
    const screen = $(".ph-screen", el), read = $(".ph-read", el), body = $("tbody", el);
    const render = () => {
      const t = shown && tagOf(shown);
      screen.innerHTML = `<div class="nfc-app"><div class="app-bar nfc">NFC Tools</div>
        <div class="nfc-tabs"><span class="on">READ</span><span>WRITE</span><span>OTHER</span></div>
        <div class="nfc-body">${!nfc ? `<p class="nfc-msg">NFC is off.</p><p class="nfc-sub">Turn it on in Settings, then Connections, then NFC.</p>`
          : scanning ? `<div class="nfc-wave" aria-hidden="true"></div><p class="nfc-msg">Reading…</p>`
          : !t ? `<div class="nfc-wave idle" aria-hidden="true"></div><p class="nfc-msg">Approach an NFC tag</p>`
          : `<dl class="nfc-list"><div><dt>Tag type</dt><dd>ISO 14443-3A<br>${t.nfc}</dd></div>
              <div><dt>Technologies available</dt><dd>NfcA${t.valid ? ", MifareClassic, NdefFormatable" : ", MifareUltralight, Ndef"}</dd></div>
              <div><dt>Serial number</dt><dd class="nfc-uid">${uid(shown, ":")}</dd></div>
              <div><dt>ATQA</dt><dd>${t.atqa}</dd></div><div><dt>SAK</dt><dd>${t.sak}</dd></div>
              <div><dt>Memory information</dt><dd>${t.mem}</dd></div></dl>`}</div></div>`;
    };
    const table = () => { body.innerHTML = TAGS.map((t) => `<tr><th scope="row">${t.name}</th><td class="${SEEN[t.k + "p"] ? "" : "empty"}">${SEEN[t.k + "p"] ? uid(t.k, ":") : "not read yet"}</td><td class="${SEEN[t.k + "p"] ? "" : "empty"}">${SEEN[t.k + "p"] ? t.nfc : ""}</td></tr>`).join(""); };
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-tag]");
      if (!b || scanning) return;
      if (!nfc) { read.innerHTML = `<span class="warn-t">Nothing happens.</span> The phone's NFC is switched off, so it makes no field and the card stays asleep.`; return; }
      scanning = true; shown = null; render(); await sleep(900);
      scanning = false; shown = b.dataset.tag; saw(shown, "p"); render(); table();
      const t = tagOf(shown);
      read.innerHTML = `The <strong>serial number</strong> is the card's UID: ${CARDS[shown].length} bytes, shown in hexadecimal. ${t.valid ? `MIFARE Classic 1K is the usual type of card and key fob in the lab.` : `This sticker is a different type (NTAG213) with a longer, 7-byte UID. Remember that for Lesson 2.`}`;
    });
    wireChips($(".chips-row", el), (v) => { nfc = v === "1"; shown = null; render(); read.innerHTML = nfc ? `Tap a card to hold it against the back of the phone.` : `With NFC off the phone can't read anything. Try a card and see.`; });
    render(); table();
    read.innerHTML = `Tap a card to hold it against the back of the phone. Read all three.`;
  }

  /* =====================================================================
     LESSON 2: the RC522 reader
     ===================================================================== */
  // Why this lesson is written in code: blocks are ready-made code, and TUNIOT has none for the RC522.
  function mountWhy(el) {
    const SAMPLES = [
      [bk("delay", `Delay Ms ${bn(1000)}`), "delay(1000);"],
      [bk("pin", `DigitalWrite PIN# ${bf("D2")} STAT ${bf("HIGH")}`), "digitalWrite(2,HIGH);"],
      [bk("lcd", `LCD I2C print ${bs("Hello")}`), `lcd.print("Hello");`]
    ];
    const HAS = [["Inputs and outputs", 1], ["Serial Monitor", 1], ["Servo motor", 1], ["I2C LCD", 1], ["OLED display", 1], ["Wi-Fi and Bluetooth", 1], ["RFID RC522", 0]];
    const STEPS = ["Build what you can in TUNIOT", "Take TUNIOT's code into the Arduino IDE", "Install the library for the device TUNIOT doesn't cover", "Add that device's code by hand"];
    el.innerHTML = `<div class="why-grid">
        <div class="why-card"><h4>1. A Block Is Ready-Made Code</h4><p>Somebody wrote each block in advance. Tap a block to see the line of code it stands for.</p>
          <div class="why-blocks">${SAMPLES.map((s, i) => `<button type="button" class="why-b" data-i="${i}" aria-pressed="${i === 0}">${s[0]}</button>`).join("")}</div>
          <p class="why-code" aria-live="polite"><span class="why-arrow" aria-hidden="true">→</span> <code></code></p></div>
        <div class="why-card"><h4>2. TUNIOT Has No Block for the RC522</h4><p>TUNIOT only has blocks for the devices its author prepared:</p>
          <ul class="why-list">${HAS.map(([n, ok]) => `<li class="${ok ? "yes" : "no"}"><span aria-hidden="true">${ok ? "✓" : "✗"}</span> ${n}${ok ? "" : " <strong>(no block)</strong>"}</li>`).join("")}</ul></div>
        <div class="why-card wide"><h4>3. So This Lab Uses Blocks and Code Together</h4>
          <p>A block for the RC522 would have to talk to the reader over the SPI bus, ask whether a card is there, pick one card and read its UID. All of that already exists as code, in the <strong>MFRC522 library</strong>. TUNIOT can't add a library, but the Arduino IDE can. So for the RC522 you write the code yourself, and it is less than it sounds: the library does the hard part.</p>
          <ol class="why-steps">${STEPS.map((s, i) => `<li><span class="ls-n">${i + 1}</span><span>${s}</span></li>`).join("")}</ol>
          <p class="small-note">Lesson 3 is step 1 (the LCD, in blocks). This lesson is steps 3 and 4. Lesson 4 puts all four steps together.</p></div>
      </div>`;
    const code = $(".why-code code", el);
    const show = (i) => { code.textContent = SAMPLES[i][1]; el.querySelectorAll(".why-b").forEach((b, k) => b.setAttribute("aria-pressed", k === i)); };
    el.addEventListener("click", (e) => { const b = e.target.closest(".why-b"); if (b) show(+b.dataset.i); });
    show(0);
  }

  /* A wiring trainer: choose where each pin of a module goes, then check. Wrong wiring shows what would
     happen on the real bench. cfg: { mod, pins: [[name, role]], opts: [[espPin, label]], right: { name: espPin },
     judge(got) → { state: "ok" | "warn" | "bad" | "dead", title, html }, caption } */
  const lcdPin = (name) => [236, 96 + ["GND", "VCC", "SDA", "SCL"].indexOf(name) * 26];
  function mountWire(el, cfg) {
    const got = {};
    let res = null;
    el.innerHTML = `<div class="wr-grid"><figure class="scene-box"><div class="scene-scroll"><div class="wr-svg"></div></div>
          <figcaption>${cfg.caption}<span class="swipe"> Swipe sideways to see all of it.</span></figcaption></figure>
        <div class="wr-side"><form class="wr-form" novalidate>${cfg.pins.map(([p, role]) => `<div class="wr-row"><label for="${cfg.mod}-${p}"><strong>${p}</strong><span>${role}</span></label>
            <select id="${cfg.mod}-${p}" data-p="${p}"><option value="">not connected</option>${cfg.opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>`).join("")}</form>
          <div class="wf-row"><button type="button" class="btn" data-check>Check my wiring</button><button type="button" class="btn ghost" data-auto>Wire it for me</button><button type="button" class="btn ghost" data-clear>Clear</button></div>
          <div class="wr-out" aria-live="polite"></div></div></div>`;
    const svgBox = $(".wr-svg", el), out = $(".wr-out", el);
    const draw = () => {
      const st = res ? res.state : "", used = cfg.pins.map(([p]) => got[p]).filter(Boolean);
      let s = cfg.mod === "rc" ? rc522G(16, 60, { power: st === "ok", dead: st === "dead" })
        : lcdSvg(st === "ok" || st === "warn" ? ["", "", "", ""] : [], { light: st === "ok" || st === "warn", contrast: 0.5 }).replace("<svg ", `<svg x="14" y="70" width="200" height="87" `) +
          `<rect class="bp" x="222" y="80" width="28" height="112" rx="4"/>` + ["GND", "VCC", "SDA", "SCL"].map((p) => { const [px, py] = lcdPin(p); return `<circle class="dk-pin" cx="${px}" cy="${py}" r="4"/>` + T(px - 16, py + 4, p, "end", "bp-l"); }).join("") + T(114, 180, "16 × 4 LCD and its I2C backpack", "middle", "small");
      s += board(BX, BY, { pwr: true, hi: used });
      cfg.pins.forEach(([p]) => { if (!got[p]) return; const [px, py] = cfg.mod === "rc" ? rcPin(16, 60, p) : lcdPin(p); s += jumper(px, py, got[p], `${WIRE_COL[p]}${st === "ok" && !/GND|VCC|3\.3V/.test(p) ? " live" : ""}`); });
      if (st === "dead") s += `<g class="burn">${[[0, 9, 0], [8, 8, .4], [-8, 7, .8]].map(([dx, r, d]) => `<circle class="smoke" cx="${90 + dx}" cy="70" r="${r}" style="animation-delay:${d}s"/>`).join("")}</g>` + T(98, 48, "MODULE DAMAGED", "middle", "burn-t");
      svgBox.innerHTML = `<svg class="scene wiring" viewBox="0 0 700 340" role="img" aria-label="${cfg.aria}. ${used.length} of ${cfg.pins.length} wires connected${res ? ": " + res.title : ""}.">${s}</svg>`;
    };
    const say = () => { out.innerHTML = res ? `<div class="callout ${res.state === "ok" ? "info" : "warn"}"><strong>${res.title}</strong>${res.html}</div>` : `<p class="small-note">Choose where each pin goes, then check. The wires appear as you choose.</p>`; };
    el.addEventListener("change", (e) => { const sel = e.target.closest("select[data-p]"); if (!sel) return; got[sel.dataset.p] = sel.value; res = null; draw(); say(); });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-auto") || b.hasAttribute("data-clear")) {
        cfg.pins.forEach(([p]) => { got[p] = b.hasAttribute("data-auto") ? cfg.right[p] : ""; $(`[data-p="${p}"]`, el).value = got[p]; });
        res = b.hasAttribute("data-auto") ? cfg.judge(got) : null;
      } else if (b.hasAttribute("data-check")) res = cfg.judge(got);
      else return;
      draw(); say();
    });
    draw(); say();
  }
  const wrongList = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const RC_WHY = {
    SDA: "<strong>SDA</strong> is the reader's chip select (SS). The code says <code>SS_PIN 5</code>, so it goes to GPIO5.",
    SCK: "<strong>SCK</strong> is the SPI clock. On the ESP32 that is GPIO18.",
    MOSI: "<strong>MOSI</strong> carries data from the ESP32 to the reader. On the ESP32 that is GPIO23.",
    MISO: "<strong>MISO</strong> carries data from the reader back to the ESP32. On the ESP32 that is GPIO19.",
    RST: "<strong>RST</strong> resets the reader. The code says <code>RST_PIN 27</code>, so it goes to GPIO27."
  };
  const RC_CFG = {
    mod: "rc", aria: "RC522 module and ESP32", caption: "The RC522's header and the ESP32. IRQ is not used in this lab.",
    pins: [["SDA", "chip select (SS)"], ["SCK", "SPI clock"], ["MOSI", "data to the reader"], ["MISO", "data from the reader"], ["GND", "ground"], ["RST", "reset"], ["3.3V", "power"]],
    opts: [["b:3V3", "3V3 (3.3 V)"], ["t:VIN", "VIN (5 V)"], ["b:GND", "GND"], ["b:D5", "GPIO5 (D5)"], ["b:D18", "GPIO18 (D18)"], ["b:D19", "GPIO19 (D19)"], ["b:D23", "GPIO23 (D23)"], ["t:D27", "GPIO27 (D27)"], ["b:D21", "GPIO21 (D21)"], ["b:D22", "GPIO22 (D22)"]],
    right: RC_MAP,
    judge(g) {
      if (Object.values(g).includes("t:VIN")) return { state: "dead", title: "The RC522 is damaged", html: `A wire goes to <strong>VIN</strong>, which is 5 V. The RC522 is a 3.3 V module: 5 V on any of its pins can destroy it. Power it from <strong>3V3</strong> only. Change the wire and check again.` };
      if (g["3.3V"] !== "b:3V3" || g.GND !== "b:GND") return { state: "bad", title: "The reader has no power", html: `Its red LED stays off, so nothing else can work yet. ${g["3.3V"] !== "b:3V3" ? "The <strong>3.3V</strong> pin goes to the ESP32's 3V3 pin. " : ""}${g.GND !== "b:GND" ? "The <strong>GND</strong> pin must go to the ESP32's GND, and nowhere else: without a ground the module has no return path." : ""}` };
      if (g.MOSI === "b:D19" && g.MISO === "b:D23") return { state: "bad", title: "MOSI and MISO are swapped", html: `The reader has power, but the two data wires are crossed, so the ESP32 never hears an answer: no card is ever found. MOSI goes to GPIO23 and MISO to GPIO19.` };
      const bad = ["SDA", "SCK", "MOSI", "MISO", "RST"].filter((p) => g[p] !== RC_MAP[p]);
      if (bad.length) return { state: "bad", title: `${bad.length} wire${bad.length > 1 ? "s are" : " is"} in the wrong place`, html: `The reader has power, but the ESP32 can't talk to it, so no card is found.${wrongList(bad.map((p) => RC_WHY[p]))}` };
      return { state: "ok", title: "✓ All 7 wires are right", html: `The reader's red LED is on, and the four SPI wires (SDA, SCK, MOSI, MISO) and RST reach the pins the program expects. Go on to the code.` };
    }
  };
  const LCD_CFG = {
    mod: "lcd", aria: "LCD with I2C backpack and ESP32", caption: "The backpack on the LCD has four pins. Two of them carry all the data.",
    pins: [["GND", "ground"], ["VCC", "power"], ["SDA", "I2C data"], ["SCL", "I2C clock"]],
    opts: [["t:VIN", "VIN (5 V)"], ["b:3V3", "3V3 (3.3 V)"], ["t:GND", "GND"], ["b:D21", "GPIO21 (D21)"], ["b:D22", "GPIO22 (D22)"], ["b:D18", "GPIO18 (D18)"], ["b:D23", "GPIO23 (D23)"]],
    right: LCD_MAP,
    judge(g) {
      if (g.GND !== "t:GND" || !/VIN|3V3/.test(g.VCC || "")) return { state: "bad", title: "The LCD has no power", html: `The backlight stays off. <strong>VCC</strong> goes to VIN and <strong>GND</strong> goes to GND.` };
      if (g.SDA === "b:D22" && g.SCL === "b:D21") return { state: "bad", title: "SDA and SCL are swapped", html: `The backlight would come on, but no text ever appears: the data and clock wires are crossed. SDA goes to GPIO21 and SCL to GPIO22.` };
      if (g.SDA !== "b:D21" || g.SCL !== "b:D22") return { state: "bad", title: "The I2C wires are in the wrong place", html: `The ESP32's I2C bus is on fixed pins: <strong>SDA on GPIO21</strong> and <strong>SCL on GPIO22</strong>. The library uses those two without being told.` };
      if (g.VCC === "b:3V3") return { state: "warn", title: "It works, but the text is very faint", html: `On 3.3 V this LCD is too dim to read comfortably. Power it from <strong>VIN</strong>, which gives the 5 V from the USB cable.` };
      return { state: "ok", title: "✓ All 4 wires are right", html: `The backlight is on. Nothing is displayed yet: that needs a program.` };
    }
  };

  // The RC522 sketch, in pieces that read like blocks
  const RC_PIECES = [
    { t: "Include the Libraries", w: "Brings in the code for the SPI bus and for the RC522.", c: `#include <SPI.h>\n#include <MFRC522.h>\n` },
    { t: "Name the Pins and Create the Reader", w: "RST is on GPIO27 and SS (the SDA pin) on GPIO5. The last line makes a reader object called mfrc522.", c: `\n#define RST_PIN 27\n#define SS_PIN 5\nMFRC522 mfrc522(SS_PIN, RST_PIN);   // create the reader\n` },
    { t: "Setup: Start Everything", w: "Runs once: opens the Serial Monitor link at 115200 baud, starts the SPI bus, then starts the reader.", c: `\nvoid setup() {\n  Serial.begin(115200);   // the Serial Monitor link\n  SPI.begin();            // start the SPI bus\n  mfrc522.PCD_Init();     // start the RC522\n}\n` },
    { t: "Loop: Is a New Card There?", w: "If there is no card, return: the loop starts again from the top. This repeats many times a second.", c: `\nvoid loop() {\n  // No new card on the reader? Start the loop again.\n  if ( ! mfrc522.PICC_IsNewCardPresent())\n    return;\n  // Read the card's serial number (UID)\n  if ( ! mfrc522.PICC_ReadCardSerial())\n    return;\n` },
    { t: "Loop: Print the UID", w: "Prints the label, then each byte of the UID in hexadecimal.", c: `\n  Serial.print(F("Card UID:"));\n  dump_byte_array(mfrc522.uid.uidByte, mfrc522.uid.size);\n  Serial.println();\n` },
    { t: "Loop: Print the Card Type", w: "Asks the library what type of card it is, and prints the name. PICC is the standard's word for the card.", c: `\n  Serial.print(F("PICC type: "));\n  MFRC522::PICC_Type piccType = mfrc522.PICC_GetType(mfrc522.uid.sak);\n  Serial.println(mfrc522.PICC_GetTypeName(piccType));\n` },
    { t: "Loop: Accept Only MIFARE Classic", w: "Any other type of card prints No valid tag. Then the card is told to stop, so it is read once, not over and over.", c: `\n  // This sketch only accepts MIFARE Classic cards\n  if (    piccType != MFRC522::PICC_TYPE_MIFARE_MINI\n       && piccType != MFRC522::PICC_TYPE_MIFARE_1K\n       && piccType != MFRC522::PICC_TYPE_MIFARE_4K) {\n    Serial.println(F("No valid tag"));\n    return;\n  }\n  mfrc522.PICC_HaltA();        // tell the card to stop\n  mfrc522.PCD_StopCrypto1();\n}\n` },
    { t: "A Helper: Print Bytes in Hex", w: "Your own small function. It prints each byte as two hex digits, with a 0 in front of small values.", c: `\n// Print each byte as two hex digits\nvoid dump_byte_array(byte *buffer, byte bufferSize) {\n  for (byte i = 0; i < bufferSize; i++) {\n    Serial.print(buffer[i] < 0x10 ? " 0" : " ");\n    Serial.print(buffer[i], HEX);\n  }\n}` }
  ];
  const RC_CODE = RC_PIECES.map((p) => p.c).join("");
  function mountCode(el) {
    let lib = false;
    el.innerHTML = `<h4 class="sub-h">Install the Library</h4>
      <ol class="what"><li>In the Arduino IDE choose <em>Sketch → Include Library → Manage Libraries…</em> and wait for the Library Manager to open.</li>
        <li>Search for <strong>MFRC522</strong> and install it. Try it here:</li></ol>
      <div class="libm" role="group" aria-label="Library Manager"><div class="libm-bar"><span>Library Manager</span><span class="libm-q">MFRC522</span></div>
        <div class="libm-item"><div><strong>MFRC522</strong> by GithubCommunity<small>Arduino RFID library for MFRC522 (SPI). Read and write an RFID card or tag.</small></div>
          <button type="button" class="btn sm" data-lib>Install 1.4.10</button></div></div>
      <ol class="what" start="3"><li>Check <em>Tools → Board</em> (ESP32 Dev Module) and <em>Tools → Port</em> (the COM port of your board), as in Lab 1.</li></ol>
      <h4 class="sub-h">Read the Code, Piece by Piece</h4>
      <p class="explain-p">The sketch has the same shape as a TUNIOT program: things at the top, a Setup that runs once, and a loop that repeats. Tap a piece to find it in the code.</p>
      <div class="pc-grid"><ol class="pc-list">${RC_PIECES.map((p, i) => `<li><button type="button" class="pc-b c${i % 6}" data-i="${i}" aria-pressed="false"><strong>${p.t}</strong><span>${p.w}</span></button></li>`).join("")}</ol>
        <div class="code pc-code"><div class="code-head"><span>RC522.ino</span></div><pre tabindex="0"><code>${RC_PIECES.map((p, i) => `<span class="pc-s" data-i="${i}">${esc(p.c)}</span>`).join("")}</code></pre></div></div>
      ${fold("The Whole Sketch, Ready to Copy", codeBlock(RC_CODE, "RC522.ino"))}
      ${fold("If It Won't Compile: The MFRC522Extended.cpp Error", `<p>With some versions of the ESP32 board package, the compiler stops with:</p>
        <p><code>MFRC522Extended.cpp:824:34: error: ordered comparison of pointer with integer zero</code></p>
        <p>The fault is in the library, not in your sketch. To fix it:</p>
        <ol class="what"><li>Open the file named in the error message. It is in your Arduino <code>libraries\\MFRC522\\src</code> folder: use the path your own error shows.</li>
          <li>Go to the two lines the error names (824 and 847). Each reads <code>if (backData &amp;&amp; (backLen &gt; 0)) {</code></li>
          <li>Change both to <code>if (backData &amp;&amp; (backLen &amp;&amp; *backLen &gt; 0)) {</code></li>
          <li>Save the file and compile again.</li></ol>`)}`;
    const pre = $(".pc-code pre", el);
    el.addEventListener("click", (e) => {
      const lb = e.target.closest("[data-lib]"), b = e.target.closest(".pc-b");
      if (lb) { lib = !lib; lb.textContent = lib ? "✓ Installed" : "Install 1.4.10"; lb.classList.toggle("ghost", lib); return; }
      if (!b) return;
      el.querySelectorAll(".pc-b").forEach((x) => x.setAttribute("aria-pressed", x === b));
      el.querySelectorAll(".pc-s").forEach((x) => x.classList.toggle("on", x.dataset.i === b.dataset.i));
      const sp = $(`.pc-s[data-i="${b.dataset.i}"]`, el);
      pre.scrollTop = Math.max(0, sp.offsetTop - pre.offsetTop - 24);
    });
  }

  // What the RC522 sketch prints for a card
  const serialLines = (k) => [`Card UID: ${uid(k)}`, `PICC type: ${tagOf(k).picc}`].concat(tagOf(k).valid ? [] : ["No valid tag"]);
  function mountRead(el) {
    let far = false;
    el.innerHTML = `<div class="rd-bench"></div>
      <div class="rd-ctl">${tagButtons()}${chips("Distance", [["0", "On the reader (about 1 cm)"], ["1", "Held 8 cm away"]], "0")}</div>
      <div class="task-sim"><div>${serialBox()}</div>
        <div class="task-side"><p class="pv-read rd-read" aria-live="polite"></p>
          <div class="cal-box wide"><table class="cal-table"><caption>Phone and RC522 compared</caption>
            <thead><tr><th scope="col">Card</th><th scope="col">UID from the phone</th><th scope="col">UID from the RC522</th><th scope="col">Same?</th></tr></thead><tbody></tbody></table></div></div></div>`;
    const bench = readerBench($(".rd-bench", el)), log = logBox($(".serial", el)), read = $(".rd-read", el), body = $("tbody", el);
    const table = () => { body.innerHTML = TAGS.map((t) => { const p = SEEN[t.k + "p"], r = SEEN[t.k + "r"]; return `<tr><th scope="row">${t.name}</th><td class="${p ? "" : "empty"}">${p ? uid(t.k, ":") : "Lesson 1"}</td><td class="${r ? "" : "empty"}">${r ? uid(t.k) : "not read yet"}</td><td>${p && r ? "✓ yes" : ""}</td></tr>`; }).join(""); };
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-tag]");
      if (!b || bench.busy) return;
      const k = b.dataset.tag, got = await bench.tap(k, far);
      if (got === null) return;
      if (!got) { read.innerHTML = `<span class="warn-t">Nothing is printed.</span> At 8 cm the reader's field is too weak to power the card. The RC522 reads at up to about 3 to 5 cm, and best when the card lies flat on the coil.`; return; }
      serialLines(k).forEach((l) => log.add(l));
      saw(k, "r"); table();
      read.innerHTML = tagOf(k).valid ? `The RC522 gives the <strong>same UID</strong> as the phone did. The phone writes it with colons and the sketch with spaces: the bytes are the same.`
        : `The sticker is read, and its UID has 7 bytes. But it is not a MIFARE Classic card, so the sketch prints <strong>No valid tag</strong>. The check in the code decides which cards are accepted.`;
    });
    wireChips($(".chips-row", el), (v) => { far = v === "1"; });
    seenListeners.push(table);
    table();
    read.innerHTML = `Open the Serial Monitor at 115200 baud, then tap each card. Compare what is printed with the UIDs you read in Lesson 1.`;
  }

  /* =====================================================================
     LESSON 3: the I2C LCD (TUNIOT blocks)
     ===================================================================== */
  const LCD_KEY = "nmk-lab3-lcd";
  const cleanRow = (s) => String(s || "").replace(/["\\<>]/g, "").slice(0, 20);
  const lcdBlocks = (rows, addr) =>
    bk("root", "Setup", bk("lcd", `LCD I2C setup address ${bn(addr)} columns ${bn(16)} rows ${bn(4)}`) +
      rows.map((r, i) => (r ? bk("lcd", `LCD I2C set cursor column ${bn(0)} row ${bn(i)}`) + bk("lcd", `LCD I2C print ${bs(esc(r))}`) : "")).join("")) +
    bk("root", "Main loop", "");
  const lcdCode = (rows, addr) => `${HEAD}#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(${addr},16,4);  // LCD address ${addr}, 16 characters, 4 rows

void setup()
{
  lcd.init();                      // start the LCD
  lcd.backlight();                 // switch its light on
${rows.map((r, i) => (r ? `  lcd.setCursor(0,${i});\n  lcd.print("${r}");\n` : "")).join("")}}

void loop()
{

}`;
  function mountLcd(el) {
    const saved = store.get(LCD_KEY, null);
    let rows = Array.isArray(saved) && saved.length === 4 ? saved.map(cleanRow) : ["Name 1", "Matric 1", "Name 2", "Matric 2"], addr = "0x27", contrast = 0.6;
    el.innerHTML = `<div class="lc-grid"><div class="lc-left">
          <form class="lc-form" novalidate>${[0, 1, 2, 3].map((i) => `<div class="lc-row"><label for="lcR${i}">Row ${i}</label><input id="lcR${i}" type="text" maxlength="20" autocomplete="off" spellcheck="false" data-r="${i}"><span class="lc-n" aria-live="off"></span></div>`).join("")}</form>
          <p class="small-note">Type your own names and matric numbers. A row holds 16 characters: anything longer is cut off on the display.</p>
          ${chips("Address in the program", [["0x27", "Address 0x27"], ["0x3F", "Address 0x3F"]], "0x27")}
          <div class="slider-field lc-con"><label for="lcCon">Contrast screw on the backpack: <output></output></label><input type="range" id="lcCon" min="0" max="100" step="1" value="60"></div>
        </div>
        <div class="lc-right"><div class="lc-lcd"></div><p class="pv-read lc-read" aria-live="polite"></p></div></div>
      <div class="lc-code"></div>
      ${fold("Not Sure of the Address? Run an I2C Scanner", `<p>Every I2C device has an address. Most LCD backpacks are at <code>0x27</code>, and some at <code>0x3F</code>. The Arduino IDE has an example that tries every address and prints the ones that answer: <em>File → Examples → Wire → WireScan</em> (or search for "I2C scanner"). For the backpack in this simulation it prints:</p>
        <div class="serial"><div class="serial-h">Serial Monitor · 115200 baud</div><pre class="serial-o">Scanning...\nI2C device found at address 0x27\ndone</pre></div>`)}`;
    const lcdEl = $(".lc-lcd", el), read = $(".lc-read", el), codeEl = $(".lc-code", el), conOut = $(".lc-con output", el);
    const draw = (code) => {
      const off = addr !== "0x27";
      lcdEl.innerHTML = lcdSvg(rows, { contrast, off });
      el.querySelectorAll(".lc-row").forEach((r, i) => { const n = rows[i].length, s = $(".lc-n", r); s.textContent = `${n}/16`; s.classList.toggle("bad", n > 16); });
      conOut.textContent = contrast < 0.3 ? "too low" : contrast > 0.8 ? "too high" : "good";
      read.innerHTML = off ? `<span class="warn-t">The backlight is on, but there is no text.</span> The program is talking to address 0x3F, and this backpack is at 0x27, so nothing answers. Use the scanner below to find the right address.`
        : contrast < 0.3 ? `<span class="warn-t">The LCD looks blank.</span> The program is running, but the contrast is too low to see the characters. Turn the small blue screw on the backpack. A "dead" LCD is very often just this.`
        : contrast > 0.8 ? `<span class="warn-t">Every character is a solid block.</span> The contrast is too high. Turn the screw back.`
        : rows.some((r) => r.length > 16) ? `<span class="warn-t">One row is longer than 16 characters</span>, so its end is cut off.`
        : `<span class="ok-t">✓ The LCD shows your text.</span> <code>setCursor(column, row)</code> counts from 0: the top row is row 0, and the first character is column 0.`;
      if (code) codeEl.innerHTML = `<div class="bc-grid"><div>${ws(lcdBlocks(rows, addr), "TUNIOT blocks: show four rows of text on the I2C LCD")}</div><div>${codeBlock(lcdCode(rows, addr), "lcd_name.ino (from TUNIOT)")}</div></div>
        <p class="small-note">TUNIOT may name a few blocks slightly differently. What matters is that your Arduino code does the same. Install the <strong>LiquidCrystal I2C</strong> library (by Marco Schwartz) from the Library Manager before you compile.</p>`;
    };
    el.querySelectorAll("input[data-r]").forEach((inp) => { inp.value = rows[+inp.dataset.r]; });
    el.querySelector(".lc-form").addEventListener("submit", (e) => e.preventDefault());
    el.querySelector(".lc-form").addEventListener("input", (e) => { const i = +e.target.dataset.r; rows[i] = cleanRow(e.target.value); if (e.target.value !== rows[i]) e.target.value = rows[i]; store.set(LCD_KEY, rows); draw(true); });
    wireChips($(".chips-row", el), (v) => { addr = v; draw(true); });
    $("#lcCon", el).addEventListener("input", (e) => { contrast = +e.target.value / 100; draw(false); });
    draw(true);
  }

  /* =====================================================================
     LESSON 4: the RFID display system (merge the two programs)
     ===================================================================== */
  const PLACES = [["top", "At the very top"], ["obj", "Before setup()"], ["setup", "Inside setup()"], ["loop", "Inside loop()"]];
  const ASK = {
    top: "Ask yourself: must the compiler read this before any other line can use it?",
    obj: "Ask yourself: does this create something that both setup() and loop() need?",
    setup: "Ask yourself: should this happen once, or again and again?",
    loop: "Ask yourself: should this happen once, or again and again?"
  };
  const MERGE = [
    { c: `#include <SPI.h>\n#include <MFRC522.h>`, from: "RC522 sketch", a: "top", why: "Includes go at the very top, so everything below can use the libraries." },
    { c: `lcd.init();\nlcd.backlight();`, from: "TUNIOT LCD code", a: "setup", why: "Starting the LCD is done once." },
    { c: `MFRC522 mfrc522(SS_PIN, RST_PIN);`, from: "RC522 sketch", a: "obj", why: "The reader object is created once, outside any function, so setup() and loop() can both use it." },
    { c: `if ( ! mfrc522.PICC_IsNewCardPresent())\n  return;`, from: "RC522 sketch", a: "loop", why: "Looking for a card has to happen again and again." },
    { c: `#include <Wire.h>\n#include <LiquidCrystal_I2C.h>`, from: "TUNIOT LCD code", a: "top", why: "Includes go at the very top. Two programs merged means both sets of includes." },
    { c: `lcd.print("Tap a card");`, from: "new line", a: "setup", why: "A message shown while waiting is printed once. In loop() it would be rewritten thousands of times a second and flicker." },
    { c: `LiquidCrystal_I2C lcd(0x27,16,4);`, from: "TUNIOT LCD code", a: "obj", why: "The LCD object is created once, outside any function." },
    { c: `lcd.setCursor(0,1);\nlcd_print_uid();`, from: "new lines", a: "loop", why: "The UID is only known after a card has been read, and it changes with every card." },
    { c: `SPI.begin();\nmfrc522.PCD_Init();`, from: "RC522 sketch", a: "setup", why: "Starting the SPI bus and the reader is done once." }
  ];
  const mergedCode = () => `#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define RST_PIN 27
#define SS_PIN 5
MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27,16,4);

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0,0);
  lcd.print("Tap a card");
}

void loop() {
  // No new card on the reader? Start the loop again.
  if ( ! mfrc522.PICC_IsNewCardPresent())
    return;
  if ( ! mfrc522.PICC_ReadCardSerial())
    return;

  MFRC522::PICC_Type piccType = mfrc522.PICC_GetType(mfrc522.uid.sak);

  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("Card UID: ${lcdName()}");      // your name, 6 letters at most
  lcd.setCursor(0,1);
  lcd_print_uid();
  lcd.setCursor(0,2);
  lcd.print("PICC type:");
  lcd.setCursor(0,3);
  lcd.print(mfrc522.PICC_GetTypeName(piccType));

  mfrc522.PICC_HaltA();        // tell the card to stop
  mfrc522.PCD_StopCrypto1();
}

// Print the UID on the LCD, each byte as two hex digits
void lcd_print_uid() {
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (i > 0) lcd.print(" ");
    if (mfrc522.uid.uidByte[i] < 0x10) lcd.print("0");
    lcd.print(mfrc522.uid.uidByte[i], HEX);
  }
}`;
  const MERGE_KEY = "nmk-lab3-merge";
  function mountMerge(el) {
    let solved = !!store.get(MERGE_KEY, false), tries = 0;
    el.innerHTML = `<ol class="mg-list">${MERGE.map((p, i) => `<li class="mg-item"><div class="mg-code"><span class="mg-from">${p.from}</span><pre><code>${esc(p.c)}</code></pre></div>
          <div class="mg-pick"><label for="mg${i}" class="vh">Where does piece ${i + 1} go?</label><select id="mg${i}" data-i="${i}"><option value="">Where does it go?</option>${PLACES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
            <p class="mg-fb" aria-live="polite"></p></div></li>`).join("")}</ol>
      <div class="wf-row"><button type="button" class="btn" data-check>Check the order</button><span class="small-note mg-count"></span></div>
      <div class="mg-out" tabindex="-1"></div>`;
    const out = $(".mg-out", el), count = $(".mg-count", el);
    const reveal = (focus) => {
      out.innerHTML = `<div class="callout info"><strong>✓ Every piece is in the right place</strong>This is the merged sketch. Read it against your choices, then try it on the bench below.</div>${codeBlock(mergedCode(), "RC522_I2C.ino")}`;
      el.querySelectorAll(".mg-item").forEach((li, i) => { li.classList.add("ok"); li.classList.remove("no"); $("select", li).value = MERGE[i].a; $(".mg-fb", li).textContent = MERGE[i].why; });
      if (focus) out.focus({ preventScroll: true });
    };
    el.addEventListener("click", (e) => {
      if (!e.target.closest("[data-check]")) return;
      let right = 0, blank = 0;
      el.querySelectorAll(".mg-item").forEach((li, i) => {
        const v = $("select", li).value, ok = v === MERGE[i].a;
        if (!v) blank++;
        if (ok) right++;
        li.classList.toggle("ok", ok); li.classList.toggle("no", !!v && !ok);
        $(".mg-fb", li).textContent = ok ? MERGE[i].why : v ? (tries ? ASK[MERGE[i].a] : "Not there. Think about when this line must run.") : "";
      });
      tries++;
      if (right === MERGE.length) { solved = true; store.set(MERGE_KEY, true); reveal(true); count.textContent = ""; }
      else count.textContent = `${right} of ${MERGE.length} in the right place${blank ? `, ${blank} not placed yet` : ""}. The merged sketch appears when all ${MERGE.length} are right.`;
    });
    ME.on(() => { if (solved) reveal(false); });
    if (solved) reveal(false);
    else count.textContent = `The merged sketch appears when all ${MERGE.length} pieces are in the right place.`;
  }

  const lcdRows = (k) => [`Card UID: ${lcdName()}`, uid(k), "PICC type:", tagOf(k).picc];
  function mountShow(el) {
    let rows = ["Tap a card", "", "", ""];
    el.innerHTML = `<div class="sh-grid"><div class="sh-lcd"></div>
        <div class="sh-side">${tagButtons()}<p class="pv-read sh-read" aria-live="polite"></p></div></div>
      <div class="sh-bench"></div>`;
    const lcdEl = $(".sh-lcd", el), read = $(".sh-read", el);
    const bench = readerBench($(".sh-bench", el), { caption: "The RC522 as in Lesson 2. The LCD is wired as in Lesson 3: its four wires are not drawn here." });
    const draw = () => { lcdEl.innerHTML = lcdSvg(rows); };
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-tag]");
      if (!b || bench.busy) return;
      const k = b.dataset.tag;
      if (!(await bench.tap(k, false))) return;
      rows = lcdRows(k); draw();
      read.innerHTML = tagOf(k).valid ? `Row 0 has the label and your name, row 1 the UID, and rows 2 and 3 the card type. The LCD is cleared first, so nothing is left over from the last card.`
        : `<span class="warn-t">Two rows are cut off.</span> The sticker's 7-byte UID needs 20 characters, and its type name is longer still. The LCD has only 16 columns, so the ends are lost. Plan what you print to fit the display.`;
    });
    ME.on(() => { if (rows[0].startsWith("Card UID")) { rows[0] = `Card UID: ${lcdName()}`; draw(); } });
    draw();
    read.innerHTML = `The standalone reader: no computer needed once it is programmed. Tap a card and read the LCD.`;
  }

  /* =====================================================================
     LAB TASK: the brief, a rehearsal bench and the printable plan
     ===================================================================== */
  const TASK_KEY = "nmk-lab3-task", PLAN_KEY = "nmk-lab3-plan";
  function mountTask(el) {
    const V = Object.assign({ auth: "card", ms: 3000 }, store.get(TASK_KEY, {}));
    if (!tagOf(V.auth)) V.auth = "card";
    el.innerHTML = `<div class="demo-grid">
        <div class="task-card wide"><h4>Requirements</h4><ol>
          <li><strong>Build</strong> the RFID display system of Lesson 4 on the real hardware, and read the UIDs of your own cards.</li>
          <li><strong>Authorised card.</strong> On the lab day your lecturer tells your group which of your cards is the authorised one. Its UID goes into your program.</li>
          <li><strong>Right card:</strong> the LCD shows <code>Access granted</code> and your group's name, and the built-in LED (GPIO2) lights for a time you choose, then goes off.</li>
          <li><strong>Any other card:</strong> the LCD shows <code>Access denied</code>, and the LED stays off.</li>
          <li><strong>Three wrong cards in a row:</strong> the LED blinks as an alarm until the authorised card is shown.</li>
          <li>The LCD always shows the <strong>UID of the last card</strong>.</li></ol></div>
        <div class="task-card"><h4>At the Demo, Be Ready To</h4><ol>
          <li>show every requirement working on your own hardware;</li>
          <li>change the authorised card on the spot when your lecturer asks, and upload it in a few minutes;</li>
          <li>answer two short questions, for example why the RC522 uses SPI and the LCD uses I2C, or how your program compares two UIDs.</li></ol></div>
        <div class="task-card"><h4>What to Submit</h4><ol>
          <li>a table of your cards: UID from the phone, UID from the RC522, and card type;</li>
          <li>your final sketch, with comments;</li>
          <li>a photo of the LCD for a granted and a denied card;</li>
          <li>a short reflection: one problem you met and how you solved it.</li></ol></div>
      </div>
      <h4 class="sub-h">Rehearse It: What the Finished Task Should Do</h4>
      <p class="explain-p">Choose which card is authorised and how long the LED stays on, then tap cards. This bench shows the <strong>behaviour</strong> you have to build. The code is for you to work out.</p>
      ${chips("Authorised card", TAGS.map((t) => [t.k, t.name]), V.auth)}
      <form class="mc-form tk-form" novalidate><div class="mc-f"><label for="tkMs">LED on-time <span class="hint">ms</span></label><input id="tkMs" type="number" min="500" max="10000" step="500" inputmode="numeric" value="${V.ms}"></div>
        <p class="mc-note" aria-live="polite"></p></form>
      <div class="sh-grid"><div class="sh-lcd"></div>
        <div class="sh-side">${tagButtons()}<p class="led-ind"><span class="led-dot" aria-hidden="true"></span> Built-in LED (GPIO2): <strong class="led-st">off</strong></p>
          <p class="pv-read tk-read" aria-live="polite"></p><button type="button" class="btn ghost" data-reset>Restart the system</button></div></div>
      <div class="sh-bench"></div>`;
    const lcdEl = $(".sh-lcd", el), read = $(".tk-read", el), noteEl = $(".mc-note", el), msIn = $("#tkMs", el);
    const bench = readerBench($(".sh-bench", el), { caption: "The built-in blue LED on the ESP32 is the lock's signal. The indicator beside the LCD shows the same thing." });
    // the LED on the drawn board, repeated beside the LCD so it is seen without scrolling
    const ledDot = $(".led-dot", el), ledSt = $(".led-st", el);
    const led = (on) => { bench.led(on); ledDot.classList.toggle("on", !!on); ledSt.textContent = on ? "ON" : "off"; };
    const IDLE = ["Security system", "Tap your card", "", ""];
    let wrong = 0, alarm = false, timer = 0, blink = 0, ok = true;
    const lcd = (rows) => { lcdEl.innerHTML = lcdSvg(rows); };
    const quiet = () => { clearTimeout(timer); clearInterval(blink); blink = 0; led(false); };
    const reset = (msg) => { quiet(); wrong = 0; alarm = false; lcd(IDLE); read.innerHTML = msg || `The authorised card is the <strong>${tagOf(V.auth).name.toLowerCase()}</strong>. Tap it, then try the others.`; };
    const readMs = () => {
      const v = Number(msIn.value);
      ok = Number.isFinite(v) && v >= 500 && v <= 10000;
      if (ok) { V.ms = v; store.set(TASK_KEY, V); noteEl.textContent = `The LED stays on for ${v / 1000} s after the right card.`; }
      else noteEl.textContent = "Choose a time between 500 ms and 10000 ms.";
    };
    el.addEventListener("click", async (e) => {
      if (e.target.closest("[data-reset]")) { reset("Restarted, as if you pressed EN on the board."); return; }
      const b = e.target.closest("[data-tag]");
      if (!b || bench.busy || !ok) return;
      const k = b.dataset.tag;
      if (!(await bench.tap(k, false))) return;
      const u = uid(k).slice(0, 16);
      if (k === V.auth) {
        quiet(); wrong = 0; alarm = false;
        lcd(["Access granted", who().slice(0, 16), "UID:", u]);
        led(true);
        read.innerHTML = `<span class="ok-t">Access granted.</span> The UID matches the authorised one, so the LED is on for ${V.ms / 1000} s. The count of wrong cards goes back to 0.`;
        timer = setTimeout(() => { led(false); lcd(IDLE); }, V.ms);
      } else if (alarm) {
        lcd(["** ALARM **", "Show the right", "card to reset", u]);
        read.innerHTML = `<span class="warn-t">Still in alarm.</span> A wrong card does not stop it. Only the authorised card does.`;
      } else {
        quiet(); wrong++;
        if (wrong >= 3) {
          alarm = true;
          lcd(["** ALARM **", "Show the right", "card to reset", u]);
          let on = false;
          blink = every(el, 250, () => { on = !on; led(on); });
          read.innerHTML = `<span class="warn-t">Alarm.</span> That was the third wrong card in a row, so the LED blinks until the authorised card is shown.`;
        } else {
          lcd(["Access denied", `Wrong card: ${wrong}/3`, "UID:", u]);
          read.innerHTML = `<span class="warn-t">Access denied.</span> The UID is not the authorised one, so the LED stays off. Wrong cards in a row: ${wrong}.`;
        }
      }
    });
    wireChips($(row("Authorised card"), el), (v) => { V.auth = v; store.set(TASK_KEY, V); reset(); });
    el.querySelector(".tk-form").addEventListener("submit", (e) => e.preventDefault());
    msIn.addEventListener("input", readMs);
    readMs(); reset();
  }

  // My Lab Plan: what the student decides before the lab, on one printed page.
  function mountPlan(el) {
    const P = Object.assign({ phone: "", notes: "" }, store.get(PLAN_KEY, {}));
    const radio = (name, v, label) => `<label class="pl-opt"><input type="radio" name="${name}" value="${v}"${P[name] === v ? " checked" : ""}><span>${label}</span></label>`;
    el.innerHTML = `<div class="plan">
        <div class="plan-card"><h4>1. Which Phone Will Read Your Cards?</h4>
          <div class="pl-opts">${radio("phone", "own", "My own Android phone with NFC")}${radio("phone", "pair", "A classmate's Android phone: I have arranged it")}</div></div>
        <div class="plan-card"><h4>2. From the Simulation</h4><div class="plan-sim" aria-live="polite"></div></div>
        <div class="plan-card wide"><h4>3. Your Plan for the Security System</h4>
          <label for="planNotes">Write the steps your program will follow, in your own words. How will it know a card is the authorised one? How will it count wrong cards?</label>
          <textarea id="planNotes" rows="6" maxlength="900" placeholder="e.g. 1. Wait for a card. 2. Read its UID. 3. …">${esc(P.notes)}</textarea></div>
      </div>
      <div class="wf-row"><button type="button" class="btn" data-print>Print my plan</button><span class="small-note">One page, with the wiring tables and a blank table for your real UIDs. Saved on this device only.</span></div>`;
    const sim = $(".plan-sim", el);
    const paint = () => {
      const n = (by) => TAGS.filter((t) => SEEN[t.k + by]).length;
      sim.innerHTML = `<ul class="plan-list">
        <li>${n("p") === 3 ? "✓" : "○"} Cards read with the phone: <strong>${n("p")} of 3</strong>${n("p") < 3 ? ` (<a href="#phone">Lesson 1</a>)` : ""}</li>
        <li>${n("r") === 3 ? "✓" : "○"} Cards read with the RC522: <strong>${n("r")} of 3</strong>${n("r") < 3 ? ` (<a href="#read">Lesson 2</a>)` : ""}</li>
        <li>${store.get(MERGE_KEY, false) ? "✓" : "○"} Programs merged: <strong>${store.get(MERGE_KEY, false) ? "done" : "not yet"}</strong>${store.get(MERGE_KEY, false) ? "" : ` (<a href="#merge">Lesson 4</a>)`}</li></ul>
        <p class="small-note">The UIDs on this page belong to its virtual cards. Your real cards have their own.</p>`;
    };
    el.addEventListener("input", (e) => {
      if (e.target.name === "phone") P.phone = e.target.value;
      if (e.target.id === "planNotes") P.notes = e.target.value;
      store.set(PLAN_KEY, P);
    });
    el.addEventListener("click", (e) => { if (e.target.closest("[data-print]")) { paint(); printPlan(P); } });
    seenListeners.push(paint);
    paint();
  }
  function printPlan(P) {
    const task = store.get(TASK_KEY, null), tick = (on) => (on ? "☑" : "☐");
    const wires = (title, list) => `<table><thead><tr><th>${title}</th><th>ESP32 pin</th><th>Done</th></tr></thead><tbody>${list.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td><td>☐</td></tr>`).join("")}</tbody></table>`;
    let sheet = $("#printSheet");
    if (!sheet) { sheet = document.createElement("div"); sheet.id = "printSheet"; document.body.appendChild(sheet); }
    sheet.innerHTML = `<h1>NMK42003 Lab 3: My Lab Plan</h1>
      <p class="ps-meta">Name or group: <strong>${esc(who() === "YourName" ? "________________" : who())}</strong> &nbsp; Date of lab: ______________ &nbsp; Phone for Lesson 1: ${tick(P.phone === "own")} my own Android &nbsp; ${tick(P.phone === "pair")} a classmate's</p>
      <h2>1. Wiring</h2>
      <div class="ps-two">${wires("RC522 pin", [["SDA (SS)", "GPIO5"], ["SCK", "GPIO18"], ["MOSI", "GPIO23"], ["MISO", "GPIO19"], ["RST", "GPIO27"], ["GND", "GND"], ["3.3V", "3V3 (never VIN)"]])}${wires("LCD backpack pin", [["GND", "GND"], ["VCC", "VIN (5 V)"], ["SDA", "GPIO21"], ["SCL", "GPIO22"]])}</div>
      <p>Libraries installed: ☐ MFRC522 &nbsp; ☐ LiquidCrystal I2C &nbsp; &nbsp; LCD address found: 0x______</p>
      <h2>2. My Cards</h2>
      <table><thead><tr><th>Card</th><th>UID from the phone</th><th>UID from the RC522</th><th>Type</th></tr></thead><tbody>${"<tr><td></td><td></td><td></td><td></td></tr>".repeat(3)}</tbody></table>
      <h2>3. Lab Task: Security System</h2>
      <p>Authorised card (given on the lab day): UID ____ ____ ____ ____ &nbsp; LED on-time: ${task ? task.ms : "______"} ms</p>
      <p class="ps-h">My plan for the program:</p>
      <div class="ps-notes">${esc(P.notes || "")}</div>
      <h2>4. Demo Checklist</h2>
      <p>☐ Right card: Access granted, name shown, LED on then off &nbsp; ☐ Wrong card: Access denied, LED off</p>
      <p>☐ Three wrong cards: LED blinks until the right card &nbsp; ☐ LCD shows the last UID &nbsp; ☐ I can change the authorised card</p>`;
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
      intro: `<p>Tick each item as you get it ready. You also need the basic ESP32 circuit from <a href="lab-1.html#basic">Lab 1</a>.</p>`,
      mount: LabKit.kit("nmk-lab3-kit", KIT, SOFT),
      after: `<div class="callout warn"><strong>Scan only the lab's cards</strong>Don't scan bank cards, your MyKad or other people's access cards, and don't post a card's UID online. A UID identifies a card.</div>` },
    { id: "flow", group: "kit", title: "The Lab at a Glance", toc: "At a Glance",
      intro: `<p>You build a standalone RFID card reader: it reads a card and shows the result on an LCD, with no computer attached. Tap a stage to jump to it.</p>`,
      mount: mountFlow },
    { id: "how", group: "kit", title: "How RFID Works", toc: "How RFID Works",
      intro: `<p>RFID stands for radio-frequency identification. The card needs no battery: the reader powers it through the air.</p>`,
      mount: mountHow },

    { id: "phone", group: "l1", title: "Scan a Card with NFC Tools", toc: "NFC Tools",
      intro: `<p>An NFC phone is an RFID reader too: NFC uses the same 13.56 MHz as the RC522. Install <strong>NFC Tools</strong> on an Android phone, switch NFC on, and hold a card to the back of the phone. The app shows the tag type and its serial number, the UID.</p>`,
      mount: mountPhone,
      after: `<div class="callout info"><strong>Good to know</strong>This lesson needs an <strong>Android phone with NFC</strong>. Prepare one before the lab, or arrange to share a classmate's. The NFC antenna is usually near the top of the phone's back: slide the card around until it reads.</div>` },

    { id: "why", group: "l2", title: "Why This Lesson Uses Code", toc: "Why Code",
      intro: `<p>Until now you built programs from TUNIOT blocks. For the RC522 you write Arduino code. Here is why, and how the two fit together.</p>`,
      mount: mountWhy },
    { id: "rcwire", group: "l2", title: "Wire the RC522", toc: "Wiring",
      intro: `<p>The RC522 talks to the ESP32 over the <strong>SPI bus</strong>: four signal wires (SDA, SCK, MOSI, MISO), plus reset, power and ground. Choose where each of its seven pins goes. Try a wrong choice too, and see what it would do on the real bench.</p>`,
      mount: (el) => mountWire(el, RC_CFG),
      after: `<div class="callout warn"><strong>3.3 V only, and don't forget GND</strong>The RC522 runs on 3.3 V: power it from the 3V3 pin, never from VIN. Its GND pin must go to the ESP32's GND. A module with no ground does nothing at all.</div>
        <div class="callout info"><strong>Good to know: GPIO5</strong>GPIO5 also helps decide how the ESP32 starts up, and it must be HIGH at that moment. A chip-select line rests HIGH, so the RC522 on GPIO5 causes no trouble.</div>` },
    { id: "rccode", group: "l2", title: "The Library and the Code", toc: "Library and Code",
      intro: `<p>The code is short because the <strong>MFRC522 library</strong> does the hard work. First install the library, then read the sketch.</p>`,
      mount: mountCode },
    { id: "read", group: "l2", title: "Try It: Read the UID", toc: "Try It",
      intro: `<p>Upload the sketch, open the Serial Monitor at 115200 baud and hold each card on the reader.</p>`,
      mount: mountRead },

    { id: "lcdwire", group: "l3", title: "Wire the LCD", toc: "Wiring",
      intro: `<p>A bare 16 × 4 LCD needs more than ten wires. The <strong>I2C I/O expander</strong> on its back cuts that to four: power, ground and the two wires of the <strong>I2C bus</strong>, SDA (data) and SCL (clock).</p>`,
      mount: (el) => mountWire(el, LCD_CFG),
      after: `<div class="callout info"><strong>Good to know: 5 V here, but 3.3 V for the RC522</strong>The LCD needs 5 V to be bright enough to read, so it is powered from VIN. Its backpack then pulls the two I2C wires up towards 5 V through resistors. Those resistors keep the current tiny, which is why this is commonly done with the ESP32. The careful way is a small <em>logic level shifter</em> between the two. Never connect 5 V <em>straight</em> to an ESP32 pin.</div>` },
    { id: "lcd", group: "l3", title: "Show Your Name on the LCD", toc: "Blocks and Try It",
      intro: `<p>TUNIOT has blocks for the I2C LCD, so this program is built from blocks. Set the LCD up with its address and size, then for each line set the cursor and print. Type your own text: the blocks, the code and the display follow.</p>`,
      mount: mountLcd },

    { id: "merge", group: "l4", title: "Merge the Two Programs", toc: "Merge",
      intro: `<p>You have two working programs: the RC522 sketch from Lesson 2 and TUNIOT's LCD code from Lesson 3. An ESP32 runs one program at a time, so they must become <strong>one sketch</strong>, with one <code>setup()</code> and one <code>loop()</code>.</p>
        <p>Decide where each piece below belongs. This is the skill the lesson is about: knowing what runs once, and what repeats.</p>`,
      mount: mountMerge },
    { id: "show", group: "l4", title: "Try It: The RFID Display", toc: "Try It",
      intro: `<p>With the merged sketch uploaded, the LCD takes the place of the Serial Monitor. Put your name in the first line of the sketch (type it at the top of this page).</p>`,
      mount: mountShow },

    { id: "task", group: "task", title: "A Security System", toc: "A Security System",
      intro: `<p>Build this <strong>on your own</strong> and demonstrate it in the lab. It uses everything from Lessons 1 to 4, but there is no worked solution here. Each group is given its authorised card on the lab day, so write a program in which the UID is easy to change.</p>`,
      mount: mountTask },
    { id: "plan", group: "task", title: "My Lab Plan", toc: "My Lab Plan",
      intro: `<p>Decide these things now, so that in the lab you can start building straight away. Print the plan and bring it with you.</p>`,
      mount: mountPlan }
  ];

  /* =====================================================================
     Pre-Lab Check questions (the first option is the right one; the order is shuffled on screen)
     ===================================================================== */
  const BANK = [
    { q: "What is a card's UID?", opts: ["Its own serial number", "Its battery level", "The reader's address", "The password of the card"], a: 0, why: "UID means unique identifier: a serial number set when the card is made." },
    { q: "An RFID card has no battery. Where does its chip get power?", opts: ["From the reader's magnetic field", "From the ESP32's 3V3 pin", "From a solar cell", "It needs none"], a: 0, why: "The reader's coil makes a 13.56 MHz field, and the card's coil picks up energy from it." },
    { q: "Which supply does the RC522 module need?", opts: ["3.3 V", "5 V", "12 V", "Either 3.3 V or 5 V"], a: 0, why: "The RC522 is a 3.3 V device. 5 V can destroy it." },
    { q: "Which bus does the RC522 use to talk to the ESP32?", opts: ["SPI", "I2C", "UART", "Bluetooth"], a: 0, why: "SPI: a clock (SCK), two data wires (MOSI and MISO) and a chip select (SDA or SS)." },
    { q: "In the sketch, SS_PIN is 5. Which RC522 pin goes to GPIO5?", opts: ["SDA", "RST", "MISO", "IRQ"], a: 0, why: "On the RC522 board the chip-select pin is labelled SDA. It goes to the pin named SS_PIN in the code." },
    { q: "You forget the GND wire of the RC522. What happens?", opts: ["Nothing works: the module has no return path", "It works, but more slowly", "The UID is read backwards", "Only the key fob is read"], a: 0, why: "Every module needs power and ground. With no ground, no current flows and the reader stays dead." },
    { q: "Why does this lab use Arduino code for the RC522 and not TUNIOT blocks?", opts: ["TUNIOT has no block for the RC522", "Blocks are too slow for RFID", "The RC522 can't be used with blocks at all", "Code uses less power"], a: 0, why: "A block exists only if someone prepared it. For the RC522 you use the MFRC522 library in code." },
    { q: "What does the MFRC522 library do for you?", opts: ["It handles the talking to the reader and the card", "It powers the reader", "It lights the LCD", "It replaces the ESP32"], a: 0, why: "Finding a card and reading its UID takes many steps. The library has them ready as simple functions." },
    { q: "How many signal wires does the I2C bus use?", opts: ["2: SDA and SCL", "4", "1", "8"], a: 0, why: "I2C needs one data wire (SDA) and one clock wire (SCL), plus power and ground." },
    { q: "On the ESP32, which pins are the default I2C bus?", opts: ["GPIO21 (SDA) and GPIO22 (SCL)", "GPIO18 and GPIO19", "GPIO5 and GPIO27", "GPIO2 and GPIO4"], a: 0, why: "The Wire library uses GPIO21 and GPIO22 unless told otherwise." },
    { q: "What does the I2C I/O expander on the back of the LCD do?", opts: ["Lets two signal wires drive the LCD", "Makes the LCD bigger", "Reads the RFID card", "Stores the program"], a: 0, why: "It turns the I2C messages into the many signals the LCD needs, so you need far fewer wires." },
    { q: "The LCD's backlight is on but no text shows, and the contrast is fine. What do you check first?", opts: ["The I2C address in the program", "The RFID card", "The USB cable length", "The baud rate"], a: 0, why: "If the program uses the wrong address (for example 0x3F for a 0x27 backpack), the LCD never hears it." },
    { q: "The LCD looks completely blank, though the program runs. What is the likely cause?", opts: ["The contrast screw needs turning", "The LCD is the wrong colour", "The card is too far away", "The ESP32 is too fast"], a: 0, why: "With the contrast too low the characters are there but invisible. Turn the blue screw on the backpack." },
    { q: "What does lcd.setCursor(0, 2) do?", opts: ["Moves to the first column of the third row", "Moves to the third column of the first row", "Clears two rows", "Prints the number 2"], a: 0, why: "setCursor(column, row), both counted from 0. Row 2 is the third row." },
    { q: "How many characters fit on one row of a 16 × 4 LCD?", opts: ["16", "4", "20", "64"], a: 0, why: "16 columns and 4 rows: 16 characters a row, 64 in all." },
    { q: "When you merge two sketches, where does lcd.init() go?", opts: ["Inside setup(), because it is done once", "Inside loop(), because it must repeat", "At the very top, above the includes", "After the last line of loop()"], a: 0, why: "Starting a device happens once, so it belongs in setup()." },
    { q: "In the merged sketch, why is the UID printed inside loop()?", opts: ["It is only known after a card is read, and changes with each card", "The LCD only works in loop()", "setup() can't print", "To save memory"], a: 0, why: "setup() runs once at the start, before any card has been shown." },
    { q: "A card's UID is D3 DC B9 1C. How many bytes is that?", opts: ["4", "8", "2", "32"], a: 0, why: "Each pair of hex digits is one byte: D3, DC, B9 and 1C." },
    { q: "Why should you not scan a bank card or MyKad in this lab?", opts: ["They hold personal data: use only the lab's cards", "They would break the reader", "They have no UID", "They are too thick"], a: 0, why: "A UID identifies a card and its owner. Keep to the cards provided." }
  ];

  /* =====================================================================
     Lab 3 Review exercises
     ===================================================================== */
  const exercises = [
    { id: "l3-q1", title: "Exercise 1: Reading a UID",
      q: `<p>The Serial Monitor prints <code>Card UID: A7 3F 0C 5E</code>.</p><p>(a) How many bytes is the UID? (b) How many bits is that? (c) What is the first byte, A7, as a decimal number?</p>`,
      ans: [{ l: "(a) Bytes", v: 4, tol: 0.01 }, { l: "(b) Bits", v: 32, tol: 0.01 }, { l: "(c) A7 in decimal", v: 167, tol: 0.01 }],
      hints: ["Each byte is written as two hex digits, and a byte is 8 bits.",
        "In hex, A is 10. A two-digit hex number is (first digit × 16) + second digit."],
      working: () => W_([
        step("Count the bytes", "", "A7, 3F, 0C, 5E", "<strong>4</strong> bytes"),
        step("Bits", "bits = bytes × 8", "4 × 8", "<strong>32</strong> bits"),
        step("A7 in decimal", "(first digit × 16) + second digit", "A = 10, so 10 × 16 + 7 = 160 + 7", "<strong>167</strong>")]) },
    { id: "l3-q2", title: "Exercise 2: How Many Cards?",
      q: `<p>A MIFARE Classic card has a 4-byte UID.</p><p>(a) How many different UIDs can 4 bytes give? (b) How many hex digits are needed to write one UID?</p>`,
      ans: [{ l: "(a) Different UIDs", v: 4294967296 }, { l: "(b) Hex digits", v: 8, tol: 0.01 }],
      hints: ["4 bytes is 32 bits, and each bit doubles the number of possible values.",
        "2 raised to the number of bits gives the count. One byte needs two hex digits."],
      working: () => W_([
        step("Number of bits", "4 bytes × 8", "", "32 bits"),
        step("Different values", "2<sup>32</sup>", "", "<strong>4,294,967,296</strong> (about 4.3 thousand million)"),
        step("Hex digits", "2 per byte", "4 × 2", "<strong>8</strong> hex digits")]) },
    { id: "l3-q3", title: "Exercise 3: Plan the Display",
      q: `<p>You want <code>Access granted</code> in the middle of the top row of a 16 × 4 LCD.</p><p>(a) How many characters is the message, counting the space? (b) Which column should the cursor start at to centre it? (c) How many characters can the whole display show?</p>`,
      ans: [{ l: "(a) Characters", v: 14, tol: 0.01 }, { l: "(b) Start column", v: 1, tol: 0.01 }, { l: "(c) Whole display", v: 64, tol: 0.01 }],
      hints: ["Count every letter and the space. Then find how many columns are left over on a 16-column row.",
        "Share the spare columns equally between the left and the right. Columns are counted from 0."],
      working: () => W_([
        step("Length of the message", "", "Access (6) + space (1) + granted (7)", "<strong>14</strong> characters"),
        step("Spare columns", "16 − 14", "", "2 spare: 1 on each side"),
        step("Start column", "columns count from 0", "skip 1 column", "<code>lcd.setCursor(1, 0)</code>: column <strong>1</strong>"),
        step("Whole display", "columns × rows", "16 × 4", "<strong>64</strong> characters")]) },
    { id: "l3-q4", title: "Exercise 4: Two Buses",
      q: `<p>The RC522 is on the SPI bus and the LCD is on the I2C bus. Count only signal wires, not power or ground, and not the RC522's reset wire.</p>`,
      ans: [{ l: "SPI signal wires to the RC522", v: 4, tol: 0.01 }, { l: "I2C signal wires to the LCD", v: 2, tol: 0.01 }, { l: "Which bus picks a device by its address?", opts: ["I2C", "SPI"], v: 0 }],
      hints: ["SPI: a clock, a wire each way for data, and a wire that selects the device.",
        "I2C: one data wire and one clock wire, shared by every device. Each device answers to its own number, such as 0x27."],
      working: () => W_([
        step("SPI", "", "SCK, MOSI, MISO and SDA (the chip select)", "<strong>4</strong> signal wires"),
        step("I2C", "", "SDA and SCL", "<strong>2</strong> signal wires"),
        step("Choosing a device", "", "SPI uses a separate select wire for each device; I2C sends the device's address on the shared wires", "<strong>I2C</strong> picks a device by address")]) }
  ];

  Lab.page({
    lab: 3,
    collapseWorking: true,
    sections,
    groups: [
      { key: "kit", list: "#kitList", toc: "#kitToc" },
      { key: "l1", list: "#l1List" },
      { key: "l2", list: "#l2List", toc: "#l2Toc" },
      { key: "l3", list: "#l3List", toc: "#l3Toc" },
      { key: "l4", list: "#l4List", toc: "#l4Toc" },
      { key: "task", list: "#taskList" }
    ],
    exercises, exList: "#exList", exerciseCarousel: true
  });
  const GATE = LabKit.gate(BANK, "nmk-lab3-prelab");
  GATE.mount($("#quizBox"));
  GATE.setLock(GATE.passed());
  LabKit.stepCaption();
  // A link straight to a locked part lands on the lock notice instead
  if (!GATE.passed() && /^#(task|plan)$/.test(location.hash)) setTimeout(() => $("#labtask").scrollIntoView(), 0);
})();
