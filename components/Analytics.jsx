'use client';

import { useEffect } from 'react';

/**
 * Records a visit on mount and, as the reader scrolls, reports the furthest
 * narrative zone reached (0 Solid … 4 Epilogue) to /api/scroll. Renders nothing.
 *
 * Privacy-light: no cookies, no localStorage. The visit id lives only in memory
 * for the session. Aggregates are available at /api/stats (not shown on the page).
 */
export default function Analytics() {
  useEffect(() => {
    let visitId = null;
    let maxZone = -1;
    let ticking = false;

    const sections = () => Array.from(document.querySelectorAll('main > section'));

    function currentZone() {
      let reached = 0;
      const mid = window.innerHeight * 0.5;
      sections().forEach((sec, i) => {
        if (sec.getBoundingClientRect().top <= mid) reached = i;
      });
      return reached; // 0..4
    }

    function reportZone(zone) {
      if (!visitId || zone <= maxZone) return;
      maxZone = zone;
      fetch('/api/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId, zone }),
        keepalive: true,
      }).catch(() => {});
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        reportZone(currentZone());
      });
    }

    (async function start() {
      try {
        const res = await fetch('/api/visit', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          visitId = data.visitId;
          reportZone(currentZone()); // capture where they already are
        }
      } catch { /* analytics is best-effort; never block the experience */ }
    })();

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return null;
}
