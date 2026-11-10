import { FolderX } from "lucide-react";

/** Shown in place of every page while the configured data folder is refused. */
export function DataRootRefused({ source, root }: { source: string; root: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-4 py-10 sm:px-6">
      <div role="alert" className="flex gap-3 rounded-2xl border border-border bg-surface/30 p-5">
        <FolderX aria-hidden className="mt-1 size-5 shrink-0 text-faint" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight text-landing">career-ops can&apos;t use this data folder</h1>
          <p className="mt-2 text-sm text-muted">
            {source} points inside a Claude Code plugin install, which Claude Code replaces on every plugin update.
            Anything saved there would be lost, so nothing was read or written.
          </p>
          <p className="mt-3 break-all font-mono text-xs text-foreground">{root}</p>
          <p className="mt-3 text-sm text-muted">
            Point it at a folder outside <code className="text-foreground">~/.claude/plugins</code>, or remove it to use{" "}
            <code className="text-foreground">~/career-ops-data</code>. Then restart career-ops.
          </p>
        </div>
      </div>
    </main>
  );
}
