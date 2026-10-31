import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeCategoryGroups,
  financePayees,
  financeTransactions,
  type EnvelopeKind,
} from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";
import { rearmReminders, supersedeOrphanedReminders } from "@/lib/reminders/arm";
import { serializeBudget } from "@/lib/settings/finances";
import { writeUserSetting } from "@/lib/settings/mutations";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import * as sortKey from "@/lib/tree/sortKey";
import { listAccounts } from "../queries";
import { applyPayeeClaims } from "../payees/claims";
import { monthKeyOf, type MonthKey } from "./envelope";
import { PRESET_GROUPS, type BudgetPreset } from "./presets";
import { openingPositionFor } from "./queries";
import { lastBudgetChildSortKey, requireCategory, requireGroup } from "./structureRows";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import { writeFinanceAuditEvent } from "../audit/writes";

/**
 * Writes for the envelope budget's setup and its envelopes and groups.
 *
 * Every mutation takes `userId` first, scopes on it, and **proves the row was theirs before
 * touching it** — an update whose `where` matches nothing is indistinguishable from a
 * successful no-op unless you check, which is exactly how a cross-user write goes unnoticed
 * (`agent-os/standards/development/security.md`).
 *
 * The rest of the budget's writes sit beside this file, one per reason to change: moving
 * money (`moveMoney.ts`), an envelope's carryover, snooze and target
 * (`envelopeSettings.ts`), reordering (`structureMoves.ts`), filing transactions
 * (`filing.ts`), and reconciling an account (`reconcileAccount.ts`).
 */

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
  // Each on-budget account gets its own recorded opening alongside the combined figure —
  // the fact `effectiveOpeningCents` sums once every account has one
  // (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D2). Computed per account
  // rather than split out of `openingCents` because `openingPositionFor` already does this
  // exact per-account sum internally; asking it once per account is one query shape, not two.
  const onBudgetAccounts = (await listAccounts(userId)).filter(
    (account) => !account.offBudget,
  );
  const accountOpenings = await Promise.all(
    onBudgetAccounts.map(async (account) => ({
      id: account.id,
      openingCents: await openingPositionFor(userId, startMonth, [account.id]),
    })),
  );
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

    for (const account of accountOpenings) {
      await tx
        .update(financeAccounts)
        .set({ budgetOpeningCents: account.openingCents, updatedAt: new Date() })
        .where(ownedRow(financeAccounts, account.id, userId));
    }
  });

  await writeUserSetting(
    userId,
    BUDGET_SCOPE,
    serializeBudget({ startMonth, openingCents }),
  );

  return { startMonth, openingCents, categoryCount };
}

export { applyPayeeClaims };

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
  incomeRole?: "regular" | "other";
  expectedMonthlyIncomeCents?: number | null;
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
  await writeBudgetCategory(userId, categoryId, edit);
  // Becoming or ceasing to be a bill decides whether it has a reminder at all.
  if (edit.kind !== undefined) {
    await rearmReminders(userId, [{ kind: "bill", id: categoryId }]);
  }
}

async function writeBudgetCategory(
  userId: string,
  categoryId: string,
  edit: BudgetCategoryEdit,
): Promise<void> {
  const category = await requireCategory(userId, categoryId);
  const nextKind = edit.kind ?? category.kind;
  if (
    edit.incomeRole !== undefined &&
    !["regular", "other"].includes(edit.incomeRole)
  ) {
    throw new Error("Choose Regular or Other income.");
  }
  if (
    edit.expectedMonthlyIncomeCents != null &&
    (!Number.isSafeInteger(edit.expectedMonthlyIncomeCents) ||
      edit.expectedMonthlyIncomeCents < 0 ||
      edit.expectedMonthlyIncomeCents > 2147483647)
  ) {
    throw new Error("Expected income must be a nonnegative amount in cents.");
  }
  if (
    nextKind !== "income" &&
    (edit.incomeRole !== undefined || edit.expectedMonthlyIncomeCents !== undefined)
  ) {
    throw new Error("Income planning fields belong to income envelopes.");
  }
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
      ...(nextKind !== "income"
        ? { incomeRole: "other" as const, expectedMonthlyIncomeCents: null }
        : {
            ...(edit.incomeRole === undefined ? {} : { incomeRole: edit.incomeRole }),
            ...(edit.expectedMonthlyIncomeCents === undefined
              ? {}
              : { expectedMonthlyIncomeCents: edit.expectedMonthlyIncomeCents }),
          }),
      ...(becomingBill ? DEFAULT_BILL_FACET : {}),
      ...(leavingBill
        ? {
            status: "active" as const,
            cancelledOn: null,
            url: "",
            cadenceMonths: null,
            cadenceDays: null,
            dueDay: null,
            leadDays: 0,
            anchorDate: null,
            scheduled: true,
            expectedCents: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(ownedRow(financeBudgetCategories, categoryId, userId));
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
    .where(ownedRow(financeCategoryGroups, groupId, userId));
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
  await db.transaction(async (tx) => {
    const [category] = await tx
      .select({
        id: financeBudgetCategories.id,
        name: financeBudgetCategories.name,
        kind: financeBudgetCategories.kind,
        groupId: financeBudgetCategories.groupId,
      })
      .from(financeBudgetCategories)
      .where(ownedRow(financeBudgetCategories, categoryId, userId))
      .limit(1);
    if (!category) throw new Error("That envelope does not exist.");
    const [allocations, filedTransactions] = await Promise.all([
      tx
        .select({
          id: financeBudgetAllocations.id,
          month: financeBudgetAllocations.month,
          amountCents: financeBudgetAllocations.amountCents,
          goalCents: financeBudgetAllocations.goalCents,
          carryover: financeBudgetAllocations.carryover,
        })
        .from(financeBudgetAllocations)
        .where(
          and(
            eq(financeBudgetAllocations.userId, userId),
            eq(financeBudgetAllocations.categoryId, categoryId),
          ),
        ),
      tx
        .select({
          id: financeTransactions.id,
          accountId: financeTransactions.accountId,
          transactionDate: financeTransactions.transactionDate,
        })
        .from(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.budgetCategoryId, categoryId),
          ),
        ),
    ]);
    const scope = {
      accountIds: [...new Set(filedTransactions.map((row) => row.accountId))],
      budgetMonths: [
        ...new Set([
          ...allocations.map((row) => row.month),
          ...filedTransactions.map((row) => monthKeyOf(row.transactionDate)),
        ]),
      ],
      envelopeIds: [categoryId],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
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
      .where(ownedRow(financeBudgetCategories, categoryId, userId));
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "budget_delete",
      origin: "Budget",
      summary: `Deleted the ${category.name} envelope.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        {
          entityType: "budget_envelope",
          entityIdentity: categoryId,
          before: {
            name: category.name,
            kind: category.kind,
            groupId: category.groupId,
          },
          after: null,
        },
        ...allocations.map((row) => ({
          entityType: "budget_allocation",
          entityIdentity: row.id,
          before: {
            month: row.month,
            amountCents: row.amountCents,
            goalCents: row.goalCents,
            carryover: row.carryover,
          },
          after: null,
        })),
        ...filedTransactions.map((row) => ({
          entityType: "transaction",
          entityIdentity: row.id,
          before: { budgetCategoryId: categoryId },
          after: { budgetCategoryId: null },
        })),
      ],
    });
  });
  await supersedeOrphanedReminders(userId);
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
    .where(ownedRow(financeCategoryGroups, groupId, userId));
}
