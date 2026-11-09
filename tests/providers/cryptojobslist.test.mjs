// tests/providers/cryptojobslist.test.mjs — Crypto Jobs List public RSS feed.
// Fixtures are fictional; no network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — cryptojobslist');

const mod = await import(pathToFileURL(join(ROOT, 'providers/cryptojobslist.mjs')).href);
const cjl = mod.default;
const { parseCryptoJobsListFeed } = mod;

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const FEED_URL = 'https://api.cryptojobslist.com/jobs.rss';
const item = ({ title = 'Protocol Engineer', creator = 'Acme Labs', loc = 'Remote', slug = 'protocol-engineer-acme', extra = '' } = {}) =>
  `<item><title><![CDATA[${title}]]></title><description><![CDATA[<p>Build &amp; ship <strong>things</strong></p>]]></description>` +
  `<link>https://cryptojobslist.com/jobs/${slug}</link><guid isPermaLink="true">https://cryptojobslist.com/jobs/${slug}</guid>` +
  (creator === null ? '' : `<dc:creator><![CDATA[${creator}]]></dc:creator>`) +
  (loc === null ? '' : `<media:location>${loc}</media:location>`) + `${extra}</item>`;
const feed = (items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title><![CDATA[CryptoJobsList]]></title>${items.join('')}</channel></rss>`;

function stubCtx(body) {
  const calls = [];
  return {
    calls,
    ctx: {
      sleep: async () => {},
      fetchText: async (url, opts) => {
        calls.push({ url, opts });
        if (body instanceof Error) throw body;
        return body;
      },
    },
  };
}
async function rejects(fn) {
  try { await fn(); return ''; } catch (e) { return e.message || String(e); }
}

check(cjl.id === 'cryptojobslist', 'cryptojobslist.id is "cryptojobslist"');
check(cjl.detect({ provider: 'cryptojobslist' })?.url === FEED_URL, 'detect() claims provider: cryptojobslist with no URL');
for (const [label, e] of [
  ['lever URL', { careers_url: 'https://jobs.lever.co/x' }],
  ['greenhouse URL', { careers_url: 'https://job-boards.greenhouse.io/x' }],
  ['the board URL without provider', { careers_url: 'https://cryptojobslist.com/' }],
  ['another provider', { provider: 'cryptocurrencyjobs' }],
  ['null', null],
]) {
  let r;
  try { r = cjl.detect(e); } catch { r = 'threw'; }
  check(r === null, `detect() returns null for ${label}`);
}

{
  const jobs = parseCryptoJobsListFeed(feed([
    item(),
    item({ title: 'Head of R&amp;D', slug: 'head-rd' }),
    item({ title: 'Solidity Developer at Example DAO', creator: null, loc: null, slug: 'solidity' }),
    item({ slug: 'off-host' }).replace(/https:\/\/cryptojobslist\.com\/jobs\/off-host/g, 'https://evil.example/jobs/x'),
    item({ title: '', slug: 'no-title' }),
    item({ slug: 'dated', extra: '<pubDate>Fri, 06 Nov 2026 16:45:00 +0000</pubDate>' }),
  ]));
  check(jobs.length === 4, 'rows off the board host or without a title are dropped');
  const [a, b, c, d] = jobs;
  check(a.title === 'Protocol Engineer' && a.company === 'Acme Labs' && a.location === 'Remote', 'title, dc:creator company and media:location');
  check(a.url === 'https://cryptojobslist.com/jobs/protocol-engineer-acme', 'url is the item link');
  check(a.description === 'Build & ship things', 'the CDATA description goes through htmlToText');
  check(a.postedAt === undefined && d.postedAt === Date.parse('Fri, 06 Nov 2026 16:45:00 +0000'), 'postedAt only when the item carries a pubDate');
  check(b.title === 'Head of R&amp;D', 'CDATA text is kept literally (not entity-decoded twice)');
  check(c.title === 'Solidity Developer' && c.company === 'Example DAO' && c.location === '', 'with no dc:creator the title splits on the last " at "');
  const [e] = parseCryptoJobsListFeed(feed([item({ title: 'Head of Engineering at Scale', creator: '' })]));
  check(e.title === 'Head of Engineering at Scale' && e.company === '', 'a present but empty dc:creator does not split the title');
}

{
  const { ctx, calls } = stubCtx(feed([item()]));
  const jobs = await cjl.fetch({ name: 'Crypto Jobs List', provider: 'cryptojobslist' }, ctx);
  check(calls.length === 1 && calls[0].url === FEED_URL && calls[0].opts?.redirect === 'error', 'one request to the settled feed URL with redirect: "error"');
  check(jobs.length === 1, 'fetch() returns the parsed rows');
}

{
  const { ctx, calls } = stubCtx(feed([item()]));
  const msg = await rejects(() => cjl.fetch({ provider: 'cryptojobslist', careers_url: 'https://evil.example/' }, ctx));
  check(/is not https:\/\/cryptojobslist\.com/.test(msg) && calls.length === 0, 'an off-host careers_url throws before any request');
  for (const ok of ['https://cryptojobslist.com/', 'https://www.cryptojobslist.com/', 'https://api.cryptojobslist.com/jobs.rss']) {
    const jobs = await cjl.fetch({ provider: 'cryptojobslist', careers_url: ok }, stubCtx(feed([item()])).ctx);
    check(jobs.length === 1, `careers_url ${ok} is accepted`);
  }
}

{
  const msg = await rejects(() => cjl.fetch({ provider: 'cryptojobslist' }, stubCtx(feed([item({ slug: 'x' }).replace(/cryptojobslist\.com\/jobs/g, 'elsewhere.example/jobs')])).ctx));
  check(/none parsed/.test(msg), 'a feed whose items all fail to parse throws instead of reading as empty');
}

{
  const { ctx, calls } = stubCtx(feed([item()]));
  await cjl.fetch({ provider: 'cryptojobslist' }, { ...ctx, maxPages: 1 });
  check(calls.length === 1, 'ctx.maxPages: 1 makes exactly one request');
}

{
  const jobs = await cjl.fetch({ provider: 'cryptojobslist' }, stubCtx(feed([])).ctx);
  check(Array.isArray(jobs) && jobs.length === 0, 'a feed with zero items returns []');
  const html = await rejects(() => cjl.fetch({ provider: 'cryptojobslist' }, stubCtx('<!DOCTYPE html><html><title>Just a moment...</title></html>').ctx));
  check(/HTML page, not a feed/.test(html), 'an HTML body where the feed should be throws');
  const empty = await rejects(() => cjl.fetch({ provider: 'cryptojobslist' }, stubCtx('').ctx));
  check(/answered no feed/.test(empty), 'an empty body throws');
}

{
  class ProbeStop extends Error {}
  const sentinel = new ProbeStop('budget');
  let got;
  try { await cjl.fetch({ provider: 'cryptojobslist' }, { ...stubCtx(sentinel).ctx, maxPages: 1 }); } catch (e) { got = e; }
  check(got === sentinel, 'a fetch rejection while probing propagates unwrapped');
}
