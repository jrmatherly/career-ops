import { test } from "node:test";
import assert from "node:assert/strict";
import { maskSecrets } from "../../src/lib/mask-secrets.mjs";

test("ordinary prose and error messages come through unchanged", () => {
  for (const s of [
    "API key missing: set OPENROUTER_API_KEY",
    "API key required for openrouter",
    "This run hit an error before finishing.",
    "error: the session token expired yesterday",
    "max_tokens: 4096 exceeded",
    "Unauthorized. Run `claude login` to refresh your credentials.",
    "the task-12345678 failed after 3 retries",
    "see https://example.com/docs/api-keys for setup",
    "secret: rotated",
  ]) assert.equal(maskSecrets(s), s);
});

test("a value after a key-like label keeps the label and loses the value", () => {
  assert.equal(maskSecrets("OPENROUTER_API_KEY=FAKE0000fake1111FAKE"), "OPENROUTER_API_KEY=[masked]");
  assert.equal(maskSecrets("password: Fake0000Pass1111word"), "password: [masked]");
  assert.equal(maskSecrets('{"client_secret":"fake0000FAKE1111fake"}'), '{"client_secret":"[masked]"}');
  assert.equal(maskSecrets("Authorization: Bearer FAKEtoken0000fake1111"), "Authorization: Bearer [masked]");
  assert.equal(maskSecrets("Authorization: Basic ZmFrZTpmYWtlMTIzNDU2Nzg5"), "Authorization: Basic [masked]");
  assert.equal(maskSecrets("using token fake0000FAKE1111fake now"), "using token [masked] now");
});

test("a well-known key prefix is kept and the rest masked", () => {
  for (const [key, kept] of [
    ["sk-ant-api03-FAKE0000fake1111FAKE2222", "sk-ant-"],
    ["sk-or-v1-FAKE0000fake1111FAKE2222", "sk-"],
    ["ghp_FAKE0000fake1111FAKE2222fake", "ghp_"],
    ["github_pat_11FAKE0000_fake1111FAKE2222", "github_pat_"],
    ["AIzaFAKE0000fake1111FAKE2222fake3333", "AIza"],
    ["xoxb-0000000000-FAKEfakeFAKE", "xoxb-"],
  ]) assert.equal(maskSecrets(`failed with ${key} in header`), `failed with ${kept}[masked] in header`);
});

test("every key on a multi-line output is masked", () => {
  const out = maskSecrets("line one\nkey=FAKE0000fake1111FAKE\nfetch ghp_FAKE0000fake1111FAKE2222fake failed");
  assert.equal(out, "line one\nkey=[masked]\nfetch ghp_[masked] failed");
});

test("empty input", () => {
  assert.equal(maskSecrets(""), "");
  assert.equal(maskSecrets(undefined), "");
});

test("a JWT with no label keeps its eyJ marker and loses the rest", () => {
  const jwt = "eyJhbGciOiJGQUtFIn0.eyJzdWIiOiJmYWtlIn0.FAKEsig0000fake1111";
  assert.equal(maskSecrets(`cookie was ${jwt}.`), "cookie was eyJ[masked].");
});

test("an AWS access key id keeps its AKIA or ASIA prefix", () => {
  assert.equal(maskSecrets("using AKIAFAKE0000FAKE1111 now"), "using AKIA[masked] now");
  assert.equal(maskSecrets("using ASIAFAKE0000FAKE1111 now"), "using ASIA[masked] now");
});

test("a password inside a URL is masked, scheme, user and host kept", () => {
  assert.equal(maskSecrets("fetch https://fakeuser:FakePass000@example.invalid/x failed"), "fetch https://fakeuser:[masked]@example.invalid/x failed");
  assert.equal(maskSecrets("see http://localhost:3000/runs"), "see http://localhost:3000/runs");
});

test("credential, password, cookie and api key label variants are masked", () => {
  for (const [s, out] of [
    ["credential: FAKE0000fake1111FAKE", "credential: [masked]"],
    ["credentials=FAKE0000fake1111FAKE", "credentials=[masked]"],
    ["pwd=Fake0000Pass1111word", "pwd=[masked]"],
    ["passwd: Fake0000Pass1111word", "passwd: [masked]"],
    ["Cookie: session=FAKE0000fake1111FAKE", "Cookie: [masked]"],
    ["apikey=FAKE0000fake1111FAKE", "apikey=[masked]"],
    ["apiKey: FAKE0000fake1111FAKE", "apiKey: [masked]"],
    ["api-key FAKE0000fake1111FAKE", "api-key [masked]"],
  ]) assert.equal(maskSecrets(s), out);
});

test("a path or a word ending in a label is not taken for a key", () => {
  for (const s of [
    "Press any key\n/home/me/cv-2026-11-16.pdf",
    "cache key: /home/me/.cache/claude/v2/abc123def456ghi",
    "the monkey 2024abcdefghijklmnop",
  ]) assert.equal(maskSecrets(s), s);
});

test("an 8000-character run of repeated prefixes or labels returns", () => {
  for (const unit of ["sk-", "key="]) {
    const s = unit.repeat(Math.ceil(8000 / unit.length)).slice(0, 8000);
    assert.equal(maskSecrets(s), s);
  }
});

test("a label that ends a camelCase identifier is masked", () => {
  for (const [s, out] of [
    ["accessToken=FAKE0000fake1111FAKE", "accessToken=[masked]"],
    ["apiKey: FAKE0000fake1111FAKE", "apiKey: [masked]"],
    ["clientSecret=FAKE0000fake1111FAKE", "clientSecret=[masked]"],
    ["refreshToken: FAKE0000fake1111FAKE", "refreshToken: [masked]"],
    ["sessionCookie=FAKE0000fake1111FAKE", "sessionCookie=[masked]"],
    ['{"accessToken":"FAKE0000fake1111FAKE"}', '{"accessToken":"[masked]"}'],
  ]) assert.equal(maskSecrets(s), out);
});

test("a lowercase word holding a label is not taken for a key", () => {
  for (const s of [
    "the monkey 2024abcdefghijklmnop",
    "the tokenizer 2024abcdefghijklmnop",
    "the keyboard 2024abcdefghijklmnop",
    "the secretary 2024abcdefghijklmnop",
  ]) assert.equal(maskSecrets(s), s);
});

test("a labelled value starting with a slash is masked unless it is a path", () => {
  assert.equal(maskSecrets("token=/9j4AAQSkZJRgABAQ0000FAKE"), "token=[masked]");
  assert.equal(maskSecrets("cache key: /home/me/.cache/claude/v2/abc123def456ghi"), "cache key: /home/me/.cache/claude/v2/abc123def456ghi");
});

test("a password assigned with : or = is masked whatever its length or characters", () => {
  assert.equal(maskSecrets("login failed: password=example123 for u"), "login failed: password=[masked] for u");
  assert.equal(maskSecrets("password=fictionalAlphabeticPassword"), "password=[masked]");
  assert.equal(maskSecrets('{"dbPassword": "hunter"}'), '{"dbPassword": "[masked]"}');
  assert.equal(maskSecrets("PWD: abcd"), "PWD: [masked]");
});

test("the bare word password in prose is left alone", () => {
  for (const line of ["password required for this portal", "Enter your password to continue", "the password is wrong"]) assert.equal(maskSecrets(line), line);
});

test("a value after an explicit Basic or Bearer scheme is masked even with no digit", () => {
  assert.equal(maskSecrets("Authorization: Basic dXNlcjphYmNkZWZnaA=="), "Authorization: Basic [masked]");
  assert.equal(maskSecrets("authorization: bearer abcdefghijklmnopqrstuvwx"), "authorization: bearer [masked]");
});

