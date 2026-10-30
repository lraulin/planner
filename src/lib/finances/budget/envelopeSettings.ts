import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetAllocations, financeBudgetCategories } from "@/db/schema";
import { localDateKey } from "@/lib/schedule/geometry";
import { snoozeUnavailableReason } from "./snooze";
import { monthKeyOf, type MonthKey } from "./envelope";
import { parseTarget, parseTargetOrThrow } from "./targets/types";
import { requireCategory } from "./structureRows";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import { writeFinanceAuditEvent } from "../audit/writes";

/**
 * Writes for what an envelope asks of its month: carryover, a snoozed target, the target
 * itself. Every write takes `userId` first and proves the envelope is the caller's
 * (`agent-os/standards/development/security.md`).
 */

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
    const existing = await tx
      .select({
        month: financeBudgetAllocations.month,
        amountCents: financeBudgetAllocations.amountCents,
        carryover: financeBudgetAllocations.carryover,
      })
      .from(financeBudgetAllocations)
      .where(
        and(
          eq(financeBudgetAllocations.userId, userId),
          eq(financeBudgetAllocations.categoryId, params.categoryId),
          sql`${financeBudgetAllocations.month} >= ${params.month}`,
        ),
      );
    const budgetMonths = [
      ...new Set([params.month, ...existing.map((row) => row.month)]),
    ];
    const scope = { budgetMonths, envelopeIds: [params.categoryId] };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);

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

    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const byMonth = new Map(existing.map((row) => [row.month, row]));
    await writeFinanceAuditEvent(tx, userId, {
      kind: "budget_carryover",
      origin: "Budget",
      summary: `${params.carryover ? "Enabled" : "Disabled"} overspending carryover from ${params.month.slice(0, 7)}`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: budgetMonths.map((month) => {
        const before = byMonth.get(month);
        return {
          entityType: "allocation",
          entityIdentity: `${month}|${params.categoryId}`,
          before: before
            ? { amountCents: before.amountCents, carryover: before.carryover }
            : null,
          after: {
            amountCents: before?.amountCents ?? 0,
            carryover: params.carryover,
          },
        };
      }),
    });
  });
}

/**
 * Silence this envelope's target ask for one month — "done with pizza for August".
 *
 * Deliberately **not** `setCarryover`'s propagate-forward: carryover records a standing intent
 * ("this envelope owns its own debt"), while a snooze is a fact about one month and must lapse
 * on its own when the month turns. That expiry is the whole reason the flag lives on the
 * allocation row (`target-snooze` D1) — next month is a different row, so there is nothing to
 * clean up.
 *
 * Eligibility is re-checked here against the server's own clock, never the client's.
 */
export async function setTargetSnooze(
  userId: string,
  params: { month: MonthKey; categoryId: string; snoozed: boolean },
): Promise<void> {
  await requireCategory(userId, params.categoryId);

  const [category] = await db
    .select({
      kind: financeBudgetCategories.kind,
      target: financeBudgetCategories.target,
    })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.id, params.categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    )
    .limit(1);
  if (!category) throw new Error("That envelope does not exist.");

  const reason = snoozeUnavailableReason(
    { kind: category.kind, target: parseTarget(category.target) },
    params.month,
    monthKeyOf(localDateKey(new Date())),
  );
  if (reason) throw new Error(reason);

  await db
    .insert(financeBudgetAllocations)
    .values({
      userId,
      month: params.month,
      categoryId: params.categoryId,
      amountCents: 0,
      snoozed: params.snoozed,
    })
    .onConflictDoUpdate({
      target: [
        financeBudgetAllocations.userId,
        financeBudgetAllocations.month,
        financeBudgetAllocations.categoryId,
      ],
      set: { snoozed: params.snoozed, updatedAt: new Date() },
    });
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
