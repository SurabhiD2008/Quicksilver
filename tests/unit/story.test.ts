import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cameraGoal,
  easeFactor,
  lerp,
  restingDistance,
  smoothstep,
  storyState,
  studioRotation,
  surfaceTension,
} from '../../lib/scene/story.ts';

const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe('storyState', () => {
  it('starts still and solid', () => {
    expect(storyState(0)).toEqual({ heat: 0, fracture: 0, plaque: 0, reveal: 0, bgBlend: 0 });
  });

  it('ends reformed, flat and named, partly cooled', () => {
    const s = storyState(1);
    expect(s.fracture).toBe(0);
    expect(s.plaque).toBe(1);
    expect(s.reveal).toBe(1);
    expect(s.heat).toBeCloseTo(0.4, 10);
  });

  it('is fully fractured in the middle of the Fracture act', () => {
    expect(storyState(0.67).fracture).toBeCloseTo(1, 10);
  });

  it('keeps every channel in [0, 1] for any position', () => {
    fc.assert(
      fc.property(unit, (f) =>
        Object.values(storyState(f)).every((v) => v >= 0 && v <= 1 && Number.isFinite(v)),
      ),
    );
  });
});

describe('surfaceTension', () => {
  it('reads 100% when cold and 0% at full heat', () => {
    expect(surfaceTension(0)).toBe(100);
    expect(surfaceTension(1)).toBe(0);
  });
  it('is a whole percentage in range for any story position', () => {
    fc.assert(
      fc.property(unit, (f) => {
        const v = surfaceTension(storyState(f).heat);
        return Number.isInteger(v) && v >= 0 && v <= 100;
      }),
    );
  });
});

describe('camera and studio', () => {
  it('sits square-on at the resting distance at the top of the page', () => {
    const goal = cameraGoal(0, 0, 5.6, false, { x: 0, y: 0 });
    expect(goal.x).toBeCloseTo(0, 10);
    expect(goal.y).toBeCloseTo(0, 10);
    expect(goal.z).toBeCloseTo(5.6, 10);
  });

  it('pulls back on narrow screens only', () => {
    expect(restingDistance(16 / 9)).toBe(5.6);
    expect(restingDistance(0.41)).toBeCloseTo(11.2, 10);
  });

  it('keeps the camera at a sane distance for any input', () => {
    fc.assert(
      fc.property(unit, unit, fc.boolean(), (f, plaque, reduced) => {
        const g = cameraGoal(f, plaque, 5.6, reduced, { x: 0, y: 0 });
        const d = Math.hypot(g.x, g.y, g.z);
        return d > 5 && d <= 5.6 + 1e-9;
      }),
    );
  });

  it('does not drift the studio under reduced motion', () => {
    expect(studioRotation(0.3, 0, true)).toBe(studioRotation(0.3, 1000, true));
  });
});

describe('easing helpers', () => {
  it('smoothstep clamps and eases', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
  it('lerp interpolates', () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
  });
  it('easeFactor is 0 for no time and approaches 1', () => {
    expect(easeFactor(0, 3.5)).toBe(0);
    expect(easeFactor(10, 3.5)).toBeGreaterThan(0.99);
  });
});
