import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnGeneratePdf } from "./pdf-render.mjs";

/** @param {string} fullName */
export function masterPdfFilename(fullName) {
  const slug = String(fullName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${slug}-cv.pdf` : "cv.pdf";
}

// Variables that would steer generate-pdf.mjs back to the real data root, its
// pdf-index.tsv, or a shared painter keyed on another root.
const ROOT_ENV = ["CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_TRACKER", "CAREER_OPS_PDF_INDEX", "CAREER_OPS_PDF_SHARED", "CAREER_OPS_PDF_SOCKET", "CAREER_OPS_PROFILE"];

/**
 * Render the master CV to a PDF buffer without leaving anything behind.
 *
 * generate-pdf.mjs refuses paths outside its data root and always records the
 * render in that root's data/pdf-index.tsv, so the render runs with its data
 * root set to a fresh temp directory, which is removed before this returns.
 *
 * @param {{
 *   lossless: boolean,
 *   renderHtml: () => Promise<{ok: true, html: string} | {ok: false, status: number, error: string}>,
 *   format: "letter"|"a4",
 *   spawnFn: Function, execPath: string, coreRoot: string,
 *   spawnPdf?: typeof spawnGeneratePdf, timeoutMs?: number, killGraceMs?: number,
 * }} args
 * @returns {Promise<{ok: true, pdf: Buffer} | {ok: false, status: number, error: string}>} Never rejects.
 */
export async function renderMasterPdf({ lossless, renderHtml, format, spawnFn, execPath, coreRoot, spawnPdf = spawnGeneratePdf, timeoutMs = 120_000, killGraceMs = 5_000 }) {
  if (!lossless) return { ok: false, status: 409, error: "cv.md could not be read cleanly" };
  const rendered = await renderHtml();
  if (!rendered.ok) return rendered;

  let dir;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), "cv-master-pdf-"));
  } catch (err) {
    return { ok: false, status: 500, error: `Could not create a temp directory for the PDF: ${err.message}` };
  }
  let timer;
  let killTimer;
  let timedOut = false;
  try {
    const html = path.join(dir, "cv.html");
    const finalPdf = path.join(dir, "cv.pdf");
    await writeFile(html, rendered.html, "utf8");
    const isolatedSpawn = (cmd, args, opts) => {
      const env = { ...opts.env };
      for (const k of ROOT_ENV) delete env[k];
      const child = spawnFn(cmd, args, { ...opts, windowsHide: true, env: { ...env, CAREER_OPS_ROOT: dir } });
      timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        // A child that ignores SIGTERM would hold the request open.
        killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
      }, timeoutMs);
      return child;
    };
    const r = await spawnPdf({ spawnFn: isolatedSpawn, execPath, coreRoot, html, finalPdf, format });
    if (timedOut) return { ok: false, status: 504, error: "PDF rendering timed out" };
    if (!r.ok) return { ok: false, status: 500, error: `PDF rendering failed: ${r.stderr.slice(-500)}` };
    let pdf;
    try {
      pdf = await readFile(finalPdf);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      return { ok: false, status: 500, error: `PDF rendering exited cleanly but wrote no PDF: ${r.stderr.slice(-500) || "no output"}` };
    }
    // The page-overflow warning arrives here on a successful render.
    if (r.stderr) console.warn(`cv pdf: ${r.stderr}`);
    return { ok: true, pdf };
  } catch (err) {
    return { ok: false, status: 500, error: `PDF rendering failed: ${err.message}` };
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (err) {
      console.error(`cv pdf: could not remove ${dir}: ${err.message}`);
    }
  }
}
