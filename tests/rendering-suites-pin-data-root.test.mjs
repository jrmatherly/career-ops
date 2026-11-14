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
  const helpers = code.search(/['"](?:\.\.?\/)+helpers\.mjs['"]/);
  // A static import of the renderer above the helpers resolves the data root first.
  const renderer = code.search(/^import\b[^;]*generate-pdf\.mjs['"]/m);
  if (renderer >= 0) return helpers >= 0 && helpers < renderer;
  // Set, as an assignment or an env key for a child. Reading it pins nothing.
  return helpers >= 0 || /\bCAREER_OPS_ROOT\s*[:=](?!=)/.test(code);
};

test('the two checks read code, not comments', () => {
  assert.equal(namesRenderer('await renderHtmlToPdf(html, out, {});'), true);
  assert.equal(namesRenderer('// see renderHtmlToPdf(html) in generate-pdf.mjs\nconst x = 1;'), false);
  assert.equal(pinsDataRoot("import { rmSync } from './helpers.mjs';"), true);
  assert.equal(pinsDataRoot("import '../helpers.mjs';"), true);
  assert.equal(pinsDataRoot('const env = { ...process.env, CAREER_OPS_ROOT: dir };'), true);
  assert.equal(pinsDataRoot('// CAREER_OPS_ROOT is inherited from the runner\nconst x = 1;'), false);
  assert.equal(pinsDataRoot('const unused = process.env.CAREER_OPS_ROOT;'), false);
  assert.equal(pinsDataRoot("if (process.env.CAREER_OPS_ROOT === dir) run();"), false);
  assert.equal(pinsDataRoot('process.env.CAREER_OPS_ROOT = dir;'), true);
  assert.equal(pinsDataRoot("import './helpers.mjs';\nimport { renderBatch } from '../generate-pdf.mjs';"), true);
  assert.equal(pinsDataRoot("import { renderBatch } from '../generate-pdf.mjs';\nimport './helpers.mjs';"), false);
  assert.equal(pinsDataRoot("import { renderBatch } from '../generate-pdf.mjs';\nprocess.env.CAREER_OPS_ROOT = dir;"), false);
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
