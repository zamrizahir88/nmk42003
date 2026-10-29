/* Pen and highlighter on every page (ink.js): the ✏️ button bottom-left opens a toolbar to write on the page while
   teaching, or for a student's own notes. Pen (6 colours, 3 sizes, pressure with a stylus), highlighter (4 colours),
   eraser (one stroke), undo, clear, laser pointer (a fading red trail), spotlight (dims all but a circle round the
   pointer) and "Use the page" (the page works normally, the drawings stay).
   Drawings are pinned to the page (they scroll with it) and kept in THIS browser only, per page, for one day
   (localStorage "nmkink:<page>", not "nmk-" so they never sync to an account). No Firebase at all. */
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

  /* ---------- the look ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .ink-cv, .ink-fx { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 66; pointer-events: none; }
  .ink-cv.draw { pointer-events: auto; touch-action: none; cursor: crosshair; }
  .ink-cv.erase { cursor: cell; }
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
  function drawBar() {
    const sw = tool === "hl" ? HLS.map((c) => `<button type="button" data-hc="${c}" style="background:${c}" aria-label="Highlighter colour" aria-pressed="${c === hl}"></button>`).join("")
      : PENS.map((c) => `<button type="button" data-pc="${c}" style="background:${c}" aria-label="Pen colour" aria-pressed="${c === pen}"></button>`).join("");
    bar.innerHTML = `${TOOLS.map(([t, i, l]) => `<button type="button" data-t="${t}" aria-pressed="${tool === t}" title="${l}" aria-label="${l}">${i}</button>`).join("")}
      ${tool === "pen" || tool === "hl" ? `<span class="ink-sep"></span><span class="ink-sw">${sw}</span><span class="ink-sep"></span>${SIZES.map((s, i) => `<button type="button" class="ink-sz" data-sz="${i}" aria-pressed="${size === i}" aria-label="Size ${i + 1}" title="Size ${i + 1}"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join("")}` : ""}
      <span class="ink-sep"></span><button type="button" data-undo title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button type="button" class="ink-clr" data-clear title="Clear this page" aria-label="Clear this page">🗑</button>`;
  }
  function setTool(t) {
    tool = t;
    cv.classList.toggle("draw", t === "pen" || t === "hl" || t === "erase");
    cv.classList.toggle("erase", t === "erase");
    spot.classList.toggle("on", t === "spot");
    if (t !== "laser") trail.length = 0;
    if (t === "spot" || t === "laser") loop();
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
  function strokePath(s) {
    const p = s.p; if (!p.length) return;
    ctx.beginPath();
    ctx.moveTo(p[0][0] - scrollX, p[0][1] - scrollY);
    if (p.length === 1) ctx.lineTo(p[0][0] - scrollX + 0.1, p[0][1] - scrollY);
    for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i]; ctx.quadraticCurveTo(a[0] - scrollX, a[1] - scrollY, (a[0] + b[0]) / 2 - scrollX, (a[1] + b[1]) / 2 - scrollY); }
    ctx.lineTo(p[p.length - 1][0] - scrollX, p[p.length - 1][1] - scrollY);
  }
  function drawStroke(s) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (s.t === "hl") { ctx.globalAlpha = 0.38; ctx.strokeStyle = s.c; ctx.lineWidth = s.w * 4 + 8; ctx.globalCompositeOperation = "multiply"; strokePath(s); ctx.stroke(); }
    else if (s.pr) {   // a stylus: each piece as thick as the pressure there
      ctx.strokeStyle = s.c;
      for (let i = 1; i < s.p.length; i++) { const a = s.p[i - 1], b = s.p[i]; ctx.lineWidth = s.w * (0.4 + (b[2] || 0.5) * 1.2); ctx.beginPath(); ctx.moveTo(a[0] - scrollX, a[1] - scrollY); ctx.lineTo(b[0] - scrollX, b[1] - scrollY); ctx.stroke(); }
      if (s.p.length === 1) { ctx.lineWidth = s.w; strokePath(s); ctx.stroke(); }
    } else { ctx.strokeStyle = s.c; ctx.lineWidth = s.w; strokePath(s); ctx.stroke(); }
    ctx.restore();
  }
  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    strokes.forEach(drawStroke);
    if (cur) drawStroke(cur);
  }
  let queued = false;
  const repaint = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); };
  addEventListener("scroll", repaint, { passive: true });
  addEventListener("resize", fit);
  // the page grows or shrinks (a panel opens): repaint so the ink follows the scroll position
  if (window.ResizeObserver) new ResizeObserver(repaint).observe(document.body);

  const ptOf = (e) => [Math.round((e.clientX + scrollX) * 10) / 10, Math.round((e.clientY + scrollY) * 10) / 10, e.pointerType === "pen" ? Math.round((e.pressure || 0.5) * 100) / 100 : 0];
  function eraseAt(e) {
    const x = e.clientX + scrollX, y = e.clientY + scrollY, r = 12;
    const n = strokes.length;
    strokes = strokes.filter((s) => !s.p.some((q, i) => { if (Math.hypot(q[0] - x, q[1] - y) < r + s.w) return true; const a = s.p[i - 1]; if (!a) return false;
      const dx = q[0] - a[0], dy = q[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) < r + s.w / 2; }));
    if (strokes.length !== n) { paint(); save(); }
  }
  cv.addEventListener("pointerdown", (e) => {
    if (tool === "erase") { cv.setPointerCapture(e.pointerId); eraseAt(e); cur = { erasing: true }; return; }
    if (tool !== "pen" && tool !== "hl") return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
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
  const end = () => { if (!cur) return; if (!cur.erasing && cur.p.length) { strokes.push(cur); save(); } cur = null; repaint(); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("lostpointercapture", end);

  /* ---------- laser pointer and spotlight (follow the pointer; the page still works underneath) ---------- */
  const trail = []; let mx = -999, my = -999, looping = false, spotR = 150;
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; if (tool === "laser") trail.push([mx, my, performance.now()]); if (tool === "spot") placeSpot(); }, { passive: true });
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
      if (tool === "laser" || tool === "spot") requestAnimationFrame(step); else { fctx.clearRect(0, 0, innerWidth, innerHeight); looping = false; }
    };
    requestAnimationFrame(step);
  }
  // the spotlight grows and shrinks with the mouse wheel while Shift is held, or with [ and ]
  addEventListener("wheel", (e) => { if (tool === "spot" && e.shiftKey) { e.preventDefault(); spotR = Math.max(60, Math.min(420, spotR - Math.sign(e.deltaY) * 20)); placeSpot(); } }, { passive: false });

  /* ---------- buttons and keys ---------- */
  fab.addEventListener("click", () => toggle(!open));
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.t) setTool(b.dataset.t);
    else if (b.dataset.pc) { pen = b.dataset.pc; drawBar(); }
    else if (b.dataset.hc) { hl = b.dataset.hc; drawBar(); }
    else if (b.dataset.sz) { size = +b.dataset.sz; drawBar(); }
    else if (b.hasAttribute("data-undo")) { strokes.pop(); paint(); save(); }
    else if (b.hasAttribute("data-clear")) {
      if (!strokes.length) return;
      if (b.classList.contains("sure")) { strokes = []; paint(); save(); drawBar(); }
      else { b.classList.add("sure"); b.textContent = "Clear all?"; setTimeout(() => { if (b.isConnected) { b.classList.remove("sure"); b.textContent = "🗑"; } }, 3000); }
    }
  });
  addEventListener("keydown", (e) => {
    if (!open || e.altKey || e.metaKey) return;
    const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    if (e.ctrlKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); strokes.pop(); paint(); save(); return; }
    if (e.ctrlKey) return;
    const k = e.key.toLowerCase(), m = { p: "pen", h: "hl", e: "erase", l: "laser", s: "spot" };
    if (m[k]) { e.preventDefault(); setTool(m[k]); }
    else if (e.key === "Escape") { if (tool !== "off") setTool("off"); else toggle(false); }
    else if (tool === "spot" && (e.key === "[" || e.key === "]")) { spotR = Math.max(60, Math.min(420, spotR + (e.key === "]" ? 20 : -20))); placeSpot(); }
  });

  fit();
  window.NMKInk = { clear: () => { strokes = []; paint(); save(); } };
})();
