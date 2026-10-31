import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { jobs } from "@/db/schema";
import { ownedRow } from "./owned";

/**
 * Three hundred queries rely on this to keep one user out of another's rows, so the cases
 * that matter are the ones that would quietly widen it: losing the owner column, or binding
 * the two ids to each other's columns.
 */
describe("ownedRow", () => {
  const query = new PgDialect().sqlToQuery(ownedRow(jobs, "job-1", "user-1"));

  it("scopes by the owner as well as the id", () => {
    expect(query.sql).toBe('("jobs"."id" = $1 and "jobs"."user_id" = $2)');
  });

  it("binds each id to its own column", () => {
    expect(query.params).toEqual(["job-1", "user-1"]);
  });
});
