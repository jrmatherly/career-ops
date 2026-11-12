"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  cvSaveUsesKeepalive,
  draftChange,
  draftFromStore,
  editorReducer,
  editorStatus,
  initialEditor,
  followUpJob,
  saveFollowUp,
  shouldSave,
} from "@/lib/cv-editor-state.mjs";

const DRAFT_KEY = "career-ops.cv-draft";
const AUTOSAVE_MS = 600;

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return draftFromStore(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function useCvEditor() {
  const [state, dispatch] = useReducer(editorReducer, initialEditor());
  const [importing, setImporting] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const stateRef = useRef(state);
  const snapshotPriorRef = useRef(true);
  const runningRef = useRef(false);
  const pendingRef = useRef<{ text: string; keepalive: boolean } | null>(null);
  useLayoutEffect(() => {
    stateRef.current = state;
    if (state.snapshotPrior) snapshotPriorRef.current = true;
  }, [state]);

  const pump = useCallback((confirmed?: { content: string; exists: boolean }) => {
    if (runningRef.current) return;
    const job = pendingRef.current;
    const current = stateRef.current;
    const base = confirmed ?? { content: current.saved, exists: current.exists };
    if (!job || current.phase !== "ready" || job.text !== current.content || job.text === base.content) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = null;
    runningRef.current = true;
    const snapshot = job.text;
    const backup = snapshotPriorRef.current;
    const expected = { content: base.content, exists: base.exists };
    dispatch({ type: "save-start", content: snapshot });
    const payload = { content: snapshot, backup, expected };
    fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: cvSaveUsesKeepalive(job.keepalive, payload),
    })
      .then(async (res) => {
        runningRef.current = false;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          dispatch({
            type: "save-failed",
            content: snapshot,
            error: body.error || "Could not save. Your text is still in this tab.",
            conflict: res.status === 409,
          });
          return;
        }
        if (backup) snapshotPriorRef.current = false;
        dispatch({ type: "save-ok", content: snapshot });
        window.dispatchEvent(new CustomEvent("co-cv-saved"));
        const follow = saveFollowUp(stateRef.current, snapshot);
        if (follow) {
          pendingRef.current = followUpJob(job, pendingRef.current, follow.text);
          pump(follow.expected);
        }
      })
      .catch(() => {
        runningRef.current = false;
        dispatch({
          type: "save-failed",
          content: snapshot,
          error: "Could not save. Your text is still in this tab.",
        });
      });
  }, []);

  const startSave = useCallback((keepalive = false) => {
    const current = stateRef.current;
    if (current.phase !== "ready" || current.content === current.saved) return;
    pendingRef.current = { text: current.content, keepalive };
    pump();
  }, [pump]);

  useEffect(() => {
    let live = true;
    fetch("/api/cv")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json() as Promise<{ content?: unknown; exists?: unknown }>;
      })
      .then((data) => {
        if (!live) return;
        dispatch({
          type: "loaded",
          content: typeof data.content === "string" ? data.content : "",
          exists: data.exists === true,
          draft: readDraft(),
        });
      })
      .catch(() => {
        if (!live) return;
        dispatch({
          type: "load-failed",
          error: "The CV could not be loaded. Reload the page before editing, so an empty page cannot replace it.",
        });
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const draft = draftChange(state);
    if (draft === undefined) return;
    try {
      if (!draft) sessionStorage.removeItem(DRAFT_KEY);
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
  }, [state]);

  useEffect(() => {
    const flush = () => startSave(true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [startSave]);

  useEffect(() => {
    if (importing || !shouldSave(state)) return;
    const timer = setTimeout(() => startSave(false), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [state, startSave, importing]);

  return { state, dispatch, status: editorStatus(state), startSave, stateRef, importing, setImporting, importSaving, setImportSaving };
}

export type CvEditorModel = ReturnType<typeof useCvEditor>;

// cv.md opens with `# Name`; under the page's h1 every markdown heading moves down one level.
const shiftedHeadings: Components = {
  h1: ({ node: _node, ...props }) => <h2 {...props} />,
  h2: ({ node: _node, ...props }) => <h3 {...props} />,
  h3: ({ node: _node, ...props }) => <h4 {...props} />,
  h4: ({ node: _node, ...props }) => <h5 {...props} />,
  h5: ({ node: _node, ...props }) => <h6 {...props} />,
};

/** cv.md rendered as markdown, one heading level below the page title. */
export function CvMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={shiftedHeadings}>{content}</ReactMarkdown>;
}

/** The Edit tab: the save bar, then the markdown editor beside its live preview. */
export function CvMarkdownEditor({ editor, textareaRef }: { editor: CvEditorModel; textareaRef: React.Ref<HTMLTextAreaElement> }) {
  const { state, dispatch, status, startSave, importing } = editor;
  if (state.phase === "loading") return <div className="text-sm text-muted">Loading…</div>;
  if (state.phase === "load-error") return null;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-faint">Editing cv.md. The preview on the right updates as you type.</p>
        <div className="flex items-center gap-3">
          <p role="status" className="text-sm text-muted">
            {status.label}
          </p>
          <button
            type="button"
            onClick={() => startSave(false)}
            disabled={!status.canSave || importing}
            className={cn(
              "inline-flex min-h-6 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors max-sm:min-h-[44px]",
              status.canSave && !importing
                ? "bg-brand text-brand-foreground hover:bg-brand-200"
                : "border border-border bg-surface text-muted",
            )}
          >
            {status.label === "Saving" ? <Loader2 className="size-4 animate-spin" /> : status.label === "Saved" ? <Check className="size-4" /> : null}
            Save
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          ref={textareaRef}
          aria-label="CV Markdown"
          disabled={importing}
          value={state.content}
          onChange={(e) => dispatch({ type: "edit", content: e.target.value })}
          spellCheck={false}
          placeholder="# Your Name&#10;&#10;## Summary&#10;..."
          className="h-[calc(100vh-16rem)] w-full resize-none overflow-auto rounded-2xl border border-border bg-surface/50 p-4 font-mono text-sm leading-relaxed outline-none transition-colors placeholder:text-faint focus:border-brand/40"
        />
        <article aria-label="Markdown preview" className="report-prose h-[calc(100vh-16rem)] overflow-auto rounded-2xl border border-border bg-surface/30 p-5 [&_p]:whitespace-pre-line">
          {state.content.trim() ? <CvMarkdown content={state.content} /> : <p className="text-muted">Preview appears here.</p>}
        </article>
      </div>
    </>
  );
}
