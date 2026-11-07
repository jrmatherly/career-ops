// POST /api/resume/check, run against the real resume.mjs CLI on a scratch data root.
//
// Run:  node --experimental-strip-types --test tests/lib/check-route.test.mjs

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";
import { markerTargets } from "../../src/lib/resume-markers.mjs";
import { parseResume } from "../../../lib/resume/schema.mjs";
import { resumeToPayload } from "../../../lib/resume/to-payload.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = mkdtempSync(join(tmpdir(), "resume-check-data-"));
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PROFILE", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const sample = () => JSON.parse(readFileSync(join(codeRoot, "tests", "fixtures", "resume", "sample.json"), "utf8"));

let check;

before(async () => {
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_PROFILE = "";
  process.env.CAREER_OPS_TRACKER = "";
  check = await import("../../src/app/api/resume/check/route.ts");
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

const post = async (body) => {
  const res = await check.POST(new Request("http://localhost/api/resume/check", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

// The schema requires basics.email to be a string, so "missing" is the empty string.
const noEmail = () => {
  const data = sample();
  data.basics.email = "";
  return data;
};

test("a draft with no email scores below 100 with a MISSING_EMAIL finding at basics.email", async () => {
  const { status, body } = await post({ data: noEmail() });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.report.score < 100);
  const f = body.report.findings.find((x) => x.id === "MISSING_EMAIL");
  assert.ok(f, "MISSING_EMAIL reported");
  assert.equal(f.path, "basics.email");
  assert.equal(body.report.ignored.length, 0);
});

test("a key in metadata.check.ignored moves that finding to report.ignored", async () => {
  const key = (await post({ data: noEmail() })).body.report.findings.find((x) => x.id === "MISSING_EMAIL").key;
  const data = noEmail();
  data.metadata.check = { ignored: [key] };
  const { status, body } = await post({ data });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.report.findings.some((x) => x.key === key), false);
  assert.deepEqual(body.report.ignored.map((x) => x.key), [key]);
});

test("a body that is not { data: object } is a 400", async () => {
  for (const body of ["not json", "[]", {}, { data: [] }, { data: "x" }]) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, "body must be { data: object }");
  }
});

test("a draft the CLI rejects is a 400 with the CLI's message", async () => {
  const data = sample();
  delete data.basics.email;
  const { status, body } = await post({ data });
  assert.equal(status, 400);
  assert.match(body.error, /not a valid resume \(basics\.email: /);
  assert.equal((await post({ data: {} })).status, 400);
});

test("markerTargets: own path or longest prefix, else entries under the nearest ancestor down to a section", () => {
  const paths = ["basics", "sections.experience.items.1", "sections.experience.items.10", "sections.experience.items.2.roles.0", "sections.experience.items.2.roles.1", "customSections.0.items.0"];
  assert.deepEqual(markerTargets(paths, "basics.email"), ["basics"]);
  assert.deepEqual(markerTargets(paths, "sections.profiles.items.0.website.url"), ["basics"], "profiles print in the contact row");
  assert.deepEqual(markerTargets(paths, "sections.experience.items.1.period"), ["sections.experience.items.1"]);
  assert.deepEqual(markerTargets(paths, "sections.experience.items.10.period"), ["sections.experience.items.10"]);
  assert.deepEqual(markerTargets(paths, "sections.experience.items.2.period"), ["sections.experience.items.2.roles.0", "sections.experience.items.2.roles.1"]);
  assert.deepEqual(markerTargets(paths, "customSections.0.title"), ["customSections.0.items.0"]);
  assert.deepEqual(markerTargets(paths, "sections.volunteer.columns"), [], "a section with no rendered entries outlines nothing, never every section");
  for (const none of ["summary.content", "metadata.typography.body.fontSize", "picture"]) assert.deepEqual(markerTargets(paths, none), [], none);
});

test("every entry-level finding resolves to a block of the payload the preview renders", async () => {
  const data = sample();
  data.sections.experience.items[0].hidden = true;
  const northwind = data.sections.experience.items[1];
  northwind.period = "";
  northwind.roles[0].period = "sometime";
  data.customSections[0].items[0].period = "2024 - 2020";
  const { body } = await post({ data });
  const entryFindings = body.report.findings.filter((f) => /^(sections|customSections)\.[^.]+\.items\.\d+/.test(f.path));
  assert.ok(entryFindings.some((f) => f.path === "sections.experience.items.1.period"), "the company-level period finding is present");
  assert.ok(entryFindings.some((f) => f.path.includes(".roles.0.")), "a role finding is present");
  assert.ok(entryFindings.some((f) => f.path.startsWith("customSections.0.items.0")), "a custom-section finding is present");
  const { payload } = resumeToPayload(parseResume(data).data);
  const rendered = [payload.candidate.path, ...["experience", "projects", "education", "certifications", "awards", "skills"].flatMap((k) => (payload[k] ?? []).map((e) => e.path))];
  for (const f of entryFindings) assert.ok(markerTargets(rendered, f.path).length > 0, `${f.id} at ${f.path} outlines nothing`);
});
