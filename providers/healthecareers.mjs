// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
/** @typedef {import('./_types.js').Job} Job */

// Health eCareers provider: a US healthcare board (physicians, nurses, allied
// health), many employers. Target list: `job_boards:`, wired explicitly with
// `provider: healthecareers` (no URL-pattern detect, so no other provider's
// entry is ever claimed).
//
// Measured on 2026-11-08 with curl: `https://www.healthecareers.com/search-jobs`
// is server-rendered HTML, no key, cookie or challenge, 25 cards a page, and
// `?pg=N` pages the whole board (page 883 was the last non-empty one, so about
// 22,000 postings). `?pg=1` answers 301, so page one is the bare path. robots.txt
// disallows `/searchjobs/` and `/new-search-jobs/` under `User-agent: *` and
// allows `/search-jobs/`; this provider only ever requests `/search-jobs` and,
// with `fetchDetails`, `/job/{slug}/{id}` pages. Every sampled card named its
// employer; no backfill from other boards was seen (docs/SOURCE_INDEXING_LOG.md).
//
// Optional enrichment, off by default and skipped under a health probe:
//
//   healthecareers: { fetchDetails: true, detailLimit: 25 }   # 1..100
//
// fills postedAt, company, location and description from the detail page's
// JSON-LD JobPosting.

import { intInRange } from './_config-utils.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { fetchTextWithRetry, sleep } from './_http.mjs';

const TRUSTED_HOST = 'www.healthecareers.com';
const ORIGIN = `https://${TRUSTED_HOST}`;
const LIST_URL = `${ORIGIN}/search-jobs`;

const DEFAULT_MAX_PAGES = 10;
const MAX_PAGES_CAP = 500;
const INTER_PAGE_DELAY_MS = 250;
const DETAIL_BATCH = 3;
const DETAIL_PACE_MS = 250;

// The same bot-wall signature `providers/computrabajo.mjs` reads. A challenge
// page carries no job hrefs, so without this check it would parse as an empty board.
const CHALLENGE_RE = /<title[^>]*>[^<]*(?:just a moment|attention required|access denied)|cf-(?:challenge|browser-verification|error-details)|cf-mitigated/i;

const CARD_SPLIT_RE = /<div\b[^>]*\bid=["']job-results-card["'][^>]*>/gi;
const CARD_URL_RE = /\bdata-url=["']([^"']+)["']/i;
const TITLE_RE = /<span\b[^>]*\bitemprop=["']title["'][^>]*>([\s\S]*?)<\/span>/i;
const LOCATION_RE = /\bid=["']job-results-location["'][^>]*>([\s\S]*?)<\/span>/i;
const COMPANY_RE = /\bid=["']job-results-employer["'][^>]*>([\s\S]*?)<\/span>/i;
const DESCRIPTION_RE = /\bid=["']job-results-desc["'][^>]*>([\s\S]*?)<\/div>/i;
const JOB_PATH_RE = /^\/job\/[a-z0-9-]+\/\d+$/i;
const JOB_HREF_RE = /href=["'](?:https:\/\/www\.healthecareers\.com)?\/job\/[a-z0-9-]+\/\d+[?#"']/i;

/** @param {number} page */
export function buildListUrl(page) {
  return page <= 1 ? LIST_URL : `${LIST_URL}?pg=${page}`;
}

/**
 * The entry needs no URL; when it carries one it must be this board's https
 * host, checked before any request because an explicit `provider:` entry never
 * runs detect().
 * @param {any} entry
 */
function assertEntryUrl(entry) {
  for (const raw of [entry?.careers_url, entry?.api]) {
    if (raw === undefined || raw === null || raw === '') continue;
    let parsed;
    try {
      parsed = new URL(String(raw));
    } catch {
      throw new Error(`healthecareers: invalid URL: ${raw}`);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== TRUSTED_HOST || parsed.port) {
      throw new Error(`healthecareers: untrusted URL "${raw}" (must be https://${TRUSTED_HOST})`);
    }
  }
}

/**
 * A card's posting URL, or null unless it is `/job/{slug}/{id}` on this host.
 * @param {unknown} href
 */
function jobUrl(href) {
  if (typeof href !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(href, ORIGIN);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== TRUSTED_HOST || parsed.port || parsed.search || parsed.hash) return null;
  return JOB_PATH_RE.test(parsed.pathname) ? `${ORIGIN}${parsed.pathname}` : null;
}

/**
 * Parse one search page. `rawCards` is the number of card containers the page
 * carried, before malformed ones were dropped, for the short-page check.
 * @param {unknown} html
 * @returns {{ jobs: Job[], rawCards: number }}
 */
function parseCards(html) {
  const source = typeof html === 'string' ? html : '';
  const starts = [...source.matchAll(CARD_SPLIT_RE)].map((m) => m.index ?? 0);
  /** @type {Job[]} */
  const jobs = [];
  const seen = new Set();
  starts.forEach((start, i) => {
    const card = source.slice(start, starts[i + 1] ?? source.length);
    const url = jobUrl(CARD_URL_RE.exec(card)?.[1]);
    const title = htmlToText(TITLE_RE.exec(card)?.[1]);
    if (!url || !title || seen.has(url)) return;
    seen.add(url);
    /** @type {Job} */
    const job = {
      title,
      url,
      company: htmlToText(COMPANY_RE.exec(card)?.[1]),
      location: htmlToText(LOCATION_RE.exec(card)?.[1]),
    };
    const description = htmlToText(DESCRIPTION_RE.exec(card)?.[1]);
    if (description) job.description = description;
    jobs.push(job);
  });
  return { jobs, rawCards: starts.length };
}

/**
 * @param {unknown} html
 * @returns {Job[]}
 */
export function parseSearchPage(html) {
  return parseCards(html).jobs;
}

/** @param {any} value @returns {any[]} */
function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== 'object') return [];
  return [value, ...flattenJsonLd(value['@graph'])];
}

/** @param {any} value */
function isType(value, type) {
  const t = value?.['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/**
 * The first JSON-LD JobPosting on a page, with every JSON-LD node so a
 * `{"@id": …}` reference (Health eCareers' hiringOrganization) can be resolved.
 * Malformed blocks are skipped. Exported so another JSON-LD provider can reuse it.
 * @param {unknown} html
 * @returns {{ posting: any, nodes: any[] } | null}
 */
export function findJobPosting(html) {
  if (typeof html !== 'string') return null;
  const nodes = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      nodes.push(...flattenJsonLd(JSON.parse(m[1])));
    } catch {
      // one broken block does not hide the others
    }
  }
  const posting = nodes.find((n) => isType(n, 'JobPosting'));
  return posting ? { posting, nodes } : null;
}

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value */
function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** @param {any} place */
function placeName(place) {
  const a = place?.address;
  if (!a || typeof a !== 'object') return '';
  const country = typeof a.addressCountry === 'object' ? text(a.addressCountry?.name) : text(a.addressCountry);
  return [text(a.addressLocality), text(a.addressRegion), country].filter(Boolean).join(', ');
}

/**
 * The enrichment fields a detail page's JobPosting gives; empty when it has none.
 * @param {unknown} html
 * @returns {{ company?: string, location?: string, postedAt?: number, description?: string }}
 */
export function parseDetailPage(html) {
  const found = findJobPosting(html);
  if (!found) return {};
  const { posting, nodes } = found;
  let org = posting.hiringOrganization;
  if (org && !org.name && org['@id']) org = nodes.find((n) => n?.['@id'] === org['@id']);
  const places = Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
  // The card title stays: enriching only the first detailLimit rows must not
  // give one board two title styles for title_filter and dedup.
  const out = {
    company: htmlToText(org?.name),
    location: places.map(placeName).filter(Boolean).join('; '),
    description: htmlToText(posting.description),
    postedAt: toEpochMs(posting.datePosted),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== ''));
}

/** @type {Provider} */
export default {
  id: 'healthecareers',

  detect(entry) {
    return entry?.provider === 'healthecareers' ? { url: LIST_URL } : null;
  },

  async fetch(entry, ctx) {
    assertEntryUrl(entry);
    const probing = Number.isInteger(ctx?.maxPages) && ctx.maxPages > 0;
    const v = entry?.max_pages;
    const entryMax = Number.isInteger(v) && v > 0 ? Math.min(v, MAX_PAGES_CAP) : DEFAULT_MAX_PAGES;
    const maxPages = probing ? Math.min(entryMax, ctx.maxPages) : entryMax;

    /** @type {Job[]} */
    const jobs = [];
    const seen = new Set();
    let pageSize = 0; // page one's card count; a shorter later page is the last

    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) await sleep(INTER_PAGE_DELAY_MS, ctx);
      const url = buildListUrl(page);
      let html;
      try {
        html = await fetchTextWithRetry(ctx, url, { redirect: 'error' });
        // A challenge page carries no job hrefs, so it must throw before the empty-board check.
        if (CHALLENGE_RE.test(html)) throw new Error(`healthecareers: ${url} returned a bot-challenge page instead of listings`);
      } catch (err) {
        // Page one, or any page under a probe, fails loud and unwrapped; a later
        // page keeps what the walk already has.
        if (page === 1 || probing) throw err;
        console.error(`⚠️  healthecareers: ${entry?.name || 'Health eCareers'} stopped at page ${page} (${/** @type {Error} */ (err).message}); keeping ${jobs.length} jobs`);
        break;
      }

      const { jobs: parsed, rawCards } = parseCards(html);
      if (parsed.length === 0) {
        if (page === 1 && (rawCards > 0 || JOB_HREF_RE.test(html))) {
          throw new Error(`healthecareers: ${url} still links job pages but no card could be parsed; the card markup changed`);
        }
        break;
      }
      const before = jobs.length;
      for (const job of parsed) {
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        jobs.push(job);
      }
      if (page === 1) pageSize = rawCards;
      if (jobs.length === before || rawCards < pageSize) break;
      if (page === maxPages && !probing) {
        console.error(`⚠️  healthecareers: ${entry?.name || 'Health eCareers'} truncated at max_pages=${maxPages} (${jobs.length} jobs); raise max_pages on this entry for more`);
      }
    }

    const cfg = entry?.healthecareers || {};
    if (cfg.fetchDetails !== true || probing) return jobs;
    const candidates = jobs.slice(0, intInRange(cfg.detailLimit, 25, 1, 100));
    for (let i = 0; i < candidates.length; i += DETAIL_BATCH) {
      if (i > 0) await sleep(DETAIL_PACE_MS, ctx);
      await Promise.all(candidates.slice(i, i + DETAIL_BATCH).map(async (job) => {
        try {
          const detail = parseDetailPage(await fetchTextWithRetry(ctx, job.url, { redirect: 'error' }));
          Object.assign(job, detail);
        } catch {
          // Enrichment is best-effort: the listing row stands as parsed.
        }
      }));
    }
    return jobs;
  },
};
