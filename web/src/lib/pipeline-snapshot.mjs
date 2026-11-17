/**
 * Loads /api/pipeline. Resolves null when the response is not ok, malformed,
 * failed, or superseded by a newer load: null means "keep what you have".
 * @param {typeof fetch} [fetchFn]
 * @returns {() => Promise<{ inbox: unknown[], applications: unknown[] } | null>}
 */
export function createPipelineLoader(fetchFn = fetch) {
  let latest = 0;
  return async () => {
    const mine = ++latest;
    try {
      const r = await fetchFn("/api/pipeline");
      if (!r.ok) return null;
      const d = await r.json();
      if (mine !== latest || !Array.isArray(d?.inbox) || !Array.isArray(d?.applications)) return null;
      return { inbox: d.inbox, applications: d.applications };
    } catch {
      return null;
    }
  };
}
