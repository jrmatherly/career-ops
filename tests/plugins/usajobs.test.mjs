// tests/plugins/usajobs.test.mjs: contracts for the usajobs keyed provider
// (manifest shape, env gate, auth headers, pagination, dedup, normalizeItem).
// Every fetch goes to a stub ctx; fixtures are fictional. No network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

console.log('\nPlugin: usajobs');

const PLUGIN_DIR = join(ROOT, 'plugins', 'usajobs');
const mod = await import(pathToFileURL(join(PLUGIN_DIR, 'index.mjs')).href);
const provider = mod.default.provider;
const { normalizeItem } = mod;

const KEY = 'fixture-key-0000';
const EMAIL = 'tester@example.test';

const item = (n, overrides = {}) => ({
  MatchedObjectDescriptor: {
    PositionTitle: `Fictional Analyst ${n}`,
    PositionURI: `https://www.usajobs.gov/job/${String(n).padStart(9, '0')}`,
    OrganizationName: 'Office of Example Affairs',
    DepartmentName: 'Department of Placeholders',
    PositionLocationDisplay: 'Springfield, ZZ',
    PublicationStartDate: '2026-11-01T00:00:00.0000',
    UserArea: { Details: { JobSummary: 'A fictional summary.' } },
    ...overrides,
  },
});
const body = (items, pages) => ({ SearchResult: { SearchResultItems: items, UserArea: { NumberOfPages: pages } } });

function stubCtx(respond, env = { USAJOBS_API_KEY: KEY, USAJOBS_USER_AGENT: EMAIL }) {
  const calls = [];
  return {
    calls,
    env,
    async fetch(url, init) {
      calls.push({ url: new URL(url), init });
      const { status = 200, json } = respond(new URL(url), calls.length);
      return { ok: status >= 200 && status < 300, status, json: async () => json };
    },
  };
}
const entry = (usajobs = { keywords: ['analyst'] }) => ({ name: 'USAJOBS fixture', provider: 'usajobs', usajobs });
const rejection = (ctx, e = entry()) => provider.fetch(e, ctx).then(() => null, err => err);
// One fictional job per page, numbered by the page requested.
const paged = (numberOfPages) => (url) => ({ json: body([item(Number(url.searchParams.get('Page')))], numberOfPages) });

// Keep the profile fallback away from the developer's real data root.
const tmp = mkdtempSync(join(tmpdir(), 'usajobs-test-'));
const savedProfile = process.env.CAREER_OPS_PROFILE;
process.env.CAREER_OPS_PROFILE = join(tmp, 'missing-profile.yml');

try {
  const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, 'manifest.json'), 'utf8'));
  // Exact-element match, not substring: a hostile host could embed the name.
  if (manifest.id === 'usajobs' && manifest.apiVersion === 1 && manifest.humanInTheLoop === true
    && JSON.stringify(manifest.hooks) === '["provider"]'
    && ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'].every(n => manifest.requiredEnv.includes(n))
    && manifest.allowedHosts.some(h => h === 'data.usajobs.gov')) pass('usajobs manifest declares the provider hook, both env vars and data.usajobs.gov');
  else fail(`usajobs manifest shape wrong: ${JSON.stringify(manifest)}`);

  for (const missing of ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT']) {
    const env = { USAJOBS_API_KEY: KEY, USAJOBS_USER_AGENT: EMAIL };
    delete env[missing];
    const ctx = stubCtx(() => ({ json: body([], 1) }), env);
    const err = await rejection(ctx);
    if (err && err.message.includes(missing) && ctx.calls.length === 0) pass(`missing ${missing} throws naming it, before any request`);
    else fail(`missing ${missing}: err=${err?.message} calls=${ctx.calls.length}`);
  }

  {
    const ctx = stubCtx(() => ({ json: body([item(1)], 1) }));
    await provider.fetch(entry({ keywords: ['analyst'], location: 'Springfield, ZZ' }), ctx);
    const ok = ctx.calls.length > 0 && ctx.calls.every(({ url, init }) =>
      init.headers['Authorization-Key'] === KEY && init.headers['User-Agent'] === EMAIL
      && url.host === 'data.usajobs.gov' && url.searchParams.get('ResultsPerPage') === '500'
      && url.searchParams.get('LocationName') === 'Springfield, ZZ');
    if (ok) pass('every request carries Authorization-Key and the email User-Agent, on data.usajobs.gov with ResultsPerPage=500');
    else fail(`request shape wrong: ${JSON.stringify(ctx.calls.map(c => ({ url: c.url.href, headers: c.init?.headers })))}`);
  }

  {
    const ctx = stubCtx(() => ({ status: 401, json: {} }));
    const err = await rejection(ctx);
    if (err && err.message.includes('USAJOBS_API_KEY') && !err.message.includes(KEY)) pass('HTTP 401 rejects naming USAJOBS_API_KEY without echoing the key');
    else fail(`401 handling: ${err?.message}`);
  }

  {
    const ctx = stubCtx(() => ({ status: 503, json: {} }));
    const err = await rejection(ctx);
    if (err && err.message === 'usajobs: HTTP 503 for Keyword "analyst" page 1') pass('other non-ok status throws with status, keyword and page');
    else fail(`503 handling: ${err?.message}`);
  }

  {
    const ctx = stubCtx(paged('3'));
    const jobs = await provider.fetch(entry(), ctx);
    const pages = ctx.calls.map(c => c.url.searchParams.get('Page')).join(',');
    if (pages === '1,2,3' && jobs.length === 3) pass('NumberOfPages "3" yields exactly pages 1,2,3');
    else fail(`string NumberOfPages: pages=${pages} jobs=${jobs.length}`);
  }

  {
    const ctx = stubCtx(paged(40));
    await provider.fetch(entry(), ctx);
    if (ctx.calls.length === 20) pass('NumberOfPages 40 stops at the 20-page cap');
    else fail(`page cap: ${ctx.calls.length} calls`);
  }

  {
    const ctx = stubCtx(paged(40));
    ctx.maxPages = 2;
    await provider.fetch(entry(), ctx);
    if (ctx.calls.length === 2) pass('ctx.maxPages lowers the page cap');
    else fail(`ctx.maxPages: ${ctx.calls.length} calls`);
  }

  {
    const ctx = stubCtx((url, n) => ({ json: body(n === 1 ? [item(1)] : [], 5) }));
    await provider.fetch(entry(), ctx);
    if (ctx.calls.length === 2) pass('an empty SearchResultItems page stops pagination early');
    else fail(`empty page: ${ctx.calls.length} calls`);
  }

  {
    const ctx = stubCtx(() => ({ json: body([item(7)], 1) }));
    const jobs = await provider.fetch(entry({ keywords: ['analyst', 'engineer'] }), ctx);
    if (ctx.calls.length === 2 && jobs.length === 1) pass('two keywords returning the same PositionURI yield one job');
    else fail(`dedup: calls=${ctx.calls.length} jobs=${jobs.length}`);
  }

  {
    const job = normalizeItem(item(1));
    const want = {
      title: 'Fictional Analyst 1',
      url: 'https://www.usajobs.gov/job/000000001',
      company: 'Office of Example Affairs',
      location: 'Springfield, ZZ',
      postedAt: Date.parse('2026-11-01T00:00:00.0000'),
      description: 'A fictional summary.',
    };
    if (JSON.stringify(job) === JSON.stringify(want)) pass('normalizeItem maps every field');
    else fail(`normalizeItem: ${JSON.stringify(job)}`);
    if (normalizeItem(item(2, { OrganizationName: '' }))?.company === 'Department of Placeholders') pass('normalizeItem falls back to DepartmentName');
    else fail('normalizeItem DepartmentName fallback');
    if (normalizeItem(item(3, { PositionURI: 'http://www.usajobs.gov/job/000000003' })) === null) pass('normalizeItem drops a non-https PositionURI');
    else fail('normalizeItem kept a non-https URI');
    if (normalizeItem(item(4, { PositionTitle: '' })) === null) pass('normalizeItem drops an item with no title');
    else fail('normalizeItem kept an untitled item');
  }

  {
    const ctx = stubCtx(() => ({ json: body([], 1) }));
    const err = await rejection(ctx, entry({}));
    if (err && err.message.includes('USAJOBS fixture') && ctx.calls.length === 0) pass('no keywords and no profile target_roles throws naming the entry');
    else fail(`keyword fallback: ${err?.message} calls=${ctx.calls.length}`);
  }
} finally {
  if (savedProfile === undefined) delete process.env.CAREER_OPS_PROFILE; else process.env.CAREER_OPS_PROFILE = savedProfile;
  rmSync(tmp, { recursive: true, force: true });
}
