import { test, expect } from '@playwright/test';
import { setup, applyAction, validateAction, runRound, viewFor } from '../../assets/engine.js';

/** The first session: the fun comes first (enter, ride), and the foal is named in its scene. */
const shots = process.env.STUDBOOK_SHOTS;
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});

test('a new yard is led to enter its horse, then invited to ride the live race', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season, { timeout: 20000 }).toBe(1);
  const step = page.locator('#nextstep');
  await expect(step.locator('.nextstep-text')).toContainText('inscreva seu cavalo');
  await expect(page.locator('#first-ride-go')).toHaveCount(0); // nothing to ride yet
  await page.locator('#nextstep-go').click();
  await expect.poll(async () => (await saved(page)).stables.find((s) => s.player).entries.length).toBe(1);
  // with the horse in the field the ride is offered, and the guide moves on to the breeding
  const ride = page.locator('#first-ride-go');
  await expect(ride).toBeVisible();
  await expect(ride).toHaveText('Montar a corrida ao vivo');
  await expect(step.locator('.nextstep-text')).toContainText('Agora a criação');
  if (shots) await step.screenshot({ path: `${shots}/first-ride.png` });
  await ride.click();
  await expect(page.locator('.race-stage .rs-ride')).toBeVisible({ timeout: 20000 });
  await page.locator('.rs-controls button', { hasText: 'Fechar' }).click();
  // the invitation has been taken up: it does not nag again
  await expect(page.locator('#first-ride-go')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** A save in which the player's mare has just foaled, built with the engine itself. */
function savedBirth() {
  const pid = 'nametest';
  let state = setup([pid], 'birth-spec');
  const act = (action) => { if (validateAction(state, pid, action).ok) state = applyAction(state, pid, action); };
  for (let round = 0; round < 14; round += 1) {
    act({ type: 'takeStarterOffer' });
    const view = viewFor(state, pid);
    const straw = view.straws?.[0];
    if (straw) act({ type: 'selectStraw', strawId: straw.id });
    for (const horse of view.horses ?? []) if (horse.sex === 'F' && straw) act({ type: 'breed', mareId: horse.id, strawId: straw.id, care: 'plain' });
    state = runRound(state, '');
    if ((state.lastFoals ?? []).some((row) => row.event === 'born' && row.stableId === 'st1')) break;
  }
  const born = (state.lastFoals ?? []).find((row) => row.event === 'born');
  return { pid, game: { status: 'playing', seats: [pid], state, result: null }, foal: born };
}

test('the foal is named at the height of the birth scene', async ({ page }) => {
  test.setTimeout(90000);
  const save = savedBirth();
  test.skip(!save.foal, 'the engine produced no birth for this seed');
  await page.addInitScript(([pid, game]) => {
    localStorage.setItem('hf:game:playerId', pid);
    localStorage.setItem('studbook:standalone:v2:' + pid, JSON.stringify(game));
  }, [save.pid, save.game]);
  await page.goto('/index.html');
  const stage = page.locator('.birth-stage');
  await expect(stage).toHaveClass(/revealed/, { timeout: 30000 });
  const naming = stage.locator('.birth-naming');
  await expect(naming.locator('input')).toHaveValue(save.foal.name);
  // too short is refused in words, and nothing is sent
  await naming.locator('input').fill('X');
  await naming.locator('button').click();
  await expect(naming.locator('.birth-named')).toContainText('2 a 24');
  await naming.locator('input').fill('Trovão 7');
  if (shots) await page.screenshot({ path: `${shots}/birth-naming.png` });
  await naming.locator('input').press('Enter');
  await expect(stage.locator('.birth-name')).toHaveText('Trovão 7');
  await expect(naming.locator('.birth-named')).toHaveText('Batizado!');
  await expect.poll(async () => (await saved(page)).horses.find((h) => h.id === save.foal.id)?.name).toBe('Trovão 7');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'yard'); // digits in the name did not switch screens
});
