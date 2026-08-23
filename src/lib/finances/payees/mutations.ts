/**
 * Writes for payees (`agent-os/specs/2026-08-23-0748-finance-payees/`).
 *
 * Every mutation takes `userId` first, scopes on it, and proves the row was theirs before
 * touching it (`agent-os/standards/development/security.md`).
 *
 * **Two guarantees live in the database, not here**, and that is the point of the whole shape:
 * `(user_id, alias)` is unique, so one merchant string cannot reach two payees; and
 * `num_nonnulls(commitment_bill_id, commitment_spend_id) <= 1` means a payee cannot be claimed
 * by two commitments at once. The functions below translate those refusals into sentences a
 * person can act on — they do not re-implement them, because a check written here would only
 * hold for callers that remembered to come through here.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financePayeeAliases,
  financePayees,
  financeSchedules,
  financeTransactions,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/constraints";
import { normalizeMerchant } from "../classify/merchant";
import { mergeClaimDecision } from "./merge";
import { storedSchedulePayeeIds } from "./references";

async function requirePayee(userId: string, payeeId: string) {
  const [row] = await db
    .select({
      id: financePayees.id,
      name: financePayees.name,
      commitmentBillId: financePayees.commitmentBillId,
      commitmentSpendId: financePayees.commitmentSpendId,
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
        commitmentBillId: financePayees.commitmentBillId,
        commitmentSpendId: financePayees.commitmentSpendId,
      })
      .from(financePayees)
      .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
    if (!payee) throw new Error("That payee does not exist.");
    if (payee.commitmentBillId || payee.commitmentSpendId) {
      throw new Error(
        "That payee belongs to a commitment. Merge it or release the claim before deleting.",
      );
    }

    const schedules = await tx
      .select({ name: financeSchedules.name, conditions: financeSchedules.conditions })
      .from(financeSchedules)
      .where(eq(financeSchedules.userId, userId));
    const referencedBy = schedules.find((schedule) =>
      storedSchedulePayeeIds(schedule.conditions).includes(payeeId),
    );
    if (referencedBy) {
      throw new Error(
        `That payee is used by the schedule "${referencedBy.name}". Merge it or edit the schedule before deleting.`,
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

  // Distinct claims cannot survive one row, and choosing which commitment keeps the merchant is
  // a decision with money attached. The bridge may legitimately put the same claim on several
  // aliases, so compare commitment identities rather than merely counting claimed rows.
  const claimOf = (row: typeof target) => ({
    claim: row.commitmentBillId
      ? ({ kind: "bill", id: row.commitmentBillId } as const)
      : row.commitmentSpendId
        ? ({ kind: "spend", id: row.commitmentSpendId } as const)
        : null,
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
        .set({
          commitmentBillId: carried.kind === "bill" ? carried.id : null,
          commitmentSpendId: carried.kind === "spend" ? carried.id : null,
          updatedAt: new Date(),
        })
        .where(and(eq(financePayees.userId, userId), eq(financePayees.id, targetId)));
    }

    await rewriteScheduleConditions(tx, userId, sources, targetId);

    await tx
      .delete(financePayees)
      .where(and(eq(financePayees.userId, userId), inArray(financePayees.id, sources)));

    return { movedTransactions, movedAliases };
  });
}

/**
 * Point any `payee` condition holding a merged id at the target instead.
 *
 * Reads and rewrites in TypeScript rather than in SQL: the conditions blob is a validated
 * shape, and a JSONB path update would have to re-encode that shape in SQL where nothing
 * checks it.
 */
async function rewriteScheduleConditions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  sources: readonly string[],
  targetId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: financeSchedules.id, conditions: financeSchedules.conditions })
    .from(financeSchedules)
    .where(eq(financeSchedules.userId, userId));

  const merged = new Set(sources);

  for (const row of rows) {
    if (!Array.isArray(row.conditions)) continue;
    let changed = false;

    const next = row.conditions.map((condition) => {
      if (
        typeof condition !== "object" ||
        condition === null ||
        (condition as { field?: unknown }).field !== "payee"
      ) {
        return condition;
      }
      const value = (condition as { value?: unknown }).value;

      if (typeof value === "string" && merged.has(value)) {
        changed = true;
        return { ...(condition as object), value: targetId };
      }
      if (Array.isArray(value) && value.some((v) => merged.has(v as string))) {
        changed = true;
        // De-duplicate: merging two payees a schedule listed separately must not leave the
        // target named twice.
        const rewritten = [
          ...new Set(value.map((v) => (merged.has(v as string) ? targetId : v))),
        ];
        return { ...(condition as object), value: rewritten };
      }
      return condition;
    });

    if (changed) {
      await tx
        .update(financeSchedules)
        .set({ conditions: next, updatedAt: new Date() })
        .where(
          and(eq(financeSchedules.userId, userId), eq(financeSchedules.id, row.id)),
        );
    }
  }
}

/**
 * Attach a payee to a commitment, or release it with `null`.
 *
 * The exclusivity that used to be enforced by hand across two `matchers` columns is the table's
 * CHECK now, so this sets one side and clears the other in the same statement rather than
 * checking first and hoping nothing changed in between.
 */
export async function claimPayeeForCommitment(
  userId: string,
  payeeId: string,
  claim: { kind: "bill" | "spend"; id: string } | null,
): Promise<void> {
  await requirePayee(userId, payeeId);
  await db
    .update(financePayees)
    .set({
      commitmentBillId: claim?.kind === "bill" ? claim.id : null,
      commitmentSpendId: claim?.kind === "spend" ? claim.id : null,
      updatedAt: new Date(),
    })
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
}

/** Every payee a commitment claims, released in one statement. */
export async function releaseCommitmentClaims(
  userId: string,
  claim: { kind: "bill" | "spend"; id: string },
): Promise<void> {
  await db
    .update(financePayees)
    .set({
      commitmentBillId: null,
      commitmentSpendId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financePayees.userId, userId),
        claim.kind === "bill"
          ? eq(financePayees.commitmentBillId, claim.id)
          : eq(financePayees.commitmentSpendId, claim.id),
      ),
    );
}
