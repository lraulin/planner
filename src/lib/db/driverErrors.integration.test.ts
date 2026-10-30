import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { nodes } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { isCheckViolation, isUniqueViolation } from "./constraints";
import { GENERIC_ERROR_MESSAGE, safeErrorMessage } from "@/lib/security/safeError";

/**
 * What the driver really throws, against the real driver. `safeError.test.ts` and
 * `constraints.test.ts` pin the classification with hand-built fixtures; this is the check
 * that the fixtures describe what arrives. The driver changed once under those fixtures
 * already (postgres.js to node-postgres) and its connection errors lost their `code`.
 *
 * No user-owned rows are read here, only refused writes, so there is no second user.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("driver error shapes");

const makeUser = testUsers("test");

/** Run a statement the database must refuse, and hand back what the driver threw. */
async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("The statement was expected to be refused, and was not.");
}

describeDb("errors from the real driver", () => {
  it("recognises a real unique violation and redacts it", async () => {
    const userId = await makeUser();
    const base = { userId, type: "task" as const, name: "Distinct", sortKey: "a0" };
    await db.insert(nodes).values({ ...base, state: "not_started" });

    const error = await failure(() =>
      db.insert(nodes).values({ ...base, state: "not_started" }),
    );

    expect(isUniqueViolation(error)).toBe(true);
    expect(isCheckViolation(error)).toBe(false);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(safeErrorMessage(error, "test")).toBe(GENERIC_ERROR_MESSAGE);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("recognises a real CHECK violation and redacts it", async () => {
    const userId = await makeUser();

    // A priority letter with no rank: `nodes_priority_letter_ranked`.
    const error = await failure(() =>
      db.insert(nodes).values({
        userId,
        type: "task",
        name: "Letter without a rank",
        sortKey: "a0",
        state: "not_started",
        priorityLetter: "A",
        priorityRank: null,
      }),
    );

    expect(isCheckViolation(error)).toBe(true);
    expect(isUniqueViolation(error)).toBe(false);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = safeErrorMessage(error, "test");
    log.mockRestore();
    expect(message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("redacts a statement error that carries no constraint at all", async () => {
    // Division by zero, 22012: not a violation, and nothing `isUniqueViolation` would claim.
    const error = await failure(() =>
      db.execute(sql`select 1 / ${0}::int as "secret_marker"`),
    );

    expect(isUniqueViolation(error)).toBe(false);
    expect(isCheckViolation(error)).toBe(false);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = safeErrorMessage(error, "test");
    log.mockRestore();
    expect(message).toBe(GENERIC_ERROR_MESSAGE);
    expect(message).not.toContain("secret_marker");
  });
});
