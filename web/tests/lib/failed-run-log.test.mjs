import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "../helpers/web-ts-alias-loader.mjs";

// Required core CI installs root dependencies only, without Next. Stub just
// its response adapter; exercise the actual save handler, core paths and files.
const frameworkAdapter = `data:text/javascript,${encodeURIComponent('export const NextResponse = { json: (body, init) => Response.json(body, init) };')}`;
register(`data:text/javascript,${encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: ${JSON.stringify(frameworkAdapter)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);
const { POST } = await import("../../src/app/api/runs/save/route.ts");

function saveRun(t, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "co-failed-run-log-"));
  const previousRoot = process.env.CAREER_OPS_ROOT;
  process.env.CAREER_OPS_ROOT = root;
  t.after(() => { if (previousRoot === undefined) delete process.env.CAREER_OPS_ROOT; else process.env.CAREER_OPS_ROOT = previousRoot; fs.rmSync(root, { recursive: true, force: true }); });
  return POST(new Request("http://fixture.invalid/api/runs/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
    .then((res) => ({ res, file: path.join(root, `.career-ops-web/runs/${body.id}.md`) }));
}

test("a failed run is saved with its status and error message", async (t) => {
  const body = { id: "fictional-failed", title: "Fictional evaluation", status: "error", error: "This run hit an error before finishing.", steps: [{ kind: "tool", label: "WebFetch" }], output: "partial text" };
  const { res, file } = await saveRun(t, body);
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.match(md, /status: error/);
  assert.match(md, /## Error\n+This run hit an error before finishing\./);
  assert.match(md, /partial text/);
});

test("a failed run's saved error and output have key-shaped strings masked", async (t) => {
  const fakeKey = "sk-or-v1-FAKE0000fake1111FAKE2222";
  const body = { id: "fictional-leaky", title: "Fictional evaluation", status: "error", error: `401 Unauthorized: invalid api_key=${fakeKey}`, steps: [], output: `request failed\nAuthorization: Bearer FAKEtoken0000fake1111` };
  const { res, file } = await saveRun(t, body);
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes("FAKE0000fake1111FAKE2222"), md);
  assert.ok(!md.includes("FAKEtoken0000fake1111"), md);
  assert.match(md, /## Error\n+401 Unauthorized: invalid api_key=sk-\[masked\]/);
  assert.match(md, /Authorization: Bearer \[masked\]/);
});

// A dismissed (aborted) run saves no log and shows no error. job-store.tsx is a client component
// node cannot import, so assert that finish() itself returns first when the run was aborted:
// readJobStream turns an aborted read into { status: "error" }, so a guard in the catch alone is not enough.
test("an aborted run saves nothing and reports no error", () => {
  const store = fs.readFileSync(new URL("../../src/components/jobs/job-store.tsx", import.meta.url), "utf8");
  assert.match(store, /const finish = \([^)]*\) => \{\n\s*if \(controller\.signal\.aborted\) return;/);
});
