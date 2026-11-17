import { test } from "node:test";
import assert from "node:assert/strict";
import * as masker from "../../src/lib/mask-secrets.mjs";

const { maskSecrets } = masker;

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
  for (const short of ["a", "ab", "abc"]) assert.equal(maskSecrets(`password=${short}`), "password=[masked]");
});

test("the bare word password in prose is left alone", () => {
  for (const line of ["password required for this portal", "Enter your password to continue", "the password is wrong"]) assert.equal(maskSecrets(line), line);
});

test("a value after an explicit Basic or Bearer scheme is masked even with no digit", () => {
  assert.equal(maskSecrets("Authorization: Basic dXNlcjphYmNkZWZnaA=="), "Authorization: Basic [masked]");
  assert.equal(maskSecrets("authorization: bearer abcdefghijklmnopqrstuvwx"), "authorization: bearer [masked]");
});

test("a short value after an Authorization scheme is masked", () => {
  assert.equal(maskSecrets("Authorization: Basic YTpi"), "Authorization: Basic [masked]");
  assert.equal(maskSecrets("Proxy-Authorization: Bearer abc1"), "Proxy-Authorization: Bearer [masked]");
});

test("a quoted password is masked to its closing quote", () => {
  assert.equal(maskSecrets('password: "fake pass phrase"'), 'password: "[masked]"');
  assert.equal(maskSecrets("password='fake pass phrase' next"), "password='[masked]' next");
  assert.equal(maskSecrets('{"password": "fake pass phrase", "user": "u"}'), '{"password": "[masked]", "user": "u"}');
  assert.equal(maskSecrets('password: "fake pass phrase cut by the end'), 'password: "[masked]');
});

test("a credential passed as a command-line flag is masked", () => {
  for (const [s, out] of [
    ["--password fakepass0", "--password [masked]"],
    ["--token FAKEtokenvalue", "--token [masked]"],
    ["run --api-key=FAKEkeyvalue --verbose", "run --api-key=[masked] --verbose"],
    ['--github-token "fake token"', '--github-token "[masked]"'],
  ]) assert.equal(maskSecrets(s), out);
  for (const s of ["--max-tokens 4096", "--token-limit 4096", "--password --verbose"]) assert.equal(maskSecrets(s), s);
});

test("a URL password holding an @ is masked up to the host", () => {
  assert.equal(maskSecrets("fetch https://fakeuser:fake@pass@example.invalid/x failed"), "fetch https://fakeuser:[masked]@example.invalid/x failed");
});

test("a path assigned to PWD is not taken for a password", () => {
  for (const s of ["PWD=/srv/app", "PWD=/srv/career-ops", 'pwd: "/home/me/work"']) assert.equal(maskSecrets(s), s);
});

test("GitLab and Hugging Face token prefixes are masked", () => {
  assert.equal(maskSecrets("glpat-" + "FAKE0000fake1111FAKE"), "glpat-[masked]");
  assert.equal(maskSecrets("hf_" + "FAKE0000fake1111FAKE2222"), "hf_[masked]");
});

test("a secret the server holds is masked by value, with no label or shape", () => {
  const known = masker.knownSecrets([{ FAKE_SERVICE_API_KEY: "FAKEnodigitsatallHERE", HOME: "/home/fake", SHORT_TOKEN: "abc" }]);
  assert.deepEqual(known, [{ name: "FAKE_SERVICE_API_KEY", value: "FAKEnodigitsatallHERE" }]);
  assert.equal(maskSecrets("upstream rejected FAKEnodigitsatallHERE twice", known), "upstream rejected [masked:FAKE_SERVICE_API_KEY] twice");
});

test("the tail of a known secret at the start of the text is masked", () => {
  const known = masker.knownSecrets([{ FAKE_TOKEN: "FAKEnodigitsatallHERE" }]);
  assert.equal(maskSecrets("digitsatallHERE and more", known), "[masked:FAKE_TOKEN] and more");
  assert.equal(maskSecrets("HERE and more", known), "HERE and more");
});

test("a variable named outside the name rule is secret when listed", () => {
  const env = { FAKE_CLIENT_ID: "FAKEclientidvalue" };
  assert.deepEqual(masker.knownSecrets([env]), []);
  assert.deepEqual(masker.knownSecrets([env], ["FAKE_CLIENT_ID"]), [{ name: "FAKE_CLIENT_ID", value: "FAKEclientidvalue" }]);
});

test("every secret in the settings registry is masked by value", async () => {
  const { SETTINGS } = await import("../../../lib/settings-registry.mjs");
  const { CAREER_OPS_SECRET_ENV } = await import("../../src/lib/spawn-cli.mjs");
  const ids = SETTINGS.filter((s) => s.kind === "secret").map((s) => s.id);
  assert.ok(ids.length > 0);
  for (const id of [...ids, ...CAREER_OPS_SECRET_ENV]) assert.ok(masker.isSecretName(id, CAREER_OPS_SECRET_ENV), id);
});

test("pathological inputs of 128,000 characters are masked in under 200 ms", () => {
  const known = masker.knownSecrets?.([{ FAKE_API_KEY: "FAKEknownvalue00" }]) ?? [];
  for (const unit of ["key=", "password=", 'password: "', "'", '"', "@", "https://u:", "a://b:@", "--password ", "--", "-", "sk-", "eyJ", "Authorization: Bearer ", "FAKEknown"]) {
    const s = unit.repeat(Math.ceil(128_000 / unit.length)).slice(0, 128_000);
    const t0 = performance.now();
    maskSecrets(s, known);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, `${JSON.stringify(unit)} took ${ms.toFixed(1)} ms`);
  }
});


test("a known secret with surrounding whitespace or a trailing newline is masked", () => {
  const known = masker.knownSecrets([{ FAKE_MOUNTED_TOKEN: "FAKEmountedTokenValueAbCd\n", FAKE_PADDED_API_KEY: "  FAKEpaddedKeyValueXyZw  " }]);
  assert.equal(maskSecrets("upstream said FAKEmountedTokenValueAbCd and FAKEpaddedKeyValueXyZw", known), "upstream said [masked:FAKE_MOUNTED_TOKEN] and [masked:FAKE_PADDED_API_KEY]");
});

test("a known secret is masked in its JSON-escaped and URL-encoded forms", () => {
  const value = 'Fk"ZqLm\\Wt+Rb/Xy=Hn pQ';
  const known = masker.knownSecrets([{ FAKE_ODD_API_KEY: value }]);
  assert.equal(maskSecrets(`body ${JSON.stringify({ k: value })} end`, known), 'body {"k":"[masked:FAKE_ODD_API_KEY]"} end');
  assert.equal(maskSecrets(`GET /x?k=${encodeURIComponent(value)} end`, known), "GET /x?k=[masked:FAKE_ODD_API_KEY] end");
});

test("two known secrets that overlap in the text are masked whole", () => {
  const known = masker.knownSecrets([{ A_KEY: "abcdefghIJKLMNOP", B_KEY: "IJKLMNOPqrstuvwx" }]);
  assert.equal(maskSecrets("x abcdefghIJKLMNOPqrstuvwx y IJKLMNOPqrstuvwx", known), "x [masked:A_KEY] y [masked:B_KEY]");
  const nested = masker.knownSecrets([{ A_KEY: "abcdefghIJKLMNOP", C_TOKEN: "abcdefghIJKLMNOPqrstuvwxYZ" }]);
  assert.equal(maskSecrets("x abcdefghIJKLMNOPqrstuvwxYZ y abcdefghIJKLMNOP", nested), "x [masked:C_TOKEN] y [masked:A_KEY]");
});

test("a quoted password holding an escaped quote is masked to its closing quote", () => {
  assert.equal(maskSecrets('password="he said \\"hi\\" twice" next'), 'password="[masked]" next');
  assert.equal(maskSecrets("password='it\\'s mine now' next"), "password='[masked]' next");
  assert.equal(maskSecrets('{"password":"abc\\"def ghi","user":"x"}'), '{"password":"[masked]","user":"x"}');
  assert.equal(maskSecrets("{'password': 'abc\\'def ghi', 'user': 'x'}"), "{'password': '[masked]', 'user': 'x'}");
  assert.equal(maskSecrets('--password "two \\"quoted\\" words" --user bob'), '--password "[masked]" --user bob');
});

test("a URL password with an empty user name is masked", () => {
  assert.equal(maskSecrets("redis://:onlypass@host.invalid:6379"), "redis://:[masked]@host.invalid:6379");
  assert.equal(maskSecrets("see http://a.invalid:8080/x and mail me@b.invalid"), "see http://a.invalid:8080/x and mail me@b.invalid");
});

test("a variable the name rule matches is secret unless it is named as a location and holds a plain path or URL", () => {
  const env = {
    LOCAL_BIN_KEY: "/usr/local/bin", SSH_KEY_PATH: "~/.ssh/id_ed25519", API_KEY_FILE: "./run/secrets/key", KEYCLOAK_URL: "https://sso.example.invalid/realms/main",
    TOKEN_ENDPOINT: "https://example.invalid/oauth/token", PARTITION_KEY: "location", CACHE_KEY: "evaluate", I18N_FALLBACK_KEY: "evaluation.fallback", TOKEN_TYPE_TOKEN: "access-token",
    MAX_TOKENS: "12000000", DB_PASSWORD: "correcthorsebattery", TOKEN_BUDGET_MODE: "standard", SORT_KEY: "createdAt", FAKE_TOKEN: "FAKEnodigitsatallHERE",
    PROXY_URL_SECRET: "https://fakeuser:FakePass000@proxy.invalid", JWT_SECRET: "/x9/FAKEbase64ish+00", GMAIL_CLIENT_ID: "/usr/local/bin/listed",
    // A path or URL under a name that is not a location stays secret: a base64 key can start with "/", and a webhook URL is one.
    FAKE_SECRET_ACCESS_KEY: "/FAKEbase64ishABCDEFGHijklmnopqrstuvwxyz", FAKE_WEBHOOK_TOKEN: "https://hooks.example.invalid/services/FAKE/FAKE",
    // A location name does not exempt a URL or path that carries a long token-like run.
    FAKE_HOOK_SECRET_URL: "https://hooks.example.invalid/services/FAKEtokenFAKEtokenFAKEtoken", FAKE_KEY_FILE: "/run/FAKEtokenFAKEtokenFAKEtoken",
  };
  const names = [...new Set(masker.knownSecrets([env], ["GMAIL_CLIENT_ID"]).map((k) => k.name))].sort();
  assert.deepEqual(names, ["CACHE_KEY", "DB_PASSWORD", "FAKE_HOOK_SECRET_URL", "FAKE_KEY_FILE", "FAKE_SECRET_ACCESS_KEY", "FAKE_TOKEN", "FAKE_WEBHOOK_TOKEN", "GMAIL_CLIENT_ID", "I18N_FALLBACK_KEY", "JWT_SECRET", "LOCAL_BIN_KEY", "MAX_TOKENS", "PARTITION_KEY", "PROXY_URL_SECRET", "SORT_KEY", "TOKEN_BUDGET_MODE", "TOKEN_TYPE_TOKEN"]);
});

test("200 known secrets mask a 128,000-character text in under 200 ms", () => {
  const env = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`FAKE_${i}_API_KEY`, `FAKEvalue${String(i).padStart(4, "0")}${"abcdefgh".repeat(1 + (i % 6))}`]));
  const known = masker.knownSecrets([env]);
  for (const s of [Object.values(env).join(" ").repeat(30).slice(0, 128_000), "lorem ipsum ".repeat(11_000).slice(0, 128_000), "a".repeat(128_000)]) {
    const t0 = performance.now();
    maskSecrets(s, known);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
  }
});

test("a known value that is a label word still lets the value it labels be masked", () => {
  const known = masker.knownSecrets([{ FAKE_FIELD_PASSWORD_REF: "password" }]);
  assert.equal(maskSecrets('login password: "plum vexed 47" ok', known), 'login [masked:FAKE_FIELD_PASSWORD_REF]: "[masked]" ok');
  assert.equal(maskSecrets("run --password hunter2 now", known), "run --[masked:FAKE_FIELD_PASSWORD_REF] [masked] now");
});
