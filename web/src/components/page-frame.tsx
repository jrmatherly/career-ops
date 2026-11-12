import { cn } from "@/lib/cn";

const WIDTHS = { wide: "max-w-6xl", reading: "max-w-3xl" } as const;

/**
 * The one page shell: `wide` for lists and dashboards, `reading` for forms and prose.
 * The last block in a page gets the deep bottom padding that lets its final row scroll clear of the Ask and back-to-top tabs.
 */
export function PageFrame({ children, className, width = "wide", ...rest }: {
  children: React.ReactNode;
  className?: string;
  width?: keyof typeof WIDTHS;
  "aria-label"?: string;
}) {
  return <div className={cn("mx-auto px-4 pb-8 pt-6 last:pb-32 sm:px-6 sm:pt-8", WIDTHS[width], className)} {...rest}>{children}</div>;
}
