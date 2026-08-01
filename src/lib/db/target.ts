/**
 * A human-readable, credential-free description of the database a script is about to write
 * to.
 *
 * Scripts here are pointed at different databases by an environment variable, which makes
 * "which one is this?" a question with no visible answer — and the two failure modes are
 * both quiet. A stale `DATABASE_URL` in the shell sends a command at production; a missing
 * one sends a command meant for production at the local Docker Postgres, where it succeeds
 * and looks right. Printing the target costs one line and turns both into something you
 * notice.
 *
 * Never returns the password, and never echoes the raw string on a parse failure — the
 * whole point is that this is safe to print into a terminal someone might paste from.
 */
export function describeDatabaseUrl(raw: string | undefined): string {
  if (!raw?.trim()) return "unset";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Vercel's sensitive env vars pull as the literal "[SENSITIVE]", which lands here.
    return "unparseable (not a connection string)";
  }

  const database = url.pathname.replace(/^\//, "") || "(no database)";
  const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  return `${host}/${database}`;
}
