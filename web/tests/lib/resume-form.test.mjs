// Pure ResumeData edit helpers and the description converter (web/src/lib/resume-form.mjs).
//
// Run:  node --test tests/lib/resume-form.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUILT_IN_HEADINGS,
  BUILT_IN_SECTIONS,
  EXPERIENCE_HEADING_RE,
  SUMMARY_HEADING_RE,
  customTitleProblem,
  firstTitleProblem,
  editorReducer,
  SECTION_TYPES,
  addCustomSection,
  addItem,
  descriptionToText,
  moveItem,
  removeItem,
  setField,
  textToDescription,
  toWebsite,
  toggleHidden,
  websiteText,
} from "../../src/lib/resume-form.mjs";
// The web copy of the converter must agree with the one cv.md is written by; these imports carry no zod.
import { defaultResumeData } from "../../../lib/resume/vendor/default.mjs";
import { BUILT_IN_ORDER, SECTION_ROWS, descriptionHtml, liHtml, pHtml, proseBlocks } from "../../../lib/resume/to-cv-md.mjs";
import { EXPERIENCE_HEADING_NAMES, isExperienceHeading } from "../../../lib/cv-markdown.mjs";

const REAL_DESCRIPTION =
  "<ul><li><p>Built NLP pipeline for document classification (BERT fine-tuning, 94% accuracy on legal docs)</p></li><li><p>Implemented search ranking with learning-to-rank models</p></li><li><p>Set up experiment tracking with MLflow and model versioning</p></li></ul>";

function draft() {
  const sections = Object.fromEntries(BUILT_IN_SECTIONS.map((k) => [k, { title: "", hidden: false, items: [] }]));
  sections.experience.items = [
    { id: "a", hidden: false, company: "A", position: "P", period: "2020-2024", dates: { start: "2020", end: "2024", present: false }, description: REAL_DESCRIPTION },
    { id: "b", hidden: false, company: "B", position: "Q", period: "2018-2020", description: "" },
    { id: "c", hidden: false, company: "C", position: "R", period: "2016", description: "" },
  ];
  return deepFreeze({ basics: { name: "Alex" }, sections, customSections: [] });
}

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
  return Object.freeze(o);
}

const ids = (d) => d.sections.experience.items.map((i) => i.id);

test("the built-in sections are exactly the resume model's, each with a registry row", () => {
  assert.deepEqual([...BUILT_IN_SECTIONS].sort(), Object.keys(defaultResumeData.sections).sort());
  for (const key of BUILT_IN_SECTIONS) assert.ok(SECTION_TYPES[key], key);
});

test("the converter matches lib/resume/to-cv-md.mjs on the shapes cv.md writes", () => {
  const fixtures = [
    { lead: ["Lead **bold** & _em_ with [a link](https://x.dev/a?b=1&c=2)"], bullets: ["Cut <p99> by 40%", "Shipped **v2**"] },
    { lead: [], bullets: ["Only a bullet"] },
    { lead: ["One paragraph", "Two paragraphs"], bullets: [] },
  ];
  for (const { lead, bullets } of fixtures) {
    const root = descriptionHtml(lead.map(pHtml), bullets.map(liHtml));
    const text = [...lead, ...bullets.map((b) => `- ${b}`)].join("\n");
    assert.equal(textToDescription(text), root, text);
    assert.equal(descriptionToText(root), proseBlocks(root).flat().join("\n"), text);
  }
});

test("addItem appends a blank item of the section's type, without mutating the input", () => {
  const d = draft();
  const next = addItem(d, "experience", "new");
  assert.deepEqual(ids(next), ["a", "b", "c", "new"]);
  assert.deepEqual(next.sections.experience.items[3], { id: "new", hidden: false, ...SECTION_TYPES.experience.blank() });
  assert.equal(ids(d).length, 3);
  assert.equal(next.sections.education, d.sections.education, "untouched branches are shared");
});

test("removeItem drops the item by id", () => {
  assert.deepEqual(ids(removeItem(draft(), "experience", "b")), ["a", "c"]);
});

test("moveItem moves by delta and clamps at both ends", () => {
  const d = draft();
  assert.deepEqual(ids(moveItem(d, "experience", "a", 1)), ["b", "a", "c"]);
  assert.deepEqual(ids(moveItem(d, "experience", "c", -5)), ["c", "a", "b"]);
  assert.equal(moveItem(d, "experience", "a", -1), d, "no-op at the top returns the same object");
  assert.equal(moveItem(d, "experience", "c", 1), d, "no-op at the bottom returns the same object");
});

test("setField sets along a path and drops dates when writing period", () => {
  const d = draft();
  const next = setField(d, ["sections", "experience", "items", 0, "period"], "2021-2024");
  const item = next.sections.experience.items[0];
  assert.equal(item.period, "2021-2024");
  assert.equal("dates" in item, false);
  assert.ok(d.sections.experience.items[0].dates, "input keeps its dates");
  const company = setField(d, ["sections", "experience", "items", 0, "company"], "Z");
  assert.ok(company.sections.experience.items[0].dates, "other fields keep dates");
  assert.equal(setField(d, ["basics", "name"], "Sam").basics.name, "Sam");
  const award = setField({ items: [{ date: "2020", dates: { start: "2020" } }] }, ["items", 0, "date"], "2021").items[0];
  assert.deepEqual(award, { date: "2021" }, "writing date drops dates too");
});

test("toggleHidden flips a section, or one item when an id is given", () => {
  const d = draft();
  assert.equal(toggleHidden(d, "experience").sections.experience.hidden, true);
  const item = toggleHidden(d, "experience", "b");
  assert.equal(item.sections.experience.items[1].hidden, true);
  assert.equal(item.sections.experience.hidden, false);
});

test("addCustomSection creates a section addItem can fill with its type", () => {
  const d = addCustomSection(draft(), "projects", "cs1", "Side projects");
  assert.deepEqual(d.customSections[0], {
    title: "Side projects", icon: "", columns: 1, hidden: false, showHeading: true, keepTogether: false, startOnNewPage: false, type: "projects", id: "cs1", items: [],
  });
  const filled = addItem(d, "cs1", "p1");
  assert.deepEqual(filled.customSections[0].items, [{ id: "p1", hidden: false, ...SECTION_TYPES.projects.blank() }]);
  assert.equal(toggleHidden(filled, "cs1", "p1").customSections[0].items[0].hidden, true);
  assert.throws(() => addItem(d, "nope", "x"), /unknown section/);
});

test("description round-trips the example's real HTML", () => {
  const text = descriptionToText(REAL_DESCRIPTION);
  assert.equal(text.split("\n").length, 3);
  assert.match(text, /^- Built NLP pipeline/);
  assert.equal(textToDescription(text), REAL_DESCRIPTION);
});

test("description converts bold, emphasis, links and escapes, paragraphs before bullets", () => {
  const html = '<p>Lead <strong>bold</strong> &amp; <em>em</em></p><ul><li><p>See <a href="https://x.dev/a?b=1&amp;c=2">x &lt;site&gt;</a></p></li></ul>';
  const text = descriptionToText(html);
  assert.equal(text, "Lead **bold** & _em_\n- See [x <site>](https://x.dev/a?b=1&c=2)");
  assert.equal(textToDescription(text), html);
  assert.equal(textToDescription("one\n\n- a\n- b\ntwo\n- c"), "<p>one</p><ul><li><p>a</p></li><li><p>b</p></li></ul><p>two</p><ul><li><p>c</p></li></ul>");
  assert.equal(textToDescription(""), "");
  assert.equal(textToDescription("- a\n- \n-"), "<ul><li><p>a</p></li></ul>", "a bullet still being typed does not split the list");
  assert.equal(descriptionToText("<p><<b>script>x</p>"), "x", "a tag split by another tag is stripped");
  assert.equal(descriptionToText("<p>a</p>tail text<blockquote>q</blockquote>"), "a\ntail text q", "text outside p/ul/ol is kept, not lost on the first edit");
});

test("website text edits url and label together", () => {
  assert.equal(websiteText({ url: "https://a.dev", label: "" }), "a.dev");
  assert.deepEqual(toWebsite("a.dev", { inlineLink: false }), { inlineLink: false, url: "https://a.dev", label: "a.dev" });
  assert.deepEqual(toWebsite(" ", { url: "x", label: "y" }), { url: "", label: "" });
});

test("custom titles absorb.mjs would read as a built-in section, or as another custom one, are refused", () => {
  const rootHeadings = BUILT_IN_ORDER.filter((id) => id !== "summary" && id !== "experience").map((id) => SECTION_ROWS[id].heading);
  assert.deepEqual([...BUILT_IN_HEADINGS].sort(), rootHeadings.sort(), "the mirrored heading list matches lib/resume/to-cv-md.mjs");
  const base = { ...draft(), summary: { title: "" }, careerOps: { cvStyle: { summaryHeading: "Professional Summary" } } };
  const titled = (...titles) => ({ ...base, customSections: titles.map((title, i) => ({ id: `c${i}`, type: "projects", title, items: [] })) });
  for (const title of [...rootHeadings, ...EXPERIENCE_HEADING_NAMES, "summary", "Professional Summary", " projects ", ""]) {
    assert.ok(customTitleProblem(titled(title), "c0"), `"${title}" should be refused`);
  }
  assert.match(customTitleProblem(titled("Side Projects", "side projects"), "c1"), /Another custom section/);
  assert.equal(customTitleProblem(titled("Additional projects"), "c0"), null, "the editor's default title is safe");
  assert.equal(firstTitleProblem(titled("Side Projects", "Projects")), customTitleProblem(titled("Side Projects", "Projects"), "c1"));
  assert.equal(firstTitleProblem(titled("Side Projects")), null);
});

test("the mirrored heading patterns agree with lib/cv-markdown.mjs and absorb.mjs", () => {
  const probes = [...EXPERIENCE_HEADING_NAMES, "Work  Experience", "Experiences", "Side Projects", "Professional Summary", "Summary", "Career Summary", "summary"];
  for (const p of probes) assert.equal(EXPERIENCE_HEADING_RE.test(p), isExperienceHeading(p), p);
  // absorb.mjs keeps SUMMARY_RE private; its source line is the reference.
  const absorbSource = readFileSync(new URL("../../../lib/resume/absorb.mjs", import.meta.url), "utf8");
  assert.ok(absorbSource.includes(`const SUMMARY_RE = ${SUMMARY_HEADING_RE};`), "absorb.mjs SUMMARY_RE changed; update SUMMARY_HEADING_RE");
});

test("the editor reducer keeps save state honest", () => {
  const d1 = { v: 1 };
  const d2 = { v: 2 };
  const loaded = editorReducer({}, { type: "loaded", data: d1, cvMdSha: "s1", report: {}, lossless: true });
  assert.equal(loaded.status.kind, "editing");
  assert.equal(loaded.data, loaded.saved, "nothing unsaved after load");
  assert.equal(editorReducer({}, { type: "loaded", data: d1, cvMdSha: null, report: {}, lossless: false }).status.kind, "readonly");
  assert.equal(editorReducer({}, { type: "loaded", data: null, cvMdSha: null, report: {}, lossless: true }).status.kind, "readonly");

  const saving = editorReducer(loaded, { type: "saving" });
  const editedMidSave = editorReducer(saving, { type: "edit", data: d2 });
  assert.equal(editedMidSave.status.kind, "saving", "an edit does not re-enable Save while a save is in flight");
  const answered = editorReducer(editedMidSave, { type: "saved", data: d1, cvMdSha: "s2" });
  assert.equal(answered.status.kind, "editing", "newer edits are not reported as saved");
  assert.equal(answered.saved, d1);
  assert.notEqual(answered.data, answered.saved, "the newer edit still counts as unsaved");
  assert.equal(answered.cvMdSha, "s2");
  assert.equal(editorReducer(saving, { type: "saved", data: d1, cvMdSha: "s2" }).status.kind, "saved");

  const conflict = editorReducer(loaded, { type: "conflict", message: "x" });
  assert.equal(editorReducer(conflict, { type: "edit", data: d2 }).status.kind, "conflict", "a conflict stays until reload");
  const invalid = editorReducer(loaded, { type: "invalid", message: "x" });
  assert.equal(editorReducer(invalid, { type: "edit", data: d2 }).status.kind, "editing", "an edit clears a validation message");
});
