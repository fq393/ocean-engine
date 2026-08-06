import * as THREE from 'three';
import type { WaveComponent } from '../ocean/types';
import type { QualityProfile } from '../platform/quality';

const MAX_WAVES = 8;

export class GerstnerOcean extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  constructor(waves: readonly WaveComponent[], quality: QualityProfile) {
    const selected = waves.slice(0, MAX_WAVES);
    const waveData = Array.from({ length: MAX_WAVES }, (_, index) => {
      const wave = selected[index];
      return wave
        ? new THREE.Vector4(wave.directionX, wave.directionZ, wave.amplitude, wave.waveNumber)
        : new THREE.Vector4();
    });
    const waveMeta = Array.from({ length: MAX_WAVES }, (_, index) => {
      const wave = selected[index];
      return wave ? new THREE.Vector2(wave.angularFrequency, wave.phase) : new THREE.Vector2();
    });
    const geometry = new THREE.PlaneGeometry(
      quality.oceanSizeMeters,
      quality.oceanSizeMeters,
      quality.oceanSegments,
      quality.oceanSegments,
    );
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaveCount: { value: selected.length },
        uWaves: { value: waveData },
        uWaveMeta: { value: waveMeta },
        uDeepColor: { value: new THREE.Color('#07506b') },
        uShallowColor: { value: new THREE.Color('#33bdd0') },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
      },
      vertexShader: `
        #define MAX_WAVES 8
        uniform float uTime;
        uniform int uWaveCount;
        uniform vec4 uWaves[MAX_WAVES];
        uniform vec2 uWaveMeta[MAX_WAVES];
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        void main() {
          vec3 displaced = position;
          vec3 tangentX = vec3(1.0, 0.0, 0.0);
          vec3 tangentZ = vec3(0.0, 0.0, 1.0);
          for (int index = 0; index < MAX_WAVES; index++) {
            if (index >= uWaveCount) break;
            vec4 wave = uWaves[index];
            vec2 meta = uWaveMeta[index];
            float theta = wave.w * dot(wave.xy, position.xz) - meta.x * uTime + meta.y;
            float slope = wave.z * wave.w * cos(theta);
            displaced.y += wave.z * sin(theta);
            tangentX.y += slope * wave.x;
            tangentZ.y += slope * wave.y;
          }
          vec4 world = modelMatrix * vec4(displaced, 1.0);
          vWorldPosition = world.xyz;
          vNormal = normalize(mat3(modelMatrix) * cross(tangentZ, tangentX));
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSunDirection;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.0);
          float diffuse = 0.35 + 0.65 * max(dot(normal, uSunDirection), 0.0);
          float sparkle = pow(max(dot(reflect(-uSunDirection, normal), viewDirection), 0.0), 180.0);
          vec3 water = mix(uShallowColor, uDeepColor, 0.55 + 0.35 * fresnel) * diffuse;
          vec3 sky = vec3(0.48, 0.76, 0.9);
          gl_FragColor = vec4(mix(water, sky, fresnel * 0.7) + sparkle * 1.8, 1.0);
        }
      `,
    });
    super(geometry, material);
    this.frustumCulled = false;
  }

  update(timeSeconds: number): void {
    this.material.uniforms.uTime!.value = timeSeconds;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
