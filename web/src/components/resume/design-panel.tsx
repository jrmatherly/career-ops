"use client";

import { SELECT } from "@/components/resume/template-picker";

type Kind = "color" | "text" | "break";

const GROUPS = ["Colors", "Typography", "Spacing", "Page and layout"] as const;
type Group = (typeof GROUPS)[number];

// One row per STYLE_VAR_MAP key in theme-style.mjs; resume-gate-routes.test.mjs fails when they drift.
const STYLE_FIELDS: { key: string; label: string; kind: Kind; group: Group; placeholder?: string }[] = [
  { key: "accent_color", label: "Accent", kind: "color", group: "Colors", placeholder: "#2563eb" },
  { key: "secondary_color", label: "Secondary", kind: "color", group: "Colors", placeholder: "#111827" },
  { key: "text_color", label: "Text", kind: "color", group: "Colors", placeholder: "#1f2937" },
  { key: "background_color", label: "Background", kind: "color", group: "Colors", placeholder: "#ffffff" },
  { key: "tag_color", label: "Tag text", kind: "color", group: "Colors", placeholder: "#0e7490" },
  { key: "tag_bg", label: "Tag fill", kind: "color", group: "Colors", placeholder: "#ecfeff" },
  { key: "tag_border", label: "Tag border", kind: "color", group: "Colors", placeholder: "#a5f3fc" },
  { key: "font_family", label: "Body font", kind: "text", group: "Typography", placeholder: "Outfit, Inter, sans-serif" },
  { key: "font_size", label: "Body font size", kind: "text", group: "Typography", placeholder: "10pt" },
  { key: "heading_font_family", label: "Heading font", kind: "text", group: "Typography", placeholder: "Georgia, serif" },
  { key: "heading_font_size", label: "Section title size", kind: "text", group: "Typography", placeholder: "13px" },
  { key: "line_height", label: "Line height", kind: "text", group: "Typography", placeholder: "1.45" },
  { key: "section_gap", label: "Space below sections", kind: "text", group: "Spacing", placeholder: "16px" },
  { key: "item_gap", label: "Space below entries", kind: "text", group: "Spacing", placeholder: "12px" },
  { key: "margin", label: "Page margin", kind: "text", group: "Page and layout", placeholder: "0.5in" },
  { key: "sidebar_width", label: "Sidebar width", kind: "text", group: "Page and layout", placeholder: "110px" },
  { key: "job_break_inside", label: "Split a job across pages", kind: "break", group: "Page and layout" },
  { key: "project_break_inside", label: "Split a project across pages", kind: "break", group: "Page and layout" },
];

const BY_GROUP = GROUPS.map((group) => ({ group, fields: STYLE_FIELDS.filter((f) => f.group === group) }));

const INPUT = "w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/50";
const HEX = /^#[0-9a-fA-F]{6}$/;

export function DesignPanel({ style, onChange }: { style: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  const set = (key: string, value: string) => {
    const next = { ...style };
    if (value) next[key] = value;
    else delete next[key];
    onChange(next);
  };
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]">Colors, fonts and spacing</summary>
      <div className="space-y-4 border-t border-border p-3">
        <p className="text-xs text-muted">
          Values here override <code className="text-foreground">config/profile.yml</code>&apos;s <code className="text-foreground">style:</code> for this resume. An empty field uses profile.yml&apos;s value, or the template&apos;s when profile.yml sets none.
        </p>
        {BY_GROUP.map(({ group, fields }) => (
          <fieldset key={group} className="space-y-3">
            <legend className="text-sm font-medium text-foreground">{group}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const id = `design-${f.key}`;
                const value = style[f.key] ?? "";
                const hex = HEX.test(value);
                return (
                  <div key={f.key} className="min-w-0">
                    <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
                      {f.label}
                    </label>
                    {f.kind === "break" ? (
                      <select id={id} value={value} onChange={(e) => set(f.key, e.target.value)} className={`${SELECT} w-full`}>
                        <option value="">Template default</option>
                        <option value="auto">auto</option>
                        <option value="avoid">avoid</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input id={id} type="text" value={value} placeholder={f.placeholder && `e.g. ${f.placeholder}`} onChange={(e) => set(f.key, e.target.value)} className={INPUT} />
                        {f.kind === "color" && (
                          <input type="color" aria-label={`${f.label} picker`} value={hex ? value.toLowerCase() : "#000000"} onChange={(e) => set(f.key, e.target.value)} className={`${hex ? "" : "opacity-40 "}h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]`} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}
