import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { retireCoveredScrapeRows } from "./feedHandoverWrite";
import { seedBudget } from "./budget/mutations";
import { categoryMonth, findMonth } from "./budget/envelope";
import { loadBudget } from "./budget/queries";
import { listAccounts } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("feed handover");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `feed-handover-${crypto.randomUUID()}@localhost`,
      name: "Feed Handover Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function makeAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Chase Prime Visa",
      kind: "credit_card",
      institution: "Chase",
      externalSource: "csv:chase-credit",
      externalKey: "9910",
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

type RowOverrides = Partial<{
  postedDate: string | null;
  pending: boolean;
  budgetCategoryId: string | null;
  notes: string;
  isParent: boolean;
  externalSource: string;
  description: string;
}>;

async function insertRow(
  userId: string,
  accountId: string,
  externalId: string,
  transactionDate: string,
  amountCents: number,
  over: RowOverrides = {},
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate,
      postedDate: over.postedDate === undefined ? transactionDate : over.postedDate,
      pending: over.pending ?? false,
      description: over.description ?? externalId,
      amount: (amountCents / 100).toFixed(2),
      sourceCategory: "",
      notes: over.notes ?? "",
      budgetCategoryId: over.budgetCategoryId ?? null,
      isParent: over.isParent ?? false,
      externalSource: over.externalSource ?? "scrape:chase",
      externalId,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

async function envelopeFor(userId: string): Promise<string> {
  await seedBudget(userId, {
    preset: "minimal",
    startMonth: "2026-08-01",
    todayKey: "2026-08-29",
  });
  const categories = await db
    .select({ id: financeBudgetCategories.id, kind: financeBudgetCategories.kind })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.userId, userId));
  return categories.find((category) => category.kind !== "income")!.id;
}

async function idsOn(userId: string, accountId: string): Promise<string[]> {
  const rows = await db
    .select({ externalId: financeTransactions.externalId })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
      ),
    );
  return rows.flatMap((row) => (row.externalId ? [row.externalId] : [])).sort();
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("retireCoveredScrapeRows", () => {
  let userId: string;
  let accountId: string;
  let envelopeId: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
    envelopeId = await envelopeFor(userId);
  });

  it("deletes a browser row that pairs with a feed row and carries their state forward", async () => {
    const browserId = await insertRow(
      userId,
      accountId,
      "browser-cvs",
      "2026-08-22",
      -2284,
      {
        budgetCategoryId: envelopeId,
        notes: "receipt in the drawer",
        description: "CVS",
      },
    );
    const feedId = await insertRow(
      userId,
      accountId,
      "simplefin-cvs",
      "2026-08-24",
      -2284,
      { externalSource: "api:simplefin", description: "CVS/PHARMACY #01522" },
    );

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result).toMatchObject({ retired: 1, carried: 1 });
    expect(await idsOn(userId, accountId)).toEqual(["simplefin-cvs"]);
    const [feed] = await db
      .select({
        budgetCategoryId: financeTransactions.budgetCategoryId,
        notes: financeTransactions.notes,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, feedId));
    expect(feed.budgetCategoryId).toBe(envelopeId);
    expect(feed.notes).toBe("receipt in the drawer");
    const gone = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, browserId));
    expect(gone).toEqual([]);
  });

  it("moves no money when the feed delivers a charge the browser already held", async () => {
    // The real sequence, in the order it happens: the browser holds the charge, then the
    // sync inserts SimpleFIN's copy and retires the browser's in one commit. The register
    // loses a row and the money stays exactly where it was — which is the whole point,
    // since the failure this spec fixes was budget numbers moving with no money movement.
    await insertRow(userId, accountId, "browser-cvs", "2026-08-22", -2284, {
      budgetCategoryId: envelopeId,
      description: "CVS",
    });

    const before = await loadBudget(userId, "2026-08-01");
    const beforeMonth = findMonth(before.months, "2026-08-01")!;
    const beforeEnvelope = categoryMonth(beforeMonth, envelopeId);
    const beforeBalance = (await listAccounts(userId))[0].balanceCents;

    await db.transaction(async (tx) => {
      await tx.insert(financeTransactions).values({
        userId,
        accountId,
        transactionDate: "2026-08-22",
        postedDate: "2026-08-24",
        description: "CVS/PHARMACY #01522",
        amount: "-22.84",
        sourceCategory: "",
        externalSource: "api:simplefin",
        externalId: "simplefin-cvs",
      });
      const result = await retireCoveredScrapeRows(tx, userId, accountId);
      expect(result).toMatchObject({ retired: 1, carried: 1 });
    });

    const after = await loadBudget(userId, "2026-08-01");
    const afterMonth = findMonth(after.months, "2026-08-01")!;
    expect(afterMonth.readyToAssignCents).toBe(beforeMonth.readyToAssignCents);
    expect(categoryMonth(afterMonth, envelopeId)).toEqual(beforeEnvelope);
    expect((await listAccounts(userId))[0].balanceCents).toBe(beforeBalance);
    expect(await idsOn(userId, accountId)).toEqual(["simplefin-cvs"]);
  });

  it("leaves an unrelated browser row alone", async () => {
    await insertRow(userId, accountId, "simplefin-old", "2026-08-14", -1000, {
      externalSource: "api:simplefin",
      description: "Merchant A",
    });
    await insertRow(userId, accountId, "browser-tail", "2026-08-28", -2284, {
      description: "Merchant B",
    });

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result.retired).toBe(0);
    expect(await idsOn(userId, accountId)).toEqual(["browser-tail", "simplefin-old"]);
  });

  it("retires a browser hold once its own posted twin arrives on the feed", async () => {
    await insertRow(userId, accountId, "simplefin-posted", "2026-08-24", -2284, {
      externalSource: "api:simplefin",
      description: "CVS/PHARMACY #01522",
    });
    await insertRow(userId, accountId, "browser-hold", "2026-08-23", -2284, {
      pending: true,
      postedDate: null,
      description: "CVS",
    });

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result.retired).toBe(1);
    expect(await idsOn(userId, accountId)).toEqual(["simplefin-posted"]);
  });

  it("D1: a pending hold with no posted twin survives any number of syncs", async () => {
    // The production defect: Vetsource, Domino's, Starbucks and Apple holds were deleted
    // by date coverage even though nothing on the feed was actually that charge. A hold
    // with no real pair must never be deleted just because a sync ran.
    await insertRow(userId, accountId, "simplefin-other", "2026-08-24", -1000, {
      externalSource: "api:simplefin",
      description: "Merchant Other",
    });
    await insertRow(userId, accountId, "browser-hold", "2026-08-23", -2970, {
      pending: true,
      postedDate: null,
      budgetCategoryId: envelopeId,
      description: "Vetsource",
    });

    for (let run = 0; run < 3; run++) {
      const result = await retireCoveredScrapeRows(db, userId, accountId);
      expect(result.retired).toBe(0);
    }
    expect(await idsOn(userId, accountId)).toEqual(["browser-hold", "simplefin-other"]);
    const [hold] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "browser-hold"));
    expect(hold.budgetCategoryId).toBe(envelopeId);
  });

  it("D1: a posted row with no matching feed row stays, with no warning", async () => {
    await insertRow(userId, accountId, "simplefin-other", "2026-08-24", -1000, {
      externalSource: "api:simplefin",
      description: "Merchant Other",
    });
    await insertRow(userId, accountId, "browser-orphan", "2026-08-22", -2284, {
      budgetCategoryId: envelopeId,
      description: "Merchant Orphan",
    });

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result).toMatchObject({ retired: 0, carried: 0, warnings: [] });
    expect(await idsOn(userId, accountId)).toEqual([
      "browser-orphan",
      "simplefin-other",
    ]);
  });

  it("does not pair a scraped ChatGPT row onto SimpleFIN's Claude row two days away", async () => {
    await insertRow(userId, accountId, "browser-chatgpt", "2026-09-07", -2120, {
      budgetCategoryId: envelopeId,
      description: "ChatGPT",
    });
    await insertRow(userId, accountId, "simplefin-claude", "2026-09-09", -2120, {
      externalSource: "api:simplefin",
      description: "Claude",
    });

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result).toMatchObject({ retired: 0, carried: 0 });
    expect(await idsOn(userId, accountId)).toEqual([
      "browser-chatgpt",
      "simplefin-claude",
    ]);
  });

  it("Sep 10 replay: a partial delivery only retires the day it actually covers", async () => {
    await insertRow(userId, accountId, "scrape-sep-1", "2026-09-01", -101, {
      description: "Merchant A",
    });
    const sep7Id = await insertRow(
      userId,
      accountId,
      "scrape-sep-7",
      "2026-09-07",
      -707,
      {
        description: "Merchant G",
        budgetCategoryId: envelopeId,
      },
    );
    await insertRow(userId, accountId, "feed-sep-8", "2026-09-08", -808, {
      externalSource: "api:simplefin",
      description: "Merchant H",
    });
    await insertRow(userId, accountId, "feed-sep-9", "2026-09-09", -909, {
      externalSource: "api:simplefin",
      description: "Merchant I",
    });

    const firstRun = await retireCoveredScrapeRows(db, userId, accountId);
    expect(firstRun.retired).toBe(0);
    expect(await idsOn(userId, accountId)).toEqual([
      "feed-sep-8",
      "feed-sep-9",
      "scrape-sep-1",
      "scrape-sep-7",
    ]);

    const feedSep7Id = await insertRow(
      userId,
      accountId,
      "feed-sep-7",
      "2026-09-07",
      -707,
      { externalSource: "api:simplefin", description: "Merchant G" },
    );

    const secondRun = await retireCoveredScrapeRows(db, userId, accountId);
    expect(secondRun).toMatchObject({ retired: 1, carried: 1 });
    expect(await idsOn(userId, accountId)).toEqual([
      "feed-sep-7",
      "feed-sep-8",
      "feed-sep-9",
      "scrape-sep-1",
    ]);
    const [gone] = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, sep7Id));
    expect(gone).toBeUndefined();
    const [feedRow] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, feedSep7Id));
    expect(feedRow.budgetCategoryId).toBe(envelopeId);
  });

  it("moves a split onto the replacing row rather than cascading it away", async () => {
    const parentId = await insertRow(
      userId,
      accountId,
      "browser-split",
      "2026-08-22",
      -2284,
      { isParent: true, description: "CVS" },
    );
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-22",
      postedDate: "2026-08-22",
      description: "half",
      amount: "-11.42",
      sourceCategory: "",
      budgetCategoryId: envelopeId,
      parentId,
      externalSource: "scrape:chase",
    });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-22",
      postedDate: "2026-08-22",
      description: "other half",
      amount: "-11.42",
      sourceCategory: "",
      budgetCategoryId: envelopeId,
      parentId,
      externalSource: "scrape:chase",
    });
    const feedId = await insertRow(
      userId,
      accountId,
      "simplefin-split",
      "2026-08-24",
      -2284,
      { externalSource: "api:simplefin", description: "CVS/PHARMACY #01522" },
    );

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result.retired).toBe(1);
    const children = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.parentId, feedId),
        ),
      );
    expect(children).toHaveLength(2);
    const [parent] = await db
      .select({ isParent: financeTransactions.isParent })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, feedId));
    expect(parent.isParent).toBe(true);
  });

  it("cannot reach another user's rows", async () => {
    const otherId = await makeUser();
    const otherAccountId = await makeAccount(otherId);
    await insertRow(otherId, otherAccountId, "other-simplefin", "2026-08-24", -1000, {
      externalSource: "api:simplefin",
      description: "CVS/PHARMACY #01522",
    });
    await insertRow(otherId, otherAccountId, "other-browser", "2026-08-22", -1000, {
      description: "CVS",
    });

    // The first user asking about the second user's account must retire nothing: every
    // query and the final delete are all scoped by `userId`.
    const trespass = await retireCoveredScrapeRows(db, userId, otherAccountId);
    expect(trespass).toMatchObject({ retired: 0, carried: 0 });
    expect(await idsOn(otherId, otherAccountId)).toEqual([
      "other-browser",
      "other-simplefin",
    ]);

    // And the second user's own handover still works, proving the rows were retirable.
    const own = await retireCoveredScrapeRows(db, otherId, otherAccountId);
    expect(own.retired).toBe(1);
    expect(await idsOn(otherId, otherAccountId)).toEqual(["other-simplefin"]);
  });
});
