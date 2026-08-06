import { expect, test, type Page } from '@playwright/test';

interface FrameSample {
  readonly averageFps: number;
  readonly p95GapMs: number;
  readonly maxGapMs: number;
  readonly frames: number;
}

async function sampleFrames(page: Page, durationMs = 12_000): Promise<FrameSample> {
  const gaps = await page.evaluate((duration) => new Promise<number[]>((resolve) => {
    const values: number[] = [];
    let started = 0;
    let previous = 0;
    const frame = (timestamp: number): void => {
      if (started === 0) {
        started = timestamp;
        previous = timestamp;
      } else {
        values.push(timestamp - previous);
        previous = timestamp;
      }
      if (timestamp - started >= duration) resolve(values);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), durationMs);
  const sorted = [...gaps].sort((left, right) => left - right);
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  return {
    averageFps: gaps.length * 1_000 / Math.max(total, 1),
    p95GapMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    maxGapMs: sorted.at(-1) ?? 0,
    frames: gaps.length,
  };
}

test('records 720p clear, storm and active-flash frame pacing on the target Mac', async ({ page }, testInfo) => {
  test.setTimeout(110_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 35_000 });
  await page.evaluate(() => {
    window.__OCEAN_TEST_HOOKS__?.lockQuality(undefined);
    window.__OCEAN_TEST_HOOKS__?.setWeather('clear');
  });
  const clear = await sampleFrames(page);

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.setWeather('storm'));
  const storm = await sampleFrames(page);

  await page.evaluate(() => window.__OCEAN_TEST_HOOKS__?.triggerLightning(1234));
  const activeFlash = await sampleFrames(page);
  const diagnostics = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
  const report = {
    viewport: { width: 1280, height: 720 },
    clear,
    storm,
    activeFlash,
    quality: diagnostics?.quality,
  };
  console.log(`FRAME_PACING ${JSON.stringify(report)}`);
  await testInfo.attach('mac-mini-frame-pacing.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });

  for (const sample of [clear, storm, activeFlash]) {
    expect(sample.maxGapMs).toBeLessThan(250);
  }
  if (!process.env.CI) {
    expect(Math.min(clear.averageFps, storm.averageFps, activeFlash.averageFps))
      .toBeGreaterThanOrEqual(45);
  }
});
