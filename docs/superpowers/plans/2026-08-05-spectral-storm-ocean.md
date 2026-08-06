# Spectral Storm Ocean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clear-to-storm directional spectrum, two-cascade WebGL2 FFT displacement, phase-compatible CPU wave queries, physical whitecaps, and a Blender-derived shore field while retaining Ocean V2 as fallback.

**Architecture:** `SeaStateController` creates immutable clear/storm states and a continuous transition. `SpectralOcean` owns GPU spectrum/FFT resources; `WaveField` evaluates a matching low-frequency component subset for the yacht without GPU readback; `OceanWater` consumes displacement, slope, foam, shore, and lightning-ready uniforms through a stable surface source interface.

**Tech Stack:** TypeScript 7, Three.js 0.185.1, GLSL/WebGL2 floating render targets, JONSWAP/Tessendorf spectrum, Vitest 4, Playwright 1.62.

## Global Constraints

- Desktop spectral tier: two 128×128 cascades; reduced tier: one 128×128 cascade; lowest spectral tier: one 64×64 cascade.
- Capability failure must preserve the accepted Ocean V2 Gerstner renderer.
- Clear target: 9 m/s wind, 0.6–1.0 m significant wave height, 4–6 s peak period.
- Storm target: 18–24 m/s wind, 2.2–3.2 m significant wave height, 7–10 s peak period.
- Keep spectrum phase stable while interpolating energy.
- Whitecaps must require physical steepness/compression; noise may only break their outline.
- Keep visible low-frequency waves phase-compatible with yacht buoyancy without GPU readback.
- Never restore regular far-ocean comb patterns.

---

### Task 1: Sea-state and weather frame contracts

**Files:**
- Create: `src/weather/types.ts`
- Create: `src/ocean/SeaStateController.ts`
- Create: `tests/sea-state-controller.test.ts`

**Interfaces:**
- Produces: `SeaState`, `WeatherFrame`, `CLEAR_SEA`, `STORM_SEA`, and `SeaStateController.update(dt, target)`.

- [ ] **Step 1: Write failing transition tests**

```ts
// tests/sea-state-controller.test.ts
import { describe, expect, it } from 'vitest';
import { SeaStateController } from '../src/ocean/SeaStateController';

describe('SeaStateController', () => {
  it('moves continuously from clear to storm and remains within physical bounds', () => {
    const sea = new SeaStateController();
    const first = sea.update(1, 1);
    const second = sea.update(1, 1);
    expect(second.stormFactor).toBeGreaterThan(first.stormFactor);
    expect(second.windSpeed).toBeGreaterThanOrEqual(9);
    expect(second.windSpeed).toBeLessThanOrEqual(24);
    expect(second.significantWaveHeight).toBeLessThanOrEqual(3.2);
  });
  it('does not jump when the target reverses', () => {
    const sea = new SeaStateController();
    const before = sea.update(8, 1);
    const after = sea.update(1 / 60, 0);
    expect(Math.abs(after.stormFactor - before.stormFactor)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run tests/sea-state-controller.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add immutable shared frame types**

Create `src/weather/types.ts`:

```ts
export interface LightningLightSample {
  readonly x: number; readonly y: number; readonly z: number;
  readonly r: number; readonly g: number; readonly b: number;
  readonly power: number;
}
export interface LightningFrameState {
  readonly lights: readonly LightningLightSample[];
  readonly flashExposure: number;
}
export interface SeaState {
  readonly stormFactor: number;
  readonly windSpeed: number;
  readonly windDirectionRad: number;
  readonly significantWaveHeight: number;
  readonly peakPeriod: number;
  readonly directionalSpread: number;
  readonly choppiness: number;
}
export interface WeatherFrame {
  readonly mode: 'clear' | 'storm'; readonly stormFactor: number;
  readonly windX: number; readonly windZ: number;
  readonly rain: number; readonly clouds: number; readonly fogDensity: number;
  readonly ambientExposure: number; readonly sea: SeaState;
  readonly lightning: readonly LightningLightSample[]; readonly flashExposure: number;
}
```

- [ ] **Step 4: Implement the reversible 18/24-second sea transition**

Create `src/ocean/SeaStateController.ts`:

```ts
import type { SeaState } from '../weather/types';
export const CLEAR_SEA = Object.freeze({ stormFactor: 0, windSpeed: 9, windDirectionRad: Math.PI * 0.2, significantWaveHeight: 0.8, peakPeriod: 5, directionalSpread: 0.7, choppiness: 0.28 });
export const STORM_SEA = Object.freeze({ stormFactor: 1, windSpeed: 22, windDirectionRad: Math.PI * 0.32, significantWaveHeight: 2.8, peakPeriod: 8.5, directionalSpread: 0.42, choppiness: 0.78 });
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);
export class SeaStateController {
  #factor = 0;
  update(dtRaw: number, targetRaw: number): SeaState {
    const dt = Math.min(Math.max(dtRaw, 0), 1 / 30), target = Math.min(1, Math.max(0, targetRaw));
    const duration = target > this.#factor ? 18 : 24;
    this.#factor += Math.sign(target - this.#factor) * Math.min(Math.abs(target - this.#factor), dt / duration);
    const t = smooth(this.#factor);
    return Object.freeze({ stormFactor: this.#factor, windSpeed: mix(9, 22, t), windDirectionRad: mix(Math.PI * 0.2, Math.PI * 0.32, t), significantWaveHeight: mix(0.8, 2.8, t), peakPeriod: mix(5, 8.5, t), directionalSpread: mix(0.7, 0.42, t), choppiness: mix(0.28, 0.78, t) });
  }
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/sea-state-controller.test.ts
git add src/weather/types.ts src/ocean/SeaStateController.ts tests/sea-state-controller.test.ts
git commit -m "feat: add continuous storm sea state"
```

---

### Task 2: Shared low-frequency WaveField

**Files:**
- Create: `src/ocean/WaveField.ts`
- Create: `tests/wave-field.test.ts`
- Modify: `src/ocean/spectrum.ts`

**Interfaces:**
- Consumes: a spectrum seed, clear/storm `OceanConfig`, storm factor, and sample coordinates.
- Produces: `WaveField.sample(x, z, time, stormFactor): WaveSample` and `WaveField.components(stormFactor)`.

- [ ] **Step 1: Write failing phase and energy tests**

```ts
import { describe, expect, it } from 'vitest';
import { WaveField } from '../src/ocean/WaveField';
it('keeps phase continuous while storm energy rises', () => {
  const field = WaveField.default();
  const clear = field.sample(12, -7, 3, 0);
  const nearClear = field.sample(12, -7, 3, 0.001);
  expect(Math.abs(clear.height - nearClear.height)).toBeLessThan(0.02);
  const clearEnergy = field.components(0).reduce((n, w) => n + w.amplitude * w.amplitude, 0);
  const stormEnergy = field.components(1).reduce((n, w) => n + w.amplitude * w.amplitude, 0);
  expect(stormEnergy).toBeGreaterThan(clearEnergy * 2);
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/wave-field.test.ts`; expect missing-module failure.

- [ ] **Step 3: Add paired-spectrum generation**

In `src/ocean/spectrum.ts`, add `createPairedWaveComponents(clearConfig, stormConfig)`. Generate both arrays with the same `seed`, logarithmic wave-number bins, and random phase/direction offsets; only amplitude, peak energy, wind direction, and steepness differ. Return frozen arrays of equal length and matching `phase`/`waveNumber` by index.

Use this exact public result:

```ts
export interface PairedWaveComponents {
  readonly clear: readonly WaveComponent[];
  readonly storm: readonly WaveComponent[];
}
```

- [ ] **Step 4: Implement blended queries**

Create `src/ocean/WaveField.ts`:

```ts
import { DEFAULT_OCEAN_CONFIG } from './config';
import { createPairedWaveComponents } from './spectrum';
import { WaveQuery } from './wave-query';
import type { WaveComponent, WaveSample } from './types';
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export class WaveField {
  readonly #clear: readonly WaveComponent[]; readonly #storm: readonly WaveComponent[];
  readonly #clearQuery: WaveQuery; readonly #stormQuery: WaveQuery;
  constructor(clear: readonly WaveComponent[], storm: readonly WaveComponent[]) { this.#clear = clear; this.#storm = storm; this.#clearQuery = new WaveQuery(clear); this.#stormQuery = new WaveQuery(storm); }
  static default(): WaveField {
    const pair = createPairedWaveComponents(DEFAULT_OCEAN_CONFIG, { ...DEFAULT_OCEAN_CONFIG, windSpeed: 22, windDirectionRad: Math.PI * 0.32, fetchMeters: 130_000 });
    return new WaveField(pair.clear, pair.storm);
  }
  components(tRaw: number): readonly WaveComponent[] {
    const t = Math.min(1, Math.max(0, tRaw));
    return this.#clear.map((a, i) => { const b = this.#storm[i]!; const dx = mix(a.directionX, b.directionX, t), dz = mix(a.directionZ, b.directionZ, t), length = Math.hypot(dx, dz); return Object.freeze({ ...a, amplitude: mix(a.amplitude, b.amplitude, t), directionX: dx / length, directionZ: dz / length, steepness: mix(a.steepness, b.steepness, t) }); });
  }
  sample(x: number, z: number, time: number, tRaw: number): WaveSample {
    const t = Math.min(1, Math.max(0, tRaw)), a = this.#clearQuery.sample(x, z, time), b = this.#stormQuery.sample(x, z, time);
    const nx = mix(a.normal.x, b.normal.x, t), ny = mix(a.normal.y, b.normal.y, t), nz = mix(a.normal.z, b.normal.z, t), nl = Math.hypot(nx, ny, nz);
    return { height: mix(a.height, b.height, t), normal: { x: nx / nl, y: ny / nl, z: nz / nl }, velocity: { x: mix(a.velocity.x, b.velocity.x, t), y: mix(a.velocity.y, b.velocity.y, t), z: mix(a.velocity.z, b.velocity.z, t) } };
  }
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/spectrum.test.ts tests/wave-field.test.ts tests/boat-dynamics.test.ts
git add src/ocean/spectrum.ts src/ocean/WaveField.ts tests/wave-field.test.ts
git commit -m "feat: add phase-compatible storm wave field"
```

---

### Task 3: Spectral quality and WebGL2 FFT pipeline

**Files:**
- Create: `src/ocean/SpectralShaders.ts`
- Create: `src/ocean/SpectralOcean.ts`
- Modify: `src/platform/quality.ts`
- Create: `tests/spectral-ocean.test.ts`

**Interfaces:**
- Produces: `SpectralTier`, `selectSpectralTier(width)`, `fftStageCount(size)`, and `SpectralOcean.update(time, sea)` with displacement/slope textures.

- [ ] **Step 1: Write pure RED tests**

```ts
import { describe, expect, it } from 'vitest';
import { fftStageCount, selectSpectralTier } from '../src/ocean/SpectralOcean';
it('uses exact FFT tiers and radix-two stages', () => {
  expect(selectSpectralTier(1920)).toEqual({ size: 128, cascades: 2 });
  expect(selectSpectralTier(900)).toEqual({ size: 128, cascades: 1 });
  expect(selectSpectralTier(390)).toEqual({ size: 64, cascades: 1 });
  expect(fftStageCount(128)).toBe(7);
  expect(() => fftStageCount(96)).toThrow(/power of two/);
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/spectral-ocean.test.ts`; expect missing-module failure.

- [ ] **Step 3: Add exact shader passes**

Create `src/ocean/SpectralShaders.ts` exporting:

```ts
export const FULLSCREEN_VERTEX = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
export const EVOLVE_SPECTRUM_FRAGMENT = `precision highp float; varying vec2 vUv; uniform sampler2D uH0; uniform float uTime; uniform float uGravity; uniform float uPatchSize; uniform float uResolution; void main(){ vec2 h0=texture2D(uH0,vUv).rg; vec2 grid=(vUv-0.5)*uResolution; vec2 k=grid*6.28318530718/uPatchSize; float omega=sqrt(uGravity*length(k)); float c=cos(omega*uTime),s=sin(omega*uTime); gl_FragColor=vec4(h0.x*c-h0.y*s,h0.x*s+h0.y*c,0.0,1.0); }`;
export const STOCKHAM_FRAGMENT = `precision highp float; varying vec2 vUv; uniform sampler2D uInput; uniform float uStage; uniform float uSize; uniform float uHorizontal; void main(){ float span=exp2(uStage); vec2 axis=mix(vec2(0.0,1.0/uSize),vec2(1.0/uSize,0.0),uHorizontal); float index=mix(gl_FragCoord.y,gl_FragCoord.x,uHorizontal)-0.5; float group=floor(index/(span*2.0)); float offset=mod(index,span); float a=group*span*2.0+offset; float b=a+span; vec2 base=vUv-axis*(index-a); vec2 A=texture2D(uInput,base).rg; vec2 B=texture2D(uInput,base+axis*(b-a)).rg; float angle=-3.14159265359*offset/span; vec2 W=vec2(cos(angle),sin(angle)); vec2 BW=vec2(B.x*W.x-B.y*W.y,B.x*W.y+B.y*W.x); vec2 outv=mod(index,span*2.0)<span?A+BW:A-BW; gl_FragColor=vec4(outv,0.0,1.0); }`;
```

Add a final assembly shader in the same file that writes horizontal displacement/height to one RGBA16F target and slopes/Jacobian compression to a second target.

- [ ] **Step 4: Implement owned render targets and fallible initialization**

`SpectralOcean` must:

- validate `EXT_color_buffer_float` and vertex texture support;
- create two ping-pong `THREE.WebGLRenderTarget`s per active cascade using `HalfFloatType`;
- seed `DataTexture` H0 data from `WaveField`'s shared seed;
- run evolve, seven horizontal, seven vertical, and assembly passes per 128 tier;
- expose `{ displacement, slope, size, cascades, available, error? }`;
- restore the renderer's previous render target after each update;
- make `dispose()` idempotent.

Use these pure exports exactly:

```ts
export interface SpectralTier { readonly size: 64 | 128; readonly cascades: 1 | 2 }
export const selectSpectralTier = (width: number): SpectralTier => width >= 1440 ? { size: 128, cascades: 2 } : width >= 700 ? { size: 128, cascades: 1 } : { size: 64, cascades: 1 };
export function fftStageCount(size: number): number { const stages = Math.log2(size); if (!Number.isInteger(stages)) throw new RangeError('FFT size must be a power of two'); return stages; }
```

- [ ] **Step 5: Run unit/build checks and commit**

```bash
npx vitest run tests/spectral-ocean.test.ts
npm run build
git add src/ocean/SpectralShaders.ts src/ocean/SpectralOcean.ts src/platform/quality.ts tests/spectral-ocean.test.ts
git commit -m "feat: add WebGL2 spectral ocean pipeline"
```

---

### Task 4: Shore field and physically seeded foam

**Files:**
- Create: `src/ocean/ShoreField.ts`
- Create: `tests/shore-field.test.ts`
- Modify: `src/visual/IslandAssetSystem.ts`
- Modify: `src/render/OceanSurfaceShaders.ts`
- Modify: `src/render/OceanWater.ts`
- Modify: `tests/ocean-water.test.ts`

**Interfaces:**
- Produces: `ShoreField.sample(x, z)`, a `THREE.DataTexture`, and ocean uniforms `uShoreField`, `uShoreBounds`, `uStormFactor`, `uDisplacement`, `uSlope`.

- [ ] **Step 1: Write signed-distance RED tests**

Use a square polygon and assert `sample(0,0) < 0`, `sample(4,0) > 0`, deterministic 128×128 texture length, and fallback ellipse values around `(0,-28)`.

- [ ] **Step 2: Implement polygon distance and fallback**

Create `ShoreField.ts` with a ray-crossing inside test, minimum point-to-segment distance, `fromPolygon(points, bounds, 128)`, and `fallbackIsland()` using 128 points around the existing organic ellipse. Store signed distance normalized to 32 metres in `Float32Array` and create a red-channel `THREE.DataTexture`.

The public shape is:

```ts
export interface ShoreBounds { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number }
export class ShoreField { readonly texture: THREE.DataTexture; sample(x: number, z: number): number; dispose(): void }
```

- [ ] **Step 3: Project the Blender collision mesh**

In `IslandAssetSystem`, load `manifest.island.collision.url` with the existing `GLTFLoader`; collect every mesh vertex transformed by `matrixWorld`, convert into island-root world XZ, compute a monotonic-chain convex hull, and expose `readonly shoreFieldReady: Promise<ShoreField>`. On failure resolve `ShoreField.fallbackIsland()` and record the diagnostic reason.

- [ ] **Step 4: Replace painted foam with compression-driven foam**

Update the ocean fragment shader so:

```glsl
float compression = max(0.0, 1.0 - texture2D(uSlope, spectralUv).a);
float steepFoam = smoothstep(mix(0.82, 0.58, uStormFactor), 0.96, compression);
float shoreDistance = texture2D(uShoreField, shoreUv).r * 32.0;
float shoreBreak = smoothstep(4.2, 0.2, abs(shoreDistance)) * smoothstep(0.25, 0.8, vCrest);
float breakup = smoothstep(0.35, 0.74, continuousNoise(vWorldPosition.xz * 0.41 + uTime * 0.08));
float foam = clamp((steepFoam + shoreBreak) * breakup, 0.0, 0.9);
```

`OceanWater.setSurfaceSource()` binds spectral displacement/slope when available and binds 1×1 neutral textures otherwise. `setSeaState()` updates storm/choppiness uniforms. Keep domain-warped distance LOD and do not reintroduce `hash21(floor(...))`.

Define the shared source contract in `OceanWater.ts` and sample it in the vertex shader:

```ts
export interface OceanSurfaceSource { readonly displacement: THREE.Texture; readonly slope: THREE.Texture; readonly size: 64|128; readonly cascades: 1|2 }
```

```glsl
vec2 spectralUv = fract(baseWorld.xz / uSpectralPatchSize + 0.5);
vec3 spectralDisplacement = texture2D(uDisplacement, spectralUv).xyz;
displaced += vec3(spectralDisplacement.x, spectralDisplacement.y, spectralDisplacement.z) * uSpectralWeight;
vec2 spectralSlope = texture2D(uSlope, spectralUv).rg;
dX.y += spectralSlope.x * uSpectralWeight;
dZ.y += spectralSlope.y * uSpectralWeight;
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/shore-field.test.ts tests/ocean-water.test.ts tests/island-asset-system.test.ts
npm run build
git add src/ocean/ShoreField.ts src/visual/IslandAssetSystem.ts src/render/OceanSurfaceShaders.ts src/render/OceanWater.ts tests
git commit -m "feat: add shallow-water shore and foam fields"
```

---

### Task 5: Integrate spectral/fallback ocean and capture visual states

**Files:**
- Modify: `src/app/OceanDemo.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `e2e/ocean-smoke.spec.ts`
- Modify: `e2e/ocean-visual.spec.ts`
- Create: `e2e/storm-ocean.spec.ts`

**Interfaces:**
- Test hooks add `setStormFactor(value)` and `forceOceanFallback(enabled)`.
- Diagnostics add `water.mode`, `water.fftSize`, `water.cascades`, and `water.stormFactor`.

- [ ] **Step 1: Add RED browser contracts**

Assert clear mode reports `spectral`, desktop reports `128/2`, forced failure reports `gerstner`, a `stormFactor=1` capture reports wind/height values in the approved ranges, and no console/resource errors occur.

- [ ] **Step 2: Compose the systems**

Construct `SeaStateController`, `WaveField`, `SpectralOcean`, and `shoreFieldReady`. Each frame:

```ts
const sea = this.#seaState.update(dt, this.#stormTarget);
const spectral = this.#spectral.update(time, sea);
this.#water.setSeaState(sea);
this.#water.setSurfaceSource(spectral.available ? spectral : undefined);
this.#water.update(time, this.#camera.position.x, this.#camera.position.z);
```

Pass a WaveField adapter using the same `sea.stormFactor` into `BoatDynamics`; dispose spectral and shore resources.

- [ ] **Step 3: Verify automated and visual requirements**

```bash
npm test
npm run build
npx playwright test e2e/ocean-smoke.spec.ts e2e/storm-ocean.spec.ts e2e/ocean-visual.spec.ts --update-snapshots
```

Visually inspect clear and storm snapshots at original size. Reject regular distant rows, uniform foam coverage, aliased displacement, shoreline rings, or boat/wave phase mismatch.

- [ ] **Step 4: Commit the storm-ocean milestone**

```bash
git add src tests e2e
git commit -m "feat: integrate spectral storm ocean"
```
