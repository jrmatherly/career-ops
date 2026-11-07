// tests/lib/streaming-helper.test.mjs — settled() runs a navigation, then waits
// until React's streaming reveal has removed the hidden server copy
// (`body > div[hidden][id^="S:"]`) and the document is complete. Plain
// node:test on a page stub; the live proof is tests/browser-suites.mjs under
// BROWSER_SUITES_SEGMENT_DELAY_MS (docs/superpowers/research/2026-11-07-web-browser-suite-flakes/REPORT.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { settled } from "../helpers/streaming.mjs";

function pageStub() {
  const calls = [];
  return {
    calls,
    predicate: null,
    async waitForFunction(fn, arg, options) {
      calls.push("wait");
      this.predicate = fn;
      this.arg = arg;
      this.options = options;
    },
  };
}

function fakeDocument(hiddenIds, readyState = "complete") {
  return {
    readyState,
    querySelector(selector) {
      assert.equal(selector, 'body > div[hidden][id^="S:"]');
      return hiddenIds.length ? { id: hiddenIds[0] } : null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, 'body > div[hidden][id^="S:"]');
      return hiddenIds.map((id) => ({ id }));
    },
  };
}

test("settled runs the action before waiting and returns its value", async () => {
  const page = pageStub();
  const result = await settled(page, async () => { page.calls.push("action"); return "response"; });
  assert.equal(result, "response");
  assert.deepEqual(page.calls, ["action", "wait"]);
  assert.equal(page.options.timeout, 10_000);
});

test("the predicate is true only once no hidden S: div remains and the document is complete", async () => {
  const page = pageStub();
  await settled(page, async () => {});
  const run = (doc) => { globalThis.document = doc; try { return page.predicate(page.arg); } finally { delete globalThis.document; } };
  assert.equal(run(fakeDocument([])), true);
  assert.equal(run(fakeDocument(["S:0"])), false);
  assert.equal(run(fakeDocument([], "loading")), false);
});

test("a rejected action rejects settled without waiting", async () => {
  const page = pageStub();
  await assert.rejects(settled(page, async () => { throw new Error("net::ERR_CONNECTION_REFUSED"); }), /ERR_CONNECTION_REFUSED/);
  assert.deepEqual(page.calls, []);
});
