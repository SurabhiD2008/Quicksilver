import { z } from 'zod';
import { STATS_TOKEN_MIN_LENGTH } from '../shared/limits.ts';

// Every environment-specific value is read here and nowhere else. The list of
// variables must match .env.example and the README table exactly.

export const DEFAULT_SITE_URL = 'https://quicksilver-orpin.vercel.app';

// Platforms sometimes inject a variable as an empty string; treat that as unset.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const EnvSchema = z.object({
  POSTGRES_URL: optional(
    z.string().regex(/^postgres(ql)?:\/\/\S+$/, 'must be a postgres:// connection string'),
  ),
  STATS_TOKEN: optional(
    z.string().min(STATS_TOKEN_MIN_LENGTH, `must be at least ${STATS_TOKEN_MIN_LENGTH} characters`),
  ),
  SITE_URL: optional(z.url({ protocol: /^https?$/ })),
});

export const CONFIG_VARIABLES = Object.keys(EnvSchema.shape) as (keyof typeof EnvSchema.shape)[];

export interface Config {
  readonly postgresUrl: string | null;
  readonly statsToken: string | null;
  readonly siteUrl: string;
  readonly analyticsEnabled: boolean;
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const picked = Object.fromEntries(CONFIG_VARIABLES.map((name) => [name, env[name]]));
  const parsed = EnvSchema.safeParse(picked);
  if (!parsed.success) {
    // Name the variable and the rule only: values may be secrets.
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
    );
  }
  const data = parsed.data;
  return Object.freeze({
    postgresUrl: data.POSTGRES_URL ?? null,
    statsToken: data.STATS_TOKEN ?? null,
    siteUrl: (data.SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, ''),
    analyticsEnabled: data.POSTGRES_URL !== undefined,
  });
}

let cached: Config | null = null;

/** The validated configuration of this process, read once. */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}
