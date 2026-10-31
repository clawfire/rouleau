/**
 * Module registry.
 *
 * A module is a plain object:
 *   {
 *     id, label, icon,            // icon = Font Awesome Free name
 *     group?: 'dev',              // tools for tuning Rouleau itself: collapsed "Développeurs" section of the menu
 *     description,
 *     defaults: { ...values },
 *     controls: [ ...schema ],    // rendered with Web Awesome, see src/ui/controls.js
 *     build(values) => blocks[]   // may be async (APIs, images…)
 *   }
 *
 * Planned modules are listed with `soon: true` so the navigation shows the roadmap.
 *
 * Composable modules implement `blocks(values)` instead of `build`: the ticket without its signature.
 * `buildTicket` adds the shared footer (unless the module sets `footer: false`), and the morning ticket
 * stacks the `blocks` of several modules under a single footer. Modules with `composable: false`
 * (QR, sideways badges, dev tools) keep a plain `build`.
 *   panel?(container, { values, onChange })  replaces the generic controls (the morning ticket's composer)
 *   group?: 'bricks'  small building blocks (weather, agenda…) in their own collapsed section of the menu
 */
import { footer } from './footer.js';
import morning from './morning.js';
import { PARTS } from './registry.js';

const part = (id) => PARTS.find((m) => m.id === id);

export const MODULES = [
  part('workout'),
  morning,
  part('bujo'),
  part('focus'),
  part('qr'),
  part('badge'),
  part('oracle'),
  part('games'),
  part('weather'),
  part('agenda'),
  part('priorities'),
  part('quote'),
  part('specimen'),
  { id: 'photo', label: 'Labo photo', icon: 'camera-retro', soon: true },
  { id: 'tasks', label: 'Tickets de tâches', icon: 'list-check', soon: true },
];

/** Pages of the menu that are not modules (nothing to print, no controls, no preview). */
export const PAGES = [{ id: 'about', label: 'Et plus encore', icon: 'heart' }];

export const moduleById = (id) => MODULES.find((m) => m.id === id && !m.soon) ?? MODULES[0];

/** The blocks of a whole ticket for a module. */
export async function buildTicket(mod, values) {
  if (!mod.blocks) return mod.build(values);
  const blocks = await mod.blocks(values);
  return mod.footer === false ? blocks : [...blocks, ...footer()];
}
