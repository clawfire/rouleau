/**
 * Morning ticket: a greeting and the date, then the sections you choose. Each section is another module
 * (weather, agenda, priorities, quote, a puzzle, a workout…) with its own settings, in the order you drag
 * them into. The composition is saved in this browser (see morning-model.js for its shape).
 */
import { rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { mountComposer } from '../ui/composer.js';
import { fontsReady } from './morning-draw.js';
import { sectionsOf } from './morning-model.js';
import { PARTS } from './registry.js';

/** Modules that can be stacked in a vertical ticket: not the QR (asked), not sideways badges, not dev tools. */
const COMPOSABLE = PARTS.filter((m) => m.composable !== false && !m.soon && m.group !== 'dev');
const defaultsOf = (id) => COMPOSABLE.find((m) => m.id === id)?.defaults ?? null;

const longDate = (d) => d.toLocaleDateString('fr-LU', { weekday: 'long', day: 'numeric', month: 'long' });

export default {
  id: 'morning',
  label: 'Ticket du matin',
  icon: 'mug-hot',
  composable: false,
  description: 'Ton ticket du matin, à ta façon : choisis les modules (météo, agenda, priorités, citation, jeu…) et glisse-les dans l’ordre voulu.',

  // `sections: null` = not composed yet: derived from the flat fields of the former morning ticket.
  defaults: { name: '', sections: null },

  panel: (container, ctx) => mountComposer(container, { ...ctx, parts: COMPOSABLE, defaultsOf }),

  async blocks(v) {
    await fontsReady();
    const now = new Date();
    const blocks = [
      text('Matin', TYPE.section),
      space(8),
      text(v.name.trim() ? `Bonjour ${v.name.trim()}` : 'Bonjour', { ...TYPE.title, size: 32, align: 'center' }),
      space(4),
      text(longDate(now), { ...TYPE.caption, align: 'center' }),
      rule({ style: 'zigzag', thickness: 2 }),
    ];
    for (const section of sectionsOf(v, defaultsOf)) {
      const mod = COMPOSABLE.find((m) => m.id === section.module);
      // One failing section (network, bad address…) must not take the whole ticket down.
      try {
        blocks.push(space(6), ...(await mod.blocks(section.values)));
      } catch (err) {
        console.error(err);
        blocks.push(space(6), text(`${mod.label} : ${err.message ?? err}`, TYPE.caption));
      }
    }
    return blocks;
  },
};
