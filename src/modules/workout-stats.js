/**
 * Pure helpers to summarise a Hevy workout and detect personal records.
 * No DOM, no fetch: easy to test in Node.
 */

/** Warm-ups don't count towards volume, reps or records. */
const working = (sets) => (sets ?? []).filter((s) => s.type !== 'warmup');

/** Epley estimate of the one-rep max. */
export const e1rm = (w, reps) => (reps === 1 ? w : w * (1 + reps / 30));

/** Totals for one workout. */
export function summarize(workout) {
  let volume = 0;
  let reps = 0;
  let sets = 0;
  for (const ex of workout.exercises ?? []) {
    for (const s of working(ex.sets)) {
      sets++;
      reps += s.reps ?? 0;
      volume += (s.weight_kg ?? 0) * (s.reps ?? 0);
    }
  }
  const minutes = Math.round((new Date(workout.end_time) - new Date(workout.start_time)) / 60000);
  return { volume, reps, sets, exercises: workout.exercises?.length ?? 0, minutes };
}

/** Best values of one exercise's sets. */
function bests(sets) {
  const b = { weight: 0, e1rm: 0, setVolume: 0, reps: 0 };
  for (const s of working(sets)) {
    const w = s.weight_kg ?? 0;
    const r = s.reps ?? 0;
    b.weight = Math.max(b.weight, w);
    b.reps = Math.max(b.reps, r);
    if (w && r) {
      b.e1rm = Math.max(b.e1rm, e1rm(w, r));
      b.setVolume = Math.max(b.setVolume, w * r);
    }
  }
  return b;
}

const KINDS = [
  { key: 'weight', label: 'Poids max', unit: 'kg' },
  { key: 'e1rm', label: '1RM estimé', unit: 'kg' },
  { key: 'setVolume', label: 'Volume série', unit: 'kg' },
];

/**
 * Records set in `workout` compared to every earlier workout in `history`.
 * Bodyweight / cardio exercises (no weight) fall back to max reps.
 * @returns {{ exercise: string, templateId: string, label: string, value: number, unit: string, delta: number|null, first: boolean }[]}
 */
export function findRecords(workout, history) {
  const start = new Date(workout.start_time);
  const earlier = history.filter((w) => w.id !== workout.id && new Date(w.start_time) < start);
  const records = [];

  for (const ex of workout.exercises ?? []) {
    const now = bests(ex.sets);
    if (!now.weight && !now.reps) continue;
    const past = earlier
      .flatMap((w) => w.exercises ?? [])
      .filter((e) => e.exercise_template_id === ex.exercise_template_id)
      .map((e) => bests(e.sets));

    if (!past.length) {
      records.push({ exercise: ex.title, templateId: ex.exercise_template_id, label: 'Premier essai', value: null, unit: '', delta: null, first: true });
      continue;
    }

    const kinds = now.weight ? KINDS : [{ key: 'reps', label: 'Reps max', unit: 'reps' }];
    for (const k of kinds) {
      const prev = Math.max(...past.map((p) => p[k.key]));
      if (now[k.key] > prev + 1e-6) {
        records.push({
          exercise: ex.title,
          templateId: ex.exercise_template_id,
          label: k.label,
          value: now[k.key],
          unit: k.unit,
          delta: now[k.key] - prev,
          first: false,
        });
      }
    }
  }
  return records;
}
