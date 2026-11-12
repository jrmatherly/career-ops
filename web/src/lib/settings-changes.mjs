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
