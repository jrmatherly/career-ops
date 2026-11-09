// @ts-check
import { fetchJsonWithRetry, sleep } from './_http.mjs';
import { intInRange } from './_config-utils.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { safeEncodeURIComponent } from './_safe-url.mjs';
/** @typedef {import('./_types.js').Provider} Provider */

// Manatal provider: a single-company ATS adapter for `tracked_companies:`
// entries whose careers page is hosted by Manatal at
// `https://www.careers-page.com/{slug}`. Auto-detects that URL (the host is
// Manatal's own, so no other provider claims it) and reads the public,
// no-auth DRF list API the page itself calls:
//
//   GET https://www.careers-page.com/api/v1.0/c/{slug}/jobs/?page_size=100&page={n}
//
// Measured 2026-11-08 on a live tenant: the API serves at most 20 rows a page
// whatever `page_size` asks (count 32 came back as 20 + 12), `next` is null on
// the last page, an unknown slug answers 404, and no item carries a date, so
// Jobs have no postedAt. The posting page is
// `https://www.careers-page.com/{slug}/job/{hash}` (200 for a live hash, 404
// for an unknown one, and 404 with a trailing slash). The walk stops on
// `next === null` rather than following that URL, so every request stays on a
// URL this provider builds. robots.txt answers 404 (no rules).

const HOSTS = new Set(['www.careers-page.com', 'careers-page.com']);
const SLUG_RE = /^[a-z0-9-]+$/;
const DEFAULT_MAX_PAGES = 20;
const MAX_PAGES_CAP = 200;
const INTER_PAGE_DELAY_MS = 250;

function resolveSlug(entry) {
  if (typeof entry?.careers_url !== 'string') return null;
  try {
    const u = new URL(entry.careers_url);
    if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) return null;
    const slug = u.pathname.split('/')[1] ?? '';
    // `/api/…` is the list API itself, not a tenant page.
    return SLUG_RE.test(slug) && slug !== 'api' ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Map one page of `results` to Jobs. Exported for the shared surrogate test.
 * @param {any[]} rows
 * @param {string} slug
 * @param {string} company
 */
export function parseManatalJobs(rows, slug, company) {
  const jobs = [];
  for (const row of rows) {
    const title = typeof row?.position_name === 'string' ? row.position_name.trim() : '';
    const hash = typeof row?.hash === 'string' && row.hash ? safeEncodeURIComponent(row.hash) : null;
    if (!title || !hash) continue;
    jobs.push({
      title,
      url: `https://www.careers-page.com/${slug}/job/${hash}`,
      company,
      location: typeof row.location_display === 'string' ? row.location_display.trim() : '',
      description: htmlToText(row.description),
    });
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'manatal',

  detect(entry) {
    const slug = resolveSlug(entry);
    return slug ? { url: `https://www.careers-page.com/${slug}` } : null;
  },

  async fetch(entry, ctx) {
    const slug = resolveSlug(entry);
    if (!slug) {
      throw new Error(`manatal: careers_url ${JSON.stringify(entry?.careers_url)} is not https://www.careers-page.com/{slug}`);
    }
    const company = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : slug;
    const probing = Number(ctx?.maxPages) > 0;
    const entryMax = intInRange(entry?.max_pages, DEFAULT_MAX_PAGES, 1, MAX_PAGES_CAP);
    const maxPages = probing ? Math.min(entryMax, Number(ctx.maxPages)) : entryMax;

    const jobs = [];
    const seen = new Set();
    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) await sleep(INTER_PAGE_DELAY_MS, ctx);
      const url = `https://www.careers-page.com/api/v1.0/c/${slug}/jobs/?page_size=100&page=${page}`;
      let json;
      try {
        json = await fetchJsonWithRetry(ctx, url, { redirect: 'error' });
      } catch (err) {
        if (probing || page === 1) throw err;
        console.error(`⚠️  manatal: ${company} page ${page} failed (${(err && err.message) || err}) — keeping ${jobs.length} postings`);
        break;
      }
      const rows = json && Array.isArray(json.results) ? json.results : null;
      if (!rows) {
        const got = json && typeof json === 'object' ? Object.keys(json).join(', ') : typeof json;
        throw new Error(`manatal: unexpected response — expected results[], got: [${got}]`);
      }
      for (const job of parseManatalJobs(rows, slug, company)) {
        // A posting added mid-walk shifts rows onto the next page.
        if (!seen.has(job.url)) { seen.add(job.url); jobs.push(job); }
      }
      if (rows.length === 0 || !json.next) break;
      if (page === maxPages && !probing) {
        console.error(`⚠️  manatal: ${company} stopped at max_pages ${maxPages} with pages left — raise max_pages on this entry`);
      }
    }
    return jobs;
  },
};
