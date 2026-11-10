// Plain .mjs (same pattern as run-cli-support.mjs / tracker-table.mjs) so
// tests/lib/data-root.test.mjs can import it directly under Node. Import it with
// the .mjs extension included.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_COPY_SUBDIRS = ["cache", "marketplaces", "synced"];

function spellings(dir) {
  const out = [path.resolve(dir)];
  try {
    out.push(fs.realpathSync(dir));
  } catch {
    // Not on disk yet: the lexical spelling is all there is.
  }
  return process.platform === "win32" ? out.map((p) => p.toLowerCase()) : out;
}

/**
 * True when `dir` is inside a copy Claude Code keeps for an installed plugin.
 * Mirrors the core's `isPluginInstallCopy()`; Claude Code replaces such a copy
 * on every plugin update, so it can never hold the user's files.
 *
 * @param {string} dir
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
export function isPluginInstallCopy(dir, env) {
  const roots = [];
  const cacheDir = env.CLAUDE_CODE_PLUGIN_CACHE_DIR?.trim();
  if (cacheDir) roots.push(path.resolve(cacheDir));
  const configDir = env.CLAUDE_CONFIG_DIR?.trim();
  roots.push(path.join(configDir ? path.resolve(configDir) : path.join(os.homedir(), ".claude"), "plugins"));

  const candidates = spellings(dir);
  return roots.some((root) =>
    PLUGIN_COPY_SUBDIRS.some((sub) =>
      spellings(path.join(root, sub)).some((parent) =>
        candidates.some((c) => {
          const rel = path.relative(parent, c);
          return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
        }),
      ),
    ),
  );
}

function pluginDefaultDataRoot() {
  return path.join(os.homedir(), "career-ops-data");
}

// Same refusal, message and code as the core's UnsafeDataRootError: an override
// names a folder on purpose, so it is refused rather than silently redirected.
function explicitRoot(root, source, env) {
  if (!isPluginInstallCopy(root, env)) return root;
  const err = new Error(
    `${source} points inside a Claude Code plugin install (${root}), which Claude Code replaces on every plugin update. ` +
      `Set it to a folder outside ~/.claude/plugins, or remove it to use ${pluginDefaultDataRoot()}.`,
  );
  err.name = "UnsafeDataRootError";
  err.code = "CAREER_OPS_UNSAFE_DATA_ROOT";
  err.root = root;
  err.source = source;
  throw err;
}

/**
 * Resolve the career-ops data root, matching the core's `path-resolver.mjs`
 * EXACTLY.
 *
 * WHY THIS EXISTS — the divergence it closes:
 *
 * `web/`'s resolver honored only `CAREER_OPS_ROOT`, then fell back to the
 * parent directory. The core honors `CAREER_OPS_ROOT` → `CAREER_OPS_DATA_DIR`
 * → a `.career-ops-data` marker file → `~/career-ops-data` when its directory
 * is a Claude Code plugin install copy → its own directory (AGENTS.md, "Path
 * Resolution Override & Precedence"). A user with a marker file therefore had
 * the CLI and the web app reading two different data roots, with nothing
 * reporting the disagreement.
 *
 * THE SUBTLE HALF — the resolution BASE, not just the order:
 *
 * `path-resolver.mjs` resolves relative values against `__dirname`, i.e. the
 * CORE CHECKOUT. `web/` runs with `process.cwd() === <core>/web`, so resolving
 * a relative value against the cwd points one directory too deep. A marker
 * containing `../shared-data` would mean `<core>/../shared-data` to the CLI and
 * `<core>/web/../shared-data` — i.e. `<core>/shared-data` — to the web app.
 * Same string, two directories, no error. `coreRoot` is therefore a required
 * argument here: it is the one value that must agree with the core's
 * `__dirname`, and making it explicit keeps it from being silently re-derived.
 *
 * NOT IMPLEMENTED BY IMPORTING THE CORE, deliberately: `path-resolver.mjs`
 * derives `__dirname` from `import.meta.url`. Bundled into the Next server
 * output, that URL becomes the bundle's location rather than the checkout's, so
 * importing it would resolve relative values against `.next/server/...`. The
 * import would look more DRY and be silently wrong. `tests/lib/data-root.test.mjs`
 * pins the two implementations together instead.
 *
 * Absolute env values and marker contents are unaffected by the base —
 * `path.resolve` returns an absolute input unchanged. The plugin branches are
 * the exception to "nothing moves": an override that lands inside a plugin
 * install copy throws, and a code root that is one defaults to
 * `~/career-ops-data`.
 *
 * @param {string} coreRoot Absolute path to the career-ops code root: the checkout, or a plugin install copy (path-resolver's `__dirname`).
 * @param {(p: string) => string | null} readMarker Reads a file, or null when absent/unreadable.
 * @param {NodeJS.ProcessEnv} env
 * @param {(...parts: string[]) => string} resolve `path.resolve`
 * @param {(...parts: string[]) => string} join `path.join`
 * @returns {string} Absolute data root.
 * @throws {Error} code `CAREER_OPS_UNSAFE_DATA_ROOT` when the environment or the
 *   marker names a folder inside a plugin install copy.
 */
export function resolveDataRoot(coreRoot, readMarker, env, resolve, join) {
  // Precedence order is the core's, including CAREER_OPS_ROOT winning over
  // CAREER_OPS_DATA_DIR when both are set.
  const fromEnv = env.CAREER_OPS_ROOT?.trim() || env.CAREER_OPS_DATA_DIR?.trim();
  if (fromEnv) {
    return explicitRoot(resolve(coreRoot, fromEnv), env.CAREER_OPS_ROOT?.trim() ? "CAREER_OPS_ROOT" : "CAREER_OPS_DATA_DIR", env);
  }

  const marker = readMarker(join(coreRoot, ".career-ops-data"));
  if (marker) {
    const content = marker.trim();
    // An empty or whitespace-only marker is not a root — the core falls through
    // to its default rather than resolving to `coreRoot` by accident, and a
    // disagreement here would be invisible.
    if (content) return explicitRoot(resolve(coreRoot, content), "The .career-ops-data marker", env);
  }

  return isPluginInstallCopy(coreRoot, env) ? pluginDefaultDataRoot() : coreRoot;
}
