#!/usr/bin/env node

/**
 * story-coverage.mjs: which common behavioural prompts the story bank can answer.
 *
 * Zero-LLM and read-only. Scores every story in interview-prep/story-bank.md
 * against twelve common behavioural prompts with match-star.mjs's scorer, and
 * lists the stories whose result is still "pending". The prompts are English and matching is by word, so a
 * story bank written in another language matches nothing.
 *
 * Usage:
 *   node story-coverage.mjs
 *   node story-coverage.mjs --json
 *   node story-coverage.mjs --story-bank path/to/story-bank.md
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { flagValue, validateFlags } from './lib/cli-flags.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { isValidStory, parseStories, splitStoryBlocks } from './lib/story-bank.mjs';
import { score, tokenize } from './match-star.mjs';
import { getCareerOpsRoot } from './path-resolver.mjs';

const USAGE = `Usage: node story-coverage.mjs [--json] [--story-bank <path>]

  --json                Print the report as JSON
  --story-bank <path>   Read this file instead of interview-prep/story-bank.md
  --help, -h            Show this help

The prompts are English. Stories and tags in another language match nothing.`;
const KNOWN_FLAGS = ['--json', '--story-bank', '--help', '-h'];

/**
 * The prompt text is what the scorer matches, so each is the words a story's tags or title would use and nothing
 * else: a filler word such as "made" or "asked" would match stories that are about something else.
 */
export const COMMON_PROMPTS = Object.freeze([
  { id: 'difficult-problem', prompt: 'difficult problem' },
  { id: 'changed-priorities', prompt: 'priorities changed' },
  { id: 'disagreement', prompt: 'disagreement conflict coworker stakeholder' },
  { id: 'mistake', prompt: 'mistake error' },
  { id: 'hard-feedback', prompt: 'difficult feedback criticism' },
  { id: 'influence', prompt: 'influence authority persuasion' },
  { id: 'initiative', prompt: 'initiative proactive' },
  { id: 'deadline', prompt: 'deadline pressure' },
  { id: 'process-improvement', prompt: 'process improvement' },
  { id: 'ambiguity', prompt: 'ambiguity incomplete information' },
  { id: 'working-style', prompt: 'working style collaboration' },
  { id: 'missed-goal', prompt: 'failure missed goal' },
]);

/** A tag hit scores 3. Title and body words can add up to 3 too, which is why each match says whether a tag was hit. */
const COVERED_SCORE = 3;

/**
 * The best story for each prompt. `tagged` is false when the score came from title and body words alone.
 * @param {ReturnType<typeof parseStories>} stories
 * @returns {{id: string, prompt: string, best: {title: string, score: number, tagged: boolean} | null, status: 'covered' | 'thin' | 'none'}[]}
 */
export function coverage(stories) {
  return COMMON_PROMPTS.map(({ id, prompt }) => {
    // A word the prompt repeats must not score twice.
    const tokens = [...new Set(tokenize(prompt))];
    let best = null;
    for (const story of stories) {
      const points = score(story, tokens, []);
      if (points > (best?.score ?? 0)) best = { title: story.title, score: points, tagged: score({ ...story, tags: [] }, tokens, []) < points };
    }
    return { id, prompt, best, status: !best ? 'none' : best.score >= COVERED_SCORE ? 'covered' : 'thin' };
  });
}

/** Stories recorded before their outcome was known. */
export const pendingStories = (stories) => stories.filter((s) => s.resultPending).map(({ title, line }) => ({ title, line }));

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  validateFlags(args, KNOWN_FLAGS, USAGE, { valueFlags: ['--story-bank'], requireOperand: true });
  const bankPath = flagValue(args, '--story-bank') ?? join(getCareerOpsRoot(), 'interview-prep', 'story-bank.md');
  if (!statSync(bankPath, { throwIfNoEntry: false })?.isFile()) {
    console.error(`Error: ${bankPath} not found.`);
    console.error('Run /career-ops interview-prep on a role first to populate your story bank.');
    process.exit(1);
  }
  const content = readFileSync(bankPath, 'utf-8');
  const stories = parseStories(content);
  // An entry the parser cannot read would otherwise show up as a prompt with no story.
  const { blocks, tableRows } = splitStoryBlocks(content);
  const unreadable = [
    ...tableRows.map((row) => ({ line: row.line, reason: 'table row' })),
    ...blocks.filter((block) => !isValidStory(block)).map((block) => ({ line: block.line, reason: `"${block.title || '(untitled)'}" has no **A (Action):** line` })),
  ];
  if (unreadable.length) {
    console.error(`⚠️  ${unreadable.length} ${unreadable.length === 1 ? 'entry' : 'entries'} in ${bankPath} cannot be read and ${unreadable.length === 1 ? 'counts' : 'count'} toward nothing below:`);
    for (const entry of unreadable) console.error(`   - line ${entry.line}: ${entry.reason}`);
    console.error('   Ask your agent to convert them to the format in templates/story-bank.template.md.\n');
  }
  const prompts = coverage(stories);
  const pending = pendingStories(stories);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ bank: bankPath, stories: stories.length, unreadable, prompts, pending }, null, 2));
  } else {
    for (const row of prompts) {
      const match = row.best ? `  "${row.best.title}" (score ${row.best.score}${row.best.tagged ? '' : ', no tag match'})` : '';
      console.log(`${row.status.padEnd(8)}${row.id.padEnd(22)}${match}`);
    }
    if (pending.length) {
      console.log('\nResult still pending:');
      for (const story of pending) console.log(`  line ${story.line}  ${story.title}`);
    }
    const count = (status) => prompts.filter((row) => row.status === status).length;
    console.log(`\n${count('covered')} covered, ${count('thin')} thin, ${count('none')} with no story, of ${prompts.length} prompts. ${stories.length} stories read from ${bankPath}.`);
  }
}
