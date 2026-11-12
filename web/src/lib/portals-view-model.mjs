// Imported by the client view too, so no node: imports here.

/** @typedef {{ name: string, enabled: boolean, host: string }} WatchedCompany */
/** @typedef {{ status: string, detail: string }} PortalHealth */
/** @typedef {'scanned' | 'paused' | 'attention'} PortalTab */

/** The check prints trimmed names, so a tracked "Acme " still finds its result. @param {Record<string, PortalHealth>} health @param {string} name */
export const healthOf = (health, name) => health[name.trim()];

/**
 * The watched companies plus every checked board the list does not hold (the
 * check also probes `job_boards`), so a broken one still gets a row and a count.
 * @param {WatchedCompany[]} companies @param {Record<string, PortalHealth>} health
 * @returns {(WatchedCompany & { unlisted?: true })[]}
 */
export function withUnlisted(companies, health) {
  const listed = new Set(companies.map((c) => c.name.trim()));
  return [...companies, ...Object.keys(health).filter((name) => !listed.has(name)).map((name) => ({ name, host: "", enabled: true, unlisted: /** @type {const} */ (true) }))];
}

/** @param {WatchedCompany} c @param {PortalTab} tab @param {Record<string, PortalHealth>} health */
function inTab(c, tab, health) {
  if (tab === "paused") return !c.enabled;
  if (tab === "attention") return c.enabled && healthOf(health, c.name)?.status === "broken";
  return c.enabled;
}

/**
 * @param {WatchedCompany[]} companies
 * @param {{ query: string, tab: PortalTab, health: Record<string, PortalHealth> }} filter
 */
export function filterPortals(companies, { query, tab, health }) {
  const q = query.trim().toLowerCase();
  return companies.filter(
    (c) => inTab(c, tab, health) && (!q || c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q)),
  );
}

/** @param {WatchedCompany[]} companies @param {Record<string, PortalHealth>} health */
export function portalCounts(companies, health) {
  const count = (/** @type {PortalTab} */ tab) => companies.filter((c) => inTab(c, tab, health)).length;
  return { scanned: count("scanned"), paused: count("paused"), attention: count("attention") };
}

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
  for (const c of saved.companies) if (typeof c.name === "string" && c.name.trim()) health[c.name.trim()] = { status: c.status, detail: c.detail };
  return { checkedAt: saved.checkedAt, health };
}
