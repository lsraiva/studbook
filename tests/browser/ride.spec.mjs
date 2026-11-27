import { test, expect } from '@playwright/test';

/** Riding the live race: the player's own runner takes orders during the exhibition. */
const shots = process.env.STUDBOOK_SHOTS;

async function openRide(page) {
  await page.goto('/index.html');
  await page.locator('#yard-cards [data-horse-act="enter"]:not([disabled])').first().click();
  await page.locator('.tab[data-screen="racing"]').click();
  await page.locator('#live-race').click();
  await expect(page.locator('.race-stage canvas')).toBeVisible();
}

test('with a runner entered the live race can be ridden: orders, energy, result', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openRide(page);
  const panel = page.locator('.rs-ride');
  await expect(panel).toBeVisible();
  await expect(page.locator('.rs-eyebrow').first()).toContainText('você monta');
  await expect(panel.locator('.rs-ride-state')).toContainText('Piloto automático');
  await expect(panel.locator('.rs-order')).toHaveCount(5);
  // let it run a moment, then take the reins
  await expect.poll(async () => parseFloat(await page.locator('.rs-clock').textContent()), { timeout: 20000 }).toBeGreaterThan(2);
  const before = await page.evaluate(() => window.__studbookRace.scene.data.hash);
  await panel.locator('.rs-order-hold').click();
  await expect(panel.locator('.rs-ride-state')).toHaveText('Você está montando', { timeout: 10000 });
  await expect(panel.locator('.rs-order-hold')).toHaveClass(/active/);
  const after = await page.evaluate(() => {
    const { scene } = window.__studbookRace;
    return { hash: scene.data.hash, inputs: scene.inputs.length, receipts: scene.data.ride.receipts.length };
  });
  expect(after.hash).not.toBe(before); // the order changed what follows
  expect(after).toMatchObject({ inputs: 1, receipts: 1 });
  // the energy gauge follows the ridden horse
  await expect.poll(async () => Number(await panel.locator('.rs-energy').getAttribute('aria-valuenow'))).toBeLessThanOrEqual(100);
  if (shots) { await page.waitForTimeout(1500); await page.screenshot({ path: `${shots}/ride.png` }); }
  // the keyboard rides too: D is the kick (after the cooldown)
  await expect(panel.locator('.rs-order-kick')).toBeEnabled({ timeout: 15000 });
  await page.keyboard.press('d');
  await expect(panel.locator('.rs-order-kick')).toHaveClass(/active/, { timeout: 10000 });
  // to the post: the result names the ride against the autopilot, and offers another go
  await page.locator('.rs-controls button', { hasText: 'Ir para a chegada' }).click();
  const result = page.locator('.rs-result');
  await expect(result).toBeVisible();
  await expect(result.locator('.rs-ride-result')).toContainText(/Você levou .+ ao \d+\.º lugar/);
  await expect(result.locator('.rs-ride-result')).toContainText('piloto automático');
  if (shots) await page.screenshot({ path: `${shots}/ride-result.png` });
  await result.getByRole('button', { name: 'Montar de novo' }).click();
  await expect(panel.locator('.rs-ride-state')).toContainText('Piloto automático');
  expect(await page.evaluate(() => window.__studbookRace.scene.inputs.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('without a runner of your own the race is only watched', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="racing"]').click();
  await page.locator('#live-race').click();
  await expect(page.locator('.race-stage canvas')).toBeVisible();
  await expect(page.locator('.rs-ride')).toHaveCount(0);
});

test('the reins fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRide(page);
  const panel = page.locator('.rs-ride');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const button of await panel.locator('.rs-order').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  if (shots) { await page.waitForTimeout(2500); await page.screenshot({ path: `${shots}/ride-phone.png` }); }
});
