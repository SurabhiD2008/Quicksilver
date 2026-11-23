import { type Camera, type Mesh, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { MAX_RIPPLES } from './glsl/metal.ts';
import type { MetalUniforms } from './materials.ts';

// Touch ripples. The point under the pointer comes from an analytic ray/sphere
// hit against the drop's bounding sphere: O(1), so pointer movement never
// hitches the frame the way raycasting the ~48k-triangle mesh would.

const MIN_INTERVAL_MS = 100;

export function createRipples(uniforms: MetalUniforms, blob: Mesh, camera: Camera) {
  const raycaster = new Raycaster();
  const sphere = new Sphere(new Vector3(0, 0, 0), 1.5);
  const hit = new Vector3();
  let slot = 0;
  let last = 0;

  return function ripple(ndc: Vector2, strength: number, nowMs: number): boolean {
    if (nowMs - last < MIN_INTERVAL_MS) return false;
    last = nowMs;
    raycaster.setFromCamera(ndc, camera);
    sphere.radius = blob.scale.x;
    if (!raycaster.ray.intersectSphere(sphere, hit)) return false;
    const local = blob.worldToLocal(hit.clone()).normalize();
    const index = slot % MAX_RIPPLES;
    slot++;
    uniforms.uRipplePos.value[index]?.copy(local);
    uniforms.uRippleTime.value[index] = uniforms.uTime.value;
    uniforms.uRippleStr.value[index] = strength;
    return true;
  };
}
