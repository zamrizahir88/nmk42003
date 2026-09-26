# NMK42003 Instrumentation — course website

Course website for NMK42003 Instrumentation, Faculty of Electronic Engineering & Technology, UniMAP.
Plain HTML, CSS and JavaScript. No build step, runs directly on GitHub Pages.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Homepage |
| `topic.html` | Chapter page (opened as `topic.html?ch=1` to `?ch=7`) |
| `assets/js/data.js` | **All course content**: session, weeks, topics, assessment, team. Edit this each semester. |
| `assets/js/main.js` | Renders the pages from `data.js` |
| `assets/css/style.css` | Styles, including dark mode |
| `assets/img/` | Put lecturer photos here (optional) |

## Publish on GitHub Pages (first time)

1. Sign in to GitHub and click **New repository**. Name it, for example, `nmk42003`. Set it to **Public** and click **Create repository**.
2. On the new repository page, click **uploading an existing file**.
3. Unzip the website, open the folder, and drag **everything inside it** (not the folder itself) into the upload area. `index.html` must be at the top level.
4. Click **Commit changes**.
5. Go to **Settings > Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**. Click **Save**.
6. Wait one to two minutes. Your site will be at `https://<your-username>.github.io/nmk42003/`.

## Updating

- **New semester:** edit `assets/js/data.js` (`session`, `semesterStart`, `weeks`, `lastUpdated`), then upload it to replace the old file.
- **Publishing a chapter:** change that topic's `status` in `data.js` to `"notes"` or `"interactive"`.
- **Adding photos:** upload images to `assets/img/` and set `photo: "assets/img/yourname.jpg"` in the `team` list.

## Previewing a date

Add `?today=YYYY-MM-DD` to the address to see the site as it would look on that date, for example
`index.html?today=2026-11-03` shows Week 5.
