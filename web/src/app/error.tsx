"use client";

import { TriangleAlert } from "lucide-react";
import { PageFrame } from "@/components/page-frame";

// Production replaces a server error's message with generic text, so for a
// server error the digest is the only detail worth showing: it matches the
// server log line. An error with no digest came from a Client Component.
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageFrame className="max-w-3xl">
      <div role="alert" className="mt-8 flex gap-3 rounded-2xl border border-border bg-surface/30 p-5">
        <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-faint" />
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">This page could not load</h1>
          <p className="mt-2 text-sm text-muted">
            {error.digest
              ? "The server hit an error while building it. The reason is in the terminal or log of the server running career-ops."
              : "It hit an error while rendering. The reason is in the browser console."}
          </p>
          {error.digest && <p className="mt-3 font-mono text-xs text-faint">Error digest {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]"
          >
            Try again
          </button>
        </div>
      </div>
    </PageFrame>
  );
}
