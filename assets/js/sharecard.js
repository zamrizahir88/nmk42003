/* NMK42003 share cards (lecturer's idea, 9 Nov 2026): a 9:16 picture (1080 x 1920 PNG) of a student's place on the
   Class Board, for a WhatsApp status, Instagram, Facebook or TikTok. Drawn as SVG with system fonts, then on a canvas.
   NMKShare.open({ svg, file, text, title }) shows the dialog: Share (the Web Share API with the file) or Save image.
   NMKShare.classCard(d) draws the Class Board card. No Firebase: nothing is saved anywhere. */
(function () {
  "use strict";
  const SITE = "zamrizahir88.github.io/nmk42003";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LVC = ["#8a9bb0", "#3ba7a0", "#2f8cff", "#7c5cff", "#c04fd8", "#f0567a", "#ff8a1c", "#e0a100"];

  // the photo as a data: address (pictures from elsewhere don't draw inside an SVG picture); none if it can't be fetched
  async function photoData(url) {
    if (!url) return "";
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer", signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) return "";
      const b = await r.blob();
      return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(String(f.result || "")); f.onerror = () => res(""); f.readAsDataURL(b); });
    } catch (e) { return ""; }
  }
  // the hero / nickname at a size that fits 940 px
  const fit = (s, max, w) => { const em = [...String(s)].reduce((a, c) => a + (/[WM]/.test(c) ? 1.2 : /[A-Z0-9]/.test(c) ? 0.8 : c === " " ? 0.3 : /[mw]/.test(c) ? 0.95 : 0.6), 0); return Math.min(max, Math.floor((w || 940) / Math.max(em, 1))); };

  // d: { name, k (level 0..7), level, xp, next: {name, at} | null, from (this level's XP), pos, of, top10, badges: [icon], nBadges, photo (data:), sem }
  function classCard(d) {
    const c = LVC[d.k], gold = "#ffd84d", N = "#0d2a3f", cx = 540, cy = 835, R = 205;
    const tx = (y, size, t, o = {}) => `<text x="${o.x || 540}" y="${y}" text-anchor="${o.a || "middle"}" font-family="${o.serif ? "Georgia, 'Times New Roman', serif" : "Arial, Helvetica, sans-serif"}" font-weight="${o.w || 700}" font-size="${size}"${o.ls ? ` letter-spacing="${o.ls}"` : ""} fill="${o.fill || "#fff"}">${t}</text>`;
    const ring = d.k >= 7 ? `url(#gGold)` : c;
    const crown = (fill, dark) => `<g transform="translate(${cx - 110} ${cy - R - 172}) scale(9.2) rotate(-6 12 8)"><path d="M2 14.5 L3.4 4.5 L8.6 9 L12 1.8 L15.4 9 L20.6 4.5 L22 14.5 Z" fill="${fill}" stroke="${dark}" stroke-width=".9" stroke-linejoin="round"/><circle cx="12" cy="10.6" r="1.6" fill="#e5484d"/><circle cx="6.4" cy="11.6" r="1.1" fill="#38e1c9"/><circle cx="17.6" cy="11.6" r="1.1" fill="#38e1c9"/></g>`;
    const face = d.photo ? `<image href="${d.photo}" x="${cx - R}" y="${cy - R}" width="${R * 2}" height="${R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clipAv)"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#gFace)"/>${tx(cy + 70, 200, esc(String(d.name || "?").trim()[0] || "?").toUpperCase(), { w: 800 })}`;
    const pct = d.next ? Math.max(0.02, Math.min(1, (d.xp - d.from) / (d.next.at - d.from))) : 1;
    const head = d.top10 ? `🏆 #${d.pos} of ${d.of} in the class` : d.pos && d.pos <= Math.ceil(d.of / 2) ? `Top half of the class · #${d.pos} of ${d.of}` : "Levelling up 🚀";
    const bx = 540 - Math.min(6, d.badges.length) * 60 + 60;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs><linearGradient id="gBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b6e6e"/><stop offset=".5" stop-color="#0e4f74"/><stop offset="1" stop-color="#14213d"/></linearGradient>
        <radialGradient id="gGlow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
        <linearGradient id="gGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffd84d"/><stop offset="1" stop-color="#c98a00"/></linearGradient>
        <linearGradient id="gFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a8fb3"/><stop offset="1" stop-color="#0b6e6e"/></linearGradient>
        <linearGradient id="gBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38e1c9"/><stop offset="1" stop-color="${gold}"/></linearGradient>
        <pattern id="pGrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0 H0 V60" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="2"/></pattern>
        <clipPath id="clipAv"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
      <rect width="1080" height="1920" fill="url(#gBg)"/><rect width="1080" height="1920" fill="url(#pGrid)"/><rect width="1080" height="1920" fill="url(#gGlow)"/>
      ${tx(150, 34, "NMK42003 INSTRUMENTATION", { ls: 10, fill: "#7ff3e3" })}
      ${tx(250, 104, "CLASS BOARD", { w: 900, ls: 6 })}
      ${tx(312, 34, esc(d.sem || "UniMAP"), { w: 400, fill: "#cfe3ee" })}
      <rect x="${540 - 390}" y="346" width="780" height="96" rx="48" fill="${d.top10 ? "url(#gGold)" : "#ffffff"}" fill-opacity="${d.top10 ? 1 : 0.14}" stroke="${d.top10 ? "#a87400" : "#fff"}" stroke-opacity="${d.top10 ? 1 : 0.4}" stroke-width="4"/>
      ${tx(410, head.length > 26 ? 38 : 46, esc(head), { w: 800, fill: d.top10 ? N : "#fff" })}
      <circle cx="${cx}" cy="${cy}" r="${R + 46}" fill="none" stroke="${ring}" stroke-width="30"/>
      ${d.k >= 4 ? `<circle cx="${cx}" cy="${cy}" r="${R + 78}" fill="none" stroke="${ring}" stroke-width="10" stroke-opacity=".85"/>` : ""}
      <circle cx="${cx}" cy="${cy}" r="${R + 14}" fill="#fff"/>${face}
      ${d.k >= 6 ? crown(d.k === 7 ? gold : "#e7ecf3", d.k === 7 ? "#a87400" : "#7d8a9c") : d.k >= 2 ? `<circle cx="${cx + 200}" cy="${cy - 200}" r="52" fill="${c}" stroke="#fff" stroke-width="8"/>${tx(cy - 178, 62, "★", { w: 900 })}` : ""}
      <rect x="${cx - 90}" y="${cy + R + 14}" width="180" height="84" rx="42" fill="${ring}" stroke="#fff" stroke-width="7"/>${tx(cy + R + 74, 50, `L${d.k + 1}`, { w: 900, fill: d.k === 7 ? N : "#fff" })}
      ${tx(1260, fit(d.name, 96), esc(d.name), { w: 900 })}
      ${tx(1332, fit(d.level, 54, 960), esc(d.level), { w: 800, fill: d.k === 7 ? gold : "#7ff3e3" })}
      <rect x="120" y="1392" width="840" height="230" rx="34" fill="#000" fill-opacity=".22" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>
      ${tx(1484, 80, `${Number(d.xp || 0).toLocaleString("en")} XP`, { w: 900, fill: gold })}
      <rect x="180" y="1520" width="720" height="26" rx="13" fill="#fff" fill-opacity=".16"/><rect x="180" y="1520" width="${Math.round(720 * pct)}" height="26" rx="13" fill="url(#gBar)"/>
      ${tx(1592, 32, d.next ? `${(d.next.at - d.xp).toLocaleString("en")} XP to ${esc(d.next.name)}` : "Top level reached!", { w: 600, fill: "#e8f3f8" })}
      ${d.nBadges ? `${d.badges.slice(0, 6).map((b, i) => `<circle cx="${bx + i * 120 - 60}" cy="1700" r="48" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-opacity=".35" stroke-width="3"/><text x="${bx + i * 120 - 60}" y="1718" text-anchor="middle" font-size="50">${b}</text>`).join("")}
        ${tx(1790, 32, `🏅 ${d.nBadges} badge${d.nBadges === 1 ? "" : "s"} earned`, { w: 700, fill: "#e8f3f8" })}` : tx(1720, 36, "Solve, practise and level up!", { w: 700, fill: "#e8f3f8" })}
      <rect x="0" y="1830" width="1080" height="90" fill="#0b1430" fill-opacity=".85"/>
      ${tx(1888, 32, `UniMAP · ${SITE}`, { w: 700, fill: "#7ff3e3" })}
    </svg>`;
  }


  // one student's photo (or first letter) in the ring of their level: star from L3, glow from L5, crowns at L7 / L8
  function ringAt(cx, cy, r, k, photo, name, id) {
    const c = LVC[k], gold = "#ffd84d", ring = k >= 7 ? "url(#gGold)" : k === 6 ? "#c9d2de" : c, sw = Math.max(10, r * 0.13);
    const crown = (fill, dark) => `<g transform="translate(${cx - r * 0.55} ${cy - r * 1.62}) scale(${(r * 1.1) / 24}) rotate(-6 12 8)"><path d="M2 14.5 L3.4 4.5 L8.6 9 L12 1.8 L15.4 9 L20.6 4.5 L22 14.5 Z" fill="${fill}" stroke="${dark}" stroke-width=".9" stroke-linejoin="round"/><circle cx="12" cy="10.6" r="1.6" fill="#e5484d"/><circle cx="6.4" cy="11.6" r="1.1" fill="#38e1c9"/><circle cx="17.6" cy="11.6" r="1.1" fill="#38e1c9"/></g>`;
    const face = photo ? `<image href="${photo}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cl${id})"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gFace)"/><text x="${cx}" y="${cy + r * 0.34}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="${r}" fill="#fff">${esc(String(name || "?").trim()[0] || "?").toUpperCase()}</text>`;
    return `<defs><clipPath id="cl${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
      ${k >= 4 ? `<circle cx="${cx}" cy="${cy}" r="${r + sw * 1.4}" fill="${c}" opacity=".28"/>` : ""}
      <circle cx="${cx}" cy="${cy}" r="${r + sw / 2 + 4}" fill="none" stroke="${ring}" stroke-width="${sw}"/><circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#fff"/>${face}
      ${k >= 6 ? crown(k === 7 ? gold : "#e7ecf3", k === 7 ? "#a87400" : "#7d8a9c") : k >= 2 ? `<circle cx="${cx + r * 0.78}" cy="${cy - r * 0.78}" r="${r * 0.24}" fill="${c}" stroke="#fff" stroke-width="5"/><text x="${cx + r * 0.78}" y="${cy - r * 0.68}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="${r * 0.3}" fill="#fff">★</text>` : ""}`;
  }
  const defsBase = (glow) => `<linearGradient id="gGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffd84d"/><stop offset="1" stop-color="#c98a00"/></linearGradient>
    <linearGradient id="gFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a8fb3"/><stop offset="1" stop-color="#0b6e6e"/></linearGradient>
    <radialGradient id="gGlow" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="${glow}" stop-opacity=".45"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <pattern id="pGrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0 H0 V60" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="2"/></pattern>`;
  const T = (x, y, size, t, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || "middle"}" font-family="Arial, Helvetica, sans-serif" font-weight="${o.w || 700}" font-size="${size}"${o.ls ? ` letter-spacing="${o.ls}"` : ""} fill="${o.fill || "#fff"}">${t}</text>`;
  const head = (sem, pill, pillFill, pillText) => `${T(540, 150, 34, "NMK42003 INSTRUMENTATION", { ls: 10, fill: "#7ff3e3" })}${T(540, 250, 104, "CLASS BOARD", { w: 900, ls: 6 })}${T(540, 312, 34, esc(sem || "UniMAP"), { w: 400, fill: "#cfe3ee" })}
    <rect x="150" y="346" width="780" height="96" rx="48" fill="${pillFill}" stroke="#fff" stroke-opacity=".5" stroke-width="4"/>${T(540, 410, 46, pill, { w: 900, fill: pillText })}`;
  const foot = `<rect x="0" y="1830" width="1080" height="90" fill="#0b1430" fill-opacity=".85"/>${T(540, 1888, 32, `UniMAP · ${SITE}`, { fill: "#7ff3e3" })}`;

  // 🏆 the top 3 on a podium. d: { sem, date, top: [{ name, k, level, xp, photo }] } (nicknames only)
  function podiumCard(d) {
    const P = [{ i: 1, x: 220, cy: 905, r: 112, top: 1210, fill: "#dfe6ef", dk: "#8a9bb0" }, { i: 0, x: 540, cy: 790, r: 140, top: 1110, fill: "url(#gGold)", dk: "#a87400" }, { i: 2, x: 860, cy: 965, r: 104, top: 1270, fill: "#e5a26a", dk: "#a8622a" }];
    const pods = P.map((p) => { const t = d.top[p.i]; if (!t) return "";
      const ns = fit(t.name, 54, 270), h = 1760 - p.top;
      return `${ringAt(p.x, p.cy, p.r, t.k, t.photo, t.name, `p${p.i}`)}
        <rect x="${p.x - 150}" y="${p.top}" width="300" height="${h}" rx="24" fill="${p.fill}" stroke="#0d2a3f" stroke-width="6"/>
        <rect x="${p.x - 138}" y="${p.top + 12}" width="276" height="12" rx="6" fill="#fff" opacity=".5"/>
        ${T(p.x, p.top + 112, 96, p.i + 1, { w: 900, fill: "#0d2a3f" })}
        ${T(p.x, p.top + 132 + ns, ns, esc(t.name), { w: 900, fill: "#0d2a3f" })}
        ${T(p.x, p.top + 190 + ns, 34, `L${t.k + 1} · ${Number(t.xp || 0).toLocaleString("en")} XP`, { w: 800, fill: "#0d2a3f" })}`; }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs>${defsBase("#ffd84d")}<linearGradient id="gBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b6e6e"/><stop offset=".5" stop-color="#0e4f74"/><stop offset="1" stop-color="#14213d"/></linearGradient></defs>
      <rect width="1080" height="1920" fill="url(#gBg)"/><rect width="1080" height="1920" fill="url(#pGrid)"/><rect width="1080" height="1920" fill="url(#gGlow)"/>
      ${head(d.sem, `🏆 TOP 3 · ${esc(d.date)}`, "url(#gGold)", "#0d2a3f")}
      ${["#ffd84d", "#fff", "#7ff3e3"].map((c, j) => `<path d="M${180 + j * 330} ${540 + (j % 2) * 40} l8 20 l20 8 l-20 8 l-8 20 l-8 -20 l-20 -8 l20 -8 Z" fill="${c}" opacity=".8"/>`).join("")}
      ${pods}${foot}</svg>`;
  }

  // 🚀 the Climb-Out Zone (the last 3), encouraging, never "last place". d: { sem, date, low: [{ name, k, xp, photo }] }
  function climbCard(d) {
    const X = [200, 540, 880];
    const pads = d.low.map((t, j) => { const x = X[j], ns = fit(t.name, 48, 280);
      return `<path d="M${x - 34} 760 l34 -46 l34 46 h-20 v40 h-28 v-40 Z" fill="#ffc94d" stroke="#0d2a3f" stroke-width="5" stroke-linejoin="round"/>
        ${ringAt(x, 960, 108, t.k, t.photo, t.name, `c${j}`)}
        <rect x="${x - 155}" y="1130" width="310" height="300" rx="28" fill="#fff" fill-opacity=".14" stroke="#ffc94d" stroke-width="4"/>
        ${T(x, 1200 + ns / 2, ns, esc(t.name), { w: 900 })}
        ${T(x, 1300, 36, `L${t.k + 1} · ${Number(t.xp || 0).toLocaleString("en")} XP`, { w: 700, fill: "#ffe9b0" })}
        ${T(x, 1380, 34, "Climbing up 🚀", { w: 700, fill: "#7ff3e3" })}`; }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs>${defsBase("#ffc94d")}<linearGradient id="gBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a4a00"/><stop offset=".45" stop-color="#3d3a6e"/><stop offset="1" stop-color="#14213d"/></linearGradient></defs>
      <rect width="1080" height="1920" fill="url(#gBg)"/><rect width="1080" height="1920" fill="url(#pGrid)"/><rect width="1080" height="1920" fill="url(#gGlow)"/>
      ${head(d.sem, "🚀 CLIMB-OUT CHALLENGE", "#ffc94d", "#3a2400")}
      ${T(540, 560, 52, "Who climbs out first?", { w: 900 })}${T(540, 630, 36, esc(d.date), { w: 400, fill: "#ffe9b0" })}
      ${pads}
      <rect x="140" y="1500" width="800" height="210" rx="34" fill="#000" fill-opacity=".22" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>
      ${T(540, 1585, 40, "One exercise could lift you out!", { w: 800, fill: "#ffd84d" })}${T(540, 1650, 34, "Solve · practise · come to class · level up", { w: 600, fill: "#e8f3f8" })}
      ${foot}</svg>`;
  }
  function png(svg) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { try { const c = document.createElement("canvas"); c.width = 1080; c.height = 1920; c.getContext("2d").drawImage(img, 0, 0, 1080, 1920); c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"); } catch (e) { rej(e); } };
      img.onerror = () => rej(new Error("no image"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  // the dialog: preview, 📤 Share, ⬇ Save image; Esc, ✕, a tap outside or Back close it
  function open(o) {
    const sh = document.createElement("div");
    sh.className = "shc"; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", o.title || "Share your card");
    sh.innerHTML = `<div class="shc-box"><button type="button" class="shc-x" aria-label="Close">✕</button><p class="shc-h">${esc(o.title || "Share your card")}</p>
      <div class="shc-img"><p class="small-note">Making your card…</p></div>
      <div class="shc-btns"><button type="button" class="btn" data-shgo disabled>📤 Share</button><button type="button" class="btn ghost" data-shsave disabled>⬇ Save image</button></div>
      <p class="shc-msg" aria-live="polite">On a phone, Share opens WhatsApp, Instagram, Facebook, Telegram and more (for a WhatsApp status, choose My status). Save image keeps the picture in your downloads or gallery.</p></div>`;
    document.body.appendChild(sh);
    let layer = null, blob = null, url = "";
    const close = () => { sh.remove(); document.removeEventListener("keydown", key); if (url) URL.revokeObjectURL(url); if (layer) { const l = layer; layer = null; l.closed(); } if (o.back) try { o.back.focus({ preventScroll: true }); } catch (e) { /* gone */ } };
    const key = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    if (window.NMKBack) layer = NMKBack.layer(() => { layer = null; close(); });
    sh.addEventListener("click", (e) => { if (e.target === sh) close(); });
    sh.querySelector(".shc-x").addEventListener("click", close);
    sh.querySelector(".shc-x").focus({ preventScroll: true });
    const msg = (t) => { sh.querySelector(".shc-msg").textContent = t; };
    Promise.resolve(typeof o.svg === "function" ? o.svg() : o.svg).then(png).then((b) => {
      blob = b; url = URL.createObjectURL(b);
      sh.querySelector(".shc-img").innerHTML = `<img src="${url}" alt="Your share card" width="216" height="384">`;
      sh.querySelectorAll("[data-shgo], [data-shsave]").forEach((x) => { x.disabled = false; });
    }).catch(() => { sh.querySelector(".shc-img").innerHTML = ""; msg("This browser could not make the picture. You can still share the link."); sh.querySelector("[data-shgo]").disabled = false; });
    sh.querySelector("[data-shsave]").addEventListener("click", () => { if (!blob) return; const a = document.createElement("a"); a.href = url; a.download = o.file; document.body.appendChild(a); a.click(); a.remove(); msg("Saved. Look in your downloads or gallery."); });
    sh.querySelector("[data-shgo]").addEventListener("click", async () => {
      const file = blob ? new File([blob], o.file, { type: "image/png" }) : null;
      try {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: o.title || "NMK42003", text: o.text });
        else if (navigator.share) await navigator.share({ title: o.title || "NMK42003", text: o.text });
        else { await navigator.clipboard.writeText(o.text); msg("The message and the link are copied. Paste them with the saved image."); }
      } catch (e) { if (e && e.name !== "AbortError") msg("Sharing didn't work here. Use Save image, then post it from your gallery."); }
    });
    return { close };
  }

  window.NMKShare = { open, png, classCard, podiumCard, climbCard, photoData, SITE };
})();
