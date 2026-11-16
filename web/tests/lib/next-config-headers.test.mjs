// web/tests/lib/next-config-headers.test.mjs. Every response says nosniff and sends no referrer.
import test from "node:test";
import assert from "node:assert/strict";
import config from "../../next.config.mjs";

test("next.config sends nosniff and no-referrer on every path", async () => {
  assert.deepEqual(await config.headers(), [
    { source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] },
  ]);
});
