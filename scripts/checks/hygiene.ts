import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAllowed, loadAllowlist, projectFiles, readText, SOURCE_EXTENSIONS } from './files.ts';

// The forbidden list. Each hit fails unless verify.allowlist.json has an entry
// for that exact line with a reason.

interface Rule {
  name: string;
  re: RegExp;
  files: RegExp;
  except?: RegExp;
}

const CODE = /\.(ts|tsx|js|mjs|cjs)$/;
const UI_COPY = /^(app|components)\/.*\.(tsx|ts)$|^README\.md$/;
const TESTS = /^(tests|e2e)\//;

const RULES: Rule[] = [
  {
    name: 'literal fallback for a secret',
    re: /(SECRET|KEY|TOKEN|PASSWORD)\w*\s*(\?\?|\|\|)\s*['"`]/,
    files: CODE,
  },
  {
    name: 'permissive CORS',
    re: /cors\(\s*\)|Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/i,
    files: CODE,
  },
  {
    name: 'focused or skipped test',
    re: /\b(it|test|describe)\.(only|skip|todo|fixme)\b|\b[xf](it|describe)\(/,
    files: TESTS,
  },
  {
    // Command-line scripts report to the terminal by design; this rule is about
    // application and test code.
    name: 'print-style debugging',
    re: /\bconsole\.(log|debug|info|warn|error|trace)\(|\bdebugger\b/,
    files: CODE,
    except: /^scripts\//,
  },
  { name: 'unlisted TODO', re: /\b(TODO|FIXME|HACK|XXX)\b/, files: /\.(ts|tsx|js|mjs|css|sql)$/ },
  {
    name: 'suppression',
    re: /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|prettier-ignore/,
    files: CODE,
  },
  { name: 'unchecked cast', re: /\bas\s+any\b|\bas\s+unknown\s+as\b|<any>/, files: CODE },
  {
    name: 'raw HTML or dynamic code',
    re: /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/,
    files: CODE,
  },
  {
    name: 'placeholder text',
    re: /lorem ipsum|coming soon|href=["']#?["']/i,
    files: /\.(tsx|ts|md|css)$/,
  },
  {
    name: 'machine path',
    re: /\/Users\/|[A-Z]:\\\\Users|\/home\/[a-z]/,
    files: /\.(ts|tsx|js|mjs|json|md|css)$/,
  },
  {
    name: 'hard-coded localhost',
    re: /localhost|127\.0\.0\.1/,
    files: CODE,
    except: /^(tests|e2e)\/|^playwright\.config\.ts$/,
  },
  {
    name: 'model identifier literal',
    re: /['"`](gpt-[\w.-]+|claude-[\w.-]+|gemini-[\w.-]+)['"`]/,
    files: CODE,
  },
  {
    name: 'private reference in a comment',
    re: /\b[AR]-\d{2}\b|\bstep \d+\b|\bprompt \d+\b|Fable|\.planning|PLAN\.md|DESIGN\.md|DECISIONS\.md/i,
    files: /\.(ts|tsx|js|mjs|css|sql|md|json)$/,
    except: /^scripts\/(checks\/|verify\.ts)/,
  },
  { name: 'emoji in copy', re: /\p{Extended_Pictographic}/u, files: UI_COPY },
];

function lineHits(file: string, allow: ReturnType<typeof loadAllowlist>): string[] {
  const hits: string[] = [];
  // The checks define these patterns, so their own source would match them.
  if (file.startsWith('scripts/checks/')) return hits;
  readText(file)
    .split('\n')
    .forEach((line, i) => {
      for (const rule of RULES) {
        if (!rule.files.test(file) || rule.except?.test(file)) continue;
        if (rule.re.test(line) && !isAllowed(allow, file, line))
          hits.push(`${file}:${i + 1} ${rule.name}`);
      }
    });
  return hits;
}

function fileHits(files: string[], allow: ReturnType<typeof loadAllowlist>): string[] {
  const hits: string[] = [];
  const allowedFiles = new Set(allow.filter((e) => e.line === '*').map((e) => e.file));
  for (const file of files.filter((f) => SOURCE_EXTENSIONS.test(f))) {
    const lines = readText(file).split('\n').length - 1;
    if (lines > 300 && !allowedFiles.has(file)) hits.push(`${file} has ${lines} lines (limit 300)`);
  }
  for (const file of files.filter((f) => TESTS.test(f) && /\.(test|spec)\.ts$/.test(f))) {
    if (!/\bexpect\(/.test(readText(file))) hits.push(`${file} has no assertions`);
  }
  for (const file of files) {
    if (/(^|\/)\.planning\/|(^|\/)(PLAN|DESIGN|DECISIONS|VERIFY)\.md$/.test(file))
      hits.push(`${file} is a planning document`);
    if (
      /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|mp3|wav|ogg)$/i.test(file) &&
      !/^(media|public)\//.test(file)
    )
      hits.push(`${file} is media outside media/`);
    if (/thumbnail|thumb|gallery|cover|submission/i.test(file))
      hits.push(`${file} has a forbidden name`);
  }
  if (!existsSync('LICENSE')) hits.push('LICENSE is missing');
  const seen = new Map<string, string>();
  for (const file of files.filter((f) => existsSync(f))) {
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    const twin = seen.get(digest);
    if (twin) hits.push(`${file} duplicates ${twin}`);
    else seen.set(digest, file);
  }
  return hits;
}

function manifestHits(): string[] {
  const manifest: unknown = JSON.parse(readText('package.json'));
  if (typeof manifest !== 'object' || manifest === null) return ['package.json is not an object'];
  const hits: string[] = [];
  for (const field of ['dependencies', 'devDependencies', 'overrides'] as const) {
    const deps = (manifest as Record<string, unknown>)[field];
    if (typeof deps !== 'object' || deps === null) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))
        hits.push(`package.json ${field}.${name} is not an exact version`);
    }
  }
  return hits;
}

export function hygieneCheck(): { pass: boolean; summary: string; log: string } {
  const allow = loadAllowlist();
  const files = projectFiles().filter((f) => existsSync(f));
  const textFiles = files.filter(
    (f) => !/\.(png|jpe?g|gif|webp|mp4|webm|ico|woff2?)$/i.test(f) && f !== 'package-lock.json',
  );
  const hits = [
    ...textFiles.flatMap((f) => lineHits(f, allow)),
    ...fileHits(files, allow),
    ...manifestHits(),
  ];
  return {
    pass: hits.length === 0,
    summary: hits.length
      ? `${hits.length} hit(s)`
      : `no hits in ${files.length} files (${allow.length} allow-listed lines)`,
    log: hits.join('\n'),
  };
}
