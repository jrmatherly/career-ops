import { readdirSync, readFileSync } from 'node:fs';
const [a, b, dir, pod] = process.argv.slice(2);
const A = await import(a), B = await import(b);
const P = { onsite_locations: ['atlanta', 'alpharetta', 'marietta', 'johns creek'], remote_countries: ['United States'] };
for (const [name, policy] of [['no home state', P], ['Georgia home', { ...P, home_states: ['Georgia'] }]]) {
  const ga = A.buildWorkplacePolicy(policy), gb = B.buildWorkplacePolicy(policy);
  let n = 0, toNo = [], toYes = [], tier = {};
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) for (const job of JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) {
    n++; const x = ga(job.location, job.title, job), y = gb(job.location, job.title, job);
    if (x.eligible && !y.eligible) toNo.push(`${f} | ${job.location} | ${y.reason}`); if (!x.eligible && y.eligible) toYes.push(`${f} | ${job.location} | was ${x.reason}`);
    const va = A.locationVerdict(ga, job.location, job.title, job).tier, vb = B.locationVerdict(gb, job.location, job.title, job).tier; if (va !== vb) (tier[`${va}->${vb}`] ??= []).push(job.location);
  }
  console.log(`\n# corpus, ${name}: ${n} jobs; eligible->not ${toNo.length}; not->eligible ${toYes.length}`); toNo.slice(0, 8).forEach(l => console.log('  -', l)); toYes.slice(0, 8).forEach(l => console.log('  +', l));
  for (const [k, v] of Object.entries(tier)) console.log(`  tier ${k}: ${v.length}  e.g. ${[...new Set(v)].slice(0, 6).join(' | ').slice(0, 300)}`);
  const count = new Map(); for (const line of readFileSync(pod, 'utf8').split('\n').slice(1)) { const loc = line.split('\t')[1] ?? ''; count.set(loc, (count.get(loc) ?? 0) + 1); }
  const moves = {}; for (const [loc, c] of count) { const va = A.locationVerdict(ga, loc), vb = B.locationVerdict(gb, loc); if (va.tier !== vb.tier || ga(loc).eligible !== gb(loc).eligible) (moves[`${va.tier}->${vb.tier} (${vb.reason})`] ??= []).push([c, loc]); }
  console.log(`# pod history, ${name}: ${count.size} distinct locations`); for (const [k, v] of Object.entries(moves)) console.log(`  ${k}: ${v.reduce((s, r) => s + r[0], 0)} rows, ${v.length} distinct: ${v.sort((x, y) => y[0] - x[0]).slice(0, 14).map(([c, l]) => `${c}x ${l.slice(0, 70)}`).join(' | ')}`);
}
