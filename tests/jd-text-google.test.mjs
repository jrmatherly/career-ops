// tests/jd-text-google.test.mjs: Google Careers posting text, read from the
// positional record the posting's own page embeds. The record has no field
// names, so the reader returns text only when the shape and the id match.
// Run: node --test tests/jd-text-google.test.mjs
import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAtsApi, checkLivenessViaApi, isAtsPosting, JD_TEXT_API_ATS } from '../liveness-api.mjs';
import { fetchJdViaKnownApi, normalizeGoogleJob, JD_FETCHERS } from '../browser-extract.mjs';
import { fetchJdText } from '../jd-years.mjs';

const TEXT_ONLY = { textOnly: true };
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

const ID = '900000000000000001';
const NEIGHBOUR = '900000000000000002';
const DETAIL = `https://www.google.com/about/careers/applications/jobs/results/${ID}-platform-program-manager`;
const list = (word) => `<ul>\n<li>${word} item one for the fixture posting, long enough to pass the floor.</li>\n<li>${word} item two &amp; more.</li>\n</ul>`;
const record = (over = {}) => Object.assign([
  ID, 'Platform Program Manager', 'https://www.google.com/about/careers/applications/signin?jobId=FIXTURE',
  [null, list('Responsibility')], [null, `<h3>Minimum qualifications:</h3>${list('Qualification')}`],
  'projects/fixture/tenants/00000000-0000-0000-0000-000000000000/companies/00000000-0000-0000-0000-000000000001', null, 'Fixture Co', 'en-US',
  [['Springfield, IL, USA', ['Springfield, IL, USA'], 'Springfield', null, 'IL', 'US'], ['Metropolis, NY, USA', ['Metropolis, NY, USA'], 'Metropolis', null, 'NY', 'US']],
  [null, '<p>Fixture Co builds fictional things. This paragraph describes the team and is long enough to pass the floor.</p><p>The US base salary range for this full-time position is $100,000-$150,000.</p>'],
  [2], [1794956915, 0], [1794956915, 0], [1794956915, 0], [null, ''], null, null, [null, 'Note: fixture.'], [null, list('Qualification')], 2,
], over);
const esc = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const page = (ds0, ds1 = [[record({ 0: NEIGHBOUR, 1: 'Another Posting' })], null, 1, 20]) =>
  `<html><body><script class="ds:0" nonce="fixture">AF_initDataCallback({key: 'ds:0', hash: '1', data:${esc(ds0)}, sideChannel: {}});</script><script class="ds:1" nonce="fixture">AF_initDataCallback({key: 'ds:1', hash: '2', data:${esc(ds1)}, sideChannel: {}});</script></body></html>`;

test('a Google Careers posting resolves to its own page, as a text-only board', async () => {
  const resolved = resolveAtsApi(`${DETAIL}?q=program%20manager&sort_by=date`);
  assert.equal(resolved.ats, 'google');
  assert.equal(resolved.apiUrl, DETAIL);
  assert.deepEqual(resolved.parts, { id: ID, slug: 'platform-program-manager' });
  assert.equal(resolved.jdTextOnly, true);
  assert.ok(JD_TEXT_API_ATS.has('google'));
  assert.equal(isAtsPosting(DETAIL), false);
  let sent = 0;
  assert.equal(await withFetch(async () => { sent += 1; return new Response(''); }, () => checkLivenessViaApi(DETAIL)), null);
  assert.equal(sent, 0, 'liveness sends nothing for a text-only board');
});

test('results pages, a posting with no slug, other Google paths and lookalike hosts do not resolve', () => {
  for (const url of [
    'https://www.google.com/about/careers/applications/jobs/results/?q=program%20manager',
    `https://www.google.com/about/careers/applications/jobs/results/${ID}`,
    `https://www.google.com/about/careers/applications/jobs/results/abc-platform-program-manager`,
    `https://www.google.com/about/careers/applications/jobs/results/${ID}-Platform..Manager`,
    `https://www.google.com/search?q=${ID}-platform-program-manager`,
    `https://google.com/about/careers/applications/jobs/results/${ID}-platform-program-manager`,
    `https://www.google.com.evil.test/about/careers/applications/jobs/results/${ID}-platform-program-manager`,
    `http://www.google.com/about/careers/applications/jobs/results/${ID}-platform-program-manager`,
  ]) assert.notEqual(resolveAtsApi(url)?.ats, 'google', url);
});

test('the record reads as company, locations and the three sections, in the page order', () => {
  const jd = normalizeGoogleJob(page([record()]), ID, DETAIL);
  assert.equal(jd.url, DETAIL);
  assert.equal(jd.title, 'Platform Program Manager');
  assert.ok(jd.text.startsWith('Company: Fixture Co\nLocation: Springfield, IL, USA | Metropolis, NY, USA\n\nQualifications:\nMinimum qualifications:'));
  const at = (label) => jd.text.indexOf(`\n\n${label}:\n`);
  assert.ok(at('About the job') > 0 && at('About the job') < at('Responsibilities'));
  assert.match(jd.text, /The US base salary range for this full-time position is \$100,000-\$150,000\./);
  assert.match(jd.text, /- Responsibility item two & more\.$/);
  assert.doesNotMatch(jd.text, /Another Posting|Note: fixture|signin/);
  assert.ok(normalizeGoogleJob(page([record({ 9: [] })]), ID, DETAIL).text.startsWith('Company: Fixture Co\n\nQualifications:'));
});

test("a missing posting, a neighbour's id and every broken shape give no text", () => {
  const shifted = record(); shifted.splice(2, 0, 'inserted'); shifted.pop();
  const cases = {
    'a missing posting': [page([]), ID],
    "a neighbour's id": [page([record()]), NEIGHBOUR],
    'the neighbour moved into ds:0': [page([record({ 0: NEIGHBOUR })]), ID],
    '22 fields': [page([[...record(), null]]), ID],
    '20 fields': [page([record().slice(0, 20)]), ID],
    'a field inserted at 2': [page([shifted]), ID],
    'a number for an id': [page([record({ 0: Number(ID) })]), ID],
    'two records': [page([record(), record()]), ID],
    'a section that is not a pair': [page([record({ 3: 'text' })]), ID],
    'short responsibilities': [page([record({ 3: [null, '<p>TBD</p>'] })]), ID],
    'short qualifications': [page([record({ 4: [null, '<p>TBD</p>'] })]), ID],
    'short about text': [page([record({ 10: [null, '<p>TBD</p>'] })]), ID],
    'no title': [page([record({ 1: ' ' })]), ID],
    'no employer': [page([record({ 7: null })]), ID],
    'a location with no name': [page([record({ 9: [[null]] })]), ID],
    'no ds:0 block': ['<html><body>Sign in</body></html>', ID],
    'a block that is not JSON': [page([record()]).replace("data:[[", "data:[[oops"), ID],
  };
  for (const [name, [html, id]] of Object.entries(cases)) assert.equal(normalizeGoogleJob(html, id, DETAIL), null, name);
});

test('the pages saved from Google read the same as the built ones', () => {
  assert.deepEqual(normalizeGoogleJob(fixture('google-detail-open.html'), ID, DETAIL), normalizeGoogleJob(page([record()]), ID, DETAIL));
  assert.equal(normalizeGoogleJob(fixture('google-detail-open.html'), NEIGHBOUR, DETAIL), null);
  assert.equal(normalizeGoogleJob(fixture('google-detail-missing.html'), ID, DETAIL), null);
});

test('fetchJdViaKnownApi reads it for a text-only caller alone, with one HTML request and no redirect', async () => {
  assert.deepEqual(Object.keys(JD_FETCHERS).sort(), [...JD_TEXT_API_ATS].sort());
  const calls = [];
  const reply = async (url, opts) => { calls.push({ url: String(url), accept: opts.headers.accept, redirect: opts.redirect }); return new Response(page([record()])); };
  assert.equal(await withFetch(reply, () => fetchJdViaKnownApi(DETAIL)), null);
  assert.deepEqual(calls, []);
  const jd = await withFetch(reply, () => fetchJdViaKnownApi(`${DETAIL}?sort_by=date`, undefined, undefined, TEXT_ONLY));
  assert.deepEqual(calls, [{ url: DETAIL, accept: 'text/html', redirect: 'error' }]);
  assert.deepEqual([jd.ats, jd.title, jd.url], ['google', 'Platform Program Manager', `${DETAIL}?sort_by=date`]);
  const short = await withFetch(reply, () => fetchJdViaKnownApi(DETAIL, 60, undefined, TEXT_ONLY));
  assert.equal(short.text.length, 61);
});

test('a failed request or a missing posting is a miss', async () => {
  for (const reply of [
    async () => new Response(page([record()]), { status: 503 }),
    async () => new Response('Not Found', { status: 404 }),
    async () => new Response(page([])),
    async () => { throw new TypeError('fetch failed'); },
  ]) assert.equal(await withFetch(reply, () => fetchJdViaKnownApi(DETAIL, undefined, undefined, TEXT_ONLY)), null);
});

test("the scan's experience filter reads the text, and a missing record throws so the row is labelled from its listing", async () => {
  const text = await withFetch(async () => new Response(page([record()])), () => fetchJdText(DETAIL));
  assert.match(text, /Qualification item one/);
  await assert.rejects(withFetch(async () => new Response(page([])), () => fetchJdText(DETAIL)), /google JD fetch returned nothing/);
});
