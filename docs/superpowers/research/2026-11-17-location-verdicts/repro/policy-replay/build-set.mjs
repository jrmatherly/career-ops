// Reads the pod's scan-history copy, keeps rows that passed the title filter and carry a location verdict
// (added, skipped_location), dedupes, labels, and writes postings.json plus label summaries.
import { readFileSync, writeFileSync } from 'node:fs';
import { label } from './label.mjs';
const S = new URL('..', import.meta.url).pathname;
const lines = readFileSync(S + 'pod/scan-history.tsv', 'utf8').split('\n').filter(Boolean);
const head = lines[0].split('\t');
const rows = lines.slice(1).map(l => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
const kept = rows.filter(r => r.status === 'added' || r.status === 'skipped_location');
const byUrl = new Map();
for (const r of kept) if (!byUrl.has(r.url)) byUrl.set(r.url, r);
// A second identity: same company, title and location under another URL (reposts, per-locale URLs).
const byRole = new Map();
for (const r of byUrl.values()) { const k = `${r.normalized_company}|${r.title.toLowerCase()}|${r.location.toLowerCase()}`; if (!byRole.has(k)) byRole.set(k, r); }
const postings = [...byUrl.values()].map(r => ({ url: r.url, date: r.first_seen, portal: r.portal, title: r.title, company: r.company, status: r.status, location: r.location, ...label(r.location) }));
writeFileSync(S + 'policy-replay/postings.json', JSON.stringify(postings));
const count = (xs, f) => xs.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
console.log('history rows', rows.length, '| title-passing rows with a location verdict', kept.length, '| unique urls', byUrl.size, '| unique company+title+location', byRole.size);
console.log('skipped_age (passed title and location, dropped for age)', rows.filter(r => r.status === 'skipped_age').length);
console.log('labels', count(postings, p => p.label));
console.log('why', Object.entries(count(postings, p => `${p.label}:${p.why}`)).sort((a, b) => b[1] - a[1]));
console.log('label x status', count(postings, p => `${p.label}:${p.status}`));
if (process.argv[2]) {
  const by = {};
  for (const p of postings) if (`${p.label}:${p.why}`.startsWith(process.argv[2])) by[p.location] = (by[p.location] || 0) + 1;
  for (const [l, n] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[3] || 400))) console.log(n, JSON.stringify(l.slice(0, 160)));
}
