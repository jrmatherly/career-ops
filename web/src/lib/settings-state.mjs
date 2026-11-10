import { createHash } from "node:crypto";

/**
 * @typedef {'saved'|'environment'|'dotenv'|'default'|'file'|'unset'} SettingSource
 * @typedef {{ value: unknown, source: SettingSource, editable: boolean, error?: string, values?: string[] }} RowState
 */

/** A short fingerprint of a file's text, so a save can tell the file changed under it. @param {string|null} text */
export function revisionOf(text) {
  return text === null ? "absent" : createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const nonEmpty = (v) => typeof v === "string" && v !== "";
const isMapping = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const FILES = { profile: "config/profile.yml", portals: "portals.yml" };

// The scanner reads a filter block with no `enabled` key as on (scan.mjs, visaEnabled and experienceBlock).
const FILTER_ENABLED = {
  "portals:visa_filter.enabled": (block) => block.enabled !== false,
  "portals:experience_filter.enabled": (block) => block.enabled === undefined || block.enabled === true,
};

function envRow(setting, input, savedOn) {
  const { id } = setting;
  let source;
  let raw;
  const text = (s) => (setting.type !== "bool" ? s : setting.on === "words" ? TRUTHY.has(s.trim().toLowerCase()) : s !== "0");
  if (savedOn && Object.hasOwn(input.stored, id)) [source, raw] = ["saved", input.stored[id]];
  else if (nonEmpty(input.env[id])) [source, raw] = ["environment", text(input.env[id])];
  else if (setting.dotenv && nonEmpty(input.dotenv[id])) [source, raw] = ["dotenv", text(input.dotenv[id])];
  else if (setting.default !== undefined) return { value: setting.default, source: "default", editable: savedOn };
  else return { value: null, source: "unset", editable: savedOn };
  const checked = input.validateSetting(setting, raw);
  if (checked.ok) return { value: checked.value, source, editable: savedOn };
  // A URL is refused when it carries credentials, so a refused one is never shown.
  return { value: setting.type === "url" ? null : raw, source, editable: savedOn, error: checked.error };
}

function readonlyRow(setting, input) {
  const raw = input.env[setting.id];
  const set = nonEmpty(raw);
  const source = set ? "environment" : "unset";
  if (setting.display === "set") return { value: set, source, editable: false };
  if (setting.id === "CAREER_OPS_ROOT") return { value: input.dataRoot, source: set ? "environment" : "default", editable: false };
  if (!set) return { value: null, source, editable: false };
  return { value: setting.display === "origin" ? (URL.parse(raw)?.origin ?? "set") : raw, source, editable: false };
}

function fileRow(setting, input) {
  const doc = input[setting.kind];
  const fallback = setting.default === undefined ? { value: null, source: "unset" } : { value: setting.default, source: "default" };
  if (!isMapping(doc)) return { ...fallback, editable: false, error: input.fileErrors?.[setting.kind] ?? `${FILES[setting.kind]} is missing or unreadable` };
  const path = setting.id.slice(setting.id.indexOf(":") + 1).split(".");
  const filterEnabled = FILTER_ENABLED[setting.id];
  if (filterEnabled) {
    const block = doc[path[0]];
    return isMapping(block) ? { value: filterEnabled(block), source: "file", editable: true } : { ...fallback, editable: true };
  }
  const value = path.reduce((at, key) => (isMapping(at) ? at[key] : undefined), doc);
  const row = value === undefined || value === null ? { ...fallback, editable: true } : { value, source: "file", editable: true };
  if (setting.id !== "profile:language.modes_dir") return row;
  if (Array.isArray(value)) return { ...row, editable: false, error: `set to a list in ${FILES.profile}; edit it there` };
  return { ...row, values: input.modesDirs };
}

/**
 * What the Settings page renders: each setting with its effective value and where that value comes from.
 *
 * @param {{ groups: { id: string, label: string }[], settings: object[], validateSetting: Function,
 *   stored: Record<string, unknown>, fileError: string|null, overlayDisabled: boolean,
 *   env: Record<string, string|undefined>, dotenv: Record<string, string>, profile: unknown, portals: unknown,
 *   modesDirs: string[], dataRoot: string, fileErrors?: { profile?: string|null, portals?: string|null } }} input
 *   `fileErrors` says why `profile` or `portals` is not a mapping: missing, unreadable, or not valid YAML.
 */
export function buildSettingsState(input) {
  const savedOn = !input.fileError && !input.overlayDisabled;
  const row = (setting) => {
    if (setting.kind === "env") return envRow(setting, input, savedOn);
    if (setting.kind === "readonly") return readonlyRow(setting, input);
    if (setting.kind === "secret") {
      // The value never leaves the server, only whether and where it is set.
      const source = nonEmpty(input.env[setting.id]) ? "environment" : nonEmpty(input.dotenv[setting.id]) ? "dotenv" : "unset";
      return { value: null, source, editable: false };
    }
    return fileRow(setting, input);
  };
  const groups = input.groups
    .map((g) => ({ id: g.id, label: g.label, settings: input.settings.filter((s) => s.group === g.id).map((s) => ({ ...s, ...row(s) })) }))
    .filter((g) => g.settings.length > 0);
  return { groups };
}

/**
 * Sort a change set by where each change is written.
 *
 * @param {Record<string, unknown>} changes
 * @param {(id: string) => { kind: string } | undefined} settingById
 */
export function splitChanges(changes, settingById) {
  const out = { env: [], profile: [], portals: [], errors: [] };
  for (const [id, value] of Object.entries(changes)) {
    const kind = settingById(id)?.kind;
    if (!kind) out.errors.push([id, "is not a setting"]);
    else if (!Object.hasOwn(FILES, kind) && kind !== "env") out.errors.push([id, "cannot be changed here"]);
    else out[kind].push([id, value]);
  }
  // fromEntries, not assignment: an id of __proto__ must be reported, not swallowed.
  return { env: Object.fromEntries(out.env), profile: Object.fromEntries(out.profile), portals: Object.fromEntries(out.portals), errors: Object.fromEntries(out.errors) };
}
