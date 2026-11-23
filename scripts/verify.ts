import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { depsCheck } from './checks/deps.ts';
import { docsCheck } from './checks/docs.ts';
import { hygieneCheck } from './checks/hygiene.ts';
import { CLEAN_ENV, run, type RunResult } from './checks/run.ts';
import { secretCheck } from './checks/secrets.ts';
import { sizeCheck } from './checks/size.ts';

// `verify` runs every check, even after one fails, prints one PASS or FAIL line
// per check, writes the table to .planning/VERIFY.md and full logs to
// .planning/logs/, and exits non-zero if anything failed. `--final` adds three
// shuffled test runs and a fresh-clone run. `--no-clone` skips the clone (used
// inside the clone itself).

interface Outcome {
  pass: boolean | 'n/a';
  summary: string;
  log: string;
}
interface Check {
  id: number;
  name: string;
  run: () => Outcome;
}

const final = process.argv.includes('--final');
const LOG_DIR = '.planning/logs';

const fromRun = (result: RunResult, summary: (out: string) => string): Outcome => ({
  pass: result.ok,
  summary: summary(result.output),
  log: result.output,
});
const grab = (out: string, re: RegExp, fallback: string) => re.exec(out)?.[1] ?? fallback;
const npx = (args: string[]) => run('npx', args, CLEAN_ENV);

function tests(): Outcome {
  const main = npx(['vitest', 'run', '--coverage']);
  const summary = `${grab(main.output, /Tests\s+(\d+ passed[^\n]*)/, 'tests did not report')}; lines ${grab(main.output, /Lines\s*:\s*([\d.]+%)/, '?')}`;
  if (!final) return fromRun(main, () => summary);
  const repeats = [1, 2, 3].map(() => npx(['vitest', 'run', '--sequence.shuffle']));
  const allPassed = main.ok && repeats.every((r) => r.ok);
  const counts = repeats.map((r) => grab(r.output, /Tests\s+(\d+) passed/, 'x')).join('/');
  return {
    pass: allPassed,
    summary: `${summary}; 3 shuffled runs: ${counts} passed`,
    log: [main, ...repeats].map((r) => r.output).join('\n---\n'),
  };
}

function freshClone(): Outcome {
  if (run('git', ['status', '--porcelain']).output.trim()) {
    return {
      pass: false,
      summary: 'working tree has uncommitted changes; commit, then rerun',
      log: '',
    };
  }
  const dir = mkdtempSync(join(tmpdir(), 'quicksilver-clone-'));
  try {
    const steps = [
      run('git', ['clone', '--quiet', '--no-hardlinks', '.', dir]),
      run('npm', ['ci', '--no-audit', '--no-fund'], CLEAN_ENV, dir),
      run('npm', ['run', 'verify', '--', '--no-clone'], CLEAN_ENV, dir),
    ];
    const failed = steps.findIndex((s) => !s.ok);
    const label = ['clone', 'npm ci', 'verify'][failed] ?? '';
    return {
      pass: failed === -1,
      summary:
        failed === -1
          ? 'clone, clean install and verify all passed in a temporary directory'
          : `${label} failed in the clone`,
      log: steps.map((s) => s.output).join('\n---\n'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CHECKS: Check[] = [
  {
    id: 1,
    name: 'Format and lint',
    run: () => {
      const fmt = npx(['prettier', '--check', '.']);
      const lint = npx(['eslint', '.', '--max-warnings=0']);
      return {
        pass: fmt.ok && lint.ok,
        summary: `prettier ${fmt.ok ? 'clean' : 'FAILED'}; eslint ${lint.ok ? '0 errors, 0 warnings' : 'FAILED'}`,
        log: fmt.output + lint.output,
      };
    },
  },
  {
    id: 2,
    name: 'Types',
    run: () =>
      fromRun(npx(['tsc', '--noEmit']), (o) =>
        o.trim() ? (o.split('\n')[0] ?? '') : 'strict type check clean',
      ),
  },
  { id: 3, name: 'Unit and API tests', run: tests },
  {
    id: 4,
    name: 'Build',
    run: () =>
      fromRun(npx(['next', 'build']), (o) =>
        /Compiled successfully/.test(o) ? 'production build succeeded' : 'build failed',
      ),
  },
  {
    id: 5,
    name: 'Browser tests',
    run: () =>
      fromRun(
        npx(['playwright', 'test']),
        (o) =>
          `${grab(o, /(\d+ passed)/, '0 passed')}${grab(o, /(\d+ failed)/, '') ? `, ${grab(o, /(\d+ failed)/, '')}` : ''} at 320, 390, 768, 1024, 1360 px with the guard`,
      ),
  },
  { id: 6, name: 'Secret scan', run: secretCheck },
  { id: 7, name: 'Dependencies', run: () => depsCheck(final) },
  { id: 8, name: 'Hygiene scan', run: hygieneCheck },
  { id: 9, name: 'Docs consistency', run: docsCheck },
  { id: 10, name: 'Size budget', run: sizeCheck },
  {
    id: 11,
    name: 'Provided files',
    run: () => ({ pass: 'n/a', summary: 'N/A: not an Assignment-mode build', log: '' }),
  },
  {
    id: 12,
    name: 'Results check',
    run: () => ({
      pass: 'n/a',
      summary: 'N/A: no bundled samples; the documented API example is checked by the test suite',
      log: '',
    }),
  },
];
if (final && !process.argv.includes('--no-clone'))
  CHECKS.push({ id: 13, name: 'Fresh clone', run: freshClone });

mkdirSync(LOG_DIR, { recursive: true });
const started = new Date();
const rows: string[] = [];
let failed = 0;
for (const check of CHECKS) {
  const t0 = Date.now();
  let outcome: Outcome;
  try {
    outcome = check.run();
  } catch (error) {
    // A crashing check is a failed check; keep going so every check reports.
    outcome = {
      pass: false,
      summary: `check crashed: ${error instanceof Error ? error.message : String(error)}`,
      log: String(error),
    };
  }
  const word = outcome.pass === 'n/a' ? 'N/A ' : outcome.pass ? 'PASS' : 'FAIL';
  if (outcome.pass === false) failed++;
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `${word}  ${String(check.id).padStart(2)} ${check.name.padEnd(20)} ${outcome.summary} (${seconds}s)`,
  );
  writeFileSync(join(LOG_DIR, `check-${String(check.id).padStart(2, '0')}.log`), outcome.log);
  rows.push(
    `| ${check.id} | ${check.name} | ${word.trim()} | ${outcome.summary.replaceAll('|', '/')} | ${seconds}s |`,
  );
}
const commit = run('git', ['rev-parse', '--short', 'HEAD']).output.trim();
const report = [
  `# VERIFY (${final ? 'verify:final' : 'verify'})`,
  '',
  `Started ${started.toISOString()}, finished ${new Date().toISOString()}, commit ${commit}${run('git', ['status', '--porcelain']).output.trim() ? ' plus uncommitted changes' : ''}.`,
  '',
  '| # | Check | Result | Summary | Time |',
  '|---|---|---|---|---|',
  ...rows,
  '',
  failed === 0 ? 'Result: GREEN' : `Result: RED (${failed} failed)`,
  '',
].join('\n');
mkdirSync('.planning', { recursive: true });
writeFileSync('.planning/VERIFY.md', report);
console.log(failed === 0 ? '\nverify: GREEN' : `\nverify: RED (${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
