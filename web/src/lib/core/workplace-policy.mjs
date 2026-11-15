import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';
import { resolveCodeRoot } from './code-root.mjs';
import { isMapping } from '../portals-config.mjs';
import { holdPolicy } from '../scheduled-job-input.mjs';

async function coreGateBuilder(codeRoot) {
  const url = pathToFileURL(path.join(codeRoot, 'providers', '_country.mjs')).href;
  return (await import(/* webpackIgnore: true */ url)).buildWorkplacePolicy;
}

/** Synchronous shape-only mirror of the core's workplacePolicyFromConfig,
 * parity-tested so Discover cannot turn broken config into an absent policy.
 */
export function workplacePolicyConfig(config) {
  if (!isMapping(config)) throw new Error('portals.yml must contain a YAML mapping');
  if (config.location_filter === undefined) return undefined;
  if (!isMapping(config.location_filter)) throw new Error('location_filter must be an object');
  const policy = config.location_filter.workplace_policy;
  if (policy !== undefined && !isMapping(policy)) throw new Error('location_filter.workplace_policy must be an object');
  return policy;
}

/** Read current user policy and delegate to the same core gate as the scanner.
 * ENOENT keeps legacy/no-policy behavior; invalid files surface as an error.
 */
export async function loadWorkplacePolicy(root, codeRoot = resolveCodeRoot(process.cwd(), process.env)) {
  let config;
  try { config = yaml.load(fs.readFileSync(path.join(root, 'portals.yml'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return () => ({ eligible: true, reason: 'policy_absent' }); throw error; }
  const policy = workplacePolicyConfig(config);
  if (policy === undefined) return () => ({ eligible: true, reason: 'policy_absent' });
  return (await coreGateBuilder(codeRoot))(policy);
}

/** Why the core gate refuses a scheduled job's location hold, in the form's words, or null when it builds (or there is none). */
export async function holdPolicyProblem(hold, codeRoot = resolveCodeRoot(process.cwd(), process.env)) {
  if (!hold) return null;
  const buildWorkplacePolicy = await coreGateBuilder(codeRoot);
  try {
    buildWorkplacePolicy(holdPolicy(hold));
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.startsWith('workplace_policy.remote_countries') ? '"Remote from" must name a country, such as United States.' : message;
  }
}
