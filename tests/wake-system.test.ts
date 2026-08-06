import { describe, expect, it } from 'vitest';
import { appendWakeSample, rebaseWakeSamples, type WakeSample } from '../src/visual/WakeSystem';

describe('appendWakeSample', () => {
  it('skips tiny movement and caps the history at 96 entries', () => {
    const history: WakeSample[] = [];
    expect(appendWakeSample(history, { x: 0, z: 0, yaw: 0, speed: 2, time: 0 })).toBe(true);
    expect(appendWakeSample(history, { x: 0.02, z: 0, yaw: 0, speed: 2, time: 0.1 })).toBe(false);
    for (let index = 1; index <= 110; index += 1) {
      appendWakeSample(history, {
        x: index * 0.1,
        z: 0,
        yaw: 0,
        speed: 2,
        time: index * 0.1,
      });
    }
    expect(history).toHaveLength(96);
    expect(history.at(-1)?.x).toBe(11);
  });
});

describe('rebaseWakeSamples', () => {
  it('preserves sample ages when the deterministic render clock jumps', () => {
    const history: WakeSample[] = [
      { x: 1, z: 2, yaw: 0.5, speed: 4, time: 2 },
      { x: 2, z: 3, yaw: 0.5, speed: 4, time: 2.5 },
    ];

    rebaseWakeSamples(history, 15.5);

    expect(history.map((sample) => sample.time)).toEqual([17.5, 18]);
    expect(history.map(({ x, z }) => ({ x, z }))).toEqual([{ x: 1, z: 2 }, { x: 2, z: 3 }]);
  });
});
