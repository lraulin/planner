"use client";

import { useId, useMemo, useState } from "react";

import { ModalShell } from "@/components/detail/ModalShell";
import { CategorySelect } from "@/components/finances/CategorySelect";
import { formatUsd, parseAmountEntryCents } from "@/lib/finances/money";
import type { BudgetGroupRow } from "@/lib/finances/budget/queries";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import {
  categoryPickerChoices,
  categoryPickerSections,
  defaultCategoryPickerChoice,
  visibleEnvelopeCatalog,
  type EnvelopeCatalog,
  type EnvelopePickerGroup,
  type EnvelopePickerOption,
} from "@/lib/finances/budget/groupEnvelopeOptions";

/**
 * Rule 3, as a dialog: take money out of one envelope and put it in another.
 *
 * The amount defaults to the whole balance and is capped at it. Moving more than an envelope
 * holds would fix one problem by making a second, and the server clamps it again — this is
 * the affordance, not the rule.
 */
function pickerGroups(groups: readonly BudgetGroupRow[]): EnvelopePickerGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    parentGroupId: group.parentGroupId,
    sortKey: group.sortKey,
    hidden: group.hidden,
  }));
}

function pickerEnvelopes(rows: readonly BudgetRow[]): EnvelopePickerOption[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.name,
    name: row.name,
    kind: row.kind,
    groupId: row.groupId,
    sortKey: row.sortKey,
    hidden: row.hidden,
    detail: formatUsd(row.balanceCents),
  }));
}

function firstEnvelopeId(catalog: EnvelopeCatalog): string {
  const sections = categoryPickerSections(catalog.groups, catalog.envelopes, "", {
    includeCreate: false,
  });
  const choices = categoryPickerChoices(sections);
  const index = defaultCategoryPickerChoice(choices);
  const choice = index >= 0 ? choices[index] : undefined;
  return choice?.kind === "envelope" ? choice.id : "";
}

export function MoveMoneyDialog({
  from,
  targets,
  groups,
  onCancel,
  onMove,
}: {
  from: BudgetRow;
  targets: readonly BudgetRow[];
  groups: readonly BudgetGroupRow[];
  onCancel: () => void;
  onMove: (toId: string, cents: number) => void;
}) {
  const headingId = useId();
  const catalog = useMemo(
    () =>
      visibleEnvelopeCatalog({
        groups: pickerGroups(groups),
        envelopes: pickerEnvelopes(targets),
      }),
    [groups, targets],
  );
  const [toId, setToId] = useState(() => firstEnvelopeId(catalog));
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
          <CategorySelect
            catalog={catalog}
            value={toId || null}
            onChange={(id) => {
              if (id) setToId(id);
            }}
            allowClear={false}
            placeholder="To"
            ariaLabel="Move money to"
            className="rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:text-[0.8125rem]"
          />
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
