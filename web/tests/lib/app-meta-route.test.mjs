// POST /api/app-meta turns request fields into `app-meta.mjs set` argv. Its
// checks are what keep a value from reading as a CLI flag or splitting a TSV
// row, and its error mapping must never echo the absolute paths the CLI prints.
// Driven for real: the handler runs under the @/ loader against a stand-in
// app-meta.mjs in a temp checkout (CAREER_OPS_CODE_ROOT) that records its argv.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = mkdtempSync(join(tmpdir(), "co-app-meta-code-"));
const dataRoot = mkdtempSync(join(tmpdir(), "co-app-meta-data-"));
const argvFile = join(codeRoot, "argv.json");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let POST;

// Exits and prints what the next run should, as set in stand-in.json.
const standIn = (exitCode, stderr = "") => {
  writeFileSync(join(codeRoot, "stand-in.json"), JSON.stringify({ exitCode, stderr }));
  writeFileSync(join(codeRoot, "app-meta.mjs"), `import { readFileSync, writeFileSync } from "node:fs";
const plan = JSON.parse(readFileSync(${JSON.stringify(join(codeRoot, "stand-in.json"))}, "utf8"));
writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));
if (plan.stderr) process.stderr.write(plan.stderr);
process.exit(plan.exitCode);
`);
};

const post = async (body) => {
  rmSync(argvFile, { force: true });
  const res = await POST(new Request("http://127.0.0.1/api/app-meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json(), argv: existsSync(argvFile) ? JSON.parse(readFileSync(argvFile, "utf8")) : null };
};

before(async () => {
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_TRACKER = "";
  ({ POST } = await import("../../src/app/api/app-meta/route.ts"));
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(codeRoot, { recursive: true, force: true });
  rmSync(dataRoot, { recursive: true, force: true });
});

test("a bad request is refused with 400 before anything runs", async () => {
  standIn(0);
  const bad = [
    { n: "0", key: "lane", value: "x" },
    { n: "-1", key: "lane", value: "x" },
    { n: "abc", key: "lane", value: "x" },
    { n: ["12"], key: "lane", value: "x" },
    { n: "12", key: "closed_reason", value: "x" },
    { n: "12", key: "lane", value: "" },
    { n: "12", key: "lane", value: "   " },
    { n: "12", key: "lane", value: "x".repeat(61) },
    { n: "12", key: "lane", value: "--force" },
    { n: "12", key: "tag", value: "a\tb" },
    { n: "12", key: "tag", value: "a\nb" },
  ];
  for (const body of bad) {
    const r = await post(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.argv, null, `app-meta.mjs never runs for ${JSON.stringify(body)}`);
  }
});

test("a valid lane runs app-meta.mjs set with the trimmed value and source web, and nothing else", async () => {
  standIn(0);
  const r = await post({ n: "12", key: "lane", value: "  Onsite loop  " });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, n: "12", key: "lane", value: "Onsite loop" });
  assert.deepEqual(r.argv, ["set", "12", "lane", "Onsite loop", "--source", "web"]);
});

test("CLI failures map to status codes without echoing server paths", async () => {
  standIn(1, "Error: No tracker row #12 in /abs/data/applications.md\n");
  let r = await post({ n: "12", key: "tag", value: "remote" });
  assert.equal(r.status, 404);
  assert.doesNotMatch(JSON.stringify(r.body), /abs/);

  standIn(1, "Error: pipeline lock timeout: /abs/lock held > 8000ms\n");
  r = await post({ n: "12", key: "tag", value: "remote" });
  assert.equal(r.status, 503);
  assert.doesNotMatch(JSON.stringify(r.body), /abs/);

  standIn(1, "Error: something else at /abs/x\n");
  r = await post({ n: "12", key: "tag", value: "remote" });
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: "could not save" });
});

test("a root without the scripts answers 503 core-script-missing", async () => {
  rmSync(join(codeRoot, "app-meta.mjs"), { force: true });
  const r = await post({ n: "12", key: "lane", value: "Onsite" });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "core-script-missing");
});
