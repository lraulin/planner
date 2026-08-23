import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeBudgetMonths,
  financeCategoryGroups,
  financeTransactions,
} from "@/db/schema";
import { serializeBudget } from "@/lib/settings/finances";
import { writeUserSetting } from "@/lib/settings/mutations";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import * as sortKey from "@/lib/tree/sortKey";
import { numericStringToCents } from "../money";
import { envelopeForRow, envelopeIndex, type MappableRow } from "./autoMap";
import {
  budgetChildren,
  resolveBudgetDrop,
  type BudgetDropZone,
  type BudgetStructureRef,
} from "./hierarchy";
import {
  categoryMonth,
  findMonth,
  monthKeyOf,
  prevMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";
import {
  assignFromReadyToAssign,
  copyPreviousMonth,
  coverOverspending,
  holdForNextMonth,
  isEmptyEdit,
  releaseHold,
  setAssignment,
  setToAverage,
  setZero,
  transferBetweenCategories,
  type BudgetEdit,
  type EnvelopeRef,
} from "./operations";
import { PRESET_GROUPS, type BudgetPreset } from "./presets";
import { AVERAGE_LOOKBACK_MONTHS, loadBudget, openingPositionFor } from "./queries";
import { applyTemplates as runApply, templateCarryIn } from "./templates/apply";
import {
  defaultScheduleTarget,
  schedulesToAdd,
  type EnvelopeTemplates,
} from "./templates/fromSchedules";
import { scheduleSnapshotMap, scheduleSnapshots } from "./templates/snapshot";
import {
  parseTemplates,
  parseTemplatesOrThrow,
  type Template,
} from "./templates/types";
import { getSchedule, listScheduleRecords } from "../schedules/queries";

/**
 * Writes for the envelope budget.
 *
 * Every mutation takes `userId` first, scopes on it, and **proves the row was theirs before
 * touching it** — an update whose `where` matches nothing is indistinguishable from a
 * successful no-op unless you check, which is exactly how a cross-user write goes unnoticed
 * (`agent-os/standards/development/security.md`).
 *
 * The money-moving half of this file is deliberately thin: `operations.ts` decides *what* to
 * write and every clamp lives there, tested without a database. Here we load, fold, apply,
 * and append the audit line.
 */

/** Guards the note column against unbounded growth from a month of fiddling. */
const MAX_NOTE_LINES = 200;

async function requireCategory(userId: string, categoryId: string) {
  const [row] = await db
    .select({
      id: financeBudgetCategories.id,
      groupId: financeBudgetCategories.groupId,
    })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That envelope does not exist.");
  return row;
}

async function requireGroup(userId: string, groupId: string) {
  const [row] = await db
    .select({
      id: financeCategoryGroups.id,
      parentGroupId: financeCategoryGroups.parentGroupId,
      isIncome: financeCategoryGroups.isIncome,
    })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.id, groupId),
        eq(financeCategoryGroups.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That group does not exist.");
  return row;
}

async function lastBudgetChildSortKey(
  userId: string,
  parentGroupId: string | null,
): Promise<string | null> {
  const [childGroups, envelopes] = await Promise.all([
    db
      .select({ sortKey: financeCategoryGroups.sortKey })
      .from(financeCategoryGroups)
      .where(
        and(
          eq(financeCategoryGroups.userId, userId),
          parentGroupId === null
            ? isNull(financeCategoryGroups.parentGroupId)
            : eq(financeCategoryGroups.parentGroupId, parentGroupId),
        ),
      ),
    parentGroupId === null
      ? Promise.resolve([])
      : db
          .select({ sortKey: financeBudgetCategories.sortKey })
          .from(financeBudgetCategories)
          .where(
            and(
              eq(financeBudgetCategories.userId, userId),
              eq(financeBudgetCategories.groupId, parentGroupId),
            ),
          ),
  ]);
  return (
    [...childGroups, ...envelopes]
      .map((row) => row.sortKey)
      .sort((left, right) => sortKey.compare(right, left))[0] ?? null
  );
}

// ─────────────────────────── Setup ───────────────────────────

export type SeedResult = {
  startMonth: MonthKey;
  openingCents: number;
  categoryCount: number;
};

/**
 * Create a budget from a preset and record where it starts.
 *
 * **The opening position is measured once, here.** Recomputing it on every load would make
 * last month's Ready to Assign move whenever an old statement was imported, and "why did a
 * closed month change" is the question a ledger exists to prevent
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/` D2).
 *
 * Refuses to run twice. Seeding over an existing budget would silently duplicate every
 * envelope, and the unique index would only catch the collisions.
 */
export async function seedBudget(
  userId: string,
  options: { preset: BudgetPreset; startMonth?: MonthKey; todayKey: string },
): Promise<SeedResult> {
  const existing = await db
    .select({ id: financeCategoryGroups.id })
    .from(financeCategoryGroups)
    .where(eq(financeCategoryGroups.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    throw new Error("This budget has already been set up.");
  }

  const startMonth = options.startMonth ?? monthKeyOf(options.todayKey);
  const openingCents = await openingPositionFor(userId, startMonth);
  const groups = PRESET_GROUPS[options.preset];
  const groupKeys = sortKey.sequence(groups.length);

  let categoryCount = 0;

  await db.transaction(async (tx) => {
    for (const [index, group] of groups.entries()) {
      const [inserted] = await tx
        .insert(financeCategoryGroups)
        .values({
          userId,
          name: group.name,
          isIncome: group.isIncome,
          sortKey: groupKeys[index] ?? sortKey.first(),
        })
        .returning({ id: financeCategoryGroups.id });
      if (!inserted) throw new Error("Could not create the budget groups.");

      const categoryKeys = sortKey.sequence(group.categories.length);
      await tx.insert(financeBudgetCategories).values(
        group.categories.map((category, position) => ({
          userId,
          groupId: inserted.id,
          name: category.name,
          // Groups and envelopes now share one sibling sequence. The old flat grid used a
          // `group:category` composite key here; `:` is deliberately outside the fractional
          // key alphabet and made the first nested insertion impossible.
          sortKey: categoryKeys[position] ?? sortKey.first(),
          sourceCategories: [...category.sourceCategories],
        })),
      );
      categoryCount += group.categories.length;
    }
  });

  await writeUserSetting(
    userId,
    BUDGET_SCOPE,
    serializeBudget({ startMonth, openingCents }),
  );

  return { startMonth, openingCents, categoryCount };
}

/**
 * Put every unenveloped on-budget transaction since the start month into an envelope.
 *
 * Only fills nulls — a row someone placed by hand is never moved, which is what makes this
 * safe to re-run after adding an envelope or editing what one claims. Rows the rules cannot
 * place stay null and stay in the backlog on screen.
 */
export async function autoMapBudgetCategories(
  userId: string,
  since: MonthKey,
): Promise<{ placed: number; remaining: number }> {
  const targets = await db
    .select({
      id: financeBudgetCategories.id,
      sourceCategories: financeBudgetCategories.sourceCategories,
      sortKey: financeBudgetCategories.sortKey,
      isIncome: financeCategoryGroups.isIncome,
    })
    .from(financeBudgetCategories)
    .innerJoin(
      financeCategoryGroups,
      eq(financeCategoryGroups.id, financeBudgetCategories.groupId),
    )
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeCategoryGroups.userId, userId),
      ),
    );
  if (targets.length === 0) return { placed: 0, remaining: 0 };

  const rows = await db
    .select({
      id: financeTransactions.id,
      description: financeTransactions.description,
      sourceCategory: financeTransactions.sourceCategory,
      category: financeTransactions.category,
      derivedCategory: financeTransactions.derivedCategory,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      amount: financeTransactions.amount,
      transferGroupId: financeTransactions.transferGroupId,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
        isNull(financeTransactions.budgetCategoryId),
        sql`${financeTransactions.transactionDate} >= ${since}`,
      ),
    );
  if (rows.length === 0) return { placed: 0, remaining: 0 };

  // Transfer groups with two or more legs on on-budget accounts: money that moved inside the
  // budget. Computed here rather than in `autoMap.ts`, which has no database to ask.
  const internalGroups = new Set(
    (
      await db
        .select({ groupId: financeTransactions.transferGroupId })
        .from(financeTransactions)
        .innerJoin(
          financeAccounts,
          eq(financeAccounts.id, financeTransactions.accountId),
        )
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeAccounts.userId, userId),
            eq(financeAccounts.offBudget, false),
            sql`${financeTransactions.transferGroupId} is not null`,
          ),
        )
        .groupBy(financeTransactions.transferGroupId)
        .having(sql`count(*) > 1`)
    ).map((row) => row.groupId as string),
  );

  const index = envelopeIndex(targets);
  const assignments = new Map<string, string[]>();

  for (const row of rows) {
    const mappable: MappableRow = {
      description: row.description,
      sourceCategory: row.sourceCategory,
      category: row.category,
      derivedCategory: row.derivedCategory,
      derivedFlow: row.derivedFlow,
      flowOverride: row.flowOverride,
      amountCents: numericStringToCents(row.amount) ?? 0,
      transferGroupId: row.transferGroupId,
    };
    const categoryId = envelopeForRow(mappable, index, internalGroups);
    if (!categoryId) continue;
    const bucket = assignments.get(categoryId) ?? [];
    bucket.push(row.id);
    assignments.set(categoryId, bucket);
  }

  let placed = 0;
  await db.transaction(async (tx) => {
    for (const [categoryId, ids] of assignments) {
      // One statement per envelope rather than per row: the same pass on three years of
      // history is a few dozen updates instead of a few thousand round trips.
      await tx
        .update(financeTransactions)
        .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, ids),
            isNull(financeTransactions.budgetCategoryId),
          ),
        );
      placed += ids.length;
    }
  });

  return { placed, remaining: rows.length - placed };
}

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
  | { kind: "hold"; month: MonthKey; amountCents: number }
  | { kind: "release-hold"; month: MonthKey }
  | { kind: "copy-previous"; month: MonthKey }
  | { kind: "average"; month: MonthKey }
  | { kind: "zero"; month: MonthKey };

function expenseRefs(
  categories: readonly { id: string; name: string; groupId: string }[],
  incomeGroupIds: ReadonlySet<string>,
): EnvelopeRef[] {
  return categories
    .filter((category) => !incomeGroupIds.has(category.groupId))
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
    case "hold":
      return holdForNextMonth({ month, amountCents: operation.amountCents, todayKey });
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
  }
}

/**
 * Load, fold, decide, apply.
 *
 * The fold has to happen server-side even though the page already has one: the client's copy
 * is a snapshot, and two tabs assigning at once would otherwise each compute a clamp against
 * a stale Ready to Assign. Deciding here means the clamp is always against what is stored.
 */
export async function performBudgetOperation(
  userId: string,
  operation: BudgetOperation,
): Promise<{ applied: boolean; note: string }> {
  const data = await loadBudget(userId, operation.month);
  if (!data.configured) throw new Error("Set the budget up first.");

  const month = findMonth(data.months, operation.month);
  if (!month) throw new Error("That month is outside the budget.");

  const incomeGroupIds = new Set(
    data.groups.filter((group) => group.isIncome).map((group) => group.id),
  );
  const expenses = expenseRefs(data.categories, incomeGroupIds);

  for (const ref of touchedRefs(operation)) {
    await requireCategory(userId, ref.id);
  }

  const edit = editFor(operation, month, data.months, expenses, data.todayKey);
  if (isEmptyEdit(edit)) return { applied: false, note: "" };

  await applyEdit(userId, edit);
  return { applied: true, note: edit.note };
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
    default:
      return [];
  }
}

/** Upsert the allocations, upsert the buffer, append the note. One transaction. */
async function applyEdit(userId: string, edit: BudgetEdit): Promise<void> {
  await db.transaction(async (tx) => {
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

    const month = edit.buffered?.month ?? edit.allocations[0]?.month;
    if (!month) return;

    const [existing] = await tx
      .select({ notes: financeBudgetMonths.notes })
      .from(financeBudgetMonths)
      .where(
        and(
          eq(financeBudgetMonths.userId, userId),
          eq(financeBudgetMonths.month, month),
        ),
      )
      .limit(1);

    const notes = appendNote(existing?.notes ?? "", edit.note);
    const bufferedCents = edit.buffered?.bufferedCents;

    await tx
      .insert(financeBudgetMonths)
      .values({ userId, month, bufferedCents: bufferedCents ?? 0, notes })
      .onConflictDoUpdate({
        target: [financeBudgetMonths.userId, financeBudgetMonths.month],
        set: {
          ...(bufferedCents === undefined ? {} : { bufferedCents }),
          notes,
          updatedAt: new Date(),
        },
      });
  });
}

/** Newest last, oldest dropped past the cap. */
export function appendNote(existing: string, line: string): string {
  if (line === "") return existing;
  const lines = existing === "" ? [] : existing.split("\n");
  lines.push(line);
  return lines.slice(-MAX_NOTE_LINES).join("\n");
}

/**
 * Roll this envelope's overspend forward instead of charging it to Ready to Assign.
 *
 * Applies to `month` **and every later month that already has a row**, as Actual's does. A
 * flag that governed one cell would be re-set every month by hand, and the intent it records
 * — "this envelope owns its own debt" — is not a fact about August.
 */
export async function setCarryover(
  userId: string,
  params: { month: MonthKey; categoryId: string; carryover: boolean },
): Promise<void> {
  await requireCategory(userId, params.categoryId);

  await db.transaction(async (tx) => {
    await tx
      .insert(financeBudgetAllocations)
      .values({
        userId,
        month: params.month,
        categoryId: params.categoryId,
        amountCents: 0,
        carryover: params.carryover,
      })
      .onConflictDoUpdate({
        target: [
          financeBudgetAllocations.userId,
          financeBudgetAllocations.month,
          financeBudgetAllocations.categoryId,
        ],
        set: { carryover: params.carryover, updatedAt: new Date() },
      });

    await tx
      .update(financeBudgetAllocations)
      .set({ carryover: params.carryover, updatedAt: new Date() })
      .where(
        and(
          eq(financeBudgetAllocations.userId, userId),
          eq(financeBudgetAllocations.categoryId, params.categoryId),
          sql`${financeBudgetAllocations.month} > ${params.month}`,
        ),
      );
  });
}

// ─────────────────────────── Envelopes ───────────────────────────

export async function createCategoryGroup(
  userId: string,
  params: { name: string; isIncome?: boolean; parentGroupId?: string | null },
): Promise<string> {
  const name = params.name.trim();
  if (name === "") throw new Error("A group needs a name.");
  const parentGroupId = params.parentGroupId ?? null;
  const parent = parentGroupId ? await requireGroup(userId, parentGroupId) : null;
  const last = await lastBudgetChildSortKey(userId, parentGroupId);

  const [row] = await db
    .insert(financeCategoryGroups)
    .values({
      userId,
      parentGroupId,
      name,
      isIncome: parent?.isIncome ?? params.isIncome ?? false,
      sortKey: last === null ? sortKey.first() : sortKey.after(last),
    })
    .returning({ id: financeCategoryGroups.id });
  if (!row) throw new Error("Could not create the group.");
  return row.id;
}

export async function createBudgetCategory(
  userId: string,
  params: { groupId: string; name: string; sourceCategories?: readonly string[] },
): Promise<string> {
  const name = params.name.trim();
  if (name === "") throw new Error("An envelope needs a name.");
  await requireGroup(userId, params.groupId);
  const last = await lastBudgetChildSortKey(userId, params.groupId);

  const [row] = await db
    .insert(financeBudgetCategories)
    .values({
      userId,
      groupId: params.groupId,
      name,
      sortKey: last === null ? sortKey.first() : sortKey.after(last),
      sourceCategories: [...(params.sourceCategories ?? [])],
    })
    .returning({ id: financeBudgetCategories.id });
  if (!row) throw new Error("Could not create the envelope.");
  return row.id;
}

export type BudgetCategoryEdit = {
  name?: string;
  hidden?: boolean;
  notes?: string;
  sourceCategories?: readonly string[];
  groupId?: string;
};

export async function updateBudgetCategory(
  userId: string,
  categoryId: string,
  edit: BudgetCategoryEdit,
): Promise<void> {
  const category = await requireCategory(userId, categoryId);
  let movedSortKey: string | undefined;
  if (edit.groupId !== undefined && edit.groupId !== category.groupId) {
    const [source, destination] = await Promise.all([
      requireGroup(userId, category.groupId),
      requireGroup(userId, edit.groupId),
    ]);
    if (source.isIncome !== destination.isIncome) {
      throw new Error("Income and spending envelopes cannot share a branch.");
    }
    const last = await lastBudgetChildSortKey(userId, edit.groupId);
    movedSortKey = last === null ? sortKey.first() : sortKey.after(last);
  }

  const name = edit.name?.trim();
  if (name !== undefined && name === "") throw new Error("An envelope needs a name.");

  await db
    .update(financeBudgetCategories)
    .set({
      ...(name === undefined ? {} : { name }),
      ...(edit.hidden === undefined ? {} : { hidden: edit.hidden }),
      ...(edit.notes === undefined ? {} : { notes: edit.notes.trim() }),
      ...(edit.groupId === undefined ? {} : { groupId: edit.groupId }),
      ...(movedSortKey === undefined ? {} : { sortKey: movedSortKey }),
      ...(edit.sourceCategories === undefined
        ? {}
        : { sourceCategories: [...edit.sourceCategories] }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    );
}

export async function renameCategoryGroup(
  userId: string,
  groupId: string,
  name: string,
): Promise<void> {
  await requireGroup(userId, groupId);
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("A group needs a name.");

  await db
    .update(financeCategoryGroups)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(
      and(
        eq(financeCategoryGroups.id, groupId),
        eq(financeCategoryGroups.userId, userId),
      ),
    );
}

/**
 * Delete an envelope, its allocations, and its claim on any transaction.
 *
 * The transactions survive with a null envelope and reappear in the backlog — deleting money
 * because a bucket was deleted is never what anyone means, which is why the FK is
 * `set null` and `hidden` exists as the ordinary way to retire one.
 */
export async function deleteBudgetCategory(
  userId: string,
  categoryId: string,
): Promise<void> {
  await requireCategory(userId, categoryId);
  await db
    .delete(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    );
}

/** Remove an empty organisational group. Money-bearing descendants must be moved first. */
export async function deleteCategoryGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  await requireGroup(userId, groupId);
  const [childGroup, envelope] = await Promise.all([
    db
      .select({ id: financeCategoryGroups.id })
      .from(financeCategoryGroups)
      .where(
        and(
          eq(financeCategoryGroups.userId, userId),
          eq(financeCategoryGroups.parentGroupId, groupId),
        ),
      )
      .limit(1),
    db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.groupId, groupId),
        ),
      )
      .limit(1),
  ]);
  if (childGroup.length > 0 || envelope.length > 0) {
    throw new Error("Move everything out of this group before deleting it.");
  }
  await db
    .delete(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.id, groupId),
        eq(financeCategoryGroups.userId, userId),
      ),
    );
}

async function budgetStructure(userId: string) {
  const [groups, categories] = await Promise.all([
    db
      .select({
        id: financeCategoryGroups.id,
        parentGroupId: financeCategoryGroups.parentGroupId,
        name: financeCategoryGroups.name,
        isIncome: financeCategoryGroups.isIncome,
        sortKey: financeCategoryGroups.sortKey,
        hidden: financeCategoryGroups.hidden,
        sourceCommitmentKey: financeCategoryGroups.sourceCommitmentKey,
      })
      .from(financeCategoryGroups)
      .where(eq(financeCategoryGroups.userId, userId)),
    db
      .select({
        id: financeBudgetCategories.id,
        groupId: financeBudgetCategories.groupId,
        sortKey: financeBudgetCategories.sortKey,
      })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
  ]);
  return { groups, categories };
}

/** Move or reparent one group/envelope from a target row and drop zone. */
export async function moveBudgetStructureItem(
  userId: string,
  moving: BudgetStructureRef,
  target: BudgetStructureRef,
  zone: BudgetDropZone,
): Promise<void> {
  if (moving.kind === "group") await requireGroup(userId, moving.id);
  else await requireCategory(userId, moving.id);
  if (target.kind === "group") await requireGroup(userId, target.id);
  else await requireCategory(userId, target.id);

  const structure = await budgetStructure(userId);
  const placement = resolveBudgetDrop(
    structure.groups,
    structure.categories,
    moving,
    target,
    zone,
  );
  if (!placement) throw new Error("That item cannot move there.");

  const siblings = budgetChildren(
    structure.groups,
    structure.categories,
    placement.parentGroupId,
  );
  const keyOf = (ref: BudgetStructureRef | null) =>
    ref === null
      ? null
      : (siblings.find((item) => item.kind === ref.kind && item.id === ref.id)
          ?.sortKey ?? null);
  const nextSortKey = sortKey.between(keyOf(placement.previous), keyOf(placement.next));
  const updatedAt = new Date();

  if (moving.kind === "group") {
    await db
      .update(financeCategoryGroups)
      .set({
        parentGroupId: placement.parentGroupId,
        sortKey: nextSortKey,
        updatedAt,
      })
      .where(
        and(
          eq(financeCategoryGroups.id, moving.id),
          eq(financeCategoryGroups.userId, userId),
        ),
      );
    return;
  }

  if (!placement.parentGroupId)
    throw new Error("An envelope must stay inside a group.");
  await db
    .update(financeBudgetCategories)
    .set({
      groupId: placement.parentGroupId,
      sortKey: nextSortKey,
      updatedAt,
    })
    .where(
      and(
        eq(financeBudgetCategories.id, moving.id),
        eq(financeBudgetCategories.userId, userId),
      ),
    );
}

/** Move an item to the end of a group, or move a group back to the root. */
export async function moveBudgetStructureItemIntoGroup(
  userId: string,
  moving: BudgetStructureRef,
  parentGroupId: string | null,
): Promise<void> {
  if (parentGroupId !== null) {
    await moveBudgetStructureItem(
      userId,
      moving,
      { kind: "group", id: parentGroupId },
      "inside",
    );
    return;
  }
  if (moving.kind !== "group") throw new Error("An envelope must stay inside a group.");
  await requireGroup(userId, moving.id);
  const nextSortKey = await lastBudgetChildSortKey(userId, null);
  await db
    .update(financeCategoryGroups)
    .set({
      parentGroupId: null,
      sortKey: nextSortKey === null ? sortKey.first() : sortKey.after(nextSortKey),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeCategoryGroups.id, moving.id),
        eq(financeCategoryGroups.userId, userId),
      ),
    );
}

/** Put one transaction in an envelope, or take it out of every envelope. */
export async function setTransactionBudgetCategory(
  userId: string,
  transactionId: string,
  categoryId: string | null,
): Promise<void> {
  if (categoryId !== null) await requireCategory(userId, categoryId);

  const [row] = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That transaction does not exist.");

  await db
    .update(financeTransactions)
    .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    );
}

async function requireSpendingCategory(
  userId: string,
  categoryId: string,
): Promise<{ id: string; templates: Template[] }> {
  const [row] = await db
    .select({
      id: financeBudgetCategories.id,
      groupId: financeBudgetCategories.groupId,
      templates: financeBudgetCategories.templates,
    })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That envelope does not exist.");

  const [group] = await db
    .select({ isIncome: financeCategoryGroups.isIncome })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.id, row.groupId),
        eq(financeCategoryGroups.userId, userId),
      ),
    )
    .limit(1);
  if (!group) throw new Error("That envelope does not exist.");
  if (group.isIncome) throw new Error("Income envelopes cannot hold templates.");

  return { id: row.id, templates: parseTemplates(row.templates) ?? [] };
}

async function requireOwnedSchedule(userId: string, scheduleId: string): Promise<void> {
  const schedule = await getSchedule(userId, scheduleId);
  if (!schedule) throw new Error("That schedule does not exist.");
}

export async function saveEnvelopeTemplates(
  userId: string,
  categoryId: string,
  templates: unknown,
): Promise<void> {
  await requireSpendingCategory(userId, categoryId);
  const parsed = parseTemplatesOrThrow(templates);
  for (const template of parsed) {
    if (template.type === "schedule") {
      await requireOwnedSchedule(userId, template.scheduleId);
    }
  }
  await db
    .update(financeBudgetCategories)
    .set({ templates: parsed, updatedAt: new Date() })
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
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
  const incomeIds = new Set(
    data.groups.filter((group) => group.isIncome).map((group) => group.id),
  );
  const envelopes = data.categories.map((category) => {
    const cell = categoryMonth(month, category.id);
    const prior = previous ? categoryMonth(previous, category.id) : null;
    return {
      id: category.id,
      name: category.name,
      isIncome: incomeIds.has(category.groupId),
      templates: category.templates,
      assignedCents: cell.assignedCents,
      carryInCents: templateCarryIn(prior),
    };
  });

  const result = runApply({
    month: month.month,
    envelopes,
    schedules: scheduleSnapshotMap(
      scheduleSnapshots(await listScheduleRecords(userId)),
    ),
    readyToAssignCents: month.readyToAssignCents,
    force: params.force,
    categoryIds: params.categoryIds,
    todayKey: data.todayKey,
  });

  if (result.allocations.length === 0) {
    return { applied: 0, errors: result.errors.map((error) => error.message) };
  }

  await applyEdit(userId, {
    allocations: result.allocations.map((row) => ({
      month: month.month,
      categoryId: row.categoryId,
      amountCents: row.amountCents,
      goalCents: row.goalCents,
    })),
    buffered: null,
    note: result.note,
  });

  return {
    applied: result.allocations.length,
    errors: result.errors.map((error) => `${error.categoryName}: ${error.message}`),
  };
}

export async function addTemplatesFromSchedules(
  userId: string,
  params: { categoryId?: string; scheduleIds?: readonly string[] },
): Promise<{ added: number; categoryId: string }> {
  const data = await loadBudget(userId, null);
  if (!data.configured) throw new Error("Set the budget up first.");

  const incomeIds = new Set(
    data.groups.filter((group) => group.isIncome).map((group) => group.id),
  );
  const existing: EnvelopeTemplates[] = data.categories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    isIncome: incomeIds.has(category.groupId),
    templates: category.templates,
  }));

  const categoryId = params.categoryId ?? defaultScheduleTarget(existing);
  if (!categoryId)
    throw new Error("There is no spending envelope to attach schedules to.");
  const target = await requireSpendingCategory(userId, categoryId);

  const records = await listScheduleRecords(userId);
  const lines = schedulesToAdd({
    existing,
    candidates: records.map((record) => ({
      id: record.id,
      name: record.name,
      completed: record.completed,
    })),
    targetId: categoryId,
    scheduleIds: params.scheduleIds,
  });
  if (lines.length === 0) return { added: 0, categoryId };

  const next = [...target.templates, ...lines];
  await db
    .update(financeBudgetCategories)
    .set({ templates: next, updatedAt: new Date() })
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    );
  return { added: lines.length, categoryId };
}
