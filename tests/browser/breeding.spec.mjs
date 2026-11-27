import { test, expect } from '@playwright/test';

/** Breeding, shown: the chosen stallion in his coat, the mares as cards with what the cross brings. */
const shots = process.env.STUDBOOK_SHOTS;
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test('pick a covering, read the cross on the mare, cover her', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  await page.locator('.tab[data-screen="breeding"]').click();

  // before a covering: the board says where to find one, and the mare cannot be covered yet
  await expect(page.locator('.sireboard.empty')).toBeVisible();
  const mare = page.locator('#mare-cards .mare').first();
  await expect(mare).toBeVisible();
  await expect(mare.locator('button.brass')).toBeDisabled();
  await expect(page.locator('#mares').locator('xpath=ancestor::div[1]')).toBeHidden();

  // the account's first covering, then choose it
  // the guide's button: first it enters the horse (the new first step), then it takes the covering
  const straws = async () => (await saved(page)).stables.find((s) => s.player).straws.length;
  for (let i = 0; i < 3 && !(await straws()); i += 1) {
    await page.locator('#nextstep-go').click();
    await page.waitForTimeout(400);
  }
  expect(await straws()).toBeGreaterThan(0);
  await page.locator('#straws button', { hasText: /^(select|selecionar|escolher)/i }).first().click();

  const board = page.locator('.sireboard');
  await expect(board).not.toHaveClass(/empty/, { timeout: 10000 });
  await expect(board.locator('img')).toHaveAttribute('src', /^data:image\//, { timeout: 15000 });
  await expect(board.locator('.mlot-bar b.cut')).toHaveCount(1);
  // the cross, in Portuguese: vigour or the same-lineage warning, inbreeding and foals left
  await expect(mare.locator('.mare-chips')).toContainText(/vigor|mesma linhagem/);
  await expect(mare.locator('.mare-chips')).toContainText('endogamia');
  await expect(mare.locator('.mare-meta')).toHaveText(/^idade \d+ · valor [\d.,]+ · /);
  if (shots) {
    await page.waitForTimeout(800);
    await page.locator('section.panel[data-when="breeding"]').nth(1).screenshot({ path: `${shots}/breeding-board.png` });
    await page.locator('#mare-cards').screenshot({ path: `${shots}/breeding-mares.png` });
  }

  await expect(mare.locator('button.brass')).toBeEnabled();
  await mare.locator('button.brass').click();
  // the covering is spent either way; whether she catches is the game's own chance
  const mine = async () => { const st = await saved(page); const me = st.stables.find((x) => x.player); return { straws: me.straws.length, inFoal: (st.foaling ?? []).some((row) => me.horses.includes(row.mareId)) }; };
  await expect.poll(async () => (await mine()).straws, { timeout: 10000 }).toBe(0);
  if ((await mine()).inFoal) {
    await expect(mare).toHaveClass(/in-foal/, { timeout: 10000 });
    await expect(mare.locator('.mare-chips')).toContainText(/prenha|in foal/);
  } else {
    // she did not catch: the card stays a mare to cover, with the button waiting for a covering
    await expect(mare).not.toHaveClass(/in-foal/);
    await expect(mare.locator('button.brass')).toBeDisabled();
  }
  expect(errors).toEqual([]);
});
