/**
 * Vinted listing URLs. Pure (no DOM), shared by the browser, the server fetcher and the tests.
 * Any Vinted domain works (vinted.fr, .com, .lu, .be, .co.uk…); the slug after the ID is ignored.
 */
const HOST = /^(?:[a-z0-9-]+\.)*vinted\.[a-z]{2,3}(?:\.[a-z]{2})?$/i;

/**
 * @param {string} input pasted URL (the scheme may be missing) or a bare `/items/123` path
 * @returns {{ id: string, ref: string, host: string|null, url: string }|null}
 */
export function parseUrl(input) {
  const raw = String(input ?? '').trim();
  const m = raw.match(/\/items\/(\d+)/);
  if (!m) return null;
  let host = null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`);
    if (HOST.test(u.hostname)) host = u.hostname.toLowerCase();
  } catch {
    // A bare "/items/123" is not a URL: no host.
  }
  const id = m[1];
  return { id, ref: id.slice(-4), host, url: `https://vinted.com/items/${id}` };
}

/** True for a hostname the server is allowed to fetch (guards the proxy against SSRF). */
export const isVintedHost = (host) => HOST.test(String(host ?? ''));
