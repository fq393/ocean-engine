import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { resolveBoatCollisions, type BoatCollisionResult, type CircleCollider } from '../boat/BoatCollision';
import { BoatController } from '../boat/BoatController';
import { BoatDynamics, type WaveSampler } from '../boat/BoatDynamics';
import { ChaseCamera } from '../boat/ChaseCamera';
import { INITIAL_BOAT_STATE } from '../boat/types';
import { CLEAR_SEA } from '../ocean/SeaStateController';
import type { ShoreField } from '../ocean/ShoreField';
import {
  selectSpectralTier,
  SpectralOcean,
  type SpectralOceanFrame,
} from '../ocean/SpectralOcean';
import { WaveField } from '../ocean/WaveField';
import { AdaptiveQualityController } from '../platform/AdaptiveQualityController';
import type { GraphicsBackend } from '../platform/capabilities';
import type { OceanSurfaceProfile, RuntimeQualityTier } from '../platform/quality';
import { effectivePixelRatio, selectOceanSurfaceProfile } from '../render/OceanSurfaceProfile';
import { OceanWater } from '../render/OceanWater';
import { LightningRenderer } from '../weather/LightningRenderer';
import { LightningSimulation } from '../weather/LightningSimulation';
import { RainSystem, type RainQualityTier } from '../weather/RainSystem';
import { StormSkySystem } from '../weather/StormSkySystem';
import { ThunderSystem } from '../weather/ThunderSystem';
import type { LightningFrameState, SeaState, WeatherFrame } from '../weather/types';
import { WeatherController } from '../weather/WeatherController';
import { IslandAssetSystem } from '../visual/IslandAssetSystem';
import { createMaterialLibrary, type MaterialLibrary } from '../visual/MaterialLibrary';
import { collectDiagnostics } from '../visual/QualityDiagnostics';
import { bloomForStorm, RenderPipeline } from '../visual/RenderPipeline';
import { createSky } from '../visual/SkySystem';
import type { SkySystem } from '../visual/SkySystem';
import { WakeSystem } from '../visual/WakeSystem';
import { YachtSystem } from '../visual/YachtSystem';
import { createSceneDiagnostics } from './SceneDiagnostics';

const EMPTY_LIGHTNING_FRAME: Readonly<LightningFrameState> = Object.freeze({
  lights: Object.freeze([]),
  flashExposure: 0,
});

export class OceanDemo {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(47, 1, 0.1, 2_500);
  readonly #water: OceanWater;
  readonly #waveField = WaveField.default();
  readonly #waveSampler: WaveSampler = {
    sample: (x, z, time) => this.#waveField.sample(x, z, time, this.#sea.stormFactor),
  };
  readonly #weather = new WeatherController();
  readonly #lightningSimulation = new LightningSimulation();
  readonly #lightningRenderer = new LightningRenderer();
  readonly #thunder = new ThunderSystem();
  #spectral: SpectralOcean;
  readonly #yacht: YachtSystem;
  readonly #island: IslandAssetSystem;
  readonly #wake = new WakeSystem();
  readonly #pipeline: RenderPipeline;
  readonly #sky: SkySystem;
  readonly #rain: RainSystem;
  readonly #stormSky: StormSkySystem;
  readonly #hemisphere: THREE.HemisphereLight;
  readonly #sun: THREE.DirectionalLight;
  readonly #timer = new THREE.Timer();
  readonly #mount: HTMLElement;
  readonly #backend: GraphicsBackend;
  readonly #materials: MaterialLibrary;
  readonly #environmentTarget: THREE.WebGLRenderTarget;
  readonly #diagnosticsElement: HTMLElement;
  readonly #sceneStateElement: HTMLElement;
  readonly #surfaceProfile: OceanSurfaceProfile;
  readonly #quality: AdaptiveQualityController;
  readonly #boatController = new BoatController();
  readonly #boatDynamics = new BoatDynamics(INITIAL_BOAT_STATE);
  readonly #chaseCamera = new ChaseCamera();
  readonly #boatColliders: readonly CircleCollider[] = [
    { x: 0, z: -28, radius: 19, dragRadius: 24 },
  ];
  #boatCollision: BoatCollisionResult = { collided: false, shallow: false };
  #sea: Readonly<SeaState> = CLEAR_SEA;
  #weatherFrame: Readonly<WeatherFrame>;
  #shoreField: ShoreField | undefined;
  #forceOceanFallback = false;
  #waterMode: 'spectral' | 'gerstner' = 'gerstner';
  #fftSize: 64 | 128;
  #fftCascades: 1 | 2;
  #disposed = false;
  #frame = 0;
  #assetsReady = false;
  #visualReadyPublished = false;
  #fixedTime: number | undefined;
  #narrowView = false;
  #overviewCameraForTests = false;
  #framesUntilFreeze = 0;
  #weatherLabel: HTMLElement | undefined;
  #lightningPhase = 'idle';
  #lightningPhaseHold = 0;
  readonly #thunderSeeds = new Set<number>();
  #appliedQuality: RuntimeQualityTier['name'] | undefined;
  #smoothedFps = 60;
  #spectralError: unknown;
  #lightningError: unknown;
  #rainError: unknown;
  #audioError: unknown;
  #lightningFailed = false;
  #rainFailed = false;
  #collisionDiagnosticHold = 0;

  constructor(mount: HTMLElement, backend: GraphicsBackend) {
    if (backend === 'unsupported') throw new Error('WebGL2 is required for the visual delivery');
    this.#mount = mount;
    this.#backend = backend;
    this.#surfaceProfile = selectOceanSurfaceProfile(this.#mount.clientWidth);
    this.#quality = new AdaptiveQualityController(
      this.#surfaceProfile.name === 'desktop' ? 'high' : 'low',
    );
    this.#weatherFrame = this.#weather.update(0, 0, this.#lightningRenderer.frame);
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.#renderer.setPixelRatio(effectivePixelRatio(devicePixelRatio, this.#surfaceProfile.pixelRatioCap));
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.9;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFShadowMap;
    this.#renderer.info.autoReset = false;
    this.#scene.fog = new THREE.FogExp2('#a9dce4', 0.0016);

    const pmrem = new THREE.PMREMGenerator(this.#renderer);
    this.#environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    this.#scene.environment = this.#environmentTarget.texture;
    this.#scene.environmentIntensity = 0.5;

    this.#materials = createMaterialLibrary();
    const components = this.#waveField.components(0);
    this.#water = new OceanWater(components, this.#surfaceProfile);
    const spectralTier = selectSpectralTier(this.#mount.clientWidth);
    this.#fftSize = spectralTier.size;
    this.#fftCascades = spectralTier.cascades;
    this.#spectral = new SpectralOcean(this.#renderer, this.#waveField, spectralTier);
    this.#island = new IslandAssetSystem(this.#materials, this.#mount.clientWidth);
    this.#island.root.userData.sceneMarker = 'island';
    this.#yacht = new YachtSystem(this.#materials);
    void Promise.all([
      this.#yacht.ready,
      this.#island.ready,
      this.#island.shoreFieldReady,
    ]).then(([, , shoreField]) => {
      if (this.#disposed) {
        shoreField.dispose();
        return;
      }
      this.#shoreField = shoreField;
      this.#water.setShoreField(shoreField);
      this.#assetsReady = true;
    });

    this.#hemisphere = new THREE.HemisphereLight('#dff7ff', '#4a6b55', 0.9);
    this.#sun = new THREE.DirectionalLight('#fff0c2', 2.55);
    this.#sun.position.set(-52, 78, 36);
    this.#sun.castShadow = true;
    this.#sun.shadow.mapSize.set(2048, 2048);
    this.#sun.shadow.camera.left = -70;
    this.#sun.shadow.camera.right = 70;
    this.#sun.shadow.camera.top = 70;
    this.#sun.shadow.camera.bottom = -70;
    this.#sun.shadow.camera.near = 5;
    this.#sun.shadow.camera.far = 180;
    this.#sun.shadow.bias = -0.00025;

    this.#sky = createSky();
    const weatherQuality: RainQualityTier = this.#surfaceProfile.name === 'desktop' ? 'high' : 'low';
    this.#rain = new RainSystem(weatherQuality);
    this.#stormSky = new StormSkySystem({
      sky: this.#sky,
      scene: this.#scene,
      camera: this.#camera,
      hemisphere: this.#hemisphere,
      sun: this.#sun,
      quality: weatherQuality,
    });
    this.#scene.add(
      this.#sky.root,
      this.#stormSky.root,
      this.#water,
      this.#island.root,
      this.#wake.root,
      this.#yacht.root,
      this.#rain.root,
      this.#lightningRenderer.root,
      this.#hemisphere,
      this.#sun,
    );
    this.#camera.position.set(45, 31, 43);
    this.#camera.lookAt(0, 1.8, -26);
    this.#pipeline = new RenderPipeline(this.#renderer, this.#scene, this.#camera, {
      antialiasSamples: this.#surfaceProfile.antialiasSamples,
    });
    this.#timer.connect(document);
    this.#mount.append(this.#renderer.domElement);
    this.#boatController.start();
    const initialWater = this.#waveField.sample(
      this.#boatDynamics.state.x,
      this.#boatDynamics.state.z,
      0,
      0,
    );
    this.#boatDynamics.state.heave = initialWater.height + 0.24;
    this.#yacht.update(this.#boatDynamics.state);
    this.#chaseCamera.snap(this.#camera, this.#boatDynamics.state);

    this.#diagnosticsElement = document.createElement('span');
    this.#diagnosticsElement.id = 'diagnostics';
    this.#diagnosticsElement.className = 'scene-contract';
    this.#sceneStateElement = document.createElement('span');
    this.#sceneStateElement.id = 'scene-state';
    this.#sceneStateElement.className = 'scene-contract';
    const islandMarker = document.createElement('span');
    islandMarker.dataset.sceneMarker = 'island';
    islandMarker.className = 'scene-contract';
    const yachtMarker = document.createElement('span');
    yachtMarker.dataset.sceneMarker = 'yacht';
    yachtMarker.className = 'scene-contract';
    this.#mount.append(this.#diagnosticsElement, this.#sceneStateElement, islandMarker, yachtMarker);

    window.__OCEAN_TEST_HOOKS__ = {
      setTime: (seconds: number) => {
        const previousTime = this.#fixedTime ?? this.#timer.getElapsed();
        const nextTime = Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
        const nextCurrentTime = nextTime ?? this.#timer.getElapsed();
        this.#wake.rebaseTime(nextCurrentTime - previousTime);
        this.#fixedTime = nextTime;
        this.#overviewCameraForTests = this.#fixedTime !== undefined;
        this.#framesUntilFreeze = this.#fixedTime !== undefined ? 2 : 0;
        delete document.documentElement.dataset.renderFrozen;
      },
      setBoatState: (state) => {
        Object.assign(this.#boatDynamics.state, state);
      },
      setStormFactor: (value) => {
        this.#setWeatherImmediate(THREE.MathUtils.clamp(value, 0, 1));
      },
      setWeather: (mode) => {
        this.#setWeatherImmediate(mode === 'storm' ? 1 : 0);
      },
      triggerLightning: (seed) => {
        this.#setWeatherImmediate(1);
        this.#lightningSimulation.setStormEnabled(true);
        this.#lightningSimulation.newFlash(seed);
      },
      setOverviewCamera: (enabled) => {
        this.#overviewCameraForTests = enabled;
      },
      forceOceanFallback: (enabled) => {
        this.#forceOceanFallback = enabled;
      },
      lockQuality: (tier) => {
        this.#quality.lock(tier);
        this.#applyQuality(this.#quality.tier);
      },
    };
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: () => undefined,
      setState: (name: string) => {
        if (name === 'showcase') {
          this.#fixedTime = 18;
          this.#overviewCameraForTests = true;
        }
      },
    };

    window.addEventListener('resize', this.#resize);
    window.addEventListener('keydown', this.#handleWeatherKey);
    this.#resize();
    this.#applyQuality(this.#quality.tier);
  }

  start(): void {
    this.#renderer.setAnimationLoop(this.#render);
  }

  #setWeatherImmediate(target: number): void {
    this.#weather.setTarget(target);
    for (let index = 0; index < 1_000; index += 1) {
      this.#weatherFrame = this.#weather.update(1 / 30, 0, this.#lightningRenderer.frame);
      if (Math.abs(this.#weatherFrame.stormFactor - target) < 1e-8) break;
    }
    this.#sea = this.#weatherFrame.sea;
  }

  #handleWeatherKey = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyT' || event.repeat) return;
    this.#weather.toggle();
    void this.#thunder.unlock();
  };

  #applyQuality(tier: RuntimeQualityTier): void {
    if (this.#appliedQuality === tier.name) return;
    this.#appliedQuality = tier.name;
    this.#rain.setQuality(tier.rainCount);
    this.#stormSky.setQuality(tier.cloudSteps);
    this.#lightningRenderer.setSecondaryLightning(tier.secondaryLightning);
    this.#wake.setDisplacementEnabled(tier.wakeDisplacement);
    if (this.#fftSize !== tier.fftSize || this.#fftCascades !== tier.fftCascades) {
      this.#spectral.dispose();
      this.#spectral = new SpectralOcean(this.#renderer, this.#waveField, {
        size: tier.fftSize,
        cascades: tier.fftCascades,
      });
      this.#fftSize = tier.fftSize;
      this.#fftCascades = tier.fftCascades;
      this.#spectralError = undefined;
    }
    this.#resize();
  }

  #resize = (): void => {
    const width = this.#mount.clientWidth;
    const height = this.#mount.clientHeight;
    const pixelRatio = effectivePixelRatio(
      devicePixelRatio,
      Math.min(this.#surfaceProfile.pixelRatioCap, this.#quality.tier.pixelRatioCap),
    );
    this.#camera.aspect = width / Math.max(1, height);
    this.#narrowView = this.#camera.aspect < 0.7;
    this.#camera.fov = this.#narrowView ? 64 : 47;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
    this.#pipeline.resize(width, height, pixelRatio);
    this.#lightningRenderer.setViewport(height * pixelRatio, this.#camera.fov);
  };

  #render = (): void => {
    this.#renderer.info.reset();
    this.#timer.update();
    const rawDeltaSeconds = Math.min(this.#timer.getDelta(), 0.25);
    const deltaSeconds = Math.min(rawDeltaSeconds, 1 / 30);
    const instantFps = 1 / Math.max(rawDeltaSeconds, 1 / 240);
    this.#smoothedFps = THREE.MathUtils.lerp(
      this.#smoothedFps,
      instantFps,
      1 - Math.exp(-rawDeltaSeconds * 2.2),
    );
    this.#applyQuality(this.#quality.update(rawDeltaSeconds, this.#smoothedFps));
    const time = this.#fixedTime ?? this.#timer.getElapsed();
    this.#lightningPhaseHold = Math.max(0, this.#lightningPhaseHold - deltaSeconds);
    let lightningFrame = EMPTY_LIGHTNING_FRAME;
    if (!this.#lightningFailed) {
      try {
        this.#lightningSimulation.setStormEnabled(this.#weather.lightningEnabled);
        this.#lightningSimulation.update(deltaSeconds);
        this.#lightningRenderer.update(
          this.#weather.lightningEnabled ? this.#lightningSimulation.channel : undefined,
          deltaSeconds,
        );
        lightningFrame = this.#lightningRenderer.frame;
      } catch (error) {
        this.#lightningError = error;
        this.#lightningFailed = true;
        this.#lightningSimulation.setStormEnabled(false);
      }
    }
    this.#weatherFrame = this.#weather.update(
      deltaSeconds,
      time,
      lightningFrame,
    );
    this.#sea = this.#weatherFrame.sea;
    for (const event of this.#lightningSimulation.events) {
      if (event.type !== 'first-stroke' || this.#thunderSeeds.has(event.seed)) continue;
      this.#thunderSeeds.add(event.seed);
      this.#lightningPhase = 'return-stroke';
      this.#lightningPhaseHold = 0.35;
      const channel = this.#lightningSimulation.channel;
      if (channel) {
        try {
          this.#thunder.schedule(channel, this.#camera.position, this.#lightningSimulation.map);
        } catch (error) {
          this.#audioError = error;
        }
      }
    }
    if (this.#lightningPhaseHold <= 0) {
      this.#lightningPhase = this.#lightningSimulation.telemetry?.phase ?? 'idle';
    }
    this.#island.update(time);
    const boat = this.#boatDynamics.update(
      deltaSeconds,
      time,
      this.#boatController.intent,
      this.#waveSampler,
      {
        windX: this.#weatherFrame.windX,
        windZ: this.#weatherFrame.windZ,
        stormFactor: this.#sea.stormFactor,
      },
    );
    this.#boatCollision = resolveBoatCollisions(this.#boatDynamics.state, this.#boatColliders);
    this.#collisionDiagnosticHold = this.#boatCollision.collided
      ? 0.75
      : Math.max(0, this.#collisionDiagnosticHold - deltaSeconds);
    const collisionReported = this.#boatCollision.collided || this.#collisionDiagnosticHold > 0;
    this.#yacht.update(boat);
    this.#wake.update(time, boat, this.#waveSampler);
    if (this.#overviewCameraForTests && this.#narrowView) {
      this.#camera.position.set(52 + Math.sin(time * 0.035) * 2, 42, 65 + Math.cos(time * 0.03) * 2);
      this.#camera.lookAt(11, 1.3, -25);
    } else if (this.#overviewCameraForTests) {
      this.#camera.position.x = 38 + Math.sin(time * 0.035) * 2.5;
      this.#camera.position.y = 27;
      this.#camera.position.z = 35 + Math.cos(time * 0.03) * 2.5;
      this.#camera.lookAt(0, 1.8, -26);
    } else {
      this.#chaseCamera.update(this.#camera, boat, deltaSeconds);
    }
    this.#stormSky.update(this.#weatherFrame, time);
    if (!this.#rainFailed) {
      try {
        this.#rain.update(this.#camera, time, this.#weatherFrame);
      } catch (error) {
        this.#rainError = error;
        this.#rainFailed = true;
        try { this.#rain.setIntensity(0); } catch { /* disabled fallback */ }
      }
    }
    let spectral: SpectralOceanFrame = {
      size: this.#fftSize,
      cascades: this.#fftCascades,
      available: false,
      error: this.#spectralError instanceof Error
        ? this.#spectralError.message
        : this.#spectralError ? String(this.#spectralError) : undefined,
    };
    if (!this.#forceOceanFallback) {
      try {
        spectral = this.#spectral.update(time, this.#sea);
        if (spectral.error) this.#spectralError ??= spectral.error;
      } catch (error) {
        this.#spectralError = error;
      }
    }
    this.#fftSize = spectral.size;
    this.#fftCascades = spectral.cascades;
    const spectralActive = !this.#forceOceanFallback
      && spectral.available
      && spectral.displacement !== undefined
      && spectral.slope !== undefined;
    this.#waterMode = spectralActive ? 'spectral' : 'gerstner';
    this.#water.setWaveComponents(this.#waveField.components(this.#sea.stormFactor));
    this.#water.setSeaState(this.#sea);
    this.#water.setLightning(this.#weatherFrame.lightning, this.#weatherFrame.flashExposure);
    this.#water.setSurfaceSource(spectralActive ? {
      displacement: spectral.displacement!,
      slope: spectral.slope!,
      farDisplacement: spectral.farDisplacement,
      farSlope: spectral.farSlope,
      size: spectral.size,
      cascades: spectral.cascades,
    } : undefined);
    this.#water.update(time, this.#camera.position.x, this.#camera.position.z);
    const bloom = bloomForStorm(this.#weatherFrame.stormFactor);
    this.#pipeline.setBloom(bloom.strength, bloom.threshold, bloom.radius);
    this.#renderer.toneMappingExposure = THREE.MathUtils.lerp(
      0.9,
      0.74,
      this.#weatherFrame.stormFactor,
    ) + Math.min(0.8, this.#weatherFrame.flashExposure) * 0.12;
    document.documentElement.dataset.weather = this.#weatherFrame.mode;
    this.#weatherLabel ??= this.#mount.querySelector<HTMLElement>('[data-weather-label]') ?? undefined;
    if (this.#weatherLabel) {
      this.#weatherLabel.textContent = this.#weatherFrame.mode === 'storm'
        ? `暴风雨 ${Math.round(this.#weatherFrame.stormFactor * 100)}% · 降雨 ${Math.round(this.#weatherFrame.rain * 100)}%`
        : '当前天气：晴朗';
    }
    this.#sceneStateElement.dataset.yachtX = this.#yacht.root.position.x.toFixed(4);
    this.#sceneStateElement.dataset.boatSpeed = Math.abs(boat.surge).toFixed(4);
    this.#sceneStateElement.dataset.boatYaw = boat.yaw.toFixed(4);
    this.#sceneStateElement.dataset.cameraMode = this.#overviewCameraForTests ? 'overview' : 'chase';
    this.#sceneStateElement.dataset.boatCollided = String(collisionReported);
    this.#sceneStateElement.dataset.boatShallow = String(this.#boatCollision.shallow);
    this.#sceneStateElement.dataset.stormFactor = this.#sea.stormFactor.toFixed(4);
    this.#sceneStateElement.dataset.weatherMode = this.#weatherFrame.mode;
    this.#sceneStateElement.dataset.rainCount = String(
      !this.#rainFailed && this.#weatherFrame.rain > 0.001 ? this.#rain.count : 0,
    );
    this.#sceneStateElement.dataset.lightningSegments = String(this.#lightningRenderer.segmentCount);
    this.#sceneStateElement.dataset.lightningPhysicsMs = this.#lightningSimulation.lastPhysicsMs.toFixed(3);
    this.#sceneStateElement.dataset.lightningPhase = this.#lightningPhase;
    this.#sceneStateElement.dataset.oceanLightCount = String(this.#weatherFrame.lightning.length);
    this.#sceneStateElement.dataset.audioStatus = this.#thunder.status;
    this.#sceneStateElement.dataset.qualityTier = this.#quality.tier.name;
    this.#sceneStateElement.dataset.qualityLocked = String(this.#quality.locked);
    this.#sceneStateElement.dataset.fogDensity = this.#weatherFrame.fogDensity.toFixed(5);
    this.#sceneStateElement.dataset.spectralError = this.#spectralError
      ? (this.#spectralError instanceof Error ? this.#spectralError.message : String(this.#spectralError))
      : '';
    this.#sceneStateElement.dataset.rainError = this.#rainError
      ? (this.#rainError instanceof Error ? this.#rainError.message : String(this.#rainError))
      : '';
    this.#sceneStateElement.dataset.windSpeed = this.#sea.windSpeed.toFixed(4);
    this.#sceneStateElement.dataset.significantWaveHeight = this.#sea.significantWaveHeight.toFixed(4);
    this.#sceneStateElement.dataset.waterMode = this.#waterMode;
    this.#sceneStateElement.dataset.fftSize = String(this.#fftSize);
    this.#sceneStateElement.dataset.fftCascades = String(this.#fftCascades);
    this.#sceneStateElement.dataset.yachtSource = this.#yacht.diagnostics.source;
    this.#sceneStateElement.dataset.islandSource = this.#island.diagnostics.source;
    this.#sceneStateElement.dataset.islandLod = this.#island.diagnostics.lod;
    this.#sceneStateElement.dataset.oceanProfile = this.#surfaceProfile.name;
    this.#sceneStateElement.dataset.waterLayers = String(this.#water.layerCount);
    this.#sceneStateElement.dataset.oceanDetailOctaves = '3';
    this.#sceneStateElement.dataset.shoreField = this.#island.diagnostics.shore;
    this.#sceneStateElement.dataset.antialiasSamples = String(this.#pipeline.antialiasSamples);
    this.#pipeline.render();
    this.#frame += 1;
    if (this.#frame >= 8 && this.#assetsReady && !this.#visualReadyPublished) {
      const diagnostics = collectDiagnostics(this.#renderer.info, this.#scene);
      this.#diagnosticsElement.dataset.renderer = JSON.stringify(diagnostics);
      document.documentElement.dataset.oceanReady = 'true';
      document.documentElement.dataset.visualReady = 'true';
      this.#visualReadyPublished = true;
    }
    const audioStatus = this.#audioError || this.#thunder.status === 'disposed'
      ? 'silent-error'
      : this.#thunder.status;
    const rainCount = !this.#rainFailed && this.#weatherFrame.rain > 0.001 ? this.#rain.count : 0;
    window.__THREE_GAME_DIAGNOSTICS__ = createSceneDiagnostics({
      renderer: {
        calls: this.#renderer.info.render.calls,
        triangles: this.#renderer.info.render.triangles,
        geometries: this.#renderer.info.memory.geometries,
        textures: this.#renderer.info.memory.textures,
        pixelRatio: this.#renderer.getPixelRatio(),
        fps: this.#smoothedFps,
      },
      water: {
        mode: this.#waterMode,
        fftSize: this.#fftSize,
        cascades: this.#fftCascades,
        stormFactor: this.#sea.stormFactor,
      },
      weather: {
        mode: this.#weatherFrame.mode,
        rainCount,
        fogDensity: this.#weatherFrame.fogDensity,
      },
      lightning: {
        phase: this.#lightningFailed ? 'disabled' : this.#lightningPhase,
        segments: this.#lightningFailed ? 0 : this.#lightningRenderer.segmentCount,
        physicsMs: this.#lightningSimulation.lastPhysicsMs,
        lightCount: this.#weatherFrame.lightning.length,
        error: this.#lightningError,
      },
      boat: {
        speed: Math.abs(boat.surge),
        yaw: boat.yaw,
        x: boat.x,
        z: boat.z,
        shallow: this.#boatCollision.shallow,
        collided: collisionReported,
      },
      audio: { status: audioStatus },
      quality: { tier: this.#quality.tier.name, locked: this.#quality.locked },
    });
    if (this.#framesUntilFreeze > 0) {
      this.#framesUntilFreeze -= 1;
      if (this.#framesUntilFreeze === 0) {
        document.documentElement.dataset.renderFrozen = 'true';
        this.#renderer.setAnimationLoop(null);
      }
    }
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#renderer.setAnimationLoop(null);
    delete window.__OCEAN_TEST_HOOKS__;
    delete window.__THREE_GAME_TEST_HOOKS__;
    delete window.__THREE_GAME_DIAGNOSTICS__;
    window.removeEventListener('resize', this.#resize);
    window.removeEventListener('keydown', this.#handleWeatherKey);
    this.#boatController.dispose();
    this.#spectral.dispose();
    this.#shoreField?.dispose();
    this.#water.dispose();
    this.#wake.dispose();
    this.#yacht.dispose();
    this.#island.dispose();
    this.#sky.dispose();
    this.#stormSky.dispose();
    this.#rain.dispose();
    this.#lightningRenderer.dispose();
    this.#thunder.dispose();
    for (const material of Object.values(this.#materials)) material.dispose();
    this.#environmentTarget.dispose();
    this.#pipeline.dispose();
    this.#timer.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  get backendLabel(): string {
    return this.#backend === 'webgpu'
      ? 'WebGPU 可用 · 当前使用 WebGL2 渲染'
      : '当前使用 WebGL2 渲染';
  }
}
