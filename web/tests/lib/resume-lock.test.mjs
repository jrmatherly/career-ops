// The markdown editor and the upload review save through POST /api/cv, which must take the
// lock resume.mjs save, adopt and import take. This holds that lock the way the core does
// and checks the web helper waits on it, so the two cannot drift onto different locks.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { acquireDirLock, releaseOrWarn } from "../../../lib/dir-lock.mjs";
import { resumePath } from "../../../lib/resume/model.mjs";
import { withResumeLock } from "../../src/lib/resume-lock.ts";

const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-resume-lock-"));
  try {
    await fn(root);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const hold = (root) => {
  fs.mkdirSync(path.dirname(resumePath(root)), { recursive: true });
  return acquireDirLock(`${resumePath(root)}.lock`, { timeoutMs: 5_000, retryMs: 10, staleMs: 600_000 });
};

test("the web write waits while a core save holds the resume lock, then runs", () =>
  withEnv({ CAREER_OPS_CODE_ROOT: CHECKOUT }, async (root) => {
    const lock = await hold(root);
    let ran = false;
    const pending = withResumeLock(root, () => { ran = true; return "written"; });
    try {
      await sleep(300);
      assert.equal(ran, false, "the write has not run while the lock is held");
    } finally {
      releaseOrWarn(lock);
    }
    assert.equal(await pending, "written");
  }));

test("a lock held past the web wait rejects instead of writing", () =>
  withEnv({ CAREER_OPS_CODE_ROOT: CHECKOUT, CAREER_OPS_WEB_RESUME_LOCK_TIMEOUT_MS: "200" }, async (root) => {
    const lock = await hold(root);
    let ran = false;
    try {
      await assert.rejects(withResumeLock(root, () => { ran = true; }), { name: "DirLockTimeoutError" });
      assert.equal(ran, false);
    } finally {
      releaseOrWarn(lock);
    }
  }));

test("a root with no core scripts runs the write unlocked", () =>
  withEnv({ CAREER_OPS_CODE_ROOT: os.tmpdir() }, async (root) => {
    assert.equal(await withResumeLock(root, () => "written"), "written");
  }));
