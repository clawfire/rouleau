/**
 * Font specimen ticket: prints every font at several sizes and weights,
 * plus a comparison of dithering algorithms, so choices are made on real paper.
 */
import { gradient, row, rule, space, text } from '../engine/blocks.js';
import { MIN_TEXT_SIZE, dotsToMm } from '../engine/constants.js';
import { DITHERS } from '../engine/dither.js';
import { FONTS, TYPE } from '../fonts.js';

const parseSizes = (s) =>
  String(s ?? '')
    .split(/[,\s;]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= MIN_TEXT_SIZE && n <= 160);

export default {
  id: 'specimen',
  label: 'Spécimen de fonts',
  icon: 'font',
  group: 'dev', // listed under the collapsed "Développeurs" section of the menu
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
      hint: `Vide = tailles conseillées. Minimum lisible : ${MIN_TEXT_SIZE} px. 8 px ≈ 1 mm.`,
      placeholder: 'auto',
    },
    {
      type: 'slider',
      key: 'level',
      label: 'Seuil du texte',
      hint: 'Plus haut = texte plus gras. 128 = neutre.',
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
      text('Rouleau', { ...TYPE.title, size: 56, align: 'center' }),
      text('spécimen de fonts', { ...TYPE.mono, align: 'center' }),
      space(6),
      row(date, time, TYPE.caption),
      rule({ style: 'zigzag', thickness: 2 }),
    ];

    for (const font of FONTS.filter((f) => v.fonts.includes(f.id))) {
      blocks.push(
        space(8),
        text(font.label, TYPE.section),
        space(4),
        text(font.role + (font.note ? ` · ${font.note}` : ''), TYPE.caption),
        space(6),
      );

      const sizes = custom.length ? custom : font.sizes;
      const weights = v.allWeights ? font.weights : [font.weights[0]];
      for (const weight of weights) {
        for (const size of sizes) {
          blocks.push(
            text(`${size} px · ${dotsToMm(size).toFixed(1)} mm · ${weight}`, TYPE.caption),
            text(v.sample || font.label, { family: font.family, size, weight, level }),
            space(8),
          );
        }
      }

      if (v.charset) {
        const mid = sizes[Math.floor(sizes.length / 2)] ?? 24;
        blocks.push(
          text('Caractères', TYPE.caption),
          text('0123456789 €$£%&@#*+−=/ ?!«»\nÀÂÉÈÊËÎÏÔÙÛÜÇ àâéèêëîïôùûüç\n→ ✓ ✗ ★ ♥ • … — ¶', {
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
      blocks.push(space(8), text('Tramages', TYPE.section), space(8));
      for (const d of DITHERS) {
        blocks.push(
          text(d.label, TYPE.caption),
          gradient({ dither: d.id, height: 40 }),
          space(10),
        );
      }
      blocks.push(rule({ style: 'dashed', thickness: 2 }));
    }

    blocks.push(
      space(4),
      text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }),
      rule({ style: 'zigzag', thickness: 2 }),
    );
    return blocks;
  },
};
