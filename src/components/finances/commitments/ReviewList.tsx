"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { DateText } from "@/components/date/DateText";
import {
  DEFAULT_REVIEW_SORT,
  nextReviewSort,
  sortReviewItems,
  type ReviewSort,
  type ReviewSortColumn,
} from "@/lib/finances/reviewSort";
import {
  cadenceFromGapDays,
  cadenceLabel,
  cadenceOf,
  detectCadence,
  nextDueFrom,
  type Cadence,
} from "@/lib/finances/recurringBills";
import {
  aliasOverlap,
  suggestCommitmentName,
  type CommitmentCharge,
  type StoredBillRow,
  type StoredSpend,
} from "@/lib/finances/commitments";
import {
  deleteCommitmentAction,
  setCommitmentPayeesAction,
  setRecurringBillAction,
  setRecurringSpendAction,
} from "@/app/finances/actions";
import { formatDateKey } from "@/lib/dateFormat";
import { CadenceSelect } from "../CadenceSelect";
import { PanelEmpty } from "../insights/Panel";

/**
 * The cadence to open a bill draft on.
 *
 * `detectCadence` over the real dates first, because it is the only thing that can tell a
 * 28-day autoship from a monthly bill; the observed median gap is the fallback for a candidate
 * whose dates did not survive the trip, and monthly the fallback for that.
 */
function proposedCadence(entry: RecurringMerchant): Cadence {
  return (
    entry.cadence ??
    detectCadence(entry.chargeKeys) ??
    cadenceFromGapDays(entry.observedGapDays) ?? { unit: "month", n: 1 }
  );
}

/** What the detector thinks this is, in the words the two buttons use. */
function shapeLabel(entry: RecurringMerchant): string {
  if (entry.shape === "spend") {
    const period = entry.spendPeriod === "month" ? "months" : "weeks";
    return entry.coverage === null
      ? `Most ${period}`
      : `${Math.round(entry.coverage * 100)}% of ${period}`;
  }
  return cadenceLabel(proposedCadence(entry));
}

/** Which row is open for editing, and as what. Only ever one at a time. */
type Draft = { merchant: string; kind: "bill" | "spend" };

const FIELD =
  "min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]";
const BUTTON =
  "min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1";

function ReviewSortHeader({
  column,
  label,
  align,
  sort,
  onSort,
}: {
  column: ReviewSortColumn;
  label: string;
  align?: "right";
  sort: ReviewSort;
  onSort: (next: ReviewSort) => void;
}) {
  const active = sort.column === column;
  return (
    <th
      className={`py-1 pr-2 font-normal ${align === "right" ? "text-right" : ""}`}
      aria-sort={
        active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(nextReviewSort(sort, column))}
        className="text-ink-muted hover:text-ink"
      >
        {label}
        {active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

/**
 * Detected charges that are not yet a commitment.
 *
 * **Propose, never apply.** Every button here used to write a row on the first click, naming it
 * after the bank's string — which is how tracking Pizza Hut produced a commitment called
 * `PIZZA HUT #4471` rather than joining the Pizza group it was meant for, and how declaring
 * 1Password produced `1PASSWORDTORONTOON`. Display names and stable payee identity are split in the
 * schema to fix exactly that, and the surface that creates rows never got the benefit.
 *
 * So the two tracking buttons now open the row in place — the `ItemList` precedent, not a modal
 * — with the name pre-filled and editable, and a second click commits. Dismiss stays one click:
 * it is reversible from the disclosure at the foot of this list.
 */
export function ReviewList({
  items,
  dismissed,
  bills,
  spend,
  billCharges,
  todayKey,
}: {
  items: RecurringMerchant[];
  dismissed: StoredBillRow[];
  /** Live bills, so a second spelling can be folded into one that already exists. */
  bills: StoredBillRow[];
  spend: StoredSpend[];
  /** Charges per declared bill, for the alias-overlap check. */
  billCharges: ReadonlyMap<string, readonly CommitmentCharge[]>;
  /** Null until the client knows its own date, which is when a prefill is skipped. */
  todayKey: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [sort, setSort] = useState(DEFAULT_REVIEW_SORT);
  const rows = useMemo(() => sortReviewItems(items, sort), [items, sort]);
  /**
   * Review reports its own failures, in Review.
   *
   * The page-level error line sits above the two grids, which was fine when this list did
   * too. Once Review moved to the foot of the page a refused write — a merchant another
   * commitment already claims, most often — put its explanation a full screen above the
   * button that caused it, so the change simply appeared to undo itself.
   */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else {
        setError(null);
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
      {error !== null && (
        <p
          role="alert"
          className="mb-2 rounded border border-[var(--chart-spend)] px-2 py-1 text-[0.75rem] text-ink"
        >
          {error}
        </p>
      )}
      {/* Tall enough for an expanded draft and its warning. At `max-h-64` the commit button
          sat below the fold the moment a row was opened. */}
      <div className="max-h-96 min-w-0 overflow-auto">
        <table className="w-full min-w-[40rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
              <ReviewSortHeader
                column="merchant"
                label="Merchant"
                sort={sort}
                onSort={setSort}
              />
              <ReviewSortHeader
                column="shape"
                label="Looks like"
                sort={sort}
                onSort={setSort}
              />
              <ReviewSortHeader
                column="typical"
                label="Typical"
                align="right"
                sort={sort}
                onSort={setSort}
              />
              <ReviewSortHeader
                column="annual"
                label="A year"
                align="right"
                sort={sort}
                onSort={setSort}
              />
              <ReviewSortHeader
                column="lastCharge"
                label="Last charge"
                sort={sort}
                onSort={setSort}
              />
              <th className="py-1 font-normal"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
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
                      {shapeLabel(entry)}
                      {entry.shape === "spend" && (
                        <span className="mt-0.5 block text-[0.7rem] text-ink-faint">
                          {formatUsd(entry.lowCents)}–{formatUsd(entry.highCents)} a
                          visit
                        </span>
                      )}
                    </td>
                    <td className="tabular py-1.5 pr-2 text-right text-ink">
                      {formatUsd(entry.typicalCents)}
                    </td>
                    <td className="tabular py-1.5 pr-2 text-right text-[var(--chart-spend)]">
                      {formatUsd(entry.annualCents)}
                    </td>
                    <td className="py-1.5 pr-2 text-ink-muted">
                      <DateText dateKey={entry.lastChargeOn} className="inline" />
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        {/*
                         * Ordered by what the detector found, and the proposed one is the
                         * filled button. Both stay on every row: the shape is a suggestion,
                         * and whether Sheetz is petrol or a subscription is the user's call.
                         */}
                        {(entry.shape === "spend"
                          ? (["spend", "bill"] as const)
                          : (["bill", "spend"] as const)
                        ).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            disabled={pending || entry.payeeId === null}
                            title={
                              entry.payeeId === null
                                ? "Reclassify transactions to assign a payee first."
                                : undefined
                            }
                            aria-expanded={open === kind}
                            onClick={() =>
                              setDraft(
                                open === kind
                                  ? null
                                  : { merchant: entry.merchant, kind },
                              )
                            }
                            className={
                              kind === entry.shape
                                ? `${BUTTON} bg-surface-raised`
                                : BUTTON
                            }
                          >
                            {kind === "bill" ? "Track as bill" : "Track as spend"}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={pending || entry.payeeId === null}
                          title="Not a commitment. You can bring it back from Dismissed below."
                          onClick={() =>
                            run(() =>
                              setRecurringBillAction({
                                name: entry.merchant,
                                payeeIds: entry.payeeId ? [entry.payeeId] : [],
                                cadence: proposedCadence(entry),
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
                      <td colSpan={6} className="pb-2">
                        {open === "bill" ? (
                          <BillDraft
                            entry={entry}
                            bills={bills}
                            billCharges={billCharges}
                            todayKey={todayKey}
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

/**
 * The proposal for a bill: everything `NewBillForm` asks for, already filled in.
 *
 * **Next charge is filled in.** It opened empty, which made the one field the app could
 * actually work out the field the user had to look up: the last charge and the cadence are
 * both right here. It follows the cadence dropdown until the field is edited, and then stops —
 * a prefill that overwrites a typed answer is worse than no prefill.
 *
 * **Add to an existing bill** is the other half. A vendor renames itself and the same bill
 * arrives on this list under a second spelling; folding it in is a rename, and the warning
 * below is what distinguishes that from two bills that merely look alike.
 */
function BillDraft({
  entry,
  bills,
  billCharges,
  todayKey,
  pending,
  onCancel,
  onCommit,
}: {
  entry: RecurringMerchant;
  bills: StoredBillRow[];
  billCharges: ReadonlyMap<string, readonly CommitmentCharge[]>;
  todayKey: string | null;
  pending: boolean;
  onCancel: () => void;
  onCommit: (work: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [name, setName] = useState(() => suggestCommitmentName(entry.merchant));
  const [cadence, setCadence] = useState<Cadence>(() => proposedCadence(entry));
  const [amount, setAmount] = useState(() => (entry.typicalCents / 100).toFixed(2));
  const [next, setNext] = useState(() => suggestedNextCharge(entry, cadence, todayKey));
  const [nextTouched, setNextTouched] = useState(false);
  const [target, setTarget] = useState("");
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);

  const joining = target !== "";
  const group = bills.find((row) => row.name === target);
  const overlaps =
    group === undefined
      ? []
      : aliasOverlap(
          billCharges.get(group.name) ?? [],
          entry.chargeKeys.map((dateKey) => ({ dateKey })),
          cadenceOf(group),
        );

  function changeCadence(value: Cadence) {
    setCadence(value);
    if (!nextTouched) setNext(suggestedNextCharge(entry, value, todayKey));
  }

  return (
    <DraftShell
      title="Track as a subscription or bill"
      merchant={entry.merchant}
      pending={pending}
      disabled={
        entry.payeeId === null || (joining ? group === undefined : name.trim() === "")
      }
      commitLabel={joining ? `Add to ${target}` : "Track as bill"}
      onCancel={onCancel}
      onCommit={() =>
        onCommit(() =>
          joining && group !== undefined
            ? setCommitmentPayeesAction({
                kind: "bill",
                id: group.id,
                payeeIds: [
                  ...group.payees.map((payee) => payee.id),
                  ...(entry.payeeId ? [entry.payeeId] : []),
                ],
              })
            : setRecurringBillAction({
                name: name.trim(),
                payeeIds: entry.payeeId ? [entry.payeeId] : [],
                cadence,
                expectedCents: cents > 0 ? cents : null,
                anchorDate: next || null,
                scheduled: true,
              }),
        )
      }
      warning={
        overlaps.length > 0 && group !== undefined ? (
          <AliasWarning
            existingName={group.name}
            merchant={entry.merchant}
            overlaps={overlaps}
          />
        ) : null
      }
    >
      {bills.length > 0 && (
        <label className="flex items-center gap-1 text-ink-muted">
          Bill
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            aria-label="Existing bill to add this merchant to"
            className={FIELD}
          >
            <option value="">New bill</option>
            {bills.map((row) => (
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
              aria-label="Name for this bill"
              className={`${FIELD} w-40`}
            />
          </label>
          <label className="flex items-center gap-1 text-ink-muted">
            Charged
            <CadenceSelect
              value={cadence}
              onChange={changeCadence}
              ariaLabel="Cadence for this bill"
              className={FIELD}
            />
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
              onChange={(event) => {
                setNextTouched(true);
                setNext(event.target.value);
              }}
              aria-label="Next charge for this bill"
              className={FIELD}
            />
          </label>
        </>
      )}
    </DraftShell>
  );
}

/**
 * Where the next charge lands, from the last one on file and the cadence the draft is showing.
 *
 * Empty when there is no charge to walk from — a date invented out of nothing would read as
 * knowledge, which is the rule the cadence specs set for the forecast and applies just as much
 * to a prefilled field.
 */
function suggestedNextCharge(
  entry: RecurringMerchant,
  cadence: Cadence,
  todayKey: string | null,
): string {
  if (entry.lastChargeOn === "" || todayKey === null) return "";
  return nextDueFrom(entry.lastChargeOn, cadence, todayKey);
}

/**
 * Two spellings of one bill charging inside the same cycle.
 *
 * Shown, never enforced. A vendor migrating billing systems can genuinely charge twice in the
 * month it moves, and the commit button stays live — but if these two really are separate
 * bills, merging them halves what the commitment appears to cost, and nothing downstream would
 * ever say so.
 */
function AliasWarning({
  existingName,
  merchant,
  overlaps,
}: {
  existingName: string;
  merchant: string;
  overlaps: ReturnType<typeof aliasOverlap>;
}) {
  // The most recent pairs, each read in date order — "Aug 19 + Aug 26" rather than whichever
  // side happened to be the existing one.
  const shown = overlaps.slice(-2).map((overlap) => {
    const pair = [overlap.existingKey, overlap.candidateKey].sort();
    return `${formatDateKey(pair[0])} + ${formatDateKey(pair[1])}`;
  });

  return (
    <p className="mt-2 rounded border border-[var(--chart-spend)] px-2 py-1 text-[0.7rem] text-ink">
      <strong className="font-medium">Check this one.</strong> {existingName} and{" "}
      {merchant} charged inside the same cycle{" "}
      {overlaps.length === 1 ? "once" : `${overlaps.length} times`} ({shown.join(", ")}
      {overlaps.length > shown.length ? ", and earlier" : ""}). A renamed vendor hands
      off; this looks more like two separate bills.
    </p>
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
  const [period, setPeriod] = useState<"week" | "month">(
    () => entry.spendPeriod ?? (entry.observedGapDays <= 9 ? "week" : "month"),
  );
  const [target, setTarget] = useState("");
  const joining = target !== "";
  const group = spend.find((row) => row.name === target);

  return (
    <DraftShell
      title="Track as recurring spend"
      merchant={entry.merchant}
      pending={pending}
      disabled={
        entry.payeeId === null || (joining ? group === undefined : name.trim() === "")
      }
      commitLabel={joining ? `Add to ${target}` : "Track as spend"}
      onCancel={onCancel}
      onCommit={() =>
        onCommit(() =>
          joining && group !== undefined
            ? setCommitmentPayeesAction({
                kind: "spend",
                id: group.id,
                payeeIds: [
                  ...group.payees.map((payee) => payee.id),
                  ...(entry.payeeId ? [entry.payeeId] : []),
                ],
              })
            : setRecurringSpendAction({
                name: name.trim(),
                payeeIds: entry.payeeId ? [entry.payeeId] : [],
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
  warning,
  children,
}: {
  title: string;
  merchant: string;
  pending: boolean;
  disabled: boolean;
  commitLabel: string;
  onCancel: () => void;
  onCommit: () => void;
  /** Shown above the verbs, where it cannot be committed past without being read. */
  warning?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-rule bg-surface-raised p-2 text-[0.75rem]">
      <p className="mb-1.5 text-ink">{title}</p>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {children}
      </div>
      {warning}
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
