/**
 * User-facing alias edits, including the derived transaction identity they promise to change.
 *
 * `finance_transactions.payee_id` is intentionally recomputable from aliases. Changing the
 * source without recomputing that pointer leaves the Payees page and every payee-based reader
 * disagreeing until the next import happens to run a classification pass.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { financePayeeAliases, financePayees, financeTransactions } from "@/db/schema";
import { reclassifyInsideTransaction } from "../bankSnapshotApply";
import { normalizeMerchant } from "../classify/merchant";
import type { FinanceExecutor } from "../dbExecutor";
import { reclassifyTransactions } from "../mutations";
import { numericStringToCents } from "../money";
import { applyPayeeAutoCategories } from "./claims";
import { addAlias, removeAlias } from "./mutations";
import { aliasFor, isOpaquePaypalDescription } from "./resolve";

export async function addPayeeAlias(
  userId: string,
  payeeId: string,
  alias: string,
): Promise<void> {
  await addAlias(userId, payeeId, alias);
  await reclassifyTransactions(userId);
  // Newly recognized rows may now be eligible for this payee's claim or default. Existing
  // Categories still win because this path fills only uncategorized rows.
  await applyPayeeAutoCategories(userId, { payeeIds: [payeeId] });
}

/**
 * Remove an alias and recompute who its rows belong to.
 *
 * The rows it covered lose this payee. The reclassify mints a payee of their own for the
 * merchant, as it would for a merchant seen for the first time.
 */
export async function removePayeeAlias(
  userId: string,
  payeeId: string,
  alias: string,
): Promise<void> {
  await removeAlias(userId, payeeId, alias);
  await reclassifyTransactions(userId);
}

export type PayeeAliasEdit = {
  add: readonly string[];
  addFromTransactionIds: readonly string[];
  remove: readonly string[];
  onConflict: "refuse" | "move";
  dryRun: boolean;
};

type PayeeRef = { payeeId: string; name: string };

export type PayeeAliasEditResult = {
  payee: { id: string; name: string; aliases: string[] };
  added: { input: string; alias: string; movedFrom: PayeeRef | null }[];
  removed: { alias: string; reassignedTo: PayeeRef | null }[];
  unchanged: { input: string; alias: string; reason: "already_on_payee" }[];
  relinkedTransactions: number;
  categorizedTransactions: number;
  sample: {
    id: string;
    transactionDate: string;
    description: string;
    amountCents: number;
  }[];
  dryRun: boolean;
};

/** Why `updatePayeeAliases` refused, in the agent error vocabulary. */
export class PayeeAliasEditRefused extends Error {
  constructor(
    readonly code: "validation" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PayeeAliasEditRefused";
  }
}

class RollbackDryRun extends Error {
  constructor(readonly result: PayeeAliasEditResult) {
    super("dry run");
  }
}

const SAMPLE_SIZE = 10;

/**
 * Add, move, and remove a payee's aliases in one step, and recompute `payee_id`.
 *
 * All of it is one transaction up to the recompute, so a refusal anywhere changes nothing.
 * After commit the standard reclassify mints payees for merchants a removal orphaned, and
 * the payee's claim or default files the rows it newly holds — uncategorized rows only, so
 * a category someone chose always wins.
 *
 * A move never takes an alias off a payee an envelope claims: that would take charges off
 * a commitment without anyone seeing it, which is why `addAlias` refuses moves at all.
 */
export async function updatePayeeAliases(
  userId: string,
  payeeId: string,
  edit: PayeeAliasEdit,
): Promise<PayeeAliasEditResult> {
  let result: PayeeAliasEditResult;
  try {
    result = await db.transaction(async (tx) => {
      const [payee] = await tx
        .select({ id: financePayees.id, name: financePayees.name })
        .from(financePayees)
        .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
      if (!payee) throw new PayeeAliasEditRefused("not_found", "Payee not found.");

      const wanted: { input: string; alias: string }[] = [];
      for (const input of edit.add) {
        const alias = normalizeMerchant(input);
        if (alias === "") {
          throw new PayeeAliasEditRefused(
            "validation",
            `"${input}" does not contain a merchant name. Pass the merchant as it appears on a transaction.`,
          );
        }
        wanted.push({ input, alias });
      }
      if (edit.addFromTransactionIds.length > 0) {
        const ids = [...new Set(edit.addFromTransactionIds)];
        const rows = await tx
          .select({
            id: financeTransactions.id,
            description: financeTransactions.description,
          })
          .from(financeTransactions)
          .where(
            and(
              eq(financeTransactions.userId, userId),
              inArray(financeTransactions.id, ids),
            ),
          );
        const byId = new Map(rows.map((row) => [row.id, row]));
        const missing = ids.filter((id) => !byId.has(id));
        if (missing.length > 0) {
          throw new PayeeAliasEditRefused(
            "not_found",
            `Transaction not found: ${missing.join(", ")}.`,
          );
        }
        for (const id of ids) {
          const description = byId.get(id)?.description ?? "";
          // A bare PayPal line normalizes to PAYPAL; as an alias it would claim every
          // PayPal charge for this payee.
          if (isOpaquePaypalDescription(description)) {
            throw new PayeeAliasEditRefused(
              "validation",
              `Transaction ${id} is a PayPal line that does not name the merchant. Pass the merchant in add instead.`,
            );
          }
          const alias = aliasFor(description);
          if (alias === "") {
            throw new PayeeAliasEditRefused(
              "validation",
              `Transaction ${id} ("${description}") does not contain a merchant name.`,
            );
          }
          wanted.push({ input: id, alias });
        }
      }

      const removing: string[] = [];
      for (const input of edit.remove) {
        const alias = normalizeMerchant(input);
        if (alias === "") {
          throw new PayeeAliasEditRefused(
            "validation",
            `"${input}" does not contain a merchant name.`,
          );
        }
        if (!removing.includes(alias)) removing.push(alias);
      }
      const both = wanted.filter((entry) => removing.includes(entry.alias));
      if (both.length > 0) {
        throw new PayeeAliasEditRefused(
          "validation",
          `"${both[0].alias}" is both added and removed. Pass it in one list.`,
        );
      }

      const touched = [
        ...new Set([...wanted.map((entry) => entry.alias), ...removing]),
      ];
      const holders =
        touched.length === 0
          ? []
          : await tx
              .select({
                aliasId: financePayeeAliases.id,
                alias: financePayeeAliases.alias,
                payeeId: financePayees.id,
                name: financePayees.name,
                claimedBudgetCategoryId: financePayees.claimedBudgetCategoryId,
              })
              .from(financePayeeAliases)
              .innerJoin(
                financePayees,
                eq(financePayees.id, financePayeeAliases.payeeId),
              )
              .where(
                and(
                  eq(financePayeeAliases.userId, userId),
                  eq(financePayees.userId, userId),
                  inArray(financePayeeAliases.alias, touched),
                ),
              );
      const holderOf = new Map(holders.map((row) => [row.alias, row]));

      for (const alias of removing) {
        if (holderOf.get(alias)?.payeeId !== payee.id) {
          throw new PayeeAliasEditRefused(
            "not_found",
            `"${alias}" is not an alias of ${payee.name}. list_payees shows its aliases.`,
          );
        }
      }

      const added: PayeeAliasEditResult["added"] = [];
      const unchanged: PayeeAliasEditResult["unchanged"] = [];
      const seen = new Set<string>();
      for (const entry of wanted) {
        if (seen.has(entry.alias)) continue;
        seen.add(entry.alias);
        const holder = holderOf.get(entry.alias);
        if (holder?.payeeId === payee.id) {
          unchanged.push({ ...entry, reason: "already_on_payee" });
          continue;
        }
        if (holder && edit.onConflict === "refuse") {
          throw new PayeeAliasEditRefused(
            "conflict",
            `"${entry.alias}" already belongs to payee ${holder.name} (${holder.payeeId}). Pass onConflict "move" to move it to ${payee.name}.`,
          );
        }
        if (holder?.claimedBudgetCategoryId) {
          throw new PayeeAliasEditRefused(
            "conflict",
            `"${entry.alias}" belongs to payee ${holder.name}, which an envelope claims. Moving it would take those charges off the envelope; change it on the Payees page.`,
          );
        }
        added.push({
          ...entry,
          movedFrom: holder ? { payeeId: holder.payeeId, name: holder.name } : null,
        });
      }

      if (added.length === 0 && removing.length === 0) {
        return {
          payee: { ...payee, aliases: await aliasesOf(tx, userId, payee.id) },
          added,
          removed: [],
          unchanged,
          relinkedTransactions: 0,
          categorizedTransactions: 0,
          sample: [],
          dryRun: edit.dryRun,
        };
      }

      const before = await payeePointers(tx, userId);
      if (removing.length > 0) {
        await tx
          .delete(financePayeeAliases)
          .where(
            and(
              eq(financePayeeAliases.userId, userId),
              eq(financePayeeAliases.payeeId, payee.id),
              inArray(financePayeeAliases.alias, removing),
            ),
          );
      }
      const moved = added.flatMap((entry) => {
        const holder = holderOf.get(entry.alias);
        return entry.movedFrom && holder ? [holder.aliasId] : [];
      });
      if (moved.length > 0) {
        await tx
          .update(financePayeeAliases)
          .set({ payeeId: payee.id })
          .where(
            and(
              eq(financePayeeAliases.userId, userId),
              inArray(financePayeeAliases.id, moved),
            ),
          );
      }
      const inserted = added.filter((entry) => entry.movedFrom === null);
      if (inserted.length > 0) {
        await tx.insert(financePayeeAliases).values(
          inserted.map((entry) => ({
            userId,
            payeeId: payee.id,
            alias: entry.alias,
          })),
        );
      }
      await reclassifyInsideTransaction(tx, userId);
      const after = await payeePointers(tx, userId);
      const relinked = [...after].filter(([id, now]) => before.get(id) !== now);
      const nowHere = relinked.filter(([, now]) => now === payee.id).map(([id]) => id);
      const sample =
        nowHere.length === 0
          ? []
          : await tx
              .select({
                id: financeTransactions.id,
                transactionDate: financeTransactions.transactionDate,
                description: financeTransactions.description,
                amount: financeTransactions.amount,
              })
              .from(financeTransactions)
              .where(
                and(
                  eq(financeTransactions.userId, userId),
                  inArray(financeTransactions.id, nowHere),
                ),
              )
              .orderBy(
                desc(financeTransactions.transactionDate),
                financeTransactions.id,
              )
              .limit(SAMPLE_SIZE);

      const outcome: PayeeAliasEditResult = {
        payee: { ...payee, aliases: await aliasesOf(tx, userId, payee.id) },
        added,
        removed: removing.map((alias) => ({ alias, reassignedTo: null })),
        unchanged,
        relinkedTransactions: relinked.length,
        categorizedTransactions: 0,
        sample: sample.map((row) => ({
          id: row.id,
          transactionDate: row.transactionDate,
          description: row.description,
          amountCents: numericStringToCents(row.amount) ?? 0,
        })),
        dryRun: edit.dryRun,
      };
      if (edit.dryRun) throw new RollbackDryRun(outcome);
      return outcome;
    });
  } catch (error) {
    if (error instanceof RollbackDryRun) return error.result;
    throw error;
  }

  if (result.added.length === 0 && result.removed.length === 0) return result;

  // Outside the transaction on purpose: this is the same pass the Payees page runs, and it
  // mints payees (ensurePayees) for merchants a removal left with no payee.
  await reclassifyTransactions(userId, { auditOrigin: "Agent" });
  const categorized = await applyPayeeAutoCategories(userId, {
    payeeIds: [payeeId],
    auditOrigin: "Agent",
  });
  const removedAliases = result.removed.map((entry) => entry.alias);
  const newHolders =
    removedAliases.length === 0
      ? []
      : await db
          .select({
            alias: financePayeeAliases.alias,
            payeeId: financePayees.id,
            name: financePayees.name,
          })
          .from(financePayeeAliases)
          .innerJoin(financePayees, eq(financePayees.id, financePayeeAliases.payeeId))
          .where(
            and(
              eq(financePayeeAliases.userId, userId),
              eq(financePayees.userId, userId),
              inArray(financePayeeAliases.alias, removedAliases),
            ),
          );
  const holderOf = new Map(newHolders.map((row) => [row.alias, row]));
  return {
    ...result,
    removed: result.removed.map((entry) => {
      const holder = holderOf.get(entry.alias);
      return {
        alias: entry.alias,
        reassignedTo: holder ? { payeeId: holder.payeeId, name: holder.name } : null,
      };
    }),
    categorizedTransactions: categorized,
  };
}

async function aliasesOf(
  executor: FinanceExecutor,
  userId: string,
  payeeId: string,
): Promise<string[]> {
  const rows = await executor
    .select({ alias: financePayeeAliases.alias })
    .from(financePayeeAliases)
    .where(
      and(
        eq(financePayeeAliases.userId, userId),
        eq(financePayeeAliases.payeeId, payeeId),
      ),
    );
  return rows.map((row) => row.alias).sort((left, right) => left.localeCompare(right));
}

async function payeePointers(
  executor: FinanceExecutor,
  userId: string,
): Promise<Map<string, string | null>> {
  const rows = await executor
    .select({ id: financeTransactions.id, payeeId: financeTransactions.payeeId })
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));
  return new Map(rows.map((row) => [row.id, row.payeeId]));
}
