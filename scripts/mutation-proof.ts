import { readFileSync, writeFileSync } from 'node:fs';
import { CLEAN_ENV, run } from './checks/run.ts';

// Mutation proof: for one rule in each of state, authorization, concurrency
// and validation, remove the rule, show its test failing, restore it, show the
// test passing. The source file is always restored, even if a run crashes.

interface Mutation {
  rule: string;
  file: string;
  find: string;
  replace: string;
  test: string;
  pattern: string;
}

const MUTATIONS: Mutation[] = [
  {
    rule: 'state: a visit zone only moves forward',
    file: 'lib/server/visits-repo.ts',
    find: 'SET max_zone = GREATEST(max_zone, $2::smallint)',
    replace: 'SET max_zone = $2::smallint',
    test: 'tests/api/scroll.test.ts',
    pattern: 'state matrix',
  },
  {
    rule: 'authorization: stats needs the bearer token',
    file: 'lib/server/handlers.ts',
    find: "if (!tokenMatches(request.headers.get('authorization'), d.config.statsToken)) {",
    replace:
      "if (false && !tokenMatches(request.headers.get('authorization'), d.config.statsToken)) {",
    test: 'tests/api/stats.test.ts',
    pattern: 'authorization matrix',
  },
  {
    rule: 'concurrency: the daily cap holds under simultaneous visits',
    file: 'lib/server/visits-repo.ts',
    find: 'WHERE daily_visit_counts.visits < $2',
    replace: 'WHERE daily_visit_counts.visits < $2 + 1000000',
    test: 'tests/api/concurrency.test.ts',
    pattern: 'daily cap',
  },
  {
    rule: 'validation: visitId must be a UUID',
    file: 'lib/shared/schemas.ts',
    find: 'ScrollRequest = z.strictObject({ visitId: z.uuid(), zone })',
    replace: 'ScrollRequest = z.strictObject({ visitId: z.string(), zone })',
    test: 'tests/api/scroll.test.ts',
    pattern: 'refusals',
  },
];

const vitest = (m: Mutation) => run('npx', ['vitest', 'run', m.test, '-t', m.pattern], CLEAN_ENV);
const tally = (out: string) => /Tests\s+([^\n]+)/.exec(out)?.[1]?.trim() ?? 'no summary';

let problems = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8');
  if (!original.includes(m.find)) {
    console.log(`FAIL  ${m.rule}: the rule text was not found in ${m.file}`);
    problems++;
    continue;
  }
  let removed;
  try {
    writeFileSync(m.file, original.replace(m.find, m.replace));
    removed = vitest(m);
  } finally {
    writeFileSync(m.file, original);
  }
  const restored = vitest(m);
  const ok = !removed.ok && restored.ok;
  if (!ok) problems++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${m.rule}`);
  console.log(
    `      rule removed:  ${removed.ok ? 'tests PASSED (the test does not guard this rule)' : `tests failed as expected: ${tally(removed.output)}`}`,
  );
  console.log(
    `      rule restored: ${restored.ok ? `tests passed: ${tally(restored.output)}` : `tests FAILED: ${tally(restored.output)}`}`,
  );
}
process.exit(problems === 0 ? 0 : 1);
