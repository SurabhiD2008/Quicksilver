import { ScrollRequest, VisitResponse } from '../shared/schemas.ts';
import { zoneAt } from '../shared/zones.ts';

// Browser side of the scroll-depth analytics, kept free of React and the DOM
// so it can be tested directly. Best effort: a failure never reaches the page.

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface ZoneReporter {
  start(): Promise<void>;
  report(zone: number): void;
}

export function createZoneReporter(fetcher: Fetcher): ZoneReporter {
  let visitId: string | null = null;
  let reported = -1;
  let pending = -1;

  const send = (zone: number) => {
    if (visitId === null || zone <= reported) return;
    reported = zone;
    const body = ScrollRequest.parse({ visitId, zone });
    fetcher('/api/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  };

  return {
    async start() {
      try {
        const response = await fetcher('/api/visit', { method: 'POST' });
        if (!response.ok) return;
        const parsed = VisitResponse.safeParse(await response.json());
        if (!parsed.success) return;
        visitId = parsed.data.visitId;
        if (pending >= 0) send(pending);
      } catch {
        // Analytics is optional; a network failure leaves the page untouched.
      }
    },
    report(zone) {
      pending = Math.max(pending, zone);
      send(zone);
    },
  };
}

/** Reads the tops of the story sections and returns the reader's zone. */
export function currentZone(sections: readonly Element[], viewportHeight: number): number {
  return zoneAt(
    sections.map((section) => section.getBoundingClientRect().top),
    viewportHeight,
  );
}
