import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { reclassifyTransactions, setOneOff, updateTransaction } from "./mutations";
import { listAccounts, listTransactions } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance reclassify");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `finance-reclassify-${crypto.randomUUID()}@localhost`,
      name: "Finance Reclassify Test",
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

const CHASE_HEADER = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
const CAPONE_BANK_HEADER =
  "Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance";

/** Six fortnightly deposits — enough for the cadence detector to call it a job. */
const PAYDAYS = [
  "03/06/26",
  "03/20/26",
  "04/03/26",
  "04/17/26",
  "05/01/26",
  "05/15/26",
];

const bankFile: ImportFile = {
  name: "2026-08-12_360Checking...2322.csv",
  text: [
    CAPONE_BANK_HEADER,
    ...PAYDAYS.map(
      (day) =>
        `2322,Deposit from GA8248 TRUSTEDQA PAYROLL,${day},Credit,2311.21,3075.67`,
    ),
    // Paired with the card's own payment row below.
    "2322,Withdrawal from CHASE CREDIT CRD EPAY,05/20/26,Debit,481.2,471.45",
    // No opposite leg anywhere: the card it paid was imported two years later.
    "2322,Withdrawal from CAPITAL ONE MOBILE PMT,05/21/26,Debit,1292.00,3000.00",
    "2322,TURBOTENANT.COM RENT:RAULI,05/01/26,Debit,2100.00,1000.00",
    "",
  ].join("\n"),
};

const cardFile: ImportFile = {
  name: "Chase9910_Activity_20260812.csv",
  text: [
    CHASE_HEADER,
    "05/22/2026,05/22/2026,Payment Thank You-Mobile,,Payment,481.20,",
    "05/02/2026,05/03/2026,WM SUPERCENTER #1981,Groceries,Sale,-84.12,",
    "05/04/2026,05/05/2026,INTEREST CHARGE ON PURCHASES,Fees & Adjustments,Fee,-31.09,",
    "",
  ].join("\n"),
};

async function seed(userId: string): Promise<void> {
  await importFinanceCsvFiles({ userId, files: [bankFile, cardFile] });
}

async function classifiedRows(userId: string) {
  const rows = await db
    .select({
      description: financeTransactions.description,
      derivedFlow: financeTransactions.derivedFlow,
      derivedCategory: financeTransactions.derivedCategory,
      transferGroupId: financeTransactions.transferGroupId,
    })
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));
  return rows;
}

function flowOf(rows: Awaited<ReturnType<typeof classifiedRows>>, needle: string) {
  return rows.find((row) => row.description.includes(needle))?.derivedFlow;
}

async function balances(userId: string): Promise<Record<string, number>> {
  const accounts = await listAccounts(userId);
  return Object.fromEntries(
    accounts.map((account) => [account.name, account.balanceCents]),
  );
}

describeDb("reclassifyTransactions", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await seed(userId);
  });

  it("never moves an account balance", async () => {
    // The sharpest test this layer has: a balance is `sum(amount)`, and nothing in a
    // reclassify touches `amount`, so any drift here means it wrote a column it must not.
    const before = await balances(userId);
    await reclassifyTransactions(userId);
    expect(await balances(userId)).toEqual(before);
  });

  it("takes card payments out of spending, paired or not", async () => {
    await reclassifyTransactions(userId);
    const rows = await classifiedRows(userId);

    expect(flowOf(rows, "CHASE CREDIT CRD EPAY")).toBe("internal_transfer");
    expect(flowOf(rows, "Payment Thank You-Mobile")).toBe("internal_transfer");
    // The unpaired leg still classifies — requiring a partner is what would leave six
    // figures of card payments counted as ordinary spending.
    expect(flowOf(rows, "CAPITAL ONE MOBILE PMT")).toBe("internal_transfer");

    const epay = rows.find((row) => row.description.includes("CHASE CREDIT CRD EPAY"));
    const thanks = rows.find((row) =>
      row.description.includes("Payment Thank You-Mobile"),
    );
    expect(epay?.transferGroupId).not.toBeNull();
    expect(thanks?.transferGroupId).toBe(epay?.transferGroupId);
    expect(
      rows.find((row) => row.description.includes("CAPITAL ONE MOBILE PMT"))
        ?.transferGroupId,
    ).toBeNull();
  });

  it("reads the fortnightly deposits as one job and categorises the rest", async () => {
    const summary = await reclassifyTransactions(userId);
    const rows = await classifiedRows(userId);

    expect(summary.paydayCount).toBe(PAYDAYS.length);
    expect(summary.medianPaycheckCents).toBe(231121);
    expect(summary.normalizedMonthlyIncomeCents).toBe(500762);
    expect(flowOf(rows, "TRUSTEDQA PAYROLL")).toBe("income");
    expect(flowOf(rows, "INTEREST CHARGE")).toBe("interest_fee");
    expect(
      rows.find((row) => row.description.includes("WM SUPERCENTER"))?.derivedCategory,
    ).toBe("Groceries");
    expect(
      rows.find((row) => row.description.includes("RENT:RAULI"))?.derivedCategory,
    ).toBe("Rent & Housing");
  });

  it("writes nothing on a second run and keeps every hand-made correction", async () => {
    const first = await reclassifyTransactions(userId);
    expect(first.updated).toBe(first.scanned);

    const [walmart] = (await listTransactions(userId)).filter((row) =>
      row.description.includes("WM SUPERCENTER"),
    );
    await updateTransaction(userId, walmart.id, {
      category: "Baby",
      flowOverride: "refund",
      notes: "returned half of it",
    });
    await setOneOff(userId, [walmart.id], {
      excludeFromBaseline: true,
      eventLabel: "House move",
    });

    const second = await reclassifyTransactions(userId);
    expect(second.updated).toBe(0);

    const [row] = await db
      .select({
        category: financeTransactions.category,
        flowOverride: financeTransactions.flowOverride,
        excludeFromBaseline: financeTransactions.excludeFromBaseline,
        eventLabel: financeTransactions.eventLabel,
        derivedFlow: financeTransactions.derivedFlow,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, walmart.id));

    expect(row).toMatchObject({
      category: "Baby",
      flowOverride: "refund",
      excludeFromBaseline: true,
      eventLabel: "House move",
      // The classifier still records what it thinks; the override sits beside it.
      derivedFlow: "spend",
    });
  });

  it("clears the event label when a row goes back into the baseline", async () => {
    const [rent] = (await listTransactions(userId)).filter((row) =>
      row.description.includes("RENT:RAULI"),
    );
    await setOneOff(userId, [rent.id], {
      excludeFromBaseline: true,
      eventLabel: "House move",
    });
    await setOneOff(userId, [rent.id], { excludeFromBaseline: false });

    const [row] = await db
      .select({
        excludeFromBaseline: financeTransactions.excludeFromBaseline,
        eventLabel: financeTransactions.eventLabel,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, rent.id));

    expect(row).toMatchObject({ excludeFromBaseline: false, eventLabel: "" });
  });
});

describeDb("reclassify user isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await seed(ownerId);
  });

  it("does not classify another user's rows", async () => {
    const summary = await reclassifyTransactions(intruderId);
    expect(summary).toMatchObject({ scanned: 0, updated: 0 });
    expect(
      (await classifiedRows(ownerId)).every((row) => row.derivedFlow === null),
    ).toBe(true);
  });

  it("leaves an owner's classification alone when the intruder reclassifies", async () => {
    await reclassifyTransactions(ownerId);
    const before = await classifiedRows(ownerId);

    await reclassifyTransactions(intruderId);

    expect(await classifiedRows(ownerId)).toEqual(before);
  });

  it("does not let a second user flag another user's transaction as a one-off", async () => {
    const [row] = await listTransactions(ownerId);
    await expect(
      setOneOff(intruderId, [row.id], { excludeFromBaseline: true }),
    ).rejects.toThrow("Transaction not found.");

    const [stored] = await db
      .select({ excludeFromBaseline: financeTransactions.excludeFromBaseline })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, row.id));
    expect(stored.excludeFromBaseline).toBe(false);
  });
});
