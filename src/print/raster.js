/**
 * Phomemo T02 wire protocol, ported from the macOS bridge
 * (clawfire/phomemo-t02-macos, t02bridge/protocol.py).
 *
 *   1B 40                 ESC @            init
 *   1F 11 02 <d>          density          (1, 2, 4, 4)
 *   1F 11 37 <c>          density coeff.   (100, 100, 100, 150)
 *   1F 11 0B              media: continuous / plain paper
 *   1F 11 35 00           raster data is uncompressed
 *   1D 76 30 00 wL wH hL hH <rows>   GS v 0, ≤255 rows per block, MSB first, 1 = burn
 *   1B 64 02  ×2          print & feed
 *   1B 4A <n>             optional extra feed, n dots
 */
import { PRINT_WIDTH } from '../engine/constants.js';

const DENSITY_LEVELS = { 1: [1, 100], 2: [2, 100], 3: [4, 100], 4: [4, 150] };
const TOP_PADDING_ROWS = 4;
const MAX_ROWS_PER_BLOCK = 255;

/** Pack a Bitmap into printer rows: 48 bytes per row, MSB first, 1 = black. */
export function packRows(bitmap) {
  if (bitmap.width !== PRINT_WIDTH) throw new Error(`bitmap must be ${PRINT_WIDTH} px wide`);
  const bpr = PRINT_WIDTH / 8;
  const out = new Uint8Array(bpr * bitmap.height);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < PRINT_WIDTH; x++) {
      if (bitmap.data[y * PRINT_WIDTH + x]) out[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/**
 * Build a whole print job.
 * @param {import('../engine/bitmap.js').Bitmap} bitmap
 * @param {{ density?: 1|2|3|4, extraFeed?: number }} [o] extraFeed in dots (0..255)
 * @returns {Uint8Array}
 */
export function buildJob(bitmap, { density = 2, extraFeed = 0 } = {}) {
  const [d, c] = DENSITY_LEVELS[Math.min(4, Math.max(1, density))];
  const bpr = PRINT_WIDTH / 8;
  const rows = new Uint8Array(bpr * TOP_PADDING_ROWS + bpr * bitmap.height);
  rows.set(packRows(bitmap), bpr * TOP_PADDING_ROWS);
  const height = rows.length / bpr;

  const out = [0x1b, 0x40, 0x1f, 0x11, 0x02, d, 0x1f, 0x11, 0x37, c, 0x1f, 0x11, 0x0b, 0x1f, 0x11, 0x35, 0x00];
  const chunks = [Uint8Array.from(out)];
  for (let start = 0; start < height; start += MAX_ROWS_PER_BLOCK) {
    const n = Math.min(MAX_ROWS_PER_BLOCK, height - start);
    chunks.push(Uint8Array.from([0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, n & 0xff, n >> 8]));
    chunks.push(rows.subarray(start * bpr, (start + n) * bpr));
  }
  chunks.push(Uint8Array.from([0x1b, 0x64, 0x02, 0x1b, 0x64, 0x02]));
  if (extraFeed > 0) chunks.push(Uint8Array.from([0x1b, 0x4a, Math.min(255, Math.round(extraFeed))]));

  const total = chunks.reduce((n, ch) => n + ch.length, 0);
  const job = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    job.set(ch, off);
    off += ch.length;
  }
  return job;
}
