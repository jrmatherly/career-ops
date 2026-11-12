"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Radar, Wrench } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatWhen } from "@/lib/format-time.mjs";
import type { WatchedCompany } from "@/lib/portals-config.mjs";
import { showPortalsSetup } from "@/lib/portals-setup.mjs";
import { filterPortals, healthOf, portalCounts, withUnlisted, type PortalTab } from "@/lib/portals-view-model.mjs";

type Company = { name: string; status: string; detail: string };
type Health = Record<string, { status: string; detail: string }>;
type Result = { available: boolean; configured: boolean; companies: Company[]; error?: string; checkedAt?: string; saveError?: string };

const TONE: Record<string, { dot: string; label: string; chip: string }> = {
  live: { dot: "bg-emerald-500", label: "live", chip: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400" },
  empty: { dot: "bg-amber-500", label: "live · empty", chip: "bg-amber-500/15 text-amber-800 dark:text-amber-400" },
  broken: { dot: "bg-red-500", label: "broken", chip: "bg-red-500/15 text-red-700 dark:text-red-400" },
  skipped: { dot: "bg-zinc-400", label: "no ATS", chip: "bg-surface-hover text-muted" },
};

export function PortalsView({
  watched,
  missing = false,
  target = "portals.yml",
  revision: loaded = "",
  checkedAt: savedAt = null,
  health: saved = {},
}: {
  watched: WatchedCompany[];
  missing?: boolean;
  target?: string;
  revision?: string;
  checkedAt?: string | null;
  health?: Health;
}) {
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(saved);
  const [checkedAt, setCheckedAt] = useState(savedAt);
  const [tab, setTab] = useState<PortalTab>("scanned");
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState(() => new Map(watched.map((c) => [c.name, c.enabled])));
  const [pending, setPending] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [revision, setRevision] = useState(loaded);
  const { jobs, startJob } = useJobs();

  // map the agentic "fix-portal" workers to the company they're repairing
  const fixByCompany = useMemo(() => {
    const m = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) {
      if (j.kind !== "fix-portal" || !j.input) continue;
      const ex = m.get(j.input);
      if (!ex || j.startedAt > ex.startedAt) m.set(j.input, j);
    }
    return m;
  }, [jobs]);

  const companies = useMemo(() => withUnlisted(watched.map((c) => ({ ...c, enabled: enabled.get(c.name) ?? c.enabled })), health), [watched, enabled, health]);
  const counts = portalCounts(companies, health);
  const shown = filterPortals(companies, { query, tab, health });

  function check() {
    setLoading(true);
    fetch("/api/portals/verify")
      .then((r) => r.json())
      .then((r: Result) => {
        setRes(r);
        // A run that printed no company keeps the last result on screen.
        if (!r.configured || !r.checkedAt || r.companies.length === 0) return;
        setHealth(Object.fromEntries(r.companies.map((c) => [c.name, { status: c.status, detail: c.detail }])));
        setCheckedAt(r.checkedAt);
      })
      .catch((e) => setRes({ available: false, configured: false, companies: [], error: e instanceof Error ? e.message : String(e) }))
      .finally(() => setLoading(false));
  }

  async function toggle(name: string) {
    if (pending) return;
    const next = !enabled.get(name);
    const set = (value: boolean) => setEnabled((all) => new Map(all).set(name, value));
    set(next);
    setPending(true);
    setToggleError(null);
    try {
      const r = await fetch("/api/portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: name, enabled: next, revision }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRevision(body.revision);
    } catch (e) {
      set(!next);
      setToggleError(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
          Check portal health
        </button>
        {loading && <span className="text-xs text-faint">Probing each company&apos;s ATS… (~30–60s)</span>}
      </div>

      {res && !res.available && !res.error && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
          <code className="text-foreground">verify-portals.mjs</code> not found — this needs a complete career-ops
          checkout (the web orchestrates the core&apos;s validator).
        </p>
      )}
      {res && !res.available && res.error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-muted">
          <span className="font-medium text-red-700 dark:text-red-400">The portal check did not finish</span> — no
          portal was verified, so none is shown as healthy. Try again, or run{" "}
          <code className="text-foreground">node verify-portals.mjs</code> to see why.{" "}
          <code className="break-all font-mono text-xs text-faint">{res.error}</code>
        </p>
      )}
      {res?.saveError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
          This check finished but could not be saved, so the page will not show it after a reload: {res.saveError}
        </p>
      )}
      {showPortalsSetup(missing, res) && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
          No <code className="break-all text-foreground">{target}</code> yet. Copy{" "}
          <code className="text-foreground">templates/portals.example.yml</code> to{" "}
          <code className="break-all text-foreground">{target}</code> and list the companies to watch. A health check does not create that file.
        </p>
      )}

      {watched.length > 0 && (
        <div className="mt-6">
          <Tabs
            ariaLabel="Companies"
            value={tab}
            onChange={setTab}
            items={[
              { id: "scanned", label: "Scanned", count: counts.scanned },
              { id: "paused", label: "Paused", count: counts.paused },
              { id: "attention", label: "Needs attention", count: counts.attention },
            ]}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
            className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground placeholder:text-faint sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          />
          {toggleError && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
              {toggleError}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              {query.trim() ? "No company matches that search." : tab === "attention" ? (checkedAt ? "Every scanned board answered the last check." : "Run a health check to see which boards still answer.") : "No companies here."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
              {shown.map((c) => {
                const h = healthOf(health, c.name);
                const t = h ? (TONE[h.status] ?? TONE.skipped) : null;
                return (
                  <li key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={cn("flex min-w-0 items-center gap-3", !c.enabled && "opacity-60")}>
                      <span title={t?.label} className={cn("size-1.5 shrink-0 rounded-full", t ? t.dot : "bg-border")} />
                      <CompanyLogo name={c.name} size={20} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          <span className="font-medium">{c.name}</span>{" "}
                          <span className="font-mono text-xs text-faint">{c.host}</span>
                        </p>
                        {h && (
                          <p className="truncate text-xs text-faint">
                            {h.detail} · checked {formatWhen(checkedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {h?.status === "broken" && <FixAffordance company={c.name} job={fixByCompany.get(c.name)} onFix={() => startJob({ title: `Fix · ${c.name}`, subtitle: "repair portal slug", kind: "fix-portal", input: c.name, page: "/portals" })} />}
                      {!("unlisted" in c) && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={c.enabled}
                        aria-label={`Scan ${c.name}`}
                        // Not `disabled`: a disabled button drops keyboard focus, and the list is long.
                        aria-disabled={pending}
                        onClick={() => toggle(c.name)}
                        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors aria-disabled:opacity-60", c.enabled ? "bg-brand" : "bg-surface-hover")}
                      >
                        <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform", c.enabled ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
                      </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FixAffordance({ company, job, onFix }: { company: string; job?: Job; onFix: () => void }) {
  if (job?.status === "running")
    return (
      <Link href={`/jobs/${job.id}`} className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-brand-text">
        <Loader2 className="size-3 animate-spin" /> Fixing…
      </Link>
    );
  if (job?.status === "done")
    return (
      <Link href={`/jobs/${job.id}`} className="inline-flex min-h-6 items-center text-xs font-medium text-emerald-800 dark:text-emerald-400">
        repaired · re-check
      </Link>
    );
  return (
    <button
      onClick={onFix}
      title={`Have the agent repair ${company}'s portal slug`}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-brand/40 hover:text-brand-text"
    >
      <Wrench className="size-3" /> Fix
    </button>
  );
}
