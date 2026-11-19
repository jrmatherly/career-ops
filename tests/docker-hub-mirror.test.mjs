// The image workflow copies the deployed images to Docker Hub as a second
// registry. GHCR stays the primary, so nothing in the copy may fail the job,
// run on a pull request, or run before the GHCR push it copies from.

import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\n🔎 Docker Hub mirror (.github/workflows/docker-image.yml)');

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const workflow = load(readFileSync(join(ROOT, '.github/workflows/docker-image.yml'), 'utf-8'));
const matrix = workflow.jobs.publish.strategy.matrix.include;
const steps = workflow.jobs.publish.steps;
const at = (pattern) => steps.findIndex((step) => pattern.test(step.name ?? ''));
const build = at(/build and push/i);
const login = at(/log in to docker hub/i);
const mirror = at(/mirror to docker hub/i);
const report = at(/failed mirror/i);

check(JSON.stringify(matrix.filter((m) => m.mirror).map((m) => m.name).sort()) === JSON.stringify(['career-ops-publish', 'career-ops-server']),
  'only the two deployed images are mirrored');
check(build !== -1 && build < login && login < mirror && mirror < report,
  'the Docker Hub login, copy and report follow the GHCR push, in that order');

const loginIf = String(steps[login]?.if ?? '');
check(loginIf.includes("github.event_name != 'pull_request'") && loginIf.includes('matrix.mirror') && loginIf.includes("vars.DOCKERHUB_NAMESPACE != ''"),
  'the Docker Hub login is skipped on pull requests, for unmirrored images and until DOCKERHUB_NAMESPACE is set');
check(steps[mirror]?.if === "steps.hub-login.outcome == 'success'", 'the copy runs only after a successful Docker Hub login');
check(steps[login]?.['continue-on-error'] === true && steps[mirror]?.['continue-on-error'] === true,
  'a failed Docker Hub login or copy does not fail the job');
check(!('continue-on-error' in steps[build]), 'a failed GHCR push still fails the job');

const env = steps[mirror]?.env ?? {};
check(String(env.SOURCE).startsWith('ghcr.io/') && String(env.SOURCE).endsWith('@${{ steps.build.outputs.digest }}') && steps[build]?.id === 'build',
  'the copy reads the image from GHCR by the digest the build step pushed');
check(String(env.TARGET).startsWith('docker.io/${{ vars.DOCKERHUB_NAMESPACE }}/'), 'the copy writes under the configured Docker Hub namespace');
check(/imagetools create/.test(steps[mirror]?.run ?? '') && !/\$\{\{/.test(steps[mirror]?.run ?? ''),
  'the copy script takes its inputs from env, not from interpolated expressions');
check(/hub-login\.outcome == 'failure'/.test(steps[report]?.if ?? '') && /hub-mirror\.outcome == 'failure'/.test(steps[report]?.if ?? '') && /::warning/.test(steps[report]?.run ?? ''),
  'a failed login or copy is reported as a warning');
