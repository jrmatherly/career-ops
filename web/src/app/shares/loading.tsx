import { PageFrame } from "@/components/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export default function SharesLoading() {
  return (
    <PageFrame>
      <div aria-label="Loading shares">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-56" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
