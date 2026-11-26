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

test('race sound has its own switch and never breaks the race', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await openRace(page);
  const sound = page.locator('.rs-controls button', { hasText: /^Som:/ });
  await expect(sound).toHaveText('Som: ligado');
  await sound.click();
  await expect(sound).toHaveText('Som: desligado');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await page.locator('.rs-controls button', { hasText: 'Ir para a chegada' }).click();
  await expect(page.locator('.rs-result')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the next race card opens the live race', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="goings"]').click();
  const watch = page.locator('.going.next [data-live-race]');
  await expect(watch).toHaveCount(1);
  await watch.click();
  await expect(page.locator('.race-stage canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.race-stage')).toHaveCount(0);
});

test('screens still switch with view transitions available', async ({ page }) => {
  await page.goto('/index.html');
  for (const screen of ['racing', 'goings', 'yard']) {
    await page.locator(`.tab[data-screen="${screen}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', screen);
    await expect(page.locator(`.tab[data-screen="${screen}"]`)).toHaveAttribute('aria-current', 'true');
  }
});

test('rapid tab clicks never surface an error', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  for (const screen of ['racing', 'goings', 'breeding', 'yard', 'racing', 'studs']) await page.locator(`.tab[data-screen="${screen}"]`).click({ delay: 0 });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'studs');
  await expect(page.locator('#status')).not.toHaveClass(/\bbad\b/);
  expect(errors).toEqual([]);
});

test('the broadcast view paints the course and every runner in its own coat and silks', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await openRace(page);
  await page.waitForFunction(() => window.__studbookRace?.scene?.ready, null, { timeout: 30000 });
  const info = await page.evaluate(() => {
    const { scene, race } = window.__studbookRace;
    scene.pause(); scene.t = 12; scene.draw();
    const keys = new Set(race.runners.map((r) => r.spriteKey));
    const frames = [...scene.sprites.values()].every((f) => f.length === 8 && f[0].width > 100);
    // the canvas is a painting, not a flat fill: sample colours across it
    const ctx = scene.canvas.getContext('2d');
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) { const d = ctx.getImageData(Math.floor(scene.canvas.width * (i % 8) / 8) + 5, Math.floor(scene.canvas.height * Math.floor(i / 8) / 5) + 5, 1, 1).data; seen.add(`${d[0] >> 4},${d[1] >> 4},${d[2] >> 4}`); }
    return { side: scene.stage.classList.contains('side-view'), keys: keys.size, sprites: scene.sprites.size, frames, colours: seen.size, runners: race.runners.length };
  });
  expect(info.side).toBe(true);
  expect(info.sprites).toBe(info.keys);
  expect(info.frames).toBe(true);
  expect(info.colours).toBeGreaterThan(12);
  await page.locator('.rs-controls button', { hasText: 'Ir para a chegada' }).click();
  const winner = await page.evaluate(() => { const { race } = window.__studbookRace; return race.runners.find((r) => r.key === race.placings[0].key).name; });
  await expect(page.locator('.rs-result h3')).toContainText(winner);
  expect(errors).toEqual([]);
});
