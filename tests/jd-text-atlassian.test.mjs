// tests/jd-text-atlassian.test.mjs: the Atlassian JD text route over its public
// listings feed, and its liveness rung. Fictional feed items; fetch is stubbed.
import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAtsApi, checkLivenessViaApi, isAtsPosting, JD_TEXT_API_ATS } from '../liveness-api.mjs';
import { fetchJdViaKnownApi, forgetAtlassianFeed } from '../browser-extract.mjs';

const TEXT_ONLY = { textOnly: true };

const FEED = 'https://www.atlassian.com/endpoint/careers/listings';
const POSTING = 'https://careers-americas.icims.com/jobs/90001/fixture-engineer---platform/job';

const item = (over = {}) => ({
  id: 90001,
  title: 'Fixture Engineer - Platform',
  locations: ['Exampletown - United States -   Exampletown, Region 00000 United States'],
  overview: '<p>OVERVIEW_MARKER the fixture team &amp; mission.</p>',
  responsibilities: '<ul><li>RESP_MARKER build fixtures</li></ul>',
  qualifications: '<p>QUAL_MARKER five years of fixtures.</p>',
  portalJobPost: { portalId: 1, id: 90001, portalUrl: POSTING },
  applyUrl: `${POSTING}?mode=apply`,
  ...over,
});
const other = item({
  id: 90002,
  title: 'Other Role',
  overview: '<p>OTHER_MARKER</p>',
  portalJobPost: { id: 90002, portalUrl: 'https://careers-apac-atlassian.icims.com/jobs/90002/other-role/job' },
  applyUrl: 'https://careers-apac-atlassian.icims.com/jobs/90002/other-role/job?mode=apply',
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  forgetAtlassianFeed();
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

test("Atlassian's iCIMS portals resolve to the fixed listings feed", () => {
  for (const url of [POSTING, `${POSTING}?mode=apply`, 'https://careers-apac-atlassian.icims.com/jobs/90002/other-role/job',
    'https://campus-americas.icims.com/jobs/7/grad/job']) {
    const resolved = resolveAtsApi(url);
    assert.equal(resolved?.ats, 'atlassian-icims', url);
    assert.equal(resolved.apiUrl, FEED);
  }
  assert.ok(JD_TEXT_API_ATS.has('atlassian-icims'));
});

test("other employers' iCIMS portals and lookalike hosts do not resolve", () => {
  for (const url of [
    'https://careers-exampleco.icims.com/jobs/90001/fixture-engineer/job',
    'https://careers-americas.icims.com.evil.test/jobs/90001/x/job',
    'https://careers-americas.icims.com/jobs/abc/x/job',
    'https://careers-americas.icims.com/jobs/search',
    'http://careers-americas.icims.com/jobs/90001/x/job',
  ]) {
    assert.equal(resolveAtsApi(url), null, url);
  }
});

test('a posting the feed lists comes back as its three sections in text', async () => {
  const calls = [];
  const jd = await withFetch(async (url, opts) => {
    calls.push([String(url), opts.redirect]);
    return json([other, item()]);
  }, () => fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY));
  assert.equal(jd.ats, 'atlassian-icims');
  assert.equal(jd.url, POSTING);
  assert.equal(jd.title, 'Fixture Engineer - Platform');
  assert.match(jd.text, /OVERVIEW_MARKER the fixture team & mission\./);
  assert.match(jd.text, /- RESP_MARKER build fixtures/);
  assert.match(jd.text, /QUAL_MARKER five years of fixtures\./);
  assert.match(jd.text, /Location: Exampletown - United States - Exampletown, Region 00000 United States/);
  assert.doesNotMatch(jd.text, /OTHER_MARKER|<p>/);
  assert.deepEqual(calls, [[FEED, 'error']]);
});

test('a posting the feed does not list, on this host, returns null', async () => {
  const sameIdOtherHost = item({ portalJobPost: { id: 90001, portalUrl: 'https://careers-apac-atlassian.icims.com/jobs/90001/x/job' }, applyUrl: null });
  for (const feed of [[other], [sameIdOtherHost], [], { listings: [item()] }]) {
    assert.equal(await withFetch(async () => json(feed), () => fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY)), null);
  }
});

test('a non-200 or an unreadable feed returns null', async () => {
  for (const res of [json([item()], 500), json([item()], 404), new Response('<html>', { status: 200 })]) {
    assert.equal(await withFetch(async () => res, () => fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY)), null);
  }
});

test('the text cap is honoured', async () => {
  const jd = await withFetch(async () => json([item({ overview: `<p>${'fixture words '.repeat(2000)}</p>` })]),
    () => fetchJdViaKnownApi(POSTING, 400, undefined, TEXT_ONLY));
  assert.ok(jd.text.length <= 401, `length ${jd.text.length}`);
});

test('liveness on these hosts stays with the browser: no feed read, no verdict', async () => {
  let sent = 0;
  const verdict = await withFetch(async () => { sent += 1; return json([item()]); }, () => checkLivenessViaApi(POSTING));
  assert.equal(verdict, null);
  assert.equal(sent, 0);
  assert.equal(isAtsPosting(POSTING), false);
});

test('one feed download serves every posting asked for within the minute', async () => {
  let sent = 0;
  const [a, b] = await withFetch(async () => { sent += 1; return json([item(), other]); }, async () => [
    await fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY),
    await fetchJdViaKnownApi(other.portalJobPost.portalUrl, undefined, undefined, TEXT_ONLY),
  ]);
  assert.match(a.text, /OVERVIEW_MARKER/);
  assert.match(b.text, /OTHER_MARKER/);
  assert.equal(sent, 1);
});

test('a feed that could not be read is not kept for the next posting', async () => {
  let sent = 0;
  const jd = await withFetch(async () => { sent += 1; return sent === 1 ? json({}, 503) : json([item()]); }, async () => {
    assert.equal(await fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY), null);
    return fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY);
  });
  assert.ok(jd?.text);
  assert.equal(sent, 2);
});

test('a feed that is not a list is not kept for the next posting', async () => {
  let sent = 0;
  const jd = await withFetch(async () => { sent += 1; return sent === 1 ? json({ message: 'maintenance' }) : json([item()]); }, async () => {
    assert.equal(await fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY), null);
    return fetchJdViaKnownApi(POSTING, undefined, undefined, TEXT_ONLY);
  });
  assert.ok(jd?.text);
  assert.equal(sent, 2);
});

test('an id that is only the start of a listed id does not match', async () => {
  const prefix = POSTING.replace(/\/jobs\/(\d+)\//, (m, id) => `/jobs/${id.slice(0, -1)}/`);
  assert.notEqual(prefix, POSTING);
  assert.equal(await withFetch(async () => json([item()]), () => fetchJdViaKnownApi(prefix, undefined, undefined, TEXT_ONLY)), null);
});

test('a reader that did not ask for text-only boards gets nothing and sends nothing', async () => {
  let sent = 0;
  assert.equal(await withFetch(async () => { sent += 1; return json([item()]); }, () => fetchJdViaKnownApi(POSTING)), null);
  assert.equal(sent, 0);
});
