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
