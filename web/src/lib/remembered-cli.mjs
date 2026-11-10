import fs from "node:fs";
import path from "node:path";

const LINE = /^\s*(?:export\s+)?CAREER_OPS_CLI\s*=\s*(.*?)\s*$/;

/** A .env value as dotenv reads it: the text inside matching quotes, else the text before a `#` comment. */
function unquote(raw) {
  const quoted = /^(['"`])(.*?)\1/.exec(raw);
  return quoted ? quoted[2] : raw.replace(/#.*$/, "").trim();
}

/**
 * The CLI saved from the Settings page, or null. The file rules are a copy of lib/settings-store.mjs,
 * which lives in the engine checkout and loads only asynchronously. The id is not checked against the
 * registry: the caller keeps it only when that CLI is installed.
 */
function savedCli(root, env) {
  if (String(env.CAREER_OPS_SETTINGS ?? "").trim().toLowerCase() === "off") return null;
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(root, "config", "settings.json"), "utf8"));
    const cli = doc.version === undefined || doc.version === 1 ? doc.values?.CAREER_OPS_CLI : null;
    return typeof cli === "string" && cli ? cli : null;
  } catch {
    return null;
  }
}

/** env.CAREER_OPS_CLI, or what it was before the settings overlay replaced it in this process (a saved value since reset must not live on). */
function shellCli(env) {
  try {
    const pair = JSON.parse(env.CAREER_OPS_SETTINGS_APPLIED ?? "null")?.CAREER_OPS_CLI;
    if (Array.isArray(pair) && pair[0] === env.CAREER_OPS_CLI) return typeof pair[1] === "string" ? pair[1] : null;
  } catch {
    // An unreadable mark changes nothing.
  }
  return env.CAREER_OPS_CLI || null;
}

/**
 * The agent CLI the user chose: the one saved from the Settings page, else
 * CAREER_OPS_CLI from the shell, else from the data root's .env (written by
 * `node remember-cli.mjs`). Null when unset. Synchronous on purpose: its caller
 * resolveCliOrFallback is.
 *
 * @param {string} root
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function readRememberedCli(root, env = process.env) {
  const chosen = savedCli(root, env) ?? shellCli(env);
  if (chosen) return chosen;
  let text;
  try {
    text = fs.readFileSync(path.join(root, ".env"), "utf8");
  } catch {
    return null;
  }
  let value = null;
  for (const line of text.split("\n")) {
    const m = LINE.exec(line);
    if (m) value = unquote(m[1]) || null;
  }
  return value;
}
