/**
 * Sudoku generator and solver. Pure (no DOM): the grid is a flat array of 81 digits, 0 = empty.
 * Uniqueness is guaranteed: a clue is only removed if the solver still finds exactly one solution.
 */
import { shuffle } from '../engine/rng.js';

const ALL = 0x3fe; // bits 1..9

const units = (i) => [Math.floor(i / 9), i % 9, Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)];

/** Count solutions up to `limit`; copies the first one found into `out` when given. */
export function countSolutions(grid, limit = 2, out = null, rand = null) {
  const g = Int8Array.from(grid);
  const rows = new Int16Array(9);
  const cols = new Int16Array(9);
  const boxes = new Int16Array(9);
  for (let i = 0; i < 81; i++) {
    if (!g[i]) continue;
    const [r, c, b] = units(i);
    const bit = 1 << g[i];
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return 0;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  let found = 0;
  const search = () => {
    // Most constrained cell first.
    let best = -1;
    let bestMask = 0;
    let bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const [r, c, b] = units(i);
      const mask = ALL & ~(rows[r] | cols[c] | boxes[b]);
      let n = 0;
      for (let m = mask; m; m &= m - 1) n++;
      if (n < bestN) {
        best = i;
        bestMask = mask;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      found++;
      if (out && found === 1) out.set(g);
      return found >= limit;
    }
    if (bestN === 0) return false;
    const [r, c, b] = units(best);
    let digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rand) digits = shuffle(rand, digits);
    for (const d of digits) {
      const bit = 1 << d;
      g[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (search()) return true;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      g[best] = 0;
    }
    return false;
  };
  search();
  return found;
}

/** Target number of given digits. Fewer clues = harder (and slower to generate). */
export const CLUES = { easy: 40, medium: 32, hard: 26 };

/** @returns {{ puzzle: number[], solution: number[] }} */
export function generateSudoku(rand, difficulty = 'medium') {
  const solved = new Int8Array(81);
  countSolutions(new Int8Array(81), 1, solved, rand);
  const puzzle = Array.from(solved);
  const target = CLUES[difficulty] ?? CLUES.medium;
  let clues = 81;
  for (const i of shuffle(rand, [...Array(81).keys()])) {
    if (clues <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep;
    else clues--;
  }
  return { puzzle, solution: Array.from(solved) };
}

/** Does `grid` (fully filled) obey the sudoku rules? */
export function isValidSolution(grid) {
  const idx = [...Array(9).keys()];
  for (let k = 0; k < 9; k++) {
    const groups = [
      idx.map((j) => k * 9 + j),
      idx.map((j) => j * 9 + k),
      idx.map((j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)),
    ];
    for (const g of groups) if (new Set(g.map((i) => grid[i])).size !== 9 || g.some((i) => !(grid[i] >= 1 && grid[i] <= 9))) return false;
  }
  return true;
}
