import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { ownRootEnv, rmSync } from './helpers.mjs';
import { absorb } from '../lib/resume/absorb.mjs';
import { importResume } from '../lib/resume/import/detect.mjs';
import { parseJSONResume } from '../lib/resume/import/json-resume.mjs';
import { resumeToPayload } from '../lib/resume/to-payload.mjs';
import { payloadToDocx } from '../lib/resume/export/docx.mjs';
import { resumeToJsonResume } from '../lib/resume/export/json-resume.mjs';

const CLI = fileURLToPath(new URL('../resume.mjs', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/resume/${name}`, import.meta.url));
const SAMPLE = fixture('sample.json');
const sampleData = () => importResume(readFileSync(SAMPLE), 'rr').data;

function withRoot(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-export-')));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  env: ownRootEnv({ CAREER_OPS_ROOT: root }),
});
const documentXml = (buffer) => strFromU8(unzipSync(new Uint8Array(buffer))['word/document.xml']);
const withoutCareerOps = ({ careerOps, ...rest }) => rest;
const withoutIds = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v)));
const companies = (data) => data.sections.experience.items.map((i) => i.company);

test('resume-export: payloadToDocx writes the name, every company and the headings in payload order', async () => {
  const data = sampleData();
  const { payload } = resumeToPayload(data);
  const xml = documentXml(await payloadToDocx(payload));
  assert.ok(xml.includes(data.basics.name), 'name present');
  for (const entry of payload.experience) assert.ok(xml.includes(entry.company.replace(/&/g, '&amp;')), `company ${entry.company}`);
  const HEADINGS = { summary: 'Summary', experience: 'Experience', education: 'Education', projects: 'Projects', skills: 'Skills', interests: 'Interests', awards: 'Awards', certifications: 'Certifications' };
  const keys = Object.keys(payload).filter((k) => HEADINGS[k]);
  assert.ok(keys.length >= 6, 'sample fills most sections');
  const positions = keys.map((k) => xml.indexOf(`<w:t xml:space="preserve">${HEADINGS[k]}</w:t>`));
  assert.ok(positions.every((p) => p >= 0), `every heading present: ${positions}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'headings in payload order');
});

test('resume-export: payloadToDocx refuses a payload section it has no layout for', async () => {
  await assert.rejects(payloadToDocx({ lang: 'en', candidate: { name: 'A' }, languages: ['x'] }), /languages/);
});

test('resume-export: CLI export docx --out writes a Word zip with the name', () => withRoot((root) => {
  const out = join(root, 'cv.docx');
  const r = run(root, 'export', 'docx', '--in', SAMPLE, '--out', out);
  assert.equal(r.status, 0, String(r.stderr));
  assert.match(String(r.stderr), /not in the DOCX: languages/);
  assert.ok(documentXml(readFileSync(out)).includes('David Kowalski'));
}));

test('resume-export: CLI export rr-json reimports to the same data, without careerOps', () => withRoot((root) => {
  const out = join(root, 'rr.json');
  const r = run(root, 'export', 'rr-json', '--in', SAMPLE, '--out', out);
  assert.equal(r.status, 0, String(r.stderr));
  const buffer = readFileSync(out);
  assert.equal('careerOps' in JSON.parse(buffer), false);
  assert.deepEqual(withoutCareerOps(importResume(buffer, 'rr').data), withoutCareerOps(sampleData()));
}));

test('resume-export: rr-json with --hide exits 1', () => withRoot((root) => {
  assert.equal(run(root, 'export', 'rr-json', '--in', SAMPLE, '--hide', 'experience').status, 1);
  assert.equal(run(root, 'export', 'rr-json', '--in', SAMPLE, '--hide-item', 'x').status, 1);
}));

test('resume-export: json-resume parses with the importer and round-trips the fixture', () => {
  const d1 = importResume(readFileSync(fixture('json-resume.json')), 'json-resume').data;
  const { document } = resumeToJsonResume(d1);
  assert.equal(document.$schema, 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json');
  assert.doesNotThrow(() => parseJSONResume(document));
  const d2 = importResume(Buffer.from(JSON.stringify(document)), 'json-resume').data;
  assert.deepEqual(withoutIds(withoutCareerOps(d2)), withoutIds(withoutCareerOps(d1)));
});

test('resume-export: json-resume keeps a lone year and the profile link text through an import', () => {
  const cv = readFileSync(fixture('cv-example-shape.md'), 'utf8');
  const { document } = resumeToJsonResume(absorb(cv, null).data);
  const { generated } = importResume(Buffer.from(JSON.stringify(document)), 'json-resume');
  assert.match(generated, /- MS Computer Science, UT Austin \(2018\)$/m, 'a graduation year does not turn into an ongoing range');
  assert.match(generated, /^\*\*LinkedIn:\*\* linkedin\.com\/in\/alexchen$/m, 'profile shows its link text, not the network name');
});

test('resume-export: json-resume of the RR sample parses with the importer and lists custom sections it cannot carry', () => {
  const data = sampleData();
  data.customSections.push({ ...structuredClone(data.customSections[0]), id: 'cover', type: 'cover-letter', title: 'Cover note', items: [{ id: 'c1', hidden: false, recipient: '', content: '<p>Hi</p>' }] });
  const { document, unmapped } = resumeToJsonResume(data);
  assert.doesNotThrow(() => parseJSONResume(document));
  assert.deepEqual(unmapped, ['Cover note']);
  const custom = data.customSections[0];
  assert.ok(document.work.some((w) => w.name === custom.items[0].company), 'custom experience merged into work');
});

test('resume-export: json-resume leaves a hidden picture out', () => {
  const data = sampleData();
  assert.equal(resumeToJsonResume(data).document.basics.image, data.picture.url);
  data.picture.hidden = true;
  assert.equal('image' in resumeToJsonResume(data).document.basics, false);
});

test('resume-export: --hide experience and --hide-item leave entries out of DOCX and JSON Resume', () => withRoot((root) => {
  const data = sampleData();
  const names = companies(data);
  const docx = join(root, 'cv.docx');
  const json = join(root, 'cv.json');
  assert.equal(run(root, 'export', 'docx', '--in', SAMPLE, '--hide', 'experience', '--out', docx).status, 0);
  assert.equal(run(root, 'export', 'json-resume', '--in', SAMPLE, '--hide', 'experience', '--out', json).status, 0);
  const xml = documentXml(readFileSync(docx));
  const work = (JSON.parse(readFileSync(json, 'utf8')).work ?? []).map((w) => w.name);
  for (const name of names) {
    assert.ok(!xml.includes(name), `${name} not in DOCX`);
    assert.ok(!work.includes(name), `${name} not in work`);
  }

  const [first] = data.sections.experience.items;
  assert.equal(run(root, 'export', 'docx', '--in', SAMPLE, '--hide-item', first.id, '--out', docx).status, 0);
  assert.equal(run(root, 'export', 'json-resume', '--in', SAMPLE, '--hide-item', first.id, '--out', json).status, 0);
  assert.ok(!documentXml(readFileSync(docx)).includes(first.company));
  const kept = JSON.parse(readFileSync(json, 'utf8')).work.map((w) => w.name);
  assert.ok(!kept.includes(first.company));
  assert.ok(kept.includes(names[1]), 'other entries stay');
}));

test('resume-export: docx to a pipe writes the zip bytes to stdout', () => withRoot((root) => {
  const r = run(root, 'export', 'docx', '--in', SAMPLE);
  assert.equal(r.status, 0, String(r.stderr));
  assert.ok(documentXml(r.stdout).includes('David Kowalski'));
}));
