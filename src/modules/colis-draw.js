/**
 * Parcel label, design C « Ticket d'archive »: one thresholded `draw` block, 384 px wide, as tall as its
 * content. Black on white only, strokes >= 2 px, fonts bundled locally (Barlow Condensed, IBM Plex Mono).
 *
 * Layout units are printer dots. The text sizes follow the label spec (>= 11 px bold, >= 13 px body), not the
 * 18 px minimum of the other modules: the design was validated on paper at these sizes.
 */
import { draw } from '../engine/blocks.js';
import { PRINT_WIDTH } from '../engine/constants.js';
import { qrMatrix } from '../services/qr-payload.js';
import { ETAT_LABELS } from '../vinted/normalize.js';

const MONO = 'IBM Plex Mono';
const COND = 'Barlow Condensed';

export const FONTS = [
  `400 15px "${MONO}"`,
  `700 15px "${MONO}"`,
  `400 13px "${MONO}"`,
  `700 13px "${MONO}"`,
  `700 34px "${COND}"`,
  `800 76px "${COND}"`,
];

const PAD_X = 14;
const PAD_Y = 12;
const GAP = 10;
const QR_MODULE = 4; // 29 modules x 4 px = 116 px for a Vinted URL (QR version 3, ECC L)
const QR_MIN_MODULE = 3;

export const CHECKS = [
  ['photos', 'Photos'],
  ['pese', 'Pesé'],
  ['emballe', 'Emballé'],
  ['expedie', 'Expédié'],
];

/** One place sets the font, so measuring and drawing agree. */
function font(ctx, weight, size, family = MONO, spacing = 0) {
  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
}

const width = (ctx, s) => ctx.measureText(s).width;

/** `s` cut with a trailing … so that it fits `max` dots (current font). */
export function ellipsize(ctx, s, max) {
  if (width(ctx, s) <= max) return s;
  let cut = s.length;
  while (cut > 0 && width(ctx, `${s.slice(0, cut).trimEnd()}…`) > max) cut--;
  return cut > 0 ? `${s.slice(0, cut).trimEnd()}…` : '…';
}

/** Greedy word wrap (current font); words longer than a line are broken by characters. */
export function wrapWords(ctx, s, max) {
  const lines = [];
  let line = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (width(ctx, next) <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    let rest = word;
    while (width(ctx, rest) > max) {
      let n = rest.length - 1;
      while (n > 1 && width(ctx, rest.slice(0, n)) > max) n--;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** Up to 2 lines: the largest size from 34 down to 26 that fits, then truncation with …. */
export function fitTitle(ctx, title, max) {
  const upper = title.toUpperCase();
  for (let size = 34; size >= 26; size -= 2) {
    font(ctx, 700, size, COND);
    const lines = wrapWords(ctx, upper, max);
    if (lines.length <= 2) return { size, lines };
  }
  font(ctx, 700, 26, COND);
  const lines = wrapWords(ctx, upper, max);
  const rest = lines.slice(1).join(' ');
  return { size: 26, lines: [lines[0], ellipsize(ctx, rest, max)] };
}

/**
 * `a · b · c · **état**`, filled greedily line by line (3 lines max). Values are never cut mid-word unless one
 * alone is wider than a line; the state, always last and bold, is never dropped: attributes go first.
 * @returns {{ text: string, bold: boolean }[][]} lines of segments (each segment ends with its separator)
 */
export function fitAttributes(ctx, attributs, etat, max, maxLines = 3) {
  const etatLabel = etat ? ETAT_LABELS[etat] : '';
  const sep = ' · ';
  const list = attributs.filter(Boolean);
  const layout = (values) => {
    const tokens = [...values.map((text) => ({ text, bold: false })), ...(etatLabel ? [{ text: etatLabel, bold: true }] : [])];
    const lines = [[]];
    let used = 0;
    tokens.forEach((t, i) => {
      font(ctx, t.bold ? 700 : 400, 15);
      const last = i === tokens.length - 1;
      const w = width(ctx, t.text) + (last ? 0 : width(ctx, sep));
      const line = lines[lines.length - 1];
      if (line.length && used + w > max) {
        lines.push([]);
        used = 0;
      }
      lines[lines.length - 1].push({ ...t, text: last ? t.text : t.text + sep });
      used += w;
    });
    return lines;
  };
  let values = list;
  let lines = layout(values);
  while (lines.length > maxLines && values.length > 0) lines = layout((values = values.slice(0, -1)));
  // A value (or the state) wider than a whole line: cut it.
  for (const line of lines) {
    for (const seg of line) {
      font(ctx, seg.bold ? 700 : 400, 15);
      if (width(ctx, seg.text) > max) seg.text = ellipsize(ctx, seg.text, max);
    }
  }
  return lines.filter((l) => l.length);
}

const dotted = (ctx, y, x0 = PAD_X, x1 = PRINT_WIDTH - PAD_X) => {
  for (let x = x0; x < x1; x += 6) ctx.fillRect(x, y, Math.min(3, x1 - x), 2);
};

function box(ctx, x, y, size, checked) {
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  if (!checked) return;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + size - 4, y + size - 4);
  ctx.moveTo(x + size - 4, y + 4);
  ctx.lineTo(x + 4, y + size - 4);
  ctx.stroke();
}

/** Round stamp, double circle, tilted −12°. */
function stamp(ctx, cx, cy, date) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 50.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate((-12 * Math.PI) / 180);
  ctx.textAlign = 'center';
  font(ctx, 700, 11, MONO, 1);
  ctx.fillText('CONTRÔLÉ', 0, -23);
  font(ctx, 800, 32, COND, 0);
  ctx.fillText('PRÊT', 0, 12);
  font(ctx, 700, 11, MONO, 1);
  ctx.fillText(date || '', 0, 31);
  ctx.restore();
}

/** Grid cell value, shrunk to fit; empty → ____ to fill in with a pen. */
function cell(ctx, label, value, x, y, w) {
  font(ctx, 700, 11, MONO, 0);
  ctx.fillText(label, x + 8, y + 18);
  const text = value?.trim() || '____';
  let size = 20;
  font(ctx, 700, size);
  while (size > 13 && width(ctx, text) > w - 16) font(ctx, 700, --size);
  ctx.fillText(ellipsize(ctx, text, w - 16), x + 8, y + 18 + 4 + size);
}

/**
 * Paint the label with its top at y = 0 and return its height. Called once on a scratch canvas to size the
 * block, then for real: same code, same numbers.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../vinted/normalize.js').LabelData} d
 */
export function paintLabel(ctx, d) {
  const W = PRINT_WIDTH;
  const inner = W - PAD_X * 2;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textAlign = 'left';
  let y = PAD_Y;

  // 1. Banner
  font(ctx, 700, 13, MONO, 3);
  ctx.textAlign = 'center';
  ctx.fillText('— DÉPÔT · ARCHIVE · COLIS —', W / 2 + 1.5, y + 12);
  ctx.textAlign = 'left';
  y += 13 + GAP;

  // 2. Reference + stamp
  const stampD = 104;
  font(ctx, 700, 12, MONO, 0);
  ctx.fillText('BORDEREAU', PAD_X, y + 11);
  font(ctx, 800, 76, COND, 0);
  const ref = d.ref ? `#${d.ref}` : '#____';
  const refTop = y + 15;
  ctx.fillText(ref, PAD_X, refTop + 62);
  stamp(ctx, W - PAD_X - stampD / 2, y + stampD / 2, d.date);
  y += stampD + GAP;

  // 3. Rule
  dotted(ctx, y);
  y += 2 + GAP;

  // 4. Article
  font(ctx, 700, 12, MONO, 0);
  ctx.fillText('ARTICLE', PAD_X, y + 12);
  const channel = (d.source || 'vinted').toUpperCase();
  font(ctx, 700, 13, MONO, 1);
  const bw = Math.ceil(width(ctx, channel)) + 16;
  ctx.fillRect(W - PAD_X - bw, y, bw, 19);
  ctx.fillStyle = '#fff';
  ctx.fillText(channel, W - PAD_X - bw + 8, y + 14);
  ctx.fillStyle = '#000';
  y += 19 + 8;

  const t = fitTitle(ctx, d.titre?.trim() || '', inner);
  font(ctx, 700, t.size, COND, 0);
  const titleLine = Math.round(t.size * 0.98);
  for (const line of t.lines.filter(Boolean)) {
    ctx.fillText(line, PAD_X, y + Math.round(t.size * 0.82));
    y += titleLine;
  }
  if (!t.lines.filter(Boolean).length) {
    ctx.fillRect(PAD_X, y + 30, inner, 2); // no title: a line to write on
    y += titleLine;
  }
  y += 6;

  for (const line of fitAttributes(ctx, d.attributs ?? [], d.etat, inner)) {
    let x = PAD_X;
    for (const seg of line) {
      font(ctx, seg.bold ? 700 : 400, 15);
      ctx.fillText(seg.text, x, y + 14);
      x += width(ctx, seg.text);
    }
    y += 20;
  }

  const comp = d.complement?.trim();
  if (comp) {
    y += 4;
    font(ctx, 400, 13);
    const lines = wrapWords(ctx, comp, inner);
    const shown = lines.length > 2 ? [lines[0], ellipsize(ctx, lines.slice(1).join(' '), inner)] : lines;
    for (const l of shown) {
      ctx.fillText(l, PAD_X, y + 12);
      y += 17;
    }
  }
  y += GAP;

  // 5. Rule + checklist (2 columns)
  dotted(ctx, y);
  y += 2 + GAP;
  const colX = [PAD_X, PAD_X + Math.round(inner / 2)];
  CHECKS.forEach(([key, label], i) => {
    const x = colX[i % 2];
    const top = y + Math.floor(i / 2) * 26;
    box(ctx, x, top, 16, d.checklist?.[key]);
    font(ctx, 400, 16);
    ctx.fillText(label, x + 16 + 8, top + 13);
  });
  y += 26 + 16 + GAP;

  // 6. Grid + QR
  let matrix = null;
  let side = 0;
  let module = QR_MODULE;
  if (d.url) {
    matrix = qrMatrix(d.url, 'L');
    module = Math.max(QR_MIN_MODULE, Math.min(QR_MODULE, Math.floor(160 / matrix.size)));
    side = matrix.size * module;
  }
  const idH = matrix ? 16 : 0;
  const rowH = Math.max(side + idH, 128);
  const gridW = matrix ? W - PAD_X * 2 - GAP - side : inner;
  const half = Math.round(gridW / 2);
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD_X + 1, y + 1, gridW - 2, rowH - 2);
  const cellH = Math.round(rowH / 2);
  ctx.fillRect(PAD_X, y + cellH - 1, gridW, 2);
  ctx.fillRect(PAD_X + half - 1, y, 2, cellH);
  cell(ctx, 'POIDS', d.poids, PAD_X, y, half);
  cell(ctx, 'COLIS', d.colis, PAD_X + half, y, gridW - half);
  cell(ctx, 'DIMENSIONS', d.dimensions, PAD_X, y + cellH, gridW);

  if (matrix) {
    const qx = W - PAD_X - side;
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) if (matrix.isDark(r, c)) ctx.fillRect(qx + c * module, y + r * module, module, module);
    }
    if (d.id) {
      font(ctx, 700, 10, MONO, 0);
      ctx.textAlign = 'center';
      ctx.fillText(d.id, qx + side / 2, y + side + 12);
      ctx.textAlign = 'left';
    }
  }
  y += rowH + PAD_Y;
  return y;
}

/** The label as a block: scratch pass for the height, then the real thing. */
export function labelBlock(data, { level = 128 } = {}) {
  const scratch = document.createElement('canvas');
  scratch.width = PRINT_WIDTH;
  scratch.height = 1400;
  const height = Math.ceil(paintLabel(scratch.getContext('2d'), data));
  return draw(height, (ctx) => paintLabel(ctx, data), { fonts: FONTS, level });
}
