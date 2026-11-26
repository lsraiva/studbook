import { test, expect } from '@playwright/test';

/** The markets as a catalogue: each lot in its coat, identical doses grouped, value against the field. */
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test('stud lots are grouped by stallion, painted in his coat, with a value meter', async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  const state = await saved(page);
  const lots = state.listings.filter((l) => l.kind !== 'horse');
  const distinct = new Set(lots.map((l) => [l.sire, l.seller, l.price, Boolean(l.select), l.vintage].join('|'))).size;
  await page.locator('.tab[data-screen="studs"]').click();
  const cards = page.locator('#listings .mlot');
  await expect(cards).toHaveCount(Math.min(30, distinct));
  // the dose counts add back up to every lot in the ring
  const counts = await page.locator('#listings .mlot').evaluateAll((nodes) => nodes.map((n) => {
    const c = n.querySelector('.mlot-count');
    return c ? Number(c.textContent.replace(/\D/g, '')) : 1;
  }));
  expect(counts.reduce((a, b) => a + b, 0)).toBe(lots.length);
  // each portrait is repainted in the stallion's coat
  const img = cards.first().locator('.mlot-stage img');
  await expect(img).toHaveAttribute('src', /^data:image\//, { timeout: 15000 });
  await expect(cards.first().locator('.mlot-bar b.cut')).toHaveCount(1);
  await expect(cards.first().locator('button.brass')).toContainText(/comprar|buy/);
  expect(errors).toEqual([]);
});

test('horse lots show the horse, its coat and its age in Portuguese', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  await page.locator('.tab[data-screen="horses"]').click();
  const card = page.locator('#horse-lots .mlot').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.mlot-who')).toHaveText(/^(macho|fêmea) · \d+ anos?$/);
  await expect(card.locator('.mlot-stage img')).toHaveAttribute('src', /^data:image\//, { timeout: 15000 });
});

test('the offline note no longer points at the retired address', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="horses"]').click();
  await expect(page.locator('body')).not.toContainText('studbook.fly.dev');
});
