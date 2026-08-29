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
      description: externalId,
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

  it("deletes the browser rows the feed now covers and carries their state forward", async () => {
    const browserId = await insertRow(
      userId,
      accountId,
      "browser-cvs",
      "2026-08-22",
      -2284,
      { budgetCategoryId: envelopeId, notes: "receipt in the drawer" },
    );
    const feedId = await insertRow(
      userId,
      accountId,
      "simplefin-cvs",
      "2026-08-24",
      -2284,
      { externalSource: "api:simplefin" },
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

  it("leaves the browser's tail alone — it is past the watermark", async () => {
    await insertRow(userId, accountId, "simplefin-old", "2026-08-14", -1000, {
      externalSource: "api:simplefin",
    });
    await insertRow(userId, accountId, "browser-tail", "2026-08-28", -2284);

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result.retired).toBe(0);
    expect(await idsOn(userId, accountId)).toEqual(["browser-tail", "simplefin-old"]);
  });

  it("retires a covered browser hold along with the covered posted rows", async () => {
    await insertRow(userId, accountId, "simplefin-posted", "2026-08-24", -1000, {
      externalSource: "api:simplefin",
    });
    await insertRow(userId, accountId, "browser-hold", "2026-08-23", -555, {
      pending: true,
      postedDate: null,
    });

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result.retired).toBe(1);
    expect(await idsOn(userId, accountId)).toEqual(["simplefin-posted"]);
  });

  it("warns rather than losing a Category no feed row can absorb", async () => {
    await insertRow(userId, accountId, "simplefin-other", "2026-08-24", -1000, {
      externalSource: "api:simplefin",
    });
    await insertRow(userId, accountId, "browser-orphan", "2026-08-22", -2284, {
      budgetCategoryId: envelopeId,
    });

    const result = await retireCoveredScrapeRows(db, userId, accountId);

    expect(result).toMatchObject({ retired: 1, carried: 0 });
    expect(result.warnings[0]).toContain("browser-orphan");
  });

  it("moves a split onto the replacing row rather than cascading it away", async () => {
    const parentId = await insertRow(
      userId,
      accountId,
      "browser-split",
      "2026-08-22",
      -2284,
      { isParent: true },
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
      { externalSource: "api:simplefin" },
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
    });
    await insertRow(otherId, otherAccountId, "other-browser", "2026-08-22", -1000);

    // The first user asking about the second user's account must retire nothing: the
    // watermark query, the candidate query and the delete are all scoped by `userId`.
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
