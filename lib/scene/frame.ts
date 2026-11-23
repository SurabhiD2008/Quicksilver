import { Clock, Vector2 } from 'three';
import {
  cameraGoal,
  easeFactor,
  lerp,
  storyState,
  studioRotation,
  surfaceTension,
  type StoryState,
} from './story.ts';
import { updateBeads, updateDroplets } from './props.ts';
import { renderWorld, type World } from './world.ts';

// Per-frame update: everything the drop, the room, the camera and the HUD do
// is derived from the story fraction and the clock.

export interface StageState {
  fraction: number;
  reduced: boolean;
  isTouch: boolean;
  pointerPx: { x: number; y: number };
  ndc: Vector2;
  distance: number;
  cursor: { x: number; y: number };
}

export interface HudElements {
  tension: HTMLElement | null;
  tensionBar: HTMLElement | null;
  wordmark: HTMLElement | null;
  cursor: HTMLElement | null;
}

function updateDrop(world: World, s: StoryState, dt: number, t: number, reduced: boolean) {
  const { blob } = world;
  const shrink = lerp(1.0, 0.34, s.fracture);
  const flatZ = lerp(1.0, 0.16, s.plaque);
  const flatXY = lerp(1.0, 1.35, s.plaque);
  blob.scale.set(1.5 * shrink * flatXY, 1.5 * shrink * flatXY, 1.5 * shrink * flatZ);
  blob.rotation.y += dt * (reduced ? 0.03 : 0.12) * (1 + s.heat);
  blob.rotation.x = Math.sin(t * 0.12) * 0.12 * (1 - s.plaque);
  blob.rotation.x = lerp(blob.rotation.x, 0, s.plaque);
  blob.rotation.y = lerp(blob.rotation.y, 0, s.plaque * 0.85);
  blob.rotation.z = lerp(0, Math.sin(t * 0.2) * 0.05, 1 - s.plaque);
}

function updateRoom(world: World, s: StoryState, f: number, t: number, reduced: boolean) {
  const { scene, background, drop, droplet, glow, bead, env, blob } = world;
  glow.mesh.scale.setScalar(11 + Math.sin(t * 0.4) * 0.5 + s.heat * 2.0);
  const b = s.bgBlend;
  if (scene.background && 'lerp' in scene.background) {
    scene.background.copy(background.warm).lerp(background.cool, b);
    bead.uniforms.uHaze.value.copy(scene.background);
  }
  drop.uniforms.uTint.value.setRGB(lerp(1.0, 0.82, b), lerp(0.85, 0.9, b), lerp(0.75, 1.0, b));
  glow.uniforms.uColor.value.setRGB(lerp(1.0, 0.82, b), lerp(0.92, 0.94, b), lerp(0.9, 1.1, b));
  env.uEnvRot.value = studioRotation(f, t, reduced);
  // As the drop presses flat, tip the studio so the horizon seam clears the
  // wordmark and the name sits on dark mirror.
  env.uEnvTilt.value = s.plaque * -0.14;
  droplet.uniforms.uBlobR.value = blob.scale.x * (1 - 0.55 * s.plaque);
}

function updateCamera(world: World, state: StageState, s: StoryState, dt: number) {
  const px = (state.pointerPx.x / window.innerWidth) * 2 - 1;
  const py = (state.pointerPx.y / window.innerHeight) * 2 - 1;
  const par = state.reduced ? 0.05 : 0.36;
  const goal = cameraGoal(state.fraction, s.plaque, state.distance, state.reduced, {
    x: px * par,
    y: -py * par,
  });
  const k = easeFactor(dt, 3.5);
  const { camera } = world;
  camera.position.set(
    lerp(camera.position.x, goal.x, k),
    lerp(camera.position.y, goal.y, k),
    lerp(camera.position.z, goal.z, k),
  );
  camera.lookAt(0, 0, 0);
}

function updateHud(hud: HudElements, state: StageState, s: StoryState, dt: number) {
  if (hud.tension) hud.tension.textContent = `${surfaceTension(s.heat)}%`;
  if (hud.tensionBar) hud.tensionBar.style.transform = `scaleX(${1 - s.heat})`;
  if (hud.wordmark) hud.wordmark.style.opacity = String(s.reveal);
  if (!state.isTouch && hud.cursor) {
    const k = state.reduced ? 1 : easeFactor(dt, 22);
    state.cursor.x = lerp(state.cursor.x, state.pointerPx.x, k);
    state.cursor.y = lerp(state.cursor.y, state.pointerPx.y, k);
    hud.cursor.style.transform = `translate3d(${state.cursor.x}px, ${state.cursor.y}px, 0)`;
  }
}

/** Starts the render loop; returns a function that stops it. */
export function startLoop(world: World, state: StageState, hud: HudElements): () => void {
  const clock = new Clock();
  let frameNumber = 0;
  let rafId = 0;
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    world.drop.uniforms.uTime.value = t;
    const s = storyState(state.fraction);
    world.drop.uniforms.uHeat.value = s.heat;
    updateDrop(world, s, dt, t, state.reduced);
    updateDroplets(world.droplets, dt, t, s.fracture, state.reduced);
    updateBeads(world.beads, dt, t, state.reduced);
    updateRoom(world, s, state.fraction, t, state.reduced);
    updateCamera(world, state, s, dt);
    updateHud(hud, state, s, dt);
    renderWorld(world, frameNumber++);
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}
