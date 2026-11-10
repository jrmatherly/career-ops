// lib/settings-env.mjs — puts the settings saved from the dashboard onto
// process.env, so a saved value wins in every script, terminal runs included.
//
// Import it for its side effect, first, in any module that reads a setting the
// registry lists as `env`: some readers read their variable while they load.
// tests/settings-overlay-coverage.test.mjs fails on a reader that does not.
//
// It never throws and never writes. CAREER_OPS_SETTINGS=off skips it; that only
// works exported in the shell, because this runs before any .env is read.

import { getCareerOpsRoot } from '../path-resolver.mjs';
import { SETTINGS_FILE, overlayFor, readSettings } from './settings-store.mjs';

const warn = (line) => process.stderr.write(`settings: ${line}\n`);

/**
 * @param {NodeJS.ProcessEnv} [env] the environment to write onto
 * @param {string} [root] data root; resolved from the process when omitted
 * @returns {{ applied: string[], skipped: { id: string, reason: string }[] }}
 */
export function applySettings(env = process.env, root) {
  const none = { applied: [], skipped: [] };
  if (env.CAREER_OPS_SETTINGS === 'off') return none;
  try {
    const { values, error } = readSettings(root ?? getCareerOpsRoot());
    if (error) {
      warn(`${SETTINGS_FILE} ${error}; saved settings are not applied`);
      return none;
    }
    const { env: overlay, skipped } = overlayFor(values);
    Object.assign(env, overlay);
    // The file is hand-editable: an id the registry does not know is quoted, so it cannot write control characters to the terminal.
    for (const { id, reason } of skipped) warn(`${/^\w+$/.test(id) ? id : JSON.stringify(id)} ${reason}; using the environment value`);
    return { applied: Object.keys(overlay), skipped };
  } catch {
    // An unsafe data root, or a closed stderr: a scan must still run.
    return none;
  }
}

applySettings();
