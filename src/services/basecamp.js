/**
 * Basecamp client. Everything goes through the relay in netlify/functions/basecamp.mjs (OAuth needs
 * a secret and the API sends no CORS headers); the session is an HttpOnly cookie this page never sees.
 * `npm run dev` (netlify dev) runs the relay locally; plain `vite` has none.
 */
import { parseBoardUrl, toIdea } from '../basecamp/idea.js';

const BASE = '/api/basecamp/'; // Netlify functions live at the site root
const TTL = 5 * 60 * 1000;
const cache = new Map();

export class BasecampError extends Error {}

/** Start the OAuth dance: Launchpad, then back here. */
export function connect() {
  location.assign(`${BASE}login?${new URLSearchParams({ return: `${location.pathname}#ideas` })}`);
}

/** Forget the session. The status is answered by the logout itself, so a refresh right after cannot race it. */
export function disconnect() {
  cache.clear();
  const promise = fetch(`${BASE}logout`, { method: 'POST' })
    .catch(() => null)
    .then(() => ({ relay: true, configured: true, connected: false }));
  cache.set('status', { at: Date.now(), promise });
  return promise;
}

export const clearBasecampCache = () => cache.clear();

/** { connected, configured, name?, accounts? }; `relay: false` when there is no relay (plain vite, static build). */
export async function status() {
  return cached('status', async () => {
    try {
      const res = await fetch(`${BASE}status`, { headers: { accept: 'application/json' } });
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { relay: false, connected: false };
      return { relay: true, ...(await res.json()) };
    } catch {
      return { relay: false, connected: false };
    }
  });
}

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - TTL) return hit.promise;
  const promise = fn();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

const get = (path) =>
  cached(path, async () => {
    let res;
    try {
      res = await fetch(`${BASE}api${path}`, { headers: { accept: 'application/json' } });
    } catch {
      throw new BasecampError('Basecamp injoignable. Lance Rouleau avec `npm run dev` (le relais est une fonction Netlify).');
    }
    if (res.status === 401) {
      cache.delete('status');
      throw new BasecampError('Session Basecamp expirée : reconnecte-toi.');
    }
    if (res.status === 403 || res.status === 404) throw new BasecampError('Tableau introuvable, ou ton compte Basecamp n’y a pas accès.');
    if (res.status === 503) throw new BasecampError('Le relais Basecamp n’est pas configuré (BASECAMP_CLIENT_ID / SECRET).');
    if (!res.ok) throw new BasecampError(`Basecamp a répondu ${res.status}.`);
    return res.json();
  });

/**
 * The board and its columns.
 * @returns {Promise<{ title: string, columns: { id: string, title: string, type: string, count: number }[] }>}
 */
export async function loadBoard(boardUrl) {
  const ref = parseBoardUrl(boardUrl);
  if (!ref) throw new BasecampError('Ce lien n’est pas un tableau de cartes Basecamp (…/card_tables/123).');
  const board = await get(`/${ref.account}/buckets/${ref.bucket}/card_tables/${ref.table}.json`);
  return {
    ref,
    title: board.title ?? '',
    columns: (board.lists ?? []).map((l) => ({ id: String(l.id), title: l.title ?? '', type: l.type ?? '', count: Number(l.cards_count) || 0 })),
  };
}

/** Every card of a column, as ideas (see basecamp/idea.js). */
export async function loadIdeas(ref, columnId) {
  const cards = await get(`/${ref.account}/buckets/${ref.bucket}/card_tables/lists/${columnId}/cards.json`);
  return cards.map(toIdea);
}
