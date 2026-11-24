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
  await expect(card.locator('.coat-strip')).toContainText(look.label);
  await expect(card.locator('.coat-strip i')).toHaveAttribute('style', new RegExp(look.bodyColor));

  await page.locator('#open3d').click();
  await page.waitForFunction(() => window.__horseProof?.loaded, null, { timeout: 60000 });
  const proof = await page.evaluate(() => window.__horseProof);
  expect(proof.appearance.seed).toBe(look.seed);
  expect(proof.appearance.label).toBe(look.label);
  await expect(page.locator('#coat-label')).toContainText(look.labelPt.split(' · ')[0]);

  await page.locator('a[href="index.html"]').click();
  await expect(page.locator('#gallery .coat-strip')).toContainText(look.label);
});

test('the detail card and the row agree with the gallery identity', async ({ page }) => {
  await page.goto('/index.html');
  const horse = await savedHorse(page);
  const look = appearanceFor(horse);
  await page.locator('#gallery .gcard').first().click();
  await expect(page.locator('#horseview .hv-coat')).toContainText(look.label);
  await expect(page.locator('#herd .coat-inline svg')).toHaveCount(1);
});
