# Rouleau — notes for AI agents

## Context

- Personal project. Target printer: Phomemo T02 (384 dots wide, 203 dpi, 1-bit, continuous roll).
- Companion driver: https://github.com/clawfire/phomemo-t02-macos (the wire protocol in `src/print/raster.js` mirrors its `t02bridge/protocol.py`; keep them in sync).
- UI language: French. Code, comments and repo docs: English.

## Design system

- UI is built with **Web Awesome**. The owner has a Pro licence: Pro themes (e.g. Brutalist) and components are fine once the Pro package is installed (see webawesome.com workspaces, token in a git-ignored .npmrc).
- Before touching UI, read the skills shipped in `node_modules`:
  - `node_modules/@awesome.me/webawesome-pro/dist/skills/webawesome/` (component APIs)
  - `node_modules/@awesome.me/webawesome-pro/dist/skills/webawesome-design/` (layout, tokens, theming)
- Theme: `wa-theme-brutalist` (Pro) + `wa-palette-default`, light/dark follows the OS (`src/main.js`). Brutalist loads its fonts from fonts.bunny.net.
- Use `--wa-*` tokens and `wa-*` layout utilities. Only literal colours allowed: `--paper` and the ink in `src/styles.css`.
- Use short size values (`size="s"`), long ones are deprecated.

## Engine rules

- Modules return blocks; they never touch pixels directly (use the `draw` block if needed).
- Text → threshold. Images and greys → dither. Never dither text.
- Bitmaps are 1 byte per pixel, `1 = burn`. Packing to printer bytes happens only in `print/raster.js` (MSB first).
- Keep everything 384 px wide; no horizontal inset by default (the printer has physical margins).
- Typography: use `TYPE` from `src/fonts.js`. Text ≥ 18 px. Section headers are black bands (`invert`), solid at max density; `frame` for outlined bands.
- Default dither: Atkinson. Checkboxes must be drawn, not typed.
- ⌘P output is split into pages of max 297 mm (driver "Ticket 48 mm" size), cut on block boundaries (`engine/paginate.js`). Bluetooth and PNG are not limited.

## Roadmap (nav entries flagged `soon`)

Photo lab · Task tickets (GitHub/Jira, Octicons MIT) · Focus ticket · Puzzles (sudoku, Star Battle, Numberlink — unique solutions via solver). Done: Workout (Hevy), Morning ticket, QR utilities, Badges, Oracle.
