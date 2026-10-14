/* NMK42003 progress board (board.html): your own level, badges and journey, and the class board.
   The class board (top 10 and bottom 10 by XP, this semester) is visible to approved students and lecturers only.
   It reads the small public summaries in Firestore board/{uid}; detailed answers are never shown here. */
(function () {
  "use strict";
  const mine = document.getElementById("myProgress"), host = document.getElementById("classBoard");
  if (!mine || !window.NMKGame) return;
  const G = window.NMKGame;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BADGE = Object.fromEntries(G.BADGES.map((b) => [b.id, b]));
  const ago = (iso) => { if (!iso) return "never"; const d = Math.floor((G.today() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : `${Math.floor(d / 7)} weeks ago`; };

  const paintMine = () => { mine.innerHTML = G.journeyHtml(G.local()); };
  paintMine();
  document.addEventListener("nmk:store", () => setTimeout(paintMine, 500));

  if (!host) return;
  if (!window.NMKAccount) { host.innerHTML = `<p class="small-note">The class board needs the sign-in service, which could not load.</p>`; return; }
  const A = window.NMKAccount;
  let rows = [], me = null;

  const row = (r, i) => `<tr class="${me && r.uid === me ? "me" : ""}"><td class="bd-rk">${i}</td>
      <td><button type="button" class="bd-name" data-uid="${esc(r.uid)}">${esc(r.nickname)}</button>${me && r.uid === me ? ' <span class="bd-you">you</span>' : ""}</td>
      <td><span class="bd-lv">L${r.levelNo || 1}</span> ${esc(r.level || "Apprentice")}</td><td class="bd-xp">${r.xp || 0}</td>
      <td class="bd-bs">${(r.badges || []).map((id) => BADGE[id] ? `<span title="${esc(BADGE[id].name)}">${BADGE[id].icon}</span>` : "").join("")}</td>
      <td>${ago(r.lastActive)}</td></tr>`;
  const table = (list, start) => `<div class="adm-scroll"><table class="adm bd"><thead><tr><th scope="col">#</th><th scope="col">Nickname</th><th scope="col">Level</th><th scope="col">XP</th><th scope="col">Badges</th><th scope="col">Last active</th></tr></thead>
      <tbody>${list.map((r, i) => row(r, start + i)).join("")}</tbody></table></div>`;

  function draw() {
    const sorted = rows.slice().sort((a, b) => (b.xp || 0) - (a.xp || 0) || String(a.nickname).localeCompare(b.nickname));
    const n = sorted.length, top = sorted.slice(0, 10), bottomStart = Math.max(10, n - 10), bottom = sorted.slice(bottomStart);
    const myRank = me ? sorted.findIndex((r) => r.uid === me) + 1 : 0;
    host.innerHTML = !n ? `<p class="small-note">No one is on the board yet this semester.</p>`
      : `<p class="bd-sum">${n} student${n === 1 ? "" : "s"} on the board this semester.${myRank ? ` You are <strong>number ${myRank}</strong>.` : ""}</p>
        <h3 class="bd-h">Top 10</h3>${table(top, 1)}
        ${bottom.length ? `<h3 class="bd-h">Bottom 10</h3><p class="small-note">Not a ranking of ability: it shows who has done the least so far. Any exercise you solve moves you up.</p>${table(bottom, bottomStart + 1)}` : ""}`;
  }
  function profile(uid) {
    const r = rows.find((x) => x.uid === uid);
    if (!r) return;
    const back = document.createElement("div");
    back.className = "acc-back";
    back.innerHTML = `<div class="acc-modal" role="dialog" aria-modal="true" aria-label="${esc(r.nickname)}"><h2>${esc(r.nickname)}</h2>
        <p><span class="bd-lv">Level ${r.levelNo || 1}</span> <strong>${esc(r.level || "Apprentice")}</strong> · ${r.xp || 0} XP · ${r.streak ? `${r.streak}-week streak` : "no streak"} · active ${ago(r.lastActive)}</p>
        <div class="gm-badges">${(r.badges || []).length ? r.badges.map((id) => BADGE[id] ? `<span class="gm-b" title="${esc(BADGE[id].desc)}"><span aria-hidden="true">${BADGE[id].icon}</span>${esc(BADGE[id].name)}</span>` : "").join("") : `<span class="gm-none">No badges yet.</span>`}</div>
        <h3 class="bd-h">Journey</h3><ul class="bd-stops">${Object.entries(r.stops || {}).map(([k, v]) => `<li><span>${esc(k)}</span><span class="gm-mini"><i style="width:${+v || 0}%"></i></span><span>${+v || 0}%</span></li>`).join("")}</ul>
        <div class="acc-row"><button type="button" class="btn" data-close>Close</button></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector("[data-close]").onclick = close; back.querySelector("[data-close]").focus();
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
  }
  host.addEventListener("click", (e) => { const b = e.target.closest("[data-uid]"); if (b) profile(b.dataset.uid); });

  A.on(async (st) => {
    if (!st.user) { host.innerHTML = `<p>Sign in with your studentmail account to see the class board.</p><button type="button" class="btn" data-signin>Sign in with Google</button>`; host.querySelector("[data-signin]").onclick = A.signIn; return; }
    if (!st.profile || (st.profile.status !== "approved" && !A.isAdmin(st.user.email))) { host.innerHTML = `<p class="small-note">The class board opens when your lecturer has approved your account.</p>`; return; }
    me = st.user.uid;
    host.innerHTML = `<p class="small-note">Loading the board…</p>`;
    try {
      const snap = await A.db.collection("board").where("semester", "==", G.SEM).get();
      rows = snap.docs.map((d) => Object.assign({ uid: d.id }, d.data())).filter((r) => r.role !== "lecturer");
      draw();
    } catch (e) { host.innerHTML = `<p class="small-note">Could not load the board (${esc(e.code || e)}).</p>`; }
  });
})();
