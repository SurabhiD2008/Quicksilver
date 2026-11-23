// Validates the configuration when the server starts, so a missing or invalid
// variable stops the process with a message naming it instead of surfacing as
// a failed request later.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getConfig } = await import('./lib/server/config.ts');
  getConfig();
}
