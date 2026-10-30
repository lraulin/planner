import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  effectiveCategory,
  effectiveFlow,
  effectiveMerchant,
  paydaysFrom,
  spendCentsOf,
} from "./analytics";
import {
  loadBillCharges,
  loadBillForecast,
  loadCarryingCost,
  loadInsightsRows,
  loadMerchantNames,
  loadPaydays,
  loadRecurringBills,
  loadReviewCandidates,
  reviewCandidates,
  unclassifiedCount,
} from "./dashboardQueries";
import { payeeClaimIndex } from "./commitments";
import { localDateKey, shiftDateKey } from "@/lib/schedule/geometry";
import { billChargesOf } from "./billCharges";
import { listConnections } from "@/lib/banksync/queries";
import { loadAccountsWithPending } from "./workingPendingQuery";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { createBudgetCategory, createCategoryGroup } from "./budget/mutations";
import { reclassifyTransactions, upsertBillEnvelope } from "./mutations";
import { listTransactions } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance dashboard queries");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `finance-dashboard-${crypto.randomUUID()}@localhost`,
      name: "Finance Dashboard Test",
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

const cardFile: ImportFile = {
  name: "Chase9910_Activity_20260812.csv",
  text: [
    "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
    "03/02/2026,03/03/2026,WM SUPERCENTER #1981,Groceries,Sale,-84.12,",
    "03/09/2026,03/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
    "04/09/2026,04/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
    "",
  ].join("\n"),
};

/** Invented Prime Visa extract in the shape the parser reads. No real card or person. */
const statementFile: ImportFile = {
  name: "20260318-statements-9910.pdf",
  text: [
    "Manage your account online:",
    "Payment Due Date: 04/15/26",
    "New Balance: $118.83",
    "Minimum Payment Due: $35.00",
    "www.chase.com/cardhelp",
    "Account Number: XXXX XXXX XXXX 9910",
    "New Balance $118.83",
    "Past Due Amount $0.00",
    "Balance over the Credit Access Line $0.00",
    "Previous Balance $10.00",
    "Payment, Credits -$20.00",
    "Purchases +$118.83",
    "Cash Advances $0.00",
    "Balance Transfers $0.00",
    "Fees Charged $29.00",
    "Interest Charged $12.45",
    "Opening/Closing Date 02/19/26 - 03/18/26",
    "Credit Access Line $6,000",
    "Available Credit $5,881",
    "ACCOUNT ACTIVITY",
    "Page 2 of 3 Statement Date: 03/18/26",
    "Date of",
    "Transaction Merchant Name or Transaction Description $ Amount",
    "03/02 WM SUPERCENTER #1981 84.12",
    "Total fees charged in 2026 $29.00",
    "Total interest charged in 2026 $12.45",
    "Purchases 24.99%(v)(d) - 0 - - 0 -",
    "Cash Advances 29.99%(v)(d) - 0 - - 0 -",
    "",
  ].join("\n"),
};

async function seed(userId: string): Promise<void> {
  await importFinanceCsvFiles({ userId, files: [cardFile, statementFile] });
}

describeDb("loadInsightsRows", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await seed(userId);
  });

  it("hands back rows the analytics layer can classify without another query", async () => {
    await reclassifyTransactions(userId);
    const rows = await loadInsightsRows(userId);

    expect(rows).toHaveLength(3);
    // Oldest first, so a running balance does not need a second sort.
    expect(rows.map((row) => row.transactionDate)).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-04-09",
    ]);
    expect(rows.every((row) => row.accountName === "Chase •••9910")).toBe(true);
    expect(effectiveFlow(rows[0])).toBe("spend");
    expect(effectiveCategory(rows[0])).toBe("Uncategorized");
    expect(rows.every((row) => row.payeeId !== null && row.payeeName !== null)).toBe(
      true,
    );
  });

  it("windows on the date when asked", async () => {
    const rows = await loadInsightsRows(userId, {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(rows).toHaveLength(2);
  });
});

describeDb("loadPaydays", () => {
  let userId: string;

  /** Biweekly deposits on the seeded account, with the flow columns set as given. */
  async function deposit(
    transactionDate: string,
    flow: {
      derivedFlow: "income" | "refund" | "spend";
      flowOverride?: "income" | "refund";
    },
  ): Promise<void> {
    const [account] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId));
    await db.insert(financeTransactions).values({
      userId,
      accountId: account.id,
      transactionDate,
      description: "ACME CORP PAYROLL",
      amount: "2000.00",
      ...flow,
    });
  }

  beforeEach(async () => {
    userId = await makeUser();
    await seed(userId);
    for (const day of ["2026-01-02", "2026-01-16", "2026-01-30", "2026-02-27"]) {
      await deposit(day, { derivedFlow: "income" });
    }
    // Income only because the user said so: the narrow read has to honour an override.
    await deposit("2026-02-13", { derivedFlow: "refund", flowOverride: "income" });
    // And not income because the user said so, whatever the classifier derived.
    await deposit("2026-03-13", { derivedFlow: "income", flowOverride: "refund" });
  });

  it("finds the paydays the full ledger read finds, from the income rows alone", async () => {
    const paydays = await loadPaydays(userId);

    expect(paydays.map((payday) => payday.dateKey)).toEqual([
      "2026-01-02",
      "2026-01-16",
      "2026-01-30",
      "2026-02-13",
      "2026-02-27",
    ]);
    expect(paydays).toEqual(paydaysFrom(await loadInsightsRows(userId)));
  });

  it("does not hand a second user another user's paydays", async () => {
    const intruderId = await makeUser();
    expect(await loadPaydays(intruderId)).toEqual([]);
    expect((await loadPaydays(userId)).length).toBe(5);
  });
});

describeDb("unclassifiedCount", () => {
  it("counts what a reclassify has never seen, and then stops", async () => {
    const userId = await makeUser();
    await seed(userId);

    // Import classifies as it writes, so a finished ingest is fully classified.
    expect(await unclassifiedCount(userId)).toBe(0);

    const [existing] = await listTransactions(userId);
    await db.insert(financeTransactions).values({
      userId,
      accountId: existing.accountId,
      transactionDate: "2026-05-01",
      description: "UNSEEN MERCHANT",
      amount: "-12.00",
    });

    expect(await unclassifiedCount(userId)).toBe(1);
    await reclassifyTransactions(userId);
    expect(await unclassifiedCount(userId)).toBe(0);
  });
});

describeDb("loadCarryingCost", () => {
  it("reads interest, fees and the APR off the statements as positive costs", async () => {
    const userId = await makeUser();
    await seed(userId);

    const cost = await loadCarryingCost(userId);

    expect(cost.interestCents).toBe(1245);
    expect(cost.feesCents).toBe(2900);
    expect(cost.byAccount).toHaveLength(1);
    expect(cost.byAccount[0]).toMatchObject({
      accountName: "Chase •••9910",
      interestCents: 1245,
      feesCents: 2900,
      latestAprPercent: 29.99,
      latestCreditLimitCents: 600000,
      statementCount: 1,
    });
  });

  it("windows on the statement period", async () => {
    const userId = await makeUser();
    await seed(userId);

    const cost = await loadCarryingCost(userId, { from: "2026-04-01" });
    expect(cost).toMatchObject({ interestCents: 0, feesCents: 0, byAccount: [] });
  });
});

describeDb("insights user isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await seed(ownerId);
    await reclassifyTransactions(ownerId);
  });

  it("does not hand a second user another user's rows, counts or statements", async () => {
    expect(await loadInsightsRows(intruderId)).toEqual([]);
    expect(await unclassifiedCount(intruderId)).toBe(0);
    expect(await loadCarryingCost(intruderId)).toMatchObject({
      interestCents: 0,
      feesCents: 0,
      byAccount: [],
    });

    // And the owner still sees everything, so the assertions above are not passing because
    // the seed silently failed.
    expect((await loadInsightsRows(ownerId)).length).toBe(3);
    expect((await loadCarryingCost(ownerId)).interestCents).toBe(1245);
  });
});

describeDb("loadReviewCandidates", () => {
  /**
   * A ledger where both detectors find something, and where each row the narrow read drops
   * is one the detectors would have dropped themselves: a refund, a positive interest_fee,
   * a flow decided to be income by override, a transfer, and a charge that is a spend only
   * because it was never classified. Dates hang off today because `spendCandidates` measures
   * its lookback from it.
   */
  async function seedRecurring(userId: string) {
    await seed(userId);
    const today = localDateKey(new Date());
    const [account] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId));
    const rows: (typeof financeTransactions.$inferInsert)[] = [];
    const add = (
      description: string,
      daysAgo: number,
      amount: string,
      extra: Partial<typeof financeTransactions.$inferInsert> = {},
    ) =>
      rows.push({
        userId,
        accountId: account.id,
        transactionDate: shiftDateKey(today, -daysAgo),
        description,
        amount,
        ...extra,
      });
    // Bill-shaped: monthly, same amount.
    for (let month = 1; month <= 8; month++)
      add("STREAMCO MONTHLY", month * 30, "-12.99");
    // Spend-shaped: most weeks, an amount that swings.
    for (let week = 1; week <= 20; week++) {
      add(
        "CORNERSHOP GROCERY",
        week * 7 + 1,
        `-${(20 + ((week * 17) % 60)).toFixed(2)}`,
      );
    }
    // Rows the detectors must see as non-charges.
    add("STREAMCO MONTHLY", 12, "5.00");
    add("STREAMCO MONTHLY", 14, "3.00");
    // Same amount as the real charges, so a wrongly kept row would move the typical amount,
    // the count and the gaps rather than hide inside the variance.
    add("STREAMCO MONTHLY", 16, "-12.99");
    add("STREAMCO MONTHLY", 18, "-12.99");
    add("STREAMCO MONTHLY", 20, "-12.99");
    // A negative amount flowing as refund is still a cost to the detectors (`spendCentsOf`
    // is positive for it), so the narrow read has to keep it.
    add("STREAMCO MONTHLY", 22, "-12.99");
    add("CORNERSHOP GROCERY", 3, "-9.00");
    await db.insert(financeTransactions).values(rows);
    await reclassifyTransactions(userId);

    // Set the flow columns after classification, which would otherwise re-derive them.
    const byAmount = async (amount: string, daysAgo: number) => {
      const [row] = await db
        .select({ id: financeTransactions.id })
        .from(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.amount, amount),
            eq(financeTransactions.transactionDate, shiftDateKey(today, -daysAgo)),
          ),
        );
      return row.id;
    };
    const set = (
      id: string,
      values: Partial<typeof financeTransactions.$inferInsert>,
    ) =>
      db.update(financeTransactions).set(values).where(eq(financeTransactions.id, id));
    await set(await byAmount("5.00", 12), { derivedFlow: "refund" });
    await set(await byAmount("3.00", 14), { derivedFlow: "interest_fee" });
    await set(await byAmount("-12.99", 16), { derivedFlow: null, flowOverride: null });
    await set(await byAmount("-12.99", 18), { flowOverride: "income" });
    await set(await byAmount("-12.99", 20), { derivedFlow: "internal_transfer" });
    await set(await byAmount("-12.99", 22), { derivedFlow: "refund" });
  }

  it("finds the candidates the full ledger finds, from spend charges alone", async () => {
    const userId = await makeUser();
    await seedRecurring(userId);

    const narrow = await loadReviewCandidates(userId);
    const bills = await loadRecurringBills(userId);
    const expected = reviewCandidates(
      await loadInsightsRows(userId),
      bills,
      payeeClaimIndex(bills),
      new Set(),
    );

    expect(narrow).toEqual(expected);
    // Neither side is empty, so the equality is not two blank lists, and each detector
    // contributed.
    expect(narrow.map((entry) => [entry.merchant, entry.shape])).toEqual(
      expect.arrayContaining([
        ["STREAMCO MONTHLY", "bill"],
        ["CORNERSHOP GROCERY", "spend"],
      ]),
    );
  });

  it("hands a second user none of the first user's candidates", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await seedRecurring(ownerId);

    expect(await loadReviewCandidates(intruderId)).toEqual([]);
    expect((await loadReviewCandidates(ownerId)).length).toBeGreaterThan(0);
  });
});

describeDb("the reads the retired dashboard was composed from", () => {
  /**
   * The edge cases the narrow bill read's argument depends on: every row that reaches a bill
   * envelope by some route the full read handles in its own way. If `loadBillCharges` ever
   * decided one of these in SQL instead of leaving it to `spendCentsOf`, the comparison with
   * the full read would diverge here.
   */
  async function seedBillLedger(userId: string) {
    await seed(userId);
    await reclassifyTransactions(userId);
    await createCategoryGroup(userId, { name: "Household", kind: "spending" });
    const alarmId = await upsertBillEnvelope(userId, {
      name: "Alarm",
      cadence: { unit: "month", n: 1 },
      expectedCents: 3_471,
    });
    const internetId = await upsertBillEnvelope(userId, {
      name: "Internet",
      cadence: { unit: "month", n: 1 },
      expectedCents: 6_000,
    });
    const groceriesId = await createBudgetCategory(userId, {
      name: "Groceries",
      kind: "spending",
    });
    const [account] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId));
    const insert = async (
      values: Partial<typeof financeTransactions.$inferInsert> &
        Pick<typeof financeTransactions.$inferInsert, "transactionDate" | "amount">,
    ) => {
      const [row] = await db
        .insert(financeTransactions)
        .values({
          userId,
          accountId: account.id,
          description: "ACME BILL",
          ...values,
        })
        .returning({ id: financeTransactions.id });
      return row.id;
    };

    // An ordinary charge, and a refund and a positive interest_fee: neither is a cost.
    await insert({
      transactionDate: "2026-05-09",
      amount: "-34.71",
      derivedFlow: "spend",
      budgetCategoryId: alarmId,
    });
    await insert({
      transactionDate: "2026-05-10",
      amount: "10.00",
      derivedFlow: "refund",
      budgetCategoryId: alarmId,
    });
    await insert({
      transactionDate: "2026-05-11",
      amount: "1.50",
      derivedFlow: "interest_fee",
      budgetCategoryId: alarmId,
    });
    await insert({
      transactionDate: "2026-05-12",
      amount: "-2.00",
      derivedFlow: "interest_fee",
      budgetCategoryId: alarmId,
    });
    // Never classified: the fallback calls a negative amount spend, and the dashboard counted it.
    await insert({
      transactionDate: "2026-05-13",
      amount: "-60.00",
      derivedFlow: null,
      budgetCategoryId: internetId,
    });
    // Decided only by the override: derived as income, said to be spend.
    await insert({
      transactionDate: "2026-05-14",
      amount: "-70.00",
      derivedFlow: "income",
      flowOverride: "spend",
      budgetCategoryId: internetId,
    });
    // And the reverse: derived as spend, said to be income, so not a cost.
    await insert({
      transactionDate: "2026-05-15",
      amount: "-80.00",
      derivedFlow: "spend",
      flowOverride: "income",
      budgetCategoryId: internetId,
    });
    // A split child filed to a bill. Its parent is a bank row, not a money row.
    const parentId = await insert({
      transactionDate: "2026-05-16",
      amount: "-90.00",
      derivedFlow: "spend",
      isParent: true,
    });
    await insert({
      transactionDate: "2026-05-16",
      amount: "-50.00",
      derivedFlow: "spend",
      parentId,
      splitPosition: 0,
      budgetCategoryId: internetId,
    });
    await insert({
      transactionDate: "2026-05-16",
      amount: "-40.00",
      derivedFlow: "spend",
      parentId,
      splitPosition: 1,
      budgetCategoryId: groceriesId,
    });
    // A pending hold from the other source, which the working-balance rule supersedes.
    await insert({
      transactionDate: "2026-05-17",
      amount: "-5.00",
      derivedFlow: "spend",
      pending: true,
      externalSource: "scrape:chase",
      externalId: "superseded-hold",
      budgetCategoryId: alarmId,
    });
    // Filed to an envelope that is not a bill.
    await insert({
      transactionDate: "2026-05-18",
      amount: "-25.00",
      derivedFlow: "spend",
      budgetCategoryId: groceriesId,
    });
    return { alarmId, internetId };
  }

  /** The loop the dashboard and the forecast ran over every row, kept as the oracle. */
  async function chargesFromFullRead(userId: string) {
    const [rows, bills] = await Promise.all([
      loadInsightsRows(userId),
      loadRecurringBills(userId),
    ]);
    const names = new Map(bills.map((bill) => [bill.id, bill.name]));
    return rows.flatMap((row) => {
      const name = row.budgetCategoryId ? names.get(row.budgetCategoryId) : undefined;
      const costCents = spendCentsOf(row);
      return name === undefined || costCents <= 0
        ? []
        : [{ name, dateKey: row.transactionDate, costCents }];
    });
  }

  it("reads only rows filed to a bill, and derives the charges the full read does", async () => {
    const userId = await makeUser();
    const { alarmId, internetId } = await seedBillLedger(userId);

    const narrow = await loadBillCharges(userId);
    const bills = await loadRecurringBills(userId);
    const derived = billChargesOf(narrow, bills).flat.map((charge) => ({
      name: charge.name,
      dateKey: charge.dateKey,
      costCents: charge.costCents,
    }));

    expect(derived).toEqual(await chargesFromFullRead(userId));
    // Pinned, so the equality above is not two empty lists. Out: the refund, the positive
    // interest_fee, the row the user said is income, the split parent, the superseded hold
    // and the grocery row. In: the unclassified row and the one made spend by override.
    expect(derived).toEqual([
      { name: "Alarm", dateKey: "2026-05-09", costCents: 3_471 },
      { name: "Alarm", dateKey: "2026-05-12", costCents: 200 },
      { name: "Internet", dateKey: "2026-05-13", costCents: 6_000 },
      { name: "Internet", dateKey: "2026-05-14", costCents: 7_000 },
      { name: "Internet", dateKey: "2026-05-16", costCents: 5_000 },
    ]);
    // Everything filed to a bill is read, costs or not: the cost test is the pure function's.
    expect(narrow.map((row) => row.budgetCategoryId)).toEqual(
      expect.arrayContaining([alarmId, internetId]),
    );
    expect(narrow).toHaveLength(8);
    expect(narrow.map((row) => row.transactionDate)).toEqual(
      [...narrow.map((row) => row.transactionDate)].sort(),
    );
  });

  it("builds the forecast from those charges, and a second user's forecast is empty", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await seedBillLedger(ownerId);

    const forecast = await loadBillForecast(ownerId, "2026-09-05");
    const bills = await loadRecurringBills(ownerId);
    const idByName = new Map(bills.map((bill) => [bill.name, bill.id]));
    const expected = new Map<string, { dateKey: string; costCents: number }[]>();
    for (const charge of await chargesFromFullRead(ownerId)) {
      const id = idByName.get(charge.name);
      if (!id) throw new Error(`no bill named ${charge.name}`);
      expected.set(id, [
        ...(expected.get(id) ?? []),
        { dateKey: charge.dateKey, costCents: charge.costCents },
      ]);
    }

    expect(expected.size).toBe(2);
    expect(forecast.chargesByBill).toEqual(expected);
    expect(forecast.chargeKeys).toEqual(
      new Map(
        [...expected].map(([id, charges]) => [
          id,
          charges.map((charge) => charge.dateKey).sort(),
        ]),
      ),
    );
    expect(forecast.billRows.map((row) => row.name).sort()).toEqual([
      "Alarm",
      "Internet",
    ]);

    const intruder = await loadBillForecast(intruderId, "2026-09-05");
    expect(intruder.billRows).toEqual([]);
    expect(intruder.chargesByBill.size).toBe(0);
    expect(intruder.chargeKeys.size).toBe(0);
  });

  it("finds the merchant names the full read finds, once each", async () => {
    const userId = await makeUser();
    await seedBillLedger(userId);

    const rows = await loadInsightsRows(userId);
    const expected = [...new Set(rows.map((row) => effectiveMerchant(row)))]
      .filter((name) => name !== "")
      .sort((left, right) => left.localeCompare(right));

    const names = await loadMerchantNames(userId);
    expect(names).toEqual(expected);
    expect(names).toContain("SimpliSafe");
    expect(new Set(names).size).toBe(names.length);
  });

  it("reports no pending rows for a register built from files", async () => {
    // Pending only ever arrives from a live feed. An import that produced pending rows would
    // mean the CSV path had started writing a column only the sync is allowed to own.
    const userId = await makeUser();
    await seed(userId);

    expect((await loadAccountsWithPending(userId)).pending.rows).toEqual([]);
  });

  it("hands a second user none of the first user's bill charges, merchants or candidates", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await seedBillLedger(ownerId);
    // The intruder owns an envelope and an account of their own, so an empty answer is not
    // "this user has no bills".
    await upsertBillEnvelope(intruderId, {
      name: "Alarm",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1_000,
    });

    expect(await loadBillCharges(intruderId)).toEqual([]);
    expect(await loadMerchantNames(intruderId)).toEqual([]);
    expect(await loadReviewCandidates(intruderId)).toEqual([]);
    expect((await loadAccountsWithPending(intruderId)).accounts).toEqual([]);
    expect(await listConnections(intruderId)).toEqual([]);

    // The owner still sees theirs, so none of the above passed on an empty seed.
    expect((await loadBillCharges(ownerId)).length).toBe(8);
    expect((await loadMerchantNames(ownerId)).length).toBeGreaterThan(0);
    expect((await loadAccountsWithPending(ownerId)).accounts).toHaveLength(1);
  });

  it("does not let another user's row filed to this user's envelope count as a charge", async () => {
    // The envelope id is the join key, so a row of another user that names it must not
    // reach the owner's charges: each side of the join carries its own `user_id`.
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    const { alarmId } = await seedBillLedger(ownerId);
    await seed(intruderId);
    const [intruderAccount] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, intruderId));
    await db.insert(financeTransactions).values({
      userId: intruderId,
      accountId: intruderAccount.id,
      transactionDate: "2026-05-20",
      description: "NOT YOURS",
      amount: "-999.00",
      derivedFlow: "spend",
      budgetCategoryId: alarmId,
    });

    const owner = await loadBillCharges(ownerId);
    expect(owner).toHaveLength(8);
    expect(owner.some((row) => row.amountCents === -99_900)).toBe(false);
    expect(await loadBillCharges(intruderId)).toEqual([]);
  });
});
