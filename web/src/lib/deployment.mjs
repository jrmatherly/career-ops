// Whether this web server is reached from beyond the machine it runs on, read from
// the same allow-list the bind and the request guard use. doctor.mjs keys on the
// scheduler and Kubernetes variables instead, because it cannot see how the page is served.

import { validateAllowedHosts } from "./bind-host.mjs";
import { isLoopbackHost } from "./origin-guard.mjs";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ hosted: boolean, host: string | null }}
 */
export function deploymentMode(env = process.env) {
  const result = validateAllowedHosts(env.CAREER_OPS_WEB_ALLOWED_HOSTS);
  const host = result.ok ? result.hosts.find((h) => !isLoopbackHost(h) && !h.endsWith(".localhost")) : undefined;
  return host ? { hosted: true, host } : { hosted: false, host: null };
}
