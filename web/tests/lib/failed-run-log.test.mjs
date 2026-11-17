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
const masker = await import("../../src/lib/mask-secrets.mjs");
// What the client sends: the saved length plus the context the server masks with.
const SENT = (masker.SAVED_OUTPUT_MAX ?? 8000) + (masker.CUT_SLACK ?? 256);

function saveRun(t, body, setup = (_root) => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "co-failed-run-log-"));
  const previousRoot = process.env.CAREER_OPS_ROOT;
  process.env.CAREER_OPS_ROOT = root;
  setup(root);
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

const fakeKey = "sk-or-v1-FAKE0000fake1111FAKE2222";
const gate = { reason: "agency_confirmation", message: "Confirm the intermediary before continuing.", confirmationRequired: true };

for (const [status, extra] of [["done", { result: { score: 4.2, summary: "Fictional score." } }], ["gated", { gate }], ["error", { error: "This run hit an error before finishing." }]]) {
  test(`key-shaped strings in a ${status} run's step labels and output are masked`, async (t) => {
    const body = { id: `fictional-${status}-leaky`, title: "Fictional evaluation", status, ...extra, steps: [{ kind: "status", label: `using api_key=${fakeKey}` }], output: `fetched with token FAKEtoken0000fake1111\nok` };
    const { res, file } = await saveRun(t, body);
    assert.equal(res.status, 200);
    const md = fs.readFileSync(file, "utf8");
    assert.ok(!md.includes("FAKE0000fake1111FAKE2222"), md);
    assert.ok(!md.includes("FAKEtoken0000fake1111"), md);
    assert.match(md, /- using api_key=sk-\[masked\]/);
    assert.match(md, /fetched with token \[masked\]\nok/);
  });
}

test("output cut at the saved length loses its first line, so a key cut there is not saved", async (t) => {
  const tail = "FAKE0000fake1111FAKE2222tail";
  const rest = "\nsecond line\n";
  const output = ("lead ".repeat(60) + "FAKE0000fa").slice(-(SENT - 8000 + 5)) + tail + rest + "x".repeat(8000 - 5 - tail.length - rest.length);
  assert.equal(output.length, SENT);
  const { res, file } = await saveRun(t, { id: "fictional-cut", status: "done", steps: [], output });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(tail), "the key stub before the first newline is dropped");
  assert.match(md, /## Output\nsecond line\n/);
});

test("a single-line output past the bound keeps every word but the cut first one", async (t) => {
  const output = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");
  assert.ok(output.length > 8000 && !output.includes("\n"));
  const { res, file } = await saveRun(t, { id: "fictional-one-line", status: "done", steps: [], output });
  assert.equal(res.status, 200);
  const saved = fs.readFileSync(file, "utf8").split("## Output\n")[1].trimEnd();
  assert.ok(saved.startsWith("word") && output.endsWith(saved), "a whole-word suffix of the output is saved");
  assert.ok(saved.length > 8000 - 12, `saved ${saved.length} characters`);
});

test("a key cut by the bound in a single-line output is not saved", async (t) => {
  const fakeKey = "sk-or-v1-FAKE0000fake1111FAKE2222";
  const rest = " ordinary words follow".padEnd(8000 - 10, " filler");
  const output = "lead " + fakeKey + rest;
  const { res, file } = await saveRun(t, { id: "fictional-one-line-key", status: "done", steps: [], output });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(fakeKey.slice(-10)), "the key stub left by the cut is dropped");
  assert.match(md, /## Output\nordinary words follow/);
});

test("an unbroken run at the bound is saved as a one-line marker", async (t) => {
  const { res, file } = await saveRun(t, { id: "fictional-unbroken", status: "done", steps: [], output: "FAKEfake".repeat(1200) });
  assert.equal(res.status, 200);
  assert.match(fs.readFileSync(file, "utf8"), /## Output\n\[output omitted: one unbroken 8000-character run\]\n$/);
});

test("every free-text field is capped before masking, so a 256 KB body never reaches the masker whole", async (t) => {
  const huge = "key=".repeat(64 * 1024);
  const body = { id: "fictional-huge", title: huge, page: huge, input: huge, status: "error", error: huge, steps: [{ kind: "status", label: huge }], output: huge };
  const { res, file } = await saveRun(t, body);
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(md.length < 200_000, `saved ${md.length} characters`);
  for (const line of md.split("\n")) assert.ok(line.length <= 2000 + 10, `line of ${line.length} characters`);
  // Each label is one unbroken 256 KB word, and the word a cut lands in is dropped.
  assert.equal((md.match(/^- $/gm) || []).length, 1);
});

test("non-string field values are saved as text, not a 500", async (t) => {
  const body = { id: "fictional-odd", title: { a: 1 }, page: 7, input: ["x"], status: "error", error: 42, steps: [null, 5, { kind: "tool", label: { b: 2 } }], output: 123, result: "nope" };
  const { res, file } = await saveRun(t, body);
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.match(md, /## Error\n+42/);
  assert.match(md, /## Output\n123/);
});

test("a URL password cut by a field's length bound is still masked", async (t) => {
  const password = "p4ssword1234567890TAILTAILTAIL";
  const title = `${"a".repeat(271)} https://u:${password}@example.invalid/x`;
  const { res, file } = await saveRun(t, { id: "fictional-cut-url", title, status: "done", steps: [], output: "" });
  assert.equal(res.status, 200);
  assert.ok(!fs.readFileSync(file, "utf8").includes(password.slice(0, 12)), "the start of the password was saved");
});

test("each field is saved at or under its length, and the last 500 steps are kept", async (t) => {
  const words = "word ".repeat(50_000);
  const body = { id: "fictional-caps", title: words, page: words, input: words, status: "error", error: words, steps: Array.from({ length: 600 }, () => ({ kind: "status", label: "word ".repeat(100) })), output: "" };
  const { res, file } = await saveRun(t, body);
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  const labels = md.match(/^- word.*$/gm) || [];
  assert.equal(labels.length, 500);
  for (const label of labels) assert.ok(label.length <= 302, `step label of ${label.length} characters`);
  assert.ok((md.match(/^# Web run · (.*)$/m)?.[1].length ?? 0) <= 300, "title over 300 characters");
  for (const line of md.split("\n")) assert.ok(line.length <= 2000 + 10, `line of ${line.length} characters`);
});

test("an unbroken output far past the bound is still saved as the whole marker", async (t) => {
  const { res, file } = await saveRun(t, { id: "fictional-unbroken-long", status: "done", steps: [], output: "FAKEfake".repeat(2000) });
  assert.equal(res.status, 200);
  assert.match(fs.readFileSync(file, "utf8"), /## Output\n\[output omitted: one unbroken 8000-character run\]\n$/);
});

test("a label at the start of a single-line output masks its value before the cut drops the label", async (t) => {
  const hex = "0123456789abcdef".repeat(4);
  const output = `api_key: ${hex} ${"word ".repeat(1600)}`.slice(0, 8000);
  const { res, file } = await saveRun(t, { id: "fictional-label-cut", title: "t", status: "done", steps: [], output });
  assert.equal(res.status, 200);
  assert.ok(!fs.readFileSync(file, "utf8").includes(hex), "the key was saved without its label");
});



test("a label the output bound would split is masked with its value first", async (t) => {
  const hex = "0123456789abcdef".repeat(4);
  const kept = `sword: ${hex} ${"word ".repeat(1600)}`.slice(0, 8000);
  const { res, file } = await saveRun(t, { id: "fictional-split-label", title: "t", status: "done", steps: [], output: `lead pas${kept}` });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(hex), "the value of the split label was saved");
  assert.match(md, /\[masked\] word word/);
});

test("a label the output bound would split is masked with its value first when a space precedes the colon", async (t) => {
  const value = "FAKE0000fake1111FAKE";
  const kept = `sword : ${value} ${"word ".repeat(1600)}`.slice(0, 8000);
  const { res, file } = await saveRun(t, { id: "fictional-split-spaced", title: "t", status: "done", steps: [], output: `lead pas${kept}` });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(value), "the value of the split label was saved");
  assert.match(md, /\[masked\] word word/);
});

test("a value the bound separates from its label is masked, because masking comes before the cut", async (t) => {
  const value = "FAKE0000fake1111FAKE2222";
  const after = ` ${value} ${"word ".repeat(1700)}`.slice(0, 8000);
  const { res, file } = await saveRun(t, { id: "fictional-cut-order", status: "error", error: "failed", steps: [], output: `lead api_key:${after}`.slice(-SENT) });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(value.slice(-12)), "the value was saved without its label");
});

test("a secret in the server's environment is masked by value wherever it appears", async (t) => {
  const value = "FAKEnodigitsRUNLOGvalue";
  process.env.FAKE_RUNLOG_API_KEY = value;
  t.after(() => { delete process.env.FAKE_RUNLOG_API_KEY; });
  const { res, file } = await saveRun(t, { id: "fictional-env-value", title: `t ${value}`, status: "error", error: `rejected ${value}`, steps: [{ kind: "status", label: value }], output: `upstream said ${value} is invalid` });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(value), md);
  assert.equal(md.match(/\[masked:FAKE_RUNLOG_API_KEY\]/g)?.length, 4);
});

test("a secret in the data root .env is masked by value", async (t) => {
  const value = "FAKEdotenvNODIGITvalue";
  const { res, file } = await saveRun(t, { id: "fictional-dotenv-value", status: "error", error: "failed", steps: [], output: `the script printed ${value}` }, (root) => fs.writeFileSync(path.join(root, ".env"), `FAKE_DOTENV_TOKEN=${value}`));
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes(value), md);
  assert.match(md, /the script printed \[masked:FAKE_DOTENV_TOKEN\]/);
});

test("a path assigned to PWD is saved as it was", async (t) => {
  const { res, file } = await saveRun(t, { id: "fictional-pwd", status: "error", error: "failed in PWD=/srv/app", steps: [], output: "PWD=/srv/app" });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.match(md, /## Error\n+failed in PWD=\/srv\/app/);
  assert.match(md, /## Output\nPWD=\/srv\/app/);
});

test("a failed run's error does not save an assigned password with no digit", async (t) => {
  const { res, file } = await saveRun(t, { id: "fictional-alpha-password", status: "error", error: "login failed with password=fictionalAlphabeticPassword", steps: [], output: "" });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes("fictionalAlphabeticPassword"));
  assert.match(md, /password=\[masked\]/);
});

test("a split Authorization label takes its scheme and value with it", async (t) => {
  const kept = `ization: Bearer shortvalue ${"word ".repeat(1600)}`.slice(0, 8000);
  const { res, file } = await saveRun(t, { id: "fictional-split-bearer", title: "t", status: "done", steps: [], output: `lead Author${kept}` });
  assert.equal(res.status, 200);
  const md = fs.readFileSync(file, "utf8");
  assert.ok(!md.includes("shortvalue"), "the value after the split label was saved");
  assert.match(md, /## Output\nword word/);
});

