import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWrite, atomicWriteWithBackup } from "@/lib/core/safe-write";
import { decideCvWrite } from "@/lib/cv-write.mjs";
import { readJsonObject } from "@/lib/json-body";
import { withResumeLock } from "@/lib/resume-lock";

function cvPath() {
  return path.join(careerOpsRoot(), "cv.md");
}

export async function GET() {
  try {
    return NextResponse.json({ content: fs.readFileSync(cvPath(), "utf8"), exists: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ content: "", exists: false });
    return NextResponse.json({ error: "Couldn't read cv.md." }, { status: 500 });
  }
}

function readCv(): { exists: boolean; content: string } {
  try {
    return { exists: true, content: fs.readFileSync(cvPath(), "utf8") };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, content: "" };
    throw err;
  }
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ content?: string; backup?: boolean; expected?: { content?: string; exists?: boolean } }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  try {
    // The read, the comparison with the text the editor started from and the write are one step
    // under the lock, so a structured save cannot land between them and be overwritten.
    return await withResumeLock(careerOpsRoot(), () => writeCv(body));
  } catch (err) {
    console.error("cv save: could not take the resume lock", err);
    if ((err as { code?: string }).code !== "LOCK_TIMEOUT") return NextResponse.json({ error: "write failed" }, { status: 500 });
    return NextResponse.json({ error: "cv.md is being saved somewhere else. Your text is still in this tab; try again." }, { status: 503 });
  }
}

function writeCv(body: { content?: string; backup?: boolean; expected?: { content?: string; exists?: boolean } }) {
  let disk: { exists: boolean; content: string };
  try {
    disk = readCv();
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
  const decision = decideCvWrite(disk, body);
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
  try {
    let bak = null;
    if (decision.backup) bak = atomicWriteWithBackup(cvPath(), body.content as string);
    else atomicWrite(cvPath(), body.content as string);
    return NextResponse.json({ ok: true, backedUp: !!bak });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
