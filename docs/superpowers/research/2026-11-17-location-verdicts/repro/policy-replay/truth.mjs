// Turns the live-posting reads into a true answer for each AMBIG row: FIT, OFF or UNKNOWN (posting read, still no answer).
// Rows whose posting is gone stay unresolved. Manual answers below come from reading the posting text (view-resolved.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { label } from './label.mjs';
const here = new URL('.', import.meta.url).pathname;
const postings = JSON.parse(readFileSync(here + 'postings.json', 'utf8'));
const resolved = JSON.parse(readFileSync(here + 'resolved.json', 'utf8'));
const eightfold = existsSync(here + 'resolved-eightfold.json') ? JSON.parse(readFileSync(here + 'resolved-eightfold.json', 'utf8')) : {};
// company | title prefix -> answer, why. Read by hand from the posting text.
const MANUAL = JSON.parse(readFileSync(here + 'truth-manual.json', 'utf8'));
const manual = (p) => MANUAL.find(m => p.company.toLowerCase().includes(m.company.toLowerCase()) && p.title.toLowerCase().startsWith(m.title.toLowerCase()));
const truth = {};
for (const p of postings.filter(p => p.label === 'AMBIG')) {
  const r = resolved[p.url], e = eightfold[p.url];
  const m = manual(p);
  if (m) { truth[p.url] = { truth: m.truth, how: 'read: ' + m.why }; continue; }
  if (e?.workSite) {
    const remote = /0 days|remote/i.test(e.workSite.join(' '));
    truth[p.url] = remote && e.standardizedLocations?.includes('US') ? { truth: 'FIT', how: `eightfold work site "${e.workSite[0]}", US` } : { truth: 'UNKNOWN', how: `eightfold work site "${e.workSite[0]}"` };
    continue;
  }
  if (!r?.ok) continue;
  const remote = /remote|telecommute/i.test(r.remote || '') && !/partial|hybrid/i.test(r.remote || '');
  const places = [...new Set([...(r.places || []), r.atsLocation].filter(Boolean))].filter(x => !/unavailable/i.test(x));
  const text = [...places, remote ? `Remote${r.country ? ', ' + r.country : ''}` : ''].filter(Boolean).join(' · ');
  const l = label(text);
  truth[p.url] = l.label === 'AMBIG' ? { truth: 'UNKNOWN', how: `live: "${text.slice(0, 80)}" ${l.why}` } : { truth: l.label, how: `live: "${text.slice(0, 80)}" ${l.why}` };
}
writeFileSync(here + 'truth.json', JSON.stringify(truth));
const ambig = postings.filter(p => p.label === 'AMBIG');
const c = {}, byWhy = {};
for (const p of ambig) {
  const t = truth[p.url]?.truth || 'NOT_READ';
  c[t] = (c[t] || 0) + 1;
  const why = p.why.replace(/\+foreign/, '');
  (byWhy[why] ||= {})[t] = (byWhy[why][t] || 0) + 1;
}
console.log('AMBIG rows', ambig.length, c);
console.table(byWhy);
if (process.argv[2] === 'list') for (const p of ambig) { const t = truth[p.url]; if (t && (!process.argv[3] || t.truth === process.argv[3])) console.log(t.truth, '|', p.company.slice(0, 18), '|', p.title.slice(0, 44), '|', p.location.slice(0, 30), '|', t.how.slice(0, 130)); }
