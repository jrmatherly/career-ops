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
  const volunteer = data.sections.volunteer.items[0];
  volunteer.description = project.description;
  const award = data.sections.awards.items[0];
  award.description = project.description;
  const school = data.sections.education.items[0];
  school.description = project.description;
  const { unmapped } = resumeToJsonResume(data);
  for (const label of [entry.company, project.name, volunteer.organization, award.title]) {
    assert.ok(unmapped.includes(`${label} ${NOTE}`), `${label}: ${unmapped.join(' | ')}`);
  }
  assert.equal(unmapped.filter((u) => u.endsWith(NOTE)).length, 4, 'education exports bullets only, so it is not named');
});

test('an entry with its paragraphs before the bullets is not named', () => {
  const { unmapped } = resumeToJsonResume(fixture());
  assert.equal(unmapped.some((u) => u.endsWith(NOTE)), false, unmapped.join(' | '));
});
