import { PageFrame } from "@/components/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export default function ResumeLoading() {
  return (
    <PageFrame aria-label="Loading resume editor">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="min-h-[60vh] w-full rounded-2xl" />
      </div>
    </PageFrame>
  );
}
