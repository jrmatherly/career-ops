// Which (orphan, new entry) pairs resume.mjs pair may be given. lib/resume's pairOrphan accepts any
// two ids and moves the first id onto the second entry, so the pair route refuses anything else and
// the gate panel offers only these. Pure, so the client panel and the server route share one copy.

/** Both experience entries (they carry `company`), or both from the same section. */
export const sameKind = (a, b) => (a.company !== undefined && b.company !== undefined) || (a.section !== undefined && a.section === b.section);

/** The new entries an orphan may be paired with; none for a whole-section orphan, whose id is its section name. */
export const candidatesFor = (report, orphan) => (orphan.id === orphan.section ? [] : report.newEntries.filter((n) => sameKind(orphan, n)));

/** Why `[orphanId, newId]` is not a pair the report allows, or null. */
export function pairProblem(report, [o, n]) {
  const orphan = report.orphans.find((e) => e.id === o);
  if (!orphan || candidatesFor(report, orphan).length === 0) return `${o} is not a pairable orphan in the current report`;
  const fresh = report.newEntries.find((e) => e.id === n);
  if (!fresh) return `${n} is not a new entry in the current report`;
  if (!sameKind(orphan, fresh)) return `${o} and ${n} are different kinds of entry`;
  return null;
}
