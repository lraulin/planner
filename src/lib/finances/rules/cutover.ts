/**
 * Write the seeded rules, and prove first that doing so changes nothing.
 *
 * The shape is the payee matcher cutover's, which this repo has now run twice successfully
 * (`agent-os/specs/2026-08-23-1041-payee-matcher-cutover/`): a pure planner, an audit that
 * reports differences as counts and signed cents before any write, an executor in one
 * transaction scoped to one user, and a CLI that is a dry run unless told otherwise.
 *
 * **Unlike that cutover there is no accepted-difference clause.** It carried one, for the
 * opaque-PayPal identity correction it deliberately made. Here the seeded corpus is a
 * transcription of the array it replaces, so there is no correction to accept: any difference
 * at all is a bug in `seed.ts`, and `canApply` says so.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeRules } from "@/db/schema";
import type { FlowDiff } from "../classify/flowDiff";
import { previewDerivedChanges } from "../mutations";
import { planRuleSeed, type SeedPlan } from "./seed";

export type RuleSeedAudit = {
  /** Rules this run would create. Zero on a replay. */
  toCreate: number;
  /** Rules already present, left alone. */
  existing: number;
  flow: FlowDiff;
  category: FlowDiff;
  /** Rows whose stored JSONB could not be compiled, by name. */
  problems: { name: string; reason: string }[];
  /**
   * True only when seeding would move no row at all.
   *
   * Both fields, because a rule can move one without the other — see
   * `summarizeCategoryChanges`.
   */
  canApply: boolean;
};

/** Seeded ids already present for this user. */
async function existingSeededIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ seededId: financeRules.seededId })
    .from(financeRules)
    .where(eq(financeRules.userId, userId));
  return rows.flatMap((row) => (row.seededId === null ? [] : [row.seededId]));
}

export async function planSeedFor(userId: string): Promise<SeedPlan> {
  return planRuleSeed(await existingSeededIds(userId));
}

/**
 * Write the planned rules in one transaction.
 *
 * Idempotent through `seeded_id`: a replay plans nothing and writes nothing. The unique index
 * is the real guarantee — two concurrent runs cannot both insert the same seeded rule, which
 * is why this does not need to lock anything.
 */
export async function seedRules(userId: string): Promise<{ created: number }> {
  const plan = await planSeedFor(userId);
  if (plan.create.length === 0) return { created: 0 };

  await db.transaction(async (tx) => {
    await tx.insert(financeRules).values(
      plan.create.map((draft) => ({
        userId,
        name: draft.name,
        seededId: draft.seededId,
        sortKey: draft.sortKey,
        // Drafts already carry the stored shape — the compiled regex only exists after a parse.
        conditions: draft.conditions,
        actions: draft.actions,
        notes: draft.notes,
      })),
    );
  });

  return { created: plan.create.length };
}

/**
 * What seeding would do, before it does anything.
 *
 * Runs against the rules **as they are now**, which on a first run means none — so the diff it
 * reports is "what the app would classify today", and the whole point is that it must be zero
 * *after* seeding rather than before. Run it, seed, run it again: the second run is the one
 * that has to say zero.
 */
export async function auditRuleSeed(userId: string): Promise<RuleSeedAudit> {
  const plan = await planSeedFor(userId);
  const preview = await previewDerivedChanges(userId);

  return {
    toCreate: plan.create.length,
    existing: plan.skipped.length,
    flow: preview.flow,
    category: preview.category,
    problems: preview.problems,
    canApply:
      preview.flow.changed === 0 &&
      preview.category.changed === 0 &&
      preview.problems.length === 0,
  };
}
