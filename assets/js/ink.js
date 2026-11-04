/* Pen and highlighter on every page (ink.js): the ✏️ button bottom-left opens a toolbar to write on the page while
   teaching, or for a student's own notes. Pen (6 colours, 3 sizes, pressure with a stylus), highlighter (4 colours),
   eraser (Rub out: only what it touches, or Whole line; 3 sizes; the mode is remembered), undo (also undoes erasing
   and clearing), clear, laser pointer (a fading red trail), spotlight (dims all but a circle round the
   pointer) and "Use the page" (the page works normally, the drawings stay).
   Drawings are pinned to the page (they scroll with it) and kept in THIS browser only, per page, for one day
   (localStorage "nmkink:<page>", not "nmk-" so they never sync to an account). No Firebase at all.
   📋 Board: a floating sheet to write on (see below), one for the whole site, also kept for one day. The board has its
   OWN pen, highlighter and eraser in its top bar: with a board tool on, only the board takes writing and the page
   outside works as normal; with a page tool on, the board takes no writing (lecturer's choice). */
(function () {
  "use strict";
  if (window.NMKInk) return;
  const KEY = "nmkink:" + location.pathname.replace(/\/index\.html$/, "/"), DAY = 864e5;
  const PENS = ["#15243a", "#d62828", "#1a73c7", "#2f9e44", "#f08c00", "#8b5cf6"], HLS = ["#ffe066", "#8ce99a", "#faa2c1", "#74c0fc"], SIZES = [2.5, 5, 9];
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* full or private */ } }, del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* private */ } } };
  // drawings older than one day are removed (every page's)
  try { Object.keys(localStorage).filter((k) => k.startsWith("nmkink:")).forEach((k) => { const o = JSON.parse(ls.get(k) || "{}"); if (!o.at || Date.now() - o.at > DAY) ls.del(k); }); } catch (e) { /* ignore */ }

  let strokes = [];
  try { const o = JSON.parse(ls.get(KEY) || "null"); if (o && Array.isArray(o.s)) strokes = o.s; } catch (e) { strokes = []; }
  let tool = "off", pen = PENS[1], hl = HLS[0], size = 1, cur = null, open = false;
  const save = () => { if (strokes.length) ls.set(KEY, JSON.stringify({ at: Date.now(), s: strokes })); else ls.del(KEY); };
  // the eraser, shared by the page and the board: "part" rubs out only what it touches, "stroke" deletes the whole line
  const OKEY = "nmkinkopt", ER = [8, 16, 30], E = { mode: "part", r: 1 };
  try { Object.assign(E, JSON.parse(ls.get(OKEY) || "{}")); } catch (e) { /* ignore */ }
  const saveE = () => ls.set(OKEY, JSON.stringify(E));
  // undo history: the stroke list before each change (a stroke, an erase, a clear)
  const hist = [], keep = (h, arr) => { h.push(arr.slice()); if (h.length > 60) h.shift(); };

  /* ---------- the look ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .ink-cv, .ink-fx { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 66; pointer-events: none; }
  .ink-cv.draw { pointer-events: auto; touch-action: none; cursor: crosshair; }
  .ink-cv.erase { cursor: none; }
  .ink-er { display: inline-flex; gap: 3px; }
  .ink-er button { font-size: .8rem; font-weight: 600; }
  .ink-ez i { display: inline-block; border-radius: 50%; border: 2px solid currentColor; vertical-align: middle; }
  .ink-spot { position: fixed; inset: 0; z-index: 65; pointer-events: none; display: none; }
  .ink-spot.on { display: block; }
  .ink-fab { position: fixed; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 76; width: 52px; height: 52px; border-radius: 50%; border: 0; background: var(--ink, #15243a); color: var(--paper, #fff); font-size: 1.35rem; cursor: pointer; box-shadow: 0 8px 22px rgba(21, 36, 58, .28); }
  .ink-fab[aria-expanded="true"] { background: #ffd84d; color: #14213d; }
  .ink-bar { position: fixed; left: 76px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 76; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; max-width: calc(100vw - 92px); padding: 6px 8px; background: var(--surface, #fff); color: var(--ink, #15243a); border: 1px solid var(--rule, #d6dee4); border-radius: 14px; box-shadow: 0 10px 30px rgba(21, 36, 58, .25); font: 500 .9rem var(--sans, sans-serif); }
  .ink-bar[hidden] { display: none; }
  .ink-bar button { font: inherit; min-width: 38px; height: 38px; padding: 0 8px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: inherit; cursor: pointer; }
  .ink-bar button:hover { background: var(--teal-soft, #e0efee); }
  .ink-bar button[aria-pressed="true"] { border-color: var(--teal, #0b6e6e); background: var(--teal-soft, #e0efee); }
  .ink-bar button:focus-visible, .ink-fab:focus-visible { outline: 3px solid var(--focus, #1a73c7); outline-offset: 2px; }
  .ink-sep { width: 1px; height: 26px; background: var(--rule, #d6dee4); margin: 0 2px; }
  .ink-sw { display: inline-flex; gap: 3px; }
  .ink-sw button { min-width: 0; width: 26px; height: 26px; padding: 0; border-radius: 50%; border: 2px solid var(--surface, #fff); box-shadow: 0 0 0 1px var(--rule, #d6dee4); }
  .ink-sw button[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--ink, #15243a); background-clip: padding-box; }
  .ink-sz i { display: inline-block; border-radius: 50%; background: currentColor; vertical-align: middle; }
  .ink-clr.sure { background: #d62828 !important; color: #fff; }
  @media (max-width: 640px) { .ink-fab { width: 46px; height: 46px; left: 12px; } .ink-bar { left: 8px; right: 8px; max-width: none; bottom: calc(68px + env(safe-area-inset-bottom, 0px)); } }
  @media print { .ink-cv, .ink-fx, .ink-spot, .ink-fab, .ink-bar { display: none !important; } }`;
  document.head.appendChild(css);

  const cv = document.createElement("canvas"), fx = document.createElement("canvas"), spot = document.createElement("div");
  cv.className = "ink-cv"; fx.className = "ink-fx"; spot.className = "ink-spot";
  cv.setAttribute("aria-hidden", "true"); fx.setAttribute("aria-hidden", "true");
  const fab = document.createElement("button");
  fab.type = "button"; fab.className = "ink-fab"; fab.textContent = "✏️";
  fab.setAttribute("aria-label", "Pen and highlighter"); fab.setAttribute("aria-expanded", "false"); fab.title = "Pen and highlighter";
  const bar = document.createElement("div");
  bar.className = "ink-bar"; bar.hidden = true; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Pen and highlighter");
  document.body.append(spot, cv, fx, bar, fab);
  const ctx = cv.getContext("2d"), fctx = fx.getContext("2d");

  const TOOLS = [["pen", "✏️", "Pen (P)"], ["hl", "🖍", "Highlighter (H)"], ["erase", "🧽", "Eraser (E)"], ["laser", "🔴", "Laser pointer (L)"], ["spot", "🔦", "Spotlight (S)"], ["off", "✋", "Use the page (Esc)"]];
  const erHtml = () => `<span class="ink-er" role="group" aria-label="Eraser mode"><button type="button" data-em="part" aria-pressed="${E.mode === "part"}" title="Rub out only what the eraser touches">Rub out</button><button type="button" data-em="stroke" aria-pressed="${E.mode === "stroke"}" title="Delete the whole line the eraser touches">Whole line</button></span><span class="ink-sep"></span>`
    + ER.map((r, i) => `<button type="button" class="ink-ez" data-er="${i}" aria-pressed="${E.r === i}" aria-label="Eraser size ${i + 1}" title="Eraser size ${i + 1}"><i style="width:${6 + i * 6}px;height:${6 + i * 6}px"></i></button>`).join("");
  function drawBar() {
    const sw = tool === "hl" ? HLS.map((c) => `<button type="button" data-hc="${c}" style="background:${c}" aria-label="Highlighter colour" aria-pressed="${c === hl}"></button>`).join("")
      : PENS.map((c) => `<button type="button" data-pc="${c}" style="background:${c}" aria-label="Pen colour" aria-pressed="${c === pen}"></button>`).join("");
    bar.innerHTML = `${TOOLS.map(([t, i, l]) => `<button type="button" data-t="${t}" aria-pressed="${tool === t}" title="${l}" aria-label="${l}">${i}</button>`).join("")}
      ${tool === "pen" || tool === "hl" ? `<span class="ink-sep"></span><span class="ink-sw">${sw}</span><span class="ink-sep"></span>${SIZES.map((s, i) => `<button type="button" class="ink-sz" data-sz="${i}" aria-pressed="${size === i}" aria-label="Size ${i + 1}" title="Size ${i + 1}"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join("")}` : ""}
      ${tool === "erase" ? `<span class="ink-sep"></span>${erHtml()}` : ""}
      <span class="ink-sep"></span><button type="button" data-undo title="Undo on the page (Ctrl+Z)" aria-label="Undo on the page">↶</button><button type="button" class="ink-clr" data-clear title="Clear this page" aria-label="Clear this page">🗑</button>
      <span class="ink-sep"></span><button type="button" data-board aria-pressed="${!!(B && B.open)}" title="Board: a sheet to write on (B)" aria-label="Board">📋</button>`;
  }
  function undo() { if (hist.length) strokes = hist.pop(); else strokes.pop(); paint(); save(); }
  // a page tool takes over from the board's (and the other way round): one surface takes writing at a time
  function setTool(t) {
    tool = t;
    if (t !== "off" && B && Q.tool) { Q.tool = null; bTools(); }
    cv.classList.toggle("draw", t === "pen" || t === "hl" || t === "erase");
    cv.classList.toggle("erase", t === "erase");
    spot.classList.toggle("on", t === "spot");
    if (t !== "laser") trail.length = 0;
    if (t === "spot" || t === "laser") loop(); else ring();
    drawBar();
  }
  function toggle(on) {
    open = on; bar.hidden = !on; fab.setAttribute("aria-expanded", String(on));
    if (on) { if (tool === "off") setTool("pen"); else drawBar(); }
    else setTool("off");
  }

  /* ---------- drawing (page coordinates, so the ink scrolls with the page) ---------- */
  let dpr = 1;
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    [cv, fx].forEach((c) => { c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); });
    paint();
  }
  // one stroke on a canvas (c), its points shifted by (ox, oy): the page's scroll, or 0 on the board
  function strokePath(s, c, ox, oy) {
    const p = s.p; if (!p.length) return;
    c.beginPath();
    c.moveTo(p[0][0] - ox, p[0][1] - oy);
    if (p.length === 1) c.lineTo(p[0][0] - ox + 0.1, p[0][1] - oy);
    for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i]; c.quadraticCurveTo(a[0] - ox, a[1] - oy, (a[0] + b[0]) / 2 - ox, (a[1] + b[1]) / 2 - oy); }
    c.lineTo(p[p.length - 1][0] - ox, p[p.length - 1][1] - oy);
  }
  function drawStroke(s, c = ctx, ox = scrollX, oy = scrollY, chalk = false) {
    const col = chalk && s.c === PENS[0] ? "#f4f6f8" : s.c;   // the dark pen shows white on the chalkboard
    c.save(); c.lineCap = "round"; c.lineJoin = "round";
    if (s.t === "hl") { c.globalAlpha = chalk ? 0.5 : 0.38; c.strokeStyle = col; c.lineWidth = s.w * 4 + 8; if (!chalk) c.globalCompositeOperation = "multiply"; strokePath(s, c, ox, oy); c.stroke(); }
    else if (s.pr) {   // a stylus: each piece as thick as the pressure there
      c.strokeStyle = col;
      for (let i = 1; i < s.p.length; i++) { const a = s.p[i - 1], b = s.p[i]; c.lineWidth = s.w * (0.4 + (b[2] || 0.5) * 1.2); c.beginPath(); c.moveTo(a[0] - ox, a[1] - oy); c.lineTo(b[0] - ox, b[1] - oy); c.stroke(); }
      if (s.p.length === 1) { c.lineWidth = s.w; strokePath(s, c, ox, oy); c.stroke(); }
    } else { c.strokeStyle = col; c.lineWidth = s.w; strokePath(s, c, ox, oy); c.stroke(); }
    c.restore();
  }
  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    strokes.forEach((s) => drawStroke(s));
    if (cur && !cur.board && !cur.erasing) drawStroke(cur);
  }
  let queued = false;
  const repaint = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); };
  addEventListener("scroll", repaint, { passive: true });
  addEventListener("resize", fit);
  // the page grows or shrinks (a panel opens): repaint so the ink follows the scroll position
  if (window.ResizeObserver) new ResizeObserver(repaint).observe(document.body);

  const cap = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (x) { /* the pointer is already gone */ } };
  const ptOf = (e) => [Math.round((e.clientX + scrollX) * 10) / 10, Math.round((e.clientY + scrollY) * 10) / 10, e.pointerType === "pen" ? Math.round((e.pressure || 0.5) * 100) / 100 : 0];
  /* ---------- erasing (the same list in, the same list back when nothing was touched) ---------- */
  const halfW = (s) => (s.t === "hl" ? s.w * 4 + 8 : s.w * (s.pr ? 1.6 : 1)) / 2;
  const near = (s, x, y, rr) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const q of s.p) { if (q[0] < a) a = q[0]; if (q[0] > b) b = q[0]; if (q[1] < c) c = q[1]; if (q[1] > d) d = q[1]; } return x > a - rr && x < b + rr && y > c - rr && y < d + rr; };
  // Whole line: drop every stroke the eraser touches
  function wholeOut(list, x, y, R) {
    const out = list.filter((s) => !s.p.some((q, i) => { const rr = R + halfW(s); if (Math.hypot(q[0] - x, q[1] - y) < rr) return true; const a = s.p[i - 1]; if (!a) return false;
      const dx = q[0] - a[0], dy = q[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) < rr; }));
    return out.length === list.length ? list : out;
  }
  // Rub out: remove only the points under the eraser; a stroke rubbed through the middle becomes two
  function rubOut(list, x, y, R) {
    let changed = false; const out = [];
    for (const s of list) {
      const rr = R + halfW(s);
      if (!near(s, x, y, rr)) { out.push(s); continue; }
      const step = Math.max(1.5, R / 3), pts = [];
      s.p.forEach((q, i) => { const a = s.p[i - 1]; if (a) { const n = Math.floor(Math.hypot(q[0] - a[0], q[1] - a[1]) / step); for (let k = 1; k < n; k++) pts.push([a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n, q[2]]); } pts.push(q); });
      const live = pts.map((q) => Math.hypot(q[0] - x, q[1] - y) > rr);
      if (live.every(Boolean)) { out.push(s); continue; }
      changed = true;
      let run = [];
      pts.forEach((q, i) => { if (live[i]) run.push(q); else { if (run.length) out.push(Object.assign({}, s, { p: run })); run = []; } });
      if (run.length) out.push(Object.assign({}, s, { p: run }));
    }
    return changed ? out : list;
  }
  // erase along the move from a to b (a fast swipe still erases everything in between)
  function erased(list, a, b) {
    const R = ER[E.r] || 16, pts = [];
    if (a) { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (R / 2))); for (let i = 1; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]); } else pts.push(b);
    let out = list;
    pts.forEach(([x, y]) => { out = E.mode === "stroke" ? wholeOut(out, x, y, R) : rubOut(out, x, y, R); });
    return out;
  }
  function eraseAt(e) {
    const q = [e.clientX + scrollX, e.clientY + scrollY], n = erased(strokes, cur.last, q);
    cur.last = q;
    if (n !== strokes) { if (!cur.changed) { keep(hist, strokes); cur.changed = true; } strokes = n; paint(); }
  }
  cv.addEventListener("pointerdown", (e) => {
    if (tool === "erase") { cap(cv, e); cur = { erasing: true, last: null }; eraseAt(e); return; }
    if (tool !== "pen" && tool !== "hl") return;
    e.preventDefault(); cap(cv, e);
    cur = { t: tool, c: tool === "hl" ? hl : pen, w: SIZES[size], pr: e.pointerType === "pen" && tool === "pen" ? 1 : 0, p: [ptOf(e)] };
    repaint();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!cur) return;
    if (cur.erasing) { eraseAt(e); return; }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach((x) => { const q = ptOf(x), l = cur.p[cur.p.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 1.2) cur.p.push(q); });
    repaint();
  });
  const end = () => { if (!cur || cur.board) return; if (cur.erasing) { if (cur.changed) save(); } else if (cur.p.length) { keep(hist, strokes); strokes.push(cur); save(); } cur = null; repaint(); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("lostpointercapture", end);

  /* ---------- laser pointer and spotlight (follow the pointer; the page still works underneath) ---------- */
  const trail = []; let mx = -999, my = -999, looping = false, spotR = 150;
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; if (tool === "laser") trail.push([mx, my, performance.now()]); if (tool === "spot") placeSpot(); ring(); }, { passive: true });
  addEventListener("pointerdown", (e) => { mx = e.clientX; my = e.clientY; ring(); }, { passive: true, capture: true });
  // the eraser's size shown as a ring round the pointer, on the surface it erases
  function ring() {
    if (looping || !B) return;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
    let on = false;
    if (Q.tool === "erase" && !bd.hidden) { const r = bb.getBoundingClientRect(); on = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom; }
    else if (tool === "erase") { const r = bd.hidden ? null : bd.getBoundingClientRect(); on = !(r && mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom); }
    if (!on) return;
    const R = ER[E.r] || 16;
    fctx.lineWidth = 3; fctx.strokeStyle = "rgba(255, 255, 255, .9)"; fctx.beginPath(); fctx.arc(mx, my, R, 0, Math.PI * 2); fctx.stroke();
    fctx.lineWidth = 1.5; fctx.strokeStyle = "rgba(21, 36, 58, .85)"; fctx.stroke();
  }
  const placeSpot = () => { spot.style.background = `radial-gradient(circle at ${mx}px ${my}px, transparent 0, transparent ${spotR}px, rgba(8, 14, 28, .74) ${spotR + 18}px)`; };
  function loop() {
    if (looping) return; looping = true;
    const step = () => {
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
      if (tool === "laser") {
        const now = performance.now();
        while (trail.length && now - trail[0][2] > 600) trail.shift();
        fctx.lineCap = "round"; fctx.lineJoin = "round";
        for (let i = 1; i < trail.length; i++) { const a = trail[i - 1], b = trail[i], k = 1 - (now - b[2]) / 600; fctx.strokeStyle = `rgba(255, 40, 40, ${(k * 0.8).toFixed(2)})`; fctx.lineWidth = 3 + k * 6; fctx.beginPath(); fctx.moveTo(a[0], a[1]); fctx.lineTo(b[0], b[1]); fctx.stroke(); }
        if (mx > -900) { fctx.shadowColor = "#ff2a2a"; fctx.shadowBlur = 18; fctx.fillStyle = "#ff2a2a"; fctx.beginPath(); fctx.arc(mx, my, 7, 0, Math.PI * 2); fctx.fill(); fctx.shadowBlur = 0; fctx.fillStyle = "#fff"; fctx.beginPath(); fctx.arc(mx, my, 2.5, 0, Math.PI * 2); fctx.fill(); }
      }
      if (tool === "spot") placeSpot();
      if (tool === "laser" || tool === "spot") requestAnimationFrame(step); else { fctx.clearRect(0, 0, innerWidth, innerHeight); looping = false; ring(); }
    };
    requestAnimationFrame(step);
  }
  // the spotlight grows and shrinks with the mouse wheel while Shift is held, or with [ and ]
  addEventListener("wheel", (e) => { if (tool === "spot" && e.shiftKey) { e.preventDefault(); spotR = Math.max(60, Math.min(420, spotR - Math.sign(e.deltaY) * 20)); placeSpot(); } }, { passive: false });

  /* ---------- the board: a floating sheet to write on when the page has no room (📋 in the toolbar). One board for
     the whole site (it follows you from page to page), with pages, four backgrounds and a see-through setting; kept in
     this browser for one day ("nmkboard", like the page ink). Drag it by its top bar, resize it from the corner. ---------- */
  const BKEY = "nmkboard", BGS = [["white", "White"], ["grid", "Grid"], ["lined", "Lined"], ["chalk", "Chalkboard"]];
  let B = null;
  try { B = JSON.parse(ls.get(BKEY) || "null"); } catch (e) { B = null; }
  if (!B || !Array.isArray(B.pages) || !B.at || Date.now() - B.at > DAY) B = { pages: [[]], pi: 0, bg: "white", op: 100, open: false, min: false, full: false, penOnly: null, seenPen: false };
  // the board's own tools (tool null: the board takes no writing); its colours and size are kept with the board
  const Q = Object.assign({ tool: null, pen: PENS[0], hl: HLS[0], size: 1 }, B.q || {}, { tool: null });
  const bsave = () => { B.at = Date.now(); B.q = { pen: Q.pen, hl: Q.hl, size: Q.size }; ls.set(BKEY, JSON.stringify(B)); };
  let bhist = {};
  const bh_ = () => bhist[B.pi] || (bhist[B.pi] = []);
  const bpage = () => B.pages[B.pi] || (B.pages[B.pi] = []);
  css.textContent += `
  .ink-fx { z-index: 72; }
  .ink-bd { position: fixed; z-index: 70; display: flex; flex-direction: column; min-width: 280px; min-height: 200px; background: transparent; border: 2px solid var(--teal, #0b6e6e); border-radius: 14px; box-shadow: 0 14px 40px rgba(21, 36, 58, .3); overflow: hidden; font: 500 .88rem var(--sans, sans-serif); color: var(--ink, #15243a); }
  .ink-bd[hidden], .ink-chip[hidden] { display: none; }
  .ink-bd.full { inset: 0 !important; width: auto !important; height: auto !important; border-radius: 0; border-width: 0; }
  .ink-bh { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 5px 6px; background: var(--surface, #fff); border-bottom: 1px solid var(--rule, #d6dee4); cursor: move; touch-action: none; user-select: none; }
  .ink-bh button, .ink-bh select { font: inherit; height: 34px; min-width: 34px; padding: 0 7px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
  .ink-bh select { border-color: var(--rule, #d6dee4); background: var(--paper, #fff); }
  .ink-bh button:hover { background: var(--teal-soft, #e0efee); }
  .ink-bh button[aria-pressed="true"] { border-color: var(--teal, #0b6e6e); background: var(--teal-soft, #e0efee); }
  .ink-bh button:disabled { opacity: .35; cursor: default; }
  .ink-bh :focus-visible { outline: 3px solid var(--focus, #1a73c7); outline-offset: 1px; }
  .ink-bt { font-weight: 700; padding: 0 4px; }
  .ink-pg { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
  .ink-op { display: inline-flex; align-items: center; gap: 4px; cursor: default; }
  .ink-op input { width: 84px; accent-color: var(--teal, #0b6e6e); }
  .ink-bsp { flex: 1; }
  .ink-bb { position: relative; flex: 1; min-height: 0; }
  .ink-bb canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
  .ink-rz { position: absolute; right: 0; bottom: 0; width: 22px; height: 22px; cursor: nwse-resize; touch-action: none; background: linear-gradient(135deg, transparent 50%, var(--teal, #0b6e6e) 50%); border-top-left-radius: 6px; }
  .ink-bd.full .ink-rz { display: none; }
  .ink-chip { position: fixed; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); z-index: 76; font: 600 .9rem var(--sans, sans-serif); padding: 10px 14px; border-radius: 999px; border: 2px solid var(--teal, #0b6e6e); background: var(--surface, #fff); color: var(--ink, #15243a); cursor: pointer; box-shadow: 0 8px 22px rgba(21, 36, 58, .25); }
  .ink-chip:focus-visible { outline: 3px solid var(--focus, #1a73c7); outline-offset: 2px; }
  .ink-bdel.sure { background: #d62828 !important; color: #fff; }
  .ink-btl { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding-top: 4px; border-top: 1px dashed var(--rule, #d6dee4); }
  .ink-btl .ink-sw { display: inline-flex; gap: 3px; }
  .ink-btl .ink-sw button { width: 24px; height: 24px; min-width: 0; padding: 0; border-radius: 50%; border: 2px solid var(--surface, #fff); box-shadow: 0 0 0 1px var(--rule, #d6dee4); }
  .ink-btl .ink-sw button[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--ink, #15243a); }
  .ink-btl .ink-sz i { display: inline-block; border-radius: 50%; background: currentColor; vertical-align: middle; }
  .ink-btl .ink-sep { width: 1px; height: 24px; background: var(--rule, #d6dee4); margin: 0 2px; }
  .ink-bhint { font-size: .82rem; color: var(--ink-2, #4a5a6e); padding: 0 4px; transition: color .2s; }
  .ink-bhint.nudge { color: #b35c00; font-weight: 700; }
  .ink-bb.idle canvas { cursor: default; }
  .ink-bb.er canvas { cursor: none; }
  @media print { .ink-bd, .ink-chip { display: none !important; } }`;
  const bd = document.createElement("div"), chip = document.createElement("button");
  bd.className = "ink-bd"; bd.hidden = true; bd.setAttribute("role", "dialog"); bd.setAttribute("aria-label", "Writing board");
  bd.innerHTML = `<div class="ink-bh"><span class="ink-bt">📋 Board</span>
      <button type="button" data-bp="-1" aria-label="Previous page" title="Previous page">‹</button><span class="ink-pg"></span><button type="button" data-bp="1" aria-label="Next page" title="Next page">›</button>
      <button type="button" data-bnew aria-label="New page" title="New page (N)">＋</button>
      <select class="ink-bgs" aria-label="Background">${BGS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
      <label class="ink-op" title="See-through: lower lets the page show through (your writing stays solid)">◐<input type="range" min="20" max="100" step="5" aria-label="Board opacity"></label>
      <button type="button" data-bpen title="Pen only: only the stylus writes, so your palm or finger leaves no marks" aria-label="Pen only">✍️</button>
      <button type="button" data-bimg title="Save this page as an image" aria-label="Save this page as an image">💾</button>
      <button type="button" class="ink-bdel" data-bdel title="Delete this page" aria-label="Delete this page">🗑</button>
      <span class="ink-bsp"></span>
      <button type="button" data-bmin title="Minimise" aria-label="Minimise the board">–</button><button type="button" data-bfull title="Full screen" aria-label="Full screen">⛶</button><button type="button" data-bx title="Close (your writing stays)" aria-label="Close the board">✕</button>
      <div class="ink-btl" role="toolbar" aria-label="Board pen"></div></div>
    <div class="ink-bb"><canvas aria-hidden="true"></canvas></div><span class="ink-rz" aria-hidden="true"></span>`;
  chip.type = "button"; chip.className = "ink-chip"; chip.hidden = true;
  document.body.append(bd, chip);
  const bb = bd.querySelector(".ink-bb"), bcv = bb.querySelector("canvas"), bctx = bcv.getContext("2d"), btl = bd.querySelector(".ink-btl");
  // the board's tool row: its own pen, highlighter and eraser, colours, sizes and undo
  function bTools() {
    const t = Q.tool, chalk = B.bg === "chalk";
    let o = "";
    if (t === "pen") o = `<span class="ink-sw">${PENS.map((c) => `<button type="button" data-bc="${c}" style="background:${chalk && c === PENS[0] ? "#f4f6f8" : c}" aria-label="Board pen colour" aria-pressed="${c === Q.pen}"></button>`).join("")}</span>`;
    if (t === "hl") o = `<span class="ink-sw">${HLS.map((c) => `<button type="button" data-bhc="${c}" style="background:${c}" aria-label="Board highlighter colour" aria-pressed="${c === Q.hl}"></button>`).join("")}</span>`;
    if (t === "pen" || t === "hl") o += `<span class="ink-sep"></span>${SIZES.map((x, i) => `<button type="button" class="ink-sz" data-bs="${i}" aria-pressed="${Q.size === i}" aria-label="Size ${i + 1}" title="Size ${i + 1}"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join("")}`;
    if (t === "erase") o = erHtml();
    btl.innerHTML = [["pen", "✏️", "Board pen"], ["hl", "🖍", "Board highlighter"], ["erase", "🧽", "Board eraser"]].map(([k, i, l]) => `<button type="button" data-bt="${k}" aria-pressed="${t === k}" title="${l}" aria-label="${l}">${i}</button>`).join("")
      + (o ? `<span class="ink-sep"></span>${o}` : "") + `<span class="ink-sep"></span><button type="button" data-bundo title="Undo on the board (Ctrl+Z)" aria-label="Undo on the board">↶</button>`
      + (t ? "" : `<span class="ink-bhint">Tap ✏️ here to write on the board</span>`);
    bb.classList.toggle("idle", !t); bb.classList.toggle("er", t === "erase");
  }
  function setBoardTool(t) {
    Q.tool = t;
    if (t && tool !== "off") setTool("off");   // the page tools step back: the page works as normal outside the board
    bTools(); ring();
  }
  const phone = () => innerWidth <= 640;
  const penOnly = () => B.penOnly === true || (B.penOnly === null && B.seenPen);
  // where the board sits: kept inside the window
  function place() {
    if (!B.w) { B.w = Math.min(760, innerWidth - 40); B.h = Math.min(480, innerHeight - 150); B.x = innerWidth - B.w - 24; B.y = 84; }
    B.w = Math.max(280, Math.min(B.w, innerWidth)); B.h = Math.max(200, Math.min(B.h, innerHeight));
    B.x = Math.max(0, Math.min(B.x, innerWidth - B.w)); B.y = Math.max(0, Math.min(B.y, innerHeight - 60));
    Object.assign(bd.style, { left: `${B.x}px`, top: `${B.y}px`, width: `${B.w}px`, height: `${B.h}px` });
  }
  function bgStyle() {
    const a = B.op / 100, line = `rgba(26, 115, 199, ${(0.22 * a).toFixed(3)})`;
    if (B.bg === "chalk") return { backgroundColor: `rgba(28, 52, 44, ${a})`, backgroundImage: "none" };
    if (B.bg === "grid") return { backgroundColor: `rgba(255, 255, 255, ${a})`, backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: "24px 24px" };
    if (B.bg === "lined") return { backgroundColor: `rgba(255, 255, 255, ${a})`, backgroundImage: `linear-gradient(transparent 31px, ${line} 31px, ${line} 32px)`, backgroundSize: "100% 32px" };
    return { backgroundColor: `rgba(255, 255, 255, ${a})`, backgroundImage: "none" };
  }
  function bpaint() {
    const w = bb.clientWidth, h = bb.clientHeight;
    if (bcv.width !== Math.round(w * dpr) || bcv.height !== Math.round(h * dpr)) { bcv.width = Math.round(w * dpr); bcv.height = Math.round(h * dpr); }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.clearRect(0, 0, w, h);
    const chalk = B.bg === "chalk";
    bpage().forEach((s) => drawStroke(s, bctx, 0, 0, chalk));
    if (cur && cur.board && !cur.erasing) drawStroke(cur, bctx, 0, 0, chalk);
  }
  function bdraw() {
    bd.hidden = !B.open || B.min; chip.hidden = !B.open || !B.min;
    chip.textContent = `📋 Board · page ${B.pi + 1}`;
    bd.classList.toggle("full", !!B.full);
    if (!B.full) place();
    Object.assign(bb.style, bgStyle());
    bd.querySelector(".ink-pg").textContent = `${B.pi + 1} / ${B.pages.length}`;
    bd.querySelector('[data-bp="-1"]').disabled = B.pi === 0;
    bd.querySelector('[data-bp="1"]').disabled = B.pi >= B.pages.length - 1;
    bd.querySelector(".ink-bgs").value = B.bg;
    bd.querySelector(".ink-op input").value = B.op;
    bd.querySelector("[data-bpen]").setAttribute("aria-pressed", String(penOnly()));
    bd.querySelector("[data-bfull]").setAttribute("aria-pressed", String(!!B.full));
    if (!bd.hidden) requestAnimationFrame(bpaint);
  }
  function boardOpen(on) {
    B.open = on; B.min = false;
    if (on && phone()) B.full = true;
    bsave(); bdraw();
    if (on) setBoardTool(Q.tool || "pen"); else { Q.tool = null; bTools(); }
    if (open) drawBar();
  }
  // writing on the board (board coordinates, so it stays put when the board moves)
  const bpt = (e) => { const r = bcv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10, e.pointerType === "pen" ? Math.round((e.pressure || 0.5) * 100) / 100 : 0]; };
  let nudgeT = 0;
  bcv.addEventListener("pointerdown", (e) => {
    const t = Q.tool;
    if (!t) {   // a page tool is on: the board takes no writing, it points to its own pen instead
      const h = btl.querySelector(".ink-bhint"); if (h) { h.classList.add("nudge"); clearTimeout(nudgeT); nudgeT = setTimeout(() => h.classList.remove("nudge"), 1500); }
      return;
    }
    if (e.pointerType === "pen" && !B.seenPen) { B.seenPen = true; bsave(); bdraw(); }
    if (e.pointerType === "touch" && penOnly()) return;   // pen only: the palm and fingers don't write
    e.preventDefault(); cap(bcv, e);
    if (t === "erase") { cur = { board: true, erasing: true, last: null }; berase(e); return; }
    cur = { board: true, t, c: t === "hl" ? Q.hl : Q.pen, w: SIZES[Q.size], pr: e.pointerType === "pen" && t === "pen" ? 1 : 0, p: [bpt(e)] };
    bpaint();
  });
  function berase(e) {
    const q = bpt(e), list = bpage(), n = erased(list, cur.last, q);
    cur.last = q;
    if (n !== list) { if (!cur.changed) { keep(bh_(), list); cur.changed = true; } B.pages[B.pi] = n; bpaint(); }
  }
  function bundo() { const h = bh_(); if (h.length) B.pages[B.pi] = h.pop(); else bpage().pop(); bsave(); bpaint(); }
  bcv.addEventListener("pointermove", (e) => {
    if (!cur || !cur.board) return;
    if (cur.erasing) { berase(e); return; }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach((x) => { const q = bpt(x), l = cur.p[cur.p.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 1.2) cur.p.push(q); });
    bpaint();
  });
  const bend = () => { if (!cur || !cur.board) return; const c = cur; cur = null; if (c.erasing) { if (c.changed) bsave(); } else { delete c.board; keep(bh_(), bpage()); bpage().push(c); bsave(); } bpaint(); };
  bcv.addEventListener("pointerup", bend); bcv.addEventListener("pointercancel", bend); bcv.addEventListener("lostpointercapture", bend);
  // dragging by the top bar, resizing from the corner
  function dragFrom(e, resize) {
    if (B.full) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, o = { x: B.x, y: B.y, w: B.w, h: B.h }, el = e.currentTarget;
    cap(el, e);
    const mv = (ev) => { if (resize) { B.w = o.w + ev.clientX - sx; B.h = o.h + ev.clientY - sy; } else { B.x = o.x + ev.clientX - sx; B.y = o.y + ev.clientY - sy; } place(); bpaint(); };
    const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); bsave(); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  const bh = bd.querySelector(".ink-bh");
  bh.addEventListener("pointerdown", (e) => { if (!e.target.closest("button, select, input, label")) dragFrom(e, false); });
  bd.querySelector(".ink-rz").addEventListener("pointerdown", (e) => dragFrom(e, true));
  bh.addEventListener("dblclick", (e) => { if (!e.target.closest("button, select, input, label")) { B.full = !B.full; bsave(); bdraw(); } });
  bh.addEventListener("change", (e) => { if (e.target.matches(".ink-bgs")) { B.bg = e.target.value; bsave(); bdraw(); bTools(); } });
  bh.addEventListener("input", (e) => { if (e.target.matches(".ink-op input")) { B.op = +e.target.value; Object.assign(bb.style, bgStyle()); bsave(); } });
  function newPage() { B.pages.push([]); B.pi = B.pages.length - 1; bsave(); bdraw(); }
  const erPick = (b) => { if (b.dataset.em) E.mode = b.dataset.em; else E.r = +b.dataset.er; saveE(); bTools(); if (open) drawBar(); ring(); };
  bh.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.bt) setBoardTool(b.dataset.bt);
    else if (b.dataset.bc) { Q.pen = b.dataset.bc; bsave(); bTools(); }
    else if (b.dataset.bhc) { Q.hl = b.dataset.bhc; bsave(); bTools(); }
    else if (b.dataset.bs) { Q.size = +b.dataset.bs; bsave(); bTools(); }
    else if (b.dataset.em || b.dataset.er) erPick(b);
    else if (b.hasAttribute("data-bundo")) bundo();
    else if (b.dataset.bp) { B.pi = Math.max(0, Math.min(B.pages.length - 1, B.pi + +b.dataset.bp)); bsave(); bdraw(); }
    else if (b.hasAttribute("data-bnew")) newPage();
    else if (b.hasAttribute("data-bpen")) { B.penOnly = !penOnly(); bsave(); bdraw(); }
    else if (b.hasAttribute("data-bimg")) saveImage();
    else if (b.hasAttribute("data-bdel")) {
      if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = "Delete page?"; setTimeout(() => { if (b.isConnected) { b.classList.remove("sure"); b.textContent = "🗑"; } }, 3000); return; }
      b.classList.remove("sure"); b.textContent = "🗑";
      if (B.pages.length > 1) { B.pages.splice(B.pi, 1); B.pi = Math.min(B.pi, B.pages.length - 1); } else B.pages = [[]];
      bhist = {};
      bsave(); bdraw();
    }
    else if (b.hasAttribute("data-bmin")) { B.min = true; bsave(); bdraw(); chip.focus(); }
    else if (b.hasAttribute("data-bfull")) { B.full = !B.full; bsave(); bdraw(); }
    else if (b.hasAttribute("data-bx")) { boardOpen(false); fab.focus(); }
  });
  chip.addEventListener("click", () => { B.min = false; bsave(); bdraw(); });
  addEventListener("resize", () => { if (!bd.hidden) bdraw(); });
  // the page as a picture: the paper (solid), then the writing
  function saveImage() {
    const w = bb.clientWidth, h = bb.clientHeight, k = 2, c = document.createElement("canvas"); c.width = w * k; c.height = h * k;
    const x = c.getContext("2d"); x.scale(k, k);
    x.fillStyle = B.bg === "chalk" ? "#1c342c" : "#ffffff"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(26, 115, 199, .22)"; x.lineWidth = 1;
    if (B.bg === "grid") { for (let i = 0; i < w; i += 24) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, h); x.stroke(); } for (let j = 0; j < h; j += 24) { x.beginPath(); x.moveTo(0, j + 0.5); x.lineTo(w, j + 0.5); x.stroke(); } }
    if (B.bg === "lined") for (let j = 31; j < h; j += 32) { x.beginPath(); x.moveTo(0, j + 0.5); x.lineTo(w, j + 0.5); x.stroke(); }
    bpage().forEach((s) => drawStroke(s, x, 0, 0, B.bg === "chalk"));
    const a = document.createElement("a"), d = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16).replace(/[-:T]/g, "");
    a.download = `nmk42003-board-${d}-page${B.pi + 1}.png`; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove();
  }
  bdraw(); bTools();

  /* ---------- buttons and keys ---------- */
  fab.addEventListener("click", () => toggle(!open));
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.t) setTool(b.dataset.t);
    else if (b.dataset.pc) { pen = b.dataset.pc; drawBar(); }
    else if (b.dataset.hc) { hl = b.dataset.hc; drawBar(); }
    else if (b.dataset.sz) { size = +b.dataset.sz; drawBar(); }
    else if (b.dataset.em || b.dataset.er) erPick(b);
    else if (b.hasAttribute("data-undo")) undo();
    else if (b.hasAttribute("data-board")) boardOpen(!B.open);
    else if (b.hasAttribute("data-clear")) {
      if (!strokes.length) return;
      if (b.classList.contains("sure")) { keep(hist, strokes); strokes = []; paint(); save(); drawBar(); }
      else { b.classList.add("sure"); b.textContent = "Clear all?"; setTimeout(() => { if (b.isConnected) { b.classList.remove("sure"); b.textContent = "🗑"; } }, 3000); }
    }
  });
  addEventListener("keydown", (e) => {
    const bOn = B.open && !B.min;
    if ((!open && !bOn) || e.altKey || e.metaKey) return;
    const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    const bAct = bOn && !!Q.tool;   // the board's tools are on: the keys work on the board
    if (e.ctrlKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (bAct) bundo(); else undo(); return; }
    if (e.ctrlKey) return;
    const k = e.key.toLowerCase(), m = { p: "pen", h: "hl", e: "erase", l: "laser", s: "spot" };
    if (k === "b") { e.preventDefault(); if (B.open && B.min) { B.min = false; bsave(); bdraw(); } else boardOpen(!B.open); }
    else if (k === "n" && bOn) { e.preventDefault(); newPage(); }
    else if (bAct && (k === "p" || k === "h" || k === "e")) { e.preventDefault(); setBoardTool(m[k]); }
    else if (bAct && e.key === "Escape") setBoardTool(null);
    else if (!open) return;
    else if (m[k]) { e.preventDefault(); setTool(m[k]); }
    else if (e.key === "Escape") { if (tool !== "off") setTool("off"); else toggle(false); }
    else if (tool === "spot" && (e.key === "[" || e.key === "]")) { spotR = Math.max(60, Math.min(420, spotR + (e.key === "]" ? 20 : -20))); placeSpot(); }
  });

  fit(); bdraw();
  window.NMKInk = { clear: () => { strokes = []; paint(); save(); }, board: (on) => boardOpen(on !== false), boardTool: setBoardTool };
})();
