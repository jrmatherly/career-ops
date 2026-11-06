// A dead posting is recorded in Processed as a strikethrough that leads with
// its URL ("~~url | company | role~~ — …", or "~~url~~ — …" when the batch
// worker knew nothing else). reconcile-pipeline.mjs read the Processed URL from
// field 2 only, so a struck-out entry never seeded the dedup set and a stale
// Pending copy of the same URL was moved in a second time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OVERRIDES = ['CAREER_OPS_DATA_DIR', 'CAREER_OPS_TRACKER', 'CAREER_OPS_PIPELINE', 'CAREER_OPS_SCAN_HISTORY', 'CAREER_OPS_PORTALS', 'CAREER_OPS_PROFILE', 'CAREER_OPS_FOLLOWUPS', 'CAREER_OPS_REPORTS', 'CAREER_OPS_CV', 'CAREER_OPS_JDS', 'CAREER_OPS_ADDITIONS'];
const URL = 'https://example.com/job';
const REPORT = `# Evaluation: Acme -- Engineer\n\n**Score:** 4.2/5\n**URL:** ${URL}\n`;

function reconcile(processedLine) {
  const root = mkdtempSync(join(tmpdir(), 'reconcile-expired-'));
  try {
    for (const dir of ['batch', 'reports', 'data']) mkdirSync(join(root, dir));
    const pipeline = join(root, 'data', 'pipeline.md');
    writeFileSync(pipeline, `# Pipeline\n\n## Pending\n\n- [ ] ${URL} | Acme | Engineer\n\n## Processed\n\n${processedLine}\n`);
    const state = join(root, 'batch', 'batch-state.tsv');
    writeFileSync(state, [
      'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries',
      `1\t${URL}\tcompleted\t2026-10-01\t2026-10-01\t042\t4.2\t-\t0`,
      '',
    ].join('\n'));
    writeFileSync(join(root, 'reports', '042-acme-2026-10-01.md'), REPORT);
    const env = { ...process.env, CAREER_OPS_ROOT: root };
    for (const key of OVERRIDES) env[key] = '';
    const result = spawnSync(process.execPath, [join(ROOT, 'reconcile-pipeline.mjs'), '--pipeline', pipeline, '--state', state], { cwd: root, encoding: 'utf8', timeout: 30000, env });
    assert.equal(result.status, 0, describeSpawn(result));
    return readFileSync(pipeline, 'utf8');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [label, line] of [
  ['url, company and role', `- [x] ~~${URL} | Acme | Engineer~~ — posting expired`],
  ['url only', `- [x] ~~${URL}~~ — posting expired`],
]) {
  test(`a struck-out Processed entry (${label}) dedups the Pending copy`, () => {
    const after = reconcile(line);
    assert.equal(after.split(URL).length - 1, 1, `URL should appear once:\n${after}`);
    assert.ok(after.includes(line), 'the struck-out entry is kept as written');
  });
}
