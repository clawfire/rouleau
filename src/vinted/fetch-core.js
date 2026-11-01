/**
 * Server-side fetch of a Vinted listing (Node >= 18). Shared by the Netlify Function and the Vite dev
 * middleware. Never runs in the browser: Vinted sends no CORS headers.
 *
 * Strategy, in order:
 *   1. the listing page HTML (what works today: the JSON-LD and the Next.js payload carry everything);
 *   2. the internal API `/api/v2/items/{id}`, with the session cookies from the home page (kept as a fallback,
 *      the endpoint and its format change);
 *   3. otherwise a typed error, and the UI opens the manual form.
 */
import { isVintedHost } from './parse-url.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const TIMEOUT_MS = 5000;

export class VintedFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'bad-request' | 'blocked' | 'not-found' | 'network'
  }
}

const headers = (extra = {}) => ({
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
  ...extra,
});

async function get(url, extra) {
  try {
    return await fetch(url, { headers: headers(extra), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new VintedFetchError('network', err?.name === 'TimeoutError' ? 'Vinted ne répond pas (délai dépassé).' : 'Vinted est injoignable.');
  }
}

const isChallenge = (res, text) => res.status === 403 || res.status === 429 || /datadome|captcha-delivery|cf-chl|challenge-platform/i.test(text.slice(0, 4000));

/** @returns {Promise<{ kind: 'html'|'json', body: string, host: string }>} */
export async function fetchListing({ id, host }) {
  if (!/^\d{3,15}$/.test(String(id))) throw new VintedFetchError('bad-request', 'Identifiant d’annonce invalide.');
  const h = host && isVintedHost(host) ? host.replace(/^(www\.)?/, 'www.') : 'www.vinted.fr';

  const page = await get(`https://${h}/items/${id}`);
  const html = await page.text();
  if (page.status === 404) throw new VintedFetchError('not-found', 'Annonce introuvable (supprimée ou vendue ?).');
  if (page.ok && !isChallenge(page, html)) return { kind: 'html', body: html, host: h };

  // Fallback: internal API with session cookies from the home page.
  const home = await get(`https://${h}/`);
  const cookie = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const api = await get(`https://${h}/api/v2/items/${id}`, { accept: 'application/json', cookie });
  const json = await api.text();
  if (api.ok && !isChallenge(api, json)) return { kind: 'json', body: json, host: h };

  throw new VintedFetchError('blocked', 'Vinted a bloqué la requête (anti-bot). Colle le contenu de la page à la main, ou remplis le formulaire.');
}
