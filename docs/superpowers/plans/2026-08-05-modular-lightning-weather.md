# Modular Lightning Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the MIT `lightning-sim` physics core into the project as an independently tested module and integrate storm scheduling, HDR lightning, lit rain, storm atmosphere, reflections, and delayed thunder.

**Architecture:** The core physics remains renderer-free and in SI units. `LightningSimulation` advances it incrementally under a wall-clock budget; `LightningRenderer` maps channel coordinates into the compact island scene and publishes bounded light samples; `WeatherController` owns clear/storm transitions and feeds rain, sky, ocean, lights, and audio from one immutable frame state.

**Tech Stack:** TypeScript 7, Three.js 0.185.1, GLSL/WebGL2 instancing, Web Audio, Vitest 4, Playwright 1.62; upstream `aipulsedaily/lightning-sim` at its locally checked-out revision, MIT license.

## Global Constraints

- Port physics, constants, and thunder only; exclude upstream photo reconstruction, UI, controls, ground, sky, and post pipeline.
- Preserve upstream equations, constants, deterministic seeds, copyright, and MIT notice.
- Keep physics in metres/seconds/amperes and apply scale only in the renderer/adapter.
- Cap lightning physics to 2–3 ms per render frame; slow simulation time instead of blocking rendering.
- Use the existing scene composer and bloom; never install a second post pipeline.
- Use at most two real Three.js point lights and four shader light samples.
- Clear mode performs no leader-growth work.
- Audio failure must leave a functional silent storm.

---

### Task 1: Vendor and verify the renderer-free lightning core

**Files:**
- Create: `src/weather/lightning-core/{constants,atmosphere,rng,channel,field,leader,current,returnstroke,thunder,flash}.ts`
- Create: `src/weather/lightning-core/index.ts`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `tests/lightning-core.test.ts`
- Create: `tests/lightning-physics-regression.test.ts`

**Interfaces:**
- Produces the TypeScript exports `Flash`, `FlashType`, `Phase`, `Channel`, `makeTarget`, `makeRng`, `blackbodyRGB`, `buildThunderImpulseResponse`, and the measured constants.

- [ ] **Step 1: Record the exact upstream revision and license**

Run read-only checks in the sibling checkout:

```bash
git -C ../../../lightning-sim rev-parse HEAD
git -C ../../../lightning-sim status --short
```

Record the commit hash in `THIRD_PARTY_NOTICES.md` with:

```md
## lightning-sim

Source: https://github.com/aipulsedaily/lightning-sim
Imported revision: b723e6061fb95682e8bd682a205abacf6989c09d
Copyright (c) 2026 AI Pulse Daily
License: MIT

The renderer-free physics and thunder modules were mechanically ported to TypeScript. The original UI, photo pipeline, render pipeline, controls, and assets are not included.
```

Append the full upstream MIT license text from `../../../lightning-sim/LICENSE` without changing the copyright or permission text.

- [ ] **Step 2: Add RED regression tests before the port**

Create `tests/lightning-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Flash, FlashType, makeRng } from '../src/weather/lightning-core';
describe('ported lightning core', () => {
  it('keeps deterministic random sequences', () => {
    const a = makeRng(12345), b = makeRng(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('replays fixed-seed flash telemetry', () => {
    const flash = new Flash({ type: FlashType.NEGATIVE_CG, seed: 1234 });
    let guard = 0;
    while (!flash.done && guard++ < 400_000) flash.update(2e-4);
    const t = flash.telemetry();
    expect(guard).toBeLessThan(400_000);
    expect(t.strokeIndex).toBeGreaterThanOrEqual(1);
    expect(t.peakCurrent).toBeGreaterThan(10_000);
    expect(t.peakCurrent).toBeLessThan(80_000);
  });
});
```

Port the complete upstream measurement assertions from `../../../lightning-sim/tests/physics.test.mjs` into `tests/lightning-physics-regression.test.ts`, replacing Node `assert` with Vitest `expect` while keeping every numerical range and fixed seed.

Run `npx vitest run tests/lightning-core.test.ts`; expect missing-module failure.

- [ ] **Step 3: Mechanically port the ten core modules**

Use `apply_patch` to add each listed module from `../../../lightning-sim/src/core/`. For every file:

1. keep the upstream header/comments and add `// Ported from lightning-sim under MIT; see THIRD_PARTY_NOTICES.md`;
2. change `.js` import suffixes to extensionless project imports;
3. add explicit exported interfaces for constructor option objects and telemetry;
4. type arrays as their existing typed-array implementation (`Float32Array`, `Float64Array`, `Int32Array`, or `Uint8Array`);
5. do not change numeric literals, probability formulas, phase sequencing, or coordinate convention (`z` remains altitude in core code);
6. replace direct `performance.now()` access with an injected/default `now: () => number` only where the upstream deadline check requires it.

Create `src/weather/lightning-core/index.ts`:

```ts
export { Flash, FlashType, Phase, defaultRegionsFor, makeTarget } from './flash';
export { Channel, NODE } from './channel';
export { makeRng, fibonacciSphere, hashSeed } from './rng';
export { blackbodyRGB } from './current';
export { buildThunderImpulseResponse, delayPerKm, spectralPeak } from './thunder';
export type { FlashOptions, FlashTelemetry } from './flash';
```

- [ ] **Step 4: Compare the port against upstream behavior**

Run:

```bash
npm test -- --run tests/lightning-core.test.ts tests/lightning-physics-regression.test.ts
npm run build
```

Expected: all upstream measurement checks pass without widening ranges; TypeScript strict mode reports no implicit `any`.

- [ ] **Step 5: Commit the independently usable core**

```bash
git add src/weather/lightning-core tests/lightning-core.test.ts tests/lightning-physics-regression.test.ts THIRD_PARTY_NOTICES.md
git commit -m "feat: port modular lightning physics core"
```

---

### Task 2: Incremental flash adapter and coordinate mapping

**Files:**
- Create: `src/weather/LightningSimulation.ts`
- Create: `tests/lightning-simulation.test.ts`

**Interfaces:**
- Produces: `LightningSimulation.update(dt)`, `newFlash(seed?)`, `channel`, `telemetry`, `events`, and `mapSimulationPoint(point)`.

- [ ] **Step 1: Write RED budget/mapping tests**

```ts
import { describe, expect, it } from 'vitest';
import { mapLightningPoint, LightningSimulation } from '../src/weather/LightningSimulation';
it('maps z-up kilometres into y-up scene metres', () => {
  expect(mapLightningPoint({ x: 1000, y: -500, z: 5000 }, { scale: 0.03, originX: -45, originZ: -70 })).toEqual({ x: -15, y: 150, z: -85 });
});
it('honours a wall-clock deadline', () => {
  let now = 0; const sim = new LightningSimulation({ seed: 1234, now: () => (now += 0.5), budgetMs: 2 });
  sim.setStormEnabled(true); sim.update(1 / 30);
  expect(sim.lastPhysicsMs).toBeLessThanOrEqual(3);
});
```

- [ ] **Step 2: Implement exact adapter contracts**

```ts
// core z is altitude; Three.js y is up
export interface LightningSceneMap { readonly scale: number; readonly originX: number; readonly originZ: number }
export function mapLightningPoint(p: {x:number;y:number;z:number}, m: LightningSceneMap): {x:number;y:number;z:number} {
  return { x: m.originX + p.x * m.scale, y: p.z * m.scale, z: m.originZ + p.y * m.scale };
}
```

`LightningSimulation` defaults to `{ scale: 0.03, originX: -45, originZ: -70 }`, a 2.5 ms budget, negative cloud-to-ground flashes, and seeded random intervals of 5–14 seconds only while `stormEnabled` is true. Pass the computed deadline into `Flash.update`; preserve unfinished budget for the next frame. Emit `first-stroke` once when `strokeIndex` first reaches one and `complete` once on done.

- [ ] **Step 3: Verify and commit**

```bash
npx vitest run tests/lightning-simulation.test.ts tests/lightning-core.test.ts
git add src/weather/LightningSimulation.ts tests/lightning-simulation.test.ts
git commit -m "feat: add budgeted lightning simulation adapter"
```

---

### Task 3: HDR channel renderer and bounded scene lights

**Files:**
- Create: `src/weather/LightningRenderer.ts`
- Create: `src/weather/LightningShaders.ts`
- Create: `tests/lightning-renderer.test.ts`
- Modify: `src/render/OceanWater.ts`
- Modify: `src/render/OceanSurfaceShaders.ts`

**Interfaces:**
- Produces: `LightningRenderer.root`, `update(channel | undefined, dt)`, `frame: LightningFrameState`, `segmentCount`, `dispose()`; `OceanWater.setLightning(lights, flashExposure)`.

- [ ] **Step 1: Write RED renderer helper tests**

Test `selectLightningLights(candidates, 4, 7.8)` sorts by `luminosity * segmentLength`, maps coordinates, merges samples closer than 7.8 scene metres (260 simulation metres at scale 0.03), and returns at most four shader lights.

- [ ] **Step 2: Adapt the upstream capsule shaders**

Copy the upstream `src/render/bolt.js` vertex/fragment shader logic into `LightningShaders.ts`, retaining:

- view-aligned capsule geometry;
- minimum screen width of 2.2 pixels;
- white Gaussian core and inverse-square colored halo;
- additive blending, depth test, no depth write.

Apply `LightningSceneMap` when filling instance attributes. Keep three deterministic render subsegments per physical segment, `maxSegments=90_000`, and persistence time constant `0.11` seconds.

- [ ] **Step 3: Implement renderer ownership and light limits**

`LightningRenderer` owns one `THREE.InstancedBufferGeometry`, one material, and exactly two reusable `THREE.PointLight`s. `lights` publishes no more than four immutable `LightningLightSample`s. The two strongest samples position/color the real lights; unused lights set intensity to zero. `dispose()` releases geometry/material and removes lights from `root` once.

- [ ] **Step 4: Add physically fragmented water reflection uniforms**

Add fixed arrays `uLightningPosition[4]`, `uLightningColor[4]`, `uLightningPower[4]`, `uLightningCount`, and `uFlashExposure` to both ocean materials. In the fragment shader, for each active sample compute reflected specular against the instantaneous surface normal, inverse-square attenuation with a safe floor, and a broad low-energy facing term. Multiply by existing domain-warped breakup so the reflection is a fragmented streak, never a vertical painted stripe.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/lightning-renderer.test.ts tests/ocean-water.test.ts
npm run build
git add src/weather/LightningRenderer.ts src/weather/LightningShaders.ts src/render/OceanWater.ts src/render/OceanSurfaceShaders.ts tests
git commit -m "feat: add HDR lightning and ocean reflections"
```

---

### Task 4: Instanced rain and storm sky

**Files:**
- Create: `src/weather/RainSystem.ts`
- Create: `src/weather/StormSkySystem.ts`
- Create: `tests/rain-system.test.ts`
- Create: `tests/storm-sky.test.ts`
- Modify: `src/visual/SkySystem.ts`

**Interfaces:**
- `RainSystem.setIntensity(value)`, `update(camera, time, frame: WeatherFrame)`, `setQuality(count)`, `dispose()`.
- `StormSkySystem.update(frame, time)`, `root`, `dispose()`.

- [ ] **Step 1: Add RED pure tests**

Test `rainCountForTier('high'|'medium'|'low')` equals `22_000`, `12_000`, and `6_000`; clamp intensity to `[0,1]`; test storm sky interpolation produces clear top `#3b91cf`, storm top `#101d2c`, and monotonically increasing fog.

- [ ] **Step 2: Adapt camera-local rain**

Port the upstream instanced streak approach with these project values:

```ts
const RAIN_COUNTS = { high: 22_000, medium: 12_000, low: 6_000 } as const;
const EXTENT = new THREE.Vector3(180, 90, 180);
```

Recycle drops in a box centered above the chase camera, align streaks to the weather wind, taper alpha, use additive blending/depth test/no depth write, and illuminate from the four lightning shader samples plus ambient weather light. One instanced mesh must cover all rain.

- [ ] **Step 3: Build a project-owned storm atmosphere**

Refactor `createSky()` to return a `SkySystem` class exposing existing clear-sky uniforms. `StormSkySystem` controls those uniforms plus two layered, camera-facing procedural cloud banks. Use five-octave noise on high, four on medium, three on low; avoid a standalone offscreen post pipeline. Interpolate scene `FogExp2.density`, hemisphere intensity, sun intensity/color, and environment intensity from the shared weather frame.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/rain-system.test.ts tests/storm-sky.test.ts
npm run build
git add src/weather/RainSystem.ts src/weather/StormSkySystem.ts src/visual/SkySystem.ts tests
git commit -m "feat: add lit rain and storm atmosphere"
```

---

### Task 5: Weather controller and delayed thunder

**Files:**
- Create: `src/weather/WeatherController.ts`
- Create: `src/weather/ThunderSystem.ts`
- Create: `tests/weather-controller.test.ts`
- Create: `tests/thunder-system.test.ts`

**Interfaces:**
- `WeatherController.toggle()`, `setTarget(value)`, `stormFactor`, `update(dt, time, lightning: LightningFrameState): WeatherFrame`.
- `ThunderSystem.unlock()`, `schedule(channel, listenerInScene, map)`, `status`, `dispose()`.

- [ ] **Step 1: Write RED transition/audio math tests**

Assert storm reaches approximately one after 18 seconds, clear decay takes approximately 24 seconds, rain starts after `stormFactor > 0.18`, lightning scheduling enables after `0.7`, and scene-to-simulation listener mapping yields `delay ≈ distance / 343` within the upstream altitude-dependent sound model tolerance.

- [ ] **Step 2: Implement the single weather frame owner**

`WeatherController` owns target and `SeaStateController`. It builds `WeatherFrame` with eased values:

```ts
rain = smoothstep(0.18, 0.82, stormFactor);
clouds = smoothstep(0.02, 0.75, stormFactor);
fogDensity = mix(0.0016, 0.0062, smoothstep(0.2, 1, stormFactor));
ambientExposure = mix(1, 0.48, stormFactor);
```

It copies lightning samples/exposure from `LightningRenderer` and enables physics only above `0.7`. `T` handling is registered once in `OceanDemo`, not inside the weather controller.

Expose `get stormFactor(): number` for scheduling decisions; `update` consumes only the renderer's immutable `LightningFrameState`, never the renderer object.

- [ ] **Step 3: Adapt upstream thunder synthesis**

Port `src/audio/thunderAudio.js` into `ThunderSystem.ts`, importing the already ported core impulse-response functions. Preserve user-gesture unlock, 2.4 kHz low-pass, 50–100 Hz body emphasis, convolution, inverse-distance gain, and physically computed first-arrival delay. Convert the chase camera from scene coordinates back through the lightning map before building the response.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/weather-controller.test.ts tests/thunder-system.test.ts tests/lightning-physics-regression.test.ts
npm run build
git add src/weather/WeatherController.ts src/weather/ThunderSystem.ts tests
git commit -m "feat: add unified weather and physical thunder"
```

---

### Task 6: Compose weather and verify seeded lightning

**Files:**
- Modify: `src/app/OceanDemo.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/vite-env.d.ts`
- Modify: `src/visual/RenderPipeline.ts`
- Create: `e2e/weather-lightning.spec.ts`

**Interfaces:**
- Test hooks add `setWeather('clear'|'storm')`, `triggerLightning(seed)`, and `unlockAudio()`.
- Diagnostics add weather mode/factor, rain count, lightning segments/physics ms, and audio status.

- [ ] **Step 1: Add RED browser test**

Create `e2e/weather-lightning.spec.ts` that sets deterministic storm state, triggers seed `1234`, waits for `data-lightning-phase="return-stroke"`, then asserts rain is nonzero, lightning segments are nonzero, ocean light count is nonzero, audio status is `ready|unavailable`, and console/resource errors are empty.

- [ ] **Step 2: Wire the frame in dependency order**

In `OceanDemo.#render`:

```ts
this.#lightningSimulation.setStormEnabled(this.#weather.stormFactor > 0.7);
this.#lightningSimulation.update(dt, performance.now());
this.#lightningRenderer.update(this.#lightningSimulation.channel, dt);
const frame = this.#weather.update(dt, time, this.#lightningRenderer.frame);
this.#stormSky.update(frame, time);
this.#rain.update(this.#camera, time, frame.lightning);
this.#water.setSeaState(frame.sea);
this.#water.setLightning(frame.lightning, frame.flashExposure);
```

Schedule thunder exactly once on `first-stroke`. Add both reusable point lights to the main scene. Pressing `T` toggles weather and unlocks audio. Update the HUD weather line from the frame state.

- [ ] **Step 3: Keep bloom stable under lightning**

Expose `RenderPipeline.setBloom(strength, threshold, radius)` and interpolate from clear `{0.1,1.1,0.16}` to storm `{0.24,0.82,0.22}`; do not add another composer. Clamp lightning exposure so island standard materials remain below full white outside the channel core.

- [ ] **Step 4: Verify and commit**

```bash
npm test
npm run build
npx playwright test e2e/weather-lightning.spec.ts e2e/ocean-smoke.spec.ts
git add src e2e/weather-lightning.spec.ts
git commit -m "feat: integrate modular lightning weather"
```
