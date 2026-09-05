import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
const reachable = await databaseReachable();
if (!reachable) warnDatabaseSkipped("reporting retirement migration");
const created: string[] = [];
afterAll(async () => {
  for (const id of created) await db.delete(users).where(eq(users.id, id));
});
(reachable ? describe : describe.skip)("reporting metadata retirement", () => {
  it("runs the generated retirement against legacy rows, preserving labels, flags and original notes", async () => {
    const [owner, other] = await db
      .insert(users)
      .values([
        { name: "Archive owner", email: `archive-${crypto.randomUUID()}@localhost` },
        { name: "Archive other", email: `archive-${crypto.randomUUID()}@localhost` },
      ])
      .returning();
    created.push(owner.id, other.id);
    const migration = await readFile("drizzle/0094_nasty_ben_grimm.sql", "utf8");
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`CREATE TEMP TABLE report_retirement_users(id uuid PRIMARY KEY) ON COMMIT DROP`,
      );
      await tx.execute(
        sql`INSERT INTO report_retirement_users VALUES (${owner.id}),(${other.id})`,
      );
      await tx.execute(
        sql`CREATE TEMP TABLE report_retirement_fixture (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, exclude_from_baseline boolean NOT NULL DEFAULT false,event_label text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '') ON COMMIT DROP`,
      );
      await tx.execute(
        sql`INSERT INTO report_retirement_fixture(user_id,exclude_from_baseline,event_label,notes) VALUES (${owner.id},true,'House purchase','Keep receipt'),(${owner.id},true,'',''),(${other.id},false,'Birthday','')`,
      );
      const fixtureMigration = migration
        .replaceAll('"public"."users"', '"pg_temp"."report_retirement_users"')
        .replaceAll('"finance_transactions"', '"report_retirement_fixture"')
        .replaceAll('"finance_reporting_archive"', '"report_retirement_archive"')
        .replace(
          'CREATE TABLE "report_retirement_archive"',
          'CREATE TEMP TABLE "report_retirement_archive"',
        );
      for (const statement of fixtureMigration.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.execute(sql.raw(statement));
      const archive = await tx.execute(
        sql`SELECT fields FROM report_retirement_archive WHERE user_id=${owner.id}`,
      );
      expect(archive).toHaveLength(2);
      expect(archive.map((row) => row.fields)).toContainEqual({
        excludeFromBaseline: true,
        eventLabel: "House purchase",
        notes: "Keep receipt",
      });
      const notes = await tx.execute(
        sql`SELECT notes FROM report_retirement_fixture WHERE user_id=${owner.id}`,
      );
      expect(notes.map((row) => row.notes)).toEqual(
        expect.arrayContaining(["Keep receipt\nEvent: House purchase", ""]),
      );
      expect(
        await tx.execute(
          sql`SELECT fields FROM report_retirement_archive WHERE user_id=${other.id}`,
        ),
      ).toHaveLength(1);
      await tx.execute(
        sql`DELETE FROM report_retirement_fixture WHERE user_id=${owner.id}`,
      );
      expect(
        await tx.execute(
          sql`SELECT fields FROM report_retirement_archive WHERE user_id=${owner.id}`,
        ),
      ).toHaveLength(2);
      await tx.execute(sql`DROP TABLE report_retirement_archive`);
    });
  });
});
