// Ported from Reactive Resume packages/import/src/error.ts at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: an ImportError class and a one-line issue list in place of rethrowAsImportError's sentence.
export class ImportError extends Error {}

const MAX_LISTED_ISSUES = 3;

/** The first few zod issues as `path: message`, then a count of the rest. */
export function listIssues(issues) {
  const listed = issues.slice(0, MAX_LISTED_ISSUES).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  const more = issues.length - MAX_LISTED_ISSUES;
  return `${listed}${more > 0 ? `; and ${more} more` : ''}`;
}

export const issuesError = (issues) => new ImportError(`not a valid resume (${listIssues(issues)})`);
