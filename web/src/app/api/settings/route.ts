import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import * as yaml from "js-yaml";
import { careerOpsRoot, portalsConfigPath } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { getProfilePath } from "@/lib/core/profile-path.mjs";
import { atomicWrite } from "@/lib/core/safe-write";
import { readJsonObject } from "@/lib/json-body";
import { coreSettings, envBeforeOverlay } from "@/lib/settings-server";
import { buildSettingsState, revisionOf, splitChanges } from "@/lib/settings-state.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saved settings live in {DATA_ROOT}/config/settings.json. This route is the
// only writer; every core script reads the file through lib/settings-env.mjs.
// Nothing here writes process.env, and no secret value is read into a response.

const readText = (file: string): string | null => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

function parseYaml(text: string | null): unknown {
  if (text === null) return null;
  try {
    return yaml.load(text);
  } catch {
    return null;
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
  const profileText = readText(getProfilePath(root));
  const portalsText = readText(portalsConfigPath(root));
  // Node 22.13's parseEnv keeps an inline comment on a last line with no newline.
  const dotenv = parseEnv(`${readText(path.join(root, ".env")) ?? ""}\n`) as Record<string, string>;
  const { groups } = buildSettingsState({
    groups: registry.GROUPS, settings: registry.SETTINGS, validateSetting: registry.validateSetting,
    stored: saved.values, fileError, overlayDisabled, env, dotenv,
    profile: parseYaml(profileText), portals: parseYaml(portalsText), modesDirs: modesDirs(), dataRoot: root,
  });
  const revision = { settings: revisionOf(saved.text), profile: revisionOf(profileText), portals: revisionOf(portalsText) };
  return { root, saved, state: { revision, groups, fileError, overlayDisabled } };
}

const conflict = (error: string) => Response.json({ error }, { status: 409 });

export async function GET() {
  return Response.json(load(await coreSettings()).state);
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ revision?: { settings?: unknown }; changes?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const changes = body.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) {
    return Response.json({ error: "nothing to change" }, { status: 400 });
  }
  const core = await coreSettings();
  const { registry, store } = core;

  // No await from here to the write: the revision check and the write are one step for this server.
  const { root, saved, state } = load(core);
  const split = splitChanges(changes as Record<string, unknown>, registry.settingById);
  const errors: Record<string, string> = { ...split.errors };
  for (const id of [...Object.keys(split.profile), ...Object.keys(split.portals)]) errors[id] = "not available yet";
  if (state.fileError) return conflict(`${state.fileError}. Fix or delete the file, then reload.`);
  if (state.overlayDisabled) return conflict("Saved settings are turned off for this server (CAREER_OPS_SETTINGS=off).");
  if (body.revision?.settings !== state.revision.settings) {
    return conflict(`${store.SETTINGS_FILE} changed since this page loaded. Reload and try again.`);
  }

  let next: string | null = null;
  try {
    next = store.nextSettingsText(saved.text, split.env);
  } catch (e) {
    if (!(e instanceof store.SettingsError) || !e.errors) throw e;
    Object.assign(errors, e.errors);
  }
  if (Object.keys(errors).length > 0 || next === null) return Response.json({ errors }, { status: 400 });
  atomicWrite(store.settingsPath(root), next);
  return Response.json(load(core).state);
}
