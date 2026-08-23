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
import { findMonth, monthKeyOf, type BudgetMonth, type MonthKey } from "./envelope";
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

async function requireCategory(userId: string, categoryId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That envelope does not exist.");
}

async function requireGroup(userId: string, groupId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeCategoryGroups.id })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.id, groupId),
        eq(financeCategoryGroups.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That group does not exist.");
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
          sortKey: `${groupKeys[index] ?? ""}:${categoryKeys[position] ?? ""}`,
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
        })
        .onConflictDoUpdate({
          target: [
            financeBudgetAllocations.userId,
            financeBudgetAllocations.month,
            financeBudgetAllocations.categoryId,
          ],
          set: { amountCents: write.amountCents, updatedAt: new Date() },
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
  params: { name: string; isIncome?: boolean },
): Promise<string> {
  const name = params.name.trim();
  if (name === "") throw new Error("A group needs a name.");

  const [last] = await db
    .select({ sortKey: financeCategoryGroups.sortKey })
    .from(financeCategoryGroups)
    .where(eq(financeCategoryGroups.userId, userId))
    .orderBy(sql`${financeCategoryGroups.sortKey} desc`)
    .limit(1);

  const [row] = await db
    .insert(financeCategoryGroups)
    .values({
      userId,
      name,
      isIncome: params.isIncome ?? false,
      sortKey: sortKey.after(last?.sortKey ?? sortKey.first()),
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

  const [last] = await db
    .select({ sortKey: financeBudgetCategories.sortKey })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.groupId, params.groupId),
      ),
    )
    .orderBy(sql`${financeBudgetCategories.sortKey} desc`)
    .limit(1);

  const [row] = await db
    .insert(financeBudgetCategories)
    .values({
      userId,
      groupId: params.groupId,
      name,
      sortKey: sortKey.after(last?.sortKey ?? sortKey.first()),
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
  await requireCategory(userId, categoryId);
  if (edit.groupId !== undefined) await requireGroup(userId, edit.groupId);

  const name = edit.name?.trim();
  if (name !== undefined && name === "") throw new Error("An envelope needs a name.");

  await db
    .update(financeBudgetCategories)
    .set({
      ...(name === undefined ? {} : { name }),
      ...(edit.hidden === undefined ? {} : { hidden: edit.hidden }),
      ...(edit.notes === undefined ? {} : { notes: edit.notes.trim() }),
      ...(edit.groupId === undefined ? {} : { groupId: edit.groupId }),
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

/** Deletes the group and, by cascade, its envelopes. Their transactions survive. */
export async function deleteCategoryGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  await requireGroup(userId, groupId);
  await db
    .delete(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.id, groupId),
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

/** Include or exclude an account from the budget. */
export async function setAccountOffBudget(
  userId: string,
  accountId: string,
  offBudget: boolean,
): Promise<void> {
  const [row] = await db
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
    .limit(1);
  if (!row) throw new Error("That account does not exist.");

  await db
    .update(financeAccounts)
    .set({ offBudget, updatedAt: new Date() })
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)));
}
