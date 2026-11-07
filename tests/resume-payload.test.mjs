import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToPayload } from '../lib/resume/to-payload.mjs';
import { KNOWN_ROOT_KEYS, validatePayload } from '../lib/cv-payload-schema.mjs';

const sample = () => parseResume(JSON.parse(readFileSync(new URL('./fixtures/resume/sample.json', import.meta.url), 'utf8'))).data;

test('passes validatePayload with no warnings and no errors', () => {
  const { payload } = resumeToPayload(sample());
  assert.deepEqual(validatePayload(payload, 'html'), { errors: [], warnings: [] });
  for (const key of Object.keys(payload)) assert.ok(KNOWN_ROOT_KEYS.html.includes(key), `unknown root key ${key}`);
  assert.equal(payload.candidate.name, 'David Kowalski');
  assert.deepEqual(payload.candidate.github, { url: 'https://github.com/dkowalski-dev', display: 'github.com/dkowalski-dev' });
  assert.deepEqual(payload.candidate.portfolio, { url: 'https://davidkowalski.games', display: 'davidkowalski.games' });
  assert.ok(payload.summary.startsWith('Passionate game developer'), 'summary is plain text');
  assert.equal(payload.lang, 'en');
  assert.equal('page_format' in payload, false, 'page_format left to build-cv-html.mjs by default');
  assert.equal(resumeToPayload(sample(), { page_format: 'letter' }).payload.page_format, 'letter');
});

test('a two-role experience yields two entries', () => {
  const { payload } = resumeToPayload(sample());
  const northwind = payload.experience.filter((e) => e.company === 'Northwind Games');
  assert.deepEqual(northwind.map((e) => e.role), ['Lead Engineer', 'Engineer']);
  assert.deepEqual(northwind[0].bullets, ['Led a team of 4 on Project X']);
  assert.equal(northwind[1].context, 'Joined as the second hire.');
  assert.equal('context' in northwind[0], false);
});

test('a hidden item is absent', () => {
  const { payload } = resumeToPayload(sample());
  assert.equal(payload.experience.some((e) => e.company === 'Secret Corp'), false);
  const data = sample();
  const id = data.sections.skills.items[0].id;
  assert.equal(resumeToPayload(data, { hideItems: [id] }).payload.skills.some((s) => s.category === 'Unity Engine'), false);
});

test("hide: ['skills'] drops the section", () => {
  const { payload } = resumeToPayload(sample(), { hide: ['skills'] });
  assert.equal('skills' in payload, false);
  const data = sample();
  data.sections.projects.hidden = true;
  assert.equal('projects' in resumeToPayload(data).payload, false);
});

test('unmapped lists the slotless sections', () => {
  const { unmapped } = resumeToPayload(sample());
  assert.deepEqual([...unmapped].sort(), ['languages', 'publications', 'references', 'volunteer']);
  assert.deepEqual(resumeToPayload(sample(), { hide: ['languages'] }).unmapped.includes('languages'), false);
});
