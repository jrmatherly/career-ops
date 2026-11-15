"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/cn";
import { FootSection } from "@/components/foot-section";

type PlanRow = { label: string; percent: number; resets: string | null };
type Usage = { window5h: { tokens: number }; window7d: { tokens: number }; plan?: { rows: PlanRow[] } | null };

// "Current session" -> "Session", "Current week (all models)" -> "Week",
// "Current week (Fable)" -> "Week · Fable".
function planLabel(label: string): string {
  const m = label.replace(/^Current\s+/i, "").match(/^(\w+)\s*(?:\((.*)\))?$/);
  if (!m) return label;
  const head = m[1][0].toUpperCase() + m[1].slice(1);
  return m[2] && !/^all models$/i.test(m[2]) ? `${head} · ${m[2]}` : head;
}

// Soft total-activity budgets, including Claude cache reads. Persisted
// `career-ops:usage-budget` values remain authoritative, so users who calibrated
// this brake signal to their plan keep their own ceilings.
const DEFAULT_BUDGET = { w5: 140_000_000, w7: 1_000_000_000 };

function fmt(n: number): string {
  // The cut-offs sit where the next unit would round up, so 999,950,000 reads 1B, not 1000M.
  if (n >= 999_950_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}
const NEAR_LIMIT = 85;

function tone(pct: number): string {
  if (pct >= NEAR_LIMIT) return "bg-red-400";
  if (pct >= 60) return "bg-amber-400";
  return "bg-emerald-400";
}

export function UsageMeter() {
  const [data, setData] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const [cli, setCli] = useState<string | null>(null);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);

  useEffect(() => {
    try {
      const cfg = localStorage.getItem("career-ops:config");
      setCli(cfg ? JSON.parse(cfg).cliId || null : null);
      const b = localStorage.getItem("career-ops:usage-budget");
      if (b) {
        // A stored zero or non-number would make every share read 0%, hiding the limit signal.
        const stored = JSON.parse(b) ?? {};
        const positive = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
        setBudget({ w5: positive(stored.w5, DEFAULT_BUDGET.w5), w7: positive(stored.w7, DEFAULT_BUDGET.w7) });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`usage ${r.status}`))))
        .then((d) => {
          if (!alive) return;
          setData(d);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // The usage source is Claude's local logs; only meaningful when Claude is the CLI.
  if (cli && cli !== "claude") return null;
  // A failed read must not look like "no usage": the row is the only at-a-glance limit signal.
  if (!data) {
    return failed ? (
      <div className="border-t border-border pt-2">
        <FootSection label="Usage" icon={<Gauge className="size-3" />} summary="unavailable">
          <p className="px-1 text-xs text-muted">Usage could not be read. The server log has the reason.</p>
        </FootSection>
      </div>
    ) : null;
  }

  // Real plan limits when the Claude CLI answered; otherwise the token estimate.
  const planRows = data.plan?.rows ?? [];
  const tokens5h = data.window5h?.tokens ?? 0;
  const tokens7d = data.window7d?.tokens ?? 0;
  // A zero estimate still paints a 2% bar. Hide it until a plan or any tokens exist.
  if (planRows.length === 0 && tokens5h === 0 && tokens7d === 0) return null;
  const clampPct = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0);
  const rows = planRows.length
    ? planRows.map((r) => ({
        label: planLabel(r.label),
        pct: clampPct(r.percent),
        text: `${clampPct(r.percent)}%`,
        detail: r.resets ? `Resets ${r.resets}` : null,
        title: `${r.percent}% of your plan limit used${r.resets ? `, resets ${r.resets}` : ""}`,
      }))
    : [
        { label: "5h", tokens: tokens5h, budget: budget.w5, title: "Tokens used in the last 5 hours, and an estimated share of the plan's limit" },
        { label: "7d", tokens: tokens7d, budget: budget.w7, title: "Tokens used in the last 7 days, and an estimated share of the plan's limit" },
      ].map((r) => {
        const pct = clampPct((r.tokens / r.budget) * 100);
        return { label: r.label, pct, text: `${fmt(r.tokens)} · ${pct}%`, detail: `${r.tokens.toLocaleString()} tokens`, title: r.title };
      });

  return (
    <div className="border-t border-border pt-2">
      <FootSection label="Usage" icon={<Gauge className="size-3" />} summary={failed ? "stale" : rows.map((r) => `${r.label} ${r.pct}%`).join(" ")} alert={rows.some((r) => r.pct >= NEAR_LIMIT) ? "near the plan's limit" : undefined}>
      <div className="space-y-2 px-1">
        {rows.map((r) => (
          <div key={r.label} title={r.title}>
            <div className="flex items-center justify-between text-xs text-faint">
              <span>{r.label}</span>
              <span className="tabular-nums">{r.text}</span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
              <div
                className={cn("h-full rounded-full transition-all", tone(r.pct))}
                style={{ width: `${Math.max(r.pct, 2)}%` }}
              />
            </div>
            {r.detail && <div className="mt-0.5 text-xs tabular-nums text-faint">{r.detail}</div>}
          </div>
        ))}
      </div>
      </FootSection>
    </div>
  );
}
