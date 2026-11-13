// node tests/fixtures/cv-page.mjs prints a fresh disposable data root for the
// CV page suite: the repo's fictional example CV, which absorbs losslessly, and
// a three-company portals.yml for the Portals switch focus checks.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const codeRoot = fileURLToPath(new URL("../../../", import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-cv-page-"));
fs.mkdirSync(path.join(root, "data"));
fs.writeFileSync(path.join(root, ".cv-page-fixture"), "fictional-only\n");
fs.copyFileSync(path.join(codeRoot, "examples", "cv-example.md"), path.join(root, "cv.md"));
fs.writeFileSync(path.join(root, "portals.yml"), `tracked_companies:
  - name: Alpha Labs
    careers_url: https://jobs.ashbyhq.com/alpha-labs
    enabled: true
  - name: Beta Works
    careers_url: https://boards.greenhouse.io/beta-works
    enabled: true
  - name: Gamma Corp
    careers_url: https://jobs.lever.co/gamma-corp
    enabled: true
`);
console.log(root);
