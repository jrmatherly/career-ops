// An apply session's browser context is released on a failed open, and when the page goes away
// before the window has been handed to the user.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/apply-session-release.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
await import("../helpers/web-ts-alias-loader.mjs");
const stubUrl = new URL("../fixtures/playwright-launch-stub.mjs", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n){ if(s==="playwright-core") return {url:${JSON.stringify(stubUrl)},shortCircuit:true}; return n(s,c); }`)}`, import.meta.url);
const { setHostResolver } = await import("../../../liveness-browser.mjs");
const { openSession } = await import("../../src/lib/apply/session.ts");
const restore = setHostResolver(async () => ["93.184.216.34"]);
after(() => { restore(); clearTimeout(globalThis.__coIdleTimer); globalThis.__coHeadedBrowser = undefined; globalThis.__applyCareerPage = undefined; });

test("openSession closes its context when a page step throws", async () => {
  const closed = [];
  const url = "https://careers.example.com/jobs/1";
  const frame = { url: () => url, evaluate: async () => ({ title: "", fields: [] }), waitForSelector: async () => null };
  const node = { count: async () => 0, getAttribute: async () => null, isVisible: async () => false, innerText: async () => "", click: async () => {}, first() { return this; }, or() { return this; } };
  const context = { route: async () => {}, routeWebSocket: async () => {}, setDefaultTimeout() {}, pages: () => [], newPage: async () => page, close: async () => { closed.push(true); } };
  const page = {
    url: () => url, context: () => context, mainFrame: () => frame, frames: () => [frame],
    goto: async () => ({ status: () => 200, headers: () => ({}) }), waitForLoadState: async () => {},
    waitForTimeout: async () => { throw new Error("Target page, context or browser has been closed"); },
    screenshot: async () => Buffer.from("x"), title: async () => "Role", evaluate: async () => null,
    locator: () => ({ first: () => node }), getByRole: () => node,
  };
  globalThis.__applyCareerPage = () => ({ isConnected: () => false, newContext: async () => context });
  await assert.rejects(openSession(url), /has been closed/);
  assert.deepEqual(closed, [true]);
});

// apply-provider.tsx is a client component node cannot import; read its wiring, as apply-prefill-wiring.test.mjs does.
const provider = readFileSync(new URL("../../src/components/apply/apply-provider.tsx", import.meta.url), "utf8");
const count = (re) => (provider.match(re) ?? []).length;

test("the page going away releases the session unless its window was handed off", () => {
  assert.match(provider, /const release = \(\) => \{\s*if \(!windowHandedOff\.current\) reset\(\);\s*\};/);
  assert.match(provider, /addEventListener\("pagehide", release\)/);
  assert.match(provider, /removeEventListener\("pagehide", release\)/);
  assert.doesNotMatch(provider, /visibilitychange/);
});

test("a handoff is recorded from the fill response and from the agent's fill", () => {
  assert.match(provider, /if \(d\.handedOff\) \{\s*windowHandedOff\.current = true;/);
  assert.match(provider, /if \(result\.status === "done" && result\.filled\) windowHandedOff\.current = true;/);
});

test("a handoff outlives the status moving to filling, ready or error", () => {
  // Only giving up the session forgets the handoff: once in open, once in reset, each beside the session id.
  assert.equal(count(/windowHandedOff\.current = false;/g), 2);
  assert.equal(count(/sessionId\.current = null;\s*windowHandedOff\.current = false;/g), 2);
  assert.equal(count(/sessionId\.current = null;/g), 2);
  assert.doesNotMatch(provider, /statusRef/);
});
