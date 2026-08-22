"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/detail/ModalShell";
import { useToday } from "@/components/grid/useToday";
import { setRecurringBillAction } from "@/app/finances/actions";
import { nextDueFrom, type Cadence } from "@/lib/finances/recurringBills";
import {
  trackAsBillDraft,
  type ClaimedMatcher,
  type TrackAsBillDraft,
} from "@/lib/finances/registerBillDraft";
import type { TransactionListRow } from "@/lib/finances/types";
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
  rows,
  selectedId,
  onClose,
  onSaved,
}: {
  rows: readonly TransactionListRow[];
  selectedId: string;
  onClose: () => void;
  onSaved: (claimed: ClaimedMatcher) => void;
}) {
  const todayKey = useToday();
  const seed = useMemo(
    () => (todayKey === null ? null : trackAsBillDraft(rows, selectedId, todayKey)),
    [rows, selectedId, todayKey],
  );
  if (seed === null || todayKey === null) return null;
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
  onSaved: (claimed: ClaimedMatcher) => void;
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
            const result = await setRecurringBillAction({
              name: name.trim(),
              matchers: [seed.merchant],
              cadence,
              expectedCents: cents > 0 ? cents : null,
              anchorDate: next || null,
              scheduled: true,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onSaved({
              merchant: seed.merchant,
              name: name.trim(),
              kind: "bill",
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
