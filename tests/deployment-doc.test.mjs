// tests/deployment-doc.test.mjs — the cluster path is documented once, by name.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '');
const deployment = read('docs/DEPLOYMENT.md');
const runtime = read('deploy/README.md');
const fork = read('FORK.md');
const docker = read('DOCKER.md');

const names = [
  ['docs/DEPLOYMENT.md', deployment, ['CAREER_OPS_SCHEDULER', 'CAREER_OPS_SCHEDULER_DESCRIPTION', 'CAREER_OPS_SCHEDULED_JOBS_PATH', 'PUBLISH_URL', 'PUBLISH_API_KEY', 'CAREER_OPS_CLI', 'readOnlyRootFilesystem', 'scheduled-jobs.json', 'title_filter_full', 'uninstall-scan-schedule.sh', 'launchctl bootout', 'COPYFILE_DISABLE', '--no-overwrite-dir', 'WebFetch', 'networkReadOnly', 'no `gh`', 'no TeX', '/api/healthz', '/api/scheduler', '--channel main']],
  ['deploy/README.md', runtime, ['CAREER_OPS_SCHEDULER', 'PUBLISH_URL', 'PUBLISH_API_KEY', 'no `gh`', '/api/healthz', 'docs/DEPLOYMENT.md']],
  ['FORK.md', fork, ['deploy/README.md', 'CAREER_OPS_ROOT=/data']],
  ['DOCKER.md', docker, ['career-ops-server', 'career-ops-publish', 'deploy/README.md']],
];
for (const [file, text, markers] of names) {
  for (const marker of markers) {
    if (text.includes(marker)) pass(`${file} names ${marker}`);
    else fail(`${file} no longer names ${marker}`);
  }
}
if (/on a push to `main` that touches them/.test(docker)) fail('DOCKER.md still says the images build only when their inputs change (docker-image.yml has no path filter on push)');
else pass('DOCKER.md matches docker-image.yml on the push trigger');
