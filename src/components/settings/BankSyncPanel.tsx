"use client";

import Script from "next/script";
import { useCallback, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { formatUsd } from "@/lib/finances/money";
import type { PlaidItemRow } from "@/lib/plaid/queries";
import type { SyncResult } from "@/lib/plaid/sync";
import {
  deleteItemAction,
  exchangeAction,
  linkAccountAction,
  openLinkAction,
  reconnectLinkAction,
  syncAction,
  type ExchangeResult,
} from "@/app/settings/plaidActions";

/**
 * Connect a bank, bind its accounts to the register, and refresh.
 *
 * Progressive disclosure per `components/ux-principles`: before connecting this is one
 * button and a sentence; the account-binding step only exists once there is a connection
 * with accounts to bind.
 */

type LinkedAccountSummary = {
  linkId: string;
  itemRowId: string;
  accountName: string;
  balanceCents: number | null;
  balanceAsOf: string | null;
  /** True where the institution cannot serve a live balance (Capital One cards). */
  balanceIsDaily: boolean;
};

type Props = {
  configured: boolean;
  items: PlaidItemRow[];
  linked: LinkedAccountSummary[];
};

/** Plaid's own global, present once `link-initialize.js` has loaded. */
type PlaidHandler = { open: () => void; exit: () => void; destroy: () => void };
declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (
          publicToken: string,
          metadata: { institution?: { institution_id?: string; name?: string } | null },
        ) => void;
        onExit: (error: { display_message?: string | null } | null) => void;
      }) => PlaidHandler;
    };
  }
}

const LINK_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

/**
 * Resolve once Plaid's global exists.
 *
 * Deliberately polls for the global rather than trusting `next/script`'s `onReady`. That
 * callback fires on the load that inserted the tag, but a client-side navigation back to
 * this panel re-renders it with the script already present and the callback never fires
 * again — leaving the button disabled at "Loading…" forever. The global is the thing we
 * actually need, so it is the thing to wait for.
 */
function waitForPlaid(timeoutMs = 8000): Promise<NonNullable<Window["Plaid"]> | null> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      if (window.Plaid) {
        window.clearInterval(tick);
        resolve(window.Plaid);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(tick);
        resolve(null);
      }
    }, 100);
  });
}

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

export function BankSyncPanel({ configured, items, linked }: Props) {
  const headingId = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [binding, setBinding] = useState<ExchangeResult | null>(null);
  const [removing, setRemoving] = useState<PlaidItemRow | null>(null);
  const [pending, startTransition] = useTransition();

  /** Open Link with a token minted server-side, then hand the public token straight back. */
  const openLink = useCallback(
    async (token: string) => {
      const plaid = await waitForPlaid();
      if (!plaid) {
        setError("The bank connection widget did not load. Reload and try again.");
        return;
      }
      const handler = plaid.create({
        token,
        onSuccess: (publicToken, metadata) => {
          startTransition(async () => {
            const result = await exchangeAction(publicToken, {
              id: metadata.institution?.institution_id,
              name: metadata.institution?.name ?? undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            // Straight into binding: an Item whose accounts are bound to nothing syncs
            // nothing, and the moment the user just authorised it is the moment they know
            // which account is which.
            if (result.data) setBinding(result.data);
            router.refresh();
          });
        },
        onExit: (exitError) => {
          if (exitError?.display_message) setError(exitError.display_message);
        },
      });
      handler.open();
    },
    [router],
  );

  const connect = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await openLinkAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.data) {
        setError("Plaid is not configured on this server.");
        return;
      }
      await openLink(result.data);
    });
  };

  const reconnect = (itemRowId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await reconnectLinkAction(itemRowId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data) await openLink(result.data);
    });
  };

  const bind = (plaidAccountId: string, accountId: string) => {
    if (!binding) return;
    const account = binding.accounts.find((a) => a.plaidAccountId === plaidAccountId);
    setError(null);
    startTransition(async () => {
      const result = await linkAccountAction({
        itemRowId: binding.itemRowId,
        plaidAccountId,
        accountId,
        plaidType: account?.type,
        plaidSubtype: account?.subtype,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBinding({
        ...binding,
        accounts: binding.accounts.map((a) =>
          a.plaidAccountId === plaidAccountId
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
    startTransition(async () => {
      const result = await syncAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data) setNotice(describeSync(result.data));
      router.refresh();
    });
  };

  if (!configured) {
    return (
      <section aria-labelledby={headingId} className="mt-4 rounded border border-rule">
        <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
          <h2
            id={headingId}
            className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Bank sync
          </h2>
        </div>
        <p className="px-4 py-2.5 text-[0.8125rem] leading-relaxed text-ink-muted">
          Not available — this server has no Plaid credentials configured.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded border border-rule">
      {/*
        Nonced so `strict-dynamic` trusts it; the CSP grants `frame-src` and `connect-src`
        for Plaid's hosts but deliberately no `script-src` host, because a script loaded by
        a trusted script inherits trust and a host allowlist would be ignored anyway.
      */}
      <Script
        src={LINK_SRC}
        strategy="afterInteractive"
        onError={() => setError("Could not load the bank connection widget.")}
      />

      <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2
          id={headingId}
          className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          Bank sync
        </h2>
        {items.length > 0 && (
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
          Pull balances and transactions straight from the bank, so the register stays
          current without downloading a file.
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
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={connect}
            disabled={pending}
            className="min-h-tap rounded border border-rule bg-surface-raised px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-rule-strong disabled:opacity-40 md:min-h-0"
          >
            {pending ? "Opening…" : "Connect a bank"}
          </button>
        </div>

        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="border border-rule px-3 py-2 text-[0.8125rem]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{item.institutionName || "Bank"}</span>
                  <span className="text-ink-muted">
                    {item.linkedAccountCount} account
                    {item.linkedAccountCount === 1 ? "" : "s"} · synced{" "}
                    {ageLabel(item.lastSyncedAt ? String(item.lastSyncedAt) : null)}
                  </span>
                </div>

                {item.reauthRequiredAt && (
                  <p className="mt-1 text-priority-a">
                    This connection needs reconnecting before it can sync again.
                  </p>
                )}
                {item.linkedAccountCount === 0 && (
                  <p className="mt-1 text-ink-muted">
                    No accounts bound yet — nothing will sync until one is.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => reconnect(item.id)}
                    disabled={pending}
                    className="min-h-tap rounded border border-rule px-2.5 py-1 transition-colors hover:border-rule-strong disabled:opacity-40 md:min-h-0"
                  >
                    {item.reauthRequiredAt ? "Reconnect" : "Manage accounts"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(item)}
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
                  <td className="py-1 text-right text-ink-muted">
                    {ageLabel(row.balanceAsOf)}
                    {/*
                    Capital One serves no live balance for cards, so this figure is up to a
                    day old however recently the refresh ran. Saying so is the difference
                    between a stale number and a wrong one.
                  */}
                    {row.balanceIsDaily && " · daily"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {binding && (
          <BindAccounts
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
          title={`Remove ${removing.institutionName || "this connection"}?`}
          message="Transactions already imported stay in the register. The connection stops syncing and its stored credentials are forgotten."
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            startTransition(async () => {
              const result = await deleteItemAction(target.id);
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
 * Bind each Plaid account to the register account it already is.
 *
 * Candidates are pre-matched on last four but nothing is selected by default: a wrong link
 * merges two real accounts, and is far harder to undo than a second click is to make.
 */
function BindAccounts({
  binding,
  pending,
  onBind,
  onDone,
}: {
  binding: ExchangeResult;
  pending: boolean;
  onBind: (plaidAccountId: string, accountId: string) => void;
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
            <li key={account.plaidAccountId} className="text-[0.8125rem]">
              <div className="font-medium">
                {account.name}
                {account.mask && ` ••• ${account.mask}`}
                <span className="ml-2 font-normal text-ink-muted">
                  {account.type}
                  {account.subtype && ` / ${account.subtype}`}
                </span>
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
                    if (event.target.value)
                      onBind(account.plaidAccountId, event.target.value);
                  }}
                  className="mt-1 min-h-tap w-full border border-rule bg-surface px-2 py-1 text-base md:min-h-0 md:text-[0.8125rem]"
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
        className="mt-3 min-h-tap border border-rule px-3 py-1.5 text-[0.8125rem] md:min-h-0"
      >
        Done
      </button>
    </div>
  );
}

/** One sentence per connection: what changed, and what could not. */
function describeSync(result: SyncResult): string {
  if (result.items.length === 0) return "No bank connections to refresh.";

  return result.items
    .map((item) => {
      if (item.state === "not_linked") {
        return `${item.institution}: no accounts matched yet.`;
      }
      if (item.state === "reauth_required") {
        return `${item.institution}: needs reconnecting.`;
      }
      if (item.state === "failed") return `${item.institution}: ${item.message}`;

      const { counts } = item;
      const parts = [`${counts.inserted} new`];
      if (counts.updated) parts.push(`${counts.updated} updated`);
      if (counts.deleted) parts.push(`${counts.deleted} removed`);
      if (counts.skippedDuplicate) {
        parts.push(`${counts.skippedDuplicate} already imported`);
      }
      if (counts.unlinkedAccounts) {
        parts.push(`${counts.unlinkedAccounts} unmatched account(s) skipped`);
      }
      // Capital One cannot force a pull, so its transactions arrive on the bank's own
      // schedule. Without saying so, a refresh that finds nothing looks broken.
      if (!counts.transactionsForced) {
        parts.push("transactions follow the bank's daily schedule");
      }
      return `${item.institution}: ${parts.join(", ")}.`;
    })
    .join(" ");
}
