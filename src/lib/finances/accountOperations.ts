import type { BankConnectionRow, BankLinkRow } from "@/lib/banksync/queries";
import { accountBalanceView, type PendingRow } from "./workingBalance";
import type { FinanceAccountRow } from "./types";
import { toDateKey } from "@/lib/schedule/geometry";
export type OperationalAccount = FinanceAccountRow &
  ReturnType<typeof accountBalanceView> & {
    freshness: string;
    balanceSourceLabel: string;
    needsConnection: boolean;
    /**
     * D3: bank working balance − (recorded opening + rows since start). Null when the
     * account is off-budget or not yet seeded — there is nothing to compare against.
     */
    mismatchCents: number | null;
  };
export function operationalAccountRows(
  accounts: readonly FinanceAccountRow[],
  pending: readonly PendingRow[],
  links: readonly BankLinkRow[],
  connections: readonly BankConnectionRow[],
  today: string,
  /**
   * The workspace date format, passed in like `today` is, because this is pure and the
   * setting lives in a React context. Without it the Freshness cell printed a raw
   * `2026-09-04` beside a Balance as of column reading `9/4/2026`.
   *
   * Required rather than defaulted to the identity: a default would let the next caller
   * reintroduce the raw key and see nothing wrong.
   */
  formatDate: (dateKey: string | null | undefined) => string,
  /** Keyed by account id, from `loadBudgetMismatch` — required for the same reason `today` is. */
  mismatchByAccountId: ReadonlyMap<string, number>,
): OperationalAccount[] {
  return accounts.map((account) => {
    const link = links.find((row) => row.accountId === account.id);
    const connection = connections.find((row) => row.id === link?.connectionId);
    const needsConnection = Boolean(connection?.reauthRequiredAt);
    const asOf = account.syncedBalanceAsOf
      ? toDateKey(new Date(account.syncedBalanceAsOf))
      : account.statementPeriodEnd;
    const freshness = needsConnection
      ? "Reconnect bank"
      : asOf === today
        ? "As of today"
        : asOf
          ? `As of ${formatDate(asOf)} · refresh or import`
          : "Import or connect bank";
    const balanceSourceLabel = account.syncedBalanceAsOf
      ? account.balanceSource === "browser"
        ? "Bank snapshot"
        : account.balanceSource === "file"
          ? "Imported snapshot"
          : "Bank feed"
      : account.statementPeriodEnd
        ? "Statement + activity"
        : "Transaction history";
    return {
      ...account,
      ...accountBalanceView(account, pending),
      freshness,
      balanceSourceLabel,
      needsConnection,
      mismatchCents: mismatchByAccountId.get(account.id) ?? null,
    };
  });
}
