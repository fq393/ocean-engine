import { describe, expect, it } from 'vitest';
import { WeatherController } from '../src/weather/WeatherController';

const NO_LIGHTNING = Object.freeze({ lights: Object.freeze([]), flashExposure: 0 });

describe('WeatherController', () => {
  it('takes about 18 seconds to build and 24 seconds to clear a storm', () => {
    const weather = new WeatherController();
    weather.setTarget(1);
    let frame = weather.update(0, 0, NO_LIGHTNING);
    for (let index = 0; index < 18 * 30; index += 1) {
      frame = weather.update(1 / 30, index / 30, NO_LIGHTNING);
    }
    expect(frame.stormFactor).toBeCloseTo(1, 4);
    expect(weather.lightningEnabled).toBe(true);

    weather.setTarget(0);
    for (let index = 0; index < 24 * 30; index += 1) {
      frame = weather.update(1 / 30, 18 + index / 30, NO_LIGHTNING);
    }
    expect(frame.stormFactor).toBeCloseTo(0, 4);
  });

  it('starts rain after 0.18 and enables lightning only after 0.7', () => {
    const weather = new WeatherController();
    weather.setTarget(1);
    let frame = weather.update(1 / 30, 0, NO_LIGHTNING);
    while (frame.stormFactor <= 0.19) frame = weather.update(1 / 30, 0, NO_LIGHTNING);
    expect(frame.rain).toBeGreaterThan(0);
    expect(weather.lightningEnabled).toBe(false);
    while (frame.stormFactor <= 0.71) frame = weather.update(1 / 30, 0, NO_LIGHTNING);
    expect(weather.lightningEnabled).toBe(true);
  });
});
