/**
 * Workout sheet: a Hevy routine printed with a drawn checkbox per set,
 * a write-in line for what was actually lifted, and last session's numbers.
 */
import { check, draw, lines, row, rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { HevyError, clearHevyCache, lastSetsByTemplate, listRoutines, recentWorkouts } from '../services/hevy.js';

/* ---------- Formatting ---------- */

const num = (n) => Number(n).toLocaleString('fr-LU', { maximumFractionDigits: 1 });

const duration = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`;
};

/** One set → "41 kg × 10", "× 8–12", "10:02", "500 m"… */
export function formatSet(set) {
  const parts = [];
  if (set.weight_kg != null) parts.push(`${num(set.weight_kg)} kg`);
  if (set.reps != null) parts.push(`× ${set.reps}`);
  else if (set.rep_range?.start != null) {
    const { start, end } = set.rep_range;
    parts.push(end != null && end !== start ? `× ${start}–${end}` : `× ${start}`);
  }
  if (set.distance_meters != null) {
    parts.push(set.distance_meters >= 1000 ? `${num(set.distance_meters / 1000)} km` : `${num(set.distance_meters)} m`);
  }
  if (set.duration_seconds != null) parts.push(duration(set.duration_seconds));
  return parts.join(' ') || '—';
}

/** Compact version for "last time": "41×12 · 41×10". */
const shortSet = (set) => {
  if (set.weight_kg != null && set.reps != null) return `${num(set.weight_kg)}×${set.reps}`;
  return formatSet(set).replace(/ /g, '');
};

const TAGS = { warmup: 'É', failure: 'F', dropset: 'D' };

/* ---------- Demo data (no API key) ---------- */

const DEMO = {
  id: 'demo',
  title: 'Full body A (démo)',
  exercises: [
    { title: 'Vélo', rest_seconds: 0, sets: [{ type: 'normal', duration_seconds: 600 }] },
    {
      title: 'Squat (Barbell)',
      rest_seconds: 120,
      exercise_template_id: 'demo-squat',
      sets: [
        { type: 'warmup', weight_kg: 40, reps: 10 },
        { type: 'normal', weight_kg: 70, reps: 8 },
        { type: 'normal', weight_kg: 70, reps: 8 },
        { type: 'normal', weight_kg: 70, reps: 8 },
      ],
    },
    {
      title: 'Seated Row (Machine)',
      rest_seconds: 90,
      notes: 'Omoplates serrées',
      sets: [
        { type: 'normal', weight_kg: 52, reps: 12 },
        { type: 'normal', weight_kg: 52, reps: 12 },
        { type: 'failure', weight_kg: 52, rep_range: { start: 10, end: 15 } },
      ],
    },
    { title: 'Plank', rest_seconds: 60, sets: [{ type: 'normal', duration_seconds: 60 }, { type: 'normal', duration_seconds: 60 }] },
  ],
};

const DEMO_LAST = new Map([
  ['demo-squat', { date: new Date(Date.now() - 3 * 864e5).toISOString(), sets: [{ weight_kg: 67.5, reps: 8 }, { weight_kg: 67.5, reps: 8 }, { weight_kg: 67.5, reps: 7 }] }],
]);

/* ---------- Module ---------- */

export default {
  id: 'workout',
  label: 'Séance de sport',
  icon: 'dumbbell',
  description: 'Ta routine Hevy sur papier : une case par série, la place de noter ce que tu as soulevé, et tes chiffres de la dernière fois.',

  defaults: {
    apiKey: '',
    routineId: '',
    showLast: true,
    writeIn: true,
    showRest: true,
    notes: true,
  },

  /** Async: the routine picker needs the API key. */
  async controls(v) {
    const schema = [
      {
        type: 'text',
        key: 'apiKey',
        label: 'Clé API Hevy',
        hint: 'Hevy › Settings › Developer (Hevy Pro). Stockée seulement dans ce navigateur.',
        password: true,
        refresh: true,
      },
    ];

    if (!v.apiKey) {
      schema.push({ type: 'callout', variant: 'neutral', text: "Sans clé, l'aperçu utilise une séance de démo." });
    } else {
      try {
        clearHevyCache();
        const routines = await listRoutines(v.apiKey);
        if (!routines.length) {
          schema.push({ type: 'callout', variant: 'warning', text: 'Aucune routine dans ton compte Hevy.' });
        } else {
          if (!routines.some((r) => r.id === v.routineId)) v.routineId = routines[0].id;
          schema.push({
            type: 'select',
            key: 'routineId',
            label: 'Routine',
            options: routines.map((r) => ({ value: r.id, label: r.title })),
          });
        }
      } catch (err) {
        schema.push({ type: 'callout', variant: 'danger', text: err instanceof HevyError ? err.message : String(err) });
      }
    }

    schema.push(
      { type: 'switch', key: 'showLast', label: 'Afficher la dernière fois' },
      { type: 'switch', key: 'writeIn', label: 'Ligne pour noter le réalisé' },
      { type: 'switch', key: 'showRest', label: 'Temps de repos' },
      { type: 'switch', key: 'notes', label: 'Zone notes + énergie' },
    );
    return schema;
  },

  async build(v) {
    let routine = DEMO;
    let last = DEMO_LAST;
    if (v.apiKey) {
      const routines = await listRoutines(v.apiKey);
      routine = routines.find((r) => r.id === v.routineId) ?? routines[0];
      if (!routine) return [text('Aucune routine Hevy.', TYPE.body)];
      last = new Map();
      if (v.showLast) {
        try {
          last = lastSetsByTemplate(await recentWorkouts(v.apiKey));
        } catch {
          // History is a bonus; print the sheet anyway.
        }
      }
    }

    const exercises = routine.exercises ?? [];
    const setCount = exercises.reduce((n, e) => n + (e.sets?.length ?? 0), 0);
    const today = new Date().toLocaleDateString('fr-LU', { weekday: 'long', day: 'numeric', month: 'long' });

    const blocks = [
      text('Séance', TYPE.section),
      space(8),
      text(routine.title, { ...TYPE.title, size: 32, align: 'center' }),
      space(4),
      text(today, { ...TYPE.caption, align: 'center' }),
      row(`${exercises.length} exos`, `${setCount} séries`, TYPE.caption),
      rule({ style: 'zigzag', thickness: 2 }),
    ];

    exercises.forEach((ex, i) => {
      blocks.push(space(6), text(`${i + 1}. ${ex.title}`, TYPE.strong));

      const meta = [];
      if (v.showRest && ex.rest_seconds) meta.push(`repos ${duration(ex.rest_seconds)}`);
      if (ex.notes) meta.push(ex.notes);
      if (meta.length) blocks.push(text(meta.join(' · '), TYPE.caption));
      blocks.push(space(4));

      let n = 0;
      for (const set of ex.sets ?? []) {
        const tag = TAGS[set.type] ?? String(++n);
        blocks.push(check(tag, formatSet(set), { write: v.writeIn }));
      }

      const prev = v.showLast && ex.exercise_template_id ? last.get(ex.exercise_template_id) : null;
      if (prev?.sets?.length) {
        const date = new Date(prev.date).toLocaleDateString('fr-LU', { day: '2-digit', month: '2-digit' });
        const sets = prev.sets.filter((s) => s.type !== 'warmup').map(shortSet).join(' · ');
        blocks.push(space(2), text(`Dernière fois (${date}) : ${sets}`, TYPE.caption));
      }
      blocks.push(space(4), rule({ style: 'dashed', thickness: 2, margin: 6 }));
    });

    if (v.notes) {
      blocks.push(
        space(6),
        text('Notes', TYPE.section),
        lines(3),
        space(10),
        energyRow(),
      );
    }

    blocks.push(
      space(8),
      text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }),
      rule({ style: 'zigzag', thickness: 2 }),
    );
    return blocks;
  },
};

/** "Énergie  ☐ ☐ ☐ ☐ ☐" with drawn boxes. */
function energyRow() {
  const box = 26;
  return draw(box + 8, (ctx, W, H) => {
    ctx.font = `400 22px "${TYPE.caption.family}"`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Énergie', 0, H / 2);
    ctx.lineWidth = 3;
    const gap = 12;
    const start = W - 5 * box - 4 * gap - 2;
    for (let i = 0; i < 5; i++) ctx.strokeRect(start + i * (box + gap) + 1.5, 4 + 1.5, box - 3, box - 3);
  });
}
