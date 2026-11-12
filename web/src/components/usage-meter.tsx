"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/cn";
import { FootSection } from "@/components/foot-section";

type Usage = { window5h: { tokens: number }; window7d: { tokens: number } };

// Soft total-activity budgets, including Claude cache reads. Persisted
// `career-ops:usage-budget` values remain authoritative, so users who calibrated
// this brake signal to their plan keep their own ceilings.
const DEFAULT_BUDGET = { w5: 140_000_000, w7: 1_000_000_000 };

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}
function tone(pct: number): string {
  if (pct >= 85) return "bg-red-400";
  if (pct >= 60) return "bg-amber-400";
  return "bg-emerald-400";
}

export function UsageMeter() {
  const [data, setData] = useState<Usage | null>(null);
  const [cli, setCli] = useState<string | null>(null);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);

  useEffect(() => {
    try {
      const cfg = localStorage.getItem("career-ops:config");
      setCli(cfg ? JSON.parse(cfg).cliId || null : null);
      const b = localStorage.getItem("career-ops:usage-budget");
      if (b) setBudget({ ...DEFAULT_BUDGET, ...JSON.parse(b) });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage")
        .then((r) => r.json())
        .then((d) => {
          if (alive) setData(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // The usage source is Claude's local logs; only meaningful when Claude is the CLI.
  if (cli && cli !== "claude") return null;
  if (!data) return null;

  const rows = [
    { label: "5h", tokens: data.window5h?.tokens ?? 0, budget: budget.w5, title: "Tokens used in the last 5 hours, and the share of the plan's limit" },
    { label: "7d", tokens: data.window7d?.tokens ?? 0, budget: budget.w7, title: "Tokens used in the last 7 days, and the share of the plan's limit" },
  ].map((r) => ({ ...r, pct: Math.min(100, Math.round((r.tokens / r.budget) * 100)) }));

  return (
    <div className="border-t border-border pt-2">
      <FootSection label="Usage" icon={<Gauge className="size-3" />} summary={rows.map((r) => `${r.label} ${r.pct}%`).join(" · ")} alert={rows.some((r) => r.pct >= 85) ? "near the plan's limit" : undefined}>
      <div className="space-y-2 px-1">
        {rows.map((r) => {
          const pct = r.pct;
          return (
            <div key={r.label} title={r.title}>
              <div className="flex items-center justify-between text-xs text-faint">
                <span>{r.label}</span>
                <span className="tabular-nums">
                  {fmt(r.tokens)} · {pct}%
                </span>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className={cn("h-full rounded-full transition-all", tone(pct))}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-faint">{r.tokens.toLocaleString()} tokens</div>
            </div>
          );
        })}
      </div>
      </FootSection>
    </div>
  );
}
