import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { rmSync } from './helpers.mjs';
import { listTree } from '../lib/walk-tree.mjs';
import { detectFormat, importResume, ImportError } from '../lib/resume/import/detect.mjs';
import { extractDocxText } from '../lib/resume/import/docx-text.mjs';
import { parseResumeText } from '../lib/resume/import/plain-text.mjs';
import { parseJSONResume } from '../lib/resume/import/json-resume.mjs';
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
const zip = (entries) => Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v]))));
const docx = (paragraphs, extra = {}) => zip({
  '[Content_Types].xml': '<Types/>',
  'word/document.xml': `<w:document><w:body>${paragraphs.map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('')}<w:sectPr/></w:body></w:document>`,
  ...extra,
});
const csv = (header, ...rows) => [header, ...rows].join('\n') + '\n';

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
  assert.throws(() => detectFormat(Buffer.from('{"metadata":{"layout":[[]]},"sections":{}}'), 'v4.json'), /Reactive Resume v4 export/);
  assert.throws(() => detectFormat(Buffer.from('{"basics": {"name": "x",}}'), 'trailing-comma.json'), (e) => e instanceof ImportError && /not valid JSON/.test(e.message));
  assert.throws(() => detectFormat(Buffer.from('PK\x03\x04 broken'), 'export'), /not readable as a ZIP archive/);
  const wrapped = (name) => Buffer.from(JSON.stringify({ name: 'My resume', data: JSON.parse(readFileSync(fixture(name), 'utf8')) }));
  assert.equal(detectFormat(wrapped('json-resume.json'), 'archive.json'), 'json-resume');
  assert.equal(detectFormat(wrapped('sample.json'), 'archive.json'), 'rr');
  assert.equal(importResume(wrapped('sample.json'), 'rr').data.basics.name, 'David Kowalski');
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
  assert.equal(data.sections.skills.items.length, 4);
});

test('a corrupted zip and an empty JSON throw ImportError with a one-line message', () => {
  for (const [buffer, format] of [[Buffer.from('PK\x03\x04 not really a zip'), 'linkedin'], [Buffer.from('{}'), 'json-resume'], [Buffer.from('{"basics":{}}'), 'rr']]) {
    assert.throws(() => importResume(buffer, format), (err) => err instanceof ImportError && !err.message.includes('\n'), `${format} did not throw a one-line ImportError`);
  }
});

test('a nameless import is refused instead of reading "CV --" back as the name', () => {
  const educationOnly = zip({ 'Education.csv': csv('School Name,Start Date,End Date,Notes,Degree Name', 'Northfield Institute of Technology,2010,2014,,BS') });
  assert.throws(() => importResume(educationOnly, 'linkedin'), (e) => e instanceof ImportError && /no candidate name/.test(e.message));
  assert.throws(() => importResume(Buffer.from('{"work":[{"name":"Acme","position":"Engineer"}]}'), 'json-resume'), /no candidate name/);
});

test('zip inflation caps stop a crafted archive with one line', () => {
  const big = new Uint8Array(6 * 1024 * 1024);
  assert.throws(() => importResume(zip({ 'Profile.csv': csv('First Name,Last Name', 'A,B'), 'Positions.csv': big }), 'linkedin'), (e) => e instanceof ImportError && /larger than 5 MB/.test(e.message) && !e.message.includes('\n'));
  assert.throws(() => importResume(zip({ 'word/document.xml': new Uint8Array(21 * 1024 * 1024) }), 'docx'), /too large/);
  assert.throws(() => importResume(zip({ 'readme.txt': 'hi' }), 'linkedin'), /needs Profile\.csv/);
});

test('linkedin reports the resume CSVs and rows it read past, and reads the primary email and phone', () => {
  const { data, review } = importResume(zip({
    'Profile.csv': csv('First Name,Last Name,Headline,Geo Location,Summary', 'Morgan,Testwell,Staff Engineer,Portland,'),
    'Positions.csv': csv('Company Name,Title,Description,Location,Started On,Finished On', 'Lumen Robotics,Staff Engineer,,Portland,Sept 2019,Present', ',Orphan Title,,,2015,2016'),
    'Languages.csv': csv('Name,Proficiency', 'German,Full professional proficiency', 'Klingon,constructor', 'French,B2'),
    'Email Addresses.csv': csv('Email Address,Confirmed,Primary,Updated On', 'old@example.com,Yes,No,2020', 'morgan.testwell@example.com,Yes,Yes,2024'),
    'PhoneNumbers.csv': csv('Extension,Number,Type', ',+1 503 555 0100,Mobile'),
    'Projects.csv': csv('Title,Description', 'Open Planner,A planner'),
    'Honors.csv': csv('Title', 'Prize'),
  }), 'linkedin');
  assert.deepEqual(data.sections.experience.items[0].dates, { start: '2019-09', end: null, present: true });
  assert.equal(data.sections.experience.items.length, 1);
  assert.deepEqual(data.sections.languages.items.map((l) => l.level), [4, 0, 3]);
  assert.equal(data.basics.email, 'morgan.testwell@example.com');
  assert.equal(data.basics.phone, '+1 503 555 0100');
  assert.deepEqual(review.leftover, ['Projects.csv: not read', 'Honors.csv: not read', 'Positions.csv: 1 row(s) without a company skipped']);
});

test('json-resume names a bad date in words and counts the entries its filters drop', () => {
  assert.throws(() => parseJSONResume({ basics: { name: 'X' }, work: [{ name: 'Acme', startDate: 'March 2020' }] }), /your role at Acme.*YYYY-MM-DD/);
  assert.throws(() => parseJSONResume({ basics: { name: 'X', email: 'nope' }, work: [{ name: 'Acme', startDate: 'March 2020' }] }), /Other problems: basics\.email/);
  const { review } = importResume(Buffer.from(JSON.stringify({ basics: { name: 'X' }, work: [{ startDate: '2020', summary: 'no employer' }, { name: 'Acme', position: 'Engineer' }], skills: [{ level: 'Expert' }] })), 'json-resume');
  assert.deepEqual(review.leftover, ['work: 1 entry without a name or position skipped', 'skills: 1 entry without a name skipped']);
});

test('docx text reads only the headers a section references, drops hidden and deleted runs, decodes entities', () => {
  const bytes = zip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Body line</w:t></w:r><w:r><w:t><<w:x>script></w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN</w:t></w:r></w:p><w:p><w:del><w:r><w:delText>DELETED</w:delText></w:r></w:del><w:r><w:t>Visible &amp; &#8211; ok</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>tabbed</w:t></w:r></w:p><w:sectPr><w:headerReference r:id="rId1"/></w:sectPr></w:body></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId1" Target="header1.xml"/><Relationship Id="rId9" Target="header2.xml"/></Relationships>',
    'word/header1.xml': '<w:hdr><w:p><w:r><w:t>Morgan Testwell</w:t></w:r></w:p></w:hdr>',
    'word/header2.xml': '<w:hdr><w:p><w:r><w:t>STALE HEADER</w:t></w:r></w:p></w:hdr>',
  });
  const text = extractDocxText(bytes);
  assert.match(text, /^Morgan Testwell\n/);
  assert.match(text, /Visible & – ok\ttabbed/);
  for (const gone of ['STALE HEADER', 'HIDDEN', 'DELETED', '<script']) assert.ok(!text.includes(gone), `${gone} leaked`);
});

test('plain text groups the section shapes the fixture does not use, and keeps header prose as the summary', () => {
  const data = parseResumeText([
    'Morgan Testwell', 'morgan.testwell@example.com | Portland, Oregon', 'Seasoned engineer who ships robotics platforms.', 'Leads small teams.', '',
    'EXPERIENCE', 'Acme Corp | Engineer 2020 – Present', '- shipped the planner', '',
    'AWARDS', 'Best Hacker, Hackathon Org 2019', '',
    'LINKS', 'GitHub https://github.com/mtestwell', '',
    'P R O J E C T S', 'Open Planner', '2019 – 2020', 'Alpha Tool', '2021 – 2022', '',
    'INTERESTING THINGS', 'Trail running', '',
    'SKILLS', Array.from({ length: 70 }, (_, i) => `Skill ${i}`).join(', '),
  ].join('\n'));
  const [job] = data.sections.experience.items;
  assert.deepEqual([job.company, job.position, job.location, job.period], ['Acme Corp', 'Engineer', '', '2020 – Present']);
  assert.equal(data.sections.awards.items[0].date, '2019');
  assert.equal(data.sections.profiles.items[0].website.url, 'https://github.com/mtestwell');
  assert.equal(data.sections.projects.items.length, 2, 'letter-spaced heading recognised');
  assert.equal(data.customSections[0].title, 'INTERESTING THINGS');
  assert.equal(data.sections.skills.items.length, 70, 'no 60-item cap');
  assert.equal(data.basics.headline, 'Seasoned engineer who ships robotics platforms.');
  assert.match(data.summary.content, /<p>Leads small teams\.<\/p>/);
});

test('a docx that cannot absorb back fails the gate: exit 3, nothing written, no backup', () => withRoot((root) => {
  const bad = docx(['Jane Example', 'jane@example.com', 'EXPERIENCE', 'Acme -- West | Eng | Austin', '2020 - 2021', '- did x']);
  assert.equal(importResume(bad, 'docx').gate.lossless, false);
  copyFileSync(fixture('cv-example-shape.md'), join(root, 'cv.md'));
  writeFileSync(join(root, 'bad.docx'), bad);
  const result = run(root, 'import', join(root, 'bad.docx'), '--confirm', '--replace-cv');
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /nothing written/);
  assert.deepEqual(files(root), ['bad.docx', 'cv.md']);
  assert.equal(readFileSync(join(root, 'cv.md'), 'utf8'), readFileSync(fixture('cv-example-shape.md'), 'utf8'));
}));

test('import without --confirm prints the review and writes nothing', () => withRoot((root) => {
  const dry = run(root, 'import', fixture('json-resume.json'), '--format', 'json-resume');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /experience: 3 item|Work Experience: 3 item/i);
  assert.match(dry.stdout, /cv\.md to be written:\n# CV -- Morgan Testwell/);
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

  writeFileSync(join(root, 'cv.md'), '# CV -- Marker\n');
  const again = run(root, 'import', fixture('linkedin.zip'), '--confirm', '--replace-cv');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  const stamped = files(root).filter((f) => /^cv\.md\.\d+\.bak$/.test(f));
  assert.equal(stamped.length, 1, 'a second backup gets a timestamped name');
  assert.equal(readFileSync(join(root, 'cv.md.bak'), 'utf8'), before, 'the first backup is kept');
  assert.equal(readFileSync(join(root, stamped[0]), 'utf8'), '# CV -- Marker\n');
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
