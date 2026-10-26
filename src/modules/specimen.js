/**
 * Font specimen ticket: prints every font at several sizes and weights,
 * plus a comparison of dithering algorithms, so choices are made on real paper.
 */
import { gradient, row, rule, space, text } from '../engine/blocks.js';
import { dotsToMm } from '../engine/constants.js';
import { DITHERS } from '../engine/dither.js';
import { FONTS } from '../fonts.js';

const CAPTION = { family: 'Departure Mono', size: 11, align: 'left' };

const parseSizes = (s) =>
  String(s ?? '')
    .split(/[,\s;]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 6 && n <= 160);

export default {
  id: 'specimen',
  label: 'Spécimen de fonts',
  icon: 'font',
  description: 'Chaque font à plusieurs tailles et graisses, plus une comparaison des tramages. Un ticket, et tu tranches.',

  defaults: {
    fonts: FONTS.map((f) => f.id),
    sample: 'Portez ce vieux whisky au juge blond qui fume.',
    charset: true,
    allWeights: false,
    customSizes: '',
    level: 128,
    dithers: true,
  },

  controls: [
    {
      type: 'checkboxes',
      key: 'fonts',
      label: 'Fonts',
      options: FONTS.map((f) => ({ value: f.id, label: f.label, hint: f.role })),
    },
    { type: 'textarea', key: 'sample', label: "Texte d'exemple", rows: 2 },
    {
      type: 'text',
      key: 'customSizes',
      label: 'Tailles (px)',
      hint: 'Vide = tailles conseillées par font. Ex. : 16, 20, 24. 8 px ≈ 1 mm.',
      placeholder: 'auto',
    },
    {
      type: 'slider',
      key: 'level',
      label: 'Seuil du texte',
      hint: "Plus haut = texte plus gras. 128 = neutre.",
      min: 64,
      max: 200,
      step: 4,
    },
    { type: 'switch', key: 'allWeights', label: 'Toutes les graisses' },
    { type: 'switch', key: 'charset', label: 'Ligne de caractères (chiffres, accents, symboles)' },
    { type: 'switch', key: 'dithers', label: 'Comparer les tramages' },
  ],

  /** @returns {object[]} blocks */
  build(v) {
    const now = new Date();
    const date = now.toLocaleDateString('fr-LU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('fr-LU', { hour: '2-digit', minute: '2-digit' });
    const custom = parseSizes(v.customSizes);
    const level = Number(v.level) || 128;

    const blocks = [
      text('Rouleau', { family: 'Archivo Black', size: 56, align: 'center', lineHeight: 1 }),
      text('spécimen de fonts', { family: 'Departure Mono', size: 22, align: 'center' }),
      space(6),
      row(date, time, { family: 'Departure Mono', size: 11 }),
      row('T02', '384 px · 203 dpi', { family: 'Departure Mono', size: 11 }),
      rule({ style: 'zigzag', thickness: 2 }),
    ];

    for (const font of FONTS.filter((f) => v.fonts.includes(f.id))) {
      blocks.push(
        space(6),
        text(font.label, {
          family: 'Atkinson Hyperlegible Mono',
          weight: 700,
          size: 18,
          invert: true,
          transform: 'uppercase',
        }),
        space(2),
        text(font.role + (font.note ? ` · ${font.note}` : ''), { ...CAPTION, size: 11 }),
        space(4),
      );

      const sizes = custom.length ? custom : font.sizes;
      const weights = v.allWeights ? font.weights : [font.weights[0]];
      for (const weight of weights) {
        for (const size of sizes) {
          blocks.push(
            text(`${size} px · ${dotsToMm(size).toFixed(1)} mm · ${weight}`, CAPTION),
            text(v.sample || font.label, { family: font.family, size, weight, level }),
            space(6),
          );
        }
      }

      if (v.charset) {
        const mid = sizes[Math.floor(sizes.length / 2)] ?? 20;
        blocks.push(
          text('Caractères', CAPTION),
          text('0123456789 €$£%&@#*+−=/ ?!«»\nÀÂÉÈÊËÎÏÔÙÛÜÇ àâéèêëîïôùûüç\n→ ✓ ✗ ☐ ☑ ★ ♥ • … — ¶', {
            family: font.family,
            size: mid,
            weight: font.weights[0],
            level,
          }),
        );
      }
      blocks.push(rule({ style: 'dashed', thickness: 2 }));
    }

    if (v.dithers) {
      blocks.push(
        space(6),
        text('Tramages', { family: 'Atkinson Hyperlegible Mono', weight: 700, size: 18, invert: true, transform: 'uppercase' }),
        space(6),
      );
      for (const d of DITHERS) {
        blocks.push(
          row(d.label, d.hint, { family: 'Departure Mono', size: 11, leader: false }),
          space(2),
          gradient({ dither: d.id, height: 40 }),
          space(8),
        );
      }
      blocks.push(rule({ style: 'dashed', thickness: 2 }));
    }

    blocks.push(
      space(4),
      text('Imprimé avec Rouleau', { family: 'Departure Mono', size: 11, align: 'center' }),
      rule({ style: 'zigzag', thickness: 2 }),
    );
    return blocks;
  },
};
