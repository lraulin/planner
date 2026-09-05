"use client";

import { useId, useMemo, useState } from "react";

import { ModalShell } from "@/components/detail/ModalShell";
import { AvailableAmount } from "@/components/finances/budget/FundingChrome";
import { assignScanInputs } from "@/lib/finances/budget/assign/fromBudget";
import {
  findMonth,
  monthLabel,
  prevMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "@/lib/finances/budget/envelope";
import {
  defaultUnassignCents,
  fixThisEmptyCopy,
  fixThisSections,
  fixThisSourceMonths,
  unassignPreview,
} from "@/lib/finances/budget/fixThis";
import { indicatorsFromAssign } from "@/lib/finances/budget/indicator";
import type { BillAnchor } from "@/lib/finances/commitments";
import type { EnvelopeRef } from "@/lib/finances/budget/operations";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";
import { formatUsd, parseAmountEntryCents } from "@/lib/finances/money";

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Un-assign money from envelopes that still have Available until the viewed month's
 * Ready to Assign is no longer negative.
 *
 * Unmount on close (parent) so the next open starts clean. After a write the parent
 * refreshes; this stays mounted while the hole remains.
 *
 * Spec: `agent-os/specs/2026-08-29-2033-budget-fix-this/` D3–D4, as amended by
 * `agent-os/specs/2026-08-29-2129-overassigned-available/` D6.
 */
export function FixThisDialog({
  viewedMonth,
  months,
  groups,
  categories,
  goals,
  anchors,
  showHidden,
  pending,
  onCancel,
  onUnassign,
}: {
  viewedMonth: MonthKey;
  months: readonly BudgetMonth[];
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  goals: Readonly<Record<string, number>>;
  anchors: ReadonlyMap<string, BillAnchor>;
  showHidden: boolean;
  pending: boolean;
  onCancel: () => void;
  onUnassign: (sourceMonth: MonthKey, from: EnvelopeRef, amountCents: number) => void;
}) {
  const headingId = useId();
  const viewed = findMonth(months, viewedMonth);
  const hole = viewed ? viewed.readyToAssignCents : 0;

  const sourceMonths = useMemo(
    () =>
      fixThisSourceMonths({
        months,
        viewedMonth,
        groups,
        categories,
        showHidden,
      }),
    [months, viewedMonth, groups, categories, showHidden],
  );

  const [pickerMonth, setPickerMonth] = useState<MonthKey>(
    () => sourceMonths[0] ?? viewedMonth,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const activeMonth = sourceMonths.includes(pickerMonth)
    ? pickerMonth
    : (sourceMonths[0] ?? viewedMonth);
  const source = findMonth(months, activeMonth);
  const previous = findMonth(months, prevMonthKey(activeMonth));
  const sections = useMemo(
    () =>
      source
        ? fixThisSections({
            month: source,
            groups,
            categories,
            showHidden,
          })
        : [],
    [source, groups, categories, showHidden],
  );
  const indicators = useMemo(() => {
    if (!source) return new Map();
    const scan = assignScanInputs({
      month: source,
      previous,
      groups,
      categories,
      goals,
      anchors,
    });
    return indicatorsFromAssign(activeMonth, scan.envelopes, scan.bills);
  }, [source, previous, groups, categories, goals, anchors, activeMonth]);

  const selected = useMemo(() => {
    for (const section of sections) {
      for (const row of section.rows) {
        if (row.kind === "envelope" && row.id === selectedId) return row;
      }
    }
    return null;
  }, [sections, selectedId]);

  const cents = parseAmountEntryCents(amount);
  const moved = selected
    ? Math.min(
        cents === null ? 0 : Math.max(0, cents),
        Math.max(0, selected.availableCents),
      )
    : 0;
  const preview =
    selected && moved > 0
      ? unassignPreview({
          name: selected.name,
          availableCents: selected.availableCents,
          amountCents: moved,
          viewedReadyToAssignCents: hole,
        })
      : null;

  function selectEnvelope(id: string, availableCents: number) {
    setSelectedId(id);
    setAmount(dollars(defaultUnassignCents(availableCents, hole)));
  }

  function switchMonth(next: MonthKey) {
    setPickerMonth(next);
    setSelectedId(null);
    setAmount("");
  }

  return (
    <ModalShell open onClose={onCancel} labelledBy={headingId} width="max-w-md">
      <form
        className="flex max-h-[85dvh] flex-col gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected || moved <= 0 || pending) return;
          onUnassign(activeMonth, { id: selected.id, name: selected.name }, moved);
          setSelectedId(null);
          setAmount("");
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-[0.9375rem] font-semibold text-ink">
            Un-assign money from
          </h2>
          <label className="sr-only" htmlFor={`${headingId}-month`}>
            Month
          </label>
          <select
            id={`${headingId}-month`}
            value={activeMonth}
            onChange={(event) => switchMonth(event.target.value)}
            className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
          >
            {sourceMonths.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="tabular text-[1.75rem] leading-none font-medium text-[var(--chart-spend)]">
            {formatUsd(hole)}
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            You assigned more than you have.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded border border-rule">
          {sections.length === 0 ? (
            <p className="px-3 py-4 text-[0.8125rem] text-ink-muted">
              {fixThisEmptyCopy(activeMonth)}
            </p>
          ) : (
            <ul className="py-1">
              {sections.flatMap((section) =>
                section.rows.map((row) => {
                  if (row.kind === "heading") {
                    return (
                      <li
                        key={row.id}
                        className="px-3 pt-2 pb-0.5 text-[0.6875rem] font-medium tracking-wider text-ink-muted uppercase"
                        style={{ paddingLeft: `${12 + row.depth * 12}px` }}
                      >
                        {row.label}
                      </li>
                    );
                  }
                  const indicator = indicators.get(row.id);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => selectEnvelope(row.id, row.availableCents)}
                        className={`flex min-h-tap w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[0.8125rem] md:min-h-0 ${
                          selectedId === row.id
                            ? "bg-select"
                            : "hover:bg-surface-raised"
                        }`}
                        style={{ paddingLeft: `${12 + row.depth * 12}px` }}
                      >
                        <span className="min-w-0 truncate text-ink">{row.name}</span>
                        {indicator ? (
                          <AvailableAmount
                            cents={row.availableCents}
                            indicator={indicator}
                          />
                        ) : (
                          <span className="tabular text-ink">
                            {formatUsd(row.availableCents)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                }),
              )}
            </ul>
          )}
        </div>

        {selected ? (
          <div className="flex flex-col gap-2">
            <p className="text-[0.8125rem] text-ink">
              {selected.name} ·{" "}
              <span className="tabular">{formatUsd(selected.availableCents)}</span>{" "}
              Available
            </p>
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.6875rem] font-medium tracking-wider text-ink-muted uppercase">
                Amount
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-right text-base font-normal normal-case tracking-normal text-ink tabular md:min-h-0 md:text-[0.8125rem]"
                />
              </label>
              <button
                type="button"
                onClick={() => setAmount(dollars(selected.availableCents))}
                className="min-h-tap rounded border border-rule px-2 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
              >
                MAX
              </button>
            </div>
            {preview ? (
              <p className="text-[0.8125rem] leading-snug text-ink-muted">
                {preview.availableLine} {preview.readyLine}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !selected || moved <= 0}
            className="min-h-tap rounded border border-[var(--chart-spend)] px-3 py-1.5 text-[0.8125rem] text-[var(--chart-spend)] disabled:opacity-50 md:min-h-0"
          >
            Un-assign
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
