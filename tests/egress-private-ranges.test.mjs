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

test('IPv6 ranges are judged on the parsed address, however it is spelled', () => {
  for (const a of [
    '0:0:0:0:0:0:0:1', '0::1', '::0001', '0::', '0:0:0:0:0:ffff:7f00:1', '0:0:0:0:0:0:7f00:1',
    'fc00::8.8.8.8', 'fe80::8.8.8.8', 'ff02::8.8.8.8', 'fd00:ec2::8.8.8.8', '2002::8.8.8.8', '2001::8.8.8.8',
    'FC00:0:0:0:0:0:0:1', 'fe80:0000::1', 'fe80::1%eth0',
  ]) {
    assert.equal(isBlockedAddress(a), true, a);
  }
});

test('the NAT64 local-use prefix 64:ff9b:1::/48 is blocked whole', () => {
  for (const a of ['64:ff9b:1::7f00:1', '64:ff9b:1::a9fe:a9fe', '64:ff9b:1::808:808', '64:ff9b:1:ffff:ffff:ffff:808:808']) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  assert.equal(rejectPrivateOrInvalid('http://[64:ff9b:1::7f00:1]/')?.code, 'blocked_host');
  assert.equal(isBlockedAddress('64:ff9b:2::808:808'), false, 'the next /48 is not the local-use prefix');
});

test('a string that is not an address is blocked', () => {
  for (const a of ['::g', ':::', '1:2:3:4:5:6:7:8:9', '12345::1', '[::1]', '127.0.0.1:80', '1::2::3']) {
    assert.equal(isBlockedAddress(a), true, a);
  }
});

test('public IPv6 addresses pass in every spelling', () => {
  for (const a of [
    '2606:4700:4700::1111', '2606:4700:4700:0000:0000:0000:0000:1111', '2606:4700:4700:0:0:0:0:1111', '2606:4700:4700::1111'.toUpperCase(),
    '2001:4860:4860::8888', '2001:4860:4860:0000:0000:0000:0000:8888', '2001:4860:4860:0:0:0:0:8888', '2001:4860:4860::8888'.toUpperCase(),
    '64:ff9b::808:808', '64:ff9b::8.8.8.8',
  ]) {
    assert.equal(isBlockedAddress(a), false, a);
  }
});

test('a hostname that only looks like a private address passes the literal check', () => {
  for (const u of ['http://10.example.com/', 'http://127.0.0.1.nip.io/']) {
    assert.equal(rejectPrivateOrInvalid(u), null, u);
  }
});
