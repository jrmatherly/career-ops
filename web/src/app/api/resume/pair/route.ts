import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { failure, usageResponse } from "@/lib/resume-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A leading letter or digit keeps an id from reading as a CLI flag.
const ID_RE = /^[A-Za-z0-9][\w-]{0,127}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

function parsePairs(v: unknown): [string, string][] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  if (!v.every((p) => Array.isArray(p) && p.length === 2 && isId(p[0]) && isId(p[1]))) return null;
  const pairs = v as [string, string][];
  return new Set(pairs.map((p) => p[0])).size === pairs.length ? pairs : null;
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ pairs?: unknown }>(req);
  const pairs = parsePairs(body?.pairs);
  if (!pairs) return Response.json({ error: "body must be { pairs: [orphanId, newId][] }, each orphan id once" }, { status: 400 });
  const r = await runCoreCli("resume", ["pair", ...pairs.flat()]);
  if (r.code === 0) return Response.json({ ok: true });
  if (r.code === 3) return Response.json({ error: "Still not lossless after pairing; nothing written.", output: r.stdout.split("\n").filter((l) => !l.includes("node resume.mjs")).join("\n") }, { status: 422 });
  return usageResponse(r) ?? failure(r, "pair");
}
