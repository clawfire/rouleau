/**
 * Workout tickets, from Hevy:
 *  - plan:  a routine with a drawn checkbox per set, a write-in line and last session's numbers
 *  - recap: the last (or a chosen) workout with totals and personal records, to stick in a notebook
 */
import { check, draw, lines, row, rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { HevyError, clearHevyCache, lastSetsByTemplate, listRoutines, recentWorkouts } from '../services/hevy.js';
import { findRecords, summarize } from './workout-stats.js';

/* ---------- Formatting ---------- */

/** 1111.2 → "1 111,2" (plain space: the narrow no-break space has no glyph in our fonts). */
const num = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/\s/g, ' ');

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

/* ---------- Demo workout for the recap (no API key) ---------- */

const DEMO_DONE = {
  id: 'demo-done',
  title: 'Full Body 2 (démo)',
  start_time: new Date(Date.now() - 864e5).toISOString(),
  end_time: new Date(Date.now() - 864e5 + 71 * 60000).toISOString(),
  exercises: [
    {
      title: 'Hack Squat (Machine)',
      exercise_template_id: 'demo-hack',
      sets: [
        { type: 'warmup', weight_kg: 55, reps: 10, rpe: 6 },
        { type: 'normal', weight_kg: 92.5, reps: 12, rpe: 7 },
        { type: 'normal', weight_kg: 92.5, reps: 12, rpe: 7.5 },
        { type: 'normal', weight_kg: 92.5, reps: 12, rpe: 8 },
      ],
    },
    {
      title: 'Seated Cable Row (Cable)',
      exercise_template_id: 'demo-row',
      sets: [
        { type: 'normal', weight_kg: 73, reps: 12, rpe: 8 },
        { type: 'normal', weight_kg: 73, reps: 12, rpe: 8.5 },
        { type: 'normal', weight_kg: 73, reps: 12, rpe: 9 },
      ],
    },
    {
      title: 'Lying Leg Curl (Machine)',
      exercise_template_id: 'demo-curl',
      sets: [
        { type: 'normal', weight_kg: 59, reps: 15 },
        { type: 'normal', weight_kg: 59, reps: 15 },
      ],
    },
  ],
};

const DEMO_HISTORY = [
  DEMO_DONE,
  {
    id: 'demo-prev',
    start_time: new Date(Date.now() - 5 * 864e5).toISOString(),
    exercises: [
      { exercise_template_id: 'demo-hack', sets: [{ weight_kg: 90, reps: 12 }] },
      { exercise_template_id: 'demo-row', sets: [{ weight_kg: 73, reps: 12 }] },
    ],
  },
];

/* ---------- Module ---------- */

export default {
  id: 'workout',
  label: 'Séance de sport',
  icon: 'dumbbell',
  description: 'Avant : ta routine Hevy avec une case par série. Après : le bilan et tes records, à coller dans ton carnet. Ou une fiche vierge, sans Hevy.',

  defaults: {
    mode: 'plan',
    blankExercises: 5,
    blankSets: 3,
    apiKey: '',
    routineId: '',
    workoutId: '',
    showLast: true,
    writeIn: true,
    showRest: true,
    notes: true,
    recapLength: 'short',
    showRpe: true,
    historyPages: 10,
  },

  /** Async: pickers need the API key. */
  async controls(v) {
    const schema = [
      {
        type: 'radio',
        key: 'mode',
        label: 'Ticket',
        refresh: true,
        options: [
          { value: 'plan', label: 'Séance à faire' },
          { value: 'recap', label: 'Bilan' },
          { value: 'blank', label: 'Vierge' },
        ],
      },
    ];

    // Blank sheet: no Hevy needed.
    if (v.mode === 'blank') {
      schema.push(
        { type: 'slider', key: 'blankExercises', label: "Nombre d'exercices", min: 1, max: 12, step: 1 },
        { type: 'slider', key: 'blankSets', label: 'Séries par exercice', min: 1, max: 8, step: 1 },
        { type: 'switch', key: 'notes', label: 'Zone notes + énergie' },
      );
      return schema;
    }

    schema.push(
      {
        type: 'text',
        key: 'apiKey',
        label: 'Clé API Hevy',
        hint: 'Hevy › Settings › Developer (Hevy Pro). Stockée seulement dans ce navigateur.',
        password: true,
        refresh: true,
      },
    );

    if (!v.apiKey) {
      schema.push({ type: 'callout', variant: 'neutral', text: "Sans clé, l'aperçu utilise des données de démo." });
    } else {
      try {
        clearHevyCache();
        if (v.mode === 'recap') {
          const workouts = await recentWorkouts(v.apiKey, 1);
          if (!workouts.some((w) => w.id === v.workoutId)) v.workoutId = 'latest';
          schema.push({
            type: 'select',
            key: 'workoutId',
            label: 'Séance',
            options: [
              { value: 'latest', label: 'La plus récente' },
              ...workouts.map((w) => ({ value: w.id, label: `${shortDate(w.start_time)} · ${w.title}` })),
            ],
          });
        } else {
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
        }
      } catch (err) {
        schema.push({ type: 'callout', variant: 'danger', text: err instanceof HevyError ? err.message : String(err) });
      }
    }

    if (v.mode === 'recap') {
      schema.push(
        {
          type: 'slider',
          key: 'historyPages',
          label: 'Historique pour les records',
          hint: 'En paquets de 10 séances. Plus = records plus fiables, chargement plus long.',
          min: 1,
          max: 30,
          step: 1,
        },
        {
          type: 'radio',
          key: 'recapLength',
          label: 'Format',
          refresh: true,
          options: [
            { value: 'short', label: 'Court' },
            { value: 'full', label: 'Complet' },
          ],
        },
      );
      if (v.recapLength === 'full') schema.push({ type: 'switch', key: 'showRpe', label: 'RPE' });
    } else {
      schema.push(
        { type: 'switch', key: 'showLast', label: 'Afficher la dernière fois' },
        { type: 'switch', key: 'writeIn', label: 'Ligne pour noter le réalisé' },
        { type: 'switch', key: 'showRest', label: 'Temps de repos' },
        { type: 'switch', key: 'notes', label: 'Zone notes + énergie' },
      );
    }
    return schema;
  },

  build(v) {
    if (v.mode === 'blank') return buildBlank(v);
    return v.mode === 'recap' ? buildRecap(v) : buildPlan(v);
  },
};

/* ---------- "Séance à faire" ---------- */

async function buildPlan(v) {
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
}

/* ---------- "Vierge" (no Hevy) ---------- */

/** Column layout of a blank set row, in dots: box | kg | reps | effort. */
const BLANK_COLS = [
  { label: 'kg', from: 40, to: 160 },
  { label: 'reps', from: 176, to: 270 },
  { label: 'effort', from: 286, to: 384 },
];

function buildBlank(v) {
  const caption = `400 22px "${TYPE.caption.family}"`;
  const strong = `700 22px "${TYPE.strong.family}"`;
  const count = Number(v.blankExercises) || 5;
  const sets = Number(v.blankSets) || 3;

  const dotted = (ctx, from, to, y) => {
    for (let x = from; x < to; x += 4) ctx.fillRect(x, y, 2, 2);
  };

  const blocks = [
    text('Séance', TYPE.section),
    space(10),
    // "Date ......"
    draw(30, (ctx, W) => {
      ctx.font = caption;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Date', 0, 22);
      dotted(ctx, 70, W, 24);
    }, { fonts: [caption] }),
    rule({ style: 'zigzag', thickness: 2 }),
  ];

  for (let i = 1; i <= count; i++) {
    blocks.push(
      space(6),
      // "3. ...................." : exercise name to write
      draw(34, (ctx, W) => {
        ctx.font = strong;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${i}.`, 0, 26);
        dotted(ctx, 34, W, 28);
      }, { fonts: [strong] }),
      // Column headers
      draw(26, (ctx) => {
        ctx.font = caption;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        for (const c of BLANK_COLS) ctx.fillText(c.label, (c.from + c.to) / 2, 20);
      }, { fonts: [caption] }),
    );
    for (let s = 0; s < sets; s++) {
      blocks.push(
        draw(36, (ctx) => {
          ctx.lineWidth = 3;
          ctx.strokeRect(1.5, 6.5, 21, 21);
          for (const c of BLANK_COLS) dotted(ctx, c.from, c.to, 28);
        }),
      );
    }
    blocks.push(space(4), rule({ style: 'dashed', thickness: 2, margin: 6 }));
  }

  if (v.notes) blocks.push(space(6), text('Notes', TYPE.section), lines(3), space(10), energyRow());

  blocks.push(
    space(8),
    text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }),
    rule({ style: 'zigzag', thickness: 2 }),
  );
  return blocks;
}

/* ---------- "Bilan" ---------- */

const shortDate = (iso) => new Date(iso).toLocaleDateString('fr-LU', { day: '2-digit', month: '2-digit' });

const hm = (minutes) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`);

/** 12493 → "12 493" (plain space: the narrow no-break space has no glyph in our fonts). */
const bigNum = (n) => Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ');

async function buildRecap(v) {
  let workout = DEMO_DONE;
  let history = DEMO_HISTORY;
  let scanned = DEMO_HISTORY.length;
  if (v.apiKey) {
    history = await recentWorkouts(v.apiKey, Number(v.historyPages) || 10);
    scanned = history.length;
    workout = (v.workoutId && v.workoutId !== 'latest' && history.find((w) => w.id === v.workoutId)) || history[0];
    if (!workout) return [text('Aucune séance dans Hevy.', TYPE.body)];
  }

  const sum = summarize(workout);
  const records = findRecords(workout, history);
  const prByTemplate = new Set(records.filter((r) => !r.first).map((r) => r.templateId));
  const when = new Date(workout.start_time);
  const date = when.toLocaleDateString('fr-LU', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = when.toLocaleTimeString('fr-LU', { hour: '2-digit', minute: '2-digit' });

  const blocks = [
    text('Bilan', TYPE.section),
    space(8),
    text(workout.title, { ...TYPE.title, size: 32, align: 'center' }),
    space(4),
    text(`${date} · ${time}`, { ...TYPE.caption, align: 'center' }),
    space(8),
    statsGrid([
      [hm(sum.minutes), 'durée'],
      [`${bigNum(sum.volume)} kg`, 'volume'],
      [String(sum.sets), 'séries'],
      [String(sum.reps), 'reps'],
    ]),
    rule({ style: 'zigzag', thickness: 2 }),
  ];

  const prs = records.filter((r) => !r.first);
  const firsts = records.filter((r) => r.first);
  const short = v.recapLength !== 'full';
  const byExercise = new Map();
  for (const r of prs) byExercise.set(r.exercise, [...(byExercise.get(r.exercise) ?? []), r]);
  const starTitle = (exercise) => text(`★ ${exercise}`, { ...TYPE.strong, family: 'Archivo Black', weight: 400 });

  if (short) {
    // One title + one line per exercise: "Poids 92,6 · 1RM 129,6 · Vol. 1 111"
    const SHORT = { 'Poids max': 'Poids', '1RM estimé': '1RM', 'Volume série': 'Vol.', 'Reps max': 'Reps' };
    blocks.push(space(6), text(prs.length ? `Records · ${prs.length}` : 'Records', TYPE.section), space(6));
    if (!byExercise.size) blocks.push(text('Pas de record cette fois.', { ...TYPE.caption, align: 'center' }), space(6));
    for (const [exercise, list] of byExercise) {
      const line = list
        .map((r) => `${SHORT[r.label] ?? r.label} ${num(r.label === 'Poids max' ? r.value : Math.round(r.value))}`)
        .join(' · ');
      blocks.push(starTitle(exercise), text(line, TYPE.caption), space(6));
    }
  } else if (prs.length || firsts.length) {
    blocks.push(space(6), text(prs.length ? `Records · ${prs.length}` : 'Records', TYPE.section), space(6));
    for (const [exercise, list] of byExercise) {
      blocks.push(starTitle(exercise));
      for (const r of list) {
        const delta = r.unit === 'reps' ? `+${r.delta}` : `+${num(r.delta)}`;
        blocks.push(text(`${r.label} : ${num(r.value)} ${r.unit} (${delta})`, TYPE.caption));
      }
      blocks.push(space(6));
    }
    if (firsts.length) blocks.push(text(`Nouveaux exos : ${firsts.map((r) => r.exercise).join(', ')}`, TYPE.caption));
    blocks.push(text(`Comparé à ${scanned - 1} séance${scanned - 1 > 1 ? 's' : ''}`, { ...TYPE.caption, align: 'right' }), rule({ style: 'dashed', thickness: 2, margin: 6 }));
  }

  if (!short) {
    workout.exercises.forEach((ex, i) => {
      const star = prByTemplate.has(ex.exercise_template_id) ? ' ★' : '';
      blocks.push(space(6), text(`${i + 1}. ${ex.title}${star}`, TYPE.strong));
      let n = 0;
      for (const set of ex.sets ?? []) {
        const tag = TAGS[set.type] ?? String(++n);
        const rpe = v.showRpe && set.rpe != null ? `@${num(set.rpe)}` : '';
        blocks.push(row(`${tag}  ${formatSet(set)}`, rpe, { ...TYPE.mono, leader: false }));
      }
      blocks.push(space(4), rule({ style: 'dashed', thickness: 2, margin: 6 }));
    });
  }

  blocks.push(
    space(8),
    text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }),
    rule({ style: 'zigzag', thickness: 2 }),
  );
  return blocks;
}

/** 2×2 grid of big numbers with small labels underneath. */
function statsGrid(cells) {
  const big = `400 32px "${TYPE.title.family}"`;
  const small = `400 22px "${TYPE.caption.family}"`;
  const cellH = 70;
  return draw(
    cellH * 2 + 6,
    (ctx, W) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      cells.forEach(([value, label], i) => {
        const cx = (i % 2 === 0 ? 0.25 : 0.75) * W;
        const y0 = Math.floor(i / 2) * (cellH + 6);
        ctx.font = big;
        ctx.fillText(value, cx, y0 + 34);
        ctx.font = small;
        ctx.fillText(label, cx, y0 + 60);
      });
      // Thin cross between the four cells.
      ctx.fillRect(W / 2 - 1, 4, 2, cellH * 2 - 2);
      ctx.fillRect(8, cellH + 2, W - 16, 2);
    },
    { fonts: [big, small] },
  );
}

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
  }, { fonts: [`400 22px "${TYPE.caption.family}"`] });
}
