/**
 * Writes for payees (`agent-os/specs/2026-08-23-0748-finance-payees/`).
 *
 * Every mutation takes `userId` first, scopes on it, and proves the row was theirs before
 * touching it (`agent-os/standards/development/security.md`).
 *
 * **One guarantee lives in the database, not here**, and that is the point of the whole shape:
 * `(user_id, alias)` is unique, so one merchant string cannot reach two payees. `budget_category_id`
 * is a single nullable column, so "a payee is claimed by at most one envelope" needs no CHECK —
 * it is what a single column already means. The functions below translate the database's
 * refusals into sentences a person can act on — they do not re-implement them, because a check
 * written here would only hold for callers that remembered to come through here.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetCategories,
  financePayeeAliases,
  financePayees,
  financeRules,
  financeTransactions,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/constraints";
import { normalizeMerchant } from "../classify/merchant";
import { suggestCommitmentName } from "../commitments";
import { aliasFor } from "./resolve";
import { mergeClaimDecision } from "./merge";
import { rewriteMergedPayeeIds, storedConditionPayeeIds } from "./references";
import { applyClaimedPayees } from "./claims";

async function requirePayee(userId: string, payeeId: string) {
  const [row] = await db
    .select({
      id: financePayees.id,
      name: financePayees.name,
      budgetCategoryId: financePayees.budgetCategoryId,
    })
    .from(financePayees)
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
  if (!row) throw new Error("That payee does not exist.");
  return row;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("A payee needs a name.");
  return trimmed;
}

/**
 * An alias is whatever `normalizeMerchant` would produce, never a raw bank line.
 *
 * Normalizing on the way in is what keeps the stored key and the resolver's lookup key the
 * same string. An alias typed as it appears on the statement — `WM SUPERCENTER #1981` — would
 * be stored verbatim and then never match anything, silently.
 */
function cleanAlias(alias: string): string {
  const normalized = normalizeMerchant(alias);
  if (normalized === "") {
    throw new Error("That does not contain a merchant name.");
  }
  return normalized;
}

export async function createPayee(
  userId: string,
  input: { name: string; aliases?: readonly string[] },
): Promise<string> {
  const name = cleanName(input.name);
  const aliases = [...new Set((input.aliases ?? []).map(cleanAlias))];

  return db.transaction(async (tx) => {
    let payeeId: string;
    try {
      const [row] = await tx
        .insert(financePayees)
        .values({ userId, name })
        .returning({ id: financePayees.id });
      payeeId = row.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(`A payee called "${name}" already exists.`);
      }
      throw error;
    }

    if (aliases.length > 0) {
      try {
        await tx
          .insert(financePayeeAliases)
          .values(aliases.map((alias) => ({ userId, payeeId, alias })));
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new Error("Another payee already answers to one of those names.");
        }
        throw error;
      }
    }

    return payeeId;
  });
}

/**
 * Point this transaction at a payee, minting one from the merchant if needed.
 *
 * Track as bill / New bill… used to refuse "Reclassify first" when `payee_id` was
 * null even though the Payee column already showed the merchant. Creating a bill
 * from a row is the thing that should attach the payee, not a prior full-ledger pass.
 */
export async function ensurePayeeForTransaction(
  userId: string,
  transactionId: string,
): Promise<string> {
  const [row] = await db
    .select({
      id: financeTransactions.id,
      description: financeTransactions.description,
      payeeId: financeTransactions.payeeId,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That transaction does not exist.");
  if (row.payeeId) return row.payeeId;

  const alias = aliasFor(row.description);
  if (alias === "") throw new Error("This row has no merchant to match.");

  const [existingAlias] = await db
    .select({ payeeId: financePayeeAliases.payeeId })
    .from(financePayeeAliases)
    .where(
      and(eq(financePayeeAliases.userId, userId), eq(financePayeeAliases.alias, alias)),
    )
    .limit(1);

  let payeeId = existingAlias?.payeeId ?? null;
  if (payeeId === null) {
    const name = suggestCommitmentName(alias);
    const [named] = await db
      .select({ id: financePayees.id })
      .from(financePayees)
      .where(
        and(
          eq(financePayees.userId, userId),
          sql`lower(${financePayees.name}) = ${name.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (named) {
      payeeId = named.id;
      try {
        await db.insert(financePayeeAliases).values({ userId, payeeId, alias });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    } else {
      payeeId = await createPayee(userId, { name, aliases: [alias] });
    }
  }

  await db
    .update(financeTransactions)
    .set({ payeeId, updatedAt: new Date() })
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    );
  return payeeId;
}

/**
 * The payee that should own a bill declared from this row: this merchant only.
 *
 * Seeded `/^CVS/` named ExtraCare's payee "CVS" and put pharmacy charges on the same
 * identity. Tracking ExtraCare as a bill must not claim 200 grocery runs. Multiple
 * aliases alone do not make a payee shared, though: a payee already named for this
 * merchant can own alternate statement spellings without becoming two identities.
 */
export async function isolatePayeeForBill(
  userId: string,
  transactionId: string,
): Promise<string> {
  const payeeId = await ensurePayeeForTransaction(userId, transactionId);
  const [row] = await db
    .select({ description: financeTransactions.description })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That transaction does not exist.");
  const alias = aliasFor(row.description);
  if (alias === "") return payeeId;

  const aliases = await db
    .select({ alias: financePayeeAliases.alias })
    .from(financePayeeAliases)
    .where(
      and(
        eq(financePayeeAliases.userId, userId),
        eq(financePayeeAliases.payeeId, payeeId),
      ),
    );

  const name = suggestCommitmentName(alias);
  const current = await requirePayee(userId, payeeId);
  if (aliases.length <= 1 || current.name.toLowerCase() === name.toLowerCase()) {
    return payeeId;
  }

  const [named] = await db
    .select({ id: financePayees.id })
    .from(financePayees)
    .where(
      and(
        eq(financePayees.userId, userId),
        sql`lower(${financePayees.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);
  const dedicated = named?.id ?? (await createPayee(userId, { name, aliases: [] }));
  await db.transaction(async (tx) => {
    await tx
      .delete(financePayeeAliases)
      .where(
        and(
          eq(financePayeeAliases.userId, userId),
          eq(financePayeeAliases.payeeId, payeeId),
          eq(financePayeeAliases.alias, alias),
        ),
      );
    await tx.insert(financePayeeAliases).values({
      userId,
      payeeId: dedicated,
      alias,
    });
  });

  const siblings = await db
    .select({
      id: financeTransactions.id,
      description: financeTransactions.description,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.payeeId, payeeId),
      ),
    );
  const moving = siblings
    .filter((entry) => aliasFor(entry.description) === alias)
    .map((entry) => entry.id);
  if (moving.length > 0) {
    await db
      .update(financeTransactions)
      .set({ payeeId: dedicated, updatedAt: new Date() })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          inArray(financeTransactions.id, moving),
        ),
      );
  }
  return dedicated;
}

/**
 * Rename a payee. Touches no transaction and no alias.
 *
 * The whole reason `name` and the aliases are separate: this is the operation a bare merchant
 * string could not offer, because there the display name *was* the join key.
 */
export async function renamePayee(
  userId: string,
  payeeId: string,
  name: string,
): Promise<void> {
  await requirePayee(userId, payeeId);
  const clean = cleanName(name);
  try {
    await db
      .update(financePayees)
      .set({ name: clean, updatedAt: new Date() })
      .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A payee called "${clean}" already exists.`);
    }
    throw error;
  }
}

/** Save the two editable display fields atomically from the payee drawer. */
export async function updatePayeeDetails(
  userId: string,
  payeeId: string,
  input: { name: string; notes: string; learnCategories?: boolean },
): Promise<void> {
  const name = cleanName(input.name);
  try {
    await db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: financePayees.id })
        .from(financePayees)
        .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
      if (!owned) throw new Error("That payee does not exist.");
      await tx
        .update(financePayees)
        .set({
          name,
          notes: input.notes,
          ...(input.learnCategories !== undefined
            ? { learnCategories: input.learnCategories }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A payee called "${name}" already exists.`);
    }
    throw error;
  }
}

export async function setPayeeNotes(
  userId: string,
  payeeId: string,
  notes: string,
): Promise<void> {
  await requirePayee(userId, payeeId);
  await db
    .update(financePayees)
    .set({ notes, updatedAt: new Date() })
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
}

/**
 * Claim this merchant for a payee.
 *
 * Reassigning an alias another payee holds is refused rather than moved: the unique index
 * would reject it anyway, and a silent move would take charges off a commitment without
 * saying so.
 */
export async function addAlias(
  userId: string,
  payeeId: string,
  alias: string,
): Promise<void> {
  await requirePayee(userId, payeeId);
  const clean = cleanAlias(alias);
  try {
    await db.insert(financePayeeAliases).values({ userId, payeeId, alias: clean });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Another payee already answers to "${clean}".`);
    }
    throw error;
  }
}

export async function removeAlias(
  userId: string,
  payeeId: string,
  alias: string,
): Promise<void> {
  await requirePayee(userId, payeeId);
  await db
    .delete(financePayeeAliases)
    .where(
      and(
        eq(financePayeeAliases.userId, userId),
        eq(financePayeeAliases.payeeId, payeeId),
        eq(financePayeeAliases.alias, alias),
      ),
    );
}

/**
 * Delete a payee. Its transactions keep their history and lose only the pointer.
 *
 * `payee_id` is `on delete set null`, so the rows survive; the next reclassify mints a fresh
 * payee for whatever merchant they name, which is the recomputable behaviour the column
 * promises rather than a hole someone has to notice.
 */
export async function deletePayee(userId: string, payeeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [payee] = await tx
      .select({
        id: financePayees.id,
        budgetCategoryId: financePayees.budgetCategoryId,
      })
      .from(financePayees)
      .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
    if (!payee) throw new Error("That payee does not exist.");
    if (payee.budgetCategoryId) {
      throw new Error(
        "That payee belongs to an envelope. Merge it or release the claim before deleting.",
      );
    }

    // A rule's payee condition is an id inside JSONB with no foreign key behind it, so
    // deleting the payee would leave the rule quietly matching nothing rather than failing.
    const rules = await tx
      .select({ name: financeRules.name, conditions: financeRules.conditions })
      .from(financeRules)
      .where(eq(financeRules.userId, userId));
    const ruledBy = rules.find((rule) =>
      storedConditionPayeeIds(rule.conditions).includes(payeeId),
    );
    if (ruledBy) {
      throw new Error(
        `That payee is used by the rule "${ruledBy.name}". Merge it or edit the rule before deleting.`,
      );
    }

    await tx
      .delete(financePayees)
      .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
  });
}

/**
 * Fold `sourceIds` into `targetId`.
 *
 * **One transaction, and it rewrites references rather than leaving an indirection behind.**
 * Actual keeps a `payee_mapping` table so a merged id keeps resolving forever
 * (`db/index.ts:608-654`); their reason is undo replaying backwards and needing to reproject
 * ids consistently (`rules/rule-utils.ts:118-127`). We have neither CRDT sync nor an undo log,
 * so that table would hold nothing but identity mappings. What it would buy us instead is a
 * second place for a payee id to be wrong.
 *
 * The schedule rewrite is the part with no safety net: `conditions` is JSONB and no foreign key
 * protects an id inside it, so a merge that skipped it would leave a schedule silently matching
 * a payee that no longer exists.
 */
export async function mergePayees(
  userId: string,
  targetId: string,
  sourceIds: readonly string[],
): Promise<{ movedTransactions: number; movedAliases: number }> {
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (sources.length === 0) return { movedTransactions: 0, movedAliases: 0 };

  const target = await requirePayee(userId, targetId);
  const merged = await Promise.all(sources.map((id) => requirePayee(userId, id)));

  // Distinct claims cannot survive one row, and choosing which envelope keeps the merchant is
  // a decision with money attached. The bridge may legitimately put the same claim on several
  // aliases, so compare envelope identities rather than merely counting claimed rows.
  const claimOf = (row: typeof target) => ({
    claim: row.budgetCategoryId ? ({ id: row.budgetCategoryId } as const) : null,
  });
  const claimDecision = mergeClaimDecision([claimOf(target), ...merged.map(claimOf)]);
  if (claimDecision.refusal) throw new Error(claimDecision.refusal);
  const targetClaimed = claimOf(target).claim !== null;

  return db.transaction(async (tx) => {
    const movedAliasRows = await tx
      .update(financePayeeAliases)
      .set({ payeeId: targetId })
      .where(
        and(
          eq(financePayeeAliases.userId, userId),
          inArray(financePayeeAliases.payeeId, sources),
        ),
      )
      .returning({ id: financePayeeAliases.id });
    const movedAliases = movedAliasRows.length;

    const movedTransactionRows = await tx
      .update(financeTransactions)
      .set({ payeeId: targetId, updatedAt: new Date() })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          inArray(financeTransactions.payeeId, sources),
        ),
      )
      .returning({ id: financeTransactions.id });
    const movedTransactions = movedTransactionRows.length;

    // Carry a lone claim across, so merging into an unclaimed payee does not quietly
    // un-declare a commitment.
    const carried = claimDecision.claim;
    if (carried && !targetClaimed) {
      await tx
        .update(financePayees)
        .set({ budgetCategoryId: carried.id, updatedAt: new Date() })
        .where(and(eq(financePayees.userId, userId), eq(financePayees.id, targetId)));
    }

    await rewritePayeeConditions(tx, userId, sources, targetId);

    await tx
      .delete(financePayees)
      .where(and(eq(financePayees.userId, userId), inArray(financePayees.id, sources)));

    return { movedTransactions, movedAliases };
  });
}

/**
 * Point every `payee` condition holding a merged id at the survivor.
 *
 * Rules hold this condition shape, and get the rewrite from the same pure function
 * (`rewriteMergedPayeeIds`) that the merge preview uses to find them — a second copy of this
 * logic is exactly how it would come to be missed: the merge would succeed, and the rule would
 * quietly match nothing thereafter.
 */
async function rewritePayeeConditions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  sources: readonly string[],
  targetId: string,
): Promise<void> {
  const merged = new Set(sources);

  const rules = await tx
    .select({ id: financeRules.id, conditions: financeRules.conditions })
    .from(financeRules)
    .where(eq(financeRules.userId, userId));
  for (const row of rules) {
    const next = rewriteMergedPayeeIds(row.conditions, merged, targetId);
    if (!next) continue;
    await tx
      .update(financeRules)
      .set({ conditions: next, updatedAt: new Date() })
      .where(and(eq(financeRules.userId, userId), eq(financeRules.id, row.id)));
  }
}

/**
 * Attach a payee to an envelope, or release it with `null`.
 *
 * "A payee is claimed by at most one envelope" is what a single nullable column already
 * means, so this just sets or clears it — there is no second column to keep in sync.
 */
export async function claimPayeeForCommitment(
  userId: string,
  payeeId: string,
  claim: { id: string } | null,
): Promise<void> {
  await requirePayee(userId, payeeId);
  await db
    .update(financePayees)
    .set({ budgetCategoryId: claim?.id ?? null, updatedAt: new Date() })
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
  if (claim) await applyClaimedPayees(userId, claim.id, [payeeId]);
}

/** Dismiss a Review proposal: this merchant is not a bill, and should not be proposed again. */
export async function setPayeeNotACommitment(
  userId: string,
  payeeId: string,
  notACommitment: boolean,
): Promise<void> {
  await requirePayee(userId, payeeId);
  await db
    .update(financePayees)
    .set({ notACommitment, updatedAt: new Date() })
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
}

/** Every payee an envelope claims, released in one statement. */
export async function releaseCommitmentClaims(
  userId: string,
  claim: { id: string },
): Promise<void> {
  await db
    .update(financePayees)
    .set({ budgetCategoryId: null, updatedAt: new Date() })
    .where(
      and(
        eq(financePayees.userId, userId),
        eq(financePayees.budgetCategoryId, claim.id),
      ),
    );
}

/** Replace an envelope's complete payee set atomically, refusing identities held elsewhere. */
export async function replaceCommitmentPayees(
  userId: string,
  claim: { id: string },
  payeeIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(payeeIds)];
  await db.transaction((tx) =>
    replaceCommitmentPayeesInTransaction(tx, userId, claim, ids),
  );
  await applyClaimedPayees(userId, claim.id, ids);
}

type PayeeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Shared transaction body for envelope upserts and standalone picker edits. */
export async function replaceCommitmentPayeesInTransaction(
  tx: PayeeTransaction,
  userId: string,
  claim: { id: string },
  payeeIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(payeeIds)];
  const [envelope] = await tx
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.id, claim.id),
      ),
    );
  if (!envelope) throw new Error("That envelope does not exist.");

  const selected =
    ids.length === 0
      ? []
      : await tx
          .select({
            id: financePayees.id,
            name: financePayees.name,
            claimedId: financePayees.budgetCategoryId,
          })
          .from(financePayees)
          .where(and(eq(financePayees.userId, userId), inArray(financePayees.id, ids)))
          .for("update");
  if (selected.length !== ids.length) throw new Error("That payee does not exist.");
  const held = selected.find(
    (payee) => payee.claimedId !== null && payee.claimedId !== claim.id,
  );
  if (held) {
    const [owner] = await tx
      .select({ name: financeBudgetCategories.name })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.id, held.claimedId!),
        ),
      );
    throw new Error(
      `"${held.name}" already belongs to "${owner?.name ?? "another envelope"}". Free it there first.`,
    );
  }

  await tx
    .update(financePayees)
    .set({ budgetCategoryId: null, updatedAt: new Date() })
    .where(
      and(
        eq(financePayees.userId, userId),
        eq(financePayees.budgetCategoryId, claim.id),
      ),
    );
  if (ids.length > 0) {
    await tx
      .update(financePayees)
      .set({ budgetCategoryId: claim.id, updatedAt: new Date() })
      .where(and(eq(financePayees.userId, userId), inArray(financePayees.id, ids)));
  }
}
