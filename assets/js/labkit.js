/* NMK42003 virtual labs: the pieces every lab page shares (first written for Lab 1).
   Drawings of the ESP32 DevKit V1, TUNIOT-style blocks, the phone and Serial Monitor mock-ups,
   the equipment checklist, the name box, the Pre-Lab Check quiz gate and the step-bar caption.
   Styles are in lab1.css. The page, calculator and exercise engine is in lab.js. */
(function () {
  "use strict";

  const { esc, reduceMotion, store, stepsHtml } = Lab;
  const $ = (s, r = document) => r.querySelector(s);
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Run a tick while the page is open (cheap; stops when the element leaves the page)
  function every(el, ms, fn) { const id = setInterval(() => { if (!el.isConnected) return clearInterval(id); fn(); }, ms); return id; }
  const W_ = (steps, h = "Working") => `<div class="working"><h4>${h}</h4><ol class="steps">${stepsHtml(steps)}</ol></div>`;

  /* =====================================================================
     The name box: the name goes into the Bluetooth name, the Serial Monitor and the hotspot name
     nameBox({ key, label, out: (who) => html }) → { who, bt, on(fn) }
     ===================================================================== */
  function nameBox(o) {
    const clean = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 14);
    let NAME = clean(store.get(o.key, ""));
    const listeners = [], api = { who: () => NAME || "YourName", bt: () => `ESP32_${NAME || "YourName"}`, on: (f) => listeners.push(f) };
    const box = $("#nameBox");
    if (!box) return api;
    box.innerHTML = `<label for="yourName">${o.label || "Your name"} <span class="hint">letters and numbers, no spaces</span></label>
      <div class="name-row"><input id="yourName" type="text" maxlength="14" autocomplete="off" spellcheck="false" placeholder="e.g. Aina">
      <span class="name-out" id="nameOut"></span></div>`;
    const inp = $("#yourName", box), out = $("#nameOut", box);
    const paint = () => { out.innerHTML = o.out ? o.out(api) : `Your ESP32's Bluetooth name: <strong>${esc(api.bt())}</strong>`; };
    inp.value = NAME;
    paint();
    inp.addEventListener("input", () => {
      NAME = clean(inp.value);
      store.set(o.key, NAME);
      paint();
      listeners.forEach((f) => f());
    });
    return api;
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
     Equipment and software checklist: kit(KEY, KIT, SOFT) → mount(el)
     KIT rows are [name, note]; SOFT rows are [name, note, url]
     ===================================================================== */
  const kit = (KEY, KIT, SOFT) => function mountKit(el) {
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
  };

  /* =====================================================================
     Pre-Lab Check quiz: unlocks the Lab Task at 7/10. gate(BANK, PASS_KEY) → { mount, setLock, passed }
     One question at a time (arrows, dots, swipe). A random 10 from the bank, options shuffled.
     Picking an answer moves on to the next unanswered question. No marks until all 10 are submitted.
     The first attempt is the score. Wrong answers can then be re-answered until right (to learn),
     and a new random set is offered once they are all corrected. A pass is remembered on this device.
     ===================================================================== */
  function gate(BANK, PASS_KEY) {
    const PASS_MARK = 7, NQ = 10;
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
    return { mount: mountPrelab, setLock, passed: () => store.get(PASS_KEY, null) };
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

  window.LabKit = {
    $, T, sleep, clamp, every, W_, nameBox,
    TOP, BOT, pinXY, board, laptop, router, phoneIco, btMark, fly, serialBox, serialOut, phoneFrame,
    bf, bs, bn, inl, bk, ws, HEAD, kit, gate, stepCaption
  };
})();
