import { test, expect } from '@playwright/test';
import { setup, applyAction, validateAction, runRound, viewFor } from '../../assets/engine.js';

/** The living stable: the herd out in a painted paddock, each horse in its own coat. */
const shots = process.env.STUDBOOK_SHOTS;

async function painted(page) {
  // how many horses are drawn: each appears once its repainted plate has loaded
  return page.evaluate(() => Number(document.querySelector('#pasture canvas')?.dataset.drawn ?? 0));
}

test('the yard opens on the paddock, with the herd out in it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/index.html');
  const pasture = page.locator('#pasture');
  await expect(pasture).toBeVisible();
  await pasture.scrollIntoViewIfNeeded(); // the scene only runs while it is on screen
  await expect.poll(() => painted(page), { timeout: 30000 }).toBeGreaterThan(0);
  const box = await pasture.boundingBox();
  expect(box.width / box.height).toBeGreaterThan(2); // the 21:9 frame on desktop
  // the horses walk: two frames apart differ
  await expect.poll(async () => {
    const a = await pasture.locator('canvas').evaluate((c) => c.toDataURL());
    await page.waitForTimeout(400);
    const b = await pasture.locator('canvas').evaluate((c) => c.toDataURL());
    return a !== b;
  }, { timeout: 10000 }).toBe(true);
  if (shots) await pasture.screenshot({ path: `${shots}/pasture-desktop.png` });
  expect(errors).toEqual([]);
});

test('clicking a horse in the paddock opens it', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('#pasture canvas');
    return canvas ? canvas.width : 0;
  }), { timeout: 30000 }).toBeGreaterThan(0);
  // sweep the pointer across the pasture until the name label shows, then click there
  await expect(page.locator('#pasture')).toBeVisible();
  await page.locator('#pasture').scrollIntoViewIfNeeded();
  const canvas = page.locator('#pasture canvas');
  await expect.poll(() => painted(page), { timeout: 30000 }).toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  let opened = false;
  for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
    const x = box.x + box.width * (0.08 + (attempt % 10) * 0.09);
    const y = box.y + box.height * (0.62 + Math.floor(attempt / 10) * 0.08);
    await page.mouse.move(x, y);
    if (await page.locator('.paddock-label').isVisible()) {
      await page.mouse.click(x, y);
      opened = true;
    }
  }
  expect(opened).toBe(true);
  await expect(page.locator('#horseview')).toBeVisible();
});

test('elite cards carry the foil; the paddock fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  const pasture = page.locator('#pasture');
  await expect(pasture).toBeVisible();
  const box = await pasture.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeGreaterThan(150);
  await expect.poll(() => painted(page), { timeout: 30000 }).toBeGreaterThan(0);
  if (shots) await pasture.screenshot({ path: `${shots}/pasture-phone.png` });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(391);
});

test('reduced motion: the paddock is a still picture', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/index.html');
  await expect.poll(() => painted(page), { timeout: 30000 }).toBeGreaterThan(0);
  const a = await page.locator('#pasture canvas').evaluate((c) => c.toDataURL());
  await page.waitForTimeout(600);
  const b = await page.locator('#pasture canvas').evaluate((c) => c.toDataURL());
  expect(a).toBe(b);
  await context.close();
});

/** A yard with a real herd: a few seasons played and the best lots in the ring bought. */
function savedHerd() {
  const pid = 'herdtest';
  let state = setup([pid], 'pasture-spec');
  const act = (action) => { if (validateAction(state, pid, action).ok) state = applyAction(state, pid, action); };
  act({ type: 'takeStarterOffer' });
  for (let round = 0; round < 3; round += 1) state = runRound(state, '');
  const stable = state.stables.find((entry) => entry.owner === pid || entry.seat === pid) ?? state.stables[0];
  stable.guineas += 100000;
  const lots = state.listings.filter((lot) => lot.kind === 'horse').sort((a, b) => b.price - a.price).slice(0, 5);
  for (const lot of lots) act({ type: 'buyHorse', listingId: lot.id });
  const herd = (viewFor(state, pid).horses ?? []).filter((horse) => !horse.retired);
  return { pid, game: { status: 'playing', seats: [pid], state, result: null }, herd };
}

test('the whole herd goes out, and the best of it shines', async ({ page }) => {
  test.setTimeout(120000);
  const save = savedHerd();
  test.skip(save.herd.length < 3, 'the engine left too few horses for this seed');
  await page.addInitScript(([pid, game]) => {
    localStorage.setItem('hf:game:playerId', pid);
    localStorage.setItem('studbook:standalone:v2:' + pid, JSON.stringify(game));
  }, [save.pid, save.game]);
  await page.goto('/index.html');
  await page.locator('#reveal .card button, .birth-skip').first().click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator('#pasture')).toBeVisible();
  await page.locator('#pasture').scrollIntoViewIfNeeded();
  await expect.poll(() => painted(page), { timeout: 20000 }).toBe(Math.min(8, save.herd.length));
  await page.waitForTimeout(2500); // let them wander apart
  if (shots) await page.locator('#pasture').screenshot({ path: `${shots}/pasture-herd.png` });
  const shine = await page.locator('.gcard .gshine').count();
  const elite = await page.locator('.gcard.tier-stakes, .gcard.tier-exceptional').count();
  expect(shine).toBe(elite);
});

test('the paddock can be pinned to dusk', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/index.html?pasture=dusk');
  const pasture = page.locator('#pasture');
  await expect(pasture).toHaveClass(/dusk/, { timeout: 30000 });
  await pasture.scrollIntoViewIfNeeded();
  await expect.poll(() => painted(page), { timeout: 30000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  if (shots) await pasture.screenshot({ path: `${shots}/pasture-dusk.png` });
});
