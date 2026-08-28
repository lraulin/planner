import { describe, expect, it } from "vitest";
import { getAuthTables } from "@better-auth/core/db";
import { getTableColumns } from "drizzle-orm";
import { accounts, sessions, users, verifications } from "@/db/schema";

/**
 * Better Auth owns four of our tables but does not own our schema file, so a minor version
 * bump can start requiring a column we never added — and nothing says so. That is not
 * hypothetical: 1.7 added `account.issuer` and matched credential sign-in on it, and the
 * bump landed with lint, typecheck, the build and 3500 tests green while every password
 * login on the deployed app answered "Invalid email or password".
 *
 * So the tripwire is the table definitions themselves, compared against what the installed
 * Better Auth says it needs. The Drizzle adapter resolves a Better Auth field to the
 * drizzle *property* name, so that — not the SQL column — is the thing that has to line up.
 *
 * `getAuthTables({})` is the base model: options only rename tables here, and no plugin we
 * use adds fields. A plugin that did would need this passed its options instead.
 */

const drizzleTables: Record<string, Record<string, unknown>> = {
  user: getTableColumns(users),
  session: getTableColumns(sessions),
  account: getTableColumns(accounts),
  verification: getTableColumns(verifications),
};

describe("Better Auth table conformance", () => {
  const authTables = getAuthTables({});

  for (const [model, definition] of Object.entries(authTables)) {
    it(`defines every column Better Auth expects on ${model}`, () => {
      const ours = drizzleTables[model];
      expect(ours, `no Drizzle table mapped to Better Auth's "${model}"`).toBeDefined();

      const expected = Object.entries(definition.fields).map(
        ([field, attrs]) => attrs.fieldName ?? field,
      );
      expect(Object.keys(ours).sort()).toEqual(expect.arrayContaining(expected.sort()));
    });
  }
});
