"use client";

import { applicationKey } from "@/lib/pipeline-status.mjs";
import type { BoardCard } from "@/lib/application-detail";
import { Card } from "@/components/board/card";
import { useState } from "react";
import { columnStatus, splitAtApplyLine } from "@/lib/board.mjs";

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
  const evaluated = tab === "EVALUATED";
  const [openLanes, setOpenLanes] = useState<ReadonlySet<string>>(new Set());
  const renderCard = (card: BoardCard) => {
    const key = applicationKey(card);
    return (
      <Card key={key} card={card} cardKey={key} saving={isSaving(key)} hideNextStep={evaluated && card.nextStep === "Not applied"} onOpen={() => onOpen(key)} onMove={(to) => onMove(key, to)} />
    );
  };
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
      <h2 className="flex items-center justify-between text-base font-semibold text-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{count}</span>
      </h2>
      <div className="mt-3 flex min-h-16 flex-1 flex-col gap-2">
        {lanes.map(({ lane, rows }) => {
          const { above, below } = evaluated ? splitAtApplyLine(rows) : { above: rows, below: [] };
          const laneKey = lane ?? "";
          const showBelow = openLanes.has(laneKey);
          const unscored = below.some((row) => !/\d/.test(row.score ?? ""));
          return (
            <div key={laneKey} className="flex flex-col gap-2">
              {lane !== null && <h3 className="mt-1 text-xs font-medium text-muted">{lane}</h3>}
              {above.map(renderCard)}
              {below.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showBelow}
                  onClick={() => setOpenLanes((open) => new Set(open).symmetricDifference(new Set([laneKey])))}
                  className="min-h-8 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {below.length} below the apply line{unscored && " or not scored"}
                </button>
              )}
              {showBelow && below.map(renderCard)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
