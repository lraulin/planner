/**
 * Which payee a transaction belongs to.
 *
 * The lookup half of payees (`agent-os/specs/2026-08-23-0748-finance-payees/`). Pure, so the
 * precedence is pinned by tests rather than read out of a mutation — the same split
 * `budget/autoMap.ts` uses.
 *
 * **Matching is exact, on the normalized merchant.** `normalizeMerchant` does the mechanical
 * work — strip the feed wrapper and the processor stamp, drop the store number, fold case —
 * and whatever it returns is the alias. Nothing here matches patterns: a payee owns a list of
 * exact strings, so an alias that drifts from what the normalizer produces silently claims
 * nothing, which is why the seed planner and this module must always agree on the key.
 */

import { normalizeMerchant } from "../classify/merchant";

export type AliasRow = { alias: string; payeeId: string };

/** Alias → payee id. Built once per pass. */
export type PayeeIndex = ReadonlyMap<string, string>;

export function payeeIndex(rows: readonly AliasRow[]): PayeeIndex {
  const byAlias = new Map<string, string>();
  for (const row of rows) {
    if (row.alias === "") continue;
    // The database holds a unique index on (user_id, alias), so a duplicate here means the
    // caller joined something twice rather than that two payees claim one string. Keeping the
    // first is deterministic either way.
    if (!byAlias.has(row.alias)) byAlias.set(row.alias, row.payeeId);
  }
  return byAlias;
}

/**
 * The alias key for one row: the normalized merchant.
 *
 * **A resolved counterparty fills an opaque PayPal line.** A PayPal statement names who was
 * actually paid where the bank wrote only `PAYPAL *`, `PAYPAL TO …`, or a one-letter residue.
 * Without that substitution every bare processor line would collapse into one payee. When the
 * bank already names a merchant, however, that more-specific identity wins: a statement entry
 * saying `GOOGLE` must not turn `PP*GOOGLE YOUTUBE SUBSCRI` into the generic Google payee.
 *
 * Falls back to the description when the counterparty is absent or normalizes to nothing, so
 * a blank counterparty cannot erase a merchant the bank did name.
 */
export function aliasFor(
  description: string,
  resolvedCounterparty?: string | null,
): string {
  const fromBank = normalizeMerchant(description);
  const paypalRail = /\bPAYPAL\b|^PP\*/i.test(description);
  const opaquePaypal =
    paypalRail &&
    (fromBank === "" || fromBank.length < 3 || /^PAYPAL(?:\b|\s)/.test(fromBank));

  if (opaquePaypal && resolvedCounterparty) {
    const named = normalizeMerchant(resolvedCounterparty);
    if (named !== "") return named;
  }
  return fromBank;
}

/**
 * The payee for one row, or null when no payee claims it yet.
 *
 * Null is not a failure: a merchant seen for the first time has no payee until the reclassify
 * pass mints one, and reporting that honestly is what keeps `payee_id` recomputable.
 */
export function payeeForDescription(
  description: string,
  index: PayeeIndex,
  resolvedCounterparty?: string | null,
): string | null {
  const alias = aliasFor(description, resolvedCounterparty);
  if (alias === "") return null;
  return index.get(alias) ?? null;
}
