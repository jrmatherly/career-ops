import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
const [repo, work] = process.argv.slice(2);
const vol = `<div class="section">
    <div class="section-title">Volunteer</div>
    <div class="education-body"><div class="edu-item">
  <div class="edu-header"><div class="edu-title">Sample Nonprofit</div><div class="edu-year">2023 - Present</div></div>
  <div class="edu-desc">Provide IT and technical support for a local nonprofit, one line of description text for the fixture.</div>
</div></div></div>
`;
for (const n of ['A-base-as-drafted', 'D-compact-template', 'E-jake-template', 'F-modern-template', 'G-line-height-1.4']) {
  const html = readFileSync(`${work}/${n}.html`, 'utf8');
  if (!html.includes('<!-- END -->')) throw new Error(`${n}: no END marker`);
  const out = `${work}/${n}+vol`;
  writeFileSync(`${out}.html`, html.replace('<!-- END -->', `${vol}<!-- END -->`));
  const r = spawnSync('node', [`${repo}/generate-pdf.mjs`, `${out}.html`, `${out}.pdf`, '--format=letter', '--skip-fact-check', '--max-pages=9'], { env: { ...process.env, CAREER_OPS_ROOT: work }, encoding: 'utf8' });
  const pages = Number(/Pages:\s+(\d+)/.exec(r.stdout + r.stderr)?.[1]);
  const last = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), '-layout', `${out}.pdf`, '-'], { encoding: 'utf8' }).split('\n').filter((l) => l.trim()).length;
  console.log(n, '+volunteer → pages', pages, 'last-page lines', last);
}
