// A run log is not saved when the data root's .env is there but cannot be read: a key held only there would be saved unmasked.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "../helpers/web-ts-alias-loader.mjs";

// Core CI installs no Next, so only its response adapter is stubbed. The handler is the real one.
const frameworkAdapter = `data:text/javascript,${encodeURIComponent('export const NextResponse = { json: (body, init) => Response.json(body, init) };')}`;
register(`data:text/javascript,${encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: ${JSON.stringify(frameworkAdapter)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);
const { POST } = await import("../../src/app/api/runs/save/route.ts");

// No digit and no key prefix: only its .env entry tells the masker it is a secret.
const SECRET = "plainword" + "inventedvalue";
const BODY = { id: "fictional-run", title: "Fictional evaluation", status: "done", steps: [], output: `connecting with ${SECRET} now\nok` };

async function saveRun(t, setup) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "co-run-log-dotenv-"));
  const previousRoot = process.env.CAREER_OPS_ROOT;
  process.env.CAREER_OPS_ROOT = root;
  const dotenv = path.join(root, ".env");
  const logged = [];
  t.mock.method(console, "error", (line) => logged.push(String(line)));
  t.after(() => {
    if (previousRoot === undefined) delete process.env.CAREER_OPS_ROOT; else process.env.CAREER_OPS_ROOT = previousRoot;
    try { fs.chmodSync(dotenv, 0o600); } catch { /* not a file this test made unreadable */ }
    fs.rmSync(root, { recursive: true, force: true });
  });
  setup(dotenv);
  const res = await POST(new Request("http://fixture.invalid/api/runs/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) }));
  return { res, json: await res.json(), file: path.join(root, `.career-ops-web/runs/${BODY.id}.md`), logged };
}

function assertNotSaved({ res, json, file, logged }, code) {
  assert.equal(res.status, 500);
  assert.match(json.error, /\.env could not be read/);
  assert.equal(fs.existsSync(file), false, "the run log was written");
  assert.ok(logged.some((line) => line.includes(code)), `the error code was not logged: ${logged.join(" | ")}`);
}

test("a readable .env masks its secret in the saved log", async (t) => {
  const { res, file } = await saveRun(t, (dotenv) => fs.writeFileSync(dotenv, `MY_SERVICE_SECRET=${SECRET}\n`));
  assert.equal(res.status, 200);
  assert.ok(!fs.readFileSync(file, "utf8").includes(SECRET));
});

test("with no .env the log is saved", async (t) => {
  const { res, file } = await saveRun(t, () => {});
  assert.equal(res.status, 200);
  assert.ok(fs.existsSync(file));
});

test("a .env that is a directory stops the save", async (t) => {
  assertNotSaved(await saveRun(t, (dotenv) => fs.mkdirSync(dotenv)), "EISDIR");
});

// chmod does not take read access away on Windows, and root reads any file.
test("a .env the server may not read stops the save", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async (t) => {
  assertNotSaved(await saveRun(t, (dotenv) => { fs.writeFileSync(dotenv, `MY_SERVICE_SECRET=${SECRET}\n`); fs.chmodSync(dotenv, 0); }), "EACCES");
});
