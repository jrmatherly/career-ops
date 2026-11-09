#!/usr/bin/env node
// scripts/stamp-version.mjs — write the fork's released versions into every
// file release-please-config.json names, from .release-please-manifest.json.
//
// Why this exists: upstream's `chore: release main` commits rewrite the same
// version tokens the fork releases rewrite, so every upstream merge conflicts
// on them. The upstream-review skill resolves those files by taking upstream's
// copy (so any other hunk in them lands) and running this script, which puts
// the fork's versions back. `--check` reports drift without writing, for CI.
//
//   node scripts/stamp-version.mjs            # write
//   node scripts/stamp-version.mjs --check    # exit 1 when a token differs
//   node scripts/stamp-version.mjs --root DIR # another checkout
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/is-main-module.mjs';

const SEMVER_RE = /\d+\.\d+\.\d+(?:-[\w.]+)?/;
const MARKER = 'x-release-please-version';

/** The token files a package owns: `[path, apply(text) => text]` pairs. */
function updatersFor(pkgPath, pkg) {
  const files = [];
  for (const f of pkg['extra-files'] ?? []) {
    if (f.type === 'generic') files.push([join(pkgPath, f.path), stampMarkedLines]);
    else if (f.type === 'json') files.push([join(pkgPath, f.path), (text, v) => stampJsonPath(text, f.jsonpath, v)]);
  }
  if (pkg['release-type'] === 'node') {
    files.push([join(pkgPath, 'package.json'), (text, v) => stampJsonPath(text, '$.version', v)]);
    // npm writes the package's version twice in its lockfile.
    files.push([join(pkgPath, 'package-lock.json'), (text, v) => stampJsonPath(stampJsonPath(text, '$.version', v), '$.packages[""].version', v)]);
  }
  return files;
}

/** Replace the semver on every line that carries the release-please marker. */
export function stampMarkedLines(text, version) {
  const lines = text.split('\n');
  const marked = lines.filter((line) => line.includes(MARKER));
  if (marked.length === 0) throw new Error(`no ${MARKER} marker line`);
  const bare = marked.find((line) => !SEMVER_RE.test(line));
  if (bare !== undefined) throw new Error(`marker line carries no version: ${bare.trim()}`);
  return lines.map((line) => (line.includes(MARKER) ? line.replace(SEMVER_RE, version) : line)).join('\n');
}

/** Set a `$.a.b[0].c` (or `$.a[""].c`) path in a JSON text, keeping the file's indentation. */
export function stampJsonPath(text, jsonpath, version) {
  const keys = jsonpath.replace(/^\$\./, '').replace(/\[(\d+|"")\]/g, '.$1').split('.').map((k) => k.replace(/^""$/, ''));
  const data = JSON.parse(text);
  let node = data;
  for (const key of keys) {
    if (node === null || typeof node !== 'object' || !(key in node)) throw new Error(`${jsonpath} does not exist`);
    if (key !== keys.at(-1)) node = node[key];
  }
  node[keys.at(-1)] = version;
  const indent = text.match(/^(\s+)"/m)?.[1] ?? '  ';
  return `${JSON.stringify(data, null, indent)}\n`;
}

/** Stamp (or with check=true only compare) every token file under root. */
export function stampVersions(root, { check = false } = {}) {
  const config = JSON.parse(readFileSync(join(root, 'release-please-config.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(root, '.release-please-manifest.json'), 'utf8'));
  const drift = [];
  for (const [pkgPath, pkg] of Object.entries(config.packages)) {
    const version = manifest[pkgPath];
    if (!version) throw new Error(`.release-please-manifest.json has no version for package "${pkgPath}"`);
    for (const [rel, apply] of updatersFor(pkgPath, pkg)) {
      const file = join(root, rel);
      if (!existsSync(file)) throw new Error(`release-please-config.json names ${rel}, which does not exist`);
      const before = readFileSync(file, 'utf8');
      let after;
      try {
        after = apply(before, version);
      } catch (err) {
        throw new Error(`${rel}: ${err.message}`);
      }
      if (after === before) continue;
      drift.push(rel);
      if (!check) writeFileSync(file, after);
    }
  }
  return [...new Set(drift)];
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const rootArg = args.indexOf('--root');
  if (rootArg !== -1 && !args[rootArg + 1]) {
    console.error('usage: node scripts/stamp-version.mjs [--check] [--root DIR]');
    process.exit(2);
  }
  const root = rootArg === -1 ? join(dirname(fileURLToPath(import.meta.url)), '..') : args[rootArg + 1];
  const drift = stampVersions(root, { check });
  if (drift.length === 0) console.log('version tokens already match .release-please-manifest.json');
  else console.log(`${check ? 'drift in' : 'stamped'} ${drift.length} file(s):\n  ${drift.join('\n  ')}`);
  if (check && drift.length) process.exit(1);
}
