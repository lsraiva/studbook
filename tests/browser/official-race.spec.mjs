import { test, expect } from '@playwright/test';

/** F0-02 in the offline game: ?engine=causal makes the race decide the result. */
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test('?engine=causal decides the meeting by the race and records its seed', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html?engine=causal');
  await expect.poll(async () => (await saved(page))?.raceEngine, { timeout: 20000 }).toBe('causal');
  await page.locator('.tab[data-screen="racing"]').click();
  await page.locator('#advance').click();
  await expect.poll(async () => (await saved(page))?.lastRace?.official?.engine, { timeout: 20000 }).toBe('race-causal/1');
  const race = (await saved(page)).lastRace;
  expect(race.official.seed).toMatch(/^[0-9a-f]{32}$/);
  expect(race.table.every((row, i) => row.place === i + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('without the switch the offline game keeps the legacy result', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  await page.locator('.tab[data-screen="racing"]').click();
  await page.locator('#advance').click();
  await expect.poll(async () => (await saved(page))?.lastRace?.official?.engine, { timeout: 20000 }).toBe('legacy');
});
