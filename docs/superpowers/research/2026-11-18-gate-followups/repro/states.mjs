import { readdirSync, readFileSync } from 'node:fs';
const [mod, dir] = process.argv.slice(2);
const { USPS_STATES, buildWorkplacePolicy } = await import(mod);
const gate = buildWorkplacePolicy({ onsite_locations: ['atlanta'], remote_countries: ['United States'], home_states: ['Georgia'] });
const text = html => String(html || '').replace(/<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section)\b[^<>]*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/[ \t]+/g, ' ');
const NAME = new RegExp(`\\b(?:${USPS_STATES.map(([n]) => n).join('|')})\\b`, 'gi');
const CODE = new RegExp(`\\b(?:${USPS_STATES.map(([, c]) => c.toUpperCase()).join('|')})\\b`, 'g');
const out = new Map(), neg = new Map();
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) for (const job of JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) {
  for (const s of new Set(text(job.description).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()))) {
    const names = new Set((s.match(NAME) ?? []).map(n => n.toLowerCase())), codes = new Set(s.match(CODE) ?? []);
    const n = Math.max(names.size, codes.size);
    if (n >= 3) { const ga = names.has('georgia') || codes.has('GA'); const k = `${n} states, GA ${ga ? 'in' : 'OUT'}, gate ${gate('Remote - United States', '', { description: s }).reason} :: ${s.slice(0, 200)}`; const e = out.get(k) ?? { n: 0, b: new Set() }; e.n++; e.b.add(f.replace('.json', '')); out.set(k, e); }
    if (n >= 1 && /\b(?:not|unable|cannot|can't|except|exclud\w+|ineligible|other than)\b/i.test(s) && /\b(?:hir\w+|employ\w*|resid\w+|eligib\w+|applicants?|candidates?|located|based|available|sponsor\w*)\b/i.test(s) && s.length < 400) { const e = neg.get(s) ?? { n: 0, b: new Set() }; e.n++; e.b.add(f.replace('.json', '')); neg.set(s, e); }
  }
}
const show = (t, m) => { console.log(`\n## ${t}: ${m.size} distinct, ${[...m.values()].reduce((a, e) => a + e.n, 0)} hits`); for (const [k, e] of [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 45)) console.log(`${e.n}\t[${[...e.b].slice(0, 2)}]\t${k.slice(0, 300)}`); };
show('sentences naming 3+ US states', out); show('negation + hiring word + a state', neg);
