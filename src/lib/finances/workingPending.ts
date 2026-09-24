/**
 * Which pending rows count on top of the headline: those of the account's history source.
 *
 * A bank-page account's holds come from the page, every other account's from the feed. The
 * choice used to be made at read time by comparing the page capture's timestamp with the
 * feed's balance date, which is how "who owns this account" was guessed before the account
 * stored it. It now stores it, so the guess is gone
 * (`agent-os/specs/2026-09-23-1316-one-history-source-per-account/` D1, superseding
 * `2026-09-01-1205-source-as-of-authority` D3).
 */

import { isScrapeFeed } from "./bankSnapshot";

export type WorkingPendingAccount = {
  id: string;
  historySource: string;
};

export type WorkingPendingRow = {
  accountId: string;
  source: string;
};

export function selectWorkingPending<T extends WorkingPendingRow>(
  pending: readonly T[],
  accounts: readonly WorkingPendingAccount[],
): T[] {
  const pageSourced = new Set(
    accounts
      .filter((account) => account.historySource === "bank_page")
      .map((account) => account.id),
  );
  return pending.filter((row) =>
    pageSourced.has(row.accountId)
      ? isScrapeFeed(row.source)
      : !isScrapeFeed(row.source),
  );
}
