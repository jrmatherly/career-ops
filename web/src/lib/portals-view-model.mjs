// Imported by the client view too, so no node: imports here.

/** @typedef {{ name: string, enabled: boolean, host: string, board: string }} WatchedCompany */
/** @typedef {{ status: string, detail: string }} PortalHealth */
/** @typedef {'scanned' | 'paused' | 'attention'} PortalTab */

const BOARD_HOSTS = [
  ["greenhouse.io", "Greenhouse"],
  ["lever.co", "Lever"],
  ["ashbyhq.com", "Ashby"],
  ["myworkdayjobs.com", "Workday"],
  ["workable.com", "Workable"],
];
const OTHER_BOARD = "Other";

/** @param {unknown} url */
function boardOfUrl(url) {
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  // The domain itself or a subdomain of it, so notlever.co is not Lever.
  return BOARD_HOSTS.find(([base]) => host === base || host.endsWith(`.${base}`))?.[1];
}

/**
 * The job board a tracked company is read from: its `provider`, else the board
 * its `api` or `careers_url` is hosted on, else Other.
 * @param {{ provider?: unknown, api?: unknown, careers_url?: unknown }} company
 */
export function boardType({ provider, api, careers_url }) {
  const named = typeof provider === "string" ? provider.trim() : "";
  if (named) return named[0].toUpperCase() + named.slice(1);
  return boardOfUrl(api) ?? boardOfUrl(careers_url) ?? OTHER_BOARD;
}

/** The distinct boards present, sorted, Other last. @param {WatchedCompany[]} companies */
export function boardTypes(companies) {
  const present = [...new Set(companies.map((c) => c.board))];
  return [...present.filter((b) => b !== OTHER_BOARD).sort(), ...present.filter((b) => b === OTHER_BOARD)];
}

/** The check prints trimmed names, so a tracked "Acme " still finds its result. @param {Record<string, PortalHealth>} health @param {string} name */
export const healthOf = (health, name) => health[name.trim()];

/**
 * Each watched company with its place in the list and its switch as the page holds it.
 * By position, because two entries may share a name and each keeps its own switch.
 * @param {WatchedCompany[]} watched @param {boolean[]} enabled
 */
export const withToggles = (watched, enabled) => watched.map((c, index) => ({ ...c, index, enabled: enabled[index] ?? c.enabled }));

/**
 * The watched companies plus every checked board the list does not hold (the
 * check also probes `job_boards`), so a broken one still gets a row and a count.
 * @template {WatchedCompany} T
 * @param {T[]} companies @param {Record<string, PortalHealth>} health
 * @returns {(T | (WatchedCompany & { unlisted: true }))[]}
 */
export function withUnlisted(companies, health) {
  const listed = new Set(companies.map((c) => c.name.trim()));
  return [...companies, ...Object.keys(health).filter((name) => !listed.has(name)).map((name) => ({ name, host: "", board: OTHER_BOARD, enabled: true, unlisted: /** @type {const} */ (true) }))];
}

/** @param {WatchedCompany} c @param {PortalTab} tab @param {Record<string, PortalHealth>} health */
function inTab(c, tab, health) {
  if (tab === "paused") return !c.enabled;
  if (tab === "attention") return c.enabled && healthOf(health, c.name)?.status === "broken";
  return c.enabled;
}

/**
 * @template {WatchedCompany} T
 * @param {T[]} companies
 * @param {{ query: string, tab: PortalTab, health: Record<string, PortalHealth>, board?: string }} filter `board` is '' for any.
 */
export function filterPortals(companies, { query, tab, health, board = "" }) {
  const q = query.trim().toLowerCase();
  return companies.filter(
    (c) => inTab(c, tab, health) && (!board || c.board === board) && (!q || c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q)),
  );
}

/** @param {WatchedCompany[]} companies @param {Record<string, PortalHealth>} health */
export function portalCounts(companies, health) {
  const count = (/** @type {PortalTab} */ tab) => companies.filter((c) => inTab(c, tab, health)).length;
  return { scanned: count("scanned"), paused: count("paused"), attention: count("attention") };
}

/** Scanned companies the last check holds no result for (added since, or printed under another name). @param {WatchedCompany[]} companies @param {Record<string, PortalHealth>} health */
export const uncheckedCount = (companies, health) => companies.filter((c) => c.enabled && !healthOf(health, c.name)).length;

/**
 * The last saved health check, from the text of data/portal-health.json (null when
 * the file is missing). Text that does not parse throws, so the page shows it
 * instead of hiding a broken board behind "no check yet".
 * @param {string | null} text
 * @returns {{ checkedAt: string, health: Record<string, PortalHealth> } | null}
 */
export function parsePortalHealth(text) {
  if (text === null) return null;
  const saved = JSON.parse(text);
  if (typeof saved?.checkedAt !== "string" || !Array.isArray(saved.companies)) {
    throw new Error("portal-health.json is not a saved health check");
  }
  /** @type {Record<string, PortalHealth>} */
  const health = {};
  for (const c of saved.companies) {
    if (typeof c?.name !== "string" || typeof c.status !== "string" || typeof c.detail !== "string") throw new Error("portal-health.json holds an entry without a name, status or detail");
    if (c.name.trim()) health[c.name.trim()] = { status: c.status, detail: c.detail };
  }
  return { checkedAt: saved.checkedAt, health };
}
