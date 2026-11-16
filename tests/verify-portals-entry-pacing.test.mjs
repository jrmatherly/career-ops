// tests/verify-portals-entry-pacing.test.mjs — the portal health check and the
// audit pace every request they send to an entry's own board, not only the
// first, and never wait longer than a check under a time limit can afford.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCompanies } from '../verify-portals.mjs';
import { auditCompanies } from '../audit-portals.mjs';
import { PROBE_MAX_REQUEST_DELAY_MS } from '../lib/entry-pacing.mjs';

test('the provider-layer check and the audit wait between requests, no longer than the probe ceiling', async () => {
  const provider = {
    id: 'bigboard',
    detect: () => null,
    fetch: async (_entry, ctx) => {
      await ctx.fetchJson('https://careers.example.com/api?page=1');
      await ctx.fetchJson('https://careers.example.com/api?page=2');
      return [{ title: 'Engineer' }];
    },
  };
  const entry = (ms) => ({ name: 'BigCo', provider: 'bigboard', careers_url: 'https://careers.example.com', request_delay_ms: ms });
  for (const run of [verifyCompanies, auditCompanies]) {
    for (const [ms, expected] of [[60_000, PROBE_MAX_REQUEST_DELAY_MS], [2_000, 2_000]]) {
      const waits = [];
      const httpCtx = { fetchJson: async () => ({}), fetchText: async () => '', sleep: async (wait) => { waits.push(wait); } };
      await run([entry(ms)], { providers: new Map([['bigboard', provider]]), httpCtx, concurrency: 1 });
      assert.equal(waits.length, 1, `${run.name} ${ms}: ${waits}`);
      assert.ok(waits[0] > expected - 1000 && waits[0] <= expected, `${run.name} ${ms}: ${waits}`);
    }
  }
});

const DELAY = 200;
// A timer may fire a few ms early; 20 ms of slack still tells a real wait from none.
const FLOOR = DELAY - 20;

/** Run the check for one entry against a stubbed fetch; returns each request's URL and start time. */
async function requestsFor(company, respond) {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push({ url: String(url), at: performance.now() });
    return respond(String(url));
  };
  try {
    await verifyCompanies([company]);
  } finally {
    globalThis.fetch = realFetch;
  }
  return seen;
}

const json = (body) => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

// The first request a process sends pays one-off setup between the gate and the socket,
// which would shorten the gap these tests measure at the socket.
await requestsFor({ name: 'Warm', careers_url: 'https://boards.greenhouse.io/warm' }, () => json('{"jobs":[{"id":1}]}'));

test('a redirect hop waits its turn like any other request', async () => {
  const moved = 'https://boards-api.greenhouse.io/v1/boards/acme-new/jobs';
  const seen = await requestsFor(
    { name: 'Acme', careers_url: 'https://boards.greenhouse.io/acme', request_delay_ms: DELAY },
    (url) => (url === moved ? json('{"jobs":[{"id":1}]}') : new Response('', { status: 301, headers: { location: moved } })),
  );
  assert.equal(seen.length, 2, JSON.stringify(seen));
  assert.equal(seen[1].url, moved);
  assert.ok(seen[1].at - seen[0].at >= FLOOR, JSON.stringify(seen));
});

test('the oversized-board fallback waits its turn too', async () => {
  const seen = await requestsFor(
    // One byte: the posting API answer is over the cap, so the check reads the embed page instead.
    { name: 'Acme', careers_url: 'https://jobs.ashbyhq.com/acme', request_delay_ms: DELAY, max_response_mb: 0.000001 },
    (url) => (url.includes('posting-api') ? json('{"jobs":[{"id":1}]}') : new Response('<html></html>', { status: 200 })),
  );
  // Requests after these two go to other boards, looking for where the company moved.
  const [api, embed] = seen;
  assert.ok(api.url.includes('posting-api') && embed.url.includes('embed'), JSON.stringify([api, embed]));
  assert.ok(embed.at - api.at >= FLOOR, JSON.stringify([api, embed]));
});
