/**
 * Bullet journal stickers: habit tracker (month or week), weekly spread (Mon → Sun, 3 lines a day),
 * daily log, and the key to your bullets.
 *
 * Everything is drawn on a grid whose step you choose (5 mm = the dot grid of a Leuchtturm1917,
 * 40 dots), in whole cells, so rows and columns land on the dots of the page once stuck in.
 * The strips run along the tape, with the 48 mm of the head across: stick them down the page.
 */
import { draw, space, text } from '../engine/blocks.js';
import { DOTS_PER_MM, PRINT_WIDTH as W } from '../engine/constants.js';
import { TYPE } from '../fonts.js';
import { CalendarError, agenda } from '../services/calendar.js';

const ARCHIVO = 'Archivo Black';
const BODY = 'Atkinson Hyperlegible';
const MONO = 'Departure Mono';
const FONTS = [`40px "${ARCHIVO}"`, `700 22px "${BODY}"`, `400 22px "${BODY}"`, `22px "${MONO}"`];
const TAU = Math.PI * 2;

const DAY_LETTER = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_SHORT = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

/* ---------- Dates ---------- */

/** "2026-11-02" or "2/11/2026" → Date; anything else (or empty) → today. */
function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return new Date();
}

const dayIndex = (d) => (d.getDay() + 6) % 7; // Monday = 0
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d) => addDays(d, -dayIndex(d));

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
}

const monthName = (d) => d.toLocaleDateString('fr-LU', { month: 'long' });
const shortDate = (d) => d.toLocaleDateString('fr-LU', { day: 'numeric', month: 'short' }).replace(/\./g, '');
const clean = (s) => String(s ?? '').replace(/[  ]/g, ' ').trim();
const linesOf = (s) => String(s ?? '').split('\n').map(clean).filter(Boolean);

/* ---------- Canvas helpers ---------- */

const fontOf = (size, family = BODY, weight = 400) => `${weight} ${size}px "${family}"`;

const put = (ctx, str, x, y, { size, family = BODY, weight = 400, align = 'left', color = '#000' }) => {
  ctx.save();
  ctx.font = fontOf(size, family, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, Math.round(x), Math.round(y));
  ctx.restore();
};

/** Text cut with … when wider than maxW. */
function clip(ctx, str, font, maxW) {
  ctx.font = font;
  if (ctx.measureText(str).width <= maxW) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Largest size (steps of 2) that fits maxW. */
function fitSize(ctx, str, family, weight, maxW, max, min = 18) {
  for (let size = max; size > min; size -= 2) {
    ctx.font = fontOf(size, family, weight);
    if (ctx.measureText(str).width <= maxW) return size;
  }
  return min;
}

const hline = (ctx, x1, x2, y, t = 2) => ctx.fillRect(Math.round(x1), Math.round(y - t / 2), Math.round(x2 - x1), t);
const vline = (ctx, x, y1, y2, t = 2) => ctx.fillRect(Math.round(x - t / 2), Math.round(y1), t, Math.round(y2 - y1));
const dotted = (ctx, x1, x2, y) => {
  for (let x = x1; x < x2; x += 6) ctx.fillRect(Math.round(x), Math.round(y - 1), 2, 2);
};
const ring = (ctx, x, y, r, t = 2) => {
  ctx.lineWidth = t;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
};
const dot = (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
};

/** Black block with white text, for weekend days and section headings. */
function chip(ctx, x, y, w, h, str, size, family = BODY, weight = 700) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  put(ctx, str, x + w / 2, y + h / 2, { size, family, weight, align: 'center', color: '#fff' });
}

/* ---------- Habit tracker (month or week) ---------- */

/**
 * Days run down the tape, habits across, one cell each, names written upright along the top.
 * Month: one row per day. Week: seven rows (Mon → Sun) with the date of each.
 */
function tracker(v, cell, date) {
  const week = v.period === 'week';
  const first = week ? monday(date) : new Date(date.getFullYear(), date.getMonth(), 1);
  const count = week ? 7 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const rowH = week ? cell * 2 : cell;
  const maxHabits = Math.max(1, Math.floor(W / cell) - 2);
  const habits = linesOf(v.habits).slice(0, maxHabits);
  const cols = 2 + habits.length;
  const x0 = Math.round((W - cols * cell) / 2);
  const titleH = Math.max(cell * 2, 84);
  const labelH = habits.length ? Math.max(cell * 4, 160) : 0;
  const H = titleH + labelH + count * rowH + 14;
  const note = habits.length >= maxHabits && linesOf(v.habits).length > maxHabits ? `Seulement ${maxHabits} habitudes tiennent à ce pas de grille.` : '';

  const block = draw(
    H,
    (ctx) => {
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      const title = week ? `Semaine ${isoWeek(first)}` : monthName(first).toUpperCase();
      const sub = week ? `${shortDate(first)} → ${shortDate(addDays(first, 6))}` : String(first.getFullYear());
      put(ctx, title, W / 2, titleH * 0.38, { size: fitSize(ctx, title, ARCHIVO, 400, W - 24, 44, 24), family: ARCHIVO, align: 'center' });
      put(ctx, sub, W / 2, titleH * 0.8, { size: 22, family: MONO, align: 'center' });

      const top = titleH + labelH;
      habits.forEach((name, j) => {
        ctx.save();
        ctx.translate(x0 + (2 + j) * cell + cell / 2, top - 8);
        ctx.rotate(-Math.PI / 2);
        put(ctx, clip(ctx, name, fontOf(22, BODY, 700), labelH - 16), 0, 0, { size: 22, weight: 700 });
        ctx.restore();
      });

      for (let i = 0; i < count; i++) {
        const d = addDays(first, i);
        const y = top + i * rowH;
        const weekend = dayIndex(d) >= 5;
        if (weekend) chip(ctx, x0, y + 1, cell * 2, rowH - 2, '', 22);
        put(ctx, String(d.getDate()), x0 + cell / 2, y + rowH / 2, { size: 22, family: MONO, align: 'center', color: weekend ? '#fff' : '#000' });
        put(ctx, DAY_LETTER[dayIndex(d)], x0 + cell * 1.5, y + rowH / 2, { size: 22, weight: 700, align: 'center', color: weekend ? '#fff' : '#000' });
        if (v.marks === 'circles') for (let j = 0; j < habits.length; j++) ring(ctx, x0 + (2 + j) * cell + cell / 2, y + rowH / 2, Math.min(cell, rowH) * 0.3);
        if (v.marks === 'dots') for (let j = 0; j < habits.length; j++) dot(ctx, x0 + (2 + j) * cell + cell / 2, y + rowH / 2, 3);
      }

      // the grid
      for (let i = 0; i <= count; i++) hline(ctx, x0, x0 + cols * cell, top + i * rowH, i === 0 || i === count ? 3 : 2);
      for (let c = 0; c <= cols; c++) vline(ctx, x0 + c * cell, top, top + count * rowH, c === 0 || c === cols || c === 2 ? 3 : 2);
    },
    { fonts: FONTS },
  );
  return { blocks: [block], note };
}

/* ---------- Weekly spread ---------- */

/** Mon → Sun, a few ruled lines per day for tasks and notes; events from the calendar fill the first lines. */
async function weekly(v, cell, date) {
  const first = monday(date);
  const lines = Math.max(1, Math.min(6, Number(v.dayLines) || 3));
  const rowH = lines * cell;
  const headH = Math.max(cell * 2, 84);
  const labelW = cell * 2;

  let events = [];
  let note = '';
  const urls = String(v.icsUrls ?? '').split(/\s+/).filter(Boolean);
  if (urls.length) {
    const res = await agenda(urls, first, 7);
    events = res.events;
    note = res.errors.join(' ');
  }
  const eventsOf = (d) => events.filter((e) => e.start.toDateString() === d.toDateString() || (e.allDay && e.start <= d && e.end > d));

  const H = headH + 7 * rowH + 10;
  const block = draw(
    H,
    (ctx) => {
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      const title = `Semaine ${isoWeek(first)}`;
      put(ctx, title, W / 2, headH * 0.38, { size: fitSize(ctx, title, ARCHIVO, 400, W - 24, 44, 24), family: ARCHIVO, align: 'center' });
      put(ctx, `${shortDate(first)} → ${shortDate(addDays(first, 6))}`, W / 2, headH * 0.8, { size: 22, family: MONO, align: 'center' });

      for (let i = 0; i < 7; i++) {
        const d = addDays(first, i);
        const y = headH + i * rowH;
        const weekend = i >= 5;
        // day label: a black block on weekends, so they stand out in the notebook
        if (weekend) chip(ctx, 0, y + 2, labelW, rowH - 4, '', 22);
        const ink = weekend ? '#fff' : '#000';
        put(ctx, DAY_SHORT[i], labelW / 2, y + rowH / 2 - 14, { size: 22, family: ARCHIVO, align: 'center', color: ink });
        put(ctx, String(d.getDate()), labelW / 2, y + rowH / 2 + 14, { size: 22, family: MONO, align: 'center', color: ink });
        // the ruled lines of the day: dotted guides, one per cell
        ctx.fillStyle = '#000';
        for (let k = 1; k <= lines; k++) dotted(ctx, labelW + 8, W - 4, y + k * cell - 4);
        // events on the first lines
        eventsOf(d)
          .slice(0, lines)
          .forEach((e, k) => {
            const when = e.allDay ? '' : `${e.start.toLocaleTimeString('fr-LU', { hour: '2-digit', minute: '2-digit', hour12: false })} `;
            ring(ctx, labelW + 18, y + k * cell + cell / 2 - 6, 6);
            put(ctx, clip(ctx, `${when}${clean(e.title)}`, fontOf(20), W - labelW - 44), labelW + 32, y + k * cell + cell / 2 - 6, { size: 20 });
          });
        hline(ctx, 0, W, y, i === 0 ? 3 : 2);
      }
      hline(ctx, 0, W, headH + 7 * rowH, 3);
      vline(ctx, labelW, headH, headH + 7 * rowH, 3);
    },
    { fonts: FONTS },
  );
  return { blocks: [block], note };
}

/* ---------- Daily log ---------- */

function daily(v, cell, date) {
  const n = Math.max(3, Math.min(30, Number(v.logLines) || 12));
  const priorities = v.priorities ? 3 : 0;
  const headH = Math.max(cell * 3, 130);
  const bandH = cell;
  const H = headH + (priorities ? bandH + priorities * cell + 8 : 0) + bandH + n * cell + 12;

  const block = draw(
    H,
    (ctx) => {
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      const weekday = date.toLocaleDateString('fr-LU', { weekday: 'long' }).toUpperCase();
      put(ctx, weekday, W / 2, headH * 0.3, { size: fitSize(ctx, weekday, ARCHIVO, 400, W - 24, 48, 24), family: ARCHIVO, align: 'center' });
      put(ctx, String(date.getDate()), W / 2, headH * 0.66, { size: 52, family: ARCHIVO, align: 'center' });
      put(ctx, `${monthName(date)} ${date.getFullYear()}`, W / 2, headH * 0.92, { size: 22, family: MONO, align: 'center' });

      let y = headH;
      const section = (label) => {
        chip(ctx, 0, y + 4, W, bandH - 8, label.toUpperCase(), 22, ARCHIVO, 400);
        y += bandH;
      };
      if (priorities) {
        section('Priorités');
        for (let i = 0; i < priorities; i++) {
          ctx.lineWidth = 3;
          ctx.strokeRect(6, y + (cell - 24) / 2 + 1.5, 24, 24);
          ctx.fillStyle = '#000';
          dotted(ctx, 44, W - 4, y + cell - 6);
          y += cell;
        }
        y += 8;
      }
      section('Notes · rapid logging');
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = '#000';
        dot(ctx, 12, y + cell / 2 - 4, 3); // where the bullet goes
        dotted(ctx, 28, W - 4, y + cell - 4);
        y += cell;
      }
    },
    { fonts: FONTS },
  );
  return { blocks: [block], note: '' };
}

/* ---------- Key to the bullets ---------- */

const SYMBOLS = [
  (ctx, x, y) => dot(ctx, x, y, 7), // task
  (ctx, x, y) => ring(ctx, x, y, 9, 3), // event
  (ctx, x, y) => hline(ctx, x - 9, x + 9, y, 3), // note
  (ctx, x, y) => {
    // done: a cross
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 8);
    ctx.lineTo(x + 8, y + 8);
    ctx.moveTo(x + 8, y - 8);
    ctx.lineTo(x - 8, y + 8);
    ctx.stroke();
  },
  (ctx, x, y) => {
    // migrated: >
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 9);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x - 6, y + 9);
    ctx.stroke();
  },
  (ctx, x, y) => {
    // scheduled: <
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 9);
    ctx.lineTo(x - 6, y);
    ctx.lineTo(x + 6, y + 9);
    ctx.stroke();
  },
  (ctx, x, y) => {
    // priority: a star
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 5 : 12;
      const t = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(t), y + r * Math.sin(t));
    }
    ctx.closePath();
    ctx.fill();
  },
];

const DEFAULT_KEY = ['Tâche', 'Événement', 'Note', 'Fait', 'Migré', 'Planifié', 'Prioritaire'];

function legend(v, cell) {
  const labels = linesOf(v.legend);
  const names = DEFAULT_KEY.map((d, i) => labels[i] ?? d);
  const rowH = Math.round(cell * 1.5);
  const H = Math.max(cell * 2, 84) + names.length * rowH + 10;
  const headH = Math.max(cell * 2, 84);
  const block = draw(
    H,
    (ctx) => {
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      put(ctx, 'LÉGENDE', W / 2, headH * 0.5, { size: 40, family: ARCHIVO, align: 'center' });
      names.forEach((name, i) => {
        const y = headH + i * rowH;
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
        SYMBOLS[i](ctx, 34, y + rowH / 2);
        put(ctx, clip(ctx, name, fontOf(26, BODY, 700), W - 90), 74, y + rowH / 2, { size: 26, weight: 700 });
        dotted(ctx, 8, W - 8, y + rowH - 1);
      });
    },
    { fonts: FONTS },
  );
  return { blocks: [block], note: '' };
}

/* ---------- Module ---------- */

const TYPES = [
  { value: 'tracker', label: 'Suivi d’habitudes' },
  { value: 'week', label: 'Semaine' },
  { value: 'day', label: 'Journée' },
  { value: 'key', label: 'Légende' },
];

const cellOf = (mm) => Math.max(28, Math.round((Number(mm) || 5) * DOTS_PER_MM));

/** The calendar addresses typed in the morning ticket, so they are not asked twice. */
function savedCalendar() {
  try {
    return JSON.parse(localStorage.getItem('rouleau:module:morning') ?? '{}').icsUrls ?? '';
  } catch {
    return '';
  }
}

export default {
  id: 'bujo',
  label: 'Bullet journal',
  icon: 'book-open',
  description: 'Suivi d’habitudes (mois ou semaine), semaine Lun → Dim, journée, légende des puces. Dessinés sur la grille de ton carnet.',

  defaults: {
    kind: 'tracker',
    date: '',
    pitchMm: 5,
    period: 'month',
    habits: 'Sport\nLecture\nEau\nSommeil\nMéditation',
    marks: 'circles',
    dayLines: 3,
    icsUrls: savedCalendar(),
    priorities: true,
    logLines: 12,
    legend: '',
  },

  controls(v) {
    const schema = [
      { type: 'radio', key: 'kind', label: 'Modèle', refresh: true, options: TYPES },
      {
        type: 'text',
        key: 'date',
        label: 'Date de référence',
        hint: 'Vide : aujourd’hui. Sert à choisir le mois, la semaine ou le jour. Ex. 2026-11-02 ou 2/11/2026.',
        placeholder: 'aujourd’hui',
      },
    ];
    if (v.kind === 'tracker') {
      schema.push(
        {
          type: 'radio',
          key: 'period',
          label: 'Période',
          options: [
            { value: 'month', label: 'Mois' },
            { value: 'week', label: 'Semaine' },
          ],
        },
        { type: 'textarea', key: 'habits', label: 'Habitudes (une par ligne)', rows: 5 },
        {
          type: 'radio',
          key: 'marks',
          label: 'Cases',
          options: [
            { value: 'circles', label: 'Ronds' },
            { value: 'dots', label: 'Points' },
            { value: 'none', label: 'Vides' },
          ],
        },
      );
    }
    if (v.kind === 'week') {
      schema.push(
        { type: 'slider', key: 'dayLines', label: 'Lignes par jour', min: 1, max: 6, step: 1 },
        { type: 'textarea', key: 'icsUrls', label: 'Agenda (adresses iCal, optionnel)', hint: 'Les événements de la semaine remplissent les premières lignes.', rows: 2 },
      );
    }
    if (v.kind === 'day') {
      schema.push(
        { type: 'switch', key: 'priorities', label: 'Trois priorités à cocher' },
        { type: 'slider', key: 'logLines', label: 'Lignes de rapid logging', min: 3, max: 30, step: 1 },
      );
    }
    if (v.kind === 'key') schema.push({ type: 'textarea', key: 'legend', label: 'Tes mots (une ligne par puce, optionnel)', hint: 'Dans l’ordre : tâche, événement, note, fait, migré, planifié, prioritaire.', rows: 4 });

    schema.push({
      type: 'slider',
      key: 'pitchMm',
      label: 'Pas de la grille (mm)',
      hint: 'Leuchtturm1917 pointillé : 5 mm. Carnet ligné : mesure dix interlignes et divise par dix.',
      min: 4,
      max: 9,
      step: 0.5,
    });
    return schema;
  },

  async build(v) {
    await Promise.all(FONTS.map((f) => document.fonts.load(f, 'AaÉé09').catch(() => null)));
    const cell = cellOf(v.pitchMm);
    const date = parseDate(v.date);
    let result;
    try {
      result =
        v.kind === 'week' ? await weekly(v, cell, date) : v.kind === 'day' ? daily(v, cell, date) : v.kind === 'key' ? legend(v, cell) : tracker(v, cell, date);
    } catch (err) {
      return [text(err instanceof CalendarError ? err.message : String(err), TYPE.caption)];
    }
    const blocks = [...result.blocks];
    if (result.note) blocks.push(space(6), text(result.note, TYPE.caption));
    return blocks;
  },
};
