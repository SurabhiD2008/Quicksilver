import {
  AdditiveBlending,
  Color,
  type IUniform,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  Vector3,
} from 'three';
import { MAX_RIPPLES, METAL_FRAGMENT, METAL_VERTEX } from './glsl/metal.ts';
import { BEAD_FRAGMENT, BEAD_VERTEX, GLOW_FRAGMENT, GLOW_VERTEX } from './glsl/props.ts';

// Shader materials for the drop, the droplets, the beads and the backlight.
// Uniform objects are shared where surfaces must agree (time, studio angle).

export interface EnvUniforms {
  uEnvRot: IUniform<number>;
  uEnvTilt: IUniform<number>;
}

export interface MetalUniforms extends EnvUniforms {
  [name: string]: IUniform;
  uTime: IUniform<number>;
  uHeat: IUniform<number>;
  uReduced: IUniform<number>;
  uBlobR: IUniform<number>;
  uTint: IUniform<Color>;
  uRippleTime: IUniform<number[]>;
  uRipplePos: IUniform<Vector3[]>;
  uRippleStr: IUniform<number[]>;
}

function rippleSlots() {
  return {
    uRippleTime: { value: new Array<number>(MAX_RIPPLES).fill(-100) },
    uRipplePos: { value: Array.from({ length: MAX_RIPPLES }, () => new Vector3(1, 0, 0)) },
    uRippleStr: { value: new Array<number>(MAX_RIPPLES).fill(0) },
  };
}

export function createEnvUniforms(): EnvUniforms {
  return { uEnvRot: { value: 0 }, uEnvTilt: { value: 0 } };
}

/** The main drop: mirror of the studio plus a live cube capture of its surroundings. */
export function createDropMaterial(env: EnvUniforms, reduced: boolean, cube: Texture) {
  const uniforms: MetalUniforms = {
    uTime: { value: 0 },
    uHeat: { value: 0 },
    uReduced: { value: reduced ? 1 : 0 },
    uEnvRot: env.uEnvRot,
    uEnvTilt: env.uEnvTilt,
    uBlobR: { value: 0 },
    uCube: { value: cube },
    uTint: { value: new Color('#ffd9c0') },
    ...rippleSlots(),
  };
  const material = new ShaderMaterial({
    vertexShader: METAL_VERTEX,
    fragmentShader: METAL_FRAGMENT,
    uniforms,
    defines: { USE_CUBE: 1 },
  });
  return { uniforms, material };
}

/** The orbiting droplets: same metal, reflecting the main drop analytically. */
export function createDropletMaterial(env: EnvUniforms, shared: MetalUniforms) {
  const uniforms: MetalUniforms = {
    uTime: shared.uTime,
    uHeat: { value: 0.2 },
    uReduced: shared.uReduced,
    uEnvRot: env.uEnvRot,
    uEnvTilt: env.uEnvTilt,
    uBlobR: { value: 1.5 },
    uTint: { value: new Color('#cfe4ff') },
    ...rippleSlots(),
  };
  const material = new ShaderMaterial({
    vertexShader: METAL_VERTEX,
    fragmentShader: METAL_FRAGMENT,
    uniforms,
  });
  return { uniforms, material };
}

export function createBeadMaterial(env: EnvUniforms, blobRadius: IUniform<number>, haze: Color) {
  const uniforms = {
    uEnvRot: env.uEnvRot,
    uEnvTilt: env.uEnvTilt,
    uBlobR: blobRadius,
    uHaze: { value: haze.clone() },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: BEAD_VERTEX,
    fragmentShader: BEAD_FRAGMENT,
  });
  return { uniforms, material };
}

/** Soft backlight halo behind the drop, drawn first and added on top. */
export function createGlow() {
  const uniforms = { uColor: { value: new Color(1, 1, 1) } };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.position.set(0, 0.3, -3.2);
  mesh.scale.setScalar(11);
  mesh.renderOrder = -1;
  return { mesh, uniforms, material };
}
