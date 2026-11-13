import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeToCvMarkdown } from '../lib/resume/to-cv-md.mjs';
import { absorb } from '../lib/resume/absorb.mjs';

const entry = (body) => `# CV — Alex Example

## Volunteer

### Example Food Bank
2023 – Present

${body}
`;
const volunteer = (data) => data.sections.volunteer.items[0];

test('a ### Volunteer entry written paragraph, bullets, paragraph, bullets keeps that order', () => {
  const md = entry('Provide IT support for a local nonprofit.\n\n- Set up the donor database\n\nLater ran the weekend shift.\n\n- Trained six new volunteers');
  const { data, report, lossless } = absorb(md, null);
  assert.equal(lossless, true);
  assert.deepEqual(report.unparsed, []);
  assert.equal(
    volunteer(data).description,
    '<p>Provide IT support for a local nonprofit.</p><ul><li><p>Set up the donor database</p></li></ul><p>Later ran the weekend shift.</p><ul><li><p>Trained six new volunteers</p></li></ul>',
  );
  assert.equal(resumeToCvMarkdown(data), md);
});

test('a hand-added paragraph after a Volunteer entry\'s bullets is stored after the list', () => {
  const { data: stored } = absorb(entry('Provide IT support for a local nonprofit.\n\n- Set up the donor database'), null);
  const md = entry('Provide IT support for a local nonprofit.\n\n- Set up the donor database\n\nLater ran the weekend shift.');
  const { data, report, lossless } = absorb(md, stored);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  assert.equal(
    volunteer(data).description,
    '<p>Provide IT support for a local nonprofit.</p><ul><li><p>Set up the donor database</p></li></ul><p>Later ran the weekend shift.</p>',
  );
  assert.equal(resumeToCvMarkdown(data), md);
});

test('moving a Volunteer entry\'s trailing paragraph above its bullets, with no other edit, is stored', () => {
  const { data: stored } = absorb(entry('Provide IT support.\n\n- Set up the donor database\n\nLater ran the weekend shift.'), null);
  const md = entry('Provide IT support.\n\nLater ran the weekend shift.\n\n- Set up the donor database');
  const { data, report, lossless } = absorb(md, stored);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  assert.equal(volunteer(data).description, '<p>Provide IT support.</p><p>Later ran the weekend shift.</p><ul><li><p>Set up the donor database</p></li></ul>');
});
