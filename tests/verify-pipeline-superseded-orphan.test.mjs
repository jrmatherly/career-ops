// tests/verify-pipeline-superseded-orphan.test.mjs: Check 10 (orphan reports)
// counts a report that a tracker row names only through merge-tracker's
// `Superseded report [N]` Notes marker as referenced, end to end through the
// real verify-pipeline.mjs process.
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pass, fail, run, NODE, rmSync } from './helpers.mjs';

console.log('\nverify-pipeline: Check 10 reads the Superseded report marker as a reference');

const vpTmp = mkdtempSync(join(tmpdir(), 'co-vp-superseded-orphan-'));
try {
  const vpReports = join(vpTmp, 'reports');
  mkdirSync(vpReports, { recursive: true });
  const vpTracker = join(vpTmp, 'applications.md');
  const vpEnv = { ...process.env, CAREER_OPS_TRACKER: vpTracker, CAREER_OPS_REPORTS: vpReports };

  writeFileSync(join(vpReports, '001-acme-2026-01-04.md'), '# Evaluación: Acme — Staff AI Engineer\n');
  writeFileSync(join(vpReports, '002-acme-2026-01-05.md'), '# Evaluación: Acme — Staff AI Engineer\n');

  const HEADER =
    '# Applications Tracker\n\n' +
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
    '|---|------|---------|------|-------|--------|-----|--------|-------|\n';
  const orphanOf = (notes) => {
    writeFileSync(vpTracker, HEADER +
      `| 5 | 2026-01-05 | Acme | Staff AI Engineer | 4.5/5 | Evaluated | ❌ | [2](reports/002-acme-2026-01-05.md) | ${notes} |\n`);
    const o = run(NODE, ['verify-pipeline.mjs'], { env: vpEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    return o === null ? null : /Orphan report[^\n]*#1: reports\/001-acme-/.test(o);
  };

  if (orphanOf('Re-eval 2026-01-05 (3.8→4.5) — Superseded report [1] (was 3.8/5)') === false) {
    pass('a report named only by a Superseded report marker is not an orphan');
  } else fail('a report named by a Superseded report marker was flagged as an orphan');

  if (orphanOf('see [1] for the first pass') === true) {
    pass('a bare [N] in Notes is not a reference: orphan still flagged');
  } else fail('a bare [N] in Notes hid an orphan report');
} catch (e) {
  fail(`verify-pipeline superseded-orphan check crashed: ${e.message}`);
} finally {
  rmSync(vpTmp, { recursive: true, force: true });
}
