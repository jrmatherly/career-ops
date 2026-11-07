"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { scoreTone } from "@/lib/format";
import { BOARD_COLUMNS, columnStatus } from "@/lib/board.mjs";
import type { BoardCard } from "@/lib/application-detail";

export function Card({
  card,
  cardKey,
  saving,
  onOpen,
  onMove,
}: {
  card: BoardCard;
  cardKey: string;
  saving: boolean;
  onOpen: () => void;
  onMove: (tab: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const titleId = useId();
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        draggable={!saving}
        aria-busy={saving}
        aria-label={`${card.company}, ${card.role}. Press Enter to open, M to move.`}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", cardKey);
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          } else if (event.key.toLowerCase() === "m" && !saving && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            setChoosing(true);
          }
        }}
        className={cn(
          "block w-full cursor-pointer rounded-xl border border-border bg-surface p-3 text-left text-sm transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
          saving && "cursor-progress opacity-60",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-medium text-foreground">{card.company}</p>
          {card.score && <Badge tone={scoreTone(card.score)}>{card.score}</Badge>}
        </div>
        <p className="mt-0.5 text-muted">{card.role}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-faint">
          {card.stageDays !== null && <span className="tabular-nums">{card.stageDays}d in stage</span>}
          <span>{saving ? "Saving…" : card.nextStep}</span>
        </p>
        {card.detail.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.detail.tags.map((tag) => (
              <Badge key={tag} tone="info" className="font-medium">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Modal isOpen={choosing} onClose={() => setChoosing(false)} labelledBy={titleId} panelClassName="max-w-xs p-4">
        <h2 id={titleId} className="text-sm font-semibold text-foreground">
          Move {card.company} to
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {BOARD_COLUMNS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setChoosing(false);
                onMove(tab);
              }}
              className="rounded-md border border-border px-2 py-1.5 text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]"
            >
              {columnStatus(tab)}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
