import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
process.env.CAREER_OPS_ROOT = mkdtempSync(join(tmpdir(), 'cops-'));
const R = process.cwd() + '/'; // run from the repo root
const { chromium } = await import(R + 'node_modules/playwright/index.mjs');
const lb = await import(R + 'liveness-browser.mjs');
const { processOffer } = await import(R + 'batch-evaluate-gemini.mjs');
const privHits = [];
const priv = createServer((req, res) => { privHits.push(req.url); res.writeHead(200, {'content-type':'text/html'}).end(`<title>Admin</title><body><h1>This job is no longer available</h1><p>The position has been filled.</p></body>`); });
await new Promise(r => priv.listen(0, '127.0.0.1', r));
const pub = createServer((req, res) => res.writeHead(302, { location: `http://private.example.test:${priv.address().port}${req.url}` }).end());
await new Promise(r => pub.listen(0, '127.0.0.1', r));
lb.setHostResolver(async (h) => (h === 'private.example.test' ? ['10.0.0.5'] : ['93.184.216.34']));
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.example.test 127.0.0.1'] });
const out = await processOffer(browser, `- [ ] http://jobs.example.test:${pub.address().port}/jobs/4815162342 | Acme | Eng`, 1, async () => { throw new Error('model must not be called'); });
console.log('RESULT', JSON.stringify(out), '| private host requests:', privHits.length);
await browser.close(); priv.close(); pub.close();
