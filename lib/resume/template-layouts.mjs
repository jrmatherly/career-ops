// MIT License, copyright (c) 2026 Amruth Pillai. Replaces templateLayouts from Reactive Resume packages/schema/src/templates.ts at d065a9f7; see THIRD_PARTY_NOTICES.md.
// The row shape is RR's; the rows are career-ops' own templates. atsSafe keeps RR's meaning: the template prints one column.

const ONE_COLUMN = Object.freeze({ columns: 1, sidebar: false, atsSafe: true });

// default is the resume schema's careerOps.template default; standard is cv-templates.mjs' name for the same base file
// (templates/cv-template.html). compact's label rail is a flex row inside each section, not a sidebar column.
export const TEMPLATE_LAYOUTS = Object.freeze({
  default: ONE_COLUMN,
  standard: ONE_COLUMN,
  compact: ONE_COLUMN,
  executive: ONE_COLUMN,
  jake: ONE_COLUMN,
  leadership: ONE_COLUMN,
  modern: ONE_COLUMN,
  'zh-minimal': ONE_COLUMN,
  cjk: ONE_COLUMN,
  ats: ONE_COLUMN,
});

/** The layout of a career-ops template name. */
export function layoutFor(name) {
  // shortcut: a user's own template under data/templates is assumed one column with no sidebar; read its CSS (or
  // a layout field in its header comment) once a two-column user template exists.
  return Object.hasOwn(TEMPLATE_LAYOUTS, name ?? '') ? TEMPLATE_LAYOUTS[name] : ONE_COLUMN;
}
