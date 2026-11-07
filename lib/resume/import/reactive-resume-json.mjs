// Ported from Reactive Resume packages/import/src/reactive-resume-json.tsx at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: parses with ../schema.mjs; the layout normalisation is dropped (cv.md ignores layout); detect.mjs unwraps the account-archive { data } wrapper first.
import { parseResume } from '../schema.mjs';
import { issuesError } from './error.mjs';

/**
 * @param {unknown} json a parsed Reactive Resume v6 export
 * @returns {object} ResumeData with careerOps filled
 */
export function parseReactiveResumeJSON(json) {
  const result = parseResume(json);
  if (!result.ok) throw issuesError(result.issues);
  return result.data;
}
