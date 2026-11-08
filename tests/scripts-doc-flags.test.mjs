// tests/scripts-doc-flags.test.mjs — every --help flag of these read-only scripts is in its docs/SCRIPTS.md text.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pass, fail, ROOT, NODE } from './helpers.mjs';

// Each handles --help before any side effect and exits 0. build-dashboard.mjs (runs go build
// on any argv) and cv-templates.mjs (prints its usage only as the unknown-command error path,
// with a non-zero exit) are deliberately absent.
const SCRIPTS = ['application-artifacts.mjs', 'clean-markers.mjs', 'eval-golden.mjs', 'gemini-eval.mjs', 'hired-wall-build.mjs', 'learn.mjs', 'linkedin-join.mjs', 'match-star.mjs', 'ollama-eval.mjs', 'openai-eval.mjs', 'openrouter-runner.mjs', 'session-activity.mjs', 'sponsor-check.mjs', 'story-provenance-check.mjs'];
const doc = readFileSync(join(ROOT, 'docs', 'SCRIPTS.md'), 'utf8');
const cwd = mkdtempSync(join(tmpdir(), 'co-scripts-doc-'));
const noRoot = join(cwd, 'no-such-data-root');
// A script's text is its `## <name>` section when one exists, else every line that names the file
// (the quick-reference and agent-invoked table rows), so a flag must sit beside the script it belongs to.
const section = (name) => {
  const heading = `\n## ${name.replace(/\.mjs$/, '')}`;
  const start = doc.indexOf(heading);
  if (start !== -1) {
    const end = doc.indexOf('\n## ', start + heading.length);
    return doc.slice(start, end === -1 ? undefined : end);
  }
  return doc.split('\n').filter((line) => line.includes(name)).join('\n');
};
for (const script of SCRIPTS) {
  let out = '';
  try { out = execFileSync(NODE, [join(ROOT, script), '--help'], { cwd, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CAREER_OPS_ROOT: noRoot } }); }
  catch (err) {
    // A crash or a hang that happens to print flag names must not read as documented.
    fail(`${script} --help exited ${err.status ?? err.signal}: ${String(err.stderr ?? '').split('\n')[0]}`);
    continue;
  }
  const flags = [...new Set([...out.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((m) => m[0]))];
  const text = section(script);
  const missing = flags.filter((flag) => !text.includes(flag));
  if (flags.length === 0) fail(`${script} --help printed no flags`);
  else if (!text) fail(`docs/SCRIPTS.md never names ${script}`);
  else if (missing.length === 0) pass(`docs/SCRIPTS.md "${script}" text names every --help flag`);
  else fail(`docs/SCRIPTS.md "${script}" text lacks flags: ${missing.join(' ')}`);
}
if (existsSync(noRoot)) fail('a --help run created the nonexistent data root'); else pass('no --help run touched a data root');
rmSync(cwd, { recursive: true, force: true });
