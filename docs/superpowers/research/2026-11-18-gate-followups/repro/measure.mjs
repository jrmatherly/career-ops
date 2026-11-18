// usage: node measure.mjs <module.mjs> <corpusDir>
import { readdirSync, readFileSync } from 'node:fs';
const [mod, dir] = process.argv.slice(2);
const { buildWorkplacePolicy, locationVerdict, USPS_STATES } = await import(mod);
const gate = buildWorkplacePolicy({ onsite_locations: ['atlanta', 'alpharetta', 'marietta', 'johns creek'], remote_countries: ['United States'], home_states: ['Georgia'] });
const text = html => String(html || '').replace(/<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section)\b[^<>]*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
const sentences = html => text(html).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
const jobs = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) for (const job of JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) jobs.push({ board: f.replace(/\.json$/, ''), ...job });
const tally = (map, key, job) => { const e = map.get(key) ?? { n: 0, boards: new Set() }; e.n++; e.boards.add(job.board); map.set(key, e); };
const show = (title, map, limit = 60) => { console.log(`\n## ${title} (${map.size} distinct, ${[...map.values()].reduce((a, e) => a + e.n, 0)} jobs)`); for (const [k, e] of [...map].sort((a, b) => b[1].n - a[1].n).slice(0, limit)) console.log(`${e.n}\t[${[...e.boards].slice(0, 3).join(',')}]\t${k.slice(0, 260)}`); };

// A. US-remote jobs the description rejects, and the sentence that does it alone.
const flips = new Map(), reasons = {}; let remoteBase = 0, tiers = {};
for (const job of jobs) {
  const base = gate(job.location, job.title, { ...job, description: '' });
  const full = gate(job.location, job.title, job);
  const v = locationVerdict(gate, job.location, job.title, job); tiers[v.tier] = (tiers[v.tier] ?? 0) + 1;
  if (base.reason === 'remote_region_allowed') remoteBase++;
  if (!base.eligible || full.eligible) continue;
  reasons[full.reason] = (reasons[full.reason] ?? 0) + 1;
  const guilty = sentences(job.description).filter(s => !gate(job.location, job.title, { ...job, description: s }).eligible);
  tally(flips, `${full.reason} :: ${guilty.join(' || ') || '(no single sentence)'}`, job);
}
console.log(JSON.stringify({ jobs: jobs.length, remoteBase, flipped: [...flips.values()].reduce((a, e) => a + e.n, 0), reasons, tiers }));
show('A. eligible by location, rejected by description', flips, 80);

// B. sentences that shut a US state out.
const names = USPS_STATES.map(([n]) => n).join('|'), codes = USPS_STATES.map(([, c]) => c.toUpperCase()).join('|');
const EXCL = /\b(?:not (?:eligible|available|open|able|hiring|currently hiring|accepting)|unable to (?:hire|employ|consider)|cannot (?:hire|employ|consider)|can't hire|do(?:es)? not (?:hire|employ)|except|excluding|excludes|exclusions?|ineligible|outside of the following)\b/i;
const STATE = new RegExp(`\\b(?:${names})\\b`, 'i'), CODELIST = new RegExp(`\\b(?:${codes})\\b(?:\\s*[,/&]\\s*(?:and |or )?\\b(?:${codes})\\b)+`);
const excl = new Map(), exclGa = new Map();
for (const job of jobs) for (const s of new Set(sentences(job.description))) {
  if (!EXCL.test(s) || !(STATE.test(s) || CODELIST.test(s))) continue;
  tally(excl, s, job);
  if (/\bgeorgia\b/i.test(s) || /\bGA\b/.test(s)) tally(exclGa, `${gate(job.location, job.title, job).eligible ? 'ELIG' : 'no'} loc=${job.location} :: ${s}`, job);
}
show('B. state-exclusion sentences', excl, 40);
show('B2. of those, naming Georgia or GA (with the gate answer today)', exclGa, 40);

// C. "<something> only:" labels.
const labels = new Map();
for (const job of jobs) for (const s of new Set(sentences(job.description))) {
  const m = s.match(/^(.{0,90}?\bonly\s*:)(.*)$/i);
  if (!m) continue;
  const alone = gate('Remote - United States', '', { description: s });
  tally(labels, `${alone.eligible ? 'ok' : alone.reason} :: ${m[1]} >> ${m[2].trim().slice(0, 110)}`, job);
}
show('C. sentences opening with "... only:" (answer under Remote - United States)', labels, 60);

// D. sentences that state a state list or timezone or region residency.
const resid = new Map();
for (const job of jobs) for (const s of new Set(sentences(job.description))) {
  if (!/\b(?:must|required to|need to|eligible|only|residents?)\b/i.test(s) || !/\b(?:based|located|reside|residing|live|living|residents?|work from)\b/i.test(s)) continue;
  const kind = /\btime ?zones?\b|\b(?:eastern|central|pacific|mountain) time\b/i.test(s) ? 'timezone' : /\bfollowing (?:us |u\.s\. )?states\b|\bstates?:/i.test(s) ? 'state-list' : /\bnorth america|americas\b/i.test(s) ? 'region' : /\bmiles\b|commut/i.test(s) ? 'distance' : null;
  if (!kind) continue;
  const alone = gate('Remote - United States', '', { description: s });
  tally(resid, `${kind} ${alone.eligible ? 'ok' : alone.reason} :: ${s}`, job);
}
show('D. residency sentences by kind', resid, 50);
