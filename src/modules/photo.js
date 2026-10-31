/**
 * Labo photo: one photo, tuned for a 384-dot thermal head.
 *
 * Pipeline: crop / rotate → luminance → auto-contrast, levels, sharpen, brightness / contrast / gamma
 * → effect (sketch, posterise) → dither → 1-bit canvas. The photo is dithered ONCE at the size it prints,
 * then handed to `draw` blocks that copy 1-bit pixels (like the badge photo), so tall photos are sliced in
 * bands the paginator can cut between without breaking the error diffusion.
 *
 * The photo itself is session-only (`transient`): only the settings reach localStorage.
 */
import { draw, space, text } from '../engine/blocks.js';
import { PRINT_WIDTH } from '../engine/constants.js';
import { adjust, DITHERS, dither, luminance } from '../engine/dither.js';
import { autoContrast, cropRect, levels, panCrop, posterize, sharpen, sketch } from '../engine/photo-ops.js';
import { TYPE } from '../fonts.js';
import { layersControl } from '../ui/layers-panel.js';

const W = PRINT_WIDTH;
const TOP = 8; // blank dots `renderTicket` leaves above the first block: photo rectangles are offset by it
const BAND = 64; // slice height of a tall photo: where a long print may be cut into pages
const CAPTION_FONT = '700 26px "Atkinson Hyperlegible"';
const LABEL_FONT = '700 18px "Atkinson Hyperlegible"';

const ASPECTS = [
  { value: 'orig', label: 'Original', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '3:4', label: '3:4', ratio: 3 / 4 },
  { value: '3:2', label: '3:2', ratio: 3 / 2 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
];

const LAYOUTS = [
  { value: 'full', label: 'Pleine largeur' },
  { value: 'polaroid', label: 'Polaroid' },
  { value: 'strip', label: 'Photomaton' },
];

const PRESETS = [
  { label: 'Portrait', set: { dither: 'atkinson', effect: 'none', auto: true, sharpen: 0.6, contrast: 10, brightness: 0, gamma: 1, black: 0, white: 255 } },
  { label: 'Paysage', set: { dither: 'stucki', effect: 'none', auto: true, sharpen: 1, contrast: 15, brightness: 0, gamma: 1, black: 0, white: 255 } },
  { label: 'Document', set: { dither: 'threshold', effect: 'none', auto: true, sharpen: 1.5, contrast: 30, brightness: 0, gamma: 1, level: 140, black: 0, white: 255 } },
];

/* ---------- Loading and cropping ---------- */

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Photo illisible.'));
    img.src = src;
  });

const loadedImages = new Map(); // data URL → decoded image (a handful at most: the photo-booth slots)
const orientedCache = new Map();

/** The photo turned and flipped as asked (the crop works on this). */
async function orientedPhoto(src, rotate, flip) {
  let img = loadedImages.get(src);
  if (!img) {
    img = await loadImage(src);
    if (loadedImages.size >= 6) loadedImages.delete(loadedImages.keys().next().value);
    loadedImages.set(src, img);
  }
  const key = `${src.length}|${src.slice(-48)}|${rotate}|${flip}`;
  if (orientedCache.has(key)) return orientedCache.get(key);
  const turned = rotate % 180 !== 0;
  const c = document.createElement('canvas');
  c.width = turned ? img.height : img.width;
  c.height = turned ? img.width : img.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  if (orientedCache.size >= 6) orientedCache.delete(orientedCache.keys().next().value);
  orientedCache.set(key, c);
  return c;
}

const aspectOf = (v, photo) => {
  const a = ASPECTS.find((x) => x.value === v.aspect);
  const ratio = a?.ratio ?? photo.width / photo.height;
  return Math.min(4, Math.max(0.25, ratio));
};

/* ---------- Tone and dither ---------- */

/** Luminance → 1 = burn bits, following the settings `v`. */
function toBits(lum, w, h, v) {
  if (v.auto) autoContrast(lum, 0.01);
  levels(lum, Number(v.black), Number(v.white));
  sharpen(lum, w, h, Number(v.sharpen));
  adjust(lum, { brightness: Number(v.brightness), contrast: Number(v.contrast), gamma: Number(v.gamma), invert: v.invert });
  let data = lum;
  let algo = v.dither;
  if (v.effect === 'sketch') {
    data = sketch(lum, w, h, Number(v.edge));
    algo = 'threshold';
  } else if (v.effect === 'posterize') {
    posterize(lum, Number(v.steps));
  }
  return dither(data, w, h, algo, { level: Number(v.level), cell: Number(v.cell), angle: Number(v.angle) });
}

/** The photo cropped to `w` × `h` with the crop settings, tuned and dithered: a black-and-white canvas. */
function develop(photo, w, h, v, crop) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  const { sx, sy, cw, ch } = cropRect(photo.width, photo.height, w / h, crop);
  ctx.drawImage(photo, sx, sy, cw, ch, 0, 0, w, h);
  const bits = toBits(luminance(ctx.getImageData(0, 0, w, h)), w, h, v);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < bits.length; i++) {
    const g = bits[i] ? 0 : 255;
    out.data.set([g, g, g, 255], i * 4);
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/* ---------- Crop gestures (the on-ticket editor drives these) ---------- */

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** The one crop shared by the whole photo (full width, polaroid), backed by the Cadrage sliders. */
const sharedCrop = (v) => ({
  get: () => ({ zoom: num(v.zoom, 1), x: num(v.cropX, 0), y: num(v.cropY, 0) }),
  set: (c) => Object.assign(v, { zoom: round(c.zoom), cropX: Math.round(c.x), cropY: Math.round(c.y) }),
});

/** A photo rectangle on the ticket that can be panned and zoomed by dragging, wheel or pinch. */
function cropTarget(photo, rect, { get, set }) {
  const aspect = rect.w / rect.h;
  return {
    rect,
    pan(dx, dy) {
      const c = get();
      const { cw, ch } = cropRect(photo.width, photo.height, aspect, c);
      set({ ...c, ...panCrop(photo.width, photo.height, aspect, c, (dx * cw) / rect.w, (dy * ch) / rect.h) });
    },
    zoomBy(f) {
      const c = get();
      set({ ...c, zoom: Math.min(4, Math.max(1, c.zoom * f)) });
    },
  };
}

/* ---------- Layouts ---------- */

const dateText = () => new Date().toLocaleDateString('fr-LU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Full width, cut in bands so a long photo can be paginated cleanly. */
function fullLayout(photo, v) {
  const h = Math.round(W / aspectOf(v, photo));
  const crop = sharedCrop(v);
  const c = develop(photo, W, h, v, crop.get());
  const blocks = [];
  for (let y = 0; y < h; y += BAND) {
    const bh = Math.min(BAND, h - y);
    blocks.push(draw(bh, (ctx) => ctx.drawImage(c, 0, y, W, bh, 0, 0, W, bh), { mode: 'threshold' }));
  }
  return { blocks, targets: [cropTarget(photo, { x: 0, y: TOP, w: W, h }, crop)] };
}

function polaroidLayout(photo, v) {
  const M = 24;
  const pw = W - M * 2;
  const ph = Math.round(pw / aspectOf(v, photo));
  const crop = sharedCrop(v);
  const c = develop(photo, pw, ph, v, crop.get());
  const caption = String(v.caption ?? '').trim();
  const date = v.showDate ? dateText() : '';
  const bottom = 28 + (caption ? 34 : 0) + (date ? 28 : 0);
  const H = M + ph + bottom;
  const blocks = [
    draw(
      H,
      (ctx) => {
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, W - 4, H - 4);
        ctx.drawImage(c, M, M);
        ctx.lineWidth = 2;
        ctx.strokeRect(M - 1, M - 1, pw + 2, ph + 2);
        ctx.textAlign = 'center';
        let y = M + ph + 34;
        if (caption) {
          ctx.font = CAPTION_FONT;
          ctx.fillText(caption, W / 2, y, pw);
          y += 30;
        }
        if (date) {
          ctx.font = LABEL_FONT;
          ctx.fillText(date, W / 2, y, pw);
        }
      },
      { mode: 'threshold', fonts: [CAPTION_FONT, LABEL_FONT] },
    ),
  ];
  return { blocks, targets: [cropTarget(photo, { x: M, y: TOP + M, w: pw, h: ph }, crop)] };
}

/** Small text running along a side of the strip, reading bottom to top (left) or top to bottom (right). */
function sideText(ctx, message, x, H, up) {
  if (!message) return;
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const unit = `${message}   ·   `;
  const step = ctx.measureText(unit).width;
  ctx.translate(x, H / 2);
  ctx.rotate(up ? -Math.PI / 2 : Math.PI / 2);
  for (let t = -Math.ceil(H / step / 2) * step; t < H / 2 + step; t += step) ctx.fillText(message, t, 0);
  ctx.restore();
}

/**
 * A black strip of frames with little messages down both sides. Each frame uses its own photo when
 * several were chosen; the missing ones reuse the first photo, a bit closer each time.
 */
function stripLayout(photos, v) {
  const n = Number(v.frames) === 3 ? 3 : 4;
  const fw = 288;
  const ratio = aspectOf(v, photos[0]);
  const fh = Math.round(fw / ratio);
  const gap = 14;
  const side = (W - fw) / 2;
  const base = sharedCrop(v).get();
  // A frame has its own crop once it was dragged; until then it follows the sliders, a bit closer each time
  // when it reuses the first photo.
  const cropOf = (i) => ({
    get: () => v.crops?.[i] ?? { ...base, zoom: photos[i] ? base.zoom : round(base.zoom * (1 + i * 0.45)) },
    set: (c) => ((v.crops ??= [])[i] = { zoom: round(c.zoom), x: Math.round(c.x), y: Math.round(c.y) }),
  });
  const shots = Array.from({ length: n }, (_, i) => photos[i] ?? photos[0]);
  const frames = shots.map((p, i) => develop(p, fw, fh, v, cropOf(i).get()));
  const H = gap + n * (fh + gap);
  const left = String(v.sideLeft ?? '').trim();
  const right = v.sideDate ? dateText() : String(v.sideRight ?? '').trim();
  const blocks = [
    draw(
      H,
      (ctx) => {
        ctx.fillRect(0, 0, W, H);
        frames.forEach((f, i) => ctx.drawImage(f, side, gap + i * (fh + gap)));
        sideText(ctx, left, side / 2, H, true);
        sideText(ctx, right, W - side / 2, H, false);
      },
      { mode: 'threshold', fonts: [LABEL_FONT] },
    ),
  ];
  const targets = shots.map((p, i) => cropTarget(p, { x: side, y: TOP + gap + i * (fh + gap), w: fw, h: fh }, cropOf(i)));
  return { blocks, targets };
}

/* ---------- Module ---------- */

const num = (n, d) => (Number.isFinite(Number(n)) ? Number(n) : d);

let geometry = []; // photo rectangles of the last build, for the on-ticket editor

export default {
  id: 'photo',
  composable: false,
  editable: true, // layers + direct manipulation on the preview (see ui/editor.js)
  transient: ['photo', 'photo2', 'photo3', 'photo4'],
  label: 'Labo photo',
  icon: 'camera-retro',
  description: 'Recadre, règle et trame une photo pour la tête d’impression. Pleine largeur, polaroid ou photomaton.',

  defaults: {
    photo: '',
    photo2: '',
    photo3: '',
    photo4: '',
    layout: 'full',
    aspect: 'orig',
    zoom: 1,
    cropX: 0,
    cropY: 0,
    rotate: '0',
    flip: false,
    auto: true,
    black: 0,
    white: 255,
    brightness: 0,
    contrast: 10,
    gamma: 1,
    sharpen: 0.6,
    invert: false,
    dither: 'atkinson',
    level: 128,
    cell: 6,
    angle: 45,
    effect: 'none',
    edge: 1.5,
    steps: 4,
    caption: '',
    showDate: true,
    frames: '4',
    sideLeft: 'imprimé avec Rouleau',
    sideDate: true,
    sideRight: '',
  },

  /** Layers burnt over the finished ticket (text, stickers). */
  layers: (v) => (v.photo ? (v.layers ??= []) : []),
  targets: () => geometry,

  /** First-level "Photo" card, before "Réglages". */
  source: {
    title: 'Photo',
    icon: 'camera-retro',
    controls: (v) => [
      { type: 'image', key: 'photo', label: 'Photo', maxSize: 1400, hint: 'Elle reste dans ce navigateur et disparaît quand tu fermes la page.', refresh: true },
      ...(v.photo && v.layout === 'strip'
        ? [
            { type: 'callout', variant: 'neutral', text: 'Photomaton : ajoute jusqu’à trois autres photos, une par vignette. Sans photo, la première est reprise, de plus en plus près.' },
            { type: 'image', key: 'photo2', label: 'Photo 2', maxSize: 1400, refresh: true },
            { type: 'image', key: 'photo3', label: 'Photo 3', maxSize: 1400, refresh: true },
            ...(Number(v.frames) === 3 ? [] : [{ type: 'image', key: 'photo4', label: 'Photo 4', maxSize: 1400, refresh: true }]),
          ]
        : []),
      ...(v.photo
        ? [{ type: 'button', label: 'Tout retirer', refresh: true, onClick: (values) => Object.assign(values, { photo: '', photo2: '', photo3: '', photo4: '' }) }]
        : []),
    ],
  },

  /** First-level "Calques" card, between "Photo" and "Réglages". */
  layersCard: {
    title: 'Calques',
    icon: 'layer-group',
    controls: (v) => (v.photo ? [layersControl] : [{ type: 'callout', variant: 'neutral', text: 'Choisis une photo pour ajouter du texte et des stickers.' }]),
  },

  controls(v) {
    if (!v.photo) return [{ type: 'callout', variant: 'neutral', text: 'Choisis une photo pour commencer.' }];
    const schema = [];

    schema.push(
      { type: 'section', title: 'Réglages rapides' },
      { type: 'buttons', refresh: true, buttons: PRESETS.map((p) => ({ label: p.label, onClick: (values) => Object.assign(values, p.set) })) },
      { type: 'section', title: 'Mise en page' },
      { type: 'select', key: 'layout', label: 'Mise en page', refresh: true, options: LAYOUTS },
    );
    if (v.layout === 'polaroid') {
      schema.push({ type: 'text', key: 'caption', label: 'Légende' }, { type: 'switch', key: 'showDate', label: 'Date du jour' });
    }
    if (v.layout === 'strip') {
      schema.push(
        { type: 'radio', key: 'frames', label: 'Vignettes', refresh: true, options: [{ value: '3', label: '3' }, { value: '4', label: '4' }] },
        { type: 'text', key: 'sideLeft', label: 'Message à gauche', placeholder: 'imprimé avec Rouleau' },
        { type: 'switch', key: 'sideDate', label: 'Date à droite', refresh: true },
      );
      if (!v.sideDate) schema.push({ type: 'text', key: 'sideRight', label: 'Message à droite' });
    }

    schema.push({ type: 'section', title: 'Cadrage' });
    schema.push({ type: 'select', key: 'aspect', label: 'Format', options: ASPECTS.map((a) => ({ value: a.value, label: a.label })) });
    schema.push(
      { type: 'slider', key: 'zoom', label: 'Zoom', min: 1, max: 4, step: 0.1 },
      { type: 'slider', key: 'cropX', label: 'Décalage horizontal', min: -100, max: 100, step: 5 },
      { type: 'slider', key: 'cropY', label: 'Décalage vertical', min: -100, max: 100, step: 5 },
      { type: 'radio', key: 'rotate', label: 'Rotation', options: [{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }] },
      { type: 'switch', key: 'flip', label: 'Miroir' },
      ...(v.crops?.length ? [{ type: 'button', label: 'Réinitialiser les cadrages des vignettes', refresh: true, onClick: (values) => (values.crops = []) }] : []),
      { type: 'section', title: 'Tonalité' },
      { type: 'switch', key: 'auto', label: 'Contraste automatique' },
      { type: 'slider', key: 'black', label: 'Point noir', min: 0, max: 120, step: 5 },
      { type: 'slider', key: 'white', label: 'Point blanc', min: 135, max: 255, step: 5 },
      { type: 'slider', key: 'brightness', label: 'Luminosité', min: -50, max: 50, step: 5 },
      { type: 'slider', key: 'contrast', label: 'Contraste', min: -50, max: 50, step: 5 },
      { type: 'slider', key: 'gamma', label: 'Gamma', hint: 'Au-dessus de 1, les gris s’éclaircissent.', min: 0.5, max: 2, step: 0.1 },
      { type: 'slider', key: 'sharpen', label: 'Netteté', min: 0, max: 3, step: 0.1 },
      { type: 'switch', key: 'invert', label: 'Négatif' },
    );
    schema.push(
      { type: 'section', title: 'Tramage' },
      { type: 'select', key: 'dither', label: 'Algorithme', refresh: true, options: DITHERS.map((d) => ({ value: d.id, label: d.label })) },
    );
    if (v.dither === 'threshold') schema.push({ type: 'slider', key: 'level', label: 'Seuil', min: 40, max: 220, step: 4 });
    if (v.dither === 'screen' || v.dither === 'halftone') schema.push({ type: 'slider', key: 'cell', label: 'Taille des points', min: 3, max: 12, step: 1 });
    if (v.dither === 'screen') schema.push({ type: 'slider', key: 'angle', label: 'Angle de la trame', min: 0, max: 90, step: 5 });
    schema.push(
      { type: 'section', title: 'Effet' },
      {
        type: 'select',
        key: 'effect',
        label: 'Effet',
        refresh: true,
        options: [
          { value: 'none', label: 'Aucun' },
          { value: 'sketch', label: 'Dessin au trait' },
          { value: 'posterize', label: 'Aplats (postérisation)' },
        ],
      },
    );
    if (v.effect === 'sketch') schema.push({ type: 'slider', key: 'edge', label: 'Force des traits', min: 0.5, max: 4, step: 0.1 });
    if (v.effect === 'posterize') schema.push({ type: 'slider', key: 'steps', label: 'Niveaux de gris', min: 2, max: 8, step: 1 });
    return schema;
  },

  async build(v) {
    if (!v.photo) {
      geometry = [];
      return [text('Choisis une photo pour la développer.', TYPE.caption)];
    }
    await Promise.all([CAPTION_FONT, LABEL_FONT].map((f) => document.fonts.load(f, 'AaÉé09').catch(() => null)));
    let photo;
    try {
      photo = await orientedPhoto(v.photo, num(v.rotate, 0), Boolean(v.flip));
    } catch (err) {
      return [text(err.message, TYPE.caption)];
    }

    let out;
    switch (v.layout) {
      case 'polaroid':
        out = polaroidLayout(photo, v);
        break;
      case 'strip': {
        const extra = await Promise.all(
          [v.photo2, v.photo3, v.photo4].map((src) => (src ? orientedPhoto(src, num(v.rotate, 0), Boolean(v.flip)).catch(() => null) : null)),
        );
        out = stripLayout([photo, ...extra.map((p) => p ?? undefined)].slice(0, Number(v.frames) === 3 ? 3 : 4), v);
        break;
      }
      default:
        out = fullLayout(photo, v);
    }
    geometry = out.targets;
    const blocks = out.blocks;
    return [...blocks, space(8)];
  },
};
