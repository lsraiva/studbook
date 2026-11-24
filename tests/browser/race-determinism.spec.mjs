import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runRace, BOTS } from '../../assets/race/causal.js';

/** F4-05: the browser engine (V8 in Chromium here) reaches the same hash as the server (Node). */
test('a bot-ridden race hashes identically in the browser and on the server', async ({ page }) => {
  const source = readFileSync(new URL('../../assets/race/causal.js', import.meta.url), 'utf8');
  const avg = { speed: 6, stamina: 6, accel: 6, recovery: 6, temperament: 6, soundness: 6 };
  const runners = Array.from({ length: 10 }, (_, i) => ({ key: `h${i}`, traits: { ...avg, speed: (i * 7) % 13, stamina: (i * 5) % 13, accel: (i * 3) % 13 } }));
  const spec = { distance: 2200, going: 'soft', seed: '9f86d081884c7d659a2feaa0c55ad015', lanes: 12, bends: [[300, 900], [1400, 2000]], runners };
  const styles = ['frontRunner', 'closer', 'stalker'];
  const inputs = [{ tick: 900, key: 'h1', order: 'out' }, { tick: 1900, key: 'h4', order: 'kick' }];
  const server = runRace(spec, { inputs, policies: Object.fromEntries(runners.map((r, i) => [r.key, BOTS[styles[i % 3]]])) });

  await page.goto('/welcome.html');
  await page.addScriptTag({ type: 'module', content: `${source}\nwindow.__race = { runRace, BOTS };` });
  await page.waitForFunction(() => Boolean(window.__race));
  const browser = await page.evaluate(({ spec, inputs, styles }) => {
    const { runRace, BOTS } = window.__race;
    const policies = Object.fromEntries(spec.runners.map((r, i) => [r.key, BOTS[styles[i % 3]]]));
    const r = runRace(spec, { inputs, policies });
    return { hash: r.hash, order: r.placings.map((p) => p.key) };
  }, { spec, inputs, styles });

  expect(browser.hash).toBe(server.hash);
  expect(browser.order).toEqual(server.placings.map((p) => p.key));
});
