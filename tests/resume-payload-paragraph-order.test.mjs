import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToPayload } from '../lib/resume/to-payload.mjs';
import { payloadToDocx } from '../lib/resume/export/docx.mjs';
import { validatePayload } from '../lib/cv-payload-schema.mjs';

const repo = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

function payloadFor(description) {
  const data = parseResume(JSON.parse(readFileSync(repo('tests/fixtures/resume/sample.json'), 'utf8'))).data;
  const item = data.sections.experience.items[0];
  delete item.roles;
  Object.assign(item, { company: 'Orderly Co', position: 'Engineer', description });
  const { payload } = resumeToPayload(data);
  return { payload, entry: payload.experience.find((e) => e.company === 'Orderly Co') };
}

const MIXED = '<p>Lead-in.</p><ul><li>First bullet</li><li>Second bullet</li></ul><p>Between lists.</p><ul><li>Third bullet</li></ul><p>Closing note.</p>';
const IN_ORDER = ['Lead-in.', 'First bullet', 'Second bullet', 'Between lists.', 'Third bullet', 'Closing note.'];

const assertOrder = (text, label) => {
  const at = IN_ORDER.map((s) => text.indexOf(s));
  assert.ok(at.every((n) => n >= 0), `${label}: every piece is rendered (${at})`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), `${label}: pieces keep the cv.md order`);
};

function render(payload, dir, name, template) {
  const input = join(dir, `${name}.json`);
  const output = join(dir, `${name}.html`);
  writeFileSync(input, JSON.stringify(payload));
  execFileSync(process.execPath, [repo('build-cv-html.mjs'), input, output, template], { stdio: 'pipe' });
  return readFileSync(output, 'utf8');
}

test('a paragraph that follows bullets is carried with the number of bullets ahead of it', () => {
  const { payload, entry } = payloadFor(MIXED);
  assert.equal(entry.context, 'Lead-in.');
  assert.deepEqual(entry.bullets, ['First bullet', 'Second bullet', 'Third bullet']);
  assert.deepEqual(entry.paragraphs, [{ text: 'Between lists.', before: 2 }, { text: 'Closing note.', before: 3 }]);
  assert.deepEqual(validatePayload(payload, 'html'), { errors: [], warnings: [] });
});

test('a description with its paragraphs first carries no paragraphs field', () => {
  const { entry } = payloadFor('<p>Lead-in.</p><ul><li>Only bullet</li></ul>');
  assert.equal('paragraphs' in entry, false);
  assert.equal(entry.context, 'Lead-in.');
});

test('the HTML keeps the order through the shipped partials, the ATS partials and the built-in markup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-paragraph-order-'));
  try {
    const bare = join(dir, 'bare-template.html');
    copyFileSync(repo('templates/cv-template.html'), bare);
    const { payload } = payloadFor(MIXED);
    for (const [label, template] of [['partials', repo('templates/cv-template.html')], ['ats', repo('templates/ats/cv-template.ats.html')], ['built-in', bare]]) {
      const html = render(payload, dir, label, template);
      assertOrder(html, label);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a section partial without AFTER_BULLETS still renders every bullet and paragraph', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-paragraph-pack-'));
  try {
    const template = join(dir, 'cv-template.html');
    copyFileSync(repo('templates/cv-template.html'), template);
    mkdirSync(join(dir, 'sections'));
    writeFileSync(join(dir, 'sections', 'experience.html'), readFileSync(repo('templates/sections/experience.html'), 'utf8').replace('{{AFTER_BULLETS}}', ''));
    const html = render(payloadFor(MIXED).payload, dir, 'pack', template);
    for (const piece of IN_ORDER) assert.ok(html.includes(piece), `${piece} is rendered`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the DOCX keeps the order', async () => {
  const xml = strFromU8(unzipSync(new Uint8Array(await payloadToDocx(payloadFor(MIXED).payload)))['word/document.xml']);
  assertOrder(xml, 'docx');
});
