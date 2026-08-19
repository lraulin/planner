"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import {
  CADENCE_CHOICES,
  cadenceLabel,
  cadenceMonthsFromGapDays,
} from "@/lib/finances/recurringBills";
import {
  suggestCommitmentName,
  type StoredBillRow,
  type StoredSpend,
} from "@/lib/finances/commitments";
import {
  deleteCommitmentAction,
  setRecurringBillAction,
  setRecurringSpendAction,
} from "@/app/finances/actions";
import { PanelEmpty } from "../insights/Panel";

function detectedCadenceLabel(days: number): string {
  if (days <= 9) return "Weekly";
  if (days <= 18) return "Fortnightly";
  if (days <= 45) return "Monthly";
  if (days <= 75) return "Every 2 months";
  return "Quarterly";
}

function cadenceOf(entry: RecurringMerchant): number {
  return entry.cadenceMonths ?? cadenceMonthsFromGapDays(entry.cadenceDays) ?? 1;
}

/** Which row is open for editing, and as what. Only ever one at a time. */
type Draft = { merchant: string; kind: "bill" | "spend" };

const FIELD =
  "min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]";
const BUTTON =
  "min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1";

/**
 * Detected charges that are not yet a commitment.
 *
 * **Propose, never apply.** Every button here used to write a row on the first click, naming it
 * after the bank's string — which is how tracking Pizza Hut produced a commitment called
 * `PIZZA HUT #4471` rather than joining the Pizza group it was meant for, and how declaring
 * 1Password produced `1PASSWORDTORONTOON`. The name and the matchers were split apart in the
 * schema to fix exactly that, and the surface that creates rows never got the benefit.
 *
 * So the two tracking buttons now open the row in place — the `ItemList` precedent, not a modal
 * — with the name pre-filled and editable, and a second click commits. Dismiss stays one click:
 * it is reversible from the disclosure at the foot of this list.
 */
export function ReviewList({
  items,
  dismissed,
  spend,
  onError,
}: {
  items: RecurringMerchant[];
  dismissed: StoredBillRow[];
  spend: StoredSpend[];
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    if (draft === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) onError(result.error ?? "Could not save.");
      else {
        setDraft(null);
        router.refresh();
      }
    });
  }

  if (items.length === 0 && dismissed.length === 0) {
    return (
      <PanelEmpty>
        Nothing new looks like a subscription. Charges you have already tracked or
        dismissed stay off this list.
      </PanelEmpty>
    );
  }

  return (
    <div className="min-w-0">
      <div className="max-h-64 min-w-0 overflow-auto">
        <table className="w-full min-w-[32rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
              <th className="py-1 pr-2 font-normal">Merchant</th>
              <th className="py-1 pr-2 font-normal">Looks like</th>
              <th className="py-1 pr-2 text-right font-normal">Typical</th>
              <th className="py-1 pr-2 text-right font-normal">A year</th>
              <th className="py-1 font-normal"> </th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => {
              const open = draft?.merchant === entry.merchant ? draft.kind : null;
              return (
                // Two rows, not one flex row: the draft has to span the full width while the
                // proposal above it stays lined up under the column heads.
                <Fragment key={entry.merchant}>
                  <tr className={open === null ? "border-b border-rule" : ""}>
                    <td className="max-w-[12rem] truncate py-1.5 pr-2 text-ink">
                      {entry.merchant}
                      <span className="mt-0.5 block text-[0.7rem] text-ink-muted">
                        {entry.chargeCount} charges
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-ink-muted">
                      {entry.cadenceMonths !== null
                        ? cadenceLabel(entry.cadenceMonths)
                        : detectedCadenceLabel(entry.cadenceDays)}
                    </td>
                    <td className="tabular py-1.5 pr-2 text-right text-ink">
                      {formatUsd(entry.typicalCents)}
                    </td>
                    <td className="tabular py-1.5 pr-2 text-right text-[var(--chart-spend)]">
                      {formatUsd(entry.annualCents)}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          aria-expanded={open === "bill"}
                          onClick={() =>
                            setDraft(
                              open === "bill"
                                ? null
                                : { merchant: entry.merchant, kind: "bill" },
                            )
                          }
                          className={`${BUTTON} bg-surface-raised`}
                        >
                          Track as bill
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          aria-expanded={open === "spend"}
                          onClick={() =>
                            setDraft(
                              open === "spend"
                                ? null
                                : { merchant: entry.merchant, kind: "spend" },
                            )
                          }
                          className={BUTTON}
                        >
                          Track as spend
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          title="Not a commitment. You can bring it back from Dismissed below."
                          onClick={() =>
                            run(() =>
                              setRecurringBillAction({
                                name: entry.merchant,
                                matchers: [entry.merchant],
                                cadenceMonths: cadenceOf(entry),
                                status: "ignored",
                              }),
                            )
                          }
                          className={`${BUTTON} text-ink-muted`}
                        >
                          Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open !== null && (
                    <tr className="border-b border-rule">
                      <td colSpan={5} className="pb-2">
                        {open === "bill" ? (
                          <BillDraft
                            entry={entry}
                            pending={pending}
                            onCancel={() => setDraft(null)}
                            onCommit={run}
                          />
                        ) : (
                          <SpendDraft
                            entry={entry}
                            spend={spend}
                            pending={pending}
                            onCancel={() => setDraft(null)}
                            onCommit={run}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {dismissed.length > 0 && (
        <div className="mt-2 border-t border-rule pt-2 text-[0.75rem]">
          <button
            type="button"
            onClick={() => setShowDismissed((current) => !current)}
            className="text-ink-muted hover:text-ink"
          >
            {dismissed.length} dismissed · {showDismissed ? "Hide" : "Show"}
          </button>
          {showDismissed && (
            <ul className="mt-1 flex flex-col gap-1">
              {dismissed.map((row) => (
                <li key={row.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {row.name}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    title="Put it back on the review list"
                    onClick={() =>
                      run(() =>
                        deleteCommitmentAction({ kind: "bill", name: row.name }),
                      )
                    }
                    className={BUTTON}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The proposal for a bill: everything `NewBillForm` asks for, already filled in. */
function BillDraft({
  entry,
  pending,
  onCancel,
  onCommit,
}: {
  entry: RecurringMerchant;
  pending: boolean;
  onCancel: () => void;
  onCommit: (work: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [name, setName] = useState(() => suggestCommitmentName(entry.merchant));
  const [cadence, setCadence] = useState(() => cadenceOf(entry));
  const [amount, setAmount] = useState(() => (entry.typicalCents / 100).toFixed(2));
  const [next, setNext] = useState("");
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);

  return (
    <DraftShell
      title="Track as a subscription or bill"
      merchant={entry.merchant}
      pending={pending}
      disabled={name.trim() === ""}
      commitLabel="Track as bill"
      onCancel={onCancel}
      onCommit={() =>
        onCommit(() =>
          setRecurringBillAction({
            name: name.trim(),
            matchers: [entry.merchant],
            cadenceMonths: cadence,
            expectedCents: cents > 0 ? cents : null,
            anchorDate: next || null,
            scheduled: true,
          }),
        )
      }
    >
      <label className="flex items-center gap-1 text-ink-muted">
        Call it
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          aria-label="Name for this bill"
          className={`${FIELD} w-40`}
        />
      </label>
      <label className="flex items-center gap-1 text-ink-muted">
        Charged
        <select
          value={cadence}
          onChange={(event) => setCadence(Number(event.target.value))}
          aria-label="Cadence for this bill"
          className={FIELD}
        >
          {CADENCE_CHOICES.map((months) => (
            <option key={months} value={months}>
              {cadenceLabel(months)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-ink-muted">
        Amount
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label="Amount for this bill"
          className={`${FIELD} w-24 text-right`}
        />
      </label>
      <label className="flex items-center gap-1 text-ink-muted">
        Next charge
        <input
          type="date"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          aria-label="Next charge for this bill"
          className={FIELD}
        />
      </label>
    </DraftShell>
  );
}

/**
 * The proposal for recurring spend, where the interesting choice is not the name.
 *
 * "Add to an existing group" is the whole reason this editor exists: Pizza Hut and Domino's are
 * one commitment called Pizza, and until now the only way to say so was to delete the row the
 * button had just written and retype it in the form below the grid.
 */
function SpendDraft({
  entry,
  spend,
  pending,
  onCancel,
  onCommit,
}: {
  entry: RecurringMerchant;
  spend: StoredSpend[];
  pending: boolean;
  onCancel: () => void;
  onCommit: (work: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [name, setName] = useState(() => suggestCommitmentName(entry.merchant));
  const [period, setPeriod] = useState<"week" | "month">(() =>
    entry.cadenceDays <= 9 ? "week" : "month",
  );
  const [target, setTarget] = useState("");
  const joining = target !== "";
  const group = spend.find((row) => row.name === target);

  return (
    <DraftShell
      title="Track as recurring spend"
      merchant={entry.merchant}
      pending={pending}
      disabled={joining ? group === undefined : name.trim() === ""}
      commitLabel={joining ? `Add to ${target}` : "Track as spend"}
      onCancel={onCancel}
      onCommit={() =>
        onCommit(() =>
          joining && group !== undefined
            ? setRecurringSpendAction({
                name: group.name,
                matchers: [...group.matchers, entry.merchant],
              })
            : setRecurringSpendAction({
                name: name.trim(),
                matchers: [entry.merchant],
                period,
              }),
        )
      }
    >
      {spend.length > 0 && (
        <label className="flex items-center gap-1 text-ink-muted">
          Group
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            aria-label="Existing group to add this merchant to"
            className={FIELD}
          >
            <option value="">New group</option>
            {spend.map((row) => (
              <option key={row.id} value={row.name}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!joining && (
        <>
          <label className="flex items-center gap-1 text-ink-muted">
            Call it
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              aria-label="Name for this recurring spend"
              className={`${FIELD} w-40`}
            />
          </label>
          <label className="flex items-center gap-1 text-ink-muted">
            Every
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as "week" | "month")}
              aria-label="Period for this recurring spend"
              className={FIELD}
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
        </>
      )}
    </DraftShell>
  );
}

/** The frame both proposals share: what it becomes, what it matches, and the two verbs. */
function DraftShell({
  title,
  merchant,
  pending,
  disabled,
  commitLabel,
  onCancel,
  onCommit,
  children,
}: {
  title: string;
  merchant: string;
  pending: boolean;
  disabled: boolean;
  commitLabel: string;
  onCancel: () => void;
  onCommit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-rule bg-surface-raised p-2 text-[0.75rem]">
      <p className="mb-1.5 text-ink">{title}</p>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {children}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-ink-muted">Matches {merchant}</span>
        <span className="flex gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className={BUTTON}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || disabled}
            onClick={onCommit}
            className={`${BUTTON} bg-surface-raised`}
          >
            {commitLabel}
          </button>
        </span>
      </div>
    </div>
  );
}
