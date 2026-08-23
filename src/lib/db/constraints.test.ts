import { describe, expect, it } from "vitest";

import { isCheckViolation, isUniqueViolation } from "./constraints";

/** What drizzle actually hands a mutation: the SQL on top, the real error in `cause`. */
function drizzleWrapped(code: string): Error {
  const inner = Object.assign(
    new Error("duplicate key value violates unique constraint"),
    {
      code,
      name: "PostgresError",
    },
  );
  return Object.assign(
    new Error('Failed query: insert into "finance_payees" …\nparams: abc,costco'),
    { cause: inner },
  );
}

describe("isUniqueViolation", () => {
  it("sees a 23505 that drizzle wrapped", () => {
    // The whole point. Checking only the outer error returns false here, which is the bug
    // that left createSchedule's "already exists" message unreachable.
    expect(isUniqueViolation(drizzleWrapped("23505"))).toBe(true);
  });

  it("sees a bare 23505 from the driver", () => {
    expect(isUniqueViolation(Object.assign(new Error("dupe"), { code: "23505" }))).toBe(
      true,
    );
  });

  it("does not mistake another constraint for a unique one", () => {
    // A CHECK failure must not be reported as "that name is taken".
    expect(isUniqueViolation(drizzleWrapped("23514"))).toBe(false);
    expect(isCheckViolation(drizzleWrapped("23514"))).toBe(true);
  });

  it("says no to an error we wrote ourselves", () => {
    expect(isUniqueViolation(new Error("A payee needs a name."))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });

  it("terminates on a self-referential cause chain", () => {
    const looping: { code?: string; cause?: unknown } = {};
    looping.cause = looping;
    expect(isUniqueViolation(looping)).toBe(false);
  });
});
