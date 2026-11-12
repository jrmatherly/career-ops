import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToCvMarkdown } from '../lib/resume/to-cv-md.mjs';
import { absorb } from '../lib/resume/absorb.mjs';

const HEADER = '# CV — Alex Example\n\n';
const ENTRY_SECTIONS = `## Education

### Example State University — Springfield, IL
**Associate's - Business Administration**
Aug 2010 – May 2012

## Volunteer

### Example Food Bank
2023 – Present

Provide IT support for a local nonprofit.
`;

/** Every non-blank line of `md` survives a rewrite or is reported as unreadable. */
function assertNoLineDropped(md, { data, report, lossless }) {
  const rewritten = new Set(resumeToCvMarkdown(data).split('\n'));
  const unparsed = new Set(report.unparsed.map((u) => u.text));
  for (const line of md.split('\n')) {
    if (line.trim()) assert.ok(rewritten.has(line) || unparsed.has(line), `dropped: ${line}`);
  }
  if (report.unparsed.length) assert.equal(lossless, false);
}

test('heading-style Education and Volunteer entries absorb losslessly', () => {
  const md = HEADER + ENTRY_SECTIONS;
  const result = absorb(md, null);
  assert.deepEqual(result.report.unparsed, []);
  assert.equal(result.lossless, true);

  const { education, volunteer } = result.data.sections;
  assert.equal(education.layout, 'entries');
  assert.equal(education.items.length, 1);
  assert.equal(education.items[0].school, 'Example State University');
  assert.equal(education.items[0].location, 'Springfield, IL');
  assert.equal(education.items[0].degree, "Associate's - Business Administration");
  assert.equal(education.items[0].period, 'Aug 2010 – May 2012');

  assert.equal(volunteer.layout, 'entries');
  assert.equal(volunteer.items.length, 1);
  assert.equal(volunteer.items[0].organization, 'Example Food Bank');
  assert.equal(volunteer.items[0].period, '2023 – Present');
  assert.equal(volunteer.items[0].description, '<p>Provide IT support for a local nonprofit.</p>');

  assert.equal(resumeToCvMarkdown(result.data), md);
});

test('the entries layout survives a save and a second absorb changes nothing', () => {
  const md = HEADER + ENTRY_SECTIONS;
  const first = absorb(md, null);
  const stored = parseResume(JSON.parse(JSON.stringify(first.data)));
  assert.equal(stored.ok, true);
  assert.equal(stored.data.sections.education.layout, 'entries');
  assert.equal(resumeToCvMarkdown(stored.data), md);
  const second = absorb(md, stored.data);
  assert.equal(second.lossless, true);
  assert.equal(second.report.changed, 0);
  assert.equal(second.report.added, 0);
  assert.deepEqual(second.report.orphans, []);
  assert.deepEqual(second.data, first.data);
});

test('an Education entry followed by a bullet keeps the bullet', () => {
  const md = `${HEADER}## Education

### Example State University — Springfield, IL
**Associate's - Business Administration**
Aug 2010 – May 2012

- BS, State University, City (2005)
`;
  const result = absorb(md, null);
  assertNoLineDropped(md, result);
  assert.match(JSON.stringify(result.data.sections.education), /BS, State University, City \(2005\)/);
});

test('a bullet above the first Education entry is reported, never dropped', () => {
  const md = `${HEADER}## Education

- BS, State University, City (2005)

### Example State University — Springfield, IL
**Associate's - Business Administration**
Aug 2010 – May 2012
`;
  const result = absorb(md, null);
  assertNoLineDropped(md, result);
  assert.deepEqual(result.report.unparsed.map((u) => u.text), ['- BS, State University, City (2005)']);
  assert.equal(result.lossless, false);
});

test('a bold line in a Volunteer entry has no field and is reported', () => {
  const md = `${HEADER}## Volunteer

### Example Food Bank
**IT Volunteer**
2023 – Present
`;
  const result = absorb(md, null);
  assertNoLineDropped(md, result);
  assert.deepEqual(result.report.unparsed.map((u) => u.text), ['**IT Volunteer**']);
  assert.equal(result.data.sections.volunteer.items[0].period, '2023 – Present');
});

test('a section rewritten as bullets goes back to the list layout', () => {
  const first = absorb(HEADER + ENTRY_SECTIONS, null);
  const md = (HEADER + ENTRY_SECTIONS).replace(/### Example State[^]*?2012\n/, "- Associate's - Business Administration, Example State University, Springfield, IL (Aug 2010 – May 2012)\n");
  const result = absorb(md, first.data);
  assert.equal(result.lossless, true);
  assert.equal(result.report.added, 0);
  assert.equal('layout' in result.data.sections.education, false);
  assert.equal(result.data.sections.volunteer.layout, 'entries');
});

test('the bullet-only Education fixture absorbs with no layout key', () => {
  const md = readFileSync(new URL('./fixtures/resume/cv-example-shape.md', import.meta.url), 'utf8');
  const result = absorb(md, null);
  assert.equal(result.lossless, true);
  assert.equal(result.data.sections.education.items.length, 2);
  assert.equal('layout' in result.data.sections.education, false);
});
