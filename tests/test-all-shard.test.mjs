// tests/test-all-shard.test.mjs: `test-all.mjs --shard i/N` splits the discovered suites.
import { pass, fail, ROOT } from './helpers.mjs';
import { createRunnerSandbox, helpers } from './test-all-sandbox.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

console.log('\ntest-all.mjs --shard — disjoint, complete, stable shards');
const { sandbox, suite, runner, remove } = createRunnerSandbox('career-ops-shard-test-');
const check = (name, ok, detail) => (ok ? pass(name) : fail(`${name}${detail ? ` — ${detail}` : ''}`));
try {
  for (const n of ['a', 'b', 'c', 'd', 'e']) suite(`shard/${n}.test.mjs`, [helpers(1), `pass('${n}');`]);
  const all = runner(['--only', 'shard/', '--jobs', '2']);
  const one = runner(['--only', 'shard/', '--jobs', '2', '--shard', '1/2']);
  const two = runner(['--only', 'shard/', '--jobs', '2', '--shard', '2/2']);
  check('both shards pass', one.status === 0 && two.status === 0, `${one.all}\n${two.all}`);
  check('shard 1/2 runs discovery positions 1, 3 and 5', JSON.stringify(one.verdicts) === JSON.stringify(['✅ a', '✅ c', '✅ e']), JSON.stringify(one.verdicts));
  check('shard 2/2 runs positions 2 and 4', JSON.stringify(two.verdicts) === JSON.stringify(['✅ b', '✅ d']), JSON.stringify(two.verdicts));
  check('together the shards run every suite once', JSON.stringify([...one.verdicts, ...two.verdicts].sort()) === JSON.stringify([...all.verdicts].sort()));
  check('the same shard twice runs the same suites', JSON.stringify(runner(['--only', 'shard/', '--jobs', '2', '--shard', '1/2']).verdicts) === JSON.stringify(one.verdicts));
  for (const bad of ['0/2', '3/2', '2', 'a/b', '1/0']) {
    const r = runner(['--only', 'shard/', '--shard', bad]);
    check(`--shard ${bad} is a usage error`, r.status === 1 && /--shard takes i\/N/.test(r.stdout), r.all);
  }
  check('--shard with no value is a usage error', runner(['--only', 'shard/', '--shard']).status === 1);

  // A filter that leaves shard 2 with nothing is a pass, not "no test files matched".
  {
    const empty = runner(['--only', 'shard/a.test', '--shard', '2/2']);
    check('a shard the filter leaves empty passes and says so', empty.status === 0 && /shard 2\/2 is empty/.test(empty.stdout) && !/no test files matched/.test(empty.stdout), empty.all);
    const none = runner(['--only', 'no-such-suite', '--shard', '2/2']);
    check('a filter that matches nothing still fails with a shard set', none.status === 1 && /no test files matched/.test(none.stdout), none.all);
    const noneUnsharded = runner(['--only', 'no-such-suite']);
    check('a filter that matches nothing still fails without a shard', noneUnsharded.status === 1 && /no test files matched/.test(noneUnsharded.stdout), noneUnsharded.all);
  }

  // Only shard 1 runs the inline sections.
  {
    const realRunner = readFileSync(join(ROOT, 'test-all.mjs'), 'utf-8').replace(/\r\n/g, '\n');
    const begin = realRunner.match(/^\/\/ ── INLINE SECTIONS: BEGIN ─+$/m);
    const end = realRunner.match(/^\/\/ ── INLINE SECTIONS: END ─+$/m);
    const head = realRunner.slice(0, begin.index + begin[0].length);
    const tail = realRunner.slice(end.index);
    writeFileSync(join(sandbox, 'test-all.mjs'), `${head}\npass('inline: ran');\n${tail}`, 'utf-8');
    const s2 = runner(['--quick', '--shard', '2/2', '--jobs', '2']);
    check('shard 2/2 of a full run skips the inline sections', s2.status === 0 && !s2.verdicts.includes('✅ inline: ran'), s2.all);
    const s1 = runner(['--quick', '--shard', '1/2', '--jobs', '2']);
    check('shard 1/2 of a full run runs the inline sections', s1.status === 0 && s1.verdicts.includes('✅ inline: ran'), s1.all);
  }
} finally {
  remove();
}
