/**
 * Building the initial payee set from a history that never had one.
 *
 * `seedBudget` is the shape this follows (`budget/mutations.ts`): a pure planner with tests,
 * invoked once behind an action, **idempotent** — re-planning against its own output yields
 * nothing to do. That property is what makes this safe to re-run after an import rather than a
 * one-shot migration nobody dares touch twice.
 *
 * **Where the names come from.** The caller supplies the active rules table's `name-payee`
 * result. That action applies only while an alias is first minted; later edits to a rule never
 * rename a payee the user already owns.
 *
 * **Why a re-run cannot undo an edit.** Every decision below is keyed on whether an alias is
 * already claimed, never on whether a payee still has the name this planner would have given
 * it. Rename `Walmart` to `Wally World` and its aliases stay claimed, so the group is complete
 * and nothing happens; a *new* spelling arriving later joins `Wally World`, where its siblings
 * already live, instead of resurrecting a payee under the old name.
 */

import { aliasFor } from "./resolve";

/** One transaction's identifying strings, before any payee exists. */
export type SeedSource = {
  description: string;
  /** A PayPal resolution's counterparty, where one names who was actually paid. */
  counterparty?: string | null;
};

export type ExistingPayee = {
  id: string;
  name: string;
  aliases: readonly string[];
};

export type SeedPlan = {
  /** Payees to insert, each with the aliases that justified creating it. */
  create: { name: string; aliases: string[] }[];
  /** Aliases to attach to a payee that already exists. */
  extend: { payeeId: string; aliases: string[] }[];
  /**
   * Groups whose aliases are already split across two or more payees.
   *
   * Deliberately not resolved: one merchant's spellings sitting on different payees is
   * something a person did, and picking a winner would silently undo it. Reported so the
   * caller can say so.
   */
  conflicts: { name: string; aliases: string[]; heldBy: string[] }[];
};

/** Case-insensitive, matching the `(user_id, lower(name))` unique index on the table. */
function nameKey(name: string): string {
  return name.toLowerCase();
}

/**
 * Group the observed aliases under the name each should live beneath.
 *
 * A rule-supplied name beats one derived from the raw alias, so `Costco` wins over `COSTCO`
 * when both reach the same group — otherwise the display name would depend on which spelling
 * the bank happened to send first.
 */
function groupAliases(
  aliases: readonly string[],
  nameHint: (alias: string) => string | null,
): Map<string, { name: string; aliases: string[] }> {
  const groups = new Map<string, { name: string; aliases: string[]; named: boolean }>();

  for (const alias of aliases) {
    const ruleName = nameHint(alias) ?? undefined;
    const name = ruleName ?? alias;
    const key = nameKey(name);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { name, aliases: [alias], named: ruleName !== undefined });
      continue;
    }
    existing.aliases.push(alias);
    if (ruleName !== undefined && !existing.named) {
      existing.name = ruleName;
      existing.named = true;
    }
  }

  return new Map(
    [...groups].map(([key, group]) => [
      key,
      { name: group.name, aliases: [...group.aliases].sort() },
    ]),
  );
}

/**
 * What to create, what to extend, and what is too ambiguous to touch.
 *
 * Sources may repeat freely — the planner distincts them — so the caller can hand over the
 * whole register without a `DISTINCT` in the query.
 */
export function planSeed(
  sources: readonly SeedSource[],
  existing: readonly ExistingPayee[],
  nameHint: (alias: string) => string | null,
): SeedPlan {
  const observed = new Set<string>();
  for (const source of sources) {
    const alias = aliasFor(source.description, source.counterparty);
    // A description that normalizes to nothing has no merchant in it — a bare "Withdrawal",
    // say. A payee with a blank alias would claim every such row at once.
    if (alias !== "") observed.add(alias);
  }

  const owner = new Map<string, string>();
  const byName = new Map<string, ExistingPayee>();
  for (const payee of existing) {
    byName.set(nameKey(payee.name), payee);
    for (const alias of payee.aliases) owner.set(alias, payee.id);
  }

  const plan: SeedPlan = { create: [], extend: [], conflicts: [] };

  for (const group of [...groupAliases([...observed].sort(), nameHint).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const unclaimed = group.aliases.filter((alias) => !owner.has(alias));
    // Every spelling already belongs to someone. This is the ordinary second run, and also
    // what a rename looks like from here.
    if (unclaimed.length === 0) continue;

    const holders = [
      ...new Set(
        group.aliases.map((alias) => owner.get(alias)).filter((id) => id !== undefined),
      ),
    ].sort();

    if (holders.length > 1) {
      plan.conflicts.push({ name: group.name, aliases: unclaimed, heldBy: holders });
      continue;
    }

    // One payee already holds part of this group: the new spelling joins its siblings, whatever
    // that payee is called now.
    if (holders.length === 1) {
      plan.extend.push({ payeeId: holders[0], aliases: unclaimed });
      continue;
    }

    // Nothing claimed, but the name is taken — attach rather than collide with the unique
    // index. Two payees called Costco is the state `mergePayees` exists to clean up.
    const sameName = byName.get(nameKey(group.name));
    if (sameName) {
      plan.extend.push({ payeeId: sameName.id, aliases: unclaimed });
      continue;
    }

    plan.create.push({ name: group.name, aliases: unclaimed });
  }

  return plan;
}

/** Nothing to do — the planner's idempotence, stated once so callers do not re-derive it. */
export function isEmptyPlan(plan: SeedPlan): boolean {
  return (
    plan.create.length === 0 && plan.extend.length === 0 && plan.conflicts.length === 0
  );
}
