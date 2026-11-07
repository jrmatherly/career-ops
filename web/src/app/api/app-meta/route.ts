import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { trackerRowArg } from "@/lib/status-cli.mjs";

export const runtime = "nodejs"; // delegates to the core CLI via child_process
export const dynamic = "force-dynamic";

// Sets a card's lane or adds a tag: one `app-meta.mjs set` row appended to
// data/application-meta.tsv under the pipeline lock. The tracker itself is
// never touched here; status changes go through /api/status.
const KEYS = new Set(["lane", "tag"]);
const MAX_VALUE = 60;

export async function POST(req: Request) {
  const body = await readJsonObject<{ n?: unknown; key?: unknown; value?: unknown }>(req);
  const row = trackerRowArg(body?.n);
  // app-meta.mjs refuses 0 as well; answer it here rather than as a CLI failure.
  if (!row || Number(row) <= 0 || typeof body?.key !== "string" || !KEYS.has(body.key)) {
    return Response.json({ error: "body must be { n, key: \"lane\" | \"tag\", value }" }, { status: 400 });
  }
  const value = typeof body.value === "string" ? body.value.trim() : "";
  // A leading dash would read as a flag; control characters would split the TSV row.
  if (!value || value.length > MAX_VALUE || value.startsWith("-") || /[\p{Cc}]/u.test(value)) {
    return Response.json({ error: `value must be 1-${MAX_VALUE} characters, no line breaks or tabs, not starting with "-"` }, { status: 400 });
  }
  if (!fs.existsSync(rootScript("app-meta"))) {
    return Response.json({ error: "lanes and tags need the career-ops scripts; this root has data only", code: "core-script-missing" }, { status: 503 });
  }

  const r = await runCoreCli("app-meta", ["set", row, body.key, value, "--source", "web"]);
  if (r.code === 0) return Response.json({ ok: true, n: row, key: body.key, value });
  if (r.timedOut) return Response.json({ error: "saving timed out; the change may or may not have been applied" }, { status: 504 });
  // stderr names absolute paths, so it is logged and only classified here.
  const err = r.stderr.trim();
  if (/No tracker row #\d+/.test(err)) return Response.json({ error: `no tracker row #${row}` }, { status: 404 });
  if (/pipeline lock timeout/.test(err)) return Response.json({ error: "another save holds the sidecar file; try again" }, { status: 503 });
  console.error(`/api/app-meta: app-meta.mjs exited ${r.code}: ${err}`);
  return Response.json({ error: "could not save" }, { status: 500 });
}
