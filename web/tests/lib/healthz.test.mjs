// The liveness probe answers 200 without touching the data root or spawning anything.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/next-server-stub.mjs";

const ROUTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "app", "api", "healthz", "route.ts");

test("GET /api/healthz answers 200 with { ok: true } and no-store", async () => {
  const { GET } = await import(ROUTE);
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { ok: true });
});

test("the healthz route imports nothing but next/server", () => {
  const specifiers = [...readFileSync(ROUTE, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, "found the next/server import");
  assert.deepEqual([...new Set(specifiers)], ["next/server"]);
});
