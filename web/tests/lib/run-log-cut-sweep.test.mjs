import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "../helpers/web-ts-alias-loader.mjs";

// Plants a fake secret at every offset around each cut a saved run log makes and
// drives the real save handler, which must never write the secret or any
// 8-character slice of it.
const frameworkAdapter = `data:text/javascript,${encodeURIComponent('export const NextResponse = { json: (body, init) => Response.json(body, init) };')}`;
register(`data:text/javascript,${encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: ${JSON.stringify(frameworkAdapter)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);
const { POST } = await import("../../src/app/api/runs/save/route.ts");
const masker = await import("../../src/lib/mask-secrets.mjs");
const SAVED = masker.SAVED_OUTPUT_MAX ?? 8000;
const SENT = SAVED + (masker.CUT_SLACK ?? 256);

const ENV_SECRET = "KbHtRmWqZsYxNpLvDfGj";
const FORMS = [
  { name: "labelled", label: "api_key=", secret: "Qz7Lm2Xv9Rk4Tw8Np3Hs", end: "" },
  { name: "quoted", label: 'password: "', secret: "plum vexed quartz 47", end: '"' },
  { name: "url", label: "https://fakeuser:", secret: "Wq8@Zr5Kt1Yb", end: "@example.invalid/x" },
  { name: "flag", label: "--token ", secret: "Jf6Gd3Vn0Lcx", end: "" },
  { name: "known value", label: "", secret: ENV_SECRET, end: "" },
];
const OFFSETS = Array.from({ length: 121 }, (_, i) => i - 60);

const slices = (s) => Array.from({ length: s.length - 7 }, (_, i) => s.slice(i, i + 8));
const filler = (n, multiline) => (multiline ? "lorem ipsum dolor\n" : "lorem ").repeat(Math.ceil(n / 6) + 1).slice(0, n);

/** A string of `length` with the form's secret starting at `at`, its label before it. */
function plant(form, length, at, multiline) {
  const before = filler(Math.max(0, at - form.label.length - 1), multiline) + " " + form.label;
  const record = before.slice(-(at)) + form.secret + form.end + " ";
  return (record + filler(length, multiline)).slice(0, length);
}

let root;
test.before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "co-run-log-sweep-"));
  process.env.CAREER_OPS_ROOT = root;
  process.env.FAKE_SWEEP_API_KEY = ENV_SECRET;
});
test.after(() => {
  delete process.env.FAKE_SWEEP_API_KEY;
  fs.rmSync(root, { recursive: true, force: true });
});

async function saved(body) {
  const res = await POST(new Request("http://fixture.invalid/api/runs/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "fictional-sweep", status: "error", error: "failed", steps: [], ...body }) }));
  assert.equal(res.status, 200);
  return fs.readFileSync(path.join(root, ".career-ops-web/runs/fictional-sweep.md"), "utf8");
}

const leaks = (md, secret) => slices(secret).filter((s) => md.includes(s));

for (const multiline of [false, true]) {
  test(`no secret survives a cut of a long ${multiline ? "multi-line" : "single-line"} output`, async () => {
    const full = 20_000;
    let runs = 0;
    for (const form of FORMS) {
      for (const cut of [full - SAVED, full - SENT]) {
        for (const d of OFFSETS) {
          const output = plant(form, full, cut + d, multiline).slice(-SENT);
          const md = await saved({ output });
          assert.deepEqual(leaks(md, form.secret), [], `${form.name} at ${d} from the cut ${full - cut} from the end`);
          runs++;
        }
      }
    }
    assert.equal(runs, FORMS.length * 2 * OFFSETS.length);
  });
}

test("no secret survives the length cut of a short field", async () => {
  const fields = [["title", 300, (s) => ({ title: s })], ["input", 2000, (s) => ({ input: s })], ["error", 1200, (s) => ({ error: s })], ["step", 300, (s) => ({ steps: [{ kind: "status", label: s }] })]];
  for (const [field, max, body] of fields) {
    for (const form of FORMS) {
      for (const d of OFFSETS) {
        const md = await saved(body(plant(form, max + 1000, max + d, false)));
        assert.deepEqual(leaks(md, form.secret), [], `${form.name} in ${field} at ${d} from the cut`);
      }
    }
  }
});
