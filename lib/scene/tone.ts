import { Color } from 'three';

// Display transform helpers. The scene renders in linear HDR and the final pass
// applies ACES + gamma; these invert that so a colour authored for the screen
// (a CSS hex) still lands on exactly that colour after tone-mapping.

export function invAces(value: number): number {
  const y = Math.min(Math.max(value, 0), 0.999);
  const a = 2.43 * y - 2.51;
  const b = 0.59 * y - 0.03;
  const c = 0.14 * y;
  return (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

export function toScene(display: number): number {
  return invAces(Math.pow(display, 2.2));
}

export function sceneColor(hex: string): Color {
  const color = new Color(hex);
  return color.setRGB(toScene(color.r), toScene(color.g), toScene(color.b));
}
