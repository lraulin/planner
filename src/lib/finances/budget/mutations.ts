import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeBudgetMonths,
  financeCategoryGroups,
  financePayees,
  financeTransactions,
  type EnvelopeKind,
} from "@/db/schema";
import { localDateKey } from "@/lib/schedule/geometry";
import { serializeBudget } from "@/lib/settings/finances";
import { writeUserSetting } from "@/lib/settings/mutations";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import * as sortKey from "@/lib/tree/sortKey";
import { effectiveFlow } from "../analytics";
import {
  categoryAssignableIds,
  partitionCategoryTargets,
} from "../categoryEligibility";
import { numericStringToCents } from "../money";
import { applyPayeeAutoCategories, applyPayeeClaims } from "../payees/claims";
import { learnFromCategoryEdit } from "../payees/learn";
import {
  budgetSiblings,
  resolveBudgetDrop,
  type BudgetDropZone,
  type BudgetStructureRef,
} from "./hierarchy";
import { budgetRows } from "./rows";
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
import { moneyRows } from "../splitRows";
import {
  AVERAGE_LOOKBACK_MONTHS,
  loadBillAnchors,
  loadBillSnapshots,
  loadBudget,
  openingPositionFor,
} from "./queries";
import { applyTemplates as runApply, templateCarryIn } from "./templates/apply";
import { planAssign } from "./assign/plan";
import { assignEnvelopeFromRow, assignHistoryWithLookback } from "./assign/fromBudget";
import type { AssignOption } from "./assign/types";
import { parseTarget, parseTargetOrThrow } from "./targets/types";

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
      kind: financeBudgetCategories.kind,
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
      name: financeCategoryGroups.name,
      kind: financeCategoryGroups.kind,
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
    db
      .select({ sortKey: financeBudgetCategories.sortKey })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          parentGroupId === null
            ? isNull(financeBudgetCategories.groupId)
            : eq(financeBudgetCategories.groupId, parentGroupId),
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
  // Envelopes, not groups: a preset may seed no groups at all now that a section-naming
  // group is chrome (`agent-os/specs/2026-08-28-1613-group-kind/` D5), and `minimal` seeds
  // none. Checking groups here would let `minimal` be seeded over and over.
  const existing = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    throw new Error("This budget has already been set up.");
  }

  const startMonth = options.startMonth ?? monthKeyOf(options.todayKey);
  const openingCents = await openingPositionFor(userId, startMonth);
  const groups = PRESET_GROUPS[options.preset];
  // One sibling sequence across every root-level item, because a preset entry may now be a
  // group *or* a run of envelopes sitting at the section root — per-entry sequences would
  // hand two root envelopes the same key.
  const rootSlots = groups.reduce(
    (total, group) => total + (group.name === null ? group.categories.length : 1),
    0,
  );
  const rootKeys = sortKey.sequence(rootSlots);
  let rootSlot = 0;

  let categoryCount = 0;

  await db.transaction(async (tx) => {
    for (const group of groups) {
      let groupId: string | null = null;
      if (group.name !== null) {
        const [inserted] = await tx
          .insert(financeCategoryGroups)
          .values({
            userId,
            name: group.name,
            kind: group.kind,
            sortKey: rootKeys[rootSlot++] ?? sortKey.first(),
          })
          .returning({ id: financeCategoryGroups.id });
        if (!inserted) throw new Error("Could not create the budget groups.");
        groupId = inserted.id;
      }

      const nestedKeys = sortKey.sequence(group.categories.length);
      await tx.insert(financeBudgetCategories).values(
        group.categories.map((category, position) => ({
          userId,
          groupId,
          name: category.name,
          // Groups and envelopes share one sibling sequence. The old flat grid used a
          // `group:category` composite key here; `:` is deliberately outside the fractional
          // key alphabet and made the first nested insertion impossible.
          sortKey:
            (groupId === null ? rootKeys[rootSlot++] : nestedKeys[position]) ??
            sortKey.first(),
          kind: group.kind,
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
 * Fill currently uncategorised eligible rows from payee claims then defaults.
 *
 * Taxonomy auto-map is retired. The `since` argument is kept so existing callers compile;
 * uncategorised-only application is the safety, not the date bound.
 */
export async function autoMapBudgetCategories(
  userId: string,
  _since?: MonthKey,
): Promise<{ placed: number; remaining: number }> {
  const placed = await applyPayeeAutoCategories(userId);
  return { placed, remaining: 0 };
}

export { applyPayeeClaims };

/** Same fill, used after seeding a budget. */
export async function autoMapConfiguredBudgetCategories(
  userId: string,
): Promise<{ placed: number; remaining: number }> {
  return autoMapBudgetCategories(userId);
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
  | { kind: "release-hold"; month: MonthKey }
  | { kind: "copy-previous"; month: MonthKey }
  | { kind: "average"; month: MonthKey }
  | { kind: "zero"; month: MonthKey };

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

  const expenses = expenseRefs(data.categories);

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

/**
 * Create a group in one section.
 *
 * A group states its section rather than having it inferred from what is inside it
 * (`agent-os/specs/2026-08-28-1613-group-kind/` D1), which is what lets a brand-new empty
 * group render at all. A child group must match its parent: a Bills group inside a Savings
 * group would be a group in two tables at once.
 */
export async function createCategoryGroup(
  userId: string,
  params: { name: string; kind: EnvelopeKind; parentGroupId?: string | null },
): Promise<string> {
  const name = params.name.trim();
  if (name === "") throw new Error("A group needs a name.");
  const parentGroupId = params.parentGroupId ?? null;
  if (parentGroupId) {
    const parent = await requireGroup(userId, parentGroupId);
    if (parent.kind !== params.kind) {
      throw new Error(`A group inside ${parent.name} has to be ${parent.kind}.`);
    }
  }
  const last = await lastBudgetChildSortKey(userId, parentGroupId);

  const [row] = await db
    .insert(financeCategoryGroups)
    .values({
      userId,
      parentGroupId,
      name,
      kind: params.kind,
      sortKey: last === null ? sortKey.first() : sortKey.after(last),
    })
    .returning({ id: financeCategoryGroups.id });
  if (!row) throw new Error("Could not create the group.");
  return row.id;
}

/**
 * The minimum legal bill facet: monthly, active, scheduled, nothing else known.
 *
 * `finance_budget_categories_bill_facet` requires `cadenceMonths` on a bill, so a bill typed
 * in by name has to arrive with one. Monthly is the overwhelmingly common cadence and the
 * one the inspector opens on; amount, next charge and a real cadence are finished there
 * (`agent-os/specs/2026-08-28-1527-inline-budget-structure/` D1).
 */
const DEFAULT_BILL_FACET = {
  cadenceMonths: 1,
  status: "active" as const,
  scheduled: true,
} satisfies Partial<typeof financeBudgetCategories.$inferInsert>;

export async function createBudgetCategory(
  userId: string,
  params: {
    groupId?: string | null;
    name: string;
    kind?: EnvelopeKind;
  },
): Promise<string> {
  const name = params.name.trim();
  if (name === "") throw new Error("An envelope needs a name.");
  const kind = params.kind ?? "spending";
  const groupId = params.groupId ?? null;
  if (groupId !== null) {
    const group = await requireGroup(userId, groupId);
    if (group.kind !== kind) {
      throw new Error(`${group.name} holds ${group.kind} envelopes, not ${kind}.`);
    }
  }
  const last = await lastBudgetChildSortKey(userId, groupId);

  const [row] = await db
    .insert(financeBudgetCategories)
    .values({
      userId,
      groupId,
      name,
      kind,
      ...(kind === "bill" ? DEFAULT_BILL_FACET : {}),
      sortKey: last === null ? sortKey.first() : sortKey.after(last),
    })
    .returning({ id: financeBudgetCategories.id });
  if (!row) throw new Error("Could not create the envelope.");
  return row.id;
}

export type BudgetCategoryEdit = {
  name?: string;
  hidden?: boolean;
  notes?: string;
  groupId?: string | null;
  kind?: EnvelopeKind;
};

export async function updateBudgetCategory(
  userId: string,
  categoryId: string,
  edit: BudgetCategoryEdit,
): Promise<void> {
  const category = await requireCategory(userId, categoryId);
  const nextKind = edit.kind ?? category.kind;
  let groupId = edit.groupId;

  /*
   * An envelope's kind must equal its group's, so a section change and a group both have to
   * be checked against the same rule.
   *
   * Changing the section of an envelope that sits in a group **moves it to that section's
   * root** rather than refusing. The user asked for the section change; the group cannot
   * follow it into another table, and refusing would leave Change section dead-ending with
   * nothing the user can do about it from that menu
   * (`agent-os/specs/2026-08-28-1613-group-kind/` D2).
   */
  if (
    groupId === undefined &&
    nextKind !== category.kind &&
    category.groupId !== null
  ) {
    groupId = null;
  }

  let movedSortKey: string | undefined;
  if (groupId !== undefined && groupId !== category.groupId) {
    if (groupId !== null) {
      const group = await requireGroup(userId, groupId);
      if (group.kind !== nextKind) {
        throw new Error(
          `${group.name} holds ${group.kind} envelopes, not ${nextKind}.`,
        );
      }
    }
    const last = await lastBudgetChildSortKey(userId, groupId);
    movedSortKey = last === null ? sortKey.first() : sortKey.after(last);
  }

  const name = edit.name?.trim();
  if (name !== undefined && name === "") throw new Error("An envelope needs a name.");
  const leavingBill =
    category.kind === "bill" && edit.kind !== undefined && edit.kind !== "bill";
  const becomingBill = category.kind !== "bill" && edit.kind === "bill";

  await db
    .update(financeBudgetCategories)
    .set({
      ...(name === undefined ? {} : { name }),
      ...(edit.hidden === undefined ? {} : { hidden: edit.hidden }),
      ...(edit.notes === undefined ? {} : { notes: edit.notes.trim() }),
      ...(groupId === undefined ? {} : { groupId }),
      ...(movedSortKey === undefined ? {} : { sortKey: movedSortKey }),
      ...(edit.kind === undefined ? {} : { kind: edit.kind }),
      ...(edit.kind === "income" ? { target: null } : {}),
      ...(becomingBill ? DEFAULT_BILL_FACET : {}),
      ...(leavingBill
        ? {
            status: "active" as const,
            cancelledOn: null,
            url: "",
            cadenceMonths: null,
            cadenceDays: null,
            dueDay: null,
            anchorDate: null,
            scheduled: true,
            expectedCents: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    );
}

/** Retired with the taxonomy auto-map. Kept as a named no-op so old callers compile. */
export async function setTaxonomyCategoryEnvelope(
  _userId: string,
  _sourceCategory: string,
  _categoryId: string | null,
): Promise<void> {}

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
  await db.transaction(async (tx) => {
    await tx
      .update(financePayees)
      .set({ claimedBudgetCategoryId: null, updatedAt: new Date() })
      .where(
        and(
          eq(financePayees.userId, userId),
          eq(financePayees.claimedBudgetCategoryId, categoryId),
        ),
      );
    await tx
      .update(financePayees)
      .set({
        defaultBudgetCategoryId: null,
        autoCategoryMode: sql`case when ${financePayees.autoCategoryMode} = 'fixed' then 'learn' else ${financePayees.autoCategoryMode} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financePayees.userId, userId),
          eq(financePayees.defaultBudgetCategoryId, categoryId),
        ),
      );
    await tx
      .delete(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.id, categoryId),
          eq(financeBudgetCategories.userId, userId),
        ),
      );
  });
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
        kind: financeCategoryGroups.kind,
        sortKey: financeCategoryGroups.sortKey,
        hidden: financeCategoryGroups.hidden,
      })
      .from(financeCategoryGroups)
      .where(eq(financeCategoryGroups.userId, userId)),
    db
      .select({
        id: financeBudgetCategories.id,
        groupId: financeBudgetCategories.groupId,
        sortKey: financeBudgetCategories.sortKey,
        kind: financeBudgetCategories.kind,
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

  const movingKind =
    moving.kind === "group"
      ? structure.groups.find((group) => group.id === moving.id)!.kind
      : structure.categories.find((category) => category.id === moving.id)!.kind;
  const siblings = budgetSiblings(
    structure.groups,
    structure.categories,
    placement.parentGroupId,
    movingKind,
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
  const nextSortKey = await lastBudgetChildSortKey(userId, null);
  const sortKeyValue =
    nextSortKey === null ? sortKey.first() : sortKey.after(nextSortKey);
  if (moving.kind === "category") {
    await requireCategory(userId, moving.id);
    await db
      .update(financeBudgetCategories)
      .set({
        groupId: null,
        sortKey: sortKeyValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeBudgetCategories.id, moving.id),
          eq(financeBudgetCategories.userId, userId),
        ),
      );
    return;
  }
  await requireGroup(userId, moving.id);
  await db
    .update(financeCategoryGroups)
    .set({
      parentGroupId: null,
      sortKey: sortKeyValue,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeCategoryGroups.id, moving.id),
        eq(financeCategoryGroups.userId, userId),
      ),
    );
}

async function learnCategoryForPayee(
  userId: string,
  editedId: string,
  payeeId: string,
): Promise<string | void> {
  await learnFromCategoryEdit(userId, payeeId, editedId);
}

export type BulkCategoryResult = {
  updated: string[];
  skipped: { id: string; reason: string }[];
};

const CATEGORY_ROW_COLUMNS = {
  id: financeTransactions.id,
  accountId: financeTransactions.accountId,
  accountOffBudget: financeAccounts.offBudget,
  transactionDate: financeTransactions.transactionDate,
  transferGroupId: financeTransactions.transferGroupId,
  derivedFlow: financeTransactions.derivedFlow,
  flowOverride: financeTransactions.flowOverride,
  amount: financeTransactions.amount,
  payeeId: financeTransactions.payeeId,
  isParent: financeTransactions.isParent,
} as const;

/** Put many transactions in a Category, skipping ineligible rows. */
export async function setTransactionBudgetCategories(
  userId: string,
  transactionIds: readonly string[],
  categoryId: string | null,
): Promise<BulkCategoryResult> {
  const unique = [...new Set(transactionIds)];
  if (unique.length === 0) return { updated: [], skipped: [] };
  if (categoryId !== null) await requireCategory(userId, categoryId);

  const rows = await db
    .select(CATEGORY_ROW_COLUMNS)
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.id, unique),
      ),
    );

  const groupIds = [
    ...new Set(
      rows.flatMap((row) => (row.transferGroupId ? [row.transferGroupId] : [])),
    ),
  ];
  const mates =
    groupIds.length === 0
      ? []
      : await db
          .select(CATEGORY_ROW_COLUMNS)
          .from(financeTransactions)
          .innerJoin(
            financeAccounts,
            eq(financeAccounts.id, financeTransactions.accountId),
          )
          .where(
            and(
              eq(financeTransactions.userId, userId),
              inArray(financeTransactions.transferGroupId, groupIds),
            ),
          );

  const byId = new Map<string, (typeof rows)[number]>();
  for (const row of [...mates, ...rows]) byId.set(row.id, row);
  const assignmentRows = [...byId.values()];
  const assignableSet = categoryAssignableIds(
    assignmentRows.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      transactionDate: entry.transactionDate,
      transferGroupId: entry.transferGroupId,
      effectiveFlow: effectiveFlow({
        derivedFlow: entry.derivedFlow,
        flowOverride: entry.flowOverride,
        amountCents: numericStringToCents(entry.amount) ?? 0,
      }),
    })),
    new Set(
      assignmentRows.flatMap((entry) =>
        entry.accountOffBudget ? [entry.accountId] : [],
      ),
    ),
  );

  const loadedIds = new Set(rows.map((row) => row.id));
  const { assignable, skipped } =
    categoryId === null
      ? {
          // Even clearing skips a split parent: its null envelope is the split, not an
          // absence, and letting the bulk write touch it would be a silent no-op reported
          // as a success.
          assignable: unique.filter(
            (id) => loadedIds.has(id) && !rows.find((row) => row.id === id)?.isParent,
          ),
          skipped: [],
        }
      : partitionCategoryTargets(
          unique,
          rows.map((row) => ({
            id: row.id,
            accountOffBudget: row.accountOffBudget,
            categoryAssignable: assignableSet.has(row.id),
            isSplitParent: row.isParent,
          })),
        );

  if (assignable.length > 0) {
    await db
      .update(financeTransactions)
      .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          inArray(financeTransactions.id, assignable),
        ),
      );
  }

  if (categoryId !== null) {
    const latestByPayee = new Map<string, string>();
    for (const id of assignable) {
      const payeeId = rows.find((row) => row.id === id)?.payeeId;
      if (payeeId) latestByPayee.set(payeeId, id);
    }
    for (const [payeeId, editedId] of latestByPayee) {
      await learnCategoryForPayee(userId, editedId, payeeId);
    }
  }

  return { updated: assignable, skipped };
}

/**
 * File every waiting charge of one payee into an envelope.
 *
 * The offer D5 makes when a default is set or confirmed: a payee whose destination is known
 * usually has a backlog behind it — 372 `AMAZON MKTPL` charges, 286 Apple ones — and filing
 * them by hand is the work the app exists to remove. It is never silent: the caller states
 * the count first and this runs only on a yes.
 *
 * Only rows with no Category at all are touched, so a Category someone chose by hand is
 * never overwritten; ineligible rows are skipped by the bulk write as everywhere else.
 */
export async function fileWaitingChargesForPayee(
  userId: string,
  payeeId: string,
  categoryId: string,
): Promise<{ filed: number }> {
  await requireCategory(userId, categoryId);
  const [payee] = await db
    .select({ id: financePayees.id })
    .from(financePayees)
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)))
    .limit(1);
  if (!payee) throw new Error("That payee does not exist.");

  const waiting = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.payeeId, payeeId),
        // Leaves: a split parent's null envelope is not a charge waiting to be filed.
        moneyRows,
        isNull(financeTransactions.budgetCategoryId),
      ),
    );
  if (waiting.length === 0) return { filed: 0 };

  const result = await setTransactionBudgetCategories(
    userId,
    waiting.map((row) => row.id),
    categoryId,
  );
  return { filed: result.updated.length };
}

/** Put one transaction in a Category, or make it Uncategorized. */
export async function setTransactionBudgetCategory(
  userId: string,
  transactionId: string,
  categoryId: string | null,
): Promise<string | void> {
  const result = await setTransactionBudgetCategories(
    userId,
    [transactionId],
    categoryId,
  );
  if (result.updated.includes(transactionId)) return;
  const skip = result.skipped[0];
  if (skip) throw new Error(skip.reason);
  throw new Error("That transaction does not exist.");
}

async function requireTargetableCategory(
  userId: string,
  categoryId: string,
): Promise<{ id: string; target: unknown }> {
  const [row] = await db
    .select({
      id: financeBudgetCategories.id,
      target: financeBudgetCategories.target,
      kind: financeBudgetCategories.kind,
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
  if (row.kind === "income") {
    throw new Error("Income envelopes cannot hold a target.");
  }

  return { id: row.id, target: row.target };
}

export async function saveEnvelopeTarget(
  userId: string,
  categoryId: string,
  target: unknown,
): Promise<void> {
  const existing = await requireTargetableCategory(userId, categoryId);
  const parsed =
    target === null || target === undefined ? null : parseTargetOrThrow(target);
  // `since` is the server's to set, never the client's. The envelope's first target starts
  // today; every later edit keeps the day it already had, so changing the amount or the
  // cadence does not restart the count (`target-refill-basis` D2).
  const stored = parseTarget(existing.target);
  const stamped =
    parsed === null
      ? null
      : stored
        ? { ...parsed, ...(stored.since ? { since: stored.since } : {}) }
        : { ...parsed, since: localDateKey(new Date()) };
  await db
    .update(financeBudgetCategories)
    .set({ target: stamped, updatedAt: new Date() })
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
  const rows = budgetRows(
    data.groups,
    data.categories,
    month,
    data.goals,
    anchors.nextDueKeys,
    anchors.expectedKeys,
  );
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
    applied: result.lines.filter((line) => line.deltaCents !== 0).length,
    errors: result.errors.map((error) => `${error.categoryName}: ${error.message}`),
  };
}
