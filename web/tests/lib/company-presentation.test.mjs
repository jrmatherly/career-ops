import { test } from "node:test";
import assert from "node:assert/strict";
import { companyPresentation, companySearchText } from "../../src/lib/company-presentation.mjs";

test("confidential employer retains agency attribution without promoting it to employer", () => {
  const presentation = companyPresentation({ company: "?", via: "Example Staffing Agency" });
  assert.deepEqual(presentation, {
    label: "Confidential · via Example Staffing Agency",
    logoName: "Example Staffing Agency",
  });
  assert.match(companySearchText({ company: "?", via: "Example Staffing Agency", role: "Example Role" }), /Example Staffing Agency/);
});

test("confidential employer without a usable intermediary has an honest fallback", () => {
  for (const via of ["—", "–", "-", "n/a", "N/A", "tbd", "none", "null", "  "]) {
    assert.deepEqual(companyPresentation({ company: "?", via }), {
      label: "Confidential employer",
      logoName: "Confidential employer",
    });
  }
});

test("known employer display remains unchanged", () => {
  assert.deepEqual(companyPresentation({ company: "Acme", via: "Example Staffing Agency" }), {
    label: "Acme",
    logoName: "Acme",
  });
});

test("confidential entries sort by their human-facing label", () => {
  const rows = [
    { company: "?", via: "Zeta Agency" },
    { company: "Acme", via: "—" },
  ];
  const ordered = [...rows].sort((a, b) => companyPresentation(a).label.localeCompare(companyPresentation(b).label));
  assert.deepEqual(ordered, [rows[1], rows[0]]);
});

test("displayCompany capitalizes slug names and leaves cased names alone", async () => {
  const { displayCompany } = await import("../../src/lib/company-presentation.mjs");
  assert.equal(displayCompany("acme"), "Acme");
  assert.equal(displayCompany("example-labs"), "Example Labs");
  assert.equal(displayCompany("example_labs inc"), "Example Labs Inc");
  assert.equal(displayCompany("Initech"), "Initech");
  assert.equal(displayCompany("OpenAI"), "OpenAI");
});

test("compactLocation drops country codes and repeated places", async () => {
  const { compactLocation } = await import("../../src/lib/company-presentation.mjs");
  assert.equal(compactLocation("US - Seattle · Seattle · United States"), "Seattle, United States");
  assert.equal(compactLocation("Remote"), "Remote");
  assert.equal(compactLocation("A · B · C · D"), "A, B, C");
  assert.equal(compactLocation("Austin · US"), "Austin, US", "a part inside another word is not a repeat");
  assert.equal(compactLocation("Seattle, WA · seattle"), "Seattle, WA");
});

test("compactLocation reads a place holding regex characters as text", async () => {
  const { compactLocation } = await import("../../src/lib/company-presentation.mjs");
  assert.equal(compactLocation("Remote (US · US"), "Remote (US");
  assert.equal(compactLocation("C++ City · c++ city"), "C++ City");
});

test("compactLocation keeps the country on a remote role", async () => {
  const { compactLocation } = await import("../../src/lib/company-presentation.mjs");
  assert.equal(compactLocation("US - Remote · GB - Remote"), "US - Remote, GB - Remote");
  assert.equal(compactLocation("US - Seattle"), "Seattle");
});
