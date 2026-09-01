/**
 * Which pending rows the dashboard is allowed to add on top of the headline.
 *
 * A browser capture is a complete snapshot of what the bank page currently shows, and
 * SimpleFIN's pending can sit a day behind — so the browser's pending set counts while its
 * stamp is more current than the feed's, and the feed's counts otherwise. That is the same
 * comparison the headline uses, not a second rule: authority follows currency, never
 * elapsed time. An empty browser snapshot is still authoritative.
 *
 * Spec: `agent-os/specs/2026-09-01-1205-source-as-of-authority/` D3, superseding the flat
 * 36-hour window in `2026-08-29-0845-bank-snapshots-finance-audit` D2.
 */

import { isScrapeFeed } from "./bankSnapshot";
import { browserOwnsPending, isDated, type SourceStamp } from "./sourceAuthority";

export type WorkingPendingAccount = {
  id: string;
  /** When the last complete browser capture was taken. */
  browserAsOf: SourceStamp | null;
  /** When the feed's balance — the only signal it gives for its pending view — was true. */
  feedAsOf: SourceStamp | null;
};

export type WorkingPendingRow = {
  accountId: string;
  source: string;
};

function browserAccountIds(
  accounts: readonly WorkingPendingAccount[],
): Set<string> {
  return new Set(
    accounts
      .filter((account) => browserOwnsPending(account.browserAsOf, account.feedAsOf))
      .map((account) => account.id),
  );
}

export function selectWorkingPending<T extends WorkingPendingRow>(
  pending: readonly T[],
  accounts: readonly WorkingPendingAccount[],
): T[] {
  const authoritative = browserAccountIds(accounts);
  return pending.filter((row) =>
    authoritative.has(row.accountId)
      ? isScrapeFeed(row.source)
      : !isScrapeFeed(row.source),
  );
}

/**
 * Accounts whose superseded browser capture is still holding pending rows out of the money.
 *
 * The stamp alone is not something a reader can act on: a capture is never un-recorded, so
 * a warning keyed to it fires forever on a card whose pending SimpleFIN already reports
 * correctly — including when the bank page has no pending activity and a fresh capture
 * would change nothing. What is worth reporting is data Planner holds and is deliberately
 * ignoring: browser rows the feed has outrun, which only a fresh capture can replace.
 */
export function withheldBrowserPendingAccountIds<T extends WorkingPendingRow>(
  pending: readonly T[],
  accounts: readonly WorkingPendingAccount[],
): string[] {
  const authoritative = browserAccountIds(accounts);
  const superseded = new Set(
    accounts
      .filter(
        (account) => isDated(account.browserAsOf) && !authoritative.has(account.id),
      )
      .map((account) => account.id),
  );

  const withheld = new Set<string>();
  for (const row of pending) {
    if (superseded.has(row.accountId) && isScrapeFeed(row.source)) {
      withheld.add(row.accountId);
    }
  }
  return [...withheld];
}
