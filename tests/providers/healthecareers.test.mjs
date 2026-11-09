// tests/providers/healthecareers.test.mjs: offline coverage for the Health
// eCareers search-page scraper. Card markup mirrors the live page as measured
// on 2026-11-08; every name and id below is fictional.
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, ROOT } from '../helpers.mjs';

console.log('\nProvider — healthecareers');

const mod = await import(pathToFileURL(join(ROOT, 'providers/healthecareers.mjs')).href);
const provider = mod.default;
const ORIGIN = 'https://www.healthecareers.com';
const check = (ok, msg, detail) => (ok ? pass(msg) : fail(`${msg}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`));

const card = (id, { title = `Staff Nurse ${id}`, url = `${ORIGIN}/job/staff-nurse-${id}/${id}`, company = 'Acme Health' } = {}) => `
  <div id="job-results-card" data-url="${url}" class="card job-results-card mx-1 ">
    <a href="${url}" class="gtm-card-position"><img alt="logo"></a>
    <div class="result-title"><a id="job-results-job-title" href="${url}"><span itemprop="title">${title}</span></a></div>
    <div class="job-location"><span id="job-results-location">Springfield, Ohio</span></div>
    <div class="job-vendor"><span itemprop="hiringOrganization"><a href="${url}/employer"><span id="job-results-employer" itemprop="name">
      ${company}
    </span></a></span></div>
    <div id="job-results-desc" class="job-desc line-clamp" data-text="x">Join our team at ExampleCo.</div>
  </div>`;
const page = (cards) => `<html><head><title>Healthcare &amp; Medical Jobs</title></head><body><div id="divMainSearchResults">${cards.join('')}</div></body></html>`;
const fullPage = (n) => page(Array.from({ length: 25 }, (_, i) => card(n * 100 + i + 1)));
const EMPTY_PAGE = page([]);
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const CHALLENGE = '<html><head><title>Just a moment...</title></head><body><div class="cf-browser-verification"></div></body></html>';

function stubCtx(respond, extra = {}) {
  const calls = [];
  const ctx = {
    async fetchText(url, opts) {
      calls.push({ url, opts });
      return respond(url, calls.length);
    },
    async fetchJson() { throw new Error('fetchJson not expected'); },
    sleep: async () => {},
    ...extra,
  };
  return { ctx, calls };
}

async function captureStderr(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try {
    return { result: await fn(), lines };
  } catch (err) {
    return { error: err, lines };
  } finally {
    console.error = orig;
  }
}

check(provider.id === 'healthecareers', 'id is "healthecareers"');

check(provider.detect({ name: 'HEC', provider: 'healthecareers' })?.url === `${ORIGIN}/search-jobs`,
  'detect answers an explicit provider: entry with no careers_url');
for (const entry of [
  { name: 'x', careers_url: `${ORIGIN}/search-jobs` },
  { name: 'x', careers_url: 'https://jobs.lever.co/x' },
  { name: 'x', careers_url: 'https://job-boards.greenhouse.io/x' },
  { name: 'x', provider: 'greenhouse' },
  null,
]) check(provider.detect(entry) === null, `detect returns null for ${JSON.stringify(entry)}`);

for (const careers_url of ['https://evil.example/search-jobs', 'http://www.healthecareers.com/search-jobs', 'not a url', 'https://www.healthecareers.com:8443/x']) {
  const { ctx, calls } = stubCtx(() => fullPage(0));
  let threw = false;
  try { await provider.fetch({ name: 'x', provider: 'healthecareers', careers_url }, ctx); } catch { threw = true; }
  check(threw && calls.length === 0, `untrusted careers_url ${careers_url} throws before any request`, calls.length);
}

{
  const jobs = mod.parseSearchPage(page([
    card(1, { title: 'R&amp;D Nurse &#8211; ICU', company: 'Acme &amp; Sons Health' }),
    card(2, { url: '/job/relative-card/2' }),
    card(3, { title: '' }),
    card(4, { url: 'https://evil.example/job/x/4' }),
    card(5, { url: `${ORIGIN}/job/x/5?ref=promo` }),
    card(1),
  ]));
  check(jobs.length === 2, 'parser keeps the two valid cards, drops a title-less, off-host, query-carrying and duplicate card', jobs);
  check(jobs[0]?.title === 'R&D Nurse – ICU' && jobs[0].company === 'Acme & Sons Health'
    && jobs[0].location === 'Springfield, Ohio' && jobs[0].description === 'Join our team at ExampleCo.',
  'card fields are normalized and entity-decoded', jobs[0]);
  check(/\bR&D\b/.test(jobs[0]?.title ?? ''), 'an encoded &amp; is decoded before a keyword match runs');
  check(jobs[1]?.url === `${ORIGIN}/job/relative-card/2`, 'a relative card URL resolves on the board host', jobs[1]);
}

{
  const { ctx, calls } = stubCtx((url) => (url.endsWith('pg=3') ? page([card(301, { title: 'Last Card' })]) : fullPage(Number(url.split('pg=')[1] || 1))));
  const jobs = await provider.fetch({ name: 'HEC', provider: 'healthecareers' }, ctx);
  check(jobs.length === 51, 'walks pages until a short page ends the board', jobs.length);
  check(calls[0].url === 'https://www.healthecareers.com/search-jobs' && calls[1].url === 'https://www.healthecareers.com/search-jobs?pg=2',
    'page one is the bare /search-jobs path and later pages use ?pg=N', calls.map((c) => c.url));
  check(calls.every((c) => new URL(c.url).pathname === '/search-jobs'), 'every list request is on /search-jobs, never /searchjobs/ or /new-search-jobs/');
  check(calls.every((c) => c.opts?.redirect === 'error'), 'every request passes redirect: error');
}

{
  const { ctx } = stubCtx(() => CHALLENGE);
  const { error } = await captureStderr(() => provider.fetch({ name: 'HEC', provider: 'healthecareers' }, ctx));
  check(/bot-challenge/.test(error?.message ?? ''), 'a challenge page on page one throws, not an empty board', error?.message);
}

{
  const { ctx } = stubCtx(() => EMPTY_PAGE);
  const jobs = await provider.fetch({ name: 'HEC', provider: 'healthecareers' }, ctx);
  check(Array.isArray(jobs) && jobs.length === 0, 'a page with neither job links nor cards is an empty board');
  const broken = stubCtx(() => page([`<a href="${ORIGIN}/job/some-job/42">Some job</a>`]));
  const { error } = await captureStderr(() => provider.fetch({ name: 'HEC', provider: 'healthecareers' }, broken.ctx));
  check(/card markup changed/.test(error?.message ?? ''), 'job links with zero parsed cards throws', error?.message);
}

{
  const { ctx, calls } = stubCtx((url) => fullPage(Number(url.split('pg=')[1] || 1)));
  const { result, lines } = await captureStderr(() => provider.fetch({ name: 'HEC', provider: 'healthecareers' }, ctx));
  check(calls.length === 10 && result.length === 250, 'DEFAULT_MAX_PAGES stops an endless board at 10 pages', calls.length);
  check(lines.some((l) => /raise max_pages/.test(l)), 'hitting the page cap on a full page warns to raise max_pages', lines);
}

{
  const { ctx, calls } = stubCtx(() => fullPage(1));
  const jobs = await provider.fetch({ name: 'HEC', provider: 'healthecareers', healthecareers: { fetchDetails: true } }, { ...ctx, maxPages: 1 });
  check(calls.length === 1 && jobs.length === 25, 'ctx.maxPages: 1 makes exactly one list request and no detail request', calls.length);
  const boom = new Error('budget reached');
  const probe = stubCtx(() => { throw boom; });
  let got;
  try { await provider.fetch({ name: 'HEC', provider: 'healthecareers' }, { ...probe.ctx, maxPages: 1 }); } catch (err) { got = err; }
  check(got === boom, 'a ctx.fetch rejection under a probe propagates unwrapped');
}

{
  const err503 = Object.assign(new Error('HTTP 503'), { status: 503 });
  const { ctx } = stubCtx((url) => { if (url.includes('pg=2')) throw err503; return fullPage(1); });
  const { result, lines } = await captureStderr(() => provider.fetch({ name: 'HEC', provider: 'healthecareers' }, ctx));
  check(result?.length === 25, 'a page-two 5xx that retry cannot clear keeps page one', result?.length);
  check(lines.some((l) => /stopped at page 2/.test(l)) && !lines.some((l) => /raise max_pages/.test(l)),
    'the fetch-error stop warns without the raise-max_pages message', lines);
}

{
  const detail = `<html><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${ORIGIN}/healthcare-employers/acme/1#hiringorganization`, name: 'Acme Medical Group' },
      { '@type': 'JobPosting', title: 'Staff Nurse 101', datePosted: '2026-11-01T10:00:00Z', description: '<p>Care &amp; compassion</p>',
        hiringOrganization: { '@id': `${ORIGIN}/healthcare-employers/acme/1#hiringorganization` },
        jobLocation: { '@type': 'Place', address: { addressLocality: 'Springfield', addressRegion: 'Ohio', addressCountry: 'US' } } },
    ],
  })}</script></html>`;
  const err404 = Object.assign(new Error('HTTP 404'), { status: 404 });
  const { ctx, calls } = stubCtx((url) => {
    if (url.includes('/job/')) {
      if (url.endsWith('/102')) throw err404;
      return detail;
    }
    return url.includes('pg=') ? EMPTY_PAGE : fullPage(1);
  });
  const jobs = await provider.fetch({ name: 'HEC', provider: 'healthecareers', healthecareers: { fetchDetails: true, detailLimit: 10 } }, ctx);
  const details = calls.filter((c) => c.url.includes('/job/'));
  check(details.length === 10, 'detailLimit caps the detail fetches', details.length);
  check(details.every((c) => c.opts?.redirect === 'error'), 'detail requests pass redirect: error');
  check(jobs[0].company === 'Acme Medical Group' && jobs[0].postedAt === Date.parse('2026-11-01T10:00:00Z')
    && jobs[0].description === 'Care & compassion' && jobs[0].location === 'Springfield, Ohio, US',
  'detail JSON-LD fills company (through its @id), postedAt, location and description', jobs[0]);
  check(jobs[1].title === 'Staff Nurse 102' && jobs[1].company === 'Acme Health' && jobs[1].postedAt === undefined,
    'a failed detail fetch keeps the listing row as parsed', jobs[1]);
  check(jobs[20].postedAt === undefined, 'rows past detailLimit are not enriched');
}

{
  check(mod.parseDetailPage('<script type="application/ld+json">{broken</script>').postedAt === undefined
    && Object.keys(mod.parseDetailPage('<p>no json-ld</p>')).length === 0, 'a detail page without a usable JobPosting yields no enrichment');
  check(mod.parseDetailPage(ld({ '@type': 'JobPosting', title: 'T', datePosted: 'not a date' })).postedAt === undefined
    && mod.parseDetailPage(ld({ '@type': 'JobPosting', title: 'T', datePosted: '1970-01-01T00:00:00Z' })).postedAt === 0,
  'dates are NaN-safe and keep epoch 0');
  check(mod.parseDetailPage(ld({ '@type': 'JobPosting', title: 'Longer SEO Title' })).title === undefined,
    'detail enrichment never replaces the card title');
}

{
  const drifted = stubCtx(() => page([card(1, { url: `${ORIGIN}/job/staff-nurse/1?src=search` })]));
  const { error } = await captureStderr(() => provider.fetch({ name: 'HEC', provider: 'healthecareers' }, drifted.ctx));
  check(/card markup changed/.test(error?.message ?? ''), 'cards present but none parsable (a query on every card URL) throws, not an empty board', error?.message);
  const small = stubCtx((url) => page(Array.from({ length: 20 }, (_, i) => card(Number(url.split('pg=')[1] || 1) * 100 + i))));
  const { result } = await captureStderr(() => provider.fetch({ name: 'HEC', provider: 'healthecareers', max_pages: 3 }, small.ctx));
  check(small.calls.length === 3 && result?.length === 60, "the short-page stop keys off page one's card count, not a fixed 25", small.calls.length);
}
