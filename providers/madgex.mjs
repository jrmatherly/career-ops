// @ts-check
import { intInRange } from './_config-utils.mjs';
import { decodeEntities } from './_html-entities.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { fetchTextWithRetry, sleep } from './_http.mjs';
import { resolveProfileKeywords } from './_profile-keywords.mjs';
/** @typedef {import('./_types.js').Provider} Provider */

// Madgex job-board RSS provider: the Chronicle of Higher Education
// (jobs.chronicle.com), Inside Higher Ed (careers.insidehighered.com) and
// Science Careers (jobs.sciencecareers.org) all run on Madgex and serve the
// same public, no-auth feed at `https://{host}/jobsrss/?page={n}&keywords=…`
// (`&sort=Date` orders it newest first; without it a keyword search is ranked
// by relevance, measured on all three hosts 2026-11-08):
// RSS 2.0, 20 items a page, `<opensearch:totalResults>` in the channel, and a
// page past the last one answers a well-formed feed with zero items (measured
// 2026-11-08: page 99999 on Chronicle).
//
// Wire in via a `job_boards:` entry with `provider: madgex` and the board's
// root as `careers_url`. Explicit-only: the hosts are branded, so no
// URL-pattern claim. Each keyword (`madgex.keywords`, else config/profile.yml
// target_roles) is one newest-first search pass behind a shared URL set,
// walked until its natural end or `max_pages`.

const TRUSTED_HOSTS = new Set(['jobs.chronicle.com', 'careers.insidehighered.com', 'jobs.sciencecareers.org']);
const PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 25;
// Chronicle unfiltered held 28,734 postings (1,437 pages of 20) on 2026-11-08.
const MAX_PAGES_CAP = 1500;
const INTER_PAGE_DELAY_MS = 250;

function trustedHost(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && TRUSTED_HOSTS.has(host) ? host : null;
  } catch {
    return null;
  }
}

function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function entryKeywords(entry) {
  const raw = entry?.madgex?.keywords;
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.filter((k) => typeof k === 'string').map((k) => k.trim()).filter(Boolean))];
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeEntities(m[1])).trim();
}

// The feed's links carry TrackID and utm_* click-tracking params; the posting
// is the same without them, and keeping them would split the dedup key.
function cleanLink(raw, host) {
  try {
    const u = new URL(raw);
    const linkHost = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !TRUSTED_HOSTS.has(linkHost)) return '';
    if (host && linkHost !== host) return '';
    for (const key of [...u.searchParams.keys()]) {
      if (key === 'TrackID' || key.startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.href;
  } catch {
    return '';
  }
}

function assertMadgexFeed(text) {
  if (typeof text === 'string' && /<(?:rss|channel)\b/i.test(text)) return;
  if (typeof text === 'string' && /<html\b/i.test(text)) {
    throw new Error('madgex: RSS endpoint answered an HTML page, not a feed');
  }
  throw new Error('madgex: RSS endpoint answered no feed');
}

// The description repeats the employer on a line of its own ("Acme College:"),
// so prefer the ": " whose prefix matches that line; an employer or title that
// itself holds ": " then splits right. Otherwise the first ": ".
function employerSplit(rawTitle, lines) {
  for (let i = rawTitle.indexOf(': '); i > 0; i = rawTitle.indexOf(': ', i + 1)) {
    if (lines.includes(`${rawTitle.slice(0, i).trim()}:`)) return i;
  }
  return rawTitle.indexOf(': ');
}

/**
 * Parse one Madgex `/jobsrss/` page. Exported for unit tests.
 *
 * `<title>` is "Employer: Job title" (split on the first ": "), and the last
 * line of `<description>` is the location.
 *
 * @param {string} xml
 * @param {string} [host] - when given, links on another trusted host are dropped
 */
export function parseMadgexFeed(xml, host) {
  if (typeof xml !== 'string') return [];
  const jobs = [];
  for (const item of xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || []) {
    const url = cleanLink(tagText(item, 'link'), host);
    const rawTitle = tagText(item, 'title');
    if (!url || !rawTitle) continue;
    const description = tagText(item, 'description');
    const lines = description.split('\n').map((l) => l.trim()).filter(Boolean);
    const sep = employerSplit(rawTitle, lines);
    const title = sep > 0 ? rawTitle.slice(sep + 2).trim() : rawTitle;
    const company = sep > 0 ? rawTitle.slice(0, sep).trim() : '';
    if (!title) continue;
    jobs.push({
      title,
      url,
      company,
      location: lines.length ? lines[lines.length - 1] : '',
      postedAt: toEpochMs(tagText(item, 'pubDate')),
      description: htmlToText(description),
    });
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'madgex',

  detect(entry) {
    if (entry?.provider !== 'madgex') return null;
    const host = trustedHost(entry.careers_url);
    return host ? { url: `https://${host}/jobsrss/` } : null;
  },

  async fetch(entry, ctx) {
    const host = trustedHost(entry?.careers_url);
    if (!host) {
      throw new Error(`madgex: careers_url ${JSON.stringify(entry?.careers_url)} is not https on ${[...TRUSTED_HOSTS].join(', ')}`);
    }
    let keywords = entryKeywords(entry);
    if (!keywords.length) keywords = resolveProfileKeywords();
    if (!keywords.length) {
      throw new Error(`madgex: entry "${entry?.name || '(unnamed)'}" has no madgex.keywords[] and no config/profile.yml target_roles to fall back to`);
    }

    const probing = Number(ctx?.maxPages) > 0;
    const entryMax = intInRange(entry?.max_pages, DEFAULT_MAX_PAGES, 1, MAX_PAGES_CAP);
    const maxPages = probing ? Math.min(entryMax, Number(ctx.maxPages)) : entryMax;

    /** @type {Map<string, any>} */
    const byUrl = new Map();
    const errors = [];
    let requests = 0;

    // A probe needs one list request, not one per keyword.
    for (const keyword of probing ? keywords.slice(0, 1) : keywords) {
      const query = encodeURIComponent(keyword);
      for (let page = 1; page <= maxPages; page++) {
        if (requests++ > 0) await sleep(INTER_PAGE_DELAY_MS, ctx);
        const url = `https://${host}/jobsrss/?page=${page}&keywords=${query}&sort=Date`;
        let xml;
        try {
          xml = await fetchTextWithRetry(ctx, url, { redirect: 'error' });
          assertMadgexFeed(xml);
        } catch (err) {
          if (probing) throw err;
          const msg = `"${keyword}" page ${page}: ${(err && err.message) || err}`;
          if (page === 1) errors.push(msg);
          console.error(`⚠️  madgex: ${entry?.name || host} ${msg}${page === 1 ? ' — skipping this keyword' : ' — keeping the pages already read'}`);
          break;
        }
        const rawCount = (xml.match(/<item\b/gi) || []).length;
        for (const job of parseMadgexFeed(xml, host)) {
          if (!byUrl.has(job.url)) byUrl.set(job.url, job);
        }
        if (rawCount < PAGE_SIZE) break;
        const total = Number(xml.match(/<opensearch:totalResults>(\d+)</i)?.[1]);
        if (page * PAGE_SIZE >= total) break;
        if (page === maxPages && !probing) {
          console.error(`⚠️  madgex: ${entry?.name || host} "${keyword}" stopped at max_pages ${maxPages} with more results left — raise max_pages on this entry`);
        }
      }
    }

    if (errors.length && errors.length === keywords.length) {
      throw new Error(`madgex: all ${keywords.length} keyword request(s) failed — ${errors[0]}`);
    }
    return [...byUrl.values()];
  },
};
