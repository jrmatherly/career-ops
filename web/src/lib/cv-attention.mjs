/**
 * Which cv.md sections hold lines the resume absorb could not read, or could not write back the same way.
 *
 * @param {{ unparsed?: { line: number }[] } | null | undefined} report  the absorb report from GET /api/resume
 * @param {string} cvMarkdown  cv.md as read
 * @returns {{ count: number, sections: { name: string, line: number }[], firstLine: number | null }}
 */
export function attentionSummary(report, cvMarkdown) {
  const lines = (report?.unparsed ?? []).map((u) => u.line).sort((a, b) => a - b);
  const headings = [];
  cvMarkdown.split("\n").forEach((text, i) => {
    const m = /^## +(.+?)\s*$/.exec(text);
    if (m) headings.push({ name: m[1], line: i + 1 });
  });
  const sections = [];
  // Keyed on the heading's line: two sections can share a name.
  const seen = new Set();
  for (const line of lines) {
    const heading = headings.findLast((h) => h.line < line);
    if (seen.has(heading?.line)) continue;
    seen.add(heading?.line);
    sections.push({ name: heading?.name ?? "Header", line });
  }
  return { count: sections.length, sections, firstLine: lines[0] ?? null };
}

/**
 * The [start, end) character offsets of 1-based `line` in `text`, for a textarea selection.
 * A line past the end selects the empty end of the text.
 *
 * @param {string} text
 * @param {number} line
 * @returns {[number, number]}
 */
export function lineRange(text, line) {
  const lines = text.split("\n");
  if (line > lines.length) return [text.length, text.length];
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  return [start, start + lines[line - 1].length];
}

/**
 * The attention banner's two sentences.
 *
 * @param {{ count: number, sections: { name: string, line: number }[] }} summary
 * @returns {{ title: string, detail: string }}
 */
export function attentionText({ count, sections }) {
  const one = count === 1;
  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(sections.map((s) => `${s.name} (line ${s.line})`));
  return {
    title: `${count} ${one ? "section needs" : "sections need"} attention.`,
    detail: `${names} could not be read back cleanly, so ${one ? "it" : "they"} may be missing from tailored CVs.`,
  };
}

/** @param {{ company?: string, position?: string, name?: string, section?: string }} o */
const orphanLabel = (o) => (o.company ? (o.position ? `${o.position} at ${o.company}` : o.company) : o.name || o.section || "an entry");

/**
 * The banner and Export hint for a lossy absorb that found no unreadable line:
 * cv.md parsed, but rebuilding it from the structured data would differ.
 * Null when there are unreadable lines, which attentionText reports instead.
 *
 * @param {{ unparsed?: unknown[], orphans?: { company?: string, position?: string, name?: string, section?: string }[] } | null | undefined} report
 * @returns {{ title: string, detail: string, blocked: string } | null}
 */
export function lossyNotice(report) {
  if (report?.unparsed?.length) return null;
  const names = (report?.orphans ?? []).map(orphanLabel);
  const title = "cv.md was read, but it would be rewritten differently.";
  if (!names.length) {
    const why = "Open the structured editor to see why.";
    return { title, detail: `Rebuilding it from the structured editor would not give back the same file. ${why}`, blocked: `Export is off because cv.md would not be rebuilt exactly as written. ${why}` };
  }
  const one = names.length === 1;
  const list = new Intl.ListFormat("en", { type: "conjunction" }).format(names);
  return {
    title,
    detail: `The structured editor holds ${list}, which no longer ${one ? "matches" : "match"} cv.md. Open the structured editor to resolve ${one ? "it" : "them"}.`,
    blocked: "Export is off until the structured editor's entries match cv.md.",
  };
}
