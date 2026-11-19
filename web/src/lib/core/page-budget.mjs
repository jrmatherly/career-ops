import path from "node:path";
import { pathToFileURL } from "node:url";
import { getProfilePath } from "./profile-path.mjs";

/**
 * ACL for the core's page budget (theme-style.mjs readCvPageBudget), so the web
 * fits a CV to the limit the CLI enforces. Loaded at runtime, as page-format.mjs
 * loads its module, because Turbopack refuses a static import from outside web/.
 *
 * Never throws. A core that cannot be loaded, or a profile without a usable
 * `cv.max_pages`, falls back to 2.
 *
 * @param {string} coreRoot Absolute path to the career-ops code checkout.
 * @param {string} dataRoot Absolute data root (careerOpsRoot()).
 * @returns {Promise<{ maxPages: number }>} 2 when cv.max_pages is unset or unusable.
 */
export async function readPageBudget(coreRoot, dataRoot) {
  try {
    const mod = await import(/* webpackIgnore: true */ pathToFileURL(path.join(coreRoot, "theme-style.mjs")).href);
    const { maxPages } = mod.readCvPageBudget(getProfilePath(dataRoot));
    return { maxPages: Number.isInteger(maxPages) && maxPages >= 1 ? maxPages : 2 };
  } catch {
    return { maxPages: 2 };
  }
}
