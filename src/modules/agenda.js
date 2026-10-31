/** Agenda brick: today's events (and optionally tomorrow's) from Google Calendar secret iCal addresses. */
import { rule, space, text } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { agenda } from '../services/calendar.js';
import { clean, header, legacyMorning } from './brick.js';
import { fontsReady, item, timeColumn } from './morning-draw.js';

const hhmm = (d) => d.toLocaleTimeString('fr-LU', { hour: '2-digit', minute: '2-digit', hour12: false });

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
  id: 'agenda',
  label: 'Agenda',
  icon: 'calendar-day',
  group: 'bricks',
  description: 'Les événements du jour de ton Google Agenda, avec l’heure en colonne.',

  defaults: { icsUrls: legacyMorning('icsUrls', ''), tomorrow: legacyMorning('tomorrow', false) },

  controls: (v) => [
    {
      type: 'textarea',
      key: 'icsUrls',
      label: 'Adresses iCal secrètes',
      hint: "Google Agenda › Paramètres de l'agenda › Adresse secrète au format iCal. Une par ligne. Stockées seulement dans ce navigateur.",
      rows: 2,
      refresh: true,
    },
    { type: 'switch', key: 'tomorrow', label: 'Ajouter demain' },
    ...(v.icsUrls.trim() ? [] : [{ type: 'callout', variant: 'neutral', text: "Sans adresse, l'aperçu utilise un agenda de démo." }]),
  ],

  async blocks(v) {
    await fontsReady();
    const now = new Date();
    const urls = v.icsUrls.split(/\s+/).filter(Boolean);
    const days = v.tomorrow ? 2 : 1;
    let events;
    let errors = [];
    if (urls.length) ({ events, errors } = await agenda(urls, now, days));
    else events = demoEvents();

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
  },
};
