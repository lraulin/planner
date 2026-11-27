"use client";

import { NavLink } from "@/components/shell/NavLink";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import type { AccountMismatch } from "@/lib/finances/budget/accountDrift";
import { monthEndKey, shiftMonthKey } from "@/lib/finances/budget/envelope";
import type { CandidateReading } from "@/lib/finances/budget/mismatchCandidate";
import type {
  MismatchCandidate,
  MismatchClues,
} from "@/lib/finances/budget/mismatchClues";
import { formatUsd } from "@/lib/finances/money";

/**
 * Why one account disagrees with the bank, at the top of its drawer — where the Budget
 * warning's Review button lands. The subtraction first (the terms arrive computed, like
 * Ready to Assign's), then the rows that could explain it, then the write that moved it,
 * then the one deliberate fix.
 */
export function MismatchExplainer({
  mismatch,
  clues,
  onReconcile,
}: {
  mismatch: AccountMismatch;
  clues: MismatchClues | null;
  onReconcile: () => void;
}) {
  const formatDate = useDateFormatter();
  if (!clues) return null;
  const startLabel = formatDate(clues.startMonth);
  const openingLabel = formatDate(monthEndKey(shiftMonthKey(clues.startMonth, -1)));
  const registerSaysCents = mismatch.openingCents + mismatch.sinceStartCents;
  const candidates = clues.candidatesByAccount[mismatch.accountId] ?? [];
  const gap = formatUsd(Math.abs(mismatch.mismatchCents));

  return (
    <section
      role="status"
      aria-label="Doesn't match the bank"
      className="mb-3 space-y-3 rounded border border-[var(--goal-unmet)] bg-[var(--goal-unmet)]/10 p-3 text-xs text-ink"
    >
      <h3 className="text-[0.8125rem] font-medium">
        <span aria-hidden="true" className="text-[var(--goal-unmet)]">
          ⚠
        </span>{" "}
        Doesn&rsquo;t match the bank by{" "}
        <span className="tabular">{formatUsd(mismatch.mismatchCents)}</span>
      </h3>

      <dl className="tabular max-w-sm">
        <Term label={`Opening on ${openingLabel}`} cents={mismatch.openingCents} />
        <Term
          label={`+ Register rows since ${startLabel}`}
          cents={mismatch.sinceStartCents}
        />
        <Term label="= Register says" cents={registerSaysCents} ruled />
        <Term label="Bank says (working balance)" cents={mismatch.workingCents} />
        <Term label="Difference" cents={mismatch.mismatchCents} ruled strong />
      </dl>

      {candidates.length > 0 ? (
        <div>
          <p className="text-ink-muted">
            {candidates.length === 1 ? "This row is" : "These rows are each"} exactly{" "}
            {gap} and would explain it:
          </p>
          <ul className="mt-1 space-y-1">
            {candidates.map((row) => (
              <Candidate key={row.transactionId} row={row} startLabel={startLabel} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-ink-muted">
          No register row on this account is exactly {gap}. That usually means the bank
          has {mismatch.mismatchCents < 0 ? "a charge" : "a credit"} since {startLabel}{" "}
          the register is missing, or a charge posted for a different amount than its
          hold. Compare the bank&rsquo;s recent activity with the{" "}
          <NavLink className="underline" href="/finances/register">
            Register
          </NavLink>
          .
        </p>
      )}

      {clues.lastChange ? (
        <p className="text-ink-muted">
          The budget&rsquo;s mismatch total went from{" "}
          <span className="tabular">{formatUsd(clues.lastChange.beforeCents)}</span> to{" "}
          <span className="tabular">{formatUsd(clues.lastChange.afterCents)}</span> with{" "}
          <NavLink
            className="underline"
            href={`/finances/activity?event=${encodeURIComponent(clues.lastChange.eventId)}`}
          >
            {clues.lastChange.summary}
          </NavLink>{" "}
          · {timeLabel(clues.lastChange.occurredAt)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onReconcile}
          className="min-h-tap rounded border border-[var(--goal-unmet)] px-2 py-1 text-ink hover:bg-[color-mix(in_srgb,var(--goal-unmet)_16%,transparent)] md:min-h-0"
        >
          Reconcile…
        </button>
        <span className="text-ink-muted">
          If the bank is right and no row is wrong: writes a{" "}
          {formatUsd(mismatch.mismatchCents)} adjustment dated today, which moves Ready
          to Assign by the same amount.
        </span>
      </div>
    </section>
  );
}

function Term({
  label,
  cents,
  ruled = false,
  strong = false,
}: {
  label: string;
  cents: number;
  ruled?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${ruled ? "mt-1 border-t border-rule pt-1" : ""}`}
    >
      <dt className={strong ? "text-ink" : "text-ink-muted"}>{label}</dt>
      <dd className={strong ? "font-medium text-[var(--goal-unmet)]" : "text-ink"}>
        {formatUsd(cents)}
      </dd>
    </div>
  );
}

function Candidate({
  row,
  startLabel,
}: {
  row: MismatchCandidate;
  startLabel: string;
}) {
  const formatDate = useDateFormatter();
  return (
    <li>
      <NavLink
        className="underline"
        href={`/finances/register?detail=${encodeURIComponent(row.transactionId)}`}
      >
        {formatDate(row.transactionDate)} · {row.description}
      </NavLink>{" "}
      <span className="tabular">{formatUsd(row.amountCents)}</span>
      {row.pending ? <span className="text-ink-muted"> · pending</span> : null}
      <span className="block text-ink-muted">
        {readingText(row.reading, startLabel)}
      </span>
    </li>
  );
}

function readingText(reading: CandidateReading, startLabel: string): string {
  switch (reading) {
    case "extra-since-start":
      return "Counted in the register but not by the bank — a duplicate, or a hold that never posted? Deleting it closes the gap.";
    case "dated-before-start":
      return `Dated before ${startLabel}, so it moves the balance but isn't among the rows since then — misdated, or imported after the opening was recorded?`;
  }
}

function timeLabel(value: Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
