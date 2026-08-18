/**
 * Which pending rows the dashboard is allowed to add on top of the headline.
 *
 * A scrape is a snapshot of what the bank page currently shows. SimpleFIN's pending on
 * Chase can sit a day behind, so once a scrape is in play those SimpleFIN rows would
 * double-count. Prefer scrape rows while any exist on the account, or while the
 * headline hold from an empty scrape is still live.
 */

import { SCRAPE_BALANCE_HOLD_MS } from "@/lib/banksync/scrapeBalance";
import { isScrapeFeed } from "./capitalOnePending";

export type WorkingPendingAccount = {
  id: string;
  scrapeBalanceAsOf: Date | null;
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
  const hasScrape = new Set(
    pending.filter((row) => isScrapeFeed(row.source)).map((row) => row.accountId),
  );
  const hold = new Set(
    accounts
      .filter(
        (account) =>
          account.scrapeBalanceAsOf !== null &&
          nowMs - account.scrapeBalanceAsOf.getTime() < SCRAPE_BALANCE_HOLD_MS,
      )
      .map((account) => account.id),
  );

  return pending.filter((row) => {
    if (!hasScrape.has(row.accountId) && !hold.has(row.accountId)) return true;
    return isScrapeFeed(row.source);
  });
}
