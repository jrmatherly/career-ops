import { FolderX } from "lucide-react";

/**
 * Shown in place of every page while the configured data folder is refused.
 * `message` is the resolver's own text, so the screen and the CLI cannot disagree.
 */
export function DataRootRefused({ message, source }: { message: string; source: string }) {
  // The marker file is read on every request; an environment variable is not.
  const needsRestart = source.startsWith("CAREER_OPS_");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-4 py-10 sm:px-6">
      <div className="flex gap-3 rounded-2xl border border-border bg-surface/30 p-5">
        <FolderX aria-hidden className="mt-1 size-5 shrink-0 text-faint" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight text-landing">career-ops can&apos;t use this data folder</h1>
          <p className="mt-2 break-words text-sm text-muted">{message}</p>
          <p className="mt-3 text-sm text-muted">
            Nothing was read or written.{" "}
            {needsRestart ? "Restart career-ops after changing it." : "Reload this page after changing it."}
          </p>
        </div>
      </div>
    </main>
  );
}
