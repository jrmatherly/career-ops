/**
 * resume.mjs: keep data/resume.json (the Reactive Resume shaped model) in step
 * with cv.md, which stays canonical.
 *
 *   node resume.mjs absorb [--json]
 *   node resume.mjs adopt [--confirm]
 *   node resume.mjs pair <orphanId> <newId> [<orphanId> <newId> ...]
 *   node resume.mjs export cv-md|payload [--in file] [--out file] [--json] [--hide s,...] [--hide-item id,...]
 *   node resume.mjs save --in file --expected-cv-sha <sha> [--json]
 *   node resume.mjs import <file> [--format rr|json-resume|linkedin|docx] [--confirm] [--replace-cv]
 *
 * Exit codes: 0 ok, 1 any other error, 2 import refused (nothing written),
 * 3 the lossless gate failed (nothing written), 4 save with a stale
 * --expected-cv-sha (nothing written).
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { flagValue, hasFlag, validateFlags } from './lib/cli-flags.mjs';
import { replaceUserFile, writeFileAtomic } from './tracker-utils.mjs';
import { markInSync, readResume, readResumeFile, serialize, sha256, writeResume } from './lib/resume/model.mjs';
import { absorb, pairOrphan } from './lib/resume/absorb.mjs';
import { resumeToCvMarkdown } from './lib/resume/to-cv-md.mjs';
import { resumeToPayload } from './lib/resume/to-payload.mjs';
import { detectFormat, FORMATS, ImportError, importResume } from './lib/resume/import/detect.mjs';

const USAGE = `Usage:
  node resume.mjs absorb [--json]
  node resume.mjs adopt [--confirm]
  node resume.mjs pair <orphanId> <newId> [<orphanId> <newId> ...]
  node resume.mjs export cv-md|payload [--in file] [--out file] [--json] [--hide s,...] [--hide-item id,...]
  node resume.mjs save --in file --expected-cv-sha <sha> [--json]
  node resume.mjs import <file> [--format rr|json-resume|linkedin|docx] [--confirm] [--replace-cv]`;
const VALUE_FLAGS = ['--in', '--out', '--hide', '--hide-item', '--expected-cv-sha', '--format'];
const FLAGS = [...VALUE_FLAGS, '--json', '--confirm', '--replace-cv', '--help', '-h'];

class UsageError extends Error {}

const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);

function readCv(root) {
  const path = join(root, 'cv.md');
  if (!existsSync(path)) throw new UsageError(`${path} not found`);
  return readFileSync(path, 'utf8');
}

function readDraft(path) {
  if (!path) throw new UsageError('--in <file> is required');
  try {
    return readResumeFile(path);
  } catch (err) {
    throw new UsageError(err.message);
  }
}

const describe = (ref) => (ref.company !== undefined ? `${ref.company} / ${ref.position} / ${ref.period}` : `${ref.section}: ${ref.name}`);

function printFindings(report) {
  for (const o of report.orphans) console.log(`  orphan ${o.id}: ${describe(o)} (in resume.json, not in cv.md)`);
  for (const n of report.newEntries) console.log(`  new entry ${n.id}: ${describe(n)}`);
  for (const u of report.unparsed) console.log(`  unparsed line ${u.line}: ${u.text}`);
  if (report.orphans.length && report.newEntries.length) console.log('  A renamed or redated entry: node resume.mjs pair <orphanId> <newId>');
}

function printReport({ report, lossless }, json, extra = {}) {
  if (json) {
    console.log(JSON.stringify({ ...report, lossless, ...extra }, null, 2));
    return;
  }
  console.log(`cv.md ${lossless ? 'absorbs losslessly' : 'does not absorb losslessly'}${extra.written ? '; data/resume.json written' : extra.written === false && !lossless ? '; nothing written' : ''}`);
  console.log(`  kept ${report.kept}, changed ${report.changed}, added ${report.added}, removed ${report.removed}`);
  printFindings(report);
  if (!lossless) console.log('  To see how cv.md differs from the file regenerated from it: node resume.mjs adopt');
}

/** A unified-style line diff with two lines of context, from a longest common subsequence. */
function lineDiff(before, after) {
  const a = before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(` ${a[i++]}`);
      j++;
    } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) lines.push(`-${a[i++]}`);
    else lines.push(`+${b[j++]}`);
  }
  const near = (k) => lines.slice(Math.max(0, k - 2), k + 3).some((l) => l[0] !== ' ');
  const out = ['--- cv.md', '+++ generated from data/resume.json'];
  lines.forEach((line, k) => {
    if (near(k)) out.push(line);
    else if (out.at(-1) !== '@@') out.push('@@');
  });
  return out.join('\n');
}

async function absorbCommand(root, json) {
  const cv = readCv(root);
  const prior = readResume(root);
  const cvSha = sha256(cv);
  // A save that crashed between its two writes left pending equal to the cv.md it wrote.
  if (prior && prior.careerOps.pendingCvSha256 === cvSha) {
    markInSync(prior, cvSha);
    await writeResume(root, prior);
    console.log(json ? JSON.stringify({ recovered: true, lossless: true, written: true }, null, 2) : 'cv.md matches an interrupted save; data/resume.json completed');
    return 0;
  }
  const result = absorb(cv, prior);
  if (!result.lossless) {
    printReport(result, json, { written: false });
    return 3;
  }
  // A pending sha left by a save that stopped before writing cv.md no longer describes this data.
  markInSync(result.data, cvSha);
  const written = !prior || serialize(prior) !== serialize(result.data);
  if (written) await writeResume(root, result.data);
  printReport(result, json, { written });
  return 0;
}

async function adoptCommand(root, confirm) {
  const cvPath = join(root, 'cv.md');
  const cv = readCv(root);
  const result = absorb(cv, readResume(root));
  const generated = resumeToCvMarkdown(result.data);
  printFindings(result.report);
  if (result.report.orphans.length) console.log('  --confirm writes the orphaned entries back into cv.md');
  console.log(generated === cv ? 'cv.md is already in the generated shape' : lineDiff(cv, generated));
  if (!confirm) {
    console.log('\nNothing written. Run node resume.mjs adopt --confirm to replace cv.md (a copy is kept as cv.md.bak, or a timestamped .bak when that exists).');
    return 0;
  }
  const bak = existsSync(`${cvPath}.bak`) ? `${cvPath}.${Date.now()}.bak` : `${cvPath}.bak`;
  writeFileAtomic(bak, cv);
  replaceUserFile(cvPath, generated);
  markInSync(result.data, sha256(generated));
  await writeResume(root, result.data);
  console.log(`\ncv.md replaced (previous copy in ${bak}); data/resume.json written`);
  return 0;
}

async function pairCommand(root, ids) {
  if (ids.length < 2 || ids.length % 2) throw new UsageError('pair takes <orphanId> <newId> pairs');
  const cv = readCv(root);
  const prior = readResume(root);
  if (!prior) throw new UsageError('data/resume.json does not exist yet; run node resume.mjs absorb first');
  const { data } = absorb(cv, prior);
  try {
    for (let k = 0; k < ids.length; k += 2) pairOrphan(data, ids[k], ids[k + 1]);
  } catch (err) {
    throw new UsageError(err.message);
  }
  const result = absorb(cv, data);
  if (!result.lossless) {
    printReport(result, false, { written: false });
    return 3;
  }
  markInSync(result.data, sha256(cv));
  await writeResume(root, result.data);
  printReport(result, false, { written: true });
  return 0;
}

function exportCommand(root, kind, args) {
  if (kind !== 'cv-md' && kind !== 'payload') throw new UsageError('export takes cv-md or payload');
  const inPath = flagValue(args, '--in');
  let data;
  if (inPath) data = readDraft(inPath);
  else {
    const result = absorb(readCv(root), readResume(root));
    if (!result.lossless) {
      printReport(result, false, { written: false });
      return 3;
    }
    data = result.data;
  }
  const out = flagValue(args, '--out');
  let text;
  if (kind === 'cv-md') text = resumeToCvMarkdown(data);
  else {
    const { payload, unmapped } = resumeToPayload(data, { hide: list(flagValue(args, '--hide')), hideItems: list(flagValue(args, '--hide-item')) });
    text = JSON.stringify(hasFlag(args, '--json') && !out ? { payload, unmapped } : payload, null, 2) + '\n';
  }
  if (out) writeFileAtomic(out, text);
  else process.stdout.write(text);
  return 0;
}

async function saveCommand(root, args) {
  const json = hasFlag(args, '--json');
  const expected = flagValue(args, '--expected-cv-sha');
  if (!expected) throw new UsageError('--expected-cv-sha <sha> is required');
  const data = readDraft(flagValue(args, '--in'));
  const generated = resumeToCvMarkdown(data);
  if (!absorb(generated, data).lossless) {
    console.log(json ? JSON.stringify({ lossless: false, written: false }) : 'The draft renders a cv.md that does not absorb back; nothing written');
    return 3;
  }
  const cvPath = join(root, 'cv.md');
  const current = existsSync(cvPath) ? sha256(readFileSync(cvPath, 'utf8')) : '';
  if (current !== expected) {
    console.log(json ? JSON.stringify({ stale: true, written: false, cvSha256: current }) : `cv.md changed since the draft was opened (sha ${current}); nothing written`);
    return 4;
  }
  data.careerOps.pendingCvSha256 = sha256(generated);
  await writeResume(root, data);
  replaceUserFile(cvPath, generated);
  markInSync(data, sha256(generated));
  await writeResume(root, data);
  console.log(json ? JSON.stringify({ written: true, cvSha256: data.careerOps.cvSha256 }) : 'cv.md and data/resume.json written');
  return 0;
}

async function importCommand(root, file, args) {
  if (!file) throw new UsageError('import takes <file>');
  const forced = flagValue(args, '--format');
  if (forced !== undefined && !FORMATS.includes(forced)) throw new UsageError(`--format takes one of ${FORMATS.join(', ')}`);
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch (err) {
    throw new ImportError(`${file}: ${err.code === 'ENOENT' ? 'no such file' : err.message}`);
  }
  const format = forced ?? detectFormat(buffer, basename(file));
  if (format === 'unknown') throw new ImportError(`${file}: not a Reactive Resume JSON, JSON Resume, LinkedIn export zip or .docx`);
  let imported;
  try {
    imported = importResume(buffer, format);
  } catch (err) {
    if (err instanceof ImportError) err.message = `${file}: ${err.message}`;
    throw err;
  }
  const { data, generated, gate, review } = imported;
  console.log('Found:');
  for (const line of review.sections) console.log(`  ${line}`);
  if (review.leftover.length) {
    console.log('Not carried by cv.md:');
    for (const line of review.leftover) console.log(`  ${line}`);
  }
  const cvPath = join(root, 'cv.md');
  const cv = existsSync(cvPath) ? readFileSync(cvPath, 'utf8') : null;
  if (cv !== null) {
    console.log('cv.md exists; import would replace it:');
    console.log(lineDiff(cv, generated));
  }
  if (!hasFlag(args, '--confirm')) {
    console.log(`Nothing written. Add --confirm${cv !== null ? ' --replace-cv' : ''}`);
    return 0;
  }
  if (cv !== null && !hasFlag(args, '--replace-cv')) throw new ImportError('cv.md exists; add --replace-cv to replace it (a copy is kept as cv.md.bak); import never merges two CVs');
  if (!gate.lossless) {
    printReport(gate, false, { written: false });
    return 3;
  }
  let bak = null;
  if (cv !== null) {
    bak = existsSync(`${cvPath}.bak`) ? `${cvPath}.${Date.now()}.bak` : `${cvPath}.bak`;
    writeFileAtomic(bak, cv);
  }
  replaceUserFile(cvPath, generated);
  markInSync(data, sha256(generated));
  await writeResume(root, data);
  console.log(`cv.md and data/resume.json written${bak ? ` (previous cv.md in ${bak})` : ''}`);
  return 0;
}

export async function main(args) {
  validateFlags(args, FLAGS, USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const positional = args.filter((a, i) => !a.startsWith('-') && !VALUE_FLAGS.includes(args[i - 1]));
  const [command, ...rest] = positional;
  try {
    const root = getCareerOpsRoot();
    switch (command) {
      case 'absorb': return await absorbCommand(root, hasFlag(args, '--json'));
      case 'adopt': return await adoptCommand(root, hasFlag(args, '--confirm'));
      case 'pair': return await pairCommand(root, rest);
      case 'export': return exportCommand(root, rest[0], args);
      case 'save': return await saveCommand(root, args);
      case 'import': return await importCommand(root, rest[0], args);
      default: throw new UsageError(command ? `unknown command: ${command}` : 'no command given');
    }
  } catch (err) {
    console.error(`resume: ${err.message}`);
    if (err instanceof UsageError) console.error(USAGE);
    return err instanceof ImportError ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
