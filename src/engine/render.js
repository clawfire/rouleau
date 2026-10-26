import { Bitmap } from './bitmap.js';
import { renderBlock, fontString } from './blocks.js';
import { PRINT_WIDTH } from './constants.js';

/**
 * Make sure every font used by the blocks is loaded before measuring text,
 * otherwise the first render silently falls back to a system font.
 */
async function ensureFonts(blocks) {
  if (!document.fonts?.load) return;
  const fonts = new Set([
    ...blocks.filter((b) => ['text', 'row', 'check'].includes(b.type)).map((b) => fontString(b)),
    ...blocks.flatMap((b) => b.fonts ?? []), // `draw` blocks list the fonts they use
  ]);
  await Promise.all([...fonts].map((f) => document.fonts.load(f, 'AaÉé09€').catch(() => null)));
}

/**
 * Turn a list of blocks into the final 1-bit ticket.
 * @param {object[]} blocks
 * @param {{ inset?: number, top?: number, bottom?: number, width?: number }} [o]
 *   inset: horizontal margin in dots (0: the T02 already leaves a physical margin),
 *   top/bottom: blank dots around the content
 * @returns {Promise<Bitmap>}
 */
export async function renderTicket(blocks, { inset = 0, top = 8, bottom = 16, width = PRINT_WIDTH } = {}) {
  await ensureFonts(blocks);
  const parts = [Bitmap.blank(top, width)];
  for (const b of blocks) {
    try {
      parts.push(renderBlock(b, { width, inset }));
    } catch (err) {
      console.error('[rouleau] block failed', b, err);
    }
  }
  parts.push(Bitmap.blank(bottom, width));
  const bitmap = Bitmap.stack(parts, width);
  // Y offsets between blocks: safe places to cut the ticket into pages.
  bitmap.breaks = [];
  let y = 0;
  for (const p of parts) bitmap.breaks.push((y += p.height));
  return bitmap;
}
