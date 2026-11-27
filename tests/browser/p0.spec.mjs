import { test, expect } from '@playwright/test';
import { setup, applyAction, validateAction } from '../../assets/engine.js';

/** The report's P0 findings, fixed: typing, toasts, selling, the simulation label. */
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
});

test('typing digits into a field types them, and does not switch screens', async ({ page }) => {
  await page.locator('.tab[data-screen="ledger"]').click();
  const name = page.getByRole('textbox', { name: /Stable name|Nome do estábulo/ }).first();
  await expect(name).toBeVisible();
  await name.fill('');
  await name.type('qa-estabulo1');
  await expect(name).toHaveValue('qa-estabulo1');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'ledger');
  // outside a field the shortcut still works
  await page.locator('h1, .brand').first().click();
  await page.keyboard.press('1');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'yard');
});

test('toasts are counted, closable and gone on their own', async ({ page }) => {
  // the opening's "run the meeting" step refuses with a toast while no runner is entered
  // (it also walks to the race screen, so come back to the yard before each press)
  for (let i = 0; i < 4; i += 1) {
    await page.locator('.tab[data-screen="yard"]').click();
    await page.locator('#opening button').last().click();
  }
  const toasts = page.locator('#toasts .toast');
  await expect(toasts).toHaveCount(1); // the same refusal four times is one toast...
  await expect(toasts.first().locator('.toast-count')).toHaveText('×4'); // ...that counts them
  await toasts.first().locator('.toast-close').click();
  await expect(toasts).toHaveCount(0);
  // and a toast leaves on its own: errors after 8 s
  await page.locator('.tab[data-screen="yard"]').click();
  await page.locator('#opening button').last().click();
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toHaveCount(0, { timeout: 12000 });
});

test('selling takes two presses and names the price first', async ({ browser }) => {
  // a yard with a horse that can be sold: the starting mare is soulbound, so buy one first
  const pid = 'p0sell';
  let state = setup([pid], 'p0-sell');
  const lot = state.listings.find((l) => l.kind === 'horse');
  if (validateAction(state, pid, { type: 'buyHorse', listingId: lot.id }).ok) state = applyAction(state, pid, { type: 'buyHorse', listingId: lot.id });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(([id, game]) => {
    localStorage.setItem('hf:game:playerId', id);
    localStorage.setItem('studbook:standalone:v2:' + id, JSON.stringify(game));
  }, [pid, { status: 'playing', seats: [pid], state, result: null }]);
  await page.goto('/index.html');
  const count = async () => (await saved(page)).stables.find((s) => s.player).horses.length;
  await expect.poll(count, { timeout: 20000 }).toBe(2);
  const sell = page.locator('#yard-cards [data-horse-act="sell"]:not([disabled])').first();
  await sell.click();
  await expect(sell).toHaveText(/^confirmar venda · ₲ [\d.,]+$/);
  await page.waitForTimeout(400);
  expect(await count()).toBe(2); // one press sells nothing
  await sell.click();
  await expect.poll(count).toBe(1);
  await context.close();
});

test('the tokens section opens on SIMULADO, and offline keeps the start-over tool', async ({ page }) => {
  await page.locator('.tab[data-screen="ledger"]').click();
  await expect(page.locator('#tokens .sim-banner')).toContainText('SIMULADO');
  await expect(page.locator('#tokens')).not.toContainText(/No horses yet|Tokens need the server/);
  await expect(page.getByRole('button', { name: /recomeçar · /i })).toBeVisible();
});

test('an unknown page answers with the styled 404', async ({ page }) => {
  const res = await page.goto('/termos');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Página não encontrada');
  await expect(page.locator('a[href="/play"]')).toBeVisible();
});
