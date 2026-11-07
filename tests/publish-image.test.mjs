// The publish service image: a digest-pinned Node base new enough for the
// service, production dependencies only (the auth CLI among them), a non-root
// user, the migration before the server, and a loopback-only compose port.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { builtinModules } from 'module';
import { join, normalize, dirname } from 'path';
import { load } from 'js-yaml';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\n🔎 publish image (publish/Dockerfile and publish/compose.yml)');

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf-8') : '');
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const missing = (list) => (list.length ? `, missing: ${list.join(', ')}` : '');

const dockerfile = read('publish/Dockerfile');
const compose = load(read('publish/compose.yml') || '{}') ?? {};
const pkg = JSON.parse(read('publish/package.json') || '{}');

const from = dockerfile.match(/^FROM node:(\d+)(?:\.(\d+))?[^@\s]*@sha256:[0-9a-f]{64}\s*$/m);
check(from !== null, 'publish/Dockerfile FROM is a node image pinned by @sha256 digest');
// auth.mjs refuses Node below 22.16 and 23.0-23.10 (StatementSync.columns()).
const [major, minor] = [Number(from?.[1]), Number(from?.[2] ?? 0)];
check(major >= 24 || (major === 23 && minor >= 11) || (major === 22 && minor >= 16),
  `publish/Dockerfile Node is 22.16+ or 23.11+, got ${from ? from.slice(1, 3).filter(Boolean).join('.') : 'none'}`);
check(/^RUN npm ci --omit=dev\b/m.test(dockerfile), 'publish/Dockerfile installs with npm ci --omit=dev');
check(Boolean(pkg.dependencies?.auth) && !pkg.devDependencies?.auth, 'publish/package.json lists the auth CLI as a runtime dependency');
check(!/^COPY \.\s/m.test(dockerfile), 'publish/Dockerfile copies named files, never the whole context');
// A module left out of the named COPY lines only fails when the container starts.
const copied = [...dockerfile.matchAll(/^COPY (?!package)(.+) \S+\s*$/gm)].flatMap((m) => m[1].split(/\s+/));
const inImage = new Set(copied.flatMap((c) => (c.endsWith('/') && existsSync(join(ROOT, 'publish', c)) ? readdirSync(join(ROOT, 'publish', c)).map((f) => c + f) : [c])));
const imports = [...inImage].filter((f) => f.endsWith('.mjs'))
  .flatMap((file) => [...read(`publish/${file}`).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => [file, m[1]]));
const entry = 'start.mjs';
const missingImports = [entry, ...imports.filter(([, s]) => s.startsWith('.')).map(([file, s]) => normalize(join(dirname(file), s)))]
  .filter((rel) => !inImage.has(rel));
check(copied.length > 0 && missingImports.length === 0, `publish/Dockerfile copies every module the server imports${missing(missingImports)}`);
const builtins = new Set(builtinModules);
const packageOf = (s) => s.split('/').slice(0, s.startsWith('@') ? 2 : 1).join('/');
const missingPackages = [...new Set(imports.map(([, s]) => s).filter((s) => !s.startsWith('.') && !s.startsWith('node:') && !builtins.has(s)).map(packageOf))]
  .filter((name) => !pkg.dependencies?.[name]);
check(missingPackages.length === 0, `publish/package.json dependencies hold every package the server imports${missing(missingPackages)}`);
check([...dockerfile.matchAll(/^USER (\S+)/gm)].at(-1)?.[1] === '1000', 'publish/Dockerfile runs as USER 1000');
check(/chown 1000:1000 \/data/.test(dockerfile), 'publish/Dockerfile gives uid 1000 the /data directory');
check(/^VOLUME \/data\s*$/m.test(dockerfile) && /PUBLISH_DB=\/data\/publish\.db/.test(dockerfile),
  'publish/Dockerfile keeps publish.db on the /data volume');
check(/^RUN apk add --no-cache tini\b/m.test(dockerfile) && dockerfile.includes('ENTRYPOINT ["/sbin/tini", "--"]'), 'publish/Dockerfile installs tini and runs under it');

const cmd = dockerfile.match(/^CMD \[(.*)\]\s*$/m)?.[1] ?? '';
check(/node_modules\/\.bin\/auth migrate --config auth\.mjs --yes && exec node start\.mjs/.test(cmd),
  'publish/Dockerfile CMD runs the auth migration, then the server');

const ports = compose.services?.publish?.ports ?? [];
check(ports.length > 0 && ports.every((p) => String(p).startsWith('127.0.0.1:')),
  `publish/compose.yml publishes on loopback only, got ${JSON.stringify(ports)}`);
check(!compose.services?.publish?.network_mode, 'publish/compose.yml keeps the default network, so the port mapping is the only way in');
check(JSON.stringify(compose.services?.publish?.volumes ?? []).includes(':/data'), 'publish/compose.yml mounts a volume at /data');
// environment beats env_file, so a copied .env.example cannot move the bind or the database.
const rawEnv = compose.services?.publish?.environment ?? [];
const env = Array.isArray(rawEnv) ? rawEnv : Object.entries(rawEnv).map(([key, value]) => `${key}=${value}`);
const imageEnv = ['PUBLISH_BIND', 'PUBLISH_PORT', 'PUBLISH_DB'].map((key) => `${key}=${dockerfile.match(new RegExp(`\\b${key}=(\\S+)`))?.[1]}`);
check(imageEnv.every((pair) => env.includes(pair)), `publish/compose.yml pins the image's bind, port and database path over .env${missing(imageEnv.filter((pair) => !env.includes(pair)))}`);

const workflow = load(read('.github/workflows/docker-image.yml') || '{}') ?? {};
const matrix = workflow.jobs?.publish?.strategy?.matrix?.include ?? [];
check(matrix.some((m) => m.name === 'career-ops-publish' && m.context === 'publish' && m.file === 'publish/Dockerfile'),
  'docker-image.yml builds career-ops-publish from publish/Dockerfile');
