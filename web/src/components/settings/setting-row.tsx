"use client";

import { cn } from "@/lib/cn";
import { formValue, listText, parseListText, secretStatus, sourceLabel } from "@/lib/settings-form.mjs";
import type { SettingState } from "@/lib/settings-form.mjs";

const FIELD = "w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/50 disabled:opacity-60 sm:w-56";

function shown(state: SettingState): string {
  if (state.kind === "secret") return secretStatus(state);
  if (typeof state.value === "boolean") return state.display === "set" ? (state.value ? "Set" : "Not set") : state.value ? "On" : "Off";
  if (state.value === null || state.value === undefined || state.value === "") return "Not set";
  return Array.isArray(state.value) ? state.value.join(", ") : String(state.value);
}

export function SettingRow({ state, value, error, busy, onChange, onReset }: {
  state: SettingState;
  /** The control's value when the row was touched; undefined shows the loaded value. */
  value: string | boolean | string[] | undefined;
  error?: string;
  busy: boolean;
  onChange: (value: string | boolean | string[]) => void;
  onReset: () => void;
}) {
  const labelId = `setting-${state.id}-label`;
  const helpId = `setting-${state.id}-help`;
  const message = error ?? state.error;
  const current = value ?? formValue(state);

  return (
    <div className="border-t border-border/60 py-4 first:border-t-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div id={labelId} className="text-sm font-medium text-foreground">{state.label}</div>
          <p id={helpId} className="mt-0.5 text-xs text-faint">{state.help}</p>
        </div>
        <div className="min-w-0 sm:max-w-[60%] sm:shrink-0 sm:text-right">
          <Control state={state} current={current} labelId={labelId} helpId={helpId} invalid={Boolean(message)} busy={busy} onChange={onChange} />
          <div className="mt-1.5 flex items-center gap-2 text-xs text-faint sm:justify-end">
            {/* A key shows its status as its value, and an unset read-only row already reads "Not set". */}
            {state.kind !== "secret" && !(state.kind === "readonly" && state.source === "unset") && <span>{sourceLabel(state)}</span>}
            {state.source === "saved" && state.editable && (
              <button type="button" onClick={onReset} disabled={busy} aria-label={`Reset ${state.label}`} className="text-brand-text hover:underline disabled:opacity-60 max-sm:min-h-[44px]">
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
      {message && <p role="alert" className="mt-2 text-xs text-red-500 dark:text-red-400">{state.label} {message}</p>}
    </div>
  );
}

function Control({ state, current, labelId, helpId, invalid, busy, onChange }: {
  state: SettingState;
  current: string | boolean | string[];
  labelId: string;
  helpId: string;
  invalid: boolean;
  busy: boolean;
  onChange: (value: string | boolean | string[]) => void;
}) {
  // A key or token is never typed or shown here; a row this page cannot change is plain text.
  if (state.kind === "secret" || state.editable === false) {
    return <div role="group" aria-labelledby={labelId} className="break-all text-sm text-foreground">{shown(state)}</div>;
  }
  const described = { "aria-labelledby": labelId, "aria-describedby": helpId, "aria-invalid": invalid || undefined, disabled: busy };

  if (state.type === "bool") {
    const on = current === true;
    return (
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} {...described}
        className={cn("relative h-6 w-11 rounded-full transition-colors disabled:opacity-60", on ? "bg-brand" : "bg-surface-hover")}>
        <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
      </button>
    );
  }
  if (state.type === "list" && state.values) {
    const picked = Array.isArray(current) ? current : [];
    return (
      <div role="group" aria-labelledby={labelId} aria-describedby={helpId} className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
        {state.values.map((v) => (
          <label key={v} className="inline-flex items-center gap-1.5 text-sm text-foreground max-sm:min-h-[44px]">
            <input type="checkbox" className="size-6" name={state.id} value={v} checked={picked.includes(v)} disabled={busy}
              onChange={(e) => onChange((state.values ?? []).filter((x) => (x === v ? e.target.checked : picked.includes(x))))} />
            {v}
          </label>
        ))}
      </div>
    );
  }
  if (state.type === "list") {
    const text = Array.isArray(current) ? listText(current) : String(current);
    const count = parseListText(text).length;
    return (
      <div>
        <textarea name={state.id} rows={6} value={text} onChange={(e) => onChange(e.target.value)} spellCheck={false} {...described} className={FIELD} />
        <p className="mt-1 text-xs text-faint">{count} {count === 1 ? "entry" : "entries"}</p>
      </div>
    );
  }
  if (state.type === "enum") {
    return (
      <select name={state.id} value={String(current)} onChange={(e) => onChange(e.target.value)} {...described} className={FIELD}>
        {/* Choosing nothing resets a saved value; on any other row it would change nothing. */}
        {(current === "" || state.source === "saved") && <option value="">Not set</option>}
        {(state.values ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  return (
    <input
      name={state.id}
      // Not a number input: that reports text it cannot parse as empty, which a saved row would send as a reset.
      type={state.type === "url" ? "url" : "text"}
      inputMode={state.type === "int" ? "numeric" : state.type === "number" ? "decimal" : undefined}
      value={String(current)}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      {...described}
      className={FIELD}
    />
  );
}
