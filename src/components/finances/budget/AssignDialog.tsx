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
import {
  ASSIGN_OPTION_LABELS,
  type AssignLine,
  type AssignOption,
  type AssignResult,
} from "@/lib/finances/budget/assign/types";

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

export function AssignDialog({
  readyToAssignCents,
  options,
  envelopes,
  groups,
  pending,
  onCancel,
  onPickOption,
  onManual,
}: {
  readyToAssignCents: number;
  options: readonly { option: AssignOption; result: AssignResult }[];
  envelopes: readonly BudgetRow[];
  groups: readonly BudgetGroupRow[];
  pending: boolean;
  onCancel: () => void;
  onPickOption: (option: AssignOption) => void;
  onManual: (categoryId: string, amountCents: number) => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<"auto" | "manual">("auto");
  const [amount, setAmount] = useState(() =>
    formatUsd(Math.max(0, readyToAssignCents)).replace("$", ""),
  );
  const catalog = useMemo(
    () =>
      visibleEnvelopeCatalog({
        groups: pickerGroups(groups),
        envelopes: pickerEnvelopes(envelopes),
      }),
    [groups, envelopes],
  );
  const [target, setTarget] = useState(() => firstEnvelopeId(catalog));

  return (
    <ModalShell open onClose={onCancel} labelledBy={titleId} width="max-w-md">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Assign
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          {formatUsd(readyToAssignCents)} Ready to Assign
        </p>

        <div className="mt-4 flex border-b border-rule text-[0.8125rem]">
          <button
            type="button"
            className={`px-3 py-2 ${
              tab === "auto"
                ? "border-b-2 border-ink font-medium text-ink"
                : "text-ink-muted"
            }`}
            onClick={() => setTab("auto")}
          >
            Auto
          </button>
          <button
            type="button"
            className={`px-3 py-2 ${
              tab === "manual"
                ? "border-b-2 border-ink font-medium text-ink"
                : "text-ink-muted"
            }`}
            onClick={() => setTab("manual")}
          >
            Manually
          </button>
        </div>

        {tab === "auto" ? (
          <ul className="mt-3 flex flex-col gap-1.5">
            {options.map(({ option, result }) => (
              <li key={option}>
                <button
                  type="button"
                  disabled={
                    pending ||
                    (result.listAmountCents === 0 && result.lines.length === 0)
                  }
                  onClick={() => onPickOption(option)}
                  className="flex w-full items-baseline justify-between gap-3 rounded bg-surface-raised px-3 py-2 text-left text-[0.8125rem] text-ink hover:bg-surface disabled:opacity-50"
                >
                  <span>{ASSIGN_OPTION_LABELS[option]}</span>
                  <span className="tabular text-ink-muted">
                    {formatUsd(result.listAmountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!target) return;
              const cents = parseAmountEntryCents(amount);
              if (cents === null || cents <= 0) return;
              onManual(target, cents);
            }}
          >
            <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              Assign
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base font-normal normal-case tracking-normal text-ink md:min-h-0 md:text-[0.8125rem]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              To
              <CategorySelect
                catalog={catalog}
                value={target || null}
                onChange={(id) => {
                  if (id) setTarget(id);
                }}
                allowClear={false}
                placeholder="To"
                ariaLabel="Assign to"
                className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base font-normal normal-case tracking-normal text-ink md:min-h-0 md:text-[0.8125rem]"
              />
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink md:min-h-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || target === "" || readyToAssignCents <= 0}
                className="min-h-tap rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0"
              >
                Assign
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}

export function AssignPreviewDialog({
  result,
  pending,
  onCancel,
  onConfirm,
}: {
  result: AssignResult;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const partial = result.lines.filter((line) => line.status === "partial");
  const skipped = result.lines.filter((line) => line.status === "skipped");
  const full = result.lines.filter((line) => line.status === "full");
  const reduced = result.lines.filter((line) => line.status === "reduced");
  const canWrite = result.allocations.length > 0;

  return (
    <ModalShell open onClose={onCancel} labelledBy={titleId} width="max-w-md">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Auto-Assign Preview: {ASSIGN_OPTION_LABELS[result.option]}
        </h2>

        {result.shortfall ? (
          <p
            role="status"
            className="mt-3 rounded border border-[var(--goal-unmet)] bg-[var(--goal-unmet)]/10 px-3 py-2 text-[0.8125rem] text-ink"
          >
            You don&apos;t have enough money to fully fund all of your categories.{" "}
            {partial.length > 0
              ? `${partial.length === 1 ? "1 category" : `${partial.length} categories`} will be partially funded.`
              : null}{" "}
            {skipped.length > 0
              ? `${skipped.length === 1 ? "1 category" : `${skipped.length} categories`} will not be funded.`
              : null}
          </p>
        ) : null}

        {partial.length > 0 ? (
          <LineGroup heading="Partially funded" lines={partial} />
        ) : null}
        {skipped.length > 0 ? (
          <LineGroup heading="Will not be funded" lines={skipped} />
        ) : null}
        {full.length > 0 ? (
          <p
            role="status"
            className="mt-3 rounded border border-[var(--chart-income)] bg-[var(--chart-income)]/10 px-3 py-2 text-[0.8125rem] text-ink"
          >
            {full.length === 1
              ? "1 category will be fully funded."
              : `${full.length} categories will be fully funded.`}
          </p>
        ) : null}
        {full.length > 0 ? <LineGroup heading="Fully funded" lines={full} /> : null}
        {reduced.length > 0 ? (
          <LineGroup heading="Returning to Ready to Assign" lines={reduced} />
        ) : null}

        {result.lines.length === 0 ? (
          <p className="mt-3 text-[0.8125rem] text-ink-muted">
            Nothing to change for this option.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink md:min-h-0"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !canWrite}
            onClick={onConfirm}
            className="min-h-tap rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0"
          >
            Assign Money
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function LineGroup({
  heading,
  lines,
}: {
  heading: string;
  lines: readonly AssignLine[];
}) {
  return (
    <div className="mt-3">
      <h3 className="text-[0.75rem] font-medium text-ink-muted">{heading}</h3>
      <ul className="mt-1 flex flex-col gap-0.5">
        {lines.map((line) => (
          <li
            key={line.categoryId}
            className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
          >
            <span className="min-w-0 truncate text-ink">{line.name}</span>
            {line.deltaCents !== 0 ? (
              <span className="tabular text-ink">
                {line.deltaCents > 0 ? "+" : ""}
                {formatUsd(line.deltaCents)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
