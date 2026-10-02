/* NMK42003 interactive chapters: shared engine.
   Number formatting, live calculators (inputs → step-by-step working), circuit drawing helpers,
   Bode plots, exercises (working unlocks only after a correct answer) and page setup.
   Each chapter script defines its sections and exercises, then calls Lab.page({...}). */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAU = 2 * Math.PI;
  const MINUS = "−";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* =====================================================================
     Number formatting
     ===================================================================== */
  const PREFIXES = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const sgn = (x) => (x < 0 ? MINUS : "");

  // Plain number to 4 significant figures; scientific notation when very large or small.
  function num(x, sig = 4) {
    if (!isFinite(x)) return (x < 0 ? MINUS : "") + "∞";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return sgn(x) + Number(a.toPrecision(sig)).toString();
    const [m, e] = a.toExponential(sig - 1).split("e");
    return `${sgn(x)}${Number(m)} × 10<sup>${e[0] === "-" ? MINUS + e.slice(1) : e.slice(1)}</sup>`;
  }

  // Engineering notation with an SI prefix: eng(47000, "Ω") → "47 kΩ".
  function eng(x, unit, sig = 4) {
    if (!isFinite(x)) return `${x < 0 ? MINUS : ""}∞ ${unit}`;
    if (x === 0) return `0 ${unit}`;
    const a = Math.abs(x);
    let i = PREFIXES.findIndex(([m]) => a >= m);
    if (i < 0) i = PREFIXES.length - 1;
    let m = Number((a / PREFIXES[i][0]).toPrecision(sig));
    if (m >= 1000 && i > 0) { i--; m = Number((a / PREFIXES[i][0]).toPrecision(sig)); }
    return `${sgn(x)}${m} ${PREFIXES[i][1]}${unit}`;
  }

  // Number with a plain unit (no SI prefix): withUnit(12.5, "°C") → "12.5 °C"
  const withUnit = (x, unit, sig = 4) => (unit ? `${num(x, sig)} ${unit}` : num(x, sig));
  const P = (x, u) => (x < 0 ? `(${eng(x, u)})` : eng(x, u)); // bracket negatives when substituting
  const PN = (x, sig) => (x < 0 ? `(${num(x, sig)})` : num(x, sig));
  const dB = (ratio) => 20 * Math.log10(ratio);
  const fmtDb = (d) => (isFinite(d) ? `${num(Math.round(d * 100) / 100, 3)} dB` : `${MINUS}∞ dB`);
  const same = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b));

  // "R1" → R<sub>1</sub>, "Vout" → V<sub>out</sub>
  function n(k) {
    if (k === "Vcc") return "V<sub>CC</sub>";
    const m = /^([A-Za-z])([A-Za-z0-9+−]+)$/.exec(k);
    return m ? `${m[1]}<sub>${m[2]}</sub>` : k;
  }

  /* =====================================================================
     Input kinds
     ===================================================================== */
  const KINDS = {
    R: { units: [["Ω", 1], ["kΩ", 1e3], ["MΩ", 1e6]], si: "Ω", positive: true },
    C: { units: [["pF", 1e-12], ["nF", 1e-9], ["µF", 1e-6]], si: "F", positive: true },
    L: { units: [["µH", 1e-6], ["mH", 1e-3], ["H", 1]], si: "H", positive: true },
    f: { units: [["Hz", 1], ["kHz", 1e3], ["MHz", 1e6]], si: "Hz", positive: true, slider: "log" },
    V: { units: [["V", 1]], si: "V", slider: "lin" },
    Vac: { units: [["V", 1]], si: "V", positive: true },
    Vcc: { units: [["V", 1]], si: "V" },
    // Generic number with its own unit label: F("Yn", "num", 80, "expected value", { unit: "V", positive: true })
    num: { units: null, si: "" }
  };
  const unitsOf = (f) => (f.kind === "num" ? [[f.unit || "", 1]] : KINDS[f.kind].units);
  const isPositive = (f) => (f.positive !== undefined ? f.positive : !!KINDS[f.kind].positive);

  // Field definition helper: F("R1", "R", 10e3, "input resistor")
  const F = (k, kind, d, hint, extra) => Object.assign({ k, kind, d, hint }, extra);

  /* =====================================================================
     Circuit drawing helpers (SVG)
     ===================================================================== */
  const D = {
    wire: (...p) => `<polyline class="w" points="${p.map((q) => q.join(",")).join(" ")}"/>`,
    dot: (x, y) => `<circle class="dot" cx="${x}" cy="${y}" r="3"/>`,
    term: (x, y) => `<circle class="term" cx="${x}" cy="${y}" r="4"/>`,
    gnd: (x, y) => `<path class="w" d="M${x},${y}v6M${x - 12},${y + 6}h24M${x - 7},${y + 11}h14M${x - 3},${y + 16}h6"/>`,
    text: (x, y, html, anchor = "middle") => `<text x="${x}" y="${y}" text-anchor="${anchor}">${html}</text>`,
    // Resistor between two points on a horizontal or vertical line (left→right or top→bottom)
    res(x1, y1, x2, y2) {
      const h = y1 === y2, a = ((h ? x2 - x1 : y2 - y1) - 36) / 2;
      const d = h
        ? `M${x1},${y1}h${a}l3,-7l6,14l6,-14l6,14l6,-14l6,14l3,-7h${a}`
        : `M${x1},${y1}v${a}l7,3l-14,6l14,6l-14,6l14,6l-14,6l7,3v${a}`;
      return `<path class="w" d="${d}"/>`;
    },
    cap(x1, y1, x2, y2) {
      const h = y1 === y2, a = ((h ? x2 - x1 : y2 - y1) - 8) / 2;
      return h
        ? `<path class="w" d="M${x1},${y1}h${a}M${x1 + a},${y1 - 12}v24M${x1 + a + 8},${y1 - 12}v24M${x1 + a + 8},${y1}h${a}"/>`
        : `<path class="w" d="M${x1},${y1}v${a}M${x1 - 12},${y1 + a}h24M${x1 - 12},${y1 + a + 8}h24M${x1},${y1 + a + 8}v${a}"/>`;
    },
    ind(x1, y, x2) {
      const a = (x2 - x1 - 40) / 2;
      return `<path class="w" d="M${x1},${y}h${a}a5,5 0 0 1 10,0a5,5 0 0 1 10,0a5,5 0 0 1 10,0a5,5 0 0 1 10,0h${a}"/>`;
    },
    // Op-amp with inputs at (x, y∓20) and output at (x+80, y)
    opamp(x, y, plusTop) {
      const [top, bot] = plusTop ? ["+", MINUS] : [MINUS, "+"];
      return `<path class="op" d="M${x},${y - 45}L${x + 80},${y}L${x},${y + 45}Z"/>` +
        `<text class="sign" x="${x + 12}" y="${y - 15}" text-anchor="middle">${top}</text>` +
        `<text class="sign" x="${x + 12}" y="${y + 25}" text-anchor="middle">${bot}</text>`;
    }
  };

  function svgName(k) {
    const m = /^([A-Za-z])([A-Za-z0-9]+)$/.exec(k);
    return m ? `${m[1]}<tspan class="sb" dy="4">${m[2]}</tspan><tspan dy="-4">` : `${esc(k)}<tspan>`;
  }

  /* =====================================================================
     Calculation helpers
     ===================================================================== */
  const step = (t, f, s, r) => ({ t, f, s, r });

  // Bisection in log-frequency for mag(f) = target, between lo and hi.
  function crossing(mag, target, lo, hi) {
    let a = Math.log10(lo), b = Math.log10(hi);
    const g = (x) => mag(10 ** x) - target, ga = g(a);
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if ((g(m) > 0) === (ga > 0)) a = m; else b = m; }
    return 10 ** ((a + b) / 2);
  }

  const stepsHtml = (steps) => steps.map((s, i) =>
    `<li><div class="st-t"><span class="st-n" aria-hidden="true">${i + 1}</span><span>${s.t}</span></div>` +
    (s.f ? `<div class="st-f">${s.f}</div>` : "") + (s.s ? `<div class="st-s">${s.s}</div>` : "") +
    `<div class="st-r">${s.r}</div></li>`).join("");

  // Collapsed-by-default panel for step-by-step working
  const fold = (title, inner, open = false) => `<details class="working fold"${open ? " open" : ""}><summary><span class="fold-t">${title}</span><span class="fold-h" aria-hidden="true"></span></summary><div class="fold-body">${inner}</div></details>`;

  const notesHtml = (notes) => notes.map((x) => `<div class="callout ${x.type}"><strong>${x.title}</strong>${x.html}</div>`).join("");

  /* =====================================================================
     Calculator sections
     A section is either a calculator ({inputs, compute, diagram?, bode?, render?})
     or a custom widget ({mount(el)}). Both get a heading, an explanation and optional notes.
     ===================================================================== */
  const BY_ID = {};
  // Look up a field inside its section (works before the section is added to the page).
  const byId = (sec, id) => sec.el.querySelector(`[id="${id}"]`);

  function fieldHtml(sec, f) {
    const id = `${sec.id}-${f.k}`;
    if (f.kind === "sel") {
      return `<div class="field" data-k="${f.k}"><label for="${id}">${f.label}</label>
        <div class="ctl"><select id="${id}">${f.options.map(([val, l]) => `<option value="${val}">${esc(l)}</option>`).join("")}</select></div></div>`;
    }
    const K = KINDS[f.kind], units = unitsOf(f);
    const unitCtl = units.length > 1
      ? `<select id="${id}-u" aria-label="${f.k} unit">${units.map(([u], i) => `<option value="${i}">${u}</option>`).join("")}</select>`
      : units[0][0] ? `<span class="unit">${units[0][0]}</span>` : "";
    const sl = f.slider || (K.slider === "lin" ? { min: -15, max: 15, step: 0.1 } : null);
    const slider = K.slider === "log"
      ? `<input type="range" id="${id}-s" min="0" max="6" step="0.01" aria-label="${f.k} slider, 1 Hz to 1 MHz">`
      : sl ? `<input type="range" id="${id}-s" min="${sl.min}" max="${sl.max}" step="${sl.step}" aria-label="${f.k} slider">` : "";
    return `<div class="field" data-k="${f.k}">
      <label for="${id}">${f.label || n(f.k)}${f.hint ? ` <span class="hint">${f.hint}</span>` : ""}</label>
      <div class="ctl"><input id="${id}" type="number" step="any"${isPositive(f) || f.kind === "Vcc" ? ' inputmode="decimal"' : ""}${f.opt ? ' placeholder="optional"' : ""} aria-describedby="${id}-err">${unitCtl}</div>
      ${slider}
      <p class="err" id="${id}-err" hidden></p>
    </div>`;
  }

  function setField(sec, f, si) {
    const inp = byId(sec, `${sec.id}-${f.k}`);
    if (f.kind === "sel") { inp.value = si; return; }
    const units = unitsOf(f), us = byId(sec, `${sec.id}-${f.k}-u`);
    if (si === null || si === undefined) { inp.value = ""; if (us) us.value = 1; return; } // blank optional field: offer the middle unit (e.g. kΩ)
    let i = 0;
    units.forEach(([, m], j) => { if (Math.abs(si) >= m * 0.9999) i = j; });
    if (us) us.value = i;
    inp.value = Number((si / units[i][1]).toPrecision(6));
  }

  function readField(sec, f) {
    const inp = byId(sec, `${sec.id}-${f.k}`);
    if (f.kind === "sel") return { val: inp.value };
    if (inp.validity && inp.validity.badInput) return { err: "Enter a number." };
    const raw = inp.value.trim();
    if (raw === "") return f.opt ? { val: null } : { err: "Enter a value." };
    const us = byId(sec, `${sec.id}-${f.k}-u`);
    const si = Number(raw) * unitsOf(f)[us ? +us.value : 0][1];
    if (!isFinite(si)) return { err: "Enter a number." };
    if (isPositive(f) && si <= 0) return { err: `${f.name || f.k} must be greater than 0.` };
    const custom = f.validate && f.validate(si);
    if (custom) return { err: custom };
    return { val: si };
  }

  const labelOf = (f, val) => (f.kind === "num" ? withUnit(val, f.unit) : eng(val, KINDS[f.kind].si));

  function update(sec) {
    if (!sec.inputs) return;
    const v = {}, lab = {};
    let bad = 0;
    sec.inputs.filter((f) => f.kind === "sel").forEach((f) => { v[f.k] = readField(sec, f).val; });
    sec.inputs.forEach((f) => {
      if (f.kind === "sel") return;
      const wrap = sec.el.querySelector(`.field[data-k="${f.k}"]`), shown = !f.show || f.show(v);
      wrap.hidden = !shown;
      if (!shown) return;
      const r = readField(sec, f);
      const inp = byId(sec, `${sec.id}-${f.k}`), err = byId(sec, `${sec.id}-${f.k}-err`);
      if (r.err) {
        bad++; lab[f.k] = "?";
        inp.setAttribute("aria-invalid", "true"); err.textContent = r.err; err.hidden = false;
      } else {
        v[f.k] = r.val; lab[f.k] = r.val === null ? null : labelOf(f, r.val);
        inp.removeAttribute("aria-invalid"); err.hidden = true;
        const s = byId(sec, `${sec.id}-${f.k}-s`);
        if (s && r.val !== null && document.activeElement !== s) s.value = KINDS[f.kind].slider === "log" ? Math.log10(r.val) : r.val;
      }
    });

    const res = bad ? null : sec.compute(v);
    lab.Vout = res && res.vout !== undefined ? eng(res.vout, "V") : "?";
    lab.over = !!(res && res.over);

    if (sec.diagram) {
      const T = (x, y, k, anchor = "middle") => {
        const val = lab[k] === undefined ? "?" : lab[k];
        const cls = val === "?" ? "val bad" : k === "Vout" && lab.over ? "val over" : "val";
        return D.text(x, y, `${svgName(k)} = </tspan><tspan class="${cls}">${val}</tspan>`, anchor);
      };
      sec.el.querySelector(".ckt-wrap").innerHTML =
        `<svg class="ckt" viewBox="${sec.view}" role="img" aria-label="${esc(sec.figLabel || "Circuit diagram: " + sec.title.replace(/<[^>]+>/g, ""))}">${sec.diagram(T, lab, v, res)}</svg>`;
    }

    const result = sec.el.querySelector(".result"), steps = sec.el.querySelector(".steps"), warn = sec.el.querySelector(".warnings");
    if (!res) {
      result.innerHTML = `Fix the highlighted value${bad > 1 ? "s" : ""} to see the working.`;
      steps.innerHTML = ""; warn.innerHTML = "";
      if (sec.bode) { sec.lastBode = null; sec.el.querySelector(".bode-plot").innerHTML = ""; }
      if (sec.render) sec.render(sec.el.querySelector(".extra"), null, v);
      return;
    }
    result.innerHTML = res.sum;
    steps.innerHTML = stepsHtml(res.steps);
    warn.innerHTML = notesHtml(res.notes || []);
    if (sec.bode) { sec.lastBode = Object.assign({ f: v.f }, res.bode); drawBode(sec); }
    if (sec.render) sec.render(sec.el.querySelector(".extra"), res, v);
  }

  function buildSection(sec) {
    const el = document.createElement("section");
    el.className = "circuit";
    el.id = sec.id;
    el.setAttribute("aria-labelledby", `${sec.id}-h`);
    const head = `<h3 id="${sec.id}-h" tabindex="-1">${sec.title}</h3>${sec.intro ? `<div class="explain">${sec.intro}</div>` : ""}`;
    sec.el = el;
    BY_ID[sec.id] = sec;

    if (sec.mount) { // custom widget
      el.innerHTML = `${head}<div class="widget"></div>${sec.after || ""}`;
      sec.mount(el.querySelector(".widget"), sec);
      return el;
    }

    const form = `<form class="inputs${sec.inputs.length > 5 ? " many" : ""}" novalidate aria-label="${esc(sec.title.replace(/<[^>]+>/g, ""))} values">${sec.inputs.map((f) => fieldHtml(sec, f)).join("")}</form>`;
    el.innerHTML = `
      ${head}
      ${sec.diagram
        ? `<div class="c-grid">
            <figure class="diagram"><div class="ckt-wrap"></div><figcaption>${sec.caption || "The labels update as you change the values."}<span class="swipe"> Swipe sideways to see the whole diagram.</span></figcaption></figure>
            ${form}
          </div>`
        : `<div class="c-grid single">${form}</div>`}
      ${sec.collapse
        ? `<p class="result fold-result" aria-live="polite"></p>${fold("Step-by-Step Working", `<ol class="steps"></ol>`)}`
        : `<div class="working">
        <h4>Step-by-Step Working</h4>
        <p class="result" aria-live="polite"></p>
        <ol class="steps"></ol>
      </div>`}
      <div class="warnings"></div>
      ${sec.render ? `<div class="extra"></div>` : ""}
      ${sec.bode ? `<div class="bode"><h4>Frequency Response (Bode Magnitude Plot)</h4><div class="bode-plot"></div>
        <p class="bode-cap">Gain in dB against frequency on a log scale. Dashed lines mark the cut-off frequencies and the −3 dB level, and the red dot is your chosen f. Click or tap the graph to move f.</p></div>` : ""}
      ${sec.after || ""}`;

    el.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
    el.addEventListener("input", (e) => {
      const t = e.target;
      if (!t.closest("form.inputs")) return;
      if (t.type === "range") {
        const f = sec.inputs.find((x) => t.id === `${sec.id}-${x.k}-s`);
        const si = KINDS[f.kind].slider === "log" ? 10 ** +t.value : +t.value;
        setField(sec, f, Number(si.toPrecision(f.sliderSig || 3)));
      }
      update(sec);
    });
    if (sec.bode) {
      el.querySelector(".bode-plot").addEventListener("click", (e) => {
        const b = sec.lastBode, svg = e.currentTarget.querySelector("svg");
        if (!b || !svg) return;
        const box = svg.getBoundingClientRect(), x = ((e.clientX - box.left) / box.width) * b.W;
        if (x < b.l || x > b.W - b.r) return;
        const f = 10 ** (b.d0 + ((x - b.l) / (b.W - b.l - b.r)) * (b.d1 - b.d0));
        setField(sec, sec.inputs.find((i) => i.k === "f"), Number(f.toPrecision(3)));
        update(sec);
      });
    }
    sec.inputs.forEach((f) => setField(sec, f, f.d));
    return el;
  }

  function scrollToSection(sec) {
    sec.el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    sec.el.classList.remove("flash"); void sec.el.offsetWidth; sec.el.classList.add("flash");
    const h = $(`#${sec.id}-h`); if (h) h.focus({ preventScroll: true });
  }

  function loadValues(secId, vals, scroll) {
    const sec = BY_ID[secId];
    if (sec.load) sec.load(vals); // custom widgets load their own way
    else {
      // selects first so dependent fields are shown before they're filled
      sec.inputs.filter((f) => f.kind === "sel" && f.k in vals).forEach((f) => setField(sec, f, vals[f.k]));
      sec.inputs.filter((f) => f.kind !== "sel" && f.k in vals).forEach((f) => setField(sec, f, vals[f.k]));
      update(sec);
    }
    if (scroll) scrollToSection(sec);
  }

  /* =====================================================================
     Bode plot
     ===================================================================== */
  function drawBode(sec) {
    const b = sec.lastBode, host = sec.el.querySelector(".bode-plot");
    if (!b) return;
    const W = Math.max(300, Math.round(host.clientWidth || 640)), narrow = W < 520;
    const H = narrow ? 250 : 300, l = narrow ? 44 : 54, r = 14, t = 26, bt = 36;
    const pw = W - l - r, ph = H - t - bt;
    const keys = b.marks.map((m) => m.f).concat(b.f);
    let d0 = Math.floor(Math.log10(Math.min(...keys))) - 1, d1 = Math.ceil(Math.log10(Math.max(...keys))) + 1;
    while (d1 - d0 < 4) { d0--; d1++; }
    const maxDec = narrow ? 6 : 9;
    if (d1 - d0 > maxDec) { // too wide: centre on the filter's own frequencies
      const mk = b.marks.map((m) => Math.log10(m.f)), mid = (Math.min(...mk) + Math.max(...mk)) / 2;
      d0 = Math.floor(mid - maxDec / 2); d1 = d0 + maxDec;
    }
    Object.assign(b, { W, l, r, d0, d1 });
    const X = (f) => l + ((Math.log10(f) - d0) / (d1 - d0)) * pw;

    const N = 360, pts = [];
    let maxDb = -Infinity;
    for (let i = 0; i < N; i++) {
      const f = 10 ** (d0 + (i / (N - 1)) * (d1 - d0)), g = dB(b.mag(f));
      pts.push([f, g]); if (g > maxDb) maxDb = g;
    }
    const top = Math.ceil((maxDb + 4) / 10) * 10, bot = top - 70;
    const Y = (g) => t + ((top - Math.max(bot, Math.min(top, g))) / (top - bot)) * ph;

    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(bodeLabel(b))}">`;
    for (let k = d0; k <= d1; k++) {
      s += `<line class="gl" x1="${X(10 ** k)}" x2="${X(10 ** k)}" y1="${t}" y2="${t + ph}"/>`;
      if (!narrow || (k - d0) % 2 === 0 || d1 - d0 <= 3) s += `<text class="axis" x="${X(10 ** k)}" y="${H - bt + 18}" text-anchor="${k === d1 ? "end" : "middle"}">${eng(10 ** k, "Hz", 3)}</text>`;
      if (k < d1) for (let m = 2; m <= 9; m++) s += `<line class="gl minor" x1="${X(m * 10 ** k)}" x2="${X(m * 10 ** k)}" y1="${t}" y2="${t + ph}"/>`;
    }
    for (let g = top; g >= bot; g -= 10) {
      s += `<line class="gl" x1="${l}" x2="${W - r}" y1="${Y(g)}" y2="${Y(g)}"/>`;
      s += `<text class="axis" x="${l - 6}" y="${Y(g) + 4}" text-anchor="end">${num(g)}${g === top ? " dB" : ""}</text>`;
    }
    if (b.ref != null) {
      s += `<line class="ref" x1="${l}" x2="${W - r}" y1="${Y(b.ref)}" y2="${Y(b.ref)}"/>`;
      s += `<text class="reflab" x="${W - r - 4}" y="${Y(b.ref) - 5}" text-anchor="end">${fmtDb(b.ref)}</text>`;
    }
    s += `<polyline class="curve" points="${pts.map(([f, g]) => `${X(f).toFixed(1)},${Y(g).toFixed(1)}`).join(" ")}"/>`;
    b.marks.forEach((m, i) => {
      if (m.f < 10 ** d0 || m.f > 10 ** d1) return;
      const x = X(m.f), right = x > W - r - 70;
      s += `<line class="mk" x1="${x}" x2="${x}" y1="${t}" y2="${t + ph}"/>`;
      s += `<text class="mklab" x="${right ? x - 4 : x + 4}" y="${t - 8 + (i % 2) * 18}" text-anchor="${right ? "end" : "start"}">${svgMark(m.label)}</text>`;
    });
    if (b.f >= 10 ** d0 && b.f <= 10 ** d1) {
      const g = dB(b.mag(b.f)), x = X(b.f), y = Y(g), right = x > l + pw * 0.62;
      s += `<circle class="pt" cx="${x}" cy="${y}" r="5"/>`;
      const above = y - 10, nearRef = b.ref != null && Math.abs(above - 4 - Y(b.ref)) < 12;
      s += `<text class="ptlab" x="${right ? x - 10 : x + 10}" y="${y < t + 30 || nearRef ? y + 20 : above}" text-anchor="${right ? "end" : "start"}">${eng(b.f, "Hz")}: ${fmtDb(g)}</text>`;
    }
    s += `</svg>`;
    host.innerHTML = s;
  }

  function svgMark(label) {
    const m = /^([fR])([a-zLH0-9]+)(.*)$/.exec(label);
    return m ? `${m[1]}<tspan class="sb" dy="3">${m[2]}</tspan><tspan dy="-3">${esc(m[3])}</tspan>` : esc(label);
  }

  function bodeLabel(b) {
    const s = `Bode magnitude plot from ${eng(10 ** b.d0, "Hz", 3)} to ${eng(10 ** b.d1, "Hz", 3)}. ` +
      b.marks.map((m) => `${m.label} at ${eng(m.f, "Hz")}`).join(", ") +
      `. At ${eng(b.f, "Hz")} the gain is ${fmtDb(dB(b.mag(b.f)))}.`;
    return s.replace(/<[^>]+>/g, "").replace(/−/g, "minus ");
  }

  /* =====================================================================
     Exercises
     The full working only appears once every answer is correct. Wrong attempts unlock hints
     one at a time, and "Load into calculator" unlocks with the working (the calculator would
     otherwise give the answer away). Solved exercises are remembered on this device.
     ===================================================================== */
  const SOLVED_KEY = "nmk-solved";
  const parseAnswer = (s) => {
    const t = s.trim().replace(/[−–]/g, "-").replace(/[,\s%]/g, "").replace(/[a-zA-Zµ°Ω]+$/, "");
    return t === "" ? NaN : Number(t);
  };
  const isRight = (a, x) => Math.abs(x - a.v) <= (a.tol !== undefined ? a.tol : a.v === 0 ? 1e-3 : (a.rel || 0.02) * Math.abs(a.v));

  function exerciseWorking(ex) {
    if (ex.working) return ex.working();
    const sec = BY_ID[ex.sec];
    return ex.runs.map((r) => {
      const vals = {};
      sec.inputs.forEach((f) => { vals[f.k] = f.d; });
      Object.assign(vals, r.vals);
      const res = sec.compute(vals);
      return `<div class="working">${r.label ? `<h4>${r.label}</h4>` : "<h4>Working</h4>"}<p class="result">${res.sum}</p><ol class="steps">${stepsHtml(res.steps)}</ol></div>` +
        ((res.notes || []).some((x) => x.type === "warn") ? `<div class="warnings">${notesHtml(res.notes.filter((x) => x.type === "warn"))}</div>` : "");
    }).join("");
  }

  function buildExercise(ex) {
    const el = document.createElement("article");
    el.className = "ex";
    el.id = ex.id;
    el.setAttribute("aria-labelledby", `${ex.id}-h`);
    const runs = ex.runs || [];
    const loads = ex.sec ? runs.map((r, i) => `<button type="button" class="btn ghost" data-load="${i}" disabled>Load into calculator${runs.length > 1 ? ` (${r.label.replace("At ", "")})` : ""}</button>`).join("") : "";
    const hints = ex.hints || [];
    el.innerHTML = `
      <div class="ex-head"><h3 id="${ex.id}-h">${ex.title}</h3><span class="ex-badge" hidden>✓ Solved</span></div>
      <div class="q">${ex.q}</div>
      <form class="ex-answers" novalidate>
        ${ex.ans.map((a, i) => `<div class="ans">
          <label for="${ex.id}-a${i}">${a.l}</label>
          <span class="ans-in">${a.opts
            ? `<select id="${ex.id}-a${i}"><option value="">Choose…</option>${a.opts.map((o, k) => `<option value="${k}">${esc(o)}</option>`).join("")}</select>`
            : `<input id="${ex.id}-a${i}" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">`}${a.u ? `<span class="unit">${a.u}</span>` : ""}</span>
          <span class="mark" id="${ex.id}-m${i}"></span>
        </div>`).join("")}
        <div class="ex-actions">
          <button type="submit" class="btn">Check answers</button>
          <button type="button" class="btn ghost" data-reveal hidden aria-expanded="false" aria-controls="${ex.id}-w">Hide working</button>
          ${loads}
        </div>
        <p class="ex-status" aria-live="polite">Work it out, then check. The full working unlocks when all your answers are correct${hints.length ? `, and each wrong try unlocks a hint` : ""}.</p>
      </form>
      <div class="ex-hints"></div>
      <div class="ex-working" id="${ex.id}-w" hidden></div>
      ${ex.note ? `<div class="callout note">${ex.note}</div>` : ""}`;

    const status = el.querySelector(".ex-status"), hintBox = el.querySelector(".ex-hints"), w = el.querySelector(".ex-working");
    const reveal = el.querySelector("[data-reveal]"), badge = el.querySelector(".ex-badge");
    let tries = 0;

    const unlock = (fresh) => {
      if (!w.innerHTML) w.innerHTML = exerciseWorking(ex);
      el.classList.add("solved");
      badge.hidden = false;
      el.querySelectorAll("[data-load]").forEach((b) => { b.disabled = false; });
      reveal.hidden = false;
      w.hidden = !fresh;
      reveal.setAttribute("aria-expanded", fresh);
      reveal.textContent = fresh ? "Hide working" : "Show working";
      if (fresh) {
        const solved = store.get(SOLVED_KEY, []);
        if (!solved.includes(ex.id)) store.set(SOLVED_KEY, solved.concat(ex.id));
      }
    };

    el.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      let blank = 0, right = 0;
      ex.ans.forEach((a, i) => {
        const raw = $(`#${ex.id}-a${i}`, el).value, mark = $(`#${ex.id}-m${i}`, el);
        const x = a.opts ? (raw === "" ? NaN : +raw) : parseAnswer(raw);
        if (!isFinite(x)) { blank++; mark.className = "mark"; mark.textContent = a.opts ? "Choose an answer" : "Enter a number"; return; }
        const ok = a.opts ? x === a.v : isRight(a, x);
        if (ok) right++;
        mark.className = `mark ${ok ? "ok" : "no"}`;
        mark.textContent = ok ? "✓ Correct" : "✗ Not yet";
      });
      if (blank) { status.textContent = `Answer all ${ex.ans.length} part${ex.ans.length > 1 ? "s" : ""} before checking.`; return; }
      if (right === ex.ans.length) {
        status.innerHTML = `<strong>✓ All correct, well done!</strong> Compare your method with the full working below.`;
        unlock(true);
        return;
      }
      tries++;
      const shown = Math.min(tries, hints.length);
      hintBox.innerHTML = hints.slice(0, shown).map((h, i) => `<div class="callout hint"><strong>Hint ${i + 1}</strong>${h}</div>`).join("");
      status.innerHTML = `${right} of ${ex.ans.length} correct.` + (shown && tries <= hints.length ? ` Hint ${shown} is now showing below.` : ` Check your units and rounding, then try again.`);
    });
    reveal.addEventListener("click", () => {
      const open = w.hidden;
      w.hidden = !open;
      reveal.setAttribute("aria-expanded", open);
      reveal.textContent = open ? "Hide working" : "Show working";
    });
    el.querySelectorAll("[data-load]").forEach((btn) => btn.addEventListener("click", () => loadValues(ex.sec, runs[+btn.dataset.load].vals, true)));

    if (store.get(SOLVED_KEY, []).includes(ex.id)) {
      unlock(false);
      badge.textContent = "✓ Solved before";
      status.textContent = "You've solved this one on this device. Try it again, or open the working.";
    }
    return el;
  }

  /* =====================================================================
     Shared widgets: chip buttons, quizzes, code blocks
     ===================================================================== */
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const chips = (label, opts, cur) =>
    `<div class="chips-row" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button type="button" class="chip-btn" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div>`;
  function wireChips(row, onPick) {
    row.addEventListener("click", (e) => {
      const b = e.target.closest(".chip-btn");
      if (!b) return;
      row.querySelectorAll(".chip-btn").forEach((x) => x.setAttribute("aria-pressed", x === b));
      onPick(b.dataset.v);
    });
  }

  // One-question-at-a-time quiz with instant feedback and a score.
  function quiz(el, qs) {
    let order, i, score;
    const start = () => { order = shuffle(qs.map((_, k) => k)); i = 0; score = 0; draw(); };
    const draw = (focus) => {
      if (i >= order.length) {
        const msg = score === qs.length ? "Perfect score!" : score >= qs.length * 0.7 ? "Good work. Try again to get them all." : "Read the section above again, then have another go.";
        el.innerHTML = `<div class="quiz-card done"><p class="quiz-score">You scored <strong>${score} out of ${qs.length}</strong>. ${msg}</p><button type="button" class="btn" data-again>Try again</button></div>`;
        el.querySelector("[data-again]").onclick = () => { start(); el.querySelector(".quiz-opt").focus(); };
        if (focus) el.querySelector("[data-again]").focus();
        return;
      }
      const q = qs[order[i]];
      let answered = false;
      el.innerHTML = `<div class="quiz-card">
        <div class="quiz-top"><span>Question ${i + 1} of ${qs.length}</span><span>Score: ${score}</span></div>
        <p class="quiz-q">${q.q}</p>
        <div class="quiz-opts">${q.opts.map((o, k) => `<button type="button" class="quiz-opt" data-k="${k}">${o}</button>`).join("")}</div>
        <p class="quiz-fb" aria-live="polite"></p>
        <button type="button" class="btn" data-next hidden>${i + 1 < qs.length ? "Next question" : "See your score"}</button>
      </div>`;
      el.querySelectorAll(".quiz-opt").forEach((b) => (b.onclick = () => {
        if (answered) return;
        answered = true;
        const ok = +b.dataset.k === q.a;
        if (ok) score++;
        el.querySelectorAll(".quiz-opt").forEach((x) => { x.disabled = true; if (+x.dataset.k === q.a) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        el.querySelector(".quiz-fb").innerHTML = `<strong>${ok ? "✓ Correct." : "✗ Not quite."}</strong> ${q.why}`;
        const nx = el.querySelector("[data-next]");
        nx.hidden = false; nx.focus();
        nx.onclick = () => { i++; draw(true); if (i < order.length) el.querySelector(".quiz-opt").focus(); };
      }));
    };
    start();
  }


  // Copyable code block with light syntax colouring (Arduino C++).
  function codeBlock(src, title = "Arduino sketch") {
    const KW = /\b(void|if|else|for|while|do|return|const|static|true|false|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP)\b/;
    const TY = /\b(int|long|float|double|char|bool|byte|String|uint8_t|uint16_t|uint32_t|WebServer|WiFiClient)\b/;
    const html = esc(src).replace(/&#39;/g, "'").split("\n").map((line) => {
      const ci = line.indexOf("//");
      const body = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? `<span class="com">${line.slice(ci)}</span>` : "";
      let b = body.replace(/(&quot;.*?&quot;)/g, "\u0001$1\u0002");
      b = b.split(/(\u0001.*?\u0002)/).map((part) => part.startsWith("\u0001") ? `<span class="str">${part.slice(1, -1)}</span>`
        : part.replace(/^(\s*#\w+.*)$/, '<span class="pp">$1</span>')
          .replace(new RegExp(KW.source, "g"), '<span class="kw">$1</span>')
          .replace(new RegExp(TY.source, "g"), '<span class="ty">$1</span>')
          .replace(/\b([A-Za-z_]\w*)(?=\()/g, (m, n) => (/^(if|for|while)$/.test(n) ? m : `<span class="fn">${n}</span>`))
          .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="num">$1</span>')).join("");
      return b + com;
    }).join("\n");
    return `<div class="code"><div class="code-head"><span>${esc(title)}</span><button type="button" class="code-copy" data-code="${esc(src)}">Copy code</button></div><pre><code>${html}</code></pre></div>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".code-copy");
    if (!b) return;
    const done = () => { b.textContent = "Copied ✓"; setTimeout(() => (b.textContent = "Copy code"), 1500); };
    const txt = b.dataset.code;
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, () => fallback());
    else fallback();
    function fallback() {
      const t = document.createElement("textarea"); t.value = txt; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (err) { b.textContent = "Select and copy"; } t.remove();
    }
  });

  /* =====================================================================
     Animated notes (Chapters 3 and 4): video links, animation player, small SVG plots
     ===================================================================== */
  const T = (x, y, t, a = "middle", c = "") => `<text x="${x}" y="${y}" text-anchor="${a}"${c ? ` class="${c}"` : ""}>${t}</text>`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const video = (id, title, by) => `<a class="video" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">
      <span class="video-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      <span class="video-t"><strong>${title}</strong><small>${by} · YouTube</small></span></a>`;
  const readLink = (url, title, by) => `<a class="video" href="${url}" target="_blank" rel="noopener">
      <span class="video-play read" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></svg></span>
      <span class="video-t"><strong>${title}</strong><small>${by}</small></span></a>`;
  const watch = (items, h = "Watch") => `<div class="videos"><h4 class="sub-h">${h}</h4><div class="video-list">${items.join("")}</div></div>`;

  /* =====================================================================
     Animation player: Play / Pause / Replay and a position slider.
     Plays only while on screen (saves phone batteries). With "reduce motion"
     it never auto-plays: the slider steps through the animation instead.
     ===================================================================== */
  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>'
  };
  function player(host, watchEl, o) {
    const dur = o.dur, hold = o.hold === undefined ? 1.2 : o.hold, loop = o.loop !== false;
    let t = reduceMotion || o.auto === false ? (o.still === undefined ? dur : o.still) : 0, want = !reduceMotion && o.auto !== false, on = false, seen = false, raf = 0, last = 0, acc = 1;
    host.innerHTML = `<div class="pl"><button type="button" class="pl-b" data-a="p"></button>` +
      `<button type="button" class="pl-b" data-a="r" aria-label="Replay from the start">${ICON.again}</button>` +
      `<input type="range" class="pl-s" min="0" max="1000" step="1" aria-label="${esc(o.label || "Animation position")}"><span class="pl-t"></span></div>`;
    const pb = host.querySelector('[data-a="p"]'), sc = host.querySelector(".pl-s"), tl = host.querySelector(".pl-t");
    const btn = () => { pb.innerHTML = on ? ICON.pause : ICON.play; pb.setAttribute("aria-label", on ? "Pause animation" : "Play animation"); };
    const show = () => { const k = Math.min(t, dur); o.draw(k); sc.value = Math.round((k / dur) * 1000); tl.textContent = o.clock ? o.clock(k) : ""; };
    const tick = (now) => {
      raf = 0;
      if (!on) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now; t += dt; acc += dt;
      if (t >= dur + (loop ? hold : 0)) { if (loop) t = 0; else { t = dur; show(); stop(); return; } }
      if (acc >= 1 / 40) { acc = 0; show(); }
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (on) return; if (!loop && t >= dur) t = 0; on = true; last = performance.now(); btn(); raf = requestAnimationFrame(tick); };
    const stop = () => { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; btn(); };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; if (seen && want) start(); else if (!seen) stop(); }, { threshold: 0.2 }).observe(watchEl);
    } else { seen = true; if (want) start(); }
    pb.addEventListener("click", () => { want = !on; if (want) start(); else stop(); });
    host.querySelector('[data-a="r"]').addEventListener("click", () => { t = 0; show(); if (!reduceMotion) { want = true; start(); } });
    sc.addEventListener("input", () => { want = false; stop(); t = (sc.value / 1000) * dur; show(); });
    btn(); show();
    return { redraw: show, get t() { return t; }, set(v) { t = v; show(); }, restart() { t = 0; show(); if (want && seen) start(); },
      pause() { want = false; stop(); }, play() { if (!reduceMotion) { want = true; if (seen) start(); } } };
  }

  /* =====================================================================
     Small plotting helpers (SVG)
     ===================================================================== */
  function axes(o) {
    const W = o.W || 360, H = o.H || 230, l = o.l === undefined ? 50 : o.l, r = o.r === undefined ? 14 : o.r, t = o.t === undefined ? 14 : o.t, b = o.b === undefined ? 40 : o.b;
    const [x0, x1] = o.x, [y0, y1] = o.y, pw = W - l - r, ph = H - t - b;
    const X = (v) => l + ((v - x0) / (x1 - x0)) * pw, Y = (v) => t + (1 - (v - y0) / (y1 - y0)) * ph;
    let s = "";
    (o.xt || []).forEach((v) => { s += `<line class="gl" x1="${X(v)}" x2="${X(v)}" y1="${t}" y2="${t + ph}"/>${T(X(v), t + ph + 15, o.fx ? o.fx(v) : v, "middle", "axis")}`; });
    (o.yt || []).forEach((v) => { s += `<line class="gl" x1="${l}" x2="${l + pw}" y1="${Y(v)}" y2="${Y(v)}"/>${T(l - 5, Y(v) + 4, o.fy ? o.fy(v) : v, "end", "axis")}`; });
    s += `<path class="ax" d="M${l},${t}V${t + ph}H${l + pw}"/>`;
    if (o.xl) s += T(l + pw / 2, H - 5, o.xl, "middle", "axl");
    if (o.yl) s += `<text class="axl" transform="translate(13 ${t + ph / 2}) rotate(-90)" text-anchor="middle">${o.yl}</text>`;
    return { W, H, X, Y, l, t, pw, ph, s, clipX: (v) => clamp(v, x0, x1), clipY: (v) => clamp(v, y0, y1) };
  }
  const poly = (pts, cls) => `<polyline class="${cls}" points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
  const svg = (W, H, label, inner, cls = "plot") => `<svg class="${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
  // Sample f over [a, b] into plot coordinates
  const curve = (A, f, a, b, n = 80) => { const p = []; for (let i = 0; i <= n; i++) { const x = a + ((b - a) * i) / n; p.push([A.X(x), A.Y(A.clipY(f(x)))]); } return p; };
  const dot = (x, y, cls = "pt") => `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`;
  const label = (x, y, t, a = "start", cls = "ptlab") => T(x.toFixed(1), y.toFixed(1), t, a, cls);

  // Colour of water from cold blue to hot red
  const mixHex = (a, b, k) => {
    k = clamp(k, 0, 1);
    const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return "#" + [0, 1, 2].map((i) => Math.round(lerp(p(a, i), p(b, i), k)).toString(16).padStart(2, "0")).join("");
  };

  function pvCard(el, controls = "", foot = "") {
    el.innerHTML = `<div class="pv"><div class="pv-grid"><div class="pv-scene"></div><div class="pv-graph"></div></div>${controls}<div class="pv-pl"></div><p class="pv-read"></p>${foot}</div>`;
    const q = (s) => el.querySelector(s);
    return { el, scene: q(".pv-scene"), graph: q(".pv-graph"), pl: q(".pv-pl"), read: q(".pv-read"), box: q(".pv") };
  }
  const pick = (el, cb) => el.querySelectorAll(".chips-row").forEach((row) => wireChips(row, cb));

  /* =====================================================================
     Sound demos (Web Audio): a looped half-second buffer, quiet by default.
     tone(host) adds a Play/Stop button to host; call .play(make) where make(sampleRate, seconds)
     returns a Float32Array. Stops when the host scrolls off screen or the tab is hidden.
     ===================================================================== */
  function tone(host, label = "Play the tone") {
    const AC = window.AudioContext || window.webkitAudioContext;
    host.innerHTML = AC ? `<button type="button" class="btn ghost tone-btn" aria-pressed="false"><span class="tone-i" aria-hidden="true">♪</span> <span class="tone-l">${label}</span></button>` : `<p class="small-note">Your browser can't play sound here.</p>`;
    let ctx = null, gain = null, src = null, make = null, want = false;
    const btn = host.querySelector(".tone-btn");
    const paint = () => { if (!btn) return; btn.setAttribute("aria-pressed", want); btn.querySelector(".tone-l").textContent = want ? "Stop the tone" : label; };
    const stopSrc = () => { if (src) { try { src.stop(); } catch (e) {} src.disconnect(); src = null; } };
    const start = () => {
      if (!AC || !make) return;
      if (!ctx) { ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0.12; gain.connect(ctx.destination); }
      if (ctx.state === "suspended") ctx.resume();
      stopSrc();
      const secs = 0.5, data = make(ctx.sampleRate, secs), buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start();
    };
    const api = {
      set(fn) { make = fn; if (want) start(); },
      stop() { want = false; stopSrc(); paint(); }
    };
    if (btn) btn.addEventListener("click", () => { want = !want; if (want) start(); else stopSrc(); paint(); });
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { if (!es[es.length - 1].isIntersecting && want) api.stop(); }, { threshold: 0 }).observe(host.closest("section") || host);
    document.addEventListener("visibilitychange", () => { if (document.hidden && want) api.stop(); });
    return api;
  }

  /* =====================================================================
     Page setup
     ===================================================================== */
  const pageOf = (t) => t.page || `topic.html?ch=${t.no}`;

  // "Weeks 1 to 2" → "Weeks 1 to 2, 5 Oct to 18 Oct 2026"
  function weekDates(weeks) {
    const [y, m, d] = COURSE.semesterStart.split("-").map(Number);
    const wk = (weeks.match(/\d+/g) || []).map(Number);
    if (!wk.length) return esc(weeks);
    const start = new Date(y, m - 1, d + (wk[0] - 1) * 7), end = new Date(y, m - 1, d + (wk[wk.length - 1] - 1) * 7 + 6);
    return `${esc(weeks)}, ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  function renderAuthors() {
    const authors = $("#chAuthors");
    if (authors) {
      authors.innerHTML = `<span class="by-label">Prepared by</span>` + COURSE.team.map((p) =>
        `<span class="by-person">${p.photo ? `<img src="${esc(p.photo)}" alt="" width="36" height="36">` : `<span class="by-init">${esc(p.initials)}</span>`}${esc(p.name)}</span>`).join("");
    }
  }

  function renderHero(topic) {
    document.title = `Chapter ${topic.no}: ${topic.title} | ${COURSE.code} ${COURSE.name}`;
    const title = $("#chTitle"), summary = $("#chSummary"), meta = $("#chMeta"), pager = $("#chPager");
    if (title) title.textContent = topic.title;
    if (summary) summary.textContent = topic.summary;
    if (meta) meta.innerHTML = `<span>${weekDates(topic.weeks)}</span><span class="badge ${topic.status}">Interactive</span>`;
    renderAuthors();
    if (pager) {
      const prev = COURSE.topics.find((t) => t.no === topic.no - 1), next = COURSE.topics.find((t) => t.no === topic.no + 1);
      pager.innerHTML =
        `<span>${prev ? `<a href="${esc(pageOf(prev))}"><small>Previous</small>Chapter ${prev.no}: ${esc(prev.title)}</a>` : ""}</span>` +
        `<span style="text-align:right">${next ? `<a href="${esc(pageOf(next))}"><small>Next</small>Chapter ${next.no}: ${esc(next.title)}</a>` : ""}</span>`;
    }
  }

  // Virtual lab pages: same hero, pager to the previous and next virtual labs (or back to the lab list).
  function renderLabHero(lab) {
    document.title = `${lab.title} | ${COURSE.code} ${COURSE.name}`;
    const meta = $("#chMeta"), pager = $("#chPager");
    if (meta) meta.innerHTML = `<span>${weekDates(lab.weeks)}</span><span class="badge interactive">Virtual lab</span>`;
    renderAuthors();
    if (pager) {
      const built = COURSE.labs.filter((l) => l.page), i = built.indexOf(lab), prev = built[i - 1], next = built[i + 1];
      const link = (l, dir) => `<a href="${esc(l.page)}"><small>${dir}</small>${esc(l.title)}</a>`;
      pager.innerHTML = `<span>${prev ? link(prev, "Previous") : `<a href="labs.html"><small>Back</small>All laboratory experiments</a>`}</span>` +
        `<span style="text-align:right">${next ? link(next, "Next") : ""}</span>`;
    }
  }

  // Highlight the section-nav link for the part of the page in view.
  function trackNav() {
    const links = Array.from(document.querySelectorAll(".lab-nav a"));
    const groups = links.map((a) => document.querySelector(a.getAttribute("href")));
    let ticking = false;
    const paint = () => {
      ticking = false;
      let cur = -1;
      groups.forEach((g, i) => { if (g && g.getBoundingClientRect().top <= 140) cur = i; });
      links.forEach((a, i) => (i === cur ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      const active = links[cur];
      if (active && active.parentElement.scrollWidth > active.parentElement.clientWidth) {
        const bar = active.parentElement, left = active.offsetLeft - bar.clientWidth / 2 + active.clientWidth / 2;
        bar.scrollLeft = left;
      }
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }

  // Turn a list of exercises into a swipeable carousel (one exercise at a time) with previous/next and dots.
  function carousel(track) {
    const items = [...track.children], nav = document.createElement("div");
    track.classList.add("ex-track");
    track.setAttribute("tabindex", "-1");
    nav.className = "ex-nav";
    nav.innerHTML = `<button type="button" class="ex-arrow" data-d="-1" aria-label="Previous exercise">‹</button>
      <span class="ex-count" aria-live="polite"></span>
      <button type="button" class="ex-arrow" data-d="1" aria-label="Next exercise">›</button>
      <div class="ex-dots">${items.map((x, i) => `<button type="button" class="ex-dot" data-i="${i}" aria-label="Go to exercise ${i + 1}"></button>`).join("")}</div>`;
    track.before(nav);
    let cur = 0;
    const paint = () => {
      nav.querySelector(".ex-count").textContent = `Exercise ${cur + 1} of ${items.length}` + (items[cur].classList.contains("solved") ? " ✓" : "");
      nav.querySelectorAll(".ex-dot").forEach((d, i) => { d.classList.toggle("on", i === cur); d.classList.toggle("done", items[i].classList.contains("solved")); d.setAttribute("aria-current", i === cur); });
      nav.querySelector('[data-d="-1"]').disabled = cur === 0;
      nav.querySelector('[data-d="1"]').disabled = cur === items.length - 1;
      fit();
    };
    // The track takes the height of the exercise in view, so a short exercise leaves no empty gap.
    const fit = () => { track.style.height = items[cur].offsetHeight + "px"; };
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); items.forEach((x) => ro.observe(x)); }
    const go = (i) => { cur = Math.max(0, Math.min(items.length - 1, i)); track.scrollLeft = items[cur].offsetLeft - track.offsetLeft; paint(); }; // CSS scroll-behavior animates this
    const nearest = () => { let best = 0, d = Infinity; items.forEach((x, k) => { const dd = Math.abs(x.offsetLeft - track.offsetLeft - track.scrollLeft); if (dd < d) { d = dd; best = k; } }); return best; };
    nav.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; go(b.dataset.i !== undefined ? +b.dataset.i : cur + +b.dataset.d); });
    let t;
    const settle = () => { const i = nearest(); if (i !== cur) { cur = i; paint(); } };
    track.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(settle, 80); }, { passive: true });
    track.addEventListener("scrollend", settle);
    if (window.IntersectionObserver) { // also notice swipes through visibility, in case scroll events are throttled
      const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting && en.intersectionRatio > 0.6) { const i = items.indexOf(en.target); if (i !== cur) { cur = i; paint(); } } }), { root: track, threshold: [0.6] });
      items.forEach((x) => io.observe(x));
    }
    track.addEventListener("submit", () => setTimeout(paint, 50));
    paint();
  }

  /* Lab.page({
       topic: 5,
       sections: [...],                       // calculators and widgets, each with a group key
       groups: [{ key, list: "#ampList", toc: "#ampToc", extraToc: '<li>…</li>' }],
       exercises: [...], exList: "#exList"
     }) */
  function page(cfg) {
    if (cfg.lab) renderLabHero(COURSE.labs.find((l) => l.no === cfg.lab));
    else renderHero(COURSE.topics.find((t) => t.no === cfg.topic));
    if (cfg.collapseWorking) cfg.sections.forEach((s) => { s.collapse = true; });
    cfg.groups.forEach((g) => {
      const secs = cfg.sections.filter((s) => s.group === g.key);
      secs.forEach((s) => $(g.list).appendChild(buildSection(s)));
      if (g.toc) $(g.toc).innerHTML = secs.map((s) => `<li><a href="#${s.id}">${esc(s.toc || s.title.replace(/<[^>]+>/g, ""))}</a></li>`).join("") + (g.extraToc || "");
    });
    cfg.sections.forEach(update);
    (cfg.exercises || []).forEach((ex) => $(cfg.exList || "#exList").appendChild(buildExercise(ex)));
    if (cfg.exerciseCarousel && (cfg.exercises || []).length > 1) carousel($(cfg.exList || "#exList"));
    trackNav();
    if (location.hash) { const target = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (target) setTimeout(() => { const h = document.documentElement, b = h.style.scrollBehavior; h.style.scrollBehavior = "auto"; target.scrollIntoView(); h.style.scrollBehavior = b; }, 0); }
    let resizeTimer;
    addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => cfg.sections.forEach((s) => { if (s.bode) drawBode(s); if (s.onResize) s.onResize(); }), 150);
    });
  }

  window.Lab = {
    $, esc, TAU, MINUS, reduceMotion, store,
    num, eng, withUnit, P, PN, dB, fmtDb, same, n,
    KINDS, F, D, svgName, step, crossing, stepsHtml, notesHtml,
    BY_ID, update, loadValues, scrollToSection, page,
    shuffle, chips, wireChips, quiz, codeBlock, fold,
    video, readLink, watch, player, axes, poly, svg, curve, dot, label, mixHex, pvCard, pick, tone
  };
})();
