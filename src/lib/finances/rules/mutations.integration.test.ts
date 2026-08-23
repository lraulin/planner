import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financePayees, financeRules, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createRule, deleteRule, moveRule, setRuleEnabled, updateRule } from "./mutations";
import { getRule, listRules } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("rule mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `rules-mut-${crypto.randomUUID()}@localhost`,
      name: "Rules Mutation Test",
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

const GROCERIES = {
  conditions: [{ field: "merchant", op: "startsWith", value: "COSTCO" }],
  actions: [{ op: "set", field: "category", value: "Groceries" }],
};

describeDb("rule mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates, reads back and updates a rule", async () => {
    const id = await createRule(userId, { name: "Costco", ...GROCERIES });
    expect(await getRule(userId, id)).toMatchObject({
      name: "Costco",
      enabled: true,
      conditions: GROCERIES.conditions,
    });

    await updateRule(userId, id, {
      name: "Costco runs",
      conditions: GROCERIES.conditions,
      actions: [{ op: "set", field: "category", value: "Shopping" }],
      notes: "changed my mind",
    });
    expect(await getRule(userId, id)).toMatchObject({
      name: "Costco runs",
      notes: "changed my mind",
      actions: [{ op: "set", field: "category", value: "Shopping" }],
    });
  });

  it("adds a new rule last, so it cannot silently outrank an existing one", async () => {
    // "Add a rule" should not change what any existing rule claims. Landing first would.
    const first = await createRule(userId, { name: "One", ...GROCERIES });
    const second = await createRule(userId, {
      name: "Two",
      conditions: [{ field: "merchant", op: "startsWith", value: "ALDI" }],
      actions: GROCERIES.actions,
    });

    const rows = await listRules(userId);
    expect(rows.map((row) => row.id)).toEqual([first, second]);
  });

  it("refuses a duplicate name, case-insensitively", async () => {
    await createRule(userId, { name: "Costco", ...GROCERIES });
    await expect(
      createRule(userId, { name: "COSTCO", ...GROCERIES }),
    ).rejects.toThrow(/already exists/i);
  });

  it("refuses a rule that could never compile", async () => {
    /*
     * The database cannot check JSONB shape, so a rule saved past here would be dropped from
     * every pass in silence. These are the same refusals `parseRuleActions` makes, reaching the
     * caller as a message rather than as a rule that simply never fires.
     */
    await expect(
      createRule(userId, { name: "Empty", conditions: [], actions: GROCERIES.actions }),
    ).rejects.toThrow(/at least one/i);

    await expect(
      createRule(userId, {
        name: "Bad category",
        conditions: GROCERIES.conditions,
        actions: [{ op: "set", field: "category", value: "Restaurants" }],
      }),
    ).rejects.toThrow();

    await expect(
      createRule(userId, {
        name: "Global regex",
        conditions: [
          { field: "merchant", op: "matches", value: { source: "^X", flags: "g" } },
        ],
        actions: GROCERIES.actions,
      }),
    ).rejects.toThrow();
  });

  it("reorders by rewriting one row", async () => {
    const a = await createRule(userId, { name: "A", ...GROCERIES });
    const b = await createRule(userId, {
      name: "B",
      conditions: [{ field: "merchant", op: "startsWith", value: "B" }],
      actions: GROCERIES.actions,
    });
    const c = await createRule(userId, {
      name: "C",
      conditions: [{ field: "merchant", op: "startsWith", value: "C" }],
      actions: GROCERIES.actions,
    });

    await moveRule(userId, c, { beforeId: a });
    expect((await listRules(userId)).map((row) => row.name)).toEqual(["C", "A", "B"]);

    await moveRule(userId, c, { afterId: a, beforeId: b });
    expect((await listRules(userId)).map((row) => row.name)).toEqual(["A", "C", "B"]);
  });

  it("disables and deletes", async () => {
    const id = await createRule(userId, { name: "Costco", ...GROCERIES });
    await setRuleEnabled(userId, id, false);
    expect(await getRule(userId, id)).toMatchObject({ enabled: false });

    await deleteRule(userId, id);
    expect(await getRule(userId, id)).toBeNull();
  });

  it("resolves payee names for display without joining on them", async () => {
    const [payee] = await db
      .insert(financePayees)
      .values({ userId, name: "Costco Wholesale" })
      .returning({ id: financePayees.id });

    await createRule(userId, {
      name: "By payee",
      conditions: [{ field: "payee", op: "is", value: payee.id }],
      actions: GROCERIES.actions,
    });

    const [row] = await listRules(userId);
    expect(row.names[payee.id]).toBe("Costco Wholesale");
  });

  it("reports a rule already in the table that cannot compile", async () => {
    // Written past the mutations, as an older version or a hand edit could. The page has to be
    // able to say which row is broken rather than silently running one rule fewer.
    await db.insert(financeRules).values({
      userId,
      name: "Hand-edited",
      sortKey: "a0",
      conditions: "not an array",
      actions: GROCERIES.actions,
    });

    const [row] = await listRules(userId);
    expect(row.problem).toMatch(/conditions/i);
  });
});

describeDb("rule ownership", () => {
  it("stops a second user reading, changing, reordering or deleting the first user's rule", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();

    const ruleId = await createRule(owner, { name: "Costco", ...GROCERIES });

    await expect(getRule(intruder, ruleId)).resolves.toBeNull();
    await expect(listRules(intruder)).resolves.toEqual([]);

    await expect(
      updateRule(intruder, ruleId, { name: "hijacked", ...GROCERIES }),
    ).rejects.toThrow(/does not exist/i);
    await expect(setRuleEnabled(intruder, ruleId, false)).rejects.toThrow(
      /does not exist/i,
    );
    await expect(moveRule(intruder, ruleId, { beforeId: null })).rejects.toThrow(
      /does not exist/i,
    );
    await expect(deleteRule(intruder, ruleId)).rejects.toThrow(/does not exist/i);

    // Every attempt above must have left the row exactly as it was.
    expect(await getRule(owner, ruleId)).toMatchObject({
      name: "Costco",
      enabled: true,
    });
  });

  it("refuses a rule naming another user's payee or account", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();

    const [theirPayee] = await db
      .insert(financePayees)
      .values({ userId: stranger, name: "Not yours" })
      .returning({ id: financePayees.id });
    const [theirAccount] = await db
      .insert(financeAccounts)
      .values({
        userId: stranger,
        name: "Not yours either",
        kind: "checking",
        externalSource: "test",
        externalKey: crypto.randomUUID(),
      })
      .returning({ id: financeAccounts.id });

    await expect(
      createRule(owner, {
        name: "Borrowed payee",
        conditions: [{ field: "payee", op: "is", value: theirPayee.id }],
        actions: GROCERIES.actions,
      }),
    ).rejects.toThrow(/payees do not exist/i);

    await expect(
      createRule(owner, {
        name: "Borrowed account",
        conditions: [{ field: "account", op: "is", value: theirAccount.id }],
        actions: GROCERIES.actions,
      }),
    ).rejects.toThrow(/accounts do not exist/i);

    expect(await listRules(owner)).toEqual([]);
  });
});
