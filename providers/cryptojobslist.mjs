// @ts-check
import { decodeEntities } from './_html-entities.mjs';
import { fetchTextWithRetry } from './_http.mjs';
import { htmlToText } from './_html-to-text.mjs';
/** @typedef {import('./_types.js').Provider} Provider */

// Crypto Jobs List provider: the board-wide public RSS feed at
// https://api.cryptojobslist.com/jobs.rss (Web3 / crypto roles), the URL the
// feed's own <atom:link rel="self"> names. Wire in via a `job_boards:` entry
// with `provider: cryptojobslist` (explicit-only).
//
// Measured 2026-11-08: one request returns 100 postings while the board's
// sitemap-jobs.xml lists 658, so this reads the feed's 100 only and the
// catalog row says so; the items carry no date, so whether they are the
// newest 100 is unconfirmed. `/rss` answers 403 and is not used. Items carry
// <title> (the role alone), <dc:creator> (the employer), <media:location>
// (96 of 100) and a CDATA HTML <description>; CDATA text is literal (14 of
// 201 title/creator fields hold a bare "&", none an entity). A title
// "Role at Company" split is the fallback only when <dc:creator> is absent.

const FEED_URL = 'https://api.cryptojobslist.com/jobs.rss';
const BOARD_HOSTS = new Set(['cryptojobslist.com', 'www.cryptojobslist.com']);
const CONFIG_HOSTS = new Set([...BOARD_HOSTS, 'api.cryptojobslist.com']);

function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function extractText(inner) {
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return decodeEntities(inner).trim();
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? extractText(m[1]) : '';
}

function httpsOn(hosts, value) {
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'https:' && hosts.has(u.hostname) ? u.href : '';
  } catch {
    return '';
  }
}

function assertFeed(text) {
  if (typeof text === 'string' && /<(?:rss|channel)\b/i.test(text)) return;
  if (typeof text === 'string' && /<html\b/i.test(text)) {
    throw new Error('cryptojobslist: RSS endpoint answered an HTML page, not a feed');
  }
  throw new Error('cryptojobslist: RSS endpoint answered no feed');
}

/**
 * Parse the Crypto Jobs List RSS feed. Exported for unit tests.
 * @param {string} xml
 */
export function parseCryptoJobsListFeed(xml) {
  if (typeof xml !== 'string') return [];
  const jobs = [];
  for (const item of xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || []) {
    const url = httpsOn(BOARD_HOSTS, tagText(item, 'link'));
    let title = tagText(item, 'title');
    let company = tagText(item, 'dc:creator');
    if (!/<dc:creator\b/i.test(item)) {
      const at = title.lastIndexOf(' at ');
      if (at > 0) {
        company = title.slice(at + 4).trim();
        title = title.slice(0, at).trim();
      }
    }
    if (!url || !title) continue;
    jobs.push({
      title,
      url,
      company,
      location: tagText(item, 'media:location'),
      postedAt: toEpochMs(tagText(item, 'pubDate')),
      description: htmlToText(tagText(item, 'description')),
    });
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'cryptojobslist',

  detect(entry) {
    return entry?.provider === 'cryptojobslist' ? { url: FEED_URL } : null;
  },

  async fetch(entry, ctx) {
    // The feed URL is fixed; a careers_url, when set, must name this board.
    if (entry?.careers_url != null && entry.careers_url !== '') {
      if (!httpsOn(CONFIG_HOSTS, entry.careers_url)) {
        throw new Error(`cryptojobslist: careers_url ${JSON.stringify(entry.careers_url)} is not https://cryptojobslist.com`);
      }
    }
    const xml = await fetchTextWithRetry(ctx, FEED_URL, { redirect: 'error' });
    assertFeed(xml);
    const jobs = parseCryptoJobsListFeed(xml);
    const items = (xml.match(/<item\b/gi) || []).length;
    if (items > 0 && jobs.length === 0) {
      throw new Error(`cryptojobslist: feed has ${items} items but none parsed (link host or markup changed?)`);
    }
    return jobs;
  },
};
