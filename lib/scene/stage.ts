import { Vector2 } from 'three';
import { currentZone } from '../client/analytics.ts';
import { hudLabel, scrollFraction } from '../shared/zones.ts';
import { startLoop, type HudElements, type StageState } from './frame.ts';
import { createRipples } from './ripples.ts';
import { restingDistance } from './story.ts';
import { acquireContext, createWorld, disposeWorld, type World } from './world.ts';

// Mounts the liquid-metal scene into a holder element and wires it to the
// page: pointer, scroll, resize, reduced-motion changes and context loss.

export interface StageHooks {
  onContextLost: () => void;
  onContextRestored: () => void;
}

type Cleanup = () => void;

function listen<K extends string>(
  cleanups: Cleanup[],
  target: EventTarget,
  type: K,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions,
) {
  target.addEventListener(type, handler, options);
  cleanups.push(() => target.removeEventListener(type, handler, options));
}

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function attachPointer(world: World, state: StageState, cleanups: Cleanup[]) {
  const ripple = createRipples(world.drop.uniforms, world.blob, world.camera);
  const fromEvent = (e: Event) => {
    if (!(e instanceof PointerEvent)) return;
    state.pointerPx.x = e.clientX;
    state.pointerPx.y = e.clientY;
    state.ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
  };
  // A press or tap always makes a firmer ripple, on every device.
  listen(cleanups, window, 'pointerdown', (e) => {
    fromEvent(e);
    ripple(state.ndc, 1.8, performance.now());
  });
  // Hover ripples and parallax only on true pointer devices, so a touch drag
  // (which is a scroll) never fights the ripples.
  if (state.isTouch) return;
  document.body.classList.add('custom-cursor');
  cleanups.push(() => document.body.classList.remove('custom-cursor'));
  listen(cleanups, window, 'pointermove', (e) => {
    fromEvent(e);
    ripple(state.ndc, 1.0, performance.now());
  });
  const cursor = document.getElementById('cursor');
  listen(cleanups, window, 'pointerout', (e) => {
    if (e instanceof PointerEvent && !e.relatedTarget) cursor?.classList.add('hidden');
  });
  listen(cleanups, window, 'pointerover', () => cursor?.classList.remove('hidden'));
}

function attachScroll(state: StageState, cleanups: Cleanup[]) {
  const epilogue = document.getElementById('epilogue');
  const before = epilogue?.previousElementSibling;
  const story = before instanceof HTMLElement ? before : null;
  const zoneLabel = document.getElementById('zone');
  const sections = Array.from(document.querySelectorAll('main > section'));
  const update = () => {
    if (story) {
      state.fraction = scrollFraction(
        window.scrollY,
        story.offsetTop + story.offsetHeight,
        window.innerHeight,
      );
    }
    const label = hudLabel(currentZone(sections, window.innerHeight));
    if (zoneLabel && zoneLabel.textContent !== label) zoneLabel.textContent = label;
  };
  listen(cleanups, window, 'scroll', update, { passive: true });
  update();
}

function attachResize(world: World, state: StageState, cleanups: Cleanup[]) {
  const { renderer, camera, post } = world;
  const canvas = renderer.domElement;
  const sync = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = renderer.getPixelRatio();
    const bw = Math.floor(w * pr);
    const bh = Math.floor(h * pr);
    if (w <= 0 || h <= 0 || (canvas.width === bw && canvas.height === bh)) return;
    renderer.setSize(w, h, false);
    post.resize(bw, bh);
    camera.aspect = w / h;
    state.distance = restingDistance(camera.aspect);
    camera.updateProjectionMatrix();
  };
  listen(cleanups, window, 'resize', sync);
  const observer = new ResizeObserver(sync);
  observer.observe(document.documentElement);
  cleanups.push(() => observer.disconnect());
  sync();
}

function attachReducedMotion(world: World, state: StageState, cleanups: Cleanup[]) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  listen(cleanups, query, 'change', () => {
    state.reduced = query.matches;
    world.drop.uniforms.uReduced.value = query.matches ? 1 : 0;
  });
}

function initialState(): StageState {
  const centre = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return {
    fraction: 0,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isTouch: window.matchMedia('(max-width: 760px), (pointer: coarse)').matches,
    pointerPx: { ...centre },
    ndc: new Vector2(0, 0),
    distance: 5.6,
    cursor: { ...centre },
  };
}

function hudElements(): HudElements {
  return {
    tension: document.getElementById('tension'),
    tensionBar: document.getElementById('tensionBar'),
    wordmark: document.getElementById('wordmark-wrap'),
    cursor: document.getElementById('cursor'),
  };
}

/** Mounts the scene, or returns null when the browser has no WebGL. */
export function mountStage(holder: HTMLElement, hooks: StageHooks): { dispose: () => void } | null {
  const canvas = document.createElement('canvas');
  canvas.id = 'stage';
  const context = acquireContext(canvas);
  if (!context) return null;
  holder.appendChild(canvas);
  const state = initialState();
  const palette = { warm: cssToken('--scene-bg-warm'), cool: cssToken('--scene-bg-cool') };
  const world = createWorld(canvas, context, {
    reduced: state.reduced,
    isTouch: state.isTouch,
    palette,
  });
  const cleanups: Cleanup[] = [];
  attachPointer(world, state, cleanups);
  attachScroll(state, cleanups);
  attachResize(world, state, cleanups);
  attachReducedMotion(world, state, cleanups);
  let stop = startLoop(world, state, hudElements());
  listen(cleanups, canvas, 'webglcontextlost', (event) => {
    event.preventDefault();
    stop();
    stop = () => undefined;
    document.body.classList.remove('custom-cursor');
    hooks.onContextLost();
  });
  listen(cleanups, canvas, 'webglcontextrestored', hooks.onContextRestored);
  return {
    dispose() {
      stop();
      cleanups.forEach((fn) => fn());
      disposeWorld(world);
      canvas.remove();
    },
  };
}
