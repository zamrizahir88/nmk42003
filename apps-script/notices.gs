/* NMK42003 absence notices: moves students' supporting documents (MC, letters) into the lecturer's Google Drive folder.
   A student attaches the file to their notice on the attendance page; it is saved in Firestore (uploads/{id}, in
   parts). Every 5 minutes this script, running in the lecturer's own Google account, joins the parts, saves the file
   in FOLDER_ID as "date matric NAME - session.pdf", puts the Drive link on the notice, and deletes the parts from
   Firestore. Nothing is published as a web app, so UniMAP's sharing settings don't matter.

   Set up once (about 5 minutes), signed in as the owner of the Firebase project:
   1. script.google.com > New project, name it "NMK42003 Absence Documents".
   2. Replace everything in Code.gs with this file.
   3. Project Settings (gear) > tick 'Show "appsscript.json" manifest file in editor'; replace appsscript.json with
      apps-script/notices.appsscript.json.
   4. Choose "setup" at the top and press Run; allow access. It moves any waiting documents and starts the 5-minute timer.
   5. On the website: Attendance > Notices tab > tick "Students attach their supporting document".
   (If you made a web-app deployment of the earlier version, you can delete it: Deploy > Manage deployments.) */

const FOLDER_ID = "1rBplveeHyXHEgRyaUZ5pQQnEyN91hZYe";
const PROJECT = "nmk42003-interactive-website";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/";

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "moveDocuments") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("moveDocuments").timeBased().everyMinutes(5).create();
  moveDocuments();
  Logger.log("Ready: documents are moved into " + DriveApp.getFolderById(FOLDER_ID).getName() + " every 5 minutes.");
}

function api(method, path, body) {
  const res = UrlFetchApp.fetch(BASE + path, { method: method, contentType: "application/json", payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code >= 300) throw new Error(method + " " + path + ": " + code + " " + res.getContentText().slice(0, 200));
  return res.getContentText() ? JSON.parse(res.getContentText()) : {};
}
const str = (f, k) => (f[k] ? String(f[k].stringValue || f[k].integerValue || "") : "");
const idOf = (doc) => doc.name.split("/").pop();

function moveDocuments() {
  const list = api("get", "uploads?pageSize=20") || {};
  (list.documents || []).forEach((doc) => {
    const id = idOf(doc), f = doc.fields || {};
    try {
      const partsList = (api("get", "uploads/" + id + "/parts?pageSize=20") || {}).documents || [];
      const want = Number(str(f, "parts")) || 0;
      if (partsList.length < want) return;   // still arriving: next time
      const parts = partsList.sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1));
      const data = parts.map((p) => str(p.fields || {}, "data")).join("");
      const notice = str(f, "notice"), there = notice ? api("get", "notices/" + encodeURIComponent(notice)) : null;
      if (there) {
        const clean = (s) => String(s || "").replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim();
        const ext = str(f, "ext") || "pdf", type = str(f, "type") || "application/pdf";
        const name = clean(str(f, "date") + " " + str(f, "matric") + " " + str(f, "studentName") + " - " + str(f, "title")).slice(0, 150) + "." + ext;
        const file = DriveApp.getFolderById(FOLDER_ID).createFile(Utilities.newBlob(Utilities.base64Decode(data), type, name));
        file.setDescription("Absence notice from " + str(f, "email") + ". Reason: " + str(f, "reason") + ". Original file: " + str(f, "name") + ".");
        api("patch", "notices/" + encodeURIComponent(notice) + "?updateMask.fieldPaths=doc", { fields: { doc: { mapValue: { fields: {
          id: { stringValue: file.getId() }, url: { stringValue: file.getUrl() }, name: { stringValue: name } } } } } });
      }
      // moved (or the notice was withdrawn): delete the copy in Firestore
      parts.forEach((p) => api("delete", "uploads/" + id + "/parts/" + idOf(p)));
      api("delete", "uploads/" + id);
    } catch (err) {
      Logger.log("Could not move " + id + ": " + err);
    }
  });
  api("patch", "meta/uploads?updateMask.fieldPaths=lastRun", { fields: { lastRun: { timestampValue: new Date().toISOString() } } });
}
