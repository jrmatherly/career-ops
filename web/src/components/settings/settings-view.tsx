"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SETTINGS_SAVED_EVENT, dirtyChanges, formValue, parseFormValue } from "@/lib/settings-form.mjs";
import type { SettingsGroup, SettingsResponse } from "@/lib/settings-form.mjs";
import { pendingChanges } from "@/lib/settings-changes.mjs";
import { PluginStatus } from "./plugin-status";
import { SettingRow } from "./setting-row";

type Form = Record<string, string | boolean | string[]>;
type Notice = { kind: "saved" | "conflict" | "error"; text: string };

const BUTTON = "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-60 max-sm:min-h-[44px]";
const QUIET = "rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover disabled:opacity-60 max-sm:min-h-[44px]";
const BANNER = "mb-6 rounded-xl border border-border bg-surface/40 p-4 text-sm text-muted";

export function SettingsView() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Saving several groups in a row needs each save's new revision before React re-renders with it.
  const revision = useRef<SettingsResponse["revision"] | null>(null);

  // keepEdits: a save made elsewhere on the page changes the revision, not what the user has typed here.
  const load = useCallback(async (keepEdits = false) => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      setData(body);
      revision.current = body.revision;
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

  // Only "Saved." fades; a failure stays until the next save, edit-discard or reload.
  useEffect(() => {
    if (notice?.kind !== "saved") return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Resolves true when the server saved the changes. */
  async function send(group: SettingsGroup, changes: Record<string, unknown>, done: string) {
    if (!data || Object.keys(changes).length === 0) return true;
    setBusy(group.id);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision.current, changes }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(body);
        revision.current = body.revision;
        setForm((f) => Object.fromEntries(Object.entries(f).filter(([id]) => !Object.hasOwn(changes, id))));
        setErrors({});
        setNotice({ kind: "saved", text: done });
        return true;
      }
      if (res.status === 400 && body.errors) {
        setErrors(body.errors);
        setNotice({ kind: "error", text: `${group.label} was not saved. Fix the marked settings and save again.` });
      } else {
        // A later file failed after an earlier one was written: say which, since "not saved" would be false for it.
        const written = Array.isArray(body.written) && body.written.length ? ` Already saved: ${body.written.join(", ")}. Reload the page before saving again.` : "";
        setNotice({ kind: res.status === 409 ? "conflict" : "error", text: `${group.label}: ${body.error ?? `The server answered ${res.status}.`}${written}` });
      }
      return false;
    } catch {
      setNotice({ kind: "error", text: `The server could not be reached. ${group.label} was not saved.` });
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="pb-10">
        <div role="alert" className={BANNER}>
          <p>The settings could not be loaded. {loadError}</p>
          <button type="button" onClick={() => void load()} className={`mt-3 ${QUIET}`}>Retry</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 pb-10 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  const savedByGroup: Record<string, Record<string, unknown>> = {};
  const draftByGroup: Record<string, Record<string, unknown>> = {};
  for (const group of data.groups) {
    const saved = Object.fromEntries(group.settings.filter((s) => s.editable).map((s) => [s.id, parseFormValue(s, formValue(s))]));
    savedByGroup[group.id] = saved;
    draftByGroup[group.id] = { ...saved, ...dirtyChanges(group.settings, form) };
  }
  const pending = pendingChanges(draftByGroup, savedByGroup);
  const groups = data.groups;

  // In page order, stopping at the first failure: the groups after it stay pending.
  async function saveAll() {
    for (const { id, changes } of pending.groups) {
      const group = groups.find((g) => g.id === id);
      if (!group || !(await send(group, changes, "Saved."))) return;
    }
  }

  const rows = (group: SettingsGroup, states: SettingsGroup["settings"]) => {
    if (states.length === 0) return null;
    return (
      <div className="rounded-xl border border-border bg-surface/50 px-4">
        {states.map((state) => (
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
    );
  };

  const barShown = pending.count > 0 || notice !== null;
  return (
    <div className="pb-16">
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

      {data.envFileError && (
        <p role="alert" className={BANNER}>
          {data.envFileError}. A setting or key set only in that file shows as not set.
        </p>
      )}

      {data.groups.map((group) => {
        const fileRows = group.settings.filter((s) => s.kind === "portals");
        return (
          <section key={group.id} id={`settings-${group.id}`} aria-labelledby={`settings-${group.id}-heading`} className="mt-8 scroll-mt-6">
            <h2 id={`settings-${group.id}-heading`} className="mb-2 text-base font-semibold text-foreground">{group.label}</h2>
            {group.id === "profile" && <p className="mb-2 text-xs text-faint">Saved to config/profile.yml. Comments in the file are kept.</p>}
            {rows(group, group.settings.filter((s) => s.kind !== "portals"))}
            {fileRows.length > 0 && (
              <>
                <h3 className="mb-2 mt-6 text-xs font-semibold text-muted">Filters (portals.yml)</h3>
                {rows(group, fileRows)}
              </>
            )}
            {group.id === "integrations" && <PluginStatus />}
          </section>
        );
      })}

      {/* Fixed, not sticky: <main> sets overflow-x-hidden, which defeats sticky against the window.
          The wrapper repeats the page's frame and grid so the bar spans the content column, and its
          right padding keeps the bar clear of the Ask and back-to-top tabs docked on the right edge.
          The bar stays mounted while empty so its live region exists before the first change. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 md:left-60">
        <div className="mx-auto max-w-6xl pl-4 pr-[calc(4.5rem+env(safe-area-inset-right))] sm:pl-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8 2xl:pr-6">
          <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-brand/40 bg-surface py-2.5 pl-4 pr-2.5 text-sm shadow-lg transition-opacity lg:col-start-2 ${barShown ? "pointer-events-auto" : "opacity-0"}`}>
            <span className="flex min-w-0 flex-col">
              <span role="status" className="font-medium text-foreground">{pending.count > 0 ? `${pending.count} unsaved ${pending.count === 1 ? "change" : "changes"}` : ""}</span>
              {notice && <span role={notice.kind === "saved" ? "status" : "alert"} className={`text-xs ${notice.kind === "saved" ? "text-muted" : "text-red-700 dark:text-red-400"}`}>{notice.text}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {notice?.kind === "conflict" && <button type="button" onClick={() => void load()} className={QUIET}>Reload</button>}
              {pending.count > 0 && (
                <>
                  <button type="button" onClick={() => { setForm({}); setErrors({}); setNotice(null); }} disabled={busy !== null} className={QUIET}>Discard</button>
                  <button type="button" onClick={() => void saveAll()} disabled={busy !== null} className={BUTTON}>
                    {busy !== null && <Loader2 className="size-4 animate-spin" />}
                    Save changes
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
