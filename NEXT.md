# NEXT — handoff notes

State of Rouleau on 26 Oct 2026 (after the first local Claude Code session).

## Where we are

- Engine: blocks → 1-bit Bitmap (384 px) → preview / PNG / ⌘P / Web Bluetooth. Stable. A module can print sideways (`turn()` hook in `main.js`, used by badges).
- Live: https://rouleau-t02.netlify.app (Netlify team `clawfire`, auto-deploy on every push to `main`).
- Modules done (nav order):
  - **Séance de sport** (`workout.js`): *à faire* (Hevy routine, drawn checkbox per set), *Bilan* (totals + PRs, *Court* / *Complet*), *Vierge*
  - **Ticket du matin** (`morning.js`): weather (Open-Meteo), agenda (Google secret iCal via `ical.js`), 3 priorities, quote; each section togglable
  - **Bullet journal** (`bujo.js`): habit tracker (month / week), week Mon → Sun with 3 lines a day, daily log, key; grid step adjustable (5 mm = Leuchtturm dot grid)
  - **Ticket de focus** (`focus.js`): task, definition of done, 5-minute squares or pomodoros, steps, parking lot
  - **QR utilitaires** (`qr.js`, payloads + matrix in `services/qr-payload.js`): Wi-Fi, vCard, URL, text, SMS, call, e-mail, WhatsApp, GPS
  - **Badges** (`badge.js` + `badge-draw.js`): conference / visitor / hello, 48 mm tall by 60–160 mm long; optional dithered photo and QR
  - **L'oracle** (`oracle.js` + `oracle-draw.js`): 8-ball, tarot (22 drawn cards, reversed = whole card upside down), dice, fortune cookie; seeded draw
  - **Jeux** (`games.js` + `games-draw.js`; pure generators/solvers `games-sudoku.js`, `games-stars.js`, `games-link.js`): sudoku (3 levels), Star Battle 5–9, Numberlink 5–7 (every cell filled). Unique solution checked while generating; seeded; optional answer printed small and upside down. Star Battle 10+ and Numberlink 8+ are too slow to generate in the browser.
  - **Spécimen de fonts** (`specimen.js`), under the collapsed "Développeurs" menu (`group: 'dev'`)
- Pages that are not modules (`PAGES` in `modules/index.js`, `showPage()` in `main.js`): **Et plus encore** (`ui/about.js`): why Rouleau exists, the macOS driver, the suggestion link, what leaves the browser, credits. The menu footer always shows "Fait par Thibault Milan" (thibaultmilan.com) and a link to the repo.
- UI: Web Awesome Pro, Brutalist theme. Preview shows 4 mm of paper on each side of the 48 mm print.

## Deployment (Netlify)

- Site `rouleau-t02`, team `clawfire`. Env vars: `WEBAWESOME_TOKEN` (secret), plus `NPM_CONFIG_USERCONFIG` and `VITE_USE_PROXY` from `netlify.toml`.
- Installs run before the build command, so `NPM_CONFIG_USERCONFIG=.npmrc.netlify` points npm at a committed file that only references `${WEBAWESOME_TOKEN}`. If the token is regenerated, update the env var.
- `/hevy/*` and `/gcal/*` are Netlify rewrites (status 200) standing in for the Vite dev proxy: Hevy and Google Calendar send no CORS headers.
- `netlify.toml` also sets security headers (nosniff, DENY framing, referrer and permissions policies) and immutable caching for `/assets/*`.
- Module suggestions go through GitHub issues (`.github/ISSUE_TEMPLATE/module-suggestion.yml`), not Netlify Forms.

## Decisions from the paper test (see README "Print notes")

- Fonts: Atkinson Hyperlegible (body), Departure Mono (mono, ≥ 22 px), Archivo Black (titles, best symbols). Use `TYPE` presets.
- Text ≥ 18 px. Bold doesn't bleed.
- Dither: Atkinson by default. Bayer and threshold OK. Floyd never reaches pure white. Halftone meh.
- Black bands (`invert`) are solid at max density. Keep them.
- Checkboxes must be drawn (glyphs too small).
- Density: receipt paper = 4, sticker paper = 3 (paper presets in the app).
- ⌘P pages are capped at 297 mm by the driver's "Ticket 48 mm" size → split at block boundaries.

## Tested for real

- [x] Hevy API with a real key: routines, workouts, set fields, warm-up exclusion, duration-only sets, 79-workout history; PR detection checked by hand; `failure` and `dropset` sets; custom exercises are rightly treated as "new"
- [x] Web Bluetooth printing to the T02; preview margins (48 mm print + 4 mm paper each side)
- [x] QR module on paper (the owner confirmed it works); QR payloads and rendered tickets decode back exactly (jsQR), every type at every correction level
- [x] CDN assets load (Brutalist fonts from fonts.bunny.net, 17 Font Awesome icons from ka-f.fontawesome.com). The app is **not** offline-capable.
- [x] Netlify: build with the token from the env var, proxies (`/hevy` 401 without a key, `/gcal` 404 on a bogus address), auto-deploy on push
- [x] Photo control end to end (800 KB PNG → 6 KB JPEG, dithered in the badge); a non-image file shows a validation message and stores nothing

## Still untested

- [ ] ⌘P multi-page output through the driver
- [ ] `rep_range` sets (not present in the test data)
- [ ] Ticket du matin with a real Google iCal address (parser checked on synthetic feeds: RRULE, EXDATE, RECURRENCE-ID, CANCELLED, UTC, all-day) and the weather with the browser position (tested with a typed city only)
- [ ] The Netlify site with a real Hevy key / iCal address (the proxies are only checked without credentials)
- [ ] Bullet journal on real paper: do the 5 mm rows line up with the dots of a Leuchtturm1917 once stuck (cell = 40 dots ≈ 5.005 mm, ~0.1 mm drift over 20 rows)? The Pineider Hollywood grid is unknown: ask for its line / dot spacing
- [ ] Week sticker with real calendar events
- [ ] Badges on real tape: which end should come out first (cw / ccw), a 3-dot-module vCard QR, the dithered photo at 230 dots, the black bands at max density; badge photo from a phone (EXIF rotation relies on `createImageBitmap`)
- [ ] QR codes scanned off real paper with a phone camera (3-dot modules, correction M vs Q), and QR types opened on a phone: SMSTO, WhatsApp, geo, vCard import on iOS and Android
- [ ] Oracle on paper: do the tarot emblems read at 200 × 300 dots, does the black 8-ball print cleanly at max density
- [ ] Mobile layout of the nav drawer (the "Développeurs" group, the "Et plus encore" entry and the credit footer were only checked on desktop)

## Audit of 26 Oct 2026 (security and performance pass)

### Checked, nothing to fix

- No `innerHTML` / `eval` / `document.write`. The only `srcdoc` (⌘P frame, `print/system.js`) is a static template with `blob:` URLs the app creates. User text is drawn on a canvas, or set through `textContent` / attributes.
- `npm audit`: 0 vulnerabilities. Git history scanned for tokens and keys: clean. `.npmrc` is git-ignored; `.npmrc.netlify` only references `${WEBAWESOME_TOKEN}`.
- The Hevy key travels in a header, never in a URL. Web Bluetooth is behind a user gesture and filtered (name `T02` / service `FF00`). `location.hash` is only matched against module ids. QR payloads escape their reserved characters (checked by round-trip).

### Fixed during the audit

- The morning ticket flushed the iCal cache on every render, so your Google Calendar feed was **downloaded again at each keystroke**. Feeds are now cached for 5 minutes (5 calls → 1 download, checked).
- Hevy history was fetched page after page. Pages after the first now load 4 at a time: 79 workouts in 1.1 s instead of 2.8 s, same data in the same order, no rate-limit error.
- The photo control ignored failures (an unreadable or huge file left an unhandled rejection). It now refuses files over 25 MB and shows a validation message.
- The badge dithers its photo again only when the photo, the size or the dither settings change.
- Netlify: security headers and immutable caching for `/assets/*`.

### Security: still to do (most important first)

1. **Content-Security-Policy** (none today). Without it, any future XSS could read the secrets kept in localStorage (Hevy key, secret iCal addresses). Origins the page needs, measured: `fonts.bunny.net` (CSS + fonts), `ka-f.fontawesome.com` (icon SVGs), `api.open-meteo.com` and `geocoding-api.open-meteo.com`; `blob:` and `data:` images; the ⌘P iframe; probably `'unsafe-inline'` styles (Web Awesome / Lit). Plan: build the policy, serve `dist` locally with the header, click through every module and ⌘P, ship it as Report-Only first. Best done after self-hosting fonts and icons (then `connect-src` is just `'self'` + Open-Meteo).
2. **Secrets in localStorage, in clear**: the Hevy API key and the secret iCal addresses (an iCal address gives read access to the whole calendar). Ideas: a "forget my keys" button, an option to keep them for the session only, CSP (above).
3. **Public proxies**: `/hevy/*` and `/gcal/*` are open relays to two fixed hosts (anyone can use them with their own credentials), and the Hevy key and the secret iCal address (which sits in the URL path) pass through Netlify. Don't enable log drains. If abuse shows up: an Edge Function that checks `Origin` / `Sec-Fetch-Site`, or drop the proxies from production.
4. **Third parties see visitors**: fonts.bunny.net and ka-f.fontawesome.com get every visitor's IP; Open-Meteo gets the coordinates or the city typed. That sits oddly with "no tracking". It is now stated on the "Et plus encore" page; the real fix is still to self-host fonts and icons.
5. `npm run skills` runs an unpinned `npx skills add …`: pin the version or document it.
6. `console.error('[rouleau] block failed', block, …)` logs the block content (could contain a Wi-Fi password) to the console. Local only; trim it.
7. A hostile or huge iCal feed could freeze the tab (up to 20 000 occurrences per recurring event, no cap on events). The feed is the user's own, so low; add a time or count budget if the site is ever shared widely.
8. License note: ical.js is MPL-2.0 (file-level copyleft; fine while its files stay unmodified).

### Performance: still to do

1. **Bundle**: one 561 kB JS file (151 kB gzip, and growing with every module) is loaded up front even though a visit uses one module. ical.js alone is ~78 kB minified, plus qrcode-generator and every module and drawing file. Lazy-load: the module registry keeps the metadata (id, label, icon, group) and a `() => import()`; `calendar.js` imports `ical.js` on first use. `selectModule` becomes async.
2. **Self-host the theme fonts and the icons** (also fixes offline, privacy and the CSP): 17 separate SVG requests and a third-party CSS import at start-up. Fonts via `@fontsource`, icons via a local icon library (`registerIconLibrary`) with the ~20 SVGs actually used.
3. `store.set` serialises all values (including a ~30 KB photo) on every keystroke: debounce by ~300 ms.
4. `workout.js` calls `clearHevyCache()` each time the controls are rebuilt, so flipping a radio re-downloads routines and workouts. Use a TTL cache like the calendar one.
5. Everything else measured fine: renders are debounced (120 ms), bitmaps are packed to printer bytes only at print time, weather and geocoding are cached.

## Module suggestions: GitHub issues (done)

Chosen over a Netlify Form: no captcha or Google script, nothing stored by us, a GitHub account is already a spam barrier, and the ideas stay public and discussable. The "Et plus encore" page links to `https://github.com/clawfire/rouleau/issues/new?template=module-suggestion.yml`: a French form (module name, what it prints, when you'd use it, format, a reference, a "this will be public" checkbox) that applies the `module` label. `config.yml` keeps blank issues and points driver problems to the `phomemo-t02-macos` repo.

- [ ] To check once pushed: the form renders on GitHub and the `module` label is applied.
- Later, if there is traffic: a GitHub Project board for the ideas, an English version of the form.

## Known gaps / ideas

- `row` blocks overlap if left + right text are too wide (no wrapping yet).
- Driver idea: raise the "Ticket 48 mm" page length in `tools/gen_ppd.py` (297 → ~1000 mm) to avoid ⌘P splits; `MaxMediaHeight` already allows 5 m.
- Web Bluetooth and the macOS bridge can't hold the T02 at the same time (bridge keepalive).
- Badges: CSV import to print a batch on one strip, a lanyard-hole marker.
- Bullet journal: year in pixels / mood strip, collection index labels, dot-grid ruler strip.
- Oracle: minor arcana, I Ching, "what do we eat?".

- Morning ticket: the mini puzzle at the bottom (use `puzzleBlocks()` from `games.js`).

## Next modules (roadmap, in the nav as "bientôt")

1. Tickets de tâches: GitHub/Jira issue → ticket with Octicons (MIT), mono font, QR to the issue (reuses `qr-payload.js`)
2. Labo photo: brightness / contrast / gamma + dither choice, stickers & text, webcam photo-booth strip

## Setup reminder

```bash
cp .npmrc.example .npmrc   # Web Awesome Pro token (regenerate the one shared in chat)
npm install
npm run skills             # Web Awesome agent skills for Claude Code
npm run dev
```
