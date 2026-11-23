import { MAX_ZONE } from './limits.ts';

// The single rule for "which part of the story is the reader in". The HUD
// label and the analytics beacon both call it, so they can never disagree.

export const ZONE_NAMES = ['Solid State', 'Molten', 'Fracture', 'Reformation', 'Epilogue'] as const;

/** Index of the last section whose top edge has passed the middle of the viewport. */
export function zoneAt(sectionTops: readonly number[], viewportHeight: number): number {
  const line = viewportHeight * 0.5;
  let reached = 0;
  sectionTops.forEach((top, index) => {
    if (top <= line) reached = index;
  });
  return Math.min(reached, MAX_ZONE);
}

/** The HUD names only the four fiction zones; the epilogue keeps the last one. */
export function hudLabel(zone: number): string {
  const index = Math.max(0, Math.min(zone, ZONE_NAMES.length - 2));
  return (ZONE_NAMES[index] ?? ZONE_NAMES[0]).toUpperCase();
}

/**
 * Progress through the fiction, 0 at the top of the page and 1 when the bottom
 * of Reformation reaches the bottom of the viewport. The epilogue below does
 * not stretch this timeline.
 */
export function scrollFraction(
  scrollY: number,
  storyBottom: number,
  viewportHeight: number,
): number {
  const max = storyBottom - viewportHeight;
  if (!(max > 0) || !Number.isFinite(scrollY)) return 0;
  return Math.min(1, Math.max(0, scrollY / max));
}
