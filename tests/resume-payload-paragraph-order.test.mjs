import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { rmSync } from './helpers.mjs';
import { parseResume } from '../lib/resume/schema.mjs';
import { bodyRuns, resumeToPayload } from '../lib/resume/to-payload.mjs';
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

test('a following paragraph with markup and no text is left out, so the payload still validates', () => {
  const { payload, entry } = payloadFor('<ul><li>Only bullet</li></ul><p><strong></strong></p>');
  assert.equal('paragraphs' in entry, false);
  assert.deepEqual(validatePayload(payload, 'html').errors, []);
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

test("a template pack's own experience partial keeps the order with no change to the pack", () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-paragraph-pack-'));
  try {
    const template = join(dir, 'cv-template.html');
    copyFileSync(repo('templates/cv-template.html'), template);
    mkdirSync(join(dir, 'sections'));
    copyFileSync(repo('templates/sections/experience.html'), join(dir, 'sections', 'experience.html'));
    const html = render(payloadFor(MIXED).payload, dir, 'pack', template);
    assertOrder(html, 'pack');
    assert.equal(html.match(/<li class="job-note" style="list-style: none">/g)?.length, 2, 'each following paragraph is one item with no marker');
    assert.equal(html.includes('class="job-context">Closing note.'), false, 'a following paragraph is not a context line');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the DOCX keeps the order', async () => {
  const xml = strFromU8(unzipSync(new Uint8Array(await payloadToDocx(payloadFor(MIXED).payload)))['word/document.xml']);
  assertOrder(xml, 'docx');
});

test('paragraphs listed out of order, or with a position that is not a count, still land where before says', () => {
  const runs = bodyRuns({ bullets: ['A', '', 'B'], paragraphs: [{ text: 'Later', before: 3 }, { text: 'Earlier', before: 1 }, { text: 'First', before: 'x' }, null, { before: 1 }] });
  assert.deepEqual(runs, [{ text: 'First' }, { bullets: ['A'] }, { text: 'Earlier' }, { bullets: ['B'] }, { text: 'Later' }]);
  assert.deepEqual(bodyRuns({ bullets: ['A', 'B'], paragraphs: [{ text: 'End', before: 99 }, { text: 'Start', before: -2 }] }), [{ text: 'Start' }, { bullets: ['A', 'B'] }, { text: 'End' }]);
  assert.deepEqual(bodyRuns({ bullets: ['A'] }), [{ bullets: ['A'] }]);
  assert.deepEqual(bodyRuns({}), []);
});

test('a malformed paragraphs value is a payload error, not a silently shorter CV', () => {
  const base = { company: 'Orderly Co', role: 'Engineer', bullets: ['A'] };
  const errorsFor = (paragraphs) => validatePayload({ experience: [{ ...base, paragraphs }] }, 'html').errors;
  for (const bad of [['a note'], [{ text: 'a note', before: '1' }], [{ text: '', before: 1 }], [{ before: 1 }], 'a note', [null]]) {
    assert.match(errorsFor(bad).join('\n'), /experience\[0\]: paragraphs must be an array/, JSON.stringify(bad));
  }
  assert.deepEqual(errorsFor([{ text: 'a note', before: 1 }]), []);
  assert.deepEqual(errorsFor([]), []);
});

test('a following paragraph is escaped, a role of a multi-role entry carries one, and the markdown output keeps the order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-paragraph-md-'));
  try {
    const data = parseResume(JSON.parse(readFileSync(repo('tests/fixtures/resume/sample.json'), 'utf8'))).data;
    const item = data.sections.experience.items.find((i) => i.roles?.length);
    item.roles[0].description = '<ul><li>Role bullet</li></ul><p>R&amp;D with &lt;partners&gt;.</p>';
    const { payload } = resumeToPayload(data);
    const entry = payload.experience.find((e) => e.company === item.company && e.role === item.roles[0].position);
    assert.deepEqual(entry.paragraphs, [{ text: 'R&D with <partners>.', before: 1 }]);
    const html = render(payload, dir, 'escaped', repo('templates/cv-template.html'));
    assert.ok(html.includes('<li class="job-note" style="list-style: none">R&amp;D with &lt;partners&gt;.</li>'));

    const input = join(dir, 'mixed.json');
    const output = join(dir, 'mixed.md');
    writeFileSync(input, JSON.stringify(payloadFor(MIXED).payload));
    execFileSync(process.execPath, [repo('build-cv-html.mjs'), input, '--markdown', output], { stdio: 'pipe' });
    assertOrder(readFileSync(output, 'utf8'), 'markdown');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a payload without paragraphs renders as it did before the field existed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-paragraph-same-'));
  try {
    const { payload } = payloadFor(MIXED);
    const without = JSON.parse(JSON.stringify(payload, (k, v) => (k === 'paragraphs' ? undefined : v)));
    for (const [label, template] of [['partials', repo('templates/cv-template.html')], ['compact', repo('templates/cv-template.compact.html')]]) {
      const withNotes = render(payload, dir, `with-${label}`, template).replace(/\n\s*<li class="job-note"[^>]*>[^<]*<\/li>/g, '');
      assert.equal(withNotes, render(without, dir, `without-${label}`, template), label);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
