import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { chooseFittingTemplate, countCvPages } from "../../src/lib/cv-fit.mjs";
import { readPageBudget } from "../../src/lib/core/page-budget.mjs";
import { fileURLToPath } from "node:url";
import { toolRequired } from "../../../tests/required-tools.mjs";

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function recorder(pagesByTemplate) {
  const builds = [];
  const counted = [];
  return {
    builds,
    counted,
    build: async (template) => { builds.push(template); return `<html>${template}</html>`; },
    countPages: async (html) => { counted.push(html); return pagesByTemplate[html.slice(6, -7)]; },
  };
}

test("a CV within the limit is built once", async () => {
  const r = recorder({ base: 2 });
  const chosen = await chooseFittingTemplate({ template: "base", denseTemplate: "dense", maxPages: 2, build: r.build, countPages: r.countPages });
  assert.deepEqual(r.builds, ["base"]);
  assert.equal(chosen.template, "base");
  assert.equal(chosen.html, "<html>base</html>");
  assert.equal(chosen.fallback, null);
});

test("a CV over the limit is rebuilt once in dense", async () => {
  const r = recorder({ base: 3, dense: 2 });
  const chosen = await chooseFittingTemplate({ template: "base", denseTemplate: "dense", maxPages: 2, build: r.build, countPages: r.countPages });
  assert.deepEqual(r.builds, ["base", "dense"]);
  assert.equal(chosen.template, "dense");
  assert.equal(chosen.html, "<html>dense</html>");
  assert.deepEqual(chosen.fallback, { from: "base", pages: 3, densePages: 2 });
});

test("dense as the chosen template is never rebuilt", async () => {
  const r = recorder({ dense: 3 });
  const chosen = await chooseFittingTemplate({ template: "dense", denseTemplate: "dense", maxPages: 2, build: r.build, countPages: r.countPages });
  assert.deepEqual(r.builds, ["dense"]);
  assert.equal(chosen.fallback, null);
});

test("an unmeasurable CV keeps its template and says it was not measured", async () => {
  const r = recorder({ base: null });
  const chosen = await chooseFittingTemplate({ template: "base", denseTemplate: "dense", maxPages: 2, build: r.build, countPages: r.countPages });
  assert.deepEqual(r.builds, ["base"]);
  assert.equal(chosen.template, "base");
  assert.equal(chosen.fallback, null);
  assert.equal(chosen.unmeasured, true);
});

test("a CV over the limit in dense is returned in dense", async () => {
  const r = recorder({ base: 4, dense: 3 });
  const chosen = await chooseFittingTemplate({ template: "base", denseTemplate: "dense", maxPages: 2, build: r.build, countPages: r.countPages });
  assert.deepEqual(r.builds, ["base", "dense"]);
  assert.deepEqual(r.counted, ["<html>base</html>", "<html>dense</html>"]);
  assert.equal(chosen.template, "dense");
  assert.deepEqual(chosen.fallback, { from: "base", pages: 4, densePages: 3 });
});

test("a dense build that cannot be measured is kept with no page count", async () => {
  const r = recorder({ base: 3, dense: null });
  const chosen = await chooseFittingTemplate({ template: "base", denseTemplate: "dense", maxPages: 2, build: r.build, countPages: r.countPages });
  assert.equal(chosen.template, "dense");
  assert.deepEqual(chosen.fallback, { from: "base", pages: 3, densePages: null });
});

test("a dense rebuild that fails keeps the first build and says why", async () => {
  const builds = [];
  const chosen = await chooseFittingTemplate({
    template: "base",
    denseTemplate: "dense",
    maxPages: 2,
    build: async (template) => {
      builds.push(template);
      if (template === "dense") throw new Error("Could not build the tailored CV. boom");
      return "<html>base</html>";
    },
    countPages: async () => 3,
  });
  assert.deepEqual(builds, ["base", "dense"]);
  assert.equal(chosen.template, "base");
  assert.equal(chosen.html, "<html>base</html>");
  assert.equal(chosen.fallback, null);
  assert.match(chosen.fallbackError, /boom/);
});

test("a first build that fails is not retried in dense", async () => {
  const builds = [];
  await assert.rejects(chooseFittingTemplate({
    template: "base",
    denseTemplate: "dense",
    maxPages: 2,
    build: async (template) => { builds.push(template); throw new Error("first failed"); },
    countPages: async () => 3,
  }), /first failed/);
  assert.deepEqual(builds, ["base"]);
});

function fakeSpawn({ stdout = "", stderr = "", exitCode = 0, hang = false } = {}) {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts, htmlExisted: existsSync(args[1]) });
    const child = new EventEmitter();
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.kill = () => { setImmediate(() => child.emit("close", null, "SIGTERM")); return true; };
    if (!hang) {
      setImmediate(() => {
        if (stdout) child.stdout.emit("data", stdout);
        if (stderr) child.stderr.emit("data", stderr);
        child.emit("close", exitCode, null);
      });
    }
    return child;
  };
  return { spawnFn, calls };
}

test("countCvPages reads the page line and leaves no temp directory", async () => {
  const { spawnFn, calls } = fakeSpawn({ stdout: "✅ PDF generated: x\n📊 Pages: 3\n📦 Size: 1 KB\n" });
  const pages = await countCvPages({ html: "<p>cv</p>", format: "a4", coreRoot: "/core", profilePath: "/data/config/profile.yml", spawnFn, execPath: "node" });
  assert.equal(pages, 3);
  assert.equal(calls.length, 1);
  const { args, opts, htmlExisted } = calls[0];
  assert.equal(htmlExisted, true, "the HTML was written before the render");
  assert.equal(args[0], path.join("/core", "generate-pdf.mjs"));
  assert.ok(args.includes("--format=a4"));
  assert.ok(args.includes("--max-pages=99"));
  assert.ok(args.includes("--skip-fact-check"));
  const tempRoot = opts.env.CAREER_OPS_ROOT;
  assert.equal(path.dirname(args[1]), tempRoot, "the HTML sits inside the isolated data root");
  assert.equal(opts.env.CAREER_OPS_PROFILE, "/data/config/profile.yml");
  assert.equal(existsSync(tempRoot), false, "the temp directory is removed");
});

test("countCvPages strips variables that would point the render at the real data root", async () => {
  const saved = process.env.CAREER_OPS_PDF_INDEX;
  process.env.CAREER_OPS_PDF_INDEX = "/data/data/pdf-index.tsv";
  try {
    const { spawnFn, calls } = fakeSpawn({ stdout: "📊 Pages: 1\n" });
    await countCvPages({ html: "<p>cv</p>", format: "letter", coreRoot: "/core", profilePath: "/p.yml", spawnFn, execPath: "node" });
    assert.equal(calls[0].opts.env.CAREER_OPS_PDF_INDEX, undefined);
  } finally {
    if (saved === undefined) delete process.env.CAREER_OPS_PDF_INDEX;
    else process.env.CAREER_OPS_PDF_INDEX = saved;
  }
});

test("countCvPages returns null for a failed render and cleans up", async () => {
  const { spawnFn, calls } = fakeSpawn({ stdout: "📊 Pages: 3\n", exitCode: 1 });
  const pages = await countCvPages({ html: "<p>cv</p>", format: "letter", coreRoot: "/core", profilePath: "/p.yml", spawnFn, execPath: "node" });
  assert.equal(pages, null);
  assert.equal(existsSync(calls[0].opts.env.CAREER_OPS_ROOT), false);
});

test("countCvPages logs the end of the renderer's stderr when it returns null", async (t) => {
  const logged = t.mock.method(console, "warn", () => {});
  const { spawnFn } = fakeSpawn({ stderr: `${"x".repeat(400)}Chromium failed to launch`, exitCode: 1 });
  assert.equal(await countCvPages({ html: "<p>cv</p>", format: "letter", coreRoot: "/core", spawnFn, execPath: "node" }), null);
  assert.equal(logged.mock.callCount(), 1);
  const line = String(logged.mock.calls[0].arguments[0]);
  assert.match(line, /Chromium failed to launch$/);
  assert.ok(line.length < 400, line);
});

test("countCvPages returns null for a render that starts and never ends, and cleans up", async () => {
  const { spawnFn, calls } = fakeSpawn({ hang: true });
  const pages = await countCvPages({ html: "<p>cv</p>", format: "letter", coreRoot: "/core", profilePath: "/p.yml", spawnFn, execPath: "node", timeoutMs: 10 });
  assert.equal(pages, null);
  assert.equal(existsSync(calls[0].opts.env.CAREER_OPS_ROOT), false);
});

test("readPageBudget reads cv.max_pages and defaults to 2", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "page-budget-"));
  const saved = process.env.CAREER_OPS_PROFILE;
  delete process.env.CAREER_OPS_PROFILE;
  try {
    assert.deepEqual(await readPageBudget(CORE, dir), { maxPages: 2 });
    mkdirSync(path.join(dir, "config"));
    writeFileSync(path.join(dir, "config", "profile.yml"), "cv:\n  max_pages: 1\n");
    assert.deepEqual(await readPageBudget(CORE, dir), { maxPages: 1 });
    writeFileSync(path.join(dir, "config", "profile.yml"), "cv:\n  max_pages: two\n");
    assert.deepEqual(await readPageBudget(CORE, dir), { maxPages: 2 });
    assert.deepEqual(await readPageBudget(path.join(dir, "no-core"), dir), { maxPages: 2 });
  } finally {
    if (saved !== undefined) process.env.CAREER_OPS_PROFILE = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

const { chromium } = createRequire(path.join(CORE, "package.json"))("playwright");
const CAN_RENDER = await chromium.launch({ headless: true }).then((b) => b.close().then(() => true), () => false);

test("countCvPages measures a CV whose profile locks a section", { skip: !toolRequired("browser") && !CAN_RENDER && "Chromium cannot launch" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cv-fit-locked-"));
  try {
    mkdirSync(path.join(dir, "config"));
    const profilePath = path.join(dir, "config", "profile.yml");
    writeFileSync(profilePath, "cv:\n  locked_sections: [summary]\n");
    const cvPath = path.join(dir, "cv.md");
    writeFileSync(cvPath, "## Professional Summary\n\nAnalyst who ships the weekly report.\n");
    const payload = {
      lang: "en",
      page_format: "letter",
      candidate: { name: "Jane Doe", title: "Analyst", email: "jane.example", location: "Example City" },
      summary: "Analyst who ships the weekly report.",
      competencies: ["Reporting"],
      experience: [{ company: "Globex", role: "Analyst", location: "Remote", dates: "2020 - 2024", bullets: ["Shipped the weekly report"] }],
      education: [],
      skills: [],
    };
    writeFileSync(path.join(dir, "cv.json"), JSON.stringify(payload));
    const built = spawnSync(process.execPath, [path.join(CORE, "build-cv-html.mjs"), path.join(dir, "cv.json"), path.join(dir, "cv.html")], {
      cwd: CORE, encoding: "utf8", env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_PROFILE: profilePath, CAREER_OPS_DATA_DIR: "", CAREER_OPS_TRACKER: "" },
    });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(dir, "cv.html"), "utf8");
    assert.equal(await countCvPages({ html, format: "letter", coreRoot: CORE, profilePath, cvPath }), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
