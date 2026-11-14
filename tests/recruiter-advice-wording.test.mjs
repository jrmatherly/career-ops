import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf-8');
const mode = (rel) => root(`modes/${rel}`);

test('the CV mode asks for a relevant summary, not a keyword-dense one', () => {
  const pdf = mode('pdf.md');
  assert.ok(!pdf.includes('keyword-dense'));
  assert.ok(!pdf.includes('Distributed JD keywords'));
  assert.ok(pdf.includes('Use the JD\'s own term where it truthfully names what the candidate did'));
  assert.ok(pdf.includes('NEVER invent'));
});

test('the English cover and evaluation modes do not ask for a metric in every bullet', () => {
  for (const rel of ['cover.md', 'oferta.md']) {
    const text = mode(rel);
    assert.ok(!text.includes('at least one metric per bullet'), rel);
    assert.ok(!/impact( sentence)? with metric/.test(text), rel);
  }
  assert.ok(!mode('pdf.md').includes('Another quantified-impact bullet'));
  assert.ok(!mode('latex.md').includes('Another bullet with quantified impact'));
  assert.ok(mode('interview.md').includes('**scope** (team size, volume over a stated period, budget, locations)'));
  assert.ok(mode('add.md').includes('in plain words where it does not'));
});

test('no copy of the CV rules still says to inject keywords', () => {
  const copies = ['modes/pdf.md', 'modes/text.md', 'modes/latex.md', 'modes/latex-tex.md', 'batch/batch-prompt.md', 'openai-tailor.mjs', 'web/src/lib/run-prompts.mjs'];
  assert.ok(!root('web/src/lib/run-prompts.mjs').includes('keyword injection'));
  for (const rel of copies) assert.ok(!/inject(ing|ed)?\b[^.\n]{0,24}keywords|keywords injected|keyword-inject|distribut\w* (JD )?keywords|keywords distributed/i.test(root(rel)), rel);
});

test('the bullet heuristics cover plain words, number hygiene, scope and acronyms', () => {
  const h = mode('heuristics/recruiter-side.md');
  for (const phrase of [
    'say what changed in plain words',
    'percentage points',
    'the period it covers',
    'Scope is not a result',
    'Spell out an acronym',
    'In an unattended run, leave the detail out',
  ]) assert.ok(h.includes(phrase), phrase);
});

test('interview prep gives points and evidence, and one shape per kind of answer', () => {
  const prep = mode('interview-prep.md');
  assert.ok(!prep.includes('draft candidate-specific answers'));
  for (const phrase of [
    'By default, give the candidate points and evidence, not a script',
    'A behavioral question takes a story in STAR order',
    'Where the candidate is now',
    'If the candidate was laid off, say so in one sentence',
    'one question that tests each deal-breaker',
  ]) assert.ok(prep.includes(phrase), phrase);
});

test('practice feedback checks the common behavioural mistakes by name', () => {
  const practice = mode('interview/practice.md');
  for (const phrase of [
    '**The behavioral checks.**',
    'what they would do, not what they did',
    'every sentence says "we"',
    'answered a different question',
    'background that raises a new concern',
  ]) assert.ok(practice.includes(phrase), phrase);
  assert.ok(mode('interview/plan.md').includes('run `node story-coverage.mjs`'));
});
