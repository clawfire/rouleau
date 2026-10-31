/**
 * Puzzle drawings (Canvas 2D, thresholded: black on white, no greys).
 * Each function returns a `draw` block; with `solved` it shows the answer instead, smaller and turned
 * upside down so it is not read by accident.
 */
import { draw } from '../engine/blocks.js';
import { PRINT_WIDTH } from '../engine/constants.js';

export const FONTS = ['700 28px "Atkinson Hyperlegible"', '400 20px "Departure Mono"'];

const BOLD = '"Atkinson Hyperlegible"';

/** Filled rectangle on integer pixels, so lines stay crisp after thresholding. */
const bar = (ctx, x, y, w, h) => ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));

/** Layout of an n×n grid centred on the ticket. */
function layout(n, cell) {
  const size = n * cell;
  return { size, ox: Math.round((PRINT_WIDTH - size) / 2), oy: 4, height: size + 8 };
}

/** The cell size that fills the ticket (puzzle) or a smaller block (answer). */
const cellFor = (n, solved) => Math.floor(((solved ? 252 : PRINT_WIDTH - 6)) / n);

/** Turn a drawer upside down around the centre of its block. */
function upright(ctx, W, H, solved, fn) {
  ctx.save();
  if (solved) {
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
  }
  fn();
  ctx.restore();
}

/* ---------- Sudoku ---------- */

export function sudoku(grid, { solved = false } = {}) {
  const cell = cellFor(9, solved);
  const { ox, oy, size, height } = layout(9, cell);
  return draw(height, (ctx, W, H) =>
    upright(ctx, W, H, solved, () => {
      ctx.fillStyle = '#000';
      for (let i = 0; i <= 9; i++) {
        const w = i % 3 === 0 ? 5 : 2;
        bar(ctx, ox + i * cell - w / 2, oy - 2, w, size + 4);
        bar(ctx, ox - 2, oy + i * cell - w / 2, size + 4, w);
      }
      ctx.font = `700 ${Math.round(cell * 0.62)}px ${BOLD}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      grid.forEach((d, i) => {
        if (!d) return;
        ctx.fillText(String(d), ox + (i % 9) * cell + cell / 2, oy + Math.floor(i / 9) * cell + cell * 0.72);
      });
    }),
  );
}

/* ---------- Star Battle ---------- */

function tile(paint) {
  const t = document.createElement('canvas');
  t.width = t.height = 8;
  const c = t.getContext('2d');
  c.fillStyle = '#000';
  paint(c);
  return t;
}

/** Light 1-bit textures; 0 = plain. They stay sparse so a pencil star still reads. */
const TEXTURES = [
  null,
  () => tile((c) => c.fillRect(2, 2, 2, 2)), // dots
  () => tile((c) => { for (let i = 0; i < 8; i++) c.fillRect(i, 7 - i, 1, 1); }), // diagonal hatch
];

/** Give touching regions different textures (greedy colouring). */
function textureOf({ n, regions }) {
  const near = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n * n; i++) {
    if (i % n < n - 1 && regions[i] !== regions[i + 1]) (near[regions[i]].add(regions[i + 1]), near[regions[i + 1]].add(regions[i]));
    if (i + n < n * n && regions[i] !== regions[i + n]) (near[regions[i]].add(regions[i + n]), near[regions[i + n]].add(regions[i]));
  }
  const tex = new Array(n).fill(-1);
  for (let r = 0; r < n; r++) {
    const taken = new Set([...near[r]].map((q) => tex[q]));
    tex[r] = [0, 1, 2].find((t) => !taken.has(t)) ?? 0;
  }
  return tex;
}

function star(ctx, cx, cy, R) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? R * 0.42 : R;
    ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export function stars(grid, { solved = false } = {}) {
  const { n, regions } = grid;
  const cell = cellFor(n, solved);
  const { ox, oy, size, height } = layout(n, cell);
  const tex = textureOf(grid);
  return draw(height, (ctx, W, H) =>
    upright(ctx, W, H, solved, () => {
      ctx.fillStyle = '#000';
      const pats = TEXTURES.map((make) => (make ? ctx.createPattern(make(), 'repeat') : null));
      for (let i = 0; i < n * n; i++) {
        const pat = pats[tex[regions[i]]];
        if (!pat) continue;
        ctx.fillStyle = pat;
        ctx.fillRect(ox + (i % n) * cell + 4, oy + Math.floor(i / n) * cell + 4, cell - 8, cell - 8);
      }
      ctx.fillStyle = '#000';
      const edge = (horizontal, r, c) => {
        const a = horizontal ? (r > 0 ? regions[(r - 1) * n + c] : -1) : c > 0 ? regions[r * n + c - 1] : -1;
        const b = r < n && c < n ? regions[r * n + c] : -1;
        const outer = a < 0 || b < 0;
        const w = outer || a !== b ? 5 : 2;
        const x = ox + c * cell;
        const y = oy + r * cell;
        if (horizontal) bar(ctx, x - (w > 2 ? 2 : 0), y - w / 2, cell + (w > 2 ? 4 : 0), w);
        else bar(ctx, x - w / 2, y - (w > 2 ? 2 : 0), w, cell + (w > 2 ? 4 : 0));
      };
      for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) edge(true, r, c);
      for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) edge(false, r, c);
      // The bottom and right outer edges have no cell below/after them: draw them as plain borders.
      bar(ctx, ox - 2, oy + size - 2, size + 4, 5);
      bar(ctx, ox + size - 2, oy - 2, 5, size + 4);
      if (solved) {
        // Clear the star background so it reads on top of the textures.
        grid.stars.forEach((c, r) => {
          const cx = ox + c * cell + cell / 2;
          const cy = oy + r * cell + cell / 2;
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx - cell * 0.4, cy - cell * 0.4, cell * 0.8, cell * 0.8);
          ctx.fillStyle = '#000';
          star(ctx, cx, cy, cell * 0.42);
        });
      }
    }),
  );
}

/* ---------- Numberlink ---------- */

export function link(grid, { solved = false } = {}) {
  const { n, pairs, paths } = grid;
  const cell = cellFor(n, solved);
  const { ox, oy, size, height } = layout(n, cell);
  const centre = (i) => [ox + (i % n) * cell + cell / 2, oy + Math.floor(i / n) * cell + cell / 2];
  return draw(height, (ctx, W, H) =>
    upright(ctx, W, H, solved, () => {
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      for (let i = 0; i <= n; i++) {
        const w = i === 0 || i === n ? 5 : 2;
        bar(ctx, ox + i * cell - w / 2, oy - 2, w, size + 4);
        bar(ctx, ox - 2, oy + i * cell - w / 2, size + 4, w);
      }
      if (solved) {
        ctx.lineWidth = Math.max(5, cell * 0.2);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const p of paths) {
          ctx.beginPath();
          p.forEach((i, k) => ctx[k ? 'lineTo' : 'moveTo'](...centre(i)));
          ctx.stroke();
        }
      }
      const r = Math.min(cell * 0.4, 20);
      ctx.font = `700 ${Math.max(18, Math.round(r * 1.15))}px ${BOLD}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      pairs.forEach((pair, k) => {
        for (const i of pair) {
          const [cx, cy] = centre(i);
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(String(k + 1), cx, cy + 1);
        }
      });
    }),
  );
}
