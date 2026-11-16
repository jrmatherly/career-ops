// An apply session's browser context is released on a failed open, when the page goes away before
// the handoff, and by a server-side expiry when nothing else closes it.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/apply-session-release.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
await import("../helpers/web-ts-alias-loader.mjs");
const stubUrl = new URL("../fixtures/playwright-launch-stub.mjs", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n){ if(s==="playwright-core") return {url:${JSON.stringify(stubUrl)},shortCircuit:true}; return n(s,c); }`)}`, import.meta.url);
const { setHostResolver } = await import("../../../liveness-browser.mjs");
const { openSession, closeSession, getSession } = await import("../../src/lib/apply/session.ts");
const { releasesOnPageHide } = await import("../../src/lib/apply/exit.mjs");
const restore = setHostResolver(async () => ["93.184.216.34"]);
after(() => { restore(); clearTimeout(globalThis.__coIdleTimer); globalThis.__coHeadedBrowser = undefined; globalThis.__applyCareerPage = undefined; });

const URL_ = "https://careers.example.com/jobs/1";
const EXPIRY_MS = 15 * 60_000;

/** A stubbed Chrome whose one page holds `fields`. `closed` gains an entry per context close. */
function stubBrowser({ fields = [], waitForTimeout = async () => {} } = {}) {
  const closed = [];
  const frame = { url: () => URL_, evaluate: async () => ({ title: "Role", url: URL_, fields }), waitForSelector: async () => null };
  const node = { count: async () => 0, getAttribute: async () => null, isVisible: async () => false, innerText: async () => "", click: async () => {}, first() { return this; }, or() { return this; } };
  const context = { route: async () => {}, routeWebSocket: async () => {}, setDefaultTimeout() {}, pages: () => [], newPage: async () => page, close: async () => { closed.push(true); } };
  const page = {
    url: () => URL_, context: () => context, mainFrame: () => frame, frames: () => [frame],
    goto: async () => ({ status: () => 200, headers: () => ({}) }), waitForLoadState: async () => {}, waitForTimeout,
    screenshot: async () => Buffer.from("x"), title: async () => "Role", evaluate: async () => null,
    locator: () => ({ first: () => node }), getByRole: () => node,
  };
  globalThis.__coHeadedBrowser = undefined;
  globalThis.__applyCareerPage = () => ({ isConnected: () => false, newContext: async () => context });
  return closed;
}

/** Replaces the global timers for one test and returns the pending session-expiry timers. */
function fakeTimers(t) {
  const timers = [];
  t.mock.method(globalThis, "setTimeout", (fn, ms) => {
    const timer = { fn, ms, cleared: false, unrefd: false, unref() { this.unrefd = true; return this; } };
    timers.push(timer);
    return timer;
  });
  // A real timer armed by an earlier test (the idle close) must still be cleared for real.
  const clearReal = globalThis.clearTimeout;
  t.mock.method(globalThis, "clearTimeout", (timer) => {
    if (timers.includes(timer)) timer.cleared = true;
    else clearReal(timer);
  });
  return () => timers.filter((x) => x.ms === EXPIRY_MS && !x.cleared);
}

const EMAIL = [{ id: "f1", label: "Email", type: "email", required: true }];

test("openSession closes its context when a page step throws", async () => {
  const closed = stubBrowser({ waitForTimeout: async () => { throw new Error("Target page, context or browser has been closed"); } });
  await assert.rejects(openSession(URL_), /has been closed/);
  assert.deepEqual(closed, [true]);
});

test("a session nothing closes is closed by its own expiry, with no further openSession call", async (t) => {
  const expiries = fakeTimers(t);
  const closed = stubBrowser({ fields: EMAIL });
  const opened = await openSession(URL_);
  assert.ok(getSession(opened.id), "the session is recorded");
  const [expiry] = expiries();
  assert.ok(expiry, "a 15-minute timer is armed when the session is recorded");
  assert.equal(expiries().length, 1);
  assert.equal(expiry.unrefd, true, "the timer must not hold the server process open");
  assert.deepEqual(closed, []);

  await expiry.fn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(closed, [true]);
  assert.equal(getSession(opened.id), undefined);
});

test("closing a session clears its expiry", async (t) => {
  const expiries = fakeTimers(t);
  const closed = stubBrowser({ fields: EMAIL });
  const opened = await openSession(URL_);
  assert.equal(expiries().length, 1);
  await closeSession(opened.id);
  assert.deepEqual(closed, [true]);
  assert.equal(expiries().length, 0);
});

test("the page going away releases the session in every state but the handoff", () => {
  for (const status of ["idle", "opening", "driving", "prefilling", "ready", "filling", "error"]) {
    assert.equal(releasesOnPageHide(status), true, status);
  }
  assert.equal(releasesOnPageHide("done"), false);
});

// apply-provider.tsx is a client component node cannot import; read its wiring, as apply-prefill-wiring.test.mjs does.
const provider = readFileSync(new URL("../../src/components/apply/apply-provider.tsx", import.meta.url), "utf8");
test("the provider decides on pagehide from the status at that moment", () => {
  assert.match(provider, /statusRef\.current = status;/);
  assert.match(provider, /if \(releasesOnPageHide\(statusRef\.current\)\) reset\(\);/);
  assert.match(provider, /addEventListener\("pagehide", release\)/);
  assert.match(provider, /removeEventListener\("pagehide", release\)/);
  assert.doesNotMatch(provider, /visibilitychange/);
});
