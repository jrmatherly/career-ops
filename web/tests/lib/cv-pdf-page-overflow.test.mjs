// A master-CV render that runs past cv.max_pages still succeeds (strict mode
// off), and the person downloading it must be told. The real render needs
// Chromium, so this drives renderMasterPdf with a fake renderer whose stderr is
// the exact line generate-pdf.mjs prints, captured from its own enforcePageBudget.
//
// Run:  node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/cv-pdf-page-overflow.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { enforcePageBudget } from "../../../generate-pdf.mjs";
import { renderMasterPdf } from "../../src/lib/cv-master-pdf.mjs";
import { pageOverflowWarning } from "../../src/lib/cv/page-overflow.mjs";

function rendererWarning(pageCount, maxPages) {
  const lines = [];
  const warn = console.warn;
  console.warn = (msg) => lines.push(msg);
  try {
    enforcePageBudget(pageCount, { maxPages });
  } finally {
    console.warn = warn;
  }
  return lines.join("\n");
}

const html = async () => ({ ok: true, html: "<html><body>cv</body></html>" });
const render = (stderr) =>
  renderMasterPdf({
    lossless: true,
    renderHtml: html,
    format: "letter",
    spawnFn: () => {},
    execPath: "node",
    coreRoot: "/code",
    spawnPdf: async ({ finalPdf }) => {
      fs.writeFileSync(finalPdf, "%PDF-fake");
      return { ok: true, stderr };
    },
  });

test("a successful render that overflowed its page limit carries the renderer's warning", async (t) => {
  t.mock.method(console, "warn", () => {});
  const stderr = ["⚠️  CV fact check warning: unrelated", rendererWarning(3, 2)].join("\n");
  const out = await render(stderr);
  assert.equal(out.ok, true);
  assert.equal(
    out.warning,
    "CV is 3 pages; the allowed maximum is 2 pages. Trim lower-priority bullets, older roles, secondary projects, or the competencies strip, then regenerate.",
  );
});

test("a render within its page limit carries no warning", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal(rendererWarning(2, 2), "", "enforcePageBudget is silent within budget");
  const out = await render("⚠️  CV fact check warning: unrelated");
  assert.equal(out.ok, true);
  assert.equal(out.warning, null);
});

test("a one-page limit is read too", () => {
  assert.match(pageOverflowWarning(rendererWarning(2, 1)), /^CV is 2 pages; the allowed maximum is 1 page\. /);
});
