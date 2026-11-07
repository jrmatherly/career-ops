import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { readConfig, createServer } from '../server.mjs';
import { KEY_SHAPE } from '../auth.mjs';
import { AUTH_ENV, makeUser, makeKey, sessionCookie } from './helpers.mjs';

const dir = mkdtempSync(join(tmpdir(), 'publish-auth-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));
// Browsers send the public origin, which is PUBLISH_BASE_URL, not the ephemeral port the test listens on.
const ORIGIN = AUTH_ENV.PUBLISH_BASE_URL;
const AUTH_BASE = (server) => `http://127.0.0.1:${server.address().port}`;
const html = '<!doctype html><html><body><p>CV</p></body></html>';

let count = 0;
async function boot(t, env = {}, { user: withUser = true } = {}) {
  const server = createServer(readConfig({ ...AUTH_ENV, PUBLISH_DB: join(dir, `db-${++count}.sqlite`), ...env }));
  await server.ready;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body, raw, headers = {} } = {}) => {
    const r = await fetch(base + path, {
      method, redirect: 'manual', body: raw ?? (body && JSON.stringify(body)),
      headers: { ...(key && { 'x-api-key': key }), ...(body && { 'Content-Type': 'application/json' }), ...headers },
    });
    const text = await r.text();
    return { status: r.status, text, headers: r.headers };
  };
  const user = withUser ? await makeUser(server) : null;
  return { server, base, call, user };
}

const refused = (r, what) => {
  assert.equal(r.status, 401, what);
  assert.deepEqual(JSON.parse(r.text), { error: 'api key required' }, `${what}: same body`);
};

test('upload without a key is 401', async (t) => {
  const { call } = await boot(t);
  refused(await call('PUT', '/api/shares/me', { body: { html } }), 'no key');
  refused(await call('PUT', '/api/shares/me', { key: 'cops_not-a-real-key', body: { html } }), 'unknown key');
});

test('a key with share:upload uploads', async (t) => {
  const { server, call, user } = await boot(t);
  const key = await makeKey(server, user.id, ['upload']);
  assert.match(key, /^cops_/);
  const r = await call('PUT', '/api/shares/me', { key, body: { html } });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.text).url, '/s/me');
});

test('a key with only share:upload cannot pull stats, list feedback, mint links or delete', async (t) => {
  const { server, call, user } = await boot(t);
  const key = await makeKey(server, user.id, ['upload']);
  await call('PUT', '/api/shares/me', { key, body: { html } });
  for (const [method, path] of [['GET', '/api/shares/me/stats'], ['GET', '/api/shares/me/feedback'], ['POST', '/api/shares/me/feedback-links'], ['DELETE', '/api/shares/me']]) {
    refused(await call(method, path, { key }), `${method} ${path}`);
  }
  // A refusal for a slug that exists reads the same as one for a slug that does not.
  refused(await call('GET', '/api/shares/nobody/stats', { key }), 'unknown slug');
  assert.equal((await call('GET', '/s/me')).status, 200, 'the share survived');
});

test('a key with share:manage pulls, lists feedback and deletes', async (t) => {
  const { server, call, user } = await boot(t);
  const upload = await makeKey(server, user.id, ['upload']);
  const manage = await makeKey(server, user.id, ['manage']);
  await call('PUT', '/api/shares/me', { key: upload, body: { html } });
  assert.equal(JSON.parse((await call('GET', '/api/shares/me/stats', { key: manage })).text).slug, 'me');
  assert.deepEqual(JSON.parse((await call('GET', '/api/shares/me/feedback', { key: manage })).text), []);
  assert.ok(JSON.parse((await call('POST', '/api/shares/me/feedback-links', { key: manage })).text).token);
  refused(await call('PUT', '/api/shares/me', { key: manage, body: { html } }), 'manage alone cannot upload');
  assert.equal((await call('DELETE', '/api/shares/me', { key: manage })).status, 200);
  assert.equal((await call('GET', '/api/shares/me/stats', { key: manage })).status, 404, 'past the key check, a missing share is 404');
});

test('a bad key does not crash the server', async (t) => {
  const { call } = await boot(t);
  for (const key of ['x', 'cops_', 'cops_' + 'a'.repeat(5000), 'éé', 'cops_../../etc']) {
    refused(await call('GET', '/api/shares/me/stats', { headers: { 'x-api-key': encodeURIComponent(key) } }), `key ${key.slice(0, 12)}`);
  }
  assert.equal((await call('GET', '/s/missing')).status, 401, 'still serving');
});

test('x-api-key alone cannot create another key or open the account page', async (t) => {
  const { server, call, user } = await boot(t);
  const key = await makeKey(server, user.id, ['upload', 'manage']);
  const viaAuth = await call('POST', '/api/auth/api-key/create', { key, body: { name: 'sneaky' }, headers: { Origin: ORIGIN } });
  assert.equal(viaAuth.status, 404, viaAuth.text);
  const viaAccount = await call('POST', '/account/keys', { key, headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(viaAccount.status, 401);
  const keys = await (await server.auth.$context).adapter.findMany({ model: 'apikey' });
  assert.equal(keys.length, 1, 'no second key was created');
});

test('the account page without a session is 401', async (t) => {
  const { call } = await boot(t);
  const r = await call('GET', '/account');
  assert.equal(r.status, 401);
  assert.match(r.text, /Sign in with Pocket ID/);
  assert.equal((await call('POST', '/account/keys/revoke', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 401);
});

test('a fresh session lists, creates and revokes keys; a foreign origin is refused', async (t) => {
  const { server, call, user, base } = await boot(t);
  const cookie = await sessionCookie(server, user.id);
  const form = (fields, origin = ORIGIN) => ({ headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, raw: new URLSearchParams(fields) });
  const post = (path, { headers, raw }) => fetch(base + path, { method: 'POST', headers, body: raw, redirect: 'manual' });
  const page = await call('GET', '/account', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  assert.match(page.text, /ada@example\.com/);
  assert.equal(page.headers.get('referrer-policy'), 'same-origin', 'a no-referrer page would make the browser send Origin: null on its forms');
  assert.equal((await post('/account/keys', form({ name: 'laptop' }, 'https://evil.example'))).status, 403, 'foreign origin');
  assert.equal((await post('/account/keys', { ...form({ name: 'laptop' }), headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 403, 'no origin');
  const created = await post('/account/keys', form({ name: 'laptop' }));
  assert.equal(created.status, 200);
  const key = (await created.text()).match(/<pre>(cops_[^<]+)<\/pre>/)?.[1];
  assert.ok(key, 'the new key is shown once');
  assert.equal((await call('PUT', '/api/shares/me', { key, body: { html } })).status, 200, 'it can upload');
  assert.equal((await call('GET', '/api/shares/me/stats', { key })).status, 200, 'and manage');
  const [row] = await (await server.auth.$context).adapter.findMany({ model: 'apikey' });
  assert.equal((await post('/account/keys/revoke', form({ keyId: row.id }))).status, 303);
  refused(await call('GET', '/api/shares/me/stats', { key }), 'revoked');
});

test('key creation is refused on a session older than 24 hours', async (t) => {
  const { server, user, base } = await boot(t);
  const cookie = await sessionCookie(server, user.id, 25 * 3600e3);
  const r = await fetch(`${base}/account/keys`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ name: 'late' }), headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 403);
  assert.match(await r.text(), /Sign in again/);
  assert.equal((await (await server.auth.$context).adapter.findMany({ model: 'apikey' })).length, 0);
});

test('validateUserInfo rejects an email outside the allow-list and accepts one inside', async (t) => {
  const { server } = await boot(t);
  const validate = server.auth.options.user.validateUserInfo;
  assert.equal(await validate({ user: { email: 'ADA@example.com', emailVerified: true } }), undefined);
  assert.deepEqual(await validate({ user: { email: 'eve@example.com', emailVerified: true } }), { error: 'email not allowed' });
  assert.deepEqual(await validate({ user: { email: 'ada@example.com', emailVerified: false } }), { error: 'email not allowed' }, 'an unverified email is anyone\'s');
  assert.deepEqual(await validate({ user: {} }), { error: 'email not allowed' });
});

test('sign-in with the provider unreachable reports it unavailable and shares still serve', async (t) => {
  const { call } = await boot(t);
  const r = await call('GET', '/account/sign-in');
  assert.equal(r.status, 503);
  assert.match(r.text, /provider is unavailable/);
  assert.equal((await call('GET', '/s/missing')).status, 401);
});

test('readConfig refuses a missing auth variable', () => {
  for (const key of Object.keys(AUTH_ENV)) {
    const env = { ...AUTH_ENV, [key]: '' };
    assert.throws(() => readConfig(env), new RegExp(key), key);
  }
});

test('sign-in recovers once the provider answers and redirects to it with the callback URL', async (t) => {
  const issuer = 'http://127.0.0.1:1';
  const provider = createHttpServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks` }));
  });
  // Take a free port, then leave it closed so the provider is down when the service boots.
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const { port } = provider.address();
  await new Promise((resolve) => provider.close(resolve));
  const { call } = await boot(t, { POCKET_ID_DISCOVERY_URL: `http://127.0.0.1:${port}/.well-known/openid-configuration` });
  assert.equal((await call('GET', '/account/sign-in')).status, 503, 'provider down');
  await new Promise((resolve) => provider.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  const r = await call('GET', '/account/sign-in');
  assert.equal(r.status, 303, 'discovery is retried on the next sign-in');
  const location = new URL(r.headers.get('location'));
  assert.equal(location.origin + location.pathname, `${issuer}/authorize`);
  assert.equal(location.searchParams.get('redirect_uri'), `${AUTH_ENV.PUBLISH_BASE_URL}/api/auth/callback/pocket-id`);
  assert.ok(r.headers.getSetCookie().length, 'the OAuth state cookie is set');
});

// A stand-in Pocket ID: discovery, token and userinfo, enough for Better Auth's code exchange.
async function fakeProvider(t, email, emailVerified = true) {
  let issuer;
  const provider = createHttpServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const body = path.endsWith('openid-configuration')
      ? { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks`, id_token_signing_alg_values_supported: ['RS256'] }
      : path === '/token' ? { access_token: 'fake-access', token_type: 'Bearer', expires_in: 3600 }
        : { sub: `pocket-${emailVerified}-${email.split('@')[0]}`, email, email_verified: emailVerified, name: 'Ada Example' };
    for await (const _ of req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  issuer = `http://127.0.0.1:${provider.address().port}`;
  return { POCKET_ID_DISCOVERY_URL: `${issuer}/.well-known/openid-configuration` };
}

async function signInThroughCallback(call) {
  const start = await call('GET', '/account/sign-in');
  assert.equal(start.status, 303);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const jar = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const back = await call('GET', `/api/auth/callback/pocket-id?code=fake-code&state=${encodeURIComponent(state)}`, { headers: { Cookie: jar } });
  const session = back.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('better-auth.session_token='));
  return { location: back.headers.get('location') ?? '', session };
}

test('an allowed, verified email signs in through Pocket ID on a fresh database and reaches the account page', async (t) => {
  const { call } = await boot(t, await fakeProvider(t, 'ada@example.com'), { user: false });
  const { location, session } = await signInThroughCallback(call);
  assert.ok(session, `a session cookie is set (redirected to ${location})`);
  assert.match(location, /\/account$/);
  const page = await call('GET', '/account', { headers: { Cookie: session } });
  assert.equal(page.status, 200);
  assert.match(page.text, /Signed in as ada@example\.com/);
});

test('a second account email, or an unverified one, is refused at the callback and no user is created', async (t) => {
  for (const [email, verified] of [['eve@example.com', true], ['ada@example.com', false]]) {
    const { server, call } = await boot(t, await fakeProvider(t, email, verified), { user: false });
    const { location, session } = await signInThroughCallback(call);
    assert.equal(session, undefined, `${email} verified=${verified} gets no session`);
    assert.match(location, /error=/);
    assert.doesNotMatch(location, /unable_to_get_user_info|invalid_code/, `refused by the allow-list, not by the exchange: ${location}`);
    assert.equal((await call('GET', location.replace(/^https?:\/\/[^/]+/, ''))).status, 401);
    assert.equal((await (await server.auth.$context).adapter.findMany({ model: 'user' })).length, 0);
  }
});

test('Better Auth cannot make, change or read keys over HTTP, and a key is not a session there', async (t) => {
  const { server, call, user } = await boot(t);
  const key = await makeKey(server, user.id, ['upload', 'manage']);
  const cookie = await sessionCookie(server, user.id);
  for (const path of ['/api/auth/api-key/create', '/api/auth/api-key/update']) {
    const r = await call('POST', path, { body: { name: 'x', keyId: 'x' }, headers: { Cookie: cookie, Origin: ORIGIN } });
    assert.equal(r.status, 404, `${path} is disabled: ${r.text}`);
  }
  const viaKey = await call('GET', '/api/auth/get-session', { key });
  assert.equal(viaKey.status, 200);
  assert.equal(JSON.parse(viaKey.text), null, 'x-api-key never becomes a session');
});

test('a session cookie or the old bearer token does not open the share API', async (t) => {
  const { server, call, user } = await boot(t);
  const cookie = await sessionCookie(server, user.id);
  refused(await call('PUT', '/api/shares/me', { body: { html }, headers: { Cookie: cookie } }), 'session cookie');
  refused(await call('GET', '/api/shares/me/stats', { headers: { Cookie: cookie } }), 'session cookie on stats');
  refused(await call('PUT', '/api/shares/me', { body: { html }, headers: { Authorization: 'Bearer anything' } }), 'bearer token');
});

test('a key past its hourly budget gets 429, not the bad-key 401', async (t) => {
  const { server, call, user } = await boot(t);
  const { key } = await server.auth.api.createApiKey({ body: { userId: user.id, name: 'tight', permissions: { share: ['upload'] }, rateLimitMax: 1 } });
  assert.equal((await call('PUT', '/api/shares/me', { key, body: { html } })).status, 200);
  const limited = await call('PUT', '/api/shares/me', { key, body: { html }, headers: { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '203.0.113.8' } });
  assert.equal(limited.status, 429, 'client address headers do not reset a key budget');
  assert.deepEqual(JSON.parse(limited.text), { error: 'rate limited' });
});

test('revoke needs a trusted origin, and key names are 1 to 32 characters', async (t) => {
  const { server, call, user } = await boot(t);
  const key = await makeKey(server, user.id, ['manage']);
  const cookie = await sessionCookie(server, user.id);
  const [row] = await (await server.auth.$context).adapter.findMany({ model: 'apikey' });
  const post = (path, fields, origin = ORIGIN) => fetch(`${AUTH_BASE(server)}${path}`, { method: 'POST', redirect: 'manual', body: new URLSearchParams(fields), headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal((await post('/account/keys/revoke', { keyId: row.id }, 'https://evil.example')).status, 403);
  assert.equal((await call('GET', '/api/shares/none/stats', { key })).status, 404, 'the key still works');
  for (const name of ['', '   ', 'x'.repeat(33)]) assert.equal((await post('/account/keys', { name })).status, 400, `name ${JSON.stringify(name)}`);
  assert.equal((await (await server.auth.$context).adapter.findMany({ model: 'apikey' })).length, 1, 'no key was created');
});

test('dropping an email from the allow-list stops its keys and sessions', async (t) => {
  const first = await boot(t);
  const key = await makeKey(first.server, first.user.id, ['upload', 'manage']);
  const cookie = await sessionCookie(first.server, first.user.id);
  assert.equal((await first.call('PUT', '/api/shares/me', { key, body: { html } })).status, 200);
  // A second service on the same database stands in for a restart with a different allow-list.
  const { call } = await boot(t, { PUBLISH_DB: join(dir, `db-${count}.sqlite`), PUBLISH_ALLOWED_EMAILS: 'someone-else@example.com' }, { user: false });
  refused(await call('GET', '/api/shares/me/stats', { key }), 'stats with a dropped owner');
  refused(await call('PUT', '/api/shares/me', { key, body: { html } }), 'upload with a dropped owner');
  assert.equal((await call('GET', '/account', { headers: { Cookie: cookie } })).status, 401, 'the open session is refused too');
});

test('an upload key neither opens a password-protected share nor skips the view count', async (t) => {
  const { server, call, user } = await boot(t);
  const upload = await makeKey(server, user.id, ['upload']);
  const manage = await makeKey(server, user.id, ['manage']);
  await call('PUT', '/api/shares/pw', { key: upload, body: { html, password: 'hunter22' } });
  await call('PUT', '/api/shares/open', { key: upload, body: { html } });
  assert.equal((await call('GET', '/s/pw', { key: upload })).status, 401, 'upload is not an owner preview');
  assert.equal((await call('GET', '/s/pw', { key: manage })).status, 200, 'manage is');
  assert.equal((await call('GET', '/s/open', { key: upload })).status, 200);
  assert.equal(JSON.parse((await call('GET', '/api/shares/open/stats', { key: manage })).text).views, 1, 'the upload-key view counted');
});

test('a user cannot revoke another user\'s key, and an unknown key id is a 4xx', async (t) => {
  const { server, call, user } = await boot(t, { PUBLISH_ALLOWED_EMAILS: 'ada@example.com,bob@example.com' });
  const adaKey = await makeKey(server, user.id, ['manage']);
  const [adaRow] = await (await server.auth.$context).adapter.findMany({ model: 'apikey', where: [{ field: 'referenceId', value: user.id }] });
  const bob = await makeUser(server, 'bob@example.com');
  const bobCookie = await sessionCookie(server, bob.id);
  const revoke = (keyId) => call('POST', '/account/keys/revoke', { headers: { Cookie: bobCookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, raw: new URLSearchParams({ keyId }) });
  for (const keyId of [adaRow.id, 'no-such-key']) {
    const r = await revoke(keyId);
    assert.ok(r.status >= 400 && r.status < 500, `revoke ${keyId === adaRow.id ? "ada's key" : 'unknown id'} answered ${r.status}`);
  }
  assert.equal((await call('GET', '/api/shares/none/stats', { key: adaKey })).status, 404, "ada's key still works");
});

test('an expired or disabled key gets the bad-key 401', async (t) => {
  const { server, call, user } = await boot(t);
  const ctx = await server.auth.$context;
  for (const update of [{ expiresAt: new Date(Date.now() - 1000) }, { enabled: false }]) {
    const key = await makeKey(server, user.id, ['manage']);
    const [row] = (await ctx.adapter.findMany({ model: 'apikey' })).slice(-1);
    await ctx.adapter.update({ model: 'apikey', where: [{ field: 'id', value: row.id }], update });
    refused(await call('GET', '/api/shares/none/stats', { key }), JSON.stringify(update));
  }
});

test('a returning Pocket ID user dropped from the allow-list is refused at sign-in', async (t) => {
  const provider = await fakeProvider(t, 'ada@example.com');
  const first = await boot(t, provider, { user: false });
  assert.ok((await signInThroughCallback(first.call)).session, 'first sign-in creates and links the account');
  const later = await boot(t, { ...provider, PUBLISH_DB: join(dir, `db-${count}.sqlite`), PUBLISH_ALLOWED_EMAILS: 'someone-else@example.com' }, { user: false });
  const { location, session } = await signInThroughCallback(later.call);
  assert.equal(session, undefined, 'the linked account is re-checked on sign-in');
  assert.match(location, /error=/);
  assert.doesNotMatch(location, /unable_to_get_user_info|invalid_code|state/, `refused by the allow-list: ${location}`);
});

test('starting sign-in writes no database row', async (t) => {
  const { server, call } = await boot(t, await fakeProvider(t, 'ada@example.com'), { user: false });
  for (let i = 0; i < 3; i++) assert.equal((await call('GET', '/account/sign-in')).status, 303);
  assert.equal((await (await server.auth.$context).adapter.findMany({ model: 'verification' })).length, 0, 'OAuth state lives in a cookie');
});

test('only a cops_ key of the generated shape reaches the key store', async (t) => {
  const { server, user } = await boot(t);
  const key = await makeKey(server, user.id, ['upload']);
  assert.match(key, KEY_SHAPE, 'generated keys match');
  for (const junk of ['cops_', `cops_${'a'.repeat(63)}`, `cops_${'a'.repeat(65)}`, `cops_${'a'.repeat(63)}1`, `xyz_${'a'.repeat(64)}`]) assert.doesNotMatch(junk, KEY_SHAPE, junk.slice(0, 12));
});
