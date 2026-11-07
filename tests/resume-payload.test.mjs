import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('hiding one role id keeps the other role of that company', () => {
  const data = sample();
  const [lead, engineer] = data.sections.experience.items.find((i) => i.company === 'Northwind Games').roles;
  const northwind = resumeToPayload(data, { hideItems: [engineer.id] }).payload.experience.filter((e) => e.company === 'Northwind Games');
  assert.deepEqual(northwind.map((e) => e.role), [lead.position]);
});

test('each entry carries its ResumeData path, indexed before hidden items are dropped', () => {
  const data = sample();
  data.sections.experience.items[0].hidden = true;
  data.sections.experience.items[1].roles[0].id = 'lead';
  const { payload } = resumeToPayload(data, { hideItems: ['lead'] });
  assert.equal(payload.candidate.path, 'basics');
  assert.deepEqual(payload.experience.map((e) => [e.company, e.path]), [
    ['Northwind Games', 'sections.experience.items.1.roles.1'],
    ['Pixel Forge Interactive', 'customSections.0.items.0'],
    ['Mobile Games Studio', 'customSections.0.items.1'],
  ]);
  assert.equal(payload.education[0].path, 'sections.education.items.0');
  assert.equal(payload.skills[1].path, 'sections.skills.items.1');
  assert.deepEqual(validatePayload(payload, 'html'), { errors: [], warnings: [] });
});

test('build-cv-html emits each path as data-resume-path, and the same render without paths differs by nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-payload-html-'));
  try {
    const render = (payload, name) => {
      const input = join(dir, `${name}.json`);
      const output = join(dir, `${name}.html`);
      writeFileSync(input, JSON.stringify(payload));
      execFileSync(process.execPath, [fileURLToPath(new URL('../build-cv-html.mjs', import.meta.url)), input, output], { stdio: 'pipe' });
      return readFileSync(output, 'utf8');
    };
    const { payload } = resumeToPayload(sample());
    const html = render(payload, 'with');
    const expected = [payload.candidate.path, ...['experience', 'projects', 'education', 'certifications', 'awards', 'skills'].flatMap((k) => payload[k].map((e) => e.path))];
    assert.deepEqual([...html.matchAll(/ data-resume-path="([^"]*)"/g)].map((m) => m[1]).sort(), expected.sort());
    const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'path' ? undefined : v)));
    assert.equal(html.replace(/ data-resume-path="[^"]*"/g, ''), render(strip(payload), 'without'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
