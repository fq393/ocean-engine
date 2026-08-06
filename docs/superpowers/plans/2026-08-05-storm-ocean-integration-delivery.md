# Storm Ocean Integration and Visual Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the approved boat, spectral ocean, and lightning-weather milestones into one resilient scene, add adaptive quality and diagnostics, and deliver verified clear/storm/lightning/driving visuals plus an actual-run video.

**Architecture:** `OceanDemo` remains the composition root and consumes independent system contracts in a fixed update order. `AdaptiveQualityController` observes rolling frame rate with hysteresis and changes only optional visual tiers; deterministic hooks freeze weather, flash, boat, and time states for reproducible browser tests and captures.

**Tech Stack:** TypeScript 7, Three.js 0.185.1, WebGL2, Vite 8, Vitest 4, Playwright 1.62, ffmpeg for final video packaging.

## Global Constraints

- Target average frame rate is at least approximately 45 fps at a 1920×1080 CSS viewport on the target Mac mini.
- Step down after rolling average remains below 42 fps for three seconds; step up only after remaining above 55 fps for ten seconds.
- Degrade in this order: rain count, cloud sampling, short-wave FFT tier, secondary branches, wake displacement, pixel-ratio cap.
- Never disable low-frequency waves, boat input/physics/collision, the primary lightning channel, or the fallback ocean.
- Keep resource counts bounded through at least ten weather toggles and ten flashes.
- Deliver four screenshots: clear, established storm, return-stroke peak, third-person driving with wake.
- Deliver one actual browser-run MP4; do not synthesize frames from still images.

---

### Task 1: Adaptive-quality state machine

**Files:**
- Create: `src/platform/AdaptiveQualityController.ts`
- Modify: `src/platform/quality.ts`
- Create: `tests/adaptive-quality.test.ts`

**Interfaces:**
- Produces: `RuntimeQualityTier`, `RUNTIME_QUALITY`, and `AdaptiveQualityController.update(dt, fps): RuntimeQualityTier`.

- [ ] **Step 1: Write failing hysteresis tests**

```ts
import { describe, expect, it } from 'vitest';
import { AdaptiveQualityController } from '../src/platform/AdaptiveQualityController';
it('steps down after three slow seconds and waits ten fast seconds to recover', () => {
  const q = new AdaptiveQualityController('high');
  for (let i = 0; i < 179; i += 1) q.update(1 / 60, 40);
  expect(q.tier.name).toBe('high');
  q.update(1 / 60, 40); expect(q.tier.name).toBe('medium');
  for (let i = 0; i < 599; i += 1) q.update(1 / 60, 60);
  expect(q.tier.name).toBe('medium');
  q.update(1 / 60, 60); expect(q.tier.name).toBe('high');
});
```

- [ ] **Step 2: Define exact tiers**

Add to `quality.ts`:

```ts
export interface RuntimeQualityTier {
  readonly name: 'high'|'medium'|'low'; readonly rainCount: number;
  readonly cloudSteps: number; readonly fftSize: 64|128; readonly fftCascades: 1|2;
  readonly secondaryLightning: boolean; readonly wakeDisplacement: boolean; readonly pixelRatioCap: number;
}
export const RUNTIME_QUALITY = Object.freeze({
  high: Object.freeze({ name:'high', rainCount:22_000, cloudSteps:5, fftSize:128, fftCascades:2, secondaryLightning:true, wakeDisplacement:true, pixelRatioCap:1.75 }),
  medium: Object.freeze({ name:'medium', rainCount:12_000, cloudSteps:4, fftSize:128, fftCascades:1, secondaryLightning:true, wakeDisplacement:false, pixelRatioCap:1.5 }),
  low: Object.freeze({ name:'low', rainCount:6_000, cloudSteps:3, fftSize:64, fftCascades:1, secondaryLightning:false, wakeDisplacement:false, pixelRatioCap:1.25 }),
} satisfies Record<'high'|'medium'|'low', RuntimeQualityTier>);
```

- [ ] **Step 3: Implement hysteresis**

Use accumulators `slowSeconds` and `fastSeconds`; reset both in the neutral 42–55 fps band. Change at most one tier per threshold crossing and reset accumulators after change. Expose an explicit `lock(tier | undefined)` for deterministic tests.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/adaptive-quality.test.ts
git add src/platform/quality.ts src/platform/AdaptiveQualityController.ts tests/adaptive-quality.test.ts
git commit -m "feat: add adaptive runtime quality"
```

---

### Task 2: Unified diagnostics, test hooks, and error isolation

**Files:**
- Create: `src/app/SceneDiagnostics.ts`
- Create: `tests/scene-diagnostics.test.ts`
- Modify: `src/app/OceanDemo.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `e2e/ocean-smoke.spec.ts`

**Interfaces:**
- Produces a serializable `SceneDiagnosticsSnapshot` and complete deterministic `__OCEAN_TEST_HOOKS__`.

- [ ] **Step 1: Add RED serialization tests**

Test that non-finite numeric values become `null`, Error objects become messages, and the snapshot includes renderer, water, weather, lightning, boat, audio, and quality sections without Three.js objects or typed arrays.

- [ ] **Step 2: Add exact diagnostics schema**

```ts
export interface SceneDiagnosticsSnapshot {
  renderer: { calls:number; triangles:number; geometries:number; textures:number; pixelRatio:number; fps:number };
  water: { mode:'spectral'|'gerstner'; fftSize:0|64|128; cascades:0|1|2; stormFactor:number };
  weather: { mode:'clear'|'storm'; rainCount:number; fogDensity:number };
  lightning: { phase:string; segments:number; physicsMs:number; lightCount:number; error:string|null };
  boat: { speed:number; yaw:number; x:number; z:number; shallow:boolean; collided:boolean };
  audio: { status:'locked'|'ready'|'unavailable'|'silent-error' };
  quality: { tier:'high'|'medium'|'low'; locked:boolean };
}
```

- [ ] **Step 3: Isolate optional-system failures**

In `OceanDemo`, wrap only optional subsystem update boundaries (`spectral`, `lightning`, `rain`, `audio`) in narrow `try/catch`. On first failure, record the message and switch that subsystem to its documented fallback. Do not wrap the whole render loop and do not swallow boat/input/collision errors.

- [ ] **Step 4: Complete deterministic hooks**

Update `vite-env.d.ts` and `OceanDemo` so hooks are exactly:

```ts
interface OceanTestHooks {
  setTime(seconds: number): void;
  setWeather(mode: 'clear'|'storm'): void;
  setStormFactor(value: number): void;
  triggerLightning(seed: number): void;
  setBoatState(state: Partial<BoatState>): void;
  setOverviewCamera(enabled: boolean): void;
  forceOceanFallback(enabled: boolean): void;
  lockQuality(tier: 'high'|'medium'|'low'|undefined): void;
}
```

- [ ] **Step 5: Verify smoke/resource contracts and commit**

```bash
npm test
npm run build
npx playwright test e2e/ocean-smoke.spec.ts
git add src/app src/vite-env.d.ts e2e/ocean-smoke.spec.ts tests/scene-diagnostics.test.ts
git commit -m "test: add storm scene diagnostics and fallbacks"
```

---

### Task 3: Full interaction and failure-path browser tests

**Files:**
- Create: `e2e/storm-scene.spec.ts`
- Modify: `e2e/boat-driving.spec.ts`
- Modify: `e2e/weather-lightning.spec.ts`
- Modify: `e2e/ocean-dpr.spec.ts`

**Interfaces:**
- Consumes the final hook/diagnostics schema from Task 2.

- [ ] **Step 1: Add clear/storm/drive integration assertions**

Create tests that:

1. set clear state and verify spectral mode, zero rain, finite boat state;
2. set storm state and verify sea factor `1`, rain above zero, two FFT cascades on high tier;
3. hold `W` then `D` and verify speed and yaw change while camera mode stays chase;
4. place the yacht inside the shore fallback and verify it resolves outside and records `collided=true`;
5. trigger seed `1234` and observe segments, light count, ocean reflection state, and return-stroke phase;
6. force FFT fallback and verify driving/weather continue in `gerstner` mode;
7. simulate audio unavailable and verify the render loop remains ready.

- [ ] **Step 2: Add resource stability test**

Loop ten times through clear → storm → seeded flash → clear using hooks. Capture renderer memory and custom resource counters before and after. Require geometries/textures/render targets/audio nodes to return within a fixed delta of the first settled cycle; allow no monotonically increasing sequence.

- [ ] **Step 3: Run browser suite and repair only evidenced failures**

```bash
npx playwright test e2e/ocean-smoke.spec.ts e2e/ocean-dpr.spec.ts e2e/boat-driving.spec.ts e2e/weather-lightning.spec.ts e2e/storm-scene.spec.ts
```

Expected: all tests PASS with no console or failed-resource entries. If a failure occurs, use the systematic-debugging skill before changing implementation.

- [ ] **Step 4: Commit integration coverage**

```bash
git add e2e
git commit -m "test: cover interactive storm scene"
```

---

### Task 4: Deterministic visual baselines

**Files:**
- Modify: `e2e/ocean-visual.spec.ts`
- Create/update: `e2e/ocean-visual.spec.ts-snapshots/*.png`
- Create: `output/visual-delivery/storm-ocean-clear.png`
- Create: `output/visual-delivery/storm-ocean-rain.png`
- Create: `output/visual-delivery/storm-ocean-lightning.png`
- Create: `output/visual-delivery/storm-ocean-driving.png`

**Interfaces:**
- Uses deterministic time, weather, flash seed, boat state, overview/chase camera, and locked high quality.

- [ ] **Step 1: Add four explicit visual states**

Create one Playwright screenshot test per state:

- clear overview: time `18`, clear, overview camera;
- established storm: time `48`, storm factor `1`, overview camera;
- lightning peak: storm factor `1`, seed `1234`, wait for return stroke;
- driving: chase camera, boat `{x:31,z:4,yaw:-2.35,surge:8}`, visible wake.

Lock quality to high and wait two animation frames after each state is settled before capture.

- [ ] **Step 2: Generate candidate snapshots**

```bash
npx playwright test e2e/ocean-visual.spec.ts --update-snapshots
```

- [ ] **Step 3: Perform original-resolution visual review**

Inspect every snapshot at original resolution. Reject and fix:

- regular far-ocean rows or repeating combs;
- uniform screen-wide foam;
- disconnected boat/wave pitch or floating hull;
- painted straight lightning reflection;
- rain brighter than the bolt before the flash;
- unreadable island silhouette or blown-out white materials;
- chase camera clipping or excessive horizon roll.

Copy only approved captures into `output/visual-delivery/` using Playwright screenshot output or a formatting/copy operation; do not alter pixels with an image editor.

- [ ] **Step 4: Re-run visual tests without update and commit**

```bash
npx playwright test e2e/ocean-visual.spec.ts
git add e2e/ocean-visual.spec.ts e2e/ocean-visual.spec.ts-snapshots
git commit -m "test: approve interactive storm visuals"
```

---

### Task 5: Mac mini performance gate and actual-run video

**Files:**
- Create: `e2e/performance.spec.ts`
- Create: `output/visual-delivery/storm-ocean-run.webm`
- Create: `output/visual-delivery/storm-ocean-run.mp4`
- Modify: `README.md`

**Interfaces:**
- Records clear, storm, active-flash frame-time percentiles and final runtime controls.

- [ ] **Step 1: Add a measured performance scenario**

Use `requestAnimationFrame` timestamps collected in-page for 12 seconds per state. Assert no frame gap above 250 ms, average measured fps at or above 45 on the designated Mac mini run, and adaptive tier behavior matches thresholds. Keep CI assertion limited to no 250 ms stall because CI hardware is not the target Mac.

- [ ] **Step 2: Run full verification on the Mac mini**

```bash
npm test
npm run build
npx playwright test
```

Record diagnostics for clear, storm, and active flash. Confirm no test failures, console errors, failed resources, or unbounded resource growth.

- [ ] **Step 3: Record an actual browser run**

Use a dedicated Playwright context with `recordVideo` at 1280×720. Drive this real sequence for approximately 24 seconds:

1. three seconds clear chase view;
2. accelerate with `W` and turn with `A/D`;
3. toggle `T` and allow the storm transition in a test-accelerated but continuously animated state;
4. trigger deterministic seed `1234`;
5. continue driving through rain and wake.

Save the browser-produced WebM to `output/visual-delivery/storm-ocean-run.webm`, then format it without synthetic frames:

```bash
ffmpeg -y -i output/visual-delivery/storm-ocean-run.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an output/visual-delivery/storm-ocean-run.mp4
```

- [ ] **Step 4: Update user documentation**

Add exact controls (`W/S`, `A/D`, `T`), WebGL2 requirement, adaptive-quality behavior, silent-audio fallback, lightning MIT attribution link, and `npm start`/`npm run dev` commands to `README.md`. Do not claim full CFD or reference parity.

- [ ] **Step 5: Final verification and commit**

```bash
npm test
npm run build
npx playwright test
git status --short
git add README.md e2e/performance.spec.ts
git commit -m "docs: deliver interactive storm ocean"
```

Keep generated delivery video/screenshots ignored unless the repository's existing delivery policy explicitly tracks them.
