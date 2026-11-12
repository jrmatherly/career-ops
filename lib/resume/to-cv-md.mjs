// ResumeData -> cv.md, in the shape examples/cv-example.md uses. The section
// registry below is shared with absorb.mjs: each row's render and parse are
// inverse on that row's line grammar, which is what makes absorb lossless.

const unescapeHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BLOCK_TAG_RE = /<\/?(?:p|li|ul|ol|div|h[1-6]|blockquote)\b[^>]*>|<br\s*\/?>/gi;

// Strips until nothing changes, so a tag split by another tag (`<<b>script>`) cannot survive one pass.
function stripTags(s) {
  let prev;
  do { prev = s; s = s.replace(/<[^<>]*>/g, ''); } while (s !== prev);
  return s;
}

/** One inline markdown run from description HTML; block boundaries become spaces. */
function htmlToMd(html) {
  return unescapeHtml(stripTags(String(html ?? '')
    .replace(BLOCK_TAG_RE, ' ')
    .replace(/<\/?(?:strong|b)>/gi, '**')
    .replace(/<\/?(?:em|i)>/gi, '_')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Inline markdown (bold, `_em_`, links) back to HTML, the inverse of htmlToMd. */
export function mdToHtml(md) {
  const links = [];
  const text = String(md ?? '').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    links.push([label, href]);
    return `\u0000${links.length - 1}\u0000`;
  });
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');
  return inline(text).replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const [label, href] = links[Number(i)];
    return `<a href="${escapeHtml(href).replace(/"/g, '&quot;')}">${inline(label)}</a>`;
  });
}

export const pHtml = (md) => `<p>${mdToHtml(md)}</p>`;
export const liHtml = (md) => `<li><p>${mdToHtml(md)}</p></li>`;

/** Description HTML from lead paragraph HTML and bullet `<li>` HTML; the list only when there are bullets. */
export const descriptionHtml = (leadHtml, bulletHtml) => leadHtml.join('') + (bulletHtml.length ? `<ul>${bulletHtml.join('')}</ul>` : '');

/** Plain text of description HTML, for the render payload. */
export function htmlToText(html) {
  return unescapeHtml(stripTags(String(html ?? '').replace(BLOCK_TAG_RE, ' '))).replace(/\s+/g, ' ').trim();
}

/**
 * Top-level blocks of description HTML in order: paragraphs and lists. Each
 * piece keeps its own HTML so an unchanged bullet is written back byte for byte.
 *
 * @returns {{ type: 'p'|'ul', html: string, md?: string, items?: {html: string, md: string}[] }[]}
 */
function htmlBlocks(html) {
  const blocks = [];
  for (const m of String(html ?? '').matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (m[1]) {
      const items = [...m[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => ({ html: li[0], md: htmlToMd(li[1]) }));
      if (items.length) blocks.push({ type: 'ul', html: m[0], items });
    } else {
      const md = htmlToMd(m[3]);
      if (md) blocks.push({ type: 'p', html: m[0], md });
    }
  }
  return blocks;
}

/** An experience description split the way cv.md writes it: lead paragraphs, then bullets. */
export function splitDescription(html) {
  const blocks = htmlBlocks(html);
  return {
    lead: blocks.filter((b) => b.type === 'p'),
    items: blocks.filter((b) => b.type === 'ul').flatMap((b) => b.items),
  };
}

/** Prose blocks as cv.md lines: one line per paragraph, `- ` lines per list. */
export function proseBlocks(html) {
  return htmlBlocks(html).map((b) => (b.type === 'p' ? [b.md] : b.items.map((i) => `- ${i.md}`)));
}

const DASH_RE = '(?:--|–|—)';

export const withScheme = (v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
const withoutScheme = (url) => String(url ?? '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
export const websiteText = (w) => w?.label || withoutScheme(w?.url);
export const toWebsite = (text, prior = {}) => ({ ...prior, url: withScheme(text), label: text });

/**
 * A bold-lead list row: `- **{lead}**[, {comma}][ ({paren})][ {dash} {description}]`.
 * Optional parts are omitted when empty, so parse(render(item)) renders the same line.
 */
function boldRow(type, { lead, comma, paren, dash = true, dateField }) {
  const re = new RegExp(`^- \\*\\*(.+?)\\*\\*${comma ? '(?:, (.+?))?' : '()'}${paren ? '(?: \\(([^()]*)\\))?' : '()'}${dash ? `(?: ${DASH_RE} (.*))?` : '()'}$`);
  return {
    type,
    key: (item) => item[lead],
    render(item, style) {
      let s = `- **${item[lead]}**`;
      if (comma && item[comma]) s += `, ${item[comma]}`;
      if (paren && item[paren]) s += ` (${item[paren]})`;
      // shortcut: a multi-paragraph description renders as one run and is stored as one <p> on its next edit; give list rows a block grammar if that loss matters.
      const desc = dash ? htmlToMd(item.description) : '';
      if (desc) s += ` ${style.dash} ${desc}`;
      return s;
    },
    parse(line) {
      const m = line.match(re);
      if (!m) return null;
      const fields = { [lead]: m[1] };
      if (comma) fields[comma] = m[2] ?? '';
      if (paren) fields[paren] = m[3] ?? '';
      if (dash) fields.description = m[4] ? pHtml(m[4]) : '';
      return { key: m[1], fields, dateField };
    },
  };
}

/** A bold `**{lead}:**` row with the rest of the line as one value or a keyword list. */
function colonRow(type, { lead, value, keywords, colonInside = true }) {
  const re = colonInside ? /^- \*\*(.+?):\*\*(?: (.*))?$/ : /^- \*\*(.+?)\*\*(?:: (.*))?$/;
  const rest = (item) => (keywords ? item.keywords.join(', ') : item[value]);
  return {
    type,
    key: (item) => item[lead],
    render(item) {
      const tail = rest(item);
      return colonInside ? `- **${item[lead]}:**${tail ? ` ${tail}` : ''}` : `- **${item[lead]}**${tail ? `: ${tail}` : ''}`;
    },
    parse(line) {
      const m = line.match(re);
      if (!m) return null;
      const tail = m[2] ?? '';
      return { key: m[1], fields: { [lead]: m[1], ...(keywords ? { keywords: tail ? tail.split(', ') : [] } : { [value]: tail }) } };
    },
  };
}

const educationDegree = (item) => [item.degree, item.area].filter(Boolean).join(' ');
const EDUCATION_RE = new RegExp(`^- (.+?)(?:, (.+?))?(?:, (.+?))?(?: \\(([^()]*)\\))?(?: ${DASH_RE} (.*))?$`);

/**
 * The section registry, by RR section type. `kind` picks the walker:
 * prose (paragraphs and bullets), entries (### experience entries) or list
 * (one line per item through render/parse). A list row with `entry` can also
 * be written as `###` entries (a section with `layout: 'entries'`): `name` is
 * the item field the heading holds, `bold`/`setBold` read and write the bold
 * line, and a row without them has no bold line.
 */
export const SECTION_ROWS = {
  summary: { type: 'summary', kind: 'prose' },
  'cover-letter': { type: 'cover-letter', kind: 'prose' },
  experience: { type: 'experience', kind: 'entries', heading: 'Work Experience' },
  education: {
    type: 'education', kind: 'list', heading: 'Education',
    entry: { name: 'school', bold: educationDegree, setBold: (item, text) => Object.assign(item, { degree: text, area: '' }) },
    key: educationDegree,
    render(item, style) {
      let s = `- ${educationDegree(item)}`;
      if (item.school) s += `, ${item.school}`;
      if (item.location) s += `, ${item.location}`;
      if (item.period) s += ` (${item.period})`;
      const desc = htmlToMd(item.description);
      if (desc) s += ` ${style.dash} ${desc}`;
      return s;
    },
    parse(line) {
      const m = line.match(EDUCATION_RE);
      if (!m) return null;
      return {
        key: m[1],
        fields: { degree: m[1], area: '', school: m[2] ?? '', location: m[3] ?? '', period: m[4] ?? '', description: m[5] ? pHtml(m[5]) : '' },
        dateField: 'period',
      };
    },
  },
  projects: { kind: 'list', heading: 'Projects', ...boldRow('projects', { lead: 'name', paren: 'period', dateField: 'period' }) },
  skills: { kind: 'list', heading: 'Skills', ...colonRow('skills', { lead: 'name', keywords: true }) },
  certifications: { kind: 'list', heading: 'Certifications', ...boldRow('certifications', { lead: 'title', comma: 'issuer', paren: 'date', dateField: 'date' }) },
  awards: { kind: 'list', heading: 'Awards', ...boldRow('awards', { lead: 'title', comma: 'awarder', paren: 'date', dateField: 'date' }) },
  publications: { kind: 'list', heading: 'Publications', ...boldRow('publications', { lead: 'title', comma: 'publisher', paren: 'date', dateField: 'date' }) },
  languages: { kind: 'list', heading: 'Languages', ...colonRow('languages', { lead: 'language', value: 'fluency' }) },
  interests: { kind: 'list', heading: 'Interests', ...colonRow('interests', { lead: 'name', keywords: true, colonInside: false }) },
  volunteer: { kind: 'list', heading: 'Volunteer', entry: { name: 'organization' }, ...boldRow('volunteer', { lead: 'organization', comma: 'location', paren: 'period', dateField: 'period' }) },
  references: { kind: 'list', heading: 'References', ...boldRow('references', { lead: 'name', comma: 'position' }) },
  // Profiles normally render as header contact lines; this row is for a custom section of type profiles.
  profiles: {
    type: 'profiles', kind: 'list', heading: 'Profiles',
    key: (item) => item.network,
    render: (item) => `- **${item.network}:** ${websiteText(item.website) || item.username}`.trimEnd(),
    parse(line) {
      const m = line.match(/^- \*\*(.+?):\*\*(?: (.*))?$/);
      return m ? { key: m[1], fields: { network: m[1], username: m[2] ?? '' } } : null;
    },
  },
};

/** Built-in `##` sections in the order a cv.md without a recorded order gets them. */
export const BUILT_IN_ORDER = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'awards', 'publications', 'languages', 'interests', 'volunteer', 'references'];

/** Experience items flattened to one entry per role (or the item itself). */
export function flattenEntries(items) {
  return items.flatMap((item) => (item.roles?.length ? item.roles.map((role) => ({ item, role })) : [{ item, role: null }]));
}

/**
 * Every `##` section of the resume as a descriptor, in render order: the
 * recorded sectionOrder first, then the rest in BUILT_IN_ORDER, then custom
 * sections. Empty sections are left out.
 */
export function sectionDescriptors(data) {
  const style = data.careerOps.cvStyle;
  const all = [];
  for (const id of BUILT_IN_ORDER) {
    if (id === 'summary') {
      all.push({ id, row: SECTION_ROWS.summary, heading: style.summaryHeading, section: data.summary, items: null, empty: !proseBlocks(data.summary.content).length });
      continue;
    }
    const section = data.sections[id];
    const heading = id === 'experience' ? style.experienceHeading : section.title || SECTION_ROWS[id].heading;
    all.push({ id, row: SECTION_ROWS[id], heading, section, items: section.items, empty: section.items.length === 0 });
  }
  for (const section of data.customSections) {
    const row = SECTION_ROWS[section.type];
    const empty = row.kind === 'prose' ? !section.items.some((i) => proseBlocks(i.content).length) : section.items.length === 0;
    all.push({ id: section.id, row, heading: section.title || row.heading || section.type, section, items: section.items, empty });
  }
  const visible = all.filter((d) => !d.empty);
  const rank = (d) => {
    const i = style.sectionOrder.indexOf(d.id);
    return i === -1 ? style.sectionOrder.length + all.indexOf(d) : i;
  };
  return visible.sort((a, b) => rank(a) - rank(b));
}

const entryHeading = (name, location, style) => (location ? `### ${name} ${style.dash} ${location}` : `### ${name}`);

function descriptionBlocks(html) {
  const { lead, items } = splitDescription(html);
  return [...lead.map((p) => [p.md]), ...(items.length ? [items.map((i) => `- ${i.md}`)] : [])];
}

/** The lines of one experience entry, as blocks (arrays of lines). */
function renderEntry({ item, role }, style) {
  const target = role ?? item;
  return [
    [entryHeading(item.company, item.location, style)],
    [`**${target.position}**`, ...(target.period ? [target.period] : [])],
    ...descriptionBlocks(target.description),
  ];
}

/** One item of a list section written as an entry: heading, bold line and period with no blank line between them. */
function renderListEntry(item, entry, style) {
  const bold = entry.bold?.(item);
  return [
    [entryHeading(item[entry.name], item.location, style), ...(bold ? [`**${bold}**`] : []), ...(item.period ? [item.period] : [])],
    ...descriptionBlocks(item.description),
  ];
}

export const CONTACT_FIELDS = { Location: 'location', Email: 'email', Phone: 'phone' };
export const isWebsiteLabel = (label) => label === 'Website' || label === 'Portfolio';

/** Contact labels in render order: the recorded ones, then any unlisted fact. */
function contactLabels(data, style) {
  const labels = [...style.contactLines];
  for (const [label, field] of Object.entries(CONTACT_FIELDS)) {
    if (!labels.includes(label) && data.basics[field]) labels.push(label);
  }
  if (!labels.some(isWebsiteLabel) && websiteText(data.basics.website)) labels.push('Website');
  for (const p of data.sections.profiles.items) if (!labels.includes(p.network)) labels.push(p.network);
  return labels;
}

function contactValue(data, label) {
  if (CONTACT_FIELDS[label]) return data.basics[CONTACT_FIELDS[label]];
  if (isWebsiteLabel(label)) return websiteText(data.basics.website);
  const profile = data.sections.profiles.items.find((p) => p.network === label);
  return profile ? websiteText(profile.website) || profile.username : '';
}

function renderHeader(data, style) {
  const contacts = contactLabels(data, style)
    .map((label) => [label, contactValue(data, label)])
    .filter(([, value]) => value)
    .map(([label, value]) => `**${label}:** ${value}`);
  return [
    [(style.titlePrefix !== false ? `# CV ${style.dash} ${data.basics.name}` : `# ${data.basics.name}`).trimEnd()],
    ...(contacts.length ? [contacts] : []),
    ...(data.basics.headline ? [[`_${data.basics.headline}_`]] : []),
  ];
}

/** The blocks of one `##` section, heading included. */
function renderSection(d, style) {
  const blocks = [[`## ${d.heading}`]];
  if (d.row.kind === 'prose') {
    const contents = d.items ? d.items.map((i) => i.content) : [d.section.content];
    for (const html of contents) blocks.push(...proseBlocks(html));
  } else if (d.row.kind === 'entries') {
    for (const entry of flattenEntries(d.items)) blocks.push(...renderEntry(entry, style));
  } else if (d.section.layout === 'entries' && d.row.entry) {
    for (const item of d.items) blocks.push(...renderListEntry(item, d.row.entry, style));
  } else {
    blocks.push(d.items.map((item) => d.row.render(item, style)));
  }
  return blocks;
}

/**
 * cv.md for a resume. Hidden sections and items are included: cv.md is the
 * evaluator's full record, and hiding is a per-render choice.
 *
 * @param {object} data ResumeData (parsed)
 * @returns {string}
 */
export function resumeToCvMarkdown(data) {
  const style = data.careerOps.cvStyle;
  const blocks = [...renderHeader(data, style)];
  for (const d of sectionDescriptors(data)) blocks.push(...renderSection(d, style));
  return blocks.map((lines) => lines.join('\n')).join('\n\n') + '\n';
}
