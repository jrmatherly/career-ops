/**
 * Which cv.md sections hold lines the resume absorb could not read.
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
  for (const line of lines) {
    const name = headings.findLast((h) => h.line < line)?.name ?? "Header";
    if (!sections.some((s) => s.name === name)) sections.push({ name, line });
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
    detail: `${names} could not be read, so ${one ? "it" : "they"} may be missing from tailored CVs.`,
  };
}
