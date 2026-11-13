// The page subtitles, tab names and scan buttons the approved mockups show.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = (file) => readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");

const COPY = {
  "components/explore/explorer-view.tsx": ["Scan public job boards for fresh postings. Free until you evaluate one."],
  "components/scheduled-jobs-view.tsx": ["Scans that run on a schedule and evaluate what they find.", "Run log\n", "New scan\n"],
  "app/portals/page.tsx": ["The company boards the daily scan reads."],
  "app/documents/page.tsx": ["Tailored CVs and cover letters."],
  "components/analytics-view.tsx": ["Progress\n", "Insights\n", "Scan stats\n"],
};
const RETIRED = ["Persistent, automated crawler jobs", "New Scheduled Scan", "Run Logs (", "quietly broken", "Browse your generated", "Search progress", "Search stats", "Scan the public ATS network", "tracked evaluation"];

for (const [file, strings] of Object.entries(COPY)) {
  test(`${file} carries the mockup's copy`, () => {
    const text = src(file);
    for (const s of strings) assert.ok(text.includes(s), `missing: ${JSON.stringify(s)}`);
    for (const s of RETIRED) assert.ok(!text.includes(s), `still says: ${s}`);
  });
}
