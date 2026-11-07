import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, createServer } from '../server.mjs';
import { listTree } from '../../lib/walk-tree.mjs';

const OWNER = 'owner-test-token';
const AUTH = { Authorization: `Bearer ${OWNER}` };
const SHARE = fileURLToPath(new URL('../share.mjs', import.meta.url));
const CV_EXAMPLE = fileURLToPath(new URL('../../examples/cv-example.md', import.meta.url));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'share-cli-test-')));
after(() => rmSync(dir, { recursive: true, force: true }));

let count = 0;
async function boot(t) {
  const config = readConfig({ PUBLISH_OWNER_TOKEN: OWNER, PUBLISH_SECRET: 'test-secret', PUBLISH_DB: join(dir, `db-${++count}.sqlite`) });
  const server = createServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const root = join(dir, `root-${count}`);
  mkdirSync(root);
  copyFileSync(CV_EXAMPLE, join(root, 'cv.md'));
  const baseEnv = { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' };
  delete baseEnv.PUBLISH_URL;
  delete baseEnv.PUBLISH_OWNER_TOKEN;
  // Async spawn: a spawnSync would block this process's event loop, and the server under test runs on it.
  const cli = (args, env = { PUBLISH_URL: base, PUBLISH_OWNER_TOKEN: OWNER }) => new Promise((done) => {
    const child = spawn(process.execPath, [SHARE, ...args], { env: { ...baseEnv, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => done({ status, stdout, stderr }));
  });
  const ok = (r, step) => assert.equal(r.status, 0, `${step}: exit ${r.status}\n${r.stderr}`);
  const page = async (slug, headers = AUTH) => {
    const r = await fetch(`${base}/s/${slug}`, { headers });
    return { status: r.status, text: await r.text() };
  };
  const api = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { ...AUTH, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return r.json();
  };
  const snapshot = () => Object.fromEntries(listTree(root).map((f) => [relative(root, f), readFileSync(f, 'utf8')]));
  const shares = () => JSON.parse(readFileSync(join(root, 'data', 'shares.json'), 'utf8'));
  return { base, root, cli, ok, page, api, snapshot, shares };
}

const fixture = (marker) => `<!doctype html><html><head><title>CV</title></head><body><h1>Ada Example</h1>
<div class="contact-row"><a href="mailto:ada@example.com">ada@example.com</a></div>
<img src="pic.png" alt="me"><p>${marker}</p></body></html>`;

function htmlDir() {
  const d = mkdtempSync(join(dir, 'html-'));
  writeFileSync(join(d, 'cv.html'), fixture('marker-html-1'));
  writeFileSync(join(d, 'pic.png'), PNG);
  return join(d, 'cv.html');
}

test('publish --html inlines images, hides contacts, and pull writes only shares.json and the feedback file', async (t) => {
  const { cli, ok, page, api, snapshot, shares, root } = await boot(t);
  const before = snapshot();
  const pub = await cli(['publish', '--slug', 'a', '--html', htmlDir(), '--hide-contacts', '--password', 'pw']);
  ok(pub, 'publish');
  assert.match(pub.stdout, /^http:\/\/127\.0\.0\.1:\d+\/s\/a$/m, 'publish prints the share URL');
  const live = await page('a');
  assert.match(live.text, /marker-html-1/, 'the page carries the fixture');
  assert.doesNotMatch(live.text, /mailto:/, 'hide-contacts stripped the mailto link');
  assert.match(live.text, /src="data:image\/png;base64,/, 'the local image was inlined');

  const { token } = await api('POST', '/api/shares/a/feedback-links');
  await fetch(`${new URL(pub.stdout.trim()).origin}/f/${token}`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ authorName: 'Bea', body: 'Tighten the summary.' }) });
  const [comment] = await api('GET', '/api/shares/a/feedback');

  const pull = await cli(['pull']);
  ok(pull, 'pull');
  assert.match(pull.stdout, /^a views \d+ comments 1$/m, 'pull prints one line per share');
  const after = snapshot();
  assert.deepEqual(Object.keys(after).filter((p) => !(p in before)).sort(), ['data/share-feedback/a.md', 'data/shares.json'], 'only the record and the feedback file are added');
  assert.equal(after['cv.md'], before['cv.md'], 'cv.md untouched');
  assert.equal(after['data/share-feedback/a.md'], `# Feedback: a\n\n## Bea — ${comment.created}\n\nTighten the summary.\n\n`, 'feedback file format');
  const record = shares().a;
  assert.equal(record.hasPassword, true);
  assert.equal(record.source.kind, 'html');
  assert.equal(typeof record.pulled.views, 'number');
  assert.equal(record.pulled.comments, 1);
  assert.doesNotMatch(readFileSync(join(root, 'data', 'shares.json'), 'utf8'), /"pw"/, 'the password is never stored');
});

test('from-resume: hide overlay, lossless gate, republish reapplies the overlay, delete', async (t) => {
  const { cli, ok, page, api, root, shares } = await boot(t);
  const cvPath = join(root, 'cv.md');
  const cv = readFileSync(cvPath, 'utf8');
  ok(await cli(['publish', '--slug', 'r', '--from-resume', '--hide', 'education']), 'publish --from-resume');
  assert.match(cv, /^## Education$/m, 'cv.md has an Education section');
  assert.doesNotMatch((await page('r')).text, />Education</, 'the page has no Education heading');
  assert.deepEqual(shares().r.hide.sections, ['education']);
  assert.equal(shares().r.source.kind, 'resume');
  assert.ok(existsSync(join(root, 'data', 'resume.json')), 'publish absorbed cv.md into the sidecar, pinning item ids');

  const badTemplate = await cli(['publish', '--slug', 'r2', '--from-resume', '--template', 'no-such-template']);
  assert.equal(badTemplate.status, 1, 'an unknown template is refused');
  assert.match(badTemplate.stderr, /no-such-template/, '--template reaches the resolver');

  const sha1 = (await api('GET', '/api/shares/r/stats')).sha;
  const bytes = readFileSync(join(root, 'data', 'shares.json'));
  writeFileSync(cvPath, cv.replace('### TechFin Corp -- Austin, TX', '### TechFin Holdings -- Austin, TX'));
  const gated = await cli(['republish', '--slug', 'r']);
  assert.equal(gated.status, 3, `gate exit\n${gated.stderr}`);
  assert.match(gated.stderr, /does not absorb losslessly/);
  assert.deepEqual(readFileSync(join(root, 'data', 'shares.json')), bytes, 'shares.json unchanged by a refused republish');
  assert.equal((await api('GET', '/api/shares/r/stats')).sha, sha1, 'server page unchanged by a refused republish');

  writeFileSync(cvPath, cv.replace('Full-stack AI engineer with 6 years', 'Full-stack AI engineer with seven years'));
  ok(await cli(['republish', '--slug', 'r']), 'republish after a lossless edit');
  const text = (await page('r')).text;
  assert.match(text, /Full-stack AI engineer with seven years/, 'the page carries the new sentence');
  assert.doesNotMatch(text, />Education</, 'republish reapplied the hide overlay');
  assert.notEqual((await api('GET', '/api/shares/r/stats')).sha, sha1, 'sha changed');

  const del = await cli(['delete', '--slug', 'r']);
  ok(del, 'delete');
  assert.match(del.stdout, /^deleted r$/m);
  assert.equal('r' in shares(), false, 'record removed');
  assert.equal((await page('r', {})).status, 401, 'the page is gone');
});

test('service config comes from the data root .env, and a rejected token is named by status only', async (t) => {
  const { base, root, cli, ok } = await boot(t);
  writeFileSync(join(root, '.env'), `PUBLISH_URL=${base}\nPUBLISH_OWNER_TOKEN='${OWNER}'\n`);
  ok(await cli(['publish', '--slug', 'e', '--html', htmlDir()], {}), 'publish with config from .env');
  ok(await cli(['stats'], {}), 'stats with config from .env');
  const wrong = await cli(['stats'], { PUBLISH_OWNER_TOKEN: 'wrong-token-value' });
  assert.equal(wrong.status, 1, wrong.stderr);
  assert.match(wrong.stderr, /401/, 'stderr names the status');
  assert.doesNotMatch(wrong.stderr, /wrong-token-value/, 'stderr never echoes the token');
  rmSync(join(root, '.env'));
  const missing = await cli(['stats'], {});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /PUBLISH_URL/, 'a missing variable is named');
});

test('from-studio prefers the CV Studio edited output over a newer plain render', async (t) => {
  const { root, cli, ok, page, shares } = await boot(t);
  mkdirSync(join(root, 'output'));
  writeFileSync(join(root, 'output', 'cv-alex-007-acme-edited.html'), fixture('marker-edited'));
  writeFileSync(join(root, 'output', 'cv-alex-007-acme.html'), fixture('marker-plain'));
  utimesSync(join(root, 'output', 'cv-alex-007-acme-edited.html'), new Date(1e12), new Date(1e12));
  ok(await cli(['publish', '--slug', 's', '--from-studio', '7']), 'publish --from-studio');
  assert.match((await page('s')).text, /marker-edited/, 'the edited file was published');
  assert.deepEqual(shares().s.source, { kind: 'studio', ref: '7' });
});
