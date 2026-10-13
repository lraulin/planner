import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_MESSAGE, isInternalError, safeErrorMessage } from "./safeError";

/**
 * The mistake this guards is the one that was already in the tree: a boundary whose comment
 * promised not to leak internals while it returned `error.message` verbatim. So the tests
 * are written from both sides — a real Postgres error must not get through, and a
 * deliberate message must not be swallowed.
 */

/**
 * What node-postgres throws for a failed query: `name` is "error", not a class name anyone
 * could match on, and `detail` quotes the row.
 */
function databaseError(message: string, code = "23505"): Error {
  const error = new Error(message);
  error.name = "error";
  return Object.assign(error, {
    code,
    table: "finance_transactions",
    constraint: "finance_transactions_fingerprint_uq",
    detail: "Key (fingerprint)=(SBARRO,-6.59) already exists.",
  });
}

/** What Node's network stack throws when it cannot reach the database at all. */
function connectionError(): Error {
  return Object.assign(new Error("write CONNECT_TIMEOUT ep-secret.neon.tech:5432"), {
    code: "CONNECT_TIMEOUT",
    errno: "CONNECT_TIMEOUT",
    address: "ep-secret.neon.tech",
  });
}

/**
 * node-postgres's connect timeout and dropped connection: a plain `Error` with no `code` at
 * any depth, so nothing about the error itself says it came from the database.
 */
function codelessPgError(
  message = "Connection terminated due to connection timeout",
): Error {
  return new Error(message);
}

/** A query failure as it reaches a caller: Drizzle's wrapper, the driver's error in `cause`. */
function failedQuery(cause?: Error): DrizzleQueryError {
  return new DrizzleQueryError(
    'insert into "finance_transactions" ("description", "amount") values ($1, $2)',
    ["SBARRO", "-6.59"],
    cause,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isInternalError", () => {
  it("classifies driver, network and filesystem errors as internal", () => {
    expect(isInternalError(databaseError('duplicate key value violates "uq"'))).toBe(
      true,
    );
    expect(isInternalError(connectionError())).toBe(true);
    expect(
      isInternalError(
        Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
      ),
    ).toBe(true);
  });

  it("treats a deliberate message as safe", () => {
    expect(isInternalError(new Error("Transaction not found."))).toBe(false);
    expect(isInternalError(new Error("An account needs a name."))).toBe(false);
  });

  it("treats a non-Error throw as internal, since nothing wrote it for a reader", () => {
    expect(isInternalError("a bare string")).toBe(true);
    expect(isInternalError(undefined)).toBe(true);
    expect(isInternalError({ message: "looks like an error" })).toBe(true);
  });
});

describe("safeErrorMessage", () => {
  it("never lets a Postgres error's table, column or values reach the client", () => {
    const error = databaseError(
      'duplicate key value violates unique constraint "finance_transactions_fingerprint_uq"',
    );
    expect(safeErrorMessage(error, "test")).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("never lets the database host reach the client", () => {
    const message = safeErrorMessage(connectionError(), "test");
    expect(message).toBe(GENERIC_ERROR_MESSAGE);
    expect(message).not.toContain("neon.tech");
  });

  it("passes a deliberate message through unchanged", () => {
    expect(safeErrorMessage(new Error("Transaction not found."), "test")).toBe(
      "Transaction not found.",
    );
  });

  it("logs the real error so redaction does not cost diagnosability", () => {
    const error = databaseError('column "notes" does not exist', "42703");
    safeErrorMessage(error, "updateTransaction");

    expect(console.error).toHaveBeenCalledWith("[updateTransaction]", error);
  });

  it("does not log the ones it passes through", () => {
    safeErrorMessage(new Error("An account needs a name."), "updateAccount");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses a caller fallback only when the real message is redacted", () => {
    expect(
      safeErrorMessage(databaseError("duplicate key"), "import", "Import failed."),
    ).toBe("Import failed.");
    expect(
      safeErrorMessage(new Error("Transaction not found."), "import", "Import failed."),
    ).toBe("Transaction not found.");
  });
});

describe("wrapped driver errors", () => {
  it("redacts a Drizzle query error, whose driver error hides in cause", () => {
    // The real shape, from a foreign-key violation: the wrapper is a plain `Error` with no
    // `code`, and its message is the whole statement plus a `params:` list. Checking only
    // the outer error let that reach the browser verbatim.
    const wrapper = failedQuery(
      databaseError("violates foreign key constraint", "23503"),
    );

    expect(wrapper.message).toContain("SBARRO");
    expect(isInternalError(wrapper)).toBe(true);
    expect(safeErrorMessage(wrapper, "test")).toBe(GENERIC_ERROR_MESSAGE);
  });

  it.each([
    ["a connect timeout", "Connection terminated due to connection timeout"],
    ["a dropped connection", "Connection terminated unexpectedly"],
  ])("redacts %s, which has no code at any depth", (_name, message) => {
    // The case a driver-shaped check missed: nothing on the cause says "database", so the
    // statement and its parameters were handed to the browser.
    const wrapper = failedQuery(codelessPgError(message));

    expect(isInternalError(wrapper)).toBe(true);
    expect(safeErrorMessage(wrapper, "test")).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("redacts a Drizzle query error with no cause at all", () => {
    // The wrapper is the tell, not what is inside it.
    expect(isInternalError(failedQuery())).toBe(true);
  });

  it("redacts a Drizzle query error that a deliberate wrapper re-threw", () => {
    const outer = new Error("Could not save the transaction.", {
      cause: failedQuery(codelessPgError()),
    });

    expect(isInternalError(outer)).toBe(true);
    expect(safeErrorMessage(outer, "test")).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("still lets a deliberate sentence through when its cause is also ours", () => {
    const inner = new Error("Account not found.");
    const outer = new Error("Transaction not found.", { cause: inner });
    expect(isInternalError(outer)).toBe(false);
    expect(safeErrorMessage(outer, "test")).toBe("Transaction not found.");
  });

  it("terminates on a self-referential cause rather than hanging", () => {
    const looped = new Error("looped");
    (looped as unknown as { cause: unknown }).cause = looped;
    expect(isInternalError(looped)).toBe(false);
  });
});
