import { cn } from "@/lib/cn";

const WIDTHS = { wide: "max-w-6xl", reading: "max-w-3xl" } as const;

/** The one page shell: `wide` for lists and dashboards, `reading` for forms and prose. */
export function PageFrame({ children, className, width = "wide", ...rest }: {
  children: React.ReactNode;
  className?: string;
  width?: keyof typeof WIDTHS;
  "aria-label"?: string;
}) {
  return <div className={cn("mx-auto px-4 py-6 sm:px-6 sm:py-8 max-sm:pb-24", WIDTHS[width], className)} {...rest}>{children}</div>;
}
