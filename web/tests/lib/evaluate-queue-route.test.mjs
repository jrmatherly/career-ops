// GET /api/evaluate-queue answers the ledger dump, or 503 with an error that
// never carries the CLI's stderr (it names absolute paths). Driven for real
// under the @/ loader against a stand-in evaluate-queue.mjs in a temp checkout
// (CAREER_OPS_CODE_ROOT). A timeout and a failed spawn cannot be produced cheaply
// by a real child, so node:child_process.execFile is wrapped, as in
// core-script-routes.test.mjs: each launch is recorded, and a planned outcome
// replaces the launch when one is set.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import childProcess, { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = mkdtempSync(join(tmpdir(), "co-evaluate-queue-code-"));
const dataRoot = mkdtempSync(join(tmpdir(), "co-evaluate-queue-data-"));
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realExecFile = childProcess.execFile;
const launches = [];
let planned = null;
let GET;

const DUMP = [{ key: "https://jobs.example.com/1", url: "https://jobs.example.com/1", state: "queued", reason: "", rank: 4.2, jobId: "job-1", runId: "run-1", failures: 0, final: false, rows: [] }];
const SECRET_PATH = "/home/someone/private/data/evaluate-queue.tsv";

const standIn = (body) => writeFileSync(join(codeRoot, "evaluate-queue.mjs"), body);

async function get() {
  launches.length = 0;
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const res = await GET();
    return { status: res.status, body: await res.json(), skipped: res.headers.get("X-Evaluate-Queue-Skipped"), launches: [...launches], errors };
  } finally {
    console.error = realError;
  }
}

before(async () => {
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_TRACKER = "";
  childProcess.execFile = function recordingExecFile(file, args, options, callback) {
    launches.push({ file, args, options });
    if (!planned) return realExecFile.call(this, file, args, options, callback);
    const { error, stdout = "", stderr = "" } = planned;
    setImmediate(() => callback(error, stdout, stderr));
    return undefined;
  };
  syncBuiltinESMExports();
  ({ GET } = await import("../../src/app/api/evaluate-queue/route.ts"));
});

after(() => {
  childProcess.execFile = realExecFile;
  syncBuiltinESMExports();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(codeRoot, { recursive: true, force: true });
  rmSync(dataRoot, { recursive: true, force: true });
});

test("200 with the dump, launched as dump --json with this Node and windowsHide", async () => {
  planned = null;
  standIn(`console.log(${JSON.stringify(JSON.stringify(DUMP, null, 2))}); console.error("warning: 1 malformed row(s) in data/evaluate-queue.tsv skipped");`);
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, DUMP);
  assert.equal(r.launches.length, 1);
  assert.equal(r.launches[0].file, process.execPath);
  assert.deepEqual(r.launches[0].args, [join(codeRoot, "evaluate-queue.mjs"), "dump", "--json"]);
  assert.equal(r.launches[0].options?.windowsHide, true);
  assert.ok(r.launches[0].options?.maxBuffer >= 64 * 1024 * 1024, "a ledger past execFile's 1 MiB default still answers");
  assert.ok(r.errors.some((line) => line.includes("malformed row")), "a warning on stderr is logged, and the dump still answers");
  assert.equal(r.skipped, "1", "the malformed-row count rides the header, the stderr text does not");
});

test("the real evaluate-queue.mjs: a row added through the CLI comes back from the route", async () => {
  planned = null;
  const repoRoot = join(import.meta.dirname, "..", "..", "..");
  process.env.CAREER_OPS_CODE_ROOT = repoRoot;
  try {
    const url = "https://jobs.example.com/real-1";
    execFileSync(process.execPath, [join(repoRoot, "evaluate-queue.mjs"), "add", "--url", url, "--state", "queued", "--job", "job-1", "--run", "run-1", "--rank", "4.2"], { env: { ...process.env, CAREER_OPS_ROOT: dataRoot }, stdio: ["ignore", "ignore", "inherit"] });
    const r = await get();
    assert.equal(r.status, 200);
    assert.equal(r.launches[0].args[0], join(repoRoot, "evaluate-queue.mjs"));
    const entry = r.body.find((e) => e.url === url);
    assert.equal(entry?.state, "queued");
    assert.equal(entry?.rank, 4.2);
    assert.equal(r.skipped, null);
  } finally {
    process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  }
});

test("an empty ledger answers 200 with []", async () => {
  planned = null;
  standIn('console.log("[]");');
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, []);
  assert.equal(r.skipped, null, "no header without a warning");
});

test("503 without the CLI's stderr when it exits non-zero, fails to spawn, times out or prints no JSON array", async () => {
  standIn('console.log("[]");');
  // A valid array on stdout in the first three, so only the branch under test can produce the 503.
  const cases = {
    "non-zero exit": { error: Object.assign(new Error("exit 1"), { code: 1 }), stdout: "[]", stderr: `Error: EISDIR ${SECRET_PATH}`, logged: /exited 1/ },
    "spawn failure": { error: Object.assign(new Error("spawn"), { code: "ENOENT" }), stdout: "[]", stderr: SECRET_PATH, logged: /failed to run/ },
    "output past maxBuffer": { error: Object.assign(new Error("stdout maxBuffer length exceeded"), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }), stdout: "[", stderr: "", logged: /exceeded runCoreCli's maxBuffer/ },
    timeout: { error: Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" }), stdout: "[]", stderr: SECRET_PATH },
    "unparseable stdout": { error: null, stdout: `not json ${SECRET_PATH}`, logged: /not JSON: / },
    "JSON that is not an array": { error: null, stdout: '{"path":"x"}', logged: /not a JSON array/ },
  };
  for (const [label, outcome] of Object.entries(cases)) {
    planned = outcome;
    const r = await get();
    assert.equal(r.status, 503, label);
    assert.equal(typeof r.body.error, "string", label);
    assert.ok(!JSON.stringify(r.body).includes(SECRET_PATH), `${label}: no path in the answer`);
    assert.ok(r.body.error.includes(label === "timeout" ? "try Refresh" : "server log"), `${label}: the answer names the next step`);
    if (outcome.logged) assert.ok(r.errors.some((line) => outcome.logged.test(line)), `${label}: the cause is logged`);
  }
  planned = null;
});

test("503 core-script-missing when the checkout has no evaluate-queue.mjs", async () => {
  planned = null;
  rmSync(join(codeRoot, "evaluate-queue.mjs"));
  const r = await get();
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "core-script-missing");
  assert.equal(r.launches.length, 0);
});
