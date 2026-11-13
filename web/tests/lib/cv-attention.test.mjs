import assert from "node:assert/strict";
import { test } from "node:test";
import { attentionSummary, attentionText, lineRange, lossyNotice } from "../../src/lib/cv-attention.mjs";

const cv = (headings) => {
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
  for (const [n, text] of Object.entries(headings)) lines[Number(n) - 1] = text;
  return lines.join("\n");
};
const unparsed = (...lines) => ({ unparsed: lines.map((line) => ({ line, text: `line ${line}` })) });

test("unreadable lines group under the nearest ## heading above them", () => {
  const md = cv({ 1: "# Name", 60: "## Education", 80: "## Volunteer" });
  assert.deepEqual(attentionSummary(unparsed(70, 68, 71, 85, 86, 88), md), {
    count: 2,
    sections: [{ name: "Education", line: 68 }, { name: "Volunteer", line: 85 }],
    firstLine: 68,
  });
});

test("two sections with the same heading are counted apart", () => {
  const md = cv({ 1: "# Name", 20: "## Projects", 60: "## Projects" });
  assert.deepEqual(attentionSummary(unparsed(25, 26, 65), md), {
    count: 2,
    sections: [{ name: "Projects", line: 25 }, { name: "Projects", line: 65 }],
    firstLine: 25,
  });
});

test("nothing unreadable needs no attention", () => {
  assert.deepEqual(attentionSummary({ unparsed: [] }, cv({ 60: "## Education" })), { count: 0, sections: [], firstLine: null });
  assert.deepEqual(attentionSummary(null, ""), { count: 0, sections: [], firstLine: null });
});

test("a line above the first heading belongs to the Header", () => {
  const md = cv({ 1: "# Name", 60: "## Education" });
  assert.deepEqual(attentionSummary(unparsed(3, 62), md), {
    count: 2,
    sections: [{ name: "Header", line: 3 }, { name: "Education", line: 62 }],
    firstLine: 3,
  });
});

test("lineRange spans one line of the text, without its newline", () => {
  const text = "# Name\n\n## Education\nBS, State";
  assert.deepEqual(lineRange(text, 3), [8, 20]);
  assert.equal(text.slice(...lineRange(text, 4)), "BS, State");
  assert.deepEqual(lineRange(text, 99), [text.length, text.length]);
});

test("the banner text names each section with its first unreadable line", () => {
  assert.deepEqual(attentionText({ count: 2, sections: [{ name: "Education", line: 68 }, { name: "Volunteer", line: 85 }], firstLine: 68 }), {
    title: "2 sections need attention.",
    detail: "Education (line 68) and Volunteer (line 85) could not be read back cleanly, so they may be missing from tailored CVs.",
  });
  assert.deepEqual(attentionText({ count: 1, sections: [{ name: "Header", line: 3 }], firstLine: 3 }), {
    title: "1 section needs attention.",
    detail: "Header (line 3) could not be read back cleanly, so it may be missing from tailored CVs.",
  });
});

test("a lossy read with no unreadable line says cv.md would be rewritten, and never claims unreadable lines", () => {
  const notice = lossyNotice({ unparsed: [], orphans: [] });
  assert.deepEqual(notice, {
    title: "cv.md was read, but it would be rewritten differently.",
    detail: "Rebuilding it from the structured editor would not give back the same file. Open the structured editor to see why.",
    blocked: "Export is off because cv.md would not be rebuilt exactly as written. Open the structured editor to see why.",
  });
  assert.deepEqual(lossyNotice({}), notice);
  for (const text of Object.values(notice)) assert.doesNotMatch(text, /could not be read|unreadable/);
});

test("a lossy read names the orphaned entries", () => {
  const one = lossyNotice({ unparsed: [], orphans: [{ id: "a", company: "DataStartup Inc", position: "ML Engineer", period: "2018-2020" }] });
  assert.equal(one.detail, "The structured editor holds ML Engineer at DataStartup Inc, which no longer matches cv.md. Open the structured editor to resolve it.");
  assert.equal(one.blocked, "Export is off until the structured editor's entries match cv.md.");
  const two = lossyNotice({ orphans: [{ section: "projects", id: "p", name: "Side tool" }, { id: "b", company: "Acme" }] });
  assert.equal(two.detail, "The structured editor holds Side tool and Acme, which no longer match cv.md. Open the structured editor to resolve them.");
});

test("unreadable lines leave the lossy notice to the attention banner", () => {
  assert.equal(lossyNotice(unparsed(3)), null);
});
