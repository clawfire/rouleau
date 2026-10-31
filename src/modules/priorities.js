/** Priorities brick: three things to do, with drawn checkboxes and a line to write on. */
import { clean, header } from './brick.js';
import { fontsReady, item } from './morning-draw.js';

export default {
  id: 'priorities',
  label: 'Priorités',
  icon: 'list-check',
  group: 'bricks',
  description: 'Trois priorités à cocher. Une case vide laisse une ligne à remplir à la main.',

  defaults: { p1: '', p2: '', p3: '' },

  controls: () => [
    { type: 'text', key: 'p1', label: 'Priorité 1' },
    { type: 'text', key: 'p2', label: 'Priorité 2' },
    { type: 'text', key: 'p3', label: 'Priorité 3', hint: 'Une case vide = une ligne à remplir à la main.' },
  ],

  async blocks(v) {
    await fontsReady();
    const blocks = [...header('Priorités')];
    for (const p of [v.p1, v.p2, v.p3]) blocks.push(item(clean(p.trim()), { box: true, write: true }));
    return blocks;
  },
};
