// The build-cv-html.mjs render payload -> a one-column Word document, sections in payload key order.
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const HEADER_KEYS = new Set(['lang', 'page_format', 'country', 'candidate']);

const line = (...parts) => parts.filter(Boolean).join(' · ');
const text = (value) => new Paragraph({ children: [new TextRun(value)] });
const bold = (value) => new Paragraph({ children: [new TextRun({ text: value, bold: true })] });
const bullet = (value) => new Paragraph({ children: [new TextRun(value)], bullet: { level: 0 } });
const lines = (...values) => values.filter(Boolean).map(text);

/** Title, org/location/year, then any description: education, certifications and awards. */
const credential = (entries) => entries.flatMap((e) => [bold(e.title), ...lines(line(e.org, e.location, e.year), e.description)]);

// shortcut: headings are English whatever payload.lang says; translate here when a localized DOCX is wanted.
const SECTIONS = {
  summary: ['Summary', (summary) => [text(summary)]],
  experience: ['Experience', (entries) => entries.flatMap((e) => [
    bold(line(e.role, e.company)),
    ...lines(line(e.location, e.dates), e.context),
    ...(e.bullets ?? []).map(bullet),
  ])],
  education: ['Education', credential],
  projects: ['Projects', (entries) => entries.flatMap((e) => [bold(e.name), ...lines(e.url, e.description)])],
  skills: ['Skills', (entries) => entries.map((e) => new Paragraph({
    children: [...(e.category ? [new TextRun({ text: `${e.category}: `, bold: true })] : []), new TextRun(e.items.join(', '))],
  }))],
  interests: ['Interests', (items) => [text(items.join(', '))]],
  awards: ['Awards', credential],
  certifications: ['Certifications', credential],
};

/**
 * @param {object} payload from resumeToPayload (lib/cv-payload-schema.mjs)
 * @returns {Promise<Buffer>}
 */
export async function payloadToDocx(payload) {
  const { candidate = {} } = payload;
  const children = [
    new Paragraph({ text: candidate.name ?? '', heading: HeadingLevel.TITLE }),
    ...lines(candidate.title),
    ...lines(line(candidate.location, candidate.email, candidate.phone, candidate.linkedin?.display, candidate.github?.display, candidate.portfolio?.display)),
  ];
  for (const [key, value] of Object.entries(payload)) {
    if (HEADER_KEYS.has(key)) continue;
    if (!SECTIONS[key]) throw new Error(`payload section "${key}" has no DOCX layout in lib/resume/export/docx.mjs`);
    const [heading, render] = SECTIONS[key];
    children.push(new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }), ...render(value));
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
