import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToCvMarkdown } from '../lib/resume/to-cv-md.mjs';
import { absorb } from '../lib/resume/absorb.mjs';

const fixture = () => parseResume(JSON.parse(readFileSync(new URL('./fixtures/resume/sample.json', import.meta.url), 'utf8'))).data;
const DESCRIPTION = '<p>Ran the tools team.</p><ul><li><p>Shipped the asset pipeline</p></li><li><p>Cut build times in half</p></li></ul><p>Left to found Larkspur Labs.</p>';

function withTrailingParagraph() {
  const data = fixture();
  const entry = data.sections.experience.items.find((i) => !i.roles?.length);
  entry.description = DESCRIPTION;
  return { data, entry };
}

test('a paragraph after the bullets is written after them in cv.md', () => {
  const { data } = withTrailingParagraph();
  const md = resumeToCvMarkdown(data);
  assert.ok(
    md.includes('Ran the tools team.\n\n- Shipped the asset pipeline\n- Cut build times in half\n\nLeft to found Larkspur Labs.'),
    `cv.md keeps the description order:\n${md}`,
  );
});

test('absorbing that cv.md back keeps the order with no edits', () => {
  const { data, entry } = withTrailingParagraph();
  const { data: out, report, lossless } = absorb(resumeToCvMarkdown(data), data);
  assert.equal(lossless, true);
  assert.equal(report.changed, 0, 'no entry reported as changed');
  assert.deepEqual(report.unparsed, []);
  assert.equal(out.sections.experience.items.find((i) => i.id === entry.id).description, DESCRIPTION);
});

test('a hand-added paragraph after the bullets is stored after the list', () => {
  const { data, entry } = withTrailingParagraph();
  const before = '<p>Ran the tools team.</p><ul><li><p>Shipped the asset pipeline</p></li><li><p>Cut build times in half</p></li></ul>';
  entry.description = before;
  const md = resumeToCvMarkdown(data).replace('- Cut build times in half\n', '- Cut build times in half\n\nLeft to found Larkspur Labs.\n');
  const { data: out, report, lossless } = absorb(md, data);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  assert.equal(out.sections.experience.items.find((i) => i.id === entry.id).description, DESCRIPTION);
});
