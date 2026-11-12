/**
 * Drawn parts of the improvement idea ticket: the header (a light bulb and a rubber stamp with the
 * card's column), the area chips and the effort gauge. All `draw` blocks, thresholded (no greys).
 */
import { draw } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';

const TITLE = (size) => `400 ${size}px "${TYPE.title.family}"`;
const MONO = `400 22px "${TYPE.caption.family}"`;
const STRONG = `700 22px "${TYPE.strong.family}"`;

/** Basecamp's default column names, in French. Unknown names print as they are. */
const COLUMN_FR = {
  'to review': 'À revoir',
  triage: 'À trier',
  accepted: 'Acceptée',
  approved: 'Acceptée',
  'in progress': 'En cours',
  doing: 'En cours',
  parked: 'En pause',
  'not now': 'Plus tard',
  'on hold': 'En pause',
  declined: 'Refusée',
  done: 'Livrée',
  shipped: 'Livrée',
};

export const columnLabel = (title) => COLUMN_FR[String(title ?? '').trim().toLowerCase()] ?? String(title ?? '').trim();

/** A light bulb with rays, centred on (cx, cy), about 2·r wide. */
function bulb(ctx, cx, cy, r) {
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Glass: a circle that narrows into the neck.
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 2.22);
  const neckY = cy + r * 1.05;
  ctx.lineTo(cx + r * 0.42, neckY);
  ctx.lineTo(cx - r * 0.42, neckY);
  ctx.closePath();
  ctx.stroke();
  // Filament.
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.3, neckY);
  ctx.lineTo(cx - r * 0.3, cy + r * 0.1);
  ctx.lineTo(cx - r * 0.1, cy - r * 0.15);
  ctx.lineTo(cx + r * 0.1, cy + r * 0.1);
  ctx.lineTo(cx + r * 0.3, cy - r * 0.15);
  ctx.lineTo(cx + r * 0.3, neckY);
  ctx.stroke();
  // Screw base: three solid bars, the last one rounded.
  const w = r * 0.84;
  for (let i = 0; i < 3; i++) ctx.fillRect(cx - w / 2 + i * 2, neckY + 4 + i * 8, w - i * 4, 5);
  ctx.beginPath();
  ctx.arc(cx, neckY + 28, r * 0.22, 0, Math.PI);
  ctx.fill();
  // Rays.
  ctx.lineWidth = 4;
  for (const a of [-150, -115, -90, -65, -30]) {
    const t = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(t) * (r + 8), cy + Math.sin(t) * (r + 8));
    ctx.lineTo(cx + Math.cos(t) * (r + 20), cy + Math.sin(t) * (r + 20));
    ctx.stroke();
  }
}

/** Rubber stamp: double border, tilted, text shrunk to fit. */
function stamp(ctx, label, cx, cy, maxW) {
  const text = label.toUpperCase();
  let size = 26;
  ctx.font = TITLE(size);
  while (size > 16 && ctx.measureText(text).width > maxW - 28) ctx.font = TITLE(--size);
  const w = Math.min(maxW, ctx.measureText(text).width + 28);
  const h = size + 22;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-7 * Math.PI) / 180);
  ctx.lineWidth = 4;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2);
  ctx.restore();
}

/** Bulb, "IDÉE / d'amélioration", and the column as a stamp on the right. */
export const header = (column, number) =>
  draw(
    120,
    (ctx, W) => {
      bulb(ctx, 38, 48, 22);
      ctx.textBaseline = 'alphabetic';
      ctx.font = TITLE(44);
      ctx.fillText('IDÉE', 84, 62);
      ctx.font = MONO;
      ctx.fillText('d’amélioration', 86, 90);
      if (number) ctx.fillText(number, 86, 114);
      if (column) stamp(ctx, column, W - 76, 34, 148); // top right, clear of the subtitle
    },
    { fonts: [TITLE(44), TITLE(26), MONO] },
  );

/** Area tags as outlined chips on one line; joined text if they do not fit. */
export const chips = (tags) =>
  draw(
    36,
    (ctx, W) => {
      ctx.font = STRONG;
      ctx.textBaseline = 'middle';
      const widths = tags.map((t) => ctx.measureText(t).width + 20);
      const total = widths.reduce((a, b) => a + b, 0) + (tags.length - 1) * 8;
      if (total > W) {
        ctx.textAlign = 'center';
        ctx.fillText(tags.join(' · '), W / 2, 18);
        return;
      }
      let x = Math.round((W - total) / 2);
      ctx.lineWidth = 3;
      tags.forEach((t, i) => {
        ctx.strokeRect(x + 1.5, 1.5, widths[i] - 3, 33);
        ctx.fillText(t, x + 10, 19);
        x += widths[i] + 8;
      });
    },
    { fonts: [STRONG] },
  );

/** "EFFORT ■ ■ □  Moyen": three drawn boxes, filled up to the level (0 = unknown, all hatched). */
export const effortGauge = (level, label) =>
  draw(
    40,
    (ctx, W) => {
      ctx.font = MONO;
      ctx.textBaseline = 'middle';
      ctx.fillText('EFFORT', 0, 20);
      const box = 28;
      const x0 = 110;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (box + 10);
        ctx.strokeRect(x + 1.5, 6.5, box - 3, box - 3);
        if (i < level) ctx.fillRect(x + 6, 11, box - 12, box - 12);
        else if (!level) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 6, 6 + box - 6);
          ctx.lineTo(x + box - 6, 12);
          ctx.stroke();
          ctx.lineWidth = 3;
        }
      }
      ctx.font = STRONG;
      ctx.textAlign = 'right';
      ctx.fillText(label, W, 20);
    },
    { fonts: [MONO, STRONG] },
  );

/** Dashed line with scissors in the middle: where to tear between two ideas. */
export const cutLine = () =>
  draw(
    28,
    (ctx, W) => {
      for (let x = 0; x < W; x += 12) if (x < W / 2 - 22 || x > W / 2 + 22) ctx.fillRect(x, 13, 7, 2);
      // Scissors: two rings and two crossed blades.
      const cx = W / 2;
      ctx.lineWidth = 2.5;
      for (const dy of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(cx - 12, 14 + dy, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 7, 10);
      ctx.lineTo(cx + 16, 20);
      ctx.moveTo(cx - 7, 18);
      ctx.lineTo(cx + 16, 8);
      ctx.stroke();
    },
  );
