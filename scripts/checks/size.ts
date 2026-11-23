import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { INITIAL_JS_BUDGET_BYTES } from '../../lib/shared/limits.ts';

// Initial JavaScript of the page: every script the prerendered HTML loads,
// gzipped, against the budget.

export function measureInitialJs(): { bytes: number; files: number } | null {
  const html = '.next/server/app/index.html';
  if (!existsSync(html)) return null;
  const sources = [
    ...readFileSync(html, 'utf8').matchAll(/<script[^>]+src="\/_next\/([^"]+\.js)"/g),
  ].map((m) => m[1] ?? '');
  const unique = [...new Set(sources)];
  const bytes = unique.reduce(
    (sum, src) => sum + gzipSync(readFileSync(join('.next', src))).byteLength,
    0,
  );
  return { bytes, files: unique.length };
}

export function sizeCheck(): { pass: boolean; summary: string; log: string } {
  const measured = measureInitialJs();
  if (!measured)
    return { pass: false, summary: 'no build output to measure (build failed?)', log: '' };
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const pass = measured.bytes <= INITIAL_JS_BUDGET_BYTES;
  return {
    pass,
    summary: `initial JS ${kb(measured.bytes)} gzipped in ${measured.files} files (budget ${kb(INITIAL_JS_BUDGET_BYTES)})`,
    log: '',
  };
}
