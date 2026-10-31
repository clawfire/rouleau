/**
 * Focus ticket: a commitment, not a tracker. One task, how you know it is done, and the stretch of time
 * you give it, drawn on a clock face or a ruler. Nothing to tick: put it on the desk and look up at the
 * real clock. Optional first move, an "if I get distracted" line, and a parking lot for stray thoughts.
 */
import { lines, row, rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { FONTS, dial, strip } from './focus-draw.js';

const clean = (s) => String(s ?? '').replace(/[  ]/g, ' ').trim();

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

/** A label, then what was typed or a line to write on. */
const field = (label, value, o = {}) =>
  value ? [text(label, TYPE.caption), text(value, { ...TYPE.body, ...o })] : [text(label, TYPE.caption), lines(1, { gap: 36 })];

export default {
  id: 'focus',
  label: 'Ticket de focus',
  icon: 'bullseye',
  description: 'Un engagement plutôt qu’un suivi : une tâche, un critère de fin et le temps que tu t’accordes, dessiné sur un cadran ou une règle. Rien à cocher.',

  defaults: {
    task: '',
    done: '',
    duration: 50,
    start: '',
    visual: 'dial',
    first: true,
    firstStep: '',
    ifThen: true,
    ifThenText: '',
    parking: true,
    parkingLines: 3,
    signature: false,
  },

  controls(v) {
    const schema = [
      { type: 'text', key: 'task', label: 'La tâche', hint: 'Vide : une ligne pour l’écrire à la main.', placeholder: 'Écrire le chapitre 3' },
      { type: 'text', key: 'done', label: 'Terminé quand…', placeholder: 'Le plan est relu et envoyé' },
      { type: 'slider', key: 'duration', label: 'Durée (min)', min: 15, max: 240, step: 5 },
      { type: 'text', key: 'start', label: 'Heure de début', hint: 'HH:MM. Vide : maintenant.', placeholder: 'maintenant' },
      {
        type: 'radio',
        key: 'visual',
        label: 'Le temps en un coup d’œil',
        options: [
          { value: 'dial', label: 'Cadran' },
          { value: 'strip', label: 'Règle' },
        ],
      },
      { type: 'switch', key: 'first', label: 'Premier geste', refresh: true },
    ];
    if (v.first) schema.push({ type: 'text', key: 'firstStep', label: 'Le premier geste (2 minutes)', hint: 'Vide : une ligne à remplir.', placeholder: 'Ouvrir le fichier' });
    schema.push({ type: 'switch', key: 'ifThen', label: 'Si je me disperse…', refresh: true });
    if (v.ifThen) schema.push({ type: 'text', key: 'ifThenText', label: 'Je reviens à…', hint: 'Vide : une ligne à remplir.' });
    schema.push({ type: 'switch', key: 'parking', label: 'Parking des pensées parasites', refresh: true });
    if (v.parking) schema.push({ type: 'slider', key: 'parkingLines', label: 'Lignes de parking', min: 1, max: 8, step: 1 });
    schema.push({ type: 'switch', key: 'signature', label: 'Ligne de signature' });
    return schema;
  },

  async blocks(v) {
    await Promise.all(FONTS.map((f) => document.fonts.load(f, '0123456789:').catch(() => null)));
    const minutes = Math.max(5, Math.round((Number(v.duration) || 50) / 5) * 5);
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
      v.visual === 'strip' ? strip(start, minutes) : dial(start, minutes),
      space(4),
      row('Durée', `${minutes} min`, TYPE.strong),
      text(`${hhmm(start)}  →  ${hhmm(start + minutes)}`, { ...TYPE.caption, align: 'center' }),
    );

    if (v.first) blocks.push(space(10), ...field('Premier geste', clean(v.firstStep)));
    if (v.ifThen) blocks.push(space(10), ...field('Si je me disperse, je reviens à :', clean(v.ifThenText)));
    if (v.parking) {
      blocks.push(space(10), text('Parking', TYPE.section), space(2), text('Une idée parasite ? Note-la, reviens.', { ...TYPE.caption, align: 'center' }), lines(Math.max(1, Number(v.parkingLines) || 3), { gap: 38 }));
    }
    if (v.signature) blocks.push(space(10), text('Signé :', TYPE.caption), lines(1, { gap: 40 }));
    return blocks;
  },
};
