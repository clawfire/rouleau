/**
 * Focus ticket: one task, one way to know it is done, a block of time you can cross off
 * (5-minute squares, or pomodoros), the steps, and a parking lot for the thoughts that
 * try to hijack the session. Stick it on the desk and tick things off.
 */
import { draw, lines, row, rule, space, text } from '../engine/blocks.js';
import { PRINT_WIDTH } from '../engine/constants.js';
import { TYPE } from '../fonts.js';
import { fontsReady, item } from './morning-draw.js';

const clean = (s) => String(s ?? '').replace(/[  ]/g, ' ').trim();
const linesOf = (s) => String(s ?? '').split('\n').map(clean).filter(Boolean);

const hhmm = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** "14:30" → minutes since midnight; anything else → now, rounded up to the next 5 minutes. */
function startMinutes(raw) {
  const m = clean(raw).match(/^(\d{1,2})[:h](\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return +m[1] * 60 + +m[2];
  const now = new Date();
  return Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
}

/* ---------- The block of time ---------- */

const COLS = 12; // 12 cells of 5 minutes: one row is one hour
const PITCH = PRINT_WIDTH / COLS; // 32 dots

/**
 * @param {('w'|'b')[]} items  'w' = 5 minutes of work (a square to cross), 'b' = 5 minutes of break (a ring)
 */
function timeGrid(items) {
  const rows = Math.ceil(items.length / COLS);
  return draw(
    rows * PITCH + 6,
    (ctx) => {
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      items.forEach((kind, i) => {
        const cx = (i % COLS) * PITCH + PITCH / 2;
        const cy = Math.floor(i / COLS) * PITCH + PITCH / 2 + 3;
        if (kind === 'w') {
          ctx.lineWidth = 3;
          ctx.strokeRect(cx - 12, cy - 12, 24, 24);
        } else {
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    { mode: 'threshold' },
  );
}

/** Work and break cells, in order, plus the total length in minutes. */
function plan(v) {
  if (v.mode === 'pomodoro') {
    const work = Math.max(1, Math.round((Number(v.workMin) || 25) / 5));
    const rest = Math.max(1, Math.round((Number(v.breakMin) || 5) / 5));
    const rounds = Math.max(1, Math.min(8, Number(v.rounds) || 4));
    const items = [];
    for (let r = 0; r < rounds; r++) {
      items.push(...Array(work).fill('w'));
      if (r < rounds - 1) items.push(...Array(rest).fill('b'));
    }
    return { items, minutes: items.length * 5, label: `${rounds} × ${work * 5} min` };
  }
  const minutes = Math.max(5, Math.round((Number(v.duration) || 50) / 5) * 5);
  return { items: Array(minutes / 5).fill('w'), minutes, label: `${minutes} min` };
}

/* ---------- Module ---------- */

export default {
  id: 'focus',
  label: 'Ticket de focus',
  icon: 'bullseye',
  description: 'Une tâche, un critère de fin, un bloc de temps à cocher (minuteur ou pomodoros), les étapes, et un parking pour les pensées parasites.',

  defaults: {
    task: '',
    done: '',
    mode: 'timer',
    duration: 50,
    workMin: 25,
    breakMin: 5,
    rounds: 4,
    start: '',
    steps: '',
    ritual: false,
    ritualLines: 'Notifications coupées\nTéléphone hors de vue\nUn verre d’eau',
    parking: true,
    parkingLines: 3,
  },

  controls(v) {
    const schema = [
      { type: 'text', key: 'task', label: 'La tâche', hint: 'Vide : une ligne pour l’écrire à la main.', placeholder: 'Écrire le chapitre 3' },
      { type: 'text', key: 'done', label: 'Terminé quand…', placeholder: 'Le plan est relu et envoyé' },
      {
        type: 'radio',
        key: 'mode',
        label: 'Temps',
        refresh: true,
        options: [
          { value: 'timer', label: 'Minuteur' },
          { value: 'pomodoro', label: 'Pomodoros' },
        ],
      },
    ];
    if (v.mode === 'pomodoro') {
      schema.push(
        { type: 'slider', key: 'rounds', label: 'Pomodoros', min: 1, max: 8, step: 1 },
        { type: 'slider', key: 'workMin', label: 'Travail (min)', min: 5, max: 60, step: 5 },
        { type: 'slider', key: 'breakMin', label: 'Pause (min)', min: 5, max: 30, step: 5 },
      );
    } else {
      schema.push({ type: 'slider', key: 'duration', label: 'Durée (min)', hint: 'Un carré = 5 minutes, une rangée = une heure.', min: 15, max: 240, step: 5 });
    }
    schema.push(
      { type: 'text', key: 'start', label: 'Heure de début', hint: 'HH:MM. Vide : maintenant.', placeholder: 'maintenant' },
      { type: 'textarea', key: 'steps', label: 'Étapes (une par ligne)', rows: 4 },
      { type: 'switch', key: 'ritual', label: 'Avant de commencer', refresh: true },
    );
    if (v.ritual) schema.push({ type: 'textarea', key: 'ritualLines', label: 'Ta check-list de départ', rows: 3 });
    schema.push({ type: 'switch', key: 'parking', label: 'Parking des pensées parasites', refresh: true });
    if (v.parking) schema.push({ type: 'slider', key: 'parkingLines', label: 'Lignes de parking', min: 1, max: 8, step: 1 });
    return schema;
  },

  async build(v) {
    await fontsReady();
    const { items, minutes, label } = plan(v);
    const start = startMinutes(v.start);
    const today = new Date().toLocaleDateString('fr-LU', { weekday: 'long', day: 'numeric', month: 'long' });
    const task = clean(v.task);
    const done = clean(v.done);

    const blocks = [text('Focus', TYPE.section), space(8), text(today, { ...TYPE.caption, align: 'center' }), space(8)];

    if (task) blocks.push(text(task, { ...TYPE.title, size: 32, align: 'center' }));
    else blocks.push(text('Ma tâche', { ...TYPE.caption, align: 'center' }), lines(2, { gap: 40 }));
    blocks.push(space(6));
    if (done) blocks.push(text(`Terminé quand : ${done}`, { ...TYPE.body, align: 'center' }));
    else blocks.push(text('Terminé quand :', TYPE.caption), lines(1, { gap: 36 }));

    blocks.push(
      rule({ style: 'zigzag', thickness: 2 }),
      row('Durée', label, TYPE.strong),
      text(`${hhmm(start)}  →  ${hhmm(start + minutes)}${v.mode === 'pomodoro' ? ` · ${minutes} min` : ''}`, { ...TYPE.caption, align: 'center' }),
      space(6),
      timeGrid(items),
    );
    blocks.push(text(v.mode === 'pomodoro' ? 'carré = travail · rond = pause' : 'un carré = 5 minutes', { ...TYPE.body, size: 20, align: 'center' }));

    const steps = linesOf(v.steps).slice(0, 8);
    if (steps.length) {
      blocks.push(space(10), text('Étapes', TYPE.section), space(6));
      for (const s of steps) blocks.push(item(s, { box: true }));
    }
    const ritual = v.ritual ? linesOf(v.ritualLines).slice(0, 6) : [];
    if (ritual.length) {
      blocks.push(space(10), text('Avant de commencer', TYPE.section), space(6));
      for (const s of ritual) blocks.push(item(s, { box: true }));
    }
    if (v.parking) {
      blocks.push(space(10), text('Parking', TYPE.section), space(2), text('Une idée parasite ? Note-la, reviens.', { ...TYPE.caption, align: 'center' }), lines(Math.max(1, Number(v.parkingLines) || 3), { gap: 38 }));
    }

    blocks.push(space(8), rule({ style: 'zigzag', thickness: 2 }), text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }));
    return blocks;
  },
};
