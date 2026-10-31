/**
 * Numberlink generator and solver. Pure (no DOM).
 * Rules: join each pair of equal numbers with a path; paths never cross and together they fill every cell.
 * A grid is { n, pairs: [a, b][] (cell indices, row-major), paths: number[][] (the solution, one cell list per pair) }.
 */
import { shuffle } from '../engine/rng.js';

const neighbours = (n, i) => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
};

/**
 * Count the ways to link the pairs and fill the whole grid, up to `limit`.
 * Paths grow one cell at a time from the first end of each pair; the most constrained path moves next,
 * which also means each solution is reached exactly once.
 */
export function countLinkSolutions(n, pairs, limit = 2) {
  const total = n * n;
  const nbr = Array.from({ length: total }, (_, i) => neighbours(n, i));
  const owner = new Int8Array(total).fill(-1);
  const head = pairs.map(([a]) => a);
  const target = pairs.map(([, b]) => b);
  const done = pairs.map(() => false);
  pairs.forEach(([a, b], k) => {
    owner[a] = k;
    owner[b] = k;
  });
  let filled = pairs.length * 2;
  let found = 0;

  /** Every empty cell needs two ways in: empty neighbours, or the open end of an unfinished path. */
  const starved = (cell) => {
    let open = 0;
    for (const j of nbr[cell]) {
      const o = owner[j];
      if (o < 0 || (!done[o] && (head[o] === j || target[o] === j))) open++;
    }
    return open < 2;
  };
  const deadEnds = () => {
    for (let i = 0; i < total; i++) if (owner[i] < 0 && starved(i)) return true;
    return false;
  };
  if (deadEnds()) return 0;

  const search = () => {
    if (filled === total && done.every(Boolean)) {
      found++;
      return found >= limit;
    }
    let bestK = -1;
    let bestMoves = null;
    for (let k = 0; k < pairs.length; k++) {
      if (done[k]) continue;
      const moves = nbr[head[k]].filter((j) => owner[j] < 0 || j === target[k]);
      if (bestMoves === null || moves.length < bestMoves.length) {
        bestK = k;
        bestMoves = moves;
        if (moves.length <= 1) break;
      }
    }
    if (bestK < 0) return false;
    const k = bestK;
    const from = head[k];
    for (const j of bestMoves) {
      if (j === target[k]) {
        done[k] = true;
        head[k] = j;
        if (!deadEnds() && search()) return true;
        done[k] = false;
        head[k] = from;
      } else {
        owner[j] = k;
        head[k] = j;
        filled++;
        if (!deadEnds() && search()) return true;
        filled--;
        head[k] = from;
        owner[j] = -1;
      }
    }
    return false;
  };
  search();
  return found;
}

/** A random Hamiltonian path of the grid: a snake, then shuffled with "backbite" moves. */
function randomSnake(n, rand) {
  let path = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
  for (let step = 0; step < n * n * 12; step++) {
    if (rand() < 0.5) path.reverse();
    const end = path[path.length - 1];
    const options = neighbours(n, end).filter((j) => j !== path[path.length - 2]);
    const q = options[Math.floor(rand() * options.length)];
    const at = path.indexOf(q);
    path = path.slice(0, at + 1).concat(path.slice(at + 1).reverse());
  }
  return path;
}

/** Cut a path into `count` pieces of at least `min` cells. */
function cut(path, count, min, rand) {
  const slack = path.length - count * min;
  if (slack < 0) return null;
  const extra = new Array(count).fill(0);
  for (let i = 0; i < slack; i++) extra[Math.floor(rand() * count)]++;
  const pieces = [];
  let at = 0;
  for (let k = 0; k < count; k++) {
    const len = min + extra[k];
    pieces.push(path.slice(at, at + len));
    at += len;
  }
  return pieces;
}

/** @returns {{ n: number, pairs: number[][], paths: number[][] }|null} */
export function generateLink(rand, n = 6, tries = 300) {
  for (let t = 0; t < tries; t++) {
    const path = randomSnake(n, rand);
    // A few different cuts per snake before drawing a new one.
    for (let u = 0; u < 6; u++) {
      const count = Math.round(n * 0.9) + Math.floor(rand() * 3);
      const paths = cut(path, count, 3, rand);
      if (!paths) continue;
      const shuffled = shuffle(rand, paths);
      const pairs = shuffled.map((p) => [p[0], p[p.length - 1]]);
      if (countLinkSolutions(n, pairs, 2) === 1) return { n, pairs, paths: shuffled };
    }
  }
  return null;
}

/** Do `paths` link every pair, avoid each other and cover the grid? */
export function isValidLink({ n, pairs, paths }) {
  const seen = new Set();
  for (const [k, p] of paths.entries()) {
    if (p[0] !== pairs[k][0] || p[p.length - 1] !== pairs[k][1]) return false;
    for (let i = 0; i < p.length; i++) {
      if (seen.has(p[i])) return false;
      seen.add(p[i]);
      if (i && !neighbours(n, p[i]).includes(p[i - 1])) return false;
    }
  }
  return seen.size === n * n;
}
