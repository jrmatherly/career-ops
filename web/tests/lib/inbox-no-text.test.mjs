import test from "node:test";
import assert from "node:assert/strict";
import { NO_TEXT_LABEL, NO_TEXT_REASONS, markNoText, noTextBadge } from "../../src/lib/inbox-no-text.mjs";
import { markGated } from "../../src/lib/inbox-pending.mjs";
import { NO_API_TEXT, NO_TEXT } from "../../../lib/evaluate-queue.mjs";

const jobs = [{ url: "https://example.com/a" }, { url: "https://example.com/b" }];
const skipped = (url, reason) => ({ url, state: "skipped", reason });

test("the Inbox reads the two reasons the drain writes", () => {
  assert.deepEqual(NO_TEXT_REASONS, [NO_API_TEXT, NO_TEXT]);
});
test("a row skipped for missing posting text is marked with its reason, by posting identity", () => {
  assert.deepEqual(markNoText(jobs, [skipped("https://example.com/a?utm_source=x", "no-api-text"), skipped("https://example.com/b", "no-text")]), [
    { url: "https://example.com/a", noText: true, noTextReason: "no-api-text" },
    { url: "https://example.com/b", noText: true, noTextReason: "no-text" },
  ]);
});
test("a row skipped for another reason, a row waiting for text and a row queued again are not marked", () => {
  const ledger = [skipped("https://example.com/a", "held-location"), { url: "https://example.com/b", state: "queued", reason: "no-text: the ATS API returned no text" }];
  assert.equal(markNoText(jobs, ledger), jobs);
  assert.equal(markNoText(jobs, [{ url: "https://example.com/a", state: "queued", reason: "fetcher-added" }]), jobs);
  assert.equal(markNoText(jobs, []), jobs);
});
test("a gated row keeps its gate beside the mark", () => {
  const ledger = [{ url: "https://example.com/a", state: "gated", reason: "dealbreaker" }, skipped("https://example.com/b", "no-text")];
  assert.deepEqual(markNoText(markGated(jobs, ledger), ledger), [{ url: "https://example.com/a", gated: "dealbreaker" }, { url: "https://example.com/b", noText: true, noTextReason: "no-text" }]);
});
test("the badge says why, and a job that is not marked has none", () => {
  assert.equal(NO_TEXT_LABEL, "Needs manual score");
  assert.deepEqual(noTextBadge({ noText: true, noTextReason: "no-api-text" }), {
    label: "Needs manual score", tone: "info",
    title: "Not scored automatically. No posting-text reader covered this job board when the drain tried it. Save it to the shortlist and score it yourself.",
  });
  const closed = "Not scored automatically. The job board returned no posting text in four tries over a day, so the posting may be closed. Open it before you score it.";
  assert.equal(noTextBadge({ noText: true, noTextReason: "no-text" }).title, closed);
  assert.equal(noTextBadge({ noText: true }).title, closed);
  assert.equal(noTextBadge({}), null);
});
test("a posting whose Inbox URL carries tracking or a trailing slash is still marked", () => {
  const listed = [{ url: "https://Example.com/a/?utm_source=scan" }];
  assert.deepEqual(markNoText(listed, [skipped("https://example.com/a", "no-api-text")]), [
    { url: "https://Example.com/a/?utm_source=scan", noText: true, noTextReason: "no-api-text" },
  ]);
});
