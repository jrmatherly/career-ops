// Prints a new disposable, fictional data root for location-hold.browser.test.mjs:
// one ranked inbox row the ledger marks held-location, and one Auto scheduled scan with a hold.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-location-hold-"));
const HELD = "https://example.com/fixture-held";
const NOW = "2026-11-08T15:00:00.000Z";
const JOB = "11111111-1111-4111-8111-111111111111";
fs.mkdirSync(path.join(root, "data"));
fs.writeFileSync(path.join(root, "data/pipeline.md"), `# Fictional inbox

## Pending
- [ ] ${HELD} | Fixture Alpha | Platform Lead | Metropolis, NY | rank: 4.2/5 — fixture
- [ ] https://example.com/fixture-plain | Fixture Beta | Designer | Springfield
`);
fs.writeFileSync(path.join(root, "data/evaluate-queue.tsv"), [
  "url\tat\tjobId\trunId\trank\treason\tstate\tsource",
  `${HELD}\t${NOW}\t${JOB}\trun-1\t4.2\theld-location\tskipped\trank-pass`,
  "",
].join("\n"));
fs.writeFileSync(path.join(root, "data/scheduled-jobs.json"), JSON.stringify({
  jobs: [{
    id: JOB, name: "Fixture hold scan", status: "active", engine: "portals", filtersFrom: "file", sourceGroups: ["weekly"], timezone: "UTC",
    startAt: NOW, nextRunAt: "2099-01-01T00:00:00.000Z", every: 1, unit: "days", createdAt: NOW, updatedAt: NOW,
    filters: { positive: [], negative: [], allow: [], block: [], blockHard: [], alwaysAllow: [], sinceDays: 7, ats: ["greenhouse"], limitPerAts: 150 },
    evaluate: { mode: "auto", enabledAt: "2026-11-01", rankThreshold: 3.5, maxPerRun: 5, hold: { onsiteLocations: ["Springfield"], remoteCountries: ["United States"], homeStates: ["Illinois"] } },
  }],
  runs: [],
  queue: [],
}));
fs.writeFileSync(path.join(root, "cv.md"), "# Fictional browser fixture\n\nNot a real candidate.\n");
console.log(root);
