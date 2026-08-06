import { expect, test } from '@playwright/test';

async function effectiveDpr(page: import('@playwright/test').Page): Promise<number> {
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 25_000 });
  return page.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return canvas.width / rect.width;
  });
}

test('desktop Retina rendering uses the 1.75 cap and multisampling', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.lockQuality('high'));
  expect(await effectiveDpr(page)).toBeCloseTo(1.75, 2);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-antialias-samples', '4');
  await context.close();
});

test('mobile Retina rendering stays at 1.25 without multisampling', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.lockQuality('low'));
  expect(await effectiveDpr(page)).toBeCloseTo(1.25, 2);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-antialias-samples', '0');
  await context.close();
});
