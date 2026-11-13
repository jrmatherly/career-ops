import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { adoptInputsSha, failure, unreadable, usageResponse, validSha } from "@/lib/resume-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIFF_START = "--- cv.md";
const SAME_SHAPE = "cv.md is already in the generated shape";

// shortcut: resume.mjs adopt has no --json; switch to it when it does
function parseDiff(stdout: string): { diff: string | null } | null {
  const lines = stdout.split("\n");
  if (lines.includes(SAME_SHAPE)) return { diff: null };
  const start = lines.indexOf(DIFF_START);
  const end = lines.findIndex((l, i) => i > start && l === "" && lines[i + 1]?.startsWith("Nothing written"));
  return start === -1 || end === -1 ? null : { diff: lines.slice(start, end).join("\n") };
}

async function adopt(req: Request): Promise<Response> {
  const body = await readJsonObject<{ confirm?: unknown; expectedSha?: unknown }>(req);
  if (!body || (body.confirm !== undefined && body.confirm !== true)) return Response.json({ error: "body must be {} or { confirm: true, expectedSha }" }, { status: 400 });
  if (body.confirm === true && !validSha(body.expectedSha)) return Response.json({ error: "expectedSha must be sha256 hex" }, { status: 400 });

  const before = await adoptInputsSha();
  if (!before) return Response.json({ error: "cv.md not found" }, { status: 404 });

  if (body.confirm !== true) {
    const r = await runCoreCli("resume", ["adopt"]);
    if (r.code !== 0) return usageResponse(r) ?? failure(r, "adopt");
    if ((await adoptInputsSha()) !== before) return Response.json({ error: "cv.md or data/resume.json changed while the diff was computed; try again" }, { status: 409 });
    const parsed = parseDiff(r.stdout);
    if (parsed) return Response.json({ inputsSha: before, ...parsed });
    return unreadable(r, "adopt");
  }

  if (before !== body.expectedSha) return Response.json({ error: "cv.md or data/resume.json changed since the diff was shown; review the new diff before adopting" }, { status: 409 });
  // The sha check and the CLI's read of cv.md and resume.json are not atomic; a write in between is adopted unseen.
  const r = await runCoreCli("resume", ["adopt", "--confirm"]);
  // Exit 0 means cv.md was replaced; the message only names the backup.
  if (r.code === 0) return Response.json({ ok: true, message: r.stdout.split("\n").find((l) => l.startsWith("cv.md replaced")) ?? "cv.md replaced" });
  // Exit 4: cv.md or data/resume.json changed after adopt read them, and nothing was written.
  if (r.code === 4) return Response.json({ error: "cv.md or data/resume.json changed while adopt ran; review the new diff before adopting" }, { status: 409 });
  return usageResponse(r) ?? failure(r, "adopt", ". cv.md may have changed: reload before trying again.");
}

export async function POST(req: Request) {
  try {
    return await adopt(req);
  } catch (err) {
    // adoptInputsSha rethrows anything but a missing file (EACCES, EISDIR); answer JSON, not Next's HTML 500.
    console.error("resume adopt failed", err);
    const code = (err as NodeJS.ErrnoException).code;
    return Response.json({ error: code ? `could not read cv.md or data/resume.json (${code})` : "resume adopt failed; see the server log" }, { status: 500 });
  }
}
