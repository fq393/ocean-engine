import * as THREE from 'three';

export interface SkyPalette {
  readonly top: THREE.ColorRepresentation;
  readonly horizon: THREE.ColorRepresentation;
  readonly sun: THREE.ColorRepresentation;
}

export class SkySystem {
  readonly root = new THREE.Group();
  readonly top = new THREE.Color('#3b91cf');
  readonly horizon = new THREE.Color('#c9edf3');
  readonly sun = new THREE.Color('#fff1c7');
  readonly #domeGeometry: THREE.SphereGeometry;
  readonly #domeMaterial: THREE.ShaderMaterial;
  readonly #clearCloudGeometry: THREE.PlaneGeometry;
  readonly #clearCloudMaterial: THREE.ShaderMaterial;

  constructor() {
    this.root.name = 'sky';
    const uniforms = {
      uTop: { value: this.top },
      uHorizon: { value: this.horizon },
      uSunColor: { value: this.sun },
      uSunDir: { value: new THREE.Vector3(-0.42, 0.46, -0.68).normalize() },
    };
    this.#domeGeometry = new THREE.SphereGeometry(850, 40, 20);
    this.#domeMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir;
        void main(){
          float h=clamp(vDir.y*0.5+0.5,0.0,1.0);
          vec3 col=mix(uHorizon,uTop,pow(h,0.72));
          float d=clamp(dot(normalize(vDir),normalize(uSunDir)),0.0,1.0);
          col+=uSunColor*(pow(d,900.0)+pow(d,10.0)*0.22);
          gl_FragColor=vec4(col,1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(this.#domeGeometry, this.#domeMaterial);
    dome.frustumCulled = false;
    this.root.add(dome);

    this.#clearCloudMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0.48 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uOpacity;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
        }
        float fbm(vec2 p){
          float value=0.0, amplitude=0.52;
          for(int i=0;i<5;i++){value+=noise(p)*amplitude;p=p*2.03+13.7;amplitude*=0.48;}
          return value;
        }
        void main(){
          vec2 uv=vUv;
          float edge=smoothstep(0.0,0.16,uv.x)*smoothstep(0.0,0.16,1.0-uv.x)*smoothstep(0.0,0.22,uv.y)*smoothstep(0.0,0.22,1.0-uv.y);
          float body=fbm(vec2(uv.x*7.4,uv.y*4.2)+vec2(2.7,8.1));
          float wisps=fbm(vec2(uv.x*14.0,uv.y*7.0)+vec2(19.0,4.0));
          float alpha=smoothstep(0.5,0.72,body*0.82+wisps*0.28)*edge*uOpacity;
          vec3 color=mix(vec3(0.78,0.88,0.91),vec3(1.0),smoothstep(0.4,0.85,body));
          gl_FragColor=vec4(color,alpha);
        }
      `,
    });
    this.#clearCloudGeometry = new THREE.PlaneGeometry(560, 105, 1, 1);
    const cloudBank = new THREE.Mesh(this.#clearCloudGeometry, this.#clearCloudMaterial);
    cloudBank.position.set(-25, 67, -325);
    cloudBank.renderOrder = -1;
    const cloudWisps = new THREE.Mesh(this.#clearCloudGeometry, this.#clearCloudMaterial);
    cloudWisps.position.set(145, 45, -270);
    cloudWisps.scale.set(0.8, 0.75, 1);
    cloudWisps.renderOrder = -1;
    this.root.add(cloudBank, cloudWisps);
  }

  setPalette(palette: SkyPalette): void {
    this.top.set(palette.top);
    this.horizon.set(palette.horizon);
    this.sun.set(palette.sun);
  }

  setClearCloudOpacity(value: number): void {
    this.#clearCloudMaterial.uniforms.uOpacity!.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  dispose(): void {
    this.#domeGeometry.dispose();
    this.#domeMaterial.dispose();
    this.#clearCloudGeometry.dispose();
    this.#clearCloudMaterial.dispose();
  }
}

export function createSky(): SkySystem {
  return new SkySystem();
}
