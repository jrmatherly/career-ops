// The line enforcePageBudget() in generate-pdf.mjs prints on stderr when a render
// is longer than cv.max_pages and strict mode is off, so the render still succeeds.
const OVERFLOW = /CV is \d+ pages; the allowed maximum is \d+ pages?\.[^\n]*?then regenerate\./;

// Carries the warning on the PDF response, URI-encoded so any text is header-safe.
export const PAGE_OVERFLOW_HEADER = "X-CV-Page-Overflow";

/**
 * @param {string} stderr The renderer's stderr from a successful render.
 * @returns {string | null}
 */
export function pageOverflowWarning(stderr) {
  return OVERFLOW.exec(stderr)?.[0] ?? null;
}
