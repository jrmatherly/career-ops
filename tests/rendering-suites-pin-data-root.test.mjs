// tests/rendering-suites-pin-data-root.test.mjs — a suite that renders in-process pins a data root.
//
// generate-pdf.mjs resolves its data root when it is imported, and every
// successful render appends a row to that root's data/pdf-index.tsv. A suite
// that imports it without tests/helpers.mjs, and without setting
// CAREER_OPS_ROOT itself, writes that row into the developer's checkout
// whenever it runs outside test-all.mjs.
//
// Top-level suites only: tests/mjs-files.test.mjs creates and deletes fixture
// directories under tests/ while suites run in parallel.
//
// Run:  node --test tests/rendering-suites-pin-data-root.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, stripJsComments } from './helpers.mjs';

const SELF = 'rendering-suites-pin-data-root.test.mjs';
const namesRenderer = (source) => {
  return /\b(?:renderHtmlToPdf|renderBatch)\s*\(/.test(stripJsComments(source));
};
const pinsDataRoot = (source) => {
  const code = stripJsComments(source);
  return /['"](?:\.\.?\/)+helpers\.mjs['"]/.test(code) || /\bCAREER_OPS_ROOT\b/.test(code);
};

test('the two checks read code, not comments', () => {
  assert.equal(namesRenderer('await renderHtmlToPdf(html, out, {});'), true);
  assert.equal(namesRenderer('// see renderHtmlToPdf(html) in generate-pdf.mjs\nconst x = 1;'), false);
  assert.equal(pinsDataRoot("import { rmSync } from './helpers.mjs';"), true);
  assert.equal(pinsDataRoot("import '../helpers.mjs';"), true);
  assert.equal(pinsDataRoot('const env = { ...process.env, CAREER_OPS_ROOT: dir };'), true);
  assert.equal(pinsDataRoot('// CAREER_OPS_ROOT is inherited from the runner\nconst x = 1;'), false);
});

test('every suite that renders in-process pins a data root', () => {
  const dir = join(ROOT, 'tests');
  const rendering = readdirSync(dir)
    .filter((name) => name.endsWith('.test.mjs') && name !== SELF)
    .filter((name) => namesRenderer(readFileSync(join(dir, name), 'utf-8')));
  assert.ok(rendering.length >= 10, `only ${rendering.length} rendering suites found: the pattern has gone blind`);
  const unpinned = rendering.filter((name) => !pinsDataRoot(readFileSync(join(dir, name), 'utf-8')));
  assert.deepEqual(unpinned, [], 'import ./helpers.mjs before importing the renderer');
});
