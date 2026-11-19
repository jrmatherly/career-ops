import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Variables that would steer generate-pdf.mjs back to the real data root or its
// pdf-index.tsv. The same list as cv-master-pdf.mjs.
const ROOT_ENV = ["CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_TRACKER", "CAREER_OPS_PDF_INDEX", "CAREER_OPS_PDF_SHARED", "CAREER_OPS_PDF_SOCKET", "CAREER_OPS_PROFILE"];

/**
 * Pages of a built CV, from an isolated render that indexes nothing.
 *
 * generate-pdf.mjs records every render in its data root's pdf-index.tsv, so the
 * render runs with its data root set to a fresh temp directory, removed before
 * this returns, as renderMasterPdf does. The profile is only read. cv.md is
 * copied in when given, because the render checks the profile's locked sections
 * against it and fails without it.
 *
 * @param {{ html: string, format: "letter"|"a4", coreRoot: string, profilePath?: string, cvPath?: string,
 *   spawnFn?: Function, execPath?: string, timeoutMs?: number }} args
 * @returns {Promise<number | null>} null when it cannot be measured. Never rejects.
 */
export async function countCvPages({ html, format, coreRoot, profilePath, cvPath, spawnFn = spawn, execPath = process.execPath, timeoutMs = 120_000 }) {
  let dir;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), "cv-fit-"));
    const htmlFile = path.join(dir, "cv.html");
    await writeFile(htmlFile, html, "utf8");
    if (cvPath) await copyFile(cvPath, path.join(dir, "cv.md")).catch(() => {});
    const env = { ...process.env };
    for (const key of ROOT_ENV) delete env[key];
    let stderr = "";
    let timedOut = false;
    const stdout = await new Promise((resolve) => {
      const child = spawnFn(execPath, [
        path.join(coreRoot, "generate-pdf.mjs"), htmlFile, path.join(dir, "cv.pdf"),
        `--format=${format}`, "--max-pages=99", "--skip-fact-check", "--allow-reorder",
      ], {
        cwd: coreRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...env, CAREER_OPS_ROOT: dir, ...(profilePath ? { CAREER_OPS_PROFILE: profilePath } : {}) },
      });
      let out = "";
      let killTimer;
      // SIGTERM first so generate-pdf.mjs can close its browser.
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }, timeoutMs);
      const done = (value) => { clearTimeout(timer); clearTimeout(killTimer); resolve(value); };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("close", (code) => done(code === 0 ? out : ""));
      child.on("error", (err) => { stderr += err.message; done(""); });
    });
    const match = /📊 Pages: (\d+)/.exec(stdout);
    if (match) return Number(match[1]);
    console.warn(`cv fit: page count failed: ${timedOut ? "timeout" : stderr.trim().slice(-300) || "no output"}`);
    return null;
  } catch (err) {
    console.warn(`cv fit: page count failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Build in `template`; when that runs over `maxPages`, build once more in
 * `denseTemplate` and count that build once, as `fallback.densePages` (null
 * when it cannot be measured). The dense build is kept even when it still runs
 * over, because type never shrinks below dense. A first build that cannot be
 * measured is kept and marked `unmeasured`.
 *
 * A failing first build rejects. A failing dense build keeps the first build
 * and names the failure in `fallbackError`, so the user still gets a CV.
 *
 * @param {{ template: string, denseTemplate: string|null, maxPages: number,
 *   build: (template: string) => Promise<string>, countPages: (html: string) => Promise<number|null> }} args
 * @returns {Promise<{ template: string, html: string, fallback: null | { from: string, pages: number, densePages: number|null }, fallbackError?: string, unmeasured?: true }>}
 */
export async function chooseFittingTemplate({ template, denseTemplate, maxPages, build, countPages }) {
  const html = await build(template);
  if (!denseTemplate || template === denseTemplate) return { template, html, fallback: null };
  const pages = await countPages(html);
  if (pages === null) return { template, html, fallback: null, unmeasured: true };
  if (pages <= maxPages) return { template, html, fallback: null };
  let denseHtml;
  try {
    denseHtml = await build(denseTemplate);
  } catch (err) {
    return { template, html, fallback: null, fallbackError: err instanceof Error ? err.message : String(err) };
  }
  return { template: denseTemplate, html: denseHtml, fallback: { from: template, pages, densePages: await countPages(denseHtml) } };
}
