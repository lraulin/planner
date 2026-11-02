"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import {
  loadReviewCandidatesAction,
  setPayeeNotACommitmentAction,
  trackTransactionAsBillAction,
} from "@/app/(shell)/finances/actions";
import { Drawer, DrawerHeader, DrawerLeaveGuard } from "@/components/detail/Drawer";
import { CadenceSelect } from "@/components/finances/CadenceSelect";
import { DateText } from "@/components/date/DateText";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import {
  cadenceFromGapDays,
  cadenceLabel,
  detectCadence,
  nextDueFrom,
  type Cadence,
} from "@/lib/finances/recurringBills";
import { FormActions } from "@/components/detail/FormActions";
import { useBillDraft } from "../useBillDraft";

const FIELD =
  "min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]";
const BUTTON =
  "min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-1";

/** What the detectors think this is, absent a declared cadence. */
function proposedCadence(entry: RecurringMerchant): Cadence {
  return (
    entry.cadence ??
    detectCadence(entry.chargeKeys) ??
    cadenceFromGapDays(entry.observedGapDays) ?? { unit: "month", n: 1 }
  );
}

/**
 * Merchants regular enough to look like a bill or a subscription, but not yet claimed by an
 * envelope — surfaced on demand rather than as a permanent section
 * (`agent-os/specs/2026-08-23-2313-one-budget/` D8).
 *
 * Tier 2 ("spend"-shaped, tracked separately from bills) retired with this spec: every
 * candidate here becomes a `kind: 'bill'` envelope on accept, whatever shape the detector saw
 * it as — an irregular grocery run is still funded by its own cadence once tracked, exactly
 * like Rent.
 */
type ReviewList =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; review: readonly RecurringMerchant[] };

export function ReviewDrawer({
  todayKey,
  onClose,
  onSaved,
}: {
  todayKey: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ReviewList>({ status: "loading" });

  const accept = useCallback(
    (result: Awaited<ReturnType<typeof loadReviewCandidatesAction>>) =>
      setList(
        result.ok
          ? { status: "ready", review: result.data }
          : { status: "failed", message: result.error },
      ),
    [],
  );

  // The list is read when the drawer opens, because detection runs over every spend charge
  // and nothing else on the Bills page uses it. The drawer mounts only while it is open, so
  // mounting is "opening".
  useEffect(() => {
    let live = true;
    void loadReviewCandidatesAction().then((result) => {
      if (live) accept(result);
    });
    return () => {
      live = false;
    };
  }, [accept]);

  // A save changes what is claimed, so the list is read again rather than patched: the
  // server is the only place that knows which merchants are left.
  const saved = (message: string) => {
    onSaved(message);
    void loadReviewCandidatesAction().then(accept);
  };

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader titleId={titleId} title="Review" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="mb-3 text-[0.75rem] text-priority-a">{error}</p>}
        {list.status === "loading" ? (
          <p className="text-[0.8125rem] text-ink-muted" role="status">
            Looking for recurring charges…
          </p>
        ) : list.status === "failed" ? (
          <p className="text-[0.8125rem] text-priority-a">{list.message}</p>
        ) : list.review.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-muted">
            Nothing waiting on review — every regular merchant is already claimed.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.review.map((entry) => (
              <li key={entry.merchant} className="rounded border border-rule px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[0.875rem] font-medium text-ink">
                    {entry.merchant}
                  </span>
                  <span className="text-[0.75rem] text-ink-muted">
                    {formatUsd(entry.typicalCents)} ·{" "}
                    {cadenceLabel(proposedCadence(entry))} ·{" "}
                    {formatUsd(entry.annualCents)}/yr
                  </span>
                </div>
                <p className="mt-0.5 text-[0.75rem] text-ink-muted">
                  {entry.chargeCount} {entry.chargeCount === 1 ? "charge" : "charges"}
                  , last <DateText dateKey={entry.lastChargeOn} className="inline" />
                </p>

                {open === entry.merchant ? (
                  <ReviewForm
                    entry={entry}
                    todayKey={todayKey}
                    onCancel={() => setOpen(null)}
                    onSaved={(message) => {
                      setOpen(null);
                      saved(message);
                    }}
                    onError={setError}
                  />
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={() => {
                        setError(null);
                        setOpen(entry.merchant);
                      }}
                    >
                      Track as bill…
                    </button>
                    <DismissButton entry={entry} onSaved={saved} onError={setError} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

function DismissButton({
  entry,
  onSaved,
  onError,
}: {
  entry: RecurringMerchant;
  onSaved: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={`${BUTTON} text-ink-muted`}
      disabled={pending || entry.payeeId === null}
      title={
        entry.payeeId === null
          ? "This merchant has no payee yet — claim it from Register first."
          : undefined
      }
      onClick={() => {
        const { payeeId } = entry;
        if (payeeId === null) return;
        onError("");
        startTransition(async () => {
          const result = await setPayeeNotACommitmentAction(payeeId, true);
          if (!result.ok) {
            onError(result.error);
            return;
          }
          onSaved(`Dismissed ${entry.merchant}.`);
        });
      }}
    >
      Dismiss
    </button>
  );
}

function ReviewForm({
  entry,
  todayKey,
  onCancel,
  onSaved,
  onError,
}: {
  entry: RecurringMerchant;
  todayKey: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const initialCadence = proposedCadence(entry);
  const bill = useBillDraft(
    {
      name: entry.merchant,
      cadence: initialCadence,
      expectedCents: entry.typicalCents,
      lastChargeOn: entry.lastChargeOn,
      nextDueKey: nextDueFrom(entry.lastChargeOn, initialCadence, todayKey),
    },
    todayKey,
  );

  return (
    <form
      className="mt-2 flex flex-col gap-2 border-t border-rule pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (bill.name.trim() === "") return;
        onError("");
        startTransition(async () => {
          if (entry.lastTransactionId === null) {
            onError("This merchant has no charge to track from.");
            return;
          }
          const result = await trackTransactionAsBillAction(
            entry.lastTransactionId,
            bill.edit(true),
          );
          if (!result.ok) {
            onError(result.error);
            return;
          }
          onSaved(`Tracking ${bill.name.trim()} as a bill.`);
        });
      }}
    >
      <DrawerLeaveGuard dirty={bill.dirty} />
      <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
        Call it
        <input
          type="text"
          value={bill.name}
          autoFocus
          onChange={(event) => bill.setName(event.target.value)}
          aria-label="Name for this bill"
          className={FIELD}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-[0.75rem] text-ink-muted">
          Charged
          <CadenceSelect
            value={bill.cadence}
            onChange={bill.changeCadence}
            disabled={pending}
            ariaLabel="Cadence for this bill"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
          Amount
          <input
            type="text"
            inputMode="decimal"
            value={bill.amount}
            onChange={(event) => bill.setAmount(event.target.value)}
            aria-label="Amount for this bill"
            className={`${FIELD} w-24 text-right`}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
        Next charge
        <input
          type="date"
          value={bill.next}
          onChange={(event) => bill.changeNext(event.target.value)}
          aria-label="Next charge for this bill"
          className={FIELD}
        />
      </label>
      <FormActions
        submitLabel="Track as bill"
        pending={pending}
        disabled={bill.name.trim() === ""}
        onCancel={onCancel}
      />
    </form>
  );
}
