import assert from 'node:assert/strict';
import test from 'node:test';
import { areaTags, clip, effortLevel, htmlToLines, parseBoardUrl, parseFields, shortName, toIdea } from '../src/basecamp/idea.js';
import { ALLOWED_PATH, allowedOrigin, handle, nextLink, readCookies, seal, unseal } from '../src/basecamp/oauth-core.js';

/* ---------- Card parsing ---------- */

const BOLD = '<div><strong>Title</strong>: Automate dependency updates<br><strong>Area</strong>: Tech / Process</div><div><strong>Problem it solves</strong>: Vulnerabilities are fixed by hand.</div><div><strong>Rough effort</strong>: Medium</div><div><strong>Expected impact</strong>: Faster fixes &amp; less toil.<br><br></div>';
const PLAIN = "<div>Title: Standardize on shadcn/ui</div><div>Area: Tech / UX</div><div>Problem it solves:&nbsp; Setup churn.</div><div>Rough effort: Medium</div><div>Expected impact: Faster kickoff.</div><div>Anything I'd flag: Define a shared baseline.</div>";

test('htmlToLines: breaks, entities, tags', () => {
  assert.deepEqual(htmlToLines('<div>a&nbsp;&amp; b<br>c</div><div>d &#8217; &#x41;</div>'), ['a & b', 'c', 'd ’ A']);
});

test('parseFields: bold labels and plain labels', () => {
  const a = parseFields(BOLD);
  assert.equal(a.title, 'Automate dependency updates');
  assert.equal(a.area, 'Tech / Process');
  assert.equal(a.problem, 'Vulnerabilities are fixed by hand.');
  assert.equal(a.effort, 'Medium');
  assert.equal(a.impact, 'Faster fixes & less toil.');
  const b = parseFields(PLAIN);
  assert.equal(b.problem, 'Setup churn.');
  assert.equal(b.flag, 'Define a shared baseline.');
  assert.deepEqual(b.notes, []);
});

test('parseFields: free text is kept, continuation lines join their field', () => {
  const f = parseFields('<div>Just an idea</div><div>Impact: big</div><div>really big</div>');
  assert.deepEqual(f.notes, ['Just an idea']);
  assert.equal(f.impact, 'big really big');
});

test('effortLevel', () => {
  for (const [s, n] of [['Small', 1], ['low', 1], ['S', 1], ['Medium', 2], ['Medium to high', 2], ['M', 2], ['High', 3], ['Large', 3], ['XL', 3], ['Élevé', 3], ['', 0], ['two sprints', 0]]) assert.equal(effortLevel(s), n, s);
});

test('areaTags, shortName, clip', () => {
  assert.deepEqual(areaTags('Tech / Process'), ['Tech', 'Process']);
  assert.deepEqual(areaTags('UX, Data and Ops'), ['UX', 'Data', 'Ops']);
  assert.equal(shortName('Bartosz Suchorski'), 'Bartosz S.');
  assert.equal(shortName('Cher'), 'Cher');
  assert.equal(clip('short', 10), 'short');
  const c = clip('one two three four five six seven', 20);
  assert.ok(c.length <= 20 && c.endsWith('…'), c);
});

test('toIdea: card fields', () => {
  const idea = toIdea({
    id: 1,
    title: 'Automate dependency security updates',
    content: BOLD,
    creator: { name: 'Bartosz Suchorski' },
    parent: { title: 'In Progress' },
    app_url: 'https://app.basecamp.com/1/buckets/2/card_tables/cards/1',
    comments_count: 1,
    boosts_count: 2,
  });
  assert.equal(idea.column, 'In Progress');
  assert.equal(idea.effortLevel, 2);
  assert.deepEqual(idea.tags, ['Tech', 'Process']);
  assert.equal(idea.longTitle, 'Automate dependency updates');
  assert.equal(idea.boosts, 2);
});

test('parseBoardUrl: web, app and API links', () => {
  for (const u of [
    'https://3.basecamp.com/3192265/buckets/33642311/card_tables/6374240601',
    'https://app.basecamp.com/3192265/buckets/33642311/card_tables/6374240601',
    'https://3.basecampapi.com/3192265/buckets/33642311/card_tables/6374240601.json',
  ]) assert.deepEqual(parseBoardUrl(u), { account: '3192265', bucket: '33642311', table: '6374240601' }, u);
  assert.equal(parseBoardUrl('https://example.com/card_tables/1'), null);
});

/* ---------- Relay ---------- */

const ENV = { BASECAMP_CLIENT_ID: 'cid', BASECAMP_CLIENT_SECRET: 'secret' };
const ORIGIN = 'https://rouleau.test';

/** Fake Launchpad + API. Records calls. */
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [prefix, fn] of routes) if (String(url).startsWith(prefix)) return fn(String(url), init);
    return new Response('nope', { status: 404 });
  };
  f.calls = calls;
  return f;
}

const tokens = (a = 'A1', r = 'R1', expires_in = 1209600) => () => Response.json({ access_token: a, refresh_token: r, expires_in });

const setCookies = (res) => res.headers.getSetCookie();
const cookieValue = (res, name) => setCookies(res).find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);

test('seal / unseal round trip, wrong secret fails', async () => {
  const s = await seal({ a: 'x', r: 'y', e: 1 }, 'k');
  assert.deepEqual(await unseal(s, 'k'), { a: 'x', r: 'y', e: 1 });
  assert.equal(await unseal(s, 'other'), null);
  assert.equal(await unseal('garbage', 'k'), null);
});

test('status without configuration', async () => {
  const res = await handle(new Request(`${ORIGIN}/api/basecamp/status`), {});
  assert.deepEqual(await res.json(), { connected: false, configured: false });
});

test('login → callback → status → proxy, with paginated cards', async () => {
  const login = await handle(new Request(`${ORIGIN}/api/basecamp/login?return=/%23ideas`), ENV);
  assert.equal(login.status, 302);
  const auth = new URL(login.headers.get('location'));
  assert.equal(auth.origin, 'https://launchpad.37signals.com');
  assert.equal(auth.searchParams.get('redirect_uri'), `${ORIGIN}/api/basecamp/callback`);
  const state = auth.searchParams.get('state');
  const stateCookie = cookieValue(login, 'rouleau_bc_state');
  assert.match(setCookies(login)[0], /HttpOnly; SameSite=Lax; Secure/);

  // Forged state, or a real state without its nonce cookie (CSRF): refused, no session.
  for (const [q, c] of [['nope', stateCookie], [encodeURIComponent(state), 'other']]) {
    const bad = await handle(new Request(`${ORIGIN}/api/basecamp/callback?code=c&state=${q}`, { headers: { cookie: `rouleau_bc_state=${c}` } }), ENV);
    assert.equal(bad.headers.get('location'), '/?basecamp=refused#ideas');
    assert.equal(cookieValue(bad, 'rouleau_bc'), undefined);
  }

  const f = fakeFetch([
    ['https://launchpad.37signals.com/authorization/token', tokens()],
    ['https://launchpad.37signals.com/authorization.json', () => Response.json({ identity: { first_name: 'Ada', last_name: 'L', email_address: 'secret@x' }, accounts: [{ id: 1, name: 'Acme', product: 'bc3' }, { id: 2, product: 'bcx' }] })],
    ['https://3.basecampapi.com/1/buckets/2/card_tables/lists/3/cards.json?page=2', () => Response.json([{ id: 'c3' }])],
    ['https://3.basecampapi.com/1/buckets/2/card_tables/lists/3/cards.json', () => Response.json([{ id: 'c1' }, { id: 'c2' }], { headers: { link: '<https://3.basecampapi.com/1/buckets/2/card_tables/lists/3/cards.json?page=2>; rel="next"' } })],
  ]);
  const cb = await handle(new Request(`${ORIGIN}/api/basecamp/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie: `rouleau_bc_state=${stateCookie}` } }), ENV, f);
  assert.equal(cb.headers.get('location'), '/#ideas');
  const exchange = new URL(f.calls[0].url);
  assert.equal(exchange.searchParams.get('type'), 'web_server');
  assert.equal(exchange.searchParams.get('code'), 'c');
  const session = cookieValue(cb, 'rouleau_bc');
  assert.ok(session && !session.includes('A1'), 'the token is sealed, not readable');

  const headers = { cookie: `rouleau_bc=${session}` };
  const st = await (await handle(new Request(`${ORIGIN}/api/basecamp/status`, { headers }), ENV, f)).json();
  assert.deepEqual(st, { connected: true, configured: true, name: 'Ada L', accounts: [{ id: 1, name: 'Acme' }] });

  const cards = await handle(new Request(`${ORIGIN}/api/basecamp/api/1/buckets/2/card_tables/lists/3/cards.json`, { headers }), ENV, f);
  assert.deepEqual(await cards.json(), [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
  const apiCall = f.calls.find((c) => c.url.startsWith('https://3.basecampapi.com'));
  assert.equal(apiCall.init.headers.authorization, 'Bearer A1');
  assert.match(apiCall.init.headers['user-agent'], /Rouleau/);
});

test('proxy: only card table GETs, needs a session', async () => {
  const f = fakeFetch([]);
  const deny = (p, init) => handle(new Request(`${ORIGIN}/api/basecamp/api${p}`, init), ENV, f);
  assert.equal((await deny('/1/buckets/2/todos/3.json')).status, 400);
  assert.equal((await deny('/1/buckets/2/card_tables/3.json/../../people.json')).status, 400);
  assert.equal((await deny('/1/buckets/2/card_tables/3.json')).status, 401);
  assert.equal((await deny('/1/buckets/2/card_tables/3.json', { method: 'POST' })).status, 405);
  assert.equal(f.calls.length, 0);
  assert.ok(ALLOWED_PATH.test('/1/buckets/2/card_tables/cards/9.json'));
});

test('expired token is refreshed and the new cookie is sent back', async () => {
  const old = await seal({ a: 'OLD', r: 'R1', e: Date.now() - 1000 }, ENV.BASECAMP_CLIENT_SECRET);
  const f = fakeFetch([
    ['https://launchpad.37signals.com/authorization/token', tokens('NEW', '')],
    ['https://3.basecampapi.com/', (url, init) => Response.json({ token: init.headers.authorization })],
  ]);
  const res = await handle(new Request(`${ORIGIN}/api/basecamp/api/1/buckets/2/card_tables/3.json`, { headers: { cookie: `rouleau_bc=${old}` } }), ENV, f);
  assert.deepEqual(await res.json(), { token: 'Bearer NEW' });
  assert.equal(new URL(f.calls[0].url).searchParams.get('type'), 'refresh');
  const renewed = await unseal(cookieValue(res, 'rouleau_bc'), ENV.BASECAMP_CLIENT_SECRET);
  assert.equal(renewed.a, 'NEW');
  assert.equal(renewed.r, 'R1', 'keeps the refresh token when Launchpad does not send a new one');
});

test('logout clears the cookie, only by POST; unsafe return paths fall back', async () => {
  assert.equal((await handle(new Request(`${ORIGIN}/api/basecamp/logout`), ENV)).status, 405);
  const out = await handle(new Request(`${ORIGIN}/api/basecamp/logout`, { method: 'POST' }), ENV);
  assert.match(setCookies(out)[0], /^rouleau_bc=; .*Max-Age=0/);
  const login = await handle(new Request(`${ORIGIN}/api/basecamp/login?return=//evil.example`), ENV);
  const st = await unseal(new URL(login.headers.get('location')).searchParams.get('state'), ENV.BASECAMP_CLIENT_SECRET);
  assert.equal(st.b, '/#ideas');
});

test('deploy preview: login on the preview, callback on the main site, session adopted by the preview', async () => {
  const env = { ...ENV, URL: 'https://rouleau-t02.netlify.app' };
  const PREVIEW = 'https://deploy-preview-7--rouleau-t02.netlify.app';
  const login = await handle(new Request(`${PREVIEW}/api/basecamp/login?return=/%23ideas`), env);
  const auth = new URL(login.headers.get('location'));
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://rouleau-t02.netlify.app/api/basecamp/callback');
  const nonce = cookieValue(login, 'rouleau_bc_state');

  const f = fakeFetch([['https://launchpad.37signals.com/authorization/token', tokens('PA', 'PR')]]);
  const cb = await handle(new Request(`https://rouleau-t02.netlify.app/api/basecamp/callback?code=c&state=${encodeURIComponent(auth.searchParams.get('state'))}`), env, f);
  const adopt = new URL(cb.headers.get('location'));
  assert.equal(adopt.origin, PREVIEW);
  assert.equal(adopt.pathname, '/api/basecamp/adopt');
  assert.equal(cookieValue(cb, 'rouleau_bc'), undefined, 'no session on the main site');

  const noNonce = await handle(new Request(adopt), env);
  assert.equal(noNonce.headers.get('location'), '/?basecamp=refused#ideas');
  const ok = await handle(new Request(adopt, { headers: { cookie: `rouleau_bc_state=${nonce}` } }), env);
  assert.equal(ok.headers.get('location'), '/#ideas');
  assert.equal((await unseal(cookieValue(ok, 'rouleau_bc'), env.BASECAMP_CLIENT_SECRET)).a, 'PA');
});

test('allowedOrigin: the site and its previews only', () => {
  const env = { ...ENV, URL: 'https://rouleau-t02.netlify.app' };
  const req = new Request('https://rouleau-t02.netlify.app/api/basecamp/callback');
  assert.ok(allowedOrigin('https://deploy-preview-7--rouleau-t02.netlify.app', req, env));
  assert.ok(allowedOrigin('https://main--rouleau-t02.netlify.app', req, env));
  assert.ok(!allowedOrigin('https://evil--rouleau-t02.netlify.app.evil.example', req, env));
  assert.ok(!allowedOrigin('https://other.netlify.app', req, env));
  assert.ok(!allowedOrigin('http://deploy-preview-7--rouleau-t02.netlify.app', req, env));
  assert.ok(!allowedOrigin('https://x.netlify.app/path', req, env));
});

test('helpers', () => {
  assert.equal(nextLink('<https://3.basecampapi.com/x?page=2>; rel="next"'), 'https://3.basecampapi.com/x?page=2');
  assert.equal(nextLink('<https://evil.example/x>; rel="next"'), null);
  assert.deepEqual(readCookies(new Request(ORIGIN, { headers: { cookie: 'a=1; b=2=3' } })), { a: '1', b: '2=3' });
});
