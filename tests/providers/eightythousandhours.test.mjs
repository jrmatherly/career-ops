// tests/providers/eightythousandhours.test.mjs — 80,000 Hours job board via its
// public Algolia index. Fixtures are fictional (the key below is made up); no network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — eightythousandhours');

const mod = await import(pathToFileURL(join(ROOT, 'providers/eightythousandhours.mjs')).href);
const eh = mod.default;
const { parseAlgoliaConfig, parseAlgoliaHits } = mod;

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const KEY = '0123456789abcdef0123456789abcdef';
const PAGE = `<html><head><script>window.__NUXT__={};window.__NUXT__.config={public:{apiBase:"https://api.example.com",algoliaApplicationId:"ABC123XYZ",algoliaApiKey:"${KEY}",algoliaJobsIndexClosing:"jobs_closing",algoliaJobsIndex:"jobs_test",algoliaStrictIndex:"jobs_strict"}}</script></head></html>`;
const hit = (n, extra = {}) => ({
  objectID: String(n),
  post_pk: n,
  title: `Role ${n}`,
  company_name: 'Acme Institute',
  card_locations: ['Springfield, US', 'Remote'],
  posted_at: 1793923500,
  url_external: `https://jobs.example.com/apply/${n}`,
  description: '',
  description_short: '<p>Research &amp; policy work</p>',
  ...extra,
});

function stubCtx(answer) {
  const calls = [];
  const ctx = {
    sleep: async () => {},
    fetchText: async (url, opts) => { calls.push({ url, opts }); return PAGE; },
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      const body = answer(JSON.parse(opts.body), calls.length);
      if (body instanceof Error) throw body;
      return body;
    },
  };
  return { ctx, calls };
}
const entry = (extra = {}) => ({ name: '80,000 Hours', provider: 'eightythousandhours', ...extra });
const queries = (calls) => calls.filter((c) => c.opts?.method === 'POST');
async function captureStderr(fn) {
  const orig = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try { return { value: await fn(), lines }; } finally { console.error = orig; }
}
async function rejects(fn) {
  try { await fn(); return ''; } catch (e) { return e.message || String(e); }
}

check(eh.id === 'eightythousandhours', 'id is "eightythousandhours"');
check(eh.detect({ provider: 'eightythousandhours' })?.url === 'https://jobs.80000hours.org/', 'detect() claims provider: eightythousandhours with no URL');
for (const [label, e] of [
  ['lever URL', { careers_url: 'https://jobs.lever.co/x' }],
  ['greenhouse URL', { careers_url: 'https://job-boards.greenhouse.io/x' }],
  ['the board URL without provider', { careers_url: 'https://jobs.80000hours.org/' }],
  ['another provider', { provider: 'techinasia' }],
  ['null', null],
]) {
  let r;
  try { r = eh.detect(e); } catch { r = 'threw'; }
  check(r === null, `detect() returns null for ${label}`);
}

{
  const cfg = parseAlgoliaConfig(PAGE);
  check(cfg.appId === 'ABC123XYZ' && cfg.apiKey === KEY && cfg.indexName === 'jobs_test', 'parseAlgoliaConfig reads app id, key and the jobs index (not a longer-named sibling)');
  for (const key of ['algoliaApplicationId', 'algoliaApiKey', 'algoliaJobsIndex']) {
    let msg = '';
    try { parseAlgoliaConfig(PAGE.replace(new RegExp(`${key}:"[^"]*"`), '')); } catch (e) { msg = e.message; }
    check(msg.includes(key) && !msg.includes(KEY), `a missing ${key} throws naming the field, never the key`);
  }
  let threw = false;
  try { parseAlgoliaConfig('<html>no config</html>'); } catch { threw = true; }
  check(threw, 'a page with no __NUXT__ config throws');
}

{
  const jobs = parseAlgoliaHits([hit(1), hit(2, { url_external: 'http://jobs.example.com/plain' }), hit(3, { url_external: 'https://jobs.example.com/shared' }), hit(4, { url_external: 'https://jobs.example.com/shared' }), hit(5, { title: '' }), hit(6, { post_pk: null })]);
  check(jobs.length === 4, 'hits missing a title or post_pk are dropped');
  const [a, b, c, d] = jobs;
  check(a.url === 'https://jobs.example.com/apply/1', 'an https employer link one posting owns is the job URL');
  check(b.url === 'https://jobs.80000hours.org/?jobPk=2', 'an http: url_external falls back to the board page');
  check(c.url === 'https://jobs.80000hours.org/?jobPk=3' && d.url === 'https://jobs.80000hours.org/?jobPk=4', 'a link shared by two postings falls back to each board page');
  check(a.company === 'Acme Institute' && a.location === 'Springfield, US; Remote', 'company and joined card_locations');
  check(a.postedAt === 1793923500 * 1000, 'posted_at seconds become epoch ms');
  check(a.description === 'Research & policy work', 'description_short goes through htmlToText when description is empty');
  check(!('closesAt' in a), 'closesAt is not set');
}

{
  const { ctx, calls } = stubCtx(() => ({ hits: [] }));
  const msg = await rejects(() => eh.fetch(entry({ careers_url: 'https://evil.example/' }), ctx));
  check(/is not https:\/\/jobs\.80000hours\.org/.test(msg) && calls.length === 0, 'an off-host careers_url throws before any request');
}

{
  const { ctx, calls } = stubCtx(() => ({ hits: [hit(1), hit(2)], nbHits: 2, nbPages: 1 }));
  const jobs = await eh.fetch(entry(), ctx);
  check(calls[0].url === 'https://jobs.80000hours.org/' && jobs.length === 2, 'reads the board page, then the index');
  const q = new URL(queries(calls)[0].url);
  check(q.hostname === 'abc123xyz-dsn.algolia.net' && q.pathname === '/1/indexes/jobs_test/query', 'queries the discovered app host and index');
  check(q.searchParams.get('x-algolia-api-key') === KEY && queries(calls)[0].opts.headers.referer === 'https://jobs.80000hours.org/', 'sends the discovered key and the board Referer');
  check(JSON.parse(queries(calls)[0].opts.body).hitsPerPage === 1000, 'asks for 1000 hits a page');
  check(calls.every((c) => c.opts?.redirect === 'error'), 'every request passes redirect: "error"');
  check(queries(calls).length === 1, 'a board inside the window needs one query');
}

{
  const { ctx } = stubCtx(() => ({ hits: [], nbHits: 0, nbPages: 0 }));
  const jobs = await eh.fetch(entry(), ctx);
  check(Array.isArray(jobs) && jobs.length === 0, '{hits: []} returns []');
  for (const [label, body] of [['missing hits', { nbHits: 3 }], ['object hits', { hits: {} }], ['bare string', 'x'], ['null', null]]) {
    const msg = await rejects(() => eh.fetch(entry(), stubCtx(() => body).ctx));
    check(/expected hits\[\]/.test(msg), `${label} throws naming the envelope`);
  }
}

{
  // 1,019 postings: the unfiltered query serves 1000, the two facet partitions cover the rest.
  const all = Array.from({ length: 1019 }, (_, i) => hit(i + 1, { card_locations: [] }));
  const remote = all.slice(0, 263);
  const onsite = all.slice(263);
  const { ctx, calls } = stubCtx(({ filters, page }) => {
    if (page > 0) return { hits: [], nbHits: 0, nbPages: 0 };
    if (!filters) return { hits: all.slice(0, 1000), nbHits: 1019, nbPages: 1 };
    const set = filters === 'tags_location_type:Remote' ? remote : onsite;
    return { hits: set, nbHits: set.length, nbPages: 1 };
  });
  const { value: jobs, lines } = await captureStderr(() => eh.fetch(entry(), ctx));
  const filters = queries(calls).map((c) => JSON.parse(c.opts.body).filters ?? '');
  check(jobs.length === 1019 && filters.join('|') === '|tags_location_type:Remote|NOT tags_location_type:Remote', 'a query cut by the 1000-hit window is partitioned on tags_location_type and deduped');
  check(lines.length === 0, 'a partition that fits the window warns nothing');
}

{
  const { ctx } = stubCtx(({ filters }) => (filters ? { hits: [hit(1)], nbHits: 1500, nbPages: 1 } : { hits: [hit(1)], nbHits: 3000, nbPages: 1 }));
  const { lines } = await captureStderr(() => eh.fetch(entry(), ctx));
  check(lines.some((l) => /not reachable/.test(l)), 'a partition still over the window warns');
}

{
  const { ctx, calls } = stubCtx(({ page }) => ({ hits: [hit(page * 10 + 1)], nbHits: 99999, nbPages: 99 }));
  const { lines } = await captureStderr(() => eh.fetch(entry(), { ...ctx, maxPages: 1 }));
  check(queries(calls).length === 1 && lines.length === 0, 'ctx.maxPages: 1 makes exactly one index query and no partitions');
}

{
  const { ctx, calls } = stubCtx(({ page, filters }) => (filters ? { hits: [], nbHits: 0, nbPages: 0 } : { hits: [hit(page + 1)], nbHits: 1, nbPages: 99 }));
  const { lines } = await captureStderr(() => eh.fetch(entry(), ctx));
  check(queries(calls).length === 3 && lines.some((l) => /raise max_pages/.test(l)), 'DEFAULT_MAX_PAGES (3) stops the walk and warns');
}

{
  class ProbeStop extends Error {}
  const sentinel = new ProbeStop('budget');
  const { ctx } = stubCtx(() => sentinel);
  let got;
  try { await eh.fetch(entry(), { ...ctx, maxPages: 1 }); } catch (e) { got = e; }
  check(got === sentinel, 'a fetch rejection while probing propagates unwrapped');
}

{
  const err = Object.assign(new Error('HTTP 403'), { status: 403 });
  const { ctx } = stubCtx(({ filters }) => (filters === 'NOT tags_location_type:Remote' ? err : { hits: filters ? [] : [hit(1), hit(2)], nbHits: filters ? 0 : 5, nbPages: 1 }));
  const { value: jobs, lines } = await captureStderr(() => eh.fetch(entry(), ctx));
  check(jobs.length === 2 && lines.some((l) => /partition .* failed/.test(l)), 'a failed partition keeps the postings already read and warns');
}

{
  const { calls, ctx } = stubCtx(() => ({ hits: [], nbHits: 0, nbPages: 0 }));
  await eh.fetch(entry({ careers_url: null }), ctx);
  const body = JSON.parse(queries(calls)[0].opts.body);
  check(calls.length === 2, 'a blank careers_url is treated as absent');
  check(Array.isArray(body.attributesToRetrieve) && body.attributesToRetrieve.includes('url_external') && body.attributesToHighlight.length === 0, 'the query asks only for the fields it reads');
}

{
  const [ms] = parseAlgoliaHits([hit(1, { posted_at: 1793923500000 })]);
  check(ms.postedAt === 1793923500000, 'a posted_at already in ms is not multiplied again');
}

{
  const err = Object.assign(new Error('HTTP 403'), { status: 403 });
  const msg = await rejects(() => eh.fetch(entry(), stubCtx(() => err).ctx));
  check(/403/.test(msg), 'an index failure fails loud rather than returning a partial board');
}
