'use client';

import { useEffect } from 'react';
import { createZoneReporter, currentZone } from '../lib/client/analytics.ts';

/**
 * Records the visit and how far the reader scrolls. Renders nothing. When the
 * deployment has no database, the server renders it disabled and it makes no
 * requests at all. No cookies or storage: the visit id lives in memory only.
 */
export default function Analytics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const reporter = createZoneReporter((url, init) => fetch(url, init));
    const sections = () => Array.from(document.querySelectorAll('main > section'));
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        reporter.report(currentZone(sections(), window.innerHeight));
      });
    };
    reporter.report(currentZone(sections(), window.innerHeight));
    void reporter.start();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);

  return null;
}
