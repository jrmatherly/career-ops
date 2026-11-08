// The hosted server image must stay on the dev image's exact Playwright base and
// must never grow the dev image's Go or TeX toolchains. The smoke compose stack
// must never publish the port beyond loopback.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { pass, fail, ROOT } from './helpers.mjs';
import { USER_PATHS } from '../update-system.mjs';

console.log('\n🔎 server image (deploy/Dockerfile and deploy/compose.yml)');

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf-8') : '');
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

check(existsSync(join(ROOT, 'deploy/Dockerfile')), 'deploy/Dockerfile exists');

const server = read('deploy/Dockerfile');
const compose = read('deploy/compose.yml');
const digestOf = (text) => text.match(/^FROM .*@(sha256:[0-9a-f]{64})/m)?.[1] ?? null;

const devDigest = digestOf(read('Dockerfile'));
const serverDigest = digestOf(server);
check(devDigest !== null && serverDigest === devDigest,
  `deploy/Dockerfile FROM pins the root Dockerfile's digest (${devDigest ?? 'none'}), got ${serverDigest ?? 'none'}`);
check(server.includes('npm --prefix web run build'), 'deploy/Dockerfile runs the web build');
check(/@anthropic-ai\/claude-code@\d+\.\d+\.\d+/.test(server), 'deploy/Dockerfile pins the Claude CLI version');
check(/^USER 1000\s*$/m.test(server), 'deploy/Dockerfile runs as USER 1000');
check(server.includes('DISABLE_AUTOUPDATER=1'), 'deploy/Dockerfile sets DISABLE_AUTOUPDATER=1');
check(!server.includes('GO_VERSION') && !/texlive/i.test(server),
  'deploy/Dockerfile installs neither Go nor TeX');
check(server.includes('ENTRYPOINT ["/usr/bin/tini", "--"]') && server.includes('CMD ["node", "web/server.mjs", "start"]'),
  'deploy/Dockerfile starts web/server.mjs under tini');
check(/"127\.0\.0\.1:[^"]*:3000"/.test(compose), 'deploy/compose.yml publishes port 3000 on loopback only');
check(/read_only:\s*true/.test(compose), 'deploy/compose.yml runs the smoke container with a read-only root');
check(compose.includes('/app/web/.next/cache'), 'deploy/compose.yml gives .next/cache a writable mount');
check(/^\s*-\s*CLAUDE_CODE_OAUTH_TOKEN\s*$/m.test(compose) && !/(TOKEN|API_KEY)=\S/.test(compose),
  'deploy/compose.yml passes CLAUDE_CODE_OAUTH_TOKEN through from the host and sets no secret value');
check(/^\s*-\s*CAREER_OPS_ROOT=\/data\s*$/m.test(compose) && /^\s*-\s*".*:\/data"\s*$/m.test(compose),
  'deploy/compose.yml sets CAREER_OPS_ROOT=/data and mounts the data root at /data');

// deploy/Dockerfile copies the whole checkout, so a user-layer path missing here is baked into the image.
const ignoreLines = new Set(read('.dockerignore').split('\n').map((line) => line.trim()));
const uncovered = USER_PATHS.filter((entry) => {
  const bare = entry.replace(/\/$/, '');
  return ![entry, bare, `${bare}/*`, `**/${bare}`].some((form) => ignoreLines.has(form));
});
check(uncovered.length === 0, `.dockerignore covers every USER_PATHS entry${uncovered.length ? `, missing: ${uncovered.join(', ')}` : ''}`);

const LOCAL_ONLY = ['**/.env', '**/.env*.local', '**/.career-ops.env', '.mcp.json', 'private', '.codegraph', '.remember', '.claude/worktrees', '**/.next'];
const missingLocal = LOCAL_ONLY.filter((pattern) => !ignoreLines.has(pattern));
check(missingLocal.length === 0, `.dockerignore covers the local-only paths${missingLocal.length ? `, missing: ${missingLocal.join(', ')}` : ''}`);

const userBares = USER_PATHS.map((entry) => entry.replace(/\/$/, ''));
const reincluded = [...ignoreLines].filter((line) => line.startsWith('!')).map((line) => line.slice(1))
  .filter((target) => !target.endsWith('.gitkeep') && userBares.some((bare) => target === bare || target.startsWith(`${bare}/`)));
check(reincluded.length === 0, `.dockerignore re-includes no USER_PATHS path${reincluded.length ? `, found: ${reincluded.join(', ')}` : ''}`);

// A per-Dockerfile ignore file replaces the root .dockerignore for that build.
check(!existsSync(join(ROOT, 'deploy/Dockerfile.dockerignore')), 'no deploy/Dockerfile.dockerignore overrides the root .dockerignore');

const workflow = load(read('.github/workflows/docker-image.yml') || '{}') ?? {};
const triggers = workflow.on ?? {};
const matrix = workflow.jobs?.publish?.strategy?.matrix?.include ?? [];
const steps = workflow.jobs?.publish?.steps ?? [];
check(matrix.some((m) => m.name === 'career-ops-server' && m.file === 'deploy/Dockerfile' && m.context === '.' && m.platforms === 'linux/amd64'),
  'docker-image.yml builds career-ops-server from deploy/Dockerfile for linux/amd64');
check(steps.find((step) => /log in/i.test(step.name ?? ''))?.if === "github.event_name != 'pull_request'",
  'docker-image.yml skips the registry login on pull requests');
check(steps.find((step) => /build and push/i.test(step.name ?? ''))?.with?.push === "${{ github.event_name != 'pull_request' }}",
  'docker-image.yml pushes only outside pull requests');
check(triggers.push && !('paths' in triggers.push) && !('paths-ignore' in triggers.push),
  'docker-image.yml builds every push with no path filter');
const PR_PATHS = ['Dockerfile', 'deploy/**', '.dockerignore', '.hadolint.yaml', 'package.json', 'web/package.json', 'web/package-lock.json', 'tests/cv-visual/Dockerfile', '.github/workflows/docker-image.yml'];
check(JSON.stringify([...(triggers.pull_request?.paths ?? [])].sort()) === JSON.stringify([...PR_PATHS].sort()),
  'docker-image.yml builds pull requests that touch any image input');
