/**
 * Which pending rows the dashboard is allowed to add on top of the headline.
 *
 * A scrape is a snapshot of what the bank page currently shows. SimpleFIN's pending on
 * Chase can sit a day behind, so once a scrape is in play those SimpleFIN rows would
 * double-count. Prefer scrape rows while any exist on the account, or while the
 * headline hold from an empty scrape is still live.
 */

import { SCRAPE_BALANCE_HOLD_MS } from "@/lib/banksync/scrapeBalance";
import { isScrapeFeed } from "./bankSnapshot";

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
  const authoritative = new Set(
    accounts
      .filter(
        (account) =>
          account.scrapeBalanceAsOf !== null &&
          nowMs - account.scrapeBalanceAsOf.getTime() < SCRAPE_BALANCE_HOLD_MS,
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
