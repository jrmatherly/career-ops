"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SECTION_TYPES,
  addItem,
  descriptionToText,
  getIn,
  moveItem,
  removeItem,
  sectionPath,
  sectionType,
  setField,
  textToDescription,
  toWebsite,
  toggleHidden,
  websiteText,
} from "@/lib/resume-form.mjs";

// The draft is whatever resume.mjs absorb wrote; the CLI validates it on save and preview.
export type ResumeDraft = Record<string, any>;
export type FieldKind = "text" | "description" | "keywords" | "website";
type Item = { id: string; hidden: boolean; [key: string]: unknown };

const INPUT = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/50";

const FORMATS: Record<Exclude<FieldKind, "text">, { format: (v: unknown) => string; parse: (s: string, prior: unknown) => unknown }> = {
  description: { format: (v) => descriptionToText(String(v ?? "")), parse: (s) => textToDescription(s) },
  keywords: { format: (v) => (Array.isArray(v) ? v.join(", ") : ""), parse: (s) => s.split(",").map((k) => k.trim()).filter(Boolean) },
  website: { format: (v) => websiteText(v as { url?: string; label?: string }), parse: (s, prior) => toWebsite(s, (prior ?? {}) as object) },
};

/** One labelled input. Non-text kinds keep their own text so a parse round trip never rewrites what is being typed. */
export function Field({ id, label, kind, value, onChange }: { id: string; label: string; kind: FieldKind; value: unknown; onChange: (v: unknown) => void }) {
  const fmt = kind === "text" ? null : FORMATS[kind];
  const [local, setLocal] = useState(() => (fmt ? fmt.format(value) : ""));
  const shown = fmt ? local : String(value ?? "");
  const change = (s: string) => {
    if (!fmt) return onChange(s);
    setLocal(s);
    onChange(fmt.parse(s, value));
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      {kind === "description" ? (
        <textarea id={id} rows={Math.max(3, shown.split("\n").length + 1)} value={shown} onChange={(e) => change(e.target.value)} className={`${INPUT} font-mono leading-relaxed`} />
      ) : (
        <input id={id} type="text" value={shown} onChange={(e) => change(e.target.value)} className={INPUT} />
      )}
    </div>
  );
}

export function SectionForm({ data, sectionRef, onChange }: { data: ResumeDraft; sectionRef: string; onChange: (next: ResumeDraft) => void }) {
  const path = sectionPath(data, sectionRef);
  const section = getIn(data, path) as { title: string; hidden: boolean; items: Item[] };
  const type = SECTION_TYPES[sectionType(data, sectionRef)];
  const custom = path[0] === "customSections";
  const headingId = `section-${sectionRef}`;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {custom ? (
          <div className="min-w-0 flex-1">
            <label id={headingId} htmlFor={`${headingId}-title`} className="mb-1 block text-xs font-medium text-muted">
              {type?.label ?? "Custom"} section title
            </label>
            <input id={`${headingId}-title`} type="text" value={section.title} onChange={(e) => onChange(setField(data, [...path, "title"], e.target.value))} className={INPUT} />
          </div>
        ) : (
          <h2 id={headingId} className="font-display text-lg tracking-tight text-foreground">
            {type?.label ?? sectionRef}
          </h2>
        )}
        <Button type="button" variant="outline" size="sm" aria-pressed={section.hidden} onClick={() => onChange(toggleHidden(data, sectionRef))}>
          {section.hidden ? "Show section" : "Hide section"}
        </Button>
      </div>
      {!type ? (
        <p className="text-sm text-muted">This section type has no form yet.</p>
      ) : (
        <>
          {section.items.map((item, i) => {
            const itemPath = [...path, "items", i];
            return (
              <Card key={item.id} className={item.hidden ? "space-y-3 opacity-60" : "space-y-3"}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {type.fields.map((f) => (
                    <div key={f.key} className={f.kind === "description" ? "sm:col-span-2" : undefined}>
                      <Field id={`${item.id}-${f.key}`} label={f.label} kind={f.kind} value={item[f.key]} onChange={(v) => onChange(setField(data, [...itemPath, f.key], v))} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => onChange(moveItem(data, sectionRef, item.id, -1))}>
                    Up
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={i === section.items.length - 1} onClick={() => onChange(moveItem(data, sectionRef, item.id, 1))}>
                    Down
                  </Button>
                  <Button type="button" variant="ghost" size="sm" aria-pressed={item.hidden} onClick={() => onChange(toggleHidden(data, sectionRef, item.id))}>
                    {item.hidden ? "Show" : "Hide"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onChange(removeItem(data, sectionRef, item.id))}>
                    Remove
                  </Button>
                </div>
              </Card>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(addItem(data, sectionRef, crypto.randomUUID()))}>
            Add item
          </Button>
        </>
      )}
    </section>
  );
}
