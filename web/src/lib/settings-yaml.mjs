import * as yaml from "js-yaml";
import { isMapping, setListInText } from "./portals-config.mjs";
import { patchProfileText } from "./profile-yaml-edit.mjs";

/**
 * Parse a user's YAML file. A file with nothing but comments and blank lines is
 * an empty mapping: js-yaml throws on it, and it is how a profile starts out.
 *
 * @param {string} text
 */
export const loadYamlDoc = (text) => (text.split(/\r?\n/).every((line) => /^\s*(#.*)?$/.test(line)) ? {} : yaml.load(text));

const UNEDITABLE = { error: "could not be edited without rewriting the file; edit it by hand" };

/**
 * Apply settings changes to profile.yml or portals.yml text, keeping every
 * comment. A shape the text editors do not place is refused, never dumped.
 *
 * @param {string} source
 * @param {{ path: string[], value: unknown }[]} changes
 * @returns {{ text: string, doc: unknown } | { error: string }}
 */
export function applyYamlChanges(source, changes) {
  let doc;
  try {
    doc = loadYamlDoc(source);
  } catch {
    return { error: "is not valid YAML" };
  }
  if (!isMapping(doc)) return { error: "is not a YAML mapping" };

  const expected = structuredClone(doc);
  const patch = {};
  let lines = source.split(/\r?\n/);
  for (const { path, value } of changes) {
    const [head, key] = path;
    if (path.length === 1) {
      expected[head] = value;
      patch[head] = value;
      continue;
    }
    if (expected[head] === undefined || expected[head] === null) expected[head] = {};
    if (path.length !== 2 || !isMapping(expected[head])) return UNEDITABLE;
    expected[head][key] = value;
    if (Array.isArray(value)) {
      lines = setListInText(lines, head, key, value);
      if (!lines) return UNEDITABLE;
    } else {
      patch[head] = { ...patch[head], [key]: value };
    }
  }
  // patchProfileText also checks the whole text, list edits included, parses to `expected`.
  const text = patchProfileText(lines.join(source.includes("\r\n") ? "\r\n" : "\n"), patch, expected);
  return text === null ? UNEDITABLE : { text, doc: expected };
}
