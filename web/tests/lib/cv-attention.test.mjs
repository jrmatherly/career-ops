import assert from "node:assert/strict";
import { test } from "node:test";
import { attentionSummary, attentionText, lineRange } from "../../src/lib/cv-attention.mjs";

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
    detail: "Education (line 68) and Volunteer (line 85) could not be read, so they may be missing from tailored CVs.",
  });
  assert.deepEqual(attentionText({ count: 1, sections: [{ name: "Header", line: 3 }], firstLine: 3 }), {
    title: "1 section needs attention.",
    detail: "Header (line 3) could not be read, so it may be missing from tailored CVs.",
  });
});
