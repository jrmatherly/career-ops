// tests/providers/madgex.test.mjs — Madgex RSS boards (Chronicle, Inside Higher
// Ed, Science Careers). Fixtures are fictional; no network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';

console.log('\nProvider — madgex');

const mod = await import(pathToFileURL(join(ROOT, 'providers/madgex.mjs')).href);
const madgex = mod.default;
const { parseMadgexFeed } = mod;

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

const item = (n, title = `Acme College: Role ${n}`) => `<item>
  <title>${title}</title>
  <description>
Competitive:

Acme College:
A short summary of role ${n}
Springfield, Illinois
</description>
  <link>https://jobs.chronicle.com/job/${1000 + n}/role-${n}/?TrackID=10&amp;utm_source=rss&amp;utm_medium=feed</link>
  <pubDate>Fri, 06 Nov 2026 16:45:00 -0500</pubDate>
</item>`;
const feed = (items, total = 9999) => `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel>
<opensearch:totalResults>${total}</opensearch:totalResults><title>Job Search RSS</title>
${items.join('\n')}
</channel></rss>`;
const fullPage = (start) => feed(Array.from({ length: 20 }, (_, i) => item(start + i)));

function stubCtx(pages) {
  const calls = [];
  const ctx = {
    sleep: async () => {},
    fetchText: async (url, opts) => {
      calls.push({ url, opts });
      const u = new URL(url);
      const body = pages(Number(u.searchParams.get('page')), u.searchParams.get('keywords'), calls.length);
      if (body instanceof Error) throw body;
      return body;
    },
  };
  return { ctx, calls };
}

const entry = (extra = {}) => ({ name: 'Example Madgex Co', provider: 'madgex', careers_url: 'https://jobs.chronicle.com/', madgex: { keywords: ['data'] }, ...extra });

async function captureStderr(fn) {
  const orig = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try { return { value: await fn(), lines }; } finally { console.error = orig; }
}

check(madgex.id === 'madgex', 'madgex.id is "madgex"');

for (const host of ['jobs.chronicle.com', 'careers.insidehighered.com', 'jobs.sciencecareers.org']) {
  const hit = madgex.detect({ provider: 'madgex', careers_url: `https://${host}/` });
  check(hit?.url === `https://${host}/jobsrss/`, `detect() claims provider: madgex on ${host}`);
}
for (const [label, e] of [
  ['lever URL', { provider: 'madgex', careers_url: 'https://jobs.lever.co/x' }],
  ['greenhouse URL', { provider: 'madgex', careers_url: 'https://job-boards.greenhouse.io/x' }],
  ['lever URL without provider', { careers_url: 'https://jobs.lever.co/x' }],
  ['greenhouse URL without provider', { careers_url: 'https://job-boards.greenhouse.io/x' }],
  ['trusted host without provider', { careers_url: 'https://jobs.chronicle.com/' }],
  ['http scheme', { provider: 'madgex', careers_url: 'http://jobs.chronicle.com/' }],
  ['malformed URL', { provider: 'madgex', careers_url: 'not a url' }],
  ['missing careers_url', { provider: 'madgex' }],
  ['non-string careers_url', { provider: 'madgex', careers_url: 42 }],
]) {
  let r;
  try { r = madgex.detect(e); } catch { r = 'threw'; }
  check(r === null, `detect() returns null for ${label}`);
}

{
  const jobs = parseMadgexFeed(feed([item(1, 'Acme College: Dean of R&amp;D'), item(2)]), 'jobs.chronicle.com');
  check(jobs.length === 2, 'parseMadgexFeed parses both items');
  const [a] = jobs;
  check(a.title === 'Dean of R&D' && a.company === 'Acme College', 'title is decoded and split from the employer on the first ": "');
  check(a.url === 'https://jobs.chronicle.com/job/1001/role-1/', 'link loses TrackID and utm_* params');
  check(a.location === 'Springfield, Illinois', 'location is the last description line');
  check(a.postedAt === Date.parse('Fri, 06 Nov 2026 16:45:00 -0500'), 'postedAt from pubDate');
  check(a.description.includes('A short summary of role 1'), 'description is the decoded description text');
  const off = parseMadgexFeed(feed([item(3).replace('jobs.chronicle.com', 'evil.example')]));
  check(off.length === 0, 'an item linking off the Madgex hosts is dropped');
  const nested = parseMadgexFeed(feed([item(5, 'Acme University: School of Medicine: Assistant Professor')
    .replace('Acme College:\n', 'Acme University: School of Medicine:\n')]));
  check(nested[0]?.company === 'Acme University: School of Medicine' && nested[0]?.title === 'Assistant Professor',
    'an employer holding ": " splits at the employer line the description repeats');
  const wrongHost = parseMadgexFeed(feed([item(4)]), 'jobs.sciencecareers.org');
  check(wrongHost.length === 0, 'an item on another Madgex host than the entry is dropped');
}

{
  const { ctx, calls } = stubCtx(() => fullPage(0));
  let threw = false;
  try { await madgex.fetch(entry({ careers_url: 'https://evil.example/' }), ctx); } catch { threw = true; }
  check(threw && calls.length === 0, 'an off-allowlist careers_url throws before any request');
  threw = false;
  try { await madgex.fetch(entry({ careers_url: 'http://jobs.chronicle.com/' }), ctx); } catch { threw = true; }
  check(threw && calls.length === 0, 'a non-https careers_url throws before any request');
}

{
  const { ctx } = stubCtx(() => '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>');
  let msg = '';
  try { await madgex.fetch(entry(), ctx); } catch (e) { msg = e.message; }
  check(/HTML page, not a feed/.test(msg), 'an HTML body where XML is expected throws');
}

{
  const { ctx } = stubCtx(() => feed([], 0));
  const jobs = await madgex.fetch(entry(), ctx);
  check(Array.isArray(jobs) && jobs.length === 0, 'a feed with zero items returns []');
}

{
  const { ctx, calls } = stubCtx(() => fullPage(0));
  await madgex.fetch(entry({ madgex: { keywords: ['a', 'b'] } }), { ...ctx, maxPages: 1 });
  check(calls.length === 1, 'ctx.maxPages: 1 makes exactly one request');
}

{
  const { ctx, calls } = stubCtx((page) => (page <= 2 ? fullPage(page * 100) : feed([])));
  const jobs = await madgex.fetch(entry(), ctx);
  check(calls.length === 3 && jobs.length === 40, 'pagination stops on the empty page past the end');
  check(calls.every((c) => c.opts?.redirect === 'error'), 'every request passes redirect: "error"');
  check(calls.every((c) => new URL(c.url).searchParams.get('keywords') === 'data'), 'the keyword rides on every page');
  check(calls.every((c) => new URL(c.url).searchParams.get('sort') === 'Date'), 'every page asks for newest first (sort=Date)');
}

{
  const { ctx, calls } = stubCtx((page) => fullPage(page * 100));
  const { value: jobs, lines } = await captureStderr(() => madgex.fetch(entry(), ctx));
  check(calls.length === 25 && jobs.length === 500, 'DEFAULT_MAX_PAGES (25) stops a board that never ends');
  check(lines.some((l) => /raise max_pages/.test(l)), 'the max_pages ceiling warns');
}

{
  const { ctx, calls } = stubCtx((page) => (page === 1 ? feed(Array.from({ length: 20 }, (_, i) => item(i)), 20) : fullPage(500)));
  await madgex.fetch(entry(), ctx);
  check(calls.length === 1, 'a walk that reached totalResults stops without another request');
}

{
  // Pass "b" page 1 fully overlaps pass "a"; its page 2 still holds unique rows.
  const { ctx } = stubCtx((page, kw) => {
    if (kw === 'a') return page === 1 ? fullPage(0) : feed([]);
    return page === 1 ? fullPage(0) : page === 2 ? fullPage(300) : feed([]);
  });
  const jobs = await madgex.fetch(entry({ madgex: { keywords: ['a', 'b'] } }), ctx);
  check(jobs.length === 40, 'keyword passes dedupe by URL and an overlapping pass still walks its deeper pages');
}

{
  const err = Object.assign(new Error('HTTP 503'), { status: 503 });
  const { ctx } = stubCtx((page) => (page === 1 ? fullPage(0) : err));
  const { value: jobs, lines } = await captureStderr(() => madgex.fetch(entry(), ctx));
  check(jobs.length === 20, 'a page-2 failure retry cannot clear keeps page 1');
  check(lines.some((l) => /keeping the pages/.test(l)) && !lines.some((l) => /raise max_pages/.test(l)), 'the fetch-error stop warns without the max_pages warning');
}

{
  const err = Object.assign(new Error('HTTP 503'), { status: 503 });
  const { ctx } = stubCtx(() => err);
  let msg = '';
  try { await madgex.fetch(entry(), ctx); } catch (e) { msg = e.message; }
  check(/all 1 keyword request\(s\) failed/.test(msg), 'every keyword failing on page 1 throws');
}

{
  const err = Object.assign(new Error('HTTP 503'), { status: 503 });
  const { ctx } = stubCtx((page, kw) => (kw === 'a' ? err : page === 1 ? fullPage(0) : feed([])));
  const { value: jobs, lines } = await captureStderr(() => madgex.fetch(entry({ madgex: { keywords: ['a', 'b'] } }), ctx));
  check(jobs.length === 20 && lines.some((l) => /"a" page 1/.test(l)), 'one keyword failing on page 1 warns and the others still return');
}

{
  class ProbeStop extends Error {}
  const sentinel = new ProbeStop('budget');
  const { ctx } = stubCtx(() => sentinel);
  let got;
  try { await madgex.fetch(entry(), { ...ctx, maxPages: 1 }); } catch (e) { got = e; }
  check(got === sentinel, 'a fetch rejection while probing propagates unwrapped');
}

{
  const before = process.env.CAREER_OPS_PROFILE;
  process.env.CAREER_OPS_PROFILE = join(tmpdir(), `career-ops-madgex-absent-${process.pid}.yml`);
  try {
    const { ctx, calls } = stubCtx(() => feed([]));
    let msg = '';
    try { await madgex.fetch(entry({ madgex: undefined }), ctx); } catch (e) { msg = e.message; }
    check(/no madgex\.keywords/.test(msg) && calls.length === 0, 'no keywords and no profile target_roles throws before any request');
  } finally {
    if (before === undefined) delete process.env.CAREER_OPS_PROFILE;
    else process.env.CAREER_OPS_PROFILE = before;
  }
}
