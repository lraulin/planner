import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditChanges,
  financeAuditEvents,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeTransactions,
  users,
  bankAccountLinks,
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
    capturedAt: "2026-08-29T12:42:00.000-04:00",
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
    await db
      .update(bankAccountLinks)
      .set({ scrapeBalanceAsOf: new Date("2026-08-29T12:00:00Z") })
      .where(eq(bankAccountLinks.id, linkId));

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

  it("keeps working balance and every budget checkpoint unchanged as pending posts", async () => {
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
      inserted: 0,
      duplicates: 0,
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
    expect(rows.filter((row) => row.pending)).toHaveLength(2);
    expect(
      rows.filter((row) => row.pending).reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(-8_471);
    expect(rows.filter((row) => !row.pending)).toHaveLength(8);
    expect(
      rows.filter((row) => !row.pending).reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(-19_192);
    expect(account.balanceCents - 8_471).toBe(-45_551);

    const afterBudget = await loadBudget(userId, MONTH);
    const afterMonth = findMonth(afterBudget.months, MONTH)!;
    expect(afterMonth.readyToAssignCents).toBe(0);
    expect(categoryMonth(afterMonth, envelopeId)).toEqual(beforeEnvelope);
    expect(afterMonth.accountReconciliationCents).toBe(
      beforeMonth.accountReconciliationCents,
    );

    const preserved = rows.find((row) => row.description === "CVS")!;
    expect(preserved).toMatchObject({
      notes: "Keep this note",
      flowOverride: "spend",
      budgetCategoryId: envelopeId,
      pending: false,
    });

    const event = await loadFinanceAuditEvent(userId, result.auditEventId);
    expect(event).not.toBeNull();
    expect(event?.sourceEvidence).toEqual({
      format: "planner-bank-snapshot-v1",
      // Nothing but the browser has ever written to this card, so it owns every day.
      feedWatermark: null,
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
      transitioned: 0,
      replaced: 0,
      duplicates: 8,
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
      .select({ id: financeAuditChanges.id })
      .from(financeAuditChanges)
      .where(eq(financeAuditChanges.eventId, applied.auditEventId));
    const intruderEvents = await db
      .select({ id: financeAuditEvents.id })
      .from(financeAuditEvents)
      .where(eq(financeAuditEvents.userId, intruder));
    expect(ownerChanges).toHaveLength(10);
    expect(intruderEvents).toEqual([]);
  });
});
