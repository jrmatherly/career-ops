import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

type Registry = typeof import("../../../lib/settings-registry.mjs");
type Store = typeof import("../../../lib/settings-store.mjs");

/** The settings registry and store from the engine checkout, which is chosen at runtime and never bundled. */
export async function coreSettings(): Promise<{ registry: Registry; store: Store }> {
  const load = (name: string) => import(/* webpackIgnore: true */ pathToFileURL(rootScript(name)).href);
  const [registry, store] = await Promise.all([load("lib/settings-registry"), load("lib/settings-store")]);
  return { registry, store };
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
