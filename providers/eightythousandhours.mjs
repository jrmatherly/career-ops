// @ts-check
import { fetchJsonWithRetry, fetchTextWithRetry, sleep } from './_http.mjs';
import { intInRange } from './_config-utils.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { safeEncodeURIComponent } from './_safe-url.mjs';
/** @typedef {import('./_types.js').Provider} Provider */

// 80,000 Hours job board (jobs.80000hours.org), read through the public
// Algolia index its own UI queries. A `job_boards:` aggregator of
// high-impact roles at named employers; wire it in with
// `provider: eightythousandhours` (explicit-only).
//
// The Algolia app id, search key and jobs index name are public but belong to
// the site's build, so they are read from the board page's
// `window.__NUXT__.config` block on every run and never stored, so a rotated
// key needs no release (the techinasia.mjs precedent). The key is referer-gated, so each query sends the
// board's Referer.
//
// Measured 2026-11-08: `posted_at` is epoch SECONDS (1793923500 is
// 2026-11-06); `description` is empty on every hit and `description_short`
// carries the HTML summary; the index holds 1,019 hits but serves at most
// 1,000 for one query (`page=1` answers HTTP 200 with zero hits and the
// message "you can only fetch the 1000 hits for this query"). When the
// unfiltered query is cut by that window, the walk partitions on the
// `tags_location_type` facet, `tags_location_type:Remote` (263) and
// `NOT tags_location_type:Remote` (756), which together cover all 1,019; a
// partition still over the window is warned about, never silent. Nine
// `url_external` links were shared by 23 postings, so an employer link is the
// job URL only when one posting owns it (the techinasia.mjs rule, since the URL
// is the dedup key); otherwise the board's own `?jobPk={post_pk}` page.
// `closes_at` is not mapped: the fork has not taken upstream's close-date
// change, so Job has no field for it yet.

const BOARD_ORIGIN = 'https://jobs.80000hours.org';
const ALGOLIA_HOST_RE = /^[a-z0-9]+-dsn\.algolia\.net$/;
const HITS_PER_PAGE = 1000;
const DEFAULT_MAX_PAGES = 3;
const MAX_PAGES_CAP = 20;
const INTER_PAGE_DELAY_MS = 250;
const PARTITIONS = ['tags_location_type:Remote', 'NOT tags_location_type:Remote'];
const ATTRIBUTES = ['objectID', 'post_pk', 'title', 'company_name', 'card_locations', 'posted_at', 'url_external', 'description', 'description_short'];

function assertHost(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALGOLIA_HOST_RE.test(u.hostname)) {
    throw new Error(`eightythousandhours: refusing non-Algolia URL ${u.origin}`);
  }
  return url;
}

/**
 * The Algolia credentials from the board page's public Nuxt config.
 * Exported for tests.
 * @param {string} html
 * @returns {{ appId: string, apiKey: string, indexName: string }}
 */
export function parseAlgoliaConfig(html) {
  const text = typeof html === 'string' ? html : '';
  const start = text.indexOf('window.__NUXT__.config=');
  const end = start === -1 ? -1 : text.indexOf('</script>', start);
  const block = start === -1 ? '' : text.slice(start, end === -1 ? undefined : end);
  const read = (key, re) => {
    const value = block.match(new RegExp(`\\b${key}:"([^"]*)"`))?.[1] ?? '';
    if (!re.test(value)) throw new Error(`eightythousandhours: board page config has no usable ${key} (markup changed?)`);
    return value;
  };
  return {
    appId: read('algoliaApplicationId', /^[A-Za-z0-9]{6,16}$/),
    apiKey: read('algoliaApiKey', /^[A-Za-z0-9]{16,64}$/),
    indexName: read('algoliaJobsIndex', /^[A-Za-z0-9_-]{1,64}$/),
  };
}

function employerLink(hit) {
  const raw = typeof hit?.url_external === 'string' ? hit.url_external.trim() : '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/**
 * Map Algolia hits to Jobs. Exported for tests. An employer link shared by
 * more than one hit in the batch falls back to the board page.
 * @param {any[]} hits
 */
export function parseAlgoliaHits(hits) {
  const owners = new Map();
  for (const hit of hits) {
    const link = employerLink(hit);
    if (link) owners.set(link, (owners.get(link) || 0) + 1);
  }
  const jobs = [];
  for (const hit of hits) {
    const title = typeof hit?.title === 'string' ? hit.title.trim() : '';
    const seg = hit?.post_pk === undefined || hit?.post_pk === null ? null : safeEncodeURIComponent(String(hit.post_pk));
    if (!title || !seg) continue;
    const link = employerLink(hit);
    const postedSec = Number(hit.posted_at);
    jobs.push({
      title,
      url: link && owners.get(link) === 1 ? link : `${BOARD_ORIGIN}/?jobPk=${seg}`,
      company: typeof hit.company_name === 'string' ? hit.company_name.trim() : '',
      location: Array.isArray(hit.card_locations) ? hit.card_locations.filter((l) => typeof l === 'string' && l.trim()).join('; ') : '',
      // posted_at is seconds today; a value already in ms (past 1e11, year 5138 as seconds) is kept as is.
      postedAt: Number.isFinite(postedSec) && postedSec > 0 ? (postedSec < 1e11 ? postedSec * 1000 : postedSec) : undefined,
      description: htmlToText(hit.description || hit.description_short),
    });
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'eightythousandhours',

  detect(entry) {
    return entry?.provider === 'eightythousandhours' ? { url: `${BOARD_ORIGIN}/` } : null;
  },

  async fetch(entry, ctx) {
    if (entry?.careers_url != null && entry.careers_url !== '') {
      let u;
      try { u = new URL(entry.careers_url); } catch { u = null; }
      if (u?.protocol !== 'https:' || u.hostname !== 'jobs.80000hours.org') {
        throw new Error(`eightythousandhours: careers_url ${JSON.stringify(entry.careers_url)} is not https://jobs.80000hours.org`);
      }
    }
    const probing = Number(ctx?.maxPages) > 0;
    const entryMax = intInRange(entry?.max_pages, DEFAULT_MAX_PAGES, 1, MAX_PAGES_CAP);
    const maxPages = probing ? Math.min(entryMax, Number(ctx.maxPages)) : entryMax;

    const html = await fetchTextWithRetry(ctx, `${BOARD_ORIGIN}/`, { redirect: 'error' });
    const { appId, apiKey, indexName } = parseAlgoliaConfig(html);
    const params = new URLSearchParams({ 'x-algolia-application-id': appId, 'x-algolia-api-key': apiKey });
    const endpoint = assertHost(`https://${appId.toLowerCase()}-dsn.algolia.net/1/indexes/${indexName}/query?${params}`);

    /** @type {Map<string, any>} */
    const byId = new Map();
    let requests = 0;
    // One query walked page by page. Returns { received, nbHits } so the caller
    // can tell whether it reached every hit the index counts.
    const walk = async (filters) => {
      let received = 0;
      let nbHits = NaN;
      for (let page = 0; page < maxPages; page++) {
        if (requests++ > 0) await sleep(INTER_PAGE_DELAY_MS, ctx);
        const json = await fetchJsonWithRetry(ctx, endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', referer: `${BOARD_ORIGIN}/` },
          body: JSON.stringify({ query: '', hitsPerPage: HITS_PER_PAGE, page, attributesToRetrieve: ATTRIBUTES, attributesToHighlight: [], attributesToSnippet: [], ...(filters ? { filters } : {}) }),
          redirect: 'error',
        });
        const hits = json && Array.isArray(json.hits) ? json.hits : null;
        if (!hits) {
          const got = json && typeof json === 'object' ? Object.keys(json).join(', ') : typeof json;
          throw new Error(`eightythousandhours: unexpected response — expected hits[], got: [${got}]`);
        }
        nbHits = Number.isFinite(json.nbHits) ? json.nbHits : NaN;
        if (hits.length > 0 && parseAlgoliaHits(hits).length === 0) {
          const msg = `eightythousandhours: ${filters ? `"${filters}" ` : ''}page ${page + 1} has ${hits.length} hits but none parsed (each needs a title and a post_pk); the index shape may have changed`;
          if (page === 0 && !filters) throw new Error(msg);
          console.error(`⚠️  ${msg} — keeping the ${byId.size} postings already read`);
          break;
        }
        for (const hit of hits) {
          const key = String(hit?.objectID ?? hit?.post_pk ?? '');
          if (key && !byId.has(key)) byId.set(key, hit);
        }
        received += hits.length;
        if (hits.length === 0 || page + 1 >= Number(json.nbPages)) break;
        if (page === maxPages - 1 && !probing) {
          console.error(`⚠️  eightythousandhours: stopped at max_pages ${maxPages} with pages left — raise max_pages on this entry`);
        }
      }
      return { received, nbHits };
    };

    const noCount = (what) => console.error(`⚠️  eightythousandhours: ${what} answered no numeric nbHits, so the 1,000-hit window check could not run — postings past the window may be missing`);
    const all = await walk('');
    if (!probing && !Number.isFinite(all.nbHits)) noCount('the index query');
    if (!probing && all.received < all.nbHits) {
      for (const filters of PARTITIONS) {
        try {
          const part = await walk(filters);
          if (!Number.isFinite(part.nbHits)) noCount(`"${filters}"`);
          else if (part.received < part.nbHits) {
            console.error(`⚠️  eightythousandhours: "${filters}" holds ${part.nbHits} postings but the search window served ${part.received} — the rest are not reachable`);
          }
        } catch (err) {
          console.error(`⚠️  eightythousandhours: partition "${filters}" failed (${(err && err.message) || err}) — keeping the ${byId.size} postings already read`);
        }
      }
    }
    return parseAlgoliaHits([...byId.values()]);
  },
};
