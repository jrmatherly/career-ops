import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

type Registry = typeof import("../../../lib/settings-registry.mjs");
type Store = typeof import("../../../lib/settings-store.mjs");
// Written out, not `typeof import(...)`: the validators' imports would pull providers/ and plugins/ into this type check.
export type Finding = { level?: string; message: string; key?: string; path?: string };
type Validators = {
  validateProfile: (profileText: string, exampleText: string, label?: string) => { findings: Finding[] };
  validatePortalsConfig: (config: unknown, options: { providerIds: Set<string> }) => Promise<{ errors: Finding[] }>;
};

const load = (name: string) => import(/* webpackIgnore: true */ pathToFileURL(rootScript(name)).href);

/** The settings registry and store from the engine checkout, which is chosen at runtime and never bundled. */
export async function coreSettings(): Promise<{ registry: Registry; store: Store }> {
  const [registry, store] = await Promise.all([load("lib/settings-registry"), load("lib/settings-store")]);
  return { registry, store };
}

/** The profile and portals validators from the engine checkout, loaded only when a save edits one of those files. */
export async function coreValidators(): Promise<Validators> {
  const [profile, portals] = await Promise.all([load("validate-profile"), load("validate-portals")]);
  return { validateProfile: profile.validateProfile, validatePortalsConfig: portals.validatePortalsConfig };
}

/**
 * `env` with any recorded overlay undone. Core modules imported in-process
 * apply saved values to process.env, which would outlive a later Reset.
 */
export function envBeforeOverlay(store: Store, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return store.undoOverlay({ ...env }) as NodeJS.ProcessEnv;
}

/** The environment a core script would see: saved settings over `env`, unless CAREER_OPS_SETTINGS=off. */
export async function effectiveEnv(root: string = careerOpsRoot(), env: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const { store } = await coreSettings();
  const base = envBeforeOverlay(store, env);
  return store.settingsOff(base) ? base : { ...base, ...store.overlayFor(store.readSettings(root).values).env };
}
