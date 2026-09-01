/**
 * Which pending rows the dashboard is allowed to add on top of the headline.
 *
 * A browser capture is a complete snapshot of what the bank page currently shows.
 * SimpleFIN's pending can sit a day behind, so prefer browser rows while that complete
 * pending snapshot is authoritative. An empty browser snapshot is still authoritative.
 */

import { isScrapeFeed } from "./bankSnapshot";
import { hasBrowserPendingAuthority } from "./browserPendingAuthority";

export type WorkingPendingAccount = {
  id: string;
  browserPendingAsOf: Date | null;
};

export type WorkingPendingRow = {
  accountId: string;
  source: string;
};

export function selectWorkingPending<T extends WorkingPendingRow>(
  pending: readonly T[],
  accounts: readonly WorkingPendingAccount[],
  nowMs: number,
): T[] {
  const authoritative = new Set(
    accounts
      .filter((account) =>
        hasBrowserPendingAuthority(account.browserPendingAsOf, nowMs),
      )
      .map((account) => account.id),
  );

  return pending.filter((row) => {
    // Browser rows are the authority only inside the 36-hour window. After it expires they
    // are retained as evidence but excluded from money, and SimpleFIN resumes automatically.
    return authoritative.has(row.accountId)
      ? isScrapeFeed(row.source)
      : !isScrapeFeed(row.source);
  });
}

/**
 * Accounts whose expired browser capture is still holding pending rows out of the money.
 *
 * Expiry on its own is not something a reader can act on. `browserPendingAsOf` is never
 * cleared once a card has been captured, so a warning keyed to the timestamp alone fires
 * forever on a card whose pending SimpleFIN already reports correctly — including when the
 * bank page has no pending activity at all and a fresh capture would change nothing.
 *
 * What is worth reporting is data Planner holds and is deliberately ignoring: browser rows
 * that expiry has excluded and that only a fresh capture can replace.
 */
export function withheldBrowserPendingAccountIds<T extends WorkingPendingRow>(
  pending: readonly T[],
  accounts: readonly WorkingPendingAccount[],
  nowMs: number,
): string[] {
  const expired = new Set(
    accounts
      .filter(
        (account) =>
          account.browserPendingAsOf !== null &&
          !hasBrowserPendingAuthority(account.browserPendingAsOf, nowMs),
      )
      .map((account) => account.id),
  );

  const withheld = new Set<string>();
  for (const row of pending) {
    if (expired.has(row.accountId) && isScrapeFeed(row.source)) {
      withheld.add(row.accountId);
    }
  }
  return [...withheld];
}
