/**
 * Badge drawing, in badge coordinates: the badge is H = 384 dots tall (the width of the print head,
 * so the height is fixed) and L dots long (the length of tape you choose). badge.js turns it 90° when it
 * lands on the ticket, so the long side runs along the paper.
 *
 * Text is drawn plain (the draw block thresholds it); the photo is dithered beforehand, at the size it is
 * drawn, so it stays 1-bit through the rotation.
 */
import { MIN_TEXT_SIZE, PRINT_WIDTH } from '../engine/constants.js';

export const H = PRINT_WIDTH;
export const PAD = 14;

export const ARCHIVO = 'Archivo Black';
export const BODY = 'Atkinson Hyperlegible';
export const MONO = 'Departure Mono';
export const FONTS = [`40px "${ARCHIVO}"`, `700 30px "${BODY}"`, `400 30px "${BODY}"`, `22px "${MONO}"`];

export const QUIET = 2; // modules of white around the QR code
export const MIN_MODULE = 3;

/** Black bands at the top / bottom of the badge, per template. */
export const BANDS = {
  conference: { top: 62, bottom: 52 },
  visitor: { top: 124, bottom: 0 },
  hello: { top: 156, bottom: 0 },
};

const probe = document.createElement('canvas').getContext('2d');
const fontOf = (size, family, weight = 400) => `${weight} ${size}px "${family}"`;
const widthOf = (str, font) => {
  probe.font = font;
  return probe.measureText(str).width;
};

/** Largest size (steps of 2) that fits `maxW`, between `min` and `max`. */
export function fit(str, family, weight, maxW, max, min = MIN_TEXT_SIZE) {
  for (let size = max; size > min; size -= 2) if (widthOf(str, fontOf(size, family, weight)) <= maxW) return size;
  return min;
}

/** Cut a string with … if it still overflows at the smallest size. */
function ellipsize(str, font, maxW) {
  if (widthOf(str, font) <= maxW) return str;
  let s = str;
  while (s.length > 1 && widthOf(`${s}…`, font) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Body area, photo and QR boxes, and the column left for the text. */
export function plan(v, L, { photoSide = 0, qrSide = 0 } = {}) {
  const band = BANDS[v.template] ?? BANDS.conference;
  const y0 = band.top;
  const y1 = H - band.bottom;
  const cy = (y0 + y1) / 2;
  return {
    band,
    y0,
    y1,
    photo: photoSide ? { x: PAD, y: Math.round(cy - photoSide / 2), s: photoSide } : null,
    qr: qrSide ? { x: L - PAD - qrSide, y: Math.round(cy - qrSide / 2), s: qrSide } : null,
    x0: PAD + (photoSide ? photoSide + PAD : 0),
    x1: L - PAD - (qrSide ? qrSide + PAD : 0),
  };
}

/** Largest side available for the photo / the QR code in the body of this template. */
export const sideRoom = (template) => {
  const band = BANDS[template] ?? BANDS.conference;
  return H - band.top - band.bottom - PAD * 2;
};

/* ---------- Pieces ---------- */

function put(ctx, str, x, y, { size, family = BODY, weight = 400, align = 'left', color = '#000', maxW }) {
  const font = fontOf(size, family, weight);
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(maxW ? ellipsize(str, font, maxW) : str, Math.round(x), Math.round(y));
}

/**
 * Stack lines in the body, vertically centred. If they do not fit the height,
 * every size shrinks by the same factor (never under the minimum text size).
 * @param {{ str: string, size: number, family?: string, weight?: number, gap?: number }[]} lines
 */
function stack(ctx, lines, area, { align, maxW }) {
  const live = lines.filter((l) => l.str);
  if (!live.length) return;
  const lineH = (l, k) => Math.round(l.size * k * 1.12) + (l.gap ?? 0);
  let k = 1;
  const total = (kk) => live.reduce((h, l) => h + lineH(l, kk), 0);
  while (total(k) > area.h - 8 && k > 0.5) k -= 0.04;
  const x = align === 'center' ? (area.x0 + area.x1) / 2 : area.x0;
  let y = area.y + (area.h - total(k)) / 2;
  for (const l of live) {
    const size = Math.max(MIN_TEXT_SIZE, Math.floor(l.size * k));
    const h = lineH(l, k);
    put(ctx, l.str, x, y + (h - (l.gap ?? 0)) / 2, { ...l, size, align, maxW });
    y += h;
  }
}

function band(ctx, y, h, L) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, y, L, h);
}

function drawPhoto(ctx, box, canvas) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, box.x, box.y);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x - 1.5, box.y - 1.5, box.s + 3, box.s + 3);
}

function drawQr(ctx, box, { matrix, module }) {
  const side = (matrix.size + QUIET * 2) * module;
  const x0 = box.x + Math.round((box.s - side) / 2) + QUIET * module;
  const y0 = box.y + Math.round((box.s - side) / 2) + QUIET * module;
  ctx.fillStyle = '#000';
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) if (matrix.isDark(r, c)) ctx.fillRect(x0 + c * module, y0 + r * module, module, module);
  }
}

/* ---------- Templates ---------- */

const full = (t) => [t.first, t.last].filter(Boolean).join(' ');

const TEMPLATES = {
  /** Event name on top, name in big, role and company, category in the bottom band. */
  conference(ctx, L, t, p) {
    band(ctx, 0, p.band.top, L);
    band(ctx, H - p.band.bottom, p.band.bottom, L);
    if (t.date) put(ctx, t.date, L - PAD, p.band.top / 2, { size: 22, family: MONO, align: 'right', color: '#fff' });
    if (t.event) {
      const room = L - PAD * 3 - (t.date ? widthOf(t.date, fontOf(22, MONO)) : 0);
      const size = fit(t.event.toUpperCase(), ARCHIVO, 400, room, 32, 20);
      put(ctx, t.event.toUpperCase(), PAD, p.band.top / 2, { size, family: ARCHIVO, color: '#fff', maxW: room });
    }
    const category = (t.category || 'Participant').toUpperCase();
    put(ctx, category, L / 2, H - p.band.bottom / 2, { size: fit(category, ARCHIVO, 400, L - PAD * 2, 34, 22), family: ARCHIVO, align: 'center', color: '#fff' });

    const tw = p.x1 - p.x0;
    stack(
      ctx,
      [
        { str: t.first, size: fit(t.first, ARCHIVO, 400, tw, 116, 40), family: ARCHIVO },
        { str: t.last, size: fit(t.last, ARCHIVO, 400, tw, 64, 28), family: ARCHIVO, gap: 6 },
        { str: t.role, size: fit(t.role, BODY, 700, tw, 34, 22), weight: 700 },
        { str: t.company, size: fit(t.company, BODY, 400, tw, 30, 20) },
      ],
      { x0: p.x0, x1: p.x1, y: p.y0, h: p.y1 - p.y0 },
      { align: 'left', maxW: tw },
    );
  },

  /** A big category band ("VISITEUR"), then who, whom they visit, and when. */
  visitor(ctx, L, t, p) {
    band(ctx, 0, p.band.top, L);
    const category = (t.category || 'Visiteur').toUpperCase();
    const numberW = t.number ? widthOf(t.number, fontOf(22, MONO)) + PAD : 0;
    const room = L - PAD * 2 - numberW * 2;
    put(ctx, category, L / 2, p.band.top / 2, { size: fit(category, ARCHIVO, 400, room, 92, 40), family: ARCHIVO, align: 'center', color: '#fff', maxW: room });
    if (t.number) put(ctx, t.number, L - PAD, p.band.top - 20, { size: 22, family: MONO, align: 'right', color: '#fff' });

    const tw = p.x1 - p.x0;
    const name = full(t);
    stack(
      ctx,
      [
        { str: name, size: fit(name, ARCHIVO, 400, tw, 72, 30), family: ARCHIVO, gap: 4 },
        { str: t.role, size: fit(t.role, BODY, 400, tw, 28, 20) },
        { str: t.company, size: fit(t.company, BODY, 700, tw, 30, 20), weight: 700 },
        { str: t.host ? `Visite : ${t.host}` : '', size: fit(`Visite : ${t.host}`, BODY, 700, tw, 30, 20), weight: 700, gap: 4 },
        { str: t.date, size: 22, family: MONO },
        { str: t.note, size: fit(t.note, BODY, 400, tw, 24, 20) },
      ],
      { x0: p.x0, x1: p.x1, y: p.y0, h: p.y1 - p.y0 },
      { align: 'left', maxW: tw },
    );
  },

  /** "HELLO my name is": the name goes big, or a dotted line is left to write it by hand. */
  hello(ctx, L, t, p) {
    band(ctx, 0, p.band.top, L);
    const room = L - PAD * 2;
    put(ctx, t.helloTop, L / 2, 58, { size: fit(t.helloTop, ARCHIVO, 400, room, 92, 40), family: ARCHIVO, align: 'center', color: '#fff', maxW: room });
    put(ctx, t.helloSub, L / 2, 126, { size: fit(t.helloSub, BODY, 700, room, 34, 22), weight: 700, align: 'center', color: '#fff', maxW: room });

    const tw = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    if (t.first) {
      stack(
        ctx,
        [
          { str: t.first, size: fit(t.first, ARCHIVO, 400, tw - PAD, 150, 44), family: ARCHIVO },
          { str: t.last, size: fit(t.last, ARCHIVO, 400, tw, 56, 26), family: ARCHIVO },
          { str: [t.role, t.company].filter(Boolean).join(' · '), size: fit([t.role, t.company].filter(Boolean).join(' · '), BODY, 700, tw, 30, 20), weight: 700, gap: 4 },
        ],
        { x0: p.x0, x1: p.x1, y: p.y0, h: p.y1 - p.y0 },
        { align: 'center', maxW: tw },
      );
    } else {
      // Nothing typed: leave a dotted line to write on.
      const y = p.y0 + (p.y1 - p.y0) * 0.68;
      ctx.fillStyle = '#000';
      for (let x = p.x0 + PAD; x < p.x1 - PAD; x += 10) ctx.fillRect(x, y, 5, 4);
      put(ctx, 'écris ton prénom', cx, y + 30, { size: 22, family: MONO, align: 'center' });
    }
  },
};

/**
 * @param {CanvasRenderingContext2D} ctx  already in badge coordinates
 * @param {number} L  length in dots
 * @param {object} t  texts: first, last, role, company, event, category, host, number, note, date, helloTop, helloSub
 * @param {{ frame: boolean, photo?: HTMLCanvasElement, qr?: { matrix: object, module: number } }} o
 */
export function drawBadge(ctx, L, template, t, p, { frame, photo, qr }) {
  (TEMPLATES[template] ?? TEMPLATES.conference)(ctx, L, t, p);
  if (photo && p.photo) drawPhoto(ctx, p.photo, photo);
  if (qr && p.qr) drawQr(ctx, p.qr, qr);
  if (frame) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, L - 6, H - 6);
  }
}
