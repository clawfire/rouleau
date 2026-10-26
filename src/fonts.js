/**
 * Font registry. All fonts are open source (SIL OFL 1.1) and self-hosted:
 * no CDN, no tracking, works offline.
 *
 * `sizes` are the sizes the specimen prints by default (in px = printer dots;
 * 8 dots ≈ 1 mm). Pixel fonts list multiples of their design grid.
 */
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/archivo-black/latin-400.css';
import './fonts.css'; // Departure Mono (not on npm, vendored in src/assets/fonts)

export const FONTS = [
  {
    id: 'atkinson',
    family: 'Atkinson Hyperlegible',
    label: 'Atkinson Hyperlegible',
    role: 'Texte courant',
    weights: [400, 700],
    sizes: [16, 20, 24, 32],
  },
  {
    id: 'atkinson-mono',
    family: 'Atkinson Hyperlegible Mono',
    label: 'Atkinson Hyperlegible Mono',
    role: 'Mono lisible, listes, chiffres',
    weights: [400, 700],
    sizes: [16, 20, 24],
  },
  {
    id: 'jetbrains',
    family: 'JetBrains Mono',
    label: 'JetBrains Mono',
    role: 'Tickets GitHub / Jira',
    weights: [400, 700],
    sizes: [16, 20, 24],
  },
  {
    id: 'plex-mono',
    family: 'IBM Plex Mono',
    label: 'IBM Plex Mono',
    role: 'Tickets GitHub / Jira, plus chaleureuse',
    weights: [400, 600],
    sizes: [16, 20, 24],
  },
  {
    id: 'departure',
    family: 'Departure Mono',
    label: 'Departure Mono',
    role: 'Look reçu rétro (pixel font)',
    weights: [400],
    sizes: [11, 22, 33],
    note: 'Pixel font : nette uniquement en multiples de 11 px',
  },
  {
    id: 'archivo-black',
    family: 'Archivo Black',
    label: 'Archivo Black',
    role: 'Gros titres, bannières',
    weights: [400],
    sizes: [24, 40],
  },
];

export const fontById = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0];
