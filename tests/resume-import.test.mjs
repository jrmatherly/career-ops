import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { listTree } from '../lib/walk-tree.mjs';
import { detectFormat, importResume, ImportError } from '../lib/resume/import/detect.mjs';
import { parseResume } from '../lib/resume/schema.mjs';
import { absorb } from '../lib/resume/absorb.mjs';
import { resumeToCvMarkdown } from '../lib/resume/to-cv-md.mjs';

const CLI = fileURLToPath(new URL('../resume.mjs', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/resume/${name}`, import.meta.url));
const FIXTURES = { rr: 'sample.json', 'json-resume': 'json-resume.json', linkedin: 'linkedin.zip', docx: 'one-page.docx' };

function withRoot(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-import-')));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
});
const files = (root) => listTree(root).map((p) => p.slice(root.length + 1).replaceAll(sep, '/')).sort();

for (const [format, name] of Object.entries(FIXTURES)) {
  test(`${name} is detected as ${format} and imports to a valid resume that round-trips through cv.md`, () => {
    const buffer = readFileSync(fixture(name));
    assert.equal(detectFormat(buffer, name), format);
    const { data, review } = importResume(buffer, format);
    assert.equal(parseResume(data).ok, true);
    assert.equal(data.basics.name, format === 'rr' ? 'David Kowalski' : 'Morgan Testwell');
    assert.ok(review.sections.some((s) => /^(Work Experience|experience): \d+ item/.test(s)), review.sections.join('\n'));
    assert.deepEqual(review.leftover.filter((l) => !/^(basics\.customFields|picture\.url)/.test(l)), [], 'the import changes on its first absorb');
    const cv = resumeToCvMarkdown(data);
    const result = absorb(cv, data);
    assert.equal(result.lossless, true);
    assert.equal(result.report.added + result.report.removed + result.report.changed, 0);
  });
}

test('detectFormat tells a Word file from a LinkedIn export by the zip entries, not the name', () => {
  assert.equal(detectFormat(readFileSync(fixture('one-page.docx')), 'renamed.zip'), 'docx');
  assert.equal(detectFormat(readFileSync(fixture('linkedin.zip')), 'renamed.docx'), 'linkedin');
  assert.equal(detectFormat(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(fixture('json-resume.json'))]), 'bom.json'), 'json-resume', 'a UTF-8 BOM does not hide JSON');
  assert.equal(detectFormat(Buffer.from('{"metadata":{"layout":[[]]},"sections":{}}'), 'v4.json'), 'unknown');
  assert.equal(detectFormat(Buffer.from('hello'), 'notes.txt'), 'unknown');
});

test('linkedin maps Positions.csv rows to experience with structured dates', () => {
  const { data } = importResume(readFileSync(fixture('linkedin.zip')), 'linkedin');
  const [lumen, harbor, northfield] = data.sections.experience.items;
  assert.equal(lumen.company, 'Lumen Robotics');
  assert.equal(lumen.position, 'Staff Engineer');
  assert.deepEqual(lumen.dates, { start: '2021-03', end: null, present: true });
  assert.match(lumen.period, /^Mar 2021 . Present$/);
  assert.match(lumen.description, /<ul><li>.*motion-planning rewrite/);
  assert.deepEqual(harbor.dates, { start: '2017-06', end: '2021-02', present: false });
  assert.deepEqual(northfield.dates, { start: '2015', end: '2017', present: false });
  assert.equal(data.sections.education.items[0].school, 'Northfield Institute of Technology');
  assert.deepEqual(data.sections.skills.items.map((s) => s.name), ['C++', 'ROS 2', 'Distributed Systems']);
  assert.equal(data.sections.languages.items[0].level, 5);
  assert.equal(data.sections.certifications.items[0].issuer, 'Example Certification Board');
  for (const item of data.sections.experience.items) assert.match(item.id, /^[0-9a-f-]{36}$/);
});

test('json-resume fills work, education and the summary, and reads a current role as present', () => {
  const { data } = importResume(readFileSync(fixture('json-resume.json')), 'json-resume');
  assert.equal(data.sections.experience.items.length, 3);
  assert.deepEqual(data.sections.experience.items[0].dates, { start: '2021-03', end: null, present: true });
  assert.match(data.sections.experience.items[0].description, /^<p>Platform lead.*<\/p><ul><li>/);
  assert.equal(data.sections.education.items[0].degree, 'BSc in Computer Science');
  assert.equal(data.sections.skills.items[0].level, 5);
  assert.equal(data.basics.location, 'Portland, Oregon, US');
  assert.match(data.summary.content, /^<p>Robotics platform engineer/);
});

test('docx text yields the header, experience entries and skills', () => {
  const { data } = importResume(readFileSync(fixture('one-page.docx')), 'docx');
  assert.equal(data.basics.email, 'morgan.testwell@example.com');
  assert.deepEqual(data.sections.experience.items.map((i) => i.company), ['Lumen Robotics', 'Harbor Analytics']);
  assert.ok(data.sections.skills.items.length >= 3);
});

test('a corrupted zip and an empty JSON throw ImportError with a one-line message', () => {
  for (const [buffer, format] of [[Buffer.from('PK\x03\x04 not really a zip'), 'linkedin'], [Buffer.from('{}'), 'json-resume'], [Buffer.from('{"basics":{}}'), 'rr']]) {
    assert.throws(() => importResume(buffer, format), (err) => err instanceof ImportError && !err.message.includes('\n'), `${format} did not throw a one-line ImportError`);
  }
});

test('import without --confirm prints the review and writes nothing', () => withRoot((root) => {
  const dry = run(root, 'import', fixture('json-resume.json'), '--format', 'json-resume');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /experience: 3 item|Work Experience: 3 item/i);
  assert.match(dry.stdout, /Nothing written\. Add --confirm/);
  assert.deepEqual(files(root), []);
}));

test('confirm with an existing cv.md refuses without --replace-cv, and replaces it with a backup when given', () => withRoot((root) => {
  copyFileSync(fixture('cv-example-shape.md'), join(root, 'cv.md'));
  const before = readFileSync(join(root, 'cv.md'), 'utf8');
  const refused = run(root, 'import', fixture('linkedin.zip'), '--confirm');
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /--replace-cv/);
  assert.match(refused.stdout, /^--- cv\.md$/m, 'the diff against the existing cv.md is printed');
  assert.deepEqual(files(root), ['cv.md']);
  assert.equal(readFileSync(join(root, 'cv.md'), 'utf8'), before);

  const replaced = run(root, 'import', fixture('linkedin.zip'), '--confirm', '--replace-cv');
  assert.equal(replaced.status, 0, replaced.stdout + replaced.stderr);
  assert.deepEqual(files(root), ['cv.md', 'cv.md.bak', 'data/resume.json']);
  assert.equal(readFileSync(join(root, 'cv.md.bak'), 'utf8'), before);
  assert.match(readFileSync(join(root, 'cv.md'), 'utf8'), /^### Lumen Robotics -- Portland, Oregon$/m);
}));

test('an existing data/resume.json is refused without --replace-cv and backed up with it', () => withRoot((root) => {
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data/resume.json'), '{"orphan":"kept in the backup"}\n');
  const refused = run(root, 'import', fixture('json-resume.json'), '--confirm');
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /data\/resume\.json exists; add --replace-cv/);
  assert.match(refused.stdout, /data\/resume\.json exists; import would replace it/);
  assert.deepEqual(files(root), ['data/resume.json']);

  const replaced = run(root, 'import', fixture('json-resume.json'), '--confirm', '--replace-cv');
  assert.equal(replaced.status, 0, replaced.stdout + replaced.stderr);
  assert.deepEqual(files(root), ['cv.md', 'data/resume.json', 'data/resume.json.bak']);
  assert.equal(readFileSync(join(root, 'data/resume.json.bak'), 'utf8'), '{"orphan":"kept in the backup"}\n');
}));

test('confirm then absorb is lossless', () => withRoot((root) => {
  const written = run(root, 'import', fixture('json-resume.json'), '--confirm');
  assert.equal(written.status, 0, written.stdout + written.stderr);
  assert.deepEqual(files(root), ['cv.md', 'data/resume.json']);
  const json = readFileSync(join(root, 'data/resume.json'), 'utf8');
  assert.equal(JSON.parse(json).basics.name, 'Morgan Testwell');

  const absorbed = run(root, 'absorb', '--json');
  assert.equal(absorbed.status, 0, absorbed.stderr);
  const report = JSON.parse(absorbed.stdout);
  assert.equal(report.lossless, true);
  assert.equal(report.written, false, 'absorb finds nothing to change');
  assert.equal(report.added + report.removed + report.changed, 0);
  assert.equal(readFileSync(join(root, 'data/resume.json'), 'utf8'), json);
}));

test('a missing file and a bad --format are refused with exit 2 and 1', () => withRoot((root) => {
  const missing = run(root, 'import', join(root, 'nope.json'), '--confirm');
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /nope\.json: no such file/);
  assert.equal(run(root, 'import', fixture('json-resume.json'), '--format', 'pdf').status, 1);
  assert.deepEqual(files(root), []);
}));

test('a corrupted zip exits 2 with a one-line reason and writes nothing', () => withRoot((root) => {
  const corrupt = join(root, 'export.zip');
  writeFileSync(corrupt, Buffer.concat([readFileSync(fixture('linkedin.zip')).subarray(0, 400), Buffer.from('garbage')]));
  const result = run(root, 'import', corrupt, '--confirm');
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  assert.match(result.stderr, new RegExp(basename(corrupt)));
  assert.deepEqual(files(root), ['export.zip']);
  assert.equal(existsSync(join(root, 'data')), false);
}));
