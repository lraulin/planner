"use client";

import { useId, useState } from "react";

import { ModalShell } from "@/components/detail/ModalShell";
import { formatUsd, parseAmountEntryCents } from "@/lib/finances/money";
import type { BudgetRow } from "@/lib/finances/budget/rows";

/**
 * Rule 3, as a dialog: take money out of one envelope and put it in another.
 *
 * The amount defaults to the whole balance and is capped at it. Moving more than an envelope
 * holds would fix one problem by making a second, and the server clamps it again — this is
 * the affordance, not the rule.
 */
export function MoveMoneyDialog({
  from,
  targets,
  onCancel,
  onMove,
}: {
  from: BudgetRow;
  targets: readonly BudgetRow[];
  onCancel: () => void;
  onMove: (toId: string, cents: number) => void;
}) {
  const headingId = useId();
  const [toId, setToId] = useState(targets[0]?.id ?? "");
  const [amount, setAmount] = useState((from.balanceCents / 100).toFixed(2));

  const cents = parseAmountEntryCents(amount);
  const valid =
    toId !== "" && cents !== null && cents > 0 && cents <= from.balanceCents;

  return (
    <ModalShell open onClose={onCancel} labelledBy={headingId} width="max-w-sm">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && cents !== null) onMove(toId, cents);
        }}
      >
        <h2 id={headingId} className="text-[1rem] font-medium text-ink">
          Move money from {from.name}
        </h2>
        <p className="text-[0.8125rem] text-ink-muted">
          {from.name} has{" "}
          <span className="tabular text-ink">{formatUsd(from.balanceCents)}</span> in
          it.
        </p>

        <label className="flex flex-col gap-1 text-[0.8125rem] text-ink-muted">
          Amount
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onFocus={(event) => event.target.select()}
            className="tabular rounded border border-rule bg-surface px-2 py-1 text-right text-base text-ink md:text-[0.8125rem]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[0.8125rem] text-ink-muted">
          To
          <select
            value={toId}
            onChange={(event) => setToId(event.target.value)}
            className="rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:text-[0.8125rem]"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} ({formatUsd(target.balanceCents)})
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            title={
              valid
                ? undefined
                : `Enter an amount up to ${formatUsd(from.balanceCents)}`
            }
            className="rounded border border-rule bg-surface-raised px-3 py-1 text-[0.8125rem] text-ink hover:bg-surface disabled:opacity-60"
          >
            Move
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
