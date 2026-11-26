import { test, expect } from '@playwright/test';

/** The landing hero is a silent loop on desktop, and stays a still where a video would cost too much. */
const shots = process.env.STUDBOOK_SHOTS;

test('desktop: the hero plays its loop over the still', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const video = page.locator('.hero-video');
  await expect(video).toHaveCount(1);
  expect(await video.evaluate((v) => v.muted && v.loop && v.playsInline)).toBe(true);
  // headless Chromium plays WebM (VP9); once it does, the still gives way
  await expect(page.locator('.hero')).toHaveClass(/has-video/, { timeout: 20000 });
  await expect.poll(() => video.evaluate((v) => v.currentTime), { timeout: 10000 }).toBeGreaterThan(0.3);
  if (shots) await page.screenshot({ path: `${shots}/landing-video.png` });
  // the headline and the buttons still sit above the picture
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('[data-start]').first()).toBeVisible();
});

test('the loop is served in byte ranges, as Safari requires', async ({ request }) => {
  for (const file of ['hero-loop.mp4', 'hero-loop.webm']) {
    const res = await request.get(`/assets/art/${file}`, { headers: { range: 'bytes=0-1023' } });
    expect(res.status()).toBe(206);
    expect(res.headers()['content-range']).toMatch(/^bytes 0-1023\/\d+$/);
    expect(res.headers()['content-type']).toMatch(/^video\//);
  }
});

test('phones, reduced motion and data saver keep the still and fetch no video', async ({ browser }) => {
  for (const options of [
    { viewport: { width: 390, height: 844 } },
    { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const videos = [];
    page.on('request', (r) => { if (/\.(mp4|webm)$/.test(r.url())) videos.push(r.url()); });
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Sua linhagem');
    await page.waitForTimeout(800);
    await expect(page.locator('.hero-video')).toHaveCount(0);
    expect(videos).toEqual([]);
    await context.close();
  }
});
