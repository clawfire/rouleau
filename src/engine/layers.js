/**
 * Free layers (text and stickers) laid over a ticket.
 *
 * A layer is plain data in ticket coordinates (dots, 384 wide):
 *   { id, type: 'text'|'sticker', x, y (centre), size, rot (degrees), halo,
 *     text, font, bg: 'none'|'black'|'white'|'frame', align   (text)
 *     icon, invert                                             (sticker) }
 * `size` is the font size of a text and the longest side of a sticker, in dots.
 * `drawLayer` and `layerBox` are shared by the compositor (print) and the on-screen editor (hit-testing).
 */
import { fontById } from '../fonts.js';
import { loadIcon } from './icons.js';

export const MIN_TEXT_SIZE = 18; // house rule: nothing smaller than 18 px on paper
const PAD_X = 10;
const PAD_Y = 6;
const HALO = 5;
const FRAME = 3;

const probe = () => (probe.ctx ??= document.createElement('canvas').getContext('2d'));

export const layerFont = (layer) => {
  const f = fontById(layer.font);
  const weight = layer.bold && f.weights?.includes(700) ? 700 : (f.weights?.[0] ?? 400);
  return `${weight} ${Math.round(layer.size)}px "${f.family}"`;
};

const linesOf = (layer) => String(layer.text ?? '').split('\n');

/** Unrotated size of a layer in dots. */
export function layerBox(layer, icon) {
  if (layer.type === 'sticker') {
    const r = icon?.ratio ?? 1;
    return r >= 1 ? { w: layer.size, h: layer.size / r } : { w: layer.size * r, h: layer.size };
  }
  const ctx = probe();
  ctx.font = layerFont(layer);
  const lineH = Math.round(layer.size * 1.2);
  const w = Math.max(layer.size * 0.6, ...linesOf(layer).map((l) => ctx.measureText(l).width));
  const boxed = layer.bg && layer.bg !== 'none';
  return { w: Math.ceil(w) + (boxed ? PAD_X * 2 : 0), h: lineH * linesOf(layer).length + (boxed ? PAD_Y * 2 : 0), lineH };
}

/** Draw one layer on `ctx` (transparent canvas). `icon` is the loaded sticker, if any. */
export function drawLayer(ctx, layer, icon) {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate(((layer.rot ?? 0) * Math.PI) / 180);

  if (layer.type === 'sticker') {
    if (icon) {
      const { w, h } = layerBox(layer, icon);
      // Inverted: a white icon outlined in black (always outlined, or it would vanish on white paper).
      const [ink, outline] = layer.invert ? [icon.white, icon.black] : [icon.black, icon.white];
      if (layer.halo || layer.invert) {
        for (let a = 0; a < 16; a++) {
          const t = (a / 16) * Math.PI * 2;
          ctx.drawImage(outline, -w / 2 + Math.cos(t) * HALO, -h / 2 + Math.sin(t) * HALO, w, h);
        }
      }
      ctx.drawImage(ink, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
    return;
  }

  const { w, h, lineH } = layerBox(layer);
  const bg = layer.bg ?? 'none';
  if (bg !== 'none') {
    ctx.fillStyle = bg === 'black' ? '#000' : '#fff';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (bg === 'frame') {
      ctx.fillStyle = '#000';
      ctx.fillRect(-w / 2, -h / 2, w, FRAME);
      ctx.fillRect(-w / 2, h / 2 - FRAME, w, FRAME);
      ctx.fillRect(-w / 2, -h / 2, FRAME, h);
      ctx.fillRect(w / 2 - FRAME, -h / 2, FRAME, h);
    }
  }
  ctx.font = layerFont(layer);
  ctx.textBaseline = 'middle';
  const align = layer.align ?? 'center';
  ctx.textAlign = align;
  const inner = w - (bg !== 'none' ? PAD_X * 2 : 0);
  const x = align === 'left' ? -inner / 2 : align === 'right' ? inner / 2 : 0;
  const lines = linesOf(layer);
  const top = -(lineH * lines.length) / 2 + lineH / 2;
  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (bg === 'none' && layer.halo) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = HALO * 2;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = bg === 'black' ? '#fff' : '#000';
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

/** Icons used by a list of layers, keyed by name (null when one failed to load). */
export async function loadLayerIcons(layers) {
  const names = [...new Set(layers.filter((l) => l.type === 'sticker').map((l) => l.icon))];
  const icons = await Promise.all(names.map(loadIcon));
  return Object.fromEntries(names.map((n, i) => [n, icons[i]]));
}

/**
 * Burn the layers into a bitmap: wherever a layer covers a pixel (alpha ≥ 50 %), that pixel takes the
 * layer's colour. White parts (halo, text box) clear the photo below them.
 */
export async function applyLayers(bitmap, layers) {
  if (!layers?.length) return bitmap;
  const icons = await loadLayerIcons(layers);
  await Promise.all(layers.filter((l) => l.type === 'text').map((l) => document.fonts.load(layerFont(l), 'AaÉé09').catch(() => null)));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = Math.max(1, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const layer of layers) drawLayer(ctx, layer, icons[layer.icon]);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0, p = 0; i < bitmap.data.length; i++, p += 4) {
    if (data[p + 3] >= 128) bitmap.data[i] = data[p] + data[p + 1] + data[p + 2] < 384 ? 1 : 0;
  }
  return bitmap;
}
