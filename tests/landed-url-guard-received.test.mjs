// tests/landed-url-guard-received.test.mjs. archiveUrl in real Chromium judges
// what the page received after its last read: the address behind every
// response, whatever name the lookup gave, and every WebSocket it opened, even
// one that sent only a close frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolRequired } from './required-tools.mjs';
import { HOST_RESOLVER_RULES, INTERNAL, REFUSED, REFUSED_BY_ADDRESS, archiveUrl, archived, readsWhen, serversFor } from './landed-url-guard-fixtures.mjs';

async function chromiumAndServer(t, options) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: [HOST_RESOLVER_RULES] });
  } catch (err) {
    if (toolRequired('browser')) throw err;
    t.skip('no Chromium');
    return null;
  }
  return serversFor(t, browser, options);
}

// The page's first read waits until the private listener has answered, as a
// response or as a WebSocket frame, so the refusal never depends on the 2 s
// hydration wait being long enough.
const readsAfterPrivateAnswer = (env) => ({ newContext: async () => {
  const context = await env.browser.newContext();
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    const answered = new Promise((resolve) => {
      context.on('response', (response) => { if (new URL(response.url()).port === String(env.privatePort)) resolve(); });
      page.on('websocket', (socket) => socket.on('framereceived', resolve));
    });
    const title = page.title.bind(page);
    page.title = async () => {
      await answered;
      return title();
    };
    return page;
  };
  return context;
} });

for (const [what, path, refused] of [
  ['an image', '/with-img', REFUSED_BY_ADDRESS],
  ['a stylesheet', '/with-stylesheet', REFUSED_BY_ADDRESS],
  ['a script', '/with-script', REFUSED_BY_ADDRESS],
  ['a fetch', '/with-fetch', REFUSED_BY_ADDRESS],
  ['a WebSocket', '/with-websocket', REFUSED],
]) {
  test(`real Chromium: archiveUrl refuses a page that received ${what} from a private host`, { timeout: 60_000 }, async (t) => {
    const env = await chromiumAndServer(t);
    if (!env) return;
    const before = archived();
    await assert.rejects(archiveUrl(readsAfterPrivateAnswer(env), env.publicUrl(path)), refused);
    assert.deepEqual(archived(), before);
  });
}

test('real Chromium: archiveUrl archives a posting with public subresources and one the route guard aborted', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived().length;
  await archiveUrl(env.browser, env.publicUrl('/public-assets'));
  assert.equal(archived().length, before + 1);
  assert.equal(env.warned.mock.callCount(), 1, 'the image on the private name was aborted by the route guard');
});

test('real Chromium: a name the lookup calls public is refused when Chromium dialled a private address for it', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t, { realAddressRule: true });
  if (!env) return;
  const before = archived();
  await assert.rejects(archiveUrl(env.browser, env.publicUrl('/posting')), REFUSED_BY_ADDRESS);
  assert.deepEqual(archived(), before);
});

const socketGaveUp = (context, page) => new Promise((resolve) => {
  page.on('websocket', (socket) => { socket.on('socketerror', resolve); socket.on('close', resolve); });
});

test('real Chromium: archiveUrl refuses a page whose WebSocket to a private host sent only a close frame with a reason', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const errors = t.mock.method(console, 'error', () => {});
  const before = archived();
  const refusal = await archiveUrl(readsWhen(env, socketGaveUp), env.publicUrl('/with-closing-socket')).then(() => null, (err) => err);
  assert.match(refusal?.message ?? '', REFUSED);
  assert.deepEqual(env.privateHits, ['/close'], 'the private host answered the handshake');
  const printed = [env.logged, env.warned, errors].flatMap((mock) => mock.mock.calls.map((call) => call.arguments.join(' ')));
  assert.doesNotMatch([refusal.message, refusal.stack, ...printed].join('\n'), new RegExp(INTERNAL));
  assert.deepEqual(archived(), before);
});
