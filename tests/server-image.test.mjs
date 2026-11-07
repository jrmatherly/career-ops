// The hosted server image must stay on the dev image's exact Playwright base and
// must never grow the dev image's Go or TeX toolchains. The smoke compose stack
// must never publish the port beyond loopback.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\n🔎 server image (deploy/Dockerfile and deploy/compose.yml)');

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf-8') : '');
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

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
