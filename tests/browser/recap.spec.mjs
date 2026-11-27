import { test, expect } from '@playwright/test';
import { setup, applyAction, validateAction, runRound, viewFor } from '../../assets/engine.js';
import { snapshotOf, computeRecap } from '../../assets/recap.js';

/** "Enquanto você esteve fora": coming back to a stable that kept running. */
const shots = process.env.STUDBOOK_SHOTS;

/** A yard with runners, what its owner last saw, and the same yard six meetings later. */
function awayGame() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pid = 'recaptest';
    let state = setup([pid], `recap-spec:${attempt}`);
    const act = (action) => { if (validateAction(state, pid, action).ok) state = applyAction(state, pid, action); };
    const stable = state.stables.find((s) => s.player);
    stable.guineas += 5000;
    for (const lot of state.listings.filter((l) => l.kind === 'horse').sort((a, b) => b.price - a.price).slice(0, 3)) act({ type: 'buyHorse', listingId: lot.id });
    const enter = () => { const v = viewFor(state, pid); const ids = v.horses.filter((h) => h.age >= 2 && !h.retired).slice(0, 3).map((h) => h.id); if (ids.length) act({ type: 'enter', horseIds: ids }); };
    enter();
    const seen = snapshotOf(viewFor(state, pid));
    for (let i = 0; i < 6; i += 1) { state = runRound(state, 'The clock ran out —'); enter(); }
    const recap = computeRecap(seen, snapshotOf(viewFor(state, pid)));
    if (recap?.star) return { pid, seen, recap, game: { status: 'playing', seats: [pid], state, result: null } };
  }
  return null;
}

async function boot(page, save, awayMs) {
  await page.addInitScript(([pid, game, seen, away]) => {
    localStorage.setItem('hf:game:playerId', pid);
    localStorage.setItem('studbook:standalone:v2:' + pid, JSON.stringify(game));
    if (seen && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('studbook:seen:offline:st1', JSON.stringify({ ...seen, at: Date.now() - away }));
      sessionStorage.setItem('seeded', '1');
    }
    // the birth scene and result card are another test's business
    localStorage.setItem('studbook:rode', '1');
  }, [save.pid, save.game, save.seen, awayMs]);
  await page.goto('/index.html');
}

test('coming back after hours opens the recap with what happened', async ({ page }) => {
  test.setTimeout(120000);
  const save = awayGame();
  test.skip(!save, 'no seed gave a placed runner');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, save, 5 * 3600 * 1000);
  // a birth may be staged first; the recap waits for it
  const birth = page.locator('.birth-stage');
  if (await birth.count()) await page.keyboard.press('Escape');
  const stage = page.locator('.recap-stage');
  await expect(stage).toBeVisible({ timeout: 30000 });
  await expect(stage.locator('.recap-eyebrow')).toHaveText('Enquanto você esteve fora');
  await expect(stage.locator('h2')).toHaveText(/1 temporada e 2 reuniões se passaram/);
  await expect(stage.locator('.recap-sub')).toContainText('5 horas');
  const tiles = stage.locator('.recap-tiles dd');
  await expect(tiles.nth(0)).toHaveText(String(save.recap.starts));
  await expect(tiles.nth(1)).toHaveText(String(save.recap.wins));
  await expect(stage.locator('.recap-star b')).toHaveText(save.recap.star.name);
  await expect(stage.locator('.recap-star img')).toHaveAttribute('src', /^data:image\//, { timeout: 15000 });
  if (shots) await page.screenshot({ path: `${shots}/recap.png` });
  await stage.getByRole('button', { name: 'Ver meu haras' }).click();
  await expect(stage).toHaveCount(0);
  // seen now: a reload does not tell it again
  await page.waitForTimeout(4500);
  await page.reload();
  await expect(page.locator('#gallery .gcard').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.recap-stage')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a short absence, or a first visit, shows no recap', async ({ page }) => {
  test.setTimeout(90000);
  const save = awayGame();
  test.skip(!save, 'no seed gave a placed runner');
  await boot(page, save, 2 * 60 * 1000); // two minutes away
  await expect(page.locator('#gallery .gcard').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await expect(page.locator('.recap-stage')).toHaveCount(0);
});

test('the recap fits a phone', async ({ page }) => {
  test.setTimeout(120000);
  const save = awayGame();
  test.skip(!save, 'no seed gave a placed runner');
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, save, 26 * 3600 * 1000);
  if (await page.locator('.birth-stage').count()) await page.keyboard.press('Escape');
  const card = page.locator('.recap-card');
  await expect(card).toBeVisible({ timeout: 30000 });
  const box = await card.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(page.locator('.recap-sub')).toContainText('26 horas');
  if (shots) await page.screenshot({ path: `${shots}/recap-phone.png` });
});
