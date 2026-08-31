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
