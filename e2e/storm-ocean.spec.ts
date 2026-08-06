import { expect, test } from '@playwright/test';

test('transitions the shared sea state and preserves the Gerstner fallback', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setStormFactor(1));
  await expect(page.locator('#scene-state')).toHaveAttribute('data-storm-factor', '1.0000');
  await expect(page.locator('[data-weather-label]')).toContainText('暴风雨');
  await expect(page.locator('[data-weather-label]')).toContainText('降雨');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-water-mode', 'spectral');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-fft-size', '128');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-fft-cascades', '2');

  const sea = await page.locator('#scene-state').evaluate((element) => ({
    windSpeed: Number((element as HTMLElement).dataset.windSpeed),
    waveHeight: Number((element as HTMLElement).dataset.significantWaveHeight),
  }));
  expect(sea.windSpeed).toBeGreaterThanOrEqual(18);
  expect(sea.windSpeed).toBeLessThanOrEqual(24);
  expect(sea.waveHeight).toBeGreaterThanOrEqual(2.2);
  expect(sea.waveHeight).toBeLessThanOrEqual(3.2);

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.forceOceanFallback(true));
  await expect(page.locator('#scene-state')).toHaveAttribute('data-water-mode', 'gerstner');
  expect(errors).toEqual([]);
});
