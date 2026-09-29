import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles } from "@/lib/finances/import";
import { createBudgetCategory } from "@/lib/finances/budget/mutations";
import { listTransactions } from "@/lib/finances/queries";
import { dispatchAgentTool } from "./tools";

/**
 * Corrections to a declared bill through the agent tools. The bug these pin: a
 * `save_subscription` carrying only `{ name, status }` rewrote the cadence to the monthly
 * default, so cancelling a 30-day payment plan silently made it calendar-monthly — and the
 * result was then found again by name, which a rename or a duplicate name defeats.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("bill agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `bill-agent-${crypto.randomUUID()}@localhost`,
      name: "Bill Agent",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type SavedBill = {
  id: string;
  name: string;
  status: "active" | "paused" | "cancelled";
  cancelledOn: string | null;
  cadence: string;
};

async function save(userId: string, args: Record<string, unknown>): Promise<SavedBill> {
  return (await dispatchAgentTool("save_subscription", args, userId)) as SavedBill;
}

describeDb("save_subscription corrections", () => {
  let ownerId: string;
  let intruderId: string;
  let plan: SavedBill;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    plan = await save(ownerId, {
      name: "Payment Plan",
      cadenceDays: 30,
      expectedCents: 5000,
    });
  });

  it("keeps a day cadence when only the status changes", async () => {
    expect(plan.cadence).not.toBe("Monthly");

    const byName = await save(ownerId, { name: "Payment Plan", status: "paused" });
    expect(byName).toMatchObject({
      id: plan.id,
      status: "paused",
      cadence: plan.cadence,
    });

    const byId = await save(ownerId, { id: plan.id, status: "cancelled" });
    expect(byId).toMatchObject({
      id: plan.id,
      status: "cancelled",
      cadence: plan.cadence,
    });
  });

  it("still changes the cadence when one is given", async () => {
    const monthly = await save(ownerId, { id: plan.id, cadenceMonths: 1 });
    expect(monthly.cadence).toBe("Monthly");
  });

  it("refuses cadenceDays: null without the month cadence replacing it", async () => {
    await expect(
      save(ownerId, { id: plan.id, cadenceDays: null }),
    ).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("renames by id and answers with the renamed row", async () => {
    const renamed = await save(ownerId, { id: plan.id, name: "MedStar Plan" });
    expect(renamed).toMatchObject({
      id: plan.id,
      name: "MedStar Plan",
      cadence: plan.cadence,
    });

    const found = (await dispatchAgentTool(
      "search_commitments",
      { query: "Payment Plan" },
      ownerId,
    )) as { commitments: unknown[] };
    expect(found.commitments).toEqual([]);
  });

  it("stamps, sets, and corrects the cancellation date", async () => {
    const stamped = await save(ownerId, { id: plan.id, status: "cancelled" });
    expect(stamped.cancelledOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const dated = await save(ownerId, {
      id: plan.id,
      status: "cancelled",
      cancelledOn: "2026-09-01",
    });
    expect(dated.cancelledOn).toBe("2026-09-01");

    const corrected = await save(ownerId, { id: plan.id, cancelledOn: "2026-08-15" });
    expect(corrected).toMatchObject({ status: "cancelled", cancelledOn: "2026-08-15" });

    const reactivated = await save(ownerId, { id: plan.id, status: "active" });
    expect(reactivated.cancelledOn).toBeNull();
  });

  it("refuses a cancellation date on a bill that is not cancelled", async () => {
    await expect(
      save(ownerId, { id: plan.id, cancelledOn: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      save(ownerId, { id: plan.id, status: "active", cancelledOn: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      save(ownerId, { name: "Brand New", cancelledOn: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("needs an id or a name", async () => {
    await expect(save(ownerId, { status: "paused" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("gives a new bill the monthly default when no cadence is named", async () => {
    const created = await save(ownerId, { name: "Streaming", expectedCents: 999 });
    expect(created.cadence).toBe("Monthly");
  });

  it("will not let another user read, rename, or cancel the bill by id", async () => {
    await expect(
      save(intruderId, { id: plan.id, status: "cancelled" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      save(intruderId, { id: plan.id, name: "Mine now" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });

    const untouched = await save(ownerId, { id: plan.id });
    expect(untouched).toMatchObject({ name: "Payment Plan", status: "active" });
  });
});

type ListedBill = {
  id: string | null;
  merchant: string;
  annualCents: number;
  status: string;
  declared: boolean;
};

/** One charge on file, so the analysis has a range and does not short-circuit to empty. */
async function seedOneCharge(userId: string): Promise<void> {
  await importFinanceCsvFiles({
    userId,
    files: [
      {
        name: "Chase9910_Activity_20260812.csv",
        text: [
          "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
          "03/02/2026,03/03/2026,WM SUPERCENTER #1981,Groceries,Sale,-84.12,",
          "",
        ].join("\n"),
      },
    ],
  });
}

describeDb("list_recurring_bills", () => {
  it("names each declared bill by id and status and totals only the active ones", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await seedOneCharge(ownerId);
    const gym = await save(ownerId, {
      name: "Gym",
      cadenceMonths: 1,
      expectedCents: 5000,
    });
    const plan = await save(ownerId, {
      name: "Payment Plan",
      cadenceDays: 30,
      expectedCents: 7500,
    });
    await save(ownerId, { id: plan.id, status: "cancelled" });

    const listed = (await dispatchAgentTool(
      "list_recurring_bills",
      { window: "all" },
      ownerId,
    )) as { bills: ListedBill[]; annualTotalCents: number };

    const byName = new Map(listed.bills.map((bill) => [bill.merchant, bill]));
    expect(byName.get("Gym")).toMatchObject({
      id: gym.id,
      status: "active",
      declared: true,
    });
    // Cancelled stays visible as history, and says so.
    const cancelled = byName.get("Payment Plan");
    expect(cancelled).toMatchObject({ id: plan.id, status: "cancelled" });
    expect(cancelled?.annualCents).toBeGreaterThan(0);

    const activeTotal = listed.bills
      .filter((bill) => bill.status === "active")
      .reduce((total, bill) => total + bill.annualCents, 0);
    expect(listed.annualTotalCents).toBe(activeTotal);
    expect(listed.annualTotalCents).toBe(byName.get("Gym")?.annualCents);

    const intruder = (await dispatchAgentTool(
      "list_recurring_bills",
      { window: "all" },
      intruderId,
    )) as { bills: ListedBill[] };
    expect(intruder.bills.map((bill) => bill.id)).not.toContain(gym.id);
  });
});

async function seedSimpliSafe(userId: string): Promise<void> {
  await importFinanceCsvFiles({
    userId,
    files: [
      {
        name: "Chase9910_Activity_20260812.csv",
        text: [
          "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
          "03/09/2026,03/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
          "04/09/2026,04/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
          "",
        ].join("\n"),
      },
    ],
  });
}

async function envelopeExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.id, id));
  return rows.length > 0;
}

describeDb("delete_subscription", () => {
  it("deletes a mistaken bill and releases its payee and charges without losing them", async () => {
    const ownerId = await makeUser();
    await seedSimpliSafe(ownerId);
    const payees = (await dispatchAgentTool(
      "list_payees",
      { query: "simplisafe" },
      ownerId,
    )) as { payees: { id: string }[] };
    const payeeId = payees.payees[0]?.id;
    expect(payeeId).toBeDefined();
    const bill = await save(ownerId, {
      name: "SimpliSafe",
      payeeIds: [payeeId],
      cadenceMonths: 1,
      expectedCents: 3471,
    });
    const filed = (await listTransactions(ownerId)).filter(
      (row) => row.budgetCategoryId === bill.id,
    );
    expect(filed).toHaveLength(2);

    const deleted = await dispatchAgentTool(
      "delete_subscription",
      { id: bill.id },
      ownerId,
    );
    expect(deleted).toEqual({ deleted: true, id: bill.id, name: "SimpliSafe" });

    expect(await envelopeExists(bill.id)).toBe(false);
    const found = (await dispatchAgentTool(
      "search_commitments",
      { query: "SimpliSafe" },
      ownerId,
    )) as { commitments: unknown[] };
    expect(found.commitments).toEqual([]);

    // The payee survives with its claim released, and the charges survive unfiled.
    const after = (await dispatchAgentTool(
      "list_payees",
      { query: "simplisafe" },
      ownerId,
    )) as { payees: { id: string; claim: unknown }[] };
    expect(after.payees).toEqual([
      expect.objectContaining({ id: payeeId, claim: null }),
    ]);
    const charges = (await listTransactions(ownerId)).filter((row) =>
      filed.some((was) => was.id === row.id),
    );
    expect(charges).toHaveLength(2);
    expect(charges.every((row) => row.budgetCategoryId === null)).toBe(true);
  });

  it("refuses an envelope that is not a bill", async () => {
    const ownerId = await makeUser();
    const groceries = await createBudgetCategory(ownerId, {
      name: "Groceries",
      kind: "spending",
    });

    await expect(
      dispatchAgentTool("delete_subscription", { id: groceries }, ownerId),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await envelopeExists(groceries)).toBe(true);
  });

  it("will not let another user delete the bill", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    const bill = await save(ownerId, {
      name: "Gym",
      cadenceMonths: 1,
      expectedCents: 5000,
    });

    await expect(
      dispatchAgentTool("delete_subscription", { id: bill.id }, intruderId),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await envelopeExists(bill.id)).toBe(true);
  });
});
