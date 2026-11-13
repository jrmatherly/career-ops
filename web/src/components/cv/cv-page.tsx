"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, TriangleAlert, Upload } from "lucide-react";
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
import { SECTION_TYPES } from "@/lib/resume-form.mjs";
import { attentionSummary, attentionText, lineRange, lossyNotice } from "@/lib/cv-attention.mjs";
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
  | { kind: "ready"; markdown: string; writes: number; data: unknown; report: Report; lossless: boolean };
type Report = { unparsed?: { line: number; text: string }[]; orphans?: { company?: string; position?: string; name?: string; section?: string }[] };

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

  const [absorbed, setAbsorb] = useState<Absorb>({ kind: "loading" });
  // A cv.md the editor could not load is never absorbed, so the preview would wait on it forever.
  const absorb: Absorb = state.phase === "load-error" ? { kind: "error", message: state.error ?? "cv.md could not be loaded" } : absorbed;
  const [html, setHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // What the render leaves out: sections with no template slot, and build-cv-html warnings.
  const [omitted, setOmitted] = useState<{ unmapped: string[]; warnings: string[] }>({ unmapped: [], warnings: [] });
  const [structured, setStructured] = useState(false);
  // Mounted from its first opening on, so closing it hides unsaved edits instead of dropping them.
  const [structuredMounted, setStructuredMounted] = useState(false);
  const [structuredDirty, setStructuredDirty] = useState(false);
  const structuredHeading = useRef<HTMLHeadingElement>(null);
  const [revealStructured, setRevealStructured] = useState(false);
  const openStructured = (open: boolean) => {
    setStructured(open);
    if (open) setStructuredMounted(true);
  };
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [focusLine, setFocusLine] = useState<{ line: number } | null>(null);

  // Re-read cv.md through the absorb after every confirmed save, so the preview and banner follow the file on disk.
  const saved = state.phase === "ready" ? state.saved : null;
  // A pairing in the structured editor changes the report and leaves cv.md's text as it was.
  const [structuredWrites, setStructuredWrites] = useState(0);
  useEffect(() => {
    const onSaved = (e: Event) => (e as CustomEvent<{ source?: string }>).detail?.source === "structured" && setStructuredWrites((n) => n + 1);
    window.addEventListener("co-cv-saved", onSaved);
    return () => window.removeEventListener("co-cv-saved", onSaved);
  }, []);
  useEffect(() => {
    if (saved === null) return;
    let live = true;
    fetch("/api/resume")
      .then(async (res) => {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (!live) return;
        if (res.status === 404) return setAbsorb({ kind: "missing" });
        if (!res.ok) return setAbsorb({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        if (!body || typeof body !== "object" || !body.report || typeof body.report !== "object") {
          return setAbsorb({ kind: "error", message: body?.error ?? "The CV reader answered without a report." });
        }
        setAbsorb({ kind: "ready", markdown: saved, writes: structuredWrites, data: body.data, report: body.report, lossless: body.lossless === true });
      })
      .catch((err: Error) => live && setAbsorb({ kind: "error", message: err.message }));
    return () => {
      live = false;
    };
  }, [saved, structuredWrites]);

  const lossless = absorb.kind === "ready" && absorb.lossless;
  const data = absorb.kind === "ready" ? absorb.data : null;
  useEffect(() => {
    // A render or an error belongs to the absorbed data it came from.
    setHtml(null);
    setPreviewError(null);
    setOmitted({ unmapped: [], warnings: [] });
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
        setOmitted({ unmapped: body.unmapped ?? [], warnings: body.warnings ?? [] });
        setHtml(body.html);
      })
      .catch((err: Error) => {
        if (!live) return;
        setHtml(null);
        setPreviewError(err.message);
      });
    return () => {
      live = false;
    };
  }, [lossless, data]);

  const attention = useMemo(
    // The report's line numbers belong to the cv.md that was absorbed, not to a save made since.
    () => (absorb.kind === "ready" ? attentionSummary(absorb.report, absorb.markdown) : { count: 0, sections: [], firstLine: null }),
    [absorb],
  );
  const lossy = absorb.kind === "ready" && !absorb.lossless ? lossyNotice(absorb.report) : null;

  useEffect(() => {
    const el = textarea.current;
    if (!focusLine || tab !== "edit" || !el) return;
    const [start, end] = lineRange(el.value, focusLine.line);
    el.focus();
    el.setSelectionRange(start, end);
    el.scrollTop = (focusLine.line - 3) * (parseFloat(getComputedStyle(el).lineHeight) || 20);
    setFocusLine(null);
  }, [focusLine, tab]);

  useEffect(() => {
    if (!revealStructured || tab !== "edit" || !structured) return;
    structuredHeading.current?.scrollIntoView({ block: "start" });
    structuredHeading.current?.focus();
    setRevealStructured(false);
  }, [revealStructured, tab, structured]);

  const previewBox = useRef<HTMLDivElement>(null);
  const showRendered = lossless && html !== null;
  const exportBlocked =
    absorb.kind === "loading" ? "Reading cv.md…"
    : absorb.kind === "missing" ? "There is no cv.md to export yet."
    : absorb.kind === "error" ? "cv.md could not be read, so there is nothing to export."
    : !absorb.lossless ? (lossy?.blocked ?? "Export is off while cv.md has lines that could not be read back cleanly. Fix them in the editor.")
    : previewError ? "The preview failed to render, so there is nothing to print."
    : html === null ? "The preview is still rendering."
    : null;
  const conflictBlocked = state.conflict ? "Download and Print are off while this tab's text conflicts with cv.md on disk." : null;
  const pdfBlocked = exportBlocked ?? conflictBlocked;
  // The frame holds the previous cv.md until the save just made, in either editor, is read back; Download reads the file itself.
  const staleRender = absorb.kind === "ready" && (absorb.markdown !== saved || absorb.writes !== structuredWrites) ? "Print is off until the saved cv.md is read back." : null;
  const printBlocked = exportBlocked ?? conflictBlocked ?? staleRender;
  const unsaved = state.phase === "ready" && (state.content !== state.saved || state.conflict);
  const omittedNames = omitted.unmapped.map((s) => (SECTION_TYPES as Record<string, { label?: string }>)[s]?.label ?? s);
  const exportNote = exportBlocked ? null : [
    unsaved || structuredDirty ? "Download and Print use the saved cv.md, not the unsaved text in the editor." : null,
    omittedNames.length ? `The PDF and the print leave out ${new Intl.ListFormat("en", { type: "conjunction" }).format(omittedNames)}: this template has no place for ${omittedNames.length === 1 ? "it" : "them"}.` : null,
  ].filter(Boolean).join(" ") || null;

  // A hidden frame has no layout to print, so Print from Edit shows the preview first.
  const [printPending, setPrintPending] = useState(false);
  useEffect(() => {
    if (!printPending || tab !== "preview") return;
    setPrintPending(false);
    requestAnimationFrame(() => previewBox.current?.querySelector("iframe")?.contentWindow?.print());
  }, [printPending, tab]);
  const print = () => {
    if (tab !== "preview") setTab("preview");
    setPrintPending(true);
  };

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/cv/pdf");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "cv.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

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
          <ExportMenu pdfBlocked={pdfBlocked} printBlocked={printBlocked} note={exportNote} downloading={downloading} onDownload={download} onPrint={print} />
        </div>}
      />

      {state.error && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">
          {state.error}
          {state.conflict && " Reloading drops this text, because the file changed."}
        </p>
      )}

      {downloadError && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">
          The PDF could not be downloaded: {downloadError}
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
          action="Fix in editor →"
          onFix={() => {
            setTab("edit");
            // The line number belongs to the saved cv.md, not to text edited since.
            if (!unsaved) setFocusLine({ line: attention.firstLine! });
          }}
        />
      )}

      {lossy && (
        <AttentionBanner
          text={lossy}
          action="Open structured editor →"
          onFix={() => {
            setTab("edit");
            openStructured(true);
            setRevealStructured(true);
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
          <>
            {omitted.unmapped.length > 0 && (
              <p className="mb-2 text-sm text-muted">
                Not shown in the preview, the print or the PDF (still saved in cv.md): {omittedNames.join(", ")}
              </p>
            )}
            {omitted.warnings.map((w, i) => (
              <p key={i} className="mb-2 text-sm text-muted">
                {w}
              </p>
            ))}
          <CvPreview html={html} caption={(pages) => [`Page 1 of ${pages}`, format, "rendered from cv.md"].filter(Boolean).join(" · ")} />
          </>
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
            // A structured save during the first read of cv.md would be overwritten in this tab by that older read.
            disabled={state.phase === "loading"}
            onClick={() => openStructured(!structured)}
            className="inline-flex min-h-6 items-center text-sm font-medium text-brand-text underline-offset-2 hover:underline max-sm:min-h-[44px]"
          >
            {structured ? "Close structured editor" : "Structured editor"}
          </button>
        </div>
        {structuredMounted && (
          <section id="cv-structured" hidden={!structured} aria-labelledby="cv-structured-heading" className="mt-4">
            <h2 id="cv-structured-heading" ref={structuredHeading} tabIndex={-1} className="font-display text-lg tracking-tight text-foreground focus-visible:outline-none">Structured editor</h2>
            <ResumeEditor templates={templates} templatesError={templatesError} onDirtyChange={setStructuredDirty} />
          </section>
        )}
        {/* Below the editor: the gaps are context for what to write next, and they belong after the document. */}
        <SkillGaps />
      </div>
    </PageFrame>
  );
}

function AttentionBanner({ text, action, onFix }: { text: { title: string; detail: string }; action: string; onFix: () => void }) {
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
      <span className="font-medium text-brand-text">{action}</span>
    </button>
  );
}

type ExportProps = { pdfBlocked: string | null; printBlocked: string | null; note: string | null; downloading: boolean; onDownload: () => void; onPrint: () => void };

function ExportMenu({ pdfBlocked, printBlocked, note, downloading, onDownload, onPrint }: ExportProps) {
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
  const hints = [...new Set([downloading ? "The PDF is being prepared." : pdfBlocked, printBlocked, note].filter((h): h is string => h !== null))];

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
        {downloading ? <><Loader2 aria-hidden="true" className="size-4 animate-spin" /> Preparing PDF…</> : <>Export <ChevronDown aria-hidden="true" className="size-4" /></>}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Export" className="absolute right-0 z-20 mt-1 flex w-64 flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
          <MenuItem label="Download PDF" blocked={downloading ? "The PDF is being prepared." : pdfBlocked} hintId={hintId} className={item} off={off} onSelect={() => { close(true); onDownload(); }} />
          <MenuItem label="Print" blocked={printBlocked} hintId={hintId} className={item} off={off} onSelect={() => { close(true); onPrint(); }} />
          {hints.length > 0 && (
            <p id={hintId} className="px-3 pb-2 pt-1 text-xs text-muted">
              {hints.join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, blocked, hintId, className, off, onSelect }: { label: string; blocked: string | null; hintId: string; className: string; off: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={blocked ? "true" : undefined}
      aria-describedby={blocked ? hintId : undefined}
      onClick={() => !blocked && onSelect()}
      className={cn(className, blocked && off)}
    >
      {label}
    </button>
  );
}
