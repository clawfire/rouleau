/**
 * Source adapters: each one turns a pasted URL into a LabelData; the renderer only knows LabelData.
 * `vinted` today, `ebay` later (same shape: parse, fetch raw, extract, normalize).
 * Network and cache live here, so extract/normalize stay pure.
 */
import { store } from '../store.js';
import { extractRaw } from './extract.js';
import { emptyLabel, normalize } from './normalize.js';
import { parseUrl } from './parse-url.js';

const CACHE_KEY = 'vinted-cache';
const CACHE_MAX = 30;

export class ImportError extends Error {
  constructor(message, code = 'unknown') {
    super(message);
    this.code = code;
  }
}

const readCache = () => store.get(CACHE_KEY, {});
const cacheGet = (id) => readCache()[id]?.label ?? null;
function cachePut(id, label) {
  const all = readCache();
  all[id] = { label, at: Date.now() };
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAX);
  store.set(CACHE_KEY, Object.fromEntries(keep));
}

/** Fetch through the server (Netlify Function / Vite middleware): the browser cannot call Vinted (CORS). */
async function fetchRaw(parsed) {
  const qs = new URLSearchParams({ id: parsed.id, ...(parsed.host ? { host: parsed.host } : {}) });
  let res;
  try {
    res = await fetch(`/api/vinted?${qs}`);
  } catch {
    throw new ImportError('Serveur d’import injoignable. Lance `npm run dev`, ou colle la page à la main.', 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new ImportError(data?.error?.message ?? 'Import impossible (le serveur n’a pas répondu comme prévu).', data?.error?.code ?? 'network');
  }
  return data.body;
}

export const ADAPTERS = {
  vinted: {
    parseUrl,
    /** Label from a URL: cache, then server fetch. */
    async fromUrl(url, { force = false } = {}) {
      const parsed = parseUrl(url);
      if (!parsed) throw new ImportError('Ce lien ne ressemble pas à une annonce Vinted (…/items/123456).', 'bad-url');
      const cached = !force && cacheGet(parsed.id);
      if (cached) return { ...cached, date: emptyLabel().date };
      const label = normalize(extractRaw(await fetchRaw(parsed)), parsed);
      cachePut(parsed.id, label);
      return label;
    },
    /** Label from raw HTML or JSON already in hand (pasted, or sent by a future browser extension). */
    fromRaw(text, url = '') {
      const parsed = parseUrl(url);
      try {
        const raw = extractRaw(text);
        const p = parsed ?? parseUrl(`/items/${raw.id ?? ''}`);
        return normalize(raw, p ?? undefined);
      } catch (err) {
        throw new ImportError(err.message, 'parse');
      }
    },
  },
};
