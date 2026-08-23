/**
 * Building the payee set for a history that predates payees, and pointing every row at one.
 *
 * Follows `seedBudget`: a pure planner (`./seed.ts`) with tests, invoked once behind an
 * action, **idempotent** — running it twice writes nothing the second time. That is what makes
 * it safe to re-run after every import instead of a one-shot migration nobody dares touch.
 *
 * Originally additive so the payee cutover could prove that no number moved. Payees are now
 * authoritative; this remains idempotent import maintenance for newly encountered merchants.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financePayeeAliases,
  financePayees,
  financePaymentResolutions,
  financeRules,
  financeTransactions,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/constraints";
import { numericStringToCents } from "../money";
import { matchPaypalResolutions, type PaypalResolution } from "../paypalMatch";
import { aliasFor, payeeIndex } from "./resolve";
import { planSeed, type ExistingPayee, type SeedSource } from "./seed";
import { compileRules } from "../rules/compile";
import { applyRules } from "../rules/match";

export type SeedPayeesSummary = {
  createdPayees: number;
  addedAliases: number;
  /** Rows whose `payee_id` changed. Zero on a second run is the idempotence claim. */
  assigned: number;
  /**
   * Rows still without a payee — their description names no merchant at all.
   *
   * Reported rather than swallowed: it is the number a person can sanity-check against the
   * register, and a sudden jump means the normalizer changed under us.
   */
  unresolved: number;
  /** Alias groups split across payees, which the planner refuses to guess at. */
  conflicts: { name: string; aliases: string[]; heldBy: string[] }[];
};

/** Every row's identifying strings, with a PayPal counterparty where one names the merchant. */
async function loadSources(userId: string): Promise<{
  sources: SeedSource[];
  byRowId: Map<string, { description: string; counterparty: string | null }>;
}> {
  const [rows, storedResolutions] = await Promise.all([
    db
      .select({
        id: financeTransactions.id,
        transactionDate: financeTransactions.transactionDate,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId)),
    db
      .select({
        externalId: financePaymentResolutions.externalId,
        transactionDate: financePaymentResolutions.transactionDate,
        amount: financePaymentResolutions.amount,
        counterparty: financePaymentResolutions.counterparty,
        direction: financePaymentResolutions.direction,
      })
      .from(financePaymentResolutions)
      .where(eq(financePaymentResolutions.userId, userId)),
  ]);

  const resolutions: PaypalResolution[] = storedResolutions.flatMap((row) => {
    const amountCents = numericStringToCents(row.amount);
    if (amountCents === null) return [];
    if (row.direction !== "in" && row.direction !== "out") return [];
    return [
      {
        externalId: row.externalId,
        date: row.transactionDate,
        amountCents,
        counterparty: row.counterparty,
        direction: row.direction,
      },
    ];
  });

  // The same pairing `classify/reclassify.ts` uses, so the payee a row gets and the category
  // it gets are decided from one story about who was paid.
  const named = matchPaypalResolutions(
    rows.map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      amountCents: numericStringToCents(row.amount) ?? 0,
      description: row.description,
    })),
    resolutions,
  ).byRowId;

  const byRowId = new Map<
    string,
    { description: string; counterparty: string | null }
  >();
  for (const row of rows) {
    byRowId.set(row.id, {
      description: row.description,
      counterparty: named.get(row.id)?.counterparty ?? null,
    });
  }

  return {
    sources: rows.map((row) => ({
      description: row.description,
      counterparty: named.get(row.id)?.counterparty ?? null,
    })),
    byRowId,
  };
}

async function loadExisting(userId: string): Promise<ExistingPayee[]> {
  const [payees, aliases] = await Promise.all([
    db
      .select({ id: financePayees.id, name: financePayees.name })
      .from(financePayees)
      .where(eq(financePayees.userId, userId)),
    db
      .select({
        payeeId: financePayeeAliases.payeeId,
        alias: financePayeeAliases.alias,
      })
      .from(financePayeeAliases)
      .where(eq(financePayeeAliases.userId, userId)),
  ]);

  const byPayee = new Map<string, string[]>();
  for (const row of aliases) {
    const list = byPayee.get(row.payeeId);
    if (list) list.push(row.alias);
    else byPayee.set(row.payeeId, [row.alias]);
  }

  return payees.map((payee) => ({
    id: payee.id,
    name: payee.name,
    aliases: byPayee.get(payee.id) ?? [],
  }));
}

/** Rows whose payee actually changes, so a second run issues no statements at all. */
const ASSIGN_CHUNK = 500;

async function assignPayees(
  userId: string,
  byRowId: Map<string, { description: string; counterparty: string | null }>,
): Promise<{ assigned: number; unresolved: number }> {
  const index = payeeIndex(
    await db
      .select({
        alias: financePayeeAliases.alias,
        payeeId: financePayeeAliases.payeeId,
      })
      .from(financePayeeAliases)
      .where(eq(financePayeeAliases.userId, userId)),
  );

  const current = await db
    .select({ id: financeTransactions.id, payeeId: financeTransactions.payeeId })
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));

  const wanted = new Map<string, string[]>();
  let unresolved = 0;

  for (const row of current) {
    const source = byRowId.get(row.id);
    if (!source) continue;
    const alias = aliasFor(source.description, source.counterparty);
    const payee = alias === "" ? null : (index.get(alias) ?? null);

    if (payee === null) {
      unresolved += 1;
      continue;
    }
    if (row.payeeId === payee) continue;

    const list = wanted.get(payee);
    if (list) list.push(row.id);
    else wanted.set(payee, [row.id]);
  }

  let assigned = 0;
  for (const [payeeId, ids] of wanted) {
    for (let start = 0; start < ids.length; start += ASSIGN_CHUNK) {
      const chunk = ids.slice(start, start + ASSIGN_CHUNK);
      await db
        .update(financeTransactions)
        .set({ payeeId, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, chunk),
          ),
        );
      assigned += chunk.length;
    }
  }

  return { assigned, unresolved };
}

export type EnsurePayeesSummary = Pick<
  SeedPayeesSummary,
  "createdPayees" | "addedAliases" | "conflicts"
>;

/** Apply the pure seed plan for a source set, without assigning any transaction yet. */
async function applyPayeePlan(
  userId: string,
  sources: readonly SeedSource[],
  existing: readonly ExistingPayee[],
  nameHint: (alias: string) => string | null,
): Promise<EnsurePayeesSummary> {
  const plan = planSeed(sources, existing, nameHint);
  let createdPayees = 0;
  let addedAliases = 0;

  for (const entry of plan.create) {
    try {
      await db.transaction(async (tx) => {
        const [payee] = await tx
          .insert(financePayees)
          .values({ userId, name: entry.name })
          .returning({ id: financePayees.id });
        await tx
          .insert(financePayeeAliases)
          .values(entry.aliases.map((alias) => ({ userId, payeeId: payee.id, alias })));
      });
      createdPayees += 1;
      addedAliases += entry.aliases.length;
    } catch (error) {
      // Another writer claimed the name or one of the aliases between planning and inserting.
      // Skipping is right: the planner's next run sees the winner and attaches to it, and
      // failing the whole backfill over one merchant would be worse than a rerun.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  for (const entry of plan.extend) {
    for (const alias of entry.aliases) {
      try {
        await db
          .insert(financePayeeAliases)
          .values({ userId, payeeId: entry.payeeId, alias });
        addedAliases += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }

  return { createdPayees, addedAliases, conflicts: plan.conflicts };
}

async function loadNameHint(userId: string): Promise<(alias: string) => string | null> {
  const stored = await db
    .select({
      id: financeRules.id,
      name: financeRules.name,
      conditions: financeRules.conditions,
      actions: financeRules.actions,
      enabled: financeRules.enabled,
      sortKey: financeRules.sortKey,
    })
    .from(financeRules)
    .where(eq(financeRules.userId, userId));
  const rules = compileRules(stored).rules;
  return (alias) =>
    applyRules(rules, {
      merchant: alias,
      description: alias,
      payeeId: null,
      accountId: "00000000-0000-4000-8000-000000000000",
      amountCents: 0,
      transactionDate: "1970-01-01",
    }).payeeName;
}

/**
 * Make sure every merchant in this user's history has a payee and an alias.
 *
 * This is the write-time half shared by the initial page action and the ordinary
 * reclassification pass. It deliberately does not assign transactions: `planReclassify`
 * resolves the resulting alias index and writes `payee_id` beside the other recomputable
 * columns in one plan.
 */
export async function ensurePayees(userId: string): Promise<EnsurePayeesSummary> {
  const [{ sources }, existing, nameHint] = await Promise.all([
    loadSources(userId),
    loadExisting(userId),
    loadNameHint(userId),
  ]);
  return applyPayeePlan(userId, sources, existing, nameHint);
}

/**
 * Create the payees this history implies, then point every row at one.
 *
 * Safe to re-run: the planner only ever proposes aliases nobody holds, and the assignment pass
 * writes only rows whose payee would change. A second call therefore reports zeroes.
 */
export async function seedPayees(userId: string): Promise<SeedPayeesSummary> {
  const [{ sources, byRowId }, existing, nameHint] = await Promise.all([
    loadSources(userId),
    loadExisting(userId),
    loadNameHint(userId),
  ]);
  const ensured = await applyPayeePlan(userId, sources, existing, nameHint);

  const { assigned, unresolved } = await assignPayees(userId, byRowId);

  return {
    createdPayees: ensured.createdPayees,
    addedAliases: ensured.addedAliases,
    assigned,
    unresolved,
    conflicts: ensured.conflicts,
  };
}

/** How many rows still have no payee — the figure the page shows beside the button. */
export async function unresolvedPayeeCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        sql`${financeTransactions.payeeId} is null`,
      ),
    );
  return row?.count ?? 0;
}
