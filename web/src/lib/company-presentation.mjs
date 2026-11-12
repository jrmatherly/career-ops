// Human-facing company identity for tracker entries. The canonical `company`
// field remains the end employer, so `?` must never be replaced with the
// recruiter or agency recorded in `via`.

const DIRECT_VIA = /^(n\/?a|tbd|none|null|-|—|–)$/i;

/**
 * Return the label and logo identity appropriate for an application row.
 * This module is plain JavaScript so the UI and its Node regression tests use
 * exactly the same behavior.
 *
 * @param {{ company?: string, via?: string }} application
 * @returns {{ label: string, logoName: string }}
 */
export function companyPresentation({ company = "", via = "" } = {}) {
  const companyName = String(company).trim();
  const intermediary = String(via).trim();

  if (companyName !== "?") return { label: company, logoName: company };
  if (intermediary && !DIRECT_VIA.test(intermediary)) {
    return {
      label: `Confidential · via ${intermediary}`,
      logoName: intermediary,
    };
  }
  return { label: "Confidential employer", logoName: "Confidential employer" };
}

/** @param {{ company?: string, via?: string, role?: string }} application */
export function companySearchText(application) {
  const { label } = companyPresentation(application);
  return `${application?.company ?? ""} ${application?.via ?? ""} ${label} ${application?.role ?? ""}`;
}

// shortcut: capitalizes slugs and cannot restore an acronym or a brand's own casing; replace with a real name source when the sweep records one.
/** @param {string} name */
export function displayCompany(name) {
  const text = String(name ?? "");
  if (/[A-Z]/.test(text)) return text;
  return text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * One short location line from a sweep's ` · `-joined parts.
 * @param {string} location
 */
export function compactLocation(location) {
  const parts = [];
  for (const raw of String(location).split(" · ")) {
    // "US - Remote" keeps its country: it says who may apply, which a city already does.
    const part = raw.trim().replace(/^[A-Z]{2} - (?!remote\b)/i, "");
    // Whole words only: "US" is not a repeat of "Austin".
    const repeat = new RegExp(`(^|[^\\p{L}])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
    if (part && !parts.some((kept) => repeat.test(kept))) parts.push(part);
  }
  return parts.slice(0, 3).join(", ");
}
