/* NMK42003 Instrumentation — site script. Content comes from data.js. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;
  const TOTAL_WEEKS = COURSE.weeks.length;

  /* ---------- Dates ---------- */
  function parseYMD(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  const START = parseYMD(COURSE.semesterStart);

  // Today's date in Malaysia (UniMAP time), whatever time zone the student's device is set to.
  function malaysiaYMD() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) {
      const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  // Add ?today=2026-11-03 to the URL to preview the site as if it were that date.
  const previewDate = (() => { const q = new URLSearchParams(location.search).get("today"); return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null; })();
  function today() { return parseYMD(previewDate || malaysiaYMD()); }

  // Roll over to the new day at Malaysian midnight: reload when the date changes (or when the student returns to the tab).
  if (!previewDate) {
    const loadedOn = malaysiaYMD();
    const check = () => { if (malaysiaYMD() !== loadedOn && !document.hidden) location.reload(); };
    setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
  }
  const weekStart = (w) => new Date(START.getTime() + (w - 1) * 7 * DAY);
  const weekEnd = (w) => new Date(weekStart(w).getTime() + 6 * DAY);
  const fmt = (d, year) => d.toLocaleDateString("en-GB", year ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  const fmtLong = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const range = (w) => `${fmt(weekStart(w))} to ${fmt(weekEnd(w), true)}`;

  const T = today();
  const daysIn = Math.round((T - START) / DAY); // round, not floor: a daylight-saving device clock can shift the difference by an hour
  const curWeek = daysIn < 0 ? 0 : Math.floor(daysIn / 7) + 1; // 0 = before, >TOTAL = after
  let selectedWeek = curWeek >= 1 && curWeek <= TOTAL_WEEKS ? curWeek : 1;

  /* ---------- Theme ---------- */
  const themeBtn = $("#themeBtn");
  function paintThemeBtn() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (!themeBtn) return;
    themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    $("#themeIcon").innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
      : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  }
  if (themeBtn) {
    paintThemeBtn();
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("nmk-theme", next); } catch (e) {}
      paintThemeBtn();
    });
  }

  /* ---------- Mobile menu ---------- */
  const menuBtn = $("#menuBtn"), nav = $("#nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open);
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    nav.addEventListener("click", (e) => { if (e.target.tagName === "A") { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", false); } });
  }

  if (menuBtn && nav) {
    const closeMenu = () => { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", false); menuBtn.setAttribute("aria-label", "Open menu"); };
    document.addEventListener("click", (e) => { if (nav.classList.contains("open") && !nav.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) { closeMenu(); menuBtn.focus(); } });
  }

  /* ---------- Back to top, hide-on-scroll header (phones), reading progress (chapters) ---------- */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toTop = document.createElement("button");
  toTop.type = "button"; toTop.className = "to-top"; toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(toTop);
  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    const h = document.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  });
  const isChapter = !!document.querySelector(".lab-nav");
  let bar = null;
  if (isChapter) { bar = document.createElement("div"); bar.className = "read-progress"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar); }
  const narrow = matchMedia("(max-width: 820px)"), root = document.documentElement;
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY, H = root.scrollHeight - window.innerHeight;
    toTop.classList.toggle("show", y > window.innerHeight * 1.5);
    if (bar) bar.style.transform = `scaleX(${H > 0 ? Math.min(1, y / H) : 0})`;
    const menuOpen = nav && nav.classList.contains("open");
    if (narrow.matches && !menuOpen) {
      if (y > lastY + 6 && y > 140) root.classList.add("hdr-hide");
      else if (y < lastY - 6 || y < 60) root.classList.remove("hdr-hide");
    } else root.classList.remove("hdr-hide");
    if (Math.abs(y - lastY) > 6) lastY = y;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Remember the chapter and section being read, for "Continue where you left off" on the home page.
  const curPage = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (isChapter && /^chapter-\d+\.html$/.test(curPage)) {
    window.addEventListener("load", () => setTimeout(() => {
      const no = curPage.match(/\d+/)[0];
      const save = (sec) => {
        const hd = sec && sec.querySelector("h3, h2");
        try { localStorage.setItem("nmk-last", JSON.stringify({ no, href: curPage + (sec ? `#${sec.id}` : ""), sec: hd ? hd.textContent.trim() : "", t: Date.now() })); } catch (e) {}
      };
      if (!location.hash) save(null);
      const secs = [...document.querySelectorAll("section.circuit, section#exercises")];
      if (!("IntersectionObserver" in window) || !secs.length) return;
      let timer;
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { clearTimeout(timer); timer = setTimeout(() => save(e.target), 800); } }), { rootMargin: "-35% 0px -55% 0px" });
      secs.forEach((x) => io.observe(x));
    }, 300));
  }

  // Printing: open every "Show working" panel and print in light colours, then put things back.
  let printState = null;
  window.addEventListener("beforeprint", () => {
    const closed = [...document.querySelectorAll("details:not([open])")];
    closed.forEach((d) => { d.open = true; });
    printState = { closed, theme: root.getAttribute("data-theme") };
    root.setAttribute("data-theme", "light");
  });
  window.addEventListener("afterprint", () => {
    if (!printState) return;
    printState.closed.forEach((d) => { d.open = false; });
    root.setAttribute("data-theme", printState.theme || "light");
    printState = null;
  });

  /* ---------- Footer ---------- */
  const footer = $("#footer");
  if (footer) {
    const d = COURSE.developer;
    footer.innerHTML = `
      <div class="wrap foot-grid">
        <a class="foot-logo" href="https://www.unimap.edu.my" target="_blank" rel="noopener"><img src="assets/img/unimap-logo.png" alt="Universiti Malaysia Perlis (UniMAP)" width="640" height="299" loading="lazy"></a>
        <div class="foot-dev">
          Developed by <strong>${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : esc(d.name)}</strong>,
          ${esc(d.affiliation)}.
          <div class="foot-meta">${esc(COURSE.code)} ${esc(COURSE.name)} is offered under ${esc(COURSE.programme)}.</div>
          <div class="foot-meta">&copy; ${new Date().getFullYear()} ${esc(COURSE.code)} ${esc(COURSE.name)}, ${esc(COURSE.university)}. For teaching and learning use.</div>
        </div>
        <div class="foot-meta">${esc(COURSE.session)}<br>Last updated ${esc(COURSE.lastUpdated)}</div>
      </div>`;
  }

  /* ---------- Study progress (saved on this device) ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("nmk-studied") || "[]"); } catch (e) { return []; } },
    set(v) { try { localStorage.setItem("nmk-studied", JSON.stringify(v)); } catch (e) {} }
  };

  const statusLabel = { soon: "Coming soon", notes: "Notes available", interactive: "Interactive", building: "Interactive, in progress" };
  // A topic links to its own page once built, otherwise to the placeholder.
  const pageOf = (t) => t.page || `topic.html?ch=${t.no}`;

  /* ---------- Active link in the main menu ---------- */
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll("#nav a").forEach((a) => {
    const target = a.getAttribute("href").toLowerCase();
    if (target === here || (target === "chapters.html" && /^(chapter-\d+|topic)\.html$/.test(here)) || (target === "labs.html" && /^lab-\d+\.html$/.test(here))) a.setAttribute("aria-current", "page");
  });

  /* =====================================================================
     PAGES: each part renders only where its element exists
     index.html (hero, team, semester, menu cards), chapters.html, schedule.html,
     assessment.html, labs.html
     ===================================================================== */
  if ($("#heroCode")) {
    $("#heroKicker").textContent = `${COURSE.session} · ${COURSE.faculty}`;
    $("#heroCode").textContent = COURSE.code;
    $("#heroName").textContent = COURSE.name;
    $("#synopsis").textContent = COURSE.synopsis;
    const built = COURSE.topics.filter((t) => t.page).length;
    $("#facts").innerHTML = [
      [COURSE.credits, "credits"], [COURSE.topics.length, "chapters"], [TOTAL_WEEKS, "weeks"], [COURSE.mode, "delivery"]
    ].map(([v, k]) => `<div class="stat"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    $("#heroProg").textContent = `Offered under ${COURSE.programme}`;
    $("#heroMeta").innerHTML = `<span>Prerequisites: ${esc(COURSE.prerequisites.join(", "))}</span><span>${built} of ${COURSE.topics.length} chapters interactive</span>`;
  }
  if ($("#nowNote")) renderNowNote();
  if ($("#continueNote")) renderContinue();
  if ($("#scope")) renderScope();
  if ($("#teamList")) renderTeam();
  if ($("#menuCards")) renderCards();
  if ($("#topicList")) renderTopics();
  if ($("#schedBody")) renderSchedule();
  if ($("#assessBar")) renderAssessment();
  if ($("#labList")) renderLabs();

  /* ---------- Menu cards on the homepage ---------- */
  function renderCards() {
    const I = {
      book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9 7h6"/>',
      cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
      chart: '<path d="M5 20V11M12 20V5M19 20v-6"/><path d="M3 20h18"/>',
      flask: '<path d="M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.5L14 9V3"/><path d="M7.5 15h9"/>',
      refs: '<path d="M6 3h12v18l-6-4-6 4z"/>'
    };
    const built = COURSE.topics.filter((t) => t.page).length;
    const pills = `<span class="mc-pills">${COURSE.topics.map((t) => `<span class="pill${t.page ? " on" : ""}" title="Chapter ${t.no}">${t.no}</span>`).join("")}</span>`;
    const cards = [
      { i: "book", t: "Chapters", d: "Interactive lecture notes with animations, calculators with step-by-step working, and exercises for every chapter.", b: `${COURSE.topics.length} chapters · ${built} interactive`, h: "chapters.html", wide: true, extra: pills },
      { i: "cal", t: "Weekly Schedule", d: "Topics, labs and assessments for every week of the semester.", b: `${TOTAL_WEEKS} weeks`, h: "schedule.html" },
      { i: "chart", t: "Assessment and Outcomes", d: "How your grade is made up, and the course outcomes.", b: `${COURSE.assessment.length} parts · ${COURSE.outcomes.length} outcomes`, h: "assessment.html" },
      { i: "flask", t: "Laboratory Experiments", d: "The lab experiments and the weeks they run in, with virtual labs to try before you come to the lab.", b: `${COURSE.labs.length} labs · ${COURSE.labs.filter((l) => l.page).length} virtual`, h: "labs.html#labs" },
      { i: "refs", t: "References", d: "Textbooks and reference books for the course.", b: `${COURSE.references.length} books`, h: "labs.html#refs" }
    ];
    $("#menuCards").innerHTML = cards.map((c) => `
      <a class="mcard${c.wide ? " wide" : ""}" href="${esc(c.h)}">
        <span class="mc-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[c.i]}</svg></span>
        <span class="mc-title">${esc(c.t)}</span>
        <span class="mc-desc">${esc(c.d)}</span>${c.extra || ""}
        <span class="mc-foot"><span class="mc-badge">${esc(c.b)}</span><span class="mc-go" aria-hidden="true">→</span></span>
      </a>`).join("");
  }

  /* ---------- One-line "now" note and "continue" link in the semester section ---------- */
  function renderNowNote() {
    const first = COURSE.topics[0];
    let h;
    if (curWeek === 0) {
      const n = -daysIn;
      h = `<span class="live-dot waiting"></span><span>Semester starts <strong>${esc(fmtLong(START))}</strong> (in ${n} day${n === 1 ? "" : "s"}). First up: <a href="${esc(pageOf(first))}">Chapter 1: ${esc(first.title)} →</a></span>`;
    } else if (curWeek > TOTAL_WEEKS) {
      h = `<span class="live-dot"></span><span>The semester has ended. <a href="chapters.html">Revise any chapter →</a></span>`;
    } else {
      const w = COURSE.weeks[curWeek - 1], ts = COURSE.topics.filter((t) => weekNumbers(t.weeks).includes(curWeek));
      const due = w.assessments.length ? ` · <span class="due">${esc(w.assessments.join(", "))} this week</span>` : "";
      const link = ts.length ? `<a href="${esc(pageOf(ts[0]))}">Open Chapter ${ts[0].no} →</a>` : `<a href="schedule.html#wk-${curWeek}">View this week →</a>`;
      h = `<span class="live-dot"></span><span><strong>Now: Week ${curWeek}</strong> · ${esc(w.topic)}${due} · ${link}</span>`;
    }
    $("#nowNote").innerHTML = h;
  }
  function renderContinue() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem("nmk-last") || "null"); } catch (e) {}
    if (!c || !c.href || !/^chapter-\d+\.html(#[\w-]+)?$/.test(c.href)) return;
    const el = $("#continueNote");
    el.innerHTML = `Continue where you left off: <a href="${esc(c.href)}">Chapter ${esc(c.no)}${c.sec ? ` · ${esc(c.sec)}` : ""} →</a>`;
    el.hidden = false;
  }

  function nextAssessment(fromWeek) {
    return COURSE.weeks.find((w) => w.w > fromWeek && w.assessments.length);
  }

  function renderReadout() {
    const el = $("#readout");
    const totalDays = TOTAL_WEEKS * 7;
    let html;
    if (curWeek === 0) {
      const n = -daysIn;
      const w1 = COURSE.weeks[0];
      html = `<div class="ro-a">
        <div class="readout-label"><span class="live-dot waiting"></span>Before the semester, today is ${esc(fmt(T, true))}</div>
        <div class="readout-week">${n} day${n === 1 ? "" : "s"}<small>until Week 1</small></div></div>
        <div class="ro-b"><div class="readout-topic">Week 1 begins ${esc(fmtLong(START))}</div>
        <p class="readout-first">First up: <strong>${esc(w1.topic)}</strong> (${esc(w1.activities.join(", "))})</p>
        ${chapterLinks(1, "Get ready: ")}
        ${nextBlock(0)}</div>`;
    } else if (curWeek > TOTAL_WEEKS) {
      html = `<div class="ro-a">
        <div class="readout-label"><span class="live-dot"></span>Semester complete</div>
        <div class="readout-week">Finished<small>${esc(COURSE.session)}</small></div>
        <div class="progress"><span style="width:100%"></span></div></div>
        <div class="ro-b"><div class="readout-topic">All teaching and exam weeks have ended.</div></div>`;
    } else {
      const w = COURSE.weeks[curWeek - 1];
      const items = [
        ...w.activities.map((a) => `<li>${esc(a)}</li>`),
        ...w.assessments.map((a) => `<li class="due">${esc(a)} this week</li>`),
        ...w.notes.map((a) => `<li>${esc(a)}</li>`)
      ];
      const pct = Math.min(100, Math.round(((daysIn + 1) / totalDays) * 100));
      html = `<div class="ro-a">
        <div class="readout-label"><span class="live-dot"></span>This week, ${esc(fmt(T, true))}</div>
        <div class="readout-week">Week ${w.w}<small>${esc(range(w.w))}</small></div>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Semester progress"><span style="width:${pct}%"></span></div>
        <div class="progress-caption">Day ${daysIn + 1} of ${totalDays} in the semester</div></div>
        <div class="ro-b"><div class="readout-topic">${esc(w.topic)}</div>
        ${items.length ? `<ul>${items.join("")}</ul>` : ""}
        ${chapterLinks(w.w)}
        ${nextBlock(curWeek)}</div>`;
    }
    el.innerHTML = html;
  }

  function chapterLinks(w, prefix = "") {
    const ts = COURSE.topics.filter((t) => weekNumbers(t.weeks).includes(w));
    return ts.length ? `<div class="readout-links">${ts.map((t) => `<a href="${esc(pageOf(t))}">${prefix}Chapter ${t.no}: ${esc(t.title)}</a>`).join("")}</div>` : "";
  }

  function nextBlock(fromWeek) {
    const n = nextAssessment(fromWeek);
    if (!n) return "";
    return `<div class="readout-next" style="margin-top:14px">Next assessment: <strong>${esc(n.assessments.join(", "))}</strong>, week ${n.w} (${esc(range(n.w))})</div>`;
  }

  /* ---------- Semester trace (SVG) ---------- */

  function renderScope() {
    const W = 1000, H = 250, x0 = 52, x1 = 988, yT = 20, yB = 196;
    const cw = (x1 - x0) / TOTAL_WEEKS;
    const y = (v) => yB - (v / 100) * (yB - yT);
    const cx = (w) => x0 + (w - 0.5) * cw;

    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="scopeTitle scopeDesc">
      <title id="scopeTitle">Semester trace</title>
      <desc id="scopeDesc">Cumulative assessment weight across ${TOTAL_WEEKS} weeks, reaching 100 percent after the final examination.</desc>`;

    // shaded non-teaching weeks
    COURSE.weeks.forEach((wk) => {
      if (wk.tags.some((t) => ["break", "study", "exam"].includes(t))) {
        s += `<rect class="shade" x="${x0 + (wk.w - 1) * cw}" y="${yT}" width="${cw}" height="${yB - yT}"/>`;
      }
    });

    // graticule
    for (let v = 0; v <= 100; v += 25) {
      s += `<line class="gl" x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="axis" x="${x0 - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
    }
    for (let i = 0; i <= TOTAL_WEEKS; i++) s += `<line class="gl" x1="${x0 + i * cw}" x2="${x0 + i * cw}" y1="${yT}" y2="${yB}"/>`;

    // selected column highlight (under trace)
    s += `<rect class="col sel" id="selCol" x="${x0 + (selectedWeek - 1) * cw}" y="${yT}" width="${cw}" height="${yB - yT}" style="pointer-events:none;display:none"/>`;

    // trace
    let cum = 0, d = `M${x0},${y(0)}`;
    const pts = [];
    COURSE.weeks.forEach((wk) => {
      const prev = cum; cum += wk.weight;
      d += ` L${cx(wk.w)},${y(prev)} L${cx(wk.w)},${y(cum)}`;
      if (wk.assessments.length) pts.push({ x: cx(wk.w), y: y(cum), big: wk.weight > 0 });
    });
    d += ` L${x1},${y(cum)}`;
    s += `<path class="trace-fill" d="${d} L${x1},${yB} L${x0},${yB} Z"/>`;
    s += `<path class="trace" d="${d}"/>`;
    pts.forEach((p) => { s += p.big ? `<circle class="mk" cx="${p.x}" cy="${p.y}" r="4.5"/>` : `<circle class="mk-ring" cx="${p.x}" cy="${p.y}" r="3.5"/>`; });

    // today cursor
    if (daysIn >= 0 && curWeek <= TOTAL_WEEKS) {
      const tx = x0 + ((daysIn + 0.5) / 7) * cw;
      s += `<line class="now" x1="${tx}" x2="${tx}" y1="${yT - 6}" y2="${yB}"/>`;
      s += `<text class="now-label" x="${tx + 5}" y="${yT + 6}">Today</text>`;
    } else if (daysIn < 0) {
      s += `<line class="now" x1="${x0}" x2="${x0}" y1="${yT - 6}" y2="${yB}"/>`;
      s += `<text class="now-label" x="${x0 + 6}" y="${yT + 6}">Today: ${-daysIn} day${daysIn === -1 ? "" : "s"} before Week 1</text>`;
    }

    // week labels + click targets
    s += `<text class="axis" x="${x0 - 8}" y="${yB + 22}" text-anchor="end">Week</text>`;
    COURSE.weeks.forEach((wk) => {
      s += `<text class="wk" data-wk="${wk.w}" x="${cx(wk.w)}" y="${yB + 22}" text-anchor="middle">${wk.w}</text>`;
    });
    s += `<text class="axis" x="${cx(9)}" y="${yB + 42}" text-anchor="middle">Mid-term break</text>`;
    s += `<text class="axis" x="${cx(18)}" y="${yB + 42}" text-anchor="middle">Final exam</text>`;
    COURSE.weeks.forEach((wk) => {
      s += `<rect class="col" tabindex="0" role="button" aria-label="Week ${wk.w}: ${esc(wk.topic)}" data-wk="${wk.w}" x="${x0 + (wk.w - 1) * cw}" y="${yT}" width="${cw}" height="${yB - yT + 30}"/>`;
    });
    s += `</svg>`;

    const scope = $("#scope");
    scope.innerHTML = s;
    const pick = (e) => { const w = e.target.getAttribute("data-wk"); if (w) selectWeek(+w, cw, x0); };
    scope.addEventListener("click", pick);
    scope.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e); } });
    $("#weekDetail").hidden = true;

    // on narrow screens, scroll the current week into view
    if (scope.scrollWidth > scope.clientWidth && selectedWeek > 6) {
      scope.scrollLeft = (selectedWeek / TOTAL_WEEKS) * scope.scrollWidth - scope.clientWidth / 2;
    }
  }

  function selectWeek(w, cw, x0) {
    const col = $("#selCol"), det = $("#weekDetail");
    if (!det.hidden && selectedWeek === w && col.style.display !== "none") { col.style.display = "none"; det.hidden = true; document.querySelectorAll("#scope .wk").forEach((t) => t.classList.remove("sel")); return; } // tap again to close
    col.setAttribute("x", x0 + (w - 1) * cw); col.style.display = "";
    det.hidden = false;
    selectedWeek = w;
    document.querySelectorAll("#scope .wk").forEach((t) => t.classList.toggle("sel", +t.dataset.wk === w));
    renderWeekDetail();
  }

  function renderWeekDetail() {
    const wk = COURSE.weeks[selectedWeek - 1];
    const chips = [
      ...wk.activities.map((a) => `<span class="chip">${esc(a)}</span>`),
      ...wk.assessments.map((a) => `<span class="chip due">${esc(a)}</span>`),
      ...wk.notes.map((a) => `<span class="chip note">${esc(a)}</span>`)
    ].join("");
    const topics = COURSE.topics.filter((t) => weekNumbers(t.weeks).includes(wk.w));
    $("#weekDetail").innerHTML = `
      <div>
        <div class="wd-num">Week ${wk.w}</div>
        <div class="wd-dates">${esc(range(wk.w))}</div>
      </div>
      <div>
        <div class="wd-topic">${esc(wk.topic)}</div>
        ${wk.sub ? `<div class="wd-sub">${esc(wk.sub)}</div>` : ""}
        ${chips ? `<div class="chips">${chips}</div>` : ""}
        <div class="readout-links" style="margin:12px 0 0">
          ${topics.map((t) => `<a href="${esc(pageOf(t))}">Open Chapter ${t.no}</a>`).join("")}
          <a href="schedule.html#wk-${wk.w}">View in schedule</a>
        </div>
      </div>`;
  }

  function weekNumbers(str) {
    const n = (str.match(/\d+/g) || []).map(Number);
    if (n.length === 2) { const out = []; for (let i = n[0]; i <= n[1]; i++) out.push(i); return out; }
    return n;
  }

  /* ---------- Topics ---------- */
  function exProgress(t) {
    const ex = t.exercises;
    if (!ex) return "";
    let solved = [];
    try { solved = JSON.parse(localStorage.getItem("nmk-solved") || "[]"); } catch (e) {}
    const n = solved.filter((id) => String(id).startsWith(ex.prefix)).length, pct = Math.round((n / ex.count) * 100);
    return `<div class="ex-prog"><span class="ex-bar" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${ex.count}" aria-label="Exercises solved"><i style="width:${pct}%"></i></span><span>${n} of ${ex.count} exercises solved</span></div>`;
  }
  function renderTopics() {
    const list = $("#topicList"), search = $("#topicSearch");
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const done = store.get();
      const items = COURSE.topics.filter((t) => !q || (t.title + " " + t.summary).toLowerCase().includes(q));
      list.innerHTML = items.length ? items.map((t) => {
        const on = done.includes(t.no);
        const featured = t.status === "building" || t.status === "interactive";
        return `
          <li class="topic${featured ? " featured" : ""}">
            <div class="topic-no" aria-hidden="true">${t.no}</div>
            <div>
              <h3><a href="${esc(pageOf(t))}"><span class="sr-only">Chapter ${t.no}: </span>${esc(t.title)}</a></h3>
              <p class="topic-summary">${esc(t.summary)}</p>
              <div class="topic-meta"><span>${esc(t.weeks)}</span><span class="badge ${t.status}">${statusLabel[t.status]}</span></div>
              ${exProgress(t)}
            </div>
            <button class="study-toggle" data-no="${t.no}" aria-pressed="${on}">
              <span class="box" aria-hidden="true"></span>${on ? "Studied" : "Mark as studied"}
            </button>
          </li>`;
      }).join("") : `<li class="topic-empty">No topics match "${esc(search.value)}". Try a broader word, such as "signal".</li>`;
      const n = done.length;
      $("#studySummary").textContent = n
        ? `You've marked ${n} of ${COURSE.topics.length} topics as studied. This is saved in this browser only.`
        : "Mark topics as studied to track your revision. This is saved in this browser only.";
    };
    search.addEventListener("input", draw);
    list.addEventListener("click", (e) => {
      const b = e.target.closest(".study-toggle");
      if (!b) return;
      const no = +b.dataset.no; let done = store.get();
      done = done.includes(no) ? done.filter((x) => x !== no) : [...done, no];
      store.set(done); draw();
      const again = list.querySelector(`.study-toggle[data-no="${no}"]`); if (again) again.focus();
    });
    draw();
  }

  /* ---------- Schedule ---------- */
  function renderSchedule() {
    const filters = [
      ["all", "All weeks"], ["lab", "Labs"], ["assess", "Quizzes and test"], ["project", "Mini project"], ["online", "Online lectures"]
    ];
    let active = "all";
    const fEl = $("#filters");
    const drawFilters = () => {
      fEl.innerHTML = filters.map(([k, l]) => `<button class="filter" data-f="${k}" aria-pressed="${k === active}">${l}</button>`).join("");
    };
    const match = (wk) => active === "all" ? true
      : active === "assess" ? wk.tags.includes("quiz") || wk.tags.includes("test")
      : wk.tags.includes(active);
    const draw = () => {
      $("#schedBody").innerHTML = COURSE.weeks.filter(match).map((wk) => {
        const muted = wk.tags.some((t) => ["break", "study", "exam"].includes(t));
        const cls = [muted ? "muted" : "", wk.w === curWeek ? "current" : ""].join(" ").trim();
        const right = [
          ...wk.assessments.map((a) => `<span class="chip due">${esc(a)}</span>`),
          ...wk.notes.map((a) => `<span class="chip note">${esc(a)}</span>`)
        ].join(" ");
        return `<tr id="wk-${wk.w}" class="${cls}">
          <td><span class="wnum">${wk.w}</span><span class="wdate">${esc(fmt(weekStart(wk.w)))} to ${esc(fmt(weekEnd(wk.w)))}</span></td>
          <td><span class="t-topic">${esc(wk.topic)}</span>${wk.sub ? `<span class="t-sub">${esc(wk.sub)}</span>` : ""}</td>
          <td>${esc(wk.activities.join(", "))}</td>
          <td><div class="chips">${right}</div></td>
        </tr>`;
      }).join("") || `<tr><td colspan="4">No weeks match this filter.</td></tr>`;
    };
    fEl.addEventListener("click", (e) => {
      const b = e.target.closest(".filter"); if (!b) return;
      active = b.dataset.f; drawFilters(); draw();
    });
    drawFilters(); draw();
    const m = /^#wk-(\d+)$/.exec(location.hash);
    if (m) { const row = document.getElementById(`wk-${m[1]}`); if (row) { row.scrollIntoView({ block: "center" }); row.classList.add("flash"); } }
  }

  /* ---------- Assessment ---------- */
  function renderAssessment() {
    const bar = $("#assessBar");
    const short = { final: "Final exam", lab: "Lab", quiz: "Quiz", project: "Project", test: "Test" };
    // order: continuous parts first, final last, to match the 60 / 40 caption
    const parts = [...COURSE.assessment.filter((a) => a.kind !== "final"), ...COURSE.assessment.filter((a) => a.kind === "final")];
    let sel = parts[parts.length - 1].kind;
    const draw = () => {
      bar.innerHTML = parts.map((a) =>
        `<button class="seg ${a.kind}" style="flex:${a.pct}" data-k="${a.kind}" aria-pressed="${a.kind === sel}" aria-label="${esc(a.name)}, ${a.pct} percent">${a.pct >= 20 ? `${short[a.kind]} ` : ""}${a.pct}%</button>`
      ).join("");
      const a = parts.find((p) => p.kind === sel);
      $("#assessDetail").innerHTML = `<strong>${esc(a.name)}, ${a.pct}%</strong><p>${esc(a.detail)}</p>`;
    };
    bar.addEventListener("click", (e) => { const b = e.target.closest(".seg"); if (b) { sel = b.dataset.k; draw(); bar.querySelector(`[data-k="${sel}"]`).focus(); } });
    draw();
    const list = document.createElement("ul");
    list.className = "assess-list";
    list.innerHTML = parts.map((a) => `<li><span><i class="key seg ${a.kind}" aria-hidden="true"></i>${esc(a.name)}</span><span>${a.pct}%</span></li>`).join("");
    $("#assessDetail").after(list);

    $("#coList").innerHTML = COURSE.outcomes.map((c) =>
      `<li class="co"><div class="co-id">${c.id}</div><div><p>${esc(c.text)}</p><div class="co-meta">${esc(c.level)}, mapped to ${esc(c.po)}</div></div></li>`
    ).join("");
  }

  /* ---------- Labs, references, team ---------- */
  function renderLabs() {
    // A lab with a virtual lab page becomes a link card; the others stay plain rows.
    $("#labList").innerHTML = COURSE.labs.map((l) => l.page
      ? `<li class="lab-link"><a href="${esc(l.page)}">
          <span class="ll-top"><span class="ll-title">${esc(l.title)}${l.openEnded ? '<span class="oe">Open-ended</span>' : ""}</span><span class="muted">${esc(l.weeks)}</span></span>
          ${l.summary ? `<span class="ll-sum">${esc(l.summary)}</span>` : ""}
          <span class="ll-go">Open the virtual lab <span aria-hidden="true">→</span></span></a></li>`
      : `<li><span>${esc(l.title)}${l.openEnded ? '<span class="oe">Open-ended</span>' : ""}</span><span class="muted">${esc(l.weeks)}</span></li>`
    ).join("");
    $("#refList").innerHTML = COURSE.references.map((r) => `<li>${esc(r)}</li>`).join("");
  }

  function renderTeam() {
    $("#teamList").innerHTML = COURSE.team.map((p) => `
      <div class="person">
        <div class="avatar">${p.photo ? `<img src="${esc(p.photo)}" alt="Photo of ${esc(p.name)}" width="112" height="112" loading="lazy">` : esc(p.initials)}</div>
        <div>
          <div class="person-role">${esc(p.role)}</div>
          <div class="person-name">${esc(p.name)}</div>
          <div class="person-links">
            <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>
            ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Profile</a>` : ""}
          </div>
        </div>
      </div>`).join("");
  }

  /* =====================================================================
     CHAPTER PAGE (topic.html?ch=N)
     ===================================================================== */
  const chapterEl = $("#chapter");
  if (chapterEl) {
    const no = parseInt(new URLSearchParams(location.search).get("ch"), 10);
    const t = COURSE.topics.find((x) => x.no === no);
    if (!t) {
      document.title = `Chapter not found | ${COURSE.code}`;
      chapterEl.innerHTML = `<div class="wrap chapter-hero"><a class="crumb" href="chapters.html">Back to all chapters</a>
        <h1>Chapter not found</h1><p>This link doesn't match a chapter. Choose one from the topic list.</p></div>`;
      return;
    }
    if (t.page) { location.replace(t.page); return; } // old topic.html?ch=N links go to the built page
    document.title = `Chapter ${t.no}: ${t.title} | ${COURSE.code}`;
    const wks = weekNumbers(t.weeks).map((n) => COURSE.weeks[n - 1]).filter(Boolean);
    const prev = COURSE.topics.find((x) => x.no === t.no - 1), next = COURSE.topics.find((x) => x.no === t.no + 1);
    const notice = t.status === "building"
      ? `<div class="notice"><h2>Interactive Chapter in Progress</h2><p>This chapter is being built with live circuit calculators. You'll be able to change component values and see each step of the working.</p>${t.planned ? `<ul>${t.planned.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div>`
      : `<div class="notice"><h2>Notes Coming Soon</h2><p>This chapter's online notes haven't been published yet. Use the lecture slides on URLearn in the meantime.</p></div>`;
    chapterEl.innerHTML = `
      <div class="wrap chapter-hero">
        <a class="crumb" href="chapters.html">Back to all chapters</a>
        <div class="chapter-no">Chapter ${t.no}</div>
        <h1>${esc(t.title)}</h1>
        <div class="topic-meta"><span>${esc(t.weeks)}${wks[0] ? `, ${esc(fmt(weekStart(wks[0].w)))} to ${esc(fmt(weekEnd(wks[wks.length - 1].w), true))}` : ""}</span><span class="badge ${t.status}">${statusLabel[t.status]}</span></div>
      </div>
      <div class="wrap chapter-body">
        <p style="font-size:1.08rem;color:var(--ink-2)">${esc(t.summary)}</p>
        ${notice}
        ${wks.length ? `<h2 style="font-size:1.3rem;margin:32px 0 10px">In the Teaching Plan</h2>
          <ul>${wks.map((w) => `<li><strong>Week ${w.w}, ${esc(w.topic)}.</strong> ${esc(w.sub)}${w.activities.length ? ` Activities: ${esc(w.activities.join(", "))}.` : ""}</li>`).join("")}</ul>` : ""}
        <nav class="pager" aria-label="Chapters">
          <span>${prev ? `<a href="${esc(pageOf(prev))}"><small>Previous</small>Chapter ${prev.no}: ${esc(prev.title)}</a>` : ""}</span>
          <span style="text-align:right">${next ? `<a href="${esc(pageOf(next))}"><small>Next</small>Chapter ${next.no}: ${esc(next.title)}</a>` : ""}</span>
        </nav>
      </div>`;
  }
})();
