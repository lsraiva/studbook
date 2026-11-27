import { test, expect } from '@playwright/test';

/** Ranking podium, a field whose rows line up, the tack room's marks, and no stray English. */
const shots = process.env.STUDBOOK_SHOTS;
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
});

test('the ranking opens on a podium of the top three, gold in the middle', async ({ page }) => {
  await page.locator('.tab[data-screen="ranking"]').click();
  const podium = page.locator('#ranking .podium');
  await expect(podium.locator('.podium-step')).toHaveCount(3);
  await expect(podium.locator('.podium-step').nth(1)).toHaveClass(/place-1/);
  const heights = await podium.locator('.podium-block').evaluateAll((n) => n.map((b) => b.getBoundingClientRect().height));
  expect(heights[1]).toBeGreaterThan(heights[0]);
  expect(heights[0]).toBeGreaterThan(heights[2]);
  // the table's headers, and the podium's lines, in Portuguese
  await expect(page.locator('#ranking thead')).toContainText('vitórias');
  await expect(page.locator('#ranking thead')).toContainText('cavalos');
  await expect(podium).toContainText('vitórias');
  if (shots) await page.locator('section.panel[data-when="ranking"]').screenshot({ path: `${shots}/ranking.png` });
});

test('every runner row in the field lines up, tags or not', async ({ page }) => {
  await page.locator('.tab[data-screen="racing"]').click();
  const rows = page.locator('#paddock .runner');
  await expect(rows.first()).toBeVisible();
  const lefts = await rows.evaluateAll((list) => list.map((row) => Math.round(row.querySelector('.runner-form').getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBe(1);
});

test('the tack room shows a drawn mark for each item, all in Portuguese', async ({ page }) => {
  await page.locator('.tab[data-screen="shop"]').click();
  const items = page.locator('#shop .shop-item');
  await expect(items).toHaveCount(3);
  await expect(items.locator('.shop-icon svg')).toHaveCount(3);
  await expect(page.locator('#shop')).not.toContainText('Conditioning feed');
  if (shots) await page.locator('#shop').screenshot({ path: `${shots}/shop.png` });
});

test('the ledger no longer leaves English behind', async ({ page }) => {
  await page.locator('.tab[data-screen="ledger"]').click();
  const ledger = page.locator('body');
  await expect(ledger).not.toContainText(/\bstart over\b|\bstandard 2,000\b|\bhorses\b/);
});
