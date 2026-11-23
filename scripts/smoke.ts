import {
  ErrorResponse,
  HealthResponse,
  ScrollResponse,
  VisitResponse,
} from '../lib/shared/schemas.ts';

// Smoke-checks a running instance, local or deployed:
//   npm run smoke -- <url>          read-only checks
//   npm run smoke -- <url> --full   also records one real visit and scroll
// --full writes one row to that deployment's database.

const [base, ...flags] = process.argv.slice(2).filter((a) => a !== '--');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: npm run smoke -- <url> [--full]');
  process.exit(2);
}
const root = base.replace(/\/+$/, '');
let failures = 0;

async function step(name: string, fn: () => Promise<string>): Promise<void> {
  const t0 = performance.now();
  try {
    const detail = await fn();
    console.log(`PASS  ${name.padEnd(28)} ${detail} (${Math.round(performance.now() - t0)} ms)`);
  } catch (error) {
    failures++;
    console.log(
      `FAIL  ${name.padEnd(28)} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function expectOk(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let assetPath = '';
await step('health', async () => {
  const r = await fetch(`${root}/api/health`);
  expectOk(r.status === 200, `status ${r.status}`);
  HealthResponse.parse(await r.json());
  return 'status ok';
});
await step('page and security headers', async () => {
  const r = await fetch(`${root}/`);
  const html = await r.text();
  expectOk(r.status === 200, `status ${r.status}`);
  expectOk(html.includes('Living'), 'page copy missing');
  for (const h of [
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
  ]) {
    expectOk(r.headers.has(h), `missing ${h}`);
  }
  assetPath = /src="(\/_next\/static\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
  return `${html.length} bytes, headers present`;
});
await step('static asset', async () => {
  expectOk(assetPath !== '', 'no script asset found in the page');
  const r = await fetch(`${root}${assetPath}`);
  expectOk(r.status === 200, `status ${r.status}`);
  return assetPath;
});
await step('stats refuses anonymous', async () => {
  const r = await fetch(`${root}/api/stats`);
  expectOk(r.status === 401, `status ${r.status}`);
  ErrorResponse.parse(await r.json());
  return '401 with the error shape';
});
if (flags.includes('--full')) {
  await step('visit and scroll (writes)', async () => {
    const v = await fetch(`${root}/api/visit`, { method: 'POST' });
    expectOk(v.status === 201, `visit status ${v.status}`);
    const { visitId } = VisitResponse.parse(await v.json());
    const s = await fetch(`${root}/api/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitId, zone: 1 }),
    });
    expectOk(s.status === 200, `scroll status ${s.status}`);
    ScrollResponse.parse(await s.json());
    return 'recorded one visit at zone 1';
  });
}
console.log(failures === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
