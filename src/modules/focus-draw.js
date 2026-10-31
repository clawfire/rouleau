/**
 * Drawings of the time you commit to on the focus ticket: a clock face with the committed stretch
 * filled in, or a ruler with a bar at the real position of the block. Thresholded `draw` blocks.
 */
import { draw } from '../engine/blocks.js';

const MONO = '22px "Departure Mono"';
const MONO_S = '20px "Departure Mono"';

export const FONTS = [MONO, MONO_S];

const TAU = Math.PI * 2;

/** Angle of a time on a 12 h clock face, from the top (12 o'clock), clockwise. */
export const angleOf = (minutes) => ((((minutes % 720) + 720) % 720) / 720) * TAU - Math.PI / 2;

/** Whole hours shown by the ruler around a block that starts at `start` minutes and lasts `duration`. */
export function stripWindow(start, duration) {
  const first = Math.floor(start / 60);
  const last = Math.ceil((start + duration) / 60);
  return { first, last: Math.max(last, first + 1) };
}

const hourLabel = (h) => String(((h % 24) + 24) % 24).padStart(2, '0');

/** A 12 h clock; the stretch between `start` and `start + duration` is a solid wedge. */
export function dial(start, duration) {
  const R = 104;
  const H = 316;
  return draw(
    H,
    (ctx, W) => {
      const cx = W / 2;
      const cy = H / 2;
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      // The committed stretch.
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, angleOf(start), angleOf(start + Math.min(duration, 719)));
      ctx.closePath();
      ctx.fill();
      // Ring and hour marks (outside the ring, so the wedge never hides them).
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * TAU - Math.PI / 2;
        ctx.lineWidth = h % 3 === 0 ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
        ctx.lineTo(cx + Math.cos(a) * (R + (h % 3 === 0 ? 18 : 13)), cy + Math.sin(a) * (R + (h % 3 === 0 ? 18 : 13)));
        ctx.stroke();
      }
      ctx.font = MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [['12', 0, -1], ['3', 1, 0], ['6', 0, 1], ['9', -1, 0]].forEach(([label, dx, dy]) => ctx.fillText(label, cx + dx * (R + 38), cy + dy * (R + 38)));
      // Centre pin, white so it shows on the wedge.
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, TAU);
      ctx.fill();
    },
    { fonts: [MONO] },
  );
}

/** A ruler of whole hours with the block as a bar at its real position. */
export function strip(start, duration) {
  const { first, last } = stripWindow(start, duration);
  const PAD = 8;
  const H = 104;
  return draw(
    H,
    (ctx, W) => {
      const span = (last - first) * 60;
      const x = (min) => PAD + ((min - first * 60) / span) * (W - PAD * 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(x(start)), 6, Math.max(4, Math.round(x(start + duration) - x(start))), 38);
      ctx.fillRect(PAD, 54, W - PAD * 2, 4);
      for (let m = first * 60; m <= last * 60; m += 15) {
        const hour = m % 60 === 0;
        ctx.fillRect(Math.round(x(m)) - 1, hour ? 54 : 54, 3, hour ? 22 : 12);
      }
      ctx.font = MONO_S;
      ctx.textBaseline = 'alphabetic';
      for (let h = first; h <= last; h++) {
        ctx.textAlign = h === first ? 'left' : h === last ? 'right' : 'center';
        ctx.fillText(hourLabel(h), Math.round(x(h * 60)) + (h === first ? -2 : h === last ? 2 : 0), 98);
      }
    },
    { fonts: [MONO_S] },
  );
}
