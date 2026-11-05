/* Pen and highlighter on every page (ink.js): the ✏️ button bottom-left opens a toolbar to write on the page while
   teaching, or for a student's own notes. Pen (6 colours, 3 sizes, pressure with a stylus), highlighter (4 colours),
   eraser (Rub out: only what it touches, or Whole line; 3 sizes; the mode is remembered), undo (also undoes erasing
   and clearing), clear, laser pointer (a fading red trail), spotlight (dims all but a circle round the
   pointer) and "Use the page" (the page works normally, the drawings stay).
   Drawings are pinned to the page (they scroll with it) and kept in THIS browser only, per page, for one day
   (localStorage "nmkink:<page>", not "nmk-" so they never sync to an account). No Firebase at all.
   📋 Board: a floating sheet to write on (see below), one for the whole site, also kept for one day. The board has its
   OWN pen, highlighter and eraser in its top bar: with a board tool on, only the board takes writing and the page
   outside works as normal; with a page tool on, the board takes no writing (lecturer's choice). ⬚ Select moves, resizes,
   recolours, duplicates or deletes what was written. */
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
    if (s.ln) { for (let i = 1; i < p.length; i++) c.lineTo(p[i][0] - ox, p[i][1] - oy); if (p.length === 1) c.lineTo(p[0][0] - ox + 0.1, p[0][1] - oy); return; }   // shapes and symbols: straight pieces
    if (p.length === 1) c.lineTo(p[0][0] - ox + 0.1, p[0][1] - oy);
    for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i]; c.quadraticCurveTo(a[0] - ox, a[1] - oy, (a[0] + b[0]) / 2 - ox, (a[1] + b[1]) / 2 - oy); }
    c.lineTo(p[p.length - 1][0] - ox, p[p.length - 1][1] - oy);
  }
  function drawStroke(s, c = ctx, ox = scrollX, oy = scrollY, chalk = false) {
    const col = chalk && s.c === PENS[0] ? "#f4f6f8" : s.c;   // the dark pen shows white on the chalkboard
    c.save(); c.lineCap = "round"; c.lineJoin = "round";
    if (s.t === "tx") { c.font = TXF(s.w); c.fillStyle = col; c.textBaseline = "top"; String(s.s || "").split("\n").forEach((l, i) => c.fillText(l, s.p[0][0] - ox, s.p[0][1] - oy + i * s.w * 1.25)); c.restore(); return; }
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
  // text on the board: its box, measured with the font it is drawn in
  const TXF = (px) => `${px}px "IBM Plex Sans", system-ui, sans-serif`, mctx = document.createElement("canvas").getContext("2d");
  function txBox(s) { mctx.font = TXF(s.w); const ls = String(s.s || "").split("\n"); return { x: s.p[0][0], y: s.p[0][1], w: Math.max(8, ...ls.map((l) => mctx.measureText(l).width)), h: ls.length * s.w * 1.25 }; }
  const txHit = (s, x, y, R) => { const b = txBox(s); return x > b.x - R && x < b.x + b.w + R && y > b.y - R && y < b.y + b.h + R; };
  const halfW = (s) => (s.t === "hl" ? s.w * 4 + 8 : s.w * (s.pr ? 1.6 : 1)) / 2;
  const near = (s, x, y, rr) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const q of s.p) { if (q[0] < a) a = q[0]; if (q[0] > b) b = q[0]; if (q[1] < c) c = q[1]; if (q[1] > d) d = q[1]; } return x > a - rr && x < b + rr && y > c - rr && y < d + rr; };
  // Whole line: drop every stroke the eraser touches
  function wholeOut(list, x, y, R) {
    const out = list.filter((s) => (s.t === "tx" ? !txHit(s, x, y, R) : !s.p.some((q, i) => { const rr = R + halfW(s); if (Math.hypot(q[0] - x, q[1] - y) < rr) return true; const a = s.p[i - 1]; if (!a) return false;
      const dx = q[0] - a[0], dy = q[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) < rr; })));
    return out.length === list.length ? list : out;
  }
  // Rub out: remove only the points under the eraser; a stroke rubbed through the middle becomes two
  function rubOut(list, x, y, R) {
    let changed = false; const out = [];
    for (const s of list) {
      if (s.t === "tx") { if (txHit(s, x, y, R)) changed = true; else out.push(s); continue; }   // text goes as a whole
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
  const lasering = () => tool === "laser" || (B && Q.tool === "laser" && !bd.hidden);
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; if (lasering()) trail.push([mx, my, performance.now()]); if (tool === "spot") placeSpot(); ring(); }, { passive: true });
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
      if (lasering()) {
        const now = performance.now();
        while (trail.length && now - trail[0][2] > 600) trail.shift();
        fctx.lineCap = "round"; fctx.lineJoin = "round";
        for (let i = 1; i < trail.length; i++) { const a = trail[i - 1], b = trail[i], k = 1 - (now - b[2]) / 600; fctx.strokeStyle = `rgba(255, 40, 40, ${(k * 0.8).toFixed(2)})`; fctx.lineWidth = 3 + k * 6; fctx.beginPath(); fctx.moveTo(a[0], a[1]); fctx.lineTo(b[0], b[1]); fctx.stroke(); }
        if (mx > -900) { fctx.shadowColor = "#ff2a2a"; fctx.shadowBlur = 18; fctx.fillStyle = "#ff2a2a"; fctx.beginPath(); fctx.arc(mx, my, 7, 0, Math.PI * 2); fctx.fill(); fctx.shadowBlur = 0; fctx.fillStyle = "#fff"; fctx.beginPath(); fctx.arc(mx, my, 2.5, 0, Math.PI * 2); fctx.fill(); }
      }
      if (tool === "spot") placeSpot();
      if (lasering() || tool === "spot") requestAnimationFrame(step); else { fctx.clearRect(0, 0, innerWidth, innerHeight); looping = false; ring(); }
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
  const Q = Object.assign({ tool: null, pen: PENS[0], hl: HLS[0], size: 1, shape: "line", sym: "res" }, B.q || {}, { tool: null });
  const bsave = () => { B.at = Date.now(); B.q = { pen: Q.pen, hl: Q.hl, size: Q.size, shape: Q.shape, sym: Q.sym }; ls.set(BKEY, JSON.stringify(B)); };
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
  .ink-bb.sel canvas { cursor: default; }
  .ink-bb.las canvas { cursor: none; }
  .ink-bb.txt canvas { cursor: text; }
  .ink-btl .ink-sym { font-size: .78rem; font-weight: 600; padding: 0 7px; }
  .ink-tx { position: absolute; z-index: 2; margin: 0; padding: 2px; border: 1px dashed #1a73c7; border-radius: 4px; background: rgba(255, 255, 255, .92); resize: none; overflow: hidden; outline: none; white-space: pre; box-sizing: content-box; }
  .ink-bb.chalk .ink-tx { background: rgba(28, 52, 44, .92); }
  .ink-pgs { list-style: none; margin: 8px 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .ink-pgs li { border: 1px solid var(--rule, #d6dee4); border-radius: 10px; padding: 6px; text-align: center; }
  .ink-pgs li.on { border: 2px solid var(--teal, #0b6e6e); }
  .ink-pgi { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
  .ink-pgi img { display: block; width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--rule, #d6dee4); }
  .ink-pgs .ink-prow { justify-content: center; align-items: center; gap: 4px; margin-top: 6px; }
  .ink-pgs .ink-pb { height: 30px; padding: 0 8px; }
  .ink-bpan { position: absolute; right: 8px; z-index: 3; width: min(380px, calc(100% - 16px)); max-height: calc(100% - 120px); overflow-y: auto; background: var(--surface, #fff); color: var(--ink, #15243a); border: 1px solid var(--rule, #d6dee4); border-radius: 14px; box-shadow: 0 14px 34px rgba(21, 36, 58, .25); padding: 14px 14px 12px; cursor: default; }
  .ink-bpan[hidden] { display: none; }
  .ink-bpan h3 { margin: 0 30px 10px 0; font: 600 1.05rem var(--serif, serif); }
  .ink-bpan h4 { margin: 14px 0 6px; font: 700 .7rem var(--sans, sans-serif); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3, #6f7f91); }
  .ink-px { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
  .ink-px:hover { background: var(--teal-soft, #e0efee); }
  .ink-pl { display: grid; gap: 4px; font-size: .8rem; font-weight: 600; color: var(--ink-2, #4a5a6e); }
  .ink-pin { font: inherit; font-size: .95rem; height: 38px; padding: 0 10px; border: 1px solid var(--rule, #d6dee4); border-radius: 8px; background: var(--paper, #fff); color: var(--ink, #15243a); width: 100%; box-sizing: border-box; }
  .ink-prow { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
  .ink-pb { font: 600 .85rem var(--sans, sans-serif); height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--teal, #0b6e6e); background: var(--teal, #0b6e6e); color: #fff; cursor: pointer; display: inline-flex; align-items: center; }
  .ink-pb.ghost { background: transparent; color: var(--teal, #0b6e6e); }
  .ink-pb:disabled { opacity: .5; cursor: default; }
  .ink-pb:focus-visible, .ink-px:focus-visible, .ink-pin:focus-visible { outline: 3px solid var(--focus, #1a73c7); outline-offset: 1px; }
  .ink-pdel.sure { background: #d62828; border-color: #d62828; color: #fff; }
  .ink-pnote { margin: 6px 0 0; font-size: .8rem; color: var(--ink-2, #4a5a6e); }
  .ink-pmsg { margin: 10px 0 0; font-size: .85rem; font-weight: 600; color: var(--teal, #0b6e6e); }
  .ink-pask { margin: 10px 0 0; padding: 10px; border-radius: 10px; background: var(--amber-soft, #fbf1dc); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .ink-pask p { margin: 0 0 4px; flex-basis: 100%; font-size: .85rem; }
  .ink-plist { list-style: none; margin: 0; padding: 0; }
  .ink-plist li { padding: 8px 0; border-top: 1px solid var(--rule, #d6dee4); }
  .ink-plist li:first-child { border-top: 0; }
  .ink-pn { display: grid; } .ink-pn small { color: var(--ink-3, #6f7f91); font-size: .75rem; }
  .ink-plist .ink-prow { margin-top: 6px; }
  .ink-pfile { position: relative; }
  @media print { .ink-bd, .ink-chip { display: none !important; } }`;
  const bd = document.createElement("div"), chip = document.createElement("button");
  bd.className = "ink-bd"; bd.hidden = true; bd.setAttribute("role", "dialog"); bd.setAttribute("aria-label", "Writing board");
  bd.innerHTML = `<div class="ink-bh"><span class="ink-bt">📋 Board</span>
      <button type="button" data-bp="-1" aria-label="Previous page" title="Previous page">‹</button><span class="ink-pg"></span><button type="button" data-bp="1" aria-label="Next page" title="Next page">›</button>
      <button type="button" data-bnew aria-label="New page" title="New page (N)">＋</button>
      <select class="ink-bgs" aria-label="Background">${BGS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
      <label class="ink-op" title="See-through: lower lets the page show through (your writing stays solid)">◐<input type="range" min="20" max="100" step="5" aria-label="Board opacity"></label>
      <button type="button" data-bpen title="Pen only: only the stylus writes, so your palm or finger leaves no marks" aria-label="Pen only">✍️</button>
      <button type="button" data-bpages title="Pages: see every page, reorder or copy them" aria-label="Pages">▦</button>
      <button type="button" data-bopen title="My Boards: open a saved board" aria-label="My Boards: open a saved board">📂</button>
      <button type="button" data-bsave title="Save this board: to your account, a file or an image" aria-label="Save this board">💾</button>
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
    const penSw = `<span class="ink-sw">${PENS.map((c) => `<button type="button" data-bc="${c}" style="background:${chalk && c === PENS[0] ? "#f4f6f8" : c}" aria-label="Colour" aria-pressed="${c === Q.pen}"></button>`).join("")}</span>`;
    const sizes = (lab) => `<span class="ink-sep"></span>${SIZES.map((x, i) => `<button type="button" class="ink-sz" data-bs="${i}" aria-pressed="${Q.size === i}" aria-label="${lab} ${i + 1}" title="${lab} ${i + 1}"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join("")}`;
    if (t === "shape") o = SHAPES.map(([k, i, l]) => `<button type="button" data-bshape="${k}" aria-pressed="${Q.shape === k}" title="${l}" aria-label="${l}">${i}</button>`).join("") + `<span class="ink-sep"></span>${penSw}${sizes("Thickness")}<span class="ink-bhint">Drag on the board</span>`;
    if (t === "sym") o = Object.entries(SYMBOLS).map(([k, [l]]) => `<button type="button" class="ink-sym" data-bsym="${k}" aria-pressed="${Q.sym === k}" title="${l}">${l.split(" ")[0]}</button>`).join("") + `<span class="ink-sep"></span>${penSw}${sizes("Size")}<span class="ink-bhint">Tap the board to place it</span>`;
    if (t === "text") o = `${penSw}${sizes("Text size")}<span class="ink-bhint">Tap where the words go · Enter to finish</span>`;
    if (t === "laser") o = `<span class="ink-bhint">Point at the board: a red trail follows and fades</span>`;
    if (t === "pen") o = `<span class="ink-sw">${PENS.map((c) => `<button type="button" data-bc="${c}" style="background:${chalk && c === PENS[0] ? "#f4f6f8" : c}" aria-label="Board pen colour" aria-pressed="${c === Q.pen}"></button>`).join("")}</span>`;
    if (t === "hl") o = `<span class="ink-sw">${HLS.map((c) => `<button type="button" data-bhc="${c}" style="background:${c}" aria-label="Board highlighter colour" aria-pressed="${c === Q.hl}"></button>`).join("")}</span>`;
    if (t === "pen" || t === "hl") o += `<span class="ink-sep"></span>${SIZES.map((x, i) => `<button type="button" class="ink-sz" data-bs="${i}" aria-pressed="${Q.size === i}" aria-label="Size ${i + 1}" title="Size ${i + 1}"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join("")}`;
    if (t === "erase") o = erHtml();
    if (t === "sel") o = selOn() ? `<span class="ink-bhint">${SEL.list.length} selected: drag to move, the ○ corner to resize</span><span class="ink-sw">${PENS.map((c) => `<button type="button" data-bsc="${c}" style="background:${chalk && c === PENS[0] ? "#f4f6f8" : c}" aria-label="Change the colour of the selection" title="Change colour"></button>`).join("")}</span>
        <button type="button" data-bsdup title="Duplicate the selection" aria-label="Duplicate the selection">⧉ Duplicate</button><button type="button" data-bsdel title="Delete the selection (Delete key)" aria-label="Delete the selection">🗑 Delete</button>`
      : `<span class="ink-bhint">Draw a loop round what you want to move, or tap one line</span>`;
    btl.innerHTML = [["pen", "✏️", "Board pen (P). Hold still at the end of a line, box or circle to tidy it"], ["hl", "🖍", "Board highlighter (H)"], ["erase", "🧽", "Board eraser (E)"], ["sel", "⬚", "Select and move (V)"],
      ["shape", "📐", "Shapes: line, arrow, rectangle, circle"], ["sym", "Ω", "Circuit symbols"], ["text", "T", "Text (T)"], ["laser", "🔴", "Laser pointer (L)"]].map(([k, i, l]) => `<button type="button" data-bt="${k}" aria-pressed="${t === k}" title="${l}" aria-label="${l}">${i}</button>`).join("")
      + (o ? `<span class="ink-sep"></span>${o}` : "") + `<span class="ink-sep"></span><button type="button" data-bundo title="Undo on the board (Ctrl+Z)" aria-label="Undo on the board">↶</button>`
      + (t ? "" : `<span class="ink-bhint">Tap ✏️ here to write on the board</span>`);
    bb.classList.toggle("idle", !t); bb.classList.toggle("er", t === "erase"); bb.classList.toggle("sel", t === "sel"); bb.classList.toggle("las", t === "laser"); bb.classList.toggle("txt", t === "text");
  }
  function setBoardTool(t) {
    if (t !== "sel" || Q.tool !== "sel") clearSel();
    if (txEd) textDone(true);
    Q.tool = t;
    if (t === "laser") loop();
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
    bpage().forEach((s) => { if (!s.hide) drawStroke(s, bctx, 0, 0, chalk); });
    if (cur && cur.board && !cur.erasing && !cur.sel) { if (cur.g) cur.g.forEach((x) => drawStroke(x, bctx, 0, 0, chalk)); else drawStroke(cur, bctx, 0, 0, chalk); }
    selPaint();
  }
  function bdraw() {
    bd.hidden = !B.open || B.min; chip.hidden = !B.open || !B.min;
    chip.textContent = `📋 Board · page ${B.pi + 1}`;
    bd.classList.toggle("full", !!B.full);
    if (!B.full) place();
    Object.assign(bb.style, bgStyle()); bb.classList.toggle("chalk", B.bg === "chalk");
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
    if (txEd) { textDone(true); return; }   // a tap outside the text being typed finishes it
    if (t === "laser") return;
    if (t === "sel") return selDown(bpt(e));
    if (t === "text") return textAt(bpt(e));
    if (t === "shape") { const q = bpt(e); cur = { board: true, t: "pen", c: Q.pen, w: SIZES[Q.size], pr: 0, ln: 1, shape: Q.shape, a: q, p: shapePts(Q.shape, q, q) }; bpaint(); return; }
    if (t === "sym") { const q = bpt(e); cur = { board: true, sym: true, g: symbolStrokes(Q.sym, q) }; bpaint(); return; }
    if (t === "erase") { cur = { board: true, erasing: true, last: null }; berase(e); return; }
    cur = { board: true, t, c: t === "hl" ? Q.hl : Q.pen, w: SIZES[Q.size], pr: e.pointerType === "pen" && t === "pen" ? 1 : 0, p: [bpt(e)] };
    bpaint();
  });
  function berase(e) {
    const q = bpt(e), list = bpage(), n = erased(list, cur.last, q);
    cur.last = q;
    if (n !== list) { if (!cur.changed) { keep(bh_(), list); cur.changed = true; } B.pages[B.pi] = n; bpaint(); }
  }
  function bundo() { clearSel(); const h = bh_(); if (h.length) B.pages[B.pi] = h.pop(); else bpage().pop(); bsave(); bpaint(); }
  bcv.addEventListener("pointermove", (e) => {
    if (!cur || !cur.board) return;
    if (cur.sel) return selMove(bpt(e));
    if (cur.erasing) { berase(e); return; }
    if (cur.shape) { cur.p = shapePts(cur.shape, cur.a, bpt(e)); bpaint(); return; }
    if (cur.sym) { cur.g = symbolStrokes(Q.sym, bpt(e)); bpaint(); return; }
    if (cur.tidied) return;
    clearTimeout(tidyT);
    if (cur.t === "pen") tidyT = setTimeout(() => { if (cur && cur.board && cur.t === "pen" && !cur.shape && !cur.tidied && tidy(cur)) bpaint(); }, 650);
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach((x) => { const q = bpt(x), l = cur.p[cur.p.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 1.2) cur.p.push(q); });
    bpaint();
  });
  let tidyT = 0;
  const bend = () => {
    clearTimeout(tidyT);
    if (!cur || !cur.board) return; const c = cur; cur = null;
    if (c.sel) return selUp(c);
    if (c.erasing) { if (c.changed) bsave(); }
    else if (c.sym) { keep(bh_(), bpage()); B.pages[B.pi] = bpage().concat(c.g); bsave(); }
    else {
      const tap = c.shape && Math.hypot(c.p[c.p.length - 1][0] - c.a[0], c.p[c.p.length - 1][1] - c.a[1]) < 3 && c.shape !== "line";
      ["board", "shape", "a", "tidied"].forEach((k) => delete c[k]);
      if (!tap) { keep(bh_(), bpage()); bpage().push(c); bsave(); }
    }
    bpaint();
  };
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
  function newPage() { B.pages.push([]); B.pi = B.pages.length - 1; clearSel(); bsave(); bdraw(); if (P.view === "pages") drawPan(); }
  const erPick = (b) => { if (b.dataset.em) E.mode = b.dataset.em; else E.r = +b.dataset.er; saveE(); bTools(); if (open) drawBar(); ring(); };
  bh.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.bt) setBoardTool(b.dataset.bt);
    else if (b.dataset.bc) { Q.pen = b.dataset.bc; bsave(); bTools(); }
    else if (b.dataset.bsc) selColour(b.dataset.bsc);
    else if (b.hasAttribute("data-bsdup")) selDuplicate();
    else if (b.hasAttribute("data-bsdel")) selDelete();
    else if (b.dataset.bhc) { Q.hl = b.dataset.bhc; bsave(); bTools(); }
    else if (b.dataset.bs) { Q.size = +b.dataset.bs; bsave(); bTools(); }
    else if (b.dataset.em || b.dataset.er) erPick(b);
    else if (b.hasAttribute("data-bundo")) bundo();
    else if (b.dataset.bp) { B.pi = Math.max(0, Math.min(B.pages.length - 1, B.pi + +b.dataset.bp)); clearSel(); bsave(); bdraw(); if (P.view === "pages") drawPan(); }
    else if (b.hasAttribute("data-bnew")) newPage();
    else if (b.hasAttribute("data-bpen")) { B.penOnly = !penOnly(); bsave(); bdraw(); }
    else if (b.hasAttribute("data-bsave")) panel(P.view === "save" ? null : "save");
    else if (b.hasAttribute("data-bopen")) panel(P.view === "open" ? null : "open");
    else if (b.hasAttribute("data-bpages")) panel(P.view === "pages" ? null : "pages");
    else if (b.dataset.bshape) { Q.shape = b.dataset.bshape; bsave(); bTools(); }
    else if (b.dataset.bsym) { Q.sym = b.dataset.bsym; bsave(); bTools(); }
    else if (b.hasAttribute("data-bdel")) {
      if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = "Delete page?"; setTimeout(() => { if (b.isConnected) { b.classList.remove("sure"); b.textContent = "🗑"; } }, 3000); return; }
      b.classList.remove("sure"); b.textContent = "🗑";
      if (B.pages.length > 1) { B.pages.splice(B.pi, 1); B.pi = Math.min(B.pi, B.pages.length - 1); } else B.pages = [[]];
      bhist = {}; clearSel(); if (P.view === "pages") drawPan();
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
  /* ---------- ⬚ Select (V): draw a loop round what you wrote, or tap one line; then drag it to move it, drag the round
     corner handle to make it bigger or smaller, and Duplicate, change its colour or Delete it. Undo puts it back. ---------- */
  let SEL = { pi: -1, list: [] };
  const selOn = () => SEL.pi === B.pi && SEL.list.length > 0 && SEL.list.every((s) => bpage().includes(s));
  function clearSel() { SEL = { pi: -1, list: [] }; }
  function selBox() {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    SEL.list.forEach((s) => { if (s.t === "tx") { const t = txBox(s); a = Math.min(a, t.x); b = Math.max(b, t.x + t.w); c = Math.min(c, t.y); d = Math.max(d, t.y + t.h); return; } const hw = halfW(s); s.p.forEach((q) => { a = Math.min(a, q[0] - hw); b = Math.max(b, q[0] + hw); c = Math.min(c, q[1] - hw); d = Math.max(d, q[1] + hw); }); });
    return { x: a - 6, y: c - 6, w: b - a + 12, h: d - c + 12 };
  }
  const inPoly = (pt, poly) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  // before the selected strokes change: keep the page for undo and work on copies (the kept page has the old ones)
  function selCopy() {
    const pg = bpage(), at = SEL.list.map((s) => pg.indexOf(s));
    keep(bh_(), pg);
    SEL.list = at.map((i) => { const c = Object.assign({}, pg[i], { p: pg[i].p.map((q) => q.slice()) }); pg[i] = c; return c; });
    return at;
  }
  function selDown(q) {
    if (selOn()) {
      const r = selBox(), hx = r.x + r.w, hy = r.y + r.h;
      if (Math.hypot(q[0] - hx, q[1] - hy) < 18) { const at = selCopy(); cur = { board: true, sel: "size", at, o: [r.x, r.y], d0: Math.max(10, Math.hypot(hx - r.x, hy - r.y)), base: SEL.list.map((s) => s.p.map((p) => p.slice())), ws: SEL.list.map((s) => s.w) }; return; }
      if (q[0] >= r.x && q[0] <= hx && q[1] >= r.y && q[1] <= hy) { const at = selCopy(); cur = { board: true, sel: "move", at, last: q }; return; }
    }
    clearSel(); cur = { board: true, sel: "lasso", p: [q] }; bTools(); bpaint();
  }
  function selMove(q) {
    if (cur.sel === "lasso") cur.p.push(q);
    else if (cur.sel === "move") { const dx = q[0] - cur.last[0], dy = q[1] - cur.last[1]; cur.last = q; if (dx || dy) cur.moved = true; SEL.list.forEach((s) => s.p.forEach((p) => { p[0] += dx; p[1] += dy; })); }
    else {
      const [ox, oy] = cur.o, k = Math.max(0.15, Math.min(8, Math.hypot(q[0] - ox, q[1] - oy) / cur.d0));
      cur.moved = true;
      SEL.list.forEach((s, i) => { s.p.forEach((p, j) => { const b = cur.base[i][j]; p[0] = Math.round((ox + (b[0] - ox) * k) * 10) / 10; p[1] = Math.round((oy + (b[1] - oy) * k) * 10) / 10; }); s.w = s.t === "tx" ? Math.max(8, Math.round(cur.ws[i] * k)) : Math.max(1, Math.round(cur.ws[i] * Math.sqrt(k) * 10) / 10); });
    }
    bpaint();
  }
  function selUp(c) {
    const pg = bpage();
    if (c.sel === "lasso") {
      const xs = c.p.map((q) => q[0]), ys = c.p.map((q) => q[1]), tap = Math.max(...xs) - Math.min(...xs) < 10 && Math.max(...ys) - Math.min(...ys) < 10;
      let pick;
      if (tap) { const [x, y] = c.p[0], hit = pg.filter((s) => wholeOut([s], x, y, 10).length === 0); pick = hit.length ? [hit[hit.length - 1]] : []; }
      else pick = pg.filter((s) => { if (s.t === "tx") { const t = txBox(s); return inPoly([t.x + t.w / 2, t.y + t.h / 2], c.p); } return s.p.filter((q) => inPoly(q, c.p)).length >= s.p.length * 0.6; });
      SEL = { pi: B.pi, list: pick };
    } else if (!c.moved) {   // a tap inside the box: nothing changed, so take back the undo step
      const h = bh_(); B.pages[B.pi] = h.pop(); SEL.list = c.at.map((i) => B.pages[B.pi][i]);
    } else bsave();
    bTools(); bpaint();
  }
  function selDelete() { if (!selOn()) return; const pg = bpage(); keep(bh_(), pg); B.pages[B.pi] = pg.filter((s) => !SEL.list.includes(s)); clearSel(); bsave(); bTools(); bpaint(); }
  function selDuplicate() {
    if (!selOn()) return;
    const pg = bpage(); keep(bh_(), pg);
    const copies = SEL.list.map((s) => Object.assign({}, s, { p: s.p.map((q) => [q[0] + 24, q[1] + 24, q[2]]) }));
    B.pages[B.pi] = pg.concat(copies); SEL = { pi: B.pi, list: copies }; bsave(); bTools(); bpaint();
  }
  function selColour(c) { if (!selOn()) return; selCopy(); SEL.list.forEach((s) => { s.c = s.t === "hl" ? (HLS.includes(c) ? c : s.c) : c; }); bsave(); bTools(); bpaint(); }
  // the selection drawn over the writing: the loop while drawing it, then a dashed box with a round handle
  function selPaint() {
    if (cur && cur.sel === "lasso" && cur.p.length > 1) {
      bctx.save(); bctx.setLineDash([5, 4]); bctx.strokeStyle = "#1a73c7"; bctx.lineWidth = 1.5; bctx.beginPath();
      cur.p.forEach((q, i) => (i ? bctx.lineTo(q[0], q[1]) : bctx.moveTo(q[0], q[1]))); bctx.stroke(); bctx.restore();
    }
    if (selOn() && Q.tool === "sel") {
      const r = selBox();
      bctx.save(); bctx.fillStyle = "rgba(26, 115, 199, .07)"; bctx.fillRect(r.x, r.y, r.w, r.h);
      bctx.setLineDash([6, 4]); bctx.strokeStyle = "#1a73c7"; bctx.lineWidth = 1.5; bctx.strokeRect(r.x, r.y, r.w, r.h);
      bctx.setLineDash([]); bctx.fillStyle = "#fff"; bctx.beginPath(); bctx.arc(r.x + r.w, r.y + r.h, 8, 0, Math.PI * 2); bctx.fill(); bctx.stroke();
      bctx.restore();
    }
  }
  /* ---------- 📐 Shapes: line, arrow, rectangle, circle (drag from one corner to the other). The pen also tidies a
     rough shape: hold still for a moment at the end of a line, rectangle or circle and it becomes a neat one. ---------- */
  const SHAPES = [["line", "╱", "Straight line"], ["arrow", "↗", "Arrow"], ["rect", "▭", "Rectangle"], ["oval", "◯", "Circle or oval"]];
  function shapePts(kind, a, b) {
    const [x1, y1] = a, [x2, y2] = b;
    if (kind === "line") return [[x1, y1, 0], [x2, y2, 0]];
    if (kind === "arrow") {
      const L = Math.hypot(x2 - x1, y2 - y1) || 1, h = Math.min(22, Math.max(10, L * 0.25)), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      const p1 = [x2 - h * (ux * 0.87 - uy * 0.5), y2 - h * (uy * 0.87 + ux * 0.5), 0], p2 = [x2 - h * (ux * 0.87 + uy * 0.5), y2 - h * (uy * 0.87 - ux * 0.5), 0];
      return [[x1, y1, 0], [x2, y2, 0], p1, [x2, y2, 0], p2];
    }
    if (kind === "rect") return [[x1, y1, 0], [x2, y1, 0], [x2, y2, 0], [x1, y2, 0], [x1, y1, 0]];
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2, pts = [];
    for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI * 2; pts.push([Math.round((cx + rx * Math.cos(t)) * 10) / 10, Math.round((cy + ry * Math.sin(t)) * 10) / 10, 0]); }
    return pts;
  }
  // hold-to-tidy: is this rough stroke a line, a circle or a rectangle?
  function tidy(st) {
    const p = st.p; if (p.length < 8) return false;
    let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const a = p[0], z = p[p.length - 1], chord = Math.hypot(z[0] - a[0], z[1] - a[1]);
    let kind = null, box;
    if (chord / len > 0.92) kind = "line";
    else if (chord / len < 0.2) {
      const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, rx = (box[2] - box[0]) / 2 || 1, ry = (box[3] - box[1]) / 2 || 1;
      const dev = p.reduce((s2, q) => s2 + Math.abs(Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) - 1), 0) / p.length;
      kind = dev < 0.12 ? "oval" : "rect";
    }
    if (!kind) return false;
    st.p = kind === "line" ? shapePts("line", a, z) : shapePts(kind, [box[0], box[1]], [box[2], box[3]]);
    st.ln = 1; st.pr = 0; st.tidied = true;
    return true;
  }

  /* ---------- Ω Circuit symbols: tap to place (drag before letting go to place it exactly). Each symbol is drawn as
     ordinary straight lines in the pen colour, so it can be selected, moved, resized, erased and saved like writing. ---------- */
  const zig = () => { const z = [[-40, 0], [-24, 0]]; for (let i = 0; i < 6; i++) z.push([-20 + i * 8, i % 2 ? 8 : -8]); return z.concat([[24, 0], [40, 0]]); };
  const coil = () => { const c = [[-40, 0], [-24, 0]]; for (let k = 0; k < 4; k++) for (let i = 0; i <= 8; i++) { const t = Math.PI - (i / 8) * Math.PI; c.push([-18 + k * 12 + 6 * Math.cos(t), -6 * Math.sin(t)]); } return c.concat([[24, 0], [40, 0]]); };
  const SYMBOLS = {
    res: ["Resistor", () => [zig()]],
    cap: ["Capacitor", () => [[[-40, 0], [-5, 0]], [[-5, -14], [-5, 14]], [[5, -14], [5, 14]], [[5, 0], [40, 0]]]],
    ind: ["Inductor", () => [coil()]],
    opamp: ["Op-amp", () => [[[-24, -28], [-24, 28], [28, 0], [-24, -28]], [[-40, -14], [-24, -14]], [[-40, 14], [-24, 14]], [[28, 0], [44, 0]], [[-20, -14], [-13, -14]], [[-20, 14], [-13, 14]], [[-16.5, 10.5], [-16.5, 17.5]]]],
    gnd: ["Ground", () => [[[0, -20], [0, 0]], [[-14, 0], [14, 0]], [[-9, 5], [9, 5]], [[-4, 10], [4, 10]]]],
    bat: ["Battery / DC source", () => [[[-40, 0], [-6, 0]], [[-6, -16], [-6, 16]], [[6, -8], [6, 8]], [[6, 0], [40, 0]], [[-19, -22], [-12, -22]], [[-15.5, -25.5], [-15.5, -18.5]]]],
    diode: ["Diode", () => [[[-40, 0], [-10, 0]], [[-10, -12], [-10, 12], [10, 0], [-10, -12]], [[10, -12], [10, 12]], [[10, 0], [40, 0]]]],
    led: ["LED", () => [[[-40, 0], [-10, 0]], [[-10, -12], [-10, 12], [10, 0], [-10, -12]], [[10, -12], [10, 12]], [[10, 0], [40, 0]], [[0, -16], [10, -26]], [[5, -26], [10, -26], [10, -21]], [[8, -12], [18, -22]], [[13, -22], [18, -22], [18, -17]]]],
    sensor: ["Sensor (box)", () => [[[-30, -18], [30, -18], [30, 18], [-30, 18], [-30, -18]], [[-40, -8], [-30, -8]], [[-40, 8], [-30, 8]], [[30, 0], [40, 0]]], "SENSOR"],
    esp32: ["ESP32 board", () => { const g = [[[-40, -28], [40, -28], [40, 28], [-40, 28], [-40, -28]]]; for (let x = -28; x <= 28; x += 14) { g.push([[x, -28], [x, -36]]); g.push([[x, 28], [x, 36]]); } return g; }, "ESP32"]
  };
  const SYMSZ = [0.8, 1.1, 1.5];
  function symbolStrokes(key, at) {
    const [, make, label] = SYMBOLS[key], k = SYMSZ[Q.size] || 1.1, w = Math.max(1.5, SIZES[Q.size] * 0.7);
    const out = make().map((pl) => ({ t: "pen", c: Q.pen, w, pr: 0, ln: 1, p: pl.map(([x, y]) => [Math.round((at[0] + x * k) * 10) / 10, Math.round((at[1] + y * k) * 10) / 10, 0]) }));
    if (label) { const fs = Math.round(11 * k); mctx.font = TXF(fs); out.push({ t: "tx", c: Q.pen, w: fs, s: label, p: [[Math.round(at[0] - mctx.measureText(label).width / 2), Math.round(at[1] - fs * 0.62), 0]] }); }
    return out;
  }

  /* ---------- T Text: tap where the words go and type; Enter finishes (Shift+Enter starts a new line), Esc cancels.
     Tap a text with T to change it. ---------- */
  const TXS = [18, 26, 38];
  let txEd = null;
  function textAt(q) {
    const pg = bpage(), hit = pg.slice().reverse().find((s) => s.t === "tx" && txHit(s, q[0], q[1], 4));
    const ed = document.createElement("textarea");
    ed.className = "ink-tx"; ed.setAttribute("aria-label", "Text on the board"); ed.rows = 1;
    const size = hit ? hit.w : TXS[Q.size] || 26, col = hit ? hit.c : Q.pen, at = hit ? hit.p[0] : [q[0], q[1] - size * 0.6, 0];
    Object.assign(ed.style, { left: `${at[0] - 3}px`, top: `${at[1] - 3}px`, font: TXF(size), color: B.bg === "chalk" && col === PENS[0] ? "#f4f6f8" : col, lineHeight: "1.25" });
    ed.value = hit ? hit.s : "";
    txEd = { ed, hit, size, col, at };
    if (hit) { hit.hide = true; bpaint(); }
    bb.appendChild(ed);
    const grow = () => { ed.style.height = "auto"; ed.style.height = `${ed.scrollHeight}px`; mctx.font = TXF(size); ed.style.width = `${Math.max(140, ...ed.value.split("\n").map((l) => mctx.measureText(l).width + 24))}px`; };
    ed.addEventListener("input", grow); grow();
    ed.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); textDone(true); } else if (e.key === "Escape") { e.preventDefault(); textDone(false); } });
    ed.addEventListener("blur", () => textDone(true));
    ed.addEventListener("pointerdown", (e) => e.stopPropagation());
    setTimeout(() => ed.focus(), 0);
  }
  function textDone(ok) {
    if (!txEd) return;
    const { ed, hit, size, col, at } = txEd; txEd = null;
    const v = ed.value.replace(/\s+$/, "").slice(0, 400); ed.remove();
    if (hit) delete hit.hide;
    if (ok && (v || hit) && (!hit || v !== hit.s)) {
      const pg = bpage(); keep(bh_(), pg);
      const st = { t: "tx", c: col, w: size, s: v, p: [[at[0], at[1], 0]] };
      if (hit) { const i = pg.indexOf(hit); if (v) pg[i] = st; else pg.splice(i, 1); } else pg.push(st);
      bsave();
    }
    bpaint();
  }

  /* ---------- ▦ Pages: every page as a small picture; tap one to go there, ◀ ▶ to move it, ⧉ to copy it ---------- */
  function pageCanvas(i, k) {
    const w = bb.clientWidth || B.w || 760, h = bb.clientHeight || B.h || 480, c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext("2d"); x.scale(k, k);
    x.fillStyle = B.bg === "chalk" ? "#1c342c" : "#ffffff"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(26, 115, 199, .22)"; x.lineWidth = 1;
    if (B.bg === "grid") { for (let a = 0; a < w; a += 24) { x.beginPath(); x.moveTo(a + 0.5, 0); x.lineTo(a + 0.5, h); x.stroke(); } for (let b = 0; b < h; b += 24) { x.beginPath(); x.moveTo(0, b + 0.5); x.lineTo(w, b + 0.5); x.stroke(); } }
    if (B.bg === "lined") for (let b = 31; b < h; b += 32) { x.beginPath(); x.moveTo(0, b + 0.5); x.lineTo(w, b + 0.5); x.stroke(); }
    (B.pages[i] || []).forEach((s) => drawStroke(s, x, 0, 0, B.bg === "chalk"));
    return c;
  }
  function movePage(i, d) {
    const j = i + d; if (j < 0 || j >= B.pages.length) return;
    const cur0 = B.pages[B.pi];
    [B.pages[i], B.pages[j]] = [B.pages[j], B.pages[i]];
    B.pi = B.pages.indexOf(cur0); bhist = {}; clearSel(); bsave(); bdraw();
  }
  function copyPage(i) { B.pages.splice(i + 1, 0, B.pages[i].map((s) => Object.assign({}, s, { p: s.p.map((q) => q.slice()) }))); B.pi = i + 1; bhist = {}; clearSel(); bsave(); bdraw(); }

  /* ---------- Export all pages as one PDF: the browser's print window, one page of the board per sheet ---------- */
  function exportPdf() {
    const name = B.name || "Board", d = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const imgs = B.pages.map((pg, i) => `<section><p>${escH(name)} · page ${i + 1} of ${B.pages.length} · ${d}</p><img src="${pageCanvas(i, 2).toDataURL("image/png")}" alt="Page ${i + 1}"></section>`).join("");
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true"); Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escH(name)}</title><style>@page { size: A4 landscape; margin: 10mm; } body { margin: 0; font: 10pt system-ui, sans-serif; color: #333; }
      section { break-after: page; page-break-after: always; text-align: center; } section:last-child { break-after: auto; page-break-after: auto; }
      p { margin: 0 0 4mm; text-align: left; } img { max-width: 100%; max-height: 178mm; border: 1px solid #ccc; }</style></head><body>${imgs}</body></html>`); doc.close();
    const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* print blocked */ } setTimeout(() => f.remove(), 60000); };
    const all = [...doc.images]; let left = all.length;
    if (!left) go(); else all.forEach((im) => { if (im.complete) { if (!--left) go(); } else im.onload = im.onerror = () => { if (!--left) go(); }; });
  }
  /* ---------- My Boards. Lecturers save boards to their account (Firestore boards/{uid}_{id}, the pages packed into one
     text field; boardidx/{uid} lists them, so the list costs 1 read and a save 2 writes; up to 50 boards of 900 KB).
     Everyone else saves on this device (localStorage "nmkboards", not "nmk-" so it never syncs: up to 10 boards, about
     3.5 MB in all) or to a file, and opens them again: no Firebase at all (lecturer's choice, to keep the reads and
     writes for 61 students at zero). ---------- */
  const KB = (n) => Math.ceil(n / 1024);
  const hashS = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); };
  // pack: whole-pixel points, each one as the change from the one before (about half the size)
  function enc(pages) {
    return JSON.stringify(pages.map((pg) => pg.map((s) => {
      if (s.t === "tx") return [2, s.c, s.w, 0, [Math.round(s.p[0][0]), Math.round(s.p[0][1])], 0, String(s.s || "")];
      const d = []; let px = 0, py = 0, pp = 0;
      s.p.forEach((q) => { const x = Math.round(q[0]), y = Math.round(q[1]), p = Math.round((q[2] || 0) * 100); d.push(x - px, y - py); if (s.pr) d.push(p - pp); px = x; py = y; pp = p; });
      return [s.t === "hl" ? 1 : 0, s.c, s.w, s.pr ? 1 : 0, d, s.ln ? 1 : 0];
    })));
  }
  function dec(str) {
    const a = JSON.parse(str);
    if (!Array.isArray(a)) throw new Error("not a board");
    return a.map((pg) => (Array.isArray(pg) ? pg : []).map(([h, c, w, pr, d, ln, tx]) => {
      const col = /^#[0-9a-f]{6}$/i.test(c) ? c : PENS[0];
      if (h === 2) return { t: "tx", c: col, w: Math.max(8, Math.min(120, +w || 26)), s: String(tx || "").slice(0, 400), p: [[+(d || [])[0] || 0, +(d || [])[1] || 0, 0]] };
      const p = [], k = pr ? 3 : 2; let x = 0, y = 0, pp = 0;
      for (let i = 0; i + 1 < (d || []).length; i += k) { x += d[i]; y += d[i + 1]; if (pr) pp += d[i + 2] || 0; p.push([x, y, pr ? pp / 100 : 0]); }
      const st = { t: h ? "hl" : "pen", c: col, w: +w || SIZES[1], pr: pr ? 1 : 0, p }; if (ln) st.ln = 1; return st;
    }).filter((s) => s.p.length));
  }
  const hasInk = () => B.pages.some((pg) => pg.length);
  const unsavedBoard = () => hasInk() && hashS(enc(B.pages)) !== B.sh;
  const acct = () => { const A = window.NMKAccount, u = A && A.state && A.state.user; return u ? { A, u, db: A.db, lec: A.isAdmin(u.email) } : null; };
  const lecAcct = () => { const a = acct(); return a && a.lec ? a : null; };
  const escH = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const fmtAt = (ms) => { try { return new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
  const nameIn = () => { const inp = pan.querySelector(".ink-pin:not([data-rin])"); return ((inp && inp.value) || B.name || `Board ${today()}`).trim().slice(0, 60) || `Board ${today()}`; };
  // boards on this device
  const DKEY = "nmkboards", DMAX = 10, DKB = 3500;
  const dAll = () => { try { return JSON.parse(ls.get(DKEY) || "{}") || {}; } catch (e) { return {}; } };
  const dWrite = (o) => { try { localStorage.setItem(DKEY, JSON.stringify(o)); return true; } catch (e) { return false; } };
  // the lecturer's boards on the account, read once per page
  let idx = null, idxUid = null;
  async function loadIdx(a) {
    if (idx && idxUid === a.u.uid) return idx;
    const d = await a.db.collection("boardidx").doc(a.u.uid).get();
    idx = (d.exists && d.data().list) || {}; idxUid = a.u.uid;
    return idx;
  }
  const pan = document.createElement("div");
  pan.className = "ink-bpan"; pan.hidden = true; pan.setAttribute("role", "dialog"); pan.setAttribute("aria-label", "Save or open a board");
  bd.appendChild(pan);
  let P = { view: null, msg: "", ask: null, ren: null, del: null, busy: false };
  function panel(view) {
    P = Object.assign(P, { view, msg: view === P.view ? P.msg : "", ask: null, ren: null, del: null });
    if (!view) { pan.hidden = true; return; }
    pan.hidden = false; pan.style.top = `${bh.offsetHeight + 8}px`;
    drawPan();
    if (view === "open" && lecAcct() && !idx) refreshList();
  }
  const askHtml = () => (P.ask ? `<div class="ink-pask"><p>${P.ask.text}</p><button type="button" class="ink-pb" data-pyes>${P.ask.yes}</button><button type="button" class="ink-pb ghost" data-pno>Cancel</button></div>` : "");
  // one list of saved boards: kind "c" (account) or "d" (this device)
  function listHtml(kind, list, max) {
    const rows = Object.entries(list).sort((p, q) => (q[1].at || 0) - (p[1].at || 0));
    if (!rows.length) return `<p class="ink-pnote">${kind === "c" ? "No boards on your account yet." : "No boards saved on this device yet."}</p>`;
    return `<ul class="ink-plist">${rows.map(([id, v]) => P.ren === kind + id
      ? `<li><input class="ink-pin" data-rin maxlength="60" value="${escH(v.name)}" aria-label="New name"><span class="ink-prow"><button type="button" class="ink-pb" data-prs="${id}" data-k="${kind}">Save name</button><button type="button" class="ink-pb ghost" data-pno>Cancel</button></span></li>`
      : `<li><span class="ink-pn"><strong>${escH(v.name)}</strong><small>${v.n || 1} page${v.n === 1 ? "" : "s"} · ${v.kb || 1} KB · ${escH(fmtAt(v.at))}</small></span>
        <span class="ink-prow"><button type="button" class="ink-pb" data-pop="${id}" data-k="${kind}" ${P.busy ? "disabled" : ""}>Open</button><button type="button" class="ink-pb ghost" data-pren="${id}" data-k="${kind}" aria-label="Rename ${escH(v.name)}">✎</button><button type="button" class="ink-pb ghost ink-pdel${P.del === kind + id ? " sure" : ""}" data-pdel="${id}" data-k="${kind}" aria-label="Delete ${escH(v.name)}">${P.del === kind + id ? "Delete?" : "🗑"}</button></span></li>`).join("")}</ul>
      <p class="ink-pnote">${rows.length} of ${max} boards.</p>`;
  }
  function drawPan() {
    const lec = lecAcct(), x = `<button type="button" class="ink-px" data-px aria-label="Close">✕</button>`, msg = P.msg ? `<p class="ink-pmsg" aria-live="polite">${P.msg}</p>` : "";
    if (P.view === "save") {
      const name = B.name || `Board ${today()}`, size = KB(enc(B.pages).length);
      const mineC = lec && B.cid && B.cuid === lec.u.uid, mineD = !lec && B.lid && dAll()[B.lid];
      pan.innerHTML = `${x}<h3>💾 Save This Board</h3>
        <label class="ink-pl">Name<input class="ink-pin" maxlength="60" value="${escH(name)}" aria-label="Board name"></label>
        <p class="ink-pnote">${B.pages.length} page${B.pages.length === 1 ? "" : "s"} · about ${size} KB</p>${askHtml()}
        ${lec ? `<div class="ink-prow"><button type="button" class="ink-pb" data-pcloud ${P.busy ? "disabled" : ""}>Save to my account</button>${mineC ? `<button type="button" class="ink-pb ghost" data-pnew ${P.busy ? "disabled" : ""}>Save as new</button>` : ""}</div>
            ${mineC ? `<p class="ink-pnote">Opened from your account: Save updates it.</p>` : ""}<h4>On This Device</h4><div class="ink-prow">`
          : `<div class="ink-prow"><button type="button" class="ink-pb" data-pdev>Save on this device</button>${mineD ? `<button type="button" class="ink-pb ghost" data-pdnew>Save as new</button>` : ""}`}
          <button type="button" class="ink-pb ghost" data-pfile>Save to file</button><button type="button" class="ink-pb ghost" data-bimg>Save page as image</button><button type="button" class="ink-pb ghost" data-ppdf>Export all pages as PDF</button></div>
        ${lec ? "" : `<p class="ink-pnote">Boards saved here stay in this browser. To open one on another phone or laptop, use Save to file and keep the file.</p>`}${msg}`;
      const i = pan.querySelector(".ink-pin"); if (i && !P.ask) setTimeout(() => { i.focus(); i.select(); }, 0);
      return;
    }
    if (P.view === "pages") {
      const n = B.pages.length;
      pan.innerHTML = `${x}<h3>▦ Pages</h3><p class="ink-pnote">Tap a page to go to it. ◀ ▶ move it earlier or later, ⧉ copies it.</p>
        <ol class="ink-pgs">${B.pages.map((pg, i) => `<li class="${i === B.pi ? "on" : ""}"><button type="button" class="ink-pgi" data-pgo="${i}" aria-label="Go to page ${i + 1}"><img src="${pageCanvas(i, 0.22).toDataURL("image/png")}" alt=""></button>
          <span class="ink-prow"><button type="button" class="ink-pb ghost" data-pmv="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="Move page ${i + 1} earlier">◀</button><strong>${i + 1}</strong><button type="button" class="ink-pb ghost" data-pmv="${i}" data-d="1" ${i < n - 1 ? "" : "disabled"} aria-label="Move page ${i + 1} later">▶</button><button type="button" class="ink-pb ghost" data-pcp="${i}" aria-label="Copy page ${i + 1}">⧉</button></span></li>`).join("")}</ol>
        <div class="ink-prow"><button type="button" class="ink-pb" data-pnewpg>＋ New page</button><button type="button" class="ink-pb ghost" data-ppdf>Export all pages as PDF</button></div>`;
      return;
    }
    pan.innerHTML = `${x}<h3>📂 My Boards</h3>${askHtml()}
      ${lec ? `<h4>On My Account</h4>${idx ? listHtml("c", idx, 50) : `<p class="ink-pnote">Loading your boards…</p>`}` : `<h4>On This Device</h4>${listHtml("d", dAll(), DMAX)}`}
      ${msg}<h4>From a File</h4><label class="ink-pb ghost ink-pfile">Open a file…<input type="file" accept=".json,application/json" data-pfin hidden></label>`;
  }
  const say = (m) => { P.msg = m; drawPan(); };
  async function refreshList() {
    const a = lecAcct(); if (!a) return;
    try { await loadIdx(a); } catch (e) { P.msg = `Couldn't load your boards (${escH(e.code || e.message || e)}).`; idx = idx || {}; }
    if (P.view === "open") drawPan();
  }
  // put a board on screen (from the account, this device or a file)
  function useBoard(o) {
    B.pages = o.pages.length ? o.pages : [[]]; B.pi = 0; B.bg = BGS.some(([k]) => k === o.bg) ? o.bg : B.bg; B.name = o.name || "";
    if (txEd) textDone(false);
    B.cid = o.cid || null; B.cuid = o.cuid || null; B.lid = o.lid || null; B.sh = hashS(enc(B.pages)); bhist = {}; clearSel();
    bsave(); bdraw(); bTools();
  }
  // asks before writing on the board that isn't saved is replaced
  function replaceOk(go) { if (!unsavedBoard()) return go(); P.ask = { text: "The board on screen has writing that isn't saved. Replace it?", yes: "Replace it", go }; drawPan(); }
  // on this device
  function devSave(asNew, sure) {
    const name = nameIn(), data = enc(B.pages), all = dAll();
    if (!hasInk()) return say("The board is empty: write something first.");
    let id = !asNew && B.lid && all[B.lid] ? B.lid : null;
    if (!id) {
      const same = Object.entries(all).find(([, v]) => String(v.name).toLowerCase() === name.toLowerCase());
      if (same && !sure) { P.msg = ""; P.ask = { text: `You already have a board named “${escH(name)}” on this device. Replace it?`, yes: "Replace it", go: () => devSave(asNew, true) }; return drawPan(); }
      if (same) id = same[0];
    }
    if (!id && Object.keys(all).length >= DMAX) return say(`This device already keeps ${DMAX} boards. Delete one in 📂 My Boards first, or use Save to file.`);
    id = id || Date.now().toString(36);
    const nx = Object.assign({}, all, { [id]: { name, n: B.pages.length, kb: KB(data.length), at: Date.now(), bg: B.bg, data } });
    if (KB(JSON.stringify(nx).length) > DKB || !dWrite(nx)) return say("This device has no room for this board. Delete an old board in 📂 My Boards, or use Save to file.");
    B.name = name; B.lid = id; B.sh = hashS(data); bsave();
    say(`Saved on this device ✓ “${escH(name)}”`);
  }
  // on the lecturer's account
  async function cloudSave(asNew, sure) {
    const a = lecAcct(); if (!a) return;
    const name = nameIn(), data = enc(B.pages);
    if (!hasInk()) return say("The board is empty: write something first.");
    if (KB(data.length) > 900) return say(`This board is about ${KB(data.length)} KB, more than the 900 KB a board can hold. Delete a few pages (or split it into two boards), or use Save to file.`);
    P.busy = true; say("Saving…"); B.name = name;
    try {
      const list = await loadIdx(a);
      let id = !asNew && B.cid && B.cuid === a.u.uid && list[B.cid] ? B.cid : null;
      if (!id) {
        const same = Object.entries(list).find(([, v]) => String(v.name).toLowerCase() === name.toLowerCase());
        if (same && !sure) { P.busy = false; P.msg = ""; P.ask = { text: `You already have a board named “${escH(name)}”. Replace it?`, yes: "Replace it", go: () => cloudSave(asNew, true) }; return drawPan(); }
        if (same) id = same[0];
      }
      if (!id && Object.keys(list).length >= 50) { P.busy = false; return say("You have 50 boards, the most an account can keep. Delete one in 📂 My Boards first."); }
      id = id || Date.now().toString(36);
      const FV = firebase.firestore.FieldValue, b = a.db.batch(), nl = Object.assign({}, list, { [id]: { name, n: B.pages.length, kb: KB(data.length), at: Date.now() } });
      b.set(a.db.collection("boards").doc(`${a.u.uid}_${id}`), { uid: a.u.uid, name, bg: B.bg, n: B.pages.length, data, at: FV.serverTimestamp() });
      b.set(a.db.collection("boardidx").doc(a.u.uid), { list: nl, at: FV.serverTimestamp() });
      await b.commit();
      idx = nl; B.cid = id; B.cuid = a.u.uid; B.sh = hashS(data); bsave();
      P.busy = false; say(`Saved to your account ✓ “${escH(name)}”`);
    } catch (e) { P.busy = false; say(`Not saved (${escH(e.code || e.message || e)}).${e.code === "permission-denied" ? " Publish the latest Firestore rules in the Firebase console." : ""}`); }
  }
  async function openBoard(kind, id) {
    if (kind === "d") {
      const v = dAll()[id]; if (!v) return say("That board isn't there any more.");
      let o; try { o = { pages: dec(v.data), bg: v.bg, name: v.name, lid: id }; } catch (e) { return say("That board couldn't be read."); }
      return replaceOk(() => { useBoard(o); panel(null); });
    }
    const a = lecAcct(); if (!a) return;
    P.busy = true; say("Opening…");
    try {
      const d = await a.db.collection("boards").doc(`${a.u.uid}_${id}`).get();
      P.busy = false;
      if (!d.exists) { delete idx[id]; return say("That board isn't there any more."); }
      const x = d.data(), o = { pages: dec(x.data), bg: x.bg, name: x.name, cid: id, cuid: a.u.uid };
      P.msg = ""; replaceOk(() => { useBoard(o); panel(null); });
      if (P.view) drawPan();
    } catch (e) { P.busy = false; say(`Couldn't open it (${escH(e.code || e.message || e)}).`); }
  }
  async function renameBoard(kind, id, name) {
    name = String(name || "").trim().slice(0, 60); if (!name) return;
    if (kind === "d") { const all = dAll(); if (!all[id]) return; all[id].name = name; dWrite(all); if (B.lid === id) { B.name = name; bsave(); } P.ren = null; return say("Renamed ✓"); }
    const a = lecAcct(); if (!a) return;
    try {
      const nl = Object.assign({}, idx, { [id]: Object.assign({}, idx[id], { name }) }), b = a.db.batch();
      b.update(a.db.collection("boards").doc(`${a.u.uid}_${id}`), { name });
      b.set(a.db.collection("boardidx").doc(a.u.uid), { list: nl, at: firebase.firestore.FieldValue.serverTimestamp() });
      await b.commit(); idx = nl; if (B.cid === id) { B.name = name; bsave(); }
      P.ren = null; say("Renamed ✓");
    } catch (e) { say(`Not renamed (${escH(e.code || e.message || e)}).`); }
  }
  async function deleteBoard(kind, id) {
    if (kind === "d") { const all = dAll(); delete all[id]; dWrite(all); if (B.lid === id) { B.lid = null; bsave(); } P.del = null; return say("Deleted."); }
    const a = lecAcct(); if (!a) return;
    try {
      const nl = Object.assign({}, idx); delete nl[id];
      const b = a.db.batch();
      b.delete(a.db.collection("boards").doc(`${a.u.uid}_${id}`));
      b.set(a.db.collection("boardidx").doc(a.u.uid), { list: nl, at: firebase.firestore.FieldValue.serverTimestamp() });
      await b.commit(); idx = nl; if (B.cid === id) { B.cid = null; bsave(); }
      P.del = null; say("Deleted.");
    } catch (e) { say(`Not deleted (${escH(e.code || e.message || e)}).`); }
  }
  function fileSave() {
    const name = nameIn();
    const blob = new Blob([JSON.stringify({ app: "nmk42003-board", v: 1, name, bg: B.bg, pages: enc(B.pages) })], { type: "application/json" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob);
    el.download = `${name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "board"}.json`;
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 5000);
    B.name = name; B.sh = hashS(enc(B.pages)); bsave(); say("Saved to a file ✓ (look in your Downloads).");
  }
  function fileOpen(f) {
    if (!f) return;
    if (f.size > 5e6) return say("That file is too big for a board.");
    const r = new FileReader();
    r.onload = () => {
      try { const o = JSON.parse(r.result); if (o.app !== "nmk42003-board") throw new Error("x"); const b = { pages: dec(o.pages), bg: o.bg, name: o.name }; replaceOk(() => { useBoard(b); panel(null); }); }
      catch (e) { say("That isn't a board file saved from this site."); }
    };
    r.readAsText(f);
  }
  pan.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const k = b.dataset.k;
    if (b.hasAttribute("data-px")) return panel(null);
    if (b.hasAttribute("data-pyes")) { const g = P.ask && P.ask.go; P.ask = null; drawPan(); if (g) g(); return; }
    if (b.hasAttribute("data-pno")) { P.ask = null; P.ren = null; return drawPan(); }
    if (b.hasAttribute("data-pcloud")) return cloudSave(false);
    if (b.hasAttribute("data-pnew")) return cloudSave(true);
    if (b.hasAttribute("data-pdev")) return devSave(false);
    if (b.hasAttribute("data-pdnew")) return devSave(true);
    if (b.hasAttribute("data-pfile")) return fileSave();
    if (b.hasAttribute("data-bimg")) return saveImage();
    if (b.hasAttribute("data-ppdf")) return exportPdf();
    if (b.dataset.pgo) { B.pi = +b.dataset.pgo; clearSel(); bsave(); bdraw(); return drawPan(); }
    if (b.dataset.pmv) { movePage(+b.dataset.pmv, +b.dataset.d); return drawPan(); }
    if (b.dataset.pcp) { copyPage(+b.dataset.pcp); return drawPan(); }
    if (b.hasAttribute("data-pnewpg")) { newPage(); return drawPan(); }
    if (b.dataset.pop) return openBoard(k, b.dataset.pop);
    if (b.dataset.pren) { P.ren = k + b.dataset.pren; P.del = null; drawPan(); const i = pan.querySelector("[data-rin]"); if (i) { i.focus(); i.select(); } return; }
    if (b.dataset.prs) return renameBoard(k, b.dataset.prs, (pan.querySelector("[data-rin]") || {}).value);
    if (b.dataset.pdel) { const key = k + b.dataset.pdel; if (P.del === key) return deleteBoard(k, b.dataset.pdel); P.del = key; drawPan(); setTimeout(() => { if (P.del === key) { P.del = null; if (P.view === "open") drawPan(); } }, 3000); }
  });
  pan.addEventListener("change", (e) => { if (e.target.matches("[data-pfin]")) { fileOpen(e.target.files[0]); e.target.value = ""; } });
  pan.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); panel(null); }
    else if (e.key === "Enter" && e.target.matches(".ink-pin")) {
      e.preventDefault();
      if (e.target.matches("[data-rin]")) { const b = pan.querySelector("[data-prs]"); if (b) renameBoard(b.dataset.k, b.dataset.prs, e.target.value); }
      else if (lecAcct()) cloudSave(false); else devSave(false);
    }
  });
  pan.addEventListener("pointerdown", (e) => e.stopPropagation());
  // the account changed (signed in or out): another account's list must not show
  const onAcct = () => { const a = acct(); if (!a || a.u.uid !== idxUid) idx = null; if (P.view) drawPan(); };
  if (window.NMKAccount && window.NMKAccount.on) window.NMKAccount.on(onAcct);
  else addEventListener("load", () => { if (window.NMKAccount && window.NMKAccount.on) window.NMKAccount.on(onAcct); });

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
    else if (bAct && (k === "p" || k === "h" || k === "e" || k === "v" || k === "t" || k === "l")) { e.preventDefault(); setBoardTool({ v: "sel", t: "text", l: "laser" }[k] || m[k]); }
    else if (bAct && Q.tool === "sel" && (e.key === "Delete" || e.key === "Backspace") && selOn()) { e.preventDefault(); selDelete(); }
    else if (bAct && e.key === "Escape" && Q.tool === "sel" && selOn()) { clearSel(); bTools(); bpaint(); }
    else if (bAct && e.key === "Escape") setBoardTool(null);
    else if (!open) return;
    else if (m[k]) { e.preventDefault(); setTool(m[k]); }
    else if (e.key === "Escape") { if (tool !== "off") setTool("off"); else toggle(false); }
    else if (tool === "spot" && (e.key === "[" || e.key === "]")) { spotR = Math.max(60, Math.min(420, spotR + (e.key === "]" ? 20 : -20))); placeSpot(); }
  });

  fit(); bdraw();
  window.NMKInk = { clear: () => { strokes = []; paint(); save(); }, board: (on) => boardOpen(on !== false), boardTool: setBoardTool };
})();
