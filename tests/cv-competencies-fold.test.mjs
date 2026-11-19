import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/cv-long-single-employer.json'), 'utf8'));
const SLOTLESS = '<!DOCTYPE html><html lang="{{LANG}}"><head><title>{{NAME}}</title></head><body>{{NAME}}{{EXPERIENCE}}{{EDUCATION}}\n<!-- SKILLS -->\n<div class="section"><div class="section-title">{{SECTION_SKILLS}}</div>{{SKILLS}}</div>\n<!-- END -->\n</body></html>';

const dir = mkdtempSync(join(tmpdir(), 'cv-fold-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const slotlessPath = join(dir, 'slotless.html');
writeFileSync(slotlessPath, SLOTLESS);
let n = 0;

function build(payload, template) {
  const input = join(dir, `in-${++n}.json`);
  const output = join(dir, `out-${n}.html`);
  writeFileSync(input, JSON.stringify(payload));
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', input, output, ...(template ? [template] : [])], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { html: readFileSync(output, 'utf8'), report: JSON.parse(r.stdout) };
}

test('competencies move into Skills when the template has no competencies slot', () => {
  const { html, report } = build(fixture, slotlessPath);
  for (const c of fixture.competencies) assert.ok(html.includes(c.replace(/&/g, '&amp;')), c);
  assert.ok(!report.warnings.some((w) => /competenc/i.test(w)), JSON.stringify(report.warnings));
});

test('the fold makes a Skills section when the payload has none', () => {
  const { skills, ...rest } = fixture;
  assert.match(build(rest, slotlessPath).html, /class="section-title">Skills</);
});

test('a template with the slot still renders the grid', () => {
  assert.match(build(fixture).html, /class="competency-tag"/);
});
