/**
 * Pure luminance operations for the photo lab (Float32Array, 0 = black, 255 = white).
 * No DOM here: everything can be tried from a plain node script.
 */

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Stretch the histogram so the darkest and lightest `clip` fraction (0..0.5) of pixels hit 0 and 255. */
export function autoContrast(lum, clip = 0.01) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[Math.round(clamp(lum[i]))]++;
  const cut = lum.length * clip;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) <= cut; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) <= cut; hi--);
  return levels(lum, lo, hi);
}

/** Map [black, white] to [0, 255] in place. */
export function levels(lum, black = 0, white = 255) {
  if (white - black < 2) return lum;
  const k = 255 / (white - black);
  for (let i = 0; i < lum.length; i++) lum[i] = clamp((lum[i] - black) * k);
  return lum;
}

/** 3×3 box blur, edges clamped. */
function blur(lum, w, h) {
  const out = new Float32Array(lum.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) sum += lum[yy * w + Math.min(w - 1, Math.max(0, x + dx))];
      }
      out[y * w + x] = sum / 9;
    }
  }
  return out;
}

/** Unsharp mask in place; amount 0..3 (0 = off). */
export function sharpen(lum, w, h, amount = 1) {
  if (amount <= 0) return lum;
  const soft = blur(lum, w, h);
  for (let i = 0; i < lum.length; i++) lum[i] = clamp(lum[i] + (lum[i] - soft[i]) * amount);
  return lum;
}

/** Sobel edges drawn as dark lines on white; `strength` 0.5..4. Returns a new buffer. */
export function sketch(lum, w, h, strength = 1.5) {
  const out = new Float32Array(lum.length).fill(255);
  const at = (x, y) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * w + x] = clamp(255 - Math.hypot(gx, gy) * strength);
    }
  }
  return out;
}

/** Quantise to `steps` flat tones (2..8) in place. */
export function posterize(lum, steps = 4) {
  const n = Math.max(2, Math.round(steps)) - 1;
  for (let i = 0; i < lum.length; i++) lum[i] = Math.round((clamp(lum[i]) / 255) * n) * (255 / n);
  return lum;
}

/**
 * Source rectangle of a crop, in source pixels.
 * @param {number} sw source width
 * @param {number} sh source height
 * @param {number} aspect target width / height
 * @param {{ zoom?: number, x?: number, y?: number }} o zoom ≥ 1, x and y in -100..100 (0 = centred)
 */
export function cropRect(sw, sh, aspect, { zoom = 1, x = 0, y = 0 } = {}) {
  let cw = sw;
  let ch = cw / aspect;
  if (ch > sh) {
    ch = sh;
    cw = ch * aspect;
  }
  cw /= Math.max(1, zoom);
  ch /= Math.max(1, zoom);
  const sx = (sw - cw) / 2 + ((sw - cw) / 2) * (x / 100);
  const sy = (sh - ch) / 2 + ((sh - ch) / 2) * (y / 100);
  return { sx, sy, cw, ch };
}

/**
 * Move a crop by (dxSrc, dySrc) source pixels, dragging the picture with the pointer (the crop window
 * goes the other way). Returns the new { x, y } in -100..100; an axis with no room to move is kept.
 */
export function panCrop(sw, sh, aspect, { zoom = 1, x = 0, y = 0 } = {}, dxSrc = 0, dySrc = 0) {
  const { sx, sy, cw, ch } = cropRect(sw, sh, aspect, { zoom, x, y });
  const rx = (sw - cw) / 2;
  const ry = (sh - ch) / 2;
  const to = (pos, room, was) => (room > 0.5 ? Math.max(-100, Math.min(100, ((pos - room) / room) * 100)) : was);
  return { x: to(sx - dxSrc, rx, x), y: to(sy - dySrc, ry, y) };
}
