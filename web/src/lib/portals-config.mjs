import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import * as yaml from "js-yaml";

/**
 * A configuration error that lets the route distinguish a broken user-layer
 * file (409: the user must repair it) from an installation/read failure (500).
 */
export class PortalsConfigError extends Error {
  /**
   * @param {string} message
   * @param {"invalid-user-config" | "read-failed" | "invalid-template"} kind
   * @param {unknown} [cause]
   */
  constructor(message, kind, cause) {
    super(message, { cause });
    this.name = "PortalsConfigError";
    this.kind = kind;
  }
}

/** @param {unknown} value */
export function isMapping(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Load portals.yml without treating parse/read failures as a missing file.
 * The shipped template is used only when the user-layer file is absent.
 *
 * @param {string} file
 * @param {string} templateFile
 * @returns {{ doc: Record<string, unknown>, seeded: boolean, source: string }}
 */
export function loadPortalsDocument(file, templateFile) {
  let source;
  let seeded = false;

  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") {
      throw new PortalsConfigError("could not read portals.yml", "read-failed", error);
    }

    seeded = true;
    try {
      source = fs.readFileSync(templateFile, "utf8");
    } catch (templateError) {
      throw new PortalsConfigError("could not read portals template", "read-failed", templateError);
    }
  }

  let parsed;
  try {
    parsed = yaml.load(source);
  } catch (error) {
    throw new PortalsConfigError(
      seeded ? "portals template contains invalid YAML" : "portals.yml contains invalid YAML",
      seeded ? "invalid-template" : "invalid-user-config",
      error,
    );
  }

  if (!isMapping(parsed)) {
    throw new PortalsConfigError(
      seeded ? "portals template must contain a YAML mapping" : "portals.yml must contain a YAML mapping",
      seeded ? "invalid-template" : "invalid-user-config",
    );
  }

  return { doc: parsed, seeded, source };
}

/**
 * Return a merge-safe document that changes only the filters owned by the web
 * onboarding flow. All scanner sources and user customizations are preserved.
 *
 * @param {Record<string, unknown>} doc
 * @param {string[]} roles
 * @param {string[] | undefined} locations
 */
export function mergePortalFilters(doc, roles, locations) {
  const merged = { ...doc };
  const titleFilter = isMapping(doc.title_filter) ? { ...doc.title_filter } : {};
  titleFilter.positive = [...roles];
  merged.title_filter = titleFilter;

  if (locations?.length) {
    const locationFilter = isMapping(doc.location_filter) ? { ...doc.location_filter } : {};
    locationFilter.allow = [...locations];
    merged.location_filter = locationFilter;
  }

  return merged;
}

const isTopLevelKey = (line) => /^[^\s#-]/.test(line);
const isNote = (line) => line.trim() === "" || line.trim().startsWith("#");
const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Replace (or add) one list, `section.key`, in portals.yml text, line by line,
 * so every other line, comments included, stays byte-for-byte. Returns null
 * for a shape this edit does not handle (a flow-style section, a scalar
 * value), so the caller can fall back.
 *
 * @param {string[]} lines - edited in place.
 * @param {string} section
 * @param {string} key
 * @param {string[]} items
 * @returns {string[] | null}
 */
export function setListInText(lines, section, key, items) {
  const keyLine = (indent) => `${indent}${key}:${items.length ? "" : " []"}`;
  const head = lines.findIndex((l) => new RegExp(`^${section}:\\s*(#.*)?$`).test(l));
  if (head < 0) {
    if (lines.some((l) => l.startsWith(`${section}:`))) return null; // flow style or a value on the same line
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push(`${section}:`, keyLine("  "), ...items.map((i) => `    - ${JSON.stringify(i)}`), "");
    return lines;
  }
  let end = head + 1;
  while (end < lines.length && !isTopLevelKey(lines[end])) end++;
  const child = lines.slice(head + 1, end).find((l) => !isNote(l));
  const childIndent = child ? " ".repeat(indentOf(child)) : "  ";
  const at = lines.findIndex((l, i) => i > head && i < end && l.startsWith(`${childIndent}${key}:`));
  if (at < 0) {
    lines.splice(head + 1, 0, keyLine(childIndent), ...items.map((i) => `${childIndent}  - ${JSON.stringify(i)}`));
    return lines;
  }
  const value = lines[at].slice(childIndent.length + key.length + 1).replace(/\s+#.*$/, "").trim();
  if (value !== "" && !/^\[.*\]$/.test(value)) return null;
  // The list's own lines: everything more indented than the key, up to its last
  // item. Notes after the last item are left where they are.
  let last = at;
  for (let i = at + 1; i < end; i++) {
    if (isNote(lines[i])) continue;
    const sameIndentItem = indentOf(lines[i]) === childIndent.length && lines[i].trimStart().startsWith("- ");
    if (indentOf(lines[i]) <= childIndent.length && !sameIndentItem) break;
    last = i;
  }
  const body = lines.slice(at + 1, last + 1);
  const firstItem = body.find((l) => !isNote(l));
  const itemIndent = firstItem ? " ".repeat(indentOf(firstItem)) : `${childIndent}  `;
  const itemOf = (line) => {
    if (!line.trimStart().startsWith("- ")) return undefined;
    try {
      const item = yaml.load(line.trimStart().slice(2));
      return typeof item === "string" ? item : undefined;
    } catch {
      return undefined;
    }
  };
  const fresh = (item) => `${itemIndent}- ${JSON.stringify(item)}`;
  // Every line that stays keeps its place and its text, so a note stays beside the
  // items it describes and a comment after an item survives. A new item goes
  // after the item it follows in `items`.
  const stays = new Map();
  const kept = body.filter((line) => {
    if (isNote(line)) return true;
    const item = itemOf(line);
    if (item === undefined || !items.includes(item) || stays.has(item)) return false;
    stays.set(item, line);
    return true;
  });
  const wanted = items.filter((item) => stays.has(item));
  const inOrder = wanted.length === stays.size && [...stays.keys()].every((item, n) => item === wanted[n]);
  let next;
  if (inOrder) {
    next = [];
    let n = 0;
    const addNew = () => {
      while (n < items.length && !stays.has(items[n])) next.push(fresh(items[n++]));
    };
    for (const line of kept) {
      if (isNote(line)) next.push(line);
      else {
        addNew();
        next.push(line);
        n++;
        addNew();
      }
    }
    addNew();
  } else {
    // A reordered list cannot keep its lines in place: its notes then go ahead of the items.
    next = [...body.filter(isNote), ...items.map((item) => stays.get(item) ?? fresh(item))];
  }
  const keyComment = (lines[at].match(/\s+#.*$/) ?? [""])[0];
  lines.splice(at, last - at + 1, keyLine(childIndent) + keyComment, ...next);
  return lines;
}

/**
 * portals.yml text with the web-owned filters replaced, keeping every comment
 * and every commented-out company block. A round-trip through yaml.dump would
 * drop all of them (fix-slugs.mjs edits this file as text for the same reason).
 * The result must parse to exactly `mergePortalFilters(doc, ...)`; when it does
 * not, or the file uses a shape the line edit does not handle, this returns
 * null and the caller falls back to serializing the merged document.
 *
 * @param {string} source - the text loadPortalsDocument parsed.
 * @param {string[]} roles
 * @param {string[] | undefined} locations
 * @returns {string | null}
 */
export function patchPortalFiltersText(source, roles, locations) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  let lines = source.split(/\r?\n/);
  lines = setListInText(lines, "title_filter", "positive", roles);
  if (lines && locations?.length) lines = setListInText(lines, "location_filter", "allow", locations);
  if (!lines) return null;
  const text = lines.join(eol);
  try {
    const expected = mergePortalFilters(/** @type {Record<string, unknown>} */ (yaml.load(source)), roles, locations);
    return isDeepStrictEqual(yaml.load(text), expected) ? text : null;
  } catch {
    return null;
  }
}

/**
 * The tracked_companies entries whose `name` is exactly `name`, untrimmed:
 * zero means no such company, more than one means the edit cannot tell them apart.
 *
 * @param {Record<string, unknown>} doc
 * @param {string} name
 */
export function companiesNamed(doc, name) {
  return (Array.isArray(doc.tracked_companies) ? doc.tracked_companies : []).filter((c) => isMapping(c) && c.name === name);
}

/**
 * portals.yml text with one tracked company's `enabled:` set, every other line
 * and line ending byte for byte. Returns null when the file is not valid YAML,
 * when the name matches zero or several entries, when the entry is flow style,
 * or when the result does not parse to the intended document.
 *
 * @param {string} source
 * @param {string} name
 * @param {boolean} enabled
 * @returns {string | null}
 */
export function setCompanyEnabledText(source, name, enabled) {
  let doc;
  try {
    doc = yaml.load(source);
  } catch {
    return null;
  }
  if (!isMapping(doc) || companiesNamed(doc, name).length !== 1) return null;
  // Lines and their endings apart, so a file with mixed endings keeps each one.
  const parts = source.split(/(\r?\n)/);
  const lines = parts.filter((_, i) => i % 2 === 0);
  const eols = parts.filter((_, i) => i % 2 === 1);
  const head = lines.findIndex((l) => /^tracked_companies:\s*(#.*)?$/.test(l));
  if (head < 0) return null;
  let end = head + 1;
  while (end < lines.length && !isTopLevelKey(lines[end])) end++;
  const valueOf = (rest) => {
    try {
      return yaml.load(rest);
    } catch {
      return undefined;
    }
  };
  const hits = [];
  for (let i = head + 1; i < end; i++) {
    const m = lines[i].match(/^(\s*(?:- )?)name:\s(.*)$/);
    if (m && valueOf(m[2]) === name) hits.push({ at: i, indent: " ".repeat(m[1].length) });
  }
  if (hits.length !== 1) return null;
  const { at, indent } = hits[0];
  // The entry runs from its dash line to the first line left of its keys' column.
  const opensEntry = (line) => /^\s*-(\s|$)/.test(line) && indentOf(line) < indent.length;
  let start = at;
  while (start > head + 1 && !opensEntry(lines[start])) start--;
  let stop = at + 1;
  while (stop < end && (isNote(lines[stop]) || indentOf(lines[stop]) >= indent.length)) stop++;
  let flag = -1;
  let found = null;
  for (let i = start; i < stop && flag < 0; i++) {
    found = lines[i].match(/^(\s*(?:- )?)enabled:/);
    if (found && found[1].length === indent.length) flag = i;
  }
  if (flag < 0) {
    lines.splice(at + 1, 0, `${indent}enabled: ${enabled}`);
    eols.splice(at, 0, eols[at] ?? eols[at - 1] ?? "\n");
  } else lines[flag] = `${found[1]}enabled: ${enabled}${(lines[flag].match(/\s+#.*$/) ?? [""])[0]}`;
  const text = lines.map((line, i) => line + (eols[i] ?? "")).join("");
  companiesNamed(doc, name)[0].enabled = enabled;
  try {
    return isDeepStrictEqual(yaml.load(text), doc) ? text : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {{ name: string, enabled: boolean, host: string }} WatchedCompany
 */

/**
 * The companies in tracked_companies, scanned ones first, so the Portals page
 * can list them before any health check runs.
 *
 * @param {Record<string, unknown>} doc
 * @returns {WatchedCompany[]}
 */
export function watchedCompanies(doc) {
  const list = Array.isArray(doc.tracked_companies) ? doc.tracked_companies : [];
  const hostOf = (url) => {
    try {
      return new URL(String(url)).host;
    } catch {
      return "";
    }
  };
  return list
    .filter((c) => isMapping(c) && typeof c.name === "string" && c.name.trim())
    // The exact name: the Portals switch sends it back, and "Acme " is not "Acme".
    .map((c) => ({ name: c.name, enabled: c.enabled !== false, host: hostOf(c.careers_url ?? c.api) }))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled));
}
