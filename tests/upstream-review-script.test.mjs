// tests/upstream-review-script.test.mjs — the fork's upstream-review driver
// (.claude/skills/upstream-review/scripts/upstream-review.sh) refuses an
// --advance that would move the watermark backward or that no decision log
// mentions, writes the watermark atomically, and reports a conflicting
// --dry-run-merge with exit 1 and the file name.
//
// The script insists on a github.com upstreamUrl and on the remote carrying
// that same URL, so the fixture cannot point it at a local bare repo. Instead
// the fixture pre-seeds refs/remotes/careerops/main and makes the fetch fail
// fast offline (http.proxy to a closed local port), which takes the script's
// "fetch failed; using cached" branch.
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nupstream-review script — advance guards and dry-run merge');

const SCRIPT = join(ROOT, '.claude', 'skills', 'upstream-review', 'scripts', 'upstream-review.sh');
const ok = (cond, msg) => (cond ? pass(msg) : fail(msg));

if (spawnSync('jq', ['--version'], { encoding: 'utf-8' }).status !== 0) {
  pass('jq missing, skipped');
} else {
  const work = mkdtempSync(join(tmpdir(), 'upstream-review-'));
  try {
    const fx = join(work, 'fork');
    mkdirSync(fx);
    const env = {
      ...process.env,
      HOME: work,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.proxy',
      GIT_CONFIG_VALUE_0: 'http://127.0.0.1:9',
    };
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: fx, encoding: 'utf-8', env });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout.trim();
    };
    const commitReadme = (text, subject) => {
      writeFileSync(join(fx, 'README.md'), text);
      git('add', 'README.md');
      git('commit', '-qm', subject);
      return git('rev-parse', 'HEAD');
    };

    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'upstream-review@test.invalid');
    git('config', 'user.name', 'upstream-review test');
    const A = commitReadme('a\n', 'upstream A');
    const B = commitReadme('b\n', 'upstream B');
    const C = commitReadme('c\n', 'upstream C');
    git('update-ref', 'refs/remotes/careerops/main', C);
    git('reset', '-q', '--hard', B);
    commitReadme('fork\n', 'fork: diverge README'); // conflicts with C on README.md
    git('remote', 'add', 'careerops', 'https://github.com/career-ops-hq/career-ops.git');

    const stateDir = join(fx, '.upstream-review');
    const statePath = join(stateDir, 'watermark.json');
    mkdirSync(stateDir);
    const writeWatermark = (sha) => writeFileSync(statePath, JSON.stringify({
      upstreamUrl: 'https://github.com/career-ops-hq/career-ops.git',
      upstreamRemote: 'careerops',
      upstreamBranch: 'main',
      forkPointSha: A,
      forkPointDate: '2026-01-01',
      lastReviewedSha: sha,
      lastReviewedDate: '2026-01-02',
    }, null, 2));
    const readWatermark = () => JSON.parse(readFileSync(statePath, 'utf-8')).lastReviewedSha;
    const run = (...args) => spawnSync('bash', [SCRIPT, ...args], { cwd: fx, encoding: 'utf-8', env });

    writeWatermark(B);
    let r = run('--advance', A);
    ok(r.status === 1 && /move backward/.test(r.stderr) && readWatermark() === B,
      'advance refuses an older sha and leaves the watermark alone');

    writeWatermark(B);
    r = run('--advance', C);
    ok(r.status === 1 && /no decision log mentions/.test(r.stderr) && readWatermark() === B,
      'advance refuses without a decision log and leaves the watermark alone');

    writeWatermark(B);
    mkdirSync(join(stateDir, 'reviews'));
    writeFileSync(join(stateDir, 'reviews', '2026-01-03-review.md'), `# review\n\nWindow: \`${B.slice(0, 7)}..${C}\`\n`);
    r = run('--advance', C);
    ok(r.status === 0 && readWatermark() === C && readdirSync(stateDir).sort().join() === 'reviews,watermark.json',
      `advance writes the watermark atomically (exit ${r.status})`);

    if (process.platform === 'win32') {
      // The fake jq is a sh shim found through a POSIX PATH; bash on Windows reports MSYS paths realpath cannot follow.
      pass('fake-jq case needs a POSIX PATH, skipped on Windows');
    } else {
      // A failing jq must not report success: a fake jq on PATH fails only the watermark rewrite.
      // Resolve the real binary: a mise shim re-enters mise, which fails under this env.
      const onPath = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf-8' }).stdout.trim();
      const realJq = realpathSync(onPath).endsWith('/mise')
        ? ['bin/jq', 'jq'].map((rel) => join(spawnSync('mise', ['where', 'jq'], { encoding: 'utf-8' }).stdout.trim(), rel)).find((f) => existsSync(f))
        : onPath;
      const shim = join(work, 'bin');
      mkdirSync(shim);
      writeFileSync(join(shim, 'jq'), `#!/bin/sh\ncase "$*" in *lastReviewedSha=*) exit 1;; esac\nexec "${realJq}" "$@"\n`, { mode: 0o755 });
      writeWatermark(B);
      r = spawnSync('bash', [SCRIPT, '--advance', C], { cwd: fx, encoding: 'utf-8', env: { ...env, PATH: `${shim}:${process.env.PATH}` } });
      ok(r.status === 1 && /jq failed/.test(r.stderr) && readWatermark() === B && readdirSync(stateDir).sort().join() === 'reviews,watermark.json',
        `advance fails loudly when jq fails and leaves the watermark alone (exit ${r.status}: ${r.stderr.trim().split('\n').pop()})`);
    }

    r = run('--dry-run-merge');
    ok(r.status === 1 && /README\.md/.test(r.stdout),
      `dry-run-merge exits 1 and names the conflicting file (exit ${r.status})`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
