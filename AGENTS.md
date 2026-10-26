# Rouleau — notes for AI agents

## Context

- Personal project. Target printer: Phomemo T02 (384 dots wide, 203 dpi, 1-bit, continuous roll).
- Companion driver: https://github.com/clawfire/phomemo-t02-macos (the wire protocol in `src/print/raster.js` mirrors its `t02bridge/protocol.py`; keep them in sync).
- UI language: French. Code, comments and repo docs: English.

## Design system

- UI is built with **Web Awesome** (free components only, no Pro).
- Before touching UI, read the skills shipped in `node_modules`:
  - `node_modules/@awesome.me/webawesome/dist/skills/webawesome/` (component APIs)
  - `node_modules/@awesome.me/webawesome/dist/skills/webawesome-design/` (layout, tokens, theming)
- Theme: `wa-theme-default` + `wa-palette-default`, light/dark follows the OS (`src/main.js`).
- Use `--wa-*` tokens and `wa-*` layout utilities. Only literal colours allowed: `--paper` and the ink in `src/styles.css`.
- Use short size values (`size="s"`), long ones are deprecated.

## Engine rules

- Modules return blocks; they never touch pixels directly (use the `draw` block if needed).
- Text → threshold. Images and greys → dither. Never dither text.
- Bitmaps are 1 byte per pixel, `1 = burn`. Packing to printer bytes happens only in `print/raster.js` (MSB first).
- Keep everything 384 px wide; horizontal inset defaults to 8 px.

## Roadmap (nav entries flagged `soon`)

Photo lab · Morning ticket · Workout (Hevy) · Task tickets (GitHub/Jira, Octicons MIT) · Focus ticket · Oracle · Puzzles (sudoku, Star Battle, Numberlink — unique solutions via solver) · QR utilities · Badges.
