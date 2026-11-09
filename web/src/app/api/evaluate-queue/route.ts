import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";

export const runtime = "nodejs"; // delegates to the core CLI via child_process
export const dynamic = "force-dynamic";

// The auto-mode ledger, data/evaluate-queue.tsv, as `evaluate-queue.mjs dump --json`
// prints it. Read-only. The CLI's stderr names absolute paths, so it is logged, never returned.
export async function GET() {
  if (!fs.existsSync(rootScript("evaluate-queue"))) {
    return Response.json({ error: "the evaluate queue needs the career-ops scripts; this root has data only", code: "core-script-missing" }, { status: 503 });
  }
  const r = await runCoreCli("evaluate-queue", ["dump", "--json"]);
  if (r.stderr.trim()) console.error(`/api/evaluate-queue: evaluate-queue.mjs: ${r.stderr.trim()}`);
  if (r.timedOut) return Response.json({ error: "reading the evaluate queue timed out" }, { status: 503 });
  const unreadable = () => Response.json({ error: "the evaluate queue could not be read" }, { status: 503 });
  if (r.code !== 0 || r.spawnFailed) return unreadable();
  try {
    const entries: unknown = JSON.parse(r.stdout);
    if (Array.isArray(entries)) return Response.json(entries);
  } catch {}
  console.error("/api/evaluate-queue: evaluate-queue.mjs printed no JSON array");
  return unreadable();
}
