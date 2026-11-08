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

test("evaluate-text keeps evaluate's kill budget, leaving persist its 60 s", () => {
  assert.equal(killMsForKind("evaluate-text"), killMsForKind("evaluate"));
  assert.equal(killMsForKind("evaluate-text"), 740_000);
});

test("an unknown kind is refused by name before any CLI starts", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  for (const kind of ["evaluate_text", "evaluateText"]) {
    assert.equal(await refusal(await run({ kind, jdText: "Role." })), `Unknown kind "${kind}".`);
  }
});

test("jdText on any kind but evaluate-text is refused, not dropped", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ kind: "evaluate", jdText: "Role." })), /jdText is for kind "evaluate-text" only, not "evaluate"/);
});

test("a kind-scoped field on another kind is refused by field and kind", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  // An explicit null counts as sent.
  for (const kind of KNOWN_KINDS.filter((k) => k !== "evaluate-text")) {
    assert.equal(await refusal(await run({ kind, jdText: null })), `jdText is for kind "evaluate-text" only, not "${kind}".`);
  }
  for (const brief of [{ why: "x" }, null]) {
    for (const kind of KNOWN_KINDS.filter((k) => k !== "cover")) {
      assert.equal(await refusal(await run({ kind, brief, jdText: undefined })), `brief is for kind "cover" only, not "${kind}".`);
    }
  }
  for (const evaluationSections of [["summary"], null]) {
    for (const kind of KNOWN_KINDS.filter((k) => !k.startsWith("evaluate"))) {
      assert.equal(await refusal(await run({ kind, evaluationSections, jdText: undefined })), `evaluationSections is for the evaluate kinds only, not "${kind}".`);
    }
  }
});

test("a cover request with a brief passes the field table and starts the CLI", async (t) => {
  const root = fixtureRoot(t);
  fs.writeFileSync(path.join(root, "modes/cover.md"), "# Fictional cover mode\n");
  fs.mkdirSync(path.join(root, "reports"));
  fs.writeFileSync(path.join(root, "reports/007-fictional-co-2026-11-01.md"), "# Evaluation: Fictional Co — Engineer\n");
  let spawned = false;
  globalThis.__onSpawn = () => { spawned = true; };
  const brief = { why: "Mission.", problem: "Scale.", approach: "Ship.", tone: "direct" };
  await events(await run({ kind: "cover", input: "7", brief, jdText: undefined }));
  assert.ok(spawned, "the cover run reached the CLI");
});

test("an input that is not a non-empty string is refused before any CLI starts", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  for (const kind of KNOWN_KINDS) {
    for (const input of [undefined, "", 0, 123, true, {}, [], "  "]) {
      assert.equal(await refusal(await run({ kind, input, jdText: kind === "evaluate-text" ? "Role." : undefined })), "input must be a non-empty string.", `${kind} input=${JSON.stringify(input)}`);
    }
  }
});

test("a malformed input is refused before the CLI is resolved", async (t) => {
  fixtureRoot(t);
  globalThis.__cliUnavailable = true;
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.equal(await refusal(await run({ kind: "pdf", input: "  ", jdText: undefined })), "input must be a non-empty string.");
  assert.match(await refusal(await run({ input: "https://jobs.example.test/1\n", jdText: "Role." })), /bare http\(s\) URL/);
  assert.match(await refusal(await run({ kind: "evaluate", input: "jobs.example.test/1" })), /bare http\(s\) URL/);
  assert.equal(await refusal(await run({ cliId: 1, jdText: "Role." })), "cliId must be a non-empty string with no padding.");
});

test("a bad posting URL is named before a bad cliId", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  for (const kind of ["evaluate", "evaluate-text"]) {
    assert.match(await refusal(await run({ kind, input: "jobs.example.test/1", cliId: 1, jdText: kind === "evaluate-text" ? "Role." : undefined })), /^The posting URL must be a bare http\(s\) URL/, kind);
  }
});

test("an evaluate input that is not a bare posting URL is refused before any CLI starts", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  for (const kind of ["evaluate", "evaluate-text"]) {
    for (const input of [" https://jobs.example.test/1", "https://jobs.example.test/1 ", "https://jobs.example.test/1\n", "https://jobs.example.test/1\r", "https://jobs.example.test/\t1", "https://jobs.example.test/a b", "https://jobs.example.test/1\u2028", "local: jds/acme.md", " local:x", "local:x\n", "local:x\ty", "local:", "https://", "http://", "jobs.example.test/1", "ftp://jobs.example.test/1"]) {
      assert.match(await refusal(await run({ kind, input, jdText: kind === "evaluate-text" ? "Role." : undefined })), /^The posting URL must be a bare http\(s\) URL/, `${kind} input=${JSON.stringify(input)}`);
    }
  }
  assert.equal(await refusal(await run({ input: "local:jds/acme.md", jdText: "Role." })), "The posting URL must be a bare http(s) URL with no whitespace in it.");
});

test("evaluate keeps the local: inbox rows and a bare URL", async (t) => {
  fixtureRoot(t);
  let spawns = 0;
  globalThis.__onSpawn = () => { spawns += 1; };
  for (const input of ["local:jds/acme.md", "local:jds/Acme Corp-x.md", "HTTPS://jobs.example.test/1"]) {
    await events(await run({ kind: "evaluate", input, jdText: undefined }));
  }
  assert.equal(spawns, 3);
});

test("evaluate-text takes an uppercase scheme", POSIX_ROOT, async (t) => {
  fixtureRoot(t);
  let spawned = false;
  globalThis.__onSpawn = () => { spawned = true; };
  await events(await run({ input: "HTTPS://jobs.example.test/1", jdText: "Role." }));
  assert.ok(spawned, "the evaluate-text run reached the CLI");
});

test("a cliId that is not a non-empty string is refused before the CLI is resolved", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  for (const kind of ["evaluate", "pdf"]) {
    for (const cliId of [undefined, null, "", "  ", " claude ", "claude\n", 1, {}, true]) {
      assert.equal(await refusal(await run({ kind, input: kind === "pdf" ? "7" : "https://jobs.example.test/1", cliId, jdText: undefined })), "cliId must be a non-empty string with no padding.", `${kind} cliId=${JSON.stringify(cliId)}`);
    }
  }
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

test("evaluate-text refuses jdText with a NUL byte, which argv cannot carry", POSIX_ROOT, async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "Role.\0" })), /NUL byte/);
});

for (const [name, char] of [["space", " "], ["comma", ","], ["star", "*"], ["question mark", "?"], ["bracket", "["]]) {
  test(`evaluate-text refuses a data root with a ${name}, which its Read denies cannot name exactly`, POSIX_ROOT, async (t) => {
    fixtureRoot(t, `co-run${char}kinds-`);
    globalThis.__onSpawn = () => assert.fail("no CLI may start");
    const error = await refusal(await run({ jdText: "Role." }));
    assert.match(error, /letters, digits, \. _ - and \/ only/);
    assert.match(error, /Point CAREER_OPS_ROOT at such a path/);
  });
}

test("evaluate-text refuses a data root it cannot resolve", async (t) => {
  const root = fixtureRoot(t);
  process.env.CAREER_OPS_ROOT = path.join(root, "missing");
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  const logged = t.mock.method(console, "error", () => {});
  assert.match(await refusal(await run({ jdText: "Role." })), /could not resolve the data root .*missing \(ENOENT\)/);
  assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes("ENOENT")), "the error code is logged");
});

test("evaluate-text needs a CV to score against", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t);
  fs.rmSync(path.join(root, "cv.md"));
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "Role." })), /Add your CV first/);
});

test("evaluate-text needs the evaluation mode file", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t);
  fs.rmSync(path.join(root, "modes/oferta.md"));
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "Role." })), /needs a complete career-ops checkout \(modes\/oferta\.md\)/);
});

test("evaluate-text refuses invalid evaluation sections", async (t) => {
  fixtureRoot(t);
  globalThis.__onSpawn = () => assert.fail("no CLI may start");
  assert.match(await refusal(await run({ jdText: "Role.", evaluationSections: ["no-such-section"] })), /Choose valid evaluation sections/);
});

test("evaluate-text runs a user-selected evaluation when sections are chosen", POSIX_ROOT, async (t) => {
  fixtureRoot(t, undefined, { codeRoot: "checkout" });
  let prompt;
  globalThis.__onSpawn = (args) => { prompt = argValue(args, "-p"); };
  globalThis.__fakeStdout = GATE_STDOUT;
  await events(await run({ jdText: "Role.", evaluationSections: ["summary"] }));
  assert.match(prompt, /USER-SELECTED career-ops job evaluation/);
  assert.match(prompt, /<<posting-text>>\nRole\.\n<<\/posting-text>>/);
});

test("evaluate-text spawns with its Read denies and no network tool", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t);
  let args;
  globalThis.__onSpawn = (spawnArgs) => { args = spawnArgs; };
  globalThis.__fakeStdout = GATE_STDOUT;
  // At the cap in characters and three times it in UTF-8 bytes: a CJK posting fits.
  await events(await run({ jdText: "界".repeat(16 * 1024) }));

  const deny = argValue(args, "--disallowedTools").split(",");
  for (const rule of ["WebFetch", "WebSearch", "Read(//proc/**)", `Read(/${root}/.env)`]) {
    assert.ok(deny.includes(rule), `missing ${rule}`);
  }
  assert.ok(!argValue(args, "--allowedTools").includes("WebFetch"));
});

test("evaluate-text denies the real path behind a symlinked data root", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t);
  const link = path.join(os.tmpdir(), `co-run-route-kinds-link-${process.pid}`);
  fs.rmSync(link, { force: true });
  fs.symlinkSync(root, link);
  t.after(() => fs.rmSync(link, { force: true }));
  process.env.CAREER_OPS_ROOT = link;
  let args;
  globalThis.__onSpawn = (spawnArgs) => { args = spawnArgs; };
  globalThis.__fakeStdout = GATE_STDOUT;
  await events(await run({ jdText: "Role." }));

  const deny = argValue(args, "--disallowedTools").split(",");
  assert.ok(deny.includes(`Read(/${root}/data/contacts.tsv)`), `expected the real path in ${deny.join(",")}`);
  assert.ok(!deny.some((rule) => rule.includes(link)), "no rule names the symlink");
});

test("evaluate-text holds the tracker write token and writes nothing on a gated run", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t);
  let writing;
  globalThis.__onSpawn = () => { writing = isTrackerWriting(); };
  globalThis.__fakeStdout = GATE_STDOUT;
  const stream = await events(await run({ jdText: "Role." }));

  assert.equal(writing, true, "the token is held before the CLI starts");
  assert.ok(stream.some((event) => event.type === "gated"), `expected a gated event, got ${JSON.stringify(stream)}`);
  assert.equal(fs.existsSync(path.join(root, "reports")), false, "a gated run writes no report");
  assert.equal(isTrackerWriting(), false, "the token is released when the run ends");
});

test("evaluate-text persists the report, completes the inbox row and writes the tracker row", POSIX_ROOT, async (t) => {
  const root = fixtureRoot(t, undefined, { codeRoot: "checkout" });
  const url = "https://jobs.example.test/1";
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data/pipeline.md"), `## Pending\n- [ ] ${url} | Fictional Co | Platform Engineer\n`);
  fs.writeFileSync(path.join(root, "data/scan-history.tsv"), `url\tfirst_seen\n${url}\t2026-11-01\n`);
  fs.writeFileSync(path.join(root, "data/applications.md"), "# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n");
  globalThis.__fakeStdout = `<<report-md>>
# Evaluation: Fictional Co — Platform Engineer

**Verification:** unconfirmed (auto mode, no web research)

## Machine Summary
\`\`\`yaml
company: "Fictional Co"
role: "Platform Engineer"
score: 4.1
via: null
\`\`\`

## A) Role Summary
A fictional role.
<</report-md>>
VERDICT: 4.1/5
`;
  const stream = await events(await run({ input: url, jdText: "Platform Engineer at Fictional Co." }));
  assert.ok(!stream.some((event) => event.type === "error"), `run failed: ${JSON.stringify(stream)}`);

  const reports = fs.readdirSync(path.join(root, "reports")).filter((file) => file.endsWith(".md"));
  assert.equal(reports.length, 1, `expected one report, got ${reports}`);
  const report = fs.readFileSync(path.join(root, "reports", reports[0]), "utf8");
  assert.match(report, /\*\*Verification:\*\* unconfirmed \(auto mode, no web research\)/);
  assert.match(fs.readFileSync(path.join(root, "data/pipeline.md"), "utf8"), /- \[x\] https:\/\/jobs\.example\.test\/1 /);
  const tracker = fs.readFileSync(path.join(root, "data/applications.md"), "utf8");
  assert.match(tracker, /\| Fictional Co \| Platform Engineer \|.*posted: 2026-11-01/);
  assert.equal(isTrackerWriting(), false, "the token is released after persist");
});
