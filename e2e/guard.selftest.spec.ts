import { expect, test } from '@playwright/test';
import { attachRecorder, installObservers, pageChecks } from './guard';

// One page per guard check, each built to trip exactly that check. If a check
// ever stops firing, these tests fail, so the guard cannot silently go blind.

const page = (body: string, lang = 'en') =>
  `<!doctype html><html${lang ? ` lang="${lang}"` : ''}><head><title>t</title></head><body><main>${body}</main></body></html>`;

test.describe('browser guard self-test', () => {
  test('console errors are recorded', async ({ page: p }) => {
    const r = attachRecorder(p);
    await p.setContent(page('<script>console.error("planted")</script>'));
    expect(r.findings.join()).toContain('console error: planted');
  });

  test('uncaught page errors are recorded', async ({ page: p }) => {
    const r = attachRecorder(p);
    await p.setContent(page('<script>setTimeout(() => { throw new Error("planted") })</script>'));
    await p.waitForTimeout(100);
    expect(r.findings.join()).toContain('page error: planted');
  });

  test('failed requests are recorded', async ({ page: p }) => {
    const r = attachRecorder(p);
    await p.setContent(page('<img alt="x" src="http://127.0.0.1:9/unreachable.png">'));
    await p.waitForTimeout(300);
    expect(r.findings.join()).toContain('request failed');
  });

  test('unexpected HTTP errors are recorded, declared ones are not', async ({ page: p }) => {
    const r = attachRecorder(p);
    await p.goto('/api/health');
    r.expectHttpError(/\/api\/declared/);
    await p.evaluate(() => Promise.all([fetch('/api/undeclared'), fetch('/api/declared')]));
    expect(r.findings.filter((f) => f.startsWith('HTTP'))).toEqual([
      expect.stringContaining('/api/undeclared'),
    ]);
  });

  test('horizontal overflow is found', async ({ page: p }) => {
    await p.setContent(page('<div style="width:5000px">wide</div>'));
    expect((await pageChecks(p)).join()).toContain('horizontal overflow');
  });

  test('clipped text is found', async ({ page: p }) => {
    await p.setContent(
      page(
        '<p style="width:40px;overflow:hidden;white-space:nowrap">a sentence that does not fit</p>',
      ),
    );
    expect((await pageChecks(p)).join()).toContain('clipped text');
  });

  test('small tap targets are found', async ({ page: p }) => {
    await p.setContent(page('<a href="#x" style="font-size:10px">x</a>'));
    expect((await pageChecks(p)).join()).toContain('tap target');
  });

  test('accessibility violations are found', async ({ page: p }) => {
    await p.setContent(page('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'));
    expect((await pageChecks(p)).join()).toContain('axe image-alt');
  });

  test('layout shift over the limit is found', async ({ page: p }) => {
    await installObservers(p);
    await p.goto('/api/health');
    await p.setContent(
      page(
        '<div id="t" style="height:300px;background:#000"></div><p style="height:600px">text</p>',
      ),
    );
    await p.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 100));
      const block = document.createElement('div');
      block.style.height = '400px';
      document.querySelector('main')?.prepend(block);
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(await p.evaluate(() => window.__cls ?? 0)).toBeGreaterThan(0.1);
    expect((await pageChecks(p)).join()).toContain('layout shift');
  });

  test('a missing lang attribute is found', async ({ page: p }) => {
    await p.setContent(page('<p>hello</p>', ''));
    expect((await pageChecks(p)).join()).toContain('missing lang');
  });

  test('focus lost to a removed element is found', async ({ page: p }) => {
    await installObservers(p);
    await p.goto('/api/health');
    await p.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'b';
      button.textContent = 'go';
      document.body.append(button);
    });
    await p.focus('#b');
    await p.evaluate(() => document.getElementById('b')?.remove());
    expect((await pageChecks(p)).join()).toContain('focus lost');
  });
});
