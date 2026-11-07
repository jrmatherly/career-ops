// POST /api/resume/pair and POST /api/resume/adopt, run against the real
// resume.mjs CLI on a scratch data root holding examples/cv-example.md.
//
// Run:  node --experimental-strip-types --test tests/lib/resume-gate-routes.test.mjs

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = mkdtempSync(join(tmpdir(), "resume-gate-data-"));
const cvPath = join(dataRoot, "cv.md");
const sidecar = join(dataRoot, "data", "resume.json");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PROFILE", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const STRAY = "- stray bullet without a bold lead\n";

let route;
let pair;
let adopt;

before(async () => {
  copyFileSync(join(codeRoot, "examples", "cv-example.md"), cvPath);
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_PROFILE = "";
  process.env.CAREER_OPS_TRACKER = "";
  route = await import("../../src/app/api/resume/route.ts");
  pair = await import("../../src/app/api/resume/pair/route.ts");
  adopt = await import("../../src/app/api/resume/adopt/route.ts");
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

const request = (body) => new Request("http://localhost/api/resume", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const call = async (handler, body) => {
  const res = await handler(body === undefined ? undefined : request(body));
  return { status: res.status, body: await res.json() };
};
const get = () => call(route.GET);
const postPair = (body) => call(pair.POST, body);
const postAdopt = (body) => call(adopt.POST, body);

let orphanId;
let newId;
let inSyncId;

test("a renamed company reads back as one orphan and one new entry", async () => {
  assert.equal((await get()).body.lossless, true);
  writeFileSync(cvPath, readFileSync(cvPath, "utf8").replace("### DataStartup Inc", "### DataStartupCo Inc"));
  const { body } = await get();
  assert.equal(body.lossless, false);
  assert.equal(body.report.orphans.length, 1);
  assert.equal(body.report.newEntries.length, 1);
  orphanId = body.report.orphans[0].id;
  newId = body.report.newEntries[0].id;
  inSyncId = body.data.sections.experience.items.find((e) => e.company === "TechFin Corp").id;
});

test("pair rejects malformed, flag-like, duplicate and unknown ids with 400", async () => {
  for (const body of ["not json", {}, { pairs: [] }, { pairs: [[orphanId]] }, { pairs: [["--confirm", "x"]] }, { pairs: [[orphanId, "-x"]] }, { pairs: [[orphanId, newId], [orphanId, newId]] }, { pairs: [[orphanId, newId], [inSyncId, newId]] }]) {
    assert.equal((await postPair(body)).status, 400, JSON.stringify(body));
  }
  const unknown = await postPair({ pairs: [["nope", newId]] });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body.error, /nope is not a pairable orphan/);
});

test("pair refuses ids the current report does not offer, and writes nothing", async () => {
  const keptSidecar = readFileSync(sidecar, "utf8");
  // An in-sync entry is not an orphan: pairOrphan would move its id onto the new entry.
  for (const [pairs, re] of [[[[inSyncId, newId]], /is not a pairable orphan/], [[[orphanId, orphanId]], /is not a new entry/], [[["experience", newId]], /is not a pairable orphan/]]) {
    const { status, body } = await postPair({ pairs });
    assert.equal(status, 400, JSON.stringify(pairs));
    assert.match(body.error, re);
  }
  const kept = readFileSync(cvPath, "utf8");
  writeFileSync(cvPath, kept.replace("**ML/AI:**", "**ML and AI:**"));
  try {
    const skill = (await get()).body.report.newEntries.find((e) => e.section === "skills");
    assert.ok(skill, "the renamed skill is a new entry");
    const cross = await postPair({ pairs: [[orphanId, skill.id]] });
    assert.equal(cross.status, 400);
    assert.match(cross.body.error, /different kinds/);
  } finally {
    writeFileSync(cvPath, kept);
  }
  assert.equal(readFileSync(sidecar, "utf8"), keptSidecar);
});

test("pair that leaves the gate failing is 422 with the report and writes nothing", async () => {
  const kept = readFileSync(cvPath, "utf8");
  const keptSidecar = readFileSync(sidecar, "utf8");
  writeFileSync(cvPath, kept + STRAY);
  try {
    const { status, body } = await postPair({ pairs: [[orphanId, newId]] });
    assert.equal(status, 422);
    assert.match(body.output, /unparsed line/);
    assert.doesNotMatch(body.output, /node resume\.mjs/);
    assert.equal(readFileSync(sidecar, "utf8"), keptSidecar);
  } finally {
    writeFileSync(cvPath, kept);
  }
});

test("pair keeps the old id and makes cv.md lossless", async () => {
  const { status, body } = await postPair({ pairs: [[orphanId, newId]] });
  assert.equal(status, 200, JSON.stringify(body));
  const reopened = await get();
  assert.equal(reopened.body.lossless, true);
  const entry = reopened.body.data.sections.experience.items.find((e) => e.company === "DataStartupCo Inc");
  assert.equal(entry.id, orphanId);
  assert.equal((await postPair({ pairs: [[orphanId, newId]] })).status, 409, "nothing left to pair");
});

let preview;

test("adopt preview shows the findings and the diff and writes nothing", async () => {
  writeFileSync(cvPath, readFileSync(cvPath, "utf8") + STRAY);
  const cvBefore = readFileSync(cvPath);
  const sidecarBefore = readFileSync(sidecar);
  const { status, body } = await postAdopt({});
  assert.equal(status, 200, JSON.stringify(body));
  assert.match(body.inputsSha, /^[0-9a-f]{64}$/);
  assert.ok(body.diff.startsWith("--- cv.md\n"));
  assert.match(body.diff, /^-- stray bullet without a bold lead$/m);
  assert.doesNotMatch(body.diff, /Nothing written/);
  assert.deepEqual(readFileSync(cvPath), cvBefore);
  assert.deepEqual(readFileSync(sidecar), sidecarBefore);
  assert.equal(existsSync(`${cvPath}.bak`), false);
  preview = body;
});

test("adopt confirm refuses a stale sha and a non-true confirm", async () => {
  const cvBefore = readFileSync(cvPath, "utf8");
  const stale = await postAdopt({ confirm: true, expectedSha: "0".repeat(64) });
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /changed since the diff was shown/);
  assert.equal((await postAdopt({ confirm: "yes", expectedSha: preview.inputsSha })).status, 400);
  assert.equal((await postAdopt({ confirm: true, expectedSha: "abc" })).status, 400);
  assert.equal(readFileSync(cvPath, "utf8"), cvBefore);
  assert.equal(existsSync(`${cvPath}.bak`), false);
});

test("adopt confirm refuses when data/resume.json changed after the preview, with cv.md untouched", async () => {
  const cvBefore = readFileSync(cvPath, "utf8");
  const sidecarBefore = readFileSync(sidecar, "utf8");
  writeFileSync(sidecar, sidecarBefore.replace(/\n?$/, "\n\n"));
  try {
    const moved = await postAdopt({ confirm: true, expectedSha: preview.inputsSha });
    assert.equal(moved.status, 409, JSON.stringify(moved.body));
    assert.equal(readFileSync(cvPath, "utf8"), cvBefore);
    assert.equal(existsSync(`${cvPath}.bak`), false);
  } finally {
    writeFileSync(sidecar, sidecarBefore);
  }
});

test("adopt confirm with the preview's sha replaces cv.md and keeps a backup", async () => {
  const cvBefore = readFileSync(cvPath, "utf8");
  const { status, body } = await postAdopt({ confirm: true, expectedSha: preview.inputsSha });
  assert.equal(status, 200, JSON.stringify(body));
  assert.match(body.message, /^cv\.md replaced/);
  assert.equal(readFileSync(`${cvPath}.bak`, "utf8"), cvBefore);
  assert.doesNotMatch(readFileSync(cvPath, "utf8"), /stray bullet/);
  const written = JSON.parse(readFileSync(sidecar, "utf8"));
  assert.equal(written.careerOps.cvSha256, createHash("sha256").update(readFileSync(cvPath)).digest("hex"), "adopt wrote resume.json for the new cv.md");
  assert.equal((await get()).body.lossless, true);
  assert.equal((await postAdopt({})).body.diff, null);
});

test("adopt works on a cv.md that was never absorbed", async () => {
  rmSync(sidecar);
  writeFileSync(cvPath, readFileSync(cvPath, "utf8") + STRAY);
  const shown = await postAdopt({});
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.ok(shown.body.diff);
  assert.equal(existsSync(sidecar), false, "preview writes no sidecar");
  const done = await postAdopt({ confirm: true, expectedSha: shown.body.inputsSha });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.ok(existsSync(sidecar));
  assert.equal((await get()).body.lossless, true);
});

test("adopt without cv.md is a 404", async () => {
  const kept = readFileSync(cvPath, "utf8");
  rmSync(cvPath);
  try {
    assert.equal((await postAdopt({})).status, 404);
  } finally {
    writeFileSync(cvPath, kept);
  }
});

// Read as text: node --experimental-strip-types cannot load .tsx.
test("the design panel has one field per STYLE_VAR_MAP key", async () => {
  const { STYLE_VAR_MAP } = await import(pathToFileURL(join(codeRoot, "theme-style.mjs")).href);
  const source = readFileSync(join(codeRoot, "web", "src", "components", "resume", "design-panel.tsx"), "utf8");
  const keys = [...source.matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, new Set(keys).size, "no key twice");
  assert.deepEqual(new Set(keys), new Set(Object.keys(STYLE_VAR_MAP)));
});
