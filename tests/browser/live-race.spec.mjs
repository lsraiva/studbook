import { test, expect } from '@playwright/test';

async function openRace(page) {
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="racing"]').click();
  await page.locator('#live-race').click();
  await expect(page.locator('.race-stage canvas')).toBeVisible();
}

test('the live race plays from engine frames and ends on the engine result', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await openRace(page);
  // it moves: the clock advances and the order board fills from positions
  await expect.poll(async () => parseFloat(await page.locator('.rs-clock').textContent()), { timeout: 15000 }).toBeGreaterThan(1);
  await expect(page.locator('.rs-board li')).not.toHaveCount(0);
  await page.locator('.rs-controls button', { hasText: 'Ir para a chegada' }).click();
  await expect(page.locator('.rs-result')).toBeVisible();
  const expected = await page.evaluate(() => {
    const { race } = window.__studbookRace;
    const winner = race.runners.find((r) => r.key === race.placings[0].key);
    return { winner: winner.name, count: race.placings.length };
  });
  await expect(page.locator('.rs-result h3')).toContainText(expected.winner);
  await expect(page.locator('.rs-podium li')).toHaveCount(expected.count);
  await expect(page.locator('.rs-board li').first()).toContainText(expected.winner.replace(/\s*\(L\d+\)$/, ''));
  await expect(page.locator('.rs-result')).toContainText('não altera resultados');
  await page.locator('.rs-controls button', { hasText: 'Fechar' }).click();
  await expect(page.locator('.race-stage')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the live race fits a phone and closes with Escape', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openRace(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const sel of ['.rs-controls', '.rs-top']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.race-stage')).toHaveCount(0);
});

test('with reduced motion the race shows the finish and result at once', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openRace(page);
  await expect(page.locator('.rs-result')).toBeVisible();
  await context.close();
});
