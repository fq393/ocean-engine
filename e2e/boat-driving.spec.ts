import { expect, test } from '@playwright/test';

test('WASD drives the yacht and the chase camera follows', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.lockQuality('high'));
  const before = Number(await page.locator('#scene-state').getAttribute('data-boat-speed'));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  const after = Number(await page.locator('#scene-state').getAttribute('data-boat-speed'));
  expect(after).toBeGreaterThan(before);
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setBoatState({
    x: 31,
    z: 4,
    yaw: -2.35,
    surge: 8,
    yawRate: 0,
  }));
  await page.waitForTimeout(120);
  const yawBeforeA = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA');
  const yawAfterA = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
  expect(yawAfterA - yawBeforeA).toBeGreaterThan(0.005);

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setBoatState({
    x: 31,
    z: 4,
    yaw: -2.35,
    surge: 8,
    yawRate: 0,
  }));
  await page.waitForTimeout(120);
  const yawBeforeDReset = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  const yawAfterD = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
  expect(yawAfterD - yawBeforeDReset).toBeLessThan(-0.005);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-camera-mode', 'chase');
  await expect(page.locator('.hud')).toContainText('A 左转 · D 右转');
});
