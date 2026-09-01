/**
 * The database half of source currency — see `sourceAuthority.ts` for the rule and why it
 * exists.
 *
 * Every path that learns an account's balance calls `recordSourceState` from inside its own
 * transaction. Each source writes **only its own row**, and the headline on
 * `bank_account_links` is recomputed from all of them. That is what makes a stale write
 * unable to regress the headline rather than merely guarded against doing so: an old
 * snapshot updates the browser stamp and the derived figure simply does not move — no
 * writer needs a "do not regress" check of its own.
 *
 * Like `feedHandoverWrite.ts`, this returns audit changes rather than writing its own event,
 * so the authority move and the write that caused it appear as one thing that happened.
 *
 * Spec: `agent-os/specs/2026-09-01-1205-source-as-of-authority/` D1, D4.
 */

import { and, eq, inArray } from "drizzle-orm";
import { fromDateKey } from "@/lib/schedule/geometry";
import { bankAccountLinks, financeAccountSourceState } from "@/db/schema";
import type { FinanceAuditChange } from "./audit/types";
import type { FinanceExecutor } from "./dbExecutor";
import {
  isStrictlyNewer,
  pickAuthoritative,
  SOURCE_KINDS,
  type SourceKind,
  type SourceStamp,
} from "./sourceAuthority";

/** What one source saw, and when it was true. */
export type SourceReport = {
  source: SourceKind;
  balanceCents: number | null;
  availableCents: number | null;
  /** The instant the figure was true, or null when this source reports no time. */
  asOf: Date | null;
  /** The calendar day, for a file that only knows days. */
  asOfDay: string | null;
};

/** Every source's last report for one account, by kind. */
export type AccountSourceStamps = Partial<Record<SourceKind, SourceStamp>>;

export type AuthorityResult = {
  /** Did the recorded source end up holding the headline? */
  headlineMoved: boolean;
  /** Which source holds it now, or null when the account has no bank link. */
  headlineSource: SourceKind | null;
  changes: FinanceAuditChange[];
};

type LinkHeadline = {
  id: string;
  balanceCents: number | null;
  availableCents: number | null;
  balanceAsOf: Date | null;
  balanceSource: string | null;
};

function auditShape(headline: LinkHeadline) {
  return {
    balanceCents: headline.balanceCents,
    availableCents: headline.availableCents,
    balanceAsOf: headline.balanceAsOf?.toISOString() ?? null,
    balanceSource: headline.balanceSource,
  };
}

function isSourceKind(value: string | null): value is SourceKind {
  return value !== null && (SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * Record what one source saw and re-derive the account's headline from every source.
 *
 * Runs inside the caller's transaction: the source row and the headline it implies must
 * become true in the same commit, or a crash between them leaves the cache describing a
 * source state that never existed.
 */
export async function recordSourceState(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
  report: SourceReport,
): Promise<AuthorityResult> {
  const [stored] = await executor
    .select({
      asOf: financeAccountSourceState.asOf,
      asOfDay: financeAccountSourceState.asOfDay,
    })
    .from(financeAccountSourceState)
    .where(
      and(
        eq(financeAccountSourceState.userId, userId),
        eq(financeAccountSourceState.accountId, accountId),
        eq(financeAccountSourceState.source, report.source),
      ),
    )
    .limit(1);
  // A source's row is what it *last knew*, so an older report from the same source does not
  // move it either — re-pasting yesterday's clipboard must not walk the browser stamp back.
  // Same comparison as between sources: strictly newer wins, a tie keeps what is stored.
  const advances =
    stored === undefined ||
    isStrictlyNewer(report, { asOf: stored.asOf, asOfDay: stored.asOfDay });
  if (!advances) {
    const unchanged = await recomputeAccountBalanceAuthority(
      executor,
      userId,
      accountId,
    );
    return { ...unchanged, headlineMoved: false };
  }

  const now = new Date();
  await executor
    .insert(financeAccountSourceState)
    .values({
      userId,
      accountId,
      source: report.source,
      balanceCents: report.balanceCents,
      availableCents: report.availableCents,
      asOf: report.asOf,
      asOfDay: report.asOfDay,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        financeAccountSourceState.userId,
        financeAccountSourceState.accountId,
        financeAccountSourceState.source,
      ],
      set: {
        balanceCents: report.balanceCents,
        availableCents: report.availableCents,
        asOf: report.asOf,
        asOfDay: report.asOfDay,
        updatedAt: now,
      },
    });

  return recomputeAccountBalanceAuthority(executor, userId, accountId, report.source);
}

/**
 * Re-derive one account's headline from its source rows.
 *
 * The single writer of `bank_account_links.balanceCents`, `availableCents`, `balanceAsOf`
 * and `balanceSource`. `expectedSource` is only used to report whether that source ended up
 * holding the headline, which is what a receipt needs to say when a stale import is
 * deliberately not applied (D4).
 */
export async function recomputeAccountBalanceAuthority(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
  expectedSource?: SourceKind,
): Promise<AuthorityResult> {
  const [link] = await executor
    .select({
      id: bankAccountLinks.id,
      balanceCents: bankAccountLinks.balanceCents,
      availableCents: bankAccountLinks.availableCents,
      balanceAsOf: bankAccountLinks.balanceAsOf,
      balanceSource: bankAccountLinks.balanceSource,
    })
    .from(bankAccountLinks)
    .where(
      and(
        eq(bankAccountLinks.userId, userId),
        eq(bankAccountLinks.accountId, accountId),
      ),
    )
    .limit(1);
  // A file import may record what it saw for an account with no bank link at all — that is
  // why the source rows are keyed on the account. There is simply no headline to derive.
  if (!link) return { headlineMoved: false, headlineSource: null, changes: [] };

  const rows = await executor
    .select({
      source: financeAccountSourceState.source,
      balanceCents: financeAccountSourceState.balanceCents,
      availableCents: financeAccountSourceState.availableCents,
      asOf: financeAccountSourceState.asOf,
      asOfDay: financeAccountSourceState.asOfDay,
    })
    .from(financeAccountSourceState)
    .where(
      and(
        eq(financeAccountSourceState.userId, userId),
        eq(financeAccountSourceState.accountId, accountId),
      ),
    );

  const candidates = rows.flatMap((row) =>
    isSourceKind(row.source) && row.balanceCents !== null
      ? [
          {
            source: row.source,
            stamp: { asOf: row.asOf, asOfDay: row.asOfDay },
            value: row,
          },
        ]
      : [],
  );
  const incumbent = isSourceKind(link.balanceSource) ? link.balanceSource : null;
  const winner = pickAuthoritative(candidates, incumbent);
  if (winner === null)
    return { headlineMoved: false, headlineSource: null, changes: [] };

  const after: LinkHeadline = {
    id: link.id,
    balanceCents: winner.value.balanceCents,
    availableCents: winner.value.availableCents,
    // A day-only source materializes as UTC noon of that day, the encoding `dates.md`
    // requires — so `toDateKey` reads back the day the file actually claimed on every
    // machine. The comparison never reads this column; it ranks the source rows.
    balanceAsOf:
      winner.value.asOf ??
      (winner.value.asOfDay === null ? null : fromDateKey(winner.value.asOfDay)),
    balanceSource: winner.source,
  };
  const before = auditShape(link);
  const changed = JSON.stringify(before) !== JSON.stringify(auditShape(after));
  if (changed) {
    await executor
      .update(bankAccountLinks)
      .set({
        balanceCents: after.balanceCents,
        availableCents: after.availableCents,
        balanceAsOf: after.balanceAsOf,
        balanceSource: after.balanceSource,
        updatedAt: new Date(),
      })
      .where(
        and(eq(bankAccountLinks.userId, userId), eq(bankAccountLinks.id, link.id)),
      );
  }

  return {
    headlineMoved: expectedSource === undefined || winner.source === expectedSource,
    headlineSource: winner.source,
    changes: changed
      ? [
          {
            entityType: "bank_balance",
            entityIdentity: link.id,
            before,
            after: auditShape(after),
          },
        ]
      : [],
  };
}

/**
 * Every source's stamp for a set of accounts, for the readers that decide pending authority.
 *
 * Accounts with no rows are absent from the map; a caller reads that as "no source has
 * reported", which the comparison already handles.
 */
export async function loadAccountSourceStamps(
  executor: FinanceExecutor,
  userId: string,
  accountIds?: readonly string[],
): Promise<Map<string, AccountSourceStamps>> {
  const out = new Map<string, AccountSourceStamps>();
  if (accountIds !== undefined && accountIds.length === 0) return out;

  const rows = await executor
    .select({
      accountId: financeAccountSourceState.accountId,
      source: financeAccountSourceState.source,
      asOf: financeAccountSourceState.asOf,
      asOfDay: financeAccountSourceState.asOfDay,
    })
    .from(financeAccountSourceState)
    .where(
      and(
        eq(financeAccountSourceState.userId, userId),
        ...(accountIds === undefined
          ? []
          : [inArray(financeAccountSourceState.accountId, [...accountIds])]),
      ),
    );

  for (const row of rows) {
    if (!isSourceKind(row.source)) continue;
    const bucket = out.get(row.accountId) ?? {};
    bucket[row.source] = { asOf: row.asOf, asOfDay: row.asOfDay };
    out.set(row.accountId, bucket);
  }
  return out;
}
