import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  CONFIG_VARIABLES,
  DEFAULT_SITE_URL,
  loadConfig,
} from '../../lib/server/config.ts';

const TOKEN = 'a'.repeat(32);

describe('loadConfig', () => {
  it('runs with nothing set: analytics off, stats locked, default site URL', () => {
    expect(loadConfig({})).toEqual({
      postgresUrl: null,
      statsToken: null,
      siteUrl: DEFAULT_SITE_URL,
      analyticsEnabled: false,
    });
  });

  it('accepts a full configuration', () => {
    const config = loadConfig({
      POSTGRES_URL: 'postgresql://u:p@db.example.com/app?sslmode=require',
      STATS_TOKEN: TOKEN,
      SITE_URL: 'https://example.com/',
    });
    expect(config.analyticsEnabled).toBe(true);
    expect(config.statsToken).toBe(TOKEN);
    expect(config.siteUrl).toBe('https://example.com');
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ POSTGRES_URL: '', STATS_TOKEN: '', SITE_URL: '' }).analyticsEnabled).toBe(
      false,
    );
  });

  it('ignores variables it does not own', () => {
    expect(() => loadConfig({ OTHER: 'x' })).not.toThrow();
  });

  it.each([
    ['POSTGRES_URL', 'mysql://u:p@h/db'],
    ['POSTGRES_URL', 'not a url'],
    ['STATS_TOKEN', 'a'.repeat(31)],
    ['SITE_URL', 'ftp://example.com'],
    ['SITE_URL', 'example.com'],
  ])('fails fast on an invalid %s, naming it without echoing the value', (name, value) => {
    let caught: unknown;
    try {
      loadConfig({ [name]: value });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const message = String(caught);
    expect(message).toContain(name);
    expect(message).not.toContain(value);
  });

  it('owns exactly the documented variables', () => {
    expect([...CONFIG_VARIABLES].sort()).toEqual(['POSTGRES_URL', 'SITE_URL', 'STATS_TOKEN']);
  });
});
