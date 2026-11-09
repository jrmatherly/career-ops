// tests/providers/bullhorn.test.mjs — Bullhorn public career-portal REST.
// Fixtures are fictional; no network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — bullhorn');

const mod = await import(pathToFileURL(join(ROOT, 'providers/bullhorn.mjs')).href);
const bullhorn = mod.default;
const { resolveTenant, assertBullhornUrl } = mod;

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const ORIGIN = 'https://jobs.example.com';
const APP = { companyName: 'Acme Staffing', careersUrl: '', service: { batchSize: 500, corpToken: 'AB12CD', swimlane: '31' } };
const row = (id, extra = {}) => ({
  id,
  title: `Role ${id}`,
  address: { city: 'Austin', state: 'Texas', countryID: 1 },
  employmentType: 'Contract',
  dateLastPublished: 1788185720947,
  publicDescription: '<p>Build &amp; ship <strong>things</strong></p>',
  ...extra,
});
const rows = (start, n) => Array.from({ length: n }, (_, i) => row(start + i));

function stubCtx({ app = APP, page = () => ({ total: 0, start: 0, count: 0, data: [] }) } = {}) {
  const calls = [];
  const ctx = {
    sleep: async () => {},
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      const body = url.endsWith('/app.json') ? app : page(Number(new URL(url).searchParams.get('start')), url);
      if (body instanceof Error) throw body;
      return body;
    },
  };
  return { ctx, calls };
}
const entry = (extra = {}) => ({ name: 'Example Bullhorn Co', provider: 'bullhorn', careers_url: `${ORIGIN}/`, ...extra });
const listCalls = (calls) => calls.filter((c) => !c.url.endsWith('/app.json'));

async function captureStderr(fn) {
  const orig = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try { return { value: await fn(), lines }; } finally { console.error = orig; }
}
async function rejects(fn) {
  try { await fn(); return ''; } catch (e) { return e.message || String(e); }
}

check(bullhorn.id === 'bullhorn', 'bullhorn.id is "bullhorn"');
check(bullhorn.detect(entry())?.url === ORIGIN, 'detect() claims provider: bullhorn with an https careers_url');
for (const [label, e] of [
  ['lever URL without provider', { careers_url: 'https://jobs.lever.co/x' }],
  ['greenhouse URL without provider', { careers_url: 'https://job-boards.greenhouse.io/x' }],
  ['branded host without provider', { careers_url: `${ORIGIN}/` }],
  ['http careers_url', { provider: 'bullhorn', careers_url: 'http://jobs.example.com/' }],
  ['malformed careers_url', { provider: 'bullhorn', careers_url: 'not a url' }],
  ['missing careers_url', { provider: 'bullhorn' }],
  ['non-string careers_url', { provider: 'bullhorn', careers_url: 7 }],
]) {
  let r;
  try { r = bullhorn.detect(e); } catch { r = 'threw'; }
  check(r === null, `detect() returns null for ${label}`);
}

check(assertBullhornUrl('https://public-rest31.bullhornstaffing.com/x') === 'https://public-rest31.bullhornstaffing.com/x', 'assertBullhornUrl accepts public-rest{N}.bullhornstaffing.com');
for (const bad of ['https://public-rest31.bullhornstaffing.com.evil.example/x', 'https://evilbullhornstaffing.com/x', 'http://public-rest31.bullhornstaffing.com/x', 'https://public-rest1234.bullhornstaffing.com/x']) {
  let threw = false;
  try { assertBullhornUrl(bad); } catch { threw = true; }
  check(threw, `assertBullhornUrl rejects ${bad}`);
}

{
  const { ctx, calls } = stubCtx();
  const msg = await rejects(() => bullhorn.fetch(entry({ careers_url: 'http://jobs.example.com/' }), ctx));
  check(/not an https URL/.test(msg) && calls.length === 0, 'a non-https careers_url throws before any request');
}

{
  const { ctx, calls } = stubCtx({ page: () => ({ total: 2, start: 0, count: 2, data: [row(11), { id: 12 }, { title: 'No id' }] }) });
  const jobs = await bullhorn.fetch(entry(), ctx);
  check(calls[0].url === `${ORIGIN}/app.json`, 'the tenant tuple is read from the careers origin\'s app.json');
  const list = new URL(listCalls(calls)[0].url);
  check(list.hostname === 'public-rest31.bullhornstaffing.com' && list.pathname === '/rest-services/AB12CD/search/JobOrder', 'the list request uses the app.json swimlane and corpToken');
  check(list.searchParams.get('query') === '(isOpen:1) AND (isDeleted:0)' && list.searchParams.get('count') === '500' && list.searchParams.get('start') === '0', 'the list request asks for open, undeleted job orders 500 at a time');
  check(calls.every((c) => c.opts?.redirect === 'error'), 'every request passes redirect: "error"');
  check(jobs.length === 1, 'rows missing a title or id are dropped');
  const [j] = jobs;
  check(j.url === `${ORIGIN}/#/jobs/11` && j.company === 'Example Bullhorn Co', 'job URL is on the careers origin and company is the agency');
  check(j.location === 'Austin, Texas, US', 'location joins city, state and US for countryID 1');
  check(j.postedAt === 1788185720947 && j.requisitionId === '11', 'postedAt is dateLastPublished and requisitionId the job order id');
  check(j.description === 'Build & ship things', 'publicDescription goes through htmlToText');
  const other = await bullhorn.fetch(entry(), stubCtx({ page: () => ({ total: 1, data: [row(1, { address: { city: 'Leeds', countryID: 2359 } })] }) }).ctx);
  check(other[0].location === 'Leeds', 'a non-US countryID is omitted from location');
}

{
  const { ctx, calls } = stubCtx({ app: { ...APP, careersUrl: 'https://evil.example/portal' }, page: () => ({ total: 1, data: [row(5)] }) });
  const { value: jobs, lines } = await captureStderr(() => bullhorn.fetch(entry(), ctx));
  check(jobs[0].url === `${ORIGIN}/#/jobs/5` && lines.some((l) => /evil\.example/.test(l)), 'an app.json careersUrl on another origin is ignored and logged');
  check(!calls.some((c) => c.url.includes('evil.example')), 'nothing is requested from the app.json careersUrl');
}

for (const [label, service] of [
  ['swimlane', { swimlane: '31; rm', corpToken: 'AB12CD' }],
  ['corpToken', { swimlane: '31', corpToken: '../x' }],
]) {
  const { ctx, calls } = stubCtx({ app: { ...APP, service } });
  const msg = await rejects(() => bullhorn.fetch(entry(), ctx));
  check(msg.includes(label) && listCalls(calls).length === 0, `a malformed app.json ${label} throws before any list request`);
}

{
  const { ctx, calls } = stubCtx({ app: { companyName: 'x' } });
  const msg = await rejects(() => bullhorn.fetch(entry(), ctx));
  check(/no service block/.test(msg) && listCalls(calls).length === 0, 'an app.json with no service block throws');
}

{
  const { ctx, calls } = stubCtx({ page: () => ({ total: 1, data: [row(1)] }) });
  await bullhorn.fetch(entry({ bullhorn: { swimlane: 7, corpToken: 'ZZ99' } }), ctx);
  check(!calls.some((c) => c.url.endsWith('/app.json')) && new URL(calls[0].url).hostname === 'public-rest7.bullhornstaffing.com', 'override config skips app.json');
  const msg = await rejects(() => resolveTenant(entry({ bullhorn: { swimlane: '1', corpToken: 'lower' } }), ctx));
  check(/corpToken/.test(msg), 'a malformed override corpToken throws');
}

{
  const cache = new Map();
  const idCache = { get: (k) => cache.get(k), set: (k, v) => cache.set(k, v), delete: (k) => cache.delete(k) };
  const { ctx, calls } = stubCtx();
  await resolveTenant(entry(), { ...ctx, idCache });
  await resolveTenant(entry(), { ...ctx, idCache });
  check(calls.length === 1 && cache.get('jobs.example.com')?.id?.corpToken === 'AB12CD', 'ctx.idCache keeps the tuple between scans');
}

{
  const { ctx } = stubCtx({ page: () => ({ total: 0, start: 0, count: 0, data: [] }) });
  const jobs = await bullhorn.fetch(entry(), ctx);
  check(Array.isArray(jobs) && jobs.length === 0, '{total:0, data:[]} returns []');
  for (const [label, body] of [['missing data', { total: 3 }], ['object data', { data: {} }], ['bare string', 'nope'], ['null', null]]) {
    const msg = await rejects(() => bullhorn.fetch(entry(), stubCtx({ page: () => body }).ctx));
    check(/expected data\[\]/.test(msg), `${label} throws naming the envelope`);
  }
}

{
  const { ctx, calls } = stubCtx({ page: (start) => ({ total: 1200, data: rows(start, start >= 1000 ? 200 : 500) }) });
  const jobs = await bullhorn.fetch(entry(), ctx);
  check(listCalls(calls).length === 3 && jobs.length === 1200, 'pagination walks start=0,500,1000 and stops on the short page');
}

{
  const { ctx, calls } = stubCtx({ page: (start) => ({ total: 1200, data: rows(start, Math.min(200, 1200 - start)) }) });
  const jobs = await bullhorn.fetch(entry(), ctx);
  const starts = listCalls(calls).map((c) => new URL(c.url).searchParams.get('start'));
  check(jobs.length === 1200 && starts.join() === '0,200,400,600,800,1000', 'a tenant capping count below 500 is still walked to total, start advancing by rows served');
}

{
  const { ctx, calls } = stubCtx({ page: (start) => ({ total: 99999, data: rows(start, 500) }) });
  const { lines } = await captureStderr(() => bullhorn.fetch(entry(), ctx));
  check(listCalls(calls).length === 20, 'DEFAULT_MAX_PAGES (20) stops a board that never ends');
  check(lines.some((l) => /raise max_pages/.test(l)), 'the max_pages ceiling warns');
}

{
  const { ctx, calls } = stubCtx({ page: (start) => ({ total: 99999, data: rows(start, 500) }) });
  await bullhorn.fetch(entry(), { ...ctx, maxPages: 1 });
  check(listCalls(calls).length === 1, 'ctx.maxPages: 1 makes exactly one list request');
}

{
  const err = Object.assign(new Error('HTTP 503'), { status: 503 });
  const { ctx } = stubCtx({ page: (start) => (start === 0 ? { total: 2000, data: rows(0, 500) } : err) });
  const { value: jobs, lines } = await captureStderr(() => bullhorn.fetch(entry(), ctx));
  check(jobs.length === 500 && lines.some((l) => /keeping 500/.test(l)) && !lines.some((l) => /raise max_pages/.test(l)), 'a page-2 failure keeps page 1 and warns without the max_pages warning');
}

{
  class ProbeStop extends Error {}
  const sentinel = new ProbeStop('budget');
  const { ctx } = stubCtx({ page: () => sentinel });
  let got;
  try { await bullhorn.fetch(entry(), { ...ctx, maxPages: 1 }); } catch (e) { got = e; }
  check(got === sentinel, 'a fetch rejection while probing propagates unwrapped');
}
