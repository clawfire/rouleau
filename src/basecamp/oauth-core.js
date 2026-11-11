/**
 * Basecamp relay: OAuth 2 (37signals Launchpad) and a read-only proxy to the Basecamp 4 API.
 *
 * Why a server at all: Basecamp only offers OAuth (no personal tokens), the token exchange needs the
 * client secret, and the API sends no CORS headers. So `netlify/functions/basecamp.mjs` runs this.
 *
 * The tokens never reach page scripts: they live in an HttpOnly cookie, sealed with AES-GCM under a key
 * derived from the client secret (scoped to `/api/basecamp`). The proxy only forwards GET requests to
 * card table paths: Rouleau reads ideas, it never writes to Basecamp.
 *
 * Environment:
 *   BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET  from https://launchpad.37signals.com/integrations
 *   BASECAMP_REDIRECT_URI (optional)            default: <origin>/api/basecamp/callback
 *
 * Routes (all under /api/basecamp):
 *   GET /login?return=…  → Launchpad consent screen
 *   GET /callback        → token exchange, back to the app (#ideas)
 *   GET /status          → { connected, configured, name?, accounts? }
 *   POST /logout         → forget the session
 *   GET /api/<account>/buckets/<project>/card_tables/….json → Basecamp API (cards lists: all pages)
 */
const LAUNCHPAD = 'https://launchpad.37signals.com';
const API = 'https://3.basecampapi.com';
const USER_AGENT = 'Rouleau (https://github.com/clawfire/rouleau)';
const PREFIX = '/api/basecamp';
const SESSION = 'rouleau_bc';
const STATE = 'rouleau_bc_state';
const MAX_PAGES = 20;
const SKEW_MS = 5 * 60 * 1000; // refresh a little before the token really expires

/** Only card table reads: the board, a column, its cards, one card. */
export const ALLOWED_PATH = /^\/\d+\/buckets\/\d+\/card_tables\/(?:\d+|columns\/\d+|lists\/\d+\/cards|cards\/\d+)\.json$/;

/* ---------- Small helpers ---------- */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const redirect = (location, cookies = []) => {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
};

const b64u = {
  encode: (bytes) => Buffer.from(bytes).toString('base64url'),
  decode: (s) => new Uint8Array(Buffer.from(s, 'base64url')),
};

export function readCookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function cookie(name, value, req, { maxAge, path = PREFIX } = {}) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''; // localhost (netlify dev) is plain http
  const age = maxAge == null ? '' : `; Max-Age=${maxAge}`;
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax${secure}${age}`;
}

/** A same-site return path: "/#ideas", "/sub/#ideas"… never another origin. */
function safeReturn(raw) {
  const s = String(raw ?? '');
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : '/#ideas';
}

/** "/#ideas" + "refused" → "/?basecamp=refused#ideas": the hash stays a bare module id. */
const withFlag = (target, flag) => {
  const [path, hash = 'ideas'] = target.split('#');
  return `${path.split('?')[0]}?basecamp=${flag}#${hash}`;
};

/* ---------- Sealed session cookie ---------- */

async function keyFrom(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`rouleau-basecamp:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(data, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), new TextEncoder().encode(JSON.stringify(data))));
  return `${b64u.encode(iv)}.${b64u.encode(body)}`;
}

export async function unseal(value, secret) {
  try {
    const [iv, body] = String(value ?? '').split('.');
    if (!iv || !body) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.decode(iv) }, await keyFrom(secret), b64u.decode(body));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null; // tampered, or sealed with an older secret
  }
}

/* ---------- Launchpad ---------- */

const redirectUri = (req, env) => env.BASECAMP_REDIRECT_URI || `${new URL(req.url).origin}${PREFIX}/callback`;

async function tokenRequest(params, fetchImpl) {
  const res = await fetchImpl(`${LAUNCHPAD}/authorization/token?${new URLSearchParams(params)}`, {
    method: 'POST',
    headers: { 'user-agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`launchpad ${res.status}`);
  const t = await res.json();
  return { a: t.access_token, r: t.refresh_token, e: Date.now() + (Number(t.expires_in) || 14 * 864e2) * 1000 };
}

/** The session from the cookie, refreshed if it is about to expire. `fresh` is set when it changed. */
async function session(req, env, fetchImpl) {
  const s = await unseal(readCookies(req)[SESSION], env.BASECAMP_CLIENT_SECRET);
  if (!s?.a) return null;
  if (s.e - SKEW_MS > Date.now()) return { ...s, fresh: false };
  return refresh(s, req, env, fetchImpl);
}

async function refresh(s, req, env, fetchImpl) {
  if (!s.r) return null;
  try {
    const t = await tokenRequest(
      { type: 'refresh', refresh_token: s.r, client_id: env.BASECAMP_CLIENT_ID, client_secret: env.BASECAMP_CLIENT_SECRET, redirect_uri: redirectUri(req, env) },
      fetchImpl,
    );
    return { ...t, r: t.r || s.r, fresh: true };
  } catch {
    return null;
  }
}

async function sessionCookie(s, req, env) {
  const { a, r, e } = s;
  return cookie(SESSION, await seal({ a, r, e }, env.BASECAMP_CLIENT_SECRET), req, { maxAge: 60 * 60 * 24 * 365 });
}

const withSession = async (res, s, req, env) => {
  if (s?.fresh) res.headers.append('set-cookie', await sessionCookie(s, req, env));
  return res;
};

/* ---------- Basecamp API ---------- */

const apiFetch = (url, token, fetchImpl) =>
  fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': USER_AGENT } });

/** `<https://…?page=2>; rel="next"` → the URL, if it stays on the API host. */
export function nextLink(header) {
  const m = String(header ?? '').match(/<([^>]+)>\s*;\s*rel="?next"?/);
  return m && m[1].startsWith(`${API}/`) ? m[1] : null;
}

/** GET one path; lists of cards are followed page after page and returned as one array. */
async function proxy(path, s, req, env, fetchImpl) {
  let token = s.a;
  let url = `${API}${path}`;
  let res = await apiFetch(url, token, fetchImpl);
  if (res.status === 401) {
    const renewed = await refresh(s, req, env, fetchImpl);
    if (!renewed) return { res: json({ error: 'auth' }, 401), s: null };
    Object.assign(s, renewed);
    token = s.a;
    res = await apiFetch(url, token, fetchImpl);
  }
  if (!res.ok) return { res: json({ error: 'upstream', status: res.status }, res.status === 404 || res.status === 403 ? res.status : 502), s };

  let data = await res.json();
  if (Array.isArray(data)) {
    for (let page = 1; page < MAX_PAGES && (url = nextLink(res.headers.get('link'))); page++) {
      res = await apiFetch(url, token, fetchImpl);
      if (!res.ok) break;
      data = data.concat(await res.json());
    }
  }
  return { res: json(data), s };
}

/* ---------- Entry point ---------- */

/**
 * @param {Request} req
 * @param {Record<string, string|undefined>} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Response>}
 */
export async function handle(req, env, fetchImpl = fetch) {
  const url = new URL(req.url);
  const route = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
  const configured = Boolean(env.BASECAMP_CLIENT_ID && env.BASECAMP_CLIENT_SECRET);

  if (route === '/status' && !configured) return json({ connected: false, configured: false });
  if (!configured) return json({ error: 'not-configured' }, 503);

  if (route === '/login') {
    const state = b64u.encode(crypto.getRandomValues(new Uint8Array(18)));
    const back = encodeURIComponent(safeReturn(url.searchParams.get('return')));
    const auth = `${LAUNCHPAD}/authorization/new?${new URLSearchParams({ type: 'web_server', client_id: env.BASECAMP_CLIENT_ID, redirect_uri: redirectUri(req, env), state })}`;
    return redirect(auth, [cookie(STATE, `${state}.${back}`, req, { maxAge: 600 })]);
  }

  if (route === '/callback') {
    const [expected, back] = (readCookies(req)[STATE] ?? '').split('.');
    const target = safeReturn(decodeURIComponent(back ?? ''));
    const clearState = cookie(STATE, '', req, { maxAge: 0 });
    const code = url.searchParams.get('code');
    if (!expected || url.searchParams.get('state') !== expected || !code) return redirect(withFlag(target, 'refused'), [clearState]);
    try {
      const t = await tokenRequest(
        { type: 'web_server', client_id: env.BASECAMP_CLIENT_ID, client_secret: env.BASECAMP_CLIENT_SECRET, redirect_uri: redirectUri(req, env), code },
        fetchImpl,
      );
      return redirect(target, [clearState, await sessionCookie(t, req, env)]);
    } catch {
      return redirect(withFlag(target, 'failed'), [clearState]);
    }
  }

  if (route === '/logout') {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    return json({ connected: false }, 200, { 'set-cookie': cookie(SESSION, '', req, { maxAge: 0 }) });
  }

  const s = await session(req, env, fetchImpl);

  if (route === '/status') {
    if (!s) return json({ connected: false, configured: true });
    const res = await apiFetch(`${LAUNCHPAD}/authorization.json`, s.a, fetchImpl);
    if (!res.ok) return json({ connected: false, configured: true });
    const me = await res.json();
    const accounts = (me.accounts ?? []).filter((a) => a.product === 'bc3').map((a) => ({ id: a.id, name: a.name }));
    const name = [me.identity?.first_name, me.identity?.last_name].filter(Boolean).join(' ');
    return withSession(json({ connected: true, configured: true, name, accounts }), s, req, env);
  }

  if (route.startsWith('/api/')) {
    if (req.method !== 'GET') return json({ error: 'method' }, 405);
    const path = route.slice(4);
    if (!ALLOWED_PATH.test(path)) return json({ error: 'path' }, 400);
    if (!s) return json({ error: 'auth' }, 401);
    const out = await proxy(path, s, req, env, fetchImpl);
    if (!out.s) out.res.headers.append('set-cookie', cookie(SESSION, '', req, { maxAge: 0 }));
    return withSession(out.res, out.s, req, env);
  }

  return json({ error: 'not-found' }, 404);
}
