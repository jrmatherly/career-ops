import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { runCoreCli, type CliResult } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHA_RE = /^[0-9a-f]{64}$/;
const validSha = (v: unknown): v is string => typeof v === "string" && SHA_RE.test(v);

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

// A save that fails after writing cv.md leaves this draft's sha stale.
const STALE_AFTER_SAVE = ". cv.md may have changed: reload before saving again.";

function failure(r: CliResult, what: string, advice = "") {
  console.error(`resume.mjs ${what}: exit ${r.code}${r.timedOut ? " (timed out)" : ""}${r.spawnFailed ? " (spawn failed)" : ""}\n${r.stderr.slice(-2000)}`);
  if (r.timedOut) return Response.json({ error: `resume.mjs ${what} timed out${advice}` }, { status: 503 });
  const cause = r.spawnFailed ? "could not start resume.mjs" : `resume.mjs ${what} failed (exit ${r.code}); see the server log`;
  return Response.json({ error: cause + advice }, { status: 500 });
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export async function GET() {
  const r = await runCoreCli("resume", ["absorb", "--json"]);
  if (r.code === 0 || r.code === 3) {
    let report: unknown;
    try {
      report = JSON.parse(r.stdout);
    } catch {
      return failure(r, "absorb");
    }
    let data: Record<string, unknown> | null = null;
    try {
      data = JSON.parse(await readFile(path.join(careerOpsRoot(), "data", "resume.json"), "utf8"));
    } catch (err) {
      // Only an absent sidecar is expected (read-only view of a cv.md never absorbed); anything else is a fault.
      if (r.code === 0 || (err as NodeJS.ErrnoException).code !== "ENOENT") return failure(r, "absorb");
    }
    const lossless = r.code === 0;
    const cvMdSha = lossless ? (data?.careerOps as { cvSha256?: unknown } | undefined)?.cvSha256 : null;
    if (lossless && !validSha(cvMdSha)) return failure(r, "absorb");
    return Response.json({ data, cvMdSha, report, lossless });
  }
  const usage = usageMessage(r);
  if (usage && /[/\\]cv\.md not found$/.test(usage)) return Response.json({ error: "cv.md not found" }, { status: 404 });
  if (usage) return Response.json({ error: usage }, { status: 400 });
  return failure(r, "absorb");
}

export async function PUT(req: Request) {
  const body = await readJsonObject<{ data?: unknown; expectedCvSha?: unknown }>(req);
  if (!body || !isPlainObject(body.data) || !validSha(body.expectedCvSha)) {
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
  if (r.code === 0) return validSha(out.cvSha256) ? Response.json({ cvMdSha: out.cvSha256 }) : failure(r, "save", STALE_AFTER_SAVE);
  if (r.code === 4) return Response.json({ error: "cv.md changed since this draft was opened; reload to continue", cvMdSha: out.cvSha256 }, { status: 409 });
  if (r.code === 3) return Response.json({ error: "cv.md cannot hold this draft as written: check for an entry whose first field (company, school, name, title) is empty, and for leading or trailing spaces" }, { status: 422 });
  const usage = usageMessage(r);
  if (usage) return Response.json({ error: usage }, { status: 400 });
  return failure(r, "save", STALE_AFTER_SAVE);
}
