# NEXT — handoff notes

State of Rouleau when it moved from the cloud session to local Claude Code (26 Oct 2026).

## Where we are

- Engine: blocks → 1-bit Bitmap (384 px) → preview / PNG / ⌘P / Web Bluetooth. Stable.
- Modules done:
  - **Séance de sport** (`src/modules/workout.js`): 3 modes
    - *Séance à faire*: Hevy routine, drawn checkbox per set, write-in line, last session's numbers
    - *Bilan*: last (or chosen) Hevy workout, totals grid + PRs; formats *Court* (default, ~7 cm) and *Complet*
    - *Vierge*: no Hevy, N exercises × M sets with kg / reps / effort fields
  - **Spécimen de fonts** (`src/modules/specimen.js`)
  - **L'oracle** (`src/modules/oracle.js`): 8-ball, tarot (major arcana), dice, fortune cookie; seeded draw + "Tirer à nouveau" button
  - **Badges** (`src/modules/badge.js` + `badge-draw.js`): conference / visitor / hello, 48 mm tall by 60–160 mm long, printed sideways; optional dithered photo and QR; flat preview via `turn()` in `main.js`
  - **QR utilitaires** (`src/modules/qr.js`, payloads + matrix in `src/services/qr-payload.js`): Wi-Fi, vCard, URL, text, SMS, call, e-mail, WhatsApp, GPS
  - **Ticket du matin** (`src/modules/morning.js`): weather (Open-Meteo), agenda (Google secret iCal via `ical.js`), 3 priorities, quote; each section togglable
- UI: Web Awesome Pro, Brutalist theme. Preview shows 4 mm of paper on each side of the 48 mm print.

## Decisions from the paper test (see README "Print notes")

- Fonts: Atkinson Hyperlegible (body), Departure Mono (mono, ≥ 22 px), Archivo Black (titles, best symbols). Use `TYPE` presets.
- Text ≥ 18 px. Bold doesn't bleed.
- Dither: Atkinson by default. Bayer and threshold OK. Floyd never reaches pure white. Halftone meh.
- Black bands (`invert`) are solid at max density. Keep them.
- Checkboxes must be drawn (glyphs too small).
- Density: receipt paper = 4, sticker paper = 3 (paper presets in the app).
- ⌘P pages are capped at 297 mm by the driver's "Ticket 48 mm" size → split at block boundaries.

## Tested for real (26 Oct 2026)

- [x] Hevy API with a real key via `npm run dev`: routines, workouts, set fields, warm-up exclusion, duration-only sets, 78-workout history (all scanned)
- [x] PR detection on real history (totals checked by hand against the raw workout). Custom exercises have their own template id and are rightly treated as "new".
- [x] `failure` and `dropset` sets (workout of 18 Oct 2026, Chest Press): tags F / D shown, counted in totals and records, totals checked by hand
- [x] Web Bluetooth printing to the T02
- [x] CDN assets: Brutalist fonts (fonts.bunny.net: Space Grotesk, IBM Plex Sans Condensed) and 17 Font Awesome icons (ka-f.fontawesome.com, v7.3.0) all load with HTTP 200, no font errors. The app is **not** offline-capable: both CDNs are needed (self-hosting is an option).
- [x] Preview margins (48 mm print + 4 mm paper each side)

## Still untested

- [ ] Badges on real tape: which end should come out first (cw / ccw), a 3-dot-module vCard QR, the dithered photo at 230 dots, the black bands at max density
- [ ] Badge photo from a real camera / phone (EXIF rotation relies on `createImageBitmap`)

- [ ] QR codes on real paper with a phone camera (decoded fine from the rendered bitmaps, never scanned off a printed ticket; try 3-dot modules, correction M vs Q)
- [ ] QR types never opened on a real phone: SMSTO, WhatsApp, geo, vCard import on iOS and Android

- [ ] Ticket du matin with a real Google iCal address (parser checked on a synthetic feed: RRULE, EXDATE, RECURRENCE-ID override, CANCELLED, UTC, all-day; the `/gcal` proxy reaches Google)
- [ ] Ticket du matin weather with the browser position (tested with a typed city only)
- [ ] ⌘P multi-page output through the driver
- [ ] `rep_range` sets (not present in the test data)

## Known gaps / ideas

- Hevy in a static build calls the API directly → CORS unknown. Options: keep using `npm run dev`, or add a tiny proxy (Netlify/Cloudflare function).
- `row` blocks overlap if left + right text are too wide (no wrapping yet).
- Driver idea: raise the "Ticket 48 mm" page length in `tools/gen_ppd.py` (297 → ~1000 mm) to avoid ⌘P splits; `MaxMediaHeight` already allows 5 m.
- Web Bluetooth and the macOS bridge can't hold the T02 at the same time (bridge keepalive).

## Next modules (roadmap, in the nav as "bientôt")

1. ~~Ticket du matin~~ done (mini puzzle at the bottom still to add once the Jeux module exists)
2. Tickets de tâches: GitHub/Jira issue → ticket with Octicons (MIT), mono font, QR to the issue
3. Ticket de focus (quick win) · ~~L'oracle~~ done (ideas: minor arcana, I Ching, "what do we eat?")
4. Jeux: sudoku, Star Battle (Queens-like), Numberlink (Zip-like), unique solution via solver; patterns instead of colours
5. ~~QR utilitaires~~ done · ~~Badges~~ done (still to do: CSV import to print a batch of badges, a lanyard-hole marker) (name, role, dithered photo, vCard QR, CSV import)
6. Labo photo: brightness / contrast / gamma + dither choice, stickers & text, webcam photo-booth strip

## Setup reminder

```bash
cp .npmrc.example .npmrc   # Web Awesome Pro token (regenerate the one shared in chat)
npm install
npm run skills             # Web Awesome agent skills for Claude Code
npm run dev
```