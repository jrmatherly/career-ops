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

// Random letters, so no 8-character slice of a long secret occurs in the filler.
const letters = (n, seed) => {
  let x = seed, s = "";
  while (s.length < n) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"[x % 48]; }
  return s;
};
const ENV = {
  FAKE_SWEEP_API_KEY: "KbHtRmWqZsYxNpLvDfGj",
  FAKE_SWEEP_PASSWORD: "jolly fjord wombat gizmo phrase",
  FAKE_SWEEP_LONG_TOKEN: letters(408, 99),
  FAKE_SWEEP_PRIVATE_KEY: `-----BEGIN FAKE PRIVATE KEY-----\n${Array.from({ length: 12 }, (_, i) => letters(64, i + 1)).join("\n")}\n-----END FAKE PRIVATE KEY-----`,
};
const FORMS = [
  { name: "labelled", label: "api_key=", secret: "Qz7Lm2Xv9Rk4Tw8Np3Hs", end: "" },
  { name: "quoted", label: 'password: "', secret: "plum vexed quartz 47", end: '"' },
  { name: "url", label: "https://fakeuser:", secret: "Wq8@Zr5Kt1Yb", end: "@example.invalid/x" },
  { name: "flag", label: "--token ", secret: "Jf6Gd3Vn0Lcx", end: "" },
  { name: "known value", label: "", secret: ENV.FAKE_SWEEP_API_KEY, end: "" },
  { name: "known value with spaces", label: "", secret: ENV.FAKE_SWEEP_PASSWORD, end: "" },
  { name: "known value longer than the slack", label: "", secret: ENV.FAKE_SWEEP_LONG_TOKEN, end: "" },
  { name: "known multi-line value longer than the slack", label: "", secret: ENV.FAKE_SWEEP_PRIVATE_KEY, end: "" },
];
// Every offset near the cut, and for a long secret every 17th offset across the rest of it.
const offsets = (form) => {
  const near = Array.from({ length: 121 }, (_, i) => i - 60);
  return form.secret.length < 60 ? near : [...near, ...Array.from({ length: Math.ceil((form.secret.length - 60) / 17) }, (_, i) => -61 - 17 * i)];
};

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
  Object.assign(process.env, ENV);
});
test.after(() => {
  for (const name of Object.keys(ENV)) delete process.env[name];
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
    // A client still running an older bundle sends only the saved length.
    for (const [sent, cuts] of [[SENT, [full - SAVED, full - SENT]], [SAVED, [full - SAVED]]]) {
      for (const form of FORMS) {
        for (const cut of cuts) {
          for (const d of offsets(form)) {
            const output = plant(form, full, cut + d, multiline).slice(-sent);
            const md = await saved({ output });
            assert.deepEqual(leaks(md, form.secret), [], `${form.name} at ${d} from the cut ${full - cut} from the end, ${sent} sent`);
            runs++;
          }
        }
      }
    }
    assert.equal(runs, 3 * FORMS.reduce((n, form) => n + offsets(form).length, 0));
  });
}

test("no secret survives the length cut of a short field", async () => {
  const fields = [
    ["title", 300, (s) => ({ title: s })], ["page", 200, (s) => ({ page: s })], ["input", 2000, (s) => ({ input: s })], ["error", 1200, (s) => ({ error: s })],
    ["step", 300, (s) => ({ steps: [{ kind: "status", label: s }] })], ["summary", 1200, (s) => ({ result: { score: 3, summary: s } })],
  ];
  for (const [field, max, body] of fields) {
    for (const form of FORMS) {
      for (const d of offsets(form)) {
        const md = await saved(body(plant(form, max + 1000, max + d, false)));
        assert.deepEqual(leaks(md, form.secret), [], `${form.name} in ${field} at ${d} from the cut`);
      }
    }
  }
});

test("no secret survives in an evaluation stop's message", async () => {
  const max = 1200;
  for (const form of FORMS) {
    const room = max - form.secret.length - form.end.length - 1;
    for (const at of [0, Math.floor(room / 2), room]) {
      const message = plant(form, max, at, false);
      assert.ok(message.includes(form.secret + form.end));
      const md = await saved({ status: "gated", gate: { reason: "agency_confirmation", message, confirmationRequired: true } });
      assert.match(md, /## Evaluation stop/);
      assert.deepEqual(leaks(md, form.secret), [], `${form.name} in the message at ${at}`);
    }
  }
});
