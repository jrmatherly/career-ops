// data/resume.json: the resume model derived from cv.md (cv.md stays canonical).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from '../../tracker-utils.mjs';
import { acquireDirLock, releaseOrWarn } from '../dir-lock.mjs';
import { parseResume } from './schema.mjs';

export const resumePath = (root) => join(root, 'data', 'resume.json');

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The exact bytes writeResume writes for a resume. */
export const serialize = (data) => JSON.stringify(data, null, 2) + '\n';

/** Record that the resume now matches the cv.md with this sha. */
export function markInSync(data, cvSha) {
  delete data.careerOps.pendingCvSha256;
  data.careerOps.cvSha256 = cvSha;
}

/**
 * @param {string} path a resume JSON file
 * @returns {object} parsed ResumeData
 */
export function readResumeFile(path) {
  const text = readFileSync(path, 'utf8');
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path}: not valid JSON (${err.message})`);
  }
  const result = parseResume(json);
  if (!result.ok) {
    const issues = result.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${path}: not a valid resume (${issues})`);
  }
  return result.data;
}

/**
 * @param {string} root data root
 * @returns {object|null} parsed ResumeData, or null when the file is absent
 */
export function readResume(root) {
  const path = resumePath(root);
  return existsSync(path) ? readResumeFile(path) : null;
}

/**
 * @param {string} root data root
 * @param {object} data ResumeData
 */
export function writeResume(root, data) {
  return withResumeLock(root, (path) => writeFileAtomic(path, serialize(data)));
}

/**
 * Runs `fn` with data/resume.json's path while holding its lock. `fn` must be
 * synchronous: the lock is released when it returns, so work left in a
 * returned promise would run unlocked.
 *
 * @template T
 * @param {string} root data root
 * @param {(path: string) => T} fn
 * @param {{ timeoutMs?: number }} [options] how long to wait for another holder before throwing DirLockTimeoutError
 * @returns {Promise<T>}
 */
export async function withResumeLock(root, fn, { timeoutMs = 60_000 } = {}) {
  const path = resumePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const lock = await acquireDirLock(`${path}.lock`, {
    timeoutMs, retryMs: 50, staleMs: 600_000, owner: { tool: 'resume' },
  });
  try {
    return fn(path);
  } finally {
    releaseOrWarn(lock);
  }
}
