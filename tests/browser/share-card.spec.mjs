import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';

/** The shareable card: a horse as a picture, drawn in the browser and saved by the player. */
const shots = process.env.STUDBOOK_SHOTS;

test('the horse card saves a share card: a real PNG of the right size, named after the horse', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await page.locator('#gallery .gcard').first().click();
  const share = page.locator('#horseview [data-share-card]');
  await expect(share).toHaveText('compartilhar cartão');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), share.click()]);
  await expect(page.locator('#toasts .toast')).toContainText('cartão salvo como imagem'); // said at once, before the file is read here
  expect(download.suggestedFilename()).toMatch(/^studbook-[a-z0-9-]+\.png$/);
  const path = await download.path();
  const bytes = readFileSync(path);
  // PNG signature, then IHDR width and height: 1080 x 1350
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
  expect(statSync(path).size).toBeGreaterThan(200_000); // a painted scene, not a blank canvas
  if (shots) await download.saveAs(`${shots}/share-card.png`);
  expect(errors).toEqual([]);
});

test('the card carries the name, the line and the stable, and nothing is sent anywhere', async ({ page }) => {
  test.setTimeout(150000);
  const requests = [];
  await page.goto('/index.html');
  await page.locator('#gallery .gcard').first().waitFor();
  page.on('request', (r) => { if (r.method() !== 'GET') requests.push(`${r.method()} ${r.url()}`); });
  // draw one with known words and read it back: the text is on the canvas where it should be
  const result = await page.evaluate(async () => {
    const { drawShareCard } = await import('/assets/share-card.js?v=0.58.0');
    const canvas = await drawShareCard({
      name: 'Trovão do Sul', src: 'assets/art/plate-foal.webp', appearance: null, coat: 'Alazão · Estrela',
      eyebrow: 'Nasceu na temporada 4', line: 'Corbay × Belridge', facts: [['idade', 'recém-nascido'], ['sexo', 'macho'], ['linhagem', 'L4']],
      badge: 'PROMISSOR', stable: 'Haras Teste', host: 'exemplo.test',
    });
    const g = canvas.getContext('2d');
    const lit = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 420) n += 1; return n; };
    return { w: canvas.width, h: canvas.height, name: lit(120, 880, 840, 90), facts: lit(90, 1120, 900, 50), foot: lit(60, 1260, 500, 40), horse: lit(240, 300, 600, 420) };
  });
  expect(result).toMatchObject({ w: 1080, h: 1350 });
  expect(result.name).toBeGreaterThan(2000); // the name is written large
  expect(result.facts).toBeGreaterThan(300);
  expect(result.foot).toBeGreaterThan(100);
  expect(result.horse).toBeGreaterThan(800); // and the horse is there, lit against the dusk
  expect(requests).toEqual([]);
});
