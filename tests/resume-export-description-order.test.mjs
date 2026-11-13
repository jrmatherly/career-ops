import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToJsonResume } from '../lib/resume/export/json-resume.mjs';

const fixture = () => parseResume(JSON.parse(readFileSync(new URL('./fixtures/resume/sample.json', import.meta.url), 'utf8'))).data;
const NOTE = '(a paragraph after its bullets moves above them)';

test('the JSON Resume export names an entry whose paragraph after the bullets it cannot keep in place', () => {
  const data = fixture();
  const entry = data.sections.experience.items.find((i) => !i.roles?.length);
  entry.description = '<p>Ran the tools team.</p><ul><li><p>Shipped the asset pipeline</p></li></ul><p>Left to found Larkspur Labs.</p>';
  const project = data.sections.projects.items[0];
  project.description = '<ul><li><p>Open source</p></li></ul><p>Archived since.</p>';
  const { unmapped } = resumeToJsonResume(data);
  assert.ok(unmapped.includes(`${entry.company} ${NOTE}`), unmapped.join(' | '));
  assert.ok(unmapped.includes(`${project.name} ${NOTE}`), unmapped.join(' | '));
});

test('an entry with its paragraphs before the bullets is not named', () => {
  const { unmapped } = resumeToJsonResume(fixture());
  assert.equal(unmapped.some((u) => u.endsWith(NOTE)), false, unmapped.join(' | '));
});
