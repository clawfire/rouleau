/**
 * Drawings for the oracle ticket: the 8-ball, the fortune cookie, tarot cards and dice.
 * Everything is plain Canvas 2D, black on white, and goes through the engine as `draw` blocks
 * (thresholded, never dithered): the answers stay crisp text, the shapes stay solid.
 */
import { draw } from '../engine/blocks.js';
import { MIN_TEXT_SIZE, PRINT_WIDTH } from '../engine/constants.js';

const ARCHIVO = 'Archivo Black';
const BODY = 'Atkinson Hyperlegible';
export const FONTS = [`40px "${ARCHIVO}"`, `700 22px "${BODY}"`, `400 22px "${BODY}"`];
const TAU = Math.PI * 2;
const W = PRINT_WIDTH;

const probe = document.createElement('canvas').getContext('2d');
const fontOf = (size, family = BODY, weight = 400) => `${weight} ${size}px "${family}"`;

/** Largest size (steps of 2) at which `str` fits `maxW`. */
function fit(str, family, weight, maxW, max, min = MIN_TEXT_SIZE) {
  for (let size = max; size > min; size -= 2) {
    probe.font = fontOf(size, family, weight);
    if (probe.measureText(str).width <= maxW) return size;
  }
  return min;
}

/** Greedy word wrap with the given font. */
function wrap(str, font, maxW) {
  probe.font = font;
  const lines = [];
  let line = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && probe.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/* ---------- Tiny canvas helpers ---------- */

const circ = (ctx, x, y, r, fill = true) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  fill ? ctx.fill() : ctx.stroke();
};
const poly = (ctx, pts, fill = false) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  fill ? ctx.fill() : ctx.stroke();
};
const line = (ctx, x1, y1, x2, y2) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};
const starPts = (n, ro, ri, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? ri : ro;
    const t = rot + (i * Math.PI) / n;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
const rays = (ctx, n, r0, r1) => {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    line(ctx, r0 * Math.cos(t), r0 * Math.sin(t), r1 * Math.cos(t), r1 * Math.sin(t));
  }
};
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};
const text = (ctx, str, x, y, { size, family = BODY, weight = 400, align = 'center', color = '#000' }) => {
  ctx.font = fontOf(size, family, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, Math.round(x), Math.round(y));
};

/* ---------- Magic 8-ball ---------- */

/** A black ball, a glare, and a round window with the answer in it. */
export function ball(mood, answer) {
  const D = 350;
  const H = D + 14;
  const r = 106; // window radius
  const font = fontOf(23, BODY, 700);
  const lines = wrap(answer, font, 168);
  const moodSize = fit(mood, ARCHIVO, 400, 176, 44, 28);
  return draw(
    H,
    (ctx) => {
      const cx = W / 2;
      const cy = H / 2;
      ctx.fillStyle = '#000';
      circ(ctx, cx, cy, D / 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2 - 20, Math.PI * 1.07, Math.PI * 1.4);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      circ(ctx, cx, cy + 10, r);
      circ(ctx, cx, cy - D / 2 + 50, 25);
      text(ctx, '8', cx, cy - D / 2 + 51, { size: 34, family: ARCHIVO });
      const lineH = 27;
      const total = moodSize * 1.15 + 6 + lines.length * lineH;
      let y = cy + 10 - total / 2 + (moodSize * 1.15) / 2;
      text(ctx, mood, cx, y, { size: moodSize, family: ARCHIVO });
      y += (moodSize * 1.15) / 2 + 6 + lineH / 2;
      for (const l of lines) {
        text(ctx, l, cx, y, { size: 23, weight: 700 });
        y += lineH;
      }
    },
    { fonts: FONTS },
  );
}

/* ---------- Fortune cookie ---------- */

/** A paper slip with the fortune, tucked into a black crescent cookie. */
export function cookie(fortune, numbers) {
  const slipW = 330;
  const lines = wrap(fortune, fontOf(24, BODY, 400), slipW - 36);
  const slipH = 22 + lines.length * 31 + 14 + 30 + 14;
  const H = slipH + 170;
  return draw(
    H,
    (ctx) => {
      const cx = W / 2;
      // slip, slightly tilted
      ctx.save();
      ctx.translate(cx, 8 + slipH / 2);
      ctx.rotate(-0.035);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      roundRect(ctx, -slipW / 2, -slipH / 2, slipW, slipH, 6);
      ctx.fill();
      ctx.stroke();
      let y = -slipH / 2 + 22 + 15;
      for (const l of lines) {
        text(ctx, l, 0, y, { size: 24 });
        y += 31;
      }
      y += 8;
      line(ctx, -slipW / 2 + 28, y - 8, slipW / 2 - 28, y - 8);
      text(ctx, numbers.join('  '), 0, y + 14, { size: 22, weight: 700 });
      ctx.restore();

      // a cookie broken in two: the halves lean away from each other and hold the slip in their V
      const R = 86;
      const baseY = slipH + 70;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * 34, baseY);
        ctx.scale(side, 1);
        ctx.rotate(0.5);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        // white rim along the break, a fold line, a few crumbs
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.66, -Math.PI * 0.36, Math.PI * 0.36);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(R * 0.16, -R * 0.78);
        ctx.quadraticCurveTo(R * 0.4, 0, R * 0.16, R * 0.78);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        circ(ctx, R * 0.78, -R * 0.2, 3.5);
        circ(ctx, R * 0.7, R * 0.32, 3);
        ctx.restore();
      }
    },
    { fonts: FONTS },
  );
}

/* ---------- Tarot ---------- */

/** One emblem per major arcanum, drawn in a box of side `s` centred on the origin. */
const EMBLEMS = [
  // 0 Le Mat: a spiral, a step into the void
  (ctx, a) => {
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * TAU * 3.1;
      const r = a * 0.1 + (a * 0.78 * i) / 240;
      ctx[i ? 'lineTo' : 'moveTo'](r * Math.cos(t), r * Math.sin(t));
    }
    ctx.stroke();
  },
  // I Le Bateleur: infinity above a table
  (ctx, a) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * TAU;
      const d = 1 + Math.sin(t) ** 2;
      ctx[i ? 'lineTo' : 'moveTo']((a * 1.05 * Math.cos(t)) / d, (a * 1.05 * Math.sin(t) * Math.cos(t)) / d - a * 0.15);
    }
    ctx.stroke();
    line(ctx, -a * 0.8, a * 0.55, a * 0.8, a * 0.55);
    line(ctx, -a * 0.6, a * 0.55, -a * 0.6, a * 0.9);
    line(ctx, a * 0.6, a * 0.55, a * 0.6, a * 0.9);
  },
  // II La Papesse: crescent over a book
  (ctx, a) => {
    circ(ctx, 0, -a * 0.2, a * 0.5);
    ctx.fillStyle = '#fff';
    circ(ctx, a * 0.22, -a * 0.28, a * 0.44);
    ctx.fillStyle = '#000';
    poly(ctx, [[-a * 0.8, a * 0.35], [0, a * 0.5], [a * 0.8, a * 0.35], [a * 0.8, a * 0.85], [0, a * 0.95], [-a * 0.8, a * 0.85]]);
    line(ctx, 0, a * 0.5, 0, a * 0.95);
  },
  // III L'Impératrice: Venus
  (ctx, a) => {
    circ(ctx, 0, -a * 0.28, a * 0.42, false);
    line(ctx, 0, a * 0.14, 0, a * 0.85);
    line(ctx, -a * 0.32, a * 0.5, a * 0.32, a * 0.5);
    circ(ctx, 0, -a * 0.28, a * 0.1);
  },
  // IV L'Empereur: a crowned throne
  (ctx, a) => {
    poly(ctx, [[-a * 0.55, -a * 0.1], [-a * 0.55, -a * 0.7], [-a * 0.28, -a * 0.38], [0, -a * 0.82], [a * 0.28, -a * 0.38], [a * 0.55, -a * 0.7], [a * 0.55, -a * 0.1]]);
    ctx.strokeRect(-a * 0.55, -a * 0.1, a * 1.1, a * 0.85);
    ctx.fillRect(-a * 0.55, a * 0.45, a * 1.1, a * 0.3);
  },
  // V Le Pape: the triple cross
  (ctx, a) => {
    line(ctx, 0, -a * 0.9, 0, a * 0.9);
    line(ctx, -a * 0.3, -a * 0.65, a * 0.3, -a * 0.65);
    line(ctx, -a * 0.45, -a * 0.35, a * 0.45, -a * 0.35);
    line(ctx, -a * 0.6, -a * 0.05, a * 0.6, -a * 0.05);
  },
  // VI L'Amoureux: two rings
  (ctx, a) => {
    circ(ctx, -a * 0.3, 0, a * 0.5, false);
    circ(ctx, a * 0.3, 0, a * 0.5, false);
    circ(ctx, 0, 0, a * 0.1);
  },
  // VII Le Chariot: a cart
  (ctx, a) => {
    ctx.strokeRect(-a * 0.8, -a * 0.35, a * 1.6, a * 0.65);
    line(ctx, -a * 0.8, -a * 0.35, -a * 0.55, -a * 0.8);
    line(ctx, a * 0.8, -a * 0.35, a * 0.55, -a * 0.8);
    line(ctx, -a * 0.55, -a * 0.8, a * 0.55, -a * 0.8);
    for (const x of [-a * 0.45, a * 0.45]) {
      circ(ctx, x, a * 0.45, a * 0.3, false);
      circ(ctx, x, a * 0.45, a * 0.07);
    }
  },
  // VIII La Justice: scales
  (ctx, a) => {
    line(ctx, 0, -a * 0.85, 0, a * 0.8);
    line(ctx, -a * 0.8, -a * 0.6, a * 0.8, -a * 0.6);
    line(ctx, -a * 0.35, a * 0.8, a * 0.35, a * 0.8);
    for (const s of [-1, 1]) {
      line(ctx, s * a * 0.8, -a * 0.6, s * a * 0.8, -a * 0.1);
      ctx.beginPath();
      ctx.arc(s * a * 0.8, -a * 0.1, a * 0.26, 0, Math.PI);
      ctx.fill();
    }
  },
  // IX L'Ermite: a lantern and a staff
  (ctx, a) => {
    ctx.strokeRect(-a * 0.35, -a * 0.2, a * 0.7, a * 0.8);
    poly(ctx, [[-a * 0.45, -a * 0.2], [0, -a * 0.65], [a * 0.45, -a * 0.2]]);
    poly(ctx, starPts(6, a * 0.22, a * 0.09).map(([x, y]) => [x, y + a * 0.2]), true);
    line(ctx, a * 0.75, -a * 0.9, a * 0.75, a * 0.9);
  },
  // X La Roue de Fortune
  (ctx, a) => {
    circ(ctx, 0, 0, a * 0.82, false);
    circ(ctx, 0, 0, a * 0.18);
    rays(ctx, 8, a * 0.18, a * 0.82);
  },
  // XI La Force: a lion's mane
  (ctx, a) => {
    circ(ctx, 0, 0, a * 0.42, false);
    rays(ctx, 14, a * 0.55, a * 0.85);
    circ(ctx, -a * 0.15, -a * 0.08, a * 0.06);
    circ(ctx, a * 0.15, -a * 0.08, a * 0.06);
    line(ctx, -a * 0.15, a * 0.15, a * 0.15, a * 0.15);
  },
  // XII Le Pendu: a gallows and a head down
  (ctx, a) => {
    line(ctx, -a * 0.8, -a * 0.85, a * 0.8, -a * 0.85);
    line(ctx, -a * 0.8, -a * 0.85, -a * 0.8, a * 0.9);
    line(ctx, a * 0.8, -a * 0.85, a * 0.8, a * 0.9);
    line(ctx, 0, -a * 0.85, 0, -a * 0.25);
    line(ctx, 0, -a * 0.25, 0, a * 0.35);
    circ(ctx, 0, a * 0.55, a * 0.2);
  },
  // XIII La Mort: a skull
  (ctx, a) => {
    circ(ctx, 0, -a * 0.15, a * 0.6, false);
    circ(ctx, -a * 0.24, -a * 0.18, a * 0.15);
    circ(ctx, a * 0.24, -a * 0.18, a * 0.15);
    poly(ctx, [[0, 0], [-a * 0.08, a * 0.14], [a * 0.08, a * 0.14]], true);
    ctx.strokeRect(-a * 0.32, a * 0.45, a * 0.64, a * 0.3);
    for (const x of [-a * 0.16, 0, a * 0.16]) line(ctx, x, a * 0.45, x, a * 0.75);
  },
  // XIV Tempérance: two jugs and a stream
  (ctx, a) => {
    poly(ctx, [[-a * 0.9, -a * 0.75], [-a * 0.4, -a * 0.75], [-a * 0.5, -a * 0.2], [-a * 0.8, -a * 0.2]]);
    poly(ctx, [[a * 0.4, a * 0.3], [a * 0.9, a * 0.3], [a * 0.8, a * 0.85], [a * 0.5, a * 0.85]]);
    ctx.beginPath();
    ctx.moveTo(-a * 0.4, -a * 0.65);
    ctx.bezierCurveTo(a * 0.1, -a * 0.65, -a * 0.1, a * 0.3, a * 0.5, a * 0.3);
    ctx.stroke();
  },
  // XV Le Diable: an inverted pentagram
  (ctx, a) => {
    circ(ctx, 0, a * 0.05, a * 0.82, false);
    poly(ctx, starPts(5, a * 0.8, a * 0.31, Math.PI / 2).map(([x, y]) => [x, y + a * 0.05]));
    poly(ctx, [[-a * 0.55, -a * 0.55], [-a * 0.45, -a * 0.95], [-a * 0.2, -a * 0.72]], true);
    poly(ctx, [[a * 0.55, -a * 0.55], [a * 0.45, -a * 0.95], [a * 0.2, -a * 0.72]], true);
  },
  // XVI La Maison Dieu: a tower struck by lightning
  (ctx, a) => {
    ctx.strokeRect(-a * 0.35, -a * 0.2, a * 0.7, a * 1.0);
    poly(ctx, [[-a * 0.45, -a * 0.2], [-a * 0.45, -a * 0.5], [-a * 0.25, -a * 0.5], [-a * 0.25, -a * 0.3], [a * 0.25, -a * 0.3], [a * 0.25, -a * 0.5], [a * 0.45, -a * 0.5], [a * 0.45, -a * 0.2]]);
    poly(ctx, [[a * 0.5, -a * 0.95], [a * 0.05, -a * 0.35], [a * 0.3, -a * 0.35], [-a * 0.1, a * 0.3], [a * 0.0, -a * 0.05], [-a * 0.2, -a * 0.05]], true);
  },
  // XVII L'Étoile
  (ctx, a) => {
    poly(ctx, starPts(8, a * 0.7, a * 0.26), true);
    for (const [x, y] of [[-a * 0.85, -a * 0.7], [a * 0.85, -a * 0.6], [-a * 0.8, a * 0.75], [a * 0.8, a * 0.8]]) circ(ctx, x, y, a * 0.07);
  },
  // XVIII La Lune
  (ctx, a) => {
    circ(ctx, 0, -a * 0.1, a * 0.6);
    ctx.fillStyle = '#fff';
    circ(ctx, a * 0.28, -a * 0.2, a * 0.52);
    ctx.fillStyle = '#000';
    for (const x of [-a * 0.55, -a * 0.1, a * 0.35, a * 0.8]) line(ctx, x, a * 0.65, x, a * 0.9);
  },
  // XIX Le Soleil
  (ctx, a) => {
    circ(ctx, 0, 0, a * 0.42);
    rays(ctx, 16, a * 0.56, a * 0.9);
  },
  // XX Le Jugement: a trumpet
  (ctx, a) => {
    poly(ctx, [[-a * 0.85, -a * 0.1], [a * 0.15, -a * 0.4], [a * 0.15, a * 0.4], [-a * 0.85, a * 0.1]]);
    line(ctx, a * 0.15, -a * 0.4, a * 0.35, -a * 0.55);
    line(ctx, a * 0.15, a * 0.4, a * 0.35, a * 0.55);
    for (const t of [-0.5, 0, 0.5]) line(ctx, a * 0.5, a * t * 0.9, a * 0.9, a * t * 1.5);
  },
  // XXI Le Monde: a wreath
  (ctx, a) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, a * 0.7, a * 0.9, 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * TAU;
      circ(ctx, a * 0.84 * Math.cos(t), a * 1.04 * Math.sin(t), a * 0.07);
    }
    poly(ctx, [[0, -a * 0.35], [a * 0.25, 0], [0, a * 0.35], [-a * 0.25, 0]], true);
  },
];

/**
 * A tarot card: double frame, numeral, emblem, name band. A reversed card has its emblem upside down.
 * @param {{ numeral: string, name: string, index: number }} card
 */
export function card({ numeral, name, index }, reversed, { w = 250, h = 400 } = {}) {
  const nameSize = fit(name, ARCHIVO, 400, w - 40, h > 350 ? 28 : 22, 20);
  const nameLines = wrap(name, fontOf(nameSize, ARCHIVO), w - 40);
  const band = nameLines.length * Math.round(nameSize * 1.2) + 20;
  return draw(
    h + 14,
    (ctx) => {
      const x = (W - w) / 2;
      const y = 7;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 6;
      roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 14);
      ctx.stroke();
      ctx.lineWidth = 2;
      roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 8);
      ctx.stroke();

      text(ctx, numeral, x + w / 2, y + 42, { size: fit(numeral, ARCHIVO, 400, w - 60, 40, 22), family: ARCHIVO });
      const top = y + 70;
      const bottom = y + h - 12 - band;
      const s = Math.min(w - 70, bottom - top - 10);
      ctx.save();
      ctx.translate(x + w / 2, (top + bottom) / 2);
      if (reversed) ctx.rotate(Math.PI);
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      ctx.lineWidth = Math.max(4, s / 26);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      EMBLEMS[index % EMBLEMS.length](ctx, s / 2);
      ctx.restore();

      ctx.fillStyle = '#000';
      ctx.fillRect(x + 12, y + h - 12 - band, w - 24, band);
      const lineH = Math.round(nameSize * 1.2);
      nameLines.forEach((l, i) => text(ctx, l, x + w / 2, y + h - 12 - band + 10 + lineH * (i + 0.5), { size: nameSize, family: ARCHIVO, color: '#fff' }));
    },
    { fonts: FONTS },
  );
}

/* ---------- Dice ---------- */

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** Regular polygon points. */
const ngon = (n, r, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [r * Math.cos(rot + (i * TAU) / n), r * Math.sin(rot + (i * TAU) / n)]);

function die(ctx, faces, value, s) {
  const a = s / 2;
  ctx.lineWidth = Math.max(4, s / 22);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  if (faces === 6) {
    roundRect(ctx, -a * 0.9, -a * 0.9, a * 1.8, a * 1.8, a * 0.28);
    ctx.stroke();
    for (const [px, py] of PIPS[value]) circ(ctx, px * a * 0.5, py * a * 0.5, a * 0.14);
    return;
  }
  let shape;
  let dy = 0;
  if (faces === 4) {
    shape = [[0, -a * 0.95], [a * 0.95, a * 0.75], [-a * 0.95, a * 0.75]];
    dy = a * 0.22;
  } else if (faces === 8) shape = [[0, -a], [a * 0.72, 0], [0, a], [-a * 0.72, 0]];
  else if (faces === 10 || faces === 100) shape = [[0, -a], [a * 0.78, -a * 0.1], [0, a], [-a * 0.78, -a * 0.1]];
  else if (faces === 12) shape = ngon(5, a * 0.98);
  else shape = ngon(6, a * 0.98, 0);
  poly(ctx, shape);
  if (faces === 20) poly(ctx, [shape[0], shape[2], shape[4]]);
  if (faces === 12) {
    // the inner pentagon, joined to the outer one vertex by vertex
    const inner = ngon(5, a * 0.5, -Math.PI / 2);
    poly(ctx, inner);
    shape.forEach(([x, y], i) => line(ctx, x, y, inner[i][0], inner[i][1]));
  }
  if (faces === 8) line(ctx, -a * 0.72, 0, a * 0.72, 0);
  if (faces === 10 || faces === 100) {
    line(ctx, 0, -a, 0, a);
    line(ctx, -a * 0.78, -a * 0.1, a * 0.78, -a * 0.1);
  }
  const label = String(value);
  // numbers sit on a white disc so the facets never cross them
  const size = fit(label, ARCHIVO, 400, a * (faces === 4 ? 0.8 : 0.95), Math.round(a * 0.5), 18);
  if (faces === 20 || faces === 10 || faces === 100 || faces === 8) {
    ctx.fillStyle = '#fff';
    circ(ctx, 0, dy, Math.max(a * 0.3, (label.length * size * 0.34) + 3));
    ctx.fillStyle = '#000';
  }
  text(ctx, label, 0, dy, { size, family: ARCHIVO });
}

/** Rows of dice, as many per row as fit; a single die is drawn big. */
export function dice(rolls, faces) {
  const n = rolls.length;
  const s = n === 1 ? 180 : n === 2 ? 150 : 108;
  const perRow = n <= 2 ? n : 3;
  const rows = Math.ceil(n / perRow);
  const gap = 16;
  const H = rows * (s + gap) + gap;
  return draw(
    H,
    (ctx) => {
      rolls.forEach((value, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, n - row * perRow);
        const col = i - row * perRow;
        const x0 = (W - (inRow * s + (inRow - 1) * gap)) / 2 + s / 2;
        ctx.save();
        ctx.translate(x0 + col * (s + gap), gap + row * (s + gap) + s / 2);
        die(ctx, faces, value, s);
        ctx.restore();
      });
    },
    { fonts: FONTS },
  );
}
