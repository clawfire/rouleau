/**
 * Badges: conference, visitor, "HELLO my name is".
 *
 * The strip of paper is as wide as the print head (384 dots), so the badge height is fixed at 48 mm
 * and only its length is yours to choose. The badge is drawn lying down, then turned 90° onto the
 * ticket so its long side runs along the tape. The preview shows it flat (see `turn`).
 */
import { draw, space, text } from '../engine/blocks.js';
import { adjust, DITHERS, dither, luminance } from '../engine/dither.js';
import { mmToDots } from '../engine/constants.js';
import { TYPE } from '../fonts.js';
import { QrError, buildPayload, normalizeUrl, qrMatrix } from '../services/qr-payload.js';
import { FONTS, MIN_MODULE, QUIET, drawBadge, plan, sideRoom } from './badge-draw.js';

const TEMPLATES = [
  { value: 'conference', label: 'Conférence' },
  { value: 'visitor', label: 'Visiteur' },
  { value: 'hello', label: 'Hello' },
];

const DEFAULT_CATEGORY = { conference: 'Participant', visitor: 'Visiteur' };

const clean = (s) => String(s ?? '').trim().replace(/[  ]/g, ' ');

/* ---------- Photo ---------- */

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Photo illisible.'));
    img.src = src;
  });

let photoCache = { key: '', canvas: null }; // the last dithered photo: typing a name must not redo it

/** Square crop of the photo, dithered at the size it will be drawn (1 dot = 1 pixel, so it stays 1-bit). */
async function ditheredPhoto(src, side, v) {
  const key = [src.length, src.slice(-48), side, v.photoDither, v.photoBrightness, v.photoContrast].join('|');
  if (photoCache.key === key) return photoCache.canvas;
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, side, side);
  const k = Math.max(side / img.width, side / img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);

  const lum = luminance(ctx.getImageData(0, 0, side, side));
  adjust(lum, { brightness: Number(v.photoBrightness), contrast: Number(v.photoContrast) });
  const bits = dither(lum, side, side, v.photoDither);
  const out = ctx.createImageData(side, side);
  for (let i = 0; i < bits.length; i++) {
    const c = bits[i] ? 0 : 255;
    out.data.set([c, c, c, 255], i * 4);
  }
  ctx.putImageData(out, 0, 0);
  photoCache = { key, canvas };
  return canvas;
}

/* ---------- QR ---------- */

/** QR for the badge (vCard of the person, a link, or free text), or null with the reason. */
function badgeQr(v, room) {
  if (v.qrKind === 'none') return { qr: null };
  const payload =
    v.qrKind === 'vcard'
      ? buildPayload({ qrType: 'vcard', firstName: v.firstName, lastName: v.lastName, org: v.company, jobTitle: v.role, mobile: v.phone, email: v.email, website: v.website })
      : v.qrKind === 'url'
        ? { data: normalizeUrl(v.qrUrl) }
        : { data: clean(v.qrText) };
  if (!payload.data) return { qr: null, note: 'QR : remplis son contenu.' };
  let matrix;
  try {
    matrix = qrMatrix(payload.data, v.qrKind === 'vcard' ? 'L' : 'M');
  } catch (err) {
    return { qr: null, note: err instanceof QrError ? err.message : String(err) };
  }
  const cells = matrix.size + QUIET * 2;
  const module = Math.floor(Math.min(room, 250) / cells);
  if (module < MIN_MODULE) return { qr: null, note: `QR trop dense pour 48 mm de haut (${matrix.size} × ${matrix.size} modules) : allège son contenu.` };
  return { qr: { matrix, module, side: cells * module } };
}

/* ---------- Form ---------- */

const dateText = () => new Date().toLocaleDateString('fr-LU', { day: 'numeric', month: 'short', year: 'numeric' });
const timeText = () => new Date().toLocaleTimeString('fr-LU', { hour: '2-digit', minute: '2-digit', hour12: false });

export default {
  id: 'badge',
  label: 'Badges',
  icon: 'id-badge',
  description: 'Badge de conférence, de visiteur ou « Hello ». Le badge est couché : sa hauteur est celle de la tête (48 mm), tu choisis la longueur.',

  defaults: {
    template: 'conference',
    firstName: 'Camille',
    lastName: 'Martin',
    role: 'Développeuse',
    company: 'Acme',
    event: 'Rouleau Conf',
    category: '',
    host: 'Alex Durand',
    number: '',
    note: 'À rendre en partant',
    showDate: true,
    helloTop: 'HELLO',
    helloSub: 'my name is',
    photo: '',
    photoDither: 'atkinson',
    photoBrightness: 0,
    photoContrast: 10,
    qrKind: 'none',
    email: '',
    phone: '',
    website: '',
    qrUrl: '',
    qrText: '',
    lengthMm: 90,
    frame: true,
    orientation: 'cw',
    flatPreview: true,
  },

  /** Preview upright and flat: the printed bitmap is turned back the way it was turned to print. */
  turn: (v) => (v.flatPreview ? v.orientation : null),

  controls(v) {
    const t = v.template;
    const schema = [
      { type: 'radio', key: 'template', label: 'Modèle', refresh: true, options: TEMPLATES },
      { type: 'text', key: 'firstName', label: 'Prénom' },
      { type: 'text', key: 'lastName', label: 'Nom' },
      { type: 'text', key: 'role', label: 'Fonction' },
      { type: 'text', key: 'company', label: 'Société' },
    ];

    if (t === 'conference') {
      schema.push(
        { type: 'text', key: 'event', label: "Nom de l'événement" },
        { type: 'text', key: 'category', label: 'Catégorie (bandeau du bas)', placeholder: DEFAULT_CATEGORY.conference },
      );
    }
    if (t === 'visitor') {
      schema.push(
        { type: 'text', key: 'category', label: 'Bandeau', placeholder: DEFAULT_CATEGORY.visitor },
        { type: 'text', key: 'host', label: 'Visite chez' },
        { type: 'text', key: 'number', label: 'Numéro de badge', placeholder: 'N° 042' },
        { type: 'text', key: 'note', label: 'Mention' },
      );
    }
    if (t === 'hello') {
      schema.push(
        { type: 'text', key: 'helloTop', label: 'Bandeau' },
        { type: 'text', key: 'helloSub', label: 'Sous-titre' },
        { type: 'callout', variant: 'neutral', text: 'Sans prénom, le badge garde une ligne pointillée pour écrire à la main.' },
      );
    }
    if (t !== 'hello') schema.push({ type: 'switch', key: 'showDate', label: t === 'visitor' ? 'Date et heure du jour' : 'Date du jour' });

    schema.push({ type: 'image', key: 'photo', label: 'Photo', hint: 'Réduite et tramée à la taille du badge. Elle reste dans ce navigateur.', refresh: true });
    if (v.photo) {
      schema.push(
        { type: 'select', key: 'photoDither', label: 'Tramage de la photo', options: DITHERS.map((d) => ({ value: d.id, label: d.label })) },
        { type: 'slider', key: 'photoBrightness', label: 'Luminosité', min: -50, max: 50, step: 5 },
        { type: 'slider', key: 'photoContrast', label: 'Contraste', min: -50, max: 50, step: 5 },
        { type: 'button', label: 'Retirer la photo', refresh: true, onClick: (values) => (values.photo = '') },
      );
    }

    schema.push({
      type: 'select',
      key: 'qrKind',
      label: 'QR code',
      refresh: true,
      options: [
        { value: 'none', label: 'Aucun' },
        { value: 'vcard', label: 'Contact (vCard)' },
        { value: 'url', label: 'Lien' },
        { value: 'text', label: 'Texte' },
      ],
    });
    if (v.qrKind === 'vcard') {
      schema.push(
        { type: 'text', key: 'email', label: 'E-mail' },
        { type: 'text', key: 'phone', label: 'Mobile' },
        { type: 'text', key: 'website', label: 'Site web' },
      );
    }
    if (v.qrKind === 'url') schema.push({ type: 'text', key: 'qrUrl', label: 'Adresse' });
    if (v.qrKind === 'text') schema.push({ type: 'text', key: 'qrText', label: 'Texte' });

    schema.push(
      { type: 'slider', key: 'lengthMm', label: 'Longueur (mm)', hint: 'La hauteur est fixe : 48 mm.', min: 60, max: 160, step: 5 },
      { type: 'switch', key: 'frame', label: 'Cadre (repère de coupe)' },
      {
        type: 'radio',
        key: 'orientation',
        label: 'Sens sur le papier',
        hint: 'Quel côté sort en premier. Regarde l’aperçu tel qu’imprimé si tu hésites.',
        options: [
          { value: 'cw', label: 'Tête à droite' },
          { value: 'ccw', label: 'Tête à gauche' },
        ],
      },
      { type: 'switch', key: 'flatPreview', label: 'Aperçu à plat' },
    );
    return schema;
  },

  async build(v) {
    await Promise.all(FONTS.map((f) => document.fonts.load(f, 'AaÉé09').catch(() => null)));

    const L = mmToDots(Number(v.lengthMm) || 90);
    const room = sideRoom(v.template);
    const date = v.showDate && v.template !== 'hello' ? (v.template === 'visitor' ? `${dateText()} · ${timeText()}` : dateText()) : '';
    const texts = {
      first: clean(v.firstName),
      last: clean(v.lastName),
      role: clean(v.role),
      company: clean(v.company),
      event: clean(v.event),
      category: clean(v.category) || DEFAULT_CATEGORY[v.template] || '',
      host: clean(v.host),
      number: clean(v.number),
      note: clean(v.note),
      date,
      helloTop: clean(v.helloTop) || 'HELLO',
      helloSub: clean(v.helloSub) || 'my name is',
    };

    const notes = [];
    const { qr, note } = badgeQr(v, room);
    if (note) notes.push(note);

    const photoSide = v.photo ? Math.min(room, 230) : 0;
    const photo = photoSide ? await ditheredPhoto(v.photo, photoSide, v).catch((err) => (notes.push(err.message), null)) : null;

    const layout = plan(v, L, { photoSide: photo ? photoSide : 0, qrSide: qr ? qr.side : 0 });
    const blocks = [
      draw(
        L,
        (ctx, W) => {
          ctx.save();
          if (v.orientation === 'ccw') {
            ctx.translate(0, L);
            ctx.rotate(-Math.PI / 2);
          } else {
            ctx.translate(W, 0);
            ctx.rotate(Math.PI / 2);
          }
          drawBadge(ctx, L, v.template, texts, layout, { frame: v.frame, photo, qr });
          ctx.restore();
        },
        { mode: 'threshold', fonts: FONTS },
      ),
    ];
    for (const n of notes) blocks.push(space(6), text(n, TYPE.caption));
    return blocks;
  },
};

