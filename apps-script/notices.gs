/* NMK42003 absence notices: supporting documents (MC, letters) go straight into the lecturer's Google Drive folder.
   The attendance page sends the file here with the student's sign-in token. This script checks the token with Google,
   checks the student is on the class list (Firestore roster), and saves the file in FOLDER_ID, named
   "date matric NAME - session.pdf". The folder stays private to the lecturer.

   Set up once (about 10 minutes), signed in as the owner of the Firebase project:
   1. script.google.com > New project, name it "NMK42003 Absence Documents".
   2. Replace everything in Code.gs with this file.
   3. Project Settings (gear) > tick 'Show "appsscript.json" manifest file in editor'; replace appsscript.json with
      apps-script/notices.appsscript.json.
   4. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Deploy, allow access, and copy
      the Web app URL (it ends in /exec).
      ("Anyone" is needed because the request comes from the website; the script itself refuses anyone who is not a
      signed-in student on the class list.)
   5. On the website: Attendance > Notices tab > paste the URL into "Document upload address" and press Save.
   After changing this file later: Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. */

const FOLDER_ID = "1rBplveeHyXHEgRyaUZ5pQQnEyN91hZYe";
const API_KEY = "AIzaSyBR3JguiBmsePqoOsnF-lefm5gyjJx89Z0";   // the website's public Firebase key
const PROJECT = "nmk42003-interactive-website";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

function doPost(e) {
  try {
    const q = JSON.parse(e.postData.contents);
    const email = whoIs(q.idToken);
    const r = rosterOf(email);
    if (!r) return reply({ error: "You are not on the NMK42003 class list." });
    const ext = TYPES[q.type];
    if (!ext) return reply({ error: "Use a PDF, JPG or PNG file." });
    const bytes = Utilities.base64Decode(q.data);
    if (bytes.length > MAX_BYTES) return reply({ error: "The file is larger than 5 MB." });
    const clean = (s) => String(s || "").replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim();
    const name = clean(`${q.date} ${r.matric} ${r.name} - ${q.title}`).slice(0, 150) + "." + ext;
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(Utilities.newBlob(bytes, q.type, name));
    file.setDescription(`Absence notice from ${email}. Session ${clean(q.session)}. Reason: ${clean(q.reason)}.`);
    return reply({ ok: true, id: file.getId(), url: file.getUrl(), name: name });
  } catch (err) {
    return reply({ error: String(err && err.message ? err.message : err) });
  }
}

// the student's verified email, from their Firebase sign-in token
function whoIs(idToken) {
  const res = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + API_KEY,
    { method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
  const u = ((JSON.parse(res.getContentText()) || {}).users || [])[0];
  if (!u || !u.emailVerified || !u.email) throw new Error("Please sign in again, then try once more.");
  return u.email.toLowerCase();
}

// the student's class-list entry (name and matric), if they are on it and active
function rosterOf(email) {
  const url = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/roster/" + encodeURIComponent(email);
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const f = (JSON.parse(res.getContentText()) || {}).fields || {};
  const s = (k) => (f[k] ? String(f[k].stringValue || f[k].integerValue || "") : "");
  return s("status") === "active" ? { name: s("name"), matric: s("matric") } : null;
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// run once from the editor to give the script its permissions (Drive, Firestore, outside requests)
function setup() {
  DriveApp.getFolderById(FOLDER_ID).getName();
  UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
  Logger.log("Ready. Now deploy it as a web app (step 4).");
}
