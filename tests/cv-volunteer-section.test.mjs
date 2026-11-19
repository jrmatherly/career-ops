import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionKey } from '../generate-pdf.mjs';
import { describeSpawn, exitedNonZero } from './helpers/describe-spawn.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/cv-long-single-employer.json'), 'utf8'));
const smallPayload = {
  lang: 'en',
  candidate: { name: 'Sample Candidate', email: 'candidate@example.com', location: 'Springfield, ST' },
  experience: [{
    company: 'Example Retail Group', role: 'Platform Engineer', location: 'Springfield, ST', dates: 'Jan 2020 - Present',
    bullets: [
      'Moved 40 services onto a shared Kubernetes cluster in 6 months.',
      'Cut monthly cloud spend by 20% with workload tagging and budgets.',
    ],
  }],
  volunteer: [{
    org: 'Sample Nonprofit', location: 'Springfield, ST', dates: '2023 - Present',
    description: 'Mentors 12 early-career engineers each year and runs a 2-day workshop for high school students.',
  }],
};

const dir = mkdtempSync(join(tmpdir(), 'cv-volunteer-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
let n = 0;

function build(payload, template) {
  const input = join(dir, `in-${++n}.json`);
  const output = join(dir, `out-${n}.html`);
  writeFileSync(input, JSON.stringify(payload));
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', input, output, ...(template ? [template] : [])], { cwd: ROOT, encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* a failed build prints no report */ }
  return { status: r.status, html: r.status === 0 ? readFileSync(output, 'utf8') : '', report, stderr: r.stderr, output, spawn: r };
}

test('volunteer renders under its own heading after Skills in the base template', () => {
  const { html } = build(fixture);
  assert.match(html, /class="section-title">Volunteer Experience</);
  assert.ok(html.indexOf('Sample Nonprofit') > html.indexOf('class="section-title">Skills<'));
  assert.match(html, /2023 - Present/);
});

test('no volunteer key leaves no Volunteer heading', () => {
  const { volunteer, ...rest } = fixture;
  assert.doesNotMatch(build(rest).html, /Volunteer Experience/);
});

test('the ATS pack renders volunteer too', () => {
  assert.match(build(fixture, 'templates/ats/cv-template.ats.html').html, /Sample Nonprofit/);
});

test('a template without the slot warns and names the template', () => {
  const { report } = build(fixture, 'templates/cv-template.compact.html');
  assert.ok(report.warnings.some((w) => /volunteer/i.test(w) && /compact/i.test(w)), JSON.stringify(report.warnings));
});

test('a volunteer entry without org fails the build', () => {
  const r = build({ ...fixture, volunteer: [{ description: 'x' }] });
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'a volunteer entry without org must fail the build'));
  assert.match(r.stderr, /volunteer/i);
});

test('cv.md volunteer headings map to the volunteer section key', () => {
  for (const h of ['Volunteer', 'Volunteer Experience', 'Volunteering', 'Community Involvement']) assert.equal(sectionKey(h), 'volunteer', h);
});

test('volunteer text backed by cv.md passes the fact gate', () => {
  const { output, status, stderr } = build(smallPayload);
  assert.equal(status, 0, stderr);
  const r = spawnSync(process.execPath, ['verify-cv-facts.mjs', output, '--source', 'tests/fixtures/cv-volunteer-source.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
