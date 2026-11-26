import { test, expect } from '@playwright/test';
import { setup, applyAction, validateAction, runRound, viewFor } from '../../assets/engine.js';

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

async function boot(page, save) {
  await page.addInitScript(([pid, game]) => {
    localStorage.setItem('hf:game:playerId', pid);
    localStorage.setItem('studbook:standalone:v2:' + pid, JSON.stringify(game));
  }, [save.pid, save.game]);
  await page.goto('/index.html');
}

test('a birth is staged: parents, then the foal in its coat, then the card underneath', async ({ page }) => {
  test.setTimeout(60000);
  const save = savedBirth();
  test.skip(!save.foal, 'the engine produced no birth for this seed');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, save);
  const stage = page.locator('.birth-stage');
  await expect(stage).toBeVisible({ timeout: 20000 });
  await expect(stage.locator('.birth-parent')).toHaveCount(2);
  await expect(stage).toHaveClass(/revealed/, { timeout: 10000 });
  await expect(stage.locator('.birth-name')).toHaveText(save.foal.name);
  await expect(stage.locator('.birth-foal img')).toHaveAttribute('src', /^data:image\//, { timeout: 10000 });
  await stage.locator('.birth-actions button').click();
  await expect(stage).toHaveCount(0);
  await expect(page.locator('#reveal .card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('with reduced motion the birth shows its final frame at once', async ({ browser }) => {
  const save = savedBirth();
  test.skip(!save.foal, 'the engine produced no birth for this seed');
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await boot(page, save);
  await expect(page.locator('.birth-stage')).toHaveClass(/revealed/, { timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.birth-stage')).toHaveCount(0);
  await context.close();
});
