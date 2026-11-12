import assert from "node:assert/strict";
import { test } from "node:test";

import { documentTitle } from "../../src/lib/document-titles.mjs";

const applications = [
  { n: "7", company: "Contoso", role: "Staff Engineer", report: "[7](../reports/007-contoso-2026-10-01.md)" },
  {
    n: "42",
    company: "Fabrikam",
    role: "Engineering Manager, Platform",
    report: "[42](../reports/042-fabrikam-2026-11-02.md)",
  },
];

test("a document with a tracked report is titled by company and role", () => {
  const doc = { filename: "cv-jane-042-fabrikam.pdf", reportId: "42" };
  assert.deepEqual(documentTitle(doc, applications), {
    title: "Fabrikam",
    subtitle: "Engineering Manager, Platform",
    trackerN: "42",
  });
});

test("a zero-padded report id matches the same row", () => {
  const doc = { filename: "cv.pdf", reportId: "042" };
  assert.equal(documentTitle(doc, applications).trackerN, "42");
});

test("a document with no report keeps its filename", () => {
  const doc = { filename: "cover-letter.pdf", reportId: null };
  assert.deepEqual(documentTitle(doc, applications), { title: "cover-letter.pdf", subtitle: "", trackerN: null });
});

test("a report no tracker row links keeps its filename", () => {
  const doc = { filename: "cv-old.pdf", reportId: "99" };
  assert.deepEqual(documentTitle(doc, applications), { title: "cv-old.pdf", subtitle: "", trackerN: null });
});
