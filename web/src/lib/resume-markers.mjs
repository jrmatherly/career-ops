/**
 * Which rendered blocks a Check finding outlines. `paths` are the preview's data-resume-path values
 * (entry paths such as sections.experience.items.1.roles.0, and basics); `marker` is a finding's dotted path.
 *
 * Its own path or longest dotted prefix wins. Otherwise every path under it, or under its nearest ancestor
 * that has some, down to a section (two segments): an item-level field of a company rendered only as its
 * roles reaches the roles, and a section's title reaches its entries. Nothing for summary, metadata or picture.
 *
 * @param {string[]} paths
 * @param {string} marker
 * @returns {string[]}
 */
export function markerTargets(paths, marker) {
  // Profiles print inside the contact row, which carries the basics path.
  if (marker.startsWith("sections.profiles.")) marker = "basics";
  let best = null;
  for (const p of paths) if ((p === marker || marker.startsWith(`${p}.`)) && (best === null || p.length > best.length)) best = p;
  if (best !== null) return [best];
  for (let m = marker; m.split(".").length >= 2; m = m.slice(0, m.lastIndexOf("."))) {
    const under = [...new Set(paths.filter((p) => p.startsWith(`${m}.`)))];
    if (under.length) return under;
  }
  return [];
}
