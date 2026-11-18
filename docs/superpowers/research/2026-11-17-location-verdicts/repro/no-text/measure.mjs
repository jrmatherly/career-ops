import { readFileSync } from 'node:fs';
import { resolveAtsApi, JD_TEXT_API_ATS } from '../../../../../../liveness-api.mjs';
import { normalizeUrl } from '../../../../../../url-key.mjs';
const P = process.argv[2];
const sup = (u) => { const r = resolveAtsApi(u); return { ats: r?.ats ?? null, ok: JD_TEXT_API_ATS.has(r?.ats) }; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '?'; } };
const hostKey = (u) => { const h = host(u); return h.replace(/^[^.]+\.(?=(icims|myworkdayjobs|eightfold|wd\d)\.)/, '*.'); };
const tally = (rows, keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); const e = m.get(k) ?? { n: 0, ok: 0 }; e.n++; if (r.ok) e.ok++; m.set(k, e); } return [...m].sort((a, b) => b[1].n - a[1].n); };
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';

// scan-history added
const lines = readFileSync(`${P}/scan-history.tsv`, 'utf8').split('\n');
const hdr = lines[0].split('\t');
const ix = (c) => hdr.indexOf(c);
const seen = new Set();
const added = [];
for (const l of lines.slice(1)) { const c = l.split('\t'); if (c[ix('status')] !== 'added') continue; const k = normalizeUrl(c[0]) ?? c[0]; if (seen.has(k)) continue; seen.add(k); added.push({ url: c[0], portal: c[ix('portal')], ...sup(c[0]) }); }
const okA = added.filter((r) => r.ok).length;
console.log(`SCAN added unique URLs: ${added.length}, text-API supported ${okA} (${pct(okA, added.length)})`);
console.log('by portal (top 25): portal n supported');
for (const [k, e] of tally(added, (r) => r.portal).slice(0, 25)) console.log(`  ${k}\t${e.n}\t${e.ok}`);
console.log('unsupported by host (top 25):');
for (const [k, e] of tally(added.filter((r) => !r.ok), (r) => `${hostKey(r.url)} [${r.ats ?? 'none'}]`).slice(0, 25)) console.log(`  ${k}\t${e.n}`);

// pipeline rows
const pl = readFileSync(`${P}/pipeline.md`, 'utf8').split('\n');
let section = '';
const prow = [];
for (const l of pl) {
  if (l.startsWith('## ')) section = l.slice(3).trim();
  const m = /^- \[(.)\] (\S+)/.exec(l); if (!m) continue;
  const rk = /rank: (\d+(?:\.\d+)?)\/5/.exec(l);
  prow.push({ section, box: m[1], url: m[2], rank: rk ? Number(rk[1]) : undefined, ...sup(m[2]) });
}
for (const [name, rows] of [['pipeline all rows', prow], ['pipeline Pending section', prow.filter((r) => r.section === 'Pending')], ['pipeline unchecked [ ]', prow.filter((r) => r.box === ' ')]]) {
  const ok = rows.filter((r) => r.ok).length; const ranked = rows.filter((r) => r.rank !== undefined);
  const hi = ranked.filter((r) => r.rank >= 3.5); const hiBad = hi.filter((r) => !r.ok);
  console.log(`${name}: ${rows.length} rows, supported ${ok} (${pct(ok, rows.length)}); ranked ${ranked.length}; rank>=3.5: ${hi.length}, unsupported among them ${hiBad.length} (${pct(hiBad.length, hi.length)})`);
  if (name === 'pipeline all rows') { for (const [k, e] of tally(hiBad, (r) => `${hostKey(r.url)} [${r.ats ?? 'none'}]`)) console.log(`    hi-rank unsupported: ${k}\t${e.n}`); for (const [k, e] of tally(rows.filter(r=>!r.ok), (r) => `${hostKey(r.url)} [${r.ats ?? 'none'}]`).slice(0,15)) console.log(`    all unsupported: ${k}\t${e.n}`); }
}

// ledger: latest rank per URL, queued-at-some-point rows
const led = readFileSync(`${P}/evaluate-queue.tsv`, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'));
const by = new Map();
for (const c of led) { const k = normalizeUrl(c[0]); const e = by.get(k) ?? { url: c[0], rows: [] }; e.rows.push({ rank: c[4], reason: c[5], state: c[6] }); by.set(k, e); }
const ents = [...by.values()].map((e) => ({ ...e, rank: Number(e.rows.findLast((r) => r.rank !== '')?.rank), everQueued: e.rows.some((r) => r.state === 'queued'), held: e.rows.some((r) => r.reason === 'held-location'), ...sup(e.url) }));
const hiL = ents.filter((e) => e.rank >= 3.5);
console.log(`LEDGER URLs ${ents.length}; rank>=3.5 ${hiL.length}; of those held-location ${hiL.filter(e=>e.held).length}; queued ever ${hiL.filter(e=>e.everQueued).length}`);
console.log(`  rank>=3.5 unsupported by current JD_TEXT_API_ATS: ${hiL.filter(e=>!e.ok).length}, of which not held ${hiL.filter(e=>!e.ok && !e.held).length}`);
for (const e of hiL.filter(e => !e.ok)) console.log(`    ${host(e.url)} [${e.ats ?? 'none'}] rank ${e.rank} held=${e.held} last=${e.rows.at(-1).state}/${e.rows.at(-1).reason}`);
console.log(`  all ledger URLs unsupported: ${ents.filter(e=>!e.ok).length}/${ents.length}`);
console.log('JD_TEXT_API_ATS', [...JD_TEXT_API_ATS].join(','));
