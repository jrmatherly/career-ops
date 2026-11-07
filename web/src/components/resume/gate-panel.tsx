"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SELECT } from "@/components/resume/template-picker";
import { candidatesFor } from "@/lib/resume-pairing.mjs";

export type Entry = { id: string; section?: string; name?: string; company?: string; position?: string; period?: string };
export type Report = { orphans?: Entry[]; newEntries?: Entry[]; unparsed?: { line: number; text: string }[] };

type PanelState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "preview"; diff: string | null; inputsSha: string }
  | { kind: "error"; message: string; output?: string };

export const entryText = (e: Entry) => (e.section ? `${e.section}: ${e.name ?? ""}` : [e.company, e.position, e.period].filter(Boolean).join(", "));

// A route that throws answers with an HTML error page, not JSON.
const post = async (url: string, body: object): Promise<{ ok: boolean; body: { error?: string; [key: string]: any } }> => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, body: await res.json().catch(() => ({ error: `HTTP ${res.status}` })) };
};

const DIFF_TINT = (line: string) =>
  line.startsWith("+") && !line.startsWith("+++") ? "bg-green-500/10 text-green-800 dark:text-green-400" : line.startsWith("-") && !line.startsWith("---") ? "bg-red-500/10 text-red-800 dark:text-red-400" : "";

export function GatePanel({ report, absorbed, onResolved }: { report: Report | null; absorbed: boolean; onResolved: (message?: string) => void }) {
  const orphans = report?.orphans ?? [];
  const newEntries = report?.newEntries ?? [];
  const unparsed = report?.unparsed ?? [];
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  // The same rules the pair route enforces, so the selects offer only pairs it accepts.
  const candidates = (o: Entry): Entry[] => candidatesFor({ orphans, newEntries }, o);
  const pairable = orphans.filter((o) => candidates(o).length > 0);
  const [choices, setChoices] = useState<Record<string, string>>(() => {
    const only = pairable.length === 1 ? candidates(pairable[0]) : [];
    return only.length === 1 ? { [pairable[0].id]: only[0].id } : {};
  });
  const taken = new Set(Object.values(choices));

  // resume.mjs pair re-runs the gate, which fails while any line is unreadable.
  const canPair = absorbed && pairable.length > 0 && unparsed.length === 0;
  const pairs = Object.entries(choices).filter(([, n]) => n);
  const busy = state.kind === "busy";

  const run = async (url: string, body: object, onOk: (b: Record<string, any>) => void) => {
    setState({ kind: "busy" });
    try {
      const res = await post(url, body);
      if (!res.ok) return setState({ kind: "error", message: res.body.error ?? "Request failed", output: res.body.output });
      setState({ kind: "idle" });
      onOk(res.body);
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  };
  const pair = () => run("/api/resume/pair", { pairs }, () => onResolved());
  const previewAdopt = () => run("/api/resume/adopt", {}, (b) => setState({ kind: "preview", diff: b.diff, inputsSha: b.inputsSha }));
  const confirmAdopt = (sha: string) => run("/api/resume/adopt", { confirm: true, expectedSha: sha }, (b) => onResolved(b.message));

  const list = (title: string, entries: Entry[]) =>
    entries.length ? (
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
          {entries.map((e) => (
            <li key={e.id} className="break-words">
              {entryText(e)} <code className="text-faint">{e.id}</code>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <Card className="mt-6 space-y-4">
      <p role="status" className="text-sm text-foreground">
        <code>cv.md</code> does not read back into the editor without loss, so the editor is read-only.{" "}
        {canPair && "If an entry was renamed or redated, it shows in both lists below: pair the two to keep its history. "}
        {absorbed && pairable.length > 0 && unparsed.length > 0 && "Renamed entries can be paired once every line of cv.md reads: fix the unreadable lines and reload, or adopt. "}
        Adopting rewrites cv.md in the shape the editor saves.
      </p>
      {list("Entries only in data/resume.json", orphans)}
      {list("Entries only in cv.md", newEntries)}
      {unparsed.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground">Lines that could not be read</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted">
            {unparsed.map((u) => (
              <li key={u.line} className="break-words">
                Line {u.line}: <code>{u.text}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canPair && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-foreground">Renamed entries</h3>
          {pairable.map((o) => (
            <div key={o.id} className="min-w-0">
              <label htmlFor={`pair-${o.id}`} className="mb-1 block text-xs font-medium text-muted">
                {entryText(o)} is now
              </label>
              <select id={`pair-${o.id}`} value={choices[o.id] ?? ""} onChange={(e) => setChoices({ ...choices, [o.id]: e.target.value })} className={`${SELECT} w-full`}>
                <option value="">Not renamed</option>
                {candidates(o)
                  .filter((n) => !taken.has(n.id) || choices[o.id] === n.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {entryText(n)}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          <Button type="button" onClick={pair} disabled={busy || pairs.length === 0}>
            Same entry, renamed: pair
          </Button>
        </div>
      )}

      {/* Adopt is offered on every gate failure: absorb also fails on text it reads but would rewrite, which no list above shows. */}
      <div className="space-y-3 border-t border-border pt-4">
        {state.kind === "preview" ? (
          <>
            {state.diff === null ? (
              <p className="text-sm text-foreground">cv.md is already in the generated shape.</p>
            ) : (
              <pre aria-label="Changes to cv.md" tabIndex={0} className="max-h-96 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-foreground">
                {state.diff.split("\n").map((line, i) => (
                  <span key={i} className={`block whitespace-pre ${DIFF_TINT(line)}`}>
                    {line || " "}
                  </span>
                ))}
              </pre>
            )}
            {orphans.length > 0 && <p className="text-sm text-foreground">Entries only in data/resume.json are written back into cv.md, so a renamed entry would appear twice.</p>}
            <p className="text-sm text-foreground">Nothing is written until you confirm. cv.md is kept as a .bak copy.</p>
            <div className="flex flex-wrap gap-2">
              <Button autoFocus type="button" onClick={() => confirmAdopt(state.inputsSha)}>
                Confirm adopt
              </Button>
              <Button type="button" variant="outline" onClick={() => setState({ kind: "idle" })}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={previewAdopt} disabled={busy}>
            Adopt the regenerated cv.md
          </Button>
        )}
      </div>

      {busy && (
        <p role="status" className="text-sm text-muted">
          Working…
        </p>
      )}
      {state.kind === "error" && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300">{state.message}</p>
          {state.output && <pre className="max-h-64 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs text-foreground">{state.output}</pre>}
        </div>
      )}
    </Card>
  );
}
