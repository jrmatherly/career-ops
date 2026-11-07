// tests/lib/delay-proxy.test.mjs — startDelayProxy against a loopback upstream:
// the split holds the segment back and keeps the bytes intact, non-HTML passes
// through, and an upstream that dies mid-body does not take the process down.
import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { startDelayProxy } from "../helpers/delay-proxy.mjs";

const HEAD = '<!doctype html><html><body><main>client copy</main>';
const SEGMENT = '<div hidden id="S:0">server copy</div><script>$RC()</script></body></html>';

function upstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Resolves with the response, the body and the time at which each chunk arrived.
function get(port, path = "/pipeline") {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push({ at: Date.now() - start, text: c.toString() }));
      res.on("end", () => resolve({ res, chunks, body: chunks.map((c) => c.text).join("") }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function withProxy(handler, delay, run) {
  const up = await upstream(handler);
  const proxy = await startDelayProxy(up.address().port, delay);
  try {
    await run(proxy.address().port, proxy);
  } finally {
    proxy.closeAllConnections(); proxy.close();
    up.closeAllConnections(); up.close();
  }
}

test("a marker split across two upstream chunks is found, held back by the delay and delivered intact", async () => {
  await withProxy((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.write(HEAD + SEGMENT.slice(0, 8));
    setTimeout(() => res.end(SEGMENT.slice(8)), 10);
  }, 150, async (port, proxy) => {
    const { body, chunks } = await get(port);
    assert.equal(body, HEAD + SEGMENT);
    const first = chunks.findIndex((c) => c.text.includes('<div hidden id="S:'));
    assert.ok(first > 0, "the head arrives in a chunk before the segment");
    assert.ok(chunks[first].at - chunks[first - 1].at >= 130, `segment held ${chunks[first].at - chunks[first - 1].at} ms`);
    assert.equal(proxy.splits, 1);
  });
});

test("a text/x-component body with the marker passes through undelayed and uncounted", async () => {
  await withProxy((req, res) => {
    res.writeHead(200, { "content-type": "text/x-component" });
    res.end(HEAD + SEGMENT);
  }, 500, async (port, proxy) => {
    const { body, chunks } = await get(port);
    assert.equal(body, HEAD + SEGMENT);
    assert.ok(chunks.at(-1).at < 400);
    assert.equal(proxy.splits, 0);
  });
});

test("an HTML body with no marker arrives intact and does not count as a split", async () => {
  await withProxy((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(HEAD + "</body></html>");
  }, 50, async (port, proxy) => {
    const { body } = await get(port);
    assert.equal(body, HEAD + "</body></html>");
    assert.equal(proxy.splits, 0);
  });
});

test("an upstream that resets mid-body truncates the response instead of throwing", async () => {
  await withProxy((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.write(HEAD);
    setTimeout(() => res.socket.resetAndDestroy(), 10);
  }, 50, async (port) => {
    await assert.rejects(get(port), (err) => ["ECONNRESET", "ECONNREFUSED", "EPIPE"].includes(err.code) || /aborted|socket hang up/.test(err.message));
  });
});

test("an unreachable upstream answers 502 as plain text without echoing the request", async () => {
  const dead = await upstream(() => {});
  const port = dead.address().port;
  await new Promise((r) => dead.close(r));
  const proxy = await startDelayProxy(port, 50);
  try {
    const { res, body } = await get(proxy.address().port, "/%3Cimg%20src=x%20onerror=alert(1)%3E");
    assert.equal(res.statusCode, 502);
    assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.match(body, /^delay proxy: upstream request failed: /);
    assert.doesNotMatch(body, /onerror/);
  } finally {
    proxy.close();
  }
});
