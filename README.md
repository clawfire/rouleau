# Rouleau

A small web app that generates things to print on a **Phomemo T02** thermal printer (48 mm paper, 384 dots, 203 dpi): font specimens today; morning tickets, workout sheets, task tickets, puzzles and more tomorrow.

Built with vanilla JS, [Vite](https://vite.dev) and [Web Awesome Pro](https://webawesome.com) components (Brutalist theme). Everything is self-hosted and open source: no account, no tracking, works offline (except the icon CDN).

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
│   └── specimen.js    # font specimen ticket
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

Then add it to `MODULES` in `src/modules/index.js`. `build` may be `async` (fetch an API, load an image…).

Control types: `text`, `textarea`, `slider`, `switch`, `checkboxes`, `radio`, `select`.

Block builders: `text` (options include `invert` for black bands, `frame` for outlined ones), `check` (drawn checkbox row, optional write-in line), `lines` (handwriting lines), `row` (key ……… value), `rule` (`solid` · `dashed` · `dotted` · `zigzag`), `space`, `image` (dithered), `gradient`, `draw` (raw Canvas 2D).

## Modules

### Séance de sport (Hevy)

Two tickets:

- **Séance à faire**: a Hevy routine with one drawn checkbox per set, a write-in line for what you actually lifted, last session's numbers, rest times, and a notes + energy zone.
- **Bilan**: the latest (or a chosen) workout, to stick in a notebook. *Court* (~7 cm): totals grid + one line of records per exercise. *Complet*: duration, volume, sets, reps, personal records (max weight, estimated 1RM, best set volume; max reps for bodyweight) compared to the last N workouts, and the set detail with RPE. Warm-ups are left out of totals and records.

- Paste your Hevy API key (Hevy Pro › Settings › Developer). It stays in your browser's localStorage.
- Without a key, the preview uses a demo routine.
- Run with `npm run dev`: Vite proxies `/hevy` to `api.hevyapp.com`, so the browser never hits CORS. A static build calls the API directly, which only works if Hevy allows the page's origin.
- Set tags: `É` warm-up, `F` failure, `D` drop set.

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
