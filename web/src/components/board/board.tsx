"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageFrame } from "@/components/page-frame";
import { Column } from "@/components/board/column";
import { ApplicationSheet } from "@/components/board/application-sheet";
import { groupByColumn } from "@/lib/board.mjs";
import { applicationKey, applySavedStatus } from "@/lib/pipeline-status.mjs";
import { dropCard, type BoardSaveState } from "@/lib/status-save";
import type { BoardCard } from "@/lib/application-detail";

// Fresh server rows, with any save still in flight replayed so its card does not jump back.
function withPending(cards: BoardCard[], holds: BoardSaveState<BoardCard>["holds"]): BoardCard[] {
  let rows = cards;
  for (const [key, hold] of holds) if (hold.phase === "pending") rows = applySavedStatus(rows, { key, status: hold.status });
  return rows;
}

export function Board({ cards }: { cards: BoardCard[] }) {
  const router = useRouter();
  const [state, setState] = useState<BoardSaveState<BoardCard>>(() => ({ rows: cards, holds: new Map() }));
  const [seen, setSeen] = useState(cards);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // dropCard checks holds in the render-time state; two drops before a re-render would both pass it.
  const inFlight = useRef(new Set<string>());

  if (seen !== cards) {
    setSeen(cards);
    setState((prev) => ({ rows: withPending(cards, prev.holds), holds: prev.holds }));
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Toasts, holds and the open sheet re-render the board; regroup only when the rows change.
  const { columns, byKey } = useMemo(() => ({
    columns: groupByColumn(state.rows, new Map(state.rows.map((c) => [Number(c.n), { lane: c.detail.lane ?? undefined }]))),
    byKey: new Map(state.rows.map((c) => [applicationKey(c), c])),
  }), [state.rows]);
  const open = openKey ? byKey.get(openKey) ?? null : null;

  async function move(key: string, tab: string) {
    const row = byKey.get(key);
    if (!row || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    const result = await dropCard(state, row, tab, setState).finally(() => inFlight.current.delete(key));
    if (result.outcome === "saved") router.refresh();
    else if (result.outcome === "reverted") setToast(result.error);
  }

  return (
    <PageFrame>
      <h1 className="font-display text-2xl tracking-tight text-landing">Board</h1>
      <p className="mt-1 text-sm text-muted">
        <span className="tabular-nums">{state.rows.length}</span> tracked · drag a card, or focus it and press M to move it
      </p>
      {state.rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">No tracked applications yet.</p>
          <Link href="/pipeline" className="mt-2 inline-block text-sm font-medium text-brand-text hover:underline">
            Go to the pipeline
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <Column
              key={column.tab}
              tab={column.tab}
              count={column.count}
              lanes={column.lanes}
              isSaving={(key) => state.holds.get(key)?.phase === "pending"}
              onOpen={setOpenKey}
              onMove={(key, tab) => void move(key, tab)}
            />
          ))}
        </div>
      )}
      {open && openKey && <ApplicationSheet card={open} onClose={() => setOpenKey(null)} onMove={(tab) => void move(openKey, tab)} />}
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
          <p role="status" className="max-w-full break-words rounded-2xl border border-border bg-surface px-4 py-2 text-sm text-red-700 shadow-lg dark:text-red-400">
            {toast}
          </p>
        </div>
      )}
    </PageFrame>
  );
}
