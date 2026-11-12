"use client";

import { useEffect, useRef } from "react";
import type { MarkerSeverity } from "@/components/cv-studio/cv-preview";

export type Severity = MarkerSeverity;

export type Finding = { id: string; category: string; severity: Severity; key: string; path: string; pointer: string; message: string; fix: string; params?: Record<string, unknown> };

export type CheckReport = {
  score: number;
  templateKnown: boolean;
  totalRules: number;
  passedRules: number;
  counts: Record<Severity, number>;
  categories: Record<string, { total: number; passed: number }>;
  findings: Finding[];
  ignored: Finding[];
};

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  error: { label: "Error", className: "text-red-700 dark:text-red-300" },
  warning: { label: "Warning", className: "text-amber-800 dark:text-amber-300" },
  info: { label: "Info", className: "text-sky-700 dark:text-sky-300" },
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]";

type Props = { report: CheckReport | null; error: string | null; pinned: string | null; onPin(key: string): void; onIgnore(key: string): void };

export function CheckPanel({ report, error, pinned, onPin, onIgnore }: Props) {
  const drawer = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (drawer.current) drawer.current.open = window.matchMedia("(min-width: 1024px)").matches;
  }, []);

  // In the checker's category order, so the list does not reshuffle as severities change.
  const groups = Object.entries(report?.categories ?? {})
    .map(([category, c]) => ({ category, c, findings: (report?.findings ?? []).filter((f) => f.category === category) }))
    .filter((g) => g.findings.length > 0);

  return (
    <details ref={drawer} className="mb-3 rounded-md border border-border">
      <summary className={`cursor-pointer px-3 py-2 text-sm font-medium text-foreground ${FOCUS}`}>
        {error ? (
          <span className="text-red-700 dark:text-red-300">Check failed</span>
        ) : report ? (
          <>
            Check score {report.score}/100
            <span className="ml-2 font-normal text-muted">
              {report.counts.error} error{report.counts.error === 1 ? "" : "s"}, {report.counts.warning} warning{report.counts.warning === 1 ? "" : "s"}, {report.counts.info} info
            </span>
          </>
        ) : (
          "Check"
        )}
      </summary>
      <div className="space-y-3 border-t border-border p-3 text-sm">
        {error && (
          <p role="alert" className="text-red-700 dark:text-red-300">
            Check failed: {error}
          </p>
        )}
        {!report && !error && <p className="text-muted">Checking…</p>}
        {report && !report.templateKnown && <p className="text-xs text-muted">This template is not one the check knows, so the layout rules assumed one column with no sidebar.</p>}
        {report && report.findings.length === 0 && <p className="text-foreground">All {report.totalRules} rules pass.</p>}
        {groups.map(({ category, c, findings }) => {
          return (
            <section key={category} aria-label={`${category} findings`} className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                {category}
                <span className="ml-2 normal-case">{c.passed} of {c.total} pass</span>
              </h3>
              <ul className="space-y-1">
                {findings.map((f) => (
                  <li key={f.key} className="flex items-start gap-2">
                    <button type="button" aria-pressed={pinned === f.key} onClick={() => onPin(f.key)} className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-left ${pinned === f.key ? "border-brand/60 bg-brand-soft" : "border-transparent hover:border-border"} ${FOCUS}`}>
                      <span className={`mr-2 text-xs font-medium ${SEVERITY[f.severity].className}`}>{SEVERITY[f.severity].label}</span>
                      <span className="text-foreground">{f.message}</span>
                      <span className="block truncate font-mono text-xs text-muted">{f.path}</span>
                    </button>
                    <button type="button" aria-label={`Ignore: ${f.message}`} onClick={() => onIgnore(f.key)} className={`shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground ${FOCUS}`}>
                      Ignore
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {report && report.ignored.length > 0 && (
          <p className="text-xs text-muted">
            {report.ignored.length} finding{report.ignored.length === 1 ? " is" : "s are"} ignored. Save the resume to keep the ignore list.
          </p>
        )}
      </div>
    </details>
  );
}
