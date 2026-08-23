import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  financeBudgetCategories,
  financeCategoryGroups,
  financeSchedules,
  financeTransactions,
} from "@/db/schema";
import { loadRecurringBills } from "@/lib/finances/dashboardQueries";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget } from "@/lib/settings/finances";
import * as sortKey from "@/lib/tree/sortKey";

import {
  COMMITMENTS_BILLS_GROUP_KEY,
  COMMITMENTS_CATEGORY_GROUP_PREFIX,
  planCommitmentsImport,
  type CommitmentsImportPlan,
} from "./commitmentsImport";
import { billToScheduleConditions, type BillForSchedule } from "../schedules/fromBill";
import { dateConfigOf, extractScheduleConds } from "../schedules/conditions";
import { initialNextDate } from "../schedules/nextDate";
import { parseTemplatesOrThrow, type Template } from "./templates/types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CommitmentsImportPreview = {
  fingerprint: string;
  plan: CommitmentsImportPlan;
};

export type CommitmentsImportResult = CommitmentsImportPlan["counts"] & {
  transactionsRouted: number;
};

function fingerprintOf(plan: CommitmentsImportPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

async function importState(userId: string) {
  const [bills, groups, envelopes, schedules] = await Promise.all([
    loadRecurringBills(userId),
    db
      .select({
        id: financeCategoryGroups.id,
        parentGroupId: financeCategoryGroups.parentGroupId,
        name: financeCategoryGroups.name,
        isIncome: financeCategoryGroups.isIncome,
        sourceCommitmentKey: financeCategoryGroups.sourceCommitmentKey,
      })
      .from(financeCategoryGroups)
      .where(eq(financeCategoryGroups.userId, userId)),
    db
      .select({
        id: financeBudgetCategories.id,
        groupId: financeBudgetCategories.groupId,
        name: financeBudgetCategories.name,
        sortKey: financeBudgetCategories.sortKey,
        sourceBillId: financeBudgetCategories.sourceBillId,
        templates: financeBudgetCategories.templates,
      })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
    db
      .select({
        id: financeSchedules.id,
        name: financeSchedules.name,
        sourceBillId: financeSchedules.sourceBillId,
        budgetCategoryId: financeSchedules.budgetCategoryId,
      })
      .from(financeSchedules)
      .where(eq(financeSchedules.userId, userId)),
  ]);
  return {
    bills,
    groups,
    envelopes: envelopes.map((envelope) => ({
      ...envelope,
      templates: parseTemplatesOrThrow(envelope.templates),
    })),
    schedules,
  };
}

export async function previewCommitmentsImport(
  userId: string,
  input: { targetGroupId: string; legacyEnvelopeId: string | null },
): Promise<CommitmentsImportPreview> {
  const state = await importState(userId);
  const plan = planCommitmentsImport({ ...input, ...state });
  return { plan, fingerprint: fingerprintOf(plan) };
}

async function nextChildSortKey(
  tx: Tx,
  userId: string,
  parentGroupId: string,
): Promise<string> {
  const [groups, envelopes] = await Promise.all([
    tx
      .select({ sortKey: financeCategoryGroups.sortKey })
      .from(financeCategoryGroups)
      .where(
        and(
          eq(financeCategoryGroups.userId, userId),
          eq(financeCategoryGroups.parentGroupId, parentGroupId),
        ),
      ),
    tx
      .select({ sortKey: financeBudgetCategories.sortKey })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.groupId, parentGroupId),
        ),
      ),
  ]);
  const last = [...groups, ...envelopes]
    .map((row) => row.sortKey)
    .sort((left, right) => sortKey.compare(right, left))[0];
  return last ? sortKey.after(last) : sortKey.first();
}

async function ensureImportedGroup(
  tx: Tx,
  userId: string,
  input: {
    sourceKey: string;
    name: string;
    parentGroupId: string;
    sortKey?: string;
  },
): Promise<string> {
  const [sourced] = await tx
    .select({ id: financeCategoryGroups.id })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.userId, userId),
        eq(financeCategoryGroups.sourceCommitmentKey, input.sourceKey),
      ),
    )
    .limit(1);
  if (sourced) return sourced.id;

  const [named] = await tx
    .select({ id: financeCategoryGroups.id })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.userId, userId),
        eq(financeCategoryGroups.parentGroupId, input.parentGroupId),
        eq(financeCategoryGroups.name, input.name),
      ),
    )
    .limit(1);
  if (named) {
    await tx
      .update(financeCategoryGroups)
      .set({ sourceCommitmentKey: input.sourceKey, updatedAt: new Date() })
      .where(
        and(
          eq(financeCategoryGroups.id, named.id),
          eq(financeCategoryGroups.userId, userId),
        ),
      );
    return named.id;
  }

  const [created] = await tx
    .insert(financeCategoryGroups)
    .values({
      userId,
      parentGroupId: input.parentGroupId,
      name: input.name,
      isIncome: false,
      sourceCommitmentKey: input.sourceKey,
      sortKey:
        input.sortKey ?? (await nextChildSortKey(tx, userId, input.parentGroupId)),
    })
    .returning({ id: financeCategoryGroups.id });
  if (!created) throw new Error("Could not create the imported budget group.");
  return created.id;
}

async function nextScheduleSortKey(tx: Tx, userId: string): Promise<string> {
  const [last] = await tx
    .select({ sortKey: financeSchedules.sortKey })
    .from(financeSchedules)
    .where(eq(financeSchedules.userId, userId))
    .orderBy(desc(financeSchedules.sortKey))
    .limit(1);
  return last ? sortKey.after(last.sortKey) : sortKey.first();
}

async function createBillSchedule(
  tx: Tx,
  userId: string,
  bill: BillForSchedule,
  todayKey: string,
): Promise<string> {
  const conditions = billToScheduleConditions(bill, todayKey);
  const recurrence = dateConfigOf(extractScheduleConds(conditions).date);
  if (!recurrence) throw new Error(`Could not derive a recurrence for ${bill.name}.`);
  const [created] = await tx
    .insert(financeSchedules)
    .values({
      userId,
      name: bill.name,
      conditions,
      nextDate: initialNextDate(recurrence, todayKey),
      sourceBillId: bill.id,
      sortKey: await nextScheduleSortKey(tx, userId),
    })
    .returning({ id: financeSchedules.id });
  if (!created) throw new Error(`Could not create the ${bill.name} schedule.`);
  return created.id;
}

async function envelopeTemplates(
  tx: Tx,
  userId: string,
  envelopeId: string,
): Promise<Template[]> {
  const [row] = await tx
    .select({ templates: financeBudgetCategories.templates })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.id, envelopeId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That envelope does not exist.");
  return parseTemplatesOrThrow(row.templates);
}

function withoutScheduleTemplate(
  templates: readonly Template[],
  scheduleId: string,
): Template[] {
  return templates.filter(
    (template) => template.type !== "schedule" || template.scheduleId !== scheduleId,
  );
}

async function ensureScheduleTemplate(
  tx: Tx,
  userId: string,
  envelopeId: string,
  scheduleId: string,
): Promise<void> {
  const templates = await envelopeTemplates(tx, userId, envelopeId);
  if (
    templates.some(
      (template) => template.type === "schedule" && template.scheduleId === scheduleId,
    )
  ) {
    return;
  }
  await tx
    .update(financeBudgetCategories)
    .set({
      templates: [
        ...templates,
        {
          id: randomUUID(),
          directive: "template",
          type: "schedule",
          priority: 0,
          scheduleId,
        },
      ],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.id, envelopeId),
      ),
    );
}

export async function applyCommitmentsImport(
  userId: string,
  input: {
    targetGroupId: string;
    legacyEnvelopeId: string | null;
    fingerprint: string;
    todayKey: string;
  },
): Promise<CommitmentsImportResult> {
  const preview = await previewCommitmentsImport(userId, input);
  if (preview.fingerprint !== input.fingerprint) {
    throw new Error("The budget changed after this preview. Review the import again.");
  }
  if (preview.plan.blockingReason) throw new Error(preview.plan.blockingReason);
  const state = await importState(userId);
  const billsById = new Map(state.bills.map((bill) => [bill.id, bill]));
  const settings = parseBudget(await readSetting(userId, BUDGET_SCOPE));
  if (!settings.startMonth)
    throw new Error("Set up the budget before importing bills.");
  const startMonth = settings.startMonth;

  let transactionsRouted = 0;
  await db.transaction(async (tx) => {
    const legacySortKey = state.envelopes.find(
      (envelope) => envelope.id === input.legacyEnvelopeId,
    )?.sortKey;
    const billsGroupId = await ensureImportedGroup(tx, userId, {
      sourceKey: COMMITMENTS_BILLS_GROUP_KEY,
      name: "Bills",
      parentGroupId: input.targetGroupId,
      sortKey: legacySortKey,
    });

    if (input.legacyEnvelopeId && preview.plan.legacyEnvelopeMove) {
      await tx
        .update(financeBudgetCategories)
        .set({
          groupId: billsGroupId,
          name: "Other bills",
          sortKey: await nextChildSortKey(tx, userId, billsGroupId),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(financeBudgetCategories.userId, userId),
            eq(financeBudgetCategories.id, input.legacyEnvelopeId),
          ),
        );
    }

    for (const billPlan of preview.plan.bills) {
      if (billPlan.state === "inactive" || billPlan.state === "conflict") continue;
      if (billPlan.state === "existing") continue;
      const bill = billsById.get(billPlan.billId);
      if (!bill) throw new Error(`${billPlan.name} no longer exists in Commitments.`);

      let scheduleId = billPlan.scheduleId;
      if (!scheduleId) {
        scheduleId = await createBillSchedule(tx, userId, bill, input.todayKey);
      }

      let envelopeId = billPlan.envelopeId;
      if (billPlan.state === "create") {
        const categoryGroupId = await ensureImportedGroup(tx, userId, {
          sourceKey: `${COMMITMENTS_CATEGORY_GROUP_PREFIX}${billPlan.categoryName}`,
          name: billPlan.categoryName,
          parentGroupId: billsGroupId,
        });
        const [created] = await tx
          .insert(financeBudgetCategories)
          .values({
            userId,
            groupId: categoryGroupId,
            name: bill.name,
            sourceBillId: bill.id,
            sortKey: await nextChildSortKey(tx, userId, categoryGroupId),
            sourceCategories: [],
          })
          .returning({ id: financeBudgetCategories.id });
        if (!created) throw new Error(`Could not create the ${bill.name} envelope.`);
        envelopeId = created.id;
      } else if (envelopeId) {
        await tx
          .update(financeBudgetCategories)
          .set({ sourceBillId: bill.id, updatedAt: new Date() })
          .where(
            and(
              eq(financeBudgetCategories.userId, userId),
              eq(financeBudgetCategories.id, envelopeId),
            ),
          );
      }
      if (!envelopeId)
        throw new Error(`Could not choose an envelope for ${bill.name}.`);

      if (
        input.legacyEnvelopeId &&
        billPlan.templateEnvelopeId === input.legacyEnvelopeId
      ) {
        const legacyTemplates = await envelopeTemplates(
          tx,
          userId,
          input.legacyEnvelopeId,
        );
        await tx
          .update(financeBudgetCategories)
          .set({
            templates: withoutScheduleTemplate(legacyTemplates, scheduleId),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(financeBudgetCategories.userId, userId),
              eq(financeBudgetCategories.id, input.legacyEnvelopeId),
            ),
          );
      }
      await ensureScheduleTemplate(tx, userId, envelopeId, scheduleId);
      await tx
        .update(financeSchedules)
        .set({ budgetCategoryId: envelopeId, updatedAt: new Date() })
        .where(
          and(eq(financeSchedules.userId, userId), eq(financeSchedules.id, scheduleId)),
        );

      if (bill.payeeIds.length > 0) {
        const routed = await tx
          .update(financeTransactions)
          .set({ budgetCategoryId: envelopeId, updatedAt: new Date() })
          .where(
            and(
              eq(financeTransactions.userId, userId),
              gte(financeTransactions.transactionDate, startMonth),
              inArray(financeTransactions.payeeId, [...bill.payeeIds]),
              input.legacyEnvelopeId
                ? or(
                    isNull(financeTransactions.budgetCategoryId),
                    eq(financeTransactions.budgetCategoryId, input.legacyEnvelopeId),
                  )
                : isNull(financeTransactions.budgetCategoryId),
            ),
          )
          .returning({ id: financeTransactions.id });
        transactionsRouted += routed.length;
      }
    }
  });

  return { ...preview.plan.counts, transactionsRouted };
}
