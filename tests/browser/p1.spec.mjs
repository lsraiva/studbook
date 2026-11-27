import { test, expect } from '@playwright/test';
import { setup, applyAction, validateAction, runRound, viewFor } from '../../assets/engine.js';

/** The report's cheap P1 items: one guidance block, a readable clock, the name at sign-up, the result card. */
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test('the guidance block is whole on the yard and one compact line elsewhere', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  await expect(page.locator('.spine')).toBeVisible();
  await page.locator('.tab[data-screen="studs"]').click();
  await expect(page.locator('.spine')).toBeHidden();
  await expect(page.locator('#advice')).toBeHidden();
  const step = page.locator('#nextstep');
  if (await step.isVisible()) {
    const box = await step.boundingBox();
    expect(box.height).toBeLessThan(90); // one line and its button, not the whole card
    await expect(step.locator('#nextstep-go')).toBeVisible();
  }
});

test('the meeting clock turns brass in its last minute and pulses red in its last seconds', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  await page.evaluate(() => {
    const line = document.createElement('div');
    line.className = 'roomline';
    line.innerHTML = `<span class="countdown" id="t-soon" data-closes="${Date.now() + 45000}"></span><span class="countdown" id="t-urgent" data-closes="${Date.now() + 8000}"></span>`;
    document.body.append(line);
  });
  await expect(page.locator('#t-soon')).toHaveClass(/soon/, { timeout: 3000 });
  await expect(page.locator('#t-urgent')).toHaveClass(/urgent/, { timeout: 3000 });
});

test('creating a stable can name it at sign-up', async ({ page }) => {
  const actions = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, cloud: true, version: 'test' } });
    if (path === '/api/register') return route.fulfill({ json: { token: 't-1', user: { id: 'u1', email: 'a@b.test', verified: false } } });
    if (path === '/api/action') { actions.push(JSON.parse(req.postData() ?? '{}')); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 401, json: { error: 'sign in again', code: 'auth' } });
  });
  await page.goto('/index.html');
  const gate = page.locator('.gate');
  await expect(gate).toBeVisible();
  await expect(gate.getByText('nome do estábulo')).toBeVisible();
  await gate.locator('[name="email"]').fill('a@b.test');
  await gate.locator('[name="password"]').fill('long-enough-1');
  await gate.locator('[name="stable"]').fill('Haras Luann 1');
  await gate.locator('[name="register"]').click();
  await expect.poll(() => actions.length, { timeout: 10000 }).toBeGreaterThan(0);
  expect(actions[0]).toEqual({ action: { type: 'nameStable', name: 'Haras Luann 1' } });
});

/** A save in which the player's mare has just foaled, built with the engine itself. */
function savedBirth() {
  const pid = 'birthtest';
  let state = setup([pid], 'birth-spec');
  const act = (action) => { if (validateAction(state, pid, action).ok) state = applyAction(state, pid, action); };
  for (let round = 0; round < 14; round += 1) {
    act({ type: 'takeStarterOffer' });
    const view = viewFor(state, pid);
    const straw = view.straws?.[0] ?? view.stable?.straws?.[0];
    if (straw) act({ type: 'selectStraw', strawId: straw.id ?? straw });
    for (const horse of view.horses ?? []) if (horse.sex === 'F' && straw) act({ type: 'breed', mareId: horse.id, strawId: straw.id ?? straw, care: 'plain' });
    state = runRound(state, '');
    if ((state.lastFoals ?? []).some((row) => row.event === 'born' && row.stableId === 'st1')) break;
  }
  const born = (state.lastFoals ?? []).find((row) => row.event === 'born');
  return { pid, game: { status: 'playing', seats: [pid], state, result: null }, foal: born };
}

test('the result card shows the foal in its own coat and closes from the top', async ({ browser }) => {
  test.setTimeout(90000);
  const save = savedBirth();
  test.skip(!save.foal, 'the engine produced no birth for this seed');
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(([pid, game]) => {
    localStorage.setItem('hf:game:playerId', pid);
    localStorage.setItem('studbook:standalone:v2:' + pid, JSON.stringify(game));
  }, [save.pid, save.game]);
  await page.goto('/index.html');
  await expect(page.locator('.birth-stage')).toBeVisible({ timeout: 20000 });
  // Escape closes the scene, and only the scene: the card underneath stays
  await page.keyboard.press('Escape');
  const card = page.locator('#reveal .card');
  await expect(card).toBeVisible();
  await expect(card.locator('.scene img')).toHaveAttribute('src', /^data:image\//, { timeout: 15000 });
  await card.locator('.reveal-close').click();
  await expect(page.locator('#reveal')).toBeHidden();
  await context.close();
});
