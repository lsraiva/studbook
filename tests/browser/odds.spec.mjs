import { test, expect } from '@playwright/test';

/** Odds in the field: every runner's price, the favourite marked, your own expected prize. */
const shots = process.env.STUDBOOK_SHOTS;

test('the field shows the odds of each runner in Portuguese, and yours with the expected prize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await page.locator('#yard-cards [data-horse-act="enter"]:not([disabled])').first().click();
  await page.locator('.tab[data-screen="racing"]').click();
  const rows = page.locator('#paddock .runner');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  await expect(page.locator('#paddock .runner-odds')).toHaveCount(count);
  await expect(page.locator('#paddock .runner-odds b').first()).toHaveText(/^(\d+\+? para 1|1 para \d+|quase certo)$/);
  await expect(page.locator('#paddock .runner-odds small').first()).toHaveText(/^(\d+|menos de 1|mais de 99)% de chance$/);
  await expect(page.locator('#paddock .runner-odds.fav')).not.toHaveCount(0);
  const mine = page.locator('#paddock .runner.mine .runner-ev');
  await expect(mine).toHaveText(/^prêmio esperado ₲ [\d.,]+ · inscrição ₲ [\d.,]+$/);
  // the rows still line up with the new column
  const lefts = await rows.evaluateAll((list) => list.map((row) => Math.round(row.querySelector('.runner-odds').getBoundingClientRect().right)));
  expect(new Set(lefts).size).toBe(1);
  if (shots) await page.locator('#paddock').screenshot({ path: `${shots}/odds.png` });
});

test('with the causal engine the same screen shows the causal race’s odds', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html?engine=causal');
  await page.locator('.tab[data-screen="racing"]').click();
  const odds = page.locator('#paddock .runner-odds b');
  await expect(odds.first()).toBeVisible({ timeout: 20000 });
  // the odds on screen are the causal race's: the room says so, and every runner is priced
  const engine = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('studbook:standalone')); return JSON.parse(localStorage.getItem(k)).state.raceEngine; });
  expect(engine).toBe('causal');
  expect(await odds.count()).toBe(await page.locator('#paddock .runner').count());
  if (shots) await page.locator('#paddock').screenshot({ path: `${shots}/odds-causal.png` });
});

test('the odds fit a phone without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="racing"]').click();
  await expect(page.locator('#paddock .runner-odds').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  if (shots) await page.locator('#paddock').screenshot({ path: `${shots}/odds-phone.png` });
});
