/**
 * Calendar reader for ICS feeds (Google Calendar "secret address in iCal format",
 * or any other .ics URL). Recurring events, exceptions and time zones are
 * expanded with ical.js.
 *
 * In dev, calendar.google.com goes through Vite's proxy (`/gcal`, see
 * vite.config.js) because Google sends no CORS headers. In a static build the
 * feed is fetched directly, which only works for hosts that allow the origin.
 */
import ICAL from 'ical.js';

export class CalendarError extends Error {}

const MAX_OCCURRENCES = 20000; // safety net for very old daily recurrences

/** The URL we actually fetch (webcal:// → https://, Google via the dev proxy). */
function resolveUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim().replace(/^webcal:/i, 'https:'));
  } catch {
    throw new CalendarError('Adresse iCal invalide.');
  }
  if (import.meta.env.DEV && url.hostname === 'calendar.google.com') return `/gcal${url.pathname}${url.search}`;
  return url.href;
}

const feeds = new Map();

async function fetchFeed(raw) {
  const url = resolveUrl(raw);
  if (feeds.has(url)) return feeds.get(url);
  const promise = (async () => {
    let res;
    try {
      res = await fetch(url);
    } catch {
      throw new CalendarError('Agenda injoignable (réseau ou CORS). Lance Rouleau avec `npm run dev` pour passer par le proxy.');
    }
    if (!res.ok) throw new CalendarError(`L'agenda a répondu ${res.status}. Vérifie l'adresse secrète.`);
    return res.text();
  })();
  feeds.set(url, promise);
  promise.catch(() => feeds.delete(url));
  return promise;
}

/** Forget downloaded feeds (e.g. after editing the calendar). */
export const clearCalendarCache = () => feeds.clear();

/** ical.js time → JS Date. Floating dates (all-day) become local midnight. */
function toDate(time) {
  return time.isDate ? new Date(time.year, time.month - 1, time.day) : time.toJSDate();
}

/**
 * Events overlapping [from, to) in one ICS feed, sorted by start.
 * @returns {{ title: string, start: Date, end: Date, allDay: boolean, location: string }[]}
 */
export function eventsBetween(icsText, from, to) {
  let root;
  try {
    root = new ICAL.Component(ICAL.parse(icsText));
  } catch {
    throw new CalendarError("Ce n'est pas un agenda iCal valide.");
  }
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      // Already registered by an earlier feed.
    }
  }

  const all = root.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
  const masters = new Map();
  for (const e of all) if (!e.recurrenceId) masters.set(e.uid, e);
  for (const e of all) if (e.recurrenceId) masters.get(e.uid)?.relateException(e);

  const out = [];
  const push = (item, start, end) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    const s = toDate(start);
    const e = toDate(end);
    if (e <= from || s >= to) return;
    out.push({
      title: item.summary || '(sans titre)',
      start: s,
      end: e,
      allDay: start.isDate,
      location: item.location || '',
    });
  };

  for (const master of masters.values()) {
    if (!master.isRecurring()) {
      push(master, master.startDate, master.endDate);
      continue;
    }
    const it = master.iterator();
    for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES; next = it.next(), n++) {
      const d = master.getOccurrenceDetails(next);
      if (toDate(d.startDate) >= to) break;
      push(d.item, d.startDate, d.endDate);
    }
  }
  return out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, 'fr'));
}

/**
 * Events of the local days [day, day + days) across several ICS URLs.
 * One failing feed does not hide the others: its error is returned in `errors`.
 */
export async function agenda(urls, day, days = 1) {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
  const events = [];
  const errors = [];
  for (const url of urls) {
    try {
      events.push(...eventsBetween(await fetchFeed(url), from, to));
    } catch (err) {
      errors.push(err instanceof CalendarError ? err.message : String(err));
    }
  }
  events.sort((a, b) => a.start - b.start);
  return { events, errors };
}
