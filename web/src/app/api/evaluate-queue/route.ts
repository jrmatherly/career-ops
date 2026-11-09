import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";

export const runtime = "nodejs"; // delegates to the core CLI via child_process
export const dynamic = "force-dynamic";

export const SKIPPED_HEADER = "X-Evaluate-Queue-Skipped";

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
  // A dump past runCoreCli's maxBuffer lands here too, with no stderr.
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
  return Response.json(entries, skipped ? { headers: { [SKIPPED_HEADER]: skipped } } : undefined);
}
