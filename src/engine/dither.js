/**
 * Grey → 1-bit conversion.
 *
 * Every function takes a luminance buffer (Float32Array, 0 = black, 255 = white)
 * and returns a Uint8Array where 1 = burn (black).
 *
 * Rule of thumb on a thermal head:
 *   - text and line art → `threshold` (crisp edges, no noise)
 *   - photos and greys  → `atkinson` (lighter, punchy) or `floyd` (smoother)
 */

/** Available algorithms, in the order the UI lists them. */
export const DITHERS = [
  { id: 'atkinson', label: 'Atkinson', hint: 'Par défaut : blancs purs, contrasté' },
  { id: 'bayer', label: 'Bayer 8×8', hint: 'Trame régulière, rétro' },
  { id: 'threshold', label: 'Seuil', hint: 'Noir ou blanc, sans nuance' },
  { id: 'floyd', label: 'Floyd–Steinberg', hint: 'Doux, mais jamais blanc pur' },
  { id: 'halftone', label: 'Halftone', hint: 'Points de trame, moyen sur T02' },
];

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Brightness / contrast / gamma, applied in place before dithering.
 * @param {Float32Array} lum
 * @param {{ brightness?: number, contrast?: number, gamma?: number, invert?: boolean }} adj
 *   brightness and contrast in -100..100, gamma in 0.2..3 (1 = neutral)
 */
export function adjust(lum, { brightness = 0, contrast = 0, gamma = 1, invert = false } = {}) {
  const c = (100 + contrast) / 100;
  const k = c * c; // perceptually nicer than a linear factor
  const b = brightness * 2.55;
  const g = 1 / Math.max(0.05, gamma);
  for (let i = 0; i < lum.length; i++) {
    let v = (lum[i] - 128) * k + 128 + b;
    v = 255 * Math.pow(clamp(v) / 255, g);
    lum[i] = invert ? 255 - v : v;
  }
  return lum;
}

export function threshold(lum, width, height, level = 128) {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = lum[i] < level ? 1 : 0;
  return out;
}

/** Floyd–Steinberg, serpentine scan to avoid diagonal worms. */
export function floyd(lum, width, height) {
  const buf = Float32Array.from(lum);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const ltr = y % 2 === 0;
    for (let i = 0; i < width; i++) {
      const x = ltr ? i : width - 1 - i;
      const dir = ltr ? 1 : -1;
      const idx = y * width + x;
      const old = buf[idx];
      const val = old < 128 ? 0 : 255;
      out[idx] = val === 0 ? 1 : 0;
      const err = old - val;
      const xn = x + dir;
      const xp = x - dir;
      if (xn >= 0 && xn < width) buf[idx + dir] += (err * 7) / 16;
      if (y + 1 < height) {
        const row = idx + width;
        if (xp >= 0 && xp < width) buf[row - dir] += (err * 3) / 16;
        buf[row] += (err * 5) / 16;
        if (xn >= 0 && xn < width) buf[row + dir] += err / 16;
      }
    }
  }
  return out;
}

/** Atkinson: diffuses only 6/8 of the error, which keeps highlights clean. */
export function atkinson(lum, width, height) {
  const buf = Float32Array.from(lum);
  const out = new Uint8Array(width * height);
  const spread = [
    [1, 0], [2, 0],
    [-1, 1], [0, 1], [1, 1],
    [0, 2],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const val = old < 128 ? 0 : 255;
      out[idx] = val === 0 ? 1 : 0;
      const err = (old - val) / 8;
      for (const [dx, dy] of spread) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny < height) buf[ny * width + nx] += err;
      }
    }
  }
  return out;
}

const BAYER8 = (() => {
  // Classic recursive construction of the 8×8 Bayer matrix.
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length;
    const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    m = next;
  }
  return m.map((row) => row.map((v) => ((v + 0.5) / 64) * 255));
})();

export function bayer(lum, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      out[idx] = lum[idx] < BAYER8[y % 8][x % 8] ? 1 : 0;
    }
  }
  return out;
}

/**
 * Halftone dots on a square grid: each cell gets one round dot whose
 * area matches the cell's average darkness.
 */
export function halftone(lum, width, height, cell = 6) {
  const out = new Uint8Array(width * height);
  const half = cell / 2;
  for (let cy = 0; cy < height; cy += cell) {
    for (let cx = 0; cx < width; cx += cell) {
      let sum = 0;
      let n = 0;
      for (let y = cy; y < Math.min(cy + cell, height); y++) {
        for (let x = cx; x < Math.min(cx + cell, width); x++) {
          sum += lum[y * width + x];
          n++;
        }
      }
      const darkness = 1 - sum / n / 255;
      // Dot area = darkness × cell area  →  r = cell × sqrt(darkness / π)
      const r = cell * Math.sqrt(darkness / Math.PI);
      const r2 = r * r;
      for (let y = cy; y < Math.min(cy + cell, height); y++) {
        for (let x = cx; x < Math.min(cx + cell, width); x++) {
          const dx = x - cx - half + 0.5;
          const dy = y - cy - half + 0.5;
          if (dx * dx + dy * dy <= r2) out[y * width + x] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Dispatch by algorithm id.
 * @param {string} algo one of DITHERS[].id
 * @param {{ level?: number, cell?: number }} [opts]
 */
export function dither(lum, width, height, algo = 'atkinson', opts = {}) {
  switch (algo) {
    case 'floyd':
      return floyd(lum, width, height);
    case 'bayer':
      return bayer(lum, width, height);
    case 'halftone':
      return halftone(lum, width, height, opts.cell ?? 6);
    case 'threshold':
      return threshold(lum, width, height, opts.level ?? 128);
    case 'atkinson':
    default:
      return atkinson(lum, width, height);
  }
}

/** Read luminance (Rec. 601) from canvas RGBA pixels, alpha composited on white. */
export function luminance(imageData) {
  const { data, width, height } = imageData;
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const a = data[p + 3] / 255;
    const l = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    lum[i] = l * a + 255 * (1 - a);
  }
  return lum;
}
