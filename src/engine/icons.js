/**
 * Font Awesome (free, solid) icons as stickers.
 *
 * The SVGs come from the same URL scheme `<wa-icon>` uses (`getIconLibrary('default').resolver`), so a
 * sticker is the very icon shown in the picker. Each icon is rasterised once, in black and in white
 * (the white copy draws the halo that keeps a sticker readable on a photo).
 */
import { getIconLibrary } from '@awesome.me/webawesome-pro/dist/components/icon/library.js';

/** Curated picker, free solid icons only (checked against the CDN). */
export const STICKERS = [
  'face-smile', 'face-laugh-beam', 'face-grin-stars', 'face-kiss-wink-heart', 'face-grin-tongue', 'face-surprise', 'face-sad-tear', 'face-angry',
  'heart', 'star', 'sun', 'moon', 'cloud', 'bolt', 'fire', 'snowflake',
  'umbrella', 'droplet', 'leaf', 'tree', 'seedling', 'rainbow', 'cloud-sun', 'umbrella-beach',
  'paw', 'cat', 'dog', 'fish', 'crow', 'feather', 'bug', 'hippo',
  'cake-candles', 'gift', 'champagne-glasses', 'martini-glass', 'mug-hot', 'pizza-slice', 'ice-cream', 'burger',
  'apple-whole', 'lemon', 'music', 'guitar', 'headphones', 'camera', 'film', 'ghost',
  'skull', 'crown', 'gem', 'rocket', 'plane', 'car', 'bicycle', 'ship',
  'flag', 'trophy', 'medal', 'thumbs-up', 'hand-peace', 'hands-clapping', 'hand-spock', 'eye',
  'glasses', 'hat-wizard', 'hat-cowboy', 'ribbon', 'wand-magic-sparkles', 'heart-crack', 'circle-check', 'skull',
].filter((n, i, all) => all.indexOf(n) === i);

const RASTER = 160; // px: big enough for any sticker size, drawn scaled down
const cache = new Map(); // name → Promise<{ black, white } | null>

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

async function rasterise(name) {
  const lib = getIconLibrary('default');
  const url = await lib.resolver(name, 'classic', 'solid', false);
  const svg = (await (await fetch(url)).text()).replace(/<svg /, '<svg fill="#000" ');
  const blob = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(blob);
    const k = Math.min(RASTER / img.width, RASTER / img.height);
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    const make = (color) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      if (color) {
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
      }
      return c;
    };
    return { black: make(null), white: make('#fff'), ratio: w / h };
  } finally {
    URL.revokeObjectURL(blob);
  }
}

/** Rasterised icon, or null when it cannot be fetched (offline…). Cached, failures included. */
export function loadIcon(name) {
  if (!cache.has(name)) cache.set(name, rasterise(name).catch(() => null));
  return cache.get(name);
}
