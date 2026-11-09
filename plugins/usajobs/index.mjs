// @ts-check
// USAJOBS provider plugin: US federal openings from the documented Search API
// (https://developer.usajobs.gov). Keyed, so it lives in plugins/ and fires only
// on a portals.yml entry that sets `provider: usajobs`.

import { resolveProfileKeywords } from '../../providers/_profile-keywords.mjs';

const SEARCH_URL = 'https://data.usajobs.gov/api/search';
const RESULTS_PER_PAGE = 500;
// The API serves at most 10,000 rows per query, so 20 pages of 500 is its ceiling.
const MAX_PAGES = 20;
// USAJOBS authenticates with the key in this header and the registered email as the User-Agent.
const KEY_HEADER = 'Authorization-Key';
const REQUIRED_ENV = ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'];

function isHttpsUrl(value) {
  try {
    return new URL(String(value)).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Maps one `SearchResultItems[]` element to the scanner's Job shape, or null
 * when it has no title or no https URL.
 * @param {any} item
 */
export function normalizeItem(item) {
  const d = item?.MatchedObjectDescriptor ?? {};
  const title = String(d.PositionTitle ?? '').trim();
  const url = String(d.PositionURI ?? '').trim();
  if (!title || !isHttpsUrl(url)) return null;
  const postedAt = Date.parse(d.PublicationStartDate ?? '');
  const description = String(d.UserArea?.Details?.JobSummary ?? '').trim();
  return {
    title,
    url,
    company: String(d.OrganizationName || d.DepartmentName || ''),
    location: String(d.PositionLocationDisplay ?? ''),
    ...(Number.isFinite(postedAt) ? { postedAt } : {}),
    ...(description ? { description } : {}),
  };
}

function searchUrl(keyword, page, location) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('Keyword', keyword);
  url.searchParams.set('ResultsPerPage', String(RESULTS_PER_PAGE));
  url.searchParams.set('Page', String(page));
  if (location) url.searchParams.set('LocationName', location);
  return url.href;
}

export default {
  provider: {
    id: 'usajobs',
    // Keyed providers never auto-detect (the engine also forces this to null).
    detect() { return null; },

    async fetch(entry, ctx) {
      const env = ctx?.env ?? {};
      const missing = REQUIRED_ENV.filter(n => !env[n]);
      if (missing.length) {
        throw new Error(`usajobs: ${missing.join(' and ')} not set; enable usajobs in config/plugins.yml and add ${missing.join(' and ')} to .env`);
      }

      const config = entry?.usajobs ?? {};
      let keywords = Array.isArray(config.keywords)
        ? config.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim())
        : [];
      if (!keywords.length) keywords = resolveProfileKeywords();
      if (!keywords.length) {
        throw new Error(`usajobs: entry "${entry?.name || '(unnamed)'}" has no usajobs.keywords[] and no config/profile.yml target_roles to fall back to`);
      }
      const location = typeof config.location === 'string' ? config.location.trim() : '';
      const maxPages = Math.min(MAX_PAGES, Number.isInteger(ctx?.maxPages) && ctx.maxPages > 0 ? ctx.maxPages : Infinity);
      const headers = { [KEY_HEADER]: env.USAJOBS_API_KEY, 'User-Agent': env.USAJOBS_USER_AGENT, Accept: 'application/json' };
      const keyOf = (url) => (typeof ctx?.normalizePostingUrl === 'function' && ctx.normalizePostingUrl(url)) || url;

      /** @type {Map<string, ReturnType<typeof normalizeItem>>} */
      const byKey = new Map();
      for (const keyword of keywords) {
        for (let page = 1; page <= maxPages; page++) {
          const res = await ctx.fetch(searchUrl(keyword, page, location), { headers });
          if (res.status === 401) throw new Error('usajobs: USAJOBS_API_KEY was rejected (HTTP 401); check the key and USAJOBS_USER_AGENT in .env');
          if (!res.ok) throw new Error(`usajobs: HTTP ${res.status} for Keyword "${keyword}" page ${page}`);
          const result = (await res.json())?.SearchResult ?? {};
          const items = Array.isArray(result.SearchResultItems) ? result.SearchResultItems : [];
          for (const item of items) {
            const job = normalizeItem(item);
            if (!job) continue;
            const key = keyOf(job.url);
            if (!byKey.has(key)) byKey.set(key, job);
          }
          const pages = Number(result.UserArea?.NumberOfPages);
          if (!items.length || !Number.isFinite(pages) || page >= pages) break;
        }
      }
      return [...byKey.values()];
    },
  },
};
