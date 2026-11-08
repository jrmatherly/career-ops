import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "../helpers/web-ts-alias-loader.mjs";

// The evaluate-text body rules and its spawn, through the real request handler with
// a stand-in CLI. The stub records the argv it was given and prints a fixed stdout.
const cliStub = `export const resolveCliOrFallback = (id) => ({ spec: { id: globalThis.__resolvedCliId ?? id }, binPath: "/fixture/never-run" });
export const cliSubstitutionNotice = () => null;
export const cliUnavailableError = () => ({ error: "Fixture CLI unavailable" });`;
const spawnStub = `import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
export function spawnHeadlessCli(bin, args) {
  globalThis.__onSpawn?.(args);
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

const GATE_STDOUT = `Stopping before Block A.
<<evaluation-gate>>
{"status":"needs_confirmation","reason":"dealbreaker","message":"The posting requires on-site work five days a week."}
<</evaluation-gate>>
VERDICT: N/A/5 — dealbreaker
`;

function fixtureRoot(t, prefix = "co-run-route-kinds-") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const saved = { root: process.env.CAREER_OPS_ROOT, code: process.env.CAREER_OPS_CODE_ROOT };
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_CODE_ROOT = root;
  t.after(() => {
    for (const [key, value] of [["CAREER_OPS_ROOT", saved.root], ["CAREER_OPS_CODE_ROOT", saved.code]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete globalThis.__onSpawn;
    delete globalThis.__fakeStdout;
    delete globalThis.__resolvedCliId;
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

test("evaluate-text keeps evaluate's kill budget, leaving persist its 60 s", () => {
  assert.equal(killMsForKind("evaluate-text"), killMsForKind("evaluate"));
  assert.equal(killMsForKind("evaluate-text"), 740_000);
});

test("evaluate-text refuses any CLI but claude", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ cliId: "codex", jdText: "Role." })), /Claude only: cliId must be "claude"/);
});

test("evaluate-text refuses a fallback that swapped claude for another CLI", async (t) => {
  fixtureRoot(t);
  globalThis.__resolvedCliId = "codex";
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "Role." })), /Claude only, and Claude is not available/);
});

test("evaluate-text refuses a missing, empty or non-string jdText", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  for (const jdText of [undefined, "", "   \n", 42]) {
    assert.match(await refusal(await run({ jdText })), /needs jdText/, `jdText=${JSON.stringify(jdText)}`);
  }
});

test("evaluate-text refuses jdText over 16,384 characters", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "x".repeat(16 * 1024 + 1) })), /over the 16384-character limit/);
});

test("evaluate-text refuses a data root its Read denies cannot name exactly", async (t) => {
  fixtureRoot(t, "co run, kinds-");
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "Role." })), /no spaces, commas or glob characters/);
});

test("evaluate-text holds the tracker write token and spawns with its Read denies", async (t) => {
  const root = fixtureRoot(t);
  let spawned;
  globalThis.__onSpawn = (args) => { spawned = { args, writing: isTrackerWriting() }; };
  globalThis.__fakeStdout = GATE_STDOUT;

  // At the cap in characters and three times it in UTF-8 bytes: a CJK posting fits.
  const response = await run({ jdText: "界".repeat(16 * 1024) });
  assert.equal(response.status, 200);
  const events = (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line));

  assert.equal(spawned.writing, true, "the token is held before the CLI starts");
  const deny = spawned.args[spawned.args.indexOf("--disallowedTools") + 1].split(",");
  for (const rule of ["WebFetch", "WebSearch", "Read(//proc/**)", `Read(/${root}/.env)`]) {
    assert.ok(deny.includes(rule), `missing ${rule}`);
  }
  assert.ok(!spawned.args[spawned.args.indexOf("--allowedTools") + 1].includes("WebFetch"));
  assert.ok(events.some((event) => event.type === "gated"), `expected a gated event, got ${JSON.stringify(events)}`);
  assert.equal(fs.existsSync(path.join(root, "reports")), false, "a gated run writes no report");
  assert.equal(isTrackerWriting(), false, "the token is released when the run ends");
});
