/** Quote brick: a quote of the day, or a sentence of your own. */
import { space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { clean, header } from './brick.js';
import { fontsReady } from './morning-draw.js';
import { quoteOfTheDay } from './quotes.js';

export default {
  id: 'quote',
  label: 'Citation',
  icon: 'quote-left',
  group: 'bricks',
  description: 'Une citation du jour, ou ta propre phrase.',

  defaults: { customQuote: '' },

  controls: () => [{ type: 'textarea', key: 'customQuote', label: 'Ta propre phrase', hint: 'Vide : une citation du jour.', rows: 2 }],

  async blocks(v) {
    await fontsReady();
    const q = v.customQuote.trim() ? { text: v.customQuote.trim(), by: '' } : quoteOfTheDay(new Date());
    return [
      ...header('Pour la route'),
      text(`« ${clean(q.text)} »`, { ...TYPE.body, align: 'center' }),
      ...(q.by ? [space(2), text(`— ${q.by}`, { ...TYPE.caption, align: 'center' })] : []),
    ];
  },
};
