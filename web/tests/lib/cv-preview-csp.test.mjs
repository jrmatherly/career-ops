// web/tests/lib/cv-preview-csp.test.mjs. The live CV preview cannot reach the network.
import test from "node:test";
import assert from "node:assert/strict";
import { previewHtml } from "../../src/lib/cv-studio/preview-html.mjs";

const META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;

test("the tailored CV preview carries the preview CSP right after <head>", () => {
  const out = previewHtml('<html><head><title>x</title></head><body><img src="https://attacker.example/b"></body></html>');
  assert.ok(out.startsWith(`<html><head>${META}`), out.slice(0, 200));
});

test("a fragment with no <head> gets the CSP first", () => {
  assert.ok(previewHtml("<p>Hi</p>").startsWith(META));
});
