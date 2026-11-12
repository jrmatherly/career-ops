"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListChecks, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { scoreTone } from "@/lib/format";
import type { ScheduledJob } from "@/lib/scheduled-jobs";
import { addedLink, groupLedger, postingHref } from "@/lib/evaluate-settings.mjs";

type LedgerEntry = { key: string; url: string; state: string; reason: string; rank?: number; company?: string; role?: string; score?: string; trackerN?: string; jobId: string; runId: string; rows: { at: string }[] };

// The auto-mode ledger, read-only. The drain writes it on its own schedule, so it is
// read on mount and on Refresh, not on every reload of the jobs (each read spawns the CLI).
export function EvaluateQueuePanel({ jobs }: { jobs: ScheduledJob[] }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [unnamed, setUnnamed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Only the newest request may set state; a slow earlier one must not overwrite it.
  const requestSeq = useRef(0);

  const load = async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const response = await fetch("/api/evaluate-queue", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body)) throw new Error(body?.error || "Could not read the evaluate queue.");
      if (seq !== requestSeq.current) return;
      setEntries(body);
      setSkipped(Number(response.headers.get("X-Evaluate-Queue-Skipped")) || 0);
      setUnnamed(response.headers.has("X-Evaluate-Queue-Unnamed"));
      setError(null);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : "Could not read the evaluate queue.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
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
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} /> {loading ? "Refreshing…" : "Refresh"}
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
                  const href = postingHref(entry.url);
                  const title = entry.company && entry.role ? `${entry.company} · ${entry.role}` : entry.url;
                  return (
                    <li key={entry.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 max-w-full truncate leading-6 text-foreground hover:text-brand-text">
                          {title}
                        </a>
                      ) : (
                        <span className="min-w-0 max-w-full truncate text-foreground">{title}</span>
                      )}
                      <span className="text-muted">{typeof entry.rank === "number" ? `est. ${entry.rank.toFixed(1)}` : "unranked"}</span>
                      {entry.score && (
                        <span className="text-muted">
                          → <Badge tone={scoreTone(entry.score)}>{entry.score}</Badge>
                        </span>
                      )}
                      {entry.reason && !(entry.trackerN && /^report \d+$/.test(entry.reason)) &&<span className="text-muted">{entry.reason}</span>}
                      <span className="text-faint">{names.get(entry.jobId) ?? entry.jobId}</span>
                      {link && (
                        <Link
                          href={link}
                          title="Opens the Inbox on the UTC date this row was queued. The Inbox groups rows by the host-local scan day, so a row queued near midnight UTC, or ranked a day after its scan, sits under a different date."
                          className="inline-flex min-h-6 items-center text-brand-text underline-offset-2 hover:underline"
                        >
                          In the Inbox
                        </Link>
                      )}
                      {entry.trackerN && (
                        <Link href={`/pipeline/${encodeURIComponent(entry.trackerN)}`} className="inline-flex min-h-6 items-center text-brand-text underline-offset-2 hover:underline">
                          View evaluation
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
      {entries && skipped > 0 && (
        <p className="mt-3 text-xs text-muted">
          {skipped} {skipped === 1 ? "row" : "rows"} in data/evaluate-queue.tsv could not be read and {skipped === 1 ? "is" : "are"} not shown; the server log names the lines.
        </p>
      )}
      {entries && unnamed && (
        <p role="status" className="mt-3 text-xs text-muted">
          The tracker or the inbox could not be read, so rows show their URL with no company, score or evaluation link; the server log has the reason.
        </p>
      )}
    </section>
  );
}
