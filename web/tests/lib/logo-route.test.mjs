// GET /api/logo answers 204 for a company with no logo, so the <img> falls back
// to the monogram without the browser logging a failed request. Driven under
// the @/ loader against a temp data root, with fetch stubbed: nothing reaches the network.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataRoot = mkdtempSync(join(tmpdir(), "co-logo-route-"));
const cache = join(dataRoot, ".career-ops-web", "logo-cache");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const ICON = new Uint8Array(519).fill(7);
let GET;
let asked;

// The route reads only nextUrl.
const get = (query) => GET({ nextUrl: new URL(`http://127.0.0.1/api/logo?${query}`) });

before(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  ({ GET } = await import("../../src/app/api/logo/route.ts"));
});

beforeEach(() => {
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(cache, { recursive: true });
  asked = [];
  // Google's answer for a domain it has no icon for: 404 with a placeholder.
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response(new Uint8Array(726).fill(1), { status: 404, headers: { "Content-Type": "image/png" } });
  };
});

after(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

test("a cached miss answers 204 with no body and asks nobody", async () => {
  writeFileSync(join(cache, "fixture.example.png"), "");
  const res = await get("domain=fixture.example");
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  assert.deepEqual(asked, []);
});

test("a lookup that finds no logo answers 204 and caches the miss", async () => {
  const res = await get("domain=fixture.example");
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  assert.equal(asked.length, 1);
  assert.equal(statSync(join(cache, "fixture.example.png")).size, 0);
});

test("a company name with no candidate domain answers 204", async () => {
  const res = await get("company=a");
  assert.equal(res.status, 204);
  assert.deepEqual(asked, []);
});

test("a cached logo answers 200 as a PNG", async () => {
  writeFileSync(join(cache, "fixture.example.png"), ICON);
  const res = await get("domain=fixture.example");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), ICON);
  assert.deepEqual(readFileSync(join(cache, "fixture.example.png")), Buffer.from(ICON));
});

test("bad input still answers 400", async () => {
  assert.equal((await get("domain=..bad")).status, 400);
  assert.equal((await get("")).status, 400);
});

test("a lookup that fails answers 204 and is not cached, so the next request asks again", async () => {
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response("", { status: 503 });
  };
  assert.equal((await get("domain=fixture.example")).status, 204);
  assert.equal(existsSync(join(cache, "fixture.example.png")), false);
  assert.equal((await get("domain=fixture.example")).status, 204);
  assert.equal(asked.length, 2);
});
