/**
 * Canvas drawings for the morning ticket: weather icons, the weather headline,
 * and list items with a hanging indent (time or checkbox on the left, wrapped text on the right).
 * They return `draw` blocks, so the engine thresholds them like any other text.
 */
import { draw } from '../engine/blocks.js';

const MONO = '22px "Departure Mono"';
const BODY = '22px "Atkinson Hyperlegible"';
const BODY_BOLD = '700 22px "Atkinson Hyperlegible"';
const TITLE = '44px "Archivo Black"';
const LINE = 26;

/** Fonts must be loaded before measuring text. */
export const fontsReady = () => Promise.all([MONO, BODY, BODY_BOLD, TITLE].map((f) => document.fonts.load(f)));

const scratch = document.createElement('canvas').getContext('2d');

function wrap(font, content, maxWidth) {
  scratch.font = font;
  const lines = [];
  let line = '';
  for (const word of String(content).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && scratch.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/**
 * One list entry: a lead (time) or a drawn checkbox, then wrapped text.
 * @param {string} body
 * @param {object} o
 * @param {string} [o.lead]       text in the left column (monospace)
 * @param {number} [o.leadWidth]  width of the left column
 * @param {boolean} [o.box]       draw a checkbox instead of a lead
 * @param {boolean} [o.write]     empty entry: a dotted write-in line after the box
 * @param {boolean} [o.bold]
 */
export function item(body, { lead = '', leadWidth = 0, box = false, write = false, bold = false } = {}) {
  const BOX = 24;
  const indent = box ? BOX + 12 : leadWidth;
  const font = bold ? BODY_BOLD : BODY;
  const lines = wrap(font, body, 384 - indent);
  const height = Math.max(box ? BOX + 10 : 0, lines.length * LINE) + 8;
  return draw(
    height,
    (ctx, W) => {
      ctx.textBaseline = 'top';
      if (lead) {
        ctx.font = MONO;
        ctx.fillText(lead, 0, 4);
      }
      if (box) {
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 5.5, BOX - 3, BOX - 3);
      }
      ctx.font = font;
      lines.forEach((l, i) => ctx.fillText(l, indent, 4 + i * LINE));
      if (write && !body) {
        for (let x = indent; x < W; x += 6) ctx.fillRect(x, BOX - 1, 2, 2);
      }
    },
    { fonts: [MONO, font] },
  );
}

/** Width of the monospace time column ("09:30" + gap). */
export function timeColumn() {
  scratch.font = MONO;
  return Math.ceil(scratch.measureText('00:00').width) + 14;
}

/* ---------- Weather ---------- */

function cloud(ctx, x, y, s) {
  // Flat-bottomed cloud inside an s × s box at (x, y).
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y + s * 0.75);
  ctx.arc(x + s * 0.28, y + s * 0.55, s * 0.2, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + s * 0.5, y + s * 0.38, s * 0.25, Math.PI, Math.PI * 1.95);
  ctx.arc(x + s * 0.76, y + s * 0.55, s * 0.2, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.stroke();
}

function sun(ctx, cx, cy, r, rays = 8) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6));
    ctx.lineTo(cx + Math.cos(a) * (r + 13), cy + Math.sin(a) * (r + 13));
    ctx.stroke();
  }
}

/** Draw a weather icon in a 72 × 72 box at (x, y). */
export function icon(ctx, kind, x, y) {
  const s = 72;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'sun':
      sun(ctx, x + s / 2, y + s / 2, 16);
      break;
    case 'partly':
      sun(ctx, x + s * 0.36, y + s * 0.36, 11, 6);
      cloud(ctx, x + s * 0.18, y + s * 0.22, s * 0.82);
      break;
    case 'cloud':
      cloud(ctx, x, y, s);
      break;
    case 'fog':
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 8 + (i % 2) * 8, y + 14 + i * 14);
        ctx.lineTo(x + s - 8 - ((i + 1) % 2) * 8, y + 14 + i * 14);
        ctx.stroke();
      }
      break;
    case 'rain':
      cloud(ctx, x, y - 6, s);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 22 + i * 14, y + 52);
        ctx.lineTo(x + 16 + i * 14, y + 66);
        ctx.stroke();
      }
      break;
    case 'snow':
      cloud(ctx, x, y - 6, s);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 20 + i * 16, y + 60, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
      }
      break;
    case 'storm':
      cloud(ctx, x, y - 6, s);
      ctx.beginPath();
      ctx.moveTo(x + 40, y + 46);
      ctx.lineTo(x + 28, y + 60);
      ctx.lineTo(x + 38, y + 60);
      ctx.lineTo(x + 30, y + 72);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Icon on the left, big max / min temperatures and the sky description on the right. */
export function weatherHeadline({ kind, label, tMax, tMin }) {
  return draw(
    84,
    (ctx) => {
      icon(ctx, kind, 4, 6);
      ctx.textBaseline = 'alphabetic';
      ctx.font = TITLE;
      ctx.fillText(`${tMax}°`, 96, 48);
      const w = ctx.measureText(`${tMax}°`).width;
      ctx.font = BODY_BOLD;
      ctx.fillText(`/ ${tMin}°`, 96 + w + 8, 48);
      ctx.font = BODY;
      ctx.fillText(label, 96, 76);
    },
    { fonts: [TITLE, BODY, BODY_BOLD] },
  );
}
