// Forwards to the real server; for the /pipeline document, holds the bytes from
// the streamed segment (<div hidden id="S:0") back by DELAY ms, as a slow server render would.
import http from "node:http";
const [listen, upstream, delay] = process.argv.slice(2).map(Number);
http.createServer((req, res) => {
  const fwd = { ...req.headers }; delete fwd["accept-encoding"];
  const up = http.request({ host: "127.0.0.1", port: upstream, path: req.url, method: req.method, headers: fwd }, (ur) => {
    const isDoc = req.method === "GET" && req.url.startsWith("/pipeline") && !req.headers["rsc"] && String(ur.headers["content-type"]).includes("text/html");
    if (!isDoc) { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); return; }
    const h = { ...ur.headers }; delete h["content-length"];
    res.writeHead(ur.statusCode, h);
    let buf = Buffer.alloc(0), split = false, chain = Promise.resolve();
    const later = (fn) => { chain = chain.then(fn); };
    ur.on("data", (c) => {
      if (split) return later(() => res.write(c));
      buf = Buffer.concat([buf, c]);
      const i = buf.indexOf('<div hidden id="S:0"');
      if (i >= 0) { split = true; res.write(buf.subarray(0, i)); const rest = buf.subarray(i); later(() => new Promise((r) => setTimeout(r, delay))); later(() => res.write(rest)); buf = null; }
    });
    ur.on("end", () => { if (!split) res.end(buf); else later(() => res.end()); });
  });
  req.pipe(up);
}).listen(listen, "127.0.0.1");
