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

const roundTrips = (md) => {
  const result = absorb(md, null);
  assert.deepEqual(result.report.unparsed, []);
  assert.equal(result.lossless, true);
  assert.equal(resumeToCvMarkdown(result.data), md);
  const stored = parseResume(JSON.parse(JSON.stringify(result.data)));
  assert.equal(resumeToCvMarkdown(stored.data), md, 'the layout survives a save');
  return result;
};

test('an Education entry with a blank line under its heading round-trips', () => {
  roundTrips(`${HEADER}## Education\n\n### Uni — City\n\n**BS**\n2010 – 2012\n`);
});

test('a bullet directly under an Education heading round-trips', () => {
  roundTrips(`${HEADER}## Education\n\n### Uni\n- GPA 4.0\n`);
});

test('a bullet or a lead line directly under the period line round-trips', () => {
  roundTrips(`${HEADER}## Education\n\n### MIT\n**BS**\n2010\n- BS, State University, City (2005)\n`);
  roundTrips(`${HEADER}## Education\n\n### MIT\n**BS**\n2010\nGraduated with honors.\n`);
});

test('Education written in the Work Experience shape round-trips, bullets included', () => {
  const { data } = roundTrips(`${HEADER}## Education\n\n### Uni — City\n\n**BS**\n2010 – 2012\n\n- GPA 4.0\n- Honors\n\n### Other — Town\n\n**MS**\n2013 – 2014\n`);
  assert.equal(data.sections.education.items.length, 2);
});

test('a file that reads cleanly is lossless or names a line that is not written back', () => {
  const bodies = [
    '## Education\n\n### Uni — City\n\n**BS**\n2010 – 2012\n\n### Other — Town\n**MS**\n2013 – 2014\n',
    '## Education\n\n### MIT\n**BS**\n2010\n- a\n\n### Other — Town\n**MS**\n2012\n\n- c\n',
    '## Education\n### Uni — City\n**BS**\n2010 – 2012\n',
    '## Education\n\n### Uni — City\n**BS**\n2010 – 2012\n### Other — Town\n**MS**\n2013 – 2014\n',
    '## Education\n\n### Uni — City\n**BS**\n2010 – 2012\n\ntext\n- b\n',
    '## Education\n\n### Uni — City\n**BS**\n2010 – 2012\n\n* b\n',
    '## Education\n\n### Uni — City\n**BS**\n2010 – 2012\n\n- a\n\n- b\n',
    '## Education\n\n### Uni — City\n**BS**\n2010 – 2012\n\nline one\nline two\n',
    '## Education\n\n### Uni — City\n**BS**\n2010 – 2012\n## Skills\n\n- **A:** b\n',
  ];
  for (const body of bodies) {
    const md = HEADER + body;
    const result = absorb(md, null);
    assert.ok(result.lossless || result.report.unparsed.length > 0, `silent loss: ${JSON.stringify(body)}`);
    for (const { line, text } of result.report.unparsed) assert.equal(md.split('\n')[line - 1], text);
  }
});

test('a mixed-shape section names the first entry that departs from the section layout', () => {
  const md = `${HEADER}## Education\n\n### Uni — City\n\n**BS**\n2010 – 2012\n\n### Other — Town\n**MS**\n2013 – 2014\n`;
  const { lossless, report } = absorb(md, null);
  assert.equal(lossless, false);
  assert.deepEqual(report.unparsed, [{ line: 11, text: '**MS**' }]);
});

test('an edited entry updates the stored item, and a new period orphans it', () => {
  const md = `${HEADER}## Education\n\n### Uni — City\n**BS Computer Science**\n2010 – 2012\n\nGraduated with honors.\n`;
  const first = absorb(md, null);
  const [before] = first.data.sections.education.items;

  const edited = md.replace('BS Computer Science', 'BSc Informatics').replace('with honors', 'first in class');
  const second = absorb(edited, first.data);
  const [item] = second.data.sections.education.items;
  assert.equal(second.lossless, true);
  assert.equal(second.report.changed, 1);
  assert.equal(second.report.added, 0);
  assert.deepEqual(second.report.orphans, []);
  assert.equal(second.data.sections.education.items.length, 1);
  assert.equal(item.id, before.id);
  assert.equal(item.degree, 'BSc Informatics');
  assert.equal(item.area, '');
  assert.equal(item.description, '<p>Graduated first in class.</p>');

  const third = absorb(edited.replace('2010 – 2012', '2010 – 2013'), second.data);
  assert.equal(third.report.added, 1);
  assert.deepEqual(third.report.orphans, [{ section: 'education', id: item.id, name: 'Uni' }]);
  assert.equal(third.report.removed, 1);
  assert.deepEqual(third.data.sections.education.items.map((i) => i.period), ['2010 – 2013', '2010 – 2012']);
  assert.equal(third.lossless, false);
  assert.deepEqual(third.report.unparsed, []);
});
