/**
 * What an error is allowed to say to the browser.
 *
 * Almost every throw in `src/lib/**` is a sentence written for the person who will read it —
 * "An account needs a name.", "Transaction not found." Those must survive, or the register
 * and the drawers lose their inline validation. The dangerous messages are the ones nobody
 * wrote:
 *
 * - `postgres` query failures (`PostgresError`) quote table, column and constraint names,
 *   and a constraint violation can quote the offending **row values** — which for the
 *   finance tables is a bank description and an amount.
 * - The driver's connection failures embed the database **host and port**
 *   (`write CONNECT_TIMEOUT ep-xyz.neon.tech:5432`).
 * - Node system errors embed absolute filesystem paths.
 *
 * The distinguishing feature of all three is a `code` property. Nothing this codebase throws
 * on purpose has one — deliberate throws are plain `new Error("A sentence.")`. So `code` is
 * the tell, and treating anything that carries one as internal errs in the safe direction:
 * an over-redacted third-party message costs a round trip to the server log, while an
 * under-redacted one is on screen forever.
 *
 * (`AgentError` also carries a `code`, but it never reaches here — the agent API has its own
 * boundary in `@/lib/agent/errors`, which redacts unexpected errors the same way.)
 */

export const GENERIC_ERROR_MESSAGE = "Something went wrong.";

/**
 * How far down a `cause` chain to look. Three is more than any wrapper here produces, and a
 * bound means a self-referential `cause` cannot hang the request.
 */
const MAX_CAUSE_DEPTH = 3;

/**
 * Did this come from the database driver, the network stack, or the filesystem — as opposed
 * to being a sentence we wrote?
 *
 * **The `cause` chain has to be walked, not just the top error.** Drizzle wraps every query
 * failure in a `DrizzleQueryError` whose `name` is plain `"Error"`, which carries no `code`,
 * and whose `message` is the full SQL plus a `params:` list — with the real `PostgresError`
 * tucked into `cause`. Checking only the outer error therefore passed the entire statement
 * and its parameter values straight through to the browser. For the finance tables those
 * parameters are descriptions and amounts, which is exactly what this module exists to keep
 * off the screen.
 */
export function isInternalError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error)) break;
    if (current.name === "PostgresError") return true;
    if (typeof (current as { code?: unknown }).code === "string") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The message a client may see, with the real one logged first.
 *
 * Logging is the half that makes redaction affordable: without it, hiding the message would
 * mean losing it, and the next Neon hiccup would surface as "Something went wrong." with no
 * way to find out what actually happened.
 *
 * `fallback` lets a caller say something more useful than the generic line when it knows
 * what the user was trying to do — "Import failed." on an import route. It replaces only
 * the redacted text; a deliberate message still wins over it.
 */
export function safeErrorMessage(
  error: unknown,
  context: string,
  fallback: string = GENERIC_ERROR_MESSAGE,
): string {
  if (isInternalError(error)) {
    console.error(`[${context}]`, error);
    return fallback;
  }
  return (error as Error).message;
}
