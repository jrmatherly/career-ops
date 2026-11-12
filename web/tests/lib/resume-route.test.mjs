// GET/PUT /api/resume and POST /api/resume/preview, run against the real
// resume.mjs CLI on a scratch data root holding examples/cv-example.md.
//
// Run:  node --experimental-strip-types --test tests/lib/resume-route.test.mjs

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = mkdtempSync(join(tmpdir(), "resume-route-data-"));
const cvPath = join(dataRoot, "cv.md");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PROFILE", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let route;
let preview;

before(async () => {
  copyFileSync(join(codeRoot, "examples", "cv-example.md"), cvPath);
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_PROFILE = "";
  process.env.CAREER_OPS_TRACKER = "";
  route = await import("../../src/app/api/resume/route.ts");
  preview = await import("../../src/app/api/resume/preview/route.ts");
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

const json = (method, body) => new Request("http://localhost/api/resume", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = async () => {
  const res = await route.GET();
  return { status: res.status, body: await res.json() };
};
const put = async (body) => {
  const res = await route.PUT(json("PUT", body));
  return { status: res.status, body: await res.json() };
};
const post = async (body) => {
  const res = await preview.POST(json("POST", body));
  return { status: res.status, body: await res.json() };
};

const EDITED = "Built NLP pipeline for contract classification";
const withEditedBullet = (data) => {
  const next = structuredClone(data);
  const item = next.sections.experience.items[1];
  item.description = item.description.replace("Built NLP pipeline for document classification", EDITED);
  return next;
};

const descriptionOf = (data) => data.sections.experience.items[1].description;

let opened;

test("GET absorbs cv.md and returns the lossless draft with its sha and report", async () => {
  const { status, body } = await get();
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.lossless, true);
  assert.match(body.cvMdSha, /^[0-9a-f]{64}$/);
  assert.equal(body.data.basics.name, "Alex Chen");
  assert.equal(body.report.lossless, true);
  assert.ok(Array.isArray(body.report.newEntries));
  opened = body;
});

test("preview renders the draft, edited bullet included", async () => {
  const { status, body } = await post({ data: withEditedBullet(opened.data) });
  assert.equal(status, 200, JSON.stringify(body));
  assert.match(body.html, /Alex Chen/);
  assert.match(body.html, new RegExp(EDITED));
});

test("preview names the sections the template has no slot for", async () => {
  const data = structuredClone(opened.data);
  data.sections.languages.items.push({ id: "lang-1", hidden: false, language: "Spanish", fluency: "Fluent", level: 0 });
  const { status, body } = await post({ data });
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.unmapped, ["languages"]);
  assert.ok(Array.isArray(body.warnings));
});

test("preview rejects an invalid draft with 400", async () => {
  assert.equal((await post({ data: { ...opened.data, sections: "x" } })).status, 400);
  assert.equal((await post({ data: [] })).status, 400);
});

test("PUT rejects a bad body with 400", async () => {
  assert.equal((await put("not json")).status, 400);
  assert.equal((await put({ data: opened.data, expectedCvSha: "abc" })).status, 400);
  assert.equal((await put({ data: "x", expectedCvSha: opened.cvMdSha })).status, 400);
});

test("PUT with a blank new experience item fails the round-trip gate with 422", async () => {
  const data = structuredClone(opened.data);
  data.sections.experience.items.push({ id: "blank-1", hidden: false, company: "", position: "", location: "", period: "", website: { url: "", label: "", inlineLink: false }, description: "", roles: [] });
  const before = readFileSync(cvPath, "utf8");
  const { status } = await put({ data, expectedCvSha: opened.cvMdSha });
  assert.equal(status, 422);
  assert.equal(readFileSync(cvPath, "utf8"), before);
});

test("PUT with the right sha writes the edit into cv.md; the old sha then conflicts", async () => {
  const saved = await put({ data: withEditedBullet(opened.data), expectedCvSha: opened.cvMdSha });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.match(saved.body.cvMdSha, /^[0-9a-f]{64}$/);
  assert.notEqual(saved.body.cvMdSha, opened.cvMdSha);
  const after = readFileSync(cvPath, "utf8");
  assert.match(after, new RegExp(`- ${EDITED}`));

  const stale = await put({ data: opened.data, expectedCvSha: opened.cvMdSha });
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /cv\.md changed/);
  assert.equal(readFileSync(cvPath, "utf8"), after, "a stale save leaves cv.md alone");

  const reopened = await get();
  assert.equal(reopened.body.lossless, true, "a saved cv.md absorbs back losslessly");
  assert.equal(reopened.body.cvMdSha, saved.body.cvMdSha);
  assert.match(descriptionOf(reopened.body.data), new RegExp(EDITED));
});

test("a custom section with a non-built-in title saves and re-opens losslessly", async () => {
  const { body: current } = await get();
  const data = structuredClone(current.data);
  data.customSections.push({ title: "Additional projects", icon: "", columns: 1, hidden: false, showHeading: true, keepTogether: false, startOnNewPage: false, type: "projects", id: "custom-1", items: [{ id: "cp-1", hidden: false, name: "Side tool", period: "2024", website: { url: "", label: "", inlineLink: false }, description: "" }] });
  const saved = await put({ data, expectedCvSha: current.cvMdSha });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.match(readFileSync(cvPath, "utf8"), /## Additional projects\n\n- \*\*Side tool\*\* \(2024\)/);
  const reopened = await get();
  assert.equal(reopened.body.lossless, true);
  assert.equal(reopened.body.data.customSections.find((s) => s.id === "custom-1")?.items[0]?.name, "Side tool");

  // The editor refuses this before it reaches the CLI (customTitleProblem); the CLI's own gate is the backstop.
  const clash = structuredClone(reopened.body.data);
  clash.customSections.find((s) => s.id === "custom-1").title = "Projects";
  assert.equal((await put({ data: clash, expectedCvSha: reopened.body.cvMdSha })).status, 422);
});

test("GET after a dates line changed on disk is read-only with one orphan", async () => {
  writeFileSync(cvPath, readFileSync(cvPath, "utf8").replace("\n2018-2020\n", "\n2017-2020\n"));
  const { status, body } = await get();
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.lossless, false);
  assert.equal(body.cvMdSha, null);
  assert.equal(body.report.orphans.length, 1);
  assert.equal(body.report.orphans[0].company, "DataStartup Inc");
});

test("GET of a cv.md that never absorbed is read-only with no data", async () => {
  const kept = readFileSync(cvPath, "utf8");
  const sidecar = join(dataRoot, "data", "resume.json");
  const keptSidecar = readFileSync(sidecar, "utf8");
  rmSync(sidecar);
  // The example ends with Skills; a list row there without its bold lead is a line absorb cannot place.
  writeFileSync(cvPath, `${readFileSync(join(codeRoot, "examples", "cv-example.md"), "utf8").trimEnd()}\n- stray bullet without a bold lead\n`);
  try {
    const { status, body } = await get();
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.lossless, false);
    assert.equal(body.data, null);
    assert.ok(body.report.unparsed.length > 0, JSON.stringify(body.report));
  } finally {
    writeFileSync(cvPath, kept);
    writeFileSync(sidecar, keptSidecar);
  }
});

test("GET without cv.md is a 404", async () => {
  const kept = readFileSync(cvPath, "utf8");
  rmSync(cvPath);
  try {
    const { status, body } = await get();
    assert.equal(status, 404);
    assert.equal(body.error, "cv.md not found");
  } finally {
    writeFileSync(cvPath, kept);
  }
});

// Read as text: importing nav-items.ts pulls in lucide-react, which the root test job does not install.
test("the nav lists /resume", () => {
  const source = readFileSync(join(codeRoot, "web", "src", "lib", "nav-items.ts"), "utf8");
  const items = source.slice(source.indexOf("NAV_ITEMS"), source.indexOf("];"));
  const entries = [...items.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.ok(entries.includes("/resume Resume"), entries.join(" | "));
});
