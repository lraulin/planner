/**
 * Reads for payees (`agent-os/specs/2026-08-23-0748-finance-payees/`).
 *
 * Every query scopes on `userId`, including the joins — a join that forgets it is the way one
 * user's row reaches another user's page (`agent-os/standards/development/security.md`).
 */

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financePayeeAliases,
  financePayees,
  financeTransactions,
} from "@/db/schema";
import { effectiveFlow } from "../analytics";
import { categoryAssignableIds } from "../categoryEligibility";
import { numericStringToCents } from "../money";
import {
  payeeEvidenceRows,
  type EvidenceCharge,
  type PayeeEvidenceRow,
} from "./evidence";
import type { AliasRow } from "./resolve";
import { mergeClaimDecision } from "./merge";
import type { AutoCategoryMode } from "./autoCategory";

/** Which envelope claims a payee, if any. At most one column, so at most one claim. */
export type PayeeClaim = { id: string; name: string };

export type PayeeRow = {
  id: string;
  name: string;
  notes: string;
  autoCategoryMode: AutoCategoryMode;
  defaultBudgetCategoryId: string | null;
  defaultCategoryName: string | null;
  /** Sorted, so two reads of an unchanged payee render identically. */
  aliases: string[];
  transactionCount: number;
  /** Signed sum in cents; spending is negative, as everywhere else in this module. */
  totalCents: number;
  claim: PayeeClaim | null;
};

export type PayeeMergePreview = {
  target: Pick<PayeeRow, "id" | "name" | "claim">;
  sources: Pick<PayeeRow, "id" | "name">[];
  movedAliases: string[];
  movedTransactions: number;
  movedTotalCents: number;
  resultingClaim: PayeeClaim | null;
  refusal: string | null;
};

/** Alias → payee for the whole user, the input to `payeeIndex`. */
export async function listAliasRows(userId: string): Promise<AliasRow[]> {
  return db
    .select({
      alias: financePayeeAliases.alias,
      payeeId: financePayeeAliases.payeeId,
    })
    .from(financePayeeAliases)
    .where(eq(financePayeeAliases.userId, userId));
}

/**
 * Every payee with its aliases, its activity, and the commitment that claims it.
 *
 * Three passes rather than one grouped join: aliases and transactions are both one-to-many, so
 * joining them together multiplies the rows and inflates the totals. That bug is invisible
 * until a payee has two aliases.
 */
export async function listPayees(userId: string): Promise<PayeeRow[]> {
  const payees = await db
    .select({
      id: financePayees.id,
      name: financePayees.name,
      notes: financePayees.notes,
      autoCategoryMode: financePayees.autoCategoryMode,
      defaultBudgetCategoryId: financePayees.defaultBudgetCategoryId,
      budgetCategoryId: financePayees.claimedBudgetCategoryId,
    })
    .from(financePayees)
    .where(eq(financePayees.userId, userId))
    .orderBy(asc(sql`lower(${financePayees.name})`));

  if (payees.length === 0) return [];

  const [aliases, activity, envelopes] = await Promise.all([
    db
      .select({
        payeeId: financePayeeAliases.payeeId,
        alias: financePayeeAliases.alias,
      })
      .from(financePayeeAliases)
      .where(eq(financePayeeAliases.userId, userId))
      .orderBy(asc(financePayeeAliases.alias)),
    db
      .select({
        payeeId: financeTransactions.payeeId,
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          sql`${financeTransactions.payeeId} is not null`,
        ),
      )
      .groupBy(financeTransactions.payeeId),
    db
      .select({ id: financeBudgetCategories.id, name: financeBudgetCategories.name })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
  ]);

  const aliasesByPayee = new Map<string, string[]>();
  for (const row of aliases) {
    const list = aliasesByPayee.get(row.payeeId);
    if (list) list.push(row.alias);
    else aliasesByPayee.set(row.payeeId, [row.alias]);
  }

  const activityByPayee = new Map(
    activity.map((row) => [
      row.payeeId as string,
      { count: row.count, cents: numericStringToCents(row.amount) ?? 0 },
    ]),
  );
  const envelopeNames = new Map(envelopes.map((row) => [row.id, row.name]));

  return payees.map((payee) => {
    const seen = activityByPayee.get(payee.id);
    const claim: PayeeClaim | null = payee.budgetCategoryId
      ? {
          id: payee.budgetCategoryId,
          name: envelopeNames.get(payee.budgetCategoryId) ?? "",
        }
      : null;

    return {
      id: payee.id,
      name: payee.name,
      notes: payee.notes,
      autoCategoryMode: payee.autoCategoryMode as AutoCategoryMode,
      defaultBudgetCategoryId: payee.defaultBudgetCategoryId,
      defaultCategoryName: payee.defaultBudgetCategoryId
        ? (envelopeNames.get(payee.defaultBudgetCategoryId) ?? null)
        : null,
      aliases: aliasesByPayee.get(payee.id) ?? [],
      transactionCount: seen?.count ?? 0,
      totalCents: seen?.cents ?? 0,
      claim,
    };
  });
}

/** One payee, or null when it is not this user's. Null is the answer for both cases. */
export async function getPayee(
  userId: string,
  payeeId: string,
): Promise<PayeeRow | null> {
  const rows = await listPayees(userId);
  return rows.find((row) => row.id === payeeId) ?? null;
}

/** The payees an envelope claims, for the envelope editors. */
export async function payeesForCommitment(
  userId: string,
  claim: { id: string },
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: financePayees.id, name: financePayees.name })
    .from(financePayees)
    .where(
      and(
        eq(financePayees.userId, userId),
        eq(financePayees.claimedBudgetCategoryId, claim.id),
      ),
    )
    .orderBy(asc(sql`lower(${financePayees.name})`));
}

/** Aliases belonging to the given payees. Used by merge to move them. */
export async function aliasesOf(
  userId: string,
  payeeIds: readonly string[],
): Promise<string[]> {
  if (payeeIds.length === 0) return [];
  const rows = await db
    .select({ alias: financePayeeAliases.alias })
    .from(financePayeeAliases)
    .where(
      and(
        eq(financePayeeAliases.userId, userId),
        inArray(financePayeeAliases.payeeId, [...payeeIds]),
      ),
    );
  return rows.map((row) => row.alias);
}

/** Everything a person should see before selected payees are consolidated. */
export async function previewPayeeMerge(
  userId: string,
  targetId: string,
  sourceIds: readonly string[],
): Promise<PayeeMergePreview> {
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (sources.length === 0) throw new Error("Select at least two payees to merge.");

  const rows = await listPayees(userId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const target = byId.get(targetId);
  const sourceRows = sources.map((id) => byId.get(id));
  if (!target || sourceRows.some((row) => row === undefined)) {
    throw new Error("That payee does not exist.");
  }
  const ownedSources = sourceRows.filter((row): row is PayeeRow => row !== undefined);
  const claim = mergeClaimDecision([target, ...ownedSources]);

  return {
    target: { id: target.id, name: target.name, claim: target.claim },
    sources: ownedSources.map((row) => ({ id: row.id, name: row.name })),
    movedAliases: ownedSources.flatMap((row) => row.aliases).sort(),
    movedTransactions: ownedSources.reduce(
      (total, row) => total + row.transactionCount,
      0,
    ),
    movedTotalCents: ownedSources.reduce((total, row) => total + row.totalCents, 0),
    resultingClaim: claim.claim,
    refusal: claim.refusal,
  };
}

/**
 * Every payee that files into one envelope, with the evidence behind it.
 *
 * Answers the Files-here section (`agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/`
 * D3): who routes here, how much of it is already filed, how much is still waiting, and
 * whether the payee's default is in force or held. Shaping is `./evidence.ts`; this function
 * only gathers, and it scopes every join on `userId`.
 *
 * A payee counts as filing here when charges of its own already sit in the envelope **or** when
 * its claim or default points at the envelope — a payee configured but not yet filed is
 * exactly the one a person needs to see.
 */
export async function payeeEvidenceForCategory(
  userId: string,
  categoryId: string,
): Promise<PayeeEvidenceRow[]> {
  const [configured, filed] = await Promise.all([
    db
      .select({ id: financePayees.id })
      .from(financePayees)
      .where(
        and(
          eq(financePayees.userId, userId),
          or(
            eq(financePayees.claimedBudgetCategoryId, categoryId),
            eq(financePayees.defaultBudgetCategoryId, categoryId),
          ),
        ),
      ),
    db
      .selectDistinct({ id: financeTransactions.payeeId })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.budgetCategoryId, categoryId),
          sql`${financeTransactions.payeeId} is not null`,
        ),
      ),
  ]);

  const payeeIds = [
    ...new Set([
      ...configured.map((row) => row.id),
      ...filed.flatMap((row) => (row.id ? [row.id] : [])),
    ]),
  ];
  if (payeeIds.length === 0) return [];

  const [payees, charges, envelopes] = await Promise.all([
    db
      .select({
        id: financePayees.id,
        name: financePayees.name,
        claimedBudgetCategoryId: financePayees.claimedBudgetCategoryId,
        defaultBudgetCategoryId: financePayees.defaultBudgetCategoryId,
        autoCategoryMode: financePayees.autoCategoryMode,
      })
      .from(financePayees)
      .where(
        and(eq(financePayees.userId, userId), inArray(financePayees.id, payeeIds)),
      ),
    db
      .select({
        id: financeTransactions.id,
        payeeId: financeTransactions.payeeId,
        categoryId: financeTransactions.budgetCategoryId,
        accountId: financeTransactions.accountId,
        accountOffBudget: financeAccounts.offBudget,
        transactionDate: financeTransactions.transactionDate,
        transferGroupId: financeTransactions.transferGroupId,
        derivedFlow: financeTransactions.derivedFlow,
        flowOverride: financeTransactions.flowOverride,
        amount: financeTransactions.amount,
      })
      .from(financeTransactions)
      .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeAccounts.userId, userId),
          inArray(financeTransactions.payeeId, payeeIds),
        ),
      ),
    db
      .select({ id: financeBudgetCategories.id, name: financeBudgetCategories.name })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
  ]);

  const assignable = categoryAssignableIds(
    charges.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      transferGroupId: row.transferGroupId,
      effectiveFlow: effectiveFlow({
        derivedFlow: row.derivedFlow,
        flowOverride: row.flowOverride,
        amountCents: numericStringToCents(row.amount) ?? 0,
      }),
    })),
    new Set(charges.flatMap((row) => (row.accountOffBudget ? [row.accountId] : []))),
  );

  const chargesByPayee = new Map<string, EvidenceCharge[]>();
  for (const row of charges) {
    if (!row.payeeId) continue;
    const charge: EvidenceCharge = {
      id: row.id,
      categoryId: row.categoryId,
      eligible: assignable.has(row.id),
    };
    const list = chargesByPayee.get(row.payeeId);
    if (list) list.push(charge);
    else chargesByPayee.set(row.payeeId, [charge]);
  }

  const envelopeNames = new Map(envelopes.map((row) => [row.id, row.name]));

  return payeeEvidenceRows(
    categoryId,
    payees.map((payee) => ({
      id: payee.id,
      name: payee.name,
      claimedBudgetCategoryId: payee.claimedBudgetCategoryId,
      defaultBudgetCategoryId: payee.defaultBudgetCategoryId,
      autoCategoryMode: payee.autoCategoryMode as AutoCategoryMode,
      charges: chargesByPayee.get(payee.id) ?? [],
    })),
    (id) => envelopeNames.get(id) ?? null,
  );
}
