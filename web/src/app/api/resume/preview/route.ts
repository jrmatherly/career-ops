import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCoreCli } from "@/lib/core-cli";
import { renderCv } from "@/lib/cv-render";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function withDraftFile<T>(data: unknown, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "resume-draft-"));
  try {
    const file = path.join(dir, "resume.json");
    await writeFile(file, JSON.stringify(data));
    return await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type CareerOps = { template?: unknown; style?: unknown };

export async function POST(req: Request) {
  const body = await readJsonObject<{ data?: unknown }>(req);
  const data = body?.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return Response.json({ error: "body must be { data: object }" }, { status: 400 });
  const r = await withDraftFile(data, (file) => runCoreCli("resume", ["export", "payload", "--in", file, "--json"]));
  if (r.code === 1 && r.stderr.startsWith("resume: ")) return Response.json({ error: r.stderr.split("\n")[0].slice("resume: ".length) }, { status: 400 });
  if (r.timedOut) return Response.json({ error: "resume.mjs timed out" }, { status: 503 });
  let payload: unknown;
  let unmapped: string[];
  try {
    if (r.code !== 0) throw new Error();
    // --json adds `unmapped`: the sections the render payload has no slot for.
    ({ payload, unmapped } = JSON.parse(r.stdout) as { payload: unknown; unmapped: string[] });
  } catch {
    console.error(`resume.mjs export payload: exit ${r.code}${r.spawnFailed ? " (spawn failed)" : ""}\n${r.stderr.slice(-2000)}`);
    return Response.json({ error: r.spawnFailed ? "could not start resume.mjs" : `resume.mjs export failed (exit ${r.code}); see the server log` }, { status: 500 });
  }
  const co = ((data as { careerOps?: CareerOps }).careerOps ?? {}) as CareerOps;
  // careerOps.template 'default' means "no template choice"; renderCv rejects it as a name.
  const template = typeof co.template === "string" && co.template && co.template !== "default" ? co.template : undefined;
  let result: Awaited<ReturnType<typeof renderCv>>;
  try {
    result = await renderCv(payload, template, co.style);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  if (result.ok) return Response.json({ html: result.html, warnings: result.warnings, unmapped });
  return Response.json({ error: result.error, issues: result.status === 400 ? result.issues : undefined }, { status: result.status });
}
