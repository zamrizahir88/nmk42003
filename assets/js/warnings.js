/* NMK42003 attendance warnings: the Warnings tab of the lecturer attendance page (attendance.js calls NMKWarnings.draw).
   The lecturer's Apps Script (apps-script/warnings.gs: a full check only when asked, "Run check now" or Send / Mark, within 5 minutes; once a day in Automatic mode) works out who is due and writes it to Firestore
   warnings/{semester}_{email}: the absence counts, the levels already emailed, the emails due (with their text, for
   Preview) and the history. In Manual mode (the default) nothing is sent until the lecturer presses Send (the tab writes
   the due keys to "go"; "Mark as sent" writes them to "skip"); in Automatic mode the script sends at its next check.
   meta/warnings holds the mode, the semester (written here, read by the script) and the script's last run. */
(function () {
  "use strict";
  const KT = { lecture: "Lectures", lab: "Labs" };
  const LV = { 1: "Attendance Warning 1", 2: "Attendance Warning 2", 3: "Barring Notification" };
  let C = null, W = [], meta = null, unsub = null, unsubM = null, wroteMeta = false;
  const st = { view: "due", sel: new Set(), prev: null, msg: "" };
  const esc = (s) => C.esc(s);
  const ms = (t) => (t && t.toMillis ? t.toMillis() : t ? Date.parse(t) : 0);
  const itemName = (it) => (it.type === "withdraw" ? `${LV[it.level]} (${KT[it.kind]}) withdrawn` : `${LV[it.level]} (${KT[it.kind]})`);
  const pill = (it) => `<span class="wn-pill ${it.type === "withdraw" ? "w" : `l${it.level}`}">${esc(itemName(it))}</span>`;
  const levelText = (w, k) => { const s = ((w && w.sent) || {})[k] || {}; return s.level ? LV[s.level].replace("Attendance ", "") : "–"; };

  function render(body) {
    const root = body.querySelector(".wn-root") || Object.assign(document.createElement("div"), { className: "wn-root" });
    if (!root.parentNode) { body.innerHTML = ""; body.appendChild(root); }
    if (!meta) { root.innerHTML = `<p class="small-note">Loading…</p>`; return; }
    const auto = meta.mode === "auto", due = W.filter((w) => w.hasDue && (w.due || []).length).sort((a, b) => (a.name < b.name ? -1 : 1));
    const last = ms(meta.lastRun), tAt = ms(meta.testAt), tDone = ms(meta.testDone), asked = Math.max(ms(meta.runAt), ms(meta.poke));
    const roster = C.L.roster.filter((r) => r.status === "active").sort((a, b) => (a.name < b.name ? -1 : 1)), byEmail = Object.fromEntries(W.map((w) => [w.email, w]));
    const hist = W.flatMap((w) => (w.history || []).map((h) => Object.assign({ w }, h))).sort((a, b) => ms(b.at) - ms(a.at));
    const prevIt = st.prev && (W.find((w) => w.id === st.prev.id) || { due: [] }).due.find((i) => i.key === st.prev.key);
    root.innerHTML = `<p class="widget-lead">Emails to the student and their RPS when absences without an approved reason add up, with a copy to you.
        <strong>Lectures:</strong> 2 absences → Warning 1, 3 → Warning 2, more than 3 → barred from the final exam.
        <strong>Labs:</strong> 1 → Warning 1, 2 → Warning 2, 3 → barred. An absence counts 1 hour after its session ends; one with an absence notice waiting for your decision is held.</p>
      <div class="at-card wn-set"><h3>How Warnings Are Sent</h3>
        <div class="at-fs at-radios" role="radiogroup" aria-label="Sending mode">
          <label><input type="radio" name="wnmode" value="manual"${auto ? "" : " checked"}><span><strong>Manual.</strong> Due emails wait below until you send them.</span></label>
          <label><input type="radio" name="wnmode" value="auto"${auto ? " checked" : ""}><span><strong>Automatic.</strong> The script checks once a day and sends due emails by itself.</span></label></div>
        <p class="small-note">${last ? `Your script last checked ${C.fmtStamp(meta.lastRun)}${meta.lastSent ? ` and sent ${meta.lastSent} email${meta.lastSent === 1 ? "" : "s"}` : ""}.` : `Your script hasn't checked yet. Set it up once with the steps at the top of <a href="apps-script/warnings.gs" target="_blank" rel="noopener">apps-script/warnings.gs</a>.`}
          ${meta.lastError ? `<br><span class="at-warn">Last error: ${esc(meta.lastError)}</span>` : ""}</p>
        <div class="acc-row"><button type="button" class="btn small" data-wrun${asked > last ? " disabled" : ""}>${asked > last ? "Check requested…" : "Run check now"}</button>
          <span class="small-note">${asked > last ? "Your script counts the absences within 5 minutes; this page updates by itself." : "Counts everyone's absences and updates the list below. Run it after you close a session or decide absence notices."}</span></div>
        <div class="acc-row"><button type="button" class="btn ghost small" data-wtest>Send a test to me</button>
          <span class="small-note">${tAt && (!tDone || tDone < tAt) ? "Test requested: one sample of each email reaches your inbox within 5 minutes." : tDone ? `Last test sent ${C.fmtStamp(meta.testDone)}.` : ""}</span></div></div>
      ${prevIt ? `<div class="at-card wn-prev"><div class="at-head"><h3>Preview</h3><button type="button" class="btn ghost small" data-wclose>Close preview</button></div>
        <p class="small-note"><strong>Subject:</strong> ${esc(prevIt.subject)}</p><iframe title="Email preview" sandbox="" class="wn-frame"></iframe></div>` : ""}
      <div class="adm-tools">${[["due", `Due (${due.length})`], ["all", "All students"], ["log", `Sent (${hist.length})`]].map(([v, l]) => `<button type="button" class="chip-btn" data-wview="${v}" aria-pressed="${st.view === v}">${l}</button>`).join("")}</div>
      ${st.view === "due" ? dueView(due, auto) : st.view === "all" ? allView(roster, byEmail) : logView(hist)}
      <p class="small-note wn-msg" aria-live="polite">${esc(st.msg)}</p>`;
    if (prevIt) root.querySelector(".wn-frame").srcdoc = prevIt.html || `<pre>${esc(prevIt.text || "")}</pre>`;
  }

  function dueView(due, auto) {
    if (!due.length) return `<p class="adm-empty">No warnings due right now.</p>`;
    return `${auto ? `<p class="small-note">Automatic mode: these go out at the next check.</p>` : ""}
      <div class="adm-tools"><label class="wn-all"><input type="checkbox" data-wall${due.every((w) => st.sel.has(w.id)) ? " checked" : ""}> Select all</label>
        <button type="button" class="btn small" data-wsend>Send selected</button><button type="button" class="btn ghost small" data-wsendall>Send all (${due.length})</button>
        <button type="button" class="btn ghost small" data-wskip>Mark selected as sent</button></div>
      <div class="adm-scroll"><table class="adm wn-due"><thead><tr><th scope="col"><span class="vh">Select</span></th><th scope="col">Student</th><th scope="col">Absences</th><th scope="col">Due</th><th scope="col">RPS</th></tr></thead><tbody>
      ${due.map((w) => { const q = (w.due || []).every((i) => (w.go || []).includes(i.key));
        return `<tr data-wid="${esc(w.id)}"><td><input type="checkbox" data-wsel aria-label="Select ${esc(w.name)}"${st.sel.has(w.id) ? " checked" : ""}></td>
          <td>${C.profileLink(w.email, w.name)}<br><small>${esc(w.matric)}</small></td>
          <td><small>Lectures ${(w.counts || {}).lecture || 0} · Labs ${(w.counts || {}).lab || 0}</small></td>
          <td>${(w.due || []).map((i) => `<div class="wn-item">${pill(i)} <button type="button" class="btn ghost small" data-wprev="${esc(i.key)}">Preview</button></div>`).join("")}${q ? `<small class="wn-q">Queued: sends within 5 minutes</small>` : ""}</td>
          <td><small>${esc(w.rps || "–")}<br>${w.rpsEmail ? esc(w.rpsEmail) : `<span class="at-warn">No RPS email</span>`}</small></td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function allView(roster, byEmail) {
    return `<div class="adm-scroll"><table class="adm wn-allt"><thead><tr><th scope="col">Student</th><th scope="col">Lecture absences</th><th scope="col">Lab absences</th><th scope="col">Lectures: sent</th><th scope="col">Labs: sent</th></tr></thead><tbody>
      ${roster.map((r) => { const w = byEmail[r.id], c = (w && w.counts) || {};
        return `<tr><td>${C.profileLink(r.id, r.name)}<br><small>${esc(r.matric)}</small></td><td>${c.lecture || 0}</td><td>${c.lab || 0}</td><td>${levelText(w, "lecture")}</td><td>${levelText(w, "lab")}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="small-note">Counted by your script at its last check: absences without an approved reason, from sessions that ended over an hour ago.</p>`;
  }
  function logView(hist) {
    if (!hist.length) return `<p class="adm-empty">No warnings sent yet.</p>`;
    return `<div class="adm-scroll"><table class="adm"><thead><tr><th scope="col">When</th><th scope="col">Student</th><th scope="col">Email</th><th scope="col">To</th></tr></thead><tbody>
      ${hist.map((h) => `<tr><td><small>${C.fmtStamp(h.at)}</small></td><td>${C.profileLink(h.w.email, h.w.name)}</td><td>${pill(h)}${h.mailed ? "" : ` <small>(marked as sent, no email)</small>`}</td><td><small>${h.mailed ? `Student, RPS${h.rpsEmail ? ` (${esc(h.rpsEmail)})` : ""}, you` : "–"}</small></td></tr>`).join("")}</tbody></table></div>`;
  }

  // send (or mark as sent) every due email of these students
  async function queue(ids, field) {
    const list = W.filter((w) => ids.includes(w.id) && (w.due || []).length);
    if (!list.length) { st.msg = "Select at least one student first."; rerender(); return; }
    const n = list.reduce((a, w) => a + w.due.length, 0);
    if (!confirm(field === "go" ? `Send ${n} email${n === 1 ? "" : "s"} to ${list.length} student${list.length === 1 ? "" : "s"} and their RPS? They go out within 5 minutes.` : `Mark ${n} email${n === 1 ? "" : "s"} as sent without emailing? Use this for students you've already told.`)) return;
    try {
      const b = C.db.batch();
      list.forEach((w) => b.update(C.db.collection("warnings").doc(w.id), { [field]: w.due.map((i) => i.key) }));
      b.set(C.db.collection("meta").doc("warnings"), { poke: C.FV.serverTimestamp() }, { merge: true });   // the script's next run acts on it
      await b.commit();
      st.sel.clear();
      st.msg = field === "go" ? "Queued: your script sends them within 5 minutes." : "Marked: your script records them at its next check (within 5 minutes).";
    } catch (e) { st.msg = `Could not save (${e.code || e}). If this says permission-denied, publish the latest firebase/firestore.rules.`; }
    rerender();
  }
  const rerender = () => { const b = document.querySelector(".wn-root"); if (b) render(b.parentNode); };

  let bound = null;
  function bind(body) {
    if (bound === body) return;
    bound = body;
    body.addEventListener("click", async (e) => {
      const t = e.target;
      if (!t.closest(".wn-root")) return;
      const row = t.closest("[data-wid]");
      if (t.closest("[data-wview]")) { st.view = t.closest("[data-wview]").dataset.wview; rerender(); return; }
      if (t.closest("[data-wprev]")) { st.prev = { id: row.dataset.wid, key: t.closest("[data-wprev]").dataset.wprev }; rerender(); const p = document.querySelector(".wn-prev"); if (p) p.scrollIntoView({ block: "start" }); return; }
      if (t.closest("[data-wclose]")) { st.prev = null; rerender(); return; }
      if (t.closest("[data-wsend]")) return queue([...st.sel], "go");
      if (t.closest("[data-wsendall]")) return queue(W.filter((w) => w.hasDue).map((w) => w.id), "go");
      if (t.closest("[data-wskip]")) return queue([...st.sel], "skip");
      if (t.closest("[data-wrun]")) {
        try { await C.db.collection("meta").doc("warnings").set({ runAt: C.FV.serverTimestamp() }, { merge: true }); st.msg = ""; }
        catch (ex) { st.msg = `Could not save (${ex.code || ex}).`; }
        rerender(); return;
      }
      if (t.closest("[data-wtest]")) {
        try { await C.db.collection("meta").doc("warnings").set({ testAt: C.FV.serverTimestamp() }, { merge: true }); st.msg = "Test requested."; }
        catch (ex) { st.msg = `Could not save (${ex.code || ex}).`; }
        rerender();
      }
    });
    body.addEventListener("change", async (e) => {
      const t = e.target;
      if (!t.closest(".wn-root")) return;
      if (t.matches("[data-wsel]")) { const id = t.closest("[data-wid]").dataset.wid; if (t.checked) st.sel.add(id); else st.sel.delete(id); rerender(); }
      if (t.matches("[data-wall]")) { W.filter((w) => w.hasDue).forEach((w) => (t.checked ? st.sel.add(w.id) : st.sel.delete(w.id))); rerender(); }
      if (t.matches("input[name=wnmode]")) {
        const auto = t.value === "auto", n = W.reduce((a, w) => a + (w.hasDue ? (w.due || []).length : 0), 0);
        if (auto && !confirm(`Switch to Automatic? Every due warning is emailed at the next check${n ? `, including the ${n} waiting now` : ""}.`)) { rerender(); return; }
        try { await C.db.collection("meta").doc("warnings").set({ mode: auto ? "auto" : "manual" }, { merge: true }); }
        catch (ex) { st.msg = `Could not save (${ex.code || ex}).`; rerender(); }
      }
    });
  }

  window.NMKWarnings = {
    draw(body, ctx) {
      C = ctx;
      if (!unsub) {
        unsub = C.db.collection("warnings").where("semester", "==", C.SEM).onSnapshot((q) => { W = q.docs.map((d) => Object.assign({ id: d.id }, d.data())); rerender(); },
          (e) => { const b = document.querySelector(".wn-root"); if (b) b.innerHTML = `<p class="small-note">Could not load the warnings (${esc(e.code || e)}). If this says permission-denied, publish the latest firebase/firestore.rules.</p>`; });
        unsubM = C.db.collection("meta").doc("warnings").onSnapshot((d) => {
          meta = d.exists ? d.data() : {};
          // the script reads the semester from here; Manual is the default
          if (!wroteMeta && (meta.semester !== C.SEM || meta.semSlug !== C.semSlug || !meta.mode)) {
            wroteMeta = true;
            C.db.collection("meta").doc("warnings").set(Object.assign({ semester: C.SEM, semSlug: C.semSlug }, meta.mode ? {} : { mode: "manual" }), { merge: true }).catch((e) => console.warn("NMK warnings:", e.code || e));
          }
          rerender();
        }, () => { meta = {}; rerender(); });
      }
      bind(body);
      render(body);
    }
  };
})();
