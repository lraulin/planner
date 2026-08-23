import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeCategoryGroups,
  financeRecurringBills,
  financeSchedules,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { upsertRecurringBill } from "../mutations";
import { createPayee } from "../payees/mutations";
import { createSchedule } from "../schedules/mutations";
import type { ScheduleCondition } from "../schedules/conditions";
import { performBudgetOperation, saveEnvelopeTemplates, seedBudget } from "./mutations";
import { loadBudget } from "./queries";
import { budgetChildren } from "./hierarchy";
import {
  applyCommitmentsImport,
  previewCommitmentsImport,
} from "./commitmentsImportMutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("commitments budget import");

const createdUserIds: string[] = [];
const TODAY = "2026-08-23";
const MONTH = "2026-08-01";

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `commitments-import-${crypto.randomUUID()}@localhost`,
      name: "Commitments Import Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function seedAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `checking-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  await db.insert(financeTransactions).values({
    userId,
    accountId: account.id,
    transactionDate: "2026-07-01",
    description: "Opening",
    amount: "1000.00",
  });
  return account.id;
}

function monthly(payeeId: string, amountCents: number): ScheduleCondition[] {
  return [
    {
      field: "date",
      op: "isapprox",
      value: { frequency: "monthly", start: "2026-01-15" },
    },
    { field: "payee", op: "is", value: payeeId },
    { field: "amount", op: "isapprox", value: -amountCents },
  ];
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("Commitments budget import", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await seedAccount(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
  });

  it("previews, imports, routes, and replays without moving assigned money", async () => {
    const rentPayee = await createPayee(userId, {
      name: "Landlord",
      aliases: ["RENT"],
    });
    const aiPayee = await createPayee(userId, { name: "OpenAI", aliases: ["OPENAI"] });
    await upsertRecurringBill(userId, {
      name: "Rent",
      cadence: { unit: "month", n: 1 },
      expectedCents: 150_000,
      anchorDate: "2026-01-01",
      dueDay: 1,
      category: "",
      payeeIds: [rentPayee],
    });
    await upsertRecurringBill(userId, {
      name: "ChatGPT",
      cadence: { unit: "month", n: 1 },
      expectedCents: 2_000,
      anchorDate: "2026-01-15",
      dueDay: 15,
      category: "AI",
      payeeIds: [aiPayee],
    });
    await upsertRecurringBill(userId, {
      name: "Paused",
      cadence: { unit: "month", n: 1 },
      expectedCents: 500,
      status: "paused",
    });

    const billRows = await db
      .select({ id: financeRecurringBills.id, name: financeRecurringBills.name })
      .from(financeRecurringBills)
      .where(eq(financeRecurringBills.userId, userId));
    const billId = new Map(billRows.map((row) => [row.name, row.id]));
    const rentScheduleId = await createSchedule(
      userId,
      {
        name: "Rent",
        sourceBillId: billId.get("Rent"),
        conditions: monthly(rentPayee, 150_000),
      },
      TODAY,
    );
    const aiScheduleId = await createSchedule(
      userId,
      {
        name: "ChatGPT",
        sourceBillId: billId.get("ChatGPT"),
        conditions: monthly(aiPayee, 2_000),
      },
      TODAY,
    );
    const unrelatedScheduleId = await createSchedule(
      userId,
      { name: "Unrelated", conditions: monthly(aiPayee, 999) },
      TODAY,
    );

    const budget = await loadBudget(userId, MONTH);
    const target = budget.groups.find((group) => group.name === "Spending")!;
    const legacy = budget.categories.find((category) => category.name === "Bills")!;
    const discretionary = budget.categories.find(
      (category) => category.name === "Discretionary",
    )!;
    await saveEnvelopeTemplates(userId, legacy.id, [
      {
        id: "rent-template",
        directive: "template",
        type: "schedule",
        priority: 0,
        scheduleId: rentScheduleId,
      },
      {
        id: "ai-template",
        directive: "template",
        type: "schedule",
        priority: 0,
        scheduleId: aiScheduleId,
      },
      {
        id: "unrelated-template",
        directive: "template",
        type: "schedule",
        priority: 0,
        scheduleId: unrelatedScheduleId,
      },
    ]);
    await performBudgetOperation(userId, {
      kind: "assign",
      month: MONTH,
      category: { id: legacy.id, name: legacy.name },
      amountCents: 12_300,
    });
    const beforeAllocations = await db
      .select({
        categoryId: financeBudgetAllocations.categoryId,
        month: financeBudgetAllocations.month,
        amountCents: financeBudgetAllocations.amountCents,
      })
      .from(financeBudgetAllocations)
      .where(eq(financeBudgetAllocations.userId, userId));

    const [unassigned, manual] = await db
      .insert(financeTransactions)
      .values([
        {
          userId,
          accountId,
          transactionDate: "2026-08-05",
          description: "RENT",
          payeeId: rentPayee,
          amount: "-1500.00",
        },
        {
          userId,
          accountId,
          transactionDate: "2026-08-15",
          description: "OPENAI",
          payeeId: aiPayee,
          amount: "-20.00",
          budgetCategoryId: discretionary.id,
        },
      ])
      .returning({ id: financeTransactions.id });

    const preview = await previewCommitmentsImport(userId, {
      targetGroupId: target.id,
      legacyEnvelopeId: legacy.id,
    });
    expect(preview.plan.counts).toMatchObject({
      active: 2,
      createEnvelopes: 2,
      createSchedules: 0,
      inactive: 1,
      conflicts: 0,
    });
    expect(preview.plan.createGroupNames).toEqual(
      expect.arrayContaining(["Bills", "Uncategorized", "AI"]),
    );

    const result = await applyCommitmentsImport(userId, {
      targetGroupId: target.id,
      legacyEnvelopeId: legacy.id,
      fingerprint: preview.fingerprint,
      todayKey: TODAY,
    });
    expect(result.transactionsRouted).toBe(1);

    const imported = await loadBudget(userId, MONTH);
    const billsGroup = imported.groups.find(
      (group) => group.sourceCommitmentKey === "bills",
    )!;
    expect(billsGroup.parentGroupId).toBe(target.id);
    const groupById = new Map(imported.groups.map((group) => [group.id, group]));
    const envelopeById = new Map(
      imported.categories.map((category) => [category.id, category]),
    );
    const spendingOrder = budgetChildren(
      imported.groups,
      imported.categories,
      target.id,
    ).map((child) =>
      child.kind === "group"
        ? `group:${groupById.get(child.id)?.name}`
        : `envelope:${envelopeById.get(child.id)?.name}`,
    );
    expect(spendingOrder[0]).toBe("group:Bills");
    expect(imported.categories.find((row) => row.id === legacy.id)).toMatchObject({
      name: "Other bills",
      groupId: billsGroup.id,
    });
    const rentEnvelope = imported.categories.find(
      (row) => row.sourceBillId === billId.get("Rent"),
    )!;
    const aiEnvelope = imported.categories.find(
      (row) => row.sourceBillId === billId.get("ChatGPT"),
    )!;
    expect(rentEnvelope.templates).toEqual([
      expect.objectContaining({ type: "schedule", scheduleId: rentScheduleId }),
    ]);
    expect(aiEnvelope.templates).toEqual([
      expect.objectContaining({ type: "schedule", scheduleId: aiScheduleId }),
    ]);
    expect(imported.categories.find((row) => row.id === legacy.id)?.templates).toEqual([
      expect.objectContaining({ scheduleId: unrelatedScheduleId }),
    ]);

    const scheduleRows = await db
      .select({
        id: financeSchedules.id,
        categoryId: financeSchedules.budgetCategoryId,
      })
      .from(financeSchedules)
      .where(eq(financeSchedules.userId, userId));
    expect(scheduleRows.find((row) => row.id === rentScheduleId)?.categoryId).toBe(
      rentEnvelope.id,
    );
    expect(scheduleRows.find((row) => row.id === aiScheduleId)?.categoryId).toBe(
      aiEnvelope.id,
    );
    const transactionRows = await db
      .select({
        id: financeTransactions.id,
        categoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(transactionRows.find((row) => row.id === unassigned.id)?.categoryId).toBe(
      rentEnvelope.id,
    );
    expect(transactionRows.find((row) => row.id === manual.id)?.categoryId).toBe(
      discretionary.id,
    );
    expect(
      await db
        .select({
          categoryId: financeBudgetAllocations.categoryId,
          month: financeBudgetAllocations.month,
          amountCents: financeBudgetAllocations.amountCents,
        })
        .from(financeBudgetAllocations)
        .where(eq(financeBudgetAllocations.userId, userId)),
    ).toEqual(beforeAllocations);

    const replay = await previewCommitmentsImport(userId, {
      targetGroupId: target.id,
      legacyEnvelopeId: legacy.id,
    });
    expect(replay.plan.counts).toMatchObject({
      createEnvelopes: 0,
      createSchedules: 0,
      existing: 2,
    });
    const replayResult = await applyCommitmentsImport(userId, {
      targetGroupId: target.id,
      legacyEnvelopeId: legacy.id,
      fingerprint: replay.fingerprint,
      todayKey: TODAY,
    });
    expect(replayResult.transactionsRouted).toBe(0);
  });

  it("isolates previews and apply from a second user", async () => {
    await upsertRecurringBill(userId, {
      name: "Owner bill",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1_000,
    });
    const budget = await loadBudget(userId, MONTH);
    const target = budget.groups.find((group) => group.name === "Spending")!;
    const legacy = budget.categories.find((category) => category.name === "Bills")!;
    const ownerPreview = await previewCommitmentsImport(userId, {
      targetGroupId: target.id,
      legacyEnvelopeId: legacy.id,
    });

    const intruderId = await makeUser();
    const intruderPreview = await previewCommitmentsImport(intruderId, {
      targetGroupId: target.id,
      legacyEnvelopeId: legacy.id,
    });
    expect(intruderPreview.plan.bills).toEqual([]);
    expect(intruderPreview.plan.blockingReason).toBeTruthy();
    await expect(
      applyCommitmentsImport(intruderId, {
        targetGroupId: target.id,
        legacyEnvelopeId: legacy.id,
        fingerprint: ownerPreview.fingerprint,
        todayKey: TODAY,
      }),
    ).rejects.toThrow();

    expect(
      await db
        .select({ id: financeCategoryGroups.id })
        .from(financeCategoryGroups)
        .where(
          and(
            eq(financeCategoryGroups.userId, userId),
            eq(financeCategoryGroups.sourceCommitmentKey, "bills"),
          ),
        ),
    ).toEqual([]);
  });
});
