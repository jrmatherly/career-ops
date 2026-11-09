"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, RefreshCw } from "lucide-react";
import type { ScheduledJob } from "@/lib/scheduled-jobs";
import { addedLink, groupLedger } from "@/lib/evaluate-settings.mjs";

type LedgerEntry = { key: string; url: string; state: string; reason: string; rank?: number; jobId: string; runId: string; rows: { at: string }[] };

// The auto-mode ledger, read-only. The drain writes it on its own schedule, so it is
// read on mount and on Refresh, not on every reload of the jobs (each read spawns the CLI).
export function EvaluateQueuePanel({ jobs }: { jobs: ScheduledJob[] }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/evaluate-queue", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body)) throw new Error(body?.error || "Could not read the evaluate queue.");
      setEntries(body);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the evaluate queue.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const names = new Map(jobs.map((job) => [job.id, job.name]));
  const groups = entries ? groupLedger(entries) : [];

  return (
    <section aria-labelledby="evaluate-queue-title" className="rounded-2xl border border-border bg-surface/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="evaluate-queue-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ListChecks className="size-4 text-brand-text" /> Evaluate queue
        </h2>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground">
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">{error}</p>
      ) : !entries ? (
        <p className="mt-3 text-xs text-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No rows yet. A job set to Auto queues its best-ranked rows here.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <div key={group.state}>
              <h3 className="text-xs font-semibold capitalize text-foreground">{group.state} ({group.entries.length})</h3>
              <ul className="mt-1.5 divide-y divide-border/60 text-xs">
                {group.entries.map((entry: LedgerEntry) => {
                  const link = entry.state === "queued" ? addedLink(entry) : null;
                  return (
                    <li key={entry.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                      {/^https?:\/\//i.test(entry.url) ? (
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="min-w-0 max-w-full truncate text-foreground hover:text-brand-text">
                          {entry.url}
                        </a>
                      ) : (
                        <span className="min-w-0 max-w-full truncate text-foreground">{entry.url}</span>
                      )}
                      <span className="text-muted">{typeof entry.rank === "number" ? `rank ${entry.rank.toFixed(1)}` : "unranked"}</span>
                      {entry.reason && <span className="text-muted">{entry.reason}</span>}
                      <span className="text-faint">{names.get(entry.jobId) ?? entry.jobId}</span>
                      {link && (
                        <Link
                          href={link}
                          title="Opens the Inbox on the UTC date this row was queued. A row queued near midnight UTC, or ranked a day after its scan, sits under a different scan date."
                          className="text-brand-text underline-offset-2 hover:underline"
                        >
                          In the Inbox
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
