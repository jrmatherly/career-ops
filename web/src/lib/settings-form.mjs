/**
 * @typedef {'saved'|'environment'|'dotenv'|'default'|'file'|'unset'} SettingSource
 * @typedef {{ id: string, kind: 'env'|'profile'|'portals'|'secret'|'readonly', label: string, help: string,
 *   type?: 'int'|'number'|'bool'|'enum'|'string'|'url'|'list', min?: number, max?: number, step?: number, values?: string[],
 *   display?: 'value'|'set'|'origin', value: unknown, source: SettingSource, editable: boolean, error?: string }} SettingState
 * @typedef {{ id: string, label: string, settings: SettingState[] }} SettingsGroup
 * @typedef {{ revision: { settings: string, profile: string, portals: string }, groups: SettingsGroup[], fileError: string|null, envFileError: string|null, overlayDisabled: boolean }} SettingsResponse
 */

/** Fired on window after a save from outside the settings sections, so they reload before their next save. */
export const SETTINGS_SAVED_EVENT = "career-ops:settings-saved";

export const SOURCE_LABELS = { saved: "Saved here", environment: "From environment", dotenv: "From .env", default: "Default", unset: "Not set" };

/** @param {SettingState} state */
export function sourceLabel(state) {
  if (state.source === "file") return state.kind === "profile" ? "From profile.yml" : "From portals.yml";
  return SOURCE_LABELS[state.source];
}

/** @param {SettingState} state @returns {'Set, from environment'|'Set, from .env'|'Not set'} */
export function secretStatus(state) {
  return state.source === "environment" ? "Set, from environment" : state.source === "dotenv" ? "Set, from .env" : "Not set";
}

/** What a row's control holds for its current value. @param {SettingState} state @returns {string|boolean|string[]} */
export function formValue(state) {
  if (state.type === "bool") return state.value === true;
  if (state.type === "list") return Array.isArray(state.value) ? state.value.map(String) : [];
  return state.value === null || state.value === undefined ? "" : String(state.value);
}

/**
 * What a control's value means as a change. An empty field is null, a reset.
 * Text that is not a number is sent as typed, so the server says what is wrong with it.
 *
 * @param {SettingState} state
 * @param {string|boolean|string[]} value
 */
export function parseFormValue(state, value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "") return null;
  return (state.type === "int" || state.type === "number") && /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}

const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((item, i) => item === b[i]) : a === b);

/**
 * The changes a section's Save sends: only rows whose control differs from the loaded value.
 *
 * @param {SettingState[]} states
 * @param {Record<string, string|boolean|string[]>} form control values by id; an untouched row is absent
 * @returns {Record<string, unknown>}
 */
export function dirtyChanges(states, form) {
  const changes = {};
  for (const state of states) {
    if (!state.editable || !Object.hasOwn(form, state.id)) continue;
    const next = parseFormValue(state, form[state.id]);
    // Emptying a field resets a saved value; on a row with nothing saved there is nothing to reset.
    if (next === null ? state.source === "saved" : !same(next, parseFormValue(state, formValue(state)))) changes[state.id] = next;
  }
  return changes;
}
