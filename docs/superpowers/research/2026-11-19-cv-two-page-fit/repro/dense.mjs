// Prototype: the owner's Reactive Resume metrics applied to career-ops HTML, employer kept on every role.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
const [repo, work] = process.argv.slice(2);
const css = (family, pt, lh) => `<style>
@page { margin: 36pt 40pt !important; }
:root { --font-family: ${family}; --font-size: ${pt}pt; --line-height: ${lh}; --page-margin: 0; --item-gap: 7pt; }
body, li, .summary-text, .skill-item, .skill-category, .job-context, .job-role, .edu-title, .edu-desc, .edu-org { font-size: ${pt}pt !important; line-height: ${lh} !important; font-family: ${family} !important; }
.job-company { font-size: ${pt + 0.5}pt !important; }
.job-period, .edu-year, .job-location, .edu-location { font-size: ${pt - 1}pt !important; }
.job-location { display: none; }
.header { margin-bottom: 6pt !important; } .header h1, .header-name { font-size: 18pt !important; }
.section { margin-bottom: 6pt !important; } .section-title { margin-bottom: 3pt !important; padding-bottom: 1pt !important; font-size: 10.5pt !important; }
.job ul { margin-top: 1pt !important; } .job li { margin-bottom: 1pt !important; }
.competency-tag { padding: 1pt 5pt !important; font-size: ${pt - 1}pt !important; } .competencies-grid { gap: 3pt !important; }
.skills-grid { gap: 1pt 10pt !important; }
</style>`;
const rows = [];
for (const src of ['A-base-as-drafted+vol', 'W-base+vol']) {
  for (const [label, family] of [['sans', '"Liberation Sans", Arial, sans-serif'], ['serif', '"Liberation Serif", "Times New Roman", serif']]) {
    for (const [pt, lh] of [[9.5, 1.15], [9.5, 1.2], [10, 1.15], [9, 1.15]]) {
      const o = `${work}/dense-${src}-${label}-${pt}-${lh}`;
      writeFileSync(`${o}.html`, readFileSync(`${work}/${src}.html`, 'utf8').replace('</head>', `${css(family, pt, lh)}</head>`));
      const r = spawnSync('node', [`${repo}/generate-pdf.mjs`, `${o}.html`, `${o}.pdf`, '--format=letter', '--skip-fact-check', '--max-pages=9'], { env: { ...process.env, CAREER_OPS_ROOT: work }, encoding: 'utf8' });
      const pages = Number(/Pages:\s+(\d+)/.exec(r.stdout + r.stderr)?.[1]);
      const last = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), '-layout', `${o}.pdf`, '-'], { encoding: 'utf8' }).split('\n').filter((l) => l.trim()).length;
      rows.push({ content: src.startsWith('A') ? 'draft 1,194w' : 'budgeted 949w', font: label, pt, lineHeight: lh, pages, lastPageLines: last });
    }
  }
}
console.table(rows);
