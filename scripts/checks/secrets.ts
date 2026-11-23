import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAllowed, loadAllowlist, projectFiles, readText, TEXT_EXTENSIONS } from './files.ts';
import { run } from './run.ts';

// Secret scan over the source tree, the build output and the whole git
// history, for known credential shapes and for the values of the secrets this
// project actually uses.

const PATTERNS: { name: string; re: RegExp; placeholder?: RegExp }[] = [
  {
    name: 'Postgres URL with a password',
    re: /postgres(?:ql)?:\/\/[^\s:@/'"`]+:[^\s@'"`]+@[^\s'"`]+/g,
    // Documentation placeholders and driver code that builds a URL from parts.
    placeholder: /\/\/(user:password|u:p|USER:PASSWORD)@|\$\{/,
  },
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'API key (sk-)', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Neon API key', re: /\bnapi_[a-z0-9]{40,}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  {
    name: 'hard-coded credential',
    re: /(SECRET|TOKEN|PASSWORD|API_KEY)\w*\s*[=:]\s*['"][A-Za-z0-9_\-]{24,}['"]/g,
    // Header and setting names (lowercase words joined by hyphens) are not secrets.
    placeholder: /['"][a-z]+(-[a-z]+)+['"]$/,
  },
];

export function scanText(text: string, extraValues: string[] = []): string[] {
  const hits: string[] = [];
  for (const { name, re, placeholder } of PATTERNS) {
    for (const match of text.matchAll(re)) {
      if (placeholder?.test(match[0])) continue;
      hits.push(name);
    }
  }
  for (const value of extraValues) if (text.includes(value)) hits.push('a configured secret value');
  return hits;
}

/** Values of the secrets this project uses, from the environment and local env files. */
function liveSecretValues(): string[] {
  const SECRET_NAME = /TOKEN|SECRET|PASSWORD|KEY|POSTGRES|DATABASE_URL|^PG/;
  const values = Object.entries(process.env)
    .filter(([name]) => SECRET_NAME.test(name))
    .map(([, value]) => value);
  for (const file of ['.env', '.env.local', '.env.production.local', '.env.development.local']) {
    if (!existsSync(file)) continue;
    for (const line of readText(file).split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+)"?/.exec(line);
      if (m?.[1] && m[2] && SECRET_NAME.test(m[1])) values.push(m[2].trim());
    }
  }
  return values.filter((v): v is string => typeof v === 'string' && v.length >= 12);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'cache') continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(js|json|html|rsc|txt|map|css|body|meta)$/.test(name)) out.push(path);
  }
  return out;
}

export function secretCheck(): { pass: boolean; summary: string; log: string } {
  const canary = ['postgres://canary', ':s3cr3t-', 'value@db.example.net/app'].join('');
  if (scanText(canary).length === 0)
    return { pass: false, summary: 'the planted canary was not detected', log: '' };
  const allow = loadAllowlist();
  const values = liveSecretValues();
  const findings: string[] = [];
  for (const file of projectFiles().filter(
    (f) => TEXT_EXTENSIONS.test(f) && existsSync(f) && f !== 'verify.allowlist.json',
  )) {
    readText(file)
      .split('\n')
      .forEach((line, i) => {
        if (isAllowed(allow, file, line)) return;
        for (const hit of scanText(line, values)) findings.push(`${file}:${i + 1} ${hit}`);
      });
  }
  const built = walk('.next');
  for (const file of built)
    for (const hit of scanText(readText(file), values)) findings.push(`${file} ${hit}`);
  // History lines may carry an allow-listed line inside the allowlist file itself.
  const allowedLines = allow.map((entry) => entry.line.trim());
  const history = run('git', ['log', '-p', '--all', '--no-color']).output.split('\n');
  const historyHits = history
    .map((line) => line.replace(/^[+\- ]/, '').trim())
    .filter((line) => !allowedLines.some((allowed) => line.includes(allowed)))
    .reduce((count, line) => count + scanText(line, values).length, 0);
  if (historyHits > 0)
    findings.push(`git history: ${historyHits} match(es) (run git log -p --all to locate)`);
  const scope = `${projectFiles().length} files, ${built.length} build files, git history; canary detected; ${values.length} live value(s) checked`;
  return {
    pass: findings.length === 0,
    summary: findings.length ? `${findings.length} finding(s)` : `clean (${scope})`,
    log: findings.join('\n'),
  };
}
