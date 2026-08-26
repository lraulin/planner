import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financePaymentResolutions,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { seedPayees, unresolvedPayeeCount } from "./backfill";
import { createPayee, renamePayee } from "./mutations";
import { getPayee, listPayees } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("payee backfill");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `payee-seed-${crypto.randomUUID()}@localhost`,
      name: "Payee Seed Test",
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

async function addTransactions(
  userId: string,
  accountId: string,
  rows: readonly { description: string; amount: string; date?: string }[],
): Promise<string[]> {
  const inserted = await db
    .insert(financeTransactions)
    .values(
      rows.map((row) => ({
        userId,
        accountId,
        transactionDate: row.date ?? "2026-08-05",
        description: row.description,
        amount: row.amount,
      })),
    )
    .returning({ id: financeTransactions.id });
  return inserted.map((row) => row.id);
}

async function payeeIdOf(txId: string): Promise<string | null> {
  const [row] = await db
    .select({ payeeId: financeTransactions.payeeId })
    .from(financeTransactions)
    .where(eq(financeTransactions.id, txId));
  return row?.payeeId ?? null;
}

describeDb("seedPayees", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
  });

  it("folds the spellings a rule names into one payee and points every row at it", async () => {
    const [a, b] = await addTransactions(userId, accountId, [
      { description: "WM SUPERCENTER #1981", amount: "-40.00" },
      { description: "WAL-MART #2201", amount: "-15.00" },
    ]);

    const summary = await seedPayees(userId);

    expect(summary.createdPayees).toBe(1);
    expect(summary.addedAliases).toBe(2);
    expect(summary.assigned).toBe(2);
    expect(summary.unresolved).toBe(0);

    const [payee] = await listPayees(userId);
    expect(payee.name).toBe("Walmart");
    expect(payee.transactionCount).toBe(2);
    expect(payee.totalCents).toBe(-5500);
    expect(await payeeIdOf(a)).toBe(payee.id);
    expect(await payeeIdOf(b)).toBe(payee.id);
  });

  it("writes nothing at all on a second run", async () => {
    // The idempotence claim. If this fails, the backfill is a one-shot migration rather than
    // something safe to run after every import.
    await addTransactions(userId, accountId, [
      { description: "WM SUPERCENTER #1981", amount: "-40.00" },
      { description: "CHEWY.COM", amount: "-30.00" },
    ]);

    await seedPayees(userId);
    const second = await seedPayees(userId);

    expect(second).toMatchObject({
      createdPayees: 0,
      addedAliases: 0,
      assigned: 0,
      conflicts: [],
    });
  });

  it("leaves a renamed payee renamed, and sends its new spellings to it", async () => {
    await addTransactions(userId, accountId, [
      { description: "WM SUPERCENTER #1981", amount: "-40.00" },
    ]);
    await seedPayees(userId);

    const [payee] = await listPayees(userId);
    await renamePayee(userId, payee.id, "Wally World");

    // A new spelling arrives on the next import.
    const [later] = await addTransactions(userId, accountId, [
      { description: "WAL-MART #7", amount: "-12.00" },
    ]);
    const summary = await seedPayees(userId);

    // No resurrection of a payee called Walmart, and the new row joins its siblings.
    expect(summary.createdPayees).toBe(0);
    expect(await listPayees(userId)).toHaveLength(1);
    expect(await payeeIdOf(later)).toBe(payee.id);
    expect((await getPayee(userId, payee.id))?.name).toBe("Wally World");
  });

  it("counts a row whose description names no merchant instead of inventing one", async () => {
    // A payee with a blank alias would claim every one of these at once.
    await addTransactions(userId, accountId, [
      { description: "PAYPAL *", amount: "-9.00" },
      { description: "WM SUPERCENTER #1", amount: "-40.00" },
    ]);

    const summary = await seedPayees(userId);

    expect(summary.unresolved).toBe(1);
    expect(await unresolvedPayeeCount(userId)).toBe(1);
    expect(await listPayees(userId)).toHaveLength(1);
  });

  it("takes back a payee minted from normalizer wreckage", async () => {
    // `PP*P36C17FF0B` used to normalize to the single letter `P`, and four unrelated PayPal
    // charges became one payee called `P`. The normalizer no longer produces it, so the pass
    // that recomputes identity has to take the old assignment off the rows too — otherwise
    // the fiction survives in `payee_id` for as long as the row does.
    const [residue, real] = await addTransactions(userId, accountId, [
      { description: "PP*P36C17FF0B", amount: "-9.00" },
      { description: "WM SUPERCENTER #1", amount: "-40.00" },
    ]);
    const orphan = await createPayee(userId, { name: "P", aliases: ["P"] });
    await db
      .update(financeTransactions)
      .set({ payeeId: orphan })
      .where(eq(financeTransactions.id, residue));

    const summary = await seedPayees(userId);

    expect(summary.detached).toBe(1);
    expect(await payeeIdOf(residue)).toBeNull();
    expect(await payeeIdOf(real)).not.toBeNull();
    // Idempotent: the second run has nothing left to take back.
    expect((await seedPayees(userId)).detached).toBe(0);
  });

  it("gives a bare PayPal row the payee its statement counterparty names", async () => {
    const [first, second] = await addTransactions(userId, accountId, [
      { description: "PAYPAL *", amount: "-9.00", date: "2026-08-05" },
      { description: "PAYPAL *", amount: "-21.00", date: "2026-08-06" },
    ]);
    await db.insert(financePaymentResolutions).values([
      {
        userId,
        source: "paypal",
        externalId: "p1",
        transactionDate: "2026-08-05",
        amount: "-9.00",
        counterparty: "Blue Bottle Coffee",
        direction: "out",
      },
      {
        userId,
        source: "paypal",
        externalId: "p2",
        transactionDate: "2026-08-06",
        amount: "-21.00",
        counterparty: "Joe's Coffee",
        direction: "out",
      },
    ]);

    const summary = await seedPayees(userId);

    // Two rows the bank wrote identically are two different merchants. Sharing one alias
    // would make them inseparable by any later edit.
    expect(summary.unresolved).toBe(0);
    const names = (await listPayees(userId)).map((row) => row.name).sort();
    expect(names).toEqual(["BLUE BOTTLE COFFEE", "JOE'S COFFEE"]);
    expect(await payeeIdOf(first)).not.toBe(await payeeIdOf(second));
  });

  it("touches no other user's rows", async () => {
    const otherId = await makeUser();
    const otherAccount = await makeAccount(otherId);
    const [theirs] = await addTransactions(otherId, otherAccount, [
      { description: "WM SUPERCENTER #1981", amount: "-40.00" },
    ]);
    await addTransactions(userId, accountId, [
      { description: "WM SUPERCENTER #1981", amount: "-40.00" },
    ]);

    await seedPayees(userId);

    expect(await payeeIdOf(theirs)).toBeNull();
    expect(await listPayees(otherId)).toEqual([]);
  });

  it("reports a split group rather than reassigning it", async () => {
    await addTransactions(userId, accountId, [
      { description: "WM SUPERCENTER #1", amount: "-40.00" },
      { description: "WAL-MART #2", amount: "-15.00" },
      { description: "WALMART #3", amount: "-25.00" },
    ]);
    await createPayee(userId, { name: "One", aliases: ["WM SUPERCENTER"] });
    await createPayee(userId, { name: "Two", aliases: ["WAL-MART"] });

    const summary = await seedPayees(userId);

    expect(summary.createdPayees).toBe(0);
    expect(summary.conflicts).toHaveLength(1);
    expect(summary.conflicts[0]).toMatchObject({ aliases: ["WALMART"] });
    // The unassignable row is honestly reported, not quietly attached to a guess.
    expect(summary.unresolved).toBe(1);
  });
});
