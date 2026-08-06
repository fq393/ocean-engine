# Interactive Storm Ocean and Boat Driving Design

Date: 2026-08-05
Status: Approved design
Branch: `codex/ocean-surface-v2`

## 1. Purpose

Upgrade the current Ocean V2 visual study into an interactive Three.js scene with:

- a physically grounded clear-to-storm ocean transition;
- the MIT-licensed `lightning-sim` physics core integrated as a reusable module;
- rain, storm lighting, lightning reflections, and delayed thunder;
- WASD yacht driving with wave-coupled motion, collision, wake, and a third-person chase camera;
- adaptive quality suitable for a Mac mini without requiring a discrete GPU.

The visual target is the supplied 12.5-second ocean-island video. Its important water characteristics are dense multi-scale short waves, broken highlights, irregular shallow-water color, distributed foam, and a high-angle view that preserves surface detail. The target is a reference for visual hierarchy rather than a promise of source-identical rendering.

## 2. Existing Baseline

The project already provides:

- a two-layer Ocean V2 mesh using a JONSWAP-derived set of Gerstner components;
- CPU wave queries shared by the yacht pose and wake;
- Blender-authored island and palm GLBs with LODs and procedural fallbacks;
- a detailed yacht GLB with a procedural fallback;
- bloom, vignette, ACES tone mapping, fog, and quality diagnostics;
- deterministic visual tests for desktop and mobile.

The current yacht follows an analytic circular path. The current ocean has convincing large motion but still lacks the reference video's high-frequency spectral density, persistent whitecaps, shallow-water variation, and local disturbance.

## 3. Goals and Non-goals

### Goals

1. Preserve the accepted Ocean V2 clear-weather appearance while raising water-surface fidelity.
2. Make storm waves emerge continuously from weather parameters rather than multiplying wave height.
3. Keep the lightning physics independent from Three.js rendering and game state.
4. Make every visible storm effect consume the same weather and lightning state.
5. Make the yacht controllable and visibly coupled to the rendered low-frequency waves.
6. Degrade individual effects safely when a capability or performance budget is unavailable.

### Non-goals

- full Navier-Stokes or SPH simulation of the whole ocean;
- structural vessel damage, flooding, or permanent capsizing;
- multiplayer or networking;
- physically resolving every raindrop's fluid impact;
- replacing the existing island or yacht merely to change visual style;
- requiring WebGPU or a discrete GPU.

## 4. System Architecture

The runtime is divided into small systems with explicit state contracts:

```text
src/
├── weather/
│   ├── lightning-core/        Physics port with MIT notice
│   ├── LightningSimulation.ts Incremental flash lifecycle and scheduling
│   ├── LightningRenderer.ts   Three.js channel renderer and light extraction
│   ├── RainSystem.ts          Camera-local instanced rain
│   ├── StormSkySystem.ts      Clouds, fog, and atmosphere transition
│   ├── ThunderSystem.ts       Geometry-derived delayed Web Audio
│   ├── WeatherController.ts   Clear/storm state machine
│   └── types.ts               Weather and lightning frame contracts
├── ocean/
│   ├── SpectralOcean.ts       Spectrum lifecycle and GPU FFT passes
│   ├── SeaStateController.ts  Clear/storm physical sea parameters
│   ├── WaveField.ts           CPU low-frequency displacement queries
│   ├── ShoreField.ts          Shallow-water/depth sampling
│   └── types.ts
├── boat/
│   ├── BoatController.ts      Keyboard intent
│   ├── BoatDynamics.ts        Force integration and wave response
│   ├── BoatCollision.ts       Island, rock, dock, and shallow-water constraints
│   ├── ChaseCamera.ts         Spring-damped third-person camera
│   └── types.ts
└── visual/
    ├── YachtSystem.ts         Yacht visual bound to BoatState
    └── WakeSystem.ts          History-driven wake visual
```

`OceanDemo` remains the composition root. It owns the systems, advances them in a stable order, and disposes them. It does not contain their algorithms.

## 5. Shared Runtime State and Data Flow

The authoritative frame flow is:

```text
Keyboard → BoatController → BoatIntent ─┐
                                       ├→ BoatDynamics → BoatState
Weather toggle → WeatherController ────┤        ↑             ├→ Yacht visual
                │                      │     WaveField         ├→ ChaseCamera
                ├→ SeaStateController ─┴→ SpectralOcean       └→ WakeSystem
                ├→ StormSkySystem
                ├→ RainSystem
                └→ LightningSimulation → LightningRenderer
                                            ├→ scene lights
                                            ├→ ocean reflection uniforms
                                            └→ ThunderSystem
```

The weather frame state contains at minimum:

- mode and transition fraction;
- wind speed and world-space direction;
- rain amount, cloud amount, fog density, and ambient exposure;
- sea significant wave height, peak period, directional spread, and choppiness;
- active lightning light samples and flash exposure.

Systems receive immutable frame snapshots. A system may not reach into another system's private renderer objects.

## 6. Modular `lightning-sim` Integration

### 6.1 Physics port

Port the following `lightning-sim` modules into `src/weather/lightning-core/`:

- atmosphere and measured constants;
- deterministic random sampling;
- ambient electric field and channel charge solver;
- channel storage;
- leader growth and attachment;
- return strokes, dart leaders, and continuing current;
- thermal/current/blackbody calculations;
- thunder impulse-response generation;
- flash sequencing.

Photo reconstruction, original UI, orbit controls, ground renderer, and standalone post-processing are not imported.

The port is mechanical: add TypeScript types and project import paths without changing equations or measured constants. Each ported file keeps the original copyright and MIT notice, and the project adds a third-party notice. The original physics tests are retained and adapted to Vitest. A test must compare fixed seeds against the original telemetry ranges before the module is used by the scene.

### 6.2 Simulation adapter

`LightningSimulation` owns the core flash and exposes:

- seeded creation for tests;
- automatic storm scheduling;
- incremental `update(deltaSeconds, deadline)`;
- lifecycle events for first return stroke, subsequent strokes, and completion;
- an immutable channel view for the renderer;
- telemetry for diagnostics.

Physics stays in SI units. The render adapter applies a configurable scene scale and origin. The default maps a several-kilometre channel into a storm cell approximately 120–180 scene metres high, positioned beyond or beside the island. This keeps the island readable without corrupting the physical solver.

Thunder distance is calculated after mapping the camera back through the same scene scale, so visual compression does not remove the speed-of-sound delay.

Physics work is capped to roughly 2–3 milliseconds per render frame on the desktop quality profile. If it falls behind, simulated time advances more slowly; visual rendering never blocks waiting for completion.

### 6.3 Rendering and lighting

`LightningRenderer` adapts the original HDR capsule renderer:

- view-aligned instanced segments;
- deterministic sub-segment tortuosity;
- hard white core plus colored halo;
- retinal persistence across the short return stroke;
- a bounded set of spatially separated bright channel samples.

The brightest samples drive:

- up to two real Three.js point lights for standard island and yacht materials;
- up to four shader light samples for the ocean and rain;
- a short global exposure pulse for distant cloud illumination.

The existing bloom composer remains authoritative. The standalone `lightning-sim` post pipeline is not imported.

### 6.4 Thunder

`ThunderSystem` uses the core channel geometry to build the impulse response. Playback begins after the speed-of-sound delay implied by the camera/strike distance. Web Audio is unlocked by the first keyboard interaction. Audio failure produces a silent storm and a diagnostic flag, not a runtime error.

## 7. Weather State Machine

Pressing `T` changes the target between `clear` and `storm`. `WeatherController` interpolates a scalar `stormFactor` with an eased transition:

- approximately 18 seconds from clear to established storm;
- approximately 24 seconds from storm back to clear, so clouds and waves decay naturally;
- no discontinuity in wave phase, light intensity, or rain position.

The transition sequence is coupled but staggered:

1. sky luminance and direct sun begin falling;
2. wind and sea spectrum strengthen;
3. cloud coverage, horizon fog, and rain increase;
4. lightning scheduling starts after the storm reaches a stable threshold;
5. whitecaps and shore breaking persist briefly while the sea decays.

Lightning intervals are randomized within bounded ranges and seeded in tests. Clear mode spends no time growing channels. A hidden test hook triggers a deterministic flash for automated capture, but there is no player-facing manual lightning key in the first release.

## 8. Physically Grounded Storm Ocean

### 8.1 Spectral model

The clear and storm seas are described by directional JONSWAP/Tessendorf spectra. The spectrum controls energy by wavelength and direction; it is not a uniform amplitude multiplier.

Representative targets are:

| Parameter | Clear | Established storm |
|---|---:|---:|
| Wind speed | about 9 m/s | 18–24 m/s |
| Significant wave height | 0.6–1.0 m | 2.2–3.2 m |
| Peak period | 4–6 s | 7–10 s |
| Directional spread | broad small chop | stronger downwind alignment plus cross-sea energy |
| Choppiness | low | high but below mesh self-intersection limits |

The exact values may be artistically scaled within these ranges to keep the 9-m yacht controllable and the island visible.

### 8.2 GPU representation

The primary desktop path uses two 128×128 WebGL2 inverse-FFT cascades that produce displacement and slope textures:

- a long-wave field for swell and boat-scale motion;
- a short-wave field for wind chop and broken highlights.

Spectrum phases are stable. Clear and storm energy states are interpolated in spectral amplitude so the surface evolves without popping. Horizontal displacement creates sharper crests and wider troughs.

The reduced spectral tier uses one 128×128 cascade; the lowest spectral tier uses one 64×64 cascade. The accepted Ocean V2 Gerstner renderer remains the capability fallback. The fallback consumes the same sea-state contract and uses a larger directional component set plus domain-warped micro normals; it must not regress to regular comb-like far waves.

### 8.3 CPU wave queries and buoyancy

`WaveField` evaluates a deterministic low-frequency subset generated from the same spectrum seed and sea-state parameters as the GPU surface. It exposes height, normal, horizontal velocity, and approximate water velocity at a world position. High-frequency shading waves do not affect vessel displacement.

This avoids GPU readback while keeping visible large waves and vessel motion phase-compatible. Test hooks compare CPU queries with sampled low-frequency GPU output within a defined tolerance.

### 8.4 Whitecaps, shallow water, and rain impacts

Whitecaps originate from local steepness and horizontal compression. A small temporal foam buffer accumulates crest foam and decays it; noise only breaks its outline and never creates foam without wave energy.

Shore effects use a depth/shore field derived from the Blender island collision geometry. The field drives:

- gradual long-wave damping and shortening;
- approximate shoaling and increased crest steepness;
- direction bending toward the shore normal;
- breaking foam and swash near the waterline;
- shallow-water color and seabed visibility.

If the existing collision mesh cannot produce a clean shore field, a deterministic Blender export script generates a compact depth mask from the same source asset. No manual sculpting is required for the first release.

Rain impacts are a near-camera visual normal/foam layer. They do not feed back into the long-wave solver.

### 8.5 Lightning reflection

The ocean shader receives the brightest lightning samples in world space. Specular response is evaluated against the instantaneous spectral normal, producing fragmented vertical streaks rather than a single painted reflection. A broader low-frequency light term makes nearby wave faces flash without flattening the water color.

## 9. Boat Driving

### 9.1 Input

- `W`: increase forward throttle;
- `S`: brake, then reverse after forward speed approaches zero;
- `A`/`D`: port/starboard rudder;
- `T`: toggle clear/storm weather.

Input is represented as normalized intent, not direct position changes. Losing focus, hiding the page, or disposing the demo clears all held keys.

### 9.2 Dynamics

`BoatDynamics` advances a planar rigid-body state with surge, lateral drift, and yaw. Forces include:

- propeller thrust with acceleration inertia;
- forward quadratic drag;
- stronger lateral hydrodynamic drag;
- rudder force proportional to water-relative speed;
- crosswind force scaled by storm state;
- angular damping and a controlled righting response.

Five `WaveField` samples at center, bow, stern, port, and starboard determine heave, pitch, and roll. Wave-relative water velocity perturbs heading and speed in storm conditions. The first release prevents permanent capsize by clamping extreme roll and applying a nonlinear righting moment.

### 9.3 Collision and shallow water

The yacht uses its existing collision proxy for broad phase. The island collision mesh is projected into a deterministic 2D shore polygon, while rocks and dock use named circle/box colliders authored from the same scene placements. Collision resolves penetration, removes inward velocity, and applies an impact damping impulse. It does not produce damage.

Water depth below a threshold increases drag before a hard collision, communicating that the yacht is grounding. Collision queries are deterministic and independent from visual LOD.

### 9.4 Wake

`WakeSystem` no longer samples the removed circular path. It records a bounded history of actual stern positions, heading, speed, and turn rate. It produces:

- a speed-dependent V-shaped wake;
- propeller wash immediately behind the stern;
- curved wake ribbons during turns;
- foam persistence and breakup;
- stronger, shorter-lived turbulence during rapid throttle changes.

The wake contributes a local displacement/normal disturbance to the near ocean when the quality profile permits; the lowest quality profile retains only foam geometry.

### 9.5 Chase camera

The third-person camera follows a spring-damped target behind and above the yacht:

- position and look target have separate damping;
- heading changes produce readable but bounded lag;
- speed increases follow distance and field of view slightly;
- pitch is stabilized toward the horizon so storm waves remain playable;
- camera-to-boat distance is corrected against island collision geometry.

The fixed overview camera remains available only to deterministic visual tests and showcase capture.

## 10. Rendering and Quality Profiles

The existing WebGL2 renderer, ACES tone mapping, bloom, and output pass remain in place. WebGPU availability may be reported but is not required.

Quality is adaptive in this order:

1. rain instance count;
2. storm-cloud ray-march or noise sampling quality;
3. short-wave FFT resolution/cascade;
4. rendered secondary lightning branches;
5. local wake displacement;
6. pixel-ratio cap.

The controller steps down one tier when the rolling average remains below 42 fps for three seconds. It steps up only after remaining above 55 fps for ten seconds, preventing quality oscillation.

The main ocean geometry, low-frequency wave queries, primary lightning channel, input, collision, and boat dynamics are never disabled by adaptive quality.

Desktop goals at a 1920×1080 CSS viewport are:

- average frame rate at or above approximately 45 fps on the target Mac mini;
- no long main-thread stall while a flash grows;
- bounded renderer memory across repeated weather toggles;
- no progressive growth in rain, lightning, FFT, or audio resources.

Diagnostics expose active quality tier, FFT size/cascades, rain count, lightning segments, physics milliseconds, boat speed, and weather state.

## 11. Failure Handling

| Failure | Required behavior |
|---|---|
| FFT or floating render-target initialization fails | Use Ocean V2 Gerstner fallback and record the reason |
| Lightning core throws or exceeds a safety bound | Cancel that flash, preserve rain/storm, schedule a later retry |
| Web Audio is unavailable or blocked | Stay silent and expose audio status |
| Detailed island/yacht assets fail | Keep existing procedural fallbacks |
| Shore/depth field is unavailable | Use the existing analytic island SDF and conservative collision radius |
| Frame rate remains below threshold | Step down the adaptive quality ladder with hysteresis |
| Browser focus is lost | Clear input and move throttle intent toward neutral |

All optional systems implement idempotent `dispose()`. Errors from an optional visual layer cannot stop the main render loop.

## 12. Testing and Verification

### Unit tests

- original fixed-seed `lightning-sim` physics and telemetry ranges;
- lightning coordinate/scale conversion;
- clear/storm state transition continuity;
- spectrum parameter bounds and deterministic seeding;
- CPU WaveField continuity and clear/storm energy increase;
- keyboard intent, focus clearing, and reverse gating;
- boat integration, rudder authority, drag, righting, and timestep stability;
- collision penetration resolution and shallow-water drag;
- wake-history bounds and decay;
- adaptive-quality hysteresis and fallback decisions.

### Browser integration tests

- the scene reaches ready state in clear weather without console or resource errors;
- `T` transitions to storm and back without discontinuities or leaks;
- a seeded return stroke creates channel geometry, light samples, and an ocean reflection state;
- WASD changes speed and heading while the camera follows;
- the yacht cannot pass through the island or dock;
- FFT failure injection selects the Gerstner fallback;
- audio-disabled mode remains functional.

### Visual tests

Deterministic snapshots cover:

1. clear-water high-angle reference composition;
2. established storm with rough sea and rain;
3. seeded return-stroke peak with island and water illumination;
4. third-person driving with visible wake;
5. desktop and narrow/mobile quality profiles.

Visual review specifically rejects regular far-ocean comb patterns, screen-wide uniform foam, disconnected boat motion, painted lightning reflections, and rain that ignores scene lighting.

### Performance and resource verification

- collect frame-time percentiles during clear, storm, and active-flash windows;
- record draw calls, triangles, textures, render-target memory proxies, and lightning physics time;
- repeat at least ten weather toggles and flashes while checking stable resource counts;
- produce a final actual-run video plus the four required screenshot states.

## 13. Implementation Sequence

The implementation plan should preserve reviewable milestones:

1. input, boat dynamics, wave-bound movement, collision, wake, and chase camera;
2. sea-state contract and higher-density clear-water surface;
3. spectral storm ocean, shore field, foam history, and fallback;
4. modular lightning physics port with retained tests;
5. lightning renderer, rain, storm sky, lighting, reflection, and thunder;
6. adaptive quality, diagnostics, integration tests, and visual delivery.

Each milestone must keep the branch buildable and preserve earlier deterministic screenshots unless the approved visual change explicitly updates them.

## 14. References and Licensing

- `lightning-sim`, MIT: <https://github.com/aipulsedaily/lightning-sim>
- Three.js WebGL GPGPU water example: <https://github.com/mrdoob/three.js/blob/dev/examples/webgl_gpgpu_water.html>
- Tessendorf-style OpenGL FFT ocean example, MIT: <https://github.com/czartur/ocean_fft>
- Water rendering research index, MIT: <https://github.com/wave-harmonic/water-resources>

Reference implementations inform architecture and testing. Code is not copied from a third-party repository unless its license is reviewed, its notice is retained, and the imported scope is recorded.
