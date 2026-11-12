// Imported by the client view too, so no node: imports here.

/** @typedef {{ name: string, enabled: boolean, host: string }} WatchedCompany */
/** @typedef {{ status: string, detail: string }} PortalHealth */
/** @typedef {'scanned' | 'paused' | 'attention'} PortalTab */

/** @param {WatchedCompany} c @param {PortalTab} tab @param {Record<string, PortalHealth>} health */
function inTab(c, tab, health) {
  if (tab === "paused") return !c.enabled;
  if (tab === "attention") return c.enabled && health[c.name]?.status === "broken";
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
  for (const c of saved.companies) health[c.name] = { status: c.status, detail: c.detail };
  return { checkedAt: saved.checkedAt, health };
}
