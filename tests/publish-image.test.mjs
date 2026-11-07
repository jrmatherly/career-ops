// The publish service image: a digest-pinned Node base new enough for the
// service, production dependencies only (the auth CLI among them), a non-root
// user, the migration before the server, and a loopback-only compose port.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, normalize, dirname } from 'path';
import { load } from 'js-yaml';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\n🔎 publish image (publish/Dockerfile and publish/compose.yml)');

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf-8') : '');
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

const dockerfile = read('publish/Dockerfile');
const compose = load(read('publish/compose.yml') || '{}') ?? {};
const pkg = JSON.parse(read('publish/package.json') || '{}');

const from = dockerfile.match(/^FROM node:(\d+)(?:\.(\d+))?[^@\s]*@sha256:[0-9a-f]{64}\s*$/m);
check(from !== null, 'publish/Dockerfile FROM is a node image pinned by @sha256 digest');
// auth.mjs refuses Node below 22.16 (StatementSync.columns()).
const [major, minor] = [Number(from?.[1]), Number(from?.[2] ?? 0)];
check(major > 22 || (major === 22 && minor >= 16), `publish/Dockerfile Node is 22.16 or newer, got ${from?.[1] ?? 'none'}`);

check(/^RUN npm ci --omit=dev\b/m.test(dockerfile), 'publish/Dockerfile installs with npm ci --omit=dev');
check(Boolean(pkg.dependencies?.auth) && !pkg.devDependencies?.auth, 'publish/package.json lists the auth CLI as a runtime dependency');
check(!/^COPY \.\s/m.test(dockerfile), 'publish/Dockerfile copies named files, never the whole context');
// A module left out of the named COPY lines only fails when the container starts.
const copied = [...dockerfile.matchAll(/^COPY (?!package)(.+) \S+\s*$/gm)].flatMap((m) => m[1].split(/\s+/));
const inImage = new Set(copied.flatMap((c) => (c.endsWith('/') ? readdirSync(join(ROOT, 'publish', c)).map((f) => c + f) : [c])));
const missingImports = [...inImage].filter((f) => f.endsWith('.mjs'))
  .flatMap((file) => [...read(`publish/${file}`).matchAll(/from '(\.[^']+)'/g)].map((m) => normalize(join(dirname(file), m[1]))))
  .filter((rel) => !inImage.has(rel));
check(copied.length > 0 && missingImports.length === 0,
  `publish/Dockerfile copies every module the server imports${missingImports.length ? `, missing: ${missingImports.join(', ')}` : ''}`);
check(/^USER 1000\s*$/m.test(dockerfile), 'publish/Dockerfile runs as USER 1000');
check(/^VOLUME \/data\s*$/m.test(dockerfile) && /PUBLISH_DB=\/data\/publish\.db/.test(dockerfile),
  'publish/Dockerfile keeps publish.db on the /data volume');
check(dockerfile.includes('ENTRYPOINT ["/sbin/tini", "--"]'), 'publish/Dockerfile runs under tini');

const cmd = dockerfile.match(/^CMD \[(.*)\]\s*$/m)?.[1] ?? '';
check(/node_modules\/\.bin\/auth migrate --config auth\.mjs --yes && exec node start\.mjs/.test(cmd),
  'publish/Dockerfile CMD runs the auth migration, then the server');

const ports = compose.services?.publish?.ports ?? [];
check(ports.length > 0 && ports.every((p) => String(p).startsWith('127.0.0.1:')),
  `publish/compose.yml publishes on loopback only, got ${JSON.stringify(ports)}`);
check(JSON.stringify(compose.services?.publish?.volumes ?? []).includes(':/data'), 'publish/compose.yml mounts a volume at /data');

const workflow = load(read('.github/workflows/docker-image.yml') || '{}') ?? {};
const matrix = workflow.jobs?.publish?.strategy?.matrix?.include ?? [];
check(matrix.some((m) => m.name === 'career-ops-publish' && m.context === 'publish' && m.file === 'publish/Dockerfile'),
  'docker-image.yml builds career-ops-publish from publish/Dockerfile');
