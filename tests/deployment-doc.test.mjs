// tests/deployment-doc.test.mjs — the cluster path's names stay in docs/DEPLOYMENT.md, and its
// pointers stay in deploy/README.md, FORK.md and DOCKER.md.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';

const read = (rel) => {
  const file = join(ROOT, rel);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  fail(`${rel} is missing`);
  return null;
};
const deployment = read('docs/DEPLOYMENT.md');
const runtime = read('deploy/README.md');
const fork = read('FORK.md');
const docker = read('DOCKER.md');

const names = [
  ['docs/DEPLOYMENT.md', deployment, ['CAREER_OPS_SCHEDULER', 'CAREER_OPS_SCHEDULER_DESCRIPTION', 'CAREER_OPS_SCHEDULED_JOBS_PATH', 'PUBLISH_URL', 'PUBLISH_API_KEY', 'CAREER_OPS_CLI', 'readOnlyRootFilesystem', 'scheduled-jobs.json', 'title_filter_full', 'uninstall-scan-schedule.sh', 'launchctl bootout', 'COPYFILE_DISABLE', '--no-overwrite-dir', 'WebFetch', 'networkReadOnly', 'no `gh`', 'no TeX', '/api/healthz', '/api/scheduler', '--channel main']],
  ['deploy/README.md', runtime, ['CAREER_OPS_SCHEDULER', 'PUBLISH_URL', 'PUBLISH_API_KEY', 'no `gh`', '/api/healthz', 'docs/DEPLOYMENT.md']],
  ['FORK.md', fork, ['deploy/README.md', 'CAREER_OPS_ROOT=/data']],
  ['DOCKER.md', docker, ['career-ops-server', 'career-ops-publish', 'deploy/README.md', 'docker-image.yml']],
];
for (const [file, text, markers] of names) {
  if (text === null) continue;
  for (const marker of markers) {
    if (text.includes(marker)) pass(`${file} names ${marker}`);
    else fail(`${file} no longer names ${marker}`);
  }
}

// DOCKER.md says every push to main rebuilds the images. That holds only while the
// workflow's push trigger carries no `paths:` filter, so the two are checked together.
const workflow = read('.github/workflows/docker-image.yml');
if (workflow !== null && docker !== null) {
  const pushBlock = workflow.slice(workflow.indexOf('\n  push:'), workflow.indexOf('\n  pull_request:'));
  if (pushBlock && !/^\s+paths:/m.test(pushBlock)) pass('docker-image.yml push trigger has no path filter, as DOCKER.md states');
  else fail('docker-image.yml push trigger changed; update DOCKER.md and docs/DEPLOYMENT.md on when the images rebuild');
}
