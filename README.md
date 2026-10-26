# Rouleau

A small web app that generates things to print on a **Phomemo T02** thermal printer (48 mm paper, 384 dots, 203 dpi): font specimens today; morning tickets, workout sheets, task tickets, puzzles and more tomorrow.

Built with vanilla JS, [Vite](https://vite.dev) and [Web Awesome](https://webawesome.com) components. Everything is self-hosted and open source: no account, no tracking, works offline (except the icon CDN).

## Quick start

```bash
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

Block builders: `text`, `row` (key ……… value), `rule` (`solid` · `dashed` · `dotted` · `zigzag`), `space`, `image` (dithered), `gradient`, `draw` (raw Canvas 2D).

## Fonts

| Font | Use | License |
|---|---|---|
| Atkinson Hyperlegible | Body text | OFL |
| Atkinson Hyperlegible Mono | Lists, numbers | OFL |
| JetBrains Mono | GitHub / Jira tickets | OFL |
| IBM Plex Mono | GitHub / Jira tickets | OFL |
| Departure Mono | Retro receipt look (pixel font: use multiples of 11 px) | OFL, vendored in `src/assets/fonts` |
| Archivo Black | Headlines, banners | OFL |

Print the **Spécimen de fonts** ticket to pick yours on real paper. Rule of thumb: ≥ 18 px (≈ 2.2 mm) and weight ≥ 500 for body text.

## Web Awesome Pro (optional)

```bash
cp .npmrc.example .npmrc          # paste your token, never commit it
npm install @awesome.me/webawesome-pro   # exact name in your workspace
```

Then swap the import in `src/main.js` to the Pro package and set the theme on `<html>` in `index.html`, e.g. `class="wa-theme-brutalist wa-palette-default"`.

## Working with AI agents

Web Awesome ships two [Agent Skills](https://webawesome.com/docs/ai/agent-skills) in `node_modules`. Install them for Claude Code with:

```bash
npm run skills
```

See `AGENTS.md` for project conventions.

## License

MIT for the code. Fonts keep their own licenses (SIL OFL 1.1).
