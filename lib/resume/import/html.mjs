// Ported from Reactive Resume packages/import/src/html.ts at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: paragraphs and list items use to-cv-md.mjs's pHtml/liHtml, so an import absorbs back unchanged; RR's escapeHtml is dropped (mdToHtml escapes).
import { descriptionHtml, liHtml, pHtml } from '../to-cv-md.mjs';

/** A plain-text summary and optional highlights as description HTML: a <p>, then a <ul>. */
export function toHtmlDescription(summary, highlights) {
  return descriptionHtml(summary ? [pHtml(summary)] : [], (highlights ?? []).map(liHtml));
}

/** Plain-text strings as an HTML unordered list. */
export const arrayToHtmlList = (items) => descriptionHtml([], items.map(liHtml));

// Glyph markers need no space; punctuation markers do, so "-based" remains prose.
export const BULLET_PATTERN = /^\s*(?:[•◦‣·]\s*|[-–—*]\s+)/;

/** Preserves prose and contiguous bullet lists, including a single bullet. */
export function toHtmlBlocks(lines) {
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) blocks.push(arrayToHtmlList(bullets));
    bullets = [];
  };
  for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
    if (BULLET_PATTERN.test(line)) {
      bullets.push(line.replace(BULLET_PATTERN, ''));
    } else {
      flush();
      blocks.push(pHtml(line));
    }
  }
  flush();
  return blocks.join('');
}

/** LinkedIn's historical rule treats predominantly bulleted descriptions as a list. */
export function toHtml(lines) {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  const bulleted = cleaned.filter((line) => BULLET_PATTERN.test(line));
  if (bulleted.length >= 2 && bulleted.length * 2 >= cleaned.length) {
    return arrayToHtmlList(cleaned.map((line) => line.replace(BULLET_PATTERN, '')));
  }
  return cleaned.map((line) => pHtml(line.replace(BULLET_PATTERN, ''))).join('');
}
