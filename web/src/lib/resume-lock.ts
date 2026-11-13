import fs from "node:fs";
import path from "node:path";
import { acquireDirLock, releaseOrWarn } from "./core/dir-lock.mjs";

/**
 * Runs `fn` holding the lock `resume.mjs` save, adopt and import and `add-entry.mjs` hold
 * while they write cv.md (`acquireResumeLock` in lib/resume/model.mjs), so a check of cv.md
 * and the write that follows it cannot straddle one of theirs. `fn` must be synchronous.
 * The lock directory is spelled here, not imported from the core, so a web process that
 * cannot find the checkout still locks; web/tests/lib/resume-lock.test.mjs holds the core's
 * lock and fails if the two paths drift apart.
 *
 * @throws DirLockTimeoutError (code LOCK_TIMEOUT) when another writer holds the lock past the wait
 */
export async function withResumeLock<T>(root: string, fn: () => T): Promise<T> {
  const lockDir = path.join(root, "data", "resume.json.lock");
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  // A request that waits a minute reads as a hang, so the web gives up sooner than the CLI.
  const timeoutMs = Number(process.env.CAREER_OPS_WEB_RESUME_LOCK_TIMEOUT_MS) || 5_000;
  const lock = await acquireDirLock(lockDir, {
    timeoutMs,
    // Without this the wait restarts each time the lock changes hands, up to ten times timeoutMs.
    maxWaitMs: timeoutMs,
    retryMs: 50,
    staleMs: 600_000,
    owner: { tool: "web-cv" },
  });
  try {
    return fn();
  } finally {
    releaseOrWarn(lock);
  }
}
