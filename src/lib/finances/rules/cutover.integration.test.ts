import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeRules, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { CLASSIFY_RULES } from "../classify/rules";
import { auditRuleSeed, planSeedFor, seedRules } from "./cutover";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("rule seeding");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `rules-seed-${crypto.randomUUID()}@localhost`,
      name: "Rules Seed Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

async function ruleCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: financeRules.id })
    .from(financeRules)
    .where(eq(financeRules.userId, userId));
  return rows.length;
}

describeDb("seedRules", () => {
  it("creates one rule per entry, in order", async () => {
    const userId = await makeUser();
    const { created } = await seedRules(userId);

    expect(created).toBe(CLASSIFY_RULES.length);

    const rows = await db
      .select({ seededId: financeRules.seededId, sortKey: financeRules.sortKey })
      .from(financeRules)
      .where(eq(financeRules.userId, userId))
      .orderBy(financeRules.sortKey);

    expect(rows.map((row) => row.seededId)).toEqual(CLASSIFY_RULES.map((r) => r.id));
  });

  it("writes nothing on a replay", async () => {
    // seeded_id is the whole idempotence contract; a second run that created anything would
    // duplicate 65 rules and make the priority order ambiguous.
    const userId = await makeUser();
    await seedRules(userId);

    const again = await seedRules(userId);
    expect(again.created).toBe(0);
    expect(await ruleCount(userId)).toBe(CLASSIFY_RULES.length);
  });

  it("re-creates a deleted rule, which is why seeding is a one-time migration", async () => {
    /*
     * Stated plainly because it is the one thing `seeded_id` does *not* protect. A rename, a
     * reorder or a disable all leave the row in place, so a replay skips it. A delete removes
     * the row, and nothing then distinguishes "the user deleted this" from "this was never
     * seeded" — so a replay brings it back.
     *
     * The fix would be a tombstone, and there is no caller that needs one: seeding is invoked
     * once, explicitly, by `npm run rules:seed`. Nothing runs it on import or on login. If
     * that ever changes, this test is where the assumption is written down.
     */
    const userId = await makeUser();
    await seedRules(userId);
    await db
      .delete(financeRules)
      .where(
        and(eq(financeRules.userId, userId), eq(financeRules.seededId, "spotify")),
      );

    const plan = await planSeedFor(userId);
    expect(plan.create.map((draft) => draft.seededId)).toEqual(["spotify"]);
  });

  it("survives a rename, because the seeded id is not the name", async () => {
    const userId = await makeUser();
    await seedRules(userId);
    await db
      .update(financeRules)
      .set({ name: "Groceries at the big shop" })
      .where(
        and(eq(financeRules.userId, userId), eq(financeRules.seededId, "walmart")),
      );

    expect((await seedRules(userId)).created).toBe(0);
  });

  it("round-trips a regex through JSONB, backslashes intact", async () => {
    /*
     * `^VCA\\b` is the corpus entry with an escape in it. A blob that lost or doubled the
     * backslash would still parse, still compile, and quietly match a different set of rows —
     * so this reads the stored value back and compares it to the source it came from.
     */
    const userId = await makeUser();
    await seedRules(userId);

    const [row] = await db
      .select({ conditions: financeRules.conditions })
      .from(financeRules)
      .where(and(eq(financeRules.userId, userId), eq(financeRules.seededId, "vca")));

    const source = CLASSIFY_RULES.find((rule) => rule.id === "vca")!.match.source;
    expect(row.conditions).toEqual([
      { field: "merchant", op: "matches", value: { source, flags: "" } },
    ]);
  });

  it("reports a clean audit on a user with no transactions", async () => {
    const userId = await makeUser();
    await seedRules(userId);

    const audit = await auditRuleSeed(userId);
    expect(audit).toMatchObject({
      toCreate: 0,
      existing: CLASSIFY_RULES.length,
      canApply: true,
      problems: [],
    });
  });
});

describeDb("rule ownership", () => {
  it("keeps one user's seeding entirely out of another's rules", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();

    await seedRules(owner);
    const ownerRows = await db
      .select({ id: financeRules.id, name: financeRules.name })
      .from(financeRules)
      .where(eq(financeRules.userId, owner));
    expect(ownerRows).toHaveLength(CLASSIFY_RULES.length);

    // Reading: the intruder's own seeding sees none of the owner's rules as "already present",
    // which is what proves planSeedFor is scoped rather than global.
    const intruderPlan = await planSeedFor(intruder);
    expect(intruderPlan.create).toHaveLength(CLASSIFY_RULES.length);
    expect(intruderPlan.skipped).toEqual([]);
    await seedRules(intruder);
    expect(await ruleCount(intruder)).toBe(CLASSIFY_RULES.length);
    expect(await ruleCount(owner)).toBe(CLASSIFY_RULES.length);

    const target = ownerRows[0];

    // Changing: a user-scoped update naming the owner's row from the intruder hits nothing.
    await db
      .update(financeRules)
      .set({ name: "hijacked" })
      .where(and(eq(financeRules.userId, intruder), eq(financeRules.id, target.id)));
    const [unchanged] = await db
      .select({ name: financeRules.name })
      .from(financeRules)
      .where(eq(financeRules.id, target.id));
    expect(unchanged.name).toBe(target.name);

    // Deleting: likewise.
    await db
      .delete(financeRules)
      .where(and(eq(financeRules.userId, intruder), eq(financeRules.id, target.id)));
    expect(await ruleCount(owner)).toBe(CLASSIFY_RULES.length);
  });

  it("lets two users hold the same seeded id and the same sort key", async () => {
    // The unique indexes are per user. If either were global, the second user to seed would
    // fail outright — which is the kind of thing that only shows up once a second person uses
    // the app.
    const first = await makeUser();
    const second = await makeUser();
    await seedRules(first);
    await expect(seedRules(second)).resolves.toEqual({
      created: CLASSIFY_RULES.length,
    });
  });
});
