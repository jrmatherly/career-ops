// pipelineSummary().scanDates: the dates on which a scan added roles to the Inbox,
// which the Inbox's Added empty state reads (inbox-sort.mjs addedEmptyState).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import "../helpers/web-ts-alias-loader.mjs";

const skipTs = !process.features?.typescript && "this Node cannot import career-ops.ts (no type stripping)";
const mods = skipTs ? {} : await import("@/lib/career-ops");

test("scanDates keeps dates with an added row, drops filtered-only dates, and reads scan history once", { skip: skipTs }, () => {
  const root = mkdtempSync(join(tmpdir(), "co-scan-added-dates-"));
  const prevRoot = process.env.CAREER_OPS_ROOT;
  const original = fs.readFileSync;
  let scanReads = 0;
  try {
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data/scan-history.tsv"), [
      "url\tfirst_seen\tportal\ttitle\tcompany\tstatus",
      "https://x.test/1\t2026-11-05\tgreenhouse\tEngineer\tAcme\tadded",
      "https://x.test/2\t2026-11-06\tgreenhouse\tEngineer\tAcme\tskipped_title",
      "https://x.test/3\t2026-11-07\tgreenhouse\tEngineer\tAcme\t",
      "https://x.test/4\t2026-11-05\tgreenhouse\tEngineer\tAcme\tadded",
      "https://x.test/5\tnot-a-date\tgreenhouse\tEngineer\tAcme\tadded",
      "",
    ].join("\n"));
    process.env.CAREER_OPS_ROOT = root;
    fs.readFileSync = function (p, ...rest) {
      if (String(p).endsWith("scan-history.tsv")) scanReads++;
      return original.call(this, p, ...rest);
    };
    const summary = mods.pipelineSummary();
    assert.deepEqual([...summary.scanDates].sort(), ["2026-11-05", "2026-11-07"]);
    assert.equal(scanReads, 1, "scan dates and scan-added dates share one read");
    assert.equal(mods.readScanDates().get("https://x.test/2"), "2026-11-06", "a filtered row still dates its URL");
  } finally {
    fs.readFileSync = original;
    if (prevRoot === undefined) delete process.env.CAREER_OPS_ROOT;
    else process.env.CAREER_OPS_ROOT = prevRoot;
    rmSync(root, { recursive: true, force: true });
  }
});
