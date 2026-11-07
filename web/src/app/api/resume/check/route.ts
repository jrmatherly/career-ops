import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { failure, unreadable, usageResponse } from "@/lib/resume-cli";

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

export async function POST(req: Request) {
  const body = await readJsonObject<{ data?: unknown }>(req);
  const data = body?.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return Response.json({ error: "body must be { data: object }" }, { status: 400 });
  const r = await withDraftFile(data, (file) => runCoreCli("resume", ["check", "--in", file, "--json"]));
  if (r.code !== 0) return usageResponse(r) ?? failure(r, "check");
  try {
    return Response.json({ report: JSON.parse(r.stdout) });
  } catch {
    return unreadable(r, "check");
  }
}
