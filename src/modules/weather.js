/** Weather brick: Open-Meteo forecast for the browser position or a typed city. */
import { row, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { WeatherError, browserPosition, describe, forecast, geocode } from '../services/weather.js';
import { header, legacyMorning } from './brick.js';
import { fontsReady, weatherHeadline } from './morning-draw.js';

export default {
  id: 'weather',
  label: 'Météo',
  icon: 'cloud-sun',
  group: 'bricks',
  description: 'Prévisions du jour : températures, pluie, vent, heures clés, lever et coucher du soleil.',

  defaults: { city: legacyMorning('city', '') },

  controls: () => [
    {
      type: 'text',
      key: 'city',
      label: 'Ville',
      hint: 'Vide : position du navigateur (à autoriser une fois).',
      placeholder: 'ex. Luxembourg',
    },
  ],

  async blocks(v) {
    await fontsReady();
    try {
      const place = v.city.trim() ? await geocode(v.city) : await browserPosition();
      const w = await forecast(place);
      const sky = describe(w.code);
      return [
        ...header('Météo'),
        weatherHeadline({ ...sky, tMax: w.tMax, tMin: w.tMin }),
        space(2),
        row(`Pluie ${w.rain} %`, `Vent ${w.wind} km/h`, TYPE.caption),
        text(w.hours.map((x) => `${x.h}h ${x.t}°`).join(' · '), TYPE.caption),
        row(`Soleil ${w.sunrise}`, w.sunset, TYPE.caption),
      ];
    } catch (err) {
      return [...header('Météo'), text(err instanceof WeatherError ? err.message : String(err), TYPE.caption)];
    }
  },
};
