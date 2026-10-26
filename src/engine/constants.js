/**
 * Physical constants of the Phomemo T02.
 * The print head is 384 dots wide at 203 dpi, i.e. 48 mm of printable width.
 */
export const PRINT_WIDTH = 384;
export const DPI = 203;
export const DOTS_PER_MM = DPI / 25.4; // ~7.99

/** Convert a length in dots to millimetres. */
export const dotsToMm = (dots) => dots / DOTS_PER_MM;

/** Convert millimetres to dots (rounded). */
export const mmToDots = (mm) => Math.round(mm * DOTS_PER_MM);

/**
 * Rough mechanical print time, same model as the macOS bridge
 * (0.125 mm per row, 0.11 s per mm).
 */
export const estimatePrintSeconds = (rows) => rows * 0.125 * 0.11;

/**
 * Longest page the macOS driver prints through ⌘P: its "Ticket 48 mm" paper
 * size is 48 × 297 mm (blank space trimmed). Longer tickets are split.
 */
export const MAX_PAGE_MM = 297;

/** Smallest text size that reads well on the T02 (tested on paper). */
export const MIN_TEXT_SIZE = 18;

/**
 * Paper presets → head density (1..4), tested on paper:
 * receipt paper needs the max, sticker paper prints well one notch lower.
 */
export const PAPERS = {
  ticket: { label: 'Ticket de caisse', density: 4 },
  sticker: { label: 'Autocollant', density: 3 },
};
