"use client";

import { useId, useMemo, useState, useTransition } from "react";
import {
  setPayeeNotACommitmentAction,
  trackTransactionAsBillAction,
} from "@/app/finances/actions";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
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
export function ReviewDrawer({
  review,
  todayKey,
  onClose,
  onSaved,
}: {
  review: readonly RecurringMerchant[];
  todayKey: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader titleId={titleId} title="Review" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="mb-3 text-[0.75rem] text-priority-a">{error}</p>}
        {review.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-muted">
            Nothing waiting on review — every regular merchant is already claimed.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {review.map((entry) => (
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
                      onSaved(message);
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
                    <DismissButton entry={entry} onSaved={onSaved} onError={setError} />
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
        if (entry.payeeId === null) return;
        onError("");
        startTransition(async () => {
          const result = await setPayeeNotACommitmentAction(entry.payeeId!, true);
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
  const [name, setName] = useState(entry.merchant);
  const initialCadence = useMemo(() => proposedCadence(entry), [entry]);
  const [cadence, setCadence] = useState<Cadence>(initialCadence);
  const [amount, setAmount] = useState((entry.typicalCents / 100).toFixed(2));
  const [next, setNext] = useState(() =>
    nextDueFrom(entry.lastChargeOn, initialCadence, todayKey),
  );
  const [nextTouched, setNextTouched] = useState(false);
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);

  function changeCadence(value: Cadence) {
    setCadence(value);
    if (!nextTouched) setNext(nextDueFrom(entry.lastChargeOn, value, todayKey));
  }

  return (
    <form
      className="mt-2 flex flex-col gap-2 border-t border-rule pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === "") return;
        onError("");
        startTransition(async () => {
          if (entry.lastTransactionId === null) {
            onError("This merchant has no charge to track from.");
            return;
          }
          const result = await trackTransactionAsBillAction(entry.lastTransactionId, {
            name: name.trim(),
            cadence,
            expectedCents: cents > 0 ? cents : null,
            anchorDate: next || null,
            scheduled: true,
          });
          if (!result.ok) {
            onError(result.error);
            return;
          }
          onSaved(`Tracking ${name.trim()} as a bill.`);
        });
      }}
    >
      <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
        Call it
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          aria-label="Name for this bill"
          className={FIELD}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-[0.75rem] text-ink-muted">
          Charged
          <CadenceSelect
            value={cadence}
            onChange={changeCadence}
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
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Amount for this bill"
            className={`${FIELD} w-24 text-right`}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
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
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || name.trim() === ""}
          className="min-h-tap rounded border border-select-edge bg-select px-3 text-[0.8125rem] font-medium text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          {pending ? "Saving…" : "Track as bill"}
        </button>
      </div>
    </form>
  );
}
