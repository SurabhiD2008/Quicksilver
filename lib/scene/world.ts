import {
  type BufferGeometry,
  type Color,
  HalfFloatType,
  IcosahedronGeometry,
  type Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  type TextureDataType,
  UnsignedByteType,
  WebGLRenderer,
} from 'three';
import {
  createBeadMaterial,
  createDropletMaterial,
  createDropMaterial,
  createEnvUniforms,
  createGlow,
  type EnvUniforms,
  type MetalUniforms,
} from './materials.ts';
import { createCubeCapture, createPost } from './post.ts';
import { createBeads, createDroplets } from './props.ts';
import { sceneColor } from './tone.ts';

// Builds everything the scene needs once: renderer, camera, meshes, materials,
// the cube capture and the post chain.

export interface WorldOptions {
  reduced: boolean;
  isTouch: boolean;
  /** Warm and cool studio background tones, as CSS hex values from the design tokens. */
  palette: { warm: string; cool: string };
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  depth: true,
  stencil: true,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

/** A WebGL context for the canvas, or null when the browser cannot provide one. */
export function acquireContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  return (
    canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) ??
    canvas.getContext('webgl', CONTEXT_ATTRIBUTES)
  );
}

function createRenderer(canvas: HTMLCanvasElement, context: WebGLRenderingContext) {
  const renderer = new WebGLRenderer({ canvas, context, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  // Linear HDR buffers need float render targets; fall back to 8-bit if not.
  const gl2 = renderer.capabilities.isWebGL2;
  const hdr = gl2
    ? renderer.extensions.has('EXT_color_buffer_float')
    : renderer.extensions.has('EXT_color_buffer_half_float') &&
      renderer.extensions.has('OES_texture_half_float_linear');
  const bufferType: TextureDataType = hdr ? HalfFloatType : UnsignedByteType;
  return { renderer, bufferType, multisample: gl2 && hdr };
}

function createBackground(palette: WorldOptions['palette']) {
  return { warm: sceneColor(palette.warm), cool: sceneColor(palette.cool) };
}

function createProps(
  scene: Scene,
  env: EnvUniforms,
  dropUniforms: MetalUniforms,
  haze: Color,
  isTouch: boolean,
) {
  const droplet = createDropletMaterial(env, dropUniforms);
  const { droplets, geometry: dropletGeometry } = createDroplets(scene, droplet.material);
  const bead = createBeadMaterial(env, droplet.uniforms.uBlobR, haze);
  const { beads, geometry: beadGeometry } = createBeads(scene, bead.material, isTouch ? 16 : 34);
  const glow = createGlow();
  scene.add(glow.mesh);
  return {
    parts: { droplet, droplets, bead, beads, glow },
    geometries: [dropletGeometry, beadGeometry, glow.mesh.geometry],
    materials: [droplet.material, bead.material, glow.material],
  };
}

export function createWorld(
  canvas: HTMLCanvasElement,
  context: WebGLRenderingContext,
  options: WorldOptions,
) {
  const { renderer, bufferType, multisample } = createRenderer(canvas, context);
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 5.6);
  const background: { warm: Color; cool: Color } = createBackground(options.palette);
  scene.background = background.warm.clone();

  const env = createEnvUniforms();
  const cube = createCubeCapture(scene, bufferType, options.isTouch);
  const drop = createDropMaterial(env, options.reduced, cube.texture);
  const blobGeometry = new IcosahedronGeometry(1, 48);
  const blob = new Mesh(blobGeometry, drop.material);
  blob.scale.setScalar(1.5);
  scene.add(blob);

  const props = createProps(scene, env, drop.uniforms, background.warm, options.isTouch);
  const post = createPost(renderer, {
    bufferType,
    multisample,
    isTouch: options.isTouch,
    time: drop.uniforms.uTime,
  });
  const geometries: BufferGeometry[] = [blobGeometry, ...props.geometries];
  const materials: Material[] = [drop.material, ...props.materials];
  return {
    renderer,
    scene,
    camera,
    background,
    env,
    cube,
    drop,
    blob,
    ...props.parts,
    post,
    geometries,
    materials,
  };
}

export type World = ReturnType<typeof createWorld>;

export function disposeWorld(world: World): void {
  world.geometries.forEach((g) => g.dispose());
  world.materials.forEach((m) => m.dispose());
  world.cube.dispose();
  world.post.dispose();
  world.renderer.dispose();
}

export function renderWorld(world: World, frameNumber: number): void {
  if (frameNumber % world.cube.every === 0) {
    world.cube.capture(world.renderer, [world.blob, world.glow.mesh]);
  }
  world.post.render(world.scene, world.camera);
}
