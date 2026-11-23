import { describe, expect, it } from 'vitest';
import { createLogger, type LogLevel } from '../../lib/server/logger.ts';

describe('createLogger', () => {
  it('writes one JSON line per event at or above the threshold', () => {
    const lines: [LogLevel, string][] = [];
    const logger = createLogger('info', (level, line) => lines.push([level, line]));
    logger.log('debug', 'skipped');
    logger.log('info', 'request', { route: 'visit', status: 201, ms: 4 });
    logger.log('error', 'db_failed', { code: '57P01' });
    expect(lines.map(([level]) => level)).toEqual(['info', 'error']);
    const parsed = JSON.parse(lines[0]?.[1] ?? '{}');
    expect(parsed).toMatchObject({
      level: 'info',
      event: 'request',
      route: 'visit',
      status: 201,
      ms: 4,
    });
    expect(typeof parsed.time).toBe('string');
  });

  it('error threshold drops warnings', () => {
    const lines: string[] = [];
    createLogger('error', (_l, line) => lines.push(line)).log('warn', 'x');
    expect(lines).toEqual([]);
  });
});
