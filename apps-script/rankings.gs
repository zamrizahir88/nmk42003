/* NMK42003 class rankings: once a day, at about 12:00 AM (Malaysia time), builds the class board and the INSTRUMENTA
   leaderboard from every student's saved progress summary (Firestore board/{uid}) and publishes them as ONE document,
   boardsum/{semester}. Students then read 1 document to see the rankings, instead of one per classmate.
   A lecturer can also update the rankings at any time on the website ("Update rankings now" on the Class Board or the
   leaderboard); this file is only the automatic daily update.

   It runs in the same Apps Script project as notices.gs and warnings.gs, and uses their Firestore helpers.
   Set up once:
   1. In that project, add a script file (+ > Script), name it "rankings", and paste this file into it.
   2. Choose "setupRankings" at the top and press Run (allow access if Google asks). It updates the rankings once now
      and starts the daily timer.
   The semester comes from meta/warnings (written by the website's Attendance > Warnings tab). */

function setupRankings() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "updateRankings") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("updateRankings").timeBased().atHour(0).nearMinute(0).everyDays(1).create();
  updateRankings();
  Logger.log("Ready: the class rankings are updated every day at about 12:00 AM.");
}

// the same line as account.js sumOf(): what the board and the leaderboard show for each player
function rankLine_(b) {
  return { nickname: b.nickname || "", role: b.role || "student", xp: b.xp || 0, level: b.level || "", levelNo: b.levelNo || 1, badges: b.badges || [],
    streak: b.streak || 0, lastActive: b.lastActive || null, stops: b.stops || {}, name: b.name || "", matric: b.matric || "", section: b.section || "",
    photo: b.photo || "", game: b.game || null };
}

function updateRankings() {
  const meta = getDoc_("meta/warnings");
  if (!meta || !meta.semester || !meta.semSlug) { Logger.log("No semester yet: open Attendance > Warnings on the website once."); return; }
  const p = {};
  listAll_("board").forEach((b) => { if (b.semester === meta.semester) p[b.id] = rankLine_(b); });
  // the whole document is replaced, so players who left the class drop off
  api("patch", "boardsum/" + encodeURIComponent(meta.semSlug), { fields: { semester: fs_(meta.semester), p: fs_(p), at: fs_(new Date()), by: fs_("daily update") } });
  Logger.log("Rankings updated: " + Object.keys(p).length + " players.");
}
