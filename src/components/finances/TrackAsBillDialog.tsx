"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/detail/ModalShell";
import { useToday } from "@/components/grid/useToday";
import {
  loadTrackAsBillDraftAction,
  trackTransactionAsBillAction,
} from "@/app/finances/actions";
import { nextDueFrom, type Cadence } from "@/lib/finances/recurringBills";
import type { ClaimedPayee, TrackAsBillDraft } from "@/lib/finances/registerBillDraft";
import { CadenceSelect } from "./CadenceSelect";

const FIELD =
  "min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]";

/**
 * Confirm a bill declared from a Register row.
 *
 * Unmounted when closed, so the next open starts clean (`modal-pattern`). Closing is the
 * success signal; a refused write stays here with the error.
 */
export function TrackAsBillDialog({
  selectedId,
  onClose,
  onSaved,
}: {
  selectedId: string;
  onClose: () => void;
  onSaved: (claimed: ClaimedPayee) => void;
}) {
  const todayKey = useToday();
  const [seed, setSeed] = useState<TrackAsBillDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (todayKey === null) return;
    void loadTrackAsBillDraftAction(selectedId, todayKey).then((result) => {
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setSeed(result.data);
    });
  }, [selectedId, todayKey]);
  if (todayKey === null) return null;
  if (seed === null) {
    return (
      <ModalShell
        open
        onClose={onClose}
        labelledBy="track-as-bill-loading"
        width="max-w-md"
      >
        <div className="p-5 text-[0.8125rem] text-ink-muted">
          {loadError ?? "Reading this merchant’s charges…"}
        </div>
      </ModalShell>
    );
  }
  return (
    <TrackAsBillForm
      seed={seed}
      todayKey={todayKey}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function TrackAsBillForm({
  seed,
  todayKey,
  onClose,
  onSaved,
}: {
  seed: TrackAsBillDraft;
  todayKey: string;
  onClose: () => void;
  onSaved: (claimed: ClaimedPayee) => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(seed.name);
  const [cadence, setCadence] = useState<Cadence>(seed.cadence);
  const [amount, setAmount] = useState((seed.expectedCents / 100).toFixed(2));
  const [next, setNext] = useState(seed.nextDueKey);
  const [nextTouched, setNextTouched] = useState(false);
  const [scheduled, setScheduled] = useState(true);
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);

  function changeCadence(value: Cadence) {
    setCadence(value);
    if (!nextTouched) setNext(nextDueFrom(seed.lastChargeOn, value, todayKey));
  }

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-md">
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() === "") return;
          setError(null);
          startTransition(async () => {
            const result = await trackTransactionAsBillAction(seed.transactionId, {
              name: name.trim(),
              cadence,
              expectedCents: cents > 0 ? cents : null,
              anchorDate: scheduled ? next || null : null,
              scheduled,
            });
            if (!result.ok || !result.data) {
              setError(
                result.ok
                  ? "Could not assign a payee for this merchant."
                  : result.error,
              );
              return;
            }
            onSaved({
              payeeId: result.data.payeeId,
              merchant: seed.merchant,
              name: name.trim(),
            });
            router.refresh();
          });
        }}
      >
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Track as bill
        </h2>
        <p className="text-[0.75rem] text-ink-muted">
          Matches &ldquo;{seed.merchant}&rdquo; · {seed.chargeCount}{" "}
          {seed.chargeCount === 1 ? "charge" : "charges"} on file
        </p>

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
        <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
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
            className={`${FIELD} w-28 text-right`}
          />
        </label>
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
          <input
            type="checkbox"
            checked={!scheduled}
            onChange={(event) => setScheduled(!event.target.checked)}
            className="size-4"
          />
          Dates are unpredictable
        </label>
        {scheduled && (
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
        )}

        {error && <p className="text-[0.75rem] text-priority-a">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:border-rule-strong hover:bg-surface-raised md:min-h-0 md:py-1.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || name.trim() === ""}
            className="min-h-tap rounded border border-select-edge bg-select px-3 text-[0.8125rem] font-medium text-ink disabled:opacity-50 md:min-h-0 md:py-1.5"
          >
            {pending ? "Saving…" : "Track as bill"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
