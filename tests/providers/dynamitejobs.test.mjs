// tests/providers/dynamitejobs.test.mjs: offline coverage for the Dynamite
// Jobs sitemap + JSON-LD provider. Shapes mirror the live sitemap and posting
// pages as measured on 2026-11-08; every company and slug below is fictional.
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, ROOT } from '../helpers.mjs';

console.log('\nProvider — dynamitejobs');

const mod = await import(pathToFileURL(join(ROOT, 'providers/dynamitejobs.mjs')).href);
const provider = mod.default;
const SITEMAP = 'https://dynamitejobs.com/sitemap/jobs-of-company.xml';
const check = (ok, msg, detail) => (ok ? pass(msg) : fail(`${msg}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`));

const jobLoc = (company, slug) => `https://dynamitejobs.com/company/${company}/remote-job/${slug}`;
const urlset = (locs) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <url><loc>${l}</loc><lastmod>2026-11-09T00:11:47&#43;00:00</lastmod></url>`).join('\n')}
</urlset>`;
const many = (n) => urlset(Array.from({ length: n }, (_, i) => jobLoc('exampleco', `ops-manager-${i}`)));
const detail = (posting) => `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org/', '@type': 'JobPosting', ...posting })}</script>
</head></html>`;
const POSTING = {
  title: 'R&amp;D Operations Manager, Remote Job',
  datePosted: '2026-11-06T20:32:21.161Z',
  jobLocationType: 'TELECOMMUTE',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Remote Co' },
  applicantLocationRequirements: [{ '@type': 'Country', name: 'Canada' }, { '@type': 'Country', name: 'Mexico' }],
  description: '<p>Run the money &amp; the team.</p>',
};
const CHALLENGE = '<html><head><title>Just a moment...</title></head><body class="cf-browser-verification"></body></html>';

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
  } catch (error) {
    return { error, lines };
  } finally {
    console.error = orig;
  }
}

const ENTRY = { name: 'Dynamite', provider: 'dynamitejobs' };

check(provider.id === 'dynamitejobs', 'id is "dynamitejobs"');
check(provider.detect(ENTRY)?.url === SITEMAP, 'detect answers an explicit provider: entry with no careers_url');
for (const entry of [
  { name: 'x', careers_url: 'https://dynamitejobs.com/' },
  { name: 'x', careers_url: 'https://jobs.lever.co/x' },
  { name: 'x', careers_url: 'https://job-boards.greenhouse.io/x' },
  { name: 'x', provider: 'eploy' },
  null,
]) check(provider.detect(entry) === null, `detect returns null for ${JSON.stringify(entry)}`);

for (const careers_url of ['https://evil.example/', 'http://dynamitejobs.com/', 'not a url', 'https://dynamitejobs.com.evil.example/']) {
  const { ctx, calls } = stubCtx(() => many(1));
  let threw = false;
  try { await provider.fetch({ ...ENTRY, careers_url }, ctx); } catch { threw = true; }
  check(threw && calls.length === 0, `untrusted careers_url ${careers_url} throws before any request`, calls.length);
}

{
  const jobs = mod.parseSitemap(urlset([
    jobLoc('exampleco', 'senior-ai-engineer'),
    jobLoc('exampleco', 'senior-ai-engineer'),
    'https://dynamitejobs.com/skill/remote-copywriting-jobs',
    'https://evil.example/company/x/remote-job/y',
    `${jobLoc('exampleco', 'with-query')}?ref=1`,
  ]));
  check(jobs.length === 1 && jobs[0].title === 'Senior AI Engineer' && jobs[0].company === 'Exampleco'
    && jobs[0].location === 'Remote' && !('postedAt' in jobs[0]),
  'sitemap rows take the slug title, keep only posting URLs once, and never map lastmod to postedAt', jobs);
  const none = mod.parseSitemap(urlset(['https://dynamitejobs.com/skill/remote-copywriting-jobs']));
  check(Array.isArray(none) && none.length === 0, 'a sitemap with other URLs but no posting URL is an empty board');
  for (const [body, label] of [['', 'an empty body'], ['<html><body>Not found</body></html>', 'an HTML body']]) {
    let msg = '';
    try { mod.parseSitemap(body); } catch (err) { msg = err.message; }
    check(/dynamitejobs: (empty|unexpected)/.test(msg), `${label} where the sitemap is expected throws`, msg);
  }
}

{
  const { ctx, calls } = stubCtx(() => many(5));
  const jobs = await provider.fetch(ENTRY, { ...ctx, maxPages: 1 });
  check(calls.length === 1 && calls[0].url === SITEMAP && jobs.length === 5 && jobs.every((j) => !j.postedAt),
    'a probe reads exactly the sitemap and no posting page', calls.length);
  const boom = new Error('budget reached');
  const probe = stubCtx(() => { throw boom; });
  let got;
  try { await provider.fetch(ENTRY, { ...probe.ctx, maxPages: 1 }); } catch (err) { got = err; }
  check(got === boom, 'a ctx.fetch rejection under a probe propagates unwrapped');
}

{
  const { ctx, calls } = stubCtx((url) => (url === SITEMAP ? many(40) : detail(POSTING)));
  const { result, lines } = await captureStderr(() => provider.fetch({ ...ENTRY, dynamitejobs: { detailLimit: 10 } }, ctx));
  const details = calls.filter((c) => c.url !== SITEMAP);
  check(details.length === 10, 'detailLimit caps the posting-page fetches', details.length);
  check(calls.every((c) => c.opts?.redirect === 'error'), 'every request passes redirect: error');
  check(result.length === 40 && lines.some((l) => /raise dynamitejobs\.detailLimit/.test(l)),
    'rows past detailLimit keep their slug title, with a warning', lines);
  const enriched = result[0];
  check(enriched.title === 'R&D Operations Manager' && enriched.company === 'Acme Remote Co'
    && enriched.location === 'Remote (Canada, Mexico)' && enriched.postedAt === Date.parse(POSTING.datePosted)
    && enriched.description === 'Run the money & the team.',
  'JSON-LD fills title (entity-decoded, ", Remote Job" dropped), employer, date, location and description', enriched);
  check(/\bR&D\b/.test(enriched.title), 'an encoded &amp; is decoded before a keyword match runs');
}

{
  const locs = [jobLoc('exampleco', 'ai-engineer'), jobLoc('exampleco', 'bookkeeper'), jobLoc('exampleco', 'ml-engineer')];
  const { ctx, calls } = stubCtx((url) => (url === SITEMAP ? urlset(locs) : detail({ ...POSTING, title: 'Engineer' })), {
    titleWanted: (title) => /engineer/i.test(title),
  });
  const jobs = await provider.fetch(ENTRY, ctx);
  const details = calls.filter((c) => c.url !== SITEMAP).map((c) => c.url);
  check(details.length === 2 && !details.includes(locs[1]), 'posting pages are read only for rows ctx.titleWanted keeps', details);
  check(jobs.length === 3 && jobs[1].title === 'Bookkeeper', 'rows the title filter drops come back untouched');
}

{
  const err404 = Object.assign(new Error('HTTP 404'), { status: 404 });
  const locs = [jobLoc('exampleco', 'one'), jobLoc('exampleco', 'two'), jobLoc('exampleco', 'three')];
  const { ctx } = stubCtx((url) => {
    if (url === SITEMAP) return urlset(locs);
    if (url === locs[1]) throw err404;
    if (url === locs[2]) return '<html>no json-ld</html>';
    return detail(POSTING);
  });
  const { result, lines } = await captureStderr(() => provider.fetch(ENTRY, ctx));
  check(result?.length === 1 && result[0].url === locs[0], 'a row whose posting page fails or has no JobPosting is dropped', result);
  check(lines.some((l) => /dropped 2 posting/.test(l)), 'the dropped rows are reported in a warning', lines);
}

{
  const { ctx } = stubCtx((url) => (url === SITEMAP ? many(2) : CHALLENGE));
  const { error } = await captureStderr(() => provider.fetch(ENTRY, ctx));
  check(/bot-challenge/.test(error?.message ?? ''), 'a challenge page on the detail path throws instead of dropping every row', error?.message);
  check(mod.parseDetailPage(detail({ ...POSTING, datePosted: 'not a date' }))?.postedAt === undefined, 'an unparseable datePosted leaves postedAt unset');
  const err403 = Object.assign(new Error('HTTP 403'), { status: 403, body: CHALLENGE });
  const walled = stubCtx((url) => { if (url === SITEMAP) return many(2); throw err403; });
  const { error: wallErr } = await captureStderr(() => provider.fetch(ENTRY, walled.ctx));
  check(wallErr === err403, 'a challenge page served as HTTP 403 on the detail path fails the fetch', wallErr?.message);
  let drift = '';
  try { mod.parseSitemap(urlset([`${jobLoc('exampleco', 'ai-engineer')}/`, 'https://dynamitejobs.com/company/ExampleCo/remote-job/AI_Engineer'])); } catch (err) { drift = err.message; }
  check(/URL scheme changed/.test(drift), '/remote-job/ URLs none of which parse throw instead of reading as an empty board', drift);
}
