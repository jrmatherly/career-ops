// The resume model: Reactive Resume v6's schema (vendored under ./vendor/) plus
// the one root key career-ops owns, `careerOps`. RR's root is a looseObject, so
// the key passes through RR's parse and is validated here instead.
import { z } from 'zod';
import { parseResumeData } from './vendor/data.mjs';
import { defaultResumeData } from './vendor/default.mjs';

export * from './vendor/data.mjs';
export * from './vendor/dates.mjs';
export { defaultResumeData, sectionDefaults } from './vendor/default.mjs';

const DEFAULT_CV_STYLE = Object.freeze({
  experienceHeading: 'Work Experience',
  summaryHeading: 'Professional Summary',
  dash: '--',
  titlePrefix: true,
  contactLines: Object.freeze([]),
  sectionOrder: Object.freeze([]),
});

const careerOpsSchema = z.strictObject({
  cvSha256: z.string().default(''),
  pendingCvSha256: z.string().optional(),
  cvStyle: z.strictObject({
    experienceHeading: z.string(),
    summaryHeading: z.string(),
    dash: z.enum(['--', '–', '—']),
    // Absent means true: a stored style from before the field still parses to the same object.
    titlePrefix: z.boolean().optional(),
    contactLines: z.array(z.string()),
    sectionOrder: z.array(z.string()),
  }).default(() => structuredClone(DEFAULT_CV_STYLE)),
  template: z.string().default('default'),
  style: z.record(z.string(), z.string()).default(() => ({})),
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// RR's own schema heals single fields with .catch() but rejects a missing
// metadata sub-object (metadata.page in an older export), so absent metadata objects
// come from the default resume first. Content keys are never filled, and
// arrays are never merged.
function withDefaults(input, defaults) {
  const out = { ...input };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === undefined) out[key] = structuredClone(value);
    else if (isPlainObject(out[key]) && isPlainObject(value)) out[key] = withDefaults(out[key], value);
  }
  return out;
}

/**
 * @param {unknown} json
 * @returns {{ ok: true, data: object } | { ok: false, issues: import('zod').ZodIssue[] }}
 */
export function parseResume(json) {
  let data;
  try {
    data = parseResumeData(isPlainObject(json?.metadata) ? { ...json, metadata: withDefaults(json.metadata, defaultResumeData.metadata) } : json);
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, issues: err.issues };
    throw err;
  }
  const careerOps = careerOpsSchema.safeParse(data.careerOps ?? {});
  if (!careerOps.success) {
    return { ok: false, issues: careerOps.error.issues.map((issue) => ({ ...issue, path: ['careerOps', ...issue.path] })) };
  }
  data.careerOps = careerOps.data;
  // RR's section schemas strip unknown keys, so the one career-ops adds is carried across. Skills has its own `layout`.
  const keepLayout = (section, raw) => {
    if (raw?.layout === 'entries' && !('layout' in section)) section.layout = 'entries';
  };
  for (const [id, section] of Object.entries(data.sections)) keepLayout(section, json.sections?.[id]);
  data.customSections.forEach((section, i) => keepLayout(section, json.customSections?.[i]));
  return { ok: true, data };
}
