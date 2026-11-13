import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveCodeRoot } from "./core/code-root.mjs";

/**
 * Runs `fn` holding the lock `resume.mjs` save, adopt and import hold while they write
 * cv.md (`withResumeLock` in lib/resume/model.mjs), so a check of cv.md and the write that
 * follows it cannot straddle one of theirs. `fn` must be synchronous. The core owns the lock
 * path; a root with no core scripts has no other writer, so `fn` runs unlocked there.
 *
 * @throws the core's DirLockTimeoutError when another writer holds the lock past the wait
 */
export async function withResumeLock<T>(root: string, fn: () => T): Promise<T> {
  const file = path.join(resolveCodeRoot(process.cwd(), process.env), "lib", "resume", "model.mjs");
  if (!fs.existsSync(file)) return fn();
  const core = await import(/* webpackIgnore: true */ pathToFileURL(file).href);
  // A request that waits a minute reads as a hang, so the web gives up sooner than the CLI.
  return core.withResumeLock(root, fn, { timeoutMs: Number(process.env.CAREER_OPS_WEB_RESUME_LOCK_TIMEOUT_MS) || 5_000 });
}
