import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetAllocations,
  financeBudgetMonths,
  type EnvelopeKind,
} from "@/db/schema";
import { formatUsd } from "../money";
import { budgetRows } from "./rows";
import {
  categoryMonth,
  findMonth,
  monthName,
  prevMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";
import {
  assignFromReadyToAssign,
  copyPreviousMonth,
  coverOverspending,
  isEmptyEdit,
  releaseHold,
  setAssignment,
  setToAverage,
  setZero,
  transferBetweenCategories,
  unassignToReadyToAssign,
  type BudgetEdit,
  type EnvelopeRef,
} from "./operations";
import {
  AVERAGE_LOOKBACK_MONTHS,
  loadBillAnchors,
  loadBillSnapshots,
  loadBudget,
} from "./queries";
import { applyTemplates as runApply, templateCarryIn } from "./templates/apply";
import { planAssign } from "./assign/plan";
import { assignEnvelopeFromRow, assignHistoryWithLookback } from "./assign/fromBudget";
import type { AssignOption } from "./assign/types";
import { requireCategory } from "./structureRows";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import { writeFinanceAuditEvent } from "../audit/writes";
import type { FinanceAuditKind } from "../audit/types";

/**
 * Writes that move money between envelopes and Ready to Assign.
 *
 * Deliberately thin: `operations.ts` decides *what* to write and every clamp lives there,
 * tested without a database. Here we load, fold, apply, and append the audit line. Every
 * write takes `userId` first and scopes on it (`agent-os/standards/development/security.md`).
 */

// ─────────────────────────── Moving money ───────────────────────────

/**
 * The operations the Budget page offers, as data.
 *
 * A union rather than one exported function per operation, because the server action layer
 * then needs a single thin wrapper and the loading-and-folding happens in exactly one place.
 */
export type BudgetOperation =
  | { kind: "assign"; month: MonthKey; category: EnvelopeRef; amountCents: number }
  | {
      kind: "cover";
      month: MonthKey;
      from: EnvelopeRef | null;
      to: EnvelopeRef;
    }
  | {
      kind: "transfer";
      month: MonthKey;
      from: EnvelopeRef;
      to: EnvelopeRef;
      amountCents: number;
    }
  | {
      kind: "assign-remaining";
      month: MonthKey;
      to: EnvelopeRef;
      amountCents: number | null;
    }
  | { kind: "release-hold"; month: MonthKey }
  | { kind: "copy-previous"; month: MonthKey }
  | { kind: "average"; month: MonthKey }
  | { kind: "zero"; month: MonthKey }
  | {
      kind: "unassign";
      month: MonthKey;
      from: EnvelopeRef;
      amountCents: number;
    };

function expenseRefs(
  categories: readonly { id: string; name: string; kind: EnvelopeKind }[],
): EnvelopeRef[] {
  return categories
    .filter((category) => category.kind !== "income")
    .map((category) => ({ id: category.id, name: category.name }));
}

function editFor(
  operation: BudgetOperation,
  month: BudgetMonth,
  months: readonly BudgetMonth[],
  expenses: readonly EnvelopeRef[],
  todayKey: string,
): BudgetEdit {
  switch (operation.kind) {
    case "assign":
      return setAssignment({
        month,
        category: operation.category,
        amountCents: operation.amountCents,
        todayKey,
      });
    case "cover":
      return coverOverspending({
        month,
        from: operation.from,
        to: operation.to,
        todayKey,
      });
    case "transfer":
      return transferBetweenCategories({
        month,
        from: operation.from,
        to: operation.to,
        amountCents: operation.amountCents,
        todayKey,
      });
    case "assign-remaining":
      return assignFromReadyToAssign({
        month,
        to: operation.to,
        amountCents: operation.amountCents,
        todayKey,
      });
    case "release-hold":
      return releaseHold({ month, todayKey });
    case "copy-previous":
      return copyPreviousMonth({
        month,
        previous: months[months.indexOf(month) - 1] ?? null,
        categories: expenses,
        todayKey,
      });
    case "average":
      return setToAverage({
        months,
        month: month.month,
        lookback: AVERAGE_LOOKBACK_MONTHS,
        categories: expenses,
        todayKey,
      });
    case "zero":
      return setZero({ month, categories: expenses, todayKey });
    case "unassign":
      return unassignToReadyToAssign({
        month,
        from: operation.from,
        amountCents: operation.amountCents,
        todayKey,
      });
  }
}

/**
 * Load, fold, decide, apply.
 *
 * The fold has to happen server-side even though the page already has one: the client's copy
 * is a snapshot, and two tabs assigning at once would otherwise each compute a clamp against
 * a stale Ready to Assign. Deciding here means the clamp is always against what is stored.
 */
/**
 * A budget operation refused for a reason the caller can act on, written for the user.
 *
 * Distinct from the plain `Error`s above so an API caller can tell "you asked for more than
 * the envelope holds" apart from a fault, without matching on message text.
 */
export class BudgetOperationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetOperationRefused";
  }
}

export type BudgetOperationOptions = {
  /** Audit origin; the Budget page's own edits keep the default. */
  auditOrigin?: string;
  /**
   * Refuse a transfer the source cannot cover in full instead of clamping it.
   *
   * The page clamps a Move to what the source holds, which is right under a cursor that can
   * see the result. A caller that cannot see it would otherwise be told "moved" about an
   * amount it never asked for (`agent-os/specs/2026-10-30-0900-mcp-budget-editing/` D4).
   */
  exact?: boolean;
};

export async function performBudgetOperation(
  userId: string,
  operation: BudgetOperation,
  options: BudgetOperationOptions = {},
): Promise<{ applied: boolean; note: string }> {
  const data = await loadBudget(userId, operation.month);
  if (!data.configured) throw new Error("Set the budget up first.");

  const month = findMonth(data.months, operation.month);
  if (!month) throw new Error("That month is outside the budget.");

  const expenses = expenseRefs(data.categories);

  for (const ref of touchedRefs(operation)) {
    await requireCategory(userId, ref.id);
  }

  if (options.exact && operation.kind === "transfer") {
    const available = categoryMonth(month, operation.from.id).balanceCents;
    if (operation.amountCents > available) {
      throw new BudgetOperationRefused(
        `${operation.from.name} has ${formatUsd(Math.max(0, available))} available in ${monthName(operation.month)}; move at most that.`,
      );
    }
  }

  const edit = editFor(operation, month, data.months, expenses, data.todayKey);
  if (isEmptyEdit(edit)) return { applied: false, note: "" };

  await applyEdit(
    userId,
    edit,
    budgetOperationAuditKind(operation),
    options.auditOrigin,
  );
  return { applied: true, note: edit.note };
}

function budgetOperationAuditKind(operation: BudgetOperation): FinanceAuditKind {
  return operation.kind === "transfer" || operation.kind === "cover"
    ? "budget_transfer"
    : operation.kind === "copy-previous" ||
        operation.kind === "average" ||
        operation.kind === "zero"
      ? "budget_bulk_funding"
      : "budget_assignment";
}

function touchedRefs(operation: BudgetOperation): EnvelopeRef[] {
  switch (operation.kind) {
    case "assign":
      return [operation.category];
    case "cover":
      return operation.from ? [operation.from, operation.to] : [operation.to];
    case "transfer":
      return [operation.from, operation.to];
    case "assign-remaining":
      return [operation.to];
    case "unassign":
      return [operation.from];
    // Month-wide operations name no envelope. Listed rather than defaulted: a new operation
    // that does name one must decide here, or its envelope skips the ownership check.
    case "release-hold":
    case "copy-previous":
    case "average":
    case "zero":
      return [];
  }
}

/** Upsert allocations/buffer and their canonical audit evidence in one transaction. */
async function applyEdit(
  userId: string,
  edit: BudgetEdit,
  auditKind: FinanceAuditKind,
  origin = "Budget",
): Promise<void> {
  await db.transaction(async (tx) => {
    const month = edit.buffered?.month ?? edit.allocations[0]?.month;
    if (!month) return;
    const categoryIds = [...new Set(edit.allocations.map((row) => row.categoryId))];
    const scope = { budgetMonths: [month], envelopeIds: categoryIds };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const beforeRows =
      categoryIds.length === 0
        ? []
        : await tx
            .select({
              month: financeBudgetAllocations.month,
              categoryId: financeBudgetAllocations.categoryId,
              amountCents: financeBudgetAllocations.amountCents,
              goalCents: financeBudgetAllocations.goalCents,
            })
            .from(financeBudgetAllocations)
            .where(
              and(
                eq(financeBudgetAllocations.userId, userId),
                eq(financeBudgetAllocations.month, month),
                inArray(financeBudgetAllocations.categoryId, categoryIds),
              ),
            );
    const beforeByCategory = new Map(beforeRows.map((row) => [row.categoryId, row]));
    const [beforeMonth] = await tx
      .select({ bufferedCents: financeBudgetMonths.bufferedCents })
      .from(financeBudgetMonths)
      .where(
        and(
          eq(financeBudgetMonths.userId, userId),
          eq(financeBudgetMonths.month, month),
        ),
      )
      .limit(1);

    for (const write of edit.allocations) {
      await tx
        .insert(financeBudgetAllocations)
        .values({
          userId,
          month: write.month,
          categoryId: write.categoryId,
          amountCents: write.amountCents,
          goalCents: write.goalCents ?? null,
        })
        .onConflictDoUpdate({
          target: [
            financeBudgetAllocations.userId,
            financeBudgetAllocations.month,
            financeBudgetAllocations.categoryId,
          ],
          set: {
            amountCents: write.amountCents,
            ...(write.goalCents === undefined ? {} : { goalCents: write.goalCents }),
            updatedAt: new Date(),
          },
        });
    }

    const bufferedCents = edit.buffered?.bufferedCents;

    await tx
      .insert(financeBudgetMonths)
      .values({ userId, month, bufferedCents: bufferedCents ?? 0 })
      .onConflictDoUpdate({
        target: [financeBudgetMonths.userId, financeBudgetMonths.month],
        set: {
          ...(bufferedCents === undefined ? {} : { bufferedCents }),
          updatedAt: new Date(),
        },
      });

    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: auditKind,
      origin,
      summary: edit.note || "Updated budget allocations",
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        ...edit.allocations.map((write) => {
          const before = beforeByCategory.get(write.categoryId);
          return {
            entityType: "allocation",
            entityIdentity: `${write.month}|${write.categoryId}`,
            before: before
              ? {
                  amountCents: before.amountCents,
                  goalCents: before.goalCents,
                }
              : null,
            after: {
              amountCents: write.amountCents,
              goalCents: write.goalCents ?? before?.goalCents ?? null,
            },
          };
        }),
        ...(bufferedCents === undefined
          ? []
          : [
              {
                entityType: "budget_month",
                entityIdentity: month,
                before: { bufferedCents: beforeMonth?.bufferedCents ?? 0 },
                after: { bufferedCents },
              },
            ]),
      ],
    });
  });
}

/** Write a funding plan's allocations for `month` as one bulk-funding edit. */
async function applyAllocations(
  userId: string,
  month: MonthKey,
  plan: {
    allocations: readonly {
      categoryId: string;
      amountCents: number;
      goalCents?: number | null;
    }[];
    note: string;
  },
): Promise<void> {
  await applyEdit(
    userId,
    {
      allocations: plan.allocations.map((row) => ({
        month,
        categoryId: row.categoryId,
        amountCents: row.amountCents,
        goalCents: row.goalCents,
      })),
      buffered: null,
      note: plan.note,
    },
    "budget_bulk_funding",
  );
}

export async function applyBudgetTemplates(
  userId: string,
  params: {
    month: MonthKey;
    force: boolean;
    categoryIds?: readonly string[];
  },
): Promise<{ applied: number; errors: string[] }> {
  const data = await loadBudget(userId, params.month);
  if (!data.configured) throw new Error("Set the budget up first.");
  const month = findMonth(data.months, params.month);
  if (!month) throw new Error("That month is outside the budget.");

  const previous = findMonth(data.months, prevMonthKey(month.month));
  const envelopes = data.categories.map((category) => {
    const cell = categoryMonth(month, category.id);
    const prior = previous ? categoryMonth(previous, category.id) : null;
    return {
      id: category.id,
      name: category.name,
      isIncome: category.kind === "income",
      kind: category.kind,
      target: category.target,
      assignedCents: cell.assignedCents,
      carryInCents: templateCarryIn(prior),
      activityCents: cell.activityCents,
      contributedBeforeCents: cell.contributedBeforeCents,
    };
  });

  const bills = await loadBillSnapshots(userId, data.categories, data.todayKey);

  const result = runApply({
    month: month.month,
    envelopes,
    bills: new Map(bills.map((bill) => [bill.id, bill])),
    readyToAssignCents: month.readyToAssignCents,
    force: params.force,
    categoryIds: params.categoryIds,
    todayKey: data.todayKey,
  });

  if (result.allocations.length === 0) {
    return { applied: 0, errors: result.errors.map((error) => error.message) };
  }

  await applyAllocations(userId, month.month, result);

  return {
    applied: result.allocations.length,
    errors: result.errors.map((error) => `${error.categoryName}: ${error.message}`),
  };
}

export async function assignBudget(
  userId: string,
  params: {
    month: MonthKey;
    option: AssignOption;
    categoryIds?: readonly string[];
  },
): Promise<{ applied: number; errors: string[] }> {
  const data = await loadBudget(userId, params.month);
  if (!data.configured) throw new Error("Set the budget up first.");
  const month = findMonth(data.months, params.month);
  if (!month) throw new Error("That month is outside the budget.");

  const previous = findMonth(data.months, prevMonthKey(month.month));
  const snapshots = await loadBillSnapshots(userId, data.categories, data.todayKey);
  const anchors = await loadBillAnchors(userId, data.categories, data.todayKey);
  const rows = budgetRows(data.groups, data.categories, month, data.goals, anchors);
  const envelopes = rows.map((row) => assignEnvelopeFromRow(row, previous));
  const result = planAssign({
    option: params.option,
    month: month.month,
    todayKey: data.todayKey,
    readyToAssignCents: month.readyToAssignCents,
    envelopes,
    bills: new Map(snapshots.map((bill) => [bill.id, bill])),
    history: assignHistoryWithLookback(
      data.months,
      data.categories.map((category) => category.id),
      data.preStartActivity,
      data.settings.startMonth,
    ),
    categoryIds: params.categoryIds,
  });

  if (result.allocations.length === 0) {
    return { applied: 0, errors: result.errors.map((error) => error.message) };
  }

  await applyAllocations(userId, month.month, result);

  return {
    applied: result.lines.filter((line) => line.deltaCents !== 0).length,
    errors: result.errors.map((error) => `${error.categoryName}: ${error.message}`),
  };
}
