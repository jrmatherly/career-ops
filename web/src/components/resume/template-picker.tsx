"use client";

export type TemplateOption = { name: string; displayName: string };

export const SELECT = "rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]";

export function TemplatePicker({ templates, value, onChange }: { templates: TemplateOption[]; value: string; onChange: (name: string) => void }) {
  // Keep a template that resume.json names but is no longer installed; without its option the controlled select would show the first option instead.
  const unknown = value !== "default" && !templates.some((t) => t.name === value);
  return (
    <div>
      <label htmlFor="design-template" className="mb-1 block text-xs font-medium text-muted">
        Template
      </label>
      <select id="design-template" value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        <option value="default">Profile default</option>
        {templates.map((t) => (
          <option key={t.name} value={t.name}>
            {t.displayName}
          </option>
        ))}
        {unknown && <option value={value}>{value}</option>}
      </select>
    </div>
  );
}
