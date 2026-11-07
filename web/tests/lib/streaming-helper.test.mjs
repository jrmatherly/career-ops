// tests/lib/streaming-helper.test.mjs — settled() on a page stub; the live proof
// is tests/browser-suites.mjs under BROWSER_SUITES_SEGMENT_DELAY_MS.
import assert from "node:assert/strict";
import { test } from "node:test";
import { settled } from "../helpers/streaming.mjs";

function pageStub() {
  const calls = [];
  return {
    calls,
    async waitForFunction(fn, arg) {
      calls.push("wait");
      this.predicate = fn;
      this.arg = arg;
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
  };
}

test("settled runs the action before waiting and returns its value", async () => {
  const page = pageStub();
  const result = await settled(page, async () => { page.calls.push("action"); return "response"; });
  assert.equal(result, "response");
  assert.deepEqual(page.calls, ["action", "wait"]);
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

test("a timed-out wait reports readyState and the hidden ids, with the timeout as cause", async () => {
  const timeout = Object.assign(new Error("Timeout 10000ms exceeded"), { name: "TimeoutError" });
  const page = {
    async waitForFunction() { throw timeout; },
    async evaluate(fn) { return { readyState: "interactive", ids: ["S:0"] }; },
  };
  await assert.rejects(settled(page, async () => {}), (err) => {
    assert.match(err.message, /within 10000 ms; readyState interactive, still hidden: S:0/);
    assert.equal(err.cause, timeout);
    return true;
  });
});

test("a wait that fails for another reason is rethrown unchanged", async () => {
  const closed = new Error("Target page, context or browser has been closed");
  const page = { async waitForFunction() { throw closed; }, async evaluate() { assert.fail("must not read the page"); } };
  await assert.rejects(settled(page, async () => {}), (err) => err === closed);
});

test("an unreadable page is named as such instead of reported as having nothing hidden", async () => {
  const page = {
    async waitForFunction() { throw Object.assign(new Error("Timeout"), { name: "TimeoutError" }); },
    async evaluate() { throw new Error("Execution context was destroyed"); },
  };
  await assert.rejects(settled(page, async () => {}), /page unreadable \(Execution context was destroyed\)/);
});
