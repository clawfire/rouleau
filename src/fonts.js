/**
 * Font registry. All fonts are open source (SIL OFL 1.1) and self-hosted:
 * no CDN, no tracking, works offline.
 *
 * `sizes` are the sizes the specimen prints by default (in px = printer dots;
 * 8 dots ≈ 1 mm). Minimum readable size on paper: 18 px. Pixel fonts use
 * multiples of their design grid.
 */
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
import '@fontsource/archivo-black/latin-400.css';
import './fonts.css'; // Departure Mono (not on npm, vendored in src/assets/fonts)

export const FONTS = [
  {
    id: 'atkinson',
    family: 'Atkinson Hyperlegible',
    label: 'Atkinson Hyperlegible',
    role: 'Texte courant, symboles corrects',
    weights: [400, 700],
    sizes: [18, 24, 32],
  },
  {
    id: 'departure',
    family: 'Departure Mono',
    label: 'Departure Mono',
    role: 'Mono, look reçu rétro, tickets GitHub / Jira',
    weights: [400],
    sizes: [22, 33, 44],
    note: 'pixel font, multiples de 11 px',
  },
  {
    id: 'archivo-black',
    family: 'Archivo Black',
    label: 'Archivo Black',
    role: 'Titres, bannières, meilleurs symboles',
    weights: [400],
    sizes: [24, 40],
  },
];

/**
 * House typography, chosen from the printed specimen.
 * Modules should use these instead of hard-coding families.
 */
export const TYPE = {
  body: { family: 'Atkinson Hyperlegible', size: 22 },
  strong: { family: 'Atkinson Hyperlegible', size: 22, weight: 700 },
  mono: { family: 'Departure Mono', size: 22 },
  caption: { family: 'Departure Mono', size: 22 },
  title: { family: 'Archivo Black', size: 40, lineHeight: 1 },
  /** Section header: black band, solid at max density (receipt paper). */
  section: { family: 'Archivo Black', size: 22, invert: true, transform: 'uppercase', align: 'center' },
};

export const fontById = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0];
