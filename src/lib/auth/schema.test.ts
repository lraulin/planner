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
 * The same drift runs the other way. 1.7.3 dropped `account.issuer` from its model, and it
 * validates the live schema at startup and refuses every auth request when a required
 * column is one it never writes. Our NOT NULL `issuer` turned that bump into an HTTP 500 on
 * 40 of the app's 63 pages, again with lint, typecheck and the build green. So the second
 * check is the mirror: a column that must be filled on insert has to be one Better Auth
 * fills.
 *
 * `getAuthTables({})` is the base model: options only rename tables here, and no plugin we
 * use adds fields. A plugin that did would need this passed its options instead.
 */

const drizzleTables: Record<
  string,
  Record<string, { notNull: boolean; hasDefault: boolean }>
> = {
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

    it(`requires no column on ${model} that Better Auth does not write`, () => {
      const ours = drizzleTables[model];
      expect(ours, `no Drizzle table mapped to Better Auth's "${model}"`).toBeDefined();

      const written = new Set(
        Object.entries(definition.fields)
          .filter(([, attrs]) => attrs.required !== false)
          .map(([field, attrs]) => attrs.fieldName ?? field),
      );
      const mustFillOnInsert = Object.entries(ours)
        .filter(([, column]) => column.notNull && !column.hasDefault)
        .map(([name]) => name);

      expect(mustFillOnInsert.filter((name) => !written.has(name))).toEqual([]);
    });
  }
});
