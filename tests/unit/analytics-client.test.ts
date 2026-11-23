import { describe, expect, it } from 'vitest';
import { createZoneReporter, type Fetcher } from '../../lib/client/analytics.ts';

const ID = '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6';

function fakeFetch(visit: () => Promise<Response>) {
  const calls: { url: string; body: unknown }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/visit') return visit();
    return Response.json({ ok: true, zone: 0 });
  };
  return { calls, fetcher };
}

const created = () => Promise.resolve(Response.json({ visitId: ID }, { status: 201 }));
const scrolls = (calls: { url: string; body: unknown }[]) =>
  calls.filter((c) => c.url === '/api/scroll').map((c) => c.body);

describe('createZoneReporter', () => {
  it('reports nothing until the visit is recorded, then the furthest zone so far', async () => {
    const { calls, fetcher } = fakeFetch(created);
    const reporter = createZoneReporter(fetcher);
    reporter.report(0);
    reporter.report(2);
    expect(scrolls(calls)).toEqual([]);
    await reporter.start();
    expect(scrolls(calls)).toEqual([{ visitId: ID, zone: 2 }]);
  });

  it('only ever reports a zone further than the last one', async () => {
    const { calls, fetcher } = fakeFetch(created);
    const reporter = createZoneReporter(fetcher);
    await reporter.start();
    [0, 1, 1, 0, 3, 2, 3, 4, 4].forEach((z) => reporter.report(z));
    expect(scrolls(calls).map((b) => (b as { zone: number }).zone)).toEqual([0, 1, 3, 4]);
  });

  it.each([
    ['a server error', () => Promise.resolve(new Response('', { status: 500 }))],
    [
      'a malformed reply',
      () => Promise.resolve(Response.json({ visitId: 'nope' }, { status: 201 })),
    ],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('stays silent after %s', async (_name, visit) => {
    const { calls, fetcher } = fakeFetch(visit);
    const reporter = createZoneReporter(fetcher);
    await expect(reporter.start()).resolves.toBeUndefined();
    reporter.report(3);
    expect(scrolls(calls)).toEqual([]);
  });
});
