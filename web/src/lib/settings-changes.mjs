import { dirtyChanges } from "./settings-form.mjs";

const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((item, i) => item === b[i]) : a === b);

/**
 * What the Settings save bar holds: per group, only the keys whose draft differs from the saved value.
 *
 * @param {Record<string, Record<string, unknown>>} draftByGroup
 * @param {Record<string, Record<string, unknown>>} savedByGroup
 * @returns {{ count: number, groups: { id: string, changes: Record<string, unknown> }[] }}
 */
export function pendingChanges(draftByGroup, savedByGroup) {
  const groups = [];
  let count = 0;
  for (const [id, draft] of Object.entries(draftByGroup)) {
    const saved = savedByGroup[id] ?? {};
    const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => !same(value, saved[key])));
    const n = Object.keys(changes).length;
    if (n === 0) continue;
    count += n;
    groups.push({ id, changes });
  }
  return { count, groups };
}

/**
 * The save bar's pending changes, from the page's groups and what the user has typed.
 * Only editable rows count, and a draft equal to the saved value is not a change.
 *
 * @param {{ id: string, settings: any[] }[]} groups
 * @param {Record<string, unknown>} form
 */
export function pendingFromGroups(groups, form) {
  // dirtyChanges already knows a reset (null) from no change, so its answer is used as it is.
  const pending = groups.map((group) => ({ id: group.id, changes: dirtyChanges(group.settings, form) })).filter((g) => Object.keys(g.changes).length > 0);
  return { count: pending.reduce((n, g) => n + Object.keys(g.changes).length, 0), groups: pending };
}

/**
 * Sends each pending group in order and stops at the first that is not saved, so the rest stay pending.
 *
 * @template T
 * @param {T[]} groups
 * @param {(group: T) => Promise<boolean>} send  resolves true when the server saved it
 * @returns {Promise<boolean>} whether every group was saved
 */
export async function saveInOrder(groups, send) {
  for (const group of groups) if (!(await send(group))) return false;
  return true;
}
