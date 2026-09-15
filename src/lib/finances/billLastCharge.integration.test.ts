import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonCharges,
  amazonReceiptAllocations,
  financeAccounts,
  financeTransactions,
  users,
} from "@/db/schema";
import { createBudgetCategory } from "./budget/mutations";
import { lastChargeByEnvelope, lastChargeOnBill } from "./billLastCharge";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";

/**
 * `billLastCharge.ts`'s envelope-filed side (a `finance_transactions` row with a
 * `budget_category_id`) is exercised indirectly through `mutations.integration.test.ts`'s
 * bill-anchor tests. This file covers the half that isn't: the Amazon-receipt union — a
 * bill's last charge can come from a receipt allocation instead of, or later than, a
 * transaction — and its own second-user isolation.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("bill last charge from Amazon receipts");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `bill-last-charge-${crypto.randomUUID()}@localhost`,
      name: "Bill Last Charge Test",
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

async function seedAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Chase Freedom",
      kind: "credit_card",
      externalSource: "csv:chase-credit",
      externalKey: "9910",
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function addCharge(
  userId: string,
  params: { paymentDate: string; status?: string },
): Promise<string> {
  const [charge] = await db
    .insert(amazonCharges)
    .values({
      userId,
      amazonPaymentId: `pay-${crypto.randomUUID()}`,
      paymentDate: params.paymentDate,
      amount: "-21.14",
      status: params.status ?? "completed",
      externalSource: "browser:amazon",
      externalId: crypto.randomUUID(),
    })
    .returning({ id: amazonCharges.id });
  return charge.id;
}

async function allocate(
  userId: string,
  chargeId: string,
  billId: string,
): Promise<void> {
  await db.insert(amazonReceiptAllocations).values({
    userId,
    chargeId,
    lineId: crypto.randomUUID(),
    billId,
    amount: "-21.14",
    kind: "remainder",
  });
}

describeDb("bill last charge from Amazon receipts", () => {
  it("reads a bill's last charge from a receipt allocation when no transaction has one", async () => {
    const userId = await makeUser();
    const billId = await createBudgetCategory(userId, {
      name: "Amazon subscribe & save",
    });
    const chargeId = await addCharge(userId, { paymentDate: "2026-07-15" });
    await allocate(userId, chargeId, billId);

    expect(await lastChargeOnBill(userId, billId)).toBe("2026-07-15");
    expect((await lastChargeByEnvelope(userId)).get(billId)).toBe("2026-07-15");
  });

  it("prefers the receipt allocation when it postdates the transaction-filed charge", async () => {
    const userId = await makeUser();
    const accountId = await seedAccount(userId);
    const billId = await createBudgetCategory(userId, {
      name: "Amazon subscribe & save",
    });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-06-01",
      description: "AMAZON MKTPL",
      amount: "-9.99",
      budgetCategoryId: billId,
    });
    const chargeId = await addCharge(userId, { paymentDate: "2026-08-01" });
    await allocate(userId, chargeId, billId);

    expect(await lastChargeOnBill(userId, billId)).toBe("2026-08-01");
    expect((await lastChargeByEnvelope(userId)).get(billId)).toBe("2026-08-01");
  });

  it("prefers the transaction-filed charge when it postdates the receipt allocation", async () => {
    const userId = await makeUser();
    const accountId = await seedAccount(userId);
    const billId = await createBudgetCategory(userId, {
      name: "Amazon subscribe & save",
    });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-20",
      description: "AMAZON MKTPL",
      amount: "-9.99",
      budgetCategoryId: billId,
    });
    const chargeId = await addCharge(userId, { paymentDate: "2026-07-01" });
    await allocate(userId, chargeId, billId);

    expect(await lastChargeOnBill(userId, billId)).toBe("2026-08-20");
    expect((await lastChargeByEnvelope(userId)).get(billId)).toBe("2026-08-20");
  });

  it("ignores a receipt allocation whose charge never completed", async () => {
    const userId = await makeUser();
    const billId = await createBudgetCategory(userId, {
      name: "Amazon subscribe & save",
    });
    const chargeId = await addCharge(userId, {
      paymentDate: "2026-07-15",
      status: "pending",
    });
    await allocate(userId, chargeId, billId);

    expect(await lastChargeOnBill(userId, billId)).toBeNull();
    expect((await lastChargeByEnvelope(userId)).get(billId)).toBeUndefined();
  });

  it("does not let a second user's receipt allocation count toward another user's bill", async () => {
    const userId = await makeUser();
    const otherId = await makeUser();
    const billId = await createBudgetCategory(userId, {
      name: "Amazon subscribe & save",
    });
    const chargeId = await addCharge(userId, { paymentDate: "2026-07-15" });
    await allocate(userId, chargeId, billId);

    expect(await lastChargeOnBill(otherId, billId)).toBeNull();
    expect((await lastChargeByEnvelope(otherId)).size).toBe(0);
  });
});
