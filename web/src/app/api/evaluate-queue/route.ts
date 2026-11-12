import fs from "node:fs";
import { readApplications, readInbox, rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { enrichLedger } from "@/lib/evaluate-settings.mjs";

export const runtime = "nodejs"; // delegates to the core CLI via child_process
export const dynamic = "force-dynamic";

export const SKIPPED_HEADER = "X-Evaluate-Queue-Skipped";
export const UNNAMED_HEADER = "X-Evaluate-Queue-Unnamed";

// The auto-mode ledger, data/evaluate-queue.tsv, as `evaluate-queue.mjs dump --json`
// prints it. Read-only. The CLI's stderr names absolute paths, so it is logged, never returned.
export async function GET() {
  if (!fs.existsSync(rootScript("evaluate-queue"))) {
    return Response.json({ error: "the evaluate queue needs the career-ops scripts; this root has data only", code: "core-script-missing" }, { status: 503 });
  }
  const r = await runCoreCli("evaluate-queue", ["dump", "--json"]);
  const stderr = r.stderr.trim();
  if (stderr) console.error(`/api/evaluate-queue: evaluate-queue.mjs: ${stderr}`);
  if (r.timedOut) return Response.json({ error: "reading the evaluate queue timed out; try Refresh" }, { status: 503 });
  const unreadable = (why: string) => {
    console.error(`/api/evaluate-queue: ${why}`);
    return Response.json({ error: "the evaluate queue could not be read; the server log has the details" }, { status: 503 });
  };
  if (r.overflow) return unreadable("dump --json exceeded runCoreCli's maxBuffer; the ledger is too large to read in one call");
  if (r.spawnFailed) return unreadable("evaluate-queue.mjs failed to run");
  if (r.code !== 0) return unreadable(`evaluate-queue.mjs exited ${r.code}`);
  let entries: unknown;
  try {
    entries = JSON.parse(r.stdout);
  } catch (cause) {
    return unreadable(`stdout is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (!Array.isArray(entries)) return unreadable("stdout is not a JSON array");
  // The CLI exits 0 and counts the rows it could not parse on stderr; the count rides a header so the dump keeps its shape.
  const skipped = /^warning: (\d+) malformed row/m.exec(stderr)?.[1];
  const headers: Record<string, string> = skipped ? { [SKIPPED_HEADER]: skipped } : {};
  // Names are a convenience: an unreadable tracker or inbox leaves the rows as URLs rather than
  // hiding the queue, and the header lets the panel say so. The cause names absolute paths, so it is logged only.
  try {
    const applications = readApplications();
    entries = enrichLedger(entries, readInbox(applications), applications);
  } catch (cause) {
    console.error("/api/evaluate-queue: the rows are not named:", cause);
    headers[UNNAMED_HEADER] = "1";
  }
  return Response.json(entries, { headers });
}
