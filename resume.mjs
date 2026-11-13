/**
 * resume.mjs: keep data/resume.json (the Reactive Resume shaped model) in step
 * with cv.md, which stays canonical.
 *
 *   node resume.mjs absorb [--json]
 *   node resume.mjs adopt [--confirm]
 *   node resume.mjs pair <orphanId> <newId> [<orphanId> <newId> ...]
 *   node resume.mjs export cv-md|payload|docx|rr-json|json-resume [--in file] [--out file] [--json] [--hide s,...] [--hide-item id,...]
 *   node resume.mjs save --in file --expected-cv-sha <sha> [--json]
 *   node resume.mjs import <file> [--format rr|json-resume|linkedin|docx] [--confirm] [--replace-cv]
 *   node resume.mjs check [--in file] [--json] [--ignore RULE_ID[,RULE_ID...]]
 *
 * Exit codes: 0 ok, 1 any other error, 2 import refused (nothing written),
 * 3 the lossless gate failed (nothing written), 4 save with a stale
 * --expected-cv-sha (nothing written). check is advisory: it exits 0 whatever
 * it finds, and 3 only while the absorb gate fails, like export.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { flagValue, hasFlag, validateFlags } from './lib/cli-flags.mjs';
import { replaceUserFile, writeFileAtomic } from './tracker-utils.mjs';
import { markInSync, readResume, readResumeFile, resumePath, serialize, sha256, withResumeLock, writeResume } from './lib/resume/model.mjs';
import { absorb, pairOrphan } from './lib/resume/absorb.mjs';
import { resumeToCvMarkdown } from './lib/resume/to-cv-md.mjs';
import { resumeToPayload } from './lib/resume/to-payload.mjs';
import { resumeToJsonResume } from './lib/resume/export/json-resume.mjs';
import { detectFormat, FORMATS, ImportError, importResume } from './lib/resume/import/detect.mjs';
import { CHECK_RULE_IDS, checkResume } from './lib/resume/check.mjs';

const USAGE = `Usage:
  node resume.mjs absorb [--json]
  node resume.mjs adopt [--confirm]
  node resume.mjs pair <orphanId> <newId> [<orphanId> <newId> ...]
  node resume.mjs export cv-md|payload|docx|rr-json|json-resume [--in file] [--out file] [--json] [--hide s,...] [--hide-item id,...]
  node resume.mjs save --in file --expected-cv-sha <sha> [--json]
  node resume.mjs import <file> [--format rr|json-resume|linkedin|docx] [--confirm] [--replace-cv]
  node resume.mjs check [--in file] [--json] [--ignore RULE_ID[,RULE_ID...]]`;
const VALUE_FLAGS = ['--in', '--out', '--hide', '--hide-item', '--expected-cv-sha', '--format', '--ignore'];
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
function lineDiff(before, after, label = 'generated from data/resume.json') {
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
  const out = ['--- cv.md', `+++ ${label}`];
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

/** The --in draft, or cv.md absorbed in memory; null (after printing the report) while the gate fails. */
function loadData(root, args, json = false) {
  const inPath = flagValue(args, '--in');
  if (inPath) return readDraft(inPath);
  const result = absorb(readCv(root), readResume(root));
  if (result.lossless) return result.data;
  printReport(result, json, { written: false });
  return null;
}

const hidden = (args) => ({ hide: list(flagValue(args, '--hide')), hideItems: list(flagValue(args, '--hide-item')) });
const asJson = (value) => JSON.stringify(value, null, 2) + '\n';

/** Each export kind: `run` gives the file content and the sections it could not carry. */
const EXPORTERS = {
  'cv-md': { run: (data) => ({ content: resumeToCvMarkdown(data) }) },
  payload: {
    run: (data, args) => {
      const { payload, unmapped } = resumeToPayload(data, hidden(args));
      return { content: asJson(hasFlag(args, '--json') && !flagValue(args, '--out') ? { payload, unmapped } : payload) };
    },
  },
  docx: {
    binary: true,
    run: async (data, args) => {
      // Loaded here so the other subcommands do not pay for the docx package at startup.
      const { payloadToDocx } = await import('./lib/resume/export/docx.mjs');
      const { payload, unmapped } = resumeToPayload(data, hidden(args));
      return { content: await payloadToDocx(payload), unmapped, label: 'DOCX' };
    },
  },
  'rr-json': {
    // An RR export carries each section's and item's own hidden flag.
    noHide: 'rr-json does not take --hide or --hide-item; set hidden on the section or item instead',
    run: (data) => {
      const { careerOps, ...rest } = data;
      return { content: asJson(rest) };
    },
  },
  'json-resume': {
    run: (data, args) => {
      const { document, unmapped } = resumeToJsonResume(data, hidden(args));
      return { content: asJson(document), unmapped, label: 'JSON Resume' };
    },
  },
};

async function exportCommand(root, kind, args) {
  if (!Object.hasOwn(EXPORTERS, kind)) throw new UsageError(`export takes ${Object.keys(EXPORTERS).join(', ')}`);
  const exporter = EXPORTERS[kind];
  if (exporter.noHide && (flagValue(args, '--hide') || flagValue(args, '--hide-item'))) throw new UsageError(exporter.noHide);
  const out = flagValue(args, '--out');
  if (exporter.binary && !out && process.stdout.isTTY) throw new UsageError(`${kind} is binary; add --out <file>, or pipe stdout to a file`);
  const data = loadData(root, args);
  if (!data) return 3;
  const { content, unmapped = [], label } = await exporter.run(data, args);
  if (unmapped.length) console.error(`resume: not in the ${label}: ${unmapped.join(', ')}`);
  if (out) writeFileAtomic(out, content);
  else process.stdout.write(content);
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
  // The sha check sits inside the lock, after the wait, so a cv.md write made while this save waited is seen.
  return withResumeLock(root, (path) => {
    const current = existsSync(cvPath) ? sha256(readFileSync(cvPath, 'utf8')) : '';
    if (current !== expected) {
      console.log(json ? JSON.stringify({ stale: true, written: false, cvSha256: current }) : `cv.md changed since the draft was opened (sha ${current}); nothing written`);
      return 4;
    }
    data.careerOps.pendingCvSha256 = sha256(generated);
    writeFileAtomic(path, serialize(data));
    replaceUserFile(cvPath, generated);
    markInSync(data, sha256(generated));
    writeFileAtomic(path, serialize(data));
    console.log(json ? JSON.stringify({ written: true, cvSha256: data.careerOps.cvSha256 }) : 'cv.md and data/resume.json written');
    return 0;
  });
}

function checkCommand(root, args) {
  const ignore = list(flagValue(args, '--ignore'));
  const unknown = ignore.filter((id) => !CHECK_RULE_IDS.includes(id));
  if (unknown.length) throw new UsageError(`unknown rule id ${unknown.join(', ')}; --ignore takes ${CHECK_RULE_IDS.join(', ')}`);
  const json = hasFlag(args, '--json');
  const data = loadData(root, args, json);
  if (!data) return 3;
  const report = checkResume(data, { ignore });
  if (!report.templateKnown) console.error(`resume: template "${data.careerOps.template}" is not in lib/resume/template-layouts.mjs; the layout rules assume one column with no sidebar`);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  console.log(`Check score ${report.score}/100 (${report.passedRules} of ${report.totalRules} rules pass)`);
  for (const f of report.findings) console.log(`${f.id} ${f.category} ${f.path}  ${f.message}`);
  if (report.ignored.length) console.log(`${report.ignored.length} ignored: ${report.ignored.map((f) => `${f.id} ${f.path}`).join(', ')}`);
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
  let imported;
  try {
    const format = forced ?? detectFormat(buffer, basename(file));
    if (format === 'unknown') throw new ImportError('not a Reactive Resume JSON, JSON Resume, LinkedIn export zip or .docx');
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
  if (!gate.lossless) {
    printReport(gate, false, { written: false });
    return 3;
  }
  const cvPath = join(root, 'cv.md');
  const jsonPath = resumePath(root);
  const cv = existsSync(cvPath) ? readFileSync(cvPath, 'utf8') : null;
  // The sidecar holds orphans, hidden flags and links that cv.md cannot carry, so it is gated and backed up like cv.md.
  const json = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : null;
  if (cv !== null) {
    console.log('cv.md exists; import would replace it:');
    console.log(lineDiff(cv, generated, `generated from ${basename(file)}`));
  } else {
    console.log('cv.md to be written:');
    console.log(generated);
  }
  if (json !== null) console.log('data/resume.json exists; import would replace it');
  const existing = [cv !== null && 'cv.md', json !== null && 'data/resume.json'].filter(Boolean);
  if (!hasFlag(args, '--confirm')) {
    console.log(`Nothing written. Add --confirm${existing.length ? ' --replace-cv' : ''}`);
    return 0;
  }
  if (existing.length && !hasFlag(args, '--replace-cv')) throw new ImportError(`${existing.join(' and ')} exist${existing.length === 1 ? 's' : ''}; add --replace-cv to replace (a copy is kept as .bak, or a timestamped .bak when one exists); import never merges two CVs`);
  const backup = (path, text) => {
    const bak = existsSync(`${path}.bak`) ? `${path}.${Date.now()}.bak` : `${path}.bak`;
    writeFileAtomic(bak, text);
    return bak;
  };
  const baks = [cv !== null && backup(cvPath, cv), json !== null && backup(jsonPath, json)].filter(Boolean);
  replaceUserFile(cvPath, generated);
  markInSync(data, sha256(generated));
  await writeResume(root, data);
  console.log(`cv.md and data/resume.json written${baks.length ? ` (previous copies in ${baks.join(', ')})` : ''}`);
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
      case 'export': return await exportCommand(root, rest[0], args);
      case 'save': return await saveCommand(root, args);
      case 'import': return await importCommand(root, rest[0], args);
      case 'check': return checkCommand(root, args);
      default: throw new UsageError(command ? `unknown command: ${command}` : 'no command given');
    }
  } catch (err) {
    console.error(err instanceof UsageError || err instanceof ImportError ? `resume: ${err.message}` : err.stack);
    if (err instanceof UsageError) console.error(USAGE);
    return err instanceof ImportError ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
