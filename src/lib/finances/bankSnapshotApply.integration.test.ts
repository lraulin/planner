import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { recordSourceState } from "./sourceStateWrite";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditChanges,
  financeAuditEvents,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeCaptureCoverage,
  financeTransactions,
  users,
} from "@/db/schema";
import { linkAccount, saveBalance, saveConnection } from "@/lib/banksync/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadFinanceAuditEvent, listFinanceAuditEvents } from "./audit/queries";
import { seedBudget } from "./budget/mutations";
import { categoryMonth, findMonth } from "./budget/envelope";
import { loadBudget } from "./budget/queries";
import {
  PLANNER_BANK_SNAPSHOT_HEADER,
  type BankBrowserSnapshotV1,
} from "./bankSnapshot";
import { applyBankBrowserSnapshot } from "./bankSnapshotApply";
import { listAccounts, listTransactions } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("bank snapshot apply");

const createdUserIds: string[] = [];
const MONTH = "2026-08-01";
/**
 * The 36-hour scrape hold is measured from this instant. A hard-coded Aug 29 2026
 * capture expired on the evening of Aug 30: pending scrape rows dropped out of
 * envelope activity, then apply refreshed `browserPendingAsOf` back into the window
 * and the same rows jumped back in. Pinning to now keeps the hold live for the
 * whole suite, which is the situation the "pending posts do not move checkpoints"
 * case is actually about.
 */
const CAPTURED_AT = new Date();

const posted = [
  ["Aug 27, 2026", "CVS", "$22.84"],
  ["Aug 27, 2026", "AMAZON MKTPL", "$19.25"],
  ["Aug 26, 2026", "SIMPLISAFE", "$34.97"],
  ["Aug 26, 2026", "CHIPOTLE", "$16.91"],
  ["Aug 25, 2026", "GROCERY", "$45.00"],
  ["Aug 25, 2026", "CAFE", "$12.00"],
  ["Aug 24, 2026", "PARKING", "$20.00"],
  ["Aug 24, 2026", "PHARMACY", "$20.95"],
] as const;

const pending = [
  ["Aug 29, 2026", "SHEETZ", "$35.85"],
  ["08/29/2026", "AMAZON MKTPL", "$48.86"],
] as const;

function snapshot(overrides: Partial<BankBrowserSnapshotV1> = {}): string {
  const body: BankBrowserSnapshotV1 = {
    version: 1,
    source: "chase",
    capturedAt: CAPTURED_AT.toISOString(),
    accountLast4: "9910",
    balanceKind: "posted_only",
    currentBalance: "$370.80",
    completeness: {
      currentCycle: true,
      posted: true,
      pending: true,
      filtered: false,
      searched: false,
    },
    posted: posted.map(([date, description, amount]) => ({
      transactionDate: date,
      postedDate: date,
      description,
      category: "Shopping",
      amount,
    })),
    pending: pending.map(([date, description, amount]) => ({
      transactionDate: date,
      postedDate: null,
      description,
      category: "",
      amount,
    })),
    ...overrides,
  };
  return `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify(body, null, 2)}\n`;
}

async function makeUser(name = "Bank Snapshot Test"): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `bank-snapshot-${crypto.randomUUID()}@localhost`,
      name,
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("applyBankBrowserSnapshot", () => {
  let userId: string;
  let accountId: string;
  let envelopeId: string;

  beforeEach(async () => {
    userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Chase Prime Visa",
        kind: "credit_card",
        institution: "Chase",
        externalSource: "csv:chase-credit",
        externalKey: "9910",
        // A paste is accepted only from an account that has chosen the bank page. The
        // SimpleFIN link below is kept: the cutover unlinks it as a later, separate step.
        historySource: "bank_page",
      })
      .returning({ id: financeAccounts.id });
    accountId = account.id;
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://test:test@example.invalid/simplefin",
    });
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: `chase-${crypto.randomUUID()}`,
      accountId,
      institution: "Chase",
    });
    await saveBalance(userId, {
      linkId,
      balanceCents: -17_888,
      availableCents: null,
      asOf: new Date("2026-08-28T12:00:00Z"),
    });
    // An earlier capture, so the pre-existing pending rows below are already browser-owned
    // before the snapshot under test lands — and that snapshot still advances the stamp.
    await recordSourceState(db, userId, accountId, {
      source: "browser",
      balanceCents: null,
      availableCents: null,
      asOf: new Date(CAPTURED_AT.getTime() - 60_000),
      asOfDay: null,
    });

    const rows = [...posted, ...pending].map(([date, description, amount], index) => ({
      userId,
      accountId,
      transactionDate:
        date === "08/29/2026"
          ? "2026-08-29"
          : `2026-08-${date.includes("29") ? "29" : date.match(/\d+/)?.[0]?.padStart(2, "0")}`,
      pending: true,
      description,
      amount: `-${amount.replace(/[$,]/g, "")}`,
      sourceCategory: index < posted.length ? "Shopping" : "",
      notes: index === 0 ? "Keep this note" : "",
      flowOverride: index === 0 ? ("spend" as const) : null,
      externalSource: "scrape:chase",
      externalId: `old-pending-${index}`,
    }));
    await db.insert(financeTransactions).values(rows);

    await seedBudget(userId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: "2026-08-29",
    });
    const categories = await db
      .select({ id: financeBudgetCategories.id, kind: financeBudgetCategories.kind })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId));
    envelopeId = categories.find((category) => category.kind !== "income")!.id;
    await db
      .update(financeTransactions)
      .set({ budgetCategoryId: envelopeId })
      .where(eq(financeTransactions.userId, userId));
    // This fixture isolates the card. Pull its pre-budget liability out of the envelope so
    // the regression starts at the real wallet's observed $0 Ready to Assign.
    await db.insert(financeBudgetAllocations).values({
      userId,
      month: MONTH,
      categoryId: envelopeId,
      amountCents: -17_888,
    });
  });

  it("posts a page-sourced account's holds in place, and keeps every checkpoint unchanged", async () => {
    // The account's history source is the bank page, so the page's posted list turns a
    // stored hold into posted history in place: same row, same envelope, notes and flow —
    // and every total that does not care about pending-vs-posted (money, RTA) is untouched.
    const raw = snapshot();
    const beforeBudget = await loadBudget(userId, MONTH);
    const beforeMonth = findMonth(beforeBudget.months, MONTH)!;
    const beforeEnvelope = categoryMonth(beforeMonth, envelopeId);
    expect(beforeMonth.readyToAssignCents).toBe(0);
    expect((await listAccounts(userId))[0].balanceCents).toBe(-17_888);

    const result = await applyBankBrowserSnapshot(userId, raw);

    expect(result.posted).toMatchObject({
      received: 8,
      transitioned: 8,
      replaced: 0,
      inserted: 0,
      duplicates: 0,
      markedPostedAtBank: 0,
    });
    expect(result.pending.received).toBe(2);
    expect(result.currentBalanceCents).toBe(-37_080);
    expect(result.checkpointDelta).toEqual({
      workingBalanceCents: 0,
      accountPoolCents: 0,
      readyToAssignCents: 0,
    });

    const account = (await listAccounts(userId))[0];
    expect(account.balanceCents).toBe(-37_080);
    const rows = await listTransactions(userId);
    expect(rows).toHaveLength(10);
    expect(rows.filter((row) => row.pending)).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(-27_663);

    const afterBudget = await loadBudget(userId, MONTH);
    const afterMonth = findMonth(afterBudget.months, MONTH)!;
    expect(afterMonth.readyToAssignCents).toBe(0);
    expect(categoryMonth(afterMonth, envelopeId)).toEqual(beforeEnvelope);

    const preserved = rows.find((row) => row.description === "CVS")!;
    expect(preserved).toMatchObject({
      notes: "Keep this note",
      flowOverride: "spend",
      budgetCategoryId: envelopeId,
      pending: false,
    });
    const [preservedRow] = await db
      .select({ postedAtBank: financeTransactions.postedAtBank })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, preserved.id));
    expect(preservedRow.postedAtBank).toBeNull();

    const untouched = rows.find((row) => row.description === "SHEETZ")!;
    const [untouchedRow] = await db
      .select({ postedAtBank: financeTransactions.postedAtBank })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, untouched.id));
    expect(untouchedRow.postedAtBank).toBeNull();

    const event = await loadFinanceAuditEvent(userId, result.auditEventId);
    expect(event).not.toBeNull();
    expect(event?.sourceEvidence).toEqual({
      format: "planner-bank-snapshot-v1",
      rawText: raw,
    });
    expect(
      event?.changes.filter((change) => change.entityType === "transaction"),
    ).toHaveLength(10);
    expect(event?.beforeCheckpoint?.accountPoolCents).toBe(-45_551);
    expect(event?.afterCheckpoint?.accountPoolCents).toBe(-45_551);
    expect(event?.beforeCheckpoint?.budgets).toEqual(event?.afterCheckpoint?.budgets);
  });

  it("records a successful no-op receipt for an identical second paste", async () => {
    const raw = snapshot();
    await applyBankBrowserSnapshot(userId, raw);
    const second = await applyBankBrowserSnapshot(userId, raw);

    expect(second.posted).toMatchObject({
      inserted: 0,
      replaced: 0,
      transitioned: 0,
      // The first paste posted every hold; the second finds them by identity.
      duplicates: 8,
      markedPostedAtBank: 0,
    });
    expect(second.pending).toMatchObject({ inserted: 0, updated: 2, removed: 0 });
    const event = await loadFinanceAuditEvent(userId, second.auditEventId);
    expect(event?.changes).toEqual([]);
    expect(await listTransactions(userId)).toHaveLength(10);
    expect(
      (await listFinanceAuditEvents(userId)).filter(
        (candidate) => candidate.kind === "bank_snapshot",
      ),
    ).toHaveLength(2);
  });

  it("records an authority-only transition when a later complete snapshot is identical", async () => {
    const raw = snapshot();
    await applyBankBrowserSnapshot(userId, raw);
    const later = new Date(CAPTURED_AT.getTime() + 60_000);
    const second = await applyBankBrowserSnapshot(
      userId,
      snapshot({ capturedAt: later.toISOString() }),
    );

    // No money moved and no row changed — but the account's pending set is now current as
    // of a later instant, which is a fact the audit has to carry (D5 of 2026-08-31-1444).
    const event = await loadFinanceAuditEvent(userId, second.auditEventId);
    expect(event?.changes).toEqual([
      expect.objectContaining({
        entityType: "bank_balance",
        before: expect.objectContaining({
          balanceSource: "browser",
          balanceAsOf: CAPTURED_AT.toISOString(),
        }),
        after: expect.objectContaining({
          balanceSource: "browser",
          balanceAsOf: later.toISOString(),
        }),
      }),
    ]);
  });

  it("leaves the headline and the pending set alone when an older clipboard is re-pasted", async () => {
    await applyBankBrowserSnapshot(userId, snapshot());
    const earlier = new Date(CAPTURED_AT.getTime() - 60 * 60 * 1000);
    const second = await applyBankBrowserSnapshot(
      userId,
      snapshot({ capturedAt: earlier.toISOString() }),
    );

    const [link] = await db
      .select({
        balanceAsOf: financeAccounts.balanceAsOf,
        balanceSource: financeAccounts.balanceSource,
      })
      .from(financeAccounts)
      .where(eq(financeAccounts.id, accountId));
    expect(link.balanceAsOf).toEqual(CAPTURED_AT);
    expect(link.balanceSource).toBe("browser");
    const event = await loadFinanceAuditEvent(userId, second.auditEventId);
    expect(
      event?.changes.filter((change) => change.entityType === "bank_balance"),
    ).toEqual([]);
  });

  it("rolls the whole snapshot back when its audit evidence cannot be written", async () => {
    await db.execute(sql`
      create or replace function test_reject_bank_snapshot_audit()
      returns trigger language plpgsql as $$
      begin
        if new.kind = 'bank_snapshot'
           and new.source_evidence->>'rawText' like '%ROLLBACK SENTINEL%'
        then
          raise exception 'forced audit failure';
        end if;
        return new;
      end;
      $$
    `);
    await db.execute(sql`
      drop trigger if exists test_reject_bank_snapshot_audit
      on finance_audit_events
    `);
    await db.execute(sql`
      create trigger test_reject_bank_snapshot_audit
      before insert on finance_audit_events
      for each row execute function test_reject_bank_snapshot_audit()
    `);

    try {
      const raw = snapshot({
        posted: [
          {
            transactionDate: "Aug 29, 2026",
            postedDate: "Aug 29, 2026",
            description: "ROLLBACK SENTINEL",
            category: "Test",
            amount: "$1.00",
          },
        ],
      });
      await expect(applyBankBrowserSnapshot(userId, raw)).rejects.toThrow(
        'Failed query: insert into "finance_audit_events"',
      );

      expect((await listAccounts(userId))[0].balanceCents).toBe(-17_888);
      expect(await listTransactions(userId)).toHaveLength(10);
      expect(
        (await listFinanceAuditEvents(userId)).filter(
          (candidate) => candidate.kind === "bank_snapshot",
        ),
      ).toEqual([]);
    } finally {
      await db.execute(sql`
        drop trigger if exists test_reject_bank_snapshot_audit
        on finance_audit_events
      `);
      await db.execute(sql`drop function if exists test_reject_bank_snapshot_audit()`);
    }
  });

  it("refuses a second user without exposing or changing the owner's data", async () => {
    const applied = await applyBankBrowserSnapshot(userId, snapshot());
    const intruder = await makeUser("Intruder");

    await expect(applyBankBrowserSnapshot(intruder, snapshot())).rejects.toThrow(
      "No open credit card ending in 9910",
    );
    expect(await listFinanceAuditEvents(intruder)).toEqual([]);
    expect(await loadFinanceAuditEvent(intruder, applied.auditEventId)).toBeNull();
    expect(await listTransactions(userId)).toHaveLength(10);

    const ownerChanges = await db
      .select({ entityType: financeAuditChanges.entityType })
      .from(financeAuditChanges)
      .where(eq(financeAuditChanges.eventId, applied.auditEventId));
    const intruderEvents = await db
      .select({ id: financeAuditEvents.id })
      .from(financeAuditEvents)
      .where(eq(financeAuditEvents.userId, intruder));
    expect(
      ownerChanges.filter((change) => change.entityType === "transaction"),
    ).toHaveLength(10);
    expect(
      ownerChanges.filter((change) => change.entityType === "bank_balance"),
    ).toHaveLength(1);
    expect(intruderEvents).toEqual([]);
  });

  it("carries a browser hold's envelope onto SimpleFIN's copy of the same charge instead of re-inserting it", async () => {
    // Production case (D2): the page shows Starbucks posted; SimpleFIN already delivered
    // the identical charge. The page copy must not become a second row, and the hold's
    // Category and notes — made while it was still pending — must not be lost.
    await db.insert(financeTransactions).values([
      {
        userId,
        accountId,
        transactionDate: "2026-08-20",
        postedDate: "2026-08-20",
        pending: false,
        description: "STARBUCKS 5678",
        amount: "-5.57",
        sourceCategory: "",
        externalSource: "api:simplefin",
        externalId: "simplefin-starbucks",
      },
      {
        userId,
        accountId,
        transactionDate: "2026-08-19",
        postedDate: null,
        pending: true,
        description: "Starbucks",
        amount: "-5.57",
        sourceCategory: "",
        notes: "coffee with Ana",
        budgetCategoryId: envelopeId,
        externalSource: "scrape:chase",
        externalId: "old-starbucks-hold",
      },
    ]);

    const raw = snapshot({
      posted: [
        ...posted.map(([date, description, amount]) => ({
          transactionDate: date,
          postedDate: date,
          description,
          category: "Shopping",
          amount,
        })),
        {
          transactionDate: "Aug 19, 2026",
          postedDate: "Aug 20, 2026",
          description: "Starbucks",
          category: "",
          amount: "$5.57",
        },
      ],
    });

    const result = await applyBankBrowserSnapshot(userId, raw);

    expect(result.posted.coveredByFeed).toBe(1);
    expect(result.posted.inserted).toBe(0);

    const [feedRow] = await db
      .select({
        budgetCategoryId: financeTransactions.budgetCategoryId,
        notes: financeTransactions.notes,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "simplefin-starbucks"));
    expect(feedRow.budgetCategoryId).toBe(envelopeId);
    expect(feedRow.notes).toBe("coffee with Ana");

    const holdGone = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "old-starbucks-hold"));
    expect(holdGone).toEqual([]);
  });

  it("D3b: carries a lost hold's envelope to a posted row within the tip band before removing it", async () => {
    await db.insert(financeTransactions).values([
      {
        userId,
        accountId,
        transactionDate: "2026-08-20",
        postedDate: "2026-08-20",
        pending: false,
        description: "DOMINOS 1234",
        amount: "-21.00",
        sourceCategory: "",
        externalSource: "api:simplefin",
        externalId: "simplefin-dominos",
      },
      {
        userId,
        accountId,
        transactionDate: "2026-08-19",
        postedDate: null,
        pending: true,
        description: "Domino's",
        amount: "-20.11",
        sourceCategory: "",
        budgetCategoryId: envelopeId,
        externalSource: "scrape:chase",
        externalId: "old-dominos-hold",
      },
    ]);

    // A page snapshot that no longer lists the Domino's hold — it cleared, one way or
    // another, and this capture's pending list is complete for the browser's own holds.
    const raw = snapshot({
      posted: posted.map(([date, description, amount]) => ({
        transactionDate: date,
        postedDate: date,
        description,
        category: "Shopping",
        amount,
      })),
    });

    const result = await applyBankBrowserSnapshot(userId, raw);

    expect(result.warnings).toEqual([]);
    const [feedRow] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "simplefin-dominos"));
    expect(feedRow.budgetCategoryId).toBe(envelopeId);

    const holdGone = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "old-dominos-hold"));
    expect(holdGone).toEqual([]);
    expect(result.pending.removed).toBe(1);
  });

  it("Amazon hold retirement: carries a lost hold to its sole successor despite the page's generic display name", async () => {
    // D4's own regression case: the page's own hold description ("Amazon.com") never
    // overlaps SimpleFIN's fuller descriptor ("AMAZON MKTPL*537NK9DZ2"). Before D4 this
    // hold could never retire — description was a gate, not a rank — and stayed in the
    // register forever, un-carried, once SimpleFIN's copy also arrived.
    await db.insert(financeTransactions).values([
      {
        userId,
        accountId,
        transactionDate: "2026-08-13",
        postedDate: "2026-08-13",
        pending: false,
        description: "AMAZON MKTPL*537NK9DZ2",
        amount: "-13.77",
        sourceCategory: "",
        externalSource: "api:simplefin",
        externalId: "simplefin-amazon",
      },
      {
        userId,
        accountId,
        transactionDate: "2026-08-12",
        postedDate: null,
        pending: true,
        description: "Amazon.com",
        amount: "-13.77",
        sourceCategory: "",
        budgetCategoryId: envelopeId,
        notes: "gift wrap",
        externalSource: "scrape:chase",
        externalId: "old-amazon-hold",
      },
    ]);

    // A page snapshot that no longer lists the Amazon.com hold — it cleared, and this
    // capture's pending list is complete for the browser's own holds.
    const raw = snapshot({
      posted: posted.map(([date, description, amount]) => ({
        transactionDate: date,
        postedDate: date,
        description,
        category: "Shopping",
        amount,
      })),
    });

    const result = await applyBankBrowserSnapshot(userId, raw);

    expect(result.warnings).toEqual([]);
    const [feedRow] = await db
      .select({
        budgetCategoryId: financeTransactions.budgetCategoryId,
        notes: financeTransactions.notes,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "simplefin-amazon"));
    expect(feedRow.budgetCategoryId).toBe(envelopeId);
    expect(feedRow.notes).toBe("gift wrap");

    const holdGone = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.externalId, "old-amazon-hold"));
    expect(holdGone).toEqual([]);
    expect(result.pending.removed).toBe(1);
  });

  describe("holds are never deleted by absence (2026-09-20)", () => {
    const chewyHold = (owner: string, account: string, category: string) => ({
      userId: owner,
      accountId: account,
      transactionDate: "2026-08-28",
      postedDate: null,
      pending: true,
      description: "Chewy.com",
      amount: "-51.29",
      sourceCategory: "",
      budgetCategoryId: category,
      notes: "dog food",
      externalSource: "scrape:chase",
      externalId: `chewy-hold-${crypto.randomUUID()}`,
    });
    const chewyRow = {
      transactionDate: "Aug 28, 2026",
      postedDate: "Aug 28, 2026",
      description: "Chewy.com",
      category: "Shopping",
      amount: "$51.29",
    };
    const holdOf = async (owner: string) =>
      (
        await db
          .select()
          .from(financeTransactions)
          .where(
            sql`${financeTransactions.userId} = ${owner} and ${financeTransactions.description} = 'Chewy.com'`,
          )
      )[0];

    it("keeps and flags a hold the complete page no longer lists, and clears the flag when it returns", async () => {
      const [hold] = await db
        .insert(financeTransactions)
        .values(chewyHold(userId, accountId, envelopeId))
        .returning({ id: financeTransactions.id });

      const first = await applyBankBrowserSnapshot(userId, snapshot());
      expect(first.pending.removed).toBe(0);
      expect(first.warnings.join(" ")).toContain("flagged");
      const flagged = await holdOf(userId);
      expect(flagged.id).toBe(hold.id);
      expect(flagged.budgetCategoryId).toBe(envelopeId);
      expect(flagged.notes).toBe("dog food");
      expect(flagged.unlistedAt).not.toBeNull();

      // A later paste that still does not list it leaves the first-noticed stamp alone.
      await applyBankBrowserSnapshot(userId, snapshot());
      expect((await holdOf(userId)).unlistedAt?.getTime()).toBe(
        flagged.unlistedAt?.getTime(),
      );

      // The page lists it again: the flag clears, the row is still the same row.
      await applyBankBrowserSnapshot(
        userId,
        snapshot({
          pending: [
            ...pending.map(([date, description, amount]) => ({
              transactionDate: date,
              postedDate: null,
              description,
              category: "",
              amount,
            })),
            { ...chewyRow, postedDate: null },
          ],
        }),
      );
      const relisted = await holdOf(userId);
      expect(relisted.id).toBe(hold.id);
      expect(relisted.unlistedAt).toBeNull();
    });

    it("posts a hold when the closed statement lists it, inserting nothing beside it", async () => {
      await db
        .insert(financeTransactions)
        .values(chewyHold(userId, accountId, envelopeId));

      const result = await applyBankBrowserSnapshot(
        userId,
        snapshot({
          completeness: {
            currentCycle: true,
            posted: true,
            pending: true,
            filtered: false,
            searched: false,
            recentPosted: true,
          },
          recentStatementClosedOn: "Aug 29, 2026",
          recentPosted: [chewyRow],
        }),
      );

      expect(result.pending.removed).toBe(0);
      const hold = await holdOf(userId);
      expect(hold.pending).toBe(false);
      expect(hold.postedAtBank).toBeNull();
      expect(hold.unlistedAt).toBeNull();
      expect(hold.budgetCategoryId).toBe(envelopeId);
      const chewyRows = await db
        .select({ id: financeTransactions.id })
        .from(financeTransactions)
        .where(
          sql`${financeTransactions.userId} = ${userId} and ${financeTransactions.description} = 'Chewy.com'`,
        );
      expect(chewyRows).toHaveLength(1);
    });

    it("never touches another user's identical hold", async () => {
      const other = await makeUser("Other Holder");
      const [otherAccount] = await db
        .insert(financeAccounts)
        .values({
          userId: other,
          name: "Chase Prime Visa",
          kind: "credit_card",
          institution: "Chase",
          externalSource: "csv:chase-credit",
          externalKey: "9910",
        })
        .returning({ id: financeAccounts.id });
      await db
        .insert(financeTransactions)
        .values(chewyHold(userId, accountId, envelopeId));
      await db
        .insert(financeTransactions)
        .values(chewyHold(other, otherAccount.id, envelopeId));

      await applyBankBrowserSnapshot(userId, snapshot());

      expect((await holdOf(userId)).unlistedAt).not.toBeNull();
      const untouched = await holdOf(other);
      expect(untouched.unlistedAt).toBeNull();
      expect(untouched.notes).toBe("dog food");
    });
  });

  it("Sep 14 replay: posted rows SimpleFIN already holds under a different descriptor insert nothing and leave RTA unchanged", async () => {
    // The actual incident: 12 Amazon charges Chase's page reported as newly posted, all
    // already delivered by SimpleFIN under its own fuller descriptor
    // (`AMAZON MKTPL*537NK9DZ2` vs the page's `Amazon.com`) — never seen pending on this
    // page at all, so there is no hold to mark either. `descriptionsOverlap` fails on that
    // mismatch, which used to send all 12 straight into postedInserts. Now the account's
    // `history_source_since` is the last day SimpleFIN delivered, and the page never inserts
    // a row on or before it.
    const amazonCharges = [
      { day: "13", cents: -1377, feedName: "AMAZON MKTPL*537NK9DZ2" },
      { day: "12", cents: -2450, feedName: "AMAZON MKTPL*7Q2FH8XN3" },
      { day: "11", cents: -899, feedName: "AMAZON MKTPL*9K1RT4LP2" },
      { day: "10", cents: -4599, feedName: "Amazon Prime Membership" },
      { day: "09", cents: -1250, feedName: "AMAZON MKTPL*3H7YB2QW1" },
      { day: "08", cents: -3299, feedName: "AMAZON MKTPL*5N8KC1VZ4" },
      { day: "07", cents: -675, feedName: "AMAZON MKTPL*2R9TF6MD8" },
      { day: "06", cents: -1899, feedName: "AMAZON MKTPL*8L3XQ7YN5" },
      { day: "05", cents: -2199, feedName: "AMAZON MKTPL*4J6WV9PK3" },
      { day: "04", cents: -549, feedName: "AMAZON MKTPL*1G5RH3TC7" },
      { day: "03", cents: -3450, feedName: "AMAZON MKTPL*6M2ZL8SB1" },
      { day: "02", cents: -1725, feedName: "AMAZON MKTPL*9D4NF7QW6" },
    ];
    await db.insert(financeTransactions).values(
      amazonCharges.map((charge, index) => ({
        userId,
        accountId,
        transactionDate: `2026-08-${charge.day}`,
        postedDate: `2026-08-${charge.day}`,
        pending: false,
        description: charge.feedName,
        amount: (charge.cents / 100).toFixed(2),
        sourceCategory: "",
        externalSource: "api:simplefin",
        externalId: `simplefin-amazon-${index}`,
        budgetCategoryId: envelopeId,
      })),
    );

    await db
      .update(financeAccounts)
      .set({ historySourceSince: "2026-08-13" })
      .where(eq(financeAccounts.id, accountId));

    const beforeBudget = await loadBudget(userId, MONTH);
    const beforeMonth = findMonth(beforeBudget.months, MONTH)!;

    const raw = snapshot({
      posted: [
        ...posted.map(([date, description, amount]) => ({
          transactionDate: date,
          postedDate: date,
          description,
          category: "Shopping",
          amount,
        })),
        ...amazonCharges.map((charge) => ({
          transactionDate: `Aug ${charge.day}, 2026`,
          postedDate: `Aug ${charge.day}, 2026`,
          // The page's own generic display name — never overlaps the feed's descriptor.
          description: "Amazon.com",
          category: "Shopping",
          amount: `$${(Math.abs(charge.cents) / 100).toFixed(2)}`,
        })),
      ],
    });

    const result = await applyBankBrowserSnapshot(userId, raw);

    // Nothing inserted for the Amazon rows — the 8 transitions are the unrelated fixture
    // holds from beforeEach, included in `posted` here only so this capture reads as complete.
    expect(result.posted.inserted).toBe(0);
    expect(result.posted.beforeSourceStart).toBe(amazonCharges.length);
    expect(result.posted.transitioned).toBe(8);
    expect(result.checkpointDelta.readyToAssignCents).toBe(0);

    const afterBudget = await loadBudget(userId, MONTH);
    const afterMonth = findMonth(afterBudget.months, MONTH)!;
    expect(afterMonth.readyToAssignCents).toBe(beforeMonth.readyToAssignCents);

    const rows = await listTransactions(userId);
    expect(rows.filter((row) => row.externalSource === "api:simplefin")).toHaveLength(
      amazonCharges.length,
    );
    // Nothing scraped landed beside the SimpleFIN copies under the page's own display name.
    expect(rows.filter((row) => row.description === "Amazon.com")).toEqual([]);
  });
});

describeDb("a bank-page account with no SimpleFIN link", () => {
  const CAPTURED = new Date("2026-09-23T15:00:00Z");

  type Row = [
    transactionDate: string,
    postedDate: string | null,
    name: string,
    amount: string,
  ];

  function capitalOneSnapshot(input: {
    posted?: Row[];
    pending?: Row[];
    recent?: Row[];
    closedOn?: string;
    capturedAt?: Date;
  }): string {
    const toRow = ([transactionDate, postedDate, description, amount]: Row) => ({
      transactionDate,
      postedDate,
      description,
      category: "Merchandise",
      amount,
    });
    const body: BankBrowserSnapshotV1 = {
      version: 1,
      source: "capitalone",
      capturedAt: (input.capturedAt ?? CAPTURED).toISOString(),
      accountLast4: "3448",
      balanceKind: "posted_only",
      currentBalance: "$500.00",
      completeness: {
        currentCycle: true,
        posted: true,
        pending: true,
        filtered: false,
        searched: false,
        ...(input.recent ? { recentPosted: true as const } : {}),
      },
      posted: (input.posted ?? []).map(toRow),
      pending: (input.pending ?? []).map(toRow),
      ...(input.recent
        ? {
            recentStatementClosedOn: input.closedOn ?? "Sep 14, 2026",
            recentPosted: input.recent.map(toRow),
          }
        : {}),
    };
    return `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify(body, null, 2)}\n`;
  }

  async function makeCard(
    owner: string,
    historySource: "bank_page" | "simplefin" | "files",
  ): Promise<string> {
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId: owner,
        name: "Capital One Card",
        kind: "credit_card",
        institution: "Capital One",
        externalSource: "csv:capitalone-card",
        externalKey: "3448",
        historySource,
      })
      .returning({ id: financeAccounts.id });
    return account.id;
  }

  async function rowsOf(owner: string) {
    return db
      .select({
        id: financeTransactions.id,
        description: financeTransactions.description,
        transactionDate: financeTransactions.transactionDate,
        postedDate: financeTransactions.postedDate,
        pending: financeTransactions.pending,
        amount: financeTransactions.amount,
        budgetCategoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, owner));
  }

  async function coverageOf(owner: string) {
    return db
      .select({
        fromDay: financeCaptureCoverage.fromDay,
        throughDay: financeCaptureCoverage.throughDay,
        accountId: financeCaptureCoverage.accountId,
      })
      .from(financeCaptureCoverage)
      .where(eq(financeCaptureCoverage.userId, owner));
  }

  it("inserts a posted charge with its purchase and posted dates, and sets the headline", async () => {
    const owner = await makeUser();
    const accountId = await makeCard(owner, "bank_page");

    const result = await applyBankBrowserSnapshot(
      owner,
      capitalOneSnapshot({
        posted: [["Sep 22, 2026", "Sep 22, 2026", "YouTube", "$16.95"]],
      }),
    );

    expect(result.posted.inserted).toBe(1);
    expect(await rowsOf(owner)).toEqual([
      expect.objectContaining({
        description: "YouTube",
        transactionDate: "2026-09-22",
        postedDate: "2026-09-22",
        pending: false,
        amount: "-16.95",
      }),
    ]);
    expect((await listAccounts(owner))[0]).toMatchObject({
      id: accountId,
      balanceCents: -50_000,
      balanceSource: "browser",
    });
  });

  it("posts a tipped hold in place: purchase date kept, envelope kept, one row", async () => {
    const owner = await makeUser();
    const accountId = await makeCard(owner, "bank_page");
    await applyBankBrowserSnapshot(
      owner,
      capitalOneSnapshot({
        capturedAt: new Date("2026-09-19T15:00:00Z"),
        pending: [["Sep 19, 2026", null, "Kim's Nails III", "$50.00"]],
      }),
    );
    const [hold] = await rowsOf(owner);
    expect(hold.pending).toBe(true);
    await db
      .update(financeTransactions)
      .set({ notes: "nails" })
      .where(eq(financeTransactions.id, hold.id));

    await applyBankBrowserSnapshot(
      owner,
      capitalOneSnapshot({
        posted: [["Sep 19, 2026", "Sep 21, 2026", "Kim's Nails III", "$60.00"]],
      }),
    );

    const rows = await rowsOf(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: hold.id,
      transactionDate: "2026-09-19",
      postedDate: "2026-09-21",
      pending: false,
      amount: "-60.00",
    });
    const [kept] = await db
      .select({ notes: financeTransactions.notes })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, hold.id));
    expect(kept.notes).toBe("nails");
    expect(accountId).toBeTruthy();
  });

  it("inserts nothing on a re-paste, and a closed statement's unheld rows exactly once", async () => {
    const owner = await makeUser();
    await makeCard(owner, "bank_page");
    const current: Row[] = [["Sep 20, 2026", "Sep 21, 2026", "Pizza Hut", "$18.00"]];
    const closed: Row[] = [
      ["Sep 01, 2026", "Sep 02, 2026", "Shell", "$40.00"],
      ["Sep 10, 2026", "Sep 11, 2026", "Netflix", "$15.49"],
    ];
    const raw = capitalOneSnapshot({ posted: current, recent: closed });

    const first = await applyBankBrowserSnapshot(owner, raw);
    const second = await applyBankBrowserSnapshot(owner, raw);

    expect(first.posted.inserted).toBe(3);
    expect(second.posted.inserted).toBe(0);
    expect(await rowsOf(owner)).toHaveLength(3);
  });

  it("never inserts a row posted on or before history_source_since", async () => {
    const owner = await makeUser();
    const accountId = await makeCard(owner, "bank_page");
    await db
      .update(financeAccounts)
      .set({ historySourceSince: "2026-09-21" })
      .where(eq(financeAccounts.id, accountId));

    const result = await applyBankBrowserSnapshot(
      owner,
      capitalOneSnapshot({
        posted: [
          ["Sep 21, 2026", "Sep 21, 2026", "Old", "$5.00"],
          ["Sep 22, 2026", "Sep 22, 2026", "New", "$6.00"],
        ],
      }),
    );

    expect(result.posted).toMatchObject({ inserted: 1, beforeSourceStart: 1 });
    expect((await rowsOf(owner)).map((row) => row.description)).toEqual(["New"]);
  });

  it("refuses a paste for an account whose history comes from anywhere else", async () => {
    const owner = await makeUser();
    await makeCard(owner, "simplefin");

    await expect(
      applyBankBrowserSnapshot(
        owner,
        capitalOneSnapshot({
          posted: [["Sep 22, 2026", "Sep 22, 2026", "YouTube", "$16.95"]],
        }),
      ),
    ).rejects.toThrow(/takes its history from SimpleFIN/);
    expect(await rowsOf(owner)).toEqual([]);
    expect(await coverageOf(owner)).toEqual([]);

    const other = await makeUser();
    await makeCard(other, "files");
    await expect(
      applyBankBrowserSnapshot(other, capitalOneSnapshot({})),
    ).rejects.toThrow(/takes its history from file imports/);
  });

  it("records the days it read, extends them on the next paste, and keeps them per user", async () => {
    const owner = await makeUser();
    const accountId = await makeCard(owner, "bank_page");
    const intruder = await makeUser();
    const intruderAccount = await makeCard(intruder, "bank_page");

    await applyBankBrowserSnapshot(
      owner,
      capitalOneSnapshot({
        posted: [["Sep 16, 2026", "Sep 16, 2026", "A", "$1.00"]],
        recent: [["Sep 01, 2026", "Sep 02, 2026", "B", "$2.00"]],
      }),
    );
    expect(await coverageOf(owner)).toEqual(
      expect.arrayContaining([
        { accountId, fromDay: "2026-08-15", throughDay: "2026-09-14" },
        { accountId, fromDay: "2026-09-15", throughDay: "2026-09-22" },
      ]),
    );

    await applyBankBrowserSnapshot(
      owner,
      capitalOneSnapshot({
        capturedAt: new Date("2026-09-25T15:00:00Z"),
        posted: [["Sep 16, 2026", "Sep 16, 2026", "A", "$1.00"]],
        recent: [["Sep 01, 2026", "Sep 02, 2026", "B", "$2.00"]],
      }),
    );
    expect(await coverageOf(owner)).toHaveLength(2);

    // The intruder's own paste writes under the intruder and never reaches the owner's ranges.
    await applyBankBrowserSnapshot(intruder, capitalOneSnapshot({}));
    expect(await coverageOf(owner)).toHaveLength(2);
    expect(
      (await coverageOf(intruder)).every((r) => r.accountId === intruderAccount),
    ).toBe(true);
  });
});
