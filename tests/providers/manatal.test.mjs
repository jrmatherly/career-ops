// tests/providers/manatal.test.mjs — Manatal careers-page.com list API.
// Fixtures are fictional; no network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — manatal');

const mod = await import(pathToFileURL(join(ROOT, 'providers/manatal.mjs')).href);
const manatal = mod.default;

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const row = (n, extra = {}) => ({
  id: n,
  hash: `H${n}ASH`,
  position_name: `Role ${n}`,
  location_display: 'Springfield, Illinois, United States',
  description: '<p>Data &amp; analytics</p>',
  organization_name: 'Engineering',
  ...extra,
});
const pageOf = (start, n, more) => ({ count: 999, next: more ? 'https://www.careers-page.com/api/v1.0/c/acme/jobs/?page=2' : null, previous: null, results: Array.from({ length: n }, (_, i) => row(start + i)) });

function stubCtx(answer) {
  const calls = [];
  const ctx = {
    sleep: async () => {},
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      const body = answer(Number(new URL(url).searchParams.get('page')));
      if (body instanceof Error) throw body;
      return body;
    },
  };
  return { ctx, calls };
}
const entry = (extra = {}) => ({ name: 'Example Manatal Co', careers_url: 'https://www.careers-page.com/acme', ...extra });
async function captureStderr(fn) {
  const orig = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try { return { value: await fn(), lines }; } finally { console.error = orig; }
}
async function rejects(fn) {
  try { await fn(); return ''; } catch (e) { return e.message || String(e); }
}

check(manatal.id === 'manatal', 'manatal.id is "manatal"');
for (const [url, want] of [
  ['https://www.careers-page.com/acme', 'https://www.careers-page.com/acme'],
  ['https://careers-page.com/acme-co/', 'https://www.careers-page.com/acme-co'],
  ['https://www.careers-page.com/acme/job/H1ASH', 'https://www.careers-page.com/acme'],
]) {
  check(manatal.detect({ careers_url: url })?.url === want, `detect() claims ${url}`);
}
for (const [label, e] of [
  ['lever URL', { careers_url: 'https://jobs.lever.co/x' }],
  ['greenhouse URL', { careers_url: 'https://job-boards.greenhouse.io/x' }],
  ['look-alike host', { careers_url: 'https://www.careers-page.com.evil.example/acme' }],
  ['http scheme', { careers_url: 'http://www.careers-page.com/acme' }],
  ['bare host with no slug', { careers_url: 'https://www.careers-page.com/' }],
  ['the list API URL', { careers_url: 'https://www.careers-page.com/api/v1.0/c/acme/jobs/' }],
  ['slug outside [a-z0-9-]', { careers_url: 'https://www.careers-page.com/Acme_Co' }],
  ['malformed URL', { careers_url: 'nope' }],
  ['missing careers_url', {}],
  ['non-string careers_url', { careers_url: 3 }],
]) {
  let r;
  try { r = manatal.detect(e); } catch { r = 'threw'; }
  check(r === null, `detect() returns null for ${label}`);
}

for (const [label, url] of [['off-host', 'https://evil.example/acme'], ['non-https', 'http://www.careers-page.com/acme']]) {
  const { ctx, calls } = stubCtx(() => pageOf(1, 1, false));
  const msg = await rejects(() => manatal.fetch(entry({ provider: 'manatal', careers_url: url }), ctx));
  check(/is not https:\/\/www\.careers-page\.com/.test(msg) && calls.length === 0, `an ${label} careers_url throws before any request`);
}

{
  const { ctx, calls } = stubCtx(() => ({ count: 3, next: null, previous: null, results: [row(1), row(2, { position_name: '' }), row(3, { hash: '' })] }));
  const jobs = await manatal.fetch(entry(), ctx);
  const u = new URL(calls[0].url);
  check(u.hostname === 'www.careers-page.com' && u.pathname === '/api/v1.0/c/acme/jobs/' && u.searchParams.get('page') === '1', 'requests the tenant list API');
  check(calls.every((c) => c.opts?.redirect === 'error'), 'every request passes redirect: "error"');
  check(jobs.length === 1, 'rows missing a title or hash are dropped');
  const [j] = jobs;
  check(j.url === 'https://www.careers-page.com/acme/job/H1ASH', 'job URL is /{slug}/job/{hash} with no trailing slash');
  check(j.company === 'Example Manatal Co' && j.location === 'Springfield, Illinois, United States', 'company is the entry name and location is location_display');
  check(j.description === 'Data & analytics' && !('postedAt' in j), 'description through htmlToText and no postedAt');
}

{
  const { ctx } = stubCtx(() => ({ count: 0, next: null, previous: null, results: [] }));
  const jobs = await manatal.fetch(entry(), ctx);
  check(Array.isArray(jobs) && jobs.length === 0, '{count:0, results:[]} returns []');
  for (const [label, body] of [['missing results', { count: 2 }], ['object results', { results: {} }], ['bare string', 'x'], ['null', null]]) {
    const msg = await rejects(() => manatal.fetch(entry(), stubCtx(() => body).ctx));
    check(/expected results\[\]/.test(msg), `${label} throws naming the envelope`);
  }
}

{
  // The API serves 20 rows a page whatever page_size asks; `next` decides, not the row count.
  const { ctx, calls } = stubCtx((page) => (page === 1 ? pageOf(1, 20, true) : pageOf(100, 12, false)));
  const jobs = await manatal.fetch(entry(), ctx);
  check(calls.length === 2 && jobs.length === 32, 'pagination follows next until null, never stopping on a short page alone');
  check(calls.map((c) => c.url).join() === [1, 2].map((n) => `https://www.careers-page.com/api/v1.0/c/acme/jobs/?page_size=100&page=${n}`).join(), 'page URLs are built by the provider, not read from next');
}

{
  const { ctx, calls } = stubCtx((page) => pageOf(page * 100, 20, true));
  const { lines } = await captureStderr(() => manatal.fetch(entry(), ctx));
  check(calls.length === 20 && lines.some((l) => /raise max_pages/.test(l)), 'DEFAULT_MAX_PAGES (20) stops a board that never ends and warns');
}

{
  const { ctx, calls } = stubCtx((page) => pageOf(page * 100, 20, true));
  await manatal.fetch(entry(), { ...ctx, maxPages: 1 });
  check(calls.length === 1, 'ctx.maxPages: 1 makes exactly one request');
}

{
  const { ctx } = stubCtx((page) => (page === 1 ? pageOf(1, 20, true) : pageOf(20, 5, false)));
  const jobs = await manatal.fetch(entry(), ctx);
  check(jobs.length === 24, 'a row shifted onto the next page mid-walk is returned once');
}

{
  const err = Object.assign(new Error('HTTP 503'), { status: 503 });
  const { ctx } = stubCtx((page) => (page === 1 ? pageOf(1, 20, true) : err));
  const { value: jobs, lines } = await captureStderr(() => manatal.fetch(entry(), ctx));
  check(jobs.length === 20 && lines.some((l) => /keeping 20/.test(l)) && !lines.some((l) => /raise max_pages/.test(l)), 'a page-2 failure keeps page 1 and warns without the max_pages warning');
}

{
  class ProbeStop extends Error {}
  const sentinel = new ProbeStop('budget');
  let got;
  try { await manatal.fetch(entry(), { ...stubCtx(() => sentinel).ctx, maxPages: 1 }); } catch (e) { got = e; }
  check(got === sentinel, 'a fetch rejection while probing propagates unwrapped');
}
