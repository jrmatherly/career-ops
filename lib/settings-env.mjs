// lib/settings-env.mjs — puts the settings saved from the dashboard onto
// process.env, so a saved value wins in every script, terminal runs included.
//
// Import it for its side effect, first, in any module that reads a setting the
// registry lists as `env`: some readers read their variable while they load.
// tests/settings-overlay-coverage.test.mjs fails on a reader that does not.
//
// It never throws and never writes. CAREER_OPS_SETTINGS=off applies nothing but still undoes an inherited overlay; that only
// works exported in the shell, because this runs before any .env is read.

import { UnsafeDataRootError, getCareerOpsRoot } from '../path-resolver.mjs';
import { OVERLAY_MARK, overlayFor, readSettings, settingsOff, settingsPath, undoOverlay } from './settings-store.mjs';

const warn = (line) => process.stderr.write(`settings: ${line}\n`);

/**
 * @param {NodeJS.ProcessEnv} [env] the environment to write onto
 * @param {string} [root] data root; resolved from the process when omitted
 * @returns {{ applied: string[], skipped: { id: string, reason: string }[] }}
 */
export function applySettings(env = process.env, root) {
  const none = { applied: [], skipped: [] };
  try {
    undoOverlay(env);
    if (settingsOff(env)) return none;
    root ??= getCareerOpsRoot();
    const { values, error } = readSettings(root);
    if (error) {
      warn(`${settingsPath(root)} ${error}; saved settings are not applied`);
      return none;
    }
    const { env: overlay, skipped } = overlayFor(values);
    const applied = Object.keys(overlay);
    if (applied.length) env[OVERLAY_MARK] = JSON.stringify(Object.fromEntries(applied.map((id) => [id, [overlay[id], env[id] ?? null]])));
    Object.assign(env, overlay);
    // The file is hand-editable: an id the registry does not know is quoted, so it cannot write control characters to the terminal.
    for (const { id, reason } of skipped) warn(`${/^\w+$/.test(id) ? id : JSON.stringify(id)} ${reason}; using the environment value`);
    return { applied, skipped };
  } catch (err) {
    // A scan must still run. A refused data root is reported by the script itself;
    // anything else is a bug here, so say that saved settings are not in effect.
    if (!(err instanceof UnsafeDataRootError)) {
      try { warn(`saved settings could not be applied (${err?.message ?? err})`); } catch { /* stderr is closed */ }
    }
    return none;
  }
}

applySettings();
