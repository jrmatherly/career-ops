import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { CliResult } from "@/lib/core-cli";

export const usageMessage = (r: CliResult) => (r.code === 1 && r.stderr.startsWith("resume: ") ? r.stderr.split("\n")[0].slice("resume: ".length) : null);

export function failure(r: CliResult, what: string, advice = "") {
  console.error(`resume.mjs ${what}: exit ${r.code}${r.timedOut ? " (timed out)" : ""}${r.spawnFailed ? " (spawn failed)" : ""}\n${r.stderr.slice(-2000)}`);
  if (r.timedOut) return Response.json({ error: `resume.mjs ${what} timed out${advice}` }, { status: 503 });
  const cause = r.spawnFailed ? "could not start resume.mjs" : `resume.mjs ${what} failed (exit ${r.code}); see the server log`;
  return Response.json({ error: cause + advice }, { status: 500 });
}

/** A usage error as 404 (cv.md missing) or 400, or null when `r` is not one. */
export function usageResponse(r: CliResult) {
  const usage = usageMessage(r);
  if (!usage) return null;
  if (/cv\.md not found$/.test(usage)) return Response.json({ error: "cv.md not found" }, { status: 404 });
  return Response.json({ error: usage }, { status: 400 });
}

const readOrNull = (file: string) =>
  readFile(path.join(careerOpsRoot(), file)).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });

/** sha256 over cv.md and data/resume.json, the two files adopt regenerates from; null when cv.md is absent. */
export async function adoptInputsSha(): Promise<string | null> {
  const [cv, json] = await Promise.all([readOrNull("cv.md"), readOrNull(path.join("data", "resume.json"))]);
  if (!cv) return null;
  return createHash("sha256").update(cv).update("\0").update(json ?? "").digest("hex");
}
