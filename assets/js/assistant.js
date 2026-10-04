/* NMK42003 Assistant: a chat panel on every page.
   Messages go to a small proxy (a Cloudflare Worker that holds the API key), which passes them to the
   language model. The page sends its own instructions, a short course brief built from data.js, and the
   page and section the student is on. Nothing is stored on a server: the chat lives in this browser tab.
   To change the service or the model, edit ENDPOINT and MODEL below. */
(function () {
  "use strict";
  if (typeof COURSE === "undefined" || !window.fetch) return;

  const ENDPOINT = "https://fuzzy-ai-proxy.zamrizahir.workers.dev/";
  const MODEL = "openai/gpt-oss-120b";
  const MAX_INPUT = 500, MAX_TURNS = 6, DAY_LIMIT = 40, GAP_MS = 4000; // the free service is shared by everyone, so each browser is rationed
  const HIST_KEY = "nmk-chat", OPEN_KEY = "nmk-chat-open", DAY_KEY = "nmk-chat-day";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ses = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  const usedToday = () => { try { const v = JSON.parse(localStorage.getItem(DAY_KEY)); return v && v.d === today() ? v.n : 0; } catch (e) { return 0; } };
  const countOne = () => { try { localStorage.setItem(DAY_KEY, JSON.stringify({ d: today(), n: usedToday() + 1 })); } catch (e) { /* private mode */ } };

  /* ---------- What the assistant is told ---------- */
  const RULES = `You are the NMK42003 Assistant, a study helper on the course website of ${COURSE.code} ${COURSE.name} (${COURSE.university}, ${COURSE.session}). The students are undergraduates in electronic engineering technology.

How to help:
- Explain ideas from this course simply and correctly: instrumentation, measurement error, the ESP32, transducers and sensors, signal conditioning, data conversion, calibration, data acquisition, IoT. Use short worked examples with different numbers from the student's own question.
- For an exercise, quiz question, Pre-Lab Check question or Lab Task: guide with hints and the method, one step at a time. Never give the final numerical answer, never say which quiz option is right, and never write the blocks or code for a Lab Task. If asked directly, say kindly that you can only guide, then give the next hint.
- Use the course facts below for dates, weeks and marks. If something is not in them, say you don't know and point to the lecturer or URLearn. Never invent dates, marks, deadlines, links or rules.
- Don't give phone numbers or enrolment keys. For personal, medical or official matters, point to the lecturer.
- If you are not sure, say so. If a question is not about this course or about studying, say briefly that you only help with NMK42003.
- Reply in the language the student writes in (English or Malay). Keep it short: at most about 120 words unless the student asks for more.
- Plain text only. You may use **bold**, \`code\` and simple lists with "- ". No tables, no headings, no LaTeX: write formulas in plain text such as Angle = m × ADC + c.`;

  // Course facts, built from the same data the site's pages use
  function brief() {
    const [y, m, d] = COURSE.semesterStart.split("-").map(Number);
    const day = (w) => new Date(y, m - 1, d + (w - 1) * 7).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const weeks = (COURSE.weeks || []).map((w) =>
      `W${w.w} (from ${day(w.w)}): ${w.topic}${w.activities && w.activities.length ? "; " + w.activities.join(", ") : ""}${w.assessments && w.assessments.length ? "; due or held: " + w.assessments.join(", ") : ""}${w.notes && w.notes.length ? "; " + w.notes.join(", ") : ""}`).join("\n");
    return `COURSE FACTS
Lecturers: ${COURSE.team.map((p) => `${p.name} (${p.role}, ${p.email})`).join("; ")}.
Assessment: ${COURSE.assessment.map((a) => `${a.name} ${a.pct}%`).join(", ")}.
Chapters on the site: ${COURSE.topics.map((t) => `${t.no}. ${t.title} (${t.weeks})`).join("; ")}.
Labs: ${COURSE.labs.map((l) => `${l.title} (${l.weeks}${l.page ? ", has a virtual lab on the site" : ""})`).join("; ")}.
Weeks start on Monday. Week by week:
${weeks}`;
  }

  // Where the student is: the page, and the section heading nearest the top of the screen
  function where() {
    const page = (document.querySelector("h1") || {}).textContent || document.title;
    let sec = "";
    document.querySelectorAll("main h2, main h3").forEach((h) => { if (h.getBoundingClientRect().top < innerHeight * 0.5 && h.offsetParent) sec = h.textContent; });
    return `The student is on the page "${page.trim()}"${sec ? `, at the section "${sec.trim()}"` : ""}. Today is ${today()} (Malaysia time).`;
  }

  /* ---------- Suggested first questions, by page ---------- */
  function starters() {
    const p = location.pathname;
    if (/lab-2/.test(p)) return ["Why must VP stay below 3.3 V?", "What do m and c mean?", "Why does my ADC count jump about?"];
    if (/lab-1/.test(p)) return ["Why do I need the capacitor on EN?", "My upload fails: what should I check?", "How do I find the ESP32's IP address?"];
    if (/chapter-(\d)/.test(p)) return ["Summarise this chapter in 5 points", "Give me a practice question", "Explain the section I'm on"];
    if (/schedule|assessment/.test(p)) return ["What is due this week?", "How is my grade made up?", "When are the quizzes?"];
    return ["What is this course about?", "What is due this week?", "How should I prepare for Lab 1?"];
  }

  /* ---------- A small, safe text formatter: bold, code, lists, line breaks ---------- */
  function fmt(t) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    let out = "", list = false;
    t.trim().split(/\n/).forEach((line) => {
      const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!list) { out += "<ul>"; list = true; } out += `<li>${inline(m[1])}</li>`; return; }
      if (list) { out += "</ul>"; list = false; }
      if (line.trim()) out += `<p>${inline(line)}</p>`;
    });
    return out + (list ? "</ul>" : "");
  }

  /* ---------- The panel ---------- */
  const root = document.createElement("div");
  root.className = "chat";
  root.innerHTML = `<button type="button" class="chat-fab" aria-expanded="false" aria-controls="chatPanel" aria-label="Open the NMK42003 Assistant">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/></svg>
      <span class="chat-fab-t">Ask</span></button>
    <section class="chat-panel" id="chatPanel" role="dialog" aria-label="NMK42003 Assistant" hidden>
      <header class="chat-head"><div><strong>NMK42003 Assistant</strong><small>An AI study helper. It can be wrong: check the notes.</small></div>
        <button type="button" class="chat-x" data-new title="Start a new chat" aria-label="Start a new chat">↺</button>
        <button type="button" class="chat-x" data-close aria-label="Close the assistant">✕</button></header>
      <div class="chat-log" role="log" aria-live="polite" tabindex="0"></div>
      <form class="chat-form">
        <label class="vh" for="chatIn">Your question</label>
        <textarea id="chatIn" rows="1" maxlength="${MAX_INPUT}" placeholder="Ask about this page or the course…" enterkeyhint="send"></textarea>
        <button type="submit" class="chat-send" aria-label="Send">➤</button>
      </form>
      <p class="chat-note">Your messages go to an AI service to get a reply. Don't type personal details. Nothing is saved on a server.</p>
    </section>`;
  document.body.appendChild(root);

  const fab = $(".chat-fab", root), panel = $(".chat-panel", root), log = $(".chat-log", root), form = $(".chat-form", root), input = $("#chatIn", root), sendBtn = $(".chat-send", root);
  let hist = ses.get(HIST_KEY, []), busy = false, lastSent = 0;
  if (!Array.isArray(hist)) hist = [];

  const bubble = (role, html, cls = "") => `<div class="chat-msg ${role} ${cls}"><span class="vh">${role === "user" ? "You" : "Assistant"}: </span>${html}</div>`;
  function paint() {
    log.innerHTML = bubble("bot", `<p>Hi! I'm the course's AI study helper. Ask me about this page, a topic you find hard, or what is coming up this week.</p><p>For exercises, quizzes and Lab Tasks I give hints, not answers.</p>`) +
      hist.map((h) => bubble(h.role === "user" ? "user" : "bot", h.role === "user" ? `<p>${esc(h.text)}</p>` : fmt(h.text), h.err ? "err" : "")).join("") +
      (hist.length ? "" : `<div class="chat-chips">${starters().map((q) => `<button type="button" class="chat-chip">${esc(q)}</button>`).join("")}</div>`) +
      (busy ? `<div class="chat-msg bot typing" aria-label="The assistant is writing"><span></span><span></span><span></span></div>` : "");
    log.scrollTop = log.scrollHeight;
  }
  function setOpen(open, focus) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", open);
    fab.setAttribute("aria-label", open ? "Close the NMK42003 Assistant" : "Open the NMK42003 Assistant");
    root.classList.toggle("open", open);
    ses.set(OPEN_KEY, open);
    if (open) { paint(); if (focus) input.focus(); } else if (focus) fab.focus();
  }

  async function ask(text) {
    text = text.trim().slice(0, MAX_INPUT);
    if (!text || busy) return;
    const wait = GAP_MS - (Date.now() - lastSent);
    const say = (t, err) => { hist.push({ role: "assistant", text: t, err }); ses.set(HIST_KEY, hist.filter((h) => !h.err)); };
    hist.push({ role: "user", text });
    if (usedToday() >= DAY_LIMIT) { say(`You've reached today's limit of ${DAY_LIMIT} questions on this device. The assistant runs on a free service shared by the whole class, so it is rationed. Please come back tomorrow, or ask your lecturer.`, true); paint(); return; }
    busy = true; sendBtn.disabled = true; paint();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSent = Date.now(); countOne();
    const recent = hist.filter((h) => !h.err).slice(-(MAX_TURNS * 2 + 1)).map((h) => ({ role: h.role, content: h.text.slice(0, 1200) }));
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: 700, reasoning_effort: "low",
          messages: [{ role: "system", content: `${RULES}\n\n${brief()}\n\n${where()}` }].concat(recent) })
      });
      const data = await resp.json().catch(() => ({}));
      const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (reply) say(reply.trim());
      else if (resp.status === 429 || /rate limit/i.test((data.error && data.error.message) || "")) say("The assistant is busy: too many questions are coming in at once. Please wait a minute and try again.", true);
      else say("Sorry, the assistant couldn't answer just now. Please try again in a moment.", true);
    } catch (e) {
      say("The assistant can't be reached. Check your internet connection and try again.", true);
    }
    busy = false; sendBtn.disabled = false; paint();
  }

  fab.addEventListener("click", () => setOpen(panel.hidden, true));
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) setOpen(false, true);
    else if (e.target.closest("[data-new]")) { hist = []; ses.set(HIST_KEY, hist); paint(); input.focus(); }
    else if (e.target.closest(".chat-chip")) ask(e.target.closest(".chat-chip").textContent);
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); const t = input.value; input.value = ""; input.style.height = ""; ask(t); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); } });
  input.addEventListener("input", () => { input.style.height = ""; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) setOpen(false, true); });
  if (ses.get(OPEN_KEY, false)) setOpen(true, false); // stays open while the student moves between pages
})();
