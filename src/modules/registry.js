/** Every module except the morning ticket (which composes them, so it cannot be imported here). */
import agenda from './agenda.js';
import badge from './badge.js';
import bujo from './bujo.js';
import colis from './colis.js';
import focus from './focus.js';
import games from './games.js';
import oracle from './oracle.js';
import photo from './photo.js';
import priorities from './priorities.js';
import qr from './qr.js';
import quote from './quote.js';
import specimen from './specimen.js';
import weather from './weather.js';
import workout from './workout.js';

export const PARTS = [workout, bujo, focus, colis, qr, badge, photo, oracle, games, weather, agenda, priorities, quote, specimen];
