// renderCv (web/src/lib/cv-render.ts) renders a CV payload through the core
// build-cv-html.mjs the same way the CLI does, then applies the request's
// `style` tokens as the PDF pipeline would. POST /api/cv-render is a thin
// wrapper over it.
//
// Run:  node --test tests/lib/cv-render.test.mjs

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = mkdtempSync(join(tmpdir(), "cv-render-data-"));
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PROFILE", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const payload = {
  lang: "en",
  page_format: "a4",
  candidate: { name: "Jane Smith", email: "jane@example.com", location: "Berlin, Germany" },
  summary: "Platform engineer who ships verification tooling.",
  experience: [{ company: "Example GmbH", role: "Staff Engineer", dates: "2023 - Present", bullets: ["Cut deploy time from 40 minutes to 4."] }],
  education: [{ title: "BSc Computer Science", org: "Example University", year: "2018" }],
  skills: [{ category: "Languages", items: ["Go", "TypeScript"] }],
};

let renderCv;
let POST;

before(async () => {
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_PROFILE = "";
  process.env.CAREER_OPS_TRACKER = "";
  ({ renderCv } = await import("../../src/lib/cv-render.ts"));
  ({ POST } = await import("../../src/app/api/cv-render/route.ts"));
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

test("a valid payload renders HTML carrying the candidate name, deterministically", async () => {
  const first = await renderCv(payload);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.match(first.html, /Jane Smith/);
  assert.deepEqual(first.warnings, []);
  const second = await renderCv(payload);
  assert.equal(second.html, first.html);
});

test("a style value reaches the HTML as its CSS variable", async () => {
  const result = await renderCv(payload, undefined, { line_height: "1.6", text_color: "#223" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.html, /--line-height: 1\.6;/);
  assert.match(result.html, /--text-color: #223;/);
});

test("a template name resolves to that shipped template", async () => {
  const result = await renderCv(payload, "compact");
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.html, /--rail-width/);
  const standard = await renderCv(payload);
  assert.notEqual(result.html, standard.html);
});

test("an unknown template name is a 400 that names it", async () => {
  const result = await renderCv(payload, "no-such-template");
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /no-such-template/);
});

test("an invalid payload is a 400 carrying the validator's issues", async () => {
  const broken = { ...payload, experience: [{ compny: "Example GmbH", role: "Staff Engineer", dates: "2023", bullets: ["x"] }] };
  const result = await renderCv(broken);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.ok(result.issues.some((issue) => issue.includes("compny") && issue.includes("company")), JSON.stringify(result.issues));
});

test("a non-object payload is a 400, not a crash", async () => {
  const result = await renderCv(["not", "a", "payload"]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

const post = (body) => POST(new Request("http://localhost/api/cv-render", { method: "POST", headers: { "content-type": "application/json" }, body }));

test("POST returns the rendered HTML and warnings, and applies a style object", async () => {
  const res = await post(JSON.stringify({ payload, template: "standard", style: { section_gap: "20px" } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.html, /Jane Smith/);
  assert.match(body.html, /--section-gap: 20px;/);
  assert.deepEqual(body.warnings, []);
});

test("POST rejects a non-object body and forwards validator issues with the lib's status", async () => {
  assert.equal((await post("[1,2]")).status, 400);
  const res = await post(JSON.stringify({ payload: { experience: "not an array" } }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.issues.some((issue) => issue.startsWith("experience:")), JSON.stringify(body));
});

test("a CLI warning reaches the response instead of being dropped", async () => {
  const result = await renderCv({ ...payload, extras: ["not a section"] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.warnings.some((w) => w.startsWith("extras:")), JSON.stringify(result.warnings));
});

test("a broken config/profile.yml is a 400 naming the file, not a silent default render", async () => {
  const profile = join(dataRoot, "config", "profile.yml");
  mkdirSync(dirname(profile), { recursive: true });
  writeFileSync(profile, "cv:\n  template: [unclosed\n");
  try {
    const result = await renderCv(payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error, /profile/i);
  } finally {
    rmSync(profile);
  }
});

test("the profile style: block applies and the request's style wins over it", async () => {
  const profile = join(dataRoot, "config", "profile.yml");
  mkdirSync(dirname(profile), { recursive: true });
  writeFileSync(profile, 'style:\n  text_color: "#111"\n  section_gap: "9px"\n');
  try {
    const fromProfile = await renderCv(payload);
    assert.equal(fromProfile.ok, true, JSON.stringify(fromProfile));
    assert.match(fromProfile.html, /--text-color: #111;/);
    const overridden = await renderCv(payload, undefined, { text_color: "#222" });
    assert.equal(overridden.ok, true, JSON.stringify(overridden));
    assert.match(overridden.html, /--text-color: #222;/);
    assert.match(overridden.html, /--section-gap: 9px;/);
    assert.doesNotMatch(overridden.html, /--text-color: #111;/);
  } finally {
    rmSync(profile);
  }
});
