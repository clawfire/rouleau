# Rouleau

A small web app that generates things to print on a **Phomemo T02** thermal printer (48 mm paper, 384 dots, 203 dpi): font specimens today; morning tickets, workout sheets, task tickets, puzzles and more tomorrow.

Built with vanilla JS, [Vite](https://vite.dev) and [Web Awesome Pro](https://webawesome.com) components (Brutalist theme). Everything is self-hosted and open source: no account, no tracking, no backend (the Brutalist theme fonts and the icons load from CDNs).

## Quick start

```bash
cp .npmrc.example .npmrc   # Web Awesome Pro token, see below
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, deployable anywhere
```

## Printing

Three outputs, from the header bar:

| Button | How it reaches the T02 | Notes |
|---|---|---|
| **Imprimer** | Web Bluetooth, straight from the browser | Chrome / Edge only. Same protocol as the macOS bridge. |
| **⌘P** | System print dialog → `Phomemo T02` queue of [phomemo-t02-macos](https://github.com/clawfire/phomemo-t02-macos) | The "Ticket 48 mm" paper size is 297 mm max: longer tickets are split into pages at block boundaries. |
| **PNG** | 1-bit PNG, 384 px wide | `t02 print rouleau-*.png`, or keep it for later. |

A BLE printer accepts one connection at a time: if the macOS bridge is holding the T02 (keepalive), the browser won't find it. Use ⌘P in that case, or set `keepalive_seconds` to `0` in the bridge config.

## Architecture

```
module.build(values) ─► blocks[] ─► renderTicket() ─► Bitmap (1-bit, 384 px)
                                                        ├─► preview canvas
                                                        ├─► PNG
                                                        └─► T02 job (ESC/POS raster) ─► Bluetooth
```

```
src/
├── engine/
│   ├── constants.js   # 384 dots, 203 dpi, mm ↔ dots
│   ├── bitmap.js      # 1-bit image, stacking, PNG export
│   ├── dither.js      # Atkinson, Floyd–Steinberg, Bayer, halftone, threshold
│   ├── blocks.js      # text, row, rule, space, image, gradient, draw
│   └── render.js      # blocks → Bitmap (loads fonts first)
├── print/
│   ├── raster.js      # T02 wire protocol (port of t02bridge/protocol.py)
│   ├── bluetooth.js   # Web Bluetooth transport
│   └── system.js      # ⌘P and PNG download
├── modules/
│   ├── index.js       # registry (+ roadmap entries)
│   ├── specimen.js    # font specimen ticket
│   ├── morning.js     # weather + agenda + priorities + quote
│   ├── qr.js          # Wi-Fi, vCard, URL, SMS, call… QR codes
│   ├── badge.js       # sideways badges (+ badge-draw.js)
│   └── oracle.js      # 8-ball, tarot, dice, fortune cookie (+ oracle-draw.js)
├── ui/controls.js     # control schema → Web Awesome form components
├── fonts.js           # font registry (all SIL OFL)
└── main.js            # app shell
```

### The one rule

**Text is thresholded, images are dithered.** Dithering text makes it fizzle on a thermal head; thresholding a photo flattens it. Blocks know which one they are.

### Writing a module

```js
// src/modules/hello.js
import { text, rule } from '../engine/blocks.js';

export default {
  id: 'hello',
  label: 'Hello',
  icon: 'hand',                       // Font Awesome Free name
  description: 'A tiny example.',
  defaults: { name: 'world' },
  controls: [{ type: 'text', key: 'name', label: 'Name' }],
  build: (v) => [
    text(`Hello ${v.name}!`, { family: 'Archivo Black', size: 40, align: 'center' }),
    rule({ style: 'zigzag' }),
  ],
};
```

Then add it to `MODULES` in `src/modules/index.js`. Add `group: 'dev'` to a module meant for tuning Rouleau itself (like the font specimen): it goes into the collapsed *Développeurs* section of the menu. `build` may be `async` (fetch an API, load an image…).

Control types: `text`, `textarea`, `slider`, `switch`, `checkboxes`, `radio`, `select`, `image` (shrunk JPEG data URL), `button`, `callout`. A module can export `turn(values)` (`'cw'` | `'ccw'`) when it prints sideways: the preview then shows the ticket upright and flat.

Block builders: `text` (options include `invert` for black bands, `frame` for outlined ones), `check` (drawn checkbox row, optional write-in line), `lines` (handwriting lines), `row` (key ……… value), `rule` (`solid` · `dashed` · `dotted` · `zigzag`), `space`, `image` (dithered), `gradient`, `draw` (raw Canvas 2D).

## Modules

### Séance de sport (Hevy)

Three tickets:

- **Séance à faire**: a Hevy routine with one drawn checkbox per set, a write-in line for what you actually lifted, last session's numbers, rest times, and a notes + energy zone.
- **Bilan**: the latest (or a chosen) workout, to stick in a notebook. *Court* (~7 cm): totals grid + one line of records per exercise. *Complet*: duration, volume, sets, reps, personal records (max weight, estimated 1RM, best set volume; max reps for bodyweight) compared to the last N workouts, and the set detail with RPE. Warm-ups are left out of totals and records.
- **Vierge**: a blank sheet for people without Hevy: date, N exercises (name to write), M sets each with a drawn checkbox and kg / reps / effort fields, optional notes + energy.

- Paste your Hevy API key (Hevy Pro › Settings › Developer). It stays in your browser's localStorage.
- Without a key, the preview uses a demo routine.
- Run with `npm run dev`: Vite proxies `/hevy` to `api.hevyapp.com`, so the browser never hits CORS. A static build calls the API directly, which only works if Hevy allows the page's origin.
- Set tags: `É` warm-up, `F` failure, `D` drop set.

### Ticket du matin

Date, then four sections you switch on or off: **weather**, **agenda**, **three priorities** (drawn checkboxes, empty ones become write-in lines) and a **quote** (of the day, or your own sentence). Optional first name for the greeting.

- **Weather**: [Open-Meteo](https://open-meteo.com) (free, no key). Uses the browser position (allow it once, it is remembered for 6 h), or the city you type. Shows max / min, sky, rain chance, wind, 9h / 14h / 19h temperatures and sunrise / sunset.
- **Agenda**: paste the *secret address in iCal format* of your Google Calendar (Calendar settings › Integrate calendar), one per line. No OAuth. Recurring events, exceptions, cancellations and time zones are handled by [ical.js](https://github.com/kewisch/ical.js). Optionally add tomorrow. Like Hevy, Google sends no CORS headers: `npm run dev` proxies `/gcal` to `calendar.google.com`. The secret address gives read access to your calendar, so it stays in your browser's localStorage only.
- Without an iCal address, the preview shows a demo agenda.

### QR utilitaires

Wi-Fi, contact (vCard), link, free text, SMS, call, e-mail, WhatsApp, GPS position. Each type has its own form and produces the format a phone camera understands (`WIFI:…`, vCard 3.0, `SMSTO:…`, `tel:`, `mailto:`, `geo:`). Reserved characters are escaped; accents and emoji go through as UTF-8.

- The code is drawn module by module at an **integer** size (never under 3 dots per module, never wider than the paper), thresholded and never dithered. A grey module would not scan, so `wa-qr-code` (a canvas at an arbitrary pixel size, no module matrix) is not used here; the matrix comes from [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).
- Size in mm and error correction (L / M / Q / H) are adjustable; a dense code (a full vCard is 69 × 69 modules) comes out larger than requested rather than unreadable.
- The useful details are printed under the code (network and password, name and number…), so the paper still makes sense without scanning it.
- Checked end to end: every payload type, at every correction level, and the rendered ticket bitmaps decode back to the exact payload (jsQR), including at half resolution.

### Badges

Conference, visitor or "HELLO my name is" badges. The strip is as wide as the print head (384 dots), so the **badge height is fixed at 48 mm** and you only choose its **length** (60–160 mm): the badge is drawn lying down, then turned 90° onto the ticket so its long side runs along the tape. Pick which end comes out first with *Sens sur le papier*.

- **Conférence**: event and date in a black band, big first name, last name, role, company, category band at the bottom (Participant, Intervenant…).
- **Visiteur**: a big "VISITEUR" band, name, who they visit, date and time, badge number, a mention ("À rendre en partant").
- **Hello**: "HELLO / my name is", the first name as big as it fits, or a dotted line to write it by hand when left empty.
- Optional **photo** (shrunk in the browser, stays in localStorage, dithered at the size it is drawn so it stays 1-bit) and optional **QR code** (vCard of the person, a link, or text; it needs at least 3 dots per module, so a long vCard can be refused: lighten it).
- The preview shows the badge **flat** and upright with the 4 mm unprintable bands along the long edges; switch *Aperçu à plat* off to see the ticket as it prints. The PNG and the print always use the printed (turned) orientation.

### L'oracle

A ticket that answers a question, with the answer *drawn* (all in Canvas 2D, black on white, thresholded):

- **Magic 8-ball**: a black ball with its glare and its "8", the answer (Oui / Peut-être / Non + the sentence) in the round window. 17 answers.
- **Tarot**: the 22 major arcana, printed as real cards (double frame, numeral, an emblem drawn for each arcanum, name band). One card or past · present · future; a reversed card has its emblem upside down, and its keywords are printed under it.
- **Dice**: real dice. A d6 has its pips, the others are drawn as polyhedra (d4 triangle, d8 and d10 diamonds, d12 pentagon with facets, d20 hexagon, d100 as a d10 with two or three digits), 1 to 8 of them, with the total.
- **Fortune cookie**: a broken cookie holding the paper slip with the fortune and six lucky numbers.

The draw is seeded: the preview and the print show the same answer until you press *Tirer à nouveau*. Drawings live in `src/modules/oracle-draw.js`.

### Spécimen de fonts

Every house font at several sizes, plus the dithering comparison.

## Print notes (tested on paper)

| Topic | Verdict |
|---|---|
| Fonts | Atkinson Hyperlegible (body), Departure Mono (mono, receipts, tickets), Archivo Black (titles, best symbols). All SIL OFL. |
| Text size | 18 px minimum (≈ 2.3 mm). Bold doesn't bleed. Departure Mono: multiples of 11 px, so 22 px min. |
| Dithering | Atkinson by default (pure whites). Bayer and threshold work well; Floyd–Steinberg never reaches pure white; halftone is meh. |
| Solid black | Solid at max density (receipt paper); greyish at lower densities. `frame` gives an outlined band instead. |
| Checkboxes | Glyphs are too small: draw them. |
| Margins | The T02 is not borderless, so no side inset by default. |
| Density | Receipt paper → max (4). Sticker paper → dark (3). Pick the paper in the app. |

Use the `TYPE` presets from `src/fonts.js` in modules rather than raw font names.

## Web Awesome Pro

Rouleau uses **Web Awesome Pro** (Brutalist theme). Installing needs a Pro token:

```bash
cp .npmrc.example .npmrc   # paste your token from webawesome.com/workspaces, never commit it
npm install
```

The lockfile points the `@awesome.me` scope at the Pro registry on Cloudsmith; tarballs are served from `dl.fontawesome.com`.

## Working with AI agents

Web Awesome ships two [Agent Skills](https://webawesome.com/docs/ai/agent-skills) in `node_modules`. Install them for Claude Code with:

```bash
npm run skills
```

See `AGENTS.md` for project conventions.

## License

MIT for the code. Fonts keep their own licenses (SIL OFL 1.1).
