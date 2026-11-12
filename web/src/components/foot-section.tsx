"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A sidebar foot block that starts closed unless `defaultOpen`, and opens when `defaultOpen` turns true.
 * It never closes on its own, so a section the user opened stays open across navigation. The label row is the toggle; `summary` stays visible beside it, and `alert` marks it as a warning with an icon and its words for a screen reader.
 */
export function FootSection({ label, icon, summary, alert, defaultOpen = false, children }: {
  label: string;
  icon?: React.ReactNode;
  summary?: string;
  alert?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [initial] = useState(defaultOpen);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (defaultOpen && ref.current) ref.current.open = true;
  }, [defaultOpen]);
  return (
    <details ref={ref} className="group" open={initial}>
      <summary className="flex min-h-7 max-sm:min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-md px-1 text-xs font-semibold uppercase tracking-[0.14em] text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 [&::-webkit-details-marker]:hidden">
        {icon}
        <span>{label}</span>
        <span className={cn("ml-auto inline-flex items-center gap-1 whitespace-nowrap font-normal normal-case tracking-normal tabular-nums", alert && "font-medium text-red-700 dark:text-red-400")}>
          {alert && <TriangleAlert aria-hidden className="size-3 shrink-0" />}
          {summary}
          {alert && <span className="sr-only">, {alert}</span>}
        </span>
        <ChevronRight aria-hidden className="size-3 shrink-0 transition-transform group-open:rotate-90" />
      </summary>
      <div className="pb-2 pt-1">{children}</div>
    </details>
  );
}
