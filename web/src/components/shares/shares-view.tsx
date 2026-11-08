"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PullResponse, Share } from "@/lib/shares";

const PUBLISH_CMD = "node publish/share.mjs publish --slug <name> --from-resume";

// UTC to the minute (pull writes toISOString(), always Z): the same text on the server and the client, so hydration never mismatches.
const pulledLabel = (at: string) => (Number.isNaN(Date.parse(at)) ? at : `${at.slice(0, 16).replace("T", " ")} UTC`);

export function SharesView({ shares, error, accountUrl }: { shares: Share[]; error: string | null; accountUrl: string | null }) {
  const router = useRouter();
  // Which pull is in flight: one slug, or every share from Pull all.
  const [pulling, setPulling] = useState<{ slug: string } | { all: true } | null>(null);
  // An object, so a repeat of the same message is a new toast (and restarts a transient one's timer).
  // A toast stays until dismissed unless marked transient: error advice runs to a few hundred characters, too long to read in 6 s.
  const [toast, setToast] = useState<{ text: string; transient?: true } | null>(null);

  useEffect(() => {
    if (!toast?.transient) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function pull(slug?: string) {
    if (pulling) return;
    setPulling(slug ? { slug } : { all: true });
    try {
      const res = await fetch("/api/shares/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(slug ? { slug } : {}) });
      const data = (await res.json().catch(() => null)) as PullResponse | null;
      if (!res.ok || !data || !("ok" in data)) {
        setToast({ text: `Pull failed: ${data && "error" in data ? data.error : `HTTP ${res.status}`}` });
        return;
      }
      // The CLI skips a share the service no longer has and still exits 0; say so, or the row just stays stale.
      // When nothing answered at all, the likelier cause is the URL, not deleted shares: never advise deleting then.
      if (data.missing.length && data.pulled === 0) {
        setToast({ text: `The publish service answered for none of the shares (${data.missing.join(", ")}); check PUBLISH_URL in the environment (the career-ops HelmRelease env on a cluster install) or the data root's .env before deleting anything.` });
      } else if (data.missing.length) {
        setToast({ text: `Not on the publish service any more: ${data.missing.join(", ")}. Drop each with node publish/share.mjs delete --slug ${data.missing[0]}${data.missing.length > 1 ? " and so on" : ""}`, transient: true });
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setToast({ text: "Pull failed: could not reach the app" });
    } finally {
      setPulling(null);
    }
  }

  return (
    <PageFrame>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Shares</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="tabular-nums">{shares.length}</span> published · views and comments refresh on Pull
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accountUrl && (
            <a href={accountUrl} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ExternalLink className="size-3.5" />
              Manage publish keys
            </a>
          )}
          {shares.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void pull()} disabled={pulling !== null}>
              {pulling && "all" in pulling ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Pull all
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {!error && shares.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">No shares yet. Publishing stays in the CLI, so the service key never enters the app:</p>
          <code className="mt-3 inline-block rounded-md bg-surface-hover px-3 py-1.5 font-mono text-xs text-foreground">{PUBLISH_CMD}</code>
        </div>
      )}

      {shares.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Overlay</th>
                <th className="px-3 py-2">Password</th>
                <th className="px-3 py-2 text-right">Views</th>
                <th className="px-3 py-2 text-right">Comments</th>
                <th className="px-3 py-2">Last pulled</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <SharesRow key={s.slug} share={s} busy={pulling !== null && ("all" in pulling || pulling.slug === s.slug)} disabled={pulling !== null} onPull={() => void pull(s.slug)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 sm:bottom-6">
          <div role="status" className="flex max-w-full items-start gap-2 rounded-2xl border border-border bg-surface px-4 py-2 text-sm text-red-700 shadow-lg dark:text-red-400">
            <p className="break-words">{toast.text}</p>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="shrink-0 rounded p-0.5 text-muted hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </PageFrame>
  );
}

function SharesRow({ share: s, busy, disabled, onPull }: { share: Share; busy: boolean; disabled: boolean; onPull: () => void }) {
  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="px-3 py-2 font-mono text-xs">{s.slug}</td>
        <td className="max-w-[16rem] truncate px-3 py-2">
          {/^https?:\/\//.test(s.url) ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-text hover:underline">
              {s.url}
            </a>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-muted">{s.source || "—"}</td>
        <td className="px-3 py-2 text-muted">{s.overlay || "none"}</td>
        <td className="px-3 py-2">{s.hasPassword ? <Badge tone="info">set</Badge> : <span className="text-faint">none</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums">{s.pulled ? s.pulled.views : "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{s.pulled ? s.pulled.comments : "—"}</td>
        <td className="px-3 py-2 text-muted">{s.pulled ? pulledLabel(s.pulled.at) : "never"}</td>
        <td className="px-3 py-2 text-right">
          <Button variant="outline" size="sm" onClick={onPull} disabled={disabled || !s.pullable} aria-label={`Pull ${s.slug}`} title={s.pullable ? undefined : "This slug starts with a dash; use Pull all or the CLI"}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Pull
          </Button>
        </td>
      </tr>
      {/* pull writes a header and a note line, no comment blocks, for a share with no comments; nothing to show then */}
      {s.feedback && s.pulled?.comments ? (
        <tr className="border-t border-border/50 bg-surface/40">
          <td colSpan={9} className="px-3 py-2">
            <details>
              <summary className="cursor-pointer text-xs text-muted">Comments for {s.slug}</summary>
              {/* Reviewer text is third-party data: shown verbatim as text, never rendered as markup. */}
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground">{s.feedback}</pre>
            </details>
          </td>
        </tr>
      ) : null}
    </>
  );
}
