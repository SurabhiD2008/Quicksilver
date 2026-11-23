// The suite only ever talks to throwaway in-memory databases. Refuse to run if
// a real connection string is configured, so a test can never touch real data.
if (process.env.POSTGRES_URL) {
  throw new Error(
    'Unset POSTGRES_URL before running the tests: they use in-memory databases only.',
  );
}
