import { expect, test } from './guard';

// Without WebGL the scene cannot start; every word of the story must still be
// readable, the epilogue must still surface, and nothing may throw.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
        return Reflect.apply(original, this, [type, ...rest]);
      },
    });
  });
});

test('no WebGL: static drop, readable copy, working epilogue', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/no-webgl/);
  await expect(page.locator('#fallback-drop')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  );
  await expect(page.locator('.epilogue-heading')).toHaveCSS('opacity', '1');
  await expect(page.locator('body')).not.toHaveClass(/custom-cursor/);
});
