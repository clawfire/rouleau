/**
 * Star Battle (1-star, "Queens"-like) generator and solver. Pure (no DOM).
 * Rules: one star per row, per column and per region; stars never touch, diagonals included.
 * A grid is { n, regions: number[n*n] (region id per cell, row-major), stars: number[n] (column of the star in each row) }.
 */
import { shuffle } from '../engine/rng.js';

/** Solutions (arrays of star columns) up to `limit`. */
function solveStars(n, regions, limit) {
  const cols = new Array(n).fill(false);
  const used = new Array(n).fill(false);
  const found = [];
  const stars = [];
  const place = (r, prev) => {
    if (r === n) {
      found.push([...stars]);
      return found.length >= limit;
    }
    for (let c = 0; c < n; c++) {
      if (cols[c] || (prev >= 0 && Math.abs(c - prev) <= 1)) continue;
      const reg = regions[r * n + c];
      if (used[reg]) continue;
      cols[c] = used[reg] = true;
      stars.push(c);
      const stop = place(r + 1, c);
      stars.pop();
      cols[c] = used[reg] = false;
      if (stop) return true;
    }
    return false;
  };
  place(0, -1);
  return found;
}

/** Count solutions up to `limit`. */
export const countStarSolutions = (n, regions, limit = 2) => solveStars(n, regions, limit).length;

/** Is the region still one connected piece without `cell`? */
function connectedWithout(n, regions, reg, cell) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === reg && i !== cell) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    const r = Math.floor(i / n);
    const c = i % n;
    for (const j of [r > 0 && i - n, r < n - 1 && i + n, c > 0 && i - 1, c < n - 1 && i + 1]) {
      if (j !== false && j !== cell && regions[j] === reg && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Nudge region borders to kill the alternative solutions one by one: move a cell of a rival
 * solution into a neighbouring region whenever that does not increase the solution count.
 */
function repair(n, regions, stars, rand, steps) {
  const isStar = (i) => stars[Math.floor(i / n)] === i % n;
  let count = solveStars(n, regions, 40).length;
  for (let k = 0; k < steps && count > 1; k++) {
    const rival = solveStars(n, regions, 40).filter((s) => s.some((c, r) => c !== stars[r]));
    const alt = rival[Math.floor(rand() * rival.length)];
    const r = Math.floor(rand() * n);
    const cell = r * n + alt[r];
    if (isStar(cell)) continue;
    const nbrs = [r > 0 && cell - n, r < n - 1 && cell + n, alt[r] > 0 && cell - 1, alt[r] < n - 1 && cell + 1].filter(
      (j) => j !== false && regions[j] !== regions[cell],
    );
    if (!nbrs.length || !connectedWithout(n, regions, regions[cell], cell)) continue;
    const old = regions[cell];
    regions[cell] = regions[nbrs[Math.floor(rand() * nbrs.length)]];
    const next = solveStars(n, regions, 40).length;
    if (next <= count) count = next;
    else regions[cell] = old;
  }
  return count;
}

/** A random placement of n non-touching stars, one per row and column. */
function randomStars(n, rand) {
  const cols = new Array(n).fill(false);
  const stars = [];
  const place = (r) => {
    if (r === n) return true;
    for (const c of shuffle(rand, [...Array(n).keys()])) {
      if (cols[c] || (r && Math.abs(c - stars[r - 1]) <= 1)) continue;
      cols[c] = true;
      stars.push(c);
      if (place(r + 1)) return true;
      stars.pop();
      cols[c] = false;
    }
    return false;
  };
  place(0);
  return stars;
}

/** Grow n regions from the star cells by random flood fill. */
function growRegions(n, stars, rand) {
  const regions = new Array(n * n).fill(-1);
  const frontier = [];
  stars.forEach((c, r) => {
    regions[r * n + c] = r;
    frontier.push(r * n + c);
  });
  let left = n * n - n;
  while (left > 0) {
    const i = Math.floor(rand() * frontier.length);
    const cell = frontier[i];
    const r = Math.floor(cell / n);
    const c = cell % n;
    const free = [];
    if (r > 0 && regions[cell - n] < 0) free.push(cell - n);
    if (r < n - 1 && regions[cell + n] < 0) free.push(cell + n);
    if (c > 0 && regions[cell - 1] < 0) free.push(cell - 1);
    if (c < n - 1 && regions[cell + 1] < 0) free.push(cell + 1);
    if (!free.length) {
      frontier.splice(i, 1);
      continue;
    }
    const next = free[Math.floor(rand() * free.length)];
    regions[next] = regions[cell];
    frontier.push(next);
    left--;
  }
  return regions;
}

/** @returns {{ n: number, regions: number[], stars: number[] }|null} null after `tries` failed attempts */
export function generateStars(rand, n = 8, tries = 200) {
  for (let t = 0; t < tries; t++) {
    const stars = randomStars(n, rand);
    const regions = growRegions(n, stars, rand);
    if (repair(n, regions, stars, rand, 400) === 1) return { n, regions, stars };
  }
  return null;
}

/** Does `stars` solve the grid? */
export function isValidStars({ n, regions, stars }) {
  if (stars.length !== n) return false;
  const cols = new Set(stars);
  const regs = new Set(stars.map((c, r) => regions[r * n + c]));
  if (cols.size !== n || regs.size !== n) return false;
  return stars.every((c, r) => r === 0 || Math.abs(c - stars[r - 1]) > 1);
}
