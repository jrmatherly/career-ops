// node tests/fixtures/layout-shell.mjs prints a fresh disposable data root for
// layout-shell.browser.test.mjs. It renders the controls pipeline-status.mjs
// leaves out: Explore chips, inbox rows, a tailored CV link, a follow-up with a
// report, and both "See all" links on Today.
//
// data/pipeline.md: "- [ ] url | company | role | location" under "## Pending".
// data/pdf-index.tsv: report number, pdf path from the root, html, format, date, kind.
// data/scan-history.tsv: url, first_seen, portal, title, company, status, location.
// A follow-up is due when an Applied row is 7 or more days old, and links to
// /pipeline/N when its Report cell resolves to a file under reports/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = day();
const NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda"];

const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-layout-shell-"));
for (const dir of ["data", "reports", "output"]) fs.mkdirSync(path.join(root, dir));
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);

write(".layout-shell-fixture", "fictional-only\n");
// Rows 11 to 13 and cv.md match pipeline-status.mjs; the suite's CV subtests read them.
// Nine Applied rows a month old make nine follow-ups due, one more than Today lists.
// Row 14 is one word: a name that wraps makes its Follow-ups link two lines tall, which hides a short one.
write("data/applications.md", `# Fictional browser fixture

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 11 | 2026-10-02 | Fixture Alpha | Engineer | 4.2/5 | Evaluated | — | [11](../reports/011-fixture-alpha.md) | Fictional fixture only |
| 12 | 2026-10-02 | Fixture Beta | Designer | 3.8/5 | Applied | — | | Fictional fixture only |
| 13 | 2026-10-02 | Fixture Gamma | Analyst | 3.6/5 | Evaluated | — | | Fictional fixture only |
| 14 | ${day(-30)} | FixtureDelta | Researcher | 4.0/5 | Applied | — | [14](../reports/014-fixture-delta.md) | Fictional fixture only |
${NAMES.slice(4).map((name, i) => `| ${15 + i} | ${day(-30)} | Fixture ${name} | Engineer | 3.9/5 | Applied | — | | Fictional fixture only |`).join("\n")}
`);
write("reports/011-fixture-alpha.md", "# Fixture Alpha — Engineer\n\nFictional browser test report.\n");
write("reports/014-fixture-delta.md", "# FixtureDelta — Researcher\n\nFictional browser test report.\n");
write("cv.md", "# Fictional browser fixture\n\nNot a real candidate.\n");

write("data/pipeline.md", `# Fictional inbox

## Pending
${NAMES.slice(0, 3).map((name) => `- [ ] https://example.com/inbox-${name.toLowerCase()} | Fixture ${name} | Engineer | Toronto`).join("\n")}
`);

write("output/cv-fixture-alpha.pdf", "%PDF-1.4\n%%EOF\n");
write("data/pdf-index.tsv", `11\toutput/cv-fixture-alpha.pdf\t\tletter\t${today}\tcv\n`);

write("data/scan-history.tsv", `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation
${NAMES.slice(0, 7).map((name) => `https://example.com/fresh-${name.toLowerCase()}\t${today}\tfixture\tFixture Engineer\tFresh ${name}\tadded\tToronto`).join("\n")}
`);

write("portals.yml", `title_filter:
  positive:
    - "Fixture Engineer"
    - "Fixture Analyst"
`);
console.log(root);
