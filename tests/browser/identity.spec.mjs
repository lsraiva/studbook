import { test, expect } from '@playwright/test';
import { appearanceFor } from '../../assets/phenotype.js';

const savedHorse = async (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  const state = JSON.parse(localStorage.getItem(key)).state;
  const stable = state.stables.find((s) => s.player);
  return state.horses.find((h) => h.id === stable.horses[0]);
});

test('every horse shows a deterministic coat portrait in the yard and the same coat in 3D', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/index.html');
  const horse = await savedHorse(page);
  const look = appearanceFor(horse);
  const card = page.locator('#gallery .gcard').first();
  await expect(card.locator('.gportrait img')).toBeVisible();
  await expect(card.locator('.coat-strip')).toContainText(look.labelPt);
  await expect(card.locator('.coat-strip i')).toHaveAttribute('style', new RegExp(look.bodyColor));
  await expect(card.locator('.gseal')).toContainText('SB');
  await expect(card.locator('.gped')).toContainText(horse.lineage);

  await page.locator('#open3d').click();
  await page.waitForFunction(() => window.__horseProof?.loaded, null, { timeout: 60000 });
  const proof = await page.evaluate(() => window.__horseProof);
  expect(proof.appearance.seed).toBe(look.seed);
  expect(proof.appearance.label).toBe(look.label);
  await expect(page.locator('#coat-label')).toContainText(look.labelPt.split(' · ')[0]);

  await page.locator('a[href="index.html"]').click();
  await expect(page.locator('#gallery .coat-strip')).toContainText(look.labelPt);
});

test('the detail card and the row agree with the gallery identity', async ({ page }) => {
  await page.goto('/index.html');
  const horse = await savedHorse(page);
  const look = appearanceFor(horse);
  await page.locator('#gallery .gcard').first().click();
  await expect(page.locator('#horseview .hv-coat')).toContainText(look.labelPt);
  await expect(page.locator('#herd .coat-inline svg')).toHaveCount(1);
});

test('the 3D viewer is usable on a phone with touch-sized controls', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/horse-3d.html?horse=demo');
  await page.waitForFunction(() => window.__horseProof?.loaded, null, { timeout: 60000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.offsetParent !== null)
    .filter((b) => b.getBoundingClientRect().height < 44).length);
  expect(small).toBe(0);
  await page.locator('[data-clip="Gallop"]').click();
  expect(await page.evaluate(() => window.__horseProof.activeClip)).toBe('Gallop');
});
