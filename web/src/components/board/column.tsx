"use client";

import { applicationKey } from "@/lib/pipeline-status.mjs";
import type { BoardCard } from "@/lib/application-detail";
import { Card } from "@/components/board/card";
import { columnStatus } from "@/lib/board.mjs";

export function Column({
  tab,
  count,
  lanes,
  isSaving,
  onOpen,
  onMove,
}: {
  tab: string;
  count: number;
  lanes: { lane: string | null; rows: BoardCard[] }[];
  isSaving: (key: string) => boolean;
  onOpen: (key: string) => void;
  onMove: (key: string, tab: string) => void;
}) {
  const label = columnStatus(tab) ?? tab;
  return (
    <section
      aria-label={`${label}, ${count}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const key = event.dataTransfer.getData("text/plain");
        if (key) onMove(key, tab);
      }}
      className="flex w-72 shrink-0 snap-start flex-col rounded-2xl border border-border bg-surface/60 p-3"
    >
      <h2 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-faint">
        <span>{label}</span>
        <span className="tabular-nums">{count}</span>
      </h2>
      <div className="mt-3 flex min-h-16 flex-1 flex-col gap-2">
        {lanes.map(({ lane, rows }) => (
          <div key={lane ?? ""} className="flex flex-col gap-2">
            {lane !== null && <h3 className="mt-1 text-xs font-medium text-muted">{lane}</h3>}
            {rows.map((card) => {
              const key = applicationKey(card);
              return (
                <Card key={key} card={card} cardKey={key} saving={isSaving(key)} onOpen={() => onOpen(key)} onMove={(to) => onMove(key, to)} />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
