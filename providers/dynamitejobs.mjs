// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
/** @typedef {import('./_types.js').Job} Job */

// Dynamite Jobs provider: a remote-only board, many employers. Target list:
// `job_boards:`, wired explicitly with `provider: dynamitejobs`.
//
// Measured on 2026-11-08 with curl: the board's own sitemap
// `https://dynamitejobs.com/sitemap/jobs-of-company.xml` lists 500 posting URLs
// (`/company/{company}/remote-job/{slug}`) among 3,441 locs, and each posting
// page carries a JSON-LD JobPosting (title, hiringOrganization, datePosted,
// jobLocationType, applicantLocationRequirements). robots.txt disallows `/api/`,
// `/form/`, `/app/` and a few dashboards under `User-agent: *`; neither the
// sitemap nor posting pages are disallowed. The sitemap's `<lastmod>` is a
// modification time, so it is never `postedAt`.
//
// The sitemap only gives a slug, so a real title, employer, date and location
// need the posting page. Detail fetches run only for rows the scan's title
// filter keeps (`ctx.titleWanted`), capped by `detailLimit`:
//
//   dynamitejobs: { detailLimit: 200 }   # 1..1000
//
// A health probe (`ctx.maxPages`) reads the sitemap alone.

import { intInRange } from './_config-utils.mjs';
import { decodeEntities } from './_html-entities.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { fetchTextWithRetry, sleep } from './_http.mjs';
import { titleFromSlug } from './eploy.mjs';
import { CHALLENGE_RE, findJobPosting, toEpochMs } from './healthecareers.mjs';

const TRUSTED_HOST = 'dynamitejobs.com';
const SITEMAP_URL = `https://${TRUSTED_HOST}/sitemap/jobs-of-company.xml`;
const JOB_URL_RE = /^https:\/\/dynamitejobs\.com\/company\/(?<company>[a-z0-9-]+)\/remote-job\/(?<slug>[a-z0-9-]+)$/;
const DETAIL_BATCH = 3;
const DETAIL_PACE_MS = 250;
const TIMEOUT_MS = 20_000;

/**
 * When the entry carries a URL it must be this board's https host, checked
 * before any request because an explicit `provider:` entry never runs detect().
 * @param {any} entry
 */
function assertEntryUrl(entry) {
  for (const raw of [entry?.careers_url, entry?.api]) {
    if (raw === undefined || raw === null || raw === '') continue;
    let parsed;
    try {
      parsed = new URL(String(raw));
    } catch {
      throw new Error(`dynamitejobs: invalid URL: ${raw}`);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== TRUSTED_HOST || parsed.port) {
      throw new Error(`dynamitejobs: untrusted URL "${raw}" (must be https://${TRUSTED_HOST})`);
    }
  }
}

/**
 * Posting rows from the jobs sitemap, titled from the slug. A urlset with no
 * posting URL is an empty board; an empty body, a non-sitemap body, or
 * `/remote-job/` locs none of which parse (a URL-shape change) throw.
 * @param {unknown} xml
 * @returns {Job[]}
 */
export function parseSitemap(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('dynamitejobs: empty sitemap response');
  if (!/<urlset\b/i.test(xml)) throw new Error('dynamitejobs: unexpected sitemap response (expected an XML urlset)');
  /** @type {Job[]} */
  const jobs = [];
  const seen = new Set();
  let postingLocs = 0;
  for (const m of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)) {
    const url = decodeEntities(m[1].trim());
    if (url.includes('/remote-job/')) postingLocs++;
    const groups = JOB_URL_RE.exec(url)?.groups;
    if (!groups || seen.has(url)) continue;
    const title = titleFromSlug(groups.slug);
    if (!title) continue;
    seen.add(url);
    jobs.push({ title, url, company: titleFromSlug(groups.company), location: 'Remote' });
  }
  if (jobs.length === 0 && postingLocs > 0) {
    throw new Error(`dynamitejobs: ${postingLocs} /remote-job/ URLs in the sitemap but none has the expected shape; the URL scheme changed`);
  }
  return jobs;
}

/**
 * The fields a posting page's JobPosting gives, or null when it has none.
 * A bot-challenge page throws.
 * @param {unknown} html
 * @returns {{ title: string, company: string, location: string, postedAt?: number, description: string } | null}
 */
export function parseDetailPage(html) {
  const posting = findJobPosting(html)?.posting;
  const title = htmlToText(posting?.title).replace(/,\s*Remote Job$/i, '');
  if (!title) {
    if (typeof html === 'string' && CHALLENGE_RE.test(html)) {
      throw new Error('dynamitejobs: a posting page returned a bot-challenge page');
    }
    return null;
  }
  const regions = (Array.isArray(posting.applicantLocationRequirements)
    ? posting.applicantLocationRequirements
    : [posting.applicantLocationRequirements])
    .map((r) => htmlToText(r?.name))
    .filter(Boolean);
  const remote = posting.jobLocationType === 'TELECOMMUTE' || regions.length > 0;
  return {
    title,
    company: htmlToText(posting.hiringOrganization?.name),
    location: remote ? (regions.length ? `Remote (${regions.join(', ')})` : 'Remote') : '',
    postedAt: toEpochMs(posting.datePosted),
    description: htmlToText(posting.description),
  };
}

/** @type {Provider} */
export default {
  id: 'dynamitejobs',

  detect(entry) {
    return entry?.provider === 'dynamitejobs' ? { url: SITEMAP_URL } : null;
  },

  async fetch(entry, ctx) {
    assertEntryUrl(entry);
    const rows = parseSitemap(await fetchTextWithRetry(ctx, SITEMAP_URL, { redirect: 'error', timeoutMs: TIMEOUT_MS }));
    if (Number.isInteger(ctx?.maxPages) && ctx.maxPages > 0) return rows;

    const name = entry?.name || 'Dynamite Jobs';
    const titleWanted = typeof ctx?.titleWanted === 'function' ? ctx.titleWanted : null;
    // Rows the title filter drops go back untouched; the scan drops them anyway.
    const wanted = titleWanted ? rows.filter((job) => titleWanted(job.title)) : rows;
    const candidates = wanted.slice(0, intInRange(entry?.dynamitejobs?.detailLimit, 200, 1, 1000));
    if (wanted.length > candidates.length) {
      console.error(`⚠️  dynamitejobs: ${name}: ${wanted.length} postings qualify for a posting-page read; read ${candidates.length} posting pages, raise dynamitejobs.detailLimit on this entry for the rest`);
    }

    const failed = new Set();
    for (let i = 0; i < candidates.length; i += DETAIL_BATCH) {
      if (i > 0) await sleep(DETAIL_PACE_MS, ctx);
      await Promise.all(candidates.slice(i, i + DETAIL_BATCH).map(async (job) => {
        const html = await fetchTextWithRetry(ctx, job.url, { redirect: 'error', timeoutMs: TIMEOUT_MS }).catch((err) => {
          // A bot wall usually answers 403 or 503; it fails the whole fetch, not one row.
          if (typeof err?.body === 'string' && CHALLENGE_RE.test(err.body)) throw err;
          return null;
        });
        // A challenge page served with 200 throws in parseDetailPage for the same reason.
        const detail = html === null ? null : parseDetailPage(html);
        if (!detail) {
          failed.add(job);
          return;
        }
        job.title = detail.title;
        if (detail.company) job.company = detail.company;
        job.location = detail.location || job.location;
        if (detail.postedAt !== undefined) job.postedAt = detail.postedAt;
        if (detail.description) job.description = detail.description;
      }));
    }
    if (failed.size > 0) {
      console.error(`⚠️  dynamitejobs: ${name}: dropped ${failed.size} posting(s) whose page could not be read`);
    }
    return rows.filter((job) => !failed.has(job));
  },
};
