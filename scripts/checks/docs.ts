import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { IcosahedronGeometry } from 'three';
import { CONFIG_VARIABLES } from '../../lib/server/config.ts';
import { METAL_VERTEX } from '../../lib/scene/glsl/metal.ts';
import {
  DAILY_VISIT_CAP,
  INITIAL_JS_BUDGET_BYTES,
  JSON_BODY_LIMIT_BYTES,
  RATE_LIMITS,
  STATS_TOKEN_MIN_LENGTH,
  TEST_WIDTHS,
} from '../../lib/shared/limits.ts';
import { projectFiles, readText } from './files.ts';

// Docs consistency: README commands exist as scripts, the variable list
// matches in the config schema, .env.example and the README, relative links
// resolve, and every number in the README comes from the code.

const minutes = (ms: number) => ms / 60000;

/** Every number the README may state, each derived from the code. */
export function readmeFacts(): string[] {
  const triangles = new IcosahedronGeometry(1, 48).attributes.position.count / 3;
  const ripple = /age < ([\d.]+)\)/.exec(METAL_VERTEX)?.[1] ?? '?';
  const manifest = JSON.parse(readText('package.json'));
  const major = (name: string) => String(manifest.dependencies[name]).split('.')[0];
  return [
    `${triangles.toLocaleString('en-US')} triangles`,
    `${ripple} seconds`,
    `${DAILY_VISIT_CAP.toLocaleString('en-US')} visits per UTC day`,
    `${RATE_LIMITS.visit.limit} visits per ${minutes(RATE_LIMITS.visit.windowMs)} minutes`,
    `${RATE_LIMITS.scroll.limit} scroll reports per ${minutes(RATE_LIMITS.scroll.windowMs)} minutes`,
    `${RATE_LIMITS.statsAuthFailures.limit} failed attempts per ${minutes(RATE_LIMITS.statsAuthFailures.windowMs)} minutes`,
    `${JSON_BODY_LIMIT_BYTES / 1024} KB`,
    `${STATS_TOKEN_MIN_LENGTH} characters`,
    `${TEST_WIDTHS.join(', ')} px`,
    `${INITIAL_JS_BUDGET_BYTES / 1024} KB gzipped`,
    `Next.js ${major('next')}`,
    `React ${major('react')}`,
    `Three.js ${manifest.dependencies.three}`,
    `Node.js ${String(manifest.engines.node).replace('.x', '')}`,
    `${readText('.nvmrc').trim()}`,
    'MIT',
    'UTC',
    'WebGL2',
    'HTTP 401',
    'Copyright (c) 2026',
  ];
}

function prose(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function numberProblems(readme: string): string[] {
  const facts = readmeFacts();
  const problems: string[] = [];
  const text = prose(readme);
  for (const line of text.split('\n')) {
    for (const match of line.matchAll(/\d[\d,.]*/g)) {
      const covered = facts.some((fact) => fact.includes(match[0]) && line.includes(fact));
      if (!covered)
        problems.push(
          `README number "${match[0]}" is not produced by a script: ${line.trim().slice(0, 80)}`,
        );
    }
  }
  return problems;
}

function variableProblems(readme: string): string[] {
  const schema = [...CONFIG_VARIABLES].sort();
  const example = [...readText('.env.example').matchAll(/^([A-Z_]+)=/gm)]
    .map((m) => m[1] ?? '')
    .sort();
  const section = /## Environment variables([\s\S]*?)\n## /.exec(readme)?.[1] ?? '';
  const table = [...section.matchAll(/^\| `([A-Z_]+)`\s*\|/gm)].map((m) => m[1] ?? '').sort();
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  const problems: string[] = [];
  if (!same(schema, example))
    problems.push(`.env.example lists ${example.join(', ')}; config has ${schema.join(', ')}`);
  if (!same(schema, table))
    problems.push(`README table lists ${table.join(', ')}; config has ${schema.join(', ')}`);
  return problems;
}

function commandProblems(readme: string): string[] {
  const scripts = Object.keys(JSON.parse(readText('package.json')).scripts ?? {});
  const named = [...readme.matchAll(/npm run ([a-z0-9:-]+)/g)].map((m) => m[1] ?? '');
  const bare = [...readme.matchAll(/`npm (start|test)\b/g)].map((m) => m[1] ?? '');
  return [...new Set([...named, ...bare])]
    .filter((s) => !scripts.includes(s))
    .map((s) => `README uses "${s}", which is not a script`);
}

function linkProblems(): string[] {
  const problems: string[] = [];
  for (const file of projectFiles().filter((f) => f.endsWith('.md') && existsSync(f))) {
    for (const match of readText(file).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = (match[1] ?? '').split('#')[0] ?? '';
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      if (!existsSync(join(dirname(file), target))) problems.push(`${file}: broken link ${target}`);
    }
  }
  return problems;
}

export function docsCheck(): { pass: boolean; summary: string; log: string } {
  const readme = readText('README.md');
  const problems = [
    ...commandProblems(readme),
    ...variableProblems(readme),
    ...linkProblems(),
    ...numberProblems(readme),
  ];
  return {
    pass: problems.length === 0,
    summary: problems.length
      ? `${problems.length} problem(s)`
      : 'commands, variables, links and numbers all consistent',
    log: problems.join('\n'),
  };
}
