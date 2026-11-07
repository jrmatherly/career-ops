#!/usr/bin/env node
// tests/helpers/delay-proxy.mjs — reproduce React's streaming reveal race on demand.
//
// Forwards every request to the web server on UPSTREAM_PORT. For an HTML
// document (a GET without the `rsc` header), it holds the bytes from the first
// streamed segment (`<div hidden id="S:`) back by DELAY_MS, as a slow server
// render on a CI runner would. A frame then paints before the segment arrives
// and React keeps the server copy hidden for 300 ms after `load`, so a suite
// that reads the page right after page.goto sees two copies or a one-viewport
// shell (docs/superpowers/research/2026-11-07-web-browser-suite-flakes/REPORT.md).
//
//   node tests/helpers/delay-proxy.mjs <LISTEN_PORT> <UPSTREAM_PORT> <DELAY_MS>
//
// tests/browser-suites.mjs starts one per suite when BROWSER_SUITES_SEGMENT_DELAY_MS
// is set and hands the suite the proxy's URL.
import http from "node:http";

const args = process.argv.slice(2).map(Number);
if (args.length !== 3 || args.some((n) => !Number.isInteger(n) || n < 0)) {
  console.error("usage: node tests/helpers/delay-proxy.mjs <LISTEN_PORT> <UPSTREAM_PORT> <DELAY_MS>");
  process.exit(2);
}
const [listen, upstream, delay] = args;
const SEGMENT = '<div hidden id="S:';

http.createServer((req, res) => {
  const headers = { ...req.headers };
  delete headers["accept-encoding"]; // the split needs plain bytes
  const up = http.request({ host: "127.0.0.1", port: upstream, path: req.url, method: req.method, headers }, (ur) => {
    const isDoc = req.method === "GET" && !req.headers.rsc && String(ur.headers["content-type"]).includes("text/html");
    if (!isDoc) { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); return; }
    const h = { ...ur.headers };
    delete h["content-length"];
    res.writeHead(ur.statusCode, h);
    let buf = Buffer.alloc(0);
    let split = false;
    let chain = Promise.resolve();
    const later = (fn) => { chain = chain.then(fn); };
    ur.on("data", (chunk) => {
      if (split) return later(() => res.write(chunk));
      buf = Buffer.concat([buf, chunk]);
      const i = buf.indexOf(SEGMENT);
      if (i < 0) return;
      split = true;
      res.write(buf.subarray(0, i));
      const rest = buf.subarray(i);
      later(() => new Promise((resolve) => setTimeout(resolve, delay)));
      later(() => res.write(rest));
      buf = null;
    });
    ur.on("end", () => { if (split) later(() => res.end()); else res.end(buf); });
  });
  up.on("error", (err) => { res.writeHead(502); res.end(err.message); });
  req.pipe(up);
}).listen(listen, "127.0.0.1");
