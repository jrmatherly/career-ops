import { Suspense } from "react";
import { pdfReadyReportNumbers, pipelineSummary, readTrackerShape, withCloseDates, type InboxJob } from "@/lib/career-ops";
import { reportNumberFromCell } from "@/lib/apply/cv-selection.mjs";
import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { markGated, markVerdicts, pendingInbox } from "@/lib/inbox-pending.mjs";
import { listScheduledJobs } from "@/lib/scheduled-jobs";
import { storedHolds } from "@/lib/scheduled-job-input.mjs";
import { loadHoldVerdicts } from "@/lib/core/workplace-policy.mjs";
import { holdProblemNote } from "@/lib/inbox-verdict.mjs";
import { PipelineView } from "@/components/pipeline-view";
import { pipelineTab } from "@/lib/pipeline-navigation.mjs";
import { scorePosting } from "@/lib/core/inbox-rank.mjs";
import { applyInboxFit, loadFitTargets } from "@/lib/inbox-fit-profile.mjs";

export const dynamic = "force-dynamic"; // always read fresh local files

// The auto-mode ledger, read the way /api/evaluate-queue reads it. A ledger that
// cannot be read marks no row: the inbox still lists every posting.
async function ledgerEntries(): Promise<{ url?: string; state?: string; reason?: string }[]> {
  try {
    if (!fs.existsSync(rootScript("evaluate-queue"))) return [];
    const r = await runCoreCli("evaluate-queue", ["dump", "--json"]);
    if (r.code !== 0 || r.timedOut || r.overflow || r.spawnFailed) throw new Error(r.stderr.trim() || "evaluate-queue.mjs did not finish");
    const entries: unknown = JSON.parse(r.stdout);
    return Array.isArray(entries) ? entries : [];
  } catch (cause) {
    console.error(`/pipeline: gated rows are not marked: ${cause instanceof Error ? cause.message : String(cause)}`);
    return [];
  }
}

// One verdict function per scheduled scan's location hold. A hold that cannot be
// built, or a store that cannot be read, judges nothing: the inbox still lists every posting.
async function holdVerdicts(): Promise<Awaited<ReturnType<typeof loadHoldVerdicts>>> {
  try {
    return await loadHoldVerdicts(storedHolds(listScheduledJobs().jobs));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`/pipeline: no location was judged: ${message}`);
    return { verdicts: [], problems: [message] };
  }
}

// Tracker tabs show the inbox only as a count, so they get the count and not
// the postings. The inbox is most of the page payload on a large pipeline.
export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const onInbox = pipelineTab(tab) === "INBOX";
  const summary = pipelineSummary();
  const applications = await withCloseDates(summary.applications);
  const { inbox, scanDates } = summary;
  const unmarked = pendingInbox(inbox);
  const ledger = onInbox ? await ledgerEntries() : [];
  const { verdicts, problems } = onInbox ? await holdVerdicts() : { verdicts: [], problems: [] };
  const pending = markVerdicts(markGated(unmarked, ledger), verdicts);
  const holdProblem = holdProblemNote(problems, verdicts.length > 0);
  const fitted = onInbox ? withInboxFit(pending) : null;
  const trackerShape = readTrackerShape();
  // Tracker row numbers whose tailored CV is indexed (data/pdf-index.tsv) AND on
  // disk; the tracker's own PDF emoji can drift from what output/ really holds.
  // Rows are keyed the way /api/cv-pdf?application= resolves them: through the
  // report cell, so a row with no resolvable report never gets a dead link.
  // Skipped on the inbox tab, which has no table.
  // One manifest read for the whole table, not one per row (#6974: per-row
  // lookups took 8 s on a 5,000-row tracker).
  const cvRows: string[] = [];
  if (!onInbox) {
    const rowReports = applications.flatMap((a) => {
      const report = reportNumberFromCell(a.report);
      return report !== null && report > 0 ? [{ n: a.n, report }] : [];
    });
    const ready = await pdfReadyReportNumbers(new Set(rowReports.map((r) => r.report)));
    for (const r of rowReports) if (ready.has(r.report)) cvRows.push(r.n);
  }
  return (
    <Suspense>
      <PipelineView
        applications={applications}
        inbox={fitted ? fitted.jobs : null}
        inboxCount={pending.length}
        inboxFitError={[fitted?.error, holdProblem].filter(Boolean).join("\n") || null}
        scanDates={onInbox ? scanDates : []}
        trackerShape={trackerShape}
        cvRows={cvRows}
      />
    </Suspense>
  );
}

// The zero-token fit fills only rows rank-pipeline.mjs left unranked, so a
// ranked row keeps its rank as the one the inbox orders by and shows.
function withInboxFit(jobs: InboxJob[]): { jobs: InboxJob[]; error: string | null } {
  return applyInboxFit(jobs, loadFitTargets, (job, targets) => job.rank !== undefined ? job : ({
    ...job,
    fit: scorePosting({
      title: job.role,
      location: job.location ?? "",
      pay: job.compensation ?? "",
    }, targets),
  }));
}
