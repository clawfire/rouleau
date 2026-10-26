/**
 * Ticket building blocks.
 *
 * A ticket is a vertical list of blocks, like a receipt. Modules only describe
 * blocks (plain objects); the engine turns each one into a 1-bit Bitmap.
 *
 * The key rule: text is THRESHOLDED (crisp), images are DITHERED (greys).
 */
import { Bitmap } from './bitmap.js';
import { PRINT_WIDTH } from './constants.js';
import { adjust, dither, luminance, threshold } from './dither.js';

/* ------------------------------------------------------------------ */
/* Builders: what modules use                                          */
/* ------------------------------------------------------------------ */

/**
 * Text paragraph, wrapped to the ticket width.
 * @param {string} content  supports \n for hard breaks
 * @param {object} [o]
 * @param {string} [o.family='Atkinson Hyperlegible']
 * @param {number} [o.size=22]          px (= dots)
 * @param {number|string} [o.weight=400]
 * @param {'left'|'center'|'right'} [o.align='left']
 * @param {number} [o.lineHeight=1.15]  multiple of the font's natural height
 * @param {number} [o.letterSpacing=0]  px
 * @param {number} [o.level=128]        threshold 0..255; higher = bolder
 * @param {boolean} [o.invert=false]    white text on a black band. ⚠️ Large solid areas print GREY
 *                                      on the T02 (the head limits energy per line): prefer `frame`.
 * @param {boolean|number} [o.frame=false] outlined band; a number sets the border thickness (default 3)
 * @param {number} [o.padY=0]           vertical padding inside the band
 * @param {string} [o.transform]        'uppercase'
 */
export const text = (content, o = {}) => ({ type: 'text', content: String(content ?? ''), ...o });

/** Key / value on one line, with optional dot leaders: "Squat ....... 3×8". */
export const row = (left, right, o = {}) => ({ type: 'row', left: String(left ?? ''), right: String(right ?? ''), ...o });

/** Horizontal rule. style: 'solid' | 'dashed' | 'dotted' | 'zigzag' */
export const rule = (o = {}) => ({ type: 'rule', style: 'solid', thickness: 2, margin: 8, ...o });

/** Vertical space in dots. */
export const space = (height = 8) => ({ type: 'space', height });

/**
 * Image (photo, logo…), scaled to fit the width then dithered.
 * @param {CanvasImageSource} source
 * @param {object} [o] { width, dither, brightness, contrast, gamma, invert, level, cell, align }
 */
export const image = (source, o = {}) => ({ type: 'image', source, ...o });

/** Grey ramp, handy to compare dithering algorithms on real paper. */
export const gradient = (o = {}) => ({ type: 'gradient', height: 40, dither: 'atkinson', ...o });

/**
 * Escape hatch: draw anything with the Canvas 2D API.
 * @param {number} height
 * @param {(ctx: CanvasRenderingContext2D, width: number, height: number) => void} draw
 * @param {{ mode?: 'threshold'|'dither', dither?: string, level?: number }} [o]
 */
export const draw = (height, fn, o = {}) => ({ type: 'draw', height, fn, mode: 'threshold', ...o });

/* ------------------------------------------------------------------ */
/* Renderers: block → Bitmap                                           */
/* ------------------------------------------------------------------ */

function makeCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  return { c, ctx };
}

/** CSS font shorthand for a text-ish block. */
export function fontString(b) {
  const family = b.family ?? 'Atkinson Hyperlegible';
  return `${b.italic ? 'italic ' : ''}${b.weight ?? 400} ${b.size ?? 22}px "${family}"`;
}

function setupText(ctx, b) {
  ctx.font = fontString(b);
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${b.letterSpacing ?? 0}px`;
  const m = ctx.measureText('Hgjy|ÉÀ');
  const ascent = Math.ceil(m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? (b.size ?? 22) * 0.8);
  const descent = Math.ceil(m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? (b.size ?? 22) * 0.2);
  const natural = ascent + descent;
  const lineH = Math.max(1, Math.round(natural * (b.lineHeight ?? 1.15)));
  return { ascent, descent, natural, lineH };
}

/** Greedy word wrap; very long words are broken by characters. */
function wrap(ctx, content, maxWidth) {
  const fits = (s) => ctx.measureText(s).width <= maxWidth;
  const lines = [];
  for (const para of content.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Start a new line with this word, hard-breaking it if it is wider than the ticket.
      let chunk = '';
      for (const ch of word) {
        if (!fits(chunk + ch) && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

function toBits(ctx, width, height, mode = 'threshold', opts = {}) {
  const lum = luminance(ctx.getImageData(0, 0, width, height));
  if (mode === 'dither') {
    adjust(lum, opts);
    return new Bitmap(width, height, dither(lum, width, height, opts.dither, opts));
  }
  return new Bitmap(width, height, threshold(lum, width, height, opts.level ?? 128));
}

function renderText(b, W, inset) {
  const content = b.transform === 'uppercase' ? b.content.toUpperCase() : b.content;
  const boxed = b.invert || b.frame;
  const border = b.frame ? (b.frame === true ? 3 : Number(b.frame)) : 0;
  const padY = b.padY ?? (boxed ? 6 + border : 0);
  const padX = boxed ? inset + 8 + border : inset;
  const probe = makeCanvas(1, 1).ctx;
  const metrics = setupText(probe, b);
  const lines = wrap(probe, content, W - padX * 2);
  const H = lines.length * metrics.lineH + padY * 2;
  const { ctx } = makeCanvas(W, H);
  setupText(ctx, b);
  const align = b.align ?? 'left';
  ctx.textAlign = align;
  const x = align === 'center' ? W / 2 : align === 'right' ? W - padX : padX;
  lines.forEach((line, i) => {
    const y = padY + i * metrics.lineH + Math.round((metrics.lineH - metrics.natural) / 2) + metrics.ascent;
    ctx.fillText(line, Math.round(x), y);
  });
  const bmp = toBits(ctx, W, H, 'threshold', { level: b.level });
  if (border) bmp.strokeRect(inset, 0, W - inset * 2, H, border);
  return b.invert ? bmp.invert() : bmp;
}

function renderRow(b, W, inset) {
  const probe = makeCanvas(1, 1).ctx;
  const metrics = setupText(probe, b);
  const H = metrics.lineH;
  const { ctx } = makeCanvas(W, H);
  setupText(ctx, b);
  const y = Math.round((H - metrics.natural) / 2) + metrics.ascent;
  const leftW = ctx.measureText(b.left).width;
  const rightW = ctx.measureText(b.right).width;
  ctx.textAlign = 'left';
  ctx.fillText(b.left, inset, y);
  ctx.textAlign = 'right';
  ctx.fillText(b.right, W - inset, y);
  if (b.leader !== false) {
    const dot = b.leader ?? '.';
    const dotW = ctx.measureText(dot).width || 1;
    const gap = 6;
    const from = inset + leftW + gap;
    const to = W - inset - rightW - gap;
    ctx.textAlign = 'left';
    for (let x = from; x + dotW <= to; x += dotW) ctx.fillText(dot, Math.round(x), y);
  }
  return toBits(ctx, W, H, 'threshold', { level: b.level });
}

function renderRule(b, W, inset) {
  const t = b.thickness ?? 2;
  const m = b.margin ?? 8;
  const style = b.style ?? 'solid';
  const zig = style === 'zigzag' ? 6 : 0;
  const H = m * 2 + t + zig * 2;
  const bmp = Bitmap.blank(H, W);
  const x0 = b.fullBleed ? 0 : inset;
  const x1 = b.fullBleed ? W : W - inset;
  for (let x = x0; x < x1; x++) {
    let on = true;
    if (style === 'dashed') on = (x - x0) % 12 < 7;
    if (style === 'dotted') on = (x - x0) % (t * 3) < t;
    if (!on) continue;
    const yz = zig ? Math.round(Math.abs(((x - x0) % (zig * 4)) - zig * 2) - zig) : 0;
    for (let y = 0; y < t; y++) bmp.set(x, m + zig + yz + y);
  }
  return bmp;
}

function renderImage(b, W, inset) {
  const src = b.source;
  const sw = src.naturalWidth ?? src.videoWidth ?? src.width;
  const sh = src.naturalHeight ?? src.videoHeight ?? src.height;
  const w = Math.min(W, Math.round(b.width ?? W));
  const h = Math.max(1, Math.round((sh / sw) * w));
  const { ctx } = makeCanvas(W, h);
  const align = b.align ?? 'center';
  const x = align === 'left' ? inset : align === 'right' ? W - inset - w : Math.round((W - w) / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, 0, w, h);
  return toBits(ctx, W, h, 'dither', { dither: b.dither ?? 'atkinson', ...b });
}

function renderGradient(b, W, inset) {
  const H = b.height ?? 40;
  const { ctx } = makeCanvas(W, H);
  const g = ctx.createLinearGradient(inset, 0, W - inset, 0);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(inset, 0, W - inset * 2, H);
  return toBits(ctx, W, H, 'dither', { dither: b.dither, cell: b.cell, level: b.level });
}

function renderDraw(b, W) {
  const H = Math.max(1, Math.round(b.height));
  const { ctx } = makeCanvas(W, H);
  b.fn(ctx, W, H);
  return toBits(ctx, W, H, b.mode, b);
}

/**
 * Render a single block.
 * @param {object} block
 * @param {{ width?: number, inset?: number }} [o]
 * @returns {Bitmap}
 */
export function renderBlock(block, { width = PRINT_WIDTH, inset = 0 } = {}) {
  switch (block.type) {
    case 'text':
      return renderText(block, width, inset);
    case 'row':
      return renderRow(block, width, inset);
    case 'rule':
      return renderRule(block, width, inset);
    case 'space':
      return Bitmap.blank(block.height, width);
    case 'image':
      return renderImage(block, width, inset);
    case 'gradient':
      return renderGradient(block, width, inset);
    case 'draw':
      return renderDraw(block, width);
    default:
      console.warn('[rouleau] unknown block type', block);
      return Bitmap.blank(0, width);
  }
}
