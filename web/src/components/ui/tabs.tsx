"use client";

import { cn } from "@/lib/cn";

/** A filter row: buttons that swap what the page shows, not ARIA tabs with panels. */
export function Tabs<Id extends string>({ items, value, onChange, ariaLabel }: {
  items: { id: Id; label: string; count?: number }[];
  value: Id;
  onChange: (id: Id) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-border">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === value}
          onClick={() => onChange(item.id)}
          className={cn(
            "-mb-px min-h-9 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
            item.id === value ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground",
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="ml-1 text-xs tabular-nums text-faint">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
