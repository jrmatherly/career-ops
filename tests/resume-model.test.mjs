import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { rmSync } from './helpers.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResume } from '../lib/resume/schema.mjs';
import { readResume, resumePath, writeResume } from '../lib/resume/model.mjs';

const sample = () => JSON.parse(readFileSync(new URL('./fixtures/resume/sample.json', import.meta.url), 'utf8'));

test('parses the sample', () => {
  const result = parseResume(sample());
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.data.basics.name, 'David Kowalski');
  assert.equal(result.data.sections.experience.items.length, 3);
  assert.deepEqual(result.data.careerOps.cvStyle.contactLines, []);
  assert.equal(result.data.careerOps.template, 'default');
});

test('rejects a non-object root', () => {
  for (const bad of [null, [], 'resume', 42]) {
    const result = parseResume(bad);
    assert.equal(result.ok, false, `accepted ${JSON.stringify(bad)}`);
    assert.ok(Array.isArray(result.issues) && result.issues.length > 0);
  }
});

test('self-heals a missing metadata.page with the default', () => {
  const input = sample();
  delete input.metadata.page;
  const result = parseResume(input);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.data.metadata.page.format, 'a4');
  assert.equal(result.data.metadata.page.locale, 'en-US');
});

test('keeps careerOps on the loose root', () => {
  const input = sample();
  input.careerOps = {
    cvSha256: 'abc', pendingCvSha256: 'def',
    cvStyle: { experienceHeading: 'Experience', summaryHeading: 'Summary', dash: '—', contactLines: ['Email'], sectionOrder: ['summary'] },
    template: 'ats', style: { accent_color: '#123456' },
  };
  const result = parseResume(input);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.data.careerOps, input.careerOps);
  assert.equal(parseResume({ ...input, careerOps: { ...input.careerOps, cvStyle: { ...input.careerOps.cvStyle, dash: '~' } } }).ok, false);
});

test('writeResume round-trips through readResume and leaves no lock', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-ops-resume-model-'));
  try {
    assert.equal(readResume(root), null);
    const { data } = parseResume(sample());
    await writeResume(root, data);
    assert.ok(readFileSync(resumePath(root), 'utf8').endsWith('}\n'));
    assert.deepEqual(readResume(root), data);
    assert.equal(existsSync(`${resumePath(root)}.lock`), false);
    writeFileSync(resumePath(root), '{"basics": 1}');
    assert.throws(() => readResume(root), /resume\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a section layout that is not a string is dropped, not thrown on', () => {
  const json = sample();
  json.sections.education.layout = { toString: null };
  const parsed = parseResume(json);
  assert.equal(parsed.ok, true);
  assert.equal('layout' in parsed.data.sections.education, false);
});
