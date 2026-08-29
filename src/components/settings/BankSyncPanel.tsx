"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { formatUsd } from "@/lib/finances/money";
import type { BankConnectionRow } from "@/lib/banksync/queries";
import type { SyncResult } from "@/lib/banksync/sync";
import {
  connectAction,
  deleteConnectionAction,
  linkAccountAction,
  loadAccountsAction,
  reconnectAction,
  syncAction,
  type ConnectResult,
} from "@/app/settings/bankSyncActions";

/**
 * Connect a bank, bind its accounts to the register, and refresh.
 *
 * Notably there is **no third-party widget**: the provider hands the user a setup token on
 * its own site and this app exchanges it server-side. That is why the CSP needs no
 * concession for this feature, and why nothing here loads a script.
 */

type LinkedAccountSummary = {
  linkId: string;
  accountName: string;
  institution: string;
  balanceCents: number | null;
  balanceAsOf: string | null;
};

type Props = {
  connections: BankConnectionRow[];
  linked: LinkedAccountSummary[];
};

const SETUP_URL = "https://beta-bridge.simplefin.org/";

function ageLabel(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function BankSyncPanel({ connections, linked }: Props) {
  const headingId = useId();
  const tokenId = useId();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditBatchId, setAuditBatchId] = useState<string | null>(null);
  const [binding, setBinding] = useState<ConnectResult | null>(null);
  const [removing, setRemoving] = useState<BankConnectionRow | null>(null);
  const [pending, startTransition] = useTransition();

  const submitToken = () => {
    setError(null);
    setNotice(null);
    setAuditBatchId(null);
    const value = token.trim();
    if (!value) {
      setError("Paste the setup token first.");
      return;
    }
    startTransition(async () => {
      const result = reconnecting
        ? await reconnectAction(reconnecting, value)
        : await connectAction(value);
      if (!result.ok) {
        setError(result.error);
        // Refresh anyway. A setup token can only be claimed once, and the claim is saved
        // before the accounts are described — so a failure in the second half leaves a
        // usable connection that must not stay invisible until the page is reloaded by
        // hand. Reaching it via "Match accounts" is then the recovery, with no new token.
        router.refresh();
        return;
      }
      // The token is single-use, so clearing it prevents a second submit that could only
      // ever fail — and fail in a way the provider treats as a compromised token.
      setToken("");
      setReconnecting(null);
      if (result.data) setBinding(result.data);
      router.refresh();
    });
  };

  const manage = (connectionId: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await loadAccountsAction(connectionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBinding(result.data);
    });
  };

  const bind = (externalAccountId: string, accountId: string) => {
    if (!binding) return;
    const account = binding.accounts.find(
      (a) => a.externalAccountId === externalAccountId,
    );
    setError(null);
    startTransition(async () => {
      const result = await linkAccountAction({
        connectionId: binding.connectionId,
        externalAccountId,
        accountId,
        institution: account?.institution,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBinding({
        ...binding,
        accounts: binding.accounts.map((a) =>
          a.externalAccountId === externalAccountId
            ? { ...a, linkedAccountId: accountId }
            : a,
        ),
      });
      router.refresh();
    });
  };

  const refresh = () => {
    setError(null);
    setNotice(null);
    setAuditBatchId(null);
    startTransition(async () => {
      const result = await syncAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data) setNotice(describeSync(result.data));
      setAuditBatchId(result.data?.auditBatchId ?? null);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded border border-rule">
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2
          id={headingId}
          className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          Bank sync
        </h2>
        {connections.length > 0 && (
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface disabled:opacity-40"
          >
            {pending ? "Working…" : "Refresh now"}
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          Pull balances and transactions from your banks through SimpleFIN, so the
          register stays current without downloading a file. Data refreshes about once a
          day — the button re-reads what SimpleFIN currently holds, it does not make a
          bank hand over something newer.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem]">
            {notice}
            {auditBatchId && (
              <>
                {" "}
                <Link
                  href={`/finances/activity?batch=${auditBatchId}`}
                  className="text-ink-muted underline decoration-rule underline-offset-2 hover:text-ink"
                >
                  View Activity receipt
                </Link>
              </>
            )}
          </p>
        )}

        <div className="mt-3">
          <label
            htmlFor={tokenId}
            className="block text-[0.8125rem] font-medium text-ink"
          >
            {reconnecting ? "New setup token" : "Setup token"}
          </label>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
            Connect your banks at{" "}
            <a
              href={SETUP_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              SimpleFIN
            </a>
            , then paste the setup token it gives you. It can only be used once.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id={tokenId}
              type="text"
              value={token}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setToken(event.target.value)}
              placeholder="aHR0cHM6Ly8…"
              className="min-h-tap flex-1 rounded border border-rule bg-surface px-2 py-1 font-mono text-base md:min-h-0 md:text-[0.8125rem]"
            />
            <button
              type="button"
              onClick={submitToken}
              disabled={pending}
              className="min-h-tap rounded border border-rule bg-surface-raised px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-rule-strong disabled:opacity-40 md:min-h-0"
            >
              {pending ? "Connecting…" : reconnecting ? "Reconnect" : "Connect"}
            </button>
            {reconnecting && (
              <button
                type="button"
                onClick={() => {
                  setReconnecting(null);
                  setToken("");
                }}
                className="min-h-tap rounded border border-rule px-2.5 py-1 text-[0.8125rem] md:min-h-0"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {connections.length > 0 && (
          <ul className="mt-4 space-y-2">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="border border-rule px-3 py-2 text-[0.8125rem]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{connection.label || "Bank sync"}</span>
                  <span className="text-ink-muted">
                    {connection.linkedAccountCount} account
                    {connection.linkedAccountCount === 1 ? "" : "s"} · synced{" "}
                    {ageLabel(
                      connection.lastSyncedAt ? String(connection.lastSyncedAt) : null,
                    )}
                  </span>
                </div>

                {connection.reauthRequiredAt && (
                  <p className="mt-1 text-priority-a">
                    This connection was revoked. Generate a new setup token and
                    reconnect.
                  </p>
                )}
                {connection.linkedAccountCount === 0 && (
                  <p className="mt-1 text-ink-muted">
                    No accounts matched yet — nothing will sync until one is.
                  </p>
                )}
                {/*
                  Shown for as long as it is true, not once when it happens. The refresh that
                  carries an unmatched account's transactions mentions it and the next one has
                  moved past them, so a one-off notice is missable — and the account then sits
                  unsynced with no sign at all.
                */}
                {connection.unmatchedAccountCount > 0 && (
                  <p className="mt-1 text-priority-a">
                    {connection.unmatchedAccountCount} account
                    {connection.unmatchedAccountCount === 1 ? " is" : "s are"} not
                    matched to anything, so{" "}
                    {connection.unmatchedAccountCount === 1 ? "its" : "their"}{" "}
                    transactions are being skipped.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => manage(connection.id)}
                    disabled={pending}
                    className="min-h-tap rounded border border-rule px-2.5 py-1 transition-colors hover:border-rule-strong disabled:opacity-40 md:min-h-0"
                  >
                    {connection.linkedAccountCount === 0
                      ? "Match accounts"
                      : "Manage accounts"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReconnecting(connection.id);
                      setToken("");
                      setError(null);
                    }}
                    disabled={pending}
                    className="min-h-tap rounded border border-rule px-2.5 py-1 transition-colors hover:border-rule-strong disabled:opacity-40 md:min-h-0"
                  >
                    Reconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(connection)}
                    disabled={pending}
                    className="min-h-tap rounded border border-rule px-2.5 py-1 transition-colors hover:border-rule-strong disabled:opacity-40 md:min-h-0"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {linked.length > 0 && (
          <table className="mt-4 w-full text-[0.8125rem]">
            <caption className="sr-only">
              Linked accounts and their latest balances
            </caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="py-1 font-normal">
                  Account
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Balance
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  As of
                </th>
              </tr>
            </thead>
            <tbody>
              {linked.map((row) => (
                <tr key={row.linkId} className="border-t border-rule">
                  <td className="py-1">{row.accountName}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatUsd(row.balanceCents)}
                  </td>
                  {/*
                    The provider's own balance date, not when we asked. A figure from
                    yesterday labelled "just now" is the lie this feature exists to avoid.
                  */}
                  <td className="py-1 text-right text-ink-muted">
                    {ageLabel(row.balanceAsOf)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {binding && (
          <MatchAccounts
            binding={binding}
            pending={pending}
            onBind={bind}
            onDone={() => setBinding(null)}
          />
        )}
      </div>

      {removing && (
        <ConfirmDialog
          open
          destructive
          title={`Remove ${removing.label || "this connection"}?`}
          message="Transactions already imported stay in the register. The connection stops syncing and its stored credentials are forgotten."
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            startTransition(async () => {
              const result = await deleteConnectionAction(target.id);
              if (!result.ok) setError(result.error);
              router.refresh();
            });
          }}
        />
      )}
    </section>
  );
}

/**
 * Bind each provider account to the register account it already is.
 *
 * Candidates are pre-matched on trailing digits but nothing is selected by default: a wrong
 * link merges two real accounts, and is far harder to undo than a second click is to make.
 */
function MatchAccounts({
  binding,
  pending,
  onBind,
  onDone,
}: {
  binding: ConnectResult;
  pending: boolean;
  onBind: (externalAccountId: string, accountId: string) => void;
  onDone: () => void;
}) {
  const byId = new Map(binding.registerAccounts.map((a) => [a.id, a]));

  return (
    <div className="mt-4 border border-rule p-3">
      <h4 className="text-[0.8125rem] font-semibold">Match accounts</h4>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">
        Point each bank account at the register account it already is. Anything left
        unmatched will not sync.
      </p>

      <ul className="mt-3 space-y-3">
        {binding.accounts.map((account) => {
          const candidates = account.candidateIds
            .map((id) => byId.get(id))
            .filter((a): a is NonNullable<typeof a> => Boolean(a));
          const others = binding.registerAccounts.filter(
            (a) => !account.candidateIds.includes(a.id),
          );

          return (
            <li key={account.externalAccountId} className="text-[0.8125rem]">
              <div className="font-medium">
                {account.name}
                {account.institution && (
                  <span className="ml-2 font-normal text-ink-muted">
                    {account.institution}
                  </span>
                )}
              </div>

              {account.linkedAccountId ? (
                <p className="mt-1 text-ink-muted">
                  Matched to {byId.get(account.linkedAccountId)?.name ?? "an account"}.
                </p>
              ) : (
                <select
                  aria-label={`Register account for ${account.name}`}
                  defaultValue=""
                  disabled={pending}
                  onChange={(event) => {
                    if (event.target.value) {
                      onBind(account.externalAccountId, event.target.value);
                    }
                  }}
                  className="mt-1 min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-base md:min-h-0 md:text-[0.8125rem]"
                >
                  <option value="">Don&rsquo;t sync this account</option>
                  {candidates.length > 0 && (
                    <optgroup label="Matches this account number">
                      {candidates.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label="Other accounts">
                      {others.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onDone}
        className="mt-3 min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] md:min-h-0"
      >
        Done
      </button>
    </div>
  );
}

/** One sentence per connection: what changed, and what could not. */
function describeSync(result: SyncResult): string {
  if (result.connections.length === 0) return "No bank connections to refresh.";

  return result.connections
    .map((connection) => {
      if (connection.state === "not_linked") {
        return `${connection.label}: no accounts matched yet.`;
      }
      if (connection.state === "reauth_required") {
        return `${connection.label}: was revoked — reconnect with a new setup token.`;
      }
      if (connection.state === "subscription_lapsed") {
        return `${connection.label}: ${connection.message}`;
      }
      if (connection.state === "failed") {
        return `${connection.label}: ${connection.message}`;
      }

      const { counts } = connection;
      const parts = [`${counts.inserted} new`];
      if (counts.updated) parts.push(`${counts.updated} updated`);
      if (counts.deleted) parts.push(`${counts.deleted} cleared`);
      if (counts.skippedDuplicate) {
        parts.push(`${counts.skippedDuplicate} already imported`);
      }
      if (counts.unlinkedAccounts) {
        parts.push(`${counts.unlinkedAccounts} unmatched account(s) skipped`);
      }
      const line = `${connection.label}: ${parts.join(", ")}.`;
      // Upstream problems arrive alongside good data rather than instead of it, so they are
      // appended rather than replacing the counts.
      return counts.providerErrors.length > 0
        ? `${line} ${counts.providerErrors.join(" ")}`
        : line;
    })
    .join(" ");
}
