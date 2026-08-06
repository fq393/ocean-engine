# 中文 HUD 与船舵方向修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将海洋场景左上角 HUD 完整改为中文，并修正 A/D 在追逐视角中的左右转向语义。

**Architecture:** 文案继续由 `src/main.ts` 创建静态 HUD、由 `OceanDemo` 更新动态天气文本；输入修复只发生在 `BoatController.intentFromKeys`，不触碰船体动力学。测试先覆盖纯函数映射，再覆盖浏览器中的可见 HUD、实际 yaw 方向和视觉基线。

**Tech Stack:** TypeScript、Three.js、Vitest、Playwright、Vite。

## Global Constraints

- A 必须表示左转，D 必须表示右转。
- W/S 油门、天气、海浪、碰撞、尾流、模型和物理接口保持不变。
- HUD 固定使用中文；天气动态文字也必须使用中文。
- 当前渲染器仍为 WebGL2；不得把能力检测文案写成已经使用 WebGPU 渲染。
- 保留主工作区中与 `ocean-engine` 无关的用户修改，不运行 reset、checkout 或破坏性清理。

---

### Task 1: 修正 A/D 输入映射

**Files:**
- Modify: `ocean-engine/tests/boat-controller.test.ts`
- Modify: `ocean-engine/src/boat/BoatController.ts:1-10`

**Interfaces:**
- Consumes: `intentFromKeys(keys: ReadonlySet<string>): BoatIntent`
- Produces: `KeyA -> { rudder: 1 }`、`KeyD -> { rudder: -1 }`，W/S 行为不变。

- [ ] **Step 1: 写失败测试**

将 `ocean-engine/tests/boat-controller.test.ts` 的映射断言改为：

```ts
it('maps WASD to throttle and camera-relative steering intent', () => {
  expect(intentFromKeys(new Set(['KeyW', 'KeyA']))).toEqual({ throttle: 1, rudder: 1 });
  expect(intentFromKeys(new Set(['KeyS', 'KeyD']))).toEqual({ throttle: -1, rudder: -1 });
  expect(intentFromKeys(new Set(['KeyW', 'KeyS']))).toEqual({ throttle: 0, rudder: 0 });
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm test -- tests/boat-controller.test.ts`

Expected: 1 个测试失败，失败差异显示当前 `KeyA` 得到 `rudder: -1`、`KeyD` 得到 `rudder: 1`。

- [ ] **Step 3: 实现最小修复**

在 `ocean-engine/src/boat/BoatController.ts` 中只替换舵值表达式：

```ts
const rudder = Number(keys.has('KeyA')) - Number(keys.has('KeyD'));
```

保留 `CONTROL_CODES`、油门计算、事件监听和清理逻辑。

- [ ] **Step 4: 运行测试确认绿灯**

Run: `npm test -- tests/boat-controller.test.ts`

Expected: 1 个测试文件、1 个测试通过。

- [ ] **Step 5: 提交输入修复**

```bash
git add ocean-engine/tests/boat-controller.test.ts ocean-engine/src/boat/BoatController.ts
git commit -m "fix: align A and D steering directions"
```

### Task 2: 中文化静态与动态 HUD

**Files:**
- Modify: `ocean-engine/src/main.ts:12-20`
- Modify: `ocean-engine/src/app/OceanDemo.ts:471-477,604-606`
- Modify: `ocean-engine/e2e/ocean-smoke.spec.ts:15-20`

**Interfaces:**
- Consumes: `OceanDemo.backendLabel`、`WeatherFrame.mode`、`WeatherFrame.stormFactor` 和 `WeatherFrame.rain`
- Produces: `.hud` 中固定中文标题、操作说明、能力状态和动态中文天气状态。

- [ ] **Step 1: 写失败的 HUD 断言**

在 `ocean-engine/e2e/ocean-smoke.spec.ts` 的启动断言中加入：

```ts
await expect(page.locator('.hud')).toContainText('热带航道');
await expect(page.locator('.hud')).toContainText('操作说明');
await expect(page.locator('.hud')).toContainText('A 左转 · D 右转');
await expect(page.locator('[data-weather-label]')).toContainText('当前天气：晴朗');
```

同时在天气场景断言中加入：

```ts
await expect(page.locator('[data-weather-label]')).toContainText('暴风雨');
await expect(page.locator('[data-weather-label]')).toContainText('降雨');
```

- [ ] **Step 2: 运行浏览器测试确认红灯**

Run: `npx playwright test e2e/ocean-smoke.spec.ts e2e/storm-ocean.spec.ts`

Expected: 新增中文断言失败，现有英文 HUD 仍可见。

- [ ] **Step 3: 实现静态中文 HUD**

在 `ocean-engine/src/main.ts` 中将 HUD 模板替换为以下结构，`demo.backendLabel` 保持动态插入：

```ts
hud.innerHTML = `
  <span class="eyebrow">实时海洋与天气模拟</span>
  <strong>热带航道</strong>
  <span>${demo.backendLabel}</span>
  <div class="hud-rule"></div>
  <span>操作说明</span>
  <span>W 前进 · S 后退</span>
  <span>A 左转 · D 右转</span>
  <span>T 切换晴天 / 暴风雨</span>
  <span data-weather-label>当前天气：晴朗</span>
`;
```

unsupported 分支改为：

```ts
mount.innerHTML = '<div class="hud"><strong>海洋引擎</strong><span>当前浏览器不支持 WebGL2。</span></div>';
```

- [ ] **Step 4: 实现中文能力与天气文本**

在 `OceanDemo.backendLabel` 中返回：

```ts
return this.#backend === 'webgpu'
  ? 'WebGPU 可用 · 当前使用 WebGL2 渲染'
  : '当前使用 WebGL2 渲染';
```

将动态文本分支改为：

```ts
this.#weatherLabel.textContent = this.#weatherFrame.mode === 'storm'
  ? `暴风雨 ${Math.round(this.#weatherFrame.stormFactor * 100)}% · 降雨 ${Math.round(this.#weatherFrame.rain * 100)}%`
  : '当前天气：晴朗';
```

- [ ] **Step 5: 运行 HUD 测试确认绿灯**

Run: `npx playwright test e2e/ocean-smoke.spec.ts e2e/storm-ocean.spec.ts`

Expected: 启动、天气切换和中文 HUD 断言全部通过。

- [ ] **Step 6: 提交中文 HUD**

```bash
git add ocean-engine/src/main.ts ocean-engine/src/app/OceanDemo.ts ocean-engine/e2e/ocean-smoke.spec.ts
git commit -m "feat: localize ocean HUD to Chinese"
```

### Task 3: 锁定实际转向方向并更新视觉交付

**Files:**
- Modify: `ocean-engine/e2e/boat-driving.spec.ts:3-28`
- Modify: `ocean-engine/e2e/ocean-visual.spec.ts-snapshots/storm-ocean-clear-darwin.png`
- Modify: `ocean-engine/e2e/ocean-visual.spec.ts-snapshots/storm-ocean-rain-darwin.png`
- Modify: `ocean-engine/e2e/ocean-visual.spec.ts-snapshots/storm-ocean-lightning-darwin.png`
- Modify: `ocean-engine/e2e/ocean-visual.spec.ts-snapshots/storm-ocean-driving-darwin.png`

**Interfaces:**
- Consumes: 浏览器中的 `#scene-state[data-boat-yaw]`、`.hud` 和已通过的输入/HUD 行为。
- Produces: 对 A/D 符号和中文视觉交付的回归保护。

- [ ] **Step 1: 扩展浏览器驾驶测试，先制造失败**

在 `boat-driving.spec.ts` 中记录 A 和 D 的相对 yaw：

```ts
const yawBeforeA = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
await page.keyboard.down('KeyA');
await page.waitForTimeout(700);
await page.keyboard.up('KeyA');
const yawAfterA = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
expect(yawAfterA - yawBeforeA).toBeGreaterThan(0.005);

const yawBeforeD = yawAfterA;
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.keyboard.up('KeyD');
const yawAfterD = Number(await page.locator('#scene-state').getAttribute('data-boat-yaw'));
expect(yawAfterD - yawBeforeD).toBeLessThan(-0.005);
```

- [ ] **Step 2: 运行驾驶测试确认失败或暴露真实符号**

Run: `npx playwright test e2e/boat-driving.spec.ts`

Expected before the input fix: at least one new directional assertion fails, proving the regression test observes the original reversed behavior.

- [ ] **Step 3: 重新生成并检查视觉基线**

Run: `npx playwright test e2e/ocean-visual.spec.ts --update-snapshots=all`

Expected: 4 张 Darwin 基线更新为中文 HUD；海面、暴雨、闪电和尾流仍可见，不能出现黑帧、模型消失或英文操作提示。

- [ ] **Step 4: 无更新模式复核视觉基线**

Run: `npx playwright test e2e/ocean-visual.spec.ts`

Expected: 4 个视觉测试通过且不重新写入快照。

- [ ] **Step 5: 完整验证与交付**

Run:

```bash
npm test
npm run build
npm run test:e2e
```

Expected: 单元测试、TypeScript/Vite 构建和全部浏览器测试均以退出码 0 完成；保留现有主工作区无关修改。

- [ ] **Step 6: 提交回归测试与基线**

```bash
git add ocean-engine/e2e/boat-driving.spec.ts ocean-engine/e2e/ocean-visual.spec.ts-snapshots
git commit -m "test: verify Chinese controls and steering direction"
```
