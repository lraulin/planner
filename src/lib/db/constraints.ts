/**
 * Recognising a constraint the database refused, so a mutation can say what happened.
 *
 * **The `cause` chain has to be walked, not just the top error** — the same trap
 * `src/lib/security/safeError.ts` documents, for the same reason. Drizzle wraps every query
 * failure in a `DrizzleQueryError` whose `message` is the SQL and its parameters, and tucks
 * the real `PostgresError` — the one carrying `code` — into `cause`. A check against the
 * outer error's `code` therefore never matches, and the sentence written for the user is
 * skipped in favour of the driver's, which `safeErrorMessage` then has to redact wholesale.
 *
 * That is not hypothetical: it is why `createSchedule`'s "A schedule named … already exists"
 * had never once been seen.
 */

/** More than any wrapper here produces, and a bound so a self-referential `cause` cannot hang. */
const MAX_CAUSE_DEPTH = 3;

function pgErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return null;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** `23505` — a unique index rejected the write. */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

/** `23514` — a CHECK constraint rejected the write. */
export function isCheckViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23514";
}
