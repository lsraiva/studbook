import { test, expect } from '@playwright/test';

const screens = ['yard', 'racing', 'goings', 'breeding', 'studs', 'horses', 'shop', 'ranking', 'ledger'];
const saved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('studbook:standalone'));
  return key ? JSON.parse(localStorage.getItem(key)).state : null;
});
async function boot(page) {
  await page.goto('/index.html');
  await expect.poll(async () => (await saved(page))?.season).toBe(1);
}

test('one physical click advances one meeting, including season rollover', async ({ page }) => {
  const errors=[]; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await page.locator('[data-screen="racing"]').click();
  for(let i=0;i<4;i++) {
    const before=await saved(page);
    await page.locator('#advance').click();
    const nextMeeting=before.meeting===4?1:before.meeting+1;
    const nextSeason=before.season+(before.meeting===4?1:0);
    await expect.poll(async () => {const state=await saved(page);return [state.season,state.meeting];}).toEqual([nextSeason,nextMeeting]);
  }
  expect(errors).toEqual([]);
});

for(const width of [360,390,430,1440]) {
  test(`all nine screens fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({width,height:900});
    await boot(page);
    for(const screen of screens) {
      await page.locator(`.tab[data-screen="${screen}"]`).click();
      await expect(page.locator('body')).toHaveAttribute('data-screen',screen);
      await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth),{message:`page overflow on ${screen} at ${width}px`}).toBeLessThanOrEqual(1);
    }
  });
}

test('portrait touch device does not auto-expand its layout viewport', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();
  await boot(page);
  expect(await page.evaluate(()=>({inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}))).toEqual({inner:390,client:390,scroll:390});
  await page.locator('[data-screen="racing"]').click();
  await page.locator('#advance').tap();
  await expect.poll(async ()=>(await saved(page)).meeting).toBe(2);
  await context.close();
});
