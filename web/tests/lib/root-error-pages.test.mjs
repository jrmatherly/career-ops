// A refused data root is an expected error: production strips a thrown server
// error's message before it reaches an error boundary, so the root layout must
// render the refusal itself. Everything else falls to the root error page,
// which has to use Next's retry prop to re-run the server render.
//
// Run from web/: node --test tests/lib/root-error-pages.test.mjs

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../src/app/${rel}`, import.meta.url)), "utf8");

test("the root layout renders the data-root refusal in place of the page", () => {
  const layout = read("layout.tsx");
  assert.match(layout, /dataRootRefusal\(careerOpsRoot\)/);
  assert.match(layout, /<DataRootRefused\b/);
});

test("the root error page is a client boundary whose Try again calls retry", () => {
  const page = read("error.tsx");
  assert.match(page, /^"use client";/);
  assert.match(page, /onClick=\{\(\)\s*=>\s*retry\(\)\}/);
  assert.match(page, /error\.digest/);
});

test("the report error page does not claim the report file exists", () => {
  assert.doesNotMatch(read("pipeline/[id]/error.tsx"), /The file is there/);
});
