import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { failure, unreadable, usageResponse } from "@/lib/resume-cli";
import { pairProblem } from "@/lib/resume-pairing.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A leading letter or digit keeps an id from reading as a CLI flag.
const ID_RE = /^[A-Za-z0-9][\w-]{0,127}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

function parsePairs(v: unknown): [string, string][] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  if (!v.every((p) => Array.isArray(p) && p.length === 2 && isId(p[0]) && isId(p[1]))) return null;
  const pairs = v as [string, string][];
  const unique = (k: 0 | 1) => new Set(pairs.map((p) => p[k])).size === pairs.length;
  return unique(0) && unique(1) ? pairs : null;
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ pairs?: unknown }>(req);
  const pairs = parsePairs(body?.pairs);
  if (!pairs) return Response.json({ error: "body must be { pairs: [orphanId, newId][] }, each id once" }, { status: 400 });

  // shortcut: a second spawn checks the ids because resume.mjs pair accepts any two; drop it once pair validates ids itself.
  const a = await runCoreCli("resume", ["absorb", "--json"]);
  if (a.code === 0) return Response.json({ error: "cv.md already reads back losslessly; reload to edit" }, { status: 409 });
  if (a.code !== 3) return usageResponse(a) ?? failure(a, "absorb");
  let report: { orphans: unknown[]; newEntries: unknown[] };
  try {
    const parsed = JSON.parse(a.stdout);
    report = { orphans: parsed.orphans ?? [], newEntries: parsed.newEntries ?? [] };
  } catch {
    return unreadable(a, "absorb");
  }
  const problem = pairs.map((p) => pairProblem(report, p)).find(Boolean);
  if (problem) return Response.json({ error: `${problem}; reload and pick again` }, { status: 400 });

  // The check and resume.mjs pair read cv.md separately; an edit in between is checked against the earlier report.
  const r = await runCoreCli("resume", ["pair", ...pairs.flat()]);
  if (r.code === 0) return Response.json({ ok: true });
  if (r.code === 3) return Response.json({ error: "Still not lossless after pairing; nothing written.", output: r.stdout.split("\n").filter((l) => !l.includes("node resume.mjs")).join("\n") }, { status: 422 });
  return usageResponse(r) ?? failure(r, "pair");
}
