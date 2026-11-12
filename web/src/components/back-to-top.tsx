"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { shouldShowBackToTop, scrollBehaviorFor } from "@/lib/scroll-to-top.mjs";

// Floating control that returns the window to the top of long pages. Rendered
// once from the app shell. The window is the scroll container here (main has no
// own overflow-y), so it listens on window scroll and calls window.scrollTo.
//
// It is docked on the right edge one row above the Ask tab. A lower z-index lets an open assistant panel cover it. When hidden it's removed from the tab order
// and hidden from assistive tech, so there's nothing to land on until it shows.
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(shouldShowBackToTop(window.scrollY));
    onScroll(); // sync once in case we mount already scrolled (restored position)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: scrollBehaviorFor(prefersReducedMotion) });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        // The last block's pb-32 lets content scroll clear of this tab and Ask below it.
        "fixed bottom-[4.5rem] right-[env(safe-area-inset-right)] z-40 flex h-11 w-9 items-center justify-center rounded-l-full",
        "border border-r-0 border-border bg-surface/90 text-muted shadow-lg backdrop-blur",
        "transition-[opacity,transform,color,background-color] duration-200",
        "hover:bg-surface-hover hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        visible ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  );
}
