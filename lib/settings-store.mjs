// lib/settings-store.mjs — reads {DATA_ROOT}/config/settings.json, the values
// saved from the dashboard, and works out what to apply and what to write.
//
// It never writes: the caller owns the write, so the overlay stays read-only.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envString, settingById, validateSetting } from './settings-registry.mjs';

export const SETTINGS_FILE = 'config/settings.json';

/** @param {string} root */
export const settingsPath = (root) => join(root, SETTINGS_FILE);

/** True when CAREER_OPS_SETTINGS=off (any case) tells scripts to ignore saved settings. @param {NodeJS.ProcessEnv} env */
export const settingsOff = (env) => String(env.CAREER_OPS_SETTINGS ?? '').trim().toLowerCase() === 'off';

export class SettingsError extends Error {
  /**
   * @param {'malformed'|'invalid'} code
   * @param {string} message
   * @param {Record<string, string>} [errors] per-id messages for `invalid`
   */
  constructor(code, message, errors) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
    if (errors) this.errors = errors;
  }
}

/**
 * @param {string|null} text file contents, or null when the file is absent
 * @returns {{ values: Record<string, unknown>, error: string|null }}
 */
export function parseSettings(text) {
  if (text === null) return { values: {}, error: null };
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { values: {}, error: `is not valid JSON (${e.message})` };
  }
  // A later format may change what `values` means, so an older checkout must not apply it.
  if (doc?.version !== undefined && doc.version !== 1) return { values: {}, error: `has version ${JSON.stringify(doc.version)}; this career-ops reads version 1` };
  const values = doc?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { values: {}, error: 'must be an object with a "values" object' };
  }
  return { values, error: null };
}

/**
 * @param {string} root data root
 * @returns {{ values: Record<string, unknown>, text: string|null, error: string|null }}
 */
export function readSettings(root) {
  let text;
  try {
    text = readFileSync(settingsPath(root), 'utf8');
  } catch (e) {
    return { values: {}, text: null, error: e.code === 'ENOENT' ? null : `cannot be read (${e.message})` };
  }
  return { ...parseSettings(text), text };
}

/**
 * The environment a set of saved values stands for. A value the registry does
 * not accept is skipped, never applied: the file is hand-editable.
 *
 * @param {Record<string, unknown>} values
 * @returns {{ env: Record<string, string>, skipped: { id: string, reason: string }[] }}
 */
export function overlayFor(values) {
  const env = {};
  const skipped = [];
  for (const [id, raw] of Object.entries(values)) {
    const setting = settingById(id);
    const checked = !setting ? { ok: false, error: 'is not a setting' }
      : setting.kind !== 'env' ? { ok: false, error: 'cannot be saved here' }
        : validateSetting(setting, raw);
    if (checked.ok) env[id] = envString(setting, checked.value);
    else skipped.push({ id, reason: checked.error });
  }
  return { env, skipped };
}

/**
 * The file text after applying `changes` (a null value removes the id).
 *
 * @param {string|null} text current file contents, or null when absent
 * @param {Record<string, unknown>} changes
 * @returns {string}
 * @throws {SettingsError} `malformed` when the current file cannot be parsed, `invalid` with per-id errors
 */
export function nextSettingsText(text, changes) {
  const current = parseSettings(text);
  if (current.error) throw new SettingsError('malformed', `${SETTINGS_FILE} ${current.error}`);
  const values = { ...current.values };
  const errors = [];
  for (const [id, raw] of Object.entries(changes)) {
    const setting = settingById(id);
    // A reset removes any saved id, so one a later release dropped can be cleared.
    if (raw === null && (!setting || setting.kind === 'env')) delete values[id];
    else if (!setting) errors.push([id, 'is not a setting']);
    else if (setting.kind !== 'env') errors.push([id, 'cannot be changed here']);
    else {
      const checked = validateSetting(setting, raw);
      if (checked.ok) values[id] = checked.value;
      else errors.push([id, checked.error]);
    }
  }
  // fromEntries, not assignment: an id of __proto__ must be reported, not swallowed.
  if (errors.length) throw new SettingsError('invalid', 'some settings were not accepted', Object.fromEntries(errors));
  return `${JSON.stringify({ version: 1, values }, null, 2)}\n`;
}
