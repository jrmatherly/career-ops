// Prints a new disposable, fictional data root for location-hold.browser.test.mjs:
// four pending rows (one fit, one elsewhere, and two to review: remote with no country, and no location),
// a ledger row marking one held-location, and one Auto scheduled scan with a hold.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-location-hold-"));
const HELD = "https://example.com/fixture-held";
const NOW = "2026-11-08T15:00:00.000Z";
const JOB = "11111111-1111-4111-8111-111111111111";
fs.mkdirSync(path.join(root, "data"));
// Marks the root as one the inbox routes may write to, as inbox-undo.mjs does.
fs.writeFileSync(path.join(root, ".inbox-undo-fixture"), "fictional-only\n");
for (const file of ["pipeline-lock.mjs", "lib/dir-lock.mjs"]) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.copyFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), path.join(root, file));
}
fs.writeFileSync(path.join(root, "data/pipeline.md"), `# Fictional inbox

## Pending
- [ ] ${HELD} | Fixture Alpha | Platform Lead | Metropolis, NY | rank: 4.2/5 — fixture
- [ ] https://example.com/fixture-plain | Fixture Beta | Designer | Springfield
- [ ] https://example.com/fixture-remote | Fixture Gamma | Engineer | Remote
- [ ] https://example.com/fixture-blank | Fixture Delta | Analyst
`);
fs.writeFileSync(path.join(root, "data/evaluate-queue.tsv"), [
  "url\tat\tjobId\trunId\trank\treason\tstate\tsource",
  `${HELD}\t${NOW}\t${JOB}\trun-1\t4.2\theld-location\tskipped\trank-pass`,
  // The fit row was ranked, and the drain found no reader for its board.
  `https://example.com/fixture-plain\t${NOW}\t${JOB}\trun-1\t\tno-api-text\tskipped\tdrain`,
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
