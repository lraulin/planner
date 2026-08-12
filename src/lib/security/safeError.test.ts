import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_MESSAGE, isInternalError, safeErrorMessage } from "./safeError";

/**
 * The mistake this guards is the one that was already in the tree: a boundary whose comment
 * promised not to leak internals while it returned `error.message` verbatim. So the tests
 * are written from both sides — a real Postgres error must not get through, and a
 * deliberate message must not be swallowed.
 */

/** What `postgres` actually throws for a failed query. */
function postgresError(message: string, code = "23505"): Error {
  const error = new Error(message);
  error.name = "PostgresError";
  return Object.assign(error, { code, table: "finance_transactions" });
}

/** What it throws when it cannot reach the database at all. */
function connectionError(): Error {
  return Object.assign(new Error("write CONNECT_TIMEOUT ep-secret.neon.tech:5432"), {
    code: "CONNECT_TIMEOUT",
    errno: "CONNECT_TIMEOUT",
    address: "ep-secret.neon.tech",
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isInternalError", () => {
  it("classifies driver, network and filesystem errors as internal", () => {
    expect(isInternalError(postgresError('duplicate key value violates "uq"'))).toBe(
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
    const error = postgresError(
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
    const error = postgresError('column "notes" does not exist');
    safeErrorMessage(error, "updateTransaction");

    expect(console.error).toHaveBeenCalledWith("[updateTransaction]", error);
  });

  it("does not log the ones it passes through", () => {
    safeErrorMessage(new Error("An account needs a name."), "updateAccount");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses a caller fallback only when the real message is redacted", () => {
    expect(
      safeErrorMessage(postgresError("duplicate key"), "import", "Import failed."),
    ).toBe("Import failed.");
    expect(
      safeErrorMessage(new Error("Transaction not found."), "import", "Import failed."),
    ).toBe("Transaction not found.");
  });
});
