// Folds replay-detail.json into the report table: known FIT (string FIT plus ambiguous rows a live read resolved to FIT),
// known OFF, and ambiguous rows with no answer (posting gone, or read and still silent).
import { readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const detail = JSON.parse(readFileSync(here + 'replay-detail.json', 'utf8'));
const postings = new Map(JSON.parse(readFileSync(here + 'postings.json', 'utf8')).map(p => [p.url, p]));
const days = (from, to) => [...new Set([...postings.values()].map(p => p.date))].filter(d => d >= from && d <= to);
const rows = [];
for (const [design, list] of Object.entries(detail)) {
  const n = (ts, o) => list.filter(r => ts.includes(r.t) && r.o === o).length;
  const fit = ['FIT', 'aFIT'], off = ['OFF', 'aOFF'], unk = ['a?'];
  const perDay = (o, ds) => (list.filter(r => r.o === o && ds.includes(postings.get(r.url).date)).length / ds.length).toFixed(1);
  const d1 = days('2026-11-05', '2026-11-14'), d2 = days('2026-11-16', '2026-11-17');
  rows.push({ design: design.slice(0, 46),
    'FIT shown': n(fit, 'shown'), 'FIT review': n(fit, 'review'), 'FIT hidden': n(fit, 'hidden'), 'FIT lost': n(fit, 'dropped'),
    'OFF shown': n(off, 'shown'), 'OFF review': n(off, 'review'), 'OFF hidden': n(off, 'hidden'), 'OFF dropped': n(off, 'dropped'),
    '? shown': n(unk, 'shown'), '? review': n(unk, 'review'), '? hidden': n(unk, 'hidden'), '? lost': n(unk, 'dropped'),
    'shown/day a': perDay('shown', d1), 'shown/day b': perDay('shown', d2), 'review/day a': perDay('review', d1), 'review/day b': perDay('review', d2),
    'precision shown': (n(fit, 'shown') / (n(fit, 'shown') + n(off, 'shown') + n(unk, 'shown'))).toFixed(2) });
}
console.table(rows);
const all = Object.values(detail)[0];
console.log('known FIT', all.filter(r => ['FIT', 'aFIT'].includes(r.t)).length, 'known OFF', all.filter(r => ['OFF', 'aOFF'].includes(r.t)).length, 'no answer', all.filter(r => r.t === 'a?').length, 'days a', days('2026-11-05', '2026-11-14').length, 'days b', days('2026-11-16', '2026-11-17').length);
// excluding the 11-03 backfill
const late = (r) => postings.get(r.url).date > '2026-11-03';
for (const [design, list] of Object.entries(detail)) {
  const n = (ts, o) => list.filter(r => late(r) && ts.includes(r.t) && r.o === o).length;
  console.log('after 11-03 |', design.slice(0, 44).padEnd(44), '| FIT shown/review/hidden/lost', [n(['FIT', 'aFIT'], 'shown'), n(['FIT', 'aFIT'], 'review'), n(['FIT', 'aFIT'], 'hidden'), n(['FIT', 'aFIT'], 'dropped')].join('/'), '| OFF shown', n(['OFF', 'aOFF'], 'shown'), '| ? shown/review/lost', [n(['a?'], 'shown'), n(['a?'], 'review'), n(['a?'], 'dropped')].join('/'));
}
