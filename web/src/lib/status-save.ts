// The board's drop rules. A drop moves a card to another stage through the
// web's only status writer, POST /api/status (set-status.mjs under the
// tracker lock), reusing the pipeline's identity, optimistic-replay and held-
// save helpers. Relative .mjs imports keep this file loadable by node --test.
import { applicationKey, applySavedStatus, saveStatus } from "./pipeline-status.mjs";
import { reduceHeldSave } from "./status-save-hold.mjs";
import { columnOf, columnStatus } from "./board.mjs";

export type BoardRow = { n: string; company: string; role: string; date: string; report: string; status: string };
export type HeldSaves = ReturnType<typeof reduceHeldSave>;
export type BoardSaveState<T extends BoardRow = BoardRow> = { rows: T[]; holds: HeldSaves };
export type SaveOptions = { request?: typeof fetch; wait?: (ms: number) => Promise<void> };
export type DropOutcome = { outcome: "noop" } | { outcome: "saved"; status: string } | { outcome: "reverted"; error: string };

/** Retries for a 503 whose code is "lock-timeout": set-status.mjs exit 4, another writer holds the tracker lock. */
export const RETRIES = 3;
export const RETRY_DELAY_MS = 250;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The status a drop onto `tab` saves, or null when it would change nothing. */
export function dropTarget(row: BoardRow, tab: string): string | null {
  const next = columnStatus(tab);
  return next && columnOf(row.status) !== tab ? next : null;
}

/** One save, retried while the tracker lock is busy. Any other failure is final. */
export async function saveWithRetry(
  n: string,
  from: string,
  to: string,
  { request = fetch, wait = sleep }: SaveOptions = {},
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  for (let attempt = 0; ; attempt++) {
    // Set inside the fetch wrapper, so the declared type must stay wide.
    let reply = "none" as "none" | "busy" | "other";
    // Only set-status.mjs exit 4 (code "lock-timeout") is worth retrying; /api/status
    // also answers 503 for a data-only root, which no retry fixes.
    const tracked: typeof fetch = async (input, init) => {
      const response = await request(input, init);
      const code = response.status === 503 ? (await response.clone().json().catch(() => null))?.code : undefined;
      reply = code === "lock-timeout" ? "busy" : "other";
      return response;
    };
    try {
      return { ok: true, status: (await saveStatus(n, from, to, tracked)) ?? to };
    } catch (e) {
      if (reply === "busy" && attempt < RETRIES) {
        await wait(RETRY_DELAY_MS);
        continue;
      }
      // The lock-timeout body names the lock directory, an absolute server path, so it stays out of the toast.
      if (reply === "busy") return { ok: false, error: "The tracker stayed busy, so the card moved back. Try again in a moment." };
      // fetch also rejects when the connection drops after the server took the POST.
      if (reply === "none") return { ok: false, error: "Lost contact with career-ops before the save was confirmed, so the card moved back. Refresh to see whether it was applied." };
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/**
 * Drop `row` onto column `tab`. A drop onto the card's own column, or of a card
 * whose last save is still pending, does nothing and sends nothing. Otherwise the card moves at
 * once, and moves back with an error if the save fails. State changes go
 * through `update` as functions, so a second drop that settles first is kept.
 */
export async function dropCard<T extends BoardRow>(
  state: BoardSaveState<T>,
  row: T,
  tab: string,
  update: (fn: (prev: BoardSaveState<T>) => BoardSaveState<T>) => void,
  options: SaveOptions = {},
): Promise<DropOutcome> {
  const next = dropTarget(row, tab);
  const key = applicationKey(row);
  if (!next || state.holds.get(key)?.phase === "pending") return { outcome: "noop" };
  update((prev) => ({
    rows: applySavedStatus(prev.rows, { key, status: next }),
    holds: reduceHeldSave(prev.holds, { type: "start", key, status: next, n: row.n }),
  }));
  const result = await saveWithRetry(row.n, row.status, next, options);
  if (result.ok) {
    update((prev) => ({ rows: prev.rows, holds: reduceHeldSave(prev.holds, { type: "clear", key }) }));
    return { outcome: "saved", status: result.status };
  }
  update((prev) => ({
    rows: applySavedStatus(prev.rows, { key, status: row.status }),
    holds: reduceHeldSave(prev.holds, { type: "fail", key, error: result.error, n: row.n }),
  }));
  return { outcome: "reverted", error: result.error };
}
