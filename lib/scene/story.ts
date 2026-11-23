// The scroll choreography as pure functions of the story fraction f (0 at the
// top of the page, 1 at the end of Reformation). Everything the drop does is
// derived here, so the timeline can be tested without a GPU.

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface StoryState {
  /** Warmth of the metal: rises through Molten, partly cools for the plaque. */
  heat: number;
  /** How far the drop has burst into orbiting droplets. */
  fracture: number;
  /** How far the reformed drop has pressed flat into a plaque. */
  plaque: number;
  /** Opacity of the QUICKSILVER wordmark. */
  reveal: number;
  /** Background blend from the warm to the cool studio tone. */
  bgBlend: number;
}

export function storyState(f: number): StoryState {
  const rise = smoothstep(0.1, 0.42, f);
  const cool = smoothstep(0.8, 0.99, f);
  return {
    heat: rise * (1.0 - 0.6 * cool),
    fracture: smoothstep(0.46, 0.62, f) * (1.0 - smoothstep(0.72, 0.9, f)),
    plaque: smoothstep(0.82, 0.97, f),
    reveal: smoothstep(0.84, 0.98, f),
    bgBlend: smoothstep(0.35, 0.75, f),
  };
}

/** The HUD's surface tension: an honest percentage of the value driving the shader. */
export function surfaceTension(heat: number): number {
  return Math.round((1 - heat) * 100);
}

/** Resting camera distance; on tall, narrow screens it pulls back so the drop fits the width. */
export function restingDistance(aspect: number): number {
  return 5.6 * Math.max(1, 0.82 / aspect);
}

/**
 * Where the camera heads for a given story position: it orbits around the
 * drop, rises a little and pushes in through the middle acts, and comes back
 * square-on for the plaque. Pointer parallax rides on top.
 */
export function cameraGoal(
  f: number,
  plaque: number,
  distance: number,
  reduced: boolean,
  parallax: { x: number; y: number },
): { x: number; y: number; z: number } {
  const orbit = reduced ? 0.25 : 1;
  const yaw = Math.sin(f * Math.PI * 2) * 0.42 * orbit;
  const pitch = Math.sin(f * Math.PI) * 0.13 * orbit * (1 - plaque);
  const dist = distance * (1 - 0.08 * Math.sin(f * Math.PI) * orbit);
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * dist + parallax.x,
    y: Math.sin(pitch) * dist + parallax.y,
    z: Math.cos(yaw) * Math.cos(pitch) * dist,
  };
}

/**
 * The studio swings around the metal as the story advances, so the key light
 * always sits on the side away from the copy (sections alternate sides).
 */
export function studioRotation(f: number, time: number, reduced: boolean): number {
  return -0.75 * Math.cos(f * Math.PI * 3) + (reduced ? 0 : Math.sin(time * 0.07) * 0.14);
}

/** Frame-rate independent smoothing factor for exponential easing. */
export function easeFactor(dt: number, rate: number): number {
  return 1 - Math.exp(-dt * rate);
}
