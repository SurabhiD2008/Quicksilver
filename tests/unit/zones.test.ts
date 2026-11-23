import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hudLabel, scrollFraction, zoneAt } from '../../lib/shared/zones.ts';

const H = 800;

describe('zoneAt', () => {
  it.each([
    { tops: [0, 800, 1600, 2400, 3200], zone: 0 },
    { tops: [-401, 399, 1199, 1999, 2799], zone: 1 },
    { tops: [-400, 400, 1200, 2000, 2800], zone: 1 }, // exactly on the line counts
    { tops: [-399, 401, 1201, 2001, 2801], zone: 0 }, // one pixel short
    { tops: [-3000, -2200, -1400, -600, 100], zone: 4 },
    { tops: [], zone: 0 },
    { tops: [-5000, -4000, -3000, -2000, -1000, -500], zone: 4 }, // never beyond the epilogue
  ])('tops $tops -> zone $zone', ({ tops, zone }) => {
    expect(zoneAt(tops, H)).toBe(zone);
  });

  it('stays within 0..4 and never goes back as the page scrolls down', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 2000 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 20000 }),
        fc.integer({ min: 0, max: 2000 }),
        (heights, scrollA, extra) => {
          const tops = (scroll: number) => {
            let y = -scroll;
            return heights.map((h) => {
              const top = y;
              y += h;
              return top;
            });
          };
          const a = zoneAt(tops(scrollA), H);
          const b = zoneAt(tops(scrollA + extra), H);
          return a >= 0 && a <= 4 && b >= a;
        },
      ),
    );
  });
});

describe('hudLabel', () => {
  it.each([
    [0, 'SOLID STATE'],
    [1, 'MOLTEN'],
    [2, 'FRACTURE'],
    [3, 'REFORMATION'],
    [4, 'REFORMATION'],
    [-1, 'SOLID STATE'],
    [99, 'REFORMATION'],
  ])('zone %i -> %s', (zone, label) => {
    expect(hudLabel(zone)).toBe(label);
  });
});

describe('scrollFraction', () => {
  it('maps the story to 0..1', () => {
    expect(scrollFraction(0, 4000, 1000)).toBe(0);
    expect(scrollFraction(1500, 4000, 1000)).toBe(0.5);
    expect(scrollFraction(3000, 4000, 1000)).toBe(1);
    expect(scrollFraction(9000, 4000, 1000)).toBe(1);
    expect(scrollFraction(-50, 4000, 1000)).toBe(0);
  });

  it('is 0 when the story fits on one screen or the input is not a number', () => {
    expect(scrollFraction(10, 800, 1000)).toBe(0);
    expect(scrollFraction(Number.NaN, 4000, 1000)).toBe(0);
  });

  it('always lies in [0, 1]', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), fc.double(), (y, bottom, vh) => {
        const f = scrollFraction(y, bottom, vh);
        return f >= 0 && f <= 1;
      }),
    );
  });
});
