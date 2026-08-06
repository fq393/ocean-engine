import { expect, test } from '@playwright/test';

test('boots and renders the deterministic ocean', async ({ page }) => {
  test.setTimeout(45_000);
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
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.hud')).toContainText('热带航道');
  await expect(page.locator('.hud')).toContainText('操作说明');
  await expect(page.locator('.hud')).toContainText('A 左转 · D 右转');
  await expect(page.locator('[data-weather-label]')).toContainText('当前天气：晴朗');
  await expect(page.locator('[data-scene-marker="island"]')).toHaveCount(1);
  await expect(page.locator('[data-scene-marker="yacht"]')).toHaveCount(1);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-yacht-source', 'tripo-pbr');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-island-source', 'blender-glb');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-island-lod', /lod[0-2]/);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-ocean-profile', /desktop|mobile/);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-water-layers', '2');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-ocean-detail-octaves', '3');
  await expect(page.locator('#scene-state')).toHaveAttribute('data-shore-field', /collision-glb|fallback/);
  const islandResponse = await page.request.get('/assets/models/island/asset-manifest.json');
  expect(islandResponse.status()).toBe(200);
  expect((await islandResponse.json()).schemaVersion).toBe(1);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-boat-speed', /^\d+\.\d{4}$/);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-boat-yaw', /^-?\d+\.\d{4}$/);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-camera-mode', 'chase');
  const diagnostics = JSON.parse(await page.locator('#diagnostics').getAttribute('data-renderer') ?? '{}');
  // Two 128² FFT cascades add 34 bounded offscreen compute passes.
  expect(diagnostics.calls).toBeLessThanOrEqual(105);
  expect(diagnostics.triangles).toBeLessThanOrEqual(500_000);
  const runtimeDiagnostics = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
  expect(runtimeDiagnostics?.renderer.calls).toBeLessThanOrEqual(105);
  expect(runtimeDiagnostics?.renderer.triangles).toBeLessThanOrEqual(500_000);
  expect(runtimeDiagnostics?.renderer.textures).toBeLessThanOrEqual(36);
  expect(runtimeDiagnostics?.renderer.pixelRatio).toBeGreaterThan(0);
  expect(runtimeDiagnostics?.quality.tier).toMatch(/high|medium|low/);
  expect(runtimeDiagnostics?.weather.mode).toBe('clear');
  expect(runtimeDiagnostics?.lightning.error).toBeNull();
  expect(runtimeDiagnostics?.boat.x).not.toBeNull();
  const hookNames = await page.evaluate(() => Object.keys(window.__OCEAN_TEST_HOOKS__ ?? {}).sort());
  expect(hookNames).toEqual([
    'forceOceanFallback',
    'lockQuality',
    'setBoatState',
    'setOverviewCamera',
    'setStormFactor',
    'setTime',
    'setWeather',
    'triggerLightning',
  ]);
  await expect(page.locator('link[rel~="icon"]')).toHaveAttribute('href', /^data:/);
  expect(errors).toEqual([]);
  expect(failedResources).toEqual([]);
});
