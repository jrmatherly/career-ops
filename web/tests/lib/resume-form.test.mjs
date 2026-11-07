// Pure ResumeData edit helpers and the description converter (web/src/lib/resume-form.mjs).
//
// Run:  node --test tests/lib/resume-form.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_SECTIONS,
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
import { descriptionHtml, liHtml, pHtml, proseBlocks } from "../../../lib/resume/to-cv-md.mjs";

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
});

test("website text edits url and label together", () => {
  assert.equal(websiteText({ url: "https://a.dev", label: "" }), "a.dev");
  assert.deepEqual(toWebsite("a.dev", { inlineLink: false }), { inlineLink: false, url: "https://a.dev", label: "a.dev" });
  assert.deepEqual(toWebsite(" ", { url: "x", label: "y" }), { url: "", label: "" });
});
