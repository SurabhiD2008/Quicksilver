import { IcosahedronGeometry, type Material, Mesh, type Scene } from 'three';

// The orbiting droplets of the Fracture act and the beads floating in the room.

export interface Droplet {
  mesh: Mesh;
  angle: number;
  speed: number;
  radius: number;
  yPhase: number;
  ySpeed: number;
  baseSize: number;
  tilt: number;
}

export interface Bead {
  mesh: Mesh;
  spanX: number;
  spanY: number;
  driftX: number;
  driftY: number;
  swayAmp: number;
  swayPhase: number;
  spin: number;
}

const DROPLET_COUNT = 6;

export function createDroplets(scene: Scene, material: Material) {
  const geometry = new IcosahedronGeometry(1, 16);
  const droplets: Droplet[] = [];
  for (let i = 0; i < DROPLET_COUNT; i++) {
    const mesh = new Mesh(geometry, material);
    droplets.push({
      mesh,
      angle: (i / DROPLET_COUNT) * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.5,
      radius: 1.5 + Math.random() * 0.5,
      yPhase: Math.random() * Math.PI * 2,
      ySpeed: 0.5 + Math.random() * 0.8,
      baseSize: 0.28 + Math.random() * 0.22,
      tilt: (Math.random() - 0.5) * 0.9,
    });
    mesh.scale.setScalar(0);
    scene.add(mesh);
  }
  return { droplets, geometry };
}

export function updateDroplets(
  droplets: Droplet[],
  dt: number,
  t: number,
  fracture: number,
  reduced: boolean,
) {
  for (const d of droplets) {
    d.angle += dt * d.speed * (reduced ? 0.4 : 1);
    const orbit = d.radius * fracture;
    const y = Math.sin(t * d.ySpeed + d.yPhase) * 0.7 * fracture + d.tilt * fracture;
    d.mesh.position.set(Math.cos(d.angle) * orbit, y, Math.sin(d.angle) * orbit * 0.7);
    d.mesh.scale.setScalar(d.baseSize * fracture);
    d.mesh.rotation.y += dt * 0.6;
    d.mesh.rotation.x += dt * 0.3;
  }
}

/**
 * Most beads hang in the room behind the drop; every fifth one is a small bead
 * in the foreground, between the drop and the lens. With the camera orbiting,
 * the layers slide against each other and read as depth.
 */
export function createBeads(scene: Scene, material: Material, count: number) {
  const geometry = new IcosahedronGeometry(1, 4);
  const beads: Bead[] = [];
  for (let i = 0; i < count; i++) {
    const mesh = new Mesh(geometry, material);
    const near = i % 5 === 4;
    const spanX = near ? 5.5 : 12;
    const spanY = near ? 2.6 : 5;
    mesh.position.set(
      (Math.random() - 0.5) * spanX,
      (Math.random() - 0.5) * spanY * 1.8,
      near ? 1.9 + Math.random() * 1.5 : -2 - Math.random() * 6,
    );
    mesh.scale.setScalar(near ? 0.035 + Math.random() * 0.05 : 0.05 + Math.random() * 0.28);
    beads.push({
      mesh,
      spanX,
      spanY,
      driftX: (Math.random() - 0.5) * 0.12,
      driftY: 0.06 + Math.random() * 0.16,
      swayAmp: 0.2 + Math.random() * 0.5,
      swayPhase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.5,
    });
    scene.add(mesh);
  }
  return { beads, geometry };
}

export function updateBeads(beads: Bead[], dt: number, t: number, reduced: boolean) {
  const speed = reduced ? 0.15 : 1.0;
  for (const bead of beads) {
    const p = bead.mesh.position;
    p.y += bead.driftY * dt * speed;
    p.x += (bead.driftX + Math.sin(t * 0.3 + bead.swayPhase) * bead.swayAmp * 0.06) * dt * speed;
    if (p.y > bead.spanY) {
      p.y = -bead.spanY;
      p.x = (Math.random() - 0.5) * bead.spanX;
    }
    bead.mesh.rotation.y += dt * bead.spin;
  }
}
