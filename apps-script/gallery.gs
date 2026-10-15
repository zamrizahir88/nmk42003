/**
 * NMK42003 Class Moments: lists the photos in the lecturer's Google Drive folder for the course website.
 *
 * Setup (once):
 *  1. Go to https://script.google.com, press "New project", name it "NMK42003 Class Moments".
 *  2. Delete what is in Code.gs and paste this whole file.
 *  3. On the left, next to "Services", press +, choose "Drive API", version v3, and press Add.
 *  4. Press Deploy, then New deployment. Gear icon: choose "Web app".
 *       Execute as: Me.   Who has access: Anyone.   Press Deploy, and allow access when Google asks.
 *  5. Copy the "Web app" address (it ends in /exec) and paste it on the website:
 *       Class Moments page, "Settings (lecturers)", "Photo list address", Save.
 *
 * The website then shows every photo in the folder, sorted by the time each photo was taken (the time the
 * camera stored inside it), so photos can be uploaded on any day. New photos appear within about 10 minutes.
 * The folder must stay shared as "Anyone with the link can view" so the website can show the pictures.
 */
const FOLDER_ID = "1X2a3WkQGo8bxRjworFe_saHhgCP_50Ke";

function doGet() {
  const cache = CacheService.getScriptCache();
  let json = cache.get("photos");
  if (!json) {
    json = JSON.stringify({ updated: new Date().toISOString(), photos: listPhotos() });
    try { cache.put("photos", json, 300); } catch (e) { /* too big to cache: fine */ }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function listPhotos() {
  const photos = [];
  let token = null;
  do {
    const r = Drive.Files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: "nextPageToken, files(id, name, createdTime, imageMediaMetadata(time, width, height, rotation))",
      pageSize: 1000,
      pageToken: token
    });
    (r.files || []).forEach((f) => {
      const m = f.imageMediaMetadata || {};
      // width and height as seen (a photo taken sideways is turned by its rotation)
      const turned = m.rotation === 1 || m.rotation === 3;
      photos.push({ id: f.id, name: f.name, taken: m.time || "", uploaded: f.createdTime, w: turned ? m.height : m.width, h: turned ? m.width : m.height });
    });
    token = r.nextPageToken;
  } while (token);
  return photos;
}
