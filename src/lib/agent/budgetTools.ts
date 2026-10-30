/**
 * Agent reads and writes on the envelope budget
 * (`agent-os/specs/2026-10-30-0900-mcp-budget-editing/`).
 *
 * Every figure comes from `loadBudget`'s fold and every write goes through the mutation the
 * Budget page calls, so the agent and the page can never disagree about what a month holds.
 * This module only shapes arguments in and results out, and turns the mutations' plain
 * sentences into the agent's error codes.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { financeTransactions, type EnvelopeKind } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/constraints";
import {
  categoryMonth,
  findMonth,
  monthKeyFromParam,
  type BudgetMonth,
  type MonthKey,
} from "@/lib/finances/budget/envelope";
import {
  BudgetOperationRefused,
  createBudgetCategory,
  createCategoryGroup,
  performBudgetOperation,
  renameCategoryGroup,
  setTransactionBudgetCategories,
  updateBudgetCategory,
} from "@/lib/finances/budget/mutations";
import {
  loadBudget,
  type BudgetCategoryRow,
  type BudgetData,
  type BudgetGroupRow,
} from "@/lib/finances/budget/queries";
import {
  budgetRows,
  sectionGridRows,
  type BudgetRow,
} from "@/lib/finances/budget/rows";
import { formatUsd, numericStringToCents } from "@/lib/finances/money";
import {
  splitTransaction,
  unsplitTransaction,
  updateSplitChildren,
} from "@/lib/finances/mutations";
import { listSplitChildren } from "@/lib/finances/queries";
import type { budgetInputSchemas, budgetOutputSchemas } from "./budgetContracts";
import { AgentError } from "./errors";
import { pageBounds, paginate } from "./pagination";

type Input<K extends keyof typeof budgetInputSchemas> = z.output<
  (typeof budgetInputSchemas)[K]
>;
type Output<K extends keyof typeof budgetOutputSchemas> = z.input<
  (typeof budgetOutputSchemas)[K]
>;

/** Audit origin for every write here, as `delete_transaction` uses. */
const AUDIT_ORIGIN = "Agent";

export const BUDGET_MONTH_DEFAULT_LIMIT = 50;
export const BUDGET_MONTH_MAX_LIMIT = 60;

/** Order the Budget page renders its expense tables in. */
const EXPENSE_SECTIONS: readonly EnvelopeKind[] = ["bill", "spending", "savings"];

// — errors ————————————————————————————————————————————————————————————————————

/**
 * The budget mutations refuse with a plain `Error` whose message is written for the user
 * ("Groceries holds spending envelopes, not savings."). `toAgentError` only recognises a
 * handful of phrasings and would report the rest as an internal error, hiding the one
 * sentence that says what to change. So a plain `Error` with no `cause` is a refusal:
 * not_found when it says so, validation otherwise. Anything with a cause or a subclass of its
 * own (Drizzle, the driver) is not a sentence for the caller and stays internal.
 */
export function budgetAgentError(error: unknown): unknown {
  if (error instanceof AgentError) return error;
  if (isUniqueViolation(error)) {
    return new AgentError(
      "conflict",
      "That name is already used at that level of the budget.",
    );
  }
  if (error instanceof BudgetOperationRefused) {
    return new AgentError("validation", error.message);
  }
  if (
    error instanceof Error &&
    error.constructor === Error &&
    error.cause === undefined
  ) {
    return new AgentError(
      /not found|does not exist/i.test(error.message) ? "not_found" : "validation",
      error.message,
    );
  }
  return error;
}

async function refusals<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw budgetAgentError(error);
  }
}

// — reading ———————————————————————————————————————————————————————————————————

/** `2026-10-01` → `2026-10`. */
function monthParam(month: MonthKey): string {
  return month.slice(0, 7);
}

function parseMonth(value: string): MonthKey {
  const month = monthKeyFromParam(value);
  if (!month) throw new AgentError("validation", "month must be YYYY-MM.");
  return month;
}

/** Load the budget at `requested`, refusing rather than clamping when it is out of range. */
async function loadMonth(
  userId: string,
  requested: MonthKey | null,
): Promise<{ data: BudgetData; month: BudgetMonth }> {
  const data = await loadBudget(userId, requested, db, {
    includeMovementEvents: false,
  });
  if (!data.configured) {
    throw new AgentError(
      "validation",
      "The budget is not set up yet; set it up on the Budget page first.",
    );
  }
  const first = data.months[0]?.month;
  const last = data.months.at(-1)?.month;
  const month = findMonth(data.months, requested ?? data.month);
  if (!month || !first || !last) {
    throw new AgentError(
      "validation",
      `That month is outside the budget, which runs ${monthParam(first ?? data.month)} to ${monthParam(last ?? data.month)}.`,
    );
  }
  return { data, month };
}

function groupOut(group: BudgetGroupRow) {
  return {
    id: group.id,
    name: group.name,
    kind: group.kind,
    parentGroupId: group.parentGroupId,
    hidden: group.hidden,
  };
}

function envelopeRowOut(row: BudgetRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    groupId: row.groupId,
    assignedCents: row.assignedCents,
    activityCents: row.activityCents,
    availableCents: row.balanceCents,
    ...(row.goalCents === null ? {} : { goalCents: row.goalCents }),
    ...(row.hidden ? { hidden: true as const } : {}),
  };
}

/**
 * get_budget_month's response from a folded budget. Pure, so the response-budget test can
 * drive it with a fixture sized to Lee's real budget.
 *
 * Envelopes come in Budget page order (Bills, Envelopes, Savings; groups nested as on the
 * page) through `sectionGridRows`, so hidden groups, hidden envelopes and empty cancelled
 * bills drop out exactly where the page drops them. Their money stays in `summary` either
 * way — that is the page's rule too.
 */
export function budgetMonthResponse(
  input: {
    groups: readonly BudgetGroupRow[];
    categories: readonly BudgetCategoryRow[];
    months: readonly BudgetMonth[];
    month: BudgetMonth;
    goals: Readonly<Record<string, number>>;
    uncategorizedCount: number;
    uncategorizedCents: number;
  },
  options: { includeHidden: boolean; offset?: number; limit?: number },
): Output<"get_budget_month"> {
  const rows = budgetRows(input.groups, input.categories, input.month, input.goals);
  const gridOptions = { showHidden: options.includeHidden };

  const sectionRows = (kind: EnvelopeKind) =>
    sectionGridRows(
      input.groups,
      kind,
      rows.filter((row) => row.kind === kind),
      gridOptions,
    );

  const visibleGroupIds = new Set<string>();
  const nodes = (kind: EnvelopeKind): BudgetRow[] =>
    sectionRows(kind).flatMap((entry) => {
      if (entry.kind === "group") {
        visibleGroupIds.add(entry.id);
        return [];
      }
      return [entry.node];
    });

  const income = nodes("income");
  const expenses = EXPENSE_SECTIONS.flatMap(nodes);
  const page = paginate(
    expenses,
    pageBounds(options.offset, options.limit, {
      limit: BUDGET_MONTH_DEFAULT_LIMIT,
      max: BUDGET_MONTH_MAX_LIMIT,
    }),
  );

  const month = input.month;
  return {
    month: monthParam(month.month),
    firstMonth: monthParam(input.months[0]?.month ?? month.month),
    lastMonth: monthParam(input.months.at(-1)?.month ?? month.month),
    summary: {
      incomeCents: month.totalIncomeCents,
      fromLastMonthCents: month.fromLastMonthCents,
      lastMonthOverspentCents: month.lastMonthOverspentCents,
      assignedCents: month.totalAssignedCents,
      activityCents: month.totalActivityCents,
      availableCents: month.totalBalanceCents,
      heldForNextMonthCents: month.bufferedCents,
      assignedInFutureMonthsCents: month.assignedInFutureMonthsCents,
      uncategorizedActivityCents: month.uncategorizedActivityCents,
      readyToAssignCents: month.readyToAssignCents,
    },
    uncategorized: { count: input.uncategorizedCount, cents: input.uncategorizedCents },
    groups: input.groups.filter((group) => visibleGroupIds.has(group.id)).map(groupOut),
    income: income.map((row) => ({
      id: row.id,
      name: row.name,
      groupId: row.groupId,
      receivedCents: row.activityCents,
      ...(row.hidden ? { hidden: true as const } : {}),
    })),
    envelopes: page.items.map(envelopeRowOut),
    hiddenEnvelopeCount: rows.length - income.length - expenses.length,
    pageInfo: page.pageInfo,
  };
}

export async function getBudgetMonthTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"get_budget_month">;
  const requested = input.month === undefined ? null : parseMonth(input.month);
  const { data, month } = await loadMonth(userId, requested);
  return budgetMonthResponse(
    { ...data, month },
    { includeHidden: input.includeHidden, offset: input.offset, limit: input.limit },
  );
}

// — structure ———————————————————————————————————————————————————————————————————

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

async function structureOf(userId: string) {
  const data = await loadBudget(userId, null, db, { includeMovementEvents: false });
  return { groups: data.groups, categories: data.categories };
}

function envelopeDetail(
  category: BudgetCategoryRow,
  groups: readonly BudgetGroupRow[],
): Output<"create_budget_envelope">["envelope"] {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    groupId: category.groupId,
    groupName: groups.find((group) => group.id === category.groupId)?.name ?? null,
    hidden: category.hidden,
    notes: category.notes,
  };
}

async function readEnvelope(userId: string, id: string) {
  const { groups, categories } = await structureOf(userId);
  const category = categories.find((entry) => entry.id === id);
  if (!category) throw new AgentError("not_found", "That envelope does not exist.");
  return envelopeDetail(category, groups);
}

async function readGroup(userId: string, id: string) {
  const { groups } = await structureOf(userId);
  const group = groups.find((entry) => entry.id === id);
  if (!group) throw new AgentError("not_found", "That group does not exist.");
  return groupOut(group);
}

export async function createBudgetGroupTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"create_budget_group">;
  const parentGroupId = input.parentGroupId ?? null;
  const { groups } = await structureOf(userId);
  if (
    groups.some(
      (group) =>
        group.parentGroupId === parentGroupId && sameName(group.name, input.name),
    )
  ) {
    throw new AgentError(
      "conflict",
      `A group named ${input.name} already exists there.`,
    );
  }
  const id = await refusals(() =>
    createCategoryGroup(userId, { name: input.name, kind: input.kind, parentGroupId }),
  );
  return { created: true as const, group: await readGroup(userId, id) };
}

export async function updateBudgetGroupTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"update_budget_group">;
  const { groups } = await structureOf(userId);
  const group = groups.find((entry) => entry.id === input.id);
  if (!group) throw new AgentError("not_found", "That group does not exist.");
  if (
    groups.some(
      (other) =>
        other.id !== group.id &&
        other.parentGroupId === group.parentGroupId &&
        sameName(other.name, input.name),
    )
  ) {
    throw new AgentError(
      "conflict",
      `A group named ${input.name} already exists there.`,
    );
  }
  await refusals(() => renameCategoryGroup(userId, input.id, input.name));
  return { group: await readGroup(userId, input.id) };
}

function requireUniqueEnvelopeName(
  categories: readonly BudgetCategoryRow[],
  name: string,
  groupId: string | null,
  exceptId?: string,
) {
  const clash = categories.find(
    (category) =>
      category.id !== exceptId &&
      category.groupId === groupId &&
      sameName(category.name, name),
  );
  if (clash) {
    throw new AgentError(
      "conflict",
      `An envelope named ${clash.name} already exists there (id ${clash.id}).`,
    );
  }
}

export async function createBudgetEnvelopeTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"create_budget_envelope">;
  const groupId = input.groupId ?? null;
  const { categories } = await structureOf(userId);
  requireUniqueEnvelopeName(categories, input.name, groupId);

  const id = await refusals(async () => {
    const created = await createBudgetCategory(userId, {
      name: input.name,
      kind: input.kind,
      groupId,
    });
    if (input.notes !== undefined && input.notes.trim() !== "") {
      await updateBudgetCategory(userId, created, { notes: input.notes });
    }
    return created;
  });
  return { created: true as const, envelope: await readEnvelope(userId, id) };
}

export async function updateBudgetEnvelopeTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"update_budget_envelope">;
  const { categories } = await structureOf(userId);
  const current = categories.find((category) => category.id === input.id);
  if (!current) throw new AgentError("not_found", "That envelope does not exist.");

  const edit = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.hidden === undefined ? {} : { hidden: input.hidden }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
  if (Object.keys(edit).length === 0) {
    throw new AgentError(
      "validation",
      "Give at least one of name, groupId, kind, hidden or notes.",
    );
  }

  // Where the envelope will sit, mirroring `writeBudgetCategory`: a section change with no
  // group named moves it to the new section's root.
  const nextGroupId =
    input.groupId !== undefined
      ? input.groupId
      : input.kind !== undefined && input.kind !== current.kind
        ? null
        : current.groupId;
  requireUniqueEnvelopeName(
    categories,
    input.name ?? current.name,
    nextGroupId,
    current.id,
  );

  await refusals(() => updateBudgetCategory(userId, input.id, edit));
  return { envelope: await readEnvelope(userId, input.id) };
}

// — money ———————————————————————————————————————————————————————————————————————

function requireExpenseEnvelope(
  categories: readonly BudgetCategoryRow[],
  id: string,
): BudgetCategoryRow {
  const category = categories.find((entry) => entry.id === id);
  if (!category) throw new AgentError("not_found", "That envelope does not exist.");
  if (category.kind === "income") {
    throw new AgentError(
      "validation",
      `${category.name} is an income envelope; income is received, not assigned.`,
    );
  }
  return category;
}

function envelopeMonth(month: BudgetMonth, category: BudgetCategoryRow) {
  const cell = categoryMonth(month, category.id);
  return {
    id: category.id,
    name: category.name,
    assignedCents: cell.assignedCents,
    availableCents: cell.balanceCents,
  };
}

export async function setBudgetAssignmentTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"set_budget_assignment">;
  if ((input.amountCents === undefined) === (input.adjustCents === undefined)) {
    throw new AgentError(
      "validation",
      "Give exactly one of amountCents or adjustCents.",
    );
  }
  const monthKey = parseMonth(input.month);
  const before = await loadMonth(userId, monthKey);
  const category = requireExpenseEnvelope(before.data.categories, input.envelopeId);
  const previous = categoryMonth(before.month, category.id).assignedCents;
  const target = input.amountCents ?? previous + (input.adjustCents ?? 0);
  if (target < 0) {
    throw new AgentError(
      "validation",
      `${category.name} has ${formatUsd(previous)} assigned in this month; Assigned cannot go below $0.00.`,
    );
  }

  const { applied } = await refusals(() =>
    performBudgetOperation(
      userId,
      {
        kind: "assign",
        month: monthKey,
        category: { id: category.id, name: category.name },
        amountCents: target,
      },
      { auditOrigin: AUDIT_ORIGIN },
    ),
  );

  const after = await loadMonth(userId, monthKey);
  const warnings: string[] = [];
  if (after.month.readyToAssignCents < 0) {
    warnings.push(
      `Ready to Assign is now ${formatUsd(after.month.readyToAssignCents)}: more is assigned than the budget holds. Take it back from another envelope or lower this one.`,
    );
  }
  return {
    applied,
    month: monthParam(monthKey),
    envelope: envelopeMonth(after.month, category),
    previousAssignedCents: previous,
    readyToAssignCents: after.month.readyToAssignCents,
    warnings,
  };
}

/**
 * Move Assigned from one envelope to another inside one month.
 *
 * `exact: true` makes the mutation refuse a move larger than the source's available balance
 * instead of clamping it as the page's Move dialog does; both allocation rows and the audit
 * event are written in one transaction, so a move lands whole or not at all (spec D4).
 */
export async function moveBudgetMoneyTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"move_budget_money">;
  if (input.fromEnvelopeId === input.toEnvelopeId) {
    throw new AgentError(
      "validation",
      "fromEnvelopeId and toEnvelopeId must be different.",
    );
  }
  const monthKey = parseMonth(input.month);
  const before = await loadMonth(userId, monthKey);
  const from = requireExpenseEnvelope(before.data.categories, input.fromEnvelopeId);
  const to = requireExpenseEnvelope(before.data.categories, input.toEnvelopeId);

  const { applied } = await refusals(() =>
    performBudgetOperation(
      userId,
      {
        kind: "transfer",
        month: monthKey,
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        amountCents: input.amountCents,
      },
      { auditOrigin: AUDIT_ORIGIN, exact: true },
    ),
  );
  if (!applied) {
    throw new AgentError(
      "validation",
      "Nothing was moved; check the amount and envelopes.",
    );
  }

  const after = await loadMonth(userId, monthKey);
  return {
    moved: true as const,
    month: monthParam(monthKey),
    amountCents: input.amountCents,
    from: envelopeMonth(after.month, from),
    to: envelopeMonth(after.month, to),
    readyToAssignCents: after.month.readyToAssignCents,
  };
}

// — transactions ——————————————————————————————————————————————————————————————————

export async function setTransactionCategoryTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"set_transaction_category">;
  const ids = [...new Set(input.ids)];
  const { categories } = await structureOf(userId);
  const envelope =
    input.envelopeId === null
      ? null
      : categories.find((category) => category.id === input.envelopeId);
  if (envelope === undefined) {
    throw new AgentError("not_found", "That envelope does not exist.");
  }

  const owned = await db
    .select({ id: financeTransactions.id, isParent: financeTransactions.isParent })
    .from(financeTransactions)
    .where(
      and(eq(financeTransactions.userId, userId), inArray(financeTransactions.id, ids)),
    );
  const ownedById = new Map(owned.map((row) => [row.id, row]));

  const result = await refusals(() =>
    setTransactionBudgetCategories(userId, ids, envelope?.id ?? null, {
      auditOrigin: AUDIT_ORIGIN,
    }),
  );

  // The mutation leaves ids it could not load out of both lists; name them here.
  const reported = new Set([
    ...result.updated,
    ...result.skipped.map((entry) => entry.id),
  ]);
  const unreported = ids
    .filter((id) => !reported.has(id))
    .map((id) => ({
      id,
      reason: ownedById.get(id)?.isParent
        ? "Split parent: file its lines with split_transaction."
        : "Transaction not found.",
    }));

  return {
    envelope: envelope === null ? null : { id: envelope.id, name: envelope.name },
    updated: result.updated,
    skipped: [...result.skipped, ...unreported],
  };
}

async function splitState(
  userId: string,
  id: string,
): Promise<Output<"split_transaction">> {
  const [parent] = await db
    .select({
      id: financeTransactions.id,
      amount: financeTransactions.amount,
      isParent: financeTransactions.isParent,
    })
    .from(financeTransactions)
    .where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.id, id)))
    .limit(1);
  if (!parent) throw new AgentError("not_found", "Transaction not found.");
  const children = parent.isParent ? await listSplitChildren(userId, id) : [];
  return {
    id: parent.id,
    split: parent.isParent,
    amountCents: numericStringToCents(parent.amount) ?? 0,
    lines: children.map((child) => ({
      id: child.id,
      amountCents: child.amountCents,
      envelopeId: child.budgetCategoryId,
      envelopeName: child.budgetCategoryName,
      notes: child.notes,
    })),
  };
}

/**
 * Replace a row's split lines, or unsplit it with an empty list. The lines given are the
 * whole answer; existing lines are not merged with them, so a retry lands the same state.
 */
export async function splitTransactionTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as Input<"split_transaction">;
  const current = await splitState(userId, input.id);
  const children = input.splits.map((line) => ({
    amountCents: line.amountCents,
    budgetCategoryId: line.envelopeId,
    ...(line.notes === undefined ? {} : { notes: line.notes }),
  }));
  const options = { auditOrigin: AUDIT_ORIGIN };

  await refusals(async () => {
    if (children.length === 0) {
      await unsplitTransaction(userId, input.id, options);
    } else if (current.split) {
      await updateSplitChildren(userId, input.id, children, options);
    } else {
      await splitTransaction(userId, input.id, children, options);
    }
  });
  return splitState(userId, input.id);
}
