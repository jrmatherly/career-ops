"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Edit3, Globe, Loader2, MoreVertical, Pause, Play, Sparkles, Trash2, Zap } from "lucide-react";
import type { ScheduledJob } from "@/lib/scheduled-jobs";
import { evaluateModeLabel } from "@/lib/evaluate-settings.mjs";
import { cn } from "@/lib/cn";
import { formatWhen } from "@/lib/format-time.mjs";
import { cadenceLabel } from "@/lib/scheduled-cadence.mjs";

export function JobCard({
  job,
  onToggleStatus,
  onEdit,
  onDelete,
  onRunFinished,
}: {
  job: ScheduledJob;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onEdit: (job: ScheduledJob) => void;
  onDelete: (id: string) => void;
  onRunFinished: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleRunNow = async () => {
    setRunning(true);
    setRunMessage(null);

    try {
      const res = await fetch(`/api/scheduled-jobs/${job.id}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Run failed");

      setRunMessage(` Completed! Found ${data.rolesFound || 0} matching roles.`);
      onRunFinished();
    } catch (err) {
      setRunMessage(` Error: ${err instanceof Error ? err.message : "Run failed"}`);
    } finally {
      setRunning(false);
    }
  };

  const isFull = job.engine === "full";
  const isActive = job.status === "active";
  const positiveList = job.filters?.positive || [];
  const modeLabel = evaluateModeLabel(job.evaluate);

  return (
    <div className="co-rise group flex min-w-0 flex-col justify-between h-full gap-2.5 rounded-xl border border-border bg-surface/40 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm">
      <div className="space-y-2.5">
        {/* Title, schedule badge and options menu */}
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">{job.name}</h2>
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-text">
              {cadenceLabel(job)}
            </span>
          </div>

          {/* 3-Dots Dropdown Menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`Options for ${job.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="grid size-7 place-items-center rounded text-faint transition-colors hover:bg-surface-hover hover:text-foreground"
              title="Options"
            >
              <MoreVertical className="size-4" />
            </button>

            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(job);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
                >
                  <Edit3 className="size-3.5" /> Edit Scan
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(job.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
                >
                  <Trash2 className="size-3.5" /> Delete Scan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Engine & Status Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium",
              isFull ? "border-brand/30 bg-brand-soft/60 text-brand-text" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400"
            )}
          >
            {isFull ? <Globe className="size-3" /> : <Zap className="size-3" />}
            {isFull ? "Full ATS Sweep" : "Zero-Token Portals"}
          </span>

          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium",
              isActive
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "border-border bg-surface-hover text-muted"
            )}
          >
            <span className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-zinc-400")} />
            {job.status}
          </span>

          {modeLabel && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 font-medium text-foreground">
              <Sparkles className="size-3" />
              {modeLabel}
            </span>
          )}
        </div>

        {job.filtersFrom === "file" ? (
          <p className="text-xs text-faint">uses portals.yml</p>
        ) : positiveList.length > 0 && (
          <div className="space-y-1.5 text-xs">
            <p className="flex items-center gap-2 text-muted">
              {positiveList.length} {positiveList.length === 1 ? "keyword" : "keywords"}
              <button
                type="button"
                onClick={() => setShowKeywords((v) => !v)}
                aria-expanded={showKeywords}
                className="min-h-6 rounded px-1.5 font-medium text-brand-text hover:bg-brand-soft"
              >
                {showKeywords ? "Hide" : "Show"}
              </button>
            </p>
            {showKeywords && (
              <div className="flex flex-wrap gap-1.5">
                {positiveList.map((kw, i) => (
                  <span key={i} className="max-w-[140px] truncate rounded border border-border px-1.5 py-0.5 font-medium text-muted">
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs">
          <span className={cn("size-2 shrink-0 rounded-full", job.lastError ? "bg-rose-500" : job.lastRunAt ? "bg-emerald-500" : "bg-zinc-400")} />
          <span className="font-semibold uppercase tracking-wide text-faint">Last run</span>
          <span className="min-w-0 flex-1 truncate text-muted">{job.lastRunAt ? formatWhen(job.lastRunAt) : "Never"}</span>
          {job.lastRunAt && <b className="shrink-0 text-foreground">{job.rolesFoundCount || 0} roles</b>}
        </div>
        {job.lastError && (
          <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <span className="truncate">Last error: {job.lastError}</span>
          </p>
        )}
        {runMessage && <p className="text-xs font-medium text-brand-text">{runMessage}</p>}
      </div>

      {/* Action Buttons Row pinned to bottom */}
      <div className="mt-auto pt-2 flex items-center gap-2 border-t border-border/40">
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-brand/30 px-2.5 py-2 text-xs font-medium text-brand-text transition-colors hover:bg-brand-soft disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {running ? "Scanning…" : "Run now"}
        </button>

        <button
          type="button"
          onClick={() => onToggleStatus(job.id, job.status)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-medium transition-colors max-sm:min-h-[44px]",
            isActive ? "bg-surface-hover text-foreground hover:bg-brand-soft hover:text-brand-text" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-400"
          )}
        >
          {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {isActive ? "Pause" : "Resume"}
        </button>
      </div>
    </div>
  );
}
