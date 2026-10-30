import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  getTransaction,
  listSplitChildren,
  listTransactions,
  listTransactionsByIds,
} from "./queries";
import { splitTransaction } from "./mutations";

const reachable = await databaseReachable();
const describeDb = reachable ? describe : describe.skip;
if (!reachable) warnDatabaseSkipped("transaction list reads");

const created: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `transaction-list-${crypto.randomUUID()}@localhost`,
      name: "Transaction list test",
    })
    .returning({ id: users.id });
  created.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of created) await db.delete(users).where(eq(users.id, id));
});

async function makeAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: crypto.randomUUID(),
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function makeRow(
  userId: string,
  accountId: string,
  values: Partial<typeof financeTransactions.$inferInsert>,
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: "2026-05-03",
      description: "ROW",
      amount: "-10.00",
      ...values,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

describeDb("the register row reads", () => {
  let ownerId: string;
  let intruderId: string;
  let parentId: string;
  let plainId: string;
  let ownerAccountId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    ownerAccountId = await makeAccount(ownerId);
    parentId = await makeRow(ownerId, ownerAccountId, {
      description: "SPLIT ME",
      amount: "-30.00",
    });
    plainId = await makeRow(ownerId, ownerAccountId, { description: "PLAIN" });
    await splitTransaction(ownerId, parentId, [
      { amountCents: -1_250, budgetCategoryId: null },
      { amountCents: -1_750, budgetCategoryId: null },
    ]);
  });

  it("reports one split parent's child count and total the same way in every read", async () => {
    const fromList = (await listTransactions(ownerId)).find(
      (row) => row.id === parentId,
    );
    const fromIds = (await listTransactionsByIds(ownerId, [parentId]))[0];
    const fromOne = await getTransaction(ownerId, parentId);

    for (const row of [fromList, fromIds, fromOne]) {
      expect(row).toMatchObject({
        id: parentId,
        splitChildCount: 2,
        splitImbalanceCents: 0,
      });
    }

    // Unbalance it behind the mutation's back: the imbalance is the parent minus the sum
    // the aggregate read, so it moves with the children, by exactly that amount.
    const [child] = await listSplitChildren(ownerId, parentId);
    expect(child.amountCents).toBe(-1_250);
    await db
      .update(financeTransactions)
      .set({ amount: "-12.00" })
      .where(eq(financeTransactions.id, child.id));
    for (const row of [
      (await listTransactions(ownerId)).find((entry) => entry.id === parentId),
      (await listTransactionsByIds(ownerId, [parentId]))[0],
      await getTransaction(ownerId, parentId),
    ]) {
      expect(row?.splitChildCount).toBe(2);
      expect(Math.abs(row?.splitImbalanceCents ?? 0)).toBe(Math.abs(-1_250 - -1_200));
    }
  });

  it("gives a row that is not a parent no children, and a child no children of its own", async () => {
    const plain = await getTransaction(ownerId, plainId);
    expect(plain).toMatchObject({ splitChildCount: 0, splitImbalanceCents: 0 });

    const children = await listSplitChildren(ownerId, parentId);
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child).toMatchObject({ splitChildCount: 0, splitImbalanceCents: 0 });
    }
    // The register lists bank rows: parents and plain rows, never a child.
    expect((await listTransactions(ownerId)).map((row) => row.id).sort()).toEqual(
      [parentId, plainId].sort(),
    );
  });

  it("does not let a second user read the first user's rows, or move their totals", async () => {
    expect(await listTransactions(intruderId)).toEqual([]);
    expect(await listTransactionsByIds(intruderId, [parentId, plainId])).toEqual([]);
    expect(await getTransaction(intruderId, parentId)).toBeNull();
    expect(await listSplitChildren(intruderId, parentId)).toEqual([]);

    // A row of the intruder's that names the owner's parent must not be counted among its
    // children: the aggregate is scoped by user on its own side of the join.
    const intruderAccountId = await makeAccount(intruderId);
    await makeRow(intruderId, intruderAccountId, {
      description: "NOT A CHILD OF YOURS",
      amount: "-500.00",
      parentId,
      splitPosition: 0,
    });
    const owner = await getTransaction(ownerId, parentId);
    expect(owner).toMatchObject({ splitChildCount: 2, splitImbalanceCents: 0 });
    expect(await listSplitChildren(ownerId, parentId)).toHaveLength(2);
  });
});
