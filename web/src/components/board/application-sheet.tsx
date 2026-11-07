"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { scoreTone } from "@/lib/format";
import { BOARD_COLUMNS, columnOf, columnStatus } from "@/lib/board.mjs";
import type { BoardCard } from "@/lib/application-detail";

const KIND_LABELS: Record<string, string> = { status: "Status", interview: "Interview" };
const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/[-_]/g, " ");

function Section({ title, empty, children }: { title: string; empty?: string | null; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {empty ? <p className="mt-2 text-sm text-muted">{empty}</p> : <div className="mt-2">{children}</div>}
    </section>
  );
}

function MetaForm({ n, metaKey, label }: { n: string; metaKey: "lane" | "tag"; label: string }) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/app-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, key: metaKey, value }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || `could not save (${response.status})`);
      setValue("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-2">
      <label htmlFor={inputId} className="text-xs text-muted">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={60}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]"
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy || !value.trim()} aria-label={`Save ${metaKey}`}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

export function ApplicationSheet({ card, onClose, onMove }: { card: BoardCard; onClose: () => void; onMove: (tab: string) => void }) {
  const titleId = useId();
  const { detail } = card;
  const offerFields = Object.entries(detail.offer?.fields ?? {});
  const { contacts } = detail;
  const here = columnOf(card.status);
  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="items-stretch justify-end p-0 sm:p-0"
      panelClassName="max-h-none h-full w-full rounded-none border-y-0 border-r-0 sm:max-w-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-xl tracking-tight text-landing">
            {card.company}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{card.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-faint">Status</dt>
        <dd>{card.status}</dd>
        <dt className="text-faint">Score</dt>
        <dd>{card.score ? <Badge tone={scoreTone(card.score)}>{card.score}</Badge> : "—"}</dd>
        <dt className="text-faint">Next step</dt>
        <dd>{card.nextStep}</dd>
        {detail.lane && (
          <>
            <dt className="text-faint">Lane</dt>
            <dd>{detail.lane}</dd>
          </>
        )}
        {detail.tags.length > 0 && (
          <>
            <dt className="text-faint">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {detail.tags.map((tag) => (
                <Badge key={tag} tone="info" className="font-medium">
                  {tag}
                </Badge>
              ))}
            </dd>
          </>
        )}
      </dl>
      <Link href={`/pipeline/${encodeURIComponent(card.n)}`} className="mt-3 inline-block text-sm font-medium text-brand-text hover:underline">
        Open the report
      </Link>

      {/* The touch path: HTML5 drag does not fire on most phone browsers. */}
      <Section title="Move to">
        <div className="flex flex-wrap gap-2">
          {BOARD_COLUMNS.filter((tab) => tab !== here).map((tab) => (
            <Button key={tab} type="button" variant="outline" size="sm" onClick={() => onMove(tab)} className="max-sm:min-h-[44px]">
              {columnStatus(tab)}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Follow-up" empty={detail.followUp ? null : "No follow-up pinned"}>
        {detail.followUp && (
          <p className="text-sm">
            <span className="tabular-nums">{detail.followUp.date}</span>
            {detail.followUp.note && <span className="text-muted"> · {detail.followUp.note}</span>}
          </p>
        )}
      </Section>

      {offerFields.length > 0 && (
        <Section title="Offer terms">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {offerFields.map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-faint">{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Interviews" empty={detail.interviews.length ? null : "No interviews recorded"}>
        <ul className="divide-y divide-border text-sm">
          {detail.interviews.map((r, i) => (
            <li key={i} className="py-1.5">
              <span className="font-medium">{r.round || "Interview"}</span>
              <span className="text-muted"> · {[r.when, r.interviewer, r.status].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Contacts" empty={contacts.length ? null : "No contacts recorded"}>
        <ul className="divide-y divide-border text-sm">
          {contacts.map((c, i) => (
            <li key={i} className="py-1.5">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted"> · {[c.type, c.title].filter(Boolean).join(" · ")}</span>
              {c.email && (
                <a href={`mailto:${c.email}`} className="block text-brand-text hover:underline">
                  {c.email}
                </a>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Timeline" empty={detail.timeline.length ? null : "Nothing recorded yet"}>
        <ol className="space-y-2 text-sm">
          {detail.timeline.map((entry, i) => (
            <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3">
              <span className="tabular-nums text-faint">{String(entry.at ?? "").slice(0, 10)}</span>
              <span>
                <Badge className="mr-1.5">{kindLabel(entry.kind)}</Badge>
                {entry.text}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Lane and tags">
        <MetaForm n={card.n} metaKey="lane" label="Lane" />
        <MetaForm n={card.n} metaKey="tag" label="Add a tag" />
      </Section>
    </Modal>
  );
}
