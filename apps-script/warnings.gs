/* NMK42003 attendance warnings: emails a student and their RPS (Rakan Pendamping Siswa) when the student keeps missing
   lectures or labs, with a copy (Bcc) to the lecturer. It runs in the same Apps Script project as notices.gs, on the
   same 5-minute timer (moveDocuments calls checkWarnings at the end), in the lecturer's own Google account, so the
   emails come from the lecturer's address with the sender name "NMK42003 Automated Notifications".

   Rules (absences without an approved reason):
     Lectures: 2 → Attendance Warning 1, 3 → Attendance Warning 2, more than 3 → Barring Notification (final exam)
     Labs:     1 → Attendance Warning 1, 2 → Attendance Warning 2, 3 → Barring Notification (final exam)
   An absence counts 1 hour after its session ends. An absence with an absence notice still waiting for the lecturer's
   decision is held until the lecturer decides. Each level is emailed once, in order (a student who is already at
   level 2 gets Warning 1, then Warning 2). If an approved notice brings the count below a level already emailed, a
   "Warning Withdrawn" email tells the student and the RPS; reaching that level again emails it again.

   Attendance Advisory (excused absences, lecturer's choice 13 Nov 2026): never leads to barring; it tells the student
   and the RPS that the student has missed several sessions WITH valid reasons (Excused):
     Lectures: 2 excused -> Attendance Advisory 1, 4 -> Attendance Advisory 2
     Labs:     2 excused -> Attendance Advisory 1, 3 -> Attendance Advisory 2
   Every email: To the student, Cc the RPS and the teaching team (meta/warnings.cc, set on the Warnings tab), Bcc the
   lecturer, with the supporting documents of the sessions it lists attached (from the Drive folder; up to about 18 MB).

   Manual mode (the default, chosen on the website: Attendance > Warnings): the due emails wait on the Warnings tab
   until the lecturer presses Send (or Mark as sent). Automatic mode: they go out at the next check.

   Set up once, in the project that already runs notices.gs:
   1. Add a script file (+ > Script), name it "warnings", and paste this file into it.
   2. Replace notices.gs with the latest apps-script/notices.gs, and appsscript.json with the latest
      apps-script/notices.appsscript.json (it adds permission to send email).
   3. Choose "setup" at the top and press Run; allow access (Google asks once, for sending email).
   4. On the website: Attendance > Warnings > "Send a test to me" and check your inbox. */

const SITE = "https://zamrizahir88.github.io/nmk42003/";
const SENDER = "NMK42003 Automated Notifications";
const COORDINATOR = "Ts. Dr. Mohd Zamri Bin Zahir Ahmad";
const RULES = { lecture: [2, 3, 4], lab: [1, 2, 3] };
const KINDS = { lecture: { one: "lecture", many: "lectures", title: "Lectures", abs: "Lecture absences" }, lab: { one: "lab session", many: "lab sessions", title: "Labs", abs: "Lab absences" } };
const LEVELS = { 1: "Attendance Warning 1", 2: "Attendance Warning 2", 3: "Barring Notification" };
const LADDER = { lecture: ["2 absences", "3 absences", "More than 3"], lab: ["1 absence", "2 absences", "3 absences"] };
const ADV_RULES = { lecture: [2, 4], lab: [2, 3] };
const ADV_LEVELS = { 1: "Attendance Advisory 1", 2: "Attendance Advisory 2" };
const ADV_LADDER = { lecture: ["2 excused", "4 excused"], lab: ["2 excused", "3 excused"] };
const ATTACH_MAX = 18 * 1024 * 1024;   // Gmail allows 25 MB per email; leave room for the message itself
const REASON = { mc: "Medical (MC)", family: "Family emergency", official: "Official university activity", other: "Other" };
const SECTION = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
const WAIT_MS = 60 * 60 * 1000, MAX_SEND = 40;
// The full check reads every session, notice and attendance record (thousands of reads), and Firestore's free plan
// allows 50,000 reads a day, so it runs only when asked: "Run check now" on the Warnings tab (meta/warnings.runAt),
// or Send / Mark as sent (meta/warnings.poke). In Automatic mode it also runs once a day by itself. Every other
// 5-minute run reads one document (meta/warnings).
const AUTO_EVERY_MS = 24 * 60 * 60 * 1000;

/* ---------- Firestore (REST, with the lecturer's own access) ---------- */
function val_(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val_);
  if ("mapValue" in v) return obj_(v.mapValue.fields || {});
  return null;
}
function obj_(f) { const o = {}; Object.keys(f || {}).forEach((k) => { o[k] = val_(f[k]); }); return o; }
function fs_(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(fs_) } };
  if (typeof x === "object") { const f = {}; Object.keys(x).forEach((k) => { f[k] = fs_(x[k]); }); return { mapValue: { fields: f } }; }
  return { stringValue: String(x) };
}
function getDoc_(path) { const d = api("get", path); return d ? obj_(d.fields) : null; }
function listAll_(coll) {
  let out = [], tok = "";
  do {
    const r = api("get", coll + "?pageSize=300" + (tok ? "&pageToken=" + encodeURIComponent(tok) : "")) || {};
    out = out.concat(r.documents || []);
    tok = r.nextPageToken || "";
  } while (tok);
  return out.map((d) => Object.assign({ id: idOf(d) }, obj_(d.fields)));
}
function patch_(path, data) {
  const keys = Object.keys(data), fields = {};
  keys.forEach((k) => { fields[k] = fs_(data[k]); });
  api("patch", path + "?" + keys.map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&"), { fields: fields });
}

/* ---------- working out who is due ---------- */
const endMs_ = (s) => Date.parse(s.date + "T" + (s.end || "23:59") + ":00+08:00");
const levelOf_ = (kind, n) => RULES[kind].filter((t) => n >= t).length;
const advLevelOf_ = (kind, n) => ADV_RULES[kind].filter((t) => n >= t).length;
// the Cc line: the RPS and the teaching team (meta/warnings.cc: a list, or text with commas); never the student, no repeats
function ccList_(meta, r) {
  const team = Array.isArray(meta.cc) ? meta.cc : String(meta.cc || "").split(/[,;\s]+/);
  const seen = {}, out = [];
  [r.rpsEmail || ""].concat(team).forEach((e) => {
    e = String(e || "").trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e !== String(r.id).toLowerCase() && !seen[e]) { seen[e] = 1; out.push(e); }
  });
  return out.join(",");
}
// the supporting documents of the sessions an email lists (absence notices whose file is already in the Drive folder)
function attachments_(it, r, notices) {
  const sids = it.type === "withdraw" ? it.gone || [] : it.sessions || [], files = [], left = [];
  let size = 0;
  sids.forEach((sid) => {
    const n = notices[sid + "_" + r.id], d = n && n.doc;
    if (!d || !d.id) return;
    try {
      const blob = DriveApp.getFileById(d.id).getBlob(), b = blob.getBytes().length;
      if (size + b > ATTACH_MAX) { left.push(d.name || "document"); return; }
      size += b;
      files.push(blob.setName(d.name || blob.getName()));
    } catch (e) { left.push((d.name || "document") + " (could not be opened)"); }
  });
  return { files: files, left: left };
}

function checkWarnings() {
  const meta = getDoc_("meta/warnings");
  if (!meta || !meta.semester || !meta.semSlug) return;   // the Warnings tab sets these when a lecturer first opens it
  const sem = meta.semester, auto = meta.mode === "auto", now = Date.now(), me = Session.getEffectiveUser().getEmail();
  if (meta.testAt && (!meta.testDone || Date.parse(meta.testDone) < Date.parse(meta.testAt))) {
    sendTests_(me);
    patch_("meta/warnings", { testDone: new Date() });
  }
  const last = meta.lastRun ? Date.parse(meta.lastRun) : 0, asked = Math.max(meta.runAt ? Date.parse(meta.runAt) : 0, meta.poke ? Date.parse(meta.poke) : 0);
  if (!(asked > last) && !(auto && now - last >= AUTO_EVERY_MS)) return;
  const sessions = {};
  listAll_("sessions").forEach((s) => { if (s.semester === sem) sessions[s.id] = s; });
  const notices = {};
  listAll_("notices").forEach((n) => { notices[n.id] = n; });
  // a lab session the student swapped out of (after it closed) never counts
  const moved = {};
  listAll_("labMoves").forEach((m) => { if (m.semester === sem) moved[m.slot + "_" + m.email] = m.section; });
  const slotOf_ = (s) => s.slot || ((s.id.match(/-(w\d\d-lab)-(mon|wed|thu)$/) || [])[1]) || "";
  // absences that count: the session ended over an hour ago, and no notice is waiting for a decision
  const absent = {}, excused = {}, marks = {}, remarks = {};
  const att = listAll_("attendance");
  att.forEach((a) => { marks[a.session + "_" + a.email] = a.status; remarks[a.session + "_" + a.email] = a.remark || ""; });
  // excused absences (for the Attendance Advisory): the same timing and swap rules as absences
  att.forEach((a) => {
    const s = sessions[a.session];
    if (a.status !== "E" || !s || s.state === "planned" || endMs_(s) + WAIT_MS > now) return;
    if (s.kind === "lab" && moved[slotOf_(s) + "_" + a.email] && moved[slotOf_(s) + "_" + a.email] !== s.section) return;
    (excused[a.email] = excused[a.email] || []).push(s);
  });
  att.forEach((a) => {
    const s = sessions[a.session];
    if (a.status !== "A" || !s || s.state === "planned" || endMs_(s) + WAIT_MS > now) return;
    const nt = notices[a.session + "_" + a.email];
    if (nt && nt.status === "pending") return;
    if (s.kind === "lab" && moved[slotOf_(s) + "_" + a.email] && moved[slotOf_(s) + "_" + a.email] !== s.section) return;
    (absent[a.email] = absent[a.email] || []).push(s);
  });
  const old = {};
  listAll_("warnings").forEach((w) => { old[w.id] = w; });
  let sent = 0;
  listAll_("roster").filter((r) => r.status === "active").forEach((r) => {
    const id = meta.semSlug + "_" + r.id, w = old[id] || {}, st = w.sent || {}, adv = w.adv || {}, hist = w.history || [], go = w.go || [], skip = w.skip || [];
    const counts = {}, ecounts = {}, due = [];
    ["lecture", "lab"].forEach((k) => {
      const list = (absent[r.id] || []).filter((s) => s.kind === k).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
      const cur = levelOf_(k, list.length), was = (st[k] || {}).level || 0;
      counts[k] = list.length;
      if (cur > was) for (let L = was + 1; L <= cur; L++) due.push({ key: k + "-warn-" + L, kind: k, type: "warn", level: L, to: L, sessions: list.slice(0, RULES[k][L - 1]).map((s) => s.id) });
      else if (cur < was) due.push({ key: k + "-withdraw-" + was + "-" + cur, kind: k, type: "withdraw", level: was, to: cur, sessions: list.map((s) => s.id),
        gone: ((st[k] || {}).sessions || []).filter((sid) => !list.some((s) => s.id === sid)) });
      // the Attendance Advisory: excused absences, upward only (no "withdrawn" email for advisories)
      const elist = (excused[r.id] || []).filter((s) => s.kind === k).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
      const ecur = advLevelOf_(k, elist.length), ewas = (adv[k] || {}).level || 0;
      ecounts[k] = elist.length;
      if (ecur > ewas) for (let L = ewas + 1; L <= ecur; L++) due.push({ key: k + "-adv-" + L, kind: k, type: "advise", level: L, to: L, sessions: elist.slice(0, ADV_RULES[k][L - 1]).map((s) => s.id) });
    });
    due.forEach((it) => Object.assign(it, it.type === "advise" ? buildAdv_(r, it, sessions, notices, remarks) : build_(r, it, sessions, notices, counts, marks)));
    const keep = [], held = {}, cc = ccList_(meta, r);
    due.forEach((it) => {
      const hk = (it.type === "advise" ? "adv-" : "") + it.kind;   // warnings and advisories queue separately
      const skipIt = skip.indexOf(it.key) >= 0, sendIt = !skipIt && (auto || go.indexOf(it.key) >= 0) && sent < MAX_SEND;
      if (held[hk] || (!skipIt && !sendIt)) { held[hk] = true; keep.push(it); return; }
      if (sendIt) {
        const at = attachments_(it, r, notices);
        const extraH = at.left.length ? '<p style="font-size:12px;color:#6b7686;margin:8px 0;text-align:center;">Not attached (too large for one email; kept in the lecturer\'s Drive folder): ' + at.left.map(esc_).join(", ") + "</p>" : "";
        const extraT = at.left.length ? "\n\nNot attached (too large for one email; kept in the lecturer's Drive folder): " + at.left.join(", ") : "";
        MailApp.sendEmail({ to: r.id, cc: cc, bcc: me, subject: it.subject, body: it.text + extraT, htmlBody: it.html + extraH, name: SENDER, attachments: at.files });
        sent++;
      }
      if (it.type === "advise") adv[it.kind] = { level: it.to, sessions: it.sessions };
      else st[it.kind] = { level: it.to, sessions: it.sessions };
      hist.push({ kind: it.kind, type: it.type, level: it.level, to: it.to, count: it.type === "advise" ? ecounts[it.kind] : counts[it.kind], at: new Date(), mailed: sendIt, rpsEmail: r.rpsEmail || "", cc: sendIt ? cc : "" });
    });
    if (!old[id] && !keep.length && !hist.length && !counts.lecture && !counts.lab && !ecounts.lecture && !ecounts.lab) return;
    const next = { semester: sem, email: r.id, name: r.name || "", matric: String(r.matric || ""), rps: r.rps || "", rpsEmail: r.rpsEmail || "",
      counts: counts, ecounts: ecounts, sent: st, adv: adv, due: keep, hasDue: keep.length > 0, history: hist, go: go.filter((k) => keep.some((i) => i.key === k)), skip: [] };
    const sig = (x) => JSON.stringify([x.name, x.rpsEmail, x.counts, x.ecounts || {}, x.sent, x.adv || {}, (x.due || []).map((i) => [i.key, i.sessions, i.subject, i.html]), x.hasDue, (x.history || []).length, x.go || [], x.skip || []]);
    if (sig(next) !== sig(w)) { next.updatedAt = new Date(); patch_("warnings/" + encodeURIComponent(id), next); }
  });
  patch_("meta/warnings", { lastRun: new Date(), lastSent: sent, lastError: "" });
}

/* ---------- the emails ---------- */
const esc_ = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day_ = (iso) => { const d = new Date(iso + "T00:00:00Z"); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); };
const COLORS = { 1: ["#fdf1d8", "#7a4b00", "#e8b04b"], 2: ["#fde4cf", "#8a3b00", "#f0995a"], 3: ["#fbe0e0", "#8f1d1d", "#e26d6d"], w: ["#dff3ef", "#0b5d55", "#5fb3a8"],
  a1: ["#e3eefb", "#1d4f8f", "#7fa8dc"], a2: ["#dfe5f7", "#28367f", "#7f8fd6"] };
const pill_ = (c, text) => '<span style="font-family:Arial,Helvetica,sans-serif;display:inline-block;background:' + c[0] + ";color:" + c[1] + ";border:1px solid " + c[2] + ';font-size:12px;font-weight:bold;padding:4px 10px;border-radius:999px;">' + esc_(text) + "</span>";

/* ---------- the email layout (phone-first, 13 Nov 2026): one centred column up to 600 px, nothing side by side, so it fits a
   320 px phone without sideways scrolling; inline styles and tables only (what Gmail and Outlook keep) ---------- */
const MF = "font-family:Arial,Helvetica,sans-serif;";
const MC = { navy: "#14213d", teal: "#0f766e", ink: "#1b2a4a", ink2: "#4a5568", mute: "#6b7686", rule: "#e3e7ee", page: "#eef1f5" };
const MT = { w1: ["#fdf1d8", "#7a4b00", "#e8b04b"], w2: ["#fde4cf", "#8a3b00", "#f0995a"], w3: ["#fbe0e0", "#8f1d1d", "#e26d6d"], ok: ["#dff3ef", "#0b5d55", "#5fb3a8"],
  a1: ["#e3eefb", "#1d4f8f", "#7fa8dc"], a2: ["#dfe5f7", "#28367f", "#7f8fd6"], off: ["#f6f7f9", "#8a94a3", "#e3e7ee"] };
const mailP_ = (html, extra) => '<p style="' + MF + "margin:14px 0 0;font-size:15px;line-height:1.6;color:" + MC.ink2 + ";" + (extra || "") + '">' + html + "</p>";
const mailRole_ = (who, html) => mailP_('<b style="color:' + MC.ink + ';">' + who + ":</b> " + html);
const mailCircled_ = (k) => ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"][k - 1] || k + ".";
const mailLabel_ = (t, top) => '<div style="' + MF + "font-size:12px;letter-spacing:1px;text-transform:uppercase;color:" + MC.mute + ";font-weight:bold;margin:" + (top || 18) + 'px 0 6px;">' + esc_(t) + "</div>";
function mailCard_(k, s, lines, edge) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid ' + MC.rule + ";border-left:4px solid " + edge + ';border-radius:8px;border-collapse:separate;"><tr><td style="padding:10px 12px;">'
    + '<div style="' + MF + "font-size:13px;color:" + MC.mute + ';font-weight:bold;">' + mailCircled_(k) + " " + day_(s.date) + "</div>"
    + '<div style="' + MF + "font-size:15px;color:" + MC.ink + ';font-weight:bold;margin-top:2px;line-height:1.4;word-break:break-word;">' + esc_(s.title) + "</div>"
    + lines.map((x) => '<div style="' + MF + "font-size:14px;color:" + MC.ink2 + ';margin-top:4px;line-height:1.5;word-break:break-word;"><span style="color:' + MC.mute + ';">' + esc_(x[0]) + ":</span> " + x[1] + "</div>").join("")
    + "</td></tr></table>";
}
function mailLadder_(steps, now, title) {
  return mailLabel_(title, 20) + steps.map((st, i) => {
    const L = i + 1, t = L <= now ? MT[st[2]] : MT.off;
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;background:' + t[0] + ";border:1px solid " + t[2] + ';border-radius:8px;border-collapse:separate;"><tr>'
      + '<td width="28" style="padding:10px 0 10px 12px;vertical-align:middle;"><div style="width:14px;height:14px;border-radius:50%;background:' + (L <= now ? t[1] : "#ffffff") + ";border:2px solid " + t[1] + ';"></div></td>'
      + '<td style="padding:10px 12px 10px 6px;' + MF + "font-size:14px;color:" + t[1] + ";" + (L <= now ? "font-weight:bold;" : "") + '">' + esc_(st[0]) + ' <span style="font-weight:normal;">· ' + esc_(st[1]) + "</span>"
      + (L === now ? ' <span style="display:inline-block;background:' + t[1] + ';color:#ffffff;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;margin-left:4px;">NOW</span>' : "") + "</td></tr></table>";
  }).join("");
}
const mailButton_ = (href, text) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;"><tr><td style="background:' + MC.teal + ';border-radius:8px;text-align:center;">'
  + '<a href="' + href + '" style="' + MF + 'display:block;padding:14px 16px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">' + esc_(text) + "</a></td></tr></table>";
const mailFacts_ = (list) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-top:1px solid ' + MC.rule + ';">' + list.map((x) =>
  '<tr><td style="padding:8px 0;border-bottom:1px solid ' + MC.rule + ';"><div style="' + MF + "font-size:12px;color:" + MC.mute + ';">' + esc_(x[0]) + '</div><div style="' + MF + "font-size:15px;color:" + MC.ink + ';margin-top:2px;word-break:break-word;">' + esc_(x[1]) + "</div></td></tr>").join("") + "</table>";
function mailShell_(o) {
  return '<div style="margin:0;padding:0;background:' + MC.page + ';"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + MC.page + ';"><tr><td align="center" style="padding:12px 8px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #d6dbe3;border-radius:12px;border-collapse:separate;">'
    + '<tr><td style="background:' + MC.navy + ';padding:18px 18px 16px;border-radius:12px 12px 0 0;">'
    + '<div style="' + MF + 'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9fd6cf;font-weight:bold;">' + esc_(o.kicker) + "</div>"
    + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;color:#ffffff;margin-top:4px;">NMK42003 Instrumentation</div>'
    + '<div style="' + MF + 'font-size:12px;color:#c9d6e8;margin-top:2px;">Faculty of Electronic Engineering &amp; Technology, UniMAP</div></td></tr>'
    + '<tr><td style="height:4px;line-height:4px;font-size:0;background:' + o.accent + ';">&nbsp;</td></tr>'
    + '<tr><td style="padding:20px 18px 6px;">' + o.badge
    + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:23px;line-height:1.25;color:' + MC.ink + ';margin:12px 0 0;">' + esc_(o.title) + "</div>"
    + mailP_(o.lead, "margin-top:8px;") + mailFacts_(o.facts) + (o.sessionsTitle ? mailLabel_(o.sessionsTitle) : "") + o.sessions + (o.after || "") + o.ladder + o.student + o.rps + "</td></tr>"
    + '<tr><td style="padding:16px 18px 18px;background:#f3f6f9;border-top:1px solid ' + MC.rule + ';border-radius:0 0 12px 12px;"><div style="' + MF + "font-size:12px;line-height:1.6;color:" + MC.mute + ';">This is an automated message from the NMK42003 Instrumentation course website: <a href="' + SITE + '" style="color:' + MC.teal + ';word-break:break-all;">' + SITE.replace(/^https:\/\//, "").replace(/\/$/, "") + "</a><br>Course coordinator: " + COORDINATOR + "</div></td></tr>"
    + "</table></td></tr></table></div>";
}

function build_(r, it, sessions, notices, counts, marks) {
  marks = marks || {};
  const K = KINDS[it.kind], name = r.name || r.id, matric = String(r.matric || ""), withdraw = it.type === "withdraw";
  const list = (withdraw ? it.gone : it.sessions).map((sid) => sessions[sid]).filter(Boolean);
  const n = withdraw ? counts[it.kind] : it.sessions.length;
  const head = withdraw ? "Warning Withdrawn" : LEVELS[it.level];
  const subject = "[NMK42003] " + (withdraw ? LEVELS[it.level] + " (" + K.title + ") Withdrawn" : LEVELS[it.level] + " (" + K.title + ")") + ": " + name + ", " + matric;
  const badge = withdraw ? pill_(COLORS.w, "Warning withdrawn · " + K.title) : pill_(COLORS[it.level], (it.level === 3 ? "Barring notification" : (it.level === 1 ? "1st" : "2nd") + " warning") + " · " + K.title);
  let lead, leadT;
  if (withdraw) {
    const checked = list.length && list.every((s) => ["P", "L"].indexOf(marks[s.id + "_" + r.id]) >= 0);
    const why = checked ? "The absence below has changed: the student checked in when the lecturer opened attendance again, so it no longer counts."
      : "The lecturer approved the absence notice below, so that absence is now Excused and no longer counts.";
    lead = esc_(LEVELS[it.level]) + " (" + K.title + ") for " + esc_(name) + " is <b>withdrawn</b>. " + esc_(why);
    leadT = LEVELS[it.level] + " (" + K.title + ") for " + name + " is withdrawn. " + why;
  } else if (it.level === 3) {
    lead = esc_(name) + " has been absent from <b>" + n + " " + K.many + "</b> without an approved reason and is <b>barred from the final examination</b> of NMK42003 Instrumentation.";
    leadT = name + " has been absent from " + n + " " + K.many + " without an approved reason and is barred from the final examination of NMK42003 Instrumentation.";
  } else {
    const next = it.level === 1 ? "Attendance Warning 2" : "barring from the final examination";
    lead = esc_(name) + " has been absent from <b>" + n + " " + (n === 1 ? K.one : K.many) + "</b> without an approved reason. One more absence leads to " + next + ".";
    leadT = name + " has been absent from " + n + " " + (n === 1 ? K.one : K.many) + " without an approved reason. One more absence leads to " + next + ".";
  }
  const sec = r.section ? SECTION[r.section] + (r.group ? ", Group " + r.group : "") : "";
  const facts = [["Student", name], ["Matric", matric], ["Programme", r.programme || ""], ["Lab section", sec], ["RPS", r.rps || ""]].filter((x) => x[1]);
  // phone-first layout (13 Nov 2026): one column, cards for the sessions, the levels stacked (mailShell_ and friends)
  const tone = withdraw ? "ok" : "w" + it.level;
  const cards = list.map((s, i) => {
    if (!withdraw) return mailCard_(i + 1, s, [], MT[tone][2]);
    const nt = notices[s.id + "_" + r.id] || {}, m = marks[s.id + "_" + r.id];
    const why = ["P", "L"].indexOf(m) >= 0 ? "Checked in (" + (m === "L" ? "Late" : "Present") + ")"
      : nt.status === "approved" ? "<b>" + esc_(REASON[nt.reason] || nt.reason || "") + "</b>: " + esc_(nt.detail || "") : "Changed to Excused by the lecturer";
    return mailCard_(i + 1, s, [["Reason and explanation", why]], MT[tone][2]);
  }).join("");
  const now = withdraw ? it.to : it.level;
  const steps = [1, 2, 3].map((L) => [L === 3 ? "Barred from final exam" : L === 1 ? "1st warning" : "2nd warning", LADDER[it.kind][L - 1], "w" + L]);
  const student = withdraw ? mailRole_("Student", "no action is needed for this absence.")
    : mailRole_("Student", "if you have a valid reason for an absence (medical, family emergency or an official university activity), send an absence notice with your supporting document on the course website. Once your lecturer approves it, the absence changes to Excused and no longer counts. Without an approved notice, the absence stands.")
      + mailButton_(SITE + "attendance.html", "Student: open your attendance");
  const rps = mailRole_("RPS", "you are receiving this as the student's Rakan Pendamping Siswa (RPS). " + (withdraw ? "This is for your information." : it.level === 3 ? "Kindly advise the student, and contact the course coordinator if you have any questions." : "Kindly advise the student."));
  const after = withdraw ? mailP_(K.abs + " now: <b>" + n + "</b>. " + (it.to ? esc_(LEVELS[it.to]) + " (" + K.title + ") still stands." : "No attendance warning stands now.")) : "";
  const html = mailShell_({ kicker: "Attendance notification", accent: withdraw ? "#0f766e" : MT[tone][2], title: head, badge: badge, lead: lead, facts: facts,
    sessionsTitle: withdraw ? (list.length === 1 ? "Changed session" : "Changed sessions") : "Absent sessions", sessions: cards, after: after,
    ladder: mailLadder_(steps, now, (it.kind === "lab" ? "Lab" : "Lecture") + " attendance levels"), student: student, rps: rps });
  const lines = withdraw
    ? list.map((s) => { const nt = notices[s.id + "_" + r.id] || {}; return "  - " + day_(s.date) + ": " + s.title + " (" + (["P", "L"].indexOf(marks[s.id + "_" + r.id]) >= 0 ? "checked in, " + (marks[s.id + "_" + r.id] === "L" ? "Late" : "Present") : nt.status === "approved" ? (REASON[nt.reason] || nt.reason || "") + ": " + (nt.detail || "") : "changed to Excused by the lecturer") + ")"; })
    : list.map((s, i) => "  " + (i + 1) + ". " + day_(s.date) + ": " + s.title);
  const text = [head + " (" + K.title + ")", "NMK42003 Instrumentation", "", leadT, ""].concat(facts.map((x) => x[0] + ": " + x[1]), [""], lines,
    withdraw ? ["", K.abs + " now: " + n + ". " + (it.to ? LEVELS[it.to] + " (" + K.title + ") still stands." : "No attendance warning stands now.")] : [],
    ["", withdraw ? "Student: no action is needed for this absence." : "Student: if you have a valid reason for an absence (medical, family emergency or an official university activity), send an absence notice with your supporting document on the course website: " + SITE + "attendance.html. Once your lecturer approves it, the absence changes to Excused and no longer counts. Without an approved notice, the absence stands.",
      "", "RPS: you are receiving this as the student's Rakan Pendamping Siswa (RPS). " + (withdraw ? "This is for your information." : "Kindly advise the student."),
      "", "This is an automated message from the NMK42003 Instrumentation course website: " + SITE, "Course coordinator: " + COORDINATOR]).join("\n");
  return { subject: subject, html: html, text: text };
}

// the Attendance Advisory email: excused absences (valid reasons). Information for the student and the RPS, never barring.
function buildAdv_(r, it, sessions, notices, remarks) {
  remarks = remarks || {};
  const K = KINDS[it.kind], name = r.name || r.id, matric = String(r.matric || "");
  const list = (it.sessions || []).map((sid) => sessions[sid]).filter(Boolean), n = list.length;
  const head = ADV_LEVELS[it.level];
  const subject = "[NMK42003] " + head + " (" + K.title + "): " + name + ", " + matric;
  const badge = pill_(COLORS["a" + it.level], "Advisory · " + K.title);
  // each excused session: the reason (approved notice, else the lecturer's remark) and whether a document is on file
  const info = list.map((s) => {
    const nt = notices[s.id + "_" + r.id] || {}, rm = remarks[s.id + "_" + r.id] || "";
    const reason = nt.status === "approved" ? (REASON[nt.reason] || nt.reason || "") + (nt.detail ? ": " + nt.detail : "") : rm || "Excused by the lecturer";
    const doc = nt.doc && nt.doc.id ? "Attached" : nt.doc ? "Received (being filed)" : nt.docLater ? "To follow" : "Not on file";
    return { s: s, reason: reason, doc: doc, official: nt.reason === "official" || /official|university|universiti|sukan|sport|program/i.test(rm) };
  });
  const official = info.filter((x) => x.official).length;
  const lead = esc_(name) + " has been excused from <b>" + n + " " + (n === 1 ? K.one : K.many) + "</b> of NMK42003 Instrumentation. These absences have valid reasons, so they are Excused and do not count towards a warning or barring.";
  const leadT = name + " has been excused from " + n + " " + (n === 1 ? K.one : K.many) + " of NMK42003 Instrumentation. These absences have valid reasons, so they are Excused and do not count towards a warning or barring.";
  const concern = it.level === 2
    ? "Missing this many sessions, even for good reasons, makes it hard to keep up with the course. We encourage the student to plan ahead so that further sessions are not missed."
    : "This advisory is to keep the student and the RPS informed, so that the missed work can be caught up early.";
  const busy = official * 2 >= n && official > 0
    ? "Most of these absences are for official university activities. Please help the student balance these activities with their studies in this course."
    : "";
  const sec = r.section ? SECTION[r.section] + (r.group ? ", Group " + r.group : "") : "";
  const facts = [["Student", name], ["Matric", matric], ["Programme", r.programme || ""], ["Lab section", sec], ["RPS", r.rps || ""]].filter((x) => x[1]);
  // phone-first layout (13 Nov 2026): one column, a card per excused session, the advisory levels stacked
  const cards = info.map((x, i) => mailCard_(i + 1, x.s, [["Reason", esc_(x.reason)], ["Supporting document", esc_(x.doc === "Attached" ? "📎 Attached" : x.doc)]], MT["a" + it.level][2])).join("");
  const steps = [1, 2].map((L) => [ADV_LEVELS[L], ADV_LADDER[it.kind][L - 1], "a" + L]);
  const student = mailRole_("Student", "please catch up on what you missed. The lecture notes, interactive chapters and lab guides are on the course website, and you can ask your lecturer if anything is unclear.")
    + mailButton_(SITE + "chapters.html", "Student: open the course chapters");
  const rps = mailRole_("RPS", "you are receiving this as the student's Rakan Pendamping Siswa (RPS). This is for your information. Kindly advise the student on balancing university activities with their studies.");
  const html = mailShell_({ kicker: "Attendance advisory", accent: "#1d4f8f", title: head, badge: badge, lead: lead, facts: facts,
    sessionsTitle: n === 1 ? "Excused session" : "Excused sessions", sessions: cards, after: mailP_(esc_(concern)) + (busy ? mailP_(esc_(busy)) : ""),
    ladder: mailLadder_(steps, it.level, "Advisory levels (" + K.title.toLowerCase() + ")"), student: student, rps: rps });
  const text = [head + " (" + K.title + ")", "NMK42003 Instrumentation", "", leadT, ""].concat(facts.map((x) => x[0] + ": " + x[1]), [""],
    info.map((x, i) => "  " + (i + 1) + ". " + day_(x.s.date) + ": " + x.s.title + " (" + x.reason + "; document: " + x.doc + ")"),
    ["", concern], busy ? ["", busy] : [],
    ["", "Student: please catch up on what you missed. The lecture notes, interactive chapters and lab guides are on the course website: " + SITE + "chapters.html",
      "", "RPS: you are receiving this as the student's Rakan Pendamping Siswa (RPS). This is for your information. Kindly advise the student on balancing university activities with their studies.",
      "", "This is an automated message from the NMK42003 Instrumentation course website: " + SITE, "Course coordinator: " + COORDINATOR]).join("\n");
  return { subject: subject, html: html, text: text };
}

// "Send a test to me" on the Warnings tab: one of each email, with a made-up student, to the lecturer only
function sendTests_(me) {
  const r = { id: "student@studentmail.unimap.edu.my", name: "SAMPLE STUDENT (TEST)", matric: "000000000", programme: "Electronic Engineering Technology", section: "thu", group: 5, rps: "Sample RPS" };
  const S = { a: { id: "a", date: "2026-10-08", title: "Lecture, week 1: Introduction" }, b: { id: "b", date: "2026-10-15", title: "Lecture, week 2" },
    c: { id: "c", date: "2026-10-15", title: "Lab 1 (Part 1), Thursday section" }, d: { id: "d", date: "2026-10-22", title: "Lab 1 (Part 2), Thursday section" }, e: { id: "e", date: "2026-10-29", title: "Lab 2, Thursday section" } };
  const N = { "e_student@studentmail.unimap.edu.my": { status: "approved", reason: "official", detail: "Represented the university at a sports event; official letter to follow." } };
  [[{ kind: "lecture", type: "warn", level: 1, to: 1, sessions: ["a", "b"] }, { lecture: 2, lab: 0 }],
    [{ kind: "lab", type: "warn", level: 2, to: 2, sessions: ["c", "d"] }, { lecture: 0, lab: 2 }],
    [{ kind: "lab", type: "warn", level: 3, to: 3, sessions: ["c", "d", "e"] }, { lecture: 0, lab: 3 }],
    [{ kind: "lab", type: "withdraw", level: 3, to: 2, sessions: ["c", "d"], gone: ["e"] }, { lecture: 0, lab: 2 }]].forEach((x) => {
    const m = build_(r, x[0], S, N, x[1]);
    MailApp.sendEmail({ to: me, subject: "[TEST] " + m.subject, body: m.text, htmlBody: m.html, name: SENDER });
  });
  const N2 = { "a_student@studentmail.unimap.edu.my": { status: "approved", reason: "official", detail: "University sports carnival (official letter attached)." },
    "b_student@studentmail.unimap.edu.my": { status: "approved", reason: "mc", detail: "Fever, clinic visit." } };
  [{ kind: "lecture", type: "advise", level: 1, to: 1, sessions: ["a", "b"] }, { kind: "lab", type: "advise", level: 2, to: 2, sessions: ["c", "d", "e"] }].forEach((it) => {
    const m = buildAdv_(r, it, S, N2, { "c_student@studentmail.unimap.edu.my": "MC received by email, 15 Oct", "d_student@studentmail.unimap.edu.my": "Official university activity: robotics competition" });
    MailApp.sendEmail({ to: me, subject: "[TEST] " + m.subject, body: m.text, htmlBody: m.html, name: SENDER });
  });
}
