import {
  type Camera,
  CubeCamera,
  type IUniform,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  type Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type TextureDataType,
  Vector2,
  WebGLCubeRenderTarget,
  WebGLMultisampleRenderTarget,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import {
  DOWN_FRAGMENT,
  FINAL_FRAGMENT,
  FS_VERTEX,
  PREFILTER_FRAGMENT,
  UP_FRAGMENT,
} from './glsl/post.ts';

// HDR post chain: scene into a multisampled half-float target, a soft-knee
// bloom pyramid, then tone-mapping and the lens finish in one final pass.

export interface PostOptions {
  bufferType: TextureDataType;
  multisample: boolean;
  isTouch: boolean;
  time: IUniform<number>;
}

const texel = () => ({ value: new Vector2() });
const tex = () => ({ value: null });

function passMaterial(fragmentShader: string, uniforms: Record<string, IUniform>) {
  return new ShaderMaterial({
    vertexShader: FS_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

function createTargets(renderer: WebGLRenderer, options: PostOptions, levels: number) {
  const rtOpts = {
    format: RGBAFormat,
    type: options.bufferType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  let sceneRT: WebGLRenderTarget;
  if (options.multisample) {
    const ms = new WebGLMultisampleRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });
    ms.samples = options.isTouch || renderer.getPixelRatio() >= 2 ? 2 : 4;
    sceneRT = ms;
  } else {
    sceneRT = new WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });
  }
  const down: WebGLRenderTarget[] = [];
  const up: WebGLRenderTarget[] = [];
  for (let i = 0; i < levels; i++) {
    down.push(new WebGLRenderTarget(4, 4, rtOpts));
    if (i < levels - 1) up.push(new WebGLRenderTarget(4, 4, rtOpts));
  }
  return { sceneRT, down, up };
}

function createPasses(time: IUniform<number>) {
  return {
    prefilter: passMaterial(PREFILTER_FRAGMENT, { tSrc: tex(), uTexel: texel() }),
    down: passMaterial(DOWN_FRAGMENT, { tSrc: tex(), uTexel: texel() }),
    up: passMaterial(UP_FRAGMENT, { tSrc: tex(), tBase: tex(), uTexel: texel() }),
    final: passMaterial(FINAL_FRAGMENT, {
      tScene: tex(),
      tBloom: tex(),
      uBloom: { value: 0.1 },
      uTime: time,
      uRes: { value: new Vector2(1, 1) },
    }),
  };
}

type Passes = ReturnType<typeof createPasses>;
type Blit = (material: ShaderMaterial, target: WebGLRenderTarget | null) => void;

function setTexel(material: ShaderMaterial, source: WebGLRenderTarget, scale: number) {
  material.uniforms.uTexel.value.set(scale / source.width, scale / source.height);
}

/** Bright-pass, a downsample pyramid, then tent upsampling back up; returns the result. */
function createBloom(
  passes: Passes,
  sceneRT: WebGLRenderTarget,
  down: WebGLRenderTarget[],
  up: WebGLRenderTarget[],
  blit: Blit,
) {
  const levels = down.length;
  return (): WebGLRenderTarget => {
    const first = down[0] ?? sceneRT;
    passes.prefilter.uniforms.tSrc.value = sceneRT.texture;
    setTexel(passes.prefilter, first, 0.5);
    blit(passes.prefilter, first);
    for (let i = 1; i < levels; i++) {
      const source = down[i - 1] ?? first;
      passes.down.uniforms.tSrc.value = source.texture;
      setTexel(passes.down, source, 1);
      blit(passes.down, down[i] ?? first);
    }
    let wide = down[levels - 1] ?? first;
    for (let i = levels - 2; i >= 0; i--) {
      passes.up.uniforms.tSrc.value = wide.texture;
      passes.up.uniforms.tBase.value = (down[i] ?? first).texture;
      setTexel(passes.up, wide, 1);
      wide = up[i] ?? wide;
      blit(passes.up, wide);
    }
    return wide;
  };
}

export function createPost(renderer: WebGLRenderer, options: PostOptions) {
  const levels = options.isTouch ? 4 : 5;
  const { sceneRT, down, up } = createTargets(renderer, options, levels);
  const passes = createPasses(options.time);
  const fsCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeometry = new PlaneGeometry(2, 2);
  const fsMesh = new Mesh(fsGeometry, passes.prefilter);
  fsMesh.frustumCulled = false;
  const fsScene = new Scene();
  fsScene.add(fsMesh);

  const blit: Blit = (material, target) => {
    fsMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCamera);
  };
  const bloom = createBloom(passes, sceneRT, down, up, blit);

  return {
    render(scene: Scene, camera: Camera) {
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      const bloomed = bloom();
      passes.final.uniforms.tScene.value = sceneRT.texture;
      passes.final.uniforms.tBloom.value = bloomed.texture;
      blit(passes.final, null);
    },
    resize(width: number, height: number) {
      sceneRT.setSize(width, height);
      for (let i = 0; i < levels; i++) {
        const w = Math.max(2, width >> (i + 1));
        const h = Math.max(2, height >> (i + 1));
        down[i]?.setSize(w, h);
        up[i]?.setSize(w, h);
      }
      passes.final.uniforms.uRes.value.set(width, height);
    },
    dispose() {
      sceneRT.dispose();
      [...down, ...up].forEach((rt) => rt.dispose());
      Object.values(passes).forEach((m) => m.dispose());
      fsGeometry.dispose();
    },
  };
}

/**
 * Live reflections: a cube capture from the centre of the drop. Only the
 * droplets and beads are captured, on transparent black, so the studio itself
 * stays analytically sharp and this map can stay small.
 */
export function createCubeCapture(scene: Scene, bufferType: TextureDataType, isTouch: boolean) {
  const target = new WebGLCubeRenderTarget(isTouch ? 128 : 256, {
    format: RGBAFormat,
    type: bufferType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  });
  const camera = new CubeCamera(0.05, 40, target);
  scene.add(camera);
  return {
    texture: target.texture,
    every: isTouch ? 2 : 1,
    capture(renderer: WebGLRenderer, hidden: Object3D[]) {
      const background = scene.background;
      scene.background = null;
      hidden.forEach((o) => (o.visible = false));
      camera.update(renderer, scene);
      hidden.forEach((o) => (o.visible = true));
      scene.background = background;
    },
    dispose: () => target.dispose(),
  };
}
