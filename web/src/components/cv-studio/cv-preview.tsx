"use client";

import { useEffect, useRef, useState } from "react";
import { contentHeightPx, frameHeightAfterProbe, frameHeightPx, PREVIEW_PAGE_PX, previewPageCount } from "@/lib/cv-studio/page-estimate.mjs";
import { previewHtml } from "@/lib/cv-studio/preview-html.mjs";
import { markerTargets } from "@/lib/resume-markers.mjs";

const PAGE_WIDTH = 816;

export type MarkerSeverity = "error" | "warning" | "info";
export type PreviewMarker = { path: string; severity: MarkerSeverity };

const RANK: Record<MarkerSeverity, number> = { error: 3, warning: 2, info: 1 };

const MARKER_CSS = `
[data-resume-marker] { outline-offset: 2px; }
[data-resume-marker="error"] { outline: 2px solid rgba(220, 38, 38, 0.85); }
[data-resume-marker="warning"] { outline: 2px dashed rgba(217, 119, 6, 0.85); }
[data-resume-marker="info"] { outline: 1px dotted rgba(2, 132, 199, 0.85); }
[data-resume-pinned] { outline-width: 3px; outline-style: solid; background-color: rgba(37, 99, 235, 0.08); }
`;

export function CvPreview({ html, markers, pinned, caption }: { html: string; markers?: PreviewMarker[]; pinned?: { path: string; seq: number } | null; caption?: (pages: number) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.7);
  const [contentPx, setContentPx] = useState(0);
  const [framePx, setFramePx] = useState(0);
  const scrolledSeq = useRef<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / PAGE_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measure = () => {
    const frameEl = frame.current;
    const doc = frameEl?.contentDocument;
    if (!frameEl || !doc) return;
    // A .page rule of min-height: 100vh follows this iframe. Measuring at the
    // previous content height makes the next load taller. One page is stable.
    frameEl.style.height = `${PREVIEW_PAGE_PX}px`;
    const content = contentHeightPx(doc);
    const nextFrame = frameHeightPx(doc);
    // Set the measured height on the iframe itself. If the numbers did not
    // change, React skips the state update and would leave the probe height.
    frameEl.style.height = `${frameHeightAfterProbe(nextFrame, frameHeight)}px`;
    if (content > 0) setContentPx(content);
    if (nextFrame > 0) setFramePx(nextFrame);
  };

  const mark = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    for (const el of doc.querySelectorAll("[data-resume-marker], [data-resume-pinned]")) {
      el.removeAttribute("data-resume-marker");
      el.removeAttribute("data-resume-pinned");
    }
    let style = doc.querySelector("style[data-resume-markers]");
    if (!markers?.length) return style?.remove();
    if (!style) {
      style = doc.createElement("style");
      style.setAttribute("data-resume-markers", "");
      style.textContent = MARKER_CSS;
      doc.head.append(style);
    }
    const byPath = new Map<string, Element[]>();
    for (const el of doc.querySelectorAll("[data-resume-path]")) {
      const p = el.getAttribute("data-resume-path")!;
      const list = byPath.get(p);
      if (list) list.push(el);
      else byPath.set(p, [el]);
    }
    const paths = [...byPath.keys()];
    const targets = (marker: string) => markerTargets(paths, marker).flatMap((p) => byPath.get(p)!);
    // Least severe first, so the most severe marker on an element is written last.
    const ranked = [...markers].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
    for (const m of ranked) for (const el of targets(m.path)) el.setAttribute("data-resume-marker", m.severity);
    if (!pinned || !markers.some((m) => m.path === pinned.path)) return;
    const hits = targets(pinned.path);
    for (const el of hits) el.setAttribute("data-resume-pinned", "");
    const outer = box.current;
    if (!outer || !hits.length || scrolledSeq.current === pinned.seq) return;
    scrolledSeq.current = pinned.seq;
    // The iframe is as tall as its document, so a rect inside it is a document offset; the box sees it scaled.
    outer.scrollTo({ top: hits[0].getBoundingClientRect().top * scale - 16, behavior: "smooth" });
    outer.scrollIntoView({ block: "nearest" });
  };

  useEffect(mark, [markers, pinned]);

  const frameHeight = framePx > 0 ? framePx : PREVIEW_PAGE_PX;
  const pages = previewPageCount(contentPx);

  return (
    <section aria-label="Live preview" className="rounded-2xl border border-border bg-surface/40 p-3">
      {caption ? (
        <p className="mb-2 px-1 text-center text-xs text-faint">{caption(pages)}</p>
      ) : (
        <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted">
          <span>Live preview</span>
          <span>{pages} page{pages === 1 ? "" : "s"} (estimate)</span>
        </div>
      )}
      <div ref={box} className="max-h-[80vh] overflow-auto rounded-lg bg-white shadow-sm">
        <div style={{ height: frameHeight * scale }}>
          <iframe
            ref={frame}
            title="Tailored CV preview"
            srcDoc={previewHtml(html)}
            onLoad={() => {
              measure();
              mark();
            }}
            // allow-modals lets the parent call print() on this frame; with no allow-scripts the CV itself still runs nothing.
            sandbox="allow-same-origin allow-modals"
            style={{ width: PAGE_WIDTH, height: frameHeight, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
          />
        </div>
      </div>
    </section>
  );
}
