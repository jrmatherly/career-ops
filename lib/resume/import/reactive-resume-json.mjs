// Ported from Reactive Resume packages/import/src/reactive-resume-json.tsx at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: takes parsed JSON (detect.mjs's readJson parses and unwraps the account-archive { data } wrapper); parses with ../schema.mjs; the layout normalisation and legacy stylesheet conversion are dropped (cv.md ignores both).
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
