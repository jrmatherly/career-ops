// web/tests/lib/attended-read-fence-routes.test.mjs. The assistant and AI search routes run Claude with Read and WebFetch, so they carry the read block.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "../helpers/web-ts-alias-loader.mjs";

const cliStub = `export const resolveCliOrFallback = (id) => ({ spec: { id, name: id, args: (p) => ["-p", p] }, binPath: "/fixture/never-run" });
export const cliSubstitutionNotice = () => null;
export const cliUnavailableError = () => ({ error: "Fixture CLI unavailable" });`;
const spawnStub = `import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
export function spawnHeadlessCli(bin, args) {
  globalThis.__onSpawn?.(args);
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 0;
  child.kill = () => true;
  setTimeout(() => { child.stdout.end(); child.stderr.end(); setTimeout(() => child.emit("close", 0, null), 5); }, 5);
  return child;
}`;
register(`data:text/javascript,${encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    const stubs = ${JSON.stringify({ "@/lib/clis": cliStub, "@/lib/spawn-cli.mjs": spawnStub })};
    if (Object.hasOwn(stubs, specifier)) return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);
const { POST: assistant } = await import("../../src/app/api/assistant/route.ts");
const { POST: exploreAi } = await import("../../src/app/api/explore/ai/route.ts");

function fixtureRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "co-read-fence-")));
  const code = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "co-read-fence-code-")));
  const saved = { root: process.env.CAREER_OPS_ROOT, code: process.env.CAREER_OPS_CODE_ROOT };
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_CODE_ROOT = code;
  t.after(() => {
    for (const [key, value] of [["CAREER_OPS_ROOT", saved.root], ["CAREER_OPS_CODE_ROOT", saved.code]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete globalThis.__onSpawn;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(code, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(code, "modes"));
  fs.writeFileSync(path.join(code, "modes/discover.md"), "# Fictional discover mode\n");
  return { root, code };
}

async function spawnedArgs(handler, body) {
  let args;
  globalThis.__onSpawn = (a) => { args = a; };
  const response = await handler(new Request("http://fixture.invalid/api", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  await response.text();
  return args;
}

const argValue = (args, flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

for (const [name, handler, body] of [
  ["assistant", assistant, { message: "hello", cliId: "claude" }],
  ["explore/ai", exploreAi, { query: "staff engineer roles", cliId: "claude" }],
]) {
  test(`${name} on Claude blocks reads outside the data root and the code checkout`, async (t) => {
    const { code } = fixtureRoot(t);
    const args = await spawnedArgs(handler, body);
    const settings = JSON.parse(argValue(args, "--settings"));
    assert.equal(settings.permissions.blockReadsOutsideWorkingDirectories, true);
    assert.ok(settings.permissions.deny.includes("Read(./.env*)"), settings.permissions.deny);
    assert.equal(argValue(args, "--add-dir"), code);
  });

  test(`${name} on another CLI gets no Claude settings`, async (t) => {
    fixtureRoot(t);
    const args = await spawnedArgs(handler, { ...body, cliId: "gemini" });
    assert.equal(args.includes("--settings"), false);
  });
}
