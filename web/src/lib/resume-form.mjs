// Pure, immutable edits over a Reactive Resume v6 ResumeData draft, plus the
// description HTML <-> editable text converter the form uses. No React, no zod.

/** @typedef {'text' | 'description' | 'keywords' | 'website'} FieldKind */
/** @typedef {{ key: string, label: string, kind: FieldKind }} FieldSpec */
/** @typedef {{ label: string, blank: () => Record<string, unknown>, fields: FieldSpec[] }} SectionType */
/** @typedef {Array<string | number>} Path */

const website = () => ({ url: "", label: "", inlineLink: false });
const text = (key, label) => ({ key, label, kind: /** @type {const} */ ("text") });
const DESCRIPTION = { key: "description", label: "Description", kind: /** @type {const} */ ("description") };
const WEBSITE = { key: "website", label: "Website", kind: /** @type {const} */ ("website") };
const KEYWORDS = { key: "keywords", label: "Keywords (comma-separated)", kind: /** @type {const} */ ("keywords") };

/** @type {Record<string, SectionType>} */
export const SECTION_TYPES = {
  "cover-letter": {
    label: "Cover letter",
    blank: () => ({ recipient: "", content: "" }),
    fields: [text("recipient", "Recipient"), { key: "content", label: "Content", kind: "description" }],
  },
  summary: {
    label: "Summary",
    blank: () => ({ content: "" }),
    fields: [{ key: "content", label: "Content", kind: "description" }],
  },
  profiles: {
    label: "Profiles",
    blank: () => ({ icon: "", iconColor: "", network: "", username: "", website: website() }),
    fields: [text("network", "Network"), text("username", "Username"), WEBSITE],
  },
  experience: {
    label: "Experience",
    blank: () => ({ company: "", position: "", location: "", period: "", website: website(), description: "", roles: [] }),
    fields: [text("company", "Company"), text("position", "Position"), text("location", "Location"), text("period", "Period"), WEBSITE, DESCRIPTION],
  },
  education: {
    label: "Education",
    blank: () => ({ school: "", degree: "", area: "", grade: "", location: "", period: "", website: website(), description: "" }),
    fields: [text("school", "School"), text("degree", "Degree"), text("area", "Area"), text("grade", "Grade"), text("location", "Location"), text("period", "Period"), WEBSITE, DESCRIPTION],
  },
  projects: {
    label: "Projects",
    blank: () => ({ name: "", period: "", website: website(), description: "" }),
    fields: [text("name", "Name"), text("period", "Period"), WEBSITE, DESCRIPTION],
  },
  skills: {
    label: "Skills",
    blank: () => ({ icon: "", iconColor: "", name: "", proficiency: "", level: 0, keywords: [] }),
    fields: [text("name", "Name"), text("proficiency", "Proficiency"), KEYWORDS],
  },
  languages: {
    label: "Languages",
    blank: () => ({ language: "", fluency: "", level: 0 }),
    fields: [text("language", "Language"), text("fluency", "Fluency")],
  },
  interests: {
    label: "Interests",
    blank: () => ({ icon: "", iconColor: "", name: "", keywords: [] }),
    fields: [text("name", "Name"), KEYWORDS],
  },
  awards: {
    label: "Awards",
    blank: () => ({ title: "", awarder: "", date: "", website: website(), description: "" }),
    fields: [text("title", "Title"), text("awarder", "Awarder"), text("date", "Date"), WEBSITE, DESCRIPTION],
  },
  certifications: {
    label: "Certifications",
    blank: () => ({ title: "", issuer: "", date: "", website: website(), description: "" }),
    fields: [text("title", "Title"), text("issuer", "Issuer"), text("date", "Date"), WEBSITE, DESCRIPTION],
  },
  publications: {
    label: "Publications",
    blank: () => ({ title: "", publisher: "", date: "", website: website(), description: "" }),
    fields: [text("title", "Title"), text("publisher", "Publisher"), text("date", "Date"), WEBSITE, DESCRIPTION],
  },
  volunteer: {
    label: "Volunteer",
    blank: () => ({ organization: "", location: "", period: "", website: website(), description: "" }),
    fields: [text("organization", "Organization"), text("location", "Location"), text("period", "Period"), WEBSITE, DESCRIPTION],
  },
  references: {
    label: "References",
    blank: () => ({ name: "", position: "", website: website(), phone: "", description: "" }),
    fields: [text("name", "Name"), text("position", "Position"), WEBSITE, text("phone", "Phone"), DESCRIPTION],
  },
};

// summary and cover-letter exist only as custom-section types; data.summary has its own form.
export const BUILT_IN_SECTIONS = Object.keys(SECTION_TYPES).filter((type) => type !== "summary" && type !== "cover-letter");

/** @param {any} value @param {Path} path */
export function getIn(value, path) {
  return path.reduce((v, k) => (v == null ? undefined : v[k]), value);
}

/**
 * Immutable set along `path`. Writing `period` or `date` drops the sibling `dates`, which the parser would
 * otherwise regenerate them from; it then re-derives `dates` and reformats the text (`2019 - 2024` gets an en dash).
 */
export function setField(data, path, value) {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  const copy = Array.isArray(data) ? [...data] : { ...data };
  copy[key] = setField(data?.[key], rest, value);
  if (rest.length === 0 && (key === "period" || key === "date") && !Array.isArray(copy)) delete copy.dates;
  return copy;
}

/** Path to a section: a built-in key under `sections`, otherwise a custom section id. */
export function sectionPath(data, ref) {
  if (data.sections && Object.hasOwn(data.sections, ref)) return ["sections", ref];
  const i = (data.customSections ?? []).findIndex((s) => s.id === ref);
  if (i < 0) throw new Error(`unknown section: ${ref}`);
  return ["customSections", i];
}

/** The item type of a section: its key for a built-in, its `type` for a custom one. */
export function sectionType(data, ref) {
  const path = sectionPath(data, ref);
  return path[0] === "sections" ? ref : getIn(data, path).type;
}

function updateItems(data, ref, fn) {
  const path = [...sectionPath(data, ref), "items"];
  return setField(data, path, fn(getIn(data, path)));
}

export function addItem(data, ref, id) {
  const type = SECTION_TYPES[sectionType(data, ref)];
  return updateItems(data, ref, (items) => [...items, { id, hidden: false, ...type.blank() }]);
}

export function removeItem(data, ref, itemId) {
  return updateItems(data, ref, (items) => items.filter((it) => it.id !== itemId));
}

export function moveItem(data, ref, itemId, delta) {
  const items = getIn(data, [...sectionPath(data, ref), "items"]);
  const from = items.findIndex((it) => it.id === itemId);
  const to = Math.max(0, Math.min(items.length - 1, from + delta));
  if (from < 0 || from === to) return data;
  return updateItems(data, ref, (list) => {
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  });
}

export function toggleHidden(data, ref, itemId) {
  const path = sectionPath(data, ref);
  if (itemId === undefined) return setField(data, [...path, "hidden"], !getIn(data, path).hidden);
  const i = getIn(data, [...path, "items"]).findIndex((it) => it.id === itemId);
  if (i < 0) return data;
  const itemPath = [...path, "items", i, "hidden"];
  return setField(data, itemPath, !getIn(data, itemPath));
}

export function addCustomSection(data, type, id, title) {
  const section = { title, icon: "", columns: 1, hidden: false, showHeading: true, keepTogether: false, startOnNewPage: false, type, id, items: [] };
  return { ...data, customSections: [...(data.customSections ?? []), section] };
}

// shortcut: mirrors lib/resume/to-cv-md.mjs mdToHtml because web code cannot import root lib; share it if a third copy appears.
const unescapeHtml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BLOCK_TAG_RE = /<\/?(?:p|li|ul|ol|div|h[1-6]|blockquote)\b[^>]*>|<br\s*\/?>/gi;

// Strips until nothing changes, so a tag split by another tag (`<<b>script>`) cannot survive one pass.
function stripTags(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/<[^<>]*>/g, "");
  } while (s !== prev);
  return s;
}

function htmlToMd(html) {
  return unescapeHtml(
    stripTags(
      String(html ?? "")
        .replace(BLOCK_TAG_RE, " ")
        .replace(/<\/?(?:strong|b)>/gi, "**")
        .replace(/<\/?(?:em|i)>/gi, "_")
        .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)"),
    ),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function mdToHtml(md) {
  const links = [];
  const plain = String(md ?? "").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    links.push([label, href]);
    return `\u0000${links.length - 1}\u0000`;
  });
  const inline = (s) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");
  return inline(plain).replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const [label, href] = links[Number(i)];
    return `<a href="${escapeHtml(href).replace(/"/g, "&quot;")}">${inline(label)}</a>`;
  });
}

/** Description HTML as editable lines: one per paragraph, `- ` per list item. */
export function descriptionToText(html) {
  const lines = [];
  for (const m of String(html ?? "").matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (m[1]) for (const li of m[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) lines.push(`- ${htmlToMd(li[1])}`);
    else lines.push(htmlToMd(m[3]));
  }
  if (lines.length === 0 && html) lines.push(htmlToMd(html));
  return lines.filter((l) => l && l !== "- ").join("\n");
}

/** Inverse of descriptionToText: `- ` runs become one list, other lines paragraphs, blank lines dropped. */
export function textToDescription(value) {
  let html = "";
  let bullets = [];
  const flush = () => {
    if (bullets.length) html += `<ul>${bullets.map((b) => `<li><p>${mdToHtml(b)}</p></li>`).join("")}</ul>`;
    bullets = [];
  };
  for (const raw of String(value ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // A bare `-` is a bullet still being typed, not a paragraph that would split the list.
    const bullet = /^-(?:\s+(.*))?$/.exec(line);
    if (bullet) {
      if (bullet[1]) bullets.push(bullet[1]);
    }
    else {
      flush();
      html += `<p>${mdToHtml(line)}</p>`;
    }
  }
  flush();
  return html;
}

/** One text input for a website: shows the label (or bare url), writes url and label together. */
export function websiteText(w) {
  return w?.label || String(w?.url ?? "").replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

export function toWebsite(value, prior = {}) {
  const v = value.trim();
  if (!v) return { ...prior, url: "", label: "" };
  return { ...prior, url: /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`, label: v };
}
