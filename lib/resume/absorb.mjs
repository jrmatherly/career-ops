// cv.md -> ResumeData. Walks the same section registry gen renders from
// (to-cv-md.mjs), so `lossless` holds when the regenerated file matches the
// normalized input: every line fits a row's grammar and nothing stored is
// missing from the file. Never writes anything.
import { boldLineText, headingText, isExperienceHeading, normalizePandocLine, parseCompanyHeading, toPlainText } from '../cv-markdown.mjs';
import { normalizeDates } from '../../cv-title-check.mjs';
import { normalizeCompany } from '../../tracker-utils.mjs';
import { sha256 } from './model.mjs';
import {
  defaultResumeData, formatResumeDates, getExpectedLabel, getPresentLabel, parseResume, readLegacyDates, sectionDefaults,
} from './schema.mjs';
import {
  BUILT_IN_ORDER, CONTACT_FIELDS, ENTRY_LAYOUT_RE, SECTION_ROWS, descriptionHtml, flattenEntries, isWebsiteLabel, liHtml, pHtml, proseBlocks, renderListEntry,
  entryHeading, resumeToCvMarkdown, sectionDescriptors, splitDescription, toWebsite, websiteText,
} from './to-cv-md.mjs';

const blankWebsite = () => ({ url: '', label: '', inlineLink: false });
const BLANK = {
  experience: () => ({ company: '', position: '', location: '', period: '', website: blankWebsite(), description: '', roles: [] }),
  education: () => ({ school: '', degree: '', area: '', grade: '', location: '', period: '', website: blankWebsite(), description: '' }),
  projects: () => ({ name: '', period: '', website: blankWebsite(), description: '' }),
  skills: () => ({ icon: '', iconColor: '', name: '', proficiency: '', level: 0, keywords: [] }),
  certifications: () => ({ title: '', issuer: '', date: '', website: blankWebsite(), description: '' }),
  awards: () => ({ title: '', awarder: '', date: '', website: blankWebsite(), description: '' }),
  publications: () => ({ title: '', publisher: '', date: '', website: blankWebsite(), description: '' }),
  languages: () => ({ language: '', fluency: '', level: 0 }),
  interests: () => ({ icon: '', iconColor: '', name: '', keywords: [] }),
  volunteer: () => ({ organization: '', location: '', period: '', website: blankWebsite(), description: '' }),
  references: () => ({ name: '', position: '', website: blankWebsite(), phone: '', description: '' }),
  profiles: () => ({ icon: '', iconColor: '', network: '', username: '', website: blankWebsite() }),
  summary: () => ({ content: '' }),
  'cover-letter': () => ({ recipient: '', content: '' }),
};
const newItem = (ctx, type, seed, fields = {}) => ({ id: ctx.makeId(seed), hidden: false, ...BLANK[type](), ...fields });

/**
 * Ids for what absorb creates, derived from the content rather than random, so
 * the id a refused absorb reports is the id `resume.mjs pair` finds when it
 * absorbs the same file again in another process.
 */
function idMaker(data) {
  const taken = new Set(data.customSections.map((s) => s.id));
  for (const section of [...Object.values(data.sections), ...data.customSections]) {
    for (const item of section.items) for (const { id } of [item, ...(item.roles ?? [])]) taken.add(id);
  }
  const seen = new Map();
  return (seed) => {
    const n = seen.get(seed) ?? 0;
    seen.set(seed, n + 1);
    for (let attempt = 0; ; attempt++) {
      const h = sha256(`${seed}\u0000${n}\u0000${attempt}`);
      const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
      if (!taken.has(id)) {
        taken.add(id);
        return id;
      }
    }
  };
}

const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const CONTACT_RE = /^\*\*([^*:]+):\*\*\s*(.*?)\s*$/;
const SUMMARY_RE = /^(professional )?summary$/i;
const eq = (a, b) => Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase();
const entryKey = (company, period) => `${normalizeCompany(company)}||${normalizeDates(period)}`;

/** Both sides of the lossless comparison, normalized the same way; blank-line runs carry no fact, so a deleted line that left one behind still absorbs. */
const normalizeForCompare = (text) => String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  .map((line) => normalizePandocLine(line).trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');

function dateOptions(data) {
  const { locale, dateFormat } = data.metadata.page;
  return { locale, format: dateFormat, presentLabel: getPresentLabel(locale), expectedLabel: getExpectedLabel(locale) };
}

/**
 * Write a date text into an entry, keeping structured `dates` in step. RR's
 * syncResumeDates rewrites the text from `dates` on every parse, so a text the
 * formatter would not reproduce (an en dash, `2020-2024`) is kept in dates.raw.
 */
function setDates(data, target, field, text) {
  const options = dateOptions(data);
  target[field] = text;
  if (target.dates && formatResumeDates(target.dates, options) === text) return;
  const dates = readLegacyDates(text, { locale: options.locale, single: field === 'date' });
  if (formatResumeDates(dates, options) !== text) dates.raw = text;
  target.dates = dates;
}

/** Longest-common-subsequence alignment of stored bullets to parsed ones; unchanged bullets keep their HTML. */
function alignBullets(stored, parsed) {
  const n = stored.length;
  const m = parsed.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = stored[i].md === parsed[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let edits = 0;
  const pendingOld = [];
  const pendingNew = [];
  const flush = () => {
    edits += Math.max(pendingOld.length, pendingNew.length);
    pendingOld.length = 0;
    for (const md of pendingNew.splice(0)) out.push(liHtml(md));
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && stored[i].md === parsed[j]) {
      flush();
      out.push(stored[i].html);
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
      pendingOld.push(stored[i++]);
    } else {
      pendingNew.push(parsed[j++]);
    }
  }
  flush();
  return { html: out, edits };
}

/** Split cv.md into the header region and its `##` sections, keeping 1-based line numbers. */
function splitFile(cvMarkdown) {
  const lines = String(cvMarkdown ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
    .map((raw, i) => ({ no: i + 1, raw: raw.trimEnd(), norm: normalizePandocLine(raw).trimEnd() }));
  const header = [];
  const sections = [];
  for (const line of lines) {
    const h2 = headingText(line.norm, 2);
    if (h2 !== null) sections.push({ heading: h2, line, lines: [] });
    else (sections.at(-1)?.lines ?? header).push(line);
  }
  return { header, sections };
}

function detectDash(header, sections) {
  const candidates = [
    header.find((l) => headingText(l.norm, 1) !== null),
    ...sections.flatMap((s) => s.lines).filter((l) => headingText(l.norm, 3) !== null).slice(0, 1),
  ];
  for (const line of candidates) {
    const m = line?.raw.match(/\s(---|--|—|–)\s/);
    if (m) return m[1] === '---' ? '—' : m[1];
  }
  return '--';
}

/**
 * Parse `### Company -- Location` entries out of a section's lines. Experience
 * reads its period only under a bold line, whatever that line says. A list
 * section's entry (`listEntry` set) also reads one directly under the heading,
 * takes a line as the period only when `isPeriod` says it reads as one (any
 * other line is description), and reports a bold line its row has no field
 * for. Each entry notes its own blank lines: `spaced` (one between heading and
 * bold line) and `tight` (none above the description), undefined when it has
 * no such line. `before[i]` is how many bullets precede paragraph `lead[i]`.
 */
function parseEntries(lines, unparsed, listEntry = null, isPeriod = () => true, storedHeadings = new Map()) {
  const hasBold = !listEntry || Boolean(listEntry.bold);
  const entries = [];
  let entry = null;
  let stage = 'body';
  let inLead = false;
  let gap = false;
  let prevBlank = false;
  for (const line of lines) {
    const afterBlank = prevBlank;
    prevBlank = line.raw.trim() === '';
    const h3 = headingText(line.norm, 3);
    if (h3 !== null) {
      // A stored name can hold the dash a heading splits on, so a heading a stored item writes is read as that item.
      const split = storedHeadings.get(h3) ?? parseCompanyHeading(line.raw) ?? parseCompanyHeading(line.norm) ?? { company: h3, location: '' };
      entry = { ...split, position: '', period: '', lead: [], before: [], bullets: [], line: line.no };
      entries.push(entry);
      stage = 'title';
      inLead = false;
      gap = false;
      continue;
    }
    const blank = prevBlank;
    if (!entry) {
      if (!blank) unparsed.push({ line: line.no, text: line.raw });
      continue;
    }
    if (stage === 'title') {
      if (blank) {
        gap = true;
        continue;
      }
      const bold = boldLineText(line.raw) ?? boldLineText(line.norm);
      stage = 'body';
      if (bold !== null) {
        if (hasBold) Object.assign(entry, { position: bold, spaced: gap });
        else unparsed.push({ line: line.no, text: line.raw });
        stage = 'period';
        continue;
      }
      if (listEntry && !gap && !BULLET_RE.test(line.raw) && isPeriod(toPlainText(line.raw))) {
        entry.period = toPlainText(line.raw);
        continue;
      }
    } else if (stage === 'period') {
      stage = 'body';
      if (!blank && !BULLET_RE.test(line.raw) && isPeriod(toPlainText(line.raw))) {
        entry.period = toPlainText(line.raw);
        continue;
      }
    }
    if (!blank) entry.tight ??= !afterBlank;
    const bullet = line.raw.match(BULLET_RE);
    if (blank) inLead = false;
    else if (bullet) {
      entry.bullets.push(bullet[1].trim());
      inLead = false;
    } else if (inLead) entry.lead[entry.lead.length - 1] += ` ${line.raw.trim()}`;
    else {
      entry.lead.push(line.raw.trim());
      entry.before.push(entry.bullets.length);
      inLead = true;
    }
  }
  return entries;
}

/** Paragraph and bullet blocks of a prose section, as the md lines proseBlocks renders. */
function parseProse(lines) {
  const blocks = [];
  let block = null;
  for (const line of lines) {
    if (line.raw.trim() === '') {
      block = null;
      continue;
    }
    const bullet = line.raw.match(BULLET_RE);
    if (bullet) {
      if (block?.type !== 'ul') blocks.push(block = { type: 'ul', items: [] });
      block.items.push(bullet[1].trim());
    } else {
      if (block?.type !== 'p') blocks.push(block = { type: 'p', text: [] });
      block.text.push(line.raw.trim());
    }
  }
  return {
    md: blocks.map((b) => (b.type === 'p' ? [b.text.join(' ')] : b.items.map((i) => `- ${i}`))),
    html: blocks.map((b) => (b.type === 'p' ? pHtml(b.text.join(' ')) : descriptionHtml([], b.items.map(liHtml)))).join(''),
  };
}

/**
 * Absorb a cv.md into a resume.
 *
 * @param {string} cvMarkdown
 * @param {object|null} prior ResumeData from data/resume.json, or null for a first absorb
 * @returns {{ data: object, report: { kept: number, changed: number, added: number, removed: number (the orphan count; orphans stay stored),
 *   orphans: object[], newEntries: object[], unparsed: {line: number, text: string}[] }, lossless: boolean }}
 */
export function absorb(cvMarkdown, prior) {
  const data = prior ? structuredClone(prior) : parseResume(structuredClone(defaultResumeData)).data;
  const report = { kept: 0, changed: 0, added: 0, removed: 0, orphans: [], newEntries: [], unparsed: [] };
  const priorStyle = data.careerOps.cvStyle;
  const { header, sections } = splitFile(cvMarkdown);
  const count = (changed) => (changed ? report.changed++ : report.kept++);

  // The style is the file's own, so gen reproduces the headings, dash and contact order it used.
  const style = {
    experienceHeading: sections.find((s) => isExperienceHeading(s.heading))?.heading ?? priorStyle.experienceHeading,
    summaryHeading: sections.find((s) => SUMMARY_RE.test(s.heading) || eq(s.heading, priorStyle.summaryHeading))?.heading ?? priorStyle.summaryHeading,
    dash: detectDash(header, sections),
    titlePrefix: priorStyle.titlePrefix ?? true,
    contactLines: [],
    sectionOrder: [],
  };
  data.careerOps.cvStyle = style;
  const ctx = { data, style, report, count, makeId: idMaker(data) };

  absorbHeader(ctx, header);

  const seen = new Set();
  for (const section of sections) {
    const target = resolveSection(ctx, section, priorStyle);
    style.sectionOrder.push(target.id);
    seen.add(target.id);
    const { row } = target;
    if (row.kind === 'prose') absorbProse(ctx, target, section.lines);
    else if (row.kind === 'entries') absorbEntries(ctx, target, section.lines);
    else if (row.entry && section.lines.some((l) => headingText(l.norm, 3) !== null)) {
      absorbListEntries(ctx, target, section.lines, section === sections.at(-1));
    } else {
      if (ENTRY_LAYOUT_RE.test(target.section.layout)) delete target.section.layout;
      absorbList(ctx, target, section.lines);
    }
  }

  // A stored section the file no longer has keeps its items, reported as orphans.
  for (const d of sectionDescriptors(data)) {
    if (seen.has(d.id)) continue;
    if (!d.items) report.orphans.push({ section: d.id, id: d.id, name: d.heading });
    else if (d.row.kind === 'entries') for (const e of flattenEntries(d.items)) report.orphans.push(entryRef(e));
    else for (const item of d.items) report.orphans.push({ section: d.id, id: item.id, name: d.row.key?.(item) ?? d.heading });
  }
  report.removed = report.orphans.length;

  const parsed = parseResume(data);
  if (!parsed.ok) throw new Error(`absorb produced an invalid resume: ${JSON.stringify(parsed.issues)}`);
  const lossless = report.unparsed.length === 0 && normalizeForCompare(resumeToCvMarkdown(parsed.data)) === normalizeForCompare(cvMarkdown);
  return { data: parsed.data, report, lossless };
}

function absorbHeader(ctx, header) {
  const { data, style, report, count } = ctx;
  const { basics } = data;
  const profiles = data.sections.profiles.items;
  const before = JSON.stringify([basics, profiles]);
  let name = null;
  let headline = '';
  const contacts = [];
  for (const line of header) {
    if (line.raw.trim() === '') continue;
    const h1 = headingText(line.raw, 1);
    const cv = h1?.match(/^CV\s+[-–—]+\s+(.+)$/);
    const contact = line.raw.match(CONTACT_RE);
    const lead = line.raw.match(/^_(.+)_$/);
    if (name === null && h1 !== null) {
      name = cv ? cv[1] : h1;
      style.titlePrefix = Boolean(cv);
    }
    else if (contact) contacts.push([contact[1].trim(), contact[2]]);
    else if (lead) headline = lead[1];
    else report.unparsed.push({ line: line.no, text: line.raw });
  }
  if (name !== null) basics.name = name;
  basics.headline = headline;
  for (const field of Object.values(CONTACT_FIELDS)) basics[field] = '';
  let website = null;
  const listed = new Set();
  for (const [label, value] of contacts) {
    style.contactLines.push(label);
    if (CONTACT_FIELDS[label]) basics[CONTACT_FIELDS[label]] = value;
    else if (isWebsiteLabel(label)) website = value;
    else {
      let profile = profiles.find((p) => p.network === label);
      if (!profile) {
        profile = newItem(ctx, 'profiles', `profiles|${label}`, { network: label });
        profiles.push(profile);
        report.added++;
        report.newEntries.push({ section: 'profiles', id: profile.id, name: label });
      }
      listed.add(profile);
      if ((websiteText(profile.website) || profile.username) !== value) profile.website = toWebsite(value, profile.website);
    }
  }
  if (website === null) basics.website = { url: '', label: '' };
  else if (websiteText(basics.website) !== website) basics.website = toWebsite(website);
  for (const p of profiles) if (!listed.has(p)) report.orphans.push({ section: 'profiles', id: p.id, name: p.network });
  count(JSON.stringify([basics, profiles]) !== before);
}

/**
 * The section a `## heading` names. Nothing matching makes a custom section:
 * experience when it holds `### Company -- Location` entries, else summary,
 * which takes any text.
 */
function resolveSection({ data, makeId }, { heading, lines }, priorStyle) {
  if (isExperienceHeading(heading)) return { id: 'experience', row: SECTION_ROWS.experience, items: data.sections.experience.items };
  if (SUMMARY_RE.test(heading) || eq(heading, priorStyle.summaryHeading) || eq(heading, data.summary.title)) {
    return { id: 'summary', row: SECTION_ROWS.summary, section: data.summary, items: null };
  }
  for (const id of BUILT_IN_ORDER) {
    const section = data.sections[id];
    if (!section || id === 'experience') continue;
    if (eq(heading, SECTION_ROWS[id].heading) || eq(heading, section.title)) {
      if (heading !== (section.title || SECTION_ROWS[id].heading)) section.title = heading;
      return { id, row: SECTION_ROWS[id], section, items: section.items };
    }
  }
  let custom = data.customSections.find((s) => eq(s.title, heading));
  if (!custom) {
    const type = lines.some((l) => parseCompanyHeading(l.norm)) ? 'experience' : 'summary';
    custom = { ...sectionDefaults(''), id: makeId(`custom|${heading}`), type, title: heading, items: [] };
    data.customSections.push(custom);
    data.metadata.layout.pages[0]?.main.push(custom.id);
  }
  return { id: custom.id, row: SECTION_ROWS[custom.type], section: custom, items: custom.items };
}

function absorbProse(ctx, target, lines) {
  const parsed = parseProse(lines);
  const contents = target.items ? target.items.map((i) => i.content) : [target.section.content];
  const changed = JSON.stringify(contents.flatMap((html) => proseBlocks(html))) !== JSON.stringify(parsed.md);
  ctx.count(changed);
  if (!changed) return;
  if (!target.items) target.section.content = parsed.html;
  else {
    const first = target.items[0] ?? newItem(ctx, target.section.type, `${target.id}|content`);
    first.content = parsed.html;
    target.items.splice(0, target.items.length, first);
  }
}

const storedHeadings = (items, name, style) => new Map(items.map((item) => [entryHeading(item[name], item.location, style).slice(4), { company: item[name], location: item.location }]));

const entryRef = ({ item, role }) => ({ id: (role ?? item).id, company: item.company, position: (role ?? item).position, period: (role ?? item).period });

function absorbEntries(ctx, target, lines) {
  const { data, report, count } = ctx;
  const items = target.items;
  const stored = flattenEntries(items);
  const byKey = new Map();
  for (const e of stored) {
    const key = entryKey(e.item.company, (e.role ?? e.item).period);
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  const used = new Set();
  let lastItem = null;
  for (const parsed of parseEntries(lines, report.unparsed, null, undefined, storedHeadings(items, 'company', ctx.style))) {
    const key = entryKey(parsed.company, parsed.period);
    const hit = byKey.get(key)?.find((e) => !used.has(e));
    if (!hit) {
      const description = descriptionHtml(parsed.lead.map(pHtml), parsed.bullets.map(liHtml), parsed.before);
      const item = newItem(ctx, 'experience', `${target.id}|${key}`, { company: parsed.company, position: parsed.position, location: parsed.location, description });
      setDates(data, item, 'period', parsed.period);
      items.splice(lastItem ? items.indexOf(lastItem) + 1 : 0, 0, item);
      lastItem = item;
      report.added++;
      report.newEntries.push(entryRef({ item, role: null }));
      continue;
    }
    used.add(hit);
    lastItem = hit.item;
    const entry = hit.role ?? hit.item;
    const old = splitDescription(entry.description);
    const leadSame = JSON.stringify(old.lead.map((b) => b.md)) === JSON.stringify(parsed.lead);
    const orderSame = JSON.stringify(old.lead.map((b) => b.before)) === JSON.stringify(parsed.before);
    const bullets = alignBullets(old.items, parsed.bullets);
    const bodySame = leadSame && orderSame && bullets.edits === 0;
    const same = bodySame && hit.item.company === parsed.company && hit.item.location === parsed.location
      && entry.position === parsed.position && entry.period === parsed.period;
    count(!same);
    if (same) continue;
    hit.item.company = parsed.company;
    hit.item.location = parsed.location;
    entry.position = parsed.position;
    if (entry.period !== parsed.period) setDates(data, entry, 'period', parsed.period);
    if (!bodySame) {
      entry.description = descriptionHtml(leadSame ? old.lead.map((b) => b.html) : parsed.lead.map(pHtml), bullets.html, parsed.before);
    }
  }
  for (const e of stored) if (!used.has(e)) report.orphans.push(entryRef(e));
}

/**
 * The first line of an entries section that gen would not write back where the
 * file has it, or null. A run of blank lines counts as one, as in `lossless`.
 */
function firstUnreproduced(lines, blocks, isLast) {
  const want = ['', ...blocks.flatMap((block) => [...block.map((text) => normalizePandocLine(text).trimEnd()), ''])]
    .filter((text, i, all) => text !== '' || all[i - 1] !== '');
  const src = lines.filter((line, i) => line.norm !== '' || lines[i - 1]?.norm !== '');
  if (isLast) {
    want.pop();
    while (src.at(-1)?.norm === '') src.pop();
  }
  let at = want.findIndex((text, i) => text !== src[i]?.norm);
  if (at === -1 && src.length > want.length) at = want.length;
  if (at === -1) return null;
  return src.slice(at).find((line) => line.norm !== '') ?? src.findLast((line) => line.norm !== '');
}

/**
 * A list section written as `###` entries: the experience grammar onto the
 * row's own item fields. Each layout flag comes from the first entry that shows
 * it; a line the layout would not write back is reported, so a file that
 * reads cleanly is either lossless or names the line that is not.
 */
function absorbListEntries(ctx, target, lines, isLast) {
  const { data, style, report, count } = ctx;
  const { row, items, id: section } = target;
  const { name, bold, setBold } = row.entry;
  const keyOf = (item) => entryKey(item[name], item.period);
  const used = new Set();
  const reported = report.unparsed.length;
  const { locale } = data.metadata.page;
  const entries = parseEntries(lines, report.unparsed, row.entry, (text) => readLegacyDates(text, { locale }).start !== null, storedHeadings(items, name, style));
  const layout = `entries${entries.find((e) => e.spaced !== undefined)?.spaced ? '-spaced' : ''}${entries.find((e) => e.tight !== undefined)?.tight ? '-tight' : ''}`;
  target.section.layout = layout;
  for (const parsed of entries) {
    const key = entryKey(parsed.company, parsed.period);
    const hit = items.find((i) => !used.has(i) && keyOf(i) === key);
    const item = hit ?? newItem(ctx, row.type, `${section}|${key}`);
    if (!hit) {
      report.added++;
      report.newEntries.push({ section, id: item.id, name: parsed.company });
    }
    used.add(item);
    const old = splitDescription(item.description);
    const leadSame = JSON.stringify(old.lead.map((b) => b.md)) === JSON.stringify(parsed.lead);
    const orderSame = JSON.stringify(old.lead.map((b) => b.before)) === JSON.stringify(parsed.before);
    const bullets = alignBullets(old.items, parsed.bullets);
    const bodySame = leadSame && orderSame && bullets.edits === 0;
    const boldSame = !bold || bold(item) === parsed.position;
    const same = bodySame && boldSame && item[name] === parsed.company && item.location === parsed.location && item.period === parsed.period;
    if (hit) count(!same);
    if (same) continue;
    item[name] = parsed.company;
    item.location = parsed.location;
    if (!boldSame) setBold(item, parsed.position);
    if (item.period !== parsed.period) setDates(data, item, 'period', parsed.period);
    if (!bodySame) item.description = descriptionHtml(leadSame ? old.lead.map((b) => b.html) : parsed.lead.map(pHtml), bullets.html, parsed.before);
  }
  // The file's order is the stored order; entries it no longer has follow, as orphans.
  const orphans = items.filter((item) => !used.has(item));
  items.splice(0, items.length, ...used, ...orphans);
  for (const item of orphans) report.orphans.push({ section, id: item.id, name: item[name] });
  if (report.unparsed.length > reported) return;
  const stray = firstUnreproduced(lines, [...used].flatMap((item) => renderListEntry(item, row.entry, style, layout)), isLast);
  if (stray) report.unparsed.push({ line: stray.no, text: stray.raw });
}

function absorbList(ctx, target, lines) {
  const { data, style, report, count } = ctx;
  const { row, items, id: section } = target;
  const byKey = new Map();
  for (const item of items) byKey.set(row.key(item), [...(byKey.get(row.key(item)) ?? []), item]);
  const used = new Set();
  let last = null;
  for (const line of lines) {
    if (line.raw.trim() === '') continue;
    const parsed = row.parse(line.raw);
    if (!parsed) {
      report.unparsed.push({ line: line.no, text: line.raw });
      continue;
    }
    const { dateField, fields } = parsed;
    const assign = (item) => {
      for (const [key, value] of Object.entries(fields)) if (key !== dateField) item[key] = value;
      if (dateField && item[dateField] !== fields[dateField]) setDates(data, item, dateField, fields[dateField]);
    };
    const hit = byKey.get(parsed.key)?.find((i) => !used.has(i));
    if (hit) {
      used.add(hit);
      last = hit;
      const changed = row.render(hit, style) !== line.raw;
      count(changed);
      if (changed) assign(hit);
      continue;
    }
    const item = newItem(ctx, row.type, `${section}|${parsed.key}`);
    if (dateField) item[dateField] = '';
    assign(item);
    items.splice(last ? items.indexOf(last) + 1 : 0, 0, item);
    used.add(item);
    last = item;
    report.added++;
    report.newEntries.push({ section, id: item.id, name: parsed.key });
  }
  for (const item of items) if (!used.has(item)) report.orphans.push({ section, id: item.id, name: row.key(item) });
}

/**
 * Pair an orphan with the new entry that replaces it: the new entry takes the
 * orphan's id, for a whole entry (not a role) its hidden flag and website, and its structured
 * dates only while they still print the new entry's date text; the orphan goes.
 *
 * @param {object} data ResumeData (mutated and returned)
 * @param {string} orphanId
 * @param {string} newEntryId
 * @returns {object}
 */
export function pairOrphan(data, orphanId, newEntryId) {
  const find = (id) => {
    for (const section of [...Object.values(data.sections), ...data.customSections]) {
      for (const item of section.items) {
        if (item.id === id) return { section, item, role: null };
        const role = item.roles?.find((r) => r.id === id);
        if (role) return { section, item, role };
      }
    }
    throw new Error(`pairOrphan: no entry with id ${id}`);
  };
  const orphan = find(orphanId);
  const fresh = find(newEntryId);
  const source = orphan.role ?? orphan.item;
  const target = fresh.role ?? fresh.item;
  if (orphan.role) {
    orphan.item.roles = orphan.item.roles.filter((r) => r !== source);
    if (orphan.item.roles.length === 0) orphan.section.items.splice(orphan.section.items.indexOf(orphan.item), 1);
  } else {
    orphan.section.items.splice(orphan.section.items.indexOf(source), 1);
    target.hidden = source.hidden;
    if ('website' in source) target.website = source.website;
  }
  target.id = source.id;
  // The orphan's structured dates replace the new entry's only while they still print its text.
  const field = 'period' in target ? 'period' : 'date';
  if (source.dates && field in target) {
    if (formatResumeDates(source.dates, dateOptions(data)) === target[field]) target.dates = source.dates;
  }
  return data;
}
