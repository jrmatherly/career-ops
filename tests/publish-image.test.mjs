// The publish service image: a digest-pinned Node base new enough for the
// service, production dependencies only (the auth CLI among them), a non-root
// user, the migration before the server, and a loopback-only compose port.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { builtinModules } from 'module';
import { join, posix } from 'path';
import { load } from 'js-yaml';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\n🔎 publish image (publish/Dockerfile and publish/compose.yml)');

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf-8') : '');
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const missing = (list) => (list.length ? `, missing: ${list.join(', ')}` : '');

const dockerfile = read('publish/Dockerfile');
const compose = load(read('publish/compose.yml') || '{}') ?? {};
const pkg = JSON.parse(read('publish/package.json') || '{}');
const imageValue = (key) => dockerfile.replace(/^\s*#.*$/gm, '').match(new RegExp(`\\b${key}=(\\S+)`))?.[1];

// The last FROM is the stage that runs; every stage must be digest-pinned.
const froms = [...dockerfile.matchAll(/^FROM .*$/gm)].map((m) => m[0]);
const from = froms.at(-1)?.match(/^FROM node:(\d+)(?:\.(\d+))?[^@\s]*@sha256:[0-9a-f]{64}\s*$/) ?? null;
const unpinned = froms.filter((line) => !/@sha256:[0-9a-f]{64}/.test(line));
check(froms.length > 0 && unpinned.length === 0, `publish/Dockerfile pins every FROM by @sha256 digest${missing(unpinned)}`);
// auth.mjs refuses Node below 22.16 and 23.0-23.10 (StatementSync.columns()).
const [major, minor] = [Number(from?.[1]), Number(from?.[2] ?? 0)];
check(major >= 24 || (major === 23 && minor >= 11) || (major === 22 && minor >= 16),
  `publish/Dockerfile Node is 22.16+ or 23.11+, got ${from ? from.slice(1, 3).filter(Boolean).join('.') : 'none'}`);
check(/^COPY package\.json package-lock\.json /m.test(dockerfile) && /^RUN npm ci --omit=dev\b/m.test(dockerfile), 'publish/Dockerfile installs the lockfile with npm ci --omit=dev');
check(Boolean(pkg.dependencies?.auth) && !pkg.devDependencies?.auth, 'publish/package.json lists the auth CLI as a runtime dependency');
check(!/^COPY \.\s/m.test(dockerfile), 'publish/Dockerfile copies named files, never the whole context');
// A module left out of the named COPY lines only fails when the container starts.
const copied = [...dockerfile.matchAll(/^COPY (?!package)(.+) \S+\s*$/gm)].flatMap((m) => m[1].split(/\s+/));
const inImage = new Set(copied.flatMap((c) => (c.endsWith('/') && existsSync(join(ROOT, 'publish', c)) ? readdirSync(join(ROOT, 'publish', c)).map((f) => c + f) : [c])));
const imports = [...inImage].filter((f) => f.endsWith('.mjs'))
  .flatMap((file) => [...read(`publish/${file}`).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => [file, m[1]]));
const entry = 'start.mjs';
const missingImports = [entry, ...imports.filter(([, s]) => s.startsWith('.')).map(([file, s]) => posix.join(posix.dirname(file), s))]
  .filter((rel) => !inImage.has(rel));
check(copied.length > 0 && missingImports.length === 0, `publish/Dockerfile copies every module the server imports${missing(missingImports)}`);
const builtins = new Set(builtinModules);
const packageOf = (s) => s.split('/').slice(0, s.startsWith('@') ? 2 : 1).join('/');
const missingPackages = [...new Set(imports.map(([, s]) => s).filter((s) => !s.startsWith('.') && !s.startsWith('node:') && !builtins.has(s)).map(packageOf))]
  .filter((name) => !pkg.dependencies?.[name]);
check(missingPackages.length === 0, `publish/package.json dependencies hold every package the server imports${missing(missingPackages)}`);
check([...dockerfile.matchAll(/^USER (\S+)/gm)].at(-1)?.[1] === '1000', 'publish/Dockerfile runs as USER 1000');
// A RUN after VOLUME cannot change the volume's contents, so the chown must come first.
const chownAt = dockerfile.search(/chown 1000:1000 \/data/);
check(chownAt !== -1 && chownAt < dockerfile.search(/^VOLUME /m), 'publish/Dockerfile gives uid 1000 the /data directory before declaring the volume');
check(/^VOLUME \/data\s*$/m.test(dockerfile) && imageValue('PUBLISH_DB') === '/data/publish.db',
  'publish/Dockerfile keeps publish.db on the /data volume');
check(/^RUN apk add --no-cache tini\b/m.test(dockerfile) && dockerfile.includes('ENTRYPOINT ["/sbin/tini", "--"]'), 'publish/Dockerfile installs tini and runs under it');

const cmd = dockerfile.match(/^CMD \[(.*)\]\s*$/m)?.[1] ?? '';
check(/node_modules\/\.bin\/auth migrate --config auth\.mjs --yes && exec node start\.mjs/.test(cmd),
  'publish/Dockerfile CMD runs the auth migration, then the server');

check(imageValue('PUBLISH_BIND') === '0.0.0.0', 'publish/Dockerfile binds every interface, so the port mapping can reach the server');
const port = imageValue('PUBLISH_PORT');
check(new RegExp(`^EXPOSE ${port}\\s*$`, 'm').test(dockerfile), `publish/Dockerfile exposes PUBLISH_PORT (${port})`);
// Short syntax "127.0.0.1:8080:8080" or long syntax { host_ip, published, target }.
const ports = (compose.services?.publish?.ports ?? []).map((p) => (typeof p === 'object' ? `${p.host_ip}:${p.published}:${p.target}` : String(p)));
check(ports.length > 0 && ports.every((p) => p.startsWith('127.0.0.1:') && p.split(':').at(-1) === port),
  `publish/compose.yml maps loopback only to PUBLISH_PORT, got ${JSON.stringify(ports)}`);
check(!compose.services?.publish?.network_mode, 'publish/compose.yml keeps the default network, so the port mapping is the only way in');
check(JSON.stringify(compose.services?.publish?.volumes ?? []).includes(':/data'), 'publish/compose.yml mounts a volume at /data');
// environment beats env_file, so a copied .env.example cannot move the bind or the database.
const rawEnv = compose.services?.publish?.environment ?? [];
const env = Array.isArray(rawEnv) ? rawEnv : Object.entries(rawEnv).map(([key, value]) => `${key}=${value}`);
const imageEnv = ['PUBLISH_BIND', 'PUBLISH_PORT', 'PUBLISH_DB'].map((key) => `${key}=${imageValue(key)}`);
check(imageEnv.every((pair) => env.includes(pair)), `publish/compose.yml pins the image's bind, port and database path over .env${missing(imageEnv.filter((pair) => !env.includes(pair)))}`);

const workflow = load(read('.github/workflows/docker-image.yml') || '{}') ?? {};
const matrix = workflow.jobs?.publish?.strategy?.matrix?.include ?? [];
check(matrix.some((m) => m.name === 'career-ops-publish' && m.context === 'publish' && m.file === 'publish/Dockerfile'),
  'docker-image.yml builds career-ops-publish from publish/Dockerfile');
