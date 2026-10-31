/** Helpers shared by the small "brick" modules (weather, agenda, priorities, quote). */
import { space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { store } from '../store.js';

/** Section title: a black band with a little air around it. */
export const header = (title) => [space(6), text(title, TYPE.section), space(6)];

/** Plain space: the narrow no-break space has no glyph in our fonts. */
export const clean = (s) => s.replace(/[  ]/g, ' ');

/**
 * A value typed in the morning ticket before it was split into bricks, so nobody has to type it twice.
 * Looks at the old flat fields, then at the sections of the new composer.
 */
export function legacyMorning(key, fallback) {
  const saved = store.get('module:morning', {});
  if (saved[key] !== undefined && saved[key] !== '') return saved[key];
  const owner = { city: 'weather', icsUrls: 'agenda', tomorrow: 'agenda' }[key];
  const inst = Array.isArray(saved.sections) ? saved.sections.find((s) => s.module === owner) : null;
  return inst?.values?.[key] ?? fallback;
}
