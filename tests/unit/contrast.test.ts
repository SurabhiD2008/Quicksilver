import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Text contrast checked from the design tokens under worst-case conditions:
// over the scene, assume the metal behind a layer is pure white; in daylight,
// assume the veil is only as opaque as it is when the labels switch colour.

const css = readFileSync('app/styles/tokens.css', 'utf8');
const token = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`missing token --${name}`);
  return match[1].trim();
};
type RGB = [number, number, number];
const hex = (name: string): RGB => {
  const v = token(name).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as RGB;
};
const triple = (name: string): RGB =>
  token(name)
    .split(',')
    .map((n) => Number(n.trim())) as RGB;
const num = (name: string) => Number(token(name));
const over = (top: RGB, alpha: number, bottom: RGB): RGB =>
  top.map((c, i) => c * alpha + (bottom[i] ?? 0) * (1 - alpha)) as RGB;
const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const scrim = over(triple('scrim-rgb'), num('scrim-text-alpha'), WHITE);
const bar = over(triple('bar-rgb'), num('bar-alpha'), WHITE);
const veilAtSwitch = over(hex('daylight-bottom'), 0.55, BLACK);
const daylightBar = over(triple('daylight-bar-rgb'), num('daylight-bar-alpha'), veilAtSwitch);
const veilForCopy = over(hex('daylight-bottom'), 0.9, BLACK);

describe('contrast over the scene (worst case: white metal behind)', () => {
  it.each(['text-muted', 'text-lead', 'paper'])('%s on the section scrim >= 4.5', (name) => {
    expect(contrast(hex(name), scrim)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['text-muted', 'paper'])('%s on the frosted bar >= 4.5', (name) => {
    expect(contrast(hex(name), bar)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast in daylight', () => {
  it.each(['daylight-label', 'daylight-value'])('%s on the pale bar >= 4.5', (name) => {
    expect(contrast(hex(name), daylightBar)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['epilogue-text', 'epilogue-quiet', 'epilogue-accent', 'epilogue-link'])(
    '%s on the veil >= 4.5',
    (name) => {
      expect(contrast(hex(name), veilForCopy)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each(['epilogue-sub', 'heading-teal'])('large text %s on the veil >= 3', (name) => {
    expect(contrast(hex(name), veilForCopy)).toBeGreaterThanOrEqual(3);
  });
});
