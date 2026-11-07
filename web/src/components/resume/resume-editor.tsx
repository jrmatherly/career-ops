"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { CvPreview } from "@/components/cv-studio/cv-preview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DesignPanel } from "@/components/resume/design-panel";
import { GatePanel, type Report } from "@/components/resume/gate-panel";
import { Field, SectionForm, type FieldKind, type ResumeDraft } from "@/components/resume/section-form";
import { SELECT, TemplatePicker, type TemplateOption } from "@/components/resume/template-picker";
import { BUILT_IN_SECTIONS, SECTION_TYPES, addCustomSection, editorReducer, firstTitleProblem, setField } from "@/lib/resume-form.mjs";

// The reducer is plain JS in resume-form.mjs so its save-state rules have unit tests; these types describe it.
const reducer = editorReducer as (state: State, action: Action) => State;

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "readonly" }
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict"; message: string }
  | { kind: "invalid"; message: string };

// `saved` is the draft as last loaded or written; `data !== saved` means unsaved edits.
type State = { status: Status; data: ResumeDraft | null; saved: ResumeDraft | null; cvMdSha: string | null; report: Report | null };

type Action =
  | { type: "loaded"; data: ResumeDraft | null; cvMdSha: string | null; report: Report; lossless: boolean }
  | { type: "failed"; message: string }
  | { type: "edit"; data: ResumeDraft }
  | { type: "saving" }
  | { type: "saved"; data: ResumeDraft; cvMdSha: string }
  | { type: "conflict"; message: string }
  | { type: "invalid"; message: string };

const BASICS: { key: string; label: string; kind: FieldKind }[] = [
  { key: "name", label: "Name", kind: "text" },
  { key: "headline", label: "Headline", kind: "text" },
  { key: "email", label: "Email", kind: "text" },
  { key: "phone", label: "Phone", kind: "text" },
  { key: "location", label: "Location", kind: "text" },
  { key: "website", label: "Website", kind: "website" },
];

// A route that throws answers with an HTML error page, not JSON.
const readBody = (res: Response): Promise<{ error?: string; [key: string]: any }> => res.json().catch(() => ({ error: `HTTP ${res.status}` }));

export function ResumeEditor({ templates, templatesError }: { templates: TemplateOption[]; templatesError?: string }) {
  const [state, dispatch] = useReducer(reducer, { status: { kind: "loading" }, data: null, saved: null, cvMdSha: null, report: null });
  const [html, setHtml] = useState("");
  // What the rendered preview leaves out: sections with no template slot, and build-cv-html warnings.
  const [omitted, setOmitted] = useState<{ unmapped: string[]; warnings: string[] }>({ unmapped: [], warnings: [] });
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [customType, setCustomType] = useState("projects");
  const edited = useRef(false);
  const editDelay = useRef(300);
  // Bumped after a pairing or an adoption so the editor reloads cv.md.
  const [generation, setGeneration] = useState(0);
  // What the last pairing or adoption reported, such as where the cv.md backup went.
  const [notice, setNotice] = useState<string | null>(null);
  const requestNo = useRef(0);

  useEffect(() => {
    let live = true;
    fetch("/api/resume")
      .then(async (res) => {
        const body = await readBody(res);
        if (!live) return;
        if (!res.ok) return dispatch({ type: "failed", message: body.error ?? `HTTP ${res.status}` });
        dispatch({ type: "loaded", data: body.data, cvMdSha: body.cvMdSha, report: body.report, lossless: body.lossless });
      })
      .catch((err: Error) => live && dispatch({ type: "failed", message: err.message }));
    return () => {
      live = false;
    };
  }, [generation]);

  const { data, status } = state;
  const editable = data && status.kind !== "loading" && status.kind !== "readonly" && status.kind !== "error";

  useEffect(() => {
    if (!editable) return;
    const timer = setTimeout(async () => {
      const n = ++requestNo.current;
      try {
        const res = await fetch("/api/resume/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
        const body = await readBody(res);
        if (n !== requestNo.current) return;
        if (!res.ok) return setPreviewError(body.error ?? `HTTP ${res.status}`);
        setPreviewError(null);
        setHtml(body.html);
        setOmitted({ unmapped: body.unmapped ?? [], warnings: body.warnings ?? [] });
        if (edited.current) {
          edited.current = false;
          performance.mark("resume-preview");
          performance.measure("resume-edit-to-preview", "resume-edit", "resume-preview");
          performance.clearMarks("resume-edit");
          performance.clearMarks("resume-preview");
        }
      } catch (err) {
        if (n === requestNo.current) setPreviewError((err as Error).message);
      }
    }, edited.current ? editDelay.current : 0);
    return () => clearTimeout(timer);
  }, [data, editable]);

  const dirty = state.data !== state.saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const resolved = (message?: string) => {
    setNotice(message ?? null);
    setGeneration((g) => g + 1);
  };

  const edit = (next: ResumeDraft, delay = 300) => {
    setNotice(null);
    performance.mark("resume-edit");
    edited.current = true;
    editDelay.current = delay;
    dispatch({ type: "edit", data: next });
  };

  const save = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!data || !state.cvMdSha || status.kind === "saving" || status.kind === "conflict") return;
    const titleProblem = firstTitleProblem(data);
    if (titleProblem) return dispatch({ type: "invalid", message: `Not saved. ${titleProblem}` });
    dispatch({ type: "saving" });
    try {
      const res = await fetch("/api/resume", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data, expectedCvSha: state.cvMdSha }) });
      const body = await readBody(res);
      if (res.ok) dispatch({ type: "saved", data, cvMdSha: body.cvMdSha });
      // A 5xx from save (500, or 503 on timeout) may come after cv.md was written, so it locks like a conflict until reload.
      else if (res.status === 409 || res.status >= 500) dispatch({ type: "conflict", message: body.error ?? `HTTP ${res.status}` });
      else dispatch({ type: "invalid", message: body.error ?? `HTTP ${res.status}` });
    } catch (err) {
      dispatch({ type: "invalid", message: (err as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight text-landing">Resume editor</h1>
      <p className="mt-1 text-sm text-muted">
        Edit your CV as structured sections. Save writes <code className="text-foreground">cv.md</code>.
      </p>

      {notice && (
        <p role="status" className="mt-4 text-sm text-foreground">
          {notice}
        </p>
      )}
      {status.kind === "loading" && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {status.kind === "error" && (
        <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-300">
          {status.message}
        </p>
      )}
      {status.kind === "readonly" && <GatePanel key={generation} report={state.report} absorbed={state.data !== null} onResolved={resolved} />}

      {editable && data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* The app's <main> sets overflow-x-hidden, which defeats position: sticky against the window, so on lg the form scrolls itself and the preview stays in view. */}
          <form onSubmit={save} className="min-w-0 space-y-8 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-2" aria-label="Resume">
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background/90 py-3 backdrop-blur">
              <Button type="submit" disabled={status.kind === "saving" || status.kind === "conflict"}>
                {status.kind === "saving" ? "Saving…" : "Save"}
              </Button>
              <p role="status" className="text-sm text-muted">
                {status.kind === "saved" ? "cv.md updated" : ""}
              </p>
              {(status.kind === "conflict" || status.kind === "invalid") && (
                <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
                  {status.message}
                </p>
              )}
            </div>

            <section aria-labelledby="design-heading" className="space-y-3">
              <h2 id="design-heading" className="font-display text-lg tracking-tight text-foreground">
                Design
              </h2>
              <TemplatePicker templates={templates} value={data.careerOps?.template ?? "default"} onChange={(v) => edit(setField(data, ["careerOps", "template"], v), 0)} />
              {templatesError && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                  Templates could not be listed: {templatesError}
                </p>
              )}
              <DesignPanel style={data.careerOps?.style ?? {}} onChange={(v) => edit(setField(data, ["careerOps", "style"], v))} />
            </section>

            <section aria-labelledby="basics-heading" className="space-y-3">
              <h2 id="basics-heading" className="font-display text-lg tracking-tight text-foreground">
                Basics
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {BASICS.map((f) => (
                  <Field key={f.key} id={`basics-${f.key}`} label={f.label} kind={f.kind} value={data.basics?.[f.key]} onChange={(v) => edit(setField(data, ["basics", f.key], v))} />
                ))}
              </div>
            </section>

            <section aria-labelledby="summary-heading" className="space-y-3">
              <h2 id="summary-heading" className="font-display text-lg tracking-tight text-foreground">
                Summary
              </h2>
              <Field id="summary-content" label="Summary text" kind="description" value={data.summary?.content} onChange={(v) => edit(setField(data, ["summary", "content"], v))} />
            </section>

            {BUILT_IN_SECTIONS.map((key) => (
              <SectionForm key={key} data={data} sectionRef={key} onChange={edit} />
            ))}
            {(data.customSections ?? []).map((s: { id: string }) => (
              <SectionForm key={s.id} data={data} sectionRef={s.id} onChange={edit} />
            ))}

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="custom-type" className="mb-1 block text-xs font-medium text-muted">
                  Custom section type
                </label>
                <select id="custom-type" value={customType} onChange={(e) => setCustomType(e.target.value)} className={SELECT}>
                  {Object.entries(SECTION_TYPES).map(([type, t]) => (
                    <option key={type} value={type}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="outline" onClick={() => edit(addCustomSection(data, customType, crypto.randomUUID(), `Additional ${SECTION_TYPES[customType].label.toLowerCase()}`))}>
                Add custom section
              </Button>
            </div>
          </form>

          <div className="min-w-0 lg:self-start">
            {previewError && (
              <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-300">
                Preview failed: {previewError}
              </p>
            )}
            {omitted.unmapped.length > 0 && (
              <p className="mb-2 text-xs text-muted">
                Not shown in this template&apos;s preview or PDF (still saved to cv.md): {omitted.unmapped.map((s) => SECTION_TYPES[s]?.label ?? s).join(", ")}
              </p>
            )}
            {omitted.warnings.map((w, i) => (
              <p key={i} className="mb-2 text-xs text-muted">
                {w}
              </p>
            ))}
            {html ? <CvPreview html={html} /> : <Card className="text-sm text-muted">Preview appears here.</Card>}
          </div>
        </div>
      )}
    </div>
  );
}
