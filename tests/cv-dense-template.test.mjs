import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { atsLint, resolveTemplate } from '../cv-templates.mjs';
import { toolRequired } from './required-tools.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/cv-long-single-employer.json'), 'utf8'));
const densePath = resolveTemplate('cv', 'dense');
const CAN_RENDER = await chromium.launch({ headless: true }).then((b) => b.close().then(() => true), () => false);
const browserSkip = !toolRequired('browser') && !CAN_RENDER && 'Chromium cannot launch';

const dir = mkdtempSync(join(tmpdir(), 'cv-dense-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
let n = 0;

function build(payload, template) {
  const input = join(dir, `in-${++n}.json`);
  const output = join(dir, `out-${n}.html`);
  writeFileSync(input, JSON.stringify(payload));
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', input, output, ...(template ? [template] : [])], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { html: readFileSync(output, 'utf8'), output };
}

// The real renderer, with the temp dir as its data root so the PDF may be written there.
function pageCount(template) {
  const { output } = build(fixture, template);
  const r = spawnSync(process.execPath, ['generate-pdf.mjs', output, output.replace(/\.html$/, '.pdf'), '--max-pages=99', '--skip-fact-check'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_PDF_SHARED: '' }, timeout: 60_000,
  });
  const m = /Pages: (\d+)/.exec(r.stdout);
  assert.ok(m, r.stdout + r.stderr);
  return Number(m[1]);
}

test('dense passes the ATS lint with no finding', () => {
  const lint = atsLint(densePath, 'cv');
  assert.ok(lint.ok, lint.error);
  assert.deepEqual(lint.findings, []);
});

test('no px text size, no letter-spacing, no text-transform, no web font, no space-between', () => {
  const css = readFileSync(densePath, 'utf8');
  assert.doesNotMatch(css, /font-size:\s*[\d.]+px/);
  assert.doesNotMatch(css, /letter-spacing|text-transform|@font-face|space-between/);
});

test('every role is a title line followed by one employer, location and dates line', () => {
  const { html } = build(fixture, densePath);
  for (const job of fixture.experience) {
    const meta = `<span class="job-company">${job.company}</span>, <span class="job-location">${job.location}</span> | <span class="job-period">${job.dates}</span>`;
    assert.ok(html.includes(`<div class="job-role">${job.role}</div>`), job.role);
    assert.ok(html.includes(meta), job.dates);
  }
});

test('headings are the common set and there is no competencies heading', () => {
  const { html } = build(fixture, densePath);
  for (const h of ['Professional Summary', 'Work Experience', 'Education', 'Skills', 'Volunteer Experience']) assert.ok(html.includes(`class="section-title">${h}<`), h);
  // The fold keeps "Core Competencies:" as a Skills row label; only a section heading is ruled out.
  assert.ok(!html.includes('class="section-title">Core Competencies<'));
});

test('the fixture renders to 2 pages in dense', { skip: browserSkip }, () => {
  assert.equal(pageCount(densePath), 2);
});

test('the same fixture is 3 pages in the base template', { skip: browserSkip }, () => {
  assert.equal(pageCount(), 3);
});

test('body text in dense computes to 9.5pt', { skip: browserSkip }, async () => {
  const { output } = build(fixture, densePath);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(output).href);
    const px = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.job li')).fontSize));
    assert.ok(Math.abs(px - 9.5 * 4 / 3) < 0.05, `${px}px`);
  } finally {
    await browser.close();
  }
});

test('every competency reaches the dense CV', () => {
  const { html } = build(fixture, densePath);
  for (const c of fixture.competencies) assert.ok(html.includes(c.replace(/&/g, '&amp;')), c);
});

test('dense renders Interests, and strips Interests and Volunteer when empty', () => {
  const withInterests = build({ ...fixture, interests: ['Trail running', 'Chess'] }, densePath).html;
  assert.ok(withInterests.includes('class="section-title">Interests<'));
  assert.ok(withInterests.includes('Trail running'));
  const { volunteer, ...bare } = fixture;
  const stripped = build(bare, densePath).html;
  assert.ok(!stripped.includes('class="section-title">Interests<'));
  assert.ok(!stripped.includes('class="section-title">Volunteer Experience<'));
  assert.ok(stripped.includes('class="section-title">Skills<'));
});
