// readTargeting and buildPrompt are pinned on their own in
// rank-pipeline-targeting.test.mjs. This runs the ranker itself, the way
// rank-pipeline-model.test.mjs does, to pin that the prompt a CLI receives
// carries the targeting from the profile the data root resolves to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { envWithPathFirst, writeFakeCli } from './helpers/fake-cli.mjs';

function rankRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'rank-targeting-run-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'config'));
  writeFakeCli(join(root, 'bin'), 'claude',
    `require('node:fs').writeFileSync(process.env.RANK_ARGS, JSON.stringify(process.argv.slice(2)));\n`
    + `console.log('[{"id":0,"score":4,"reason":"Fixture match"}]');\n`);
  const prompt = (extraEnv = {}) => {
    writeFileSync(join(root, 'data', 'pipeline.md'), '- [ ] https://example.test/job | Example | Engineer');
    const env = envWithPathFirst(join(root, 'bin'), { CAREER_OPS_ROOT: root, CAREER_OPS_PROFILE: '', RANK_ARGS: join(root, 'args.json'), ...extraEnv });
    execFileSync(process.execPath, [join(ROOT, 'rank-pipeline.mjs'), '--cli', 'claude'], { env, stdio: 'pipe' });
    return JSON.parse(readFileSync(env.RANK_ARGS, 'utf8')).find(arg => arg.includes('POSTINGS:'));
  };
  return { root, prompt };
}

test('the prompt the CLI receives carries the target roles from the data root profile', (t) => {
  const { root, prompt } = rankRoot(t);
  writeFileSync(join(root, 'config', 'profile.yml'), 'target_roles:\n  primary: ["Zebra Wrangler"]\n');
  const sent = prompt();
  assert.match(sent, /CANDIDATE TARGETING \(the roles this person wants\):\nPrimary:\n- Zebra Wrangler\n/);
  assert.match(sent, /scores at most 3\.0/);
});

test('with no profile the prompt has no targeting block', (t) => {
  const { prompt } = rankRoot(t);
  assert.doesNotMatch(prompt(), /CANDIDATE TARGETING/);
});

test('CAREER_OPS_PROFILE names the profile the targeting is read from', (t) => {
  const { root, prompt } = rankRoot(t);
  writeFileSync(join(root, 'config', 'profile.yml'), 'target_roles:\n  primary: ["Zebra Wrangler"]\n');
  const other = join(root, 'other-profile.yml');
  writeFileSync(other, 'target_roles:\n  primary: ["Llama Herder"]\n');
  const sent = prompt({ CAREER_OPS_PROFILE: other });
  assert.match(sent, /- Llama Herder/);
  assert.doesNotMatch(sent, /Zebra Wrangler/);
});
