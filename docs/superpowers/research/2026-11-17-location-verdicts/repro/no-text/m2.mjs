import { readFileSync } from 'node:fs';
import { resolveAtsApi, JD_TEXT_API_ATS } from '../../../../../../liveness-api.mjs';
const P = process.argv[2];
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '?'; } };
const pl = readFileSync(`${P}/pipeline.md`, 'utf8').split('\n');
const bad = pl.filter(l => /^- \[.\] /.test(l)).map(l => /^- \[.\] (\S+)/.exec(l)[1]).filter(u => host(u) === '?');
console.log('unparsable samples', bad.slice(0, 3).map(s => s.slice(0, 40)));
const led = readFileSync(`${P}/evaluate-queue.tsv`, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'));
const m = new Map(); const seen = new Set();
for (const c of led) { if (seen.has(c[0])) continue; seen.add(c[0]); const r = resolveAtsApi(c[0]); const ok = JD_TEXT_API_ATS.has(r?.ats); const k = (ok ? 'OK ' : 'NO ') + host(c[0]).replace(/^[^.]+\.(?=icims)/, '*.'); const ranks = led.filter(x => x[0] === c[0] && x[4] !== '').map(x => +x[4]); const e = m.get(k) ?? []; e.push(ranks.at(-1)); m.set(k, e); }
for (const [k, v] of [...m].sort((a, b) => b[1].length - a[1].length)) console.log(k, v.length, 'max', Math.max(...v), '>=3.5:', v.filter(x => x >= 3.5).length, '>=3.0:', v.filter(x => x >= 3).length);
