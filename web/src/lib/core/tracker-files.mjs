import fs from "node:fs";
import path from "node:path";

// The tracker path as given, before symlinks are resolved: path-resolver.mjs
// `rawTrackerPath`, made absolute.
function rawTrackerPath(root) {
  const override = process.env.CAREER_OPS_TRACKER?.trim();
  if (override) return path.resolve(override);
  const inData = path.join(root, "data/applications.md");
  const atRoot = path.join(root, "applications.md");
  // Neither file exists: read where core writes.
  return path.resolve(!fs.existsSync(inData) && fs.existsSync(atRoot) ? atRoot : inData);
}

// Synchronous mirror of path-resolver.mjs for the synchronous web readers.
// tracker-files.test.mjs checks parity against the core resolver, including
// overrides, legacy layouts, and symlinks.
export function resolveTrackerPath(root) {
  const candidate = rawTrackerPath(root);
  try {
    return fs.realpathSync(candidate);
  } catch {
    return candidate;
  }
}

// Folders the tracker's relative links resolve from, same as tracker-utils.mjs
// `trackerLinkDirsFor`: the realpathed tracker's folder, then the folder of the
// path as given. They differ for a symlinked tracker file, whose links an
// editor resolves from the link's folder (#5374).
export function trackerLinkDirs(root) {
  return [...new Set([path.dirname(resolveTrackerPath(root)), path.dirname(rawTrackerPath(root))])];
}

export function readTrackerFile(root, sibling) {
  const tracker = resolveTrackerPath(root);
  const file = sibling ? path.join(path.dirname(tracker), sibling) : tracker;
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
