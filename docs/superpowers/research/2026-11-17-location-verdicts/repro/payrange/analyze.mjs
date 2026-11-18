// Run the gate over cached boards with and without description; report roles the description flips to ineligible.
// usage: node analyze.mjs <module.mjs> <dataDir> [--only board] [--dump file]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const [mod, dir] = process.argv.slice(2);
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const { buildWorkplacePolicy } = await import(mod);
const gate = buildWorkplacePolicy({ onsite_locations: ['atlanta', 'alpharetta', 'marietta', 'johns creek'], remote_countries: ['United States'] });
const rows = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const board = f.replace(/\.json$/, '');
  if (arg('--only') && board !== arg('--only')) continue;
  for (const job of JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) {
    const base = gate(job.location, job.title, { ...job, description: '' });
    globalThis.__clause = null;
    const full = gate(job.location, job.title, job);
    rows.push({ board, title: job.title, location: job.location, url: job.url, base: base.reason, baseOk: base.eligible, reason: full.reason, ok: full.eligible, clause: full.eligible ? null : globalThis.__clause });
  }
}
const remote = rows.filter(r => r.base === 'remote_region_allowed');
const onsite = rows.filter(r => r.base === 'onsite_location_allowed');
const flips = rows.filter(r => r.baseOk && !r.ok);
const by = {};
for (const r of flips) (by[r.reason] ??= { remote: 0, onsite: 0 })[r.base === 'remote_region_allowed' ? 'remote' : 'onsite']++;
console.log(JSON.stringify({ jobs: rows.length, remoteUSWithoutDescription: remote.length, remoteFlipped: remote.filter(r => !r.ok).length, onsiteOk: onsite.length, onsiteFlipped: onsite.filter(r => !r.ok).length, byReason: by }));
if (arg('--dump')) writeFileSync(arg('--dump'), JSON.stringify(flips, null, 1));
