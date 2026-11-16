// tests/egress-private-ranges.test.mjs. Every egress check judges addresses the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const { isBlockedAddress } = await import(pathToFileURL(join(ROOT, 'providers/_ip-guard.mjs')).href);
const { rejectPrivateOrInvalid, validateUrlSecurity, setHostResolver } = await import(pathToFileURL(join(ROOT, 'liveness-browser.mjs')).href);

test('IPv6 translation forms of private IPv4 are blocked', () => {
  for (const a of ['64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '::ffff:0:7f00:1']) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  assert.equal(isBlockedAddress('64:ff9b::808:808'), false, 'NAT64 of a public address stays reachable');
});

test('the literal-host check blocks what the connect-time guard blocks', () => {
  for (const u of ['http://100.64.0.1/', 'http://100.100.100.100/', 'http://198.18.0.1/', 'http://224.0.0.1/', 'http://255.255.255.255/', 'http://[64:ff9b::7f00:1]/']) {
    assert.equal(rejectPrivateOrInvalid(u)?.code, 'blocked_host', u);
  }
  assert.equal(rejectPrivateOrInvalid('https://boards.greenhouse.io/x/jobs/1'), null);
});

test('the DNS check blocks a name that resolves into CGNAT space', async (t) => {
  t.after(setHostResolver(async () => ['100.100.100.100']));
  await assert.rejects(validateUrlSecurity('https://tailnet.example.test/'), /Egress guard blocked private target IP 100\.100\.100\.100/);
});

test('a name whose only answer is 0.0.0.0 is still a DNS sinkhole', async (t) => {
  t.after(setHostResolver(async () => ['0.0.0.0']));
  await assert.rejects(validateUrlSecurity('https://tracker.example.test/'), (err) => err.livenessCode === 'dns_sinkhole');
});
