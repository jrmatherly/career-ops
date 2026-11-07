// tests/helpers/delay-proxy.mjs — reproduce React's streaming reveal race on demand.
// A loopback proxy in front of the web server that holds an HTML document's first
// streamed segment (`<div hidden id="S:`) back by delayMs, as a slow server
// render on a CI runner would. Every page then lands in the throttled reveal
// that tests/helpers/streaming.mjs describes. Used by tests/browser-suites.mjs
// under BROWSER_SUITES_SEGMENT_DELAY_MS.
import http from "node:http";

const SEGMENT = '<div hidden id="S:';

/**
 * @param {number} upstreamPort - the web server on 127.0.0.1
 * @param {number} delayMs
 * @returns {Promise<http.Server>} listening on a free loopback port (`address().port`)
 */
export function startDelayProxy(upstreamPort, delayMs) {
  const proxy = http.createServer((req, res) => {
    const headers = { ...req.headers };
    delete headers["accept-encoding"]; // the split needs plain bytes
    const up = http.request({ host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers }, (ur) => {
      // A browser that navigates away mid-stream resets the socket; neither side's
      // error may become an unhandled event that takes the runner down.
      ur.on("error", () => res.destroy());
      res.on("error", () => up.destroy());
      // RSC payloads are text/x-component; only the document carries the segment.
      if (!String(ur.headers["content-type"]).includes("text/html")) { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); return; }
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
        later(() => new Promise((resolve) => setTimeout(resolve, delayMs)));
        later(() => res.write(rest));
        buf = null;
      });
      ur.on("end", () => { if (split) later(() => res.end()); else res.end(buf); });
    });
    up.on("error", (err) => { res.writeHead(502); res.end(err.message); });
    req.pipe(up);
  });
  return new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", () => resolve(proxy));
  });
}
