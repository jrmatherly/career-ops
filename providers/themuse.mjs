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

const FEED_BASE = 'https://www.themuse.com/api/public/jobs';

export const RETIRED_MESSAGE =
  'themuse: this feed is gone — www.themuse.com/api/public/jobs and the site\'s job pages answer ' +
  'a Cloudflare managed challenge (HTTP 403, cf-mitigated: challenge; observed 2026-11-08). ' +
  'This provider is retired: remove `provider: themuse` from portals.yml. With an Apify token, ' +
  'an Apify actor such as bibian/themuse-jobs-scraper may read it through `provider: apify` ' +
  '(not verified here). See docs/SUPPORTED_JOB_BOARDS.md.';

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
