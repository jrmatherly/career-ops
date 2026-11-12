import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { schedulerLogPath, schedulerSource, schedulerStatus, schedulerTickPath } from "@/lib/scheduler-status";

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

  // The runner's rank and drain lines are the only record of some failures. A file, not this
  // server's stderr: a detached runner must not depend on the server's terminal or its lifetime.
  let logFd: number | null = null;
  const closeLog = () => {
    if (logFd === null) return;
    const fd = logFd;
    logFd = null;
    try {
      fs.closeSync(fd);
    } catch (error) {
      console.warn("career-ops web: could not close the runner log:", error);
    }
  };
  // A log that refuses a write is not handed to the runner, whose own writes to it would throw.
  const note = (line: string) => {
    if (logFd === null) return;
    try {
      fs.writeSync(logFd, `${line}\n`);
    } catch (error) {
      console.warn("career-ops web: the runner log could not be written, so the runner's stderr is not kept:", error);
      closeLog();
    }
  };
  try {
    const log = schedulerLogPath();
    fs.mkdirSync(path.dirname(log), { recursive: true });
    logFd = fs.openSync(log, "a");
  } catch (error) {
    console.warn("career-ops web: the runner log could not be opened, so the runner's stderr is not kept:", error);
  }
  // The runner's lines carry no time of their own.
  note(`[${new Date().toISOString()}] tick`);

  try {
    const child = spawn(process.execPath, [script], {
      cwd: resolveCodeRoot(process.cwd(), process.env),
      detached: true,
      stdio: ["ignore", "ignore", logFd ?? "ignore"],
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
  } catch (error) {
    console.error("career-ops web: could not start the scheduled-job runner:", error);
    note(`the runner did not start: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: "Could not start the local scheduled-job runner." }, { status: 500 });
  } finally {
    // The child holds its own copy. A failed close must not replace the response.
    closeLog();
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
