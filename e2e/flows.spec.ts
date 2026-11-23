import type { Page } from '@playwright/test';
import { expect, test } from './guard';

// The main flows, at every tested width, through the guard.

const ZONES = ['SOLID STATE', 'MOLTEN', 'FRACTURE', 'REFORMATION'];

async function scrollToSection(page: Page, index: number) {
  await page.evaluate((i) => {
    const section = document.querySelectorAll('main > section')[i];
    if (section instanceof HTMLElement)
      window.scrollTo({ top: section.offsetTop, behavior: 'instant' });
  }, index);
}

test('the page loads with its copy, the HUD and the security headers', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Living\s*Metal/);
  await expect(page.locator('#tension')).toHaveText('100%');
  await expect(page.locator('#zone')).toHaveText('SOLID STATE');
});

test('scrolling walks the zones and surfaces into the daylight epilogue', async ({ page }) => {
  await page.goto('/');
  for (const [i, label] of ZONES.entries()) {
    await scrollToSection(page, i);
    await expect(page.locator('#zone')).toHaveText(label);
  }
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  );
  await expect(page.locator('body')).toHaveClass(/is-daylight/);
  await expect(page.locator('#epilogue-veil')).toHaveCSS('opacity', '1');
  await expect(page.locator('.epilogue-heading')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('link', { name: /Back to the surface/ })).toBeVisible();
});

test('the analytics beacon stays silent when the deployment has no database', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) calls.push(r.url());
  });
  await page.goto('/');
  await scrollToSection(page, 3);
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});

test('keyboard only: tab to "Back to the surface" and return to the top', async ({ page }) => {
  await page.goto('/');
  const target = page.getByRole('link', { name: /Back to the surface/ });
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
  const outline = await target.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeLessThan(5);
  await expect(page.locator('.epilogue-heading')).toHaveCSS('opacity', '0');
});

test('pointer and tap on the drop never break the page', async ({ page, isMobile }) => {
  await page.goto('/');
  const { width, height } = page.viewportSize() ?? { width: 800, height: 800 };
  if (isMobile) {
    await page.touchscreen.tap(width / 2, height / 2);
  } else {
    await page.mouse.move(width / 2 - 40, height / 2);
    await page.mouse.move(width / 2 + 40, height / 2, { steps: 8 });
    await page.mouse.down();
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await expect(page.locator('#tension')).toHaveText('100%');
});

test('reduced motion still renders the whole story', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await scrollToSection(page, 2);
  await expect(page.locator('#zone')).toHaveText('FRACTURE');
});

test('unknown API paths answer with the JSON error shape', async ({ page, guard }) => {
  guard.expectHttpError(/\/api\/does-not-exist/);
  await page.goto('/');
  const body = await page.evaluate(() => fetch('/api/does-not-exist').then((r) => r.json()));
  expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
});
