import Link from "next/link";
import { cn } from "@/lib/cn";

// Unlike StatCard, every tile's numeral is serif: a row of these is the page's
// headline counts, and several on one page is intended.
export function StatTile({ value, label, href }: { value: number | string; label: string; href?: string }) {
  const frame = "block rounded-2xl border border-border bg-surface px-4 py-3.5";
  const body = (
    <>
      <span className="block font-display text-4xl leading-none text-brand-text tabular-nums">{value}</span>
      <span className="mt-1 block text-sm text-muted">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className={cn(frame, "transition-colors hover:border-brand/40 hover:bg-surface-hover")}>{body}</Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
