import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import * as yaml from "js-yaml";
import { careerOpsRoot, portalsConfigPath } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { getProfilePath } from "@/lib/core/profile-path.mjs";
import { atomicWrite, atomicWriteWithBackup } from "@/lib/core/safe-write";
import { readJsonObject } from "@/lib/json-body";
import { coreSettings, coreValidators, envBeforeOverlay, type Finding } from "@/lib/settings-server";
import { buildSettingsState, revisionOf, splitChanges } from "@/lib/settings-state.mjs";
import { applyYamlChanges } from "@/lib/settings-yaml.mjs";
import { isMapping } from "@/lib/portals-config.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saved settings live in {DATA_ROOT}/config/settings.json. This route is the
// only writer. Nothing here writes process.env, and no secret value is read into a response.

const readText = (file: string): string | null => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

const FILES = { profile: "config/profile.yml", portals: "portals.yml" } as const;
type FileKind = keyof typeof FILES;

/** A YAML file the page edits. `error` says why `doc` is unusable; `missing` alone means onboarding never wrote it. */
type YamlFile = { file: string; label: string; text: string | null; doc: unknown; missing: boolean; error: string | null; revision: string };

function readYamlFile(kind: FileKind, file: string): YamlFile {
  const label = FILES[kind];
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const missing = code === "ENOENT";
    const error = missing ? `${label} does not exist yet` : `${label} cannot be read (${code ?? "unknown error"})`;
    return { file, label, text: null, doc: null, missing, error, revision: missing ? "absent" : "unreadable" };
  }
  const base = { file, label, text, missing: false, revision: revisionOf(text) };
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (e) {
    // The first line only: later lines quote the file's text.
    return { ...base, doc: null, error: `${label} is not valid YAML: ${String((e as Error).message).split("\n")[0]}` };
  }
  return isMapping(doc) ? { ...base, doc, error: null } : { ...base, doc: null, error: `${label} is not a YAML mapping` };
}

/** The data root .env, and why it could not be read when it exists: its keys would otherwise read as not set. */
function readDotenv(root: string): { dotenv: Record<string, string>; envFileError: string | null } {
  try {
    // Node 22.13's parseEnv keeps an inline comment on a last line with no newline. Not needed once the Node floor (engines) leaves 22.
    return { dotenv: parseEnv(`${fs.readFileSync(path.join(root, ".env"), "utf8")}\n`) as Record<string, string>, envFileError: null };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { dotenv: {}, envFileError: code === "ENOENT" ? null : `.env cannot be read (${code ?? "unknown error"})` };
  }
}

function modesDirs(): string[] {
  const modes = path.join(resolveCodeRoot(process.cwd(), process.env), "modes");
  let names: string[] = [];
  try {
    names = fs.readdirSync(modes, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(modes, d.name, "_shared.md"))).map((d) => d.name).sort();
  } catch {
    // No modes directory: only the default set is offered.
  }
  return ["modes", ...names.map((name) => `modes/${name}`)];
}

type Core = Awaited<ReturnType<typeof coreSettings>>;

function load({ registry, store }: Core) {
  const root = careerOpsRoot();
  const saved = store.readSettings(root);
  const env = envBeforeOverlay(store);
  const overlayDisabled = store.settingsOff(env);
  const fileError = saved.error ? `${store.SETTINGS_FILE} ${saved.error}` : null;
  const files = { profile: readYamlFile("profile", getProfilePath(root)), portals: readYamlFile("portals", portalsConfigPath(root)) };
  const { dotenv, envFileError } = readDotenv(root);
  const { groups } = buildSettingsState({
    groups: registry.GROUPS, settings: registry.SETTINGS, validateSetting: registry.validateSetting,
    stored: saved.values, fileError, overlayDisabled, env, dotenv,
    profile: files.profile.doc, portals: files.portals.doc, modesDirs: modesDirs(), dataRoot: root,
    fileErrors: { profile: files.profile.error, portals: files.portals.error },
  });
  const revision = { settings: revisionOf(saved.text), profile: files.profile.revision, portals: files.portals.revision };
  return { root, saved, files, state: { revision, groups, fileError, envFileError, overlayDisabled } };
}

const conflict = (error: string) => Response.json({ error }, { status: 409 });

// The message names a path and an errno, never a setting's value.
const failed = (what: string, e: unknown) => Response.json({ error: `${what} (${e instanceof Error ? e.message : String(e)})` }, { status: 500 });

export async function GET() {
  try {
    return Response.json(load(await coreSettings()).state);
  } catch (e) {
    return failed("The settings could not be read", e);
  }
}

export async function POST(req: Request) {
  try {
    return await save(req);
  } catch (e) {
    return failed("The settings could not be saved", e);
  }
}

type Change = { id: string; path: string[]; value: unknown };

const stale = (label: string) => conflict(`${label} changed since this page loaded. Reload and try again.`);

/** Error findings in `after` that `before` did not have, each on the changed ids it names, or on all of them. */
function newFindings(before: Finding[], after: Finding[], changes: Change[], errors: Record<string, string>) {
  const known = new Set(before.map((f) => f.message));
  for (const finding of after.filter((f) => !known.has(f.message))) {
    const at = finding.key ?? finding.path ?? "";
    const named = changes.filter((c) => { const p = c.path.join("."); return at === p || at.startsWith(`${p}.`) || p.startsWith(`${at}.`); });
    const message = finding.path ? `${finding.path} ${finding.message}` : finding.message;
    for (const c of named.length ? named : changes) errors[c.id] ??= message;
  }
}

async function save(req: Request): Promise<Response> {
  const body = await readJsonObject<{ revision?: Record<string, unknown>; changes?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const changes = body.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) {
    return Response.json({ error: "nothing to change" }, { status: 400 });
  }
  const core = await coreSettings();
  const { registry, store } = core;
  const split = splitChanges(changes as Record<string, unknown>, registry.settingById);
  const hasEnv = Object.keys(split.env).length > 0;
  const kinds = (["profile", "portals"] as const).filter((k) => Object.keys(split[k]).length > 0);
  const validators = kinds.length > 0 ? await coreValidators() : null;

  const { root, saved, files, state } = load(core);
  const revision = body.revision ?? {};
  const errors: Record<string, string> = { ...split.errors };
  if (hasEnv) {
    if (state.fileError) return conflict(`${state.fileError}. Fix or delete the file, then reload.`);
    if (state.overlayDisabled) return conflict("Saved settings are turned off for this server (CAREER_OPS_SETTINGS=off).");
    if (revision.settings !== state.revision.settings) return stale(store.SETTINGS_FILE);
  }
  for (const kind of kinds) {
    const f = files[kind];
    if (f.missing) return conflict(`${f.label} does not exist yet. Finish onboarding first.`);
    if (revision[kind] !== f.revision) return stale(f.label);
    if (f.text === null) return conflict(`${f.error}. It was not changed.`);
    if (f.error) return conflict(`${f.label} exists but is not ${f.error.endsWith("mapping") ? "a YAML mapping" : "valid YAML"}. It was not changed.`);
  }

  let next: string | null = null;
  if (hasEnv) {
    try {
      next = store.nextSettingsText(saved.text, split.env);
    } catch (e) {
      if (!(e instanceof store.SettingsError) || !e.errors) throw e;
      Object.assign(errors, e.errors);
    }
  }

  const rows = new Map(state.groups.flatMap((g) => g.settings).map((s) => s as unknown as { id: string; editable: boolean; error?: string; values?: string[] }).map((s) => [s.id, s]));
  const fileChanges: Record<FileKind, Change[]> = { profile: [], portals: [] };
  for (const kind of kinds) {
    for (const [id, raw] of Object.entries(split[kind])) {
      const setting = registry.settingById(id)!;
      const row = rows.get(id);
      // A modes_dir list cannot be shown as one value, so it is not replaced by one.
      if (row && !row.editable && row.error) { errors[id] = row.error; continue; }
      const checked = registry.validateSetting(setting, raw);
      if (!checked.ok) { errors[id] = checked.error; continue; }
      if (row?.values && setting.type === "string" && !row.values.includes(checked.value as string)) {
        errors[id] = `must be one of: ${row.values.join(", ")}`;
        continue;
      }
      fileChanges[kind].push({ id, path: registry.settingPath(setting), value: checked.value });
    }
  }
  const salary = (key: string) => {
    const change = fileChanges.portals.find((c) => c.id === `portals:salary_filter.${key}`);
    const block = (files.portals.doc as { salary_filter?: Record<string, unknown> } | null)?.salary_filter;
    return { change, value: change ? change.value : block?.[key] };
  };
  const [min, max] = [salary("min"), salary("max")];
  if ((min.change || max.change) && typeof max.value === "number" && max.value !== 0 && typeof min.value === "number" && max.value < min.value) {
    errors[(max.change ?? min.change)!.id] = "must be 0 or at least the minimum";
  }
  if (Object.keys(errors).length > 0 || (hasEnv && next === null)) return Response.json({ errors }, { status: 400 });

  const edited: Partial<Record<FileKind, string>> = {};
  for (const kind of kinds) {
    const f = files[kind];
    const result = applyYamlChanges(f.text!, fileChanges[kind]);
    if ("error" in result) return Response.json({ error: `${f.label} ${result.error}` }, { status: 422 });
    if (kind === "profile") {
      const example = fs.readFileSync(path.join(resolveCodeRoot(process.cwd(), process.env), "config", "profile.example.yml"), "utf8");
      const level = (text: string) => validators!.validateProfile(text, example, f.label).findings.filter((x) => x.level === "error");
      newFindings(level(f.text!), level(result.text), fileChanges.profile, errors);
    } else {
      // An empty provider set: every tracked company's provider is then unknown, before and after alike.
      const check = (doc: unknown) => validators!.validatePortalsConfig(doc, { providerIds: new Set() });
      const [before, after] = await Promise.all([check(f.doc), check(result.doc)]);
      newFindings(before.errors, after.errors, fileChanges.portals, errors);
    }
    edited[kind] = result.text;
  }
  if (Object.keys(errors).length > 0) return Response.json({ errors }, { status: 400 });

  // No await from here to the last write: the revisions are read again so a save that
  // finished while this one awaited the validators cannot be overwritten.
  if (hasEnv && revisionOf(readText(store.settingsPath(root))) !== state.revision.settings) return stale(store.SETTINGS_FILE);
  for (const kind of kinds) if (revisionOf(readText(files[kind].file)) !== files[kind].revision) return stale(files[kind].label);

  const written: string[] = [];
  try {
    if (hasEnv) {
      atomicWrite(store.settingsPath(root), next!);
      written.push(store.SETTINGS_FILE);
    }
    for (const kind of kinds) {
      atomicWriteWithBackup(files[kind].file, edited[kind]!);
      written.push(files[kind].label);
    }
  } catch (e) {
    return Response.json({ error: `The settings could not be saved (${e instanceof Error ? e.message : String(e)})`, written }, { status: 500 });
  }
  try {
    return Response.json(load(core).state);
  } catch (e) {
    return failed("The settings were saved, but could not be read back. Reload the page", e);
  }
}
