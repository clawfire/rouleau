/**
 * Jeux: sudoku, Star Battle and Numberlink. Every grid has exactly one solution (checked by a solver
 * while generating). The grid is seeded: it stays the same until you press "Nouvelle grille".
 */
import { rule, space, text } from '../engine/blocks.js';
import { prng } from '../engine/rng.js';
import { TYPE } from '../fonts.js';
import { FONTS as DRAW_FONTS, link, stars, sudoku } from './games-draw.js';
import { generateLink } from './games-link.js';
import { generateStars } from './games-stars.js';
import { generateSudoku } from './games-sudoku.js';

const LEVELS = { easy: 'facile', medium: 'moyen', hard: 'difficile' };

/** A generator can come back empty-handed on an unlucky seed: walk to the next seed, deterministically. */
function attempt(seed, make) {
  for (let i = 0; i < 20; i++) {
    const grid = make(prng(seed + i * 7919));
    if (grid) return grid;
  }
  throw new Error('no grid found');
}

const GAMES = {
  sudoku: {
    title: 'Sudoku',
    make: (v, rand) => generateSudoku(rand, v.level),
    draw: (g, solved) => sudoku(solved ? g.solution : g.puzzle, { solved }),
    sub: (v) => `9 × 9 · ${LEVELS[v.level]}`,
    rules: 'Chaque ligne, chaque colonne et chaque carré de 3 × 3 contient les chiffres de 1 à 9, une seule fois.',
  },
  stars: {
    title: 'Star Battle',
    make: (v, rand) => generateStars(rand, v.starsSize),
    draw: (g, solved) => stars(g, { solved }),
    sub: (v) => `${v.starsSize} × ${v.starsSize}`,
    rules: 'Une étoile par ligne, par colonne et par zone. Deux étoiles ne se touchent jamais, même en diagonale.',
  },
  link: {
    title: 'Numberlink',
    make: (v, rand) => generateLink(rand, v.linkSize),
    draw: (g, solved) => link(g, { solved }),
    sub: (v) => `${v.linkSize} × ${v.linkSize}`,
    rules: 'Relie les chiffres identiques par un chemin. Les chemins ne se croisent pas et remplissent toutes les cases.',
  },
};

/** build() runs on every control change: keep the last grid so toggling the answer does not regenerate it. */
let cached = { key: '', grid: null };

function gridFor(game, v) {
  const key = [game, v.seed, v.level, v.starsSize, v.linkSize].join('|');
  if (cached.key !== key) cached = { key, grid: attempt(v.seed, (rand) => GAMES[game].make(v, rand)) };
  return cached.grid;
}

export default {
  id: 'games',
  label: 'Jeux',
  icon: 'puzzle-piece',
  description: 'Sudoku, Star Battle et Numberlink. Chaque grille n’a qu’une seule solution, vérifiée par un solveur.',

  defaults: {
    game: 'sudoku',
    level: 'medium',
    starsSize: 7,
    linkSize: 6,
    solution: false,
    seed: Math.floor(Math.random() * 2 ** 31),
  },

  controls(v) {
    const schema = [
      {
        type: 'radio',
        key: 'game',
        label: 'Jeu',
        refresh: true,
        options: [
          { value: 'sudoku', label: 'Sudoku' },
          { value: 'stars', label: 'Star Battle' },
          { value: 'link', label: 'Numberlink' },
        ],
      },
    ];
    if (v.game === 'sudoku') {
      schema.push({
        type: 'radio',
        key: 'level',
        label: 'Difficulté',
        options: Object.entries(LEVELS).map(([value, label]) => ({ value, label: label[0].toUpperCase() + label.slice(1) })),
      });
    }
    if (v.game === 'stars') schema.push({ type: 'slider', key: 'starsSize', label: 'Taille de la grille', min: 5, max: 9, step: 1 });
    if (v.game === 'link') schema.push({ type: 'slider', key: 'linkSize', label: 'Taille de la grille', min: 5, max: 7, step: 1 });
    schema.push(
      { type: 'switch', key: 'solution', label: 'Imprimer la solution (en bas, à l’envers)' },
      {
        type: 'button',
        label: 'Nouvelle grille',
        variant: 'brand',
        refresh: false,
        onClick: (values) => (values.seed = Math.floor(Math.random() * 2 ** 31)),
      },
    );
    return schema;
  },

  async build(v) {
    const blocks = await puzzleBlocks(v);
    blocks.push(space(8), rule({ style: 'zigzag', thickness: 2 }), text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }));
    return blocks;
  },
};

/**
 * Header, grid and rules of one puzzle, optionally followed by its answer. Also used by the morning ticket.
 * @param {{ game: string, level: string, starsSize: number, linkSize: number, seed: number, solution?: boolean }} v
 */
export async function puzzleBlocks(v) {
  await Promise.all(DRAW_FONTS.map((f) => document.fonts.load(f, '0123456789').catch(() => null)));
  const key = v.game in GAMES ? v.game : 'sudoku';
  const game = GAMES[key];
  const grid = gridFor(key, v);
  const blocks = [
    text(game.title, TYPE.section),
    space(6),
    text(`${game.sub(v)} · n° ${v.seed % 10000}`, { ...TYPE.caption, align: 'center' }),
    space(6),
    game.draw(grid, false),
    space(6),
    text(game.rules, { ...TYPE.body, size: 20, align: 'center' }),
  ];
  if (v.solution) blocks.push(space(10), rule({ style: 'zigzag', thickness: 2 }), game.draw(grid, true));
  return blocks;
}
