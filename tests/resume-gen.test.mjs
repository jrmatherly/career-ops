import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToCvMarkdown, flattenEntries } from '../lib/resume/to-cv-md.mjs';
import { parseCvExperience } from '../cv-title-check.mjs';
import { findExperienceSections, parseCompanyHeading } from '../lib/cv-markdown.mjs';

const sample = () => parseResume(JSON.parse(readFileSync(new URL('./fixtures/resume/sample.json', import.meta.url), 'utf8'))).data;

test('the sample yields every section heading', () => {
  const md = resumeToCvMarkdown(sample());
  for (const heading of ['Professional Summary', 'Work Experience', 'Projects', 'Education', 'Skills', 'Certifications', 'Awards', 'Publications', 'Languages', 'Interests', 'Volunteer', 'References', 'Earlier experience']) {
    assert.match(md, new RegExp(`^## ${heading}$`, 'm'), `missing ## ${heading}`);
  }
  assert.match(md, /^# CV -- David Kowalski$/m);
  assert.match(md, /^\*\*Email:\*\* david\.kowalski@email\.com$/m);
});

test('an experience entry has a company heading, a bold title line and a dates line', () => {
  const md = resumeToCvMarkdown(sample());
  assert.match(md, /^### Cascade Studios -- Seattle, WA\n\n\*\*Senior Game Developer\*\*\n.*Present\n\n- /m);
  assert.match(md, /^### Northwind Games -- Remote\n\n\*\*Lead Engineer\*\*\n2018 – 2020\n\n- Led a team of \*\*4\*\* on \[Project X\]\(https:\/\/x\.example\)$/m);
  assert.match(md, /^\*\*Engineer\*\*\n2016 – 2018\n\nJoined as the second hire\.\n\n- Built the build farm$/m);
  assert.match(md, /^### Secret Corp -- Seattle, WA$/m, 'a hidden item is still rendered');
});

test('cv-title-check and lib/cv-markdown find the same entry count as the flattened roles', () => {
  const data = sample();
  const md = resumeToCvMarkdown(data);
  const roles = flattenEntries(data.sections.experience.items).length;
  assert.equal(roles, 4);
  assert.equal(parseCvExperience(md).length, roles);
  assert.equal(findExperienceSections(md).flat().filter((line) => parseCompanyHeading(line) !== null).length, roles);
});
