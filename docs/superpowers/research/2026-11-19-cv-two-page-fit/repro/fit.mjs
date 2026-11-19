// Prototype: rebuild the rejected draft as a payload from a cv.md, render variants, count pages.
// Usage: node fit.mjs <repo> <cv.md> <workdir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const [repo, cvPath, work] = process.argv.slice(2);
const md = readFileSync(cvPath, 'utf8');
const section = (name) => (md.split(/^## /m).find((s) => s.startsWith(name)) || '').split('\n').slice(1).join('\n');

const experience = section('Work Experience').split(/^### /m).slice(1).map((block) => {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const [company, location] = lines[0].split(' — ');
  const rest = lines.slice(3);
  return {
    company, location,
    role: lines[1].replace(/\*\*/g, ''),
    dates: lines[2],
    ...(rest[0] && !rest[0].startsWith('- ') ? { context: rest[0] } : {}),
    bullets: rest.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)),
  };
});
const skills = section('Skills').split('\n').filter((l) => l.startsWith('- ')).map((l) => {
  const m = /^- \*\*(.+?):\*\* (.+)$/.exec(l);
  return { category: m[1], items: m[2] };
});
// The draft added this row; keep it so the fixture matches the rejected render.
skills.splice(3, 0, { category: 'Open Source (production adoption)', items: 'Talos Linux, Flux, Argo CD, Cilium, Zabbix, Grafana, Qdrant, pgvector, Neo4j' });

const base = {
  lang: 'en', page_format: 'letter',
  candidate: { name: 'Sample Candidate', title: 'Platform Engineering Leader', phone: '(555) 555-0100', email: 'candidate@example.com',
    linkedin: { url: 'https://linkedin.com/in/sample-candidate', display: 'linkedin.com/in/sample-candidate' },
    portfolio: { url: 'https://example.com', display: 'example.com' }, location: 'Springfield, ST' },
  summary: section('Professional Summary').trim(),
  competencies: ['Hybrid Infrastructure Strategy (Azure + On-Premises)', 'Platform Engineering & Developer Self-Service', 'Kubernetes & GitOps', 'Infrastructure Modernization', 'Engineering Standards & Guardrails', 'AI Platforms & Governance', 'Infrastructure Cost Management (FinOps)', 'Open-Source Platform Adoption'],
  experience,
  education: [{ title: "Associate's (AABA) - Business Administration, Information Systems", org: 'American InterContinental University', location: 'Marietta, GA', year: 'Aug 2011 - Mar 2013' }],
  skills,
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const variants = {
  'A-base-as-drafted': { payload: base },
  'B-location-once': { payload: (() => { const p = clone(base); p.experience.forEach((e, i) => { if (i) delete e.location; }); return p; })() },
  'C-no-competencies': { payload: (() => { const p = clone(base); delete p.competencies; return p; })() },
  'D-compact-template': { payload: base, template: 'templates/cv-template.compact.html' },
  'E-jake-template': { payload: base, template: 'templates/cv-template.jake.html' },
  'F-modern-template': { payload: base, template: 'templates/cv-template.modern.html' },
  'G-line-height-1.4': { payload: base, css: ':root{--line-height:1.4}' },
  'H-line-height-1.42-font-10.5': { payload: base, css: ':root{--line-height:1.42;--font-size:10.5px}' },
  'I-B+merge-two-short-skill-rows': { payload: (() => { const p = clone(base); p.experience.forEach((e, i) => { if (i) delete e.location; }); p.skills = p.skills.filter((s) => s.category !== 'Open Source (production adoption)'); return p; })() },
};

mkdirSync(work, { recursive: true });
const rows = [];
for (const [name, v] of Object.entries(variants)) {
  const json = join(work, `${name}.json`), html = join(work, `${name}.html`), pdf = join(work, `${name}.pdf`);
  writeFileSync(json, JSON.stringify(v.payload));
  execFileSync('node', [join(repo, 'build-cv-html.mjs'), json, html, ...(v.template ? [join(repo, v.template)] : [])], { stdio: 'pipe' });
  if (v.css) writeFileSync(html, readFileSync(html, 'utf8').replace('</head>', `<style>${v.css}</style></head>`));
  const r = spawnSync('node', [join(repo, 'generate-pdf.mjs'), html, pdf, '--format=letter', '--skip-fact-check', '--max-pages=9'], { env: { ...process.env, CAREER_OPS_ROOT: work }, encoding: 'utf8' });
  const pages = Number(/Pages:\s+(\d+)/.exec(r.stdout + r.stderr)?.[1]);
  let last = '';
  try { last = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), '-layout', pdf, '-'], { encoding: 'utf8' }).split('\n').filter((l) => l.trim()).length; } catch { last = `render failed: ${(r.stderr || '').slice(-200)}`; }
  rows.push({ variant: name, pages, linesOnLastPage: last });
}
console.table(rows);
