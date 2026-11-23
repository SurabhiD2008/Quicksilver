import AxeBuilder from '@axe-core/playwright';
import { test as base, type Page } from '@playwright/test';

// The browser guard. Every test imports `test` from here, so every test also
// fails on a console error, an uncaught page error, a failed or unexpected
// HTTP-error request, horizontal overflow, clipped text, a small tap target,
// an accessibility violation, layout shift over 0.1, a missing lang attribute,
// or focus lost to a removed element.

declare global {
  interface Window {
    __cls?: number;
    __focused?: Element | null;
  }
}

export const TAP_MIN = 44;
export const CLS_MAX = 0.1;

export interface Recorder {
  findings: string[];
  expectHttpError: (pattern: RegExp) => void;
}

/** Collects problems reported by the page while a test runs. */
export function attachRecorder(page: Page): Recorder {
  const findings: string[] = [];
  const expected: RegExp[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // The browser also logs every HTTP error response; a declared one is expected.
    const resource = message.location().url;
    if (
      message.text().startsWith('Failed to load resource') &&
      expected.some((p) => p.test(resource))
    )
      return;
    findings.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown';
    // Navigation away aborts in-flight requests by design; that is not a fault.
    if (reason !== 'net::ERR_ABORTED')
      findings.push(`request failed: ${request.url()} (${reason})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !expected.some((p) => p.test(response.url()))) {
      findings.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return { findings, expectHttpError: (pattern) => expected.push(pattern) };
}

/** Records layout shifts and the last focused element from the first paint on. */
export async function installObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__focused = null;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = 'value' in entry && typeof entry.value === 'number' ? entry.value : 0;
        const input = 'hadRecentInput' in entry && entry.hadRecentInput === true;
        if (!input) window.__cls = (window.__cls ?? 0) + value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    document.addEventListener('focusin', (event) => {
      window.__focused = event.target instanceof Element ? event.target : null;
    });
  });
}

/** Inspects the page as it stands at the end of a test. */
export async function pageChecks(page: Page): Promise<string[]> {
  const findings = await page.evaluate(
    ({ tapMin, clsMax }) => {
      const out: string[] = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth + 1)
        out.push(`horizontal overflow: ${doc.scrollWidth} > ${doc.clientWidth}`);
      if (!doc.lang) out.push('missing lang attribute on <html>');
      const cls = window.__cls ?? 0;
      if (cls > clsMax) out.push(`layout shift ${cls.toFixed(3)} > ${clsMax}`);
      if (window.__focused && !window.__focused.isConnected)
        out.push('focus lost: the focused element was removed');
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const clips =
          ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis';
        const hasText = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent?.trim(),
        );
        if (clips && hasText && el.scrollWidth > el.clientWidth + 1)
          out.push(`clipped text in <${el.tagName.toLowerCase()}>`);
      }
      const interactive =
        'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(interactive))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.width < tapMin || r.height < tapMin) {
          out.push(
            `tap target ${Math.round(r.width)}x${Math.round(r.height)}: "${el.textContent?.trim().slice(0, 40)}"`,
          );
        }
      }
      return out;
    },
    { tapMin: TAP_MIN, clsMax: CLS_MAX },
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  for (const v of axe.violations) {
    const where = v.nodes
      .slice(0, 3)
      .map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`)
      .join(' | ');
    findings.push(`axe ${v.id}: ${v.help} (${v.nodes.length} node(s)) ${where}`);
  }
  return findings;
}

export const test = base.extend<{ guard: Recorder }>({
  guard: [
    async ({ page }, use, testInfo) => {
      const recorder = attachRecorder(page);
      await installObservers(page);
      await use(recorder);
      const findings = [...recorder.findings, ...(await pageChecks(page))];
      if (findings.length > 0) {
        await page.screenshot({ path: testInfo.outputPath('guard-failure.png') });
        throw new Error(
          `Browser guard found ${findings.length} problem(s):\n${findings.join('\n')}`,
        );
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
