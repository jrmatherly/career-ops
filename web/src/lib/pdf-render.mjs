/**
 * pdf-render.mjs — render a tailored CV to PDF and mark the tracker (#2172).
 *
 * Plain .mjs (same pattern as pdf-paths.mjs / clean-chips.mjs) so this can be
 * unit-tested with `node --test`, no TypeScript build step. `spawnFn`,
 * `execPath`, and `coreRoot` (the code checkout — the scripts live there, not in the data root) are injected rather than importing node:child_process
 * or career-ops.ts directly, keeping this module free of TypeScript
 * dependencies and letting tests substitute a fake child process.
 *
 * Runs generate-pdf.mjs and mark-pdf-ready.mjs as plain Node child processes
 * — no agent CLI or its sandbox involved — so a browser launch never depends
 * on an interactive sandbox-escalation approval nobody is present to grant in
 * a headless/web-triggered run. The tracker is marked ✅ only after a
 * CONFIRMED successful render, never optimistically.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {Object} PdfRunSignals
 * @property {object|undefined} envelope - parseCvEnvelope's result for this run.
 * @property {string|null} noOutputMessage - The route's verdict on "did the CLI
 *   produce any output at all", or null when it did. That question is about the
 *   transport, not this module, so the route owns the wording and passes it in
 *   rather than both places carrying the same two strings.
 * @property {boolean} sawError - An authoritative structured-stream error (the
 *   CLI's own JSONL `error` event) — never a stderr keyword match, which must
 *   not override a clean exit (#1974).
 * @property {boolean} cleanExit - Exit code 0 (not killed, not non-zero).
 * @property {boolean} hasPaths - The backend resolved its scratch/final paths.
 */

/**
 * Did this pdf run produce a CV worth rendering?
 *
 * Pure, and here rather than in the route, because it is the decision point for
 * the backend pdf pipeline this module implements: nothing is written, rendered or
 * marked unless this says yes, and the route is a transport layer the repo leaves
 * untested by design.
 *
 * The envelope's own error is preferred over the generic message: "never closed"
 * and "emitted no envelope" are different bugs and the user can act on the
 * difference.
 *
 * @param {PdfRunSignals} signals
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function pdfRunOutcome({ envelope, noOutputMessage, sawError, cleanExit, hasPaths }) {
  // A CLI that produced nothing at all is a different failure from one that ran
  // and fell short — usually "not installed" or "not authenticated".
  if (noOutputMessage) return { ok: false, message: noOutputMessage };
  if (envelope?.ok !== true || !cleanExit || sawError || !hasPaths) {
    const why = envelope && envelope.ok === false ? ` (${envelope.error})` : "";
    return {
      ok: false,
      message: `This run didn't produce a tailored CV to render, so no PDF was generated — re-run it to verify.${why}`,
    };
  }
  return { ok: true };
}

/**
 * Persist the CV the agent emitted through its <<cv-html>> envelope (#2185).
 *
 * The agent emits the tailored HTML inline and the backend saves it here. The
 * chosen page format is NOT written to disk: it is already in memory and goes
 * straight to renderAndMarkPdf. A sidecar written and re-read inside one request
 * bought only a fallback branch for a state that could not occur, plus an
 * undeclared ordering dependency between these two functions.
 *
 * The scratch directory is created by resolvePdfPaths earlier in the same
 * request, so this deliberately does not mkdir — a missing directory here means
 * something is wrong upstream and should surface, not be papered over.
 *
 * @param {{pdfPaths: {html: string}, html: string}} args
 * @returns {{ok: true} | {ok: false, error: string}} Never throws: the caller
 *   routes the failure through the same honesty gate as every other pdf failure.
 */
export function writeCvHtml({ pdfPaths, html }) {
  try {
    fs.writeFileSync(pdfPaths.html, html, "utf8");
    return { ok: true };
  } catch (err) {
    // err.path when the platform gives it: a non-fs throw (an oversized-content
    // RangeError, a bad argument type) carries none, and "could not save to
    // undefined" tells the user nothing.
    return { ok: false, error: `Could not save the tailored CV to ${err.path ?? pdfPaths.html}: ${err.message}` };
  }
}

/**
 * Spawn generate-pdf.mjs as a plain child process and resolve once it exits.
 * @param {{spawnFn: Function, execPath: string, coreRoot: string, html: string, finalPdf: string, format: "letter"|"a4", reportNum: string}} args
 * @returns {Promise<{ok: boolean, stderr: string}>}
 */
export function spawnGeneratePdf({ spawnFn, execPath, coreRoot, html, finalPdf, format, reportNum }) {
  return new Promise((resolve) => {
    const child = spawnFn(
      execPath,
      // --allow-reorder: a real cv.md's section order can legitimately diverge
      // from the template's fixed markup order, so this guard would otherwise
      // hard-fail every web-triggered render — same bypass a human already
      // applies manually via the CLI when this diverges.
      [path.join(coreRoot, "generate-pdf.mjs"), html, finalPdf, `--format=${format}`, `--report=${reportNum}`, "--allow-reorder"],
      // windowsHide: see api/doctor/route.ts — a stale inherited console
      // kills every child with 0xC0000142 on Windows; never inherit one.
      {
        cwd: coreRoot,
        windowsHide: true,
        env: { ...process.env, CAREER_OPS_PDF_SHARED: "1" },
      },
    );
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ ok: code === 0, stderr: stderr.trim() }));
    child.on("error", (e) => resolve({ ok: false, stderr: `PDF rendering failed to start: ${e.message}` }));
  });
}

/**
 * Spawn mark-pdf-ready.mjs (--json) and resolve once it exits, parsing its
 * JSON stdout when present (mark-pdf-ready.mjs prints a JSON payload even on
 * a failure exit when --json is passed) so a caller can surface the specific
 * reason (not-found / ambiguous / lock-timeout / ...) rather than raw stderr.
 * `code` is the exit code, or null when the child never started.
 * @param {{spawnFn: Function, execPath: string, coreRoot: string, reportNum: string}} args
 * @returns {Promise<{ok: boolean, code: number | null, data: {error?: string} | null, stderr: string}>}
 */
export function markTrackerReady({ spawnFn, execPath, coreRoot, reportNum }) {
  return new Promise((resolve) => {
    const child = spawnFn(execPath, [path.join(coreRoot, "mark-pdf-ready.mjs"), reportNum, "--json"], { cwd: coreRoot, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      let data = null;
      try { data = JSON.parse(stdout); } catch { /* not JSON, or exited before printing any */ }
      resolve({ ok: code === 0, code, data, stderr: stderr.trim() });
    });
    child.on("error", (e) => resolve({ ok: false, code: null, data: null, stderr: `mark-pdf-ready.mjs failed to start: ${e.message}` }));
  });
}

/**
 * Glob-clean every scratch file for this run rather than the one known filename.
 * The trailing dot in the `cv-web-{N}.` prefix is load-bearing: the
 * `cv-web-{N}-rejected.*` files keepRejectedRender writes to the same
 * directory must survive this sweep, and `cv-web-4.` must not match
 * `cv-web-42.html`.
 * The agent is not told these paths, and on Claude Code holds no write tool — but
 * the BACKEND writes here and generate-pdf.mjs may leave its own intermediates, so
 * matching the run's prefix stays the right sweep. Logs rather than silently
 * swallowing failures, so a systemic permissions problem doesn't grow
 * `.career-ops-web/pdf-tmp/` forever with no trace anywhere.
 * @param {string} scratchDir
 * @param {string} prefix
 * @returns {void}
 */
export function cleanupPdfScratch(scratchDir, prefix) {
  let entries;
  try {
    entries = fs.readdirSync(scratchDir);
  } catch (err) {
    console.error(`pdf scratch cleanup: could not list ${scratchDir}: ${err.message}`);
    return;
  }
  for (const f of entries) {
    if (!f.startsWith(prefix)) continue;
    try {
      fs.rmSync(path.join(scratchDir, f), { force: true });
    } catch (err) {
      console.error(`pdf scratch cleanup: could not remove ${f}: ${err.message}`);
    }
  }
}

/**
 * Keep the rendered HTML beside its PDF. The CV Studio edits that HTML, and
 * the scratch copy is deleted right after the render.
 * @param {{html: string, finalPdf: string}} pdfPaths
 * @param {string[]} warnings
 */
export function keepTailoredHtml(pdfPaths, warnings) {
  try {
    fs.copyFileSync(pdfPaths.html, pdfPaths.finalPdf.replace(/\.pdf$/i, ".html"));
  } catch (err) {
    warnings.push(`PDF rendered, but its HTML was not kept for the CV Studio: ${err.message}`);
  }
}

/**
 * The user-facing reason a render failed. generate-pdf.mjs prints advisories
 * (a voice warning, a page-budget note) before the failure it exits on, and the
 * route caps the message, so the advisory alone filled the cap and the fact
 * gate's claims never reached the UI ("PDF generation failed: Fa"). The fatal
 * text is everything from the first line generate-pdf.mjs marks with ❌, since
 * that error can span lines (Playwright's missing-browser message does). With
 * no marker, the first line naming an error, else the first line: an uncaught
 * throw ends with a bare "Node.js v24" line, not the cause.
 * @param {string} stderr
 * @returns {string}
 */
export function renderFailureMessage(stderr) {
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const marked = lines.findIndex((l) => l.startsWith("❌"));
  const picked = marked >= 0
    ? lines.slice(marked).map((l) => l.replace(/^❌\s*/, ""))
    : [lines.find((l) => /error|failed/i.test(l)) ?? lines[0]];
  return picked.filter(Boolean).join(" ") || "PDF rendering failed.";
}

/**
 * Keep the rejected HTML and the renderer's full stderr beside the scratch
 * file, named outside the `cv-web-{N}.` sweep prefix, so the user can read
 * what the fact gate flagged after the run. Each path is null when that file
 * could not be written, so the caller names only what is really on disk.
 * @param {{html: string}} pdfPaths
 * @param {string} reportNum
 * @param {string} stderr
 * @returns {{html: string | null, stderr: string | null}}
 */
export function keepRejectedRender(pdfPaths, reportNum, stderr) {
  const base = path.join(path.dirname(pdfPaths.html), `cv-web-${reportNum}-rejected`);
  const kept = { html: null, stderr: null };
  try {
    fs.copyFileSync(pdfPaths.html, `${base}.html`);
    kept.html = `${base}.html`;
  } catch (err) {
    console.error(`pdf render: could not keep the rejected HTML for report #${reportNum}: ${err.message}`);
  }
  try {
    fs.writeFileSync(`${base}.stderr.txt`, stderr, "utf8");
    kept.stderr = `${base}.stderr.txt`;
  } catch (err) {
    console.error(`pdf render: could not keep the renderer output for report #${reportNum}: ${err.message}`);
  }
  return kept;
}

/**
 * @typedef {Object} RenderFailedResult
 * @property {"render-failed"} kind
 * @property {string} error
 * @property {{html: string | null, stderr: string | null}} kept - The rejected HTML and the renderer's stderr; a path is null when that file could not be written.
 */
/**
 * @typedef {Object} RenderedResult
 * @property {"rendered"} kind
 * @property {string[]} warnings - Non-fatal issues to surface to the user (e.g. a renderer advisory, or a tracker row that was not marked).
 */
/** @typedef {RenderFailedResult | RenderedResult} RenderResult */

/**
 * Render the tailored HTML to a PDF, then mark the tracker's PDF column
 * ready — only after the render is CONFIRMED successful, never
 * optimistically. Always cleans up scratch files, whether the render
 * succeeds or fails; a failed render first keeps the rejected HTML and the
 * renderer's stderr as `cv-web-{N}-rejected.*` beside it.
 *
 * Call after writeCvHtml for the same pdfPaths — this reads the HTML that
 * function wrote. `format` is passed in rather than read back off disk, so the two
 * no longer share a file and the only coupling left is the HTML itself.
 * @param {{spawnFn: Function, execPath: string, coreRoot: string, pdfPaths: {html: string, finalPdf: string}, format: "letter"|"a4", reportNum: string}} args
 * @returns {Promise<RenderResult>}
 */
export async function renderAndMarkPdf({ spawnFn, execPath, coreRoot, pdfPaths, format, reportNum }) {
  const warnings = [];

  const render = await spawnGeneratePdf({ spawnFn, execPath, coreRoot, html: pdfPaths.html, finalPdf: pdfPaths.finalPdf, format, reportNum });
  if (render.ok) keepTailoredHtml(pdfPaths, warnings);
  const kept = render.ok ? null : keepRejectedRender(pdfPaths, reportNum, render.stderr);
  cleanupPdfScratch(path.dirname(pdfPaths.html), `cv-web-${reportNum}.`);

  if (!render.ok) {
    // Path first: the fact gate's claim list can run past the route's cap, and
    // the path is what lets the user read the rest.
    const where = kept.html
      ? `Rejected CV kept at ${kept.html}${kept.stderr ? " (full renderer output beside it as .stderr.txt)" : ""}. `
      : "The rejected CV could not be kept (see the server log). ";
    return { kind: "render-failed", error: where + renderFailureMessage(render.stderr), kept };
  }

  // A render that exits 0 can still have written advisories to stderr, and two
  // of them matter to whoever asked for this PDF: the page-budget overflow
  // (warning-only unless --strict-pages) and the CV fact check's advisory
  // phrases. Reading render.stderr only in the failure branch above collected
  // both and dropped them, so on the web path an unsupported claim the fact
  // gate flagged reached nobody. One warning per line, blank lines skipped, so
  // a clean render still reports none.
  for (const line of render.stderr.split("\n")) {
    const text = line.trim();
    if (text) warnings.push(text);
  }

  // The PDF is the real deliverable and it already rendered successfully — a
  // tracker-sync miss (e.g. the row was edited away mid-flight) doesn't fail
  // the whole job, but it must still be visible to whoever is watching this
  // run, not just a server-side log nobody sees.
  const mark = await markTrackerReady({ spawnFn, execPath, coreRoot, reportNum });
  if (!mark.ok) {
    console.error(`mark-pdf-ready.mjs failed for report #${reportNum}: ${mark.data?.error ?? mark.stderr}`);
    warnings.push(
      mark.data?.error
        ? `PDF rendered, but the tracker wasn't updated: ${mark.data.error}`
        : `PDF rendered, but the tracker's PDF column wasn't updated automatically — run \`node mark-pdf-ready.mjs ${reportNum}\` manually.`,
    );
  }

  return { kind: "rendered", warnings };
}
