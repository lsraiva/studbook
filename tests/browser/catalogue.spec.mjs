import { test, expect } from '@playwright/test';

/** Catalogue design pass: the visual contracts that regressed silently before. */
test('race-card weight meters have a visible fill', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="goings"]').click();
  const fill = page.locator('.going .w .bar i').first();
  await expect.poll(async () => fill.evaluate((i) => i.getBoundingClientRect().height)).toBeGreaterThan(3);
});

test('the paddock is a runner table with form bars, in Portuguese', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.tab[data-screen="racing"]').click();
  const rows = page.locator('#paddock .runner');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(3);
  await expect(page.locator('#paddock .field-head h3')).toHaveText('O campo');
  await expect(page.locator('#paddock .count')).toContainText('declarados');
  const width = await rows.first().locator('.runner-form i').evaluate((i) => getComputedStyle(i, '::before').width);
  expect(parseFloat(width)).toBeGreaterThan(0);
  await expect(page.locator('#paddock')).not.toContainText(/the field|unraced|\bpush\b|\bhold\b/);
});

test('the masthead shows the wordmark on every screen', async ({ page }) => {
  await page.goto('/index.html');
  for (const screen of ['yard', 'racing', 'breeding']) {
    await page.locator(`.tab[data-screen="${screen}"]`).click();
    await expect(page.locator('header.bar .brand')).toBeVisible();
  }
});

test('yard portraits are repainted in each horse\'s own coat', async ({ page }) => {
  await page.goto('/index.html');
  const img = page.locator('#gallery .gportrait img').first();
  await expect(img).toHaveAttribute('data-coat', 'painted', { timeout: 15000 });
  expect(await img.getAttribute('src')).toMatch(/^data:image\//);
  expect(await img.evaluate((node) => node.style.filter)).toBe('');
});
