import { dirtyChanges } from "./settings-form.mjs";

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
