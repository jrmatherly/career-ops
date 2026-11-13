// The sentence enforcePageBudget() in generate-pdf.mjs warns with when a render runs past
// cv.max_pages; it stops at "then regenerate." to drop the CLI-only --strict-pages advice.
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

/**
 * The warning a PDF response carries, or null. A header that will not decode
 * still yields a sentence: the download succeeded, so it must not read as a failure.
 *
 * @param {{ get(name: string): string | null }} headers
 * @returns {string | null}
 */
export function readPageOverflow(headers) {
  const raw = headers.get(PAGE_OVERFLOW_HEADER);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return "Trim the CV, then download it again.";
  }
}
