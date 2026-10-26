import { PRINT_WIDTH } from './constants.js';

/**
 * A 1-bit image: one byte per pixel, 1 = burn (black), 0 = paper.
 * Everything Rouleau prints ends up as a Bitmap 384 px wide.
 */
export class Bitmap {
  /**
   * @param {number} width
   * @param {number} height
   * @param {Uint8Array} [data]
   */
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8Array(width * height);
  }

  get(x, y) {
    return this.data[y * this.width + x];
  }

  set(x, y, v = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = v ? 1 : 0;
  }

  /** Draw a rectangle outline of thickness t, inside the given box. */
  strokeRect(x, y, w, h, t = 1) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx < x + t || xx >= x + w - t || yy < y + t || yy >= y + h - t) this.set(xx, yy);
      }
    }
    return this;
  }

  /** Swap black and white (useful for inverted header bands). */
  invert() {
    for (let i = 0; i < this.data.length; i++) this.data[i] ^= 1;
    return this;
  }

  /** Blank (white) bitmap. */
  static blank(height, width = PRINT_WIDTH) {
    return new Bitmap(width, Math.max(0, Math.round(height)));
  }

  /**
   * Stack bitmaps vertically, left-aligned on a PRINT_WIDTH canvas.
   * @param {Bitmap[]} parts
   */
  static stack(parts, width = PRINT_WIDTH) {
    const height = parts.reduce((h, p) => h + p.height, 0);
    const out = new Bitmap(width, height);
    let y0 = 0;
    for (const p of parts) {
      for (let y = 0; y < p.height; y++) {
        const src = p.data.subarray(y * p.width, y * p.width + Math.min(p.width, width));
        out.data.set(src, (y0 + y) * width);
      }
      y0 += p.height;
    }
    return out;
  }

  /**
   * Draw onto a canvas for preview.
   * @param {HTMLCanvasElement} canvas
   * @param {{ ink?: [number, number, number], paper?: [number, number, number] }} [colors]
   */
  toCanvas(canvas, colors = {}) {
    const ink = colors.ink ?? [0, 0, 0];
    const paper = colors.paper ?? [255, 255, 255];
    canvas.width = this.width;
    canvas.height = Math.max(1, this.height);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(this.width, Math.max(1, this.height));
    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i] ? ink : paper;
      const o = i * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Pure black & white PNG, ready for `t02 print` or ⌘P. */
  toPNGBlob() {
    const canvas = this.toCanvas(document.createElement('canvas'));
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
}
