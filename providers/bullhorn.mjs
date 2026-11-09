// @ts-check
import { fetchJsonWithRetry, sleep } from './_http.mjs';
import { cachedLookup } from './_cached-lookup.mjs';
import { intInRange } from './_config-utils.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { coerceId } from './_ids.mjs';
import { safeEncodeURIComponent } from './_safe-url.mjs';
/** @typedef {import('./_types.js').Provider} Provider */

// Bullhorn public career-portal provider. Bullhorn customers are staffing
// agencies; each agency that enabled Bullhorn's open-source career portal
// serves it on its own branded host, with the tenant tuple in
// `{careers host}/app.json` (`service.swimlane`, `service.corpToken`). The
// postings come from the public, no-auth search API that portal calls:
//
//   GET https://public-rest{swimlane}.bullhornstaffing.com/rest-services/{corpToken}/search/JobOrder
//       ?query=(isOpen:1) AND (isDeleted:0)&fields=…&count=500&start={n}
//
// Configure as a `tracked_companies:` entry, one per agency, with
// `provider: bullhorn` and the portal's https `careers_url` (explicit-only: the
// hosts are branded). `company` is the entry's name: the agency, which rule 2
// of the Source Indexing Policy accepts as the company.
// Optional `bullhorn: { swimlane, corpToken }` skips the app.json lookup.
//
// Measured 2026-11-08 on a live tenant: `address` and `publishedCategory` come
// back only when their sub-fields are named (`address(city,state,countryID)`),
// `dateLastPublished` is epoch ms, and a `start` past `total` answers
// `{data: []}`. Neither host serves a robots.txt (public-rest31 answers 404,
// the portal host its SPA shell).
//
// The app.json request goes to the agency's own host, for which no vendor
// allowlist can exist (the phenom.mjs shape; the DNS/IP guard in _http.mjs is
// the protection there). The list requests are allowlisted by
// assertBullhornUrl, and job URLs are built on the entry's own https origin,
// never on a URL read from app.json.

const API_HOST_RE = /^public-rest\d{1,3}\.bullhornstaffing\.com$/;
const SWIMLANE_RE = /^\d{1,3}$/;
const CORP_TOKEN_RE = /^[A-Z0-9]{4,12}$/;
const PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 20;
const MAX_PAGES_CAP = 200;
const INTER_PAGE_DELAY_MS = 250;
const FIELDS = 'id,title,address(city,state,countryID),employmentType,dateLastPublished,publicDescription,publishedCategory(id,name)';

/** Throws unless `url` is https on a public-rest{N}.bullhornstaffing.com host. */
export function assertBullhornUrl(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !API_HOST_RE.test(u.hostname)) {
    throw new Error(`bullhorn: refusing non-Bullhorn API URL ${u.origin}`);
  }
  return url;
}

function careersOrigin(entry) {
  let u;
  try {
    u = new URL(entry?.careers_url);
  } catch {
    u = null;
  }
  if (!u || u.protocol !== 'https:') {
    throw new Error(`bullhorn: careers_url ${JSON.stringify(entry?.careers_url)} is not an https URL`);
  }
  // Rebuilt from the hostname so a port in the input never survives.
  return `https://${u.hostname}`;
}

function checkTuple(swimlane, corpToken, source) {
  const s = String(swimlane ?? '');
  const c = String(corpToken ?? '');
  if (!SWIMLANE_RE.test(s)) throw new Error(`bullhorn: ${source} swimlane ${JSON.stringify(swimlane)} is not 1-3 digits`);
  if (!CORP_TOKEN_RE.test(c)) throw new Error(`bullhorn: ${source} corpToken ${JSON.stringify(corpToken)} is not 4-12 of A-Z0-9`);
  return { swimlane: s, corpToken: c };
}

/**
 * The agency's tenant tuple: from `entry.bullhorn`, else from
 * `{careers origin}/app.json` (through ctx.idCache when present).
 * @returns {Promise<{ swimlane: string, corpToken: string }>}
 */
export async function resolveTenant(entry, ctx) {
  const override = entry?.bullhorn;
  if (override?.swimlane !== undefined || override?.corpToken !== undefined) {
    return checkTuple(override.swimlane, override.corpToken, 'bullhorn:');
  }
  const origin = careersOrigin(entry);
  return cachedLookup(ctx?.idCache, new URL(origin).hostname, async () => {
    const app = await fetchJsonWithRetry(ctx, `${origin}/app.json`, { redirect: 'error' });
    if (!app || typeof app !== 'object' || !app.service || typeof app.service !== 'object') {
      const got = app && typeof app === 'object' ? Object.keys(app).join(', ') : typeof app;
      throw new Error(`bullhorn: ${origin}/app.json has no service block, got: [${got}]`);
    }
    if (typeof app.careersUrl === 'string' && app.careersUrl) {
      let other = '';
      try { other = new URL(app.careersUrl).origin; } catch { other = app.careersUrl; }
      if (other !== origin) console.error(`ℹ️  bullhorn: ${origin}/app.json names careersUrl ${other}; job URLs stay on ${origin}`);
    }
    return checkTuple(app.service.swimlane, app.service.corpToken, 'app.json');
  }, {
    isValid: (v) => !!v && SWIMLANE_RE.test(v.swimlane) && CORP_TOKEN_RE.test(v.corpToken),
    isGone: (err) => err?.status === 404 || err?.status === 410,
  });
}

function toLocation(address) {
  if (!address || typeof address !== 'object') return '';
  const parts = [address.city, address.state].filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim());
  if (address.countryID === 1) parts.push('US');
  return parts.join(', ');
}

/**
 * Map one page of JobOrder rows to Jobs. Exported for the shared surrogate test.
 * @param {any[]} rows
 * @param {string} origin - the agency's careers origin
 * @param {string} company
 */
export function parseBullhornJobs(rows, origin, company) {
  const jobs = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const seg = row.id === undefined || row.id === null ? null : safeEncodeURIComponent(String(row.id));
    if (!title || !seg) continue;
    const job = {
      title,
      url: `${origin}/#/jobs/${seg}`,
      company,
      location: toLocation(row.address),
      postedAt: Number.isFinite(row.dateLastPublished) && row.dateLastPublished > 0 ? row.dateLastPublished : undefined,
      description: htmlToText(row.publicDescription),
    };
    const req = coerceId(row.id);
    if (req) job.requisitionId = req;
    jobs.push(job);
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'bullhorn',

  detect(entry) {
    if (entry?.provider !== 'bullhorn' || typeof entry.careers_url !== 'string') return null;
    try {
      const u = new URL(entry.careers_url);
      return u.protocol === 'https:' ? { url: `https://${u.hostname}` } : null;
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const origin = careersOrigin(entry);
    const { swimlane, corpToken } = await resolveTenant(entry, ctx);
    const company = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : new URL(origin).hostname;

    const probing = Number(ctx?.maxPages) > 0;
    const entryMax = intInRange(entry?.max_pages, DEFAULT_MAX_PAGES, 1, MAX_PAGES_CAP);
    const maxPages = probing ? Math.min(entryMax, Number(ctx.maxPages)) : entryMax;

    const jobs = [];
    // `start` advances by the rows actually served, so a tenant that caps
    // `count` below PAGE_SIZE is still walked to `total`.
    let start = 0;
    for (let page = 0; page < maxPages; page++) {
      if (page > 0) await sleep(INTER_PAGE_DELAY_MS, ctx);
      const params = new URLSearchParams({
        query: '(isOpen:1) AND (isDeleted:0)',
        fields: FIELDS,
        sort: '-dateLastPublished',
        count: String(PAGE_SIZE),
        start: String(start),
      });
      const url = assertBullhornUrl(`https://public-rest${swimlane}.bullhornstaffing.com/rest-services/${corpToken}/search/JobOrder?${params}`);
      let json;
      try {
        json = await fetchJsonWithRetry(ctx, url, { redirect: 'error' });
      } catch (err) {
        if (probing || page === 0) throw err;
        console.error(`⚠️  bullhorn: ${company} page ${page + 1} failed (${(err && err.message) || err}) — keeping ${jobs.length} postings`);
        break;
      }
      const rows = json && Array.isArray(json.data) ? json.data : null;
      const parsed = rows ? parseBullhornJobs(rows, origin, company) : [];
      const problem = !rows ? `unexpected response — expected data[], got: [${json && typeof json === 'object' ? Object.keys(json).join(', ') : typeof json}]`
        : rows.length > 0 && parsed.length === 0 ? `${rows.length} JobOrder rows but none parsed (each needs a title and an id); the response shape may have changed`
          : '';
      if (problem) {
        if (probing || page === 0) throw new Error(`bullhorn: ${problem}`);
        console.error(`⚠️  bullhorn: ${company} page ${page + 1}: ${problem} — keeping ${jobs.length} postings`);
        break;
      }
      jobs.push(...parsed);
      start += rows.length;
      const total = Number(json.total);
      if (rows.length === 0 || (Number.isFinite(total) ? start >= total : rows.length < PAGE_SIZE)) break;
      if (page === maxPages - 1 && !probing) {
        console.error(`⚠️  bullhorn: ${company} stopped at max_pages ${maxPages} with postings left — raise max_pages on this entry`);
      }
    }
    return jobs;
  },
};
