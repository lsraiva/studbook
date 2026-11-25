import { test, expect } from '@playwright/test';

test('all game tabs and the primary actions render in Portuguese', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#gallery .gcard').first()).toBeVisible();
  const tabs = await page.locator('.tab').allTextContents();
  expect(tabs.join(' | ')).toContain('Estábulo');
  expect(tabs.join(' | ')).toContain('Corridas');
  expect(tabs.join(' | ')).toContain('Mercado de garanhões');
  expect(tabs.join(' | ')).toContain('Carteira');
  expect(await page.locator('body').innerText()).not.toContain('Watch the replay');
  await page.locator('.tab[data-screen="racing"]').click();
  await expect(page.locator('#advance')).toHaveText(/disputar reunião/i);
});

test('the mode banner and account gate stay Portuguese', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#mode-banner')).toContainText('Demonstração offline');
});
