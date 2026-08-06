import { expect, test } from '@playwright/test';

test('renders seeded storm lightning, lit rain and an audio-ready thunder path', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  const failedResources: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.lockQuality('high'));
  await page.keyboard.press('KeyT');
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setWeather('storm');
    window.__OCEAN_TEST_HOOKS__?.triggerLightning(1234);
  });

  const state = page.locator('#scene-state');
  await expect(state).toHaveAttribute('data-weather-mode', 'storm');
  await expect(state).toHaveAttribute('data-lightning-phase', 'return-stroke', { timeout: 45_000 });
  expect(Number(await state.getAttribute('data-rain-count'))).toBeGreaterThan(0);
  expect(Number(await state.getAttribute('data-lightning-segments'))).toBeGreaterThan(0);
  expect(Number(await state.getAttribute('data-ocean-light-count'))).toBeGreaterThan(0);
  await expect(state).toHaveAttribute('data-audio-status', /ready|unavailable/);
  expect(errors).toEqual([]);
  expect(failedResources).toEqual([]);
});
