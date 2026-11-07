import { PageFrame } from "@/components/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export default function BoardLoading() {
  return (
    <PageFrame>
      <div aria-label="Loading board">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-48" />
        <div className="mt-6 flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-5 w-24" />
              {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
                <Skeleton key={j} className="h-24" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
