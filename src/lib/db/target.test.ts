import { describe, expect, it } from "vitest";
import { describeDatabaseUrl } from "./target";

/**
 * This string gets printed to a terminal, so the case that matters most is the one where a
 * password would leak into it.
 */
describe("describeDatabaseUrl", () => {
  it("never includes the password", () => {
    const described = describeDatabaseUrl(
      "postgresql://planner:hunter2@ep-cool-name.us-east-2.aws.neon.tech/planner?sslmode=require",
    );
    expect(described).not.toContain("hunter2");
    expect(described).toBe("ep-cool-name.us-east-2.aws.neon.tech/planner");
  });

  it("distinguishes local from remote at a glance", () => {
    expect(
      describeDatabaseUrl("postgresql://planner:planner@localhost:5432/planner"),
    ).toBe("localhost:5432/planner");
  });

  it("says so when the variable is missing", () => {
    // `DATABASE_URL="$UNSET" npm run …` sets it to the empty string rather than unsetting it.
    expect(describeDatabaseUrl(undefined)).toBe("unset");
    expect(describeDatabaseUrl("")).toBe("unset");
    expect(describeDatabaseUrl("   ")).toBe("unset");
  });

  it("does not echo an unparseable value back", () => {
    // What `vercel env pull` writes for a sensitive variable.
    expect(describeDatabaseUrl("[SENSITIVE]")).toBe(
      "unparseable (not a connection string)",
    );
  });
});
