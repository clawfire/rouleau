import { Bitmap } from './bitmap.js';

/**
 * Split a tall ticket into pages of at most `maxRows` rows.
 * Cuts on block boundaries (bitmap.breaks) when possible, so a line of text
 * is never sliced in half; falls back to a hard cut for a single huge block.
 * @param {Bitmap} bitmap
 * @param {number} maxRows
 * @returns {Bitmap[]}
 */
export function paginate(bitmap, maxRows) {
  if (bitmap.height <= maxRows) return [bitmap];
  const breaks = bitmap.breaks ?? [];
  const pages = [];
  let start = 0;
  while (start < bitmap.height) {
    const limit = start + maxRows;
    if (limit >= bitmap.height) {
      pages.push(slice(bitmap, start, bitmap.height));
      break;
    }
    // Last block boundary that fits, ignoring cuts that would leave a tiny page.
    const cut = breaks.filter((y) => y > start + maxRows / 3 && y <= limit).pop() ?? limit;
    pages.push(slice(bitmap, start, cut));
    start = cut;
  }
  return pages;
}

function slice(bitmap, y0, y1) {
  const { width } = bitmap;
  return new Bitmap(width, y1 - y0, bitmap.data.slice(y0 * width, y1 * width));
}
