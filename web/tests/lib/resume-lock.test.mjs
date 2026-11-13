// POST /api/cv (the markdown editor and the upload review) must write cv.md under the lock
// resume.mjs save, adopt and import take. This holds that lock the way the core does and
// drives the real route, so the two cannot drift onto different locks.
//
// Run:  node --experimental-strip-types --test tests/lib/resume-lock.test.mjs

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";
import "../helpers/next-server-stub.mjs";
import { acquireDirLock, releaseOrWarn } from "../../../lib/dir-lock.mjs";
import { resumePath } from "../../../lib/resume/model.mjs";

const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-resume-lock-"));
const cvPath = path.join(dataRoot, "cv.md");
const ENV = { CAREER_OPS_CODE_ROOT: codeRoot, CAREER_OPS_ROOT: dataRoot, CAREER_OPS_DATA_DIR: "", CAREER_OPS_WEB_RESUME_LOCK_TIMEOUT_MS: "" };
const savedEnv = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));

let route;

before(async () => {
  Object.assign(process.env, ENV);
  route = await import("../../src/app/api/cv/route.ts");
});

after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

const save = (content, expected) =>
  route.POST(new Request("http://localhost/api/cv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, expected, backup: false }) }));

const hold = () => {
  fs.mkdirSync(path.dirname(resumePath(dataRoot)), { recursive: true });
  return acquireDirLock(`${resumePath(dataRoot)}.lock`, { timeoutMs: 5_000, retryMs: 10, staleMs: 600_000 });
};

test("a save with nothing else writing replaces cv.md", async () => {
  fs.writeFileSync(cvPath, "# One\n");
  const res = await save("# Two\n", { content: "# One\n", exists: true });
  assert.equal(res.status, 200);
  assert.equal(fs.readFileSync(cvPath, "utf8"), "# Two\n");
});

test("a save waits on the resume lock, and one that landed meanwhile is not overwritten", async () => {
  fs.writeFileSync(cvPath, "# Opened\n");
  const lock = await hold();
  let pending;
  try {
    pending = save("# Markdown edit\n", { content: "# Opened\n", exists: true });
    await sleep(300);
    assert.equal(fs.readFileSync(cvPath, "utf8"), "# Opened\n", "nothing is written while the lock is held");
    fs.writeFileSync(cvPath, "# Structured save\n");
  } finally {
    releaseOrWarn(lock);
  }
  assert.equal((await pending).status, 409);
  assert.equal(fs.readFileSync(cvPath, "utf8"), "# Structured save\n");
});

test("a lock held past the web wait answers 503 and writes nothing", async () => {
  fs.writeFileSync(cvPath, "# Opened\n");
  process.env.CAREER_OPS_WEB_RESUME_LOCK_TIMEOUT_MS = "200";
  const lock = await hold();
  try {
    const res = await save("# Markdown edit\n", { content: "# Opened\n", exists: true });
    assert.equal(res.status, 503);
    assert.equal(fs.readFileSync(cvPath, "utf8"), "# Opened\n");
  } finally {
    releaseOrWarn(lock);
    process.env.CAREER_OPS_WEB_RESUME_LOCK_TIMEOUT_MS = "";
  }
});
