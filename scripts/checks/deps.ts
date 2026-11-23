import { CLEAN_ENV, run } from './run.ts';

// Dependency health: no high or critical advisories in production
// dependencies, and no unused, missing or unlisted packages. Exact versions
// are enforced by the hygiene check.

function auditResult(): { ok: boolean; offline: boolean; text: string } {
  const result = run('npm', ['audit', '--omit=dev', '--json'], CLEAN_ENV);
  try {
    const report: unknown = JSON.parse(result.output.slice(result.output.indexOf('{')));
    const counts = (report as { metadata?: { vulnerabilities?: Record<string, number> } }).metadata
      ?.vulnerabilities;
    if (!counts) {
      const offline = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network/i.test(result.output);
      return {
        ok: false,
        offline,
        text: offline ? 'audit unavailable (offline)' : 'audit returned no report',
      };
    }
    const serious = (counts.high ?? 0) + (counts.critical ?? 0);
    return {
      ok: serious === 0,
      offline: false,
      text: `audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate`,
    };
  } catch {
    return { ok: false, offline: true, text: 'audit unavailable (no JSON report)' };
  }
}

export function depsCheck(final: boolean): { pass: boolean; summary: string; log: string } {
  const knip = run(
    'npx',
    ['knip', '--include', 'dependencies,unlisted,unresolved,binaries', '--no-progress'],
    CLEAN_ENV,
  );
  const audit = auditResult();
  const auditPass = audit.ok || (audit.offline && !final);
  const parts = [
    knip.ok ? 'no unused or missing packages' : 'knip found dependency problems',
    audit.text,
  ];
  if (audit.offline && !final) parts.push('audit NOT RUN here; verify:final requires it');
  return {
    pass: knip.ok && auditPass,
    summary: parts.join('; '),
    log: `${knip.output}\n${audit.text}`,
  };
}
