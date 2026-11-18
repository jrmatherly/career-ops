// Replays each policy design over the labelled set with the repo's real gates.
// Outcome per posting per design:
//   shown   in the default inbox view
//   review  in a "Review location" bucket (hidden by default, one click away)
//   hidden  kept in the inbox store but hidden as held / elsewhere
//   dropped never reaches the inbox (a skipped_location row in scan-history only)
// Usage: node replay.mjs            table
//        node replay.mjs list <design letter> <truth>:<outcome>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildLocationFilter } from '../../../../../../scan.mjs';
import { buildWorkplacePolicy as repoGate } from '../../../../../../providers/_country.mjs';
import { holdPolicy } from '../../../../../../web/src/lib/scheduled-job-input.mjs';
const here = new URL('.', import.meta.url).pathname;
// The pay-range fix only changes verdicts that read a description; it is used wherever a description is passed.
const { buildWorkplacePolicy: fixedGate } = await import(here + '../payrange/fixD/_country.mjs');
const postings = JSON.parse(readFileSync(here + 'postings.json', 'utf8'));
const read = (f) => existsSync(here + f) ? JSON.parse(readFileSync(here + f, 'utf8')) : {};
const resolved = read('resolved.json'), eightfold = read('resolved-eightfold.json'), truth = read('truth.json');
const jobs = JSON.parse(readFileSync(here + '../pod/scheduled-jobs.json', 'utf8')).jobs;
const old = JSON.parse(readFileSync(here + 'jobs-bak-1114.json', 'utf8')).jobs[0].filters;
const now = jobs[0].filters;
const hold = jobs[0].evaluate.hold;
const lists = (f) => ({ allow: f.allow, always_allow: f.alwaysAllow, block: f.block, block_hard: f.blockHard || [] });
const oldLists = buildLocationFilter(lists(old));
const newLists = buildLocationFilter(lists(now));
const blockOnly = buildLocationFilter({ block: now.block });
const gate = repoGate(holdPolicy(hold));
const gateFixed = fixedGate(holdPolicy(hold));

// Candidate three-tier verdict: the gate's own reason decides, plus one test for a location that names no place.
const HOME_STATE = ['georgia', 'ga'];
const noPlace = (location) => {
  const rests = String(location || '').toLowerCase().split(/[·;|]/).map(place => place.replace(/\b\d+ locations?\b|\bmultiple (?:locations|cities)\b|\bunited states(?: of america)?\b|\busa?\b|\bany location\b|\bhybrid\b/g, '').replace(/[^a-z]/g, ''));
  // Every part is a country or a count, or one part is the home state with no city.
  return rests.every(rest => rest === '') || rests.some(rest => HOME_STATE.includes(rest));
};
export function tier(location, title, offer = {}, g = gate) {
  const v = g(location, title, offer);
  if (v.eligible) return { tier: 'fit', reason: v.reason };
  if (v.reason === 'location_unknown' || v.reason === 'remote_eligibility_unconfirmed') return { tier: 'review', reason: v.reason };
  if (v.reason === 'onsite_outside_allowed_locations' && noPlace(location)) return { tier: 'review', reason: 'location_names_no_place' };
  return { tier: 'off', reason: v.reason };
}
// What a provider fix would write into the location string for a row the scan left in review (design F).
// Only fields a list or detail API hands over: places, a remote flag, a country. The description is passed separately.
function resolvedInput(p) {
  const e = eightfold[p.url];
  if (e?.workSite) return { location: `${p.location}${/0 days|remote/i.test(e.workSite.join(' ')) ? ' · Remote' : ''}`, offer: {} };
  const r = resolved[p.url];
  if (!r?.ok) return null;
  const remote = /remote|telecommute/i.test(r.remote || '') && !/partial|hybrid/i.test(r.remote || '');
  const places = [...new Set([...(r.places || []), r.atsLocation].filter(Boolean))].filter(x => !/unavailable/i.test(x));
  const location = [...places, remote && !places.some(x => /remote/i.test(x)) ? `Remote${r.country ? ', ' + r.country : ''}` : ''].filter(Boolean).join(' · ');
  return { location, offer: { description: r.text || '' } };
}
const viaLists = (filter) => (p) => filter(p.location, p.url, p.title, {});
const threeTier = (offOutcome, { resolve = false, description = false, block = false } = {}) => (p) => {
  if (block && !blockOnly(p.location, p.url, p.title, {}) && tier(p.location, p.title).tier === 'off') return 'dropped';
  let t = tier(p.location, p.title);
  if (resolve && t.tier === 'review') {
    const r = resolvedInput(p);
    if (r?.location) t = description ? tier(r.location, p.title, r.offer, gateFixed) : tier(r.location, p.title);
  }
  return { fit: 'shown', review: 'review', off: offOutcome }[t.tier];
};
const designs = {
  'A  old lists, no held view': (p) => viaLists(oldLists)(p) ? 'shown' : 'dropped',
  'B  today lists': (p) => viaLists(newLists)(p) ? 'shown' : 'dropped',
  'C  old lists + Held on every row, hidden': (p) => !viaLists(oldLists)(p) ? 'dropped' : gate(p.location, p.title).eligible ? 'shown' : 'hidden',
  'C2 today lists + Held on every row, hidden': (p) => !viaLists(newLists)(p) ? 'dropped' : gate(p.location, p.title).eligible ? 'shown' : 'hidden',
  'D  old lists + workplace_policy at scan': (p) => viaLists(oldLists)(p) && gateFixed(p.location, p.title).eligible ? 'shown' : 'dropped',
  'E  three tiers, off dropped at scan': threeTier('dropped'),
  'F  E + provider resolution (structured fields)': threeTier('dropped', { resolve: true }),
  'F2 F + description read at scan': threeTier('dropped', { resolve: true, description: true }),
  'G  F, off kept hidden (block list drops off rows only)': threeTier('hidden', { resolve: true, block: true }),
};
const truthOf = (p) => p.label !== 'AMBIG' ? p.label : ({ FIT: 'aFIT', OFF: 'aOFF' })[truth[p.url]?.truth] || 'a?';
const days = [...new Set(postings.map(p => p.date))].sort();
const steadyA = days.filter(d => d >= '2026-11-05' && d <= '2026-11-14');
const steadyB = ['2026-11-16', '2026-11-17'];
if (process.argv[2] === 'list') {
  const [design, key] = process.argv.slice(3);
  const fn = designs[Object.keys(designs).find(k => k.startsWith(design + ' '))];
  const by = {};
  for (const p of postings) if (`${truthOf(p)}:${fn(p)}` === key) { const k = `${p.location.slice(0, 110)} | ${p.why} | ${tier(p.location, p.title).reason}`; by[k] = (by[k] || 0) + 1; }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 80)) console.log(v, k);
  process.exit(0);
}
const rows = [], detail = {};
for (const [name, fn] of Object.entries(designs)) {
  const c = {}, perDay = {};
  for (const p of postings) {
    const o = fn(p), t = truthOf(p);
    c[`${t}:${o}`] = (c[`${t}:${o}`] || 0) + 1;
    if (o === 'shown') perDay[p.date] = (perDay[p.date] || 0) + 1;
    if (o === 'review') perDay['r' + p.date] = (perDay['r' + p.date] || 0) + 1;
    (detail[name] ||= []).push({ url: p.url, o, t });
  }
  const n = (t, o) => c[`${t}:${o}`] || 0;
  const cell = (t) => `${n(t, 'shown')}/${n(t, 'review')}/${n(t, 'hidden')}/${n(t, 'dropped')}`;
  const avg = (ds, pre = '') => (ds.reduce((s, d) => s + (perDay[pre + d] || 0), 0) / ds.length).toFixed(1);
  rows.push({ design: name,
    'FIT sh/rev/hid/drop': cell('FIT'), 'ambig→FIT': cell('aFIT'), 'ambig→OFF': cell('aOFF'), 'ambig unresolved': cell('a?'), 'OFF': cell('OFF'),
    'shown': ['FIT', 'aFIT', 'aOFF', 'a?', 'OFF'].reduce((s, t) => s + n(t, 'shown'), 0),
    'shown/day 05-14': avg(steadyA), 'shown/day 16-17': avg(steadyB), 'review/day 05-14': avg(steadyA, 'r'), 'review/day 16-17': avg(steadyB, 'r') });
}
console.table(rows);
writeFileSync(here + 'replay-detail.json', JSON.stringify(detail));
const agree = {};
for (const p of postings) { const k = `${p.status} -> A:${designs['A  old lists, no held view'](p)}`; agree[k] = (agree[k] || 0) + 1; }
console.log('history status vs design A', agree);
console.log('repo gate vs pay-range-fixed gate, location and title only: same verdict on', postings.filter(p => gate(p.location, p.title).eligible === gateFixed(p.location, p.title).eligible).length, 'of', postings.length);
const t = {};
for (const p of postings) t[truthOf(p)] = (t[truthOf(p)] || 0) + 1;
console.log('truth classes', t);
