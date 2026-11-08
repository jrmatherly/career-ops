// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// The Muse provider — RETIRED (2026-11-08). The public JSON feed this provider
// read (https://www.themuse.com/api/public/jobs?page={n}) and the site's job
// pages now answer with a Cloudflare managed challenge (HTTP 403,
// `cf-mitigated: challenge`), with or without an `api_key` and under a browser
// User-Agent. career-ops does not work around bot protection, so fetch()
// throws instead of reading the challenge page as an empty board.
//
// detect() matches only `provider: themuse`, so a stale entry surfaces the
// message below instead of a silent "no provider matched".
//
// normalizeMuseJob() is kept (and still unit-tested) as a record of the feed's
// shape; it is dead code while fetch() never reaches it.

const FEED_BASE = 'https://www.themuse.com/api/public/jobs';

export const RETIRED_MESSAGE =
  'themuse: this feed is gone — www.themuse.com/api/public/jobs and the site\'s job pages answer ' +
  'a Cloudflare managed challenge (HTTP 403, cf-mitigated: challenge; observed 2026-11-08). ' +
  'This provider is retired: remove `provider: themuse` from portals.yml. With an Apify token, ' +
  'the board is readable through `provider: apify` and the public actor bibian/themuse-jobs-scraper ' +
  '(see plugins/apify/skill.md). See docs/SUPPORTED_JOB_BOARDS.md.';

/**
 * Normalize a single result from the Muse API response. Exported for unit tests.
 *
 * Field mapping:
 *   name              → title
 *   refs.landing_page → url
 *   company.name      → company
 *   locations[0].name → location
 *
 * Returns null when required fields (title or url) are missing or invalid.
 *
 * @param {any} j
 * @returns {{ title: string, url: string, company: string, location: string } | null}
 */
export function normalizeMuseJob(j) {
  if (!j || typeof j !== 'object') return null;
  const title = typeof j.name === 'string' ? j.name.trim() : '';
  if (!title) return null;
  const url = typeof j.refs?.landing_page === 'string' ? j.refs.landing_page.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const company =
    typeof j.company?.name === 'string' && j.company.name.trim()
      ? j.company.name.trim()
      : 'The Muse';
  const location =
    Array.isArray(j.locations) && j.locations.length > 0 && typeof j.locations[0]?.name === 'string'
      ? j.locations[0].name.trim()
      : '';
  return { title, url, company, location };
}

/** @type {Provider} */
export default {
  id: 'themuse',

  detect(entry) {
    return entry?.provider === 'themuse' ? { url: FEED_BASE } : null;
  },

  async fetch() {
    throw new Error(RETIRED_MESSAGE);
  },
};
