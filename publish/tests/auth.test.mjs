import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { readConfig, createServer } from '../server.mjs';
import { AUTH_ENV, makeUser, makeKey, sessionCookie } from './helpers.mjs';

const dir = mkdtempSync(join(tmpdir(), 'publish-auth-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));
// Browsers send the public origin, which is PUBLISH_BASE_URL, not the ephemeral port the test listens on.
const ORIGIN = AUTH_ENV.PUBLISH_BASE_URL;
const html = '<!doctype html><html><body><p>CV</p></body></html>';

let count = 0;
async function boot(t, env = {}, { user: withUser = true } = {}) {
  const server = createServer(readConfig({ ...AUTH_ENV, PUBLISH_DB: join(dir, `db-${++count}.sqlite`), ...env }));
  await server.ready;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body, headers = {} } = {}) => {
    const r = await fetch(base + path, {
      method, redirect: 'manual', body: body && JSON.stringify(body),
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
  assert.notEqual(viaAuth.status, 200, viaAuth.text);
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
