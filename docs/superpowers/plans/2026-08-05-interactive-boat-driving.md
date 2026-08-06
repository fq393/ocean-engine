# Interactive Boat Driving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the yacht's fixed circular animation with deterministic WASD driving, wave-coupled motion, collision, a history-driven wake, and a third-person chase camera.

**Architecture:** Keyboard input produces immutable `BoatIntent`; `BoatDynamics` integrates a compact planar rigid-body state and samples the existing `WaveQuery` at five hull points. Rendering systems consume `BoatState` without owning physics, while collision and camera remain independently testable pure calculations.

**Tech Stack:** TypeScript 7, Three.js 0.185.1, Vitest 4, Playwright 1.62, existing `WaveQuery` and Blender/Tripo GLBs.

## Global Constraints

- Target a Retina Mac mini without requiring a discrete GPU.
- Use `W/S` for throttle/brake/reverse, `A/D` for rudder, and clear held keys on blur/visibility loss.
- Use exactly five water samples: center, bow, stern, port, and starboard.
- Keep the existing yacht GLB and procedural fallback.
- Do not add damage, flooding, permanent capsize, multiplayer, or game objectives.
- Preserve the fixed overview camera only through deterministic test hooks.
- Every physics update must clamp `deltaSeconds` to at most `1 / 30` seconds.

---

### Task 1: Input and boat state contracts

**Files:**
- Create: `src/boat/types.ts`
- Create: `src/boat/BoatController.ts`
- Create: `tests/boat-controller.test.ts`

**Interfaces:**
- Consumes: keyboard `keydown`/`keyup`, `blur`, and `visibilitychange` events.
- Produces: `BoatIntent`, `BoatState`, `BoatEnvironment`, and `BoatController.intent`.

- [ ] **Step 1: Write the failing controller tests**

Create `tests/boat-controller.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { intentFromKeys } from '../src/boat/BoatController';

describe('BoatController', () => {
  it('maps WASD to bounded intent', () => {
    expect(intentFromKeys(new Set(['KeyW', 'KeyA']))).toEqual({ throttle: 1, rudder: -1 });
    expect(intentFromKeys(new Set(['KeyS', 'KeyD']))).toEqual({ throttle: -1, rudder: 1 });
    expect(intentFromKeys(new Set(['KeyW', 'KeyS']))).toEqual({ throttle: 0, rudder: 0 });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/boat-controller.test.ts
```

Expected: FAIL because `src/boat/BoatController.ts` does not exist.

- [ ] **Step 3: Add exact state contracts**

Create `src/boat/types.ts`:

```ts
export interface BoatIntent { readonly throttle: number; readonly rudder: number }
export interface BoatEnvironment {
  readonly windX: number;
  readonly windZ: number;
  readonly stormFactor: number;
}
export interface BoatState {
  x: number; z: number; yaw: number;
  surge: number; sway: number; yawRate: number;
  heave: number; pitch: number; roll: number;
}
export const INITIAL_BOAT_STATE: Readonly<BoatState> = Object.freeze({
  x: 31, z: 4, yaw: -2.35,
  surge: 0, sway: 0, yawRate: 0,
  heave: 0, pitch: 0, roll: 0,
});
```

- [ ] **Step 4: Implement input mapping and lifecycle**

Create `src/boat/BoatController.ts`:

```ts
import type { BoatIntent } from './types';

export function intentFromKeys(keys: ReadonlySet<string>): BoatIntent {
  const throttle = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const rudder = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  return { throttle, rudder };
}

export class BoatController {
  readonly #keys = new Set<string>();
  readonly #target: Window;
  constructor(target: Window = window) { this.#target = target; }
  get intent(): BoatIntent { return intentFromKeys(this.#keys); }
  readonly #keyDown = (event: KeyboardEvent): void => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      this.#keys.add(event.code); event.preventDefault();
    }
  };
  readonly #keyUp = (event: KeyboardEvent): void => { this.#keys.delete(event.code); };
  readonly clear = (): void => { this.#keys.clear(); };
  readonly #visibility = (): void => { if (document.hidden) this.clear(); };
  start(): void {
    this.#target.addEventListener('keydown', this.#keyDown);
    this.#target.addEventListener('keyup', this.#keyUp);
    this.#target.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.#visibility);
  }
  dispose(): void {
    this.#target.removeEventListener('keydown', this.#keyDown);
    this.#target.removeEventListener('keyup', this.#keyUp);
    this.#target.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.#visibility);
    this.clear();
  }
}
```

- [ ] **Step 5: Run tests and commit**

```bash
npx vitest run tests/boat-controller.test.ts
git add src/boat/types.ts src/boat/BoatController.ts tests/boat-controller.test.ts
git commit -m "feat: add boat input contracts"
```

Expected: PASS.

---

### Task 2: Force-based boat dynamics and five-point wave response

**Files:**
- Create: `src/boat/BoatDynamics.ts`
- Create: `tests/boat-dynamics.test.ts`

**Interfaces:**
- Consumes: `BoatIntent`, `BoatEnvironment`, elapsed time, and a `WaveSampler` compatible with `WaveQuery.sample(x, z, time)`.
- Produces: mutable internal `BoatState`, returned as a readonly snapshot from `update()`.

- [ ] **Step 1: Write failing dynamics tests**

Create `tests/boat-dynamics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BoatDynamics } from '../src/boat/BoatDynamics';
import { INITIAL_BOAT_STATE } from '../src/boat/types';

const flat = { sample: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }) };
const calm = { windX: 0, windZ: 0, stormFactor: 0 };

describe('BoatDynamics', () => {
  it('accelerates forward and gains rudder authority only while moving', () => {
    const boat = new BoatDynamics(INITIAL_BOAT_STATE);
    for (let i = 0; i < 180; i += 1) boat.update(1 / 60, i / 60, { throttle: 1, rudder: 1 }, flat, calm);
    expect(boat.state.surge).toBeGreaterThan(2);
    expect(Math.abs(boat.state.yawRate)).toBeGreaterThan(0.01);
  });

  it('remains finite after a long variable-step run', () => {
    const boat = new BoatDynamics(INITIAL_BOAT_STATE);
    for (let i = 0; i < 2_000; i += 1) boat.update(i % 2 ? 1 / 20 : 1 / 120, i / 60, { throttle: 0.7, rudder: -0.4 }, flat, calm);
    expect(Object.values(boat.state).every(Number.isFinite)).toBe(true);
    expect(Math.abs(boat.state.roll)).toBeLessThanOrEqual(Math.PI * 0.36);
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/boat-dynamics.test.ts
```

Expected: FAIL because `BoatDynamics` does not exist.

- [ ] **Step 3: Implement the bounded integrator**

Create `src/boat/BoatDynamics.ts` with these constants and update structure:

```ts
import type { WaveSample } from '../ocean/types';
import type { BoatEnvironment, BoatIntent, BoatState } from './types';

export interface WaveSampler { sample(x: number, z: number, time: number): WaveSample }
const MAX_DT = 1 / 30;
const HALF_LENGTH = 3.4;
const HALF_BEAM = 1.3;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class BoatDynamics {
  readonly state: BoatState;
  constructor(initial: Readonly<BoatState>) { this.state = { ...initial }; }

  update(dtRaw: number, time: number, intent: BoatIntent, waves: WaveSampler, env: BoatEnvironment): Readonly<BoatState> {
    const dt = clamp(dtRaw, 0, MAX_DT);
    const s = this.state;
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    const thrust = intent.throttle >= 0 ? intent.throttle * 7.5 : intent.throttle * 3.2;
    const surgeDrag = 0.085 * s.surge * Math.abs(s.surge);
    const lateralDrag = 1.7 * s.sway * Math.abs(s.sway);
    const rudder = intent.rudder * Math.min(1, Math.abs(s.surge) / 2.5) * s.surge * 0.22;
    const windSide = (-env.windX * cos + env.windZ * sin) * env.stormFactor * 0.012;
    s.surge += (thrust - surgeDrag) * dt;
    s.sway += (windSide - lateralDrag) * dt;
    s.yawRate += (rudder - s.yawRate * 1.8) * dt;
    s.yaw += s.yawRate * dt;
    s.x += (sin * s.surge + cos * s.sway) * dt;
    s.z += (cos * s.surge - sin * s.sway) * dt;

    const sample = (forward: number, right: number): WaveSample => waves.sample(
      s.x + sin * forward + cos * right,
      s.z + cos * forward - sin * right,
      time,
    );
    const center = sample(0, 0), bow = sample(HALF_LENGTH, 0), stern = sample(-HALF_LENGTH, 0);
    const port = sample(0, -HALF_BEAM), starboard = sample(0, HALF_BEAM);
    s.heave += (center.height + 0.24 - s.heave) * Math.min(1, dt * 7);
    s.pitch += (Math.atan2(bow.height - stern.height, HALF_LENGTH * 2) - s.pitch) * Math.min(1, dt * 6);
    const targetRoll = Math.atan2(port.height - starboard.height, HALF_BEAM * 2) - s.yawRate * 0.45;
    s.roll += (targetRoll - s.roll) * Math.min(1, dt * 5);
    s.roll = clamp(s.roll, -Math.PI * 0.36, Math.PI * 0.36);
    return s;
  }
}
```

- [ ] **Step 4: Run focused and full tests, then commit**

```bash
npx vitest run tests/boat-dynamics.test.ts tests/wave-query.test.ts
npm test
git add src/boat/BoatDynamics.ts tests/boat-dynamics.test.ts
git commit -m "feat: add wave-coupled boat dynamics"
```

Expected: all tests PASS.

---

### Task 3: Shore collision and chase camera

**Files:**
- Create: `src/boat/BoatCollision.ts`
- Create: `src/boat/ChaseCamera.ts`
- Create: `tests/boat-collision.test.ts`
- Create: `tests/chase-camera.test.ts`

**Interfaces:**
- Produces: `CircleCollider`, `resolveBoatCollisions(state, colliders)`, `ChaseCamera.update(camera, state, dt)`, and `ChaseCamera.snap(camera, state)`.

- [ ] **Step 1: Write failing pure-function tests**

```ts
// tests/boat-collision.test.ts
import { describe, expect, it } from 'vitest';
import { resolveBoatCollisions } from '../src/boat/BoatCollision';
import { INITIAL_BOAT_STATE } from '../src/boat/types';

it('projects a penetrating boat outside a shore collider', () => {
  const state = { ...INITIAL_BOAT_STATE, x: 0, z: -28, surge: 4 };
  const hit = resolveBoatCollisions(state, [{ x: 0, z: -28, radius: 19, dragRadius: 23 }]);
  expect(hit.collided).toBe(true);
  expect(Math.hypot(state.x, state.z + 28)).toBeGreaterThanOrEqual(19);
  expect(state.surge).toBeLessThan(4);
});
```

```ts
// tests/chase-camera.test.ts
import { describe, expect, it } from 'vitest';
import { computeChaseTarget } from '../src/boat/ChaseCamera';
import { INITIAL_BOAT_STATE } from '../src/boat/types';

it('places the camera behind and above the yacht', () => {
  const pose = computeChaseTarget({ ...INITIAL_BOAT_STATE, x: 10, z: 20, yaw: 0, surge: 8 });
  expect(pose.position.z).toBeLessThan(20);
  expect(pose.position.y).toBeGreaterThan(5);
  expect(pose.fov).toBeGreaterThan(47);
});
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/boat-collision.test.ts tests/chase-camera.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement conservative shore collision**

Create `src/boat/BoatCollision.ts`:

```ts
import type { BoatState } from './types';
export interface CircleCollider { readonly x: number; readonly z: number; readonly radius: number; readonly dragRadius: number }
export function resolveBoatCollisions(state: BoatState, colliders: readonly CircleCollider[]): { collided: boolean; shallow: boolean } {
  let collided = false, shallow = false;
  for (const c of colliders) {
    let dx = state.x - c.x, dz = state.z - c.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = Math.sin(state.yaw); dz = Math.cos(state.yaw); d = 1; }
    if (d < c.dragRadius) { shallow = true; state.surge *= 0.985; }
    if (d >= c.radius) continue;
    collided = true; dx /= d; dz /= d;
    state.x = c.x + dx * c.radius; state.z = c.z + dz * c.radius;
    state.surge *= -0.08; state.sway *= 0.2; state.yawRate *= 0.35;
  }
  return { collided, shallow };
}
```

Use the initial conservative collider `{ x: 0, z: -28, radius: 19, dragRadius: 24 }`. The later storm-ocean plan replaces it with the projected Blender shore field while retaining this fallback.

- [ ] **Step 4: Implement spring-damped chase positioning**

Create `src/boat/ChaseCamera.ts`:

```ts
import * as THREE from 'three';
import type { BoatState } from './types';
export function computeChaseTarget(state: Readonly<BoatState>): { position: THREE.Vector3; lookAt: THREE.Vector3; fov: number } {
  const speed = Math.abs(state.surge);
  const distance = 15 + Math.min(7, speed * 0.55);
  const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
  return {
    position: new THREE.Vector3(state.x - sin * distance, state.heave + 7.5, state.z - cos * distance),
    lookAt: new THREE.Vector3(state.x + sin * 5, state.heave + 1.4, state.z + cos * 5),
    fov: 47 + Math.min(7, speed * 0.5),
  };
}
export class ChaseCamera {
  readonly #look = new THREE.Vector3();
  snap(camera: THREE.PerspectiveCamera, state: Readonly<BoatState>): void {
    const p = computeChaseTarget(state); camera.position.copy(p.position); this.#look.copy(p.lookAt); camera.fov = p.fov; camera.updateProjectionMatrix(); camera.lookAt(this.#look);
  }
  update(camera: THREE.PerspectiveCamera, state: Readonly<BoatState>, dt: number): void {
    const p = computeChaseTarget(state); const a = 1 - Math.exp(-Math.min(dt, 1 / 30) * 4.5);
    camera.position.lerp(p.position, a); this.#look.lerp(p.lookAt, 1 - Math.exp(-Math.min(dt, 1 / 30) * 6));
    camera.fov += (p.fov - camera.fov) * a; camera.updateProjectionMatrix(); camera.lookAt(this.#look);
  }
}
```

- [ ] **Step 5: Run tests and commit**

```bash
npx vitest run tests/boat-collision.test.ts tests/chase-camera.test.ts
git add src/boat/BoatCollision.ts src/boat/ChaseCamera.ts tests/boat-collision.test.ts tests/chase-camera.test.ts
git commit -m "feat: add boat collision and chase camera"
```

---

### Task 4: Bind yacht, wake, camera, and browser controls

**Files:**
- Modify: `src/visual/YachtSystem.ts:206-223`
- Modify: `src/visual/WakeSystem.ts`
- Modify: `src/app/OceanDemo.ts:18-207`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/vite-env.d.ts`
- Modify: `tests/yacht-system.test.ts`
- Create: `tests/wake-system.test.ts`
- Create: `e2e/boat-driving.spec.ts`

**Interfaces:**
- `YachtSystem.update(state: Readonly<BoatState>): void` replaces the path-based signature.
- `WakeSystem.update(time, state, waves): void` records real stern history.
- Test hooks add `setBoatState(partial)` and `setTime(seconds)`.

- [ ] **Step 1: Replace the obsolete path contract test**

Remove the `sampleYachtPath` assertion from `tests/yacht-system.test.ts`. Add `tests/wake-system.test.ts` with a pure `appendWakeSample` assertion that caps history at 96 entries and rejects movement below `0.04` metres.

- [ ] **Step 2: Add the browser RED test**

Create `e2e/boat-driving.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
test('WASD drives the yacht and the chase camera follows', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  const before = Number(await page.locator('#scene-state').getAttribute('data-boat-speed'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  const after = Number(await page.locator('#scene-state').getAttribute('data-boat-speed'));
  expect(after).toBeGreaterThan(before);
  await expect(page.locator('#scene-state')).toHaveAttribute('data-camera-mode', 'chase');
  await expect(page.locator('.hud')).toContainText('WASD');
});
```

Run `npx playwright test e2e/boat-driving.spec.ts`; expect FAIL because the contract is not wired.

- [ ] **Step 3: Bind visual state and real wake history**

Change `YachtSystem.update` to copy `BoatState` directly:

```ts
update(state: Readonly<BoatState>): void {
  this.root.position.set(state.x, state.heave, state.z);
  this.root.rotation.order = 'YXZ';
  this.root.rotation.set(state.pitch, state.yaw, state.roll);
}
```

In `WakeSystem`, replace analytic `sampleYachtPath` calls with a 96-entry history of `{ x, z, yaw, speed, time }`; append only after `Math.hypot(dx, dz) >= 0.04`, sample water height at each stored position, use speed to set width/alpha, and remove expired samples older than six seconds.

- [ ] **Step 4: Compose the driving loop**

In `OceanDemo`, construct `BoatController`, `BoatDynamics`, and `ChaseCamera`; start the controller after canvas mount. In `#render`, before yacht/wake updates:

```ts
const dt = Math.min(this.#timer.getDelta(), 1 / 30);
const boat = this.#boatDynamics.update(dt, time, this.#boatController.intent, this.#waves, {
  windX: 0, windZ: 0, stormFactor: 0,
});
resolveBoatCollisions(boat as BoatState, this.#boatColliders);
this.#yacht.update(boat);
this.#wake.update(time, boat, this.#waves);
this.#chaseCamera.update(this.#camera, boat, dt);
```

Remove both animated overview-camera branches from normal runtime. Keep the old overview pose only inside the showcase test-state path. Publish `data-boat-speed`, `data-boat-yaw`, `data-camera-mode="chase"`, and update HUD copy to `WASD DRIVE · T WEATHER`.

- [ ] **Step 5: Dispose input and verify all layers**

Call `this.#boatController.dispose()` in `OceanDemo.dispose()`. Run:

```bash
npm test
npm run build
npx playwright test e2e/boat-driving.spec.ts e2e/ocean-smoke.spec.ts
```

Expected: all commands PASS; `ocean-smoke` no longer assumes the autonomous `data-yacht-x` change and instead checks finite boat state.

- [ ] **Step 6: Commit the playable driving milestone**

```bash
git add src/boat src/visual/YachtSystem.ts src/visual/WakeSystem.ts src/app/OceanDemo.ts src/main.ts src/styles.css src/vite-env.d.ts tests e2e/boat-driving.spec.ts e2e/ocean-smoke.spec.ts
git commit -m "feat: add interactive yacht driving"
```
