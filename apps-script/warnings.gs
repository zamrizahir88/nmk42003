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
const REASON = { mc: "Medical (MC)", family: "Family emergency", official: "Official university activity", other: "Other" };
const SECTION = { mon: "Monday", wed: "Wednesday", thu: "Thursday" };
const WAIT_MS = 60 * 60 * 1000, MAX_SEND = 40;

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

function checkWarnings() {
  const meta = getDoc_("meta/warnings");
  if (!meta || !meta.semester || !meta.semSlug) return;   // the Warnings tab sets these when a lecturer first opens it
  const sem = meta.semester, auto = meta.mode === "auto", now = Date.now(), me = Session.getEffectiveUser().getEmail();
  if (meta.testAt && (!meta.testDone || Date.parse(meta.testDone) < Date.parse(meta.testAt))) {
    sendTests_(me);
    patch_("meta/warnings", { testDone: new Date() });
  }
  const sessions = {};
  listAll_("sessions").forEach((s) => { if (s.semester === sem) sessions[s.id] = s; });
  const notices = {};
  listAll_("notices").forEach((n) => { notices[n.id] = n; });
  // absences that count: the session ended over an hour ago, and no notice is waiting for a decision
  const absent = {};
  listAll_("attendance").forEach((a) => {
    const s = sessions[a.session];
    if (a.status !== "A" || !s || s.state === "planned" || endMs_(s) + WAIT_MS > now) return;
    const nt = notices[a.session + "_" + a.email];
    if (nt && nt.status === "pending") return;
    (absent[a.email] = absent[a.email] || []).push(s);
  });
  const old = {};
  listAll_("warnings").forEach((w) => { old[w.id] = w; });
  let sent = 0;
  listAll_("roster").filter((r) => r.status === "active").forEach((r) => {
    const id = meta.semSlug + "_" + r.id, w = old[id] || {}, st = w.sent || {}, hist = w.history || [], go = w.go || [], skip = w.skip || [];
    const counts = {}, due = [];
    ["lecture", "lab"].forEach((k) => {
      const list = (absent[r.id] || []).filter((s) => s.kind === k).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
      const cur = levelOf_(k, list.length), was = (st[k] || {}).level || 0;
      counts[k] = list.length;
      if (cur > was) for (let L = was + 1; L <= cur; L++) due.push({ key: k + "-warn-" + L, kind: k, type: "warn", level: L, to: L, sessions: list.slice(0, RULES[k][L - 1]).map((s) => s.id) });
      else if (cur < was) due.push({ key: k + "-withdraw-" + was + "-" + cur, kind: k, type: "withdraw", level: was, to: cur, sessions: list.map((s) => s.id),
        gone: ((st[k] || {}).sessions || []).filter((sid) => !list.some((s) => s.id === sid)) });
    });
    due.forEach((it) => Object.assign(it, build_(r, it, sessions, notices, counts)));
    const keep = [], held = {};
    due.forEach((it) => {
      const skipIt = skip.indexOf(it.key) >= 0, sendIt = !skipIt && (auto || go.indexOf(it.key) >= 0) && sent < MAX_SEND;
      if (held[it.kind] || (!skipIt && !sendIt)) { held[it.kind] = true; keep.push(it); return; }
      if (sendIt) {
        MailApp.sendEmail({ to: r.id, cc: r.rpsEmail || "", bcc: me, subject: it.subject, body: it.text, htmlBody: it.html, name: SENDER });
        sent++;
      }
      st[it.kind] = { level: it.to, sessions: it.sessions };
      hist.push({ kind: it.kind, type: it.type, level: it.level, to: it.to, count: counts[it.kind], at: new Date(), mailed: sendIt, rpsEmail: r.rpsEmail || "" });
    });
    if (!old[id] && !keep.length && !hist.length && !counts.lecture && !counts.lab) return;
    const next = { semester: sem, email: r.id, name: r.name || "", matric: String(r.matric || ""), rps: r.rps || "", rpsEmail: r.rpsEmail || "",
      counts: counts, sent: st, due: keep, hasDue: keep.length > 0, history: hist, go: go.filter((k) => keep.some((i) => i.key === k)), skip: [] };
    const sig = (x) => JSON.stringify([x.name, x.rpsEmail, x.counts, x.sent, (x.due || []).map((i) => [i.key, i.sessions, i.subject]), x.hasDue, (x.history || []).length, x.go || [], x.skip || []]);
    if (sig(next) !== sig(w)) { next.updatedAt = new Date(); patch_("warnings/" + encodeURIComponent(id), next); }
  });
  patch_("meta/warnings", { lastRun: new Date(), lastSent: sent, lastError: "" });
}

/* ---------- the emails ---------- */
const esc_ = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day_ = (iso) => { const d = new Date(iso + "T00:00:00Z"); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); };
const COLORS = { 1: ["#fdf1d8", "#7a4b00", "#e8b04b"], 2: ["#fde4cf", "#8a3b00", "#f0995a"], 3: ["#fbe0e0", "#8f1d1d", "#e26d6d"], w: ["#dff3ef", "#0b5d55", "#5fb3a8"] };
const pill_ = (c, text) => '<span style="display:inline-block;background:' + c[0] + ";color:" + c[1] + ";border:1px solid " + c[2] + ';font-size:12px;font-weight:bold;padding:3px 10px;border-radius:999px;">' + esc_(text) + "</span>";

function build_(r, it, sessions, notices, counts) {
  const K = KINDS[it.kind], name = r.name || r.id, matric = String(r.matric || ""), withdraw = it.type === "withdraw";
  const list = (withdraw ? it.gone : it.sessions).map((sid) => sessions[sid]).filter(Boolean);
  const n = withdraw ? counts[it.kind] : it.sessions.length;
  const head = withdraw ? "Warning Withdrawn" : LEVELS[it.level];
  const subject = "[NMK42003] " + (withdraw ? LEVELS[it.level] + " (" + K.title + ") Withdrawn" : LEVELS[it.level] + " (" + K.title + ")") + ": " + name + ", " + matric;
  const badge = withdraw ? pill_(COLORS.w, "Warning withdrawn · " + K.title) : pill_(COLORS[it.level], (it.level === 3 ? "Barring notification" : (it.level === 1 ? "1st" : "2nd") + " warning") + " · " + K.title);
  let lead, leadT;
  if (withdraw) {
    lead = esc_(LEVELS[it.level]) + " (" + K.title + ") for " + esc_(name) + " is <b>withdrawn</b>. The lecturer approved the absence notice below, so that absence is now Excused and no longer counts.";
    leadT = LEVELS[it.level] + " (" + K.title + ") for " + name + " is withdrawn. The lecturer approved the absence notice below, so that absence is now Excused and no longer counts.";
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
  const td = 'style="padding:8px;border-top:1px solid #e3e7ee;vertical-align:top;"', th = 'style="padding:8px;text-align:left;font-weight:bold;"';
  const rows = withdraw
    ? list.map((s) => { const nt = notices[s.id + "_" + r.id] || {}; return "<tr><td " + td + ">" + day_(s.date) + "</td><td " + td + ">" + esc_(s.title) + "</td><td " + td + ">" + (nt.status === "approved" ? "<b>" + esc_(REASON[nt.reason] || nt.reason || "") + "</b>: " + esc_(nt.detail || "") : "Changed to Excused by the lecturer") + "</td></tr>"; }).join("")
    : list.map((s, i) => "<tr><td " + td + ">" + (i + 1) + "</td><td " + td + ">" + day_(s.date) + "</td><td " + td + ">" + esc_(s.title) + "</td></tr>").join("");
  const table = '<table role="presentation" style="width:100%;font-size:13px;border-collapse:collapse;border:1px solid #e3e7ee;margin:4px 0 0;"><tr style="background:#f3f6f9;">'
    + (withdraw ? "<td " + th + ">Date</td><td " + th + ">Session</td><td " + th + ">Reason and explanation</td>" : "<td " + th + ">#</td><td " + th + ">Date</td><td " + th + ">Session</td>") + "</tr>" + rows + "</table>";
  const now = withdraw ? it.to : it.level;
  const ladder = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:18px 0 6px;font-size:12px;"><tr>' + [1, 2, 3].map((L) => {
    const c = L <= now ? COLORS[L] : ["#f6f7f9", "#6b7686", "#e3e7ee"];
    return '<td style="text-align:center;padding:8px 4px;border-radius:6px;background:' + c[0] + ";color:" + c[1] + ";border:1px solid " + c[2] + ";" + (L <= now ? "font-weight:bold;" : "") + '">' + (L === 3 ? "Barred from final exam" : L === 1 ? "1st warning" : "2nd warning") + "<br>" + LADDER[it.kind][L - 1] + "</td>";
  }).join("") + "</tr></table>";
  const P = (html) => '<p style="font-size:14px;color:#4a5568;line-height:1.6;margin:14px 0 0;">' + html + "</p>";
  const student = withdraw ? P("<b style=\"color:#1b2a4a;\">Student:</b> no action is needed for this absence.")
    : P("<b style=\"color:#1b2a4a;\">Student:</b> if you have a valid reason for an absence (medical, family emergency or an official university activity), send an absence notice with your supporting document on the course website. Once your lecturer approves it, the absence changes to Excused and no longer counts. Without an approved notice, the absence stands.")
      + '<p style="margin:14px 0 0;"><a href="' + SITE + 'attendance.html" style="display:inline-block;background:#0f766e;color:#ffffff;font-size:14px;padding:10px 18px;border-radius:6px;text-decoration:none;">Student: open your attendance</a></p>';
  const rps = P("<b style=\"color:#1b2a4a;\">RPS:</b> you are receiving this as the student's Rakan Pendamping Siswa (RPS). " + (withdraw ? "This is for your information." : it.level === 3 ? "Kindly advise the student, and contact the course coordinator if you have any questions." : "Kindly advise the student."));
  const after = withdraw ? P(K.abs + " now: <b>" + n + "</b>. " + (it.to ? esc_(LEVELS[it.to]) + " (" + K.title + ") still stands." : "No attendance warning stands now.")) : "";
  const html = '<div style="background:#eef1f5;padding:16px 8px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #d6dbe3;color:#1b2a4a;">'
    + '<table role="presentation" style="width:100%;background:#14213d;border-collapse:collapse;"><tr><td style="padding:18px 24px;"><div style="color:#ffffff;font-size:18px;font-family:Georgia,serif;">NMK42003 Instrumentation</div><div style="color:#9fd6cf;font-size:12px;">Faculty of Electronic Engineering &amp; Technology, UniMAP</div></td><td style="padding:18px 24px;color:#9fd6cf;font-size:12px;text-align:right;">Attendance<br>notification</td></tr></table>'
    + '<div style="height:4px;background:#0f766e;"></div><div style="padding:20px 24px;">' + badge
    + '<div style="font-size:20px;margin:12px 0 4px;font-family:Georgia,serif;">' + head + "</div>" + P(lead).replace("margin:14px 0 0", "margin:0")
    + '<table role="presentation" style="width:100%;font-size:13px;margin:16px 0;border-collapse:collapse;">' + facts.map((x) => '<tr><td style="color:#6b7686;padding:4px 0;width:120px;">' + x[0] + '</td><td style="padding:4px 0;">' + esc_(x[1]) + "</td></tr>").join("") + "</table>"
    + table + after + ladder + student + rps + "</div>"
    + '<div style="background:#f3f6f9;padding:14px 24px;font-size:12px;color:#6b7686;line-height:1.6;">This is an automated message from the NMK42003 Instrumentation course website: <a href="' + SITE + '" style="color:#0f766e;">' + SITE.replace(/^https:\/\//, "").replace(/\/$/, "") + "</a><br>Course coordinator: " + COORDINATOR + "</div></div></div>";
  const lines = withdraw
    ? list.map((s) => { const nt = notices[s.id + "_" + r.id] || {}; return "  - " + day_(s.date) + ": " + s.title + " (" + (nt.status === "approved" ? (REASON[nt.reason] || nt.reason || "") + ": " + (nt.detail || "") : "changed to Excused by the lecturer") + ")"; })
    : list.map((s, i) => "  " + (i + 1) + ". " + day_(s.date) + ": " + s.title);
  const text = [head + " (" + K.title + ")", "NMK42003 Instrumentation", "", leadT, ""].concat(facts.map((x) => x[0] + ": " + x[1]), [""], lines,
    withdraw ? ["", K.abs + " now: " + n + ". " + (it.to ? LEVELS[it.to] + " (" + K.title + ") still stands." : "No attendance warning stands now.")] : [],
    ["", withdraw ? "Student: no action is needed for this absence." : "Student: if you have a valid reason for an absence (medical, family emergency or an official university activity), send an absence notice with your supporting document on the course website: " + SITE + "attendance.html. Once your lecturer approves it, the absence changes to Excused and no longer counts. Without an approved notice, the absence stands.",
      "", "RPS: you are receiving this as the student's Rakan Pendamping Siswa (RPS). " + (withdraw ? "This is for your information." : "Kindly advise the student."),
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
}
