import postgres from "postgres";

/**
 * Whether the local Postgres from `npm run db:up` is actually reachable.
 *
 * Integration tests used to gate on `Boolean(process.env.DATABASE_URL)`, which never
 * worked: `.env.local` sets the variable whether or not the container is running, so a
 * stopped container produced 52 connection errors rather than a skip. Ping the server
 * instead — postgres.js opens connections lazily, so importing `@/db` is harmless and
 * only a real query proves anything.
 *
 * Note the two failure modes stay deliberately different. An *unreachable* database
 * skips, because "Docker isn't running" should never block a commit. An *unset*
 * DATABASE_URL still throws from `@/db` at import, because that means the environment
 * was never set up, and its error already names the fix (copy `.env.example`).
 *
 * Under CI there is no third option: a developer with Docker down is a convenience, a
 * workflow whose Postgres service never came up is a broken gate. Skipping there would
 * turn a dead service container into a green build — the exact failure `.husky/pre-push`
 * was written to close for pushes. So in CI an unreachable database throws.
 */
export async function databaseReachable(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;

  const probe = postgres(url, {
    max: 1,
    connect_timeout: 2,
    onnotice: () => {},
  });
  try {
    await probe`select 1`;
    return true;
  } catch (cause) {
    if (process.env.CI) {
      throw new Error(
        `No Postgres at DATABASE_URL, and CI is set. The integration tests must not skip ` +
          `in CI: a green run there would mean the service container is broken, not that ` +
          `the database code is fine.`,
        { cause },
      );
    }
    return false;
  } finally {
    await probe.end({ timeout: 1 });
  }
}

/**
 * Say so on the way past. A silent skip is how a broken mutation reaches a commit: the
 * suite reports all-green while the half that touches the database never ran.
 */
export function warnDatabaseSkipped(suite: string): void {
  console.warn(
    `\n  ⚠  Skipping ${suite}: no Postgres at DATABASE_URL. Run \`npm run db:up\`.\n`,
  );
}
