/**
 * NMK42003 Class Moments: every 10 minutes, lists the photos in the lecturer's Google Drive folder and saves the list
 * in the course's Firebase database (Firestore meta/photos). The website shows them only to signed-in students on the
 * class list and lecturers (the Firestore rules decide). Nothing here is published as a web address.
 *
 * Setup (once, signed in to script.google.com as the owner of the Firebase project, zamrizahir@unimap.edu.my):
 *  1. New project, name it "NMK42003 Class Moments". Replace everything in Code.gs with this file.
 *  2. Next to "Services" press +, choose "Drive API" (version v3), press Add.
 *  3. Project Settings (gear) → tick "Show appsscript.json manifest file in editor". Open appsscript.json and replace
 *     it with the manifest in apps-script/appsscript.json (it adds permission to write to the Firebase database).
 *  4. Back in Code.gs, choose the function "setup" at the top and press Run. Allow access when Google asks.
 *     This saves the photo list now and sets it to update every 10 minutes by itself.
 * After that, just upload photos to the folder: they appear on the website within about 10 minutes.
 * The folder must stay shared as "Anyone with the link can view" (or "Anyone at UniMAP with the link") so the pictures
 * themselves can be shown.
 */
const FOLDER_ID = "1X2a3WkQGo8bxRjworFe_saHhgCP_50Ke";
const FIREBASE_PROJECT = "nmk42003-interactive-website";

// Run once: saves the list now and makes it update every 10 minutes
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("updatePhotos").timeBased().everyMinutes(10).create();
  updatePhotos();
}

function updatePhotos() {
  const photos = listPhotos();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/meta/photos`;
  const body = { fields: { updated: { timestampValue: new Date().toISOString() }, count: { integerValue: String(photos.length) }, json: { stringValue: JSON.stringify(photos) } } };
  const r = UrlFetchApp.fetch(url, { method: "patch", contentType: "application/json", payload: JSON.stringify(body),
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error(`Could not save the photo list (${r.getResponseCode()}): ${r.getContentText().slice(0, 300)}`);
  Logger.log(`Saved ${photos.length} photos.`);
}

function listPhotos() {
  const photos = [];
  let token = null;
  do {
    const r = Drive.Files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: "nextPageToken, files(id, name, createdTime, imageMediaMetadata(time))",
      pageSize: 1000,
      pageToken: token,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    // the time each photo was taken (stored in the photo by the camera), else the file name and upload time are used
    (r.files || []).forEach((f) => photos.push({ id: f.id, name: f.name, taken: (f.imageMediaMetadata && f.imageMediaMetadata.time) || "", uploaded: f.createdTime }));
    token = r.nextPageToken;
  } while (token);
  return photos;
}
