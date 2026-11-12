"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, TriangleAlert, Upload } from "lucide-react";
import { CvMarkdown, CvMarkdownEditor, useCvEditor } from "@/components/cv-editor";
import { CvIngest } from "@/components/cv/cv-ingest";
import { CvPreview } from "@/components/cv-studio/cv-preview";
import { PageFrame } from "@/components/page-frame";
import { PageHeader } from "@/components/page-header";
import { ResumeEditor } from "@/components/resume/resume-editor";
import type { TemplateOption } from "@/components/resume/template-picker";
import { SkillGaps } from "@/components/skill-gaps";
import { Tabs } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { attentionSummary, attentionText, lineRange } from "@/lib/cv-attention.mjs";
import { cn } from "@/lib/cn";

type Tab = "preview" | "edit";
const TABS: { id: Tab; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "edit", label: "Edit" },
];

type Absorb =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; markdown: string; data: unknown; report: { unparsed?: { line: number; text: string }[] } | null; lossless: boolean };

export function CvPage({ format, templates, templatesError }: { format: string | null; templates: TemplateOption[]; templatesError?: string }) {
  const editor = useCvEditor();
  const { state, dispatch, stateRef, importing, setImporting, importSaving, setImportSaving } = editor;
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "edit" ? "edit" : "preview";
  const setTab = (next: Tab) => {
    const url = new URL(window.location.href);
    if (next === "edit") url.searchParams.set("tab", "edit");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };

  const [absorb, setAbsorb] = useState<Absorb>({ kind: "loading" });
  const [html, setHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [structured, setStructured] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [focusLine, setFocusLine] = useState<{ line: number } | null>(null);

  // Re-read cv.md through the absorb after every confirmed save, so the preview and banner follow the file on disk.
  const saved = state.phase === "ready" ? state.saved : null;
  useEffect(() => {
    if (saved === null) return;
    let live = true;
    fetch("/api/resume")
      .then(async (res) => {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (!live) return;
        if (res.status === 404) return setAbsorb({ kind: "missing" });
        if (!res.ok) return setAbsorb({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        setAbsorb({ kind: "ready", markdown: saved, data: body.data, report: body.report, lossless: body.lossless === true });
      })
      .catch((err: Error) => live && setAbsorb({ kind: "error", message: err.message }));
    return () => {
      live = false;
    };
  }, [saved]);

  const lossless = absorb.kind === "ready" && absorb.lossless;
  const data = absorb.kind === "ready" ? absorb.data : null;
  useEffect(() => {
    if (!lossless || !data) return;
    let live = true;
    fetch("/api/resume/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) })
      .then(async (res) => {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (!live) return;
        if (!res.ok) {
          setHtml(null);
          return setPreviewError(body.error ?? `HTTP ${res.status}`);
        }
        setPreviewError(null);
        setHtml(body.html);
      })
      .catch((err: Error) => live && setPreviewError(err.message));
    return () => {
      live = false;
    };
  }, [lossless, data]);

  const attention = useMemo(
    // The report's line numbers belong to the cv.md that was absorbed, not to a save made since.
    () => (absorb.kind === "ready" ? attentionSummary(absorb.report, absorb.markdown) : { count: 0, sections: [], firstLine: null }),
    [absorb],
  );

  useEffect(() => {
    const el = textarea.current;
    if (!focusLine || tab !== "edit" || !el) return;
    const [start, end] = lineRange(el.value, focusLine.line);
    el.focus();
    el.setSelectionRange(start, end);
    el.scrollTop = (focusLine.line - 3) * (parseFloat(getComputedStyle(el).lineHeight) || 20);
    setFocusLine(null);
  }, [focusLine, tab]);

  const previewBox = useRef<HTMLDivElement>(null);
  const showRendered = lossless && html !== null;
  const exportBlocked =
    absorb.kind === "loading" ? "Reading cv.md…"
    : absorb.kind === "missing" ? "There is no cv.md to export yet."
    : absorb.kind === "error" ? "cv.md could not be read, so there is nothing to export."
    : !absorb.lossless ? "Export is off while cv.md has lines that could not be read. Fix them in the editor."
    : previewError ? "The preview failed to render, so there is nothing to print."
    : html === null ? "The preview is still rendering."
    : null;
  const print = () => previewBox.current?.querySelector("iframe")?.contentWindow?.print();

  return (
    <PageFrame>
      <PageHeader
        title="CV"
        description={<>
          Your master CV. Every tailored CV is built from it.
          {state.phase === "ready" && !state.exists && state.content === "" && (
            <span className="ml-1 text-faint">No cv.md yet. Start typing in Edit to create it.</span>
          )}
        </>}
        actions={<div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={state.phase !== "ready" || importSaving || state.inflight !== null || state.conflict}
            aria-expanded={importing}
            aria-controls="cv-import"
            onClick={() => setImporting(!importing)}
            className={cn(buttonVariants({ variant: "outline" }), "min-h-6")}
          >
            <Upload aria-hidden="true" className="size-4" /> {importing ? "Close upload" : "Upload PDF or TeX"}
          </button>
          <ExportMenu pdfReady={lossless} printReady={showRendered} blocked={exportBlocked} onPrint={print} />
        </div>}
      />

      {state.error && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">
          {state.error}
          {state.conflict && " Reloading drops this text, because the file changed."}
        </p>
      )}

      {importing && state.phase === "ready" && !state.conflict && (
        <section id="cv-import" aria-labelledby="cv-import-heading" className="mb-6">
          <h2 id="cv-import-heading" className="font-display text-lg tracking-tight text-foreground">Upload a CV</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            Upload your CV, review the conversion, then update cv.md.
            {state.content !== state.saved && " Your unsaved edits stay in the editor until you update."}
          </p>
          <CvIngest
            variant="editor"
            onSavingChange={setImportSaving}
            onSaved={(markdown) => {
              if (stateRef.current.conflict) return;
              dispatch({ type: "imported", content: markdown });
              setImporting(false);
              setImportSaving(false);
              setTab("edit");
            }}
          />
        </section>
      )}

      {attention.count > 0 && attention.firstLine !== null && (
        <AttentionBanner
          text={attentionText(attention)}
          onFix={() => {
            setTab("edit");
            setFocusLine({ line: attention.firstLine! });
          }}
        />
      )}

      <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="CV view" />

      {/* Preview stays mounted on Edit so Export can print its frame from either tab. */}
      <div ref={previewBox} hidden={tab !== "preview"} className="mt-4">
        {absorb.kind === "loading" ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : absorb.kind === "missing" ? (
          <p className="text-sm text-muted">No cv.md yet. Write it in Edit, or upload a PDF or TeX file.</p>
        ) : absorb.kind === "error" ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">The preview could not be built: {absorb.message}</p>
        ) : showRendered ? (
          <CvPreview html={html} caption={(pages) => [`Page 1 of ${pages}`, format, "rendered from cv.md"].filter(Boolean).join(" · ")} />
        ) : (
          <>
            {previewError && (
              <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-300">
                Preview failed: {previewError}
              </p>
            )}
            {lossless && !previewError ? (
              <p className="text-sm text-muted">Rendering…</p>
            ) : (
              <article aria-label="Markdown preview" className="report-prose rounded-2xl border border-border bg-surface/30 p-5 [&_p]:whitespace-pre-line">
                <CvMarkdown content={saved ?? ""} />
              </article>
            )}
          </>
        )}
      </div>

      <div hidden={tab !== "edit"} className="mt-4">
        <CvMarkdownEditor editor={editor} textareaRef={textarea} />
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={structured}
            aria-controls="cv-structured"
            onClick={() => setStructured(!structured)}
            className="inline-flex min-h-6 items-center text-sm font-medium text-brand-text underline-offset-2 hover:underline max-sm:min-h-[44px]"
          >
            {structured ? "Close structured editor" : "Structured editor"}
          </button>
        </div>
        {structured && (
          <section id="cv-structured" aria-labelledby="cv-structured-heading" className="mt-4">
            <h2 id="cv-structured-heading" className="font-display text-lg tracking-tight text-foreground">Structured editor</h2>
            <ResumeEditor templates={templates} templatesError={templatesError} />
          </section>
        )}
        {/* Below the editor: the gaps are context for what to write next, and they belong after the document. */}
        <SkillGaps />
      </div>
    </PageFrame>
  );
}

function AttentionBanner({ text, onFix }: { text: { title: string; detail: string }; onFix: () => void }) {
  return (
    <button
      type="button"
      onClick={onFix}
      className="mb-4 flex w-full flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm transition-colors hover:border-amber-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-amber-800 dark:text-amber-400" />
      <span className="min-w-0 flex-1 basis-64">
        <span className="font-medium text-foreground">{text.title}</span> <span className="text-muted">{text.detail}</span>
      </span>
      <span className="font-medium text-brand-text">Fix in editor →</span>
    </button>
  );
}

function ExportMenu({ pdfReady, printReady, blocked, onPrint }: { pdfReady: boolean; printReady: boolean; blocked: string | null; onPrint: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const hintId = useId();
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(at + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      list[e.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const item = "flex min-h-6 w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none max-sm:min-h-[44px]";
  const off = "cursor-not-allowed text-faint hover:bg-transparent";

  return (
    <div ref={root} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(buttonVariants({ variant: "primary" }), "min-h-6")}
      >
        Export <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Export" className="absolute right-0 z-20 mt-1 flex w-64 flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
          {pdfReady ? (
            <a role="menuitem" tabIndex={-1} href="/api/cv/pdf" download onClick={() => close(true)} className={item}>
              Download PDF
            </a>
          ) : (
            <button type="button" role="menuitem" tabIndex={-1} aria-disabled="true" aria-describedby={hintId} className={cn(item, off)}>
              Download PDF
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={printReady ? undefined : "true"}
            aria-describedby={printReady ? undefined : hintId}
            onClick={() => {
              if (!printReady) return;
              close(true);
              onPrint();
            }}
            className={cn(item, !printReady && off)}
          >
            Print
          </button>
          {blocked && (
            <p id={hintId} className="px-3 pb-2 pt-1 text-xs text-muted">
              {blocked}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
