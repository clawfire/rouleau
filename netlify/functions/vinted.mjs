// GET /api/vinted?id=123&host=www.vinted.fr → { kind: 'html'|'json', body, host } or { error: { code, message } }
import { VintedFetchError, fetchListing } from '../../src/vinted/fetch-core.js';

export const config = { path: '/api/vinted' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  try {
    return json(await fetchListing({ id: q.get('id'), host: q.get('host') }));
  } catch (err) {
    if (err instanceof VintedFetchError) return json({ error: { code: err.code, message: err.message } }, err.code === 'bad-request' ? 400 : 502);
    return json({ error: { code: 'network', message: 'Erreur inattendue côté serveur.' } }, 500);
  }
};
