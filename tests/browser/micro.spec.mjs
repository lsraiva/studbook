import { test, expect } from '@playwright/test';

/** Micro-interactions: the balance rolls, presses ripple, the tab bar slides. */
const shots = process.env.STUDBOOK_SHOTS;
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});
const myGuineas = (state) => state.stables.find((s) => s.player)?.guineas;

test('running a meeting rolls the balance and floats the change off it', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  const before = myGuineas(await saved(page));
  await page.locator('.tab[data-screen="racing"]').click();
  // the bank moves when the season turns (upkeep) or a runner earns; run meetings until it does
  const chip = page.locator('.pill.bank .bank-delta');
  for (let i = 0; i < 8 && !(await chip.count()); i += 1) {
    await page.locator('#advance').click();
    await page.waitForTimeout(500);
  }
  // a change in either direction shows: the chip floats off the pill and the pill glows
  await expect(chip).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.pill.bank')).toHaveClass(/gain|loss/);
  if (shots) await page.locator('header.bar').screenshot({ path: `${shots}/bank-roll.png` });
  // the text always carries the real balance, whatever the animation is drawing
  const after = myGuineas(await saved(page));
  expect(after).not.toBe(before);
  const text = await page.locator('#guineas').textContent();
  expect(text.replace(/[^\d]/g, '')).toBe(String(Math.round(after)));
  // and when the roll ends nothing is left painted over it
  await expect(page.locator('.pill.bank')).not.toHaveClass(/rolling/, { timeout: 5000 });
  expect(await page.locator('#guineas').getAttribute('data-roll')).toBeNull();
  expect(errors).toEqual([]);
});

test('the tab bar slides to the current tab, and a press ripples from the pointer', async ({ page }) => {
  await page.goto('/index.html');
  const indicator = page.locator('#tabs .tab-indicator');
  await expect(indicator).toHaveCount(1, { timeout: 20000 });
  const tab = page.locator('.tab[data-screen="breeding"]');
  await tab.click();
  const box = await tab.boundingBox();
  await expect.poll(async () => {
    const b = await indicator.boundingBox();
    return b ? Math.abs((b.x + b.width / 2) - (box.x + box.width / 2)) : 999;
  }, { timeout: 5000 }).toBeLessThan(4);
  // the ripple starts where the pointer went down
  // let the tab's view transition finish: while one runs, presses land on the page root, not the tab
  await page.waitForFunction(() => !document.querySelector(':root')?.matches(':active-view-transition'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const target = page.locator('.tab[data-screen="ranking"]');
  const t = await target.boundingBox();
  // record the button's state in the same task as the press, before anything redraws it
  await target.evaluate((n) => document.addEventListener('pointerdown', () => queueMicrotask(() => {
    window.__ripple = { cls: n.className, rx: n.style.getPropertyValue('--rx') };
  }), { once: true }));
  await page.mouse.move(t.x + 6, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const ripple = await page.evaluate(() => window.__ripple);
  expect(ripple.cls).toContain('rippling');
  expect(Math.abs(parseFloat(ripple.rx) - 6)).toBeLessThan(1);
});

test('reduced motion: the balance just changes, with no chip or coins', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  await page.locator('.tab[data-screen="racing"]').click();
  const start = await page.locator('#guineas').textContent();
  for (let i = 0; i < 8 && (await page.locator('#guineas').textContent()) === start; i += 1) {
    await page.locator('#advance').click();
    await page.waitForTimeout(500);
  }
  expect(await page.locator('#guineas').textContent()).not.toBe(start);
  await expect(page.locator('.bank-delta')).toHaveCount(0);
  await expect(page.locator('.coin-layer')).toHaveCount(0);
  await context.close();
});

test('a horse rising into the elite is stamped, in Portuguese', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  const rose = await page.evaluate(async () => {
    const { eliteStamp } = await import('/assets/micro.js?v=0.46.0'); // the same module ui.js uses
    const show = (node) => document.getElementById('toasts').append(node);
    eliteStamp([{ id: 'stamp-test', name: 'Ormere', band: 'above the field' }], show);
    return eliteStamp([{ id: 'stamp-test', name: 'Ormere', band: 'near elite' }], show);
  });
  expect(rose).toBe(1);
  const toast = page.locator('.stamp-toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('.stamp-seal')).toHaveText('ELITE');
  await expect(toast).toContainText('Ormere agora está perto da elite');
  await page.waitForTimeout(500);
  if (shots) await toast.screenshot({ path: `${shots}/elite-stamp.png` });
});
