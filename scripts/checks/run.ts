import { spawnSync } from 'node:child_process';

// Runs a command without a shell (portable across PowerShell and bash) and
// captures its output for the verify log.

export interface RunResult {
  ok: boolean;
  status: number | null;
  output: string;
}

export function run(
  command: string,
  args: string[],
  env: Record<string, string | undefined> = {},
  cwd?: string,
): RunResult {
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? `${command}.cmd` : command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
    maxBuffer: 256 * 1024 * 1024,
    shell: isWindows,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`;
  return { ok: result.status === 0, status: result.status, output };
}

/** The environment every check runs in: no database, no stats token. */
export const CLEAN_ENV = { POSTGRES_URL: '', STATS_TOKEN: '', NEXT_TELEMETRY_DISABLED: '1' };
