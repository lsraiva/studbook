import { test, expect } from '@playwright/test';
import { setup, runRound, viewFor, applyAction, validateAction } from '../../assets/engine.js';

/** The stable album (coat x face marking) and the achievements, on the Ranking screen. */
const shots = process.env.STUDBOOK_SHOTS;

function breederGame(seed, seasons) {
  const pid = 'albumtest';
  let state = setup([pid], seed);
  const act = (action) => { const v = validateAction(state, pid, action); if (v.ok) state = applyAction(state, pid, action); return v.ok; };
  state.stables.find((s) => s.player).guineas += 20000;
  act({ type: 'takeStarterOffer' });
  for (let round = 0; round < seasons * 4; round += 1) {
    for (const mare of viewFor(state, pid).horses.filter((h) => h.sex === 'F' && !h.retired && !h.inFoal)) {
      let straw = viewFor(state, pid).straws[0];
      if (!straw) {
        const lot = viewFor(state, pid).listings.filter((l) => l.kind !== 'horse' && !l.mine).sort((a, b) => a.price - b.price)[0];
        if (lot && act({ type: 'buyStraw', listingId: lot.id })) straw = viewFor(state, pid).straws[0];
      }
      if (!straw) break;
      act({ type: 'selectStraw', strawId: straw.id });
      act({ type: 'breed', mareId: mare.id, strawId: straw.id, care: 'plain' });
    }
    state = runRound(state, '');
  }
  // the birth scene and result card are other tests' business: this yard has nothing new to announce
  state.lastFoal = null;
  state.lastFoals = [];
  return { pid, state, game: { status: 'playing', seats: [pid], state, result: null } };
}

async function boot(page, save) {
  await page.addInitScript(([pid, game]) => {
    localStorage.setItem('hf:game:playerId', pid);
    localStorage.setItem('studbook:standalone:v2:' + pid, JSON.stringify(game));
    localStorage.setItem('studbook:rode', '1');
  }, [save.pid, save.game]);
  await page.goto('/index.html');
  // a birth may be staged and a result card shown: close both
  await expect(page.locator('#gallery .gcard').first()).toBeVisible({ timeout: 20000 });
}

test('a breeding yard fills its album and its achievements', async ({ page }) => {
  test.setTimeout(120000);
  const save = breederGame('album-spec', 9);
  const stable = viewFor(save.state, save.pid).stable;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await boot(page, save);
  await page.locator('.tab[data-screen="ranking"]').click();
  const album = page.locator('#album');
  await expect(album.locator('.album-slot')).toHaveCount(32);
  const filled = await album.locator('.album-slot.have').count();
  expect(filled).toBeGreaterThan(8);
  await expect(page.locator('#album-count')).toHaveText(String(filled));
  await expect(page.locator('h2', { hasText: 'Álbum do haras' })).toContainText(`${filled} de 32`);
  // a filled place is painted in that horse's coat, and marked when it was bred here
  await expect(album.locator('.album-slot.have img').first()).toHaveAttribute('src', /^data:image\//, { timeout: 20000 });
  expect(await album.locator('.album-slot.bred').count()).toBeGreaterThan(0);
  // eight coat rows, labelled in Portuguese
  await expect(album.locator('.album-coat')).toHaveText(['Castanho', 'Alazão', 'Baio', 'Tordilho', 'Preto', 'Rosilho', 'Palomino', 'Isabelino']);
  // achievements: this yard has bred many foals over generations
  const feats = page.locator('#feats .feat');
  await expect(feats).toHaveCount(11);
  await expect(page.locator('#feats .feat', { hasText: 'primeiro potro' })).toHaveClass(/done/);
  await expect(page.locator('#feats .feat', { hasText: 'haras de tradição' })).toHaveClass(stable.bredCount >= 15 ? /done/ : /feat/);
  await expect(page.locator('#feats .feat', { hasText: 'segunda geração' })).toHaveClass(/done/);
  await expect(page.locator('#feats')).not.toContainText(/breed \d+ foals|first win|the whole album/);
  if (shots) {
    await page.waitForTimeout(2500);
    await page.locator('section.panel', { has: page.locator('#album') }).screenshot({ path: `${shots}/album.png` });
    await page.locator('section.panel', { has: page.locator('#feats') }).screenshot({ path: `${shots}/feats.png` });
  }
  expect(errors).toEqual([]);
});

test('a new yard starts with one place filled, and the album fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="ranking"]').click();
  await expect(page.locator('#album .album-slot.have')).toHaveCount(1);
  await expect(page.locator('#album-count')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
