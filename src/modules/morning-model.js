/**
 * The composition of the morning ticket: an ordered list of sections, each one an instance of a module
 * with its own values. Pure functions (no DOM, no storage), so they can be tested with plain Node.
 *
 * Stored shape: { name, sections: [{ uid, module, values }] }.
 * `sections: null` means "not composed yet": the list is derived from the flat fields that the morning ticket
 * used before it became composable (weather, agenda, priorities, quote switches, puzzle…).
 */

let counter = 0;
export const newUid = () => `s${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Grid sizes the old "difficulty" of the puzzle of the day stood for. */
const PUZZLE_SIZES = { easy: { starsSize: 5, linkSize: 5 }, medium: { starsSize: 6, linkSize: 6 }, hard: { starsSize: 8, linkSize: 7 } };

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/** The sections of a ticket stored before sections existed. `old` holds the flat fields. */
export function fromLegacy(old) {
  const sections = [];
  const on = (key) => old[key] !== false; // every old switch defaulted to on
  if (on('weather')) sections.push({ module: 'weather', values: pick(old, ['city']) });
  if (on('agenda')) sections.push({ module: 'agenda', values: pick(old, ['icsUrls', 'tomorrow']) });
  if (on('priorities')) sections.push({ module: 'priorities', values: pick(old, ['p1', 'p2', 'p3']) });
  if (old.puzzle && old.puzzle !== 'none') {
    const level = old.puzzleLevel ?? 'medium';
    sections.push({ module: 'games', values: { game: old.puzzle, level, ...(PUZZLE_SIZES[level] ?? PUZZLE_SIZES.medium), daily: true } });
  }
  if (on('quote')) sections.push({ module: 'quote', values: pick(old, ['customQuote']) });
  return sections.map((s) => ({ uid: newUid(), ...s }));
}

/** Today's ticket when nothing was ever stored. */
export const defaultSections = () => [
  { uid: newUid(), module: 'weather', values: {} },
  { uid: newUid(), module: 'agenda', values: {} },
  { uid: newUid(), module: 'priorities', values: {} },
  { uid: newUid(), module: 'quote', values: {} },
];

const LEGACY_KEYS = ['weather', 'agenda', 'priorities', 'quote', 'puzzle'];

/**
 * The sections to use for stored `values`. Unknown modules are dropped; each instance gets the module's
 * current defaults under its own values (shallow merge, the stored value wins).
 * @param {object} values
 * @param {(id: string) => object|null} defaultsOf  defaults of a composable module, null if there is none
 */
export function sectionsOf(values, defaultsOf) {
  let list;
  if (Array.isArray(values.sections)) list = values.sections;
  else if (LEGACY_KEYS.some((k) => k in values)) list = fromLegacy(values);
  else list = defaultSections();
  return list
    .filter((s) => s && defaultsOf(s.module))
    .map((s) => ({ uid: s.uid ?? newUid(), module: s.module, values: { ...defaultsOf(s.module), ...(s.values ?? {}) } }));
}

export const addSection = (sections, module, values) => [...sections, { uid: newUid(), module, values }];

export const removeSection = (sections, uid) => sections.filter((s) => s.uid !== uid);

/** Move the section `uid` so that it ends up at index `to` of the resulting list. */
export function moveSection(sections, uid, to) {
  const from = sections.findIndex((s) => s.uid === uid);
  if (from < 0) return sections;
  const next = [...sections];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}
