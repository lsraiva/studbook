import { test, expect } from '@playwright/test';

/** F1-07: a server exists (mocked), the player chooses the offline demo instead of signing in. */
test('offline demo chosen beside a server stays offline and offers sign-in', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const posts = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST') posts.push(path);
    if (path === '/api/health') return route.fulfill({ json: { ok: true, cloud: true, version: 'test' } });
    return route.fulfill({ status: 401, json: { error: 'sign in again', code: 'auth' } });
  });
  // an old session token left in this browser must not be used by the demo
  await page.addInitScript(() => { try { localStorage.setItem('hf:studbook:token', 'stale-token'); } catch {} });
  await page.goto('/index.html');
  await expect(page.locator('.gate')).toBeVisible();
  await page.locator('.gate [name="offline"]').click();

  await expect(page.locator('body')).toHaveAttribute('data-mode', 'offline');
  const banner = page.locator('#mode-banner');
  await expect(banner).toContainText('Demonstração offline');
  await expect(banner.locator('[data-mode-signin]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('studbook:standalone')))).toBe(true);
  await page.locator('[data-screen="horses"]').click();
  await page.waitForTimeout(300);
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test('offline banner fits a 360px phone without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('#mode-banner')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
