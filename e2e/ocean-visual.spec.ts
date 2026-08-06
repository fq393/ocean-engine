import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.lockQuality('high'));
}

async function waitUntilFrozen(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-render-frozen', 'true');
  await page.locator('.hud').evaluate((element) => {
    (element as HTMLElement).style.visibility = 'hidden';
  });
  await page.waitForTimeout(250);
}

test('clear overview is visually stable', async ({ page }) => {
  test.setTimeout(55_000);
  await boot(page);
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setWeather('clear');
    window.__OCEAN_TEST_HOOKS__?.setTime(18);
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(true);
  });
  await waitUntilFrozen(page);
  await expect(page.locator('canvas')).toHaveScreenshot('storm-ocean-clear.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  });
});

test('established rain storm is visually stable', async ({ page }) => {
  test.setTimeout(55_000);
  await boot(page);
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setWeather('storm');
    window.__OCEAN_TEST_HOOKS__?.setTime(48);
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(true);
  });
  await waitUntilFrozen(page);
  await expect(page.locator('canvas')).toHaveScreenshot('storm-ocean-rain.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  });
});

test('return-stroke peak is visually stable', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setWeather('storm');
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(true);
    window.__OCEAN_TEST_HOOKS__?.triggerLightning(1234);
  });
  await expect(page.locator('#scene-state')).toHaveAttribute(
    'data-lightning-phase',
    'return-stroke',
    { timeout: 45_000 },
  );
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setTime(48);
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(true);
  });
  await waitUntilFrozen(page);
  await expect(page.locator('canvas')).toHaveScreenshot('storm-ocean-lightning.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  });
});

test('third-person driving and wake are visually stable', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page);
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setWeather('clear');
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(false);
    window.__OCEAN_TEST_HOOKS__?.setBoatState({ x: 31, z: 4, yaw: -2.35, surge: 8 });
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    const yaw = -2.35;
    let frame = 0;
    const advance = (): void => {
      const distance = frame * 0.06;
      window.__OCEAN_TEST_HOOKS__?.setBoatState({
        x: 31 + Math.sin(yaw) * distance,
        z: 4 + Math.cos(yaw) * distance,
        yaw,
        surge: 8,
      });
      frame += 1;
      if (frame >= 40) resolve();
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  }));
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.setTime(18);
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(false);
  });
  await waitUntilFrozen(page);
  await expect(page.locator('canvas')).toHaveScreenshot('storm-ocean-driving.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  });
});
