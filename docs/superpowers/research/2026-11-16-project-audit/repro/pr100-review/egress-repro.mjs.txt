import { createServer, request as httpRequest } from 'node:http';
const R = process.cwd() + '/'; // run from the repo root
const { chromium } = await import(R + 'node_modules/playwright/index.mjs');
const lb = await import(R + 'liveness-browser.mjs');
const POSTING = `<h1>Engineer</h1><p>${'Platform engineer role with responsibilities and requirements. '.repeat(30)}</p><button>Apply now</button>`;
const priv = createServer((req, res) => res.writeHead(200, {'content-type':'text/html'}).end(`<title>Payroll</title><body>INTERNAL-SECRET ${POSTING}</body>`));
await new Promise(r => priv.listen(0, '127.0.0.1', r));
const pub = createServer((req, res) => {
  if (req.url.startsWith('/jobs/4815162342')) return res.writeHead(302, { location: `http://private.example.test:${priv.address().port}/jobs/4815162342` }).end();
  res.writeHead(200, {'content-type':'text/html'}).end(`<title>Job</title><body>${POSTING}</body>`);
});
await new Promise(r => pub.listen(0, '127.0.0.1', r));
const restore = lb.setHostResolver(async (h) => (h === 'private.example.test' ? ['10.0.0.5'] : ['93.184.216.34']));
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.example.test 127.0.0.1'] });

// 1. checkUrlLiveness follows a 302 into a private host and reads it.
const page = await lb.newLivenessPage(browser);
const v = await lb.checkUrlLiveness(page, `http://jobs.example.test:${pub.address().port}/jobs/4815162342`);
console.log('LIVENESS verdict after 302 to private.example.test (resolves 10.0.0.5):', JSON.stringify(v), 'landed on', page.url());
const blocked = await lb.rejectLandedUrl(page.url());
console.log('rejectLandedUrl on that landed URL would say:', JSON.stringify(blocked));
await browser.close();

// 2. Through an HTTP proxy, serverAddr is the proxy, not the origin.
const proxy = createServer((req, res) => {
  const u = new URL(req.url);
  const up = httpRequest({ host: '127.0.0.1', port: pub.address().port, path: u.pathname, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(up);
});
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
const b2 = await chromium.launch({ headless: true, args: [`--proxy-server=http://127.0.0.1:${proxy.address().port}`] });
const ctx = await b2.newContext(lb.LIVENESS_CONTEXT_OPTIONS);
await lb.installEgressGuard(ctx);
const p2 = await ctx.newPage();
const check = lb.recordLandedUrls(p2);
const resp = await p2.goto(`http://jobs.example.test:${pub.address().port}/posting`);
console.log('origin port', pub.address().port, 'proxy port', proxy.address().port, 'serverAddr', JSON.stringify(await resp.serverAddr()));
console.log('recorder verdict through a loopback proxy:', JSON.stringify(await check()));
await b2.close();
restore(); priv.close(); pub.close(); proxy.close();
