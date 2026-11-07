import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { runCoreCli, type CliResult } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHA_RE = /^[0-9a-f]{64}$/;

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

const usageMessage = (r: CliResult) => (r.code === 1 && r.stderr.startsWith("resume: ") ? r.stderr.split("\n")[0].slice("resume: ".length) : null);

function failure(r: CliResult) {
  if (r.timedOut) return Response.json({ error: "resume.mjs timed out" }, { status: 503 });
  return Response.json({ error: r.spawnFailed ? "could not start resume.mjs" : r.stderr.slice(-2000) || `resume.mjs exited ${r.code}` }, { status: 500 });
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export async function GET() {
  const r = await runCoreCli("resume", ["absorb", "--json"]);
  if (r.code === 0 || r.code === 3) {
    let report: unknown;
    try {
      report = JSON.parse(r.stdout);
    } catch {
      return failure(r);
    }
    let data: Record<string, unknown> | null = null;
    try {
      data = JSON.parse(await readFile(path.join(careerOpsRoot(), "data", "resume.json"), "utf8"));
    } catch {
      if (r.code === 0) return failure(r);
    }
    const lossless = r.code === 0;
    const cvMdSha = lossless ? ((data?.careerOps as { cvSha256?: string } | undefined)?.cvSha256 ?? null) : null;
    return Response.json({ data, cvMdSha, report, lossless });
  }
  const usage = usageMessage(r);
  if (usage?.endsWith("not found")) return Response.json({ error: "cv.md not found" }, { status: 404 });
  if (usage) return Response.json({ error: usage }, { status: 400 });
  return failure(r);
}

export async function PUT(req: Request) {
  const body = await readJsonObject<{ data?: unknown; expectedCvSha?: unknown }>(req);
  if (!body || !isPlainObject(body.data) || typeof body.expectedCvSha !== "string" || !SHA_RE.test(body.expectedCvSha)) {
    return Response.json({ error: "body must be { data: object, expectedCvSha: sha256 hex }" }, { status: 400 });
  }
  const sha = body.expectedCvSha;
  const r = await withDraftFile(body.data, (file) => runCoreCli("resume", ["save", "--in", file, "--expected-cv-sha", sha, "--json"]));
  const out = (() => {
    try {
      return JSON.parse(r.stdout) as { cvSha256?: string };
    } catch {
      return {};
    }
  })();
  if (r.code === 0) return Response.json({ cvMdSha: out.cvSha256 });
  if (r.code === 4) return Response.json({ error: "cv.md changed since this draft was opened; reload to continue", cvMdSha: out.cvSha256 }, { status: 409 });
  if (r.code === 3) return Response.json({ error: "cv.md cannot hold this draft as written: check for an entry missing its name, company or title, and for leading or trailing spaces" }, { status: 422 });
  const usage = usageMessage(r);
  if (usage) return Response.json({ error: usage }, { status: 400 });
  return failure(r);
}
