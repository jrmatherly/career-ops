// web/tests/lib/run-route-attended-read-denies.test.mjs. An attended network run on Claude carries the Read denies.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "../helpers/web-ts-alias-loader.mjs";

// The evaluate-text body rules and its spawn, through the real request handler with
// a stand-in CLI. The stub records the argv it was given and prints a fixed stdout.
const cliStub = `export const resolveCliOrFallback = (id) => globalThis.__cliUnavailable ? null : ({ spec: { id: globalThis.__resolvedCliId ?? id }, binPath: "/fixture/never-run" });
export const cliSubstitutionNotice = () => null;
export const cliUnavailableError = () => ({ error: "Fixture CLI unavailable" });`;
const spawnStub = `import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
export function spawnHeadlessCli(bin, args) {
  globalThis.__onSpawn?.(args);
  if (globalThis.__spawnThrows) throw new Error("fixture fencing refused the argv");
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = null;
  child.pid = 0;
  child.kill = () => true;
  setTimeout(() => {
    child.stdout.write(globalThis.__fakeStdout ?? "");
    child.stdout.end();
    child.stderr.end();
    setTimeout(() => child.emit("close", 0, null), 20);
  }, 5);
  return child;
}`;
register(`data:text/javascript,${encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    const stubs = ${JSON.stringify({ "@/lib/clis": cliStub, "@/lib/spawn-cli.mjs": spawnStub })};
    if (Object.hasOwn(stubs, specifier)) return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);
const { POST } = await import("../../src/app/api/run/route.ts");
const { isTrackerWriting } = await import("../../src/lib/core/run-registry.ts");
const { killMsForKind } = await import("../../src/lib/run-cli-support.mjs");
const { KNOWN_KINDS } = await import("../../src/lib/worker-capabilities.mjs");

const GATE_STDOUT = `Stopping before Block A.
<<evaluation-gate>>
{"status":"needs_confirmation","reason":"dealbreaker","message":"The posting requires on-site work five days a week."}
<</evaluation-gate>>
VERDICT: N/A/5 — dealbreaker
`;

const CHECKOUT = path.resolve(import.meta.dirname, "../../..");

// codeRoot "checkout" runs the real modes and persist scripts against the fixture data root.
function fixtureRoot(t, prefix = "co-run-route-kinds-", { codeRoot } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const saved = { root: process.env.CAREER_OPS_ROOT, code: process.env.CAREER_OPS_CODE_ROOT };
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_CODE_ROOT = codeRoot === "checkout" ? CHECKOUT : root;
  t.after(() => {
    for (const [key, value] of [["CAREER_OPS_ROOT", saved.root], ["CAREER_OPS_CODE_ROOT", saved.code]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete globalThis.__onSpawn;
    delete globalThis.__fakeStdout;
    delete globalThis.__resolvedCliId;
    delete globalThis.__cliUnavailable;
    delete globalThis.__spawnThrows;
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, "modes"));
  fs.writeFileSync(path.join(root, "modes/oferta.md"), "# Fictional evaluation mode\n");
  fs.writeFileSync(path.join(root, "cv.md"), "# Fictional candidate\n");
  return root;
}

function run(body) {
  return POST(new Request("http://fixture.invalid/api/run", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "evaluate-text", input: "https://jobs.example.test/1", cliId: "claude", ...body }),
  }));
}

async function refusal(response) {
  assert.equal(response.status, 400);
  return (await response.json()).error;
}

async function events(response) {
  assert.equal(response.status, 200);
  return (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const argValue = (args, flag) => args[args.indexOf(flag) + 1];
// Past the data-root check a run needs a POSIX root; a Windows temp dir answers 400 there.
const POSIX_ROOT = { skip: process.platform === "win32" && "the Read denies need a POSIX data root, so Windows answers 400" };

test("an attended URL evaluate on Claude carries the Read denies", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t);
  let args;
  globalThis.__onSpawn = (a) => { args = a; };
  await events(await run({ kind: "evaluate", input: "https://jobs.example.test/1", jdText: undefined }));
  const denied = argValue(args, "--disallowedTools");
  assert.ok(denied.includes("Read(//proc/**)"), denied);
  assert.ok(denied.includes(`Read(/${root}/.env)`), denied);
  const settings = JSON.parse(argValue(args, "--settings"));
  assert.equal(settings.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.ok(settings.permissions.deny.includes("Read(./.env*)"), settings.permissions.deny);
  assert.equal(argValue(args, "--add-dir"), root);
});

test("an attended evaluate whose data root is not deny-safe still runs, with the read block and no absolute denies", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t, "co run route spaced ");
  let args;
  globalThis.__onSpawn = (a) => { args = a; };
  await events(await run({ kind: "evaluate", input: "https://jobs.example.test/1", jdText: undefined }));
  assert.equal(argValue(args, "--disallowedTools").includes("Read("), false);
  assert.equal(JSON.parse(argValue(args, "--settings")).permissions.blockReadsOutsideWorkingDirectories, true);
  assert.equal(argValue(args, "--add-dir"), root);
});

test("an attended fix-portal on Claude keeps Bash and carries the read block and the Read denies", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t, "co-run-route-fix-portal-", { codeRoot: "checkout" });
  let args;
  globalThis.__onSpawn = (a) => { args = a; };
  await events(await run({ kind: "fix-portal", input: "Fictional Co" }));
  const denied = argValue(args, "--disallowedTools");
  assert.ok(denied.includes(`Read(/${root}/.env)`), denied);
  assert.equal(denied.split(",").includes("Bash"), false, denied);
  const settings = JSON.parse(argValue(args, "--settings"));
  assert.equal(settings.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.equal(argValue(args, "--add-dir"), CHECKOUT);
});
