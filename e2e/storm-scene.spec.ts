import { expect, test } from '@playwright/test';

test('keeps clear, storm, collision, driving and ocean fallback in one live scene', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.lockQuality('high');
    window.__OCEAN_TEST_HOOKS__?.setWeather('clear');
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(false);
  });
  const state = page.locator('#scene-state');
  await expect(state).toHaveAttribute('data-weather-mode', 'clear');
  await expect(state).toHaveAttribute('data-rain-count', '0');
  expect((await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boat.x))).not.toBeNull();

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setWeather('storm'));
  await expect(state).toHaveAttribute('data-storm-factor', '1.0000');
  expect(Number(await state.getAttribute('data-rain-count'))).toBeGreaterThan(0);
  await expect(state).toHaveAttribute('data-fft-size', '128');
  await expect(state).toHaveAttribute('data-fft-cascades', '2');

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setBoatState({
    x: 0,
    z: -28,
    surge: 0,
    sway: 0,
  }));
  await expect(state).toHaveAttribute('data-boat-collided', 'true');
  const resolved = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boat);
  expect(Math.hypot(resolved?.x ?? 0, (resolved?.z ?? -28) + 28)).toBeGreaterThanOrEqual(19);

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.forceOceanFallback(true));
  await expect(state).toHaveAttribute('data-water-mode', 'gerstner');
  const speedBefore = Number(await state.getAttribute('data-boat-speed'));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  expect(Number(await state.getAttribute('data-boat-speed'))).toBeGreaterThan(speedBefore);
  await expect(state).toHaveAttribute('data-weather-mode', 'storm');
  await expect(state).toHaveAttribute('data-camera-mode', 'chase');
  expect(errors).toEqual([]);
});

test('does not grow GPU resources through ten weather and flash cycles', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.lockQuality('high'));
  const samples: Array<{ geometries: number; textures: number }> = [];
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.evaluate((seed) => {
      window.__OCEAN_TEST_HOOKS__?.setWeather('storm');
      window.__OCEAN_TEST_HOOKS__?.triggerLightning(seed);
    }, 1_234 + cycle);
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setWeather('clear'));
    const renderer = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.renderer);
    samples.push({
      geometries: Number(renderer?.geometries ?? 0),
      textures: Number(renderer?.textures ?? 0),
    });
  }
  const geometryValues = samples.map((sample) => sample.geometries);
  const textureValues = samples.map((sample) => sample.textures);
  expect(Math.max(...geometryValues) - Math.min(...geometryValues)).toBeLessThanOrEqual(2);
  expect(Math.max(...textureValues) - Math.min(...textureValues)).toBeLessThanOrEqual(4);
  expect(samples.every((sample, index) => index === 0
    || sample.geometries > samples[index - 1]!.geometries)).toBe(false);
});

test('keeps rendering when browser audio is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.keyboard.press('KeyT');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-audio-status', 'unavailable');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
});
