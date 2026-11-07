import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { readConfig, createServer, clientKey } from '../server.mjs';
import { hideContacts } from '../pages.mjs';

const OWNER = 'owner-test-token';
const AUTH = { Authorization: `Bearer ${OWNER}` };
const dir = mkdtempSync(join(tmpdir(), 'publish-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const fixture = (marker) => `<!doctype html><html><head><title>CV</title></head><body><h1>Ada Example</h1>
<div class="contact-row"><a href="mailto:ada@example.com">ada@example.com</a> <a href="tel:+15550100">+1 555 0100</a></div>
<p>${marker}</p></body></html>`;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

let dbCount = 0;
async function boot(t, { proxied = false } = {}) {
  const config = readConfig({
    PUBLISH_OWNER_TOKEN: OWNER,
    PUBLISH_SECRET: 'test-secret',
    PUBLISH_DB: join(dir, `db-${++dbCount}.sqlite`),
    PUBLISH_TRUSTED_PROXIES: proxied ? '127.0.0.1,::1' : '',
  });
  const server = createServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' });
  const post = (path, form, headers = {}) => fetch(base + path, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(form),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
  });
  const api = async (method, path, payload) => {
    const r = await fetch(base + path, { method, headers: { ...AUTH, 'Content-Type': 'application/json' }, body: payload && JSON.stringify(payload) });
    return { status: r.status, body: await r.json() };
  };
  const views = async (slug) => (await api('GET', `/api/shares/${slug}/stats`)).body.views;
  return { get, post, api, views };
}

test('password gate: wrong 401, right 303 plus cookie, cookie 200, password change invalidates the cookie', async (t) => {
  const { get, post, api } = await boot(t);
  assert.equal((await api('PUT', '/api/shares/pw', { html: fixture('v1'), password: 'hunter22' })).status, 200);
  assert.equal((await get('/s/pw')).status, 401, 'no cookie shows the form');
  assert.equal((await post('/s/pw', { password: 'nope' })).status, 401, 'wrong password');
  const ok = await post('/s/pw', { password: 'hunter22' });
  assert.equal(ok.status, 303, 'right password redirects');
  assert.equal(ok.headers.get('location'), '/s/pw');
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /^s_pw=\d+\.[\w-]+; Path=\/s\/pw; HttpOnly; SameSite=Lax; Max-Age=600$/);
  const cookie = setCookie.split(';')[0];
  const page = await get('/s/pw', { Cookie: cookie });
  assert.equal(page.status, 200, 'cookie opens the page');
  assert.match(await page.text(), /v1/);
  const [, exp, mac] = cookie.match(/^s_pw=(\d+)\.(.+)$/);
  assert.equal((await get('/s/pw', { Cookie: `s_pw=${Number(exp) + 1}.${mac}` })).status, 401, 'an edited expiry breaks the MAC');
  assert.equal((await get('/s/pw', AUTH)).status, 200, 'the owner token opens the page without the password');
  t.mock.timers.enable({ apis: ['Date'], now: Number(exp) + 1 });
  assert.equal((await get('/s/pw', { Cookie: cookie })).status, 401, 'the cookie stops working server-side after ten minutes');
  t.mock.timers.reset();
  await api('PUT', '/api/shares/pw', { html: fixture('v1'), password: 'hunter23' });
  assert.equal((await get('/s/pw', { Cookie: cookie })).status, 401, 'password change invalidates the cookie');
});

test('every /api/ route refuses a missing or wrong owner token with the same 401 body', async (t) => {
  const { get, api } = await boot(t);
  const base = { 'Content-Type': 'application/json' };
  const calls = [['PUT', '/api/shares/x', JSON.stringify({ html: fixture('x') })], ['GET', '/api/shares/x/stats'], ['POST', '/api/shares/x/feedback-links'], ['GET', '/api/shares/x/feedback'], ['DELETE', '/api/shares/x']];
  for (const [method, path, body] of calls) {
    for (const headers of [base, { ...base, Authorization: 'Bearer wrong' }, { ...base, Authorization: `Bearer ${OWNER}x` }]) {
      const r = await fetch(`${(await get('/')).url.replace(/\/$/, '')}${path}`, { method, headers, body });
      assert.equal(r.status, 401, `${method} ${path} ${headers.Authorization ?? 'no token'}`);
      assert.deepEqual(await r.json(), { error: 'owner token required' });
    }
  }
  assert.equal((await get('/s/x')).status, 401, 'the refused PUT published nothing');
  assert.equal((await api('GET', '/api/shares/x/stats')).status, 404);
});

test('PUT refuses an oversized body, bad JSON, missing html and non-boolean hideContacts', async (t) => {
  const { get, api } = await boot(t);
  const origin = (await get('/')).url.replace(/\/$/, '');
  const put = (body, extra = {}, duplex) => fetch(`${origin}/api/shares/big`, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/json', ...extra }, body, duplex });
  // Headers only: the server refuses on Content-Length and closes, so a body already in flight would be reset.
  const big = await new Promise((resolve, reject) => {
    const req = request(`${origin}/api/shares/big`, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/json', 'Content-Length': (4 << 20) + 1 } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, connection: res.headers.connection }));
    });
    req.on('error', reject);
    req.flushHeaders();
  });
  assert.deepEqual(big, { status: 413, body: 'Payload too large', connection: 'close' });
  const streamed = await put(new Blob(['x'.repeat((4 << 20) + 1)]).stream(), {}, 'half').catch((e) => e.cause?.code);
  assert.ok(streamed === 'ECONNRESET' || streamed === 'EPIPE' || streamed.status === 413, `a chunked oversize body is cut off (${streamed.status ?? streamed})`);
  assert.deepEqual([(await put('{not json')).status, (await (await put('{not json')).json()).error], [400, 'body must be JSON']);
  assert.equal((await api('PUT', '/api/shares/big', { html: '' })).body.error, 'html required');
  assert.equal((await api('PUT', '/api/shares/big', { html: 'x', password: 5 })).body.error, 'password must be a string');
  assert.equal((await api('PUT', '/api/shares/big', { html: 'x', hideContacts: 'true' })).body.error, 'hideContacts must be a boolean');
  assert.equal((await get('/s/big')).status, 401, 'nothing was published');
});

test('republishing without password or hideContacts keeps both; sending them changes them; nothing hidden is reported', async (t) => {
  const { get, api } = await boot(t);
  const first = await api('PUT', '/api/shares/keep', { html: fixture('v1'), password: 'pw', hideContacts: true });
  assert.deepEqual([first.body.hasPassword, first.body.hideContacts], [true, true]);
  const again = await api('PUT', '/api/shares/keep', { html: fixture('v2') });
  assert.deepEqual([again.body.hasPassword, again.body.hideContacts], [true, true], 'a re-render keeps its protection');
  assert.equal((await get('/s/keep')).status, 401, 'still password protected');
  const cleared = await api('PUT', '/api/shares/keep', { html: fixture('v3'), password: null, hideContacts: false });
  assert.deepEqual([cleared.body.hasPassword, cleared.body.hideContacts], [false, false]);
  const served = await (await get('/s/keep')).text();
  assert.ok(served.includes('ada@example.com'), 'contacts are back');
  const nothing = await api('PUT', '/api/shares/plain', { html: '<html><body><h1>No contacts</h1></body></html>', hideContacts: true });
  assert.equal(nothing.body.hideContacts, false, 'hideContacts is reported true only when something was removed');
  assert.equal((await api('GET', '/api/shares/plain/stats')).body.hideContacts, false);
});

test('view counting: two clients x10 is 2, owner 0, crawler 0, 50 parallel distinct keys add 50', async (t) => {
  const { get, api, views } = await boot(t, { proxied: true });
  await api('PUT', '/api/shares/open', { html: fixture('open') });
  for (let i = 0; i < 10; i++) {
    await get('/s/open', { 'cf-connecting-ip': '203.0.113.1' });
    await get('/s/open', { 'cf-connecting-ip': '203.0.113.2' });
  }
  assert.equal(await views('open'), 2, 'two clients x10');
  for (let i = 0; i < 5; i++) await get('/s/open', { ...AUTH, 'cf-connecting-ip': `203.0.113.${50 + i}` });
  assert.equal(await views('open'), 2, 'owner adds none');
  await get('/s/open', { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'cf-connecting-ip': '66.249.66.1' });
  assert.equal(await views('open'), 2, 'crawler adds none');
  const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => get('/s/open', { 'cf-connecting-ip': `198.51.100.${i}` })));
  assert.ok(rs.every((r) => r.status === 200), 'all 50 served');
  assert.equal(await views('open'), 52, '50 parallel distinct keys add 50');
});

test('feedback: link renders the snapshot, comment round-trips through GET feedback, snapshot frozen across republish', async (t) => {
  const { get, post, api } = await boot(t);
  await api('PUT', '/api/shares/open', { html: fixture('first-version') });
  const { status, body: { token } } = await api('POST', '/api/shares/open/feedback-links');
  assert.equal(status, 200);
  const first = await get(`/f/${token}`);
  assert.equal(first.status, 200);
  const firstHtml = await first.text();
  assert.ok(firstHtml.includes('first-version') && firstHtml.includes('name="authorName"'), 'snapshot and form rendered');
  assert.ok(firstHtml.indexOf('name="authorName"') < firstHtml.indexOf('</body>'), 'form sits before </body>');
  await api('PUT', '/api/shares/open', { html: fixture('second-version') });
  assert.match(await (await get('/s/open')).text(), /second-version/, 'live page republished');
  assert.equal(sha256(await (await get(`/f/${token}`)).text()), sha256(firstHtml), 'link keeps the frozen snapshot');
  const sent = await post(`/f/${token}`, { authorName: ' Rita Reviewer ', body: 'Lead with the migration.' });
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.get('location'), `/f/${token}`);
  assert.equal((await post(`/f/${token}`, { authorName: 'x', body: '  ' })).status, 400, 'empty body refused');
  const feedback = await api('GET', '/api/shares/open/feedback');
  assert.equal(feedback.status, 200);
  assert.equal(feedback.body.length, 1);
  const [comment] = feedback.body;
  assert.equal(comment.author, 'Rita Reviewer');
  assert.equal(comment.body, 'Lead with the migration.');
  assert.match(comment.linkId, /^[0-9a-f]{12}$/);
  assert.ok(!Number.isNaN(Date.parse(comment.created)));
});

test('hideContacts strips the contact row, mailto and tel from the stored and served page', async (t) => {
  const { get, api } = await boot(t);
  const put = await api('PUT', '/api/shares/hidden', { html: fixture('hidden'), hideContacts: true });
  assert.equal(put.body.sha, sha256(hideContacts(fixture('hidden'))), 'stored html is the stripped html');
  const served = await (await get('/s/hidden')).text();
  assert.equal(sha256(served), put.body.sha, 'served html is the stored html');
  for (const needle of ['class="contact-row"', 'mailto:', 'tel:', 'ada@example.com', '555 0100']) {
    assert.ok(!served.includes(needle), `served page has no ${needle}`);
  }
  assert.ok(served.includes('Ada Example'), 'the rest of the page survives');
  assert.equal((await api('GET', '/api/shares/hidden/stats')).body.hideContacts, true);
});

test('rotating X-Forwarded-For from an untrusted peer counts one view', async (t) => {
  const { get, api, views } = await boot(t);
  await api('PUT', '/api/shares/open', { html: fixture('open') });
  for (let i = 0; i < 10; i++) {
    await get('/s/open', { 'X-Forwarded-For': `10.0.0.${i}`, 'cf-connecting-ip': `10.1.0.${i}` });
  }
  assert.equal(await views('open'), 1);
});

test('cf-connecting-ip from a trusted peer is the client key', async (t) => {
  const { get, api, views } = await boot(t, { proxied: true });
  await api('PUT', '/api/shares/open', { html: fixture('open') });
  for (let i = 0; i < 3; i++) {
    await get('/s/open', { 'cf-connecting-ip': '203.0.113.7' });
    await get('/s/open', { 'cf-connecting-ip': ' 203.0.113.8 ', 'X-Forwarded-For': `10.0.0.${i}` });
  }
  assert.equal(await views('open'), 2);
});

test('six wrong passwords in ten minutes returns 429', async (t) => {
  const { post, api } = await boot(t, { proxied: true });
  await api('PUT', '/api/shares/pw', { html: fixture('pw'), password: 'hunter22' });
  const a = { 'cf-connecting-ip': '203.0.113.20' };
  for (let i = 0; i < 5; i++) assert.equal((await post('/s/pw', { password: `wrong-${i}` }, a)).status, 401, `attempt ${i + 1} is 401`);
  const limited = await post('/s/pw', { password: 'hunter22' }, a);
  assert.equal(limited.status, 429, 'sixth attempt is limited even with the right password');
  assert.ok(Number(limited.headers.get('retry-after')) > 0, 'Retry-After set');
  assert.equal(await limited.text(), 'Too many attempts');
  assert.equal((await post('/s/pw', { password: 'nope' }, { 'cf-connecting-ip': '203.0.113.21' })).status, 401, 'another client key is unaffected');
});

test('a forged token and a random token both return 404 with identical bodies', async (t) => {
  const { get, api } = await boot(t);
  await api('PUT', '/api/shares/open', { html: fixture('open') });
  const { body: { token } } = await api('POST', '/api/shares/open/feedback-links');
  assert.equal((await get(`/f/${token}`)).status, 200, 'the real token works');
  const forged = `${token.split('~')[0]}~${randomBytes(32).toString('base64url')}`;
  const random = randomBytes(40).toString('base64url');
  const [f, r] = await Promise.all([get(`/f/${forged}`), get(`/f/${random}`)]);
  assert.equal(f.status, 404);
  assert.equal(r.status, 404);
  const [fb, rb] = [await f.text(), await r.text()];
  assert.equal(fb, 'Not found');
  assert.equal(fb, rb);
});

test('an unknown slug and a wrong password return identical 401 bodies', async (t) => {
  const { get, post, api } = await boot(t);
  await api('PUT', '/api/shares/pw', { html: fixture('pw'), password: 'hunter22' });
  const [wrong, unknown] = [await post('/s/pw', { password: 'nope' }), await post('/s/nope', { password: 'nope' })];
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  const wrongBody = await wrong.text();
  assert.match(wrongBody, /Wrong password/);
  assert.equal(await unknown.text(), wrongBody);
  const [getUnknown, getProtected] = [await get('/s/nope'), await get('/s/pw')];
  assert.equal(getUnknown.status, 401);
  const unknownForm = await getUnknown.text();
  assert.match(unknownForm, /<form method="post">/);
  assert.equal(await getProtected.text(), unknownForm, 'unknown and protected show the same form');
});

test('share pages carry the CSP and privacy headers', async (t) => {
  const { get, api } = await boot(t);
  await api('PUT', '/api/shares/open', { html: fixture('open') });
  const { body: { token } } = await api('POST', '/api/shares/open/feedback-links');
  const expected = {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
  };
  for (const [path, status] of [['/s/open', 200], ['/s/missing', 401], [`/f/${token}`, 200]]) {
    const r = await get(path);
    assert.equal(r.status, status, path);
    for (const [name, value] of Object.entries(expected)) assert.equal(r.headers.get(name), value, `${path} ${name}`);
  }
});

test('delete removes the share: /s/ is 401 form, stats 404, old feedback token 404', async (t) => {
  const { get, post, api } = await boot(t);
  await api('PUT', '/api/shares/gone', { html: fixture('gone') });
  const { body: { token } } = await api('POST', '/api/shares/gone/feedback-links');
  assert.equal((await post(`/f/${token}`, { authorName: 'Rita', body: 'Old comment.' })).status, 303);
  const unknownForm = await (await get('/s/never-existed')).text();
  assert.deepEqual(await api('DELETE', '/api/shares/gone'), { status: 200, body: { deleted: 'gone' } });
  const s = await get('/s/gone');
  assert.equal(s.status, 401);
  assert.equal(await s.text(), unknownForm, 'a deleted share is an unknown slug');
  assert.deepEqual(await api('GET', '/api/shares/gone/stats'), { status: 404, body: { error: 'no such share' } });
  const f = await get(`/f/${token}`);
  assert.equal(f.status, 404);
  assert.equal(await f.text(), 'Not found');
  assert.equal((await api('DELETE', '/api/shares/gone')).status, 404, 'second delete is 404');
  await api('PUT', '/api/shares/gone', { html: fixture('gone') });
  assert.equal((await get(`/f/${token}`)).status, 404, 'republishing the same HTML does not revive the old token');
  assert.deepEqual((await api('GET', '/api/shares/gone/feedback')).body, [], 'the old comments did not carry over to the reused slug');
});

test('clientKey folds an IPv6 address into its /64 and keeps IPv4 as is', () => {
  const config = readConfig({ PUBLISH_OWNER_TOKEN: 'o', PUBLISH_SECRET: 's', PUBLISH_TRUSTED_PROXIES: '127.0.0.1' });
  const key = (remoteAddress, header) => clientKey({ socket: { remoteAddress }, headers: header ? { 'cf-connecting-ip': header } : {} }, config);
  assert.equal(key('127.0.0.1', '2001:db8:1:2::a'), key('127.0.0.1', '2001:db8:1:2:ffff::b'), 'same /64 is one client');
  assert.notEqual(key('127.0.0.1', '2001:db8:1:2::a'), key('127.0.0.1', '2001:db8:1:3::a'), 'another /64 is another client');
  assert.equal(key('127.0.0.1', '2001:db8:1:2::a'), '2001:0db8:0001:0002::/64');
  assert.equal(key('::1'), '0000:0000:0000:0000::/64');
  assert.equal(key('::ffff:203.0.113.9'), '203.0.113.9', 'IPv4-mapped peer keeps its IPv4 form');
  assert.equal(key('127.0.0.1', '::ffff:203.0.113.9'), '203.0.113.9', 'IPv4-mapped header value keeps its IPv4 form');
  assert.equal(key('10.0.0.5', '203.0.113.1'), '10.0.0.5', 'an untrusted peer never gets the header');
});

test('readConfig refuses a missing owner token or secret', () => {
  assert.throws(() => readConfig({ PUBLISH_SECRET: 's' }), /PUBLISH_OWNER_TOKEN/);
  assert.throws(() => readConfig({ PUBLISH_OWNER_TOKEN: ' ', PUBLISH_SECRET: 's' }), /PUBLISH_OWNER_TOKEN/);
  assert.throws(() => readConfig({ PUBLISH_OWNER_TOKEN: 'o' }), /PUBLISH_SECRET/);
  assert.throws(() => readConfig({ PUBLISH_OWNER_TOKEN: 'o', PUBLISH_SECRET: '' }), /PUBLISH_SECRET/);
  const config = readConfig({ PUBLISH_OWNER_TOKEN: 'o', PUBLISH_SECRET: 's', PUBLISH_CLIENT_IP_HEADER: 'X-Real-IP', PUBLISH_TRUSTED_PROXIES: '10.0.0.1, 10.0.0.2' });
  assert.equal(config.bind, '127.0.0.1');
  assert.equal(config.port, 8080);
  assert.equal(config.dbPath, 'publish.db');
  assert.equal(config.clientIpHeader, 'x-real-ip');
  assert.deepEqual([...config.trustedProxies], ['10.0.0.1', '10.0.0.2']);
});
