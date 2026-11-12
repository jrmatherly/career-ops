"use client";

import { useId, useRef, useState } from "react";
import { CalendarPlus, Loader2, Sparkles, X } from "lucide-react";
import type { EvaluateSettings, FiltersFrom, ScanEngine } from "@/lib/scheduled-jobs";
import { clampEvaluate, evaluateBody, evaluateFieldsVisible, evaluateForm, evaluateCaveat } from "@/lib/evaluate-settings.mjs";
import { DEFAULT_FILTERS, type ExploreFilters } from "@/lib/explore";
import { FilterBuilder } from "@/components/explore/filter-builder";
import { Modal } from "@/components/ui/modal";
import { scheduledJobBody } from "@/lib/scheduled-job-body.mjs";
import { cadenceMinimum, cadenceValueForUnit, createScheduledJobRequest } from "@/lib/scheduled-job-client.mjs";

export function CreateJobModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("Scheduled scan");
  const [engine, setEngine] = useState<ScanEngine>("full");
  const [filtersFrom, setFiltersFrom] = useState<FiltersFrom>("custom");
  const [evaluate, setEvaluate] = useState<EvaluateForm>(evaluateForm());
  const [every, setEvery] = useState(6);
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [filters, setFilters] = useState<ExploreFilters>({
    ...DEFAULT_FILTERS,
    ats: [...DEFAULT_FILTERS.ats],
    positive: [],
    negative: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await createScheduledJobRequest(scheduledJobBody({ name, engine, filtersFrom, filters, every, unit, evaluate: evaluateBody(evaluate) }));
      // The next new job starts Off rather than inheriting this one's evaluations.
      setEvaluate(evaluateForm());

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating job");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy="create-scheduled-scan-title" initialFocusRef={nameRef} panelClassName="max-w-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand-text">
              <CalendarPlus className="size-5" />
            </div>
            <div>
              <h2 id="create-scheduled-scan-title" className="text-lg font-semibold text-foreground">Create Scheduled Scan</h2>
              <p className="text-xs text-muted">Configure a persistent background job for automatic role discovery.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
          {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">{error}</div>}

          {/* ─── Name + Engine + Cadence ─── */}
          <div>
            <label className="mb-1 block text-[13px] font-medium text-foreground">Scan Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-surface-hover/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
              placeholder="e.g. Roles matching my profile"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-foreground">Scan Engine</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as ScanEngine)}
                className="w-full rounded-xl border border-border bg-surface-hover/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60"
              >
                <option value="full">Full ATS Dataset Sweep</option>
                <option value="portals">Zero-Token Portals.yml</option>
              </select>
              <p className="mt-1 text-xs text-faint">
                {engine === "full"
                  ? "Sweeps public Greenhouse/Lever/Ashby datasets."
                  : "Scans pre-configured portals.yml companies (0 AI cost)."}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-foreground">Repeat Cadence</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={cadenceMinimum(unit)}
                  value={every}
                  onChange={(e) => setEvery(Math.max(cadenceMinimum(unit), Number(e.target.value)))}
                  className="w-20 rounded-xl border border-border bg-surface-hover/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                />
                <select
                  value={unit}
                  onChange={(e) => {
                    const nextUnit = e.target.value as "minutes" | "hours" | "days";
                    setUnit(nextUnit);
                    setEvery((value) => cadenceValueForUnit(value, nextUnit));
                  }}
                  className="flex-1 rounded-xl border border-border bg-surface-hover/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
            </div>
          </div>

          <FiltersFromToggle value={filtersFrom} onChange={setFiltersFrom} />

          {/* ─── Reuse FilterBuilder from Explore ─── */}
          <div className="rounded-xl border border-border bg-surface/30 p-4">
            <FilterBuilder filters={filters} onChange={setFilters} hideLists={filtersFrom === "file"} />
          </div>

          <EvaluateFields value={evaluate} onChange={setEvaluate} />

          {/* ─── Actions ─── */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-xs font-medium text-brand-foreground shadow transition-colors hover:bg-brand-200 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {submitting ? "Creating…" : "Save Scheduled Scan"}
            </button>
          </div>
        </form>
    </Modal>
  );
}

export type EvaluateForm = { mode: EvaluateSettings["mode"]; rankThreshold: string; maxPerRun: string };

export function EvaluateFields({ value, onChange }: { value: EvaluateForm; onChange: (value: EvaluateForm) => void }) {
  const id = useId();
  // Show the stored number as soon as a field loses focus; an unreadable value waits for save to name the error.
  const clampShown = () => {
    try {
      const clamped = clampEvaluate(value);
      onChange({ ...value, rankThreshold: String(clamped.rankThreshold), maxPerRun: String(clamped.maxPerRun) });
    } catch {}
  };
  const field = "w-full rounded-xl border border-border bg-surface-hover/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60";
  const caveat = evaluateCaveat(value.mode);
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface/30 p-4">
      <div>
        <label htmlFor={`${id}-mode`} className="mb-1 block text-[13px] font-medium text-foreground">Evaluate new rows</label>
        <select id={`${id}-mode`} value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as EvaluateForm["mode"] })} className={field}>
          <option value="off">Off</option>
          <option value="review">Review: rank them</option>
          <option value="auto">Auto: rank them and evaluate the best</option>
        </select>
      </div>
      {evaluateFieldsVisible(value.mode) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-threshold`} className="mb-1 block text-[13px] font-medium text-foreground">Rank threshold (1 to 5)</label>
              <input id={`${id}-threshold`} type="number" min={1} max={5} step={0.1} value={value.rankThreshold} onChange={(e) => onChange({ ...value, rankThreshold: e.target.value })} onBlur={clampShown} className={field} />
            </div>
            <div>
              <label htmlFor={`${id}-max`} className="mb-1 block text-[13px] font-medium text-foreground">Evaluations per run (1 to 20)</label>
              <input id={`${id}-max`} type="number" min={1} max={20} step={1} value={value.maxPerRun} onChange={(e) => onChange({ ...value, maxPerRun: e.target.value })} onBlur={clampShown} className={field} />
            </div>
          </div>
        </>
      )}
      {caveat && <p className="text-xs text-faint">{caveat}</p>}
    </div>
  );
}

export function FiltersFromToggle({ value, onChange }: { value: FiltersFrom; onChange: (value: FiltersFrom) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px] text-foreground">
      <input
        type="checkbox"
        checked={value === "file"}
        onChange={(e) => onChange(e.target.checked ? "file" : "custom")}
        className="size-6 shrink-0 accent-brand"
      />
      <span>
        <span className="font-medium">Use portals.yml filters</span>
        <span className="block text-xs text-faint">Each run reads the title and location lists from portals.yml, so later edits to that file apply. Posted within, sources and scan depth still come from this job.</span>
      </span>
    </label>
  );
}
