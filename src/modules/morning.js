/**
 * Morning ticket: date, weather (Open-Meteo, browser position), today's agenda
 * (Google Calendar via its secret iCal address), three priorities with drawn
 * checkboxes, and a quote. Every section can be switched off.
 */
import { row, rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { CalendarError, agenda, clearCalendarCache } from '../services/calendar.js';
import { WeatherError, browserPosition, describe, forecast, geocode } from '../services/weather.js';
import { fontsReady, item, timeColumn, weatherHeadline } from './morning-draw.js';
import { quoteOfTheDay } from './quotes.js';

const hhmm = (d) => d.toLocaleTimeString('fr-LU', { hour: '2-digit', minute: '2-digit', hour12: false });
const longDate = (d) => d.toLocaleDateString('fr-LU', { weekday: 'long', day: 'numeric', month: 'long' });
const weekday = (d) => d.toLocaleDateString('fr-LU', { weekday: 'long' });

/** Plain space: the narrow no-break space has no glyph in our fonts. */
const clean = (s) => s.replace(/[  ]/g, ' ');

const demoEvents = () => {
  const at = (h, m) => new Date(new Date().setHours(h, m, 0, 0));
  return [
    { title: 'Fête de la ville', start: at(0, 0), end: at(23, 59), allDay: true },
    { title: 'Point hebdo équipe', start: at(9, 30), end: at(10, 0), allDay: false },
    { title: 'Déjeuner avec Camille', start: at(12, 30), end: at(14, 0), allDay: false },
    { title: 'Séance de sport', start: at(18, 30), end: at(19, 45), allDay: false },
  ];
};

export default {
  id: 'morning',
  label: 'Ticket du matin',
  icon: 'mug-hot',
  description: "Météo, agenda du jour, trois priorités à cocher et une citation. Chaque section s'active à la carte.",

  defaults: {
    name: '',
    weather: true,
    city: '',
    agenda: true,
    icsUrls: '',
    tomorrow: false,
    priorities: true,
    p1: '',
    p2: '',
    p3: '',
    quote: true,
    customQuote: '',
  },

  controls(v) {
    const schema = [{ type: 'text', key: 'name', label: 'Prénom', hint: 'Optionnel : « Bonjour Prénom ».' }];

    schema.push({ type: 'switch', key: 'weather', label: 'Météo', refresh: true });
    if (v.weather) {
      schema.push({
        type: 'text',
        key: 'city',
        label: 'Ville',
        hint: 'Vide : position du navigateur (à autoriser une fois).',
        placeholder: 'ex. Luxembourg',
      });
    }

    schema.push({ type: 'switch', key: 'agenda', label: 'Agenda', refresh: true });
    if (v.agenda) {
      schema.push(
        {
          type: 'textarea',
          key: 'icsUrls',
          label: 'Adresses iCal secrètes',
          hint: "Google Agenda › Paramètres de l'agenda › Adresse secrète au format iCal. Une par ligne. Stockées seulement dans ce navigateur.",
          rows: 2,
        },
        { type: 'switch', key: 'tomorrow', label: 'Ajouter demain' },
      );
      if (!v.icsUrls.trim()) {
        schema.push({ type: 'callout', variant: 'neutral', text: "Sans adresse, l'aperçu utilise un agenda de démo." });
      }
    }

    schema.push({ type: 'switch', key: 'priorities', label: 'Trois priorités', refresh: true });
    if (v.priorities) {
      schema.push(
        { type: 'text', key: 'p1', label: 'Priorité 1' },
        { type: 'text', key: 'p2', label: 'Priorité 2' },
        { type: 'text', key: 'p3', label: 'Priorité 3', hint: 'Une case vide = une ligne à remplir à la main.' },
      );
    }

    schema.push({ type: 'switch', key: 'quote', label: 'Citation', refresh: true });
    if (v.quote) {
      schema.push({ type: 'textarea', key: 'customQuote', label: 'Ta propre phrase', hint: 'Vide : une citation du jour.', rows: 2 });
    }
    return schema;
  },

  async build(v) {
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

    if (v.weather) blocks.push(...(await weatherSection(v)));
    if (v.agenda) blocks.push(...(await agendaSection(v, now)));
    if (v.priorities) blocks.push(...prioritiesSection(v));
    if (v.quote) blocks.push(...quoteSection(v, now));

    blocks.push(space(8), text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' }), rule({ style: 'zigzag', thickness: 2 }));
    return blocks;
  },
};

/* ---------- Sections ---------- */

const header = (title) => [space(6), text(title, TYPE.section), space(6)];

async function weatherSection(v) {
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
}

async function agendaSection(v, now) {
  const urls = v.icsUrls.split(/\s+/).filter(Boolean);
  const days = v.tomorrow ? 2 : 1;
  let events;
  let errors = [];
  if (urls.length) {
    clearCalendarCache();
    ({ events, errors } = await agenda(urls, now, days));
  } else {
    events = demoEvents();
  }

  const blocks = [...header('Agenda')];
  const col = timeColumn();
  const dayKey = (d) => d.toDateString();
  const groups = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    groups.push({ day, events: events.filter((e) => dayKey(e.start) === dayKey(day) || (e.start < day && e.end > day && i === 0)) });
  }

  for (const [i, g] of groups.entries()) {
    if (days > 1) blocks.push(text(i === 0 ? "Aujourd'hui" : 'Demain', { ...TYPE.strong, transform: 'uppercase' }), space(2));
    const allDay = g.events.filter((e) => e.allDay);
    const timed = g.events.filter((e) => !e.allDay);
    if (!g.events.length) blocks.push(text('Rien de prévu.', TYPE.caption));
    for (const e of allDay) blocks.push(item(clean(e.title), { lead: '', leadWidth: 0, bold: true }));
    for (const e of timed) blocks.push(item(clean(e.title), { lead: hhmm(e.start), leadWidth: col }));
    if (i < groups.length - 1) blocks.push(space(6), rule({ style: 'dotted', thickness: 2, margin: 4 }));
  }
  for (const msg of errors) blocks.push(space(4), text(msg, TYPE.caption));
  return blocks;
}

function prioritiesSection(v) {
  const blocks = [...header('Priorités')];
  for (const p of [v.p1, v.p2, v.p3]) blocks.push(item(clean(p.trim()), { box: true, write: true }));
  return blocks;
}

function quoteSection(v, now) {
  const q = v.customQuote.trim() ? { text: v.customQuote.trim(), by: '' } : quoteOfTheDay(now);
  return [
    ...header('Pour la route'),
    text(`« ${clean(q.text)} »`, { ...TYPE.body, align: 'center' }),
    ...(q.by ? [space(2), text(`— ${q.by}`, { ...TYPE.caption, align: 'center' })] : []),
  ];
}
