const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `?thought=` comes from the address bar, so it can be anything. A malformed value reaching
 * a `uuid` column is a database error, not an empty result; this keeps it a miss.
 */
export function parseThoughtId(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && UUID.test(raw) ? raw : null;
}
