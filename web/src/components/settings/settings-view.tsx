"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { SETTINGS_SAVED_EVENT, dirtyChanges } from "@/lib/settings-form.mjs";
import type { SettingsGroup, SettingsResponse } from "@/lib/settings-form.mjs";
import { SettingRow } from "./setting-row";

type Form = Record<string, string | boolean | string[]>;
type Notice = { group: string; kind: "saved" | "conflict" | "error"; text: string };

const BUTTON = "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-60 max-sm:min-h-[44px]";
const QUIET = "rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover max-sm:min-h-[44px]";
const BANNER = "mb-6 rounded-xl border border-border bg-surface/40 p-4 text-sm text-muted";

export function SettingsView() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // keepEdits: a save made elsewhere on the page changes the revision, not what the user has typed here.
  const load = useCallback(async (keepEdits = false) => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      setData(await res.json());
      setLoadError(null);
      if (!keepEdits) {
        setForm({});
        setErrors({});
        setNotice(null);
      }
    } catch (e) {
      setData(null);
      setLoadError(e instanceof Error ? e.message : "The settings could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
    const reload = () => void load(true);
    window.addEventListener(SETTINGS_SAVED_EVENT, reload);
    return () => window.removeEventListener(SETTINGS_SAVED_EVENT, reload);
  }, [load]);

  async function send(group: SettingsGroup, changes: Record<string, unknown>, done: string) {
    if (!data || Object.keys(changes).length === 0) return;
    setBusy(group.id);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: data.revision, changes }) });
      const body = await res.json();
      if (res.ok) {
        setData(body);
        setForm((f) => Object.fromEntries(Object.entries(f).filter(([id]) => !Object.hasOwn(changes, id))));
        setErrors({});
        setNotice({ group: group.id, kind: "saved", text: done });
      } else if (res.status === 400 && body.errors) {
        setErrors(body.errors);
        setNotice({ group: group.id, kind: "error", text: "Nothing was saved. Fix the marked settings and save again." });
      } else {
        setNotice({ group: group.id, kind: res.status === 409 ? "conflict" : "error", text: body.error ?? `The server answered ${res.status}.` });
      }
    } catch {
      setNotice({ group: group.id, kind: "error", text: "The server could not be reached. Nothing was saved." });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 pb-10">
        <div role="alert" className={BANNER}>
          <p>The settings could not be loaded. {loadError}</p>
          <button type="button" onClick={() => void load()} className={`mt-3 ${QUIET}`}>Retry</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 pb-10 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-16">
      {data.overlayDisabled && (
        <p role="status" className={BANNER}>
          Saved settings are turned off for this server (CAREER_OPS_SETTINGS=off). The values below come from the environment.
        </p>
      )}
      {data.fileError && (
        <p role="alert" className={BANNER}>
          {data.fileError}. Saved settings are not applied and cannot be changed until the file is fixed or deleted.
        </p>
      )}

      <nav aria-label="Settings sections" className="mb-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-6 text-sm">
        {data.groups.map((g) => (
          <a key={g.id} href={`#settings-${g.id}`} className="text-brand-text hover:underline max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center">{g.label}</a>
        ))}
      </nav>

      {data.groups.map((group) => {
        const changes = dirtyChanges(group.settings, form);
        const canSave = group.settings.some((s) => s.editable);
        const note = notice?.group === group.id ? notice : null;
        return (
          <section key={group.id} id={`settings-${group.id}`} aria-labelledby={`settings-${group.id}-heading`} className="mt-8 scroll-mt-6">
            <h2 id={`settings-${group.id}-heading`} className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{group.label}</h2>
            <div className="rounded-xl border border-border bg-surface/50 px-4">
              {group.settings.map((state) => (
                <SettingRow
                  key={state.id}
                  state={state}
                  value={form[state.id]}
                  error={errors[state.id]}
                  busy={busy !== null}
                  onChange={(value) => setForm((f) => ({ ...f, [state.id]: value }))}
                  onReset={() => void send(group, { [state.id]: null }, `${state.label} was reset.`)}
                />
              ))}
            </div>
            {canSave && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void send(group, changes, "Saved.")} disabled={busy !== null || Object.keys(changes).length === 0} className={BUTTON}>
                  {busy === group.id ? <Loader2 className="size-4 animate-spin" /> : note?.kind === "saved" ? <Check className="size-4" /> : null}
                  Save {group.label.toLowerCase()}
                </button>
                {note && <span role={note.kind === "saved" ? "status" : "alert"} className="text-xs text-muted">{note.text}</span>}
                {note?.kind === "conflict" && <button type="button" onClick={() => void load()} className={QUIET}>Reload</button>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
