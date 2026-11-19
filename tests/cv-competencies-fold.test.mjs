import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The build runs in a temp data root so a developer's own profile or templates cannot change it.
const isolatedEnv = (root) => ({ ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '', CAREER_OPS_PROFILE: '', CAREER_OPS_TRACKER: '' });

function build(payload, template) {
  const input = join(dir, `in-${++n}.json`);
  const output = join(dir, `out-${n}.html`);
  writeFileSync(input, JSON.stringify(payload));
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', input, output, ...(template ? [template] : [])], { cwd: ROOT, encoding: 'utf8', env: isolatedEnv(dir) });
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

test('--markdown moves competencies into Skills when the template has no competencies slot', () => {
  const input = join(dir, `in-${++n}.json`);
  const output = join(dir, `out-${n}.md`);
  writeFileSync(input, JSON.stringify(fixture));
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', input, '--markdown', output, slotlessPath], { cwd: ROOT, encoding: 'utf8', env: isolatedEnv(dir) });
  assert.equal(r.status, 0, r.stderr);
  const md = readFileSync(output, 'utf8');
  for (const c of fixture.competencies) assert.ok(md.includes(c), c);
  assert.ok(!JSON.parse(r.stdout).warnings.some((w) => /competenc/i.test(w)), r.stdout);
});

test('a locked Skills section is not folded into, so the build passes and warns about competencies', () => {
  const root = mkdtempSync(join(dir, 'locked-'));
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, 'config', 'profile.yml'), 'cv:\n  locked_sections: [skills]\n');
  writeFileSync(join(root, 'cv.md'), `# Sample\n\n## Skills\n\n${fixture.skills.map((s) => `- **${s.category}:** ${s.items}`).join('\n')}\n`);
  const input = join(root, 'in.json');
  const output = join(root, 'out.html');
  writeFileSync(input, JSON.stringify(fixture));
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', input, output, join(ROOT, 'templates/dense/cv-template.dense.html')], { cwd: ROOT, encoding: 'utf8', env: isolatedEnv(root) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).warnings.some((w) => /competenc/i.test(w)), r.stdout);
});
