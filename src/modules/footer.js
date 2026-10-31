import { rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';

/** The signature at the bottom of every ticket. */
export const footer = () => [space(8), rule({ style: 'zigzag', thickness: 2 }), text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' })];
