/**
 * Minimal Hevy API client (https://api.hevyapp.com/docs, Hevy Pro API key).
 *
 * In dev, calls go through Vite's proxy (`/hevy` → api.hevyapp.com, see
 * vite.config.js) so the browser never hits CORS; on Netlify (VITE_USE_PROXY) a
 * rewrite in netlify.toml plays the same role. In any other static build they go
 * straight to the API, which only works if Hevy allows the page's origin.
 */
const BASE = import.meta.env.DEV || import.meta.env.VITE_USE_PROXY ? '/hevy/v1' : 'https://api.hevyapp.com/v1';
const PAGE_SIZE = 10; // API maximum

const cache = new Map();

export class HevyError extends Error {}

async function get(apiKey, path, params = {}) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const cacheKey = `${apiKey}|${url}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const promise = (async () => {
    let res;
    try {
      res = await fetch(url, { headers: { 'api-key': apiKey, accept: 'application/json' } });
    } catch {
      throw new HevyError('Hevy injoignable (réseau ou CORS). Lance Rouleau avec `npm run dev` pour passer par le proxy.');
    }
    if (res.status === 401 || res.status === 403) throw new HevyError('Clé API Hevy refusée.');
    if (res.status === 429) throw new HevyError('Hevy limite les appels, réessaie dans une minute.');
    if (!res.ok) throw new HevyError(`Hevy a répondu ${res.status}.`);
    return res.json();
  })();
  cache.set(cacheKey, promise);
  promise.catch(() => cache.delete(cacheKey));
  return promise;
}

/** Forget cached responses (e.g. after editing a routine in Hevy). */
export const clearHevyCache = () => cache.clear();

/** All routines, with their exercises and sets. */
export async function listRoutines(apiKey) {
  const first = await get(apiKey, '/routines', { page: 1, pageSize: PAGE_SIZE });
  const pages = [first];
  for (let page = 2; page <= (first.page_count ?? 1); page++) {
    pages.push(await get(apiKey, '/routines', { page, pageSize: PAGE_SIZE }));
  }
  return pages.flatMap((p) => p.routines ?? []);
}

/**
 * Recent workouts, newest first (the API does not guarantee the order).
 * @param {number} pages  how many pages of 10 to scan
 */
export async function recentWorkouts(apiKey, pages = 3) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const res = await get(apiKey, '/workouts', { page, pageSize: PAGE_SIZE });
    out.push(...(res.workouts ?? []));
    if (page >= (res.page_count ?? 1)) break;
  }
  return out.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
}

/**
 * Last logged sets per exercise template, from the most recent workout that has it.
 * @returns {Map<string, { date: string, sets: object[] }>}
 */
export function lastSetsByTemplate(workouts) {
  const map = new Map();
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (!map.has(ex.exercise_template_id)) map.set(ex.exercise_template_id, { date: w.start_time, sets: ex.sets ?? [] });
    }
  }
  return map;
}
