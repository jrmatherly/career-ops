import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { schedulerSource, schedulerStatus, schedulerTickPath } from "@/lib/scheduler-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function runnerScript() {
  return path.join(resolveCodeRoot(process.cwd(), process.env), "web", "scripts", "scheduled-jobs-runner.mjs");
}

export async function GET() {
  return NextResponse.json(await schedulerStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const script = runnerScript();
  if (!fs.existsSync(script)) {
    return NextResponse.json({ error: "Scheduled job runner is not installed." }, { status: 404 });
  }

  try {
    const child = spawn(process.execPath, [script], {
      cwd: resolveCodeRoot(process.cwd(), process.env),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      child.once("spawn", () => {
        settled = true;
        resolve();
      });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    });
    child.unref();
  } catch {
    return NextResponse.json({ error: "Could not start the local scheduled-job runner." }, { status: 500 });
  }

  // An external scheduler has no cron line to touch the tick, so this route does; a manual click in OS mode must not.
  if (schedulerSource() === "external") {
    const tick = schedulerTickPath();
    try {
      fs.mkdirSync(path.dirname(tick), { recursive: true });
      fs.writeFileSync(tick, "");
    } catch (error) {
      console.error(`career-ops web: runner started but could not write ${tick}:`, error);
      return NextResponse.json(
        { accepted: true, warning: `Could not write the tick marker at ${tick}, so lastRun will not move.` },
        { status: 202 },
      );
    }
  }
  return NextResponse.json({ accepted: true }, { status: 202 });
}
