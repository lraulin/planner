import type { BankConnectionRow, BankLinkRow } from "@/lib/banksync/queries";
import { accountBalanceView, type PendingRow } from "./workingBalance";
import type { FinanceAccountRow } from "./types";
import { toDateKey } from "@/lib/schedule/geometry";
export type OperationalAccount = FinanceAccountRow &
  ReturnType<typeof accountBalanceView> & {
    freshness: string;
    balanceSourceLabel: string;
    needsConnection: boolean;
  };
export function operationalAccountRows(
  accounts: readonly FinanceAccountRow[],
  pending: readonly PendingRow[],
  staleIds: ReadonlySet<string>,
  links: readonly BankLinkRow[],
  connections: readonly BankConnectionRow[],
  today: string,
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
      : staleIds.has(account.id)
        ? "Paste fresh snapshot"
        : asOf === today
          ? "As of today"
          : asOf
            ? `As of ${asOf} · refresh or import`
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
    };
  });
}
