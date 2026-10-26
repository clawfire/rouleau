/**
 * Module registry.
 *
 * A module is a plain object:
 *   {
 *     id, label, icon,            // icon = Font Awesome Free name
 *     description,
 *     defaults: { ...values },
 *     controls: [ ...schema ],    // rendered with Web Awesome, see src/ui/controls.js
 *     build(values) => blocks[]   // may be async (APIs, images…)
 *   }
 *
 * Planned modules are listed with `soon: true` so the navigation shows the roadmap.
 */
import specimen from './specimen.js';
import workout from './workout.js';

export const MODULES = [
  workout,
  specimen,
  { id: 'photo', label: 'Labo photo', icon: 'camera-retro', soon: true },
  { id: 'morning', label: 'Ticket du matin', icon: 'mug-hot', soon: true },
  { id: 'tasks', label: 'Tickets de tâches', icon: 'list-check', soon: true },
  { id: 'focus', label: 'Ticket de focus', icon: 'bullseye', soon: true },
  { id: 'oracle', label: "L'oracle", icon: 'hat-wizard', soon: true },
  { id: 'games', label: 'Jeux', icon: 'puzzle-piece', soon: true },
  { id: 'qr', label: 'QR utilitaires', icon: 'qrcode', soon: true },
  { id: 'badge', label: 'Badges', icon: 'id-badge', soon: true },
];

export const moduleById = (id) => MODULES.find((m) => m.id === id && !m.soon) ?? MODULES[0];
