import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeRecurringBills,
  financeSchedules,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  addAlias,
  claimPayeeForCommitment,
  createPayee,
  deletePayee,
  mergePayees,
  removeAlias,
  renamePayee,
  updatePayeeDetails,
} from "./mutations";
import { getPayee, listAliasRows, listPayees, previewPayeeMerge } from "./queries";
import { payeeForDescription, payeeIndex } from "./resolve";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("payee mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `payees-${crypto.randomUUID()}@localhost`,
      name: "Payees Test",
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

async function makeAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function addTransaction(
  userId: string,
  accountId: string,
  values: { description: string; amount: string; payeeId?: string | null },
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: "2026-08-05",
      description: values.description,
      amount: values.amount,
      payeeId: values.payeeId ?? null,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

describeDb("payee mutations", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
  });

  it("resolves a transaction through the alias the payee claims", async () => {
    const payeeId = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER #1981", "WAL-MART #1981"],
    });

    const index = payeeIndex(await listAliasRows(userId));

    // Both spellings reach one payee, and the alias was normalized on the way in — storing
    // "WM SUPERCENTER #1981" verbatim would have matched nothing, silently.
    expect(payeeForDescription("WM SUPERCENTER #1981", index)).toBe(payeeId);
    expect(payeeForDescription("WAL-MART #4", index)).toBe(payeeId);
  });

  it("refuses a second payee with the same name, whatever its case", async () => {
    await createPayee(userId, { name: "Costco" });

    // (user_id, lower(name)) is unique, so this is the database refusing, not a check here.
    await expect(createPayee(userId, { name: "costco" })).rejects.toThrow(
      /already exists/i,
    );
  });

  it("refuses to take an alias another payee already answers to", async () => {
    await createPayee(userId, { name: "Walmart", aliases: ["WM SUPERCENTER"] });
    const other = await createPayee(userId, { name: "Walmart Grocery" });

    // A silent move would take charges off whatever claims the first payee without saying so.
    await expect(addAlias(userId, other, "WM SUPERCENTER")).rejects.toThrow(
      /already answers/i,
    );

    const index = payeeIndex(await listAliasRows(userId));
    expect(payeeForDescription("WM SUPERCENTER #2", index)).not.toBe(other);
  });

  it("renames without moving a single transaction or alias", async () => {
    const payeeId = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER"],
    });
    await addTransaction(userId, accountId, {
      description: "WM SUPERCENTER #1981",
      amount: "-40.00",
      payeeId,
    });

    await renamePayee(userId, payeeId, "Wally World");

    const after = await getPayee(userId, payeeId);
    expect(after?.name).toBe("Wally World");
    expect(after?.aliases).toEqual(["WM SUPERCENTER"]);
    expect(after?.transactionCount).toBe(1);
    expect(after?.totalCents).toBe(-4000);
  });

  it("saves a payee name and notes together", async () => {
    const payeeId = await createPayee(userId, { name: "Walmart" });

    await updatePayeeDetails(userId, payeeId, {
      name: "Wally World",
      notes: "Same merchant, friendlier label.",
    });

    expect(await getPayee(userId, payeeId)).toMatchObject({
      name: "Wally World",
      notes: "Same merchant, friendlier label.",
    });
  });

  it("counts each payee's activity once, however many aliases it has", async () => {
    // Joining aliases and transactions in one query multiplies the rows; the bug is invisible
    // until a payee has a second alias, and then every total silently doubles.
    const payeeId = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER", "WAL-MART", "WALMART"],
    });
    await addTransaction(userId, accountId, {
      description: "WM SUPERCENTER #1",
      amount: "-10.00",
      payeeId,
    });
    await addTransaction(userId, accountId, {
      description: "WAL-MART #2",
      amount: "-15.00",
      payeeId,
    });

    const [row] = await listPayees(userId);
    expect(row.transactionCount).toBe(2);
    expect(row.totalCents).toBe(-2500);
  });

  it("merges aliases, transactions and a lone commitment claim into the target", async () => {
    const [bill] = await db
      .insert(financeRecurringBills)
      .values({ userId, name: "Groceries", cadenceMonths: 1 })
      .returning({ id: financeRecurringBills.id });

    const target = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER"],
    });
    const source = await createPayee(userId, {
      name: "Wal Mart",
      aliases: ["WAL-MART"],
    });
    await claimPayeeForCommitment(userId, source, { kind: "bill", id: bill.id });

    const txId = await addTransaction(userId, accountId, {
      description: "WAL-MART #2",
      amount: "-20.00",
      payeeId: source,
    });

    const result = await mergePayees(userId, target, [source]);
    expect(result).toEqual({ movedTransactions: 1, movedAliases: 1 });

    const merged = await getPayee(userId, target);
    expect(merged?.aliases).toEqual(["WAL-MART", "WM SUPERCENTER"]);
    expect(merged?.transactionCount).toBe(1);
    // Merging into an unclaimed payee must not quietly un-declare the commitment.
    expect(merged?.claim).toEqual({ kind: "bill", id: bill.id, name: "Groceries" });

    expect(await getPayee(userId, source)).toBeNull();

    const [tx] = await db
      .select({ payeeId: financeTransactions.payeeId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, txId));
    expect(tx.payeeId).toBe(target);
  });

  it("rewrites a schedule condition holding the merged payee, which no foreign key protects", async () => {
    const target = await createPayee(userId, { name: "Netflix" });
    const source = await createPayee(userId, { name: "Netflix Inc" });

    await db.insert(financeSchedules).values({
      userId,
      name: "Netflix",
      nextDate: "2026-09-01",
      sortKey: "a0",
      conditions: [
        { field: "payee", op: "is", value: source },
        { field: "amount", op: "isapprox", value: -1599 },
      ],
    });
    await db.insert(financeSchedules).values({
      userId,
      name: "Netflix pair",
      nextDate: "2026-09-01",
      sortKey: "a1",
      conditions: [{ field: "payee", op: "oneOf", value: [source, target] }],
    });

    await mergePayees(userId, target, [source]);

    const rows = await db
      .select({ name: financeSchedules.name, conditions: financeSchedules.conditions })
      .from(financeSchedules)
      .where(eq(financeSchedules.userId, userId))
      .orderBy(financeSchedules.sortKey);

    // Left alone, this schedule would go on matching a payee that no longer exists.
    expect(rows[0].conditions).toEqual([
      { field: "payee", op: "is", value: target },
      { field: "amount", op: "isapprox", value: -1599 },
    ]);
    // A schedule that listed both must not end up naming the survivor twice.
    expect(rows[1].conditions).toEqual([
      { field: "payee", op: "oneOf", value: [target] },
    ]);
  });

  it("refuses a merge that would put two commitments on one payee", async () => {
    const [billA] = await db
      .insert(financeRecurringBills)
      .values({ userId, name: "Bill A", cadenceMonths: 1 })
      .returning({ id: financeRecurringBills.id });
    const [billB] = await db
      .insert(financeRecurringBills)
      .values({ userId, name: "Bill B", cadenceMonths: 1 })
      .returning({ id: financeRecurringBills.id });

    const target = await createPayee(userId, { name: "One" });
    const source = await createPayee(userId, { name: "Two" });
    await claimPayeeForCommitment(userId, target, { kind: "bill", id: billA.id });
    await claimPayeeForCommitment(userId, source, { kind: "bill", id: billB.id });

    // Choosing which commitment keeps the merchant is a decision with money attached.
    await expect(mergePayees(userId, target, [source])).rejects.toThrow(
      /different commitments/i,
    );

    // And the refusal left both payees intact.
    expect(await getPayee(userId, source)).not.toBeNull();
  });

  it("merges payees that already carry the same commitment claim", async () => {
    const [bill] = await db
      .insert(financeRecurringBills)
      .values({ userId, name: "Internet", cadenceMonths: 1 })
      .returning({ id: financeRecurringBills.id });
    const target = await createPayee(userId, { name: "Comcast" });
    const source = await createPayee(userId, { name: "Xfinity" });
    await claimPayeeForCommitment(userId, target, { kind: "bill", id: bill.id });
    await claimPayeeForCommitment(userId, source, { kind: "bill", id: bill.id });

    await mergePayees(userId, target, [source]);

    expect((await getPayee(userId, target))?.claim?.id).toBe(bill.id);
    expect(await getPayee(userId, source)).toBeNull();
  });

  it("previews the references that will move before merging", async () => {
    const target = await createPayee(userId, { name: "Netflix" });
    const source = await createPayee(userId, {
      name: "Netflix Inc",
      aliases: ["NETFLIX.COM"],
    });
    await addTransaction(userId, accountId, {
      description: "NETFLIX.COM",
      amount: "-15.99",
      payeeId: source,
    });
    await db.insert(financeSchedules).values({
      userId,
      name: "Netflix",
      nextDate: "2026-09-01",
      sortKey: "a0",
      conditions: [{ field: "payee", op: "is", value: source }],
    });

    const preview = await previewPayeeMerge(userId, target, [source]);

    expect(preview).toMatchObject({
      target: { id: target, name: "Netflix" },
      sources: [{ id: source, name: "Netflix Inc" }],
      movedAliases: ["NETFLIX"],
      movedTransactions: 1,
      movedTotalCents: -1599,
      affectedSchedules: [{ name: "Netflix" }],
      refusal: null,
    });
  });

  it("keeps a transaction when its payee is deleted", async () => {
    const payeeId = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER"],
    });
    const txId = await addTransaction(userId, accountId, {
      description: "WM SUPERCENTER #1",
      amount: "-40.00",
      payeeId,
    });

    await deletePayee(userId, payeeId);

    const [tx] = await db
      .select({ id: financeTransactions.id, payeeId: financeTransactions.payeeId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, txId));
    // on delete set null, never cascade: deleting a payee must not delete money.
    expect(tx.id).toBe(txId);
    expect(tx.payeeId).toBeNull();
  });

  it("refuses to delete a payee referenced by a commitment or schedule", async () => {
    const [bill] = await db
      .insert(financeRecurringBills)
      .values({ userId, name: "Internet", cadenceMonths: 1 })
      .returning({ id: financeRecurringBills.id });
    const claimed = await createPayee(userId, { name: "Comcast" });
    await claimPayeeForCommitment(userId, claimed, { kind: "bill", id: bill.id });
    await expect(deletePayee(userId, claimed)).rejects.toThrow(/commitment/i);

    const scheduled = await createPayee(userId, { name: "Netflix" });
    await db.insert(financeSchedules).values({
      userId,
      name: "Netflix",
      nextDate: "2026-09-01",
      sortKey: "a0",
      conditions: [{ field: "payee", op: "is", value: scheduled }],
    });
    await expect(deletePayee(userId, scheduled)).rejects.toThrow(/schedule/i);

    expect(await getPayee(userId, claimed)).not.toBeNull();
    expect(await getPayee(userId, scheduled)).not.toBeNull();
  });

  it("removes an alias without touching the payee", async () => {
    const payeeId = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER", "WAL-MART"],
    });

    await removeAlias(userId, payeeId, "WAL-MART");

    const after = await getPayee(userId, payeeId);
    expect(after?.aliases).toEqual(["WM SUPERCENTER"]);
  });
});

describeDb("payee mutations — cross-user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let ownedPayeeId: string;
  let ownedAlias: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    const accountId = await makeAccount(ownerId);

    ownedPayeeId = await createPayee(ownerId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER"],
    });
    ownedAlias = "WM SUPERCENTER";
    await addTransaction(ownerId, accountId, {
      description: "WM SUPERCENTER #1",
      amount: "-40.00",
      payeeId: ownedPayeeId,
    });
  });

  it("shows the intruder none of the owner's payees or aliases", async () => {
    expect(await listPayees(intruderId)).toEqual([]);
    expect(await listAliasRows(intruderId)).toEqual([]);
    expect(await getPayee(intruderId, ownedPayeeId)).toBeNull();

    const intruderPayee = await createPayee(intruderId, { name: "Mine" });
    await expect(
      previewPayeeMerge(intruderId, intruderPayee, [ownedPayeeId]),
    ).rejects.toThrow();
  });

  it("refuses every write the intruder attempts on the owner's payee", async () => {
    await expect(renamePayee(intruderId, ownedPayeeId, "Stolen")).rejects.toThrow();
    await expect(
      updatePayeeDetails(intruderId, ownedPayeeId, {
        name: "Stolen",
        notes: "Not mine",
      }),
    ).rejects.toThrow();
    await expect(addAlias(intruderId, ownedPayeeId, "TARGET")).rejects.toThrow();
    await expect(deletePayee(intruderId, ownedPayeeId)).rejects.toThrow();
    await expect(
      claimPayeeForCommitment(intruderId, ownedPayeeId, null),
    ).rejects.toThrow();

    const intruderPayee = await createPayee(intruderId, { name: "Mine" });
    await expect(
      mergePayees(intruderId, intruderPayee, [ownedPayeeId]),
    ).rejects.toThrow();

    // The owner's payee, alias and transaction all survived intact.
    const owner = await getPayee(ownerId, ownedPayeeId);
    expect(owner?.name).toBe("Walmart");
    expect(owner?.aliases).toEqual([ownedAlias]);
    expect(owner?.transactionCount).toBe(1);
  });

  it("does not let the intruder delete the owner's alias", async () => {
    // removeAlias scopes its delete on userId as well as proving the payee, so this is a
    // no-op rather than a silent success.
    await expect(removeAlias(intruderId, ownedPayeeId, ownedAlias)).rejects.toThrow();

    const owner = await getPayee(ownerId, ownedPayeeId);
    expect(owner?.aliases).toEqual([ownedAlias]);
  });

  it("lets each user own a payee with the same name and the same alias", async () => {
    // Uniqueness is per user. Two people shopping at Walmart is not a conflict.
    const theirs = await createPayee(intruderId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER"],
    });

    expect(theirs).not.toBe(ownedPayeeId);
    const index = payeeIndex(await listAliasRows(intruderId));
    expect(payeeForDescription("WM SUPERCENTER #9", index)).toBe(theirs);
  });
});
