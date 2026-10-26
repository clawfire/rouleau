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
