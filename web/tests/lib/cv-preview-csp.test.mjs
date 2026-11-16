// web/tests/lib/cv-preview-csp.test.mjs. The live CV preview cannot reach the network.
import test from "node:test";
import assert from "node:assert/strict";
import { previewHtml, withPreviewCsp } from "../../src/lib/cv-studio/preview-html.mjs";

const META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;
// Only HTML whitespace, comments and one doctype may precede the meta: none of them creates an element.
const SAFE_PREFIX = /^(?:[\t\n\f\r ]|<!--(?!-?>)(?:(?!--!?>)[\s\S])*-->)*(?:<!doctype[^>]*>)?$/i;

function assertMetaFirst(out) {
  const at = out.indexOf(META);
  assert.ok(at >= 0, out.slice(0, 200));
  assert.match(out.slice(0, at), SAFE_PREFIX, out.slice(0, 200));
}

test("the tailored CV preview carries the preview CSP right after the doctype", () => {
  const out = previewHtml('<!DOCTYPE html><html><head><title>x</title></head><body><img src="https://attacker.example/b"></body></html>');
  assert.ok(out.startsWith(`<!DOCTYPE html>${META}`), out.slice(0, 200));
});

test("a fragment with no html or head gets the CSP first", () => {
  assert.ok(previewHtml("<p>Hi</p>").startsWith(META));
  assert.ok(withPreviewCsp("<p>Hi</p>").startsWith(META));
});

test("a <head> inside an attribute value does not pull the CSP into it", () => {
  const out = previewHtml('<html><body><p title="<head>">x</p></body></html>');
  assert.ok(out.startsWith(META), out.slice(0, 200));
  assert.ok(out.includes('title="<head>"'), out);
});

test("a <head> inside a title does not turn the CSP into title text", () => {
  const out = previewHtml("<title>a<head>b</title>");
  assert.ok(out.startsWith(META), out.slice(0, 200));
  assert.ok(out.includes("<title>a<head>b</title>"), out);
});

test("markup before the real head cannot push the CSP into the body", () => {
  const out = previewHtml('<html><link rel=stylesheet href="https://attacker.example/c"><img src="https://attacker.example/i"><head><title>x</title></head></html>');
  assert.ok(out.startsWith(META), out.slice(0, 200));
});

test("whitespace and a comment before the doctype stay ahead of it, and the CSP follows the doctype", () => {
  const out = withPreviewCsp("\n <!-- <head> --> \n<!doctype html><html><head></head></html>");
  assert.ok(out.startsWith(`\n <!-- <head> --> \n<!doctype html>${META}<html>`), out);
});

test("a comment the parser closes early is not skipped as if it hid the markup after it", () => {
  for (const html of [
    '<!--><img src="https://attacker.example/i"> --><!doctype html>',
    '<!---><img src="https://attacker.example/i"> --><!doctype html>',
    '<!-- a --!><img src="https://attacker.example/i"> --><!doctype html>',
  ]) {
    const out = withPreviewCsp(html);
    assert.ok(out.startsWith(META), out);
  }
});

test("every output starts with only whitespace, comments or a doctype before the CSP", () => {
  for (const html of [
    "<!DOCTYPE html><html><head><title>x</title></head><body>b</body></html>",
    '<html><body><p title="<head>">x</p></body></html>',
    "<title>a<head>b</title>",
    "<html><img src=x><head></head></html>",
    "﻿<!doctype html><head></head>",
    " <!doctype html><head></head>",
    "<p>Hi</p>",
    "",
  ]) assertMetaFirst(previewHtml(html));
});
