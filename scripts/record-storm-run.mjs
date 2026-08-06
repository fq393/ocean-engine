import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const deliveryDirectory = join(projectRoot, 'output', 'visual-delivery');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'storm-ocean-video-'));
await mkdir(deliveryDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: temporaryDirectory, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const video = page.video();

try {
  await page.goto('http://127.0.0.1:4174/');
  await page.locator('html').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.documentElement.dataset.visualReady === 'true', undefined, {
    timeout: 35_000,
  });
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.lockQuality('high');
    window.__OCEAN_TEST_HOOKS__?.setWeather('clear');
    window.__OCEAN_TEST_HOOKS__?.setOverviewCamera(false);
  });
  await page.waitForTimeout(3_000);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2_000);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1_800);
  await page.keyboard.up('KeyD');

  await page.keyboard.press('KeyT');
  await page.waitForTimeout(3_000);
  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setWeather('storm'));
  await page.waitForTimeout(2_000);

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.triggerLightning(1234));
  await page.waitForFunction(() => (
    document.querySelector('#scene-state')?.dataset.lightningPhase === 'return-stroke'
  ), undefined, { timeout: 45_000 });
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(2_000);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(2_500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(5_500);
} finally {
  await page.close();
  const sourcePath = await video?.path();
  await context.close();
  await browser.close();
  if (!sourcePath) throw new Error('Playwright did not produce a browser video');
  await copyFile(sourcePath, join(deliveryDirectory, 'storm-ocean-run.webm'));
}
