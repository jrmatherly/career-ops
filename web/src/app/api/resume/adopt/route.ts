import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { adoptInputsSha, failure, usageResponse } from "@/lib/resume-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHA_RE = /^[0-9a-f]{64}$/;
const DIFF_START = "--- cv.md";
const SAME_SHAPE = "cv.md is already in the generated shape";

// shortcut: resume.mjs adopt has no --json; switch to it when it does
function parseAdopt(stdout: string): { findings: string[]; diff: string | null } | null {
  const lines = stdout.split("\n");
  const same = lines.indexOf(SAME_SHAPE);
  const start = same === -1 ? lines.indexOf(DIFF_START) : same;
  if (start === -1) return null;
  const findings = lines
    .slice(0, start)
    .filter((l) => l.startsWith("  ") && !l.includes("node resume.mjs") && !l.includes("--confirm"))
    .map((l) => l.trim());
  if (same !== -1) return { findings, diff: null };
  const end = lines.findIndex((l, i) => i > start && l === "" && lines[i + 1]?.startsWith("Nothing written"));
  return end === -1 ? null : { findings, diff: lines.slice(start, end).join("\n") };
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ confirm?: unknown; expectedSha?: unknown }>(req);
  if (!body || (body.confirm !== undefined && body.confirm !== true)) return Response.json({ error: "body must be {} or { confirm: true, expectedSha }" }, { status: 400 });

  if (body.confirm !== true) {
    const before = await adoptInputsSha();
    if (!before) return Response.json({ error: "cv.md not found" }, { status: 404 });
    const r = await runCoreCli("resume", ["adopt"]);
    if ((await adoptInputsSha()) !== before) return Response.json({ error: "cv.md or data/resume.json changed while the diff was computed; try again" }, { status: 409 });
    const parsed = r.code === 0 ? parseAdopt(r.stdout) : null;
    if (parsed) return Response.json({ inputsSha: before, ...parsed });
    return usageResponse(r) ?? failure(r, "adopt");
  }

  if (typeof body.expectedSha !== "string" || !SHA_RE.test(body.expectedSha)) return Response.json({ error: "expectedSha must be sha256 hex" }, { status: 400 });
  const current = await adoptInputsSha();
  if (!current) return Response.json({ error: "cv.md not found" }, { status: 404 });
  if (current !== body.expectedSha) return Response.json({ error: "cv.md or data/resume.json changed since the diff was shown; review the new diff before adopting" }, { status: 409 });
  // The sha check and the CLI's own read of cv.md are not atomic; a write in between is adopted unseen.
  const r = await runCoreCli("resume", ["adopt", "--confirm"]);
  if (r.code === 0) {
    const message = r.stdout.split("\n").find((l) => l.startsWith("cv.md replaced"));
    if (message) return Response.json({ ok: true, message });
  }
  return usageResponse(r) ?? failure(r, "adopt", ". cv.md may have changed: reload before trying again.");
}
