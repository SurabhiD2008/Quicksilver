import { readFileSync } from 'node:fs';
import { run } from './run.ts';

// The files the checks look at: everything tracked or about to be tracked,
// never what .gitignore excludes.

export function projectFiles(cwd = '.'): string[] {
  const result = run('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {}, cwd);
  return result.output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('fatal'));
}

export const TEXT_EXTENSIONS =
  /\.(ts|tsx|js|mjs|cjs|css|json|md|sql|yml|yaml|txt|html|example)$|(^|\/)(\.[a-z]+rc|\.gitignore|\.gitattributes|\.npmrc|\.nvmrc|LICENSE|\.env\.example)$/;
export const SOURCE_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|css)$/;

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export interface AllowEntry {
  file: string;
  line: string;
  reason: string;
}

export function loadAllowlist(path = 'verify.allowlist.json'): AllowEntry[] {
  const parsed: unknown = JSON.parse(readText(path));
  if (!Array.isArray(parsed)) throw new Error('verify.allowlist.json must be an array');
  return parsed.filter(
    (e): e is AllowEntry =>
      typeof e === 'object' &&
      e !== null &&
      typeof e.file === 'string' &&
      typeof e.line === 'string' &&
      typeof e.reason === 'string' &&
      e.reason.length > 0,
  );
}

export function isAllowed(allow: AllowEntry[], file: string, line: string): boolean {
  return allow.some((entry) => entry.file === file && line.trim() === entry.line.trim());
}
