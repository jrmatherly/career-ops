import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { masterPdfFilename, renderMasterPdf } from "../../src/lib/cv-master-pdf.mjs";
import { spawnGeneratePdf } from "../../src/lib/pdf-render.mjs";

test("masterPdfFilename slugs the name", () => {
  assert.equal(masterPdfFilename("Ada Lovelace"), "ada-lovelace-cv.pdf");
  assert.equal(masterPdfFilename(""), "cv.pdf");
  assert.equal(masterPdfFilename("Zoë  O’Neil"), "zo-o-neil-cv.pdf");
});

const html = async () => ({ ok: true, html: "<html><body>cv</body></html>" });

function recordingSpawnPdf(result = { ok: true, stderr: "" }) {
  const calls = [];
  const spawnPdf = async (args) => {
    calls.push({ ...args, htmlOnDisk: fs.readFileSync(args.html, "utf8") });
    if (result.ok) fs.writeFileSync(args.finalPdf, "%PDF-fake");
    return result;
  };
  return { calls, spawnPdf };
}

test("a lossless absorb renders once into one temp directory and removes it", async () => {
  const { calls, spawnPdf } = recordingSpawnPdf();
  const out = await renderMasterPdf({ lossless: true, renderHtml: html, format: "a4", spawnPdf, spawnFn: () => {}, execPath: "node", coreRoot: "/code" });
  assert.equal(out.ok, true);
  assert.equal(out.pdf.toString(), "%PDF-fake");
  assert.equal(calls.length, 1);
  const [c] = calls;
  assert.match(c.html, /\.html$/);
  assert.match(c.finalPdf, /\.pdf$/);
  assert.equal(path.dirname(c.html), path.dirname(c.finalPdf));
  assert.ok(path.dirname(c.html).startsWith(fs.realpathSync(os.tmpdir())) || path.dirname(c.html).startsWith(os.tmpdir()));
  assert.equal(c.htmlOnDisk, "<html><body>cv</body></html>");
  assert.equal(c.format, "a4");
  assert.equal(c.reportNum, undefined);
  assert.equal(fs.existsSync(path.dirname(c.html)), false, "temp dir removed");
});

test("the render's data root is the temp directory, so generate-pdf writes nothing in the real one", async () => {
  const real = { CAREER_OPS_ROOT: "/real", CAREER_OPS_TRACKER: "/real/data/applications.md", CAREER_OPS_DATA_DIR: "/real", CAREER_OPS_PDF_INDEX: "/real/data/pdf-index.tsv", CAREER_OPS_PDF_SHARED: "1", CAREER_OPS_PDF_SOCKET: "/s", CAREER_OPS_PROFILE: "/real/config/profile.yml", PATH: "/bin" };
  let env;
  let dir;
  const spawnFn = (cmd, args, opts) => { env = opts.env; return { kill() {} }; };
  const spawnPdf = async (args) => {
    dir = path.dirname(args.html);
    args.spawnFn("node", [], { cwd: "/code", env: real });
    fs.writeFileSync(args.finalPdf, "%PDF-fake");
    return { ok: true, stderr: "" };
  };
  await renderMasterPdf({ lossless: true, renderHtml: html, format: "letter", spawnPdf, spawnFn, execPath: "node", coreRoot: "/code" });
  assert.equal(env.CAREER_OPS_ROOT, dir);
  assert.equal(env.PATH, "/bin");
  for (const k of ["CAREER_OPS_TRACKER", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PDF_INDEX", "CAREER_OPS_PDF_SHARED", "CAREER_OPS_PDF_SOCKET", "CAREER_OPS_PROFILE"]) {
    assert.equal(env[k], undefined, `${k} not passed to the render`);
  }
});

test("a lossy absorb never renders", async () => {
  const { calls, spawnPdf } = recordingSpawnPdf();
  let rendered = 0;
  const out = await renderMasterPdf({ lossless: false, renderHtml: async () => { rendered++; return html(); }, format: "letter", spawnPdf, spawnFn: () => {}, execPath: "node", coreRoot: "/code" });
  assert.deepEqual(out, { ok: false, status: 409, error: "cv.md could not be read cleanly" });
  assert.equal(calls.length, 0);
  assert.equal(rendered, 0);
});

test("an HTML render failure passes through and never spawns", async () => {
  const { calls, spawnPdf } = recordingSpawnPdf();
  const out = await renderMasterPdf({ lossless: true, renderHtml: async () => ({ ok: false, status: 400, error: "invalid payload" }), format: "letter", spawnPdf, spawnFn: () => {}, execPath: "node", coreRoot: "/code" });
  assert.deepEqual(out, { ok: false, status: 400, error: "invalid payload" });
  assert.equal(calls.length, 0);
});

test("a failed PDF render is a 500 and still removes the temp directory", async () => {
  const { calls, spawnPdf } = recordingSpawnPdf({ ok: false, stderr: "❌ boom" });
  const out = await renderMasterPdf({ lossless: true, renderHtml: html, format: "letter", spawnPdf, spawnFn: () => {}, execPath: "node", coreRoot: "/code" });
  assert.equal(out.ok, false);
  assert.equal(out.status, 500);
  assert.match(out.error, /boom/);
  assert.equal(fs.existsSync(path.dirname(calls[0].html)), false);
});

test("a render that outlives the deadline is killed and answers 504", async () => {
  let child;
  const spawnFn = () => {
    child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; setImmediate(() => child.emit("close", null)); };
    return child;
  };
  let dir;
  const out = await renderMasterPdf({
    lossless: true, renderHtml: html, format: "letter", spawnFn, execPath: "node", coreRoot: "/code", timeoutMs: 20,
    spawnPdf: (args) => { dir = path.dirname(args.html); return spawnGeneratePdf(args); },
  });
  assert.equal(child.killed, true);
  assert.deepEqual(out, { ok: false, status: 504, error: "PDF rendering timed out" });
  assert.equal(fs.existsSync(dir), false);
});
